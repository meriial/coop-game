#!/usr/bin/env node
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

function activeGameState(snapshot: PresentationSnapshot): unknown {
  if (snapshot.activeGameId === 'periodic-match') return snapshot.periodicMatch;
  if (snapshot.activeGameId === 'pixel-heart') return snapshot.pixelHeart;
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
