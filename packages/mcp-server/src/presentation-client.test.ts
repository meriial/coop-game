import { describe, it, expect } from 'vitest';
import { buildRoomWsUrl } from '@workshop/sdk/presentation-client';

describe('MCP presentation client helpers', () => {
  it('builds room WebSocket URL with agent label', () => {
    const url = buildRoomWsUrl('http://localhost:8787', 'main', 'tok.en', 'Agent 1');
    expect(url).toContain('ws://localhost:8787/room/main');
    expect(url).toContain('token=tok.en');
    expect(url).toContain('agentLabel=Agent+1');
  });
});
