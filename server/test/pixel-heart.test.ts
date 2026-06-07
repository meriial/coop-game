import { describe, it, expect, beforeEach } from 'vitest';
import {
  connectRoom,
  joinGameCanvas,
  latestSyncCanvas,
} from './helpers/ws';

// Valid target cell from PresentationRoom TARGET grid (row 2, col 3)
const VALID_X = 3;
const VALID_Y = 2;

describe('pixel-heart game', () => {
  let roomId: string;
  let presenter: Awaited<ReturnType<typeof connectRoom>>;
  let player: Awaited<ReturnType<typeof connectRoom>>;

  beforeEach(async () => {
    roomId = `canvas-${crypto.randomUUID()}`;
    presenter = await connectRoom({ role: 'presenter', email: 'admin@test.com', name: 'Admin', roomId });
    await presenter.waitFor((m) => m.type === 'WELCOME');
    player = await connectRoom({ role: 'participant', email: 'painter@test.com', name: 'Painter', roomId });
    await player.waitFor((m) => m.type === 'WELCOME');
    await joinGameCanvas(player, 'Painter');
  });

  it('paints target cells in player color and advances progress', async () => {
    const before = latestSyncCanvas(player)!;
    const progressBefore = before.progress as number;

    player.send({ type: 'GAME_PAINT', x: VALID_X, y: VALID_Y });
    const after = await player.waitFor(
      (m) => m.type === 'SYNC_CANVAS' && (m.progress as number) > progressBefore,
    );

    const canvas = after.canvas as (string | null)[][];
    expect(canvas[VALID_Y][VALID_X]).toBeTruthy();
    expect(after.progress as number).toBeGreaterThan(progressBefore);
    expect((after.players as Record<string, { color: string }>)['painter@test.com']).toBeDefined();
  });

  it('rejects off-target and out-of-bounds paint', async () => {
    const before = latestSyncCanvas(player)!;
    const countBefore = player.messages.filter((m) => m.type === 'SYNC_CANVAS').length;

    player.send({ type: 'GAME_PAINT', x: 0, y: 0 });
    player.send({ type: 'GAME_PAINT', x: 25, y: 25 });
    await new Promise((r) => setTimeout(r, 200));

    const countAfter = player.messages.filter((m) => m.type === 'SYNC_CANVAS').length;
    expect(countAfter).toBe(countBefore);
    expect((latestSyncCanvas(player)!.canvas as (string | null)[][])[0][0]).toBe(
      (before.canvas as (string | null)[][])[0][0],
    );
  });

  it('clears canvas when presenter sends GAME_RESET', async () => {
    player.send({ type: 'GAME_PAINT', x: VALID_X, y: VALID_Y });
    await player.waitFor((m) => m.type === 'SYNC_CANVAS' && (m.progress as number) > 0);

    presenter.send({ type: 'GAME_RESET' });
    const cleared = await presenter.waitFor((m) => m.type === 'SYNC_CANVAS' && (m.progress as number) === 0);
    const canvas = cleared.canvas as (string | null)[][];
    expect(canvas[VALID_Y][VALID_X]).toBeNull();
    expect(cleared.progress).toBe(0);
  });

  it('includes canvas snapshot in WELCOME for late joiners', async () => {
    player.send({ type: 'GAME_PAINT', x: VALID_X, y: VALID_Y });
    await player.waitFor((m) => m.type === 'SYNC_CANVAS' && (m.progress as number) > 0);

    const late = await connectRoom({ role: 'participant', email: 'late@test.com', name: 'Late', roomId });
    const welcome = await late.waitFor((m) => m.type === 'WELCOME');
    const canvas = welcome.canvas as (string | null)[][];
    expect(canvas[VALID_Y][VALID_X]).toBeTruthy();
    expect(welcome.progress as number).toBeGreaterThan(0);
    late.close();
  });
});
