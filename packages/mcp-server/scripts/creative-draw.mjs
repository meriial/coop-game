#!/usr/bin/env node
/**
 * Creative MCP drawing — one agent, one pattern.
 * Usage: node scripts/creative-draw.mjs --pattern spiral|wave|diamond --owner email --name "Display Name"
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

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { pattern: 'spiral', owner: 'artist@twosmiles.ca', name: 'Artist', label: 'Agent 1' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pattern') out.pattern = args[++i];
    if (args[i] === '--owner') out.owner = args[++i];
    if (args[i] === '--name') out.name = args[++i];
    if (args[i] === '--label') out.label = args[++i];
  }
  return out;
}

function spiralCells(cx, cy, cols, rows, turns = 4) {
  const cells = [];
  const seen = new Set();
  let x = cx; let y = cy;
  let dx = 1; let dy = 0;
  let leg = 1;
  let legProgress = 0;
  let legsAtSize = 0;
  const max = Math.min(cols * rows, turns * 8 * 8);
  while (cells.length < max) {
    const key = `${x},${y}`;
    if (x >= 0 && x < cols && y >= 0 && y < rows && !seen.has(key)) {
      cells.push({ x, y });
      seen.add(key);
    }
    x += dx; y += dy;
    legProgress++;
    if (legProgress >= leg) {
      legProgress = 0;
      [dx, dy] = [-dy, dx];
      legsAtSize++;
      if (legsAtSize >= 2) { legsAtSize = 0; leg++; }
    }
  }
  return cells;
}

function waveCells(cols, rows) {
  const cells = [];
  const midY = Math.floor(rows / 2);
  for (let x = 2; x < cols - 2; x++) {
    const y = midY + Math.round(Math.sin(x / 4) * (rows / 4));
    if (y >= 0 && y < rows) cells.push({ x, y });
    const y2 = midY + Math.round(Math.cos(x / 3) * (rows / 5));
    if (y2 >= 0 && y2 < rows) cells.push({ x, y: y2 });
  }
  return cells;
}

function diamondCells(cx, cy, radius, cols, rows) {
  const cells = [];
  for (let dy = -radius; dy <= radius; dy++) {
    const width = radius - Math.abs(dy);
    for (let dx = -width; dx <= width; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (Math.abs(dx) === width || Math.abs(dy) === radius) {
        if (x >= 0 && x < cols && y >= 0 && y < rows) cells.push({ x, y });
      }
    }
  }
  return cells;
}

function patternCells(pattern, cols, rows) {
  const cx = Math.floor(cols / 2);
  const cy = Math.floor(rows / 2);
  if (pattern === 'wave') return waveCells(cols, rows);
  if (pattern === 'diamond') return diamondCells(cx, cy, Math.min(cols, rows) / 3, cols, rows);
  return spiralCells(cx, cy, cols, rows, 5);
}

async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content?.find((c) => c.type === 'text')?.text ?? '{}';
  return JSON.parse(text);
}

async function paintInBatches(client, cells, batchMax) {
  for (let i = 0; i < cells.length; i += batchMax) {
    const batch = cells.slice(i, i + batchMax);
    await callTool(client, 'paint_path', { cells: batch });
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function main() {
  const { pattern, owner, name, label } = parseArgs();
  const token = signJwt({ email: owner, name, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });

  const serverPath = join(ROOT, 'packages/mcp-server/dist/index.js');
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    env: {
      ...process.env,
      WORKSHOP_OWNER_TOKEN: token,
      WORKSHOP_ROOM_URL: 'http://localhost:8787',
      WORKSHOP_ROOM_ID: 'main',
      WORKSHOP_AGENT_LABEL: label,
    },
  });

  const client = new Client({ name: `creative-${pattern}`, version: '0.0.1' });
  await client.connect(transport);

  const cfg = await callTool(client, 'get_config');
  const cols = cfg.grid.cols;
  const rows = cfg.grid.rows;
  const batchMax = cfg.agentBatchMax ?? 8;

  const cells = patternCells(pattern, cols, rows);
  console.log(`[${label}] ${pattern}: painting ${cells.length} cells on ${cols}×${rows}`);

  await paintInBatches(client, cells, batchMax);
  const after = await callTool(client, 'get_state');

  await client.close();
  console.log(JSON.stringify({
    pattern,
    owner,
    label,
    cellsPainted: cells.length,
    coverage: after.state?.coverage,
    harmony: after.state?.harmony,
    myColor: after.state?.myColor,
  }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
