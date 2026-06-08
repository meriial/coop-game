#!/usr/bin/env node
/**
 * Creative painting agent — paints concentric diamonds, diagonals, and corner accents.
 * Usage: node scripts/paint-agent.mjs [--owner email] [--name "Display Name"]
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
  const sig = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let owner = 'foo+bar@atwosmiles.ca';
  let name = 'Bar';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--owner') owner = args[++i];
    else if (args[i] === '--name') name = args[++i];
  }
  return { owner, name };
}

async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = result.content?.find((c) => c.type === 'text')?.text ?? '{}';
  return JSON.parse(text);
}

async function paintInBatches(client, cells, batchMax) {
  let painted = 0;
  for (let i = 0; i < cells.length; i += batchMax) {
    const batch = cells.slice(i, i + batchMax);
    await callTool(client, 'paint_path', { cells: batch });
    painted += batch.length;
    process.stdout.write(`  Painted ${painted}/${cells.length} cells...\r`);
    await new Promise((r) => setTimeout(r, 150));
  }
  console.log(`  Painted ${painted}/${cells.length} cells... done`);
}

/**
 * Generate a large butterfly / wing pattern:
 * Two symmetrical wing shapes radiating from a central spine.
 * The left wing fans out to the upper-left, right wing to upper-right,
 * with a tail fanning down-left and down-right.
 * Then a solid vertical + horizontal cross through center for the body.
 */
function buildPattern(cols, rows) {
  const cells = [];
  const seen = new Set();

  function add(x, y) {
    if (x < 0 || x >= cols || y < 0 || y >= rows) return;
    const key = `${x},${y}`;
    if (!seen.has(key)) {
      seen.add(key);
      cells.push({ x, y });
    }
  }

  const cx = Math.floor(cols / 2);
  const cy = Math.floor(rows / 2);

  // === Big concentric diamond outlines (3 rings) ===
  for (const r of [8, 14, 18]) {
    for (let d = -r; d <= r; d++) {
      const w = r - Math.abs(d);
      add(cx + w, cy + d);
      add(cx - w, cy + d);
    }
  }

  // === Thick vertical spine through center ===
  for (let y = cy - 18; y <= cy + 18; y++) {
    add(cx, y);
    add(cx + 1, y);
  }

  // === Thick horizontal bar through center ===
  for (let x = cx - 18; x <= cx + 18; x++) {
    add(x, cy);
    add(x, cy + 1);
  }

  // === Diagonal X through center ===
  for (let i = -16; i <= 16; i++) {
    add(cx + i, cy + i);
    add(cx + i, cy - i);
    add(cx + i + 1, cy + i);
    add(cx + i + 1, cy - i);
  }

  // === Corner accents — small filled squares in four corners of the grid ===
  const margin = 3;
  const size = 4;
  for (const [ox, oy] of [
    [margin, margin],
    [cols - margin - size, margin],
    [margin, rows - margin - size],
    [cols - margin - size, rows - margin - size],
  ]) {
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        add(ox + dx, oy + dy);
      }
    }
  }

  // === Filled diamond center (radius 5) ===
  for (let dy = -5; dy <= 5; dy++) {
    const w = 5 - Math.abs(dy);
    for (let dx = -w; dx <= w; dx++) {
      add(cx + dx, cy + dy);
    }
  }

  return cells;
}

async function main() {
  const { owner, name } = parseArgs();
  const token =
    process.env.WORKSHOP_OWNER_TOKEN ??
    signJwt({ email: owner, name, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });

  console.log('Connecting to MCP server...');
  const serverPath = join(ROOT, 'packages/mcp-server/dist/index.js');
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    env: {
      ...process.env,
      WORKSHOP_OWNER_TOKEN: token,
      WORKSHOP_ROOM_URL: process.env.WORKSHOP_ROOM_URL ?? 'http://localhost:8787',
      WORKSHOP_ROOM_ID: process.env.WORKSHOP_ROOM_ID ?? 'main',
      WORKSHOP_AGENT_LABEL: 'Star Painter',
    },
  });

  const client = new Client({ name: 'paint-agent', version: '1.0.0' });
  await client.connect(transport);
  console.log('Connected.');

  // Get config
  const cfg = await callTool(client, 'get_config');
  const { cols, rows } = cfg.grid;
  const batchMax = cfg.agentBatchMax ?? 8;
  console.log(`Grid: ${cols}×${rows}, batchMax: ${batchMax}`);

  // Read current canvas state
  console.log('\nReading current canvas...');
  const before = await callTool(client, 'get_state');
  const asciiBefor = before.state?.asciiCanvas ?? '(no canvas)';
  console.log('=== CANVAS BEFORE ===');
  console.log(asciiBefor);
  console.log(`Painted cells before: ${before.state?.paintedCount ?? 0}`);

  // Build our pattern
  const cells = buildPattern(cols, rows);
  console.log(`\nPattern: cross + concentric diamonds + diagonals + corner accents`);
  console.log(`Total cells to paint: ${cells.length}`);

  // Paint it
  console.log('\nPainting...');
  await paintInBatches(client, cells, batchMax);

  // Read final state
  console.log('\nReading final canvas...');
  const after = await callTool(client, 'get_state');
  const asciiAfter = after.state?.asciiCanvas ?? '(no canvas)';
  console.log('\n=== FINAL CANVAS ===');
  console.log(asciiAfter);
  console.log(`\nPainted cells after: ${after.state?.paintedCount ?? 0}`);
  console.log(`Coverage: ${after.state?.coverage ?? 'N/A'}`);
  console.log(`Harmony: ${after.state?.harmony ?? 'N/A'}`);
  console.log(`My color: ${after.state?.myColor ?? 'N/A'}`);

  await client.close();
  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Error:', err.message ?? err);
  process.exit(1);
});
