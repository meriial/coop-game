#!/usr/bin/env node
/**
 * Agent-style circle draw via MCP tools (same path a Cursor-connected LLM would use).
 * Simulates: get_config → get_state → compute circle → paint_path batches.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createHmac } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
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

function circleOutline(cx, cy, radius, cols, rows) {
  const cells = [];
  const seen = new Set();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= radius - 0.6 && d <= radius + 0.6) {
        const k = `${x},${y}`;
        if (!seen.has(k)) { seen.add(k); cells.push({ x, y }); }
      }
    }
  }
  return cells;
}

async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content?.find((c) => c.type === 'text')?.text ?? '{}';
  return JSON.parse(text);
}

async function main() {
  const token = signJwt({
    email: 'circle-bot@twosmiles.ca',
    name: 'Circle Bot',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

  const transport = new StdioClientTransport({
    command: 'node',
    args: [join(ROOT, 'packages/mcp-server/dist/index.js')],
    env: {
      ...process.env,
      WORKSHOP_OWNER_TOKEN: token,
      WORKSHOP_ROOM_URL: 'http://localhost:8787',
      WORKSHOP_ROOM_ID: 'main',
      WORKSHOP_AGENT_LABEL: 'Circle Agent',
    },
  });

  const client = new Client({ name: 'circle-agent', version: '0.0.1' });
  await client.connect(transport);

  const config = await callTool(client, 'get_config');
  const before = await callTool(client, 'get_state');
  const { cols, rows } = config.grid;
  const batchMax = config.agentBatchMax ?? 8;

  const cx = Math.floor(cols / 2);
  const cy = Math.floor(rows / 2);
  const radius = Math.min(cols, rows) / 3;
  const cells = circleOutline(cx, cy, radius, cols, rows);

  console.log('=== Agent reasoning inputs ===');
  console.log(`Grid: ${cols}×${rows}, batchMax: ${batchMax}, cooldown: ${config.cooldownMs}ms`);
  console.log(`Saw ${before.state?.paintedCount ?? 0} painted cells before drawing`);
  console.log(`Plan: circle outline center (${cx},${cy}) radius ~${radius.toFixed(1)} → ${cells.length} cells`);

  for (let i = 0; i < cells.length; i += batchMax) {
    await callTool(client, 'paint_path', { cells: cells.slice(i, i + batchMax) });
    await new Promise((r) => setTimeout(r, Math.max(config.cooldownMs ?? 150, 80) + 20));
  }

  const after = await callTool(client, 'get_state');
  await client.close();

  console.log('\n=== Result ===');
  console.log(JSON.stringify({
    paintedBefore: before.state?.paintedCount,
    paintedAfter: after.state?.paintedCount,
    coverage: after.state?.coverage,
    harmony: after.state?.harmony,
    myColor: after.state?.myColor,
    cellsInCircle: cells.length,
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
