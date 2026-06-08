#!/usr/bin/env node
/**
 * MCP tool verification for the co-op canvas (no LLM — calls tools directly).
 * Run from repo root: npm run verify:mcp --prefix packages/mcp-server
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createHmac } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const OUT = join(ROOT, 'docs/screenshots');
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

function ownerToken() {
  if (process.env.WORKSHOP_OWNER_TOKEN) return process.env.WORKSHOP_OWNER_TOKEN;
  const now = Math.floor(Date.now() / 1000);
  return signJwt({ email: 'agent-owner@twosmiles.ca', name: 'Agent Owner', iat: now, exp: now + 3600 });
}

async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content?.find((c) => c.type === 'text')?.text ?? '{}';
  return JSON.parse(text);
}

async function advanceToCanvasStep(token) {
  const wsUrl = `ws://localhost:8787/room/main?token=${encodeURIComponent(token)}&devRole=presenter`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => { ws.close(); reject(new Error('WS timeout')); }, 10_000);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'STEP_CHANGE', stepIndex: 7 }));
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'SYNC_STEP' && msg.stepIndex === 7) {
        clearTimeout(timer);
        ws.close();
        resolve(msg);
      }
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('WS error')); };
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const token = ownerToken();

  console.log('Advancing room to pixel-heart step…');
  await advanceToCanvasStep(token);

  const serverPath = join(ROOT, 'packages/mcp-server/dist/index.js');
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    env: {
      ...process.env,
      WORKSHOP_OWNER_TOKEN: token,
      WORKSHOP_ROOM_URL: 'http://localhost:8787',
      WORKSHOP_ROOM_ID: 'main',
      WORKSHOP_AGENT_LABEL: 'Verify Agent',
    },
  });

  const client = new Client({ name: 'verify-client', version: '0.0.1' });
  await client.connect(transport);

  const log = {};

  log.get_config = await callTool(client, 'get_config');
  console.log('get_config:', log.get_config.grid);

  log.get_state_before = await callTool(client, 'get_state');
  console.log('get_state before paint:', log.get_state_before.state?.paintedCount ?? 0, 'cells');

  log.paint = await callTool(client, 'paint', { x: 12, y: 8 });
  console.log('paint(12,8): coverage', log.paint.state?.coverage);

  log.paint_path = await callTool(client, 'paint_path', {
    cells: [{ x: 13, y: 8 }, { x: 14, y: 8 }, { x: 15, y: 8 }, { x: 16, y: 8 }],
  });
  console.log('paint_path: coverage', log.paint_path.state?.coverage);

  log.wait_for_update = await callTool(client, 'wait_for_update', { since_version: log.paint_path.version });
  console.log('wait_for_update: timedOut', log.wait_for_update.timedOut);

  log.get_state_after = await callTool(client, 'get_state');
  console.log('get_state after:', log.get_state_after.state?.paintedCount, 'cells, effect:', log.get_state_after.state?.myEffect);

  await client.close();
  await writeFile(join(OUT, 'mcp-verify.json'), JSON.stringify(log, null, 2));
  console.log('MCP verification complete → docs/screenshots/mcp-verify.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
