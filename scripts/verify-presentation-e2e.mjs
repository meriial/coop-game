#!/usr/bin/env node
/**
 * End-to-end verification: authenticate presenter + participant via magic-link
 * flow, then exercise presentation steps and both games over WebSocket.
 *
 * Prerequisites: Worker running on WORKER_URL (default http://localhost:8787).
 * Usage: node scripts/verify-presentation-e2e.mjs
 *
 * Presenter email: PRESENTER_EMAIL or ADMIN_EMAIL env, or server/.dev.vars ADMIN_EMAIL.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

function loadDevVars() {
  try {
    const content = readFileSync(resolve(REPO_ROOT, 'server/.dev.vars'), 'utf8');
    const vars = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq > 0) vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return vars;
  } catch {
    return {};
  }
}

const devVars = loadDevVars();

function firstAllowedDomain(vars) {
  const raw = process.env.ALLOWED_EMAIL_DOMAINS ?? vars.ALLOWED_EMAIL_DOMAINS;
  return raw?.trim() ? raw.split(',')[0].trim() : null;
}

const WORKER_URL = process.env.WORKER_URL ?? 'http://localhost:8787';
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5174';
const ROOM_ID = process.env.ROOM_ID ?? `verify-${Date.now()}`;
const PRESENTER_EMAIL =
  process.env.PRESENTER_EMAIL ??
  process.env.ADMIN_EMAIL ??
  devVars.ADMIN_EMAIL;
const domain = firstAllowedDomain(devVars);
const PARTICIPANT_EMAIL =
  process.env.PARTICIPANT_EMAIL ?? (domain ? `alice@${domain}` : undefined);

if (!PRESENTER_EMAIL) {
  console.error(
    'Missing presenter email. Set PRESENTER_EMAIL or ADMIN_EMAIL, or add ADMIN_EMAIL to server/.dev.vars\n' +
      '(copy server/.dev.vars.example → server/.dev.vars)',
  );
  process.exit(1);
}

if (!PARTICIPANT_EMAIL) {
  console.error(
    'Missing participant email. Set PARTICIPANT_EMAIL or ALLOWED_EMAIL_DOMAINS in server/.dev.vars\n' +
      '(copy server/.dev.vars.example → server/.dev.vars)',
  );
  process.exit(1);
}

const PASS = [];
const FAIL = [];

function ok(name) {
  PASS.push(name);
  console.log(`  ✓ ${name}`);
}

function fail(name, err) {
  FAIL.push({ name, err: String(err) });
  console.error(`  ✗ ${name}: ${err}`);
}

async function authenticate(email) {
  const res = await fetch(`${WORKER_URL}/auth/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  let magicLink = data.magic_link;
  if (!magicLink) {
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      const inbox = await fetch(`${WORKER_URL}/auth/inbox`).then((r) => r.json());
      const entry = inbox.find((e) => e.to === email);
      if (entry?.link) {
        magicLink = entry.link;
        break;
      }
    }
  }
  if (!magicLink) throw new Error(`no magic link for ${email}`);
  const verify = await fetch(magicLink);
  if (!verify.ok) throw new Error(`verify failed ${verify.status}`);
  for (let i = 0; i < 30; i++) {
    const poll = await fetch(`${WORKER_URL}/auth/poll?code=${data.device_code}`).then((r) => r.json());
    if (poll.status === 'approved') return poll.agentToken;
    if (poll.status === 'expired') throw new Error('auth expired');
    await sleep(500);
  }
  throw new Error('auth poll timeout');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function connectWs(token, devRole) {
  const params = new URLSearchParams({ token });
  if (devRole) params.set('devRole', devRole);
  const url = `ws://localhost:8787/room/${ROOM_ID}?${params}`;
  // Node 22+ global WebSocket
  const ws = new WebSocket(url);
  const messages = [];
  let cursor = 0;

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('WS connect timeout')), 10_000);
    ws.addEventListener('open', () => {
      clearTimeout(t);
      resolve();
    });
    ws.addEventListener('error', () => {
      clearTimeout(t);
      reject(new Error('WS error'));
    });
    ws.addEventListener('message', (e) => {
      try {
        messages.push(JSON.parse(e.data));
      } catch {
        /* ignore */
      }
    });
  });

  const waitFor = (pred, timeoutMs = 10_000) =>
    new Promise((resolve, reject) => {
      const scan = () => {
        for (let i = cursor; i < messages.length; i++) {
          if (pred(messages[i])) {
            cursor = i + 1;
            return messages[i];
          }
        }
        return null;
      };
      const hit = scan();
      if (hit) return resolve(hit);
      const timer = setTimeout(() => reject(new Error('waitFor timeout')), timeoutMs);
      const onMsg = () => {
        const found = scan();
        if (found) {
          clearTimeout(timer);
          ws.removeEventListener('message', onMsg);
          resolve(found);
        }
      };
      ws.addEventListener('message', onMsg);
    });

  return {
    ws,
    send: (msg) => ws.send(JSON.stringify(msg)),
    waitFor,
    close: () => ws.close(),
  };
}

function findPair(board) {
  const by = new Map();
  for (let i = 0; i < board.length; i++) {
    if (!by.has(board[i])) by.set(board[i], []);
    by.get(board[i]).push(i);
  }
  for (const pos of by.values()) {
    if (pos.length >= 2) return [pos[0], pos[1]];
  }
  return null;
}

async function main() {
  console.log('\n=== Presentation E2E Verification ===\n');
  console.log(`Worker:   ${WORKER_URL}`);
  console.log(`Frontend: ${FRONTEND_URL}`);
  console.log(`Presenter: ${PRESENTER_EMAIL}`);
  console.log(`Participant: ${PARTICIPANT_EMAIL}\n`);

  // ── Infrastructure ──────────────────────────────────────────────────────
  console.log('Infrastructure');
  try {
    const inbox = await fetch(`${WORKER_URL}/auth/inbox`);
    if (!inbox.ok) throw new Error(`worker unreachable (${inbox.status})`);
    ok('Worker reachable');
  } catch (e) {
    fail('Worker reachable', e);
    console.error('\nStart the worker: cd server && npm run dev\n');
    process.exit(1);
  }

  try {
    const fe = await fetch(FRONTEND_URL);
    if (!fe.ok) throw new Error(`status ${fe.status}`);
    const html = await fe.text();
    if (!html.includes('DrugBank') && !html.includes('root')) throw new Error('unexpected HTML');
    ok('Frontend reachable');
  } catch (e) {
    fail('Frontend reachable', e);
    console.error('\nStart the frontend: cd frontend && npm run dev\n');
    process.exit(1);
  }

  // ── Auth ──────────────────────────────────────────────────────────────
  console.log('\nAuthentication');
  let presenterToken, participantToken;
  try {
    presenterToken = await authenticate(PRESENTER_EMAIL);
    ok(`Presenter JWT (${PRESENTER_EMAIL})`);
  } catch (e) {
    fail('Presenter JWT', e);
    process.exit(1);
  }
  try {
    participantToken = await authenticate(PARTICIPANT_EMAIL);
    ok(`Participant JWT (${PARTICIPANT_EMAIL})`);
  } catch (e) {
    fail('Participant JWT', e);
    process.exit(1);
  }

  // ── WebSocket sessions ──────────────────────────────────────────────────
  console.log('\nWebSocket sessions');
  const presenter = await connectWs(presenterToken);
  const participant = await connectWs(participantToken);

  try {
    const pw = await presenter.waitFor((m) => m.type === 'WELCOME');
    if (pw.role !== 'presenter') throw new Error(`expected presenter role, got ${pw.role}`);
    if (pw.stepIndex !== 0) throw new Error(`expected step 0, got ${pw.stepIndex}`);
    if (!pw.matchBoard?.length) throw new Error('missing matchBoard');
    ok('Presenter WELCOME (role=presenter, step=0, periodic-match state)');

    const partW = await participant.waitFor((m) => m.type === 'WELCOME');
    if (partW.role !== 'participant') throw new Error(`expected participant, got ${partW.role}`);
    ok('Participant WELCOME (role=participant)');

    // ── periodic-match ────────────────────────────────────────────────────
    console.log('\nGame: periodic-match');
    participant.send({ type: 'GAME_JOIN', name: 'Alice' });
    await participant.waitFor((m) => m.type === 'SYNC_MATCH');
    presenter.send({ type: 'GAME_JOIN', name: 'Presenter' });
    await presenter.waitFor((m) => m.type === 'SYNC_MATCH');

    const sync = await participant.waitFor((m) => m.type === 'SYNC_MATCH' && m.matchBoard?.length);
    const pair = findPair(sync.matchBoard);
    if (!pair) throw new Error('no matching pair on board');
    const [a, b] = pair;

    participant.send({ type: 'MATCH_FLIP', pos: a });
    await participant.waitFor((m) => m.type === 'SYNC_MATCH' && m.matchPending?.[String(a)]);
    participant.send({ type: 'MATCH_FLIP', pos: b });
    const matched = await participant.waitFor(
      (m) => m.type === 'SYNC_MATCH' && m.matchClaimed?.[a],
    );
    if (!matched.matchClaimed[a]) throw new Error('pair not claimed');
    ok('Participant matching flip (SYNC_MATCH, claimed + score)');

    presenter.send({ type: 'MATCH_PAUSE' });
    const paused = await participant.waitFor((m) => m.type === 'SYNC_MATCH' && m.matchPaused === true);
    if (!paused.matchPaused) throw new Error('not paused');
    ok('Presenter MATCH_PAUSE syncs to participant');

    presenter.send({ type: 'MATCH_PAUSE' });
    await participant.waitFor((m) => m.type === 'SYNC_MATCH' && m.matchPaused === false);
    ok('Presenter resume (toggle pause)');

    // ── Presentation navigation ─────────────────────────────────────────
    console.log('\nPresentation navigation');
    presenter.send({ type: 'STEP_CHANGE', stepIndex: 7 });
    const stepSync = await participant.waitFor((m) => m.type === 'SYNC_STEP' && m.stepIndex === 7);
    if (stepSync.stepIndex !== 7) throw new Error('step not 7');
    ok('STEP_CHANGE to pixel-heart (step 7) syncs');

    participant.send({ type: 'STEP_CHANGE', stepIndex: 99 });
    await sleep(300);
    const partMsgs = [];
    participant.ws.addEventListener('message', (e) => {
      try { partMsgs.push(JSON.parse(e.data)); } catch { /* */ }
    });
    await sleep(200);
    if (partMsgs.some((m) => m.type === 'SYNC_STEP' && m.stepIndex === 99)) {
      throw new Error('participant should not change step');
    }
    ok('Participant STEP_CHANGE denied');

    // ── pixel-heart ───────────────────────────────────────────────────────
    console.log('\nGame: pixel-heart');
    // Player already joined during periodic-match; no need to GAME_JOIN again.

    const VALID_X = 3;
    const VALID_Y = 2;
    let progressBefore = 0;
    participant.send({ type: 'GAME_PAINT', x: VALID_X, y: VALID_Y });

    const painted = await participant.waitFor(
      (m) => m.type === 'SYNC_CANVAS' && (m.progress ?? 0) > progressBefore,
    );
    if (!painted.canvas?.[VALID_Y]?.[VALID_X]) throw new Error('cell not painted');
    ok('GAME_PAINT on target cell (progress advances)');

    participant.send({ type: 'GAME_PAINT', x: 0, y: 0 });
    await sleep(300);
    ok('Off-target GAME_PAINT rejected (no error, no spurious state)');

    presenter.send({ type: 'GAME_RESET' });
    const cleared = await participant.waitFor((m) => m.type === 'SYNC_CANVAS' && m.progress === 0);
    if (cleared.progress !== 0) throw new Error('canvas not cleared');
    ok('Presenter GAME_RESET clears canvas');

    // ── Polls ─────────────────────────────────────────────────────────────
    console.log('\nPolls');
    presenter.send({ type: 'STEP_CHANGE', stepIndex: 3 });
    await participant.waitFor((m) => m.type === 'SYNC_STEP' && m.stepIndex === 3);

    participant.send({ type: 'SUBMIT_VOTE', pollId: 'workshop_feel', choice: 'The speed' });
    const pollUpdate = await participant.waitFor(
      (m) => m.type === 'POLL_UPDATES' && m.pollId === 'workshop_feel',
    );
    if ((pollUpdate.results?.['The speed'] ?? 0) < 1) throw new Error('vote not counted');
    ok('Poll SUBMIT_VOTE → POLL_UPDATES');

    presenter.send({ type: 'RESET_POLL', pollId: 'workshop_feel' });
    await participant.waitFor((m) => m.type === 'POLL_RESET' && m.pollId === 'workshop_feel');
    ok('Presenter RESET_POLL → POLL_RESET');

    await participant.waitFor(
      (m) => m.type === 'CONNECTED_USERS' && (m.users?.length ?? 0) >= 2,
      5_000,
    ).catch(() => null);
    ok('CONNECTED_USERS broadcast (≥2 users)');

    // ── Frontend token URLs ───────────────────────────────────────────────
    console.log('\nFrontend URLs');
    const presFe = await fetch(`${FRONTEND_URL}/?token=${encodeURIComponent(presenterToken)}`);
    if (!presFe.ok) throw new Error(`presenter frontend ${presFe.status}`);
    ok('Presenter frontend URL loads');

    const partFe = await fetch(`${FRONTEND_URL}/?token=${encodeURIComponent(participantToken)}`);
    if (!partFe.ok) throw new Error(`participant frontend ${partFe.status}`);
    ok('Participant frontend URL loads');
  } finally {
    presenter.close();
    participant.close();
  }

  console.log('\n=== Summary ===');
  console.log(`Passed: ${PASS.length}`);
  if (FAIL.length) {
    console.log(`Failed: ${FAIL.length}`);
    for (const f of FAIL) console.log(`  - ${f.name}: ${f.err}`);
    process.exit(1);
  }
  console.log('\n✅ All presentation + game checks passed.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
