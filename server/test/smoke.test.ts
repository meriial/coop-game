import { describe, it, expect } from 'vitest';
import { connectRoom } from './helpers/ws';

describe('presentation room WebSocket', () => {
  it('sends WELCOME with step index and match board on connect', async () => {
    const client = await connectRoom({
      role: 'presenter',
      email: 'admin@test.com',
      name: 'Admin',
    });

    const welcome = await client.waitFor((m) => m.type === 'WELCOME');
    expect(welcome.type).toBe('WELCOME');
    expect(welcome.stepIndex).toBe(0);
    expect(welcome.role).toBe('presenter');
    expect(Array.isArray(welcome.matchBoard)).toBe(true);
    expect((welcome.matchBoard as string[]).length).toBeGreaterThan(0);
    expect(welcome.canvas).toBeDefined();
    expect(welcome.pollResults).toBeDefined();

    client.close();
  });
});
