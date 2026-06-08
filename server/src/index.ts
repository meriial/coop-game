import { GameRoom } from './game-room';
import { PresentationRoom } from './PresentationRoom';

interface Env {
  GAME_ROOM: DurableObjectNamespace;
  PRESENTATION_ROOM: DurableObjectNamespace;
  AUTH_KV: KVNamespace;
  RESEND_API_KEY?: string;
  FROM_EMAIL?: string;
  JWT_SECRET: string;
  ADMIN_EMAIL: string;
  ALLOWED_EMAIL_DOMAINS?: string;
  ROOM_DOMAINS?: string;
  REPO_URL?: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// --- Email Adapter ---

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  link: string;
}

interface EmailAdapter {
  send(payload: EmailPayload): Promise<void>;
}

class ResendAdapter implements EmailAdapter {
  constructor(private apiKey: string, private from: string) {}

  async send({ to, subject, html }: EmailPayload): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: this.from, to, subject, html }),
    });
    if (!res.ok) throw new Error(`Resend error: ${res.status}`);
  }
}

class LocalAdapter implements EmailAdapter {
  constructor(private kv: KVNamespace) {}

  async send(payload: EmailPayload): Promise<void> {
    await this.kv.put(
      `inbox:${crypto.randomUUID()}`,
      JSON.stringify({ ...payload, sentAt: new Date().toISOString() }),
      { expirationTtl: 3600 }
    );
  }
}

function makeAdapter(env: Env): EmailAdapter {
  return env.RESEND_API_KEY
    ? new ResendAdapter(env.RESEND_API_KEY, env.FROM_EMAIL ?? 'noreply@workshop.local')
    : new LocalAdapter(env.AUTH_KV);
}

// --- Pure Helpers ---

function parseAllowedDomains(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedDomain(email: string, env: Env): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? parseAllowedDomains(env.ALLOWED_EMAIL_DOMAINS).includes(domain) : false;
}

function parseRoomDomains(raw?: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of (raw ?? '').split(',')) {
    const colonIdx = entry.indexOf(':');
    if (colonIdx === -1) continue;
    const domain = entry.slice(0, colonIdx).trim().toLowerCase();
    const room = entry.slice(colonIdx + 1).trim();
    if (domain && room) map.set(domain, room);
  }
  return map;
}

function resolveRoomForEmail(email: string, env: Env): string {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return parseRoomDomains(env.ROOM_DOMAINS).get(domain) ?? 'main';
}

function titleCase(word: string): string {
  return word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word;
}

function parseName(email: string): string {
  const [local] = email.split('@');
  if (!local) return email;

  const plusIdx = local.indexOf('+');
  if (plusIdx !== -1) {
    const tag = local.slice(plusIdx + 1);
    if (tag) return titleCase(tag);
  }

  const dotIdx = local.indexOf('.');
  if (dotIdx !== -1) {
    const [first, last] = local.split('.');
    if (first) {
      const firstName = titleCase(first);
      const lastInitial = last ? last[0].toUpperCase() : '';
      return lastInitial ? `${firstName} ${lastInitial}` : firstName;
    }
  }

  const base = plusIdx !== -1 ? local.slice(0, plusIdx) : local;
  return titleCase(base) || email;
}

function bytesToB64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function createJWT(payload: Record<string, unknown>, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const header = bytesToB64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = bytesToB64url(enc.encode(JSON.stringify(payload)));
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return `${data}.${bytesToB64url(new Uint8Array(sig))}`;
}

async function verifyJWT(token: string, secret: string): Promise<{ email: string; name: string; room?: string }> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const data = `${parts[0]}.${parts[1]}`;
  const sigBytes = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(data));
  if (!valid) throw new Error('Invalid JWT signature');
  const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as { email?: string; name?: string; exp?: number; room?: string };
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('JWT expired');
  return { email: payload.email ?? '', name: payload.name ?? 'Guest', room: payload.room };
}

// --- HTML Templates ---

const expiredHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Link Expired</title>
<style>
  body { font-family: monospace; background: #0f172a; color: #94a3b8;
         display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
  .card { background: #1e293b; padding: 2rem 3rem; border-radius: 1rem; text-align: center; max-width: 400px; }
  h1 { color: #ef4444; margin-bottom: 0.5rem; }
  p { margin: 0.5rem 0; }
</style>
</head>
<body>
  <div class="card">
    <h1>Link Expired</h1>
    <p>This magic link has already been used or has expired.</p>
    <p>Please restart the terminal setup script.</p>
  </div>
</body>
</html>`;

const successHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Authenticated!</title>
<style>
  body { font-family: monospace; background: #0f172a; color: #94a3b8;
         display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
  .card { background: #1e293b; padding: 2rem 3rem; border-radius: 1rem; text-align: center; max-width: 400px; }
  .check { font-size: 3rem; margin-bottom: 1rem; }
  h1 { color: #22c55e; margin-bottom: 0.5rem; }
  p { margin: 0.5rem 0; }
  .sub { color: #475569; margin-top: 1rem; font-size: 0.85rem; }
</style>
</head>
<body>
  <div class="card">
    <div class="check">✓</div>
    <h1>Authenticated!</h1>
    <p>You can now close this tab and return to your terminal window.</p>
    <p class="sub">Your machine has been authorized for the workshop.</p>
  </div>
</body>
</html>`;

// --- Route Handlers ---

function handleAuthConfig(env: Env): Response {
  const domains = parseAllowedDomains(env.ALLOWED_EMAIL_DOMAINS);
  if (domains.length === 0) {
    return Response.json(
      { error: 'Server misconfigured: ALLOWED_EMAIL_DOMAINS is not set' },
      { status: 500, headers: CORS },
    );
  }
  const repoUrl = env.REPO_URL?.trim();
  if (!repoUrl) {
    return Response.json(
      { error: 'Server misconfigured: REPO_URL is not set' },
      { status: 500, headers: CORS },
    );
  }
  return Response.json({ allowed_email_domains: domains, repo_url: repoUrl }, { headers: CORS });
}

async function handleAuthRequest(request: Request, env: Env): Promise<Response> {
  let email: string;
  try {
    const body = (await request.json()) as { email?: string };
    email = (body.email ?? '').trim();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400, headers: CORS });
  }

  if (!email) {
    return Response.json({ error: 'email is required' }, { status: 400, headers: CORS });
  }
  if (parseAllowedDomains(env.ALLOWED_EMAIL_DOMAINS).length === 0) {
    return Response.json(
      { error: 'Server misconfigured: ALLOWED_EMAIL_DOMAINS is not set' },
      { status: 500, headers: CORS },
    );
  }
  if (!isAllowedDomain(email, env)) {
    return Response.json({ error: 'Email domain not permitted' }, { status: 403, headers: CORS });
  }

  const deviceCode = crypto.randomUUID();
  const magicToken = crypto.randomUUID();
  const origin = new URL(request.url).origin;
  const magicLink = `${origin}/auth/verify?token=${magicToken}`;

  await Promise.all([
    env.AUTH_KV.put(
      `device:${deviceCode}`,
      JSON.stringify({ status: 'pending', email, agentToken: null }),
      { expirationTtl: 600 }
    ),
    env.AUTH_KV.put(`magic:${magicToken}`, deviceCode, { expirationTtl: 600 }),
  ]);

  const adapter = makeAdapter(env);
  try {
    await adapter.send({
      to: email,
      subject: 'Workshop Authentication Link',
      html: `<p>Click the link below to authenticate your machine for the workshop:</p>
<p><a href="${magicLink}" style="font-size:1.2em">Authenticate your machine →</a></p>
<p style="color:#666;font-size:0.85em">This link expires in 10 minutes. If you did not request this, ignore it.</p>`,
      link: magicLink,
    });
  } catch {
    return Response.json({ error: 'Failed to send email' }, { status: 500, headers: CORS });
  }

  const responseBody: Record<string, string> = { device_code: deviceCode };
  if (!env.RESEND_API_KEY) {
    responseBody.magic_link = magicLink;
  }
  return Response.json(responseBody, { headers: CORS });
}

async function handleAuthPoll(request: Request, env: Env): Promise<Response> {
  const code = new URL(request.url).searchParams.get('code');
  if (!code) {
    return Response.json({ error: 'code is required' }, { status: 400, headers: CORS });
  }
  const raw = await env.AUTH_KV.get(`device:${code}`);
  if (!raw) {
    return Response.json({ status: 'expired' }, { status: 404, headers: CORS });
  }
  return Response.json(JSON.parse(raw), { headers: CORS });
}

async function handleAuthVerify(request: Request, env: Env): Promise<Response> {
  const htmlHeaders = { 'Content-Type': 'text/html' };
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return new Response(expiredHtml, { headers: htmlHeaders });

  const deviceCode = await env.AUTH_KV.get(`magic:${token}`);
  if (!deviceCode) return new Response(expiredHtml, { headers: htmlHeaders });

  const existingRaw = await env.AUTH_KV.get(`device:${deviceCode}`);
  if (!existingRaw) return new Response(expiredHtml, { headers: htmlHeaders });

  const { email } = JSON.parse(existingRaw) as { email: string };
  const name = parseName(email);
  const now = Math.floor(Date.now() / 1000);
  const room = resolveRoomForEmail(email, env);
  const agentToken = await createJWT(
    { email, name, iat: now, exp: now + 604800, ...(room !== 'main' ? { room } : {}) },
    env.JWT_SECRET
  );

  await Promise.all([
    env.AUTH_KV.put(
      `device:${deviceCode}`,
      JSON.stringify({ status: 'approved', email, name, agentToken }),
      { expirationTtl: 600 }
    ),
    env.AUTH_KV.delete(`magic:${token}`),
  ]);

  return new Response(successHtml, { headers: htmlHeaders });
}

async function handleAuthInbox(env: Env): Promise<Response> {
  if (env.RESEND_API_KEY) return new Response(null, { status: 404 });
  const list = await env.AUTH_KV.list({ prefix: 'inbox:' });
  const emails = await Promise.all(list.keys.map(k => env.AUTH_KV.get(k.name, 'json')));
  return Response.json(emails.filter(Boolean), { headers: CORS });
}

async function handleGuestInvite(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get('Authorization') ?? '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  let callerEmail: string;
  try {
    ({ email: callerEmail } = await verifyJWT(bearer, env.JWT_SECRET));
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: CORS });
  }
  if (callerEmail !== env.ADMIN_EMAIL) {
    return Response.json({ error: 'Forbidden' }, { status: 403, headers: CORS });
  }

  let body: { email?: string; name?: string; room?: string };
  try { body = (await request.json()) as { email?: string; name?: string; room?: string }; }
  catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS }); }
  const guestEmail = (body.email ?? '').trim();
  const guestName  = (body.name  ?? '').trim();
  if (!guestEmail || !guestName)
    return Response.json({ error: 'email and name are required' }, { status: 400, headers: CORS });

  const now = Math.floor(Date.now() / 1000);
  const room = body.room?.trim() || resolveRoomForEmail(guestEmail, env);
  const guestToken = await createJWT(
    { email: guestEmail, name: guestName, iat: now, exp: now + 604800, ...(room !== 'main' ? { room } : {}) },
    env.JWT_SECRET
  );

  const inviteLink = `${new URL(request.url).origin}/?token=${guestToken}`;

  try {
    await makeAdapter(env).send({
      to: guestEmail,
      subject: "You're invited to play at Ideometer",
      html: `<p>Hi ${guestName},</p>
<p>You're invited to play at Ideometer. Click the link below — no setup required:</p>
<p><a href="${inviteLink}" style="font-size:1.2em">Join the Workshop →</a></p>
<p style="color:#666;font-size:0.85em">This link is personal to you and valid for 7 days.</p>`,
      link: inviteLink,
    });
  } catch {
    return Response.json({ error: 'Failed to send email' }, { status: 500, headers: CORS });
  }

  const responseBody: Record<string, string> = {};
  if (!env.RESEND_API_KEY) responseBody.link = inviteLink;
  return Response.json(responseBody, { status: 200, headers: CORS });
}

// --- Main Handler ---

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const { pathname } = new URL(request.url);
    const method = request.method;

    if (pathname === '/ws') {
      const id = env.GAME_ROOM.idFromName('main-room');
      return env.GAME_ROOM.get(id).fetch(request);
    }

    if (pathname.startsWith('/room/')) {
      const roomId = pathname.slice(6) || 'main';
      const token = new URL(request.url).searchParams.get('token');
      if (!token) {
        return new Response('Unauthorized', { status: 401, headers: CORS });
      }
      let role = 'participant';
      let email = '';
      let name = 'Guest';
      try {
        const payload = await verifyJWT(token, env.JWT_SECRET);
        email = payload.email;
        name = payload.name;
        role = email === env.ADMIN_EMAIL ? 'presenter' : 'participant';
      } catch {
        return new Response('Unauthorized', { status: 401, headers: CORS });
      }
      // Role override: localhost can switch either direction; admins can downgrade to participant anywhere
      const reqUrl = new URL(request.url);
      const isLocalhost = reqUrl.hostname === 'localhost' || reqUrl.hostname === '127.0.0.1';
      const devRole = reqUrl.searchParams.get('devRole');
      if (devRole === 'presenter' || devRole === 'participant') {
        if (isLocalhost || (role === 'presenter' && devRole === 'participant')) role = devRole;
      }
      const headers = new Headers(request.headers);
      headers.set('X-User-Role', role);
      headers.set('X-User-Email', email);
      headers.set('X-User-Name', name);
      const newReq = new Request(request, { headers });
      const id = env.PRESENTATION_ROOM.idFromName(roomId);
      return env.PRESENTATION_ROOM.get(id).fetch(newReq);
    }

    if (pathname === '/auth/config' && method === 'GET') return handleAuthConfig(env);
    if (pathname === '/auth/request' && method === 'POST') return handleAuthRequest(request, env);
    if (pathname === '/auth/poll' && method === 'GET') return handleAuthPoll(request, env);
    if (pathname === '/auth/verify' && method === 'GET') return handleAuthVerify(request, env);
    if (pathname === '/auth/inbox' && method === 'GET') return handleAuthInbox(env);
    if (pathname === '/auth/guest-invite' && method === 'POST') return handleGuestInvite(request, env);

    return new Response(
      JSON.stringify({ status: 'ok', game: 'Workshop Pixel Art', ws: '/ws' }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  },
} satisfies ExportedHandler<Env>;

export { GameRoom, PresentationRoom };
