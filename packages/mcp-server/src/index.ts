import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  PresentationClient,
  buildRoomWsUrl,
  type PresentationSnapshot,
} from '@workshop/sdk/presentation-client';

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function decodeJwtPayload(token: string): { email?: string; name?: string } {
  try {
    const body = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(body ?? '', 'base64').toString('utf8')) as { email?: string; name?: string };
  } catch {
    return {};
  }
}

function decodeJwtEmail(token: string): string {
  return decodeJwtPayload(token).email ?? '';
}

function decodeJwtName(token: string): string {
  return decodeJwtPayload(token).name ?? 'Owner';
}

const POWERUP_BLURBS: Record<string, string> = {
  bloom: 'Your next few paints blend much more strongly (saturated edges).',
  prism: 'Your color cycles through the rainbow with every paint.',
  supernova: 'Your paints spread two cells out instead of one.',
  additive: 'Neighbors blend by adding light, so overlaps brighten.',
};

function myPlayerKey(snapshot: PresentationSnapshot): string {
  return snapshot.identity.ownerId || snapshot.identity.name;
}

// Compact, agent-friendly view of the co-op canvas: only painted cells (the
// full matrix is mostly empty), plus power-ups, this agent's color/effect, and
// whether the agent is currently eligible to grab a power-up.
function pixelHeartView(snapshot: PresentationSnapshot) {
  const s = snapshot.pixelHeart;
  const myKey = myPlayerKey(snapshot);
  const paintedCells: { x: number; y: number; color: string }[] = [];
  for (let y = 0; y < s.canvas.length; y++) {
    const row = s.canvas[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) {
      const color = row[x];
      if (color) paintedCells.push({ x, y, color });
    }
  }
  return {
    cols: s.cols,
    rows: s.rows,
    coverage: s.progress,
    harmony: s.harmony,
    config: s.config,
    myColor: s.players[myKey]?.color ?? null,
    myEffect: s.effects[myKey] ?? null,
    powerupEligible: !s.claims.includes(myKey),
    powerups: s.powerups,
    players: Object.values(s.players),
    paintedCount: paintedCells.length,
    paintedCells,
  };
}

function activeGameState(snapshot: PresentationSnapshot): unknown {
  if (snapshot.activeGameId === 'periodic-match') return snapshot.periodicMatch;
  if (snapshot.activeGameId === 'pixel-heart') return pixelHeartView(snapshot);
  return null;
}

async function main() {
  const roomUrl = process.env.WORKSHOP_ROOM_URL ?? 'http://localhost:8787';
  const roomId = process.env.WORKSHOP_ROOM_ID ?? 'main';
  const ownerToken = env('WORKSHOP_OWNER_TOKEN');
  const agentLabel = process.env.WORKSHOP_AGENT_LABEL ?? 'Agent 1';

  const wsUrl = buildRoomWsUrl(roomUrl, roomId, ownerToken, agentLabel);
  const ownerId = decodeJwtEmail(ownerToken);
  const ownerName = decodeJwtName(ownerToken);
  const displayName = `${ownerName}'s ${agentLabel}`;
  const client = new PresentationClient(wsUrl, displayName, { ownerId, agentLabel });
  await client.connect();

  const server = new McpServer({ name: 'workshop-mcp', version: '0.1.0' });

  server.tool(
    'get_state',
    'Current active game id, state snapshot, and agent identity',
    {},
    async () => {
      const snapshot = client.getSnapshot();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            activeGameId: snapshot.activeGameId,
            state: activeGameState(snapshot),
            identity: snapshot.identity,
            version: snapshot.version,
            stepIndex: snapshot.stepIndex,
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'wait_for_update',
    'Long-poll until the next SYNC_* state change or timeout (~25s)',
    { since_version: z.number().optional().describe('Only return after this version') },
    async ({ since_version }) => {
      const base = since_version ?? client.getSnapshot().version;
      const snapshot = await client.waitForUpdate(base, 25_000);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            activeGameId: snapshot.activeGameId,
            state: activeGameState(snapshot),
            identity: snapshot.identity,
            version: snapshot.version,
            timedOut: snapshot.version <= base,
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'take_action',
    'Send an inbound game message (e.g. MATCH_FLIP, GAME_PAINT)',
    {
      type: z.string(),
      payload: z.record(z.unknown()).optional(),
    },
    async ({ type, payload }) => {
      client.sendAction({ type, ...(payload ?? {}) } as { type: string });
      const snapshot = await client.waitForUpdate(client.getSnapshot().version, 10_000);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            sent: { type, ...(payload ?? {}) },
            activeGameId: snapshot.activeGameId,
            state: activeGameState(snapshot),
            version: snapshot.version,
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'get_config',
    'Co-op canvas rules: grid size, mix strength, paint cooldown, agent batch size, and the available power-up blend modes.',
    {},
    async () => {
      const cfg = client.getSnapshot().pixelHeart.config;
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            grid: { cols: cfg.cols, rows: cfg.rows },
            mixStrength: cfg.mixStrength,
            cooldownMs: cfg.cooldownMs,
            agentBatchMax: cfg.agentBatchMax,
            powerups: {
              enabled: cfg.powerupsEnabled,
              intervalMs: cfg.powerupIntervalMs,
              max: cfg.powerupMax,
              kinds: POWERUP_BLURBS,
            },
            rules: [
              'Painting a cell fills it with your color; the 8 neighbours blend toward your color (empty neighbours become half-transparent).',
              'Repeated paints accumulate, building gradients where colors meet.',
              'Painting onto a power-up cell grants its blend-mode effect for a few paints. You cannot grab another until everyone else has claimed one.',
              `Paints are rate-limited to one per ${cfg.cooldownMs}ms; use paint_path to lay down up to ${cfg.agentBatchMax} cells per turn.`,
            ],
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'paint',
    'Paint a single cell (x, y) in your color, blending into its neighbours.',
    { x: z.number(), y: z.number() },
    async ({ x, y }) => {
      client.sendAction({ type: 'GAME_PAINT', x, y });
      const snapshot = await client.waitForUpdate(client.getSnapshot().version, 10_000);
      return {
        content: [{ type: 'text', text: JSON.stringify({ sent: { type: 'GAME_PAINT', x, y }, state: pixelHeartView(snapshot), version: snapshot.version }, null, 2) }],
      };
    },
  );

  server.tool(
    'paint_path',
    'Paint multiple cells in one turn (capped at the agent batch size). Useful for drawing lines, shapes, or gradients.',
    { cells: z.array(z.object({ x: z.number(), y: z.number() })) },
    async ({ cells }) => {
      client.sendAction({ type: 'GAME_PAINT_PATH', cells });
      const snapshot = await client.waitForUpdate(client.getSnapshot().version, 10_000);
      return {
        content: [{ type: 'text', text: JSON.stringify({ sent: { type: 'GAME_PAINT_PATH', count: cells.length }, state: pixelHeartView(snapshot), version: snapshot.version }, null, 2) }],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
