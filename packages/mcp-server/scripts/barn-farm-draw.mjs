#!/usr/bin/env node
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const MCP = join(ROOT, 'packages/mcp-server/dist/index.js');

function fromFrontendEnv(key) {
  const line = readFileSync(join(ROOT, 'frontend/.env'), 'utf8')
    .split('\n').find((l) => l.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() : undefined;
}

const errors = [];
let lastX = null, lastY = null, cursorX = null, cursorY = null;

function syncPos(st) {
  if (st.myLastPaint) { lastX = st.myLastPaint.x; lastY = st.myLastPaint.y; }
  const c = st.myCursor ?? st.myLastPaint;
  if (c) { cursorX = c.x; cursorY = c.y; }
}

function chunkPath(cells, max = 8) {
  const chunks = [];
  for (let i = 0; i < cells.length; i += max) chunks.push(cells.slice(i, i + max));
  return chunks;
}

function adj(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;
}

function rowCells(y, x0, x1, dir = 1) {
  const out = [];
  if (dir > 0) for (let x = x0; x <= x1; x++) out.push({ x, y });
  else for (let x = x0; x >= x1; x--) out.push({ x, y });
  return out;
}

const PATH_SET = new Set([
  '47,32','46,31','45,30','44,29','43,28','42,27','41,26','40,25','39,24','38,23','37,22','36,21',
]);

async function main() {
  const token = fromFrontendEnv('VITE_AGENT_TOKEN');
  const roomUrl = fromFrontendEnv('VITE_SERVER_URL');
  const transport = new StdioClientTransport({
    command: 'node',
    args: [MCP],
    env: {
      ...process.env,
      WORKSHOP_OWNER_TOKEN: token,
      WORKSHOP_ROOM_URL: roomUrl,
      WORKSHOP_ROOM_ID: 'main',
      WORKSHOP_AGENT_LABEL: 'Barn Agent',
    },
  });
  const client = new Client({ name: 'barn-farm-draw', version: '0.0.1' });
  await client.connect(transport);

  async function take(type, payload = {}) {
    try {
      const result = await client.callTool({ name: 'take_action', arguments: { type, payload } });
      const text = result.content?.find((c) => c.type === 'text')?.text ?? '{}';
      const data = JSON.parse(text);
      if (data.state) syncPos(data.state);
      return data;
    } catch (e) {
      errors.push(`${type}: ${e.message}`);
      return null;
    }
  }

  async function setColor(color) {
    await take('GAME_SET_COLOR', { color });
  }

  async function paintPath(cells) {
    for (const chunk of chunkPath(cells)) {
      if (lastX !== null && !adj({ x: lastX, y: lastY }, chunk[0])) {
        await walkTo(chunk[0].x, chunk[0].y);
        await stamp();
      }
      const before = lastX;
      await take('GAME_PAINT_PATH', { cells: chunk });
      if (lastX === before && lastY === before) {
        errors.push(`paintPath stuck at (${before},${before}) chunk ${JSON.stringify(chunk[0])}`);
      }
    }
  }

  async function walkTo(tx, ty) {
    let guard = 0;
    while ((cursorX !== tx || cursorY !== ty) && guard++ < 500) {
      const dx = tx - cursorX;
      const dy = ty - cursorY;
      const nx = cursorX + Math.sign(dx);
      const ny = cursorY + Math.sign(dy);
      const prev = `${cursorX},${cursorY}`;
      await take('GAME_WORM_MOVE', { x: nx, y: ny });
      if (`${cursorX},${cursorY}` === prev) {
        errors.push(`worm stuck at (${cursorX},${cursorY}) -> (${tx},${ty})`);
        break;
      }
    }
  }

  async function stamp() {
    await take('GAME_PAINT', { x: cursorX, y: cursorY, fromCursor: true });
  }

  // 1 Hill olive
  await setColor('#6B8E23');
  await paintPath(rowCells(9, 25, 30));
  await paintPath(rowCells(10, 30, 25, -1));

  // 2 Roof white
  await setColor('#FFFFFF');
  await walkTo(33, 7);
  await stamp();
  await paintPath(rowCells(7, 34, 42));
  await paintPath(rowCells(8, 41, 34, -1));
  await paintPath(rowCells(9, 35, 40));

  // 3 Barn body sienna (snake rows 11-19, x 29-43)
  await setColor('#D2691E');
  let leftToRight = true;
  for (let y = 11; y <= 19; y++) {
    const cells = leftToRight ? rowCells(y, 29, 43) : rowCells(y, 43, 29, -1);
    await paintPath(cells);
    leftToRight = !leftToRight;
  }

  // 4 Door outline white
  await setColor('#FFFFFF');
  const door = [
    {x:35,y:14},{x:36,y:14},{x:37,y:14},{x:38,y:14},
    {x:35,y:15},{x:38,y:15},
    {x:35,y:16},{x:36,y:16},{x:37,y:16},{x:38,y:16},
    {x:35,y:17},{x:38,y:17},
    {x:35,y:18},{x:36,y:18},{x:37,y:18},{x:38,y:18},
  ];
  await paintPath(door);

  // 5 Windows
  await paintPath([{x:31,y:12},{x:32,y:12}]);
  await walkTo(40, 12);
  await stamp();
  await paintPath([{x:41,y:12}]);

  // 6 Fence posts y=21 (non-adjacent — walk + stamp)
  const fence = [25,27,29,31,33,35,37,39,41,43,45].map((x) => ({ x, y: 21 }));
  for (const post of fence) {
    await walkTo(post.x, post.y);
    await stamp();
  }

  // 7 Path sandy (from bottom-right up)
  await setColor('#F4A460');
  const pathCells = [
    {x:47,y:32},{x:46,y:31},{x:45,y:30},{x:44,y:29},{x:43,y:28},{x:42,y:27},{x:41,y:26},{x:40,y:25},
    {x:39,y:24},{x:38,y:23},{x:37,y:22},{x:36,y:21},
  ];
  await walkTo(47, 32);
  await stamp();
  await paintPath(pathCells.slice(1));

  // 8 Grass (avoid path), snake rows
  await setColor('#228B22');
  let grassLtr = true;
  for (let y = 24; y <= 31; y++) {
    const xs = [];
    for (let x = 23; x <= 47; x++) if (!PATH_SET.has(`${x},${y}`)) xs.push(x);
    if (!xs.length) continue;
    const cells = grassLtr
      ? xs.map((x) => ({ x, y }))
      : [...xs].reverse().map((x) => ({ x, y }));
    await paintPath(cells);
    grassLtr = !grassLtr;
  }

  const result = await client.callTool({ name: 'get_state', arguments: {} });
  const text = result.content?.find((c) => c.type === 'text')?.text ?? '{}';
  const final = JSON.parse(text);
  await client.close();

  const st = final.state;
  const lines = (st.asciiCanvas || '').split('\n');
  const excerpt = lines.slice(6, 33).join('\n');

  console.log(JSON.stringify({
    paintedCount: st.paintedCount,
    excerptRows6to32: excerpt,
    errors,
    myLastPaint: st.myLastPaint,
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
