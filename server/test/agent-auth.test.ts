import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';
import { createTestJWT } from './helpers/jwt';

async function tryAgentConnect(roomId: string, email: string, agentLabel: string) {
  const token = await createTestJWT({ email, name: 'Bob' });
  const url = `http://localhost/room/${roomId}?token=${encodeURIComponent(token)}&devRole=participant&agentLabel=${encodeURIComponent(agentLabel)}`;
  return SELF.fetch(url, { headers: { Upgrade: 'websocket' } });
}

describe('agent authentication', () => {
  it('stamps agent identity on connect', async () => {
    const roomId = `agent-${crypto.randomUUID()}`;
    const res = await tryAgentConnect(roomId, 'bob@test.com', 'Agent 1');
    expect(res.status).toBe(101);
    const ws = res.webSocket!;
    ws.accept();

    const welcome = await new Promise<Record<string, unknown>>((resolve) => {
      ws.addEventListener('message', (e) => {
        resolve(JSON.parse(e.data as string) as Record<string, unknown>);
      }, { once: true });
    });

    expect(welcome.type).toBe('WELCOME');
    ws.send(JSON.stringify({ type: 'GAME_JOIN', name: "Bob's Agent 1" }));

    const sync = await new Promise<Record<string, unknown>>((resolve) => {
      ws.addEventListener('message', (e) => {
        const msg = JSON.parse(e.data as string) as Record<string, unknown>;
        if (msg.type === 'SYNC_MATCH') resolve(msg);
      });
    });

    const scores = sync.matchScores as { name: string }[];
    expect(scores.some((s) => s.name === "Bob's Agent 1")).toBe(true);
    ws.close();
  });

  it('rejects a second agent for periodic-match (maxAgentsPerOwner: 1)', async () => {
    const roomId = `agent-cap-${crypto.randomUUID()}`;
    const first = await tryAgentConnect(roomId, 'owner@test.com', 'Agent 1');
    expect(first.status).toBe(101);
    first.webSocket?.accept();
    first.webSocket?.send(JSON.stringify({ type: 'GAME_JOIN', name: "Owner's Agent 1" }));

    const second = await tryAgentConnect(roomId, 'owner@test.com', 'Agent 2');
    expect(second.status).toBe(403);
  });

  it('gives each agent its own player row and color on pixel-heart', async () => {
    const roomId = `agent-colors-${crypto.randomUUID()}`;

    const presenterToken = await createTestJWT({ email: 'admin@test.com', name: 'Admin' });
    const presenterUrl = `http://localhost/room/${roomId}?token=${encodeURIComponent(presenterToken)}&devRole=presenter`;
    const presenterRes = await SELF.fetch(presenterUrl, { headers: { Upgrade: 'websocket' } });
    expect(presenterRes.status).toBe(101);
    const presenterWs = presenterRes.webSocket!;
    presenterWs.accept();
    await new Promise<void>((r) => {
      presenterWs.addEventListener('message', () => r(), { once: true });
    });
    presenterWs.send(JSON.stringify({ type: 'STEP_CHANGE', stepIndex: 7 }));

    const first = await tryAgentConnect(roomId, 'owner3@test.com', 'Sun Agent');
    expect(first.status).toBe(101);
    const ws1 = first.webSocket!;
    ws1.accept();
    ws1.send(JSON.stringify({ type: 'GAME_JOIN', name: "Owner's Sun Agent" }));

    const sync1 = await new Promise<Record<string, unknown>>((resolve) => {
      ws1.addEventListener('message', (e) => {
        const msg = JSON.parse(e.data as string) as Record<string, unknown>;
        if (msg.type === 'SYNC_CANVAS') resolve(msg);
      });
    });
    const players1 = sync1.players as Record<string, { color: string }>;
    const sunKey = 'owner3@test.com::agent::Sun Agent';
    expect(players1[sunKey]).toBeDefined();

    const second = await tryAgentConnect(roomId, 'owner3@test.com', 'Moon Agent');
    expect(second.status).toBe(101);
    const ws2 = second.webSocket!;
    ws2.accept();
    ws2.send(JSON.stringify({ type: 'GAME_JOIN', name: "Owner's Moon Agent" }));

    const sync2 = await new Promise<Record<string, unknown>>((resolve) => {
      ws2.addEventListener('message', (e) => {
        const msg = JSON.parse(e.data as string) as Record<string, unknown>;
        if (msg.type === 'SYNC_CANVAS') resolve(msg);
      });
    });
    const players2 = sync2.players as Record<string, { color: string }>;
    const moonKey = 'owner3@test.com::agent::Moon Agent';
    expect(players2[moonKey]).toBeDefined();
    expect(players2[sunKey]).toBeDefined();
    expect(players2[sunKey].color).not.toBe(players2[moonKey].color);

    ws1.close();
    ws2.close();
  });

  it('allows multiple agents on pixel-heart step', async () => {
    const roomId = `agent-ph-${crypto.randomUUID()}`;

    const presenterToken = await createTestJWT({ email: 'admin@test.com', name: 'Admin' });
    const presenterUrl = `http://localhost/room/${roomId}?token=${encodeURIComponent(presenterToken)}&devRole=presenter`;
    const presenterRes = await SELF.fetch(presenterUrl, { headers: { Upgrade: 'websocket' } });
    expect(presenterRes.status).toBe(101);
    const presenterWs = presenterRes.webSocket!;
    presenterWs.accept();
    await new Promise<void>((r) => {
      presenterWs.addEventListener('message', () => r(), { once: true });
    });
    presenterWs.send(JSON.stringify({ type: 'STEP_CHANGE', stepIndex: 7 }));

    const first = await tryAgentConnect(roomId, 'owner2@test.com', 'Agent 1');
    expect(first.status).toBe(101);
    first.webSocket?.accept();

    const second = await tryAgentConnect(roomId, 'owner2@test.com', 'Agent 2');
    expect(second.status).toBe(101);
  });
});
