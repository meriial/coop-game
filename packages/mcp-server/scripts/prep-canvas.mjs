#!/usr/bin/env node
/**
 * Prep canvas for creative agent demo: step 7, reset, wide grid, low cooldown.
 */
import { createHmac } from 'node:crypto';

const JWT_SECRET = process.env.JWT_SECRET ?? 'local-dev-secret-change-before-production';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function signJwt(payload) {
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  const body = b64url(payload);
  const data = `${header}.${body}`;
  const sig = createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

async function wsOnce(token, sendMsg, waitType) {
  const wsUrl = `ws://localhost:8787/room/main?token=${encodeURIComponent(token)}&devRole=presenter`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 15_000);
    ws.onopen = () => { if (sendMsg) ws.send(JSON.stringify(sendMsg)); };
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (!waitType || msg.type === waitType) {
        clearTimeout(timer);
        ws.close();
        resolve(msg);
      }
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('ws error')); };
  });
}

async function main() {
  const token = signJwt({
    email: 'music@twosmiles.ca',
    name: 'Presenter',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  await wsOnce(token, { type: 'STEP_CHANGE', stepIndex: 7 }, 'SYNC_STEP');
  await wsOnce(token, { type: 'GAME_RESET' }, 'SYNC_CANVAS');
  const synced = await wsOnce(token, {
    type: 'GAME_CONFIG',
    config: { cols: 40, rows: 22, cooldownMs: 80 },
  }, 'SYNC_CANVAS');

  console.log(JSON.stringify({ cols: synced.cols, rows: synced.rows, progress: synced.progress }));
}

main().catch((e) => { console.error(e); process.exit(1); });
