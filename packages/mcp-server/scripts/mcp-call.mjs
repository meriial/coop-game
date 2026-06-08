#!/usr/bin/env node
/**
 * Dumb one-shot MCP transport — NOT drawing logic.
 *
 * Connects to a room MCP bridge with ONE selected identity, invokes one tool,
 * prints its JSON result, and exits. The caller supplies the intelligence
 * between calls. Identity is fixed per invocation, so the room shows exactly
 * ONE pill no matter how many times this is run.
 *
 * Switchable between backends and users (like the frontend can):
 *
 *   --backend local    http://localhost:8787, identity signed with the local
 *                      dev JWT secret (default email loop-bot@twosmiles.ca).
 *   --backend prod     the deployed Worker + token, both read at runtime from
 *                      the gitignored frontend/.env (VITE_SERVER_URL +
 *                      VITE_AGENT_TOKEN) so neither lands in the repo. Override
 *                      with WORKSHOP_ROOM_URL / --token. Prod rejects
 *                      locally-signed tokens.
 *
 * Override knobs (env or flags):
 *   --token <jwt>      use this pre-made token verbatim (any backend)
 *   --email <addr>     local backend: sign a token for this email
 *   --name  <display>  local backend: display name for the signed token
 *   --label <label>    agent label (default "Loop Agent")
 *   --room  <id>       room id (default "main")
 * Env equivalents: WORKSHOP_BACKEND, WORKSHOP_OWNER_TOKEN, WORKSHOP_OWNER_EMAIL,
 *   WORKSHOP_OWNER_NAME, WORKSHOP_AGENT_LABEL, WORKSHOP_ROOM_ID, WORKSHOP_ROOM_URL.
 *
 * Examples:
 *   node scripts/mcp-call.mjs get_state
 *   node scripts/mcp-call.mjs --backend prod get_state
 *   node scripts/mcp-call.mjs --backend prod take_action '{"type":"GAME_PAINT","payload":{"x":10,"y":8,"fromCursor":true}}'
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const LOCAL_SECRET = process.env.JWT_SECRET ?? 'local-dev-secret-change-before-production';
const LOCAL_URL = 'http://localhost:8787';

// Pinned local identity: same email every call => one persistent player => one pill.
const LOCAL_EMAIL = 'loop-bot@twosmiles.ca';
const LOCAL_NAME = 'Loop Bot';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function signJwt(payload, secret) {
  const data = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}`;
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/** Read a KEY=value from frontend/.env (used for the production token). */
function fromFrontendEnv(key) {
  try {
    const line = readFileSync(join(ROOT, 'frontend/.env'), 'utf8')
      .split('\n').find((l) => l.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).trim() : undefined;
  } catch {
    return undefined;
  }
}

function parseArgs(argv) {
  const out = { flags: {}, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) out.flags[a.slice(2)] = argv[++i];
    else out.rest.push(a);
  }
  return out;
}

function main() {
  const { flags, rest } = parseArgs(process.argv.slice(2));
  const toolName = rest[0];
  if (!toolName) {
    console.error('usage: node scripts/mcp-call.mjs [--backend local|prod] [--token <jwt>] <toolName> [jsonArgs]');
    process.exit(2);
  }
  let args = {};
  if (rest[1]) {
    try { args = JSON.parse(rest[1]); }
    catch (e) { console.error(`bad JSON args: ${e.message}`); process.exit(2); }
  }

  const backend = flags.backend ?? process.env.WORKSHOP_BACKEND ?? 'local';
  const isProd = backend === 'prod';
  // Keep the production endpoint out of the committed repo: derive it at runtime
  // from WORKSHOP_ROOM_URL or the gitignored frontend/.env (VITE_SERVER_URL).
  const roomUrl = process.env.WORKSHOP_ROOM_URL ?? (isProd ? fromFrontendEnv('VITE_SERVER_URL') : LOCAL_URL);
  if (!roomUrl) {
    console.error('prod: no endpoint — set WORKSHOP_ROOM_URL or VITE_SERVER_URL in frontend/.env');
    process.exit(2);
  }
  const roomId = flags.room ?? process.env.WORKSHOP_ROOM_ID ?? 'main';
  const agentLabel = flags.label ?? process.env.WORKSHOP_AGENT_LABEL ?? 'Loop Agent';

  // Resolve a token. Precedence: --token / env > prod's frontend token > local signed.
  let token = flags.token ?? process.env.WORKSHOP_OWNER_TOKEN;
  if (!token) {
    if (isProd) {
      token = fromFrontendEnv('VITE_AGENT_TOKEN');
      if (!token) { console.error('prod: no --token and no VITE_AGENT_TOKEN in frontend/.env'); process.exit(2); }
    } else {
      const now = Math.floor(Date.now() / 1000);
      const email = flags.email ?? process.env.WORKSHOP_OWNER_EMAIL ?? LOCAL_EMAIL;
      const name = flags.name ?? process.env.WORKSHOP_OWNER_NAME ?? LOCAL_NAME;
      token = signJwt({ email, name, iat: now, exp: now + 3600 }, LOCAL_SECRET);
    }
  }

  const transport = new StdioClientTransport({
    command: 'node',
    args: [join(ROOT, 'packages/mcp-server/dist/index.js')],
    env: {
      ...process.env,
      WORKSHOP_OWNER_TOKEN: token,
      WORKSHOP_ROOM_URL: roomUrl,
      WORKSHOP_ROOM_ID: roomId,
      WORKSHOP_AGENT_LABEL: agentLabel,
    },
  });

  const client = new Client({ name: 'mcp-call', version: '0.0.1' });
  return (async () => {
    await client.connect(transport);
    const result = await client.callTool({ name: toolName, arguments: args });
    const text = result.content?.find((c) => c.type === 'text')?.text ?? 'null';
    await client.close();
    process.stdout.write(text + '\n');
  })();
}

main().catch((e) => { console.error(e); process.exit(1); });
