import { describe, it, expect, beforeEach } from 'vitest';
import {
  connectRoom,
  joinGameCanvas,
  latestSyncCanvas,
} from './helpers/ws';

// Any interior cell is paintable on the free canvas (default grid is 32x18).
const CX = 5;
const CY = 5;

describe('pixel-heart co-op canvas', () => {
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

  it('paints a cell in the player color and advances coverage', async () => {
    const before = latestSyncCanvas(player)!;
    const progressBefore = before.progress as number;

    player.send({ type: 'GAME_PAINT', x: CX, y: CY });
    const after = await player.waitFor(
      (m) => m.type === 'SYNC_CANVAS' && (m.progress as number) > progressBefore,
    );

    const canvas = after.canvas as (string | null)[][];
    expect(canvas[CY][CX]).toBeTruthy();
    expect(after.progress as number).toBeGreaterThan(progressBefore);
    expect((after.players as Record<string, { color: string }>)['painter@test.com']).toBeDefined();
  });

  it('blends the 8 neighbours of a painted cell', async () => {
    player.send({ type: 'GAME_PAINT', x: CX, y: CY });
    const after = await player.waitFor((m) => m.type === 'SYNC_CANVAS' && (m.progress as number) > 0);
    const canvas = after.canvas as (string | null)[][];

    // Center is fully opaque; an empty neighbour becomes a semi-transparent blend.
    expect(canvas[CY][CX]).toMatch(/rgba\(.*1\)$/);
    expect(canvas[CY][CX + 1]).toBeTruthy();
    expect(canvas[CY][CX + 1]).not.toBe(canvas[CY][CX]);
  });

  it('reports cols/rows and config in canvas state', async () => {
    const state = latestSyncCanvas(player)!;
    expect(state.cols).toBe(32);
    expect(state.rows).toBe(18);
    expect((state.config as Record<string, unknown>).mixStrength).toBeDefined();
  });

  it('rejects out-of-bounds paint', async () => {
    const countBefore = player.messages.filter((m) => m.type === 'SYNC_CANVAS').length;
    player.send({ type: 'GAME_PAINT', x: 999, y: 999 });
    player.send({ type: 'GAME_PAINT', x: -1, y: 2 });
    await new Promise((r) => setTimeout(r, 200));
    const countAfter = player.messages.filter((m) => m.type === 'SYNC_CANVAS').length;
    expect(countAfter).toBe(countBefore);
  });

  it('enforces the paint cooldown', async () => {
    presenter.send({ type: 'GAME_CONFIG', config: { cooldownMs: 2000 } });
    await presenter.waitFor((m) => m.type === 'SYNC_CANVAS' && ((m.config as { cooldownMs: number }).cooldownMs) === 2000);

    player.send({ type: 'GAME_PAINT', x: CX, y: CY });
    await player.waitFor((m) => m.type === 'SYNC_CANVAS' && (m.progress as number) > 0);

    const count = player.messages.filter((m) => m.type === 'SYNC_CANVAS').length;
    player.send({ type: 'GAME_PAINT', x: CX + 3, y: CY });
    await new Promise((r) => setTimeout(r, 250));
    expect(player.messages.filter((m) => m.type === 'SYNC_CANVAS').length).toBe(count);
  });

  it('paints multiple cells via GAME_PAINT_PATH batch', async () => {
    player.send({
      type: 'GAME_PAINT_PATH',
      cells: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 5, y: 1 }],
    });
    const after = await player.waitFor((m) => m.type === 'SYNC_CANVAS' && (m.progress as number) > 0);
    const canvas = after.canvas as (string | null)[][];
    expect(canvas[1][1]).toBeTruthy();
    expect(canvas[1][3]).toBeTruthy();
    expect(canvas[1][5]).toBeTruthy();
  });

  it('resizes the grid and drops out-of-bounds cells on GAME_CONFIG', async () => {
    player.send({ type: 'GAME_PAINT', x: 20, y: 10 });
    await player.waitFor((m) => m.type === 'SYNC_CANVAS' && (m.progress as number) > 0);

    presenter.send({ type: 'GAME_CONFIG', config: { cols: 10, rows: 8 } });
    const resized = await presenter.waitFor((m) => m.type === 'SYNC_CANVAS' && (m.cols as number) === 10);
    expect(resized.cols).toBe(10);
    expect(resized.rows).toBe(8);
    const canvas = resized.canvas as (string | null)[][];
    expect(canvas.length).toBe(8);
    expect(canvas[0].length).toBe(10);
  });

  it('clears the canvas on presenter GAME_RESET', async () => {
    player.send({ type: 'GAME_PAINT', x: CX, y: CY });
    await player.waitFor((m) => m.type === 'SYNC_CANVAS' && (m.progress as number) > 0);

    presenter.send({ type: 'GAME_RESET' });
    const cleared = await presenter.waitFor((m) => m.type === 'SYNC_CANVAS' && (m.progress as number) === 0);
    expect((cleared.canvas as (string | null)[][])[CY][CX]).toBeNull();
  });

  it('spawns a power-up and grants its effect when claimed', async () => {
    presenter.send({ type: 'GAME_CONFIG', config: { powerupIntervalMs: 1000, powerupMax: 5, cooldownMs: 0 } });
    await presenter.waitFor((m) => m.type === 'SYNC_CANVAS' && ((m.config as { powerupIntervalMs: number }).powerupIntervalMs) === 1000);

    player.send({ type: 'GAME_PAINT', x: CX, y: CY });
    const spawned = await player.waitFor(
      (m) => m.type === 'SYNC_CANVAS' && Array.isArray(m.powerups) && (m.powerups as unknown[]).length > 0,
    );
    const pu = (spawned.powerups as { x: number; y: number; kind: string }[])[0];
    expect(pu.kind).toBeTruthy();

    player.send({ type: 'GAME_PAINT', x: pu.x, y: pu.y });
    const claimed = await player.waitFor(
      (m) => m.type === 'SYNC_CANVAS' && Object.keys((m.effects as Record<string, unknown>) ?? {}).length > 0,
    );
    expect((claimed.effects as Record<string, { kind: string }>)['painter@test.com'].kind).toBe(pu.kind);
  });

  it('includes canvas snapshot in WELCOME for late joiners', async () => {
    player.send({ type: 'GAME_PAINT', x: CX, y: CY });
    await player.waitFor((m) => m.type === 'SYNC_CANVAS' && (m.progress as number) > 0);

    const late = await connectRoom({ role: 'participant', email: 'late@test.com', name: 'Late', roomId });
    const welcome = await late.waitFor((m) => m.type === 'WELCOME');
    expect((welcome.canvas as (string | null)[][])[CY][CX]).toBeTruthy();
    expect(welcome.progress as number).toBeGreaterThan(0);
    late.close();
  });
});
