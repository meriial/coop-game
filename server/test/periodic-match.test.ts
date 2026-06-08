import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runDurableObjectAlarm } from 'cloudflare:test';
import {
  connectRoom,
  findMatchingPair,
  findMismatchPair,
  getPresentationRoomStub,
  joinGame,
  latestSyncMatch,
} from './helpers/ws';

describe('periodic-match game', () => {
  let roomId: string;
  let presenter: Awaited<ReturnType<typeof connectRoom>>;
  let player1: Awaited<ReturnType<typeof connectRoom>>;
  let player2: Awaited<ReturnType<typeof connectRoom>>;

  beforeEach(async () => {
    roomId = `match-${crypto.randomUUID()}`;
    presenter = await connectRoom({ role: 'presenter', email: 'admin@test.com', name: 'Admin', roomId });
    await presenter.waitFor((m) => m.type === 'WELCOME');
    player1 = await connectRoom({ role: 'participant', email: 'alice@test.com', name: 'Alice', roomId });
    await player1.waitFor((m) => m.type === 'WELCOME');
    player2 = await connectRoom({ role: 'participant', email: 'bob@test.com', name: 'Bob', roomId });
    await player2.waitFor((m) => m.type === 'WELCOME');
    await joinGame(player1, 'Alice');
    await joinGame(player2, 'Bob');
  });

  it('claims matching tiles in flipper color and increments score', async () => {
    const state = latestSyncMatch(player1)!;
    const board = state.matchBoard as string[];
    const pair = findMatchingPair(board);
    expect(pair).not.toBeNull();

    const [a, b] = pair!;
    const beforeScores = (state.matchScores as { id: string; count: number }[]).find((s) => s.id === 'alice@test.com');

    player1.send({ type: 'MATCH_FLIP', pos: a });
    await player1.waitFor((m) => m.type === 'SYNC_MATCH' && (m.matchPending as Record<string, string>)[String(a)] !== undefined);

    player1.send({ type: 'MATCH_FLIP', pos: b });
    const after = await player1.waitFor(
      (m) => m.type === 'SYNC_MATCH' && (m.matchClaimed as (string | null)[])[a] !== null,
    );

    const claimed = after.matchClaimed as (string | null)[];
    expect(claimed[a]).toBeTruthy();
    expect(claimed[b]).toBeTruthy();
    expect(claimed[a]).toBe(claimed[b]);

    const aliceScore = (after.matchScores as { id: string; count: number }[]).find((s) => s.id === 'alice@test.com');
    expect(aliceScore?.count).toBe((beforeScores?.count ?? 0) + 1);
  });

  it('reveals mismatched tiles then hides them after alarm', async () => {
    const state = latestSyncMatch(player1)!;
    const board = state.matchBoard as string[];
    const pair = findMismatchPair(board);
    expect(pair).not.toBeNull();

    const [a, b] = pair!;
    player1.send({ type: 'MATCH_FLIP', pos: a });
    await player1.waitFor((m) => m.type === 'SYNC_MATCH' && Object.keys(m.matchPending as object).length > 0);

    player1.send({ type: 'MATCH_FLIP', pos: b });
    const revealed = await player1.waitFor(
      (m) => m.type === 'SYNC_MATCH' && Object.keys(m.matchRevealed as object).length >= 2,
    );
    expect((revealed.matchRevealed as Record<string, string>)[String(a)]).toBeTruthy();
    expect((revealed.matchRevealed as Record<string, string>)[String(b)]).toBeTruthy();

    const stub = getPresentationRoomStub(roomId);
    const ran = await runDurableObjectAlarm(stub);
    expect(ran).toBe(true);

    await player1.waitFor(
      (m) => m.type === 'SYNC_MATCH' && Object.keys(m.matchRevealed as object).length === 0,
    );
  });

  it('auto-unflips a lone pending tile once the camp timeout elapses', async () => {
    const pos = 0;

    player1.send({ type: 'MATCH_FLIP', pos });
    const flipped = await player1.waitFor(
      (m) => m.type === 'SYNC_MATCH' && (m.matchPending as Record<string, string>)[String(pos)] !== undefined,
    );
    expect(flipped.matchPendingTimeoutMs).toBe(5000); // default camp timeout

    // Mock the clock past the camp deadline, then fire the scheduled alarm.
    // setSystemTime propagates into the durable object, so the alarm sees the
    // tile as expired without any real waiting.
    const deadline = Date.now() + 5000 + 500;
    vi.useFakeTimers();
    vi.setSystemTime(deadline);
    const stub = getPresentationRoomStub(roomId);
    const ran = await runDurableObjectAlarm(stub);
    vi.useRealTimers();
    expect(ran).toBe(true);

    const cleared = latestSyncMatch(player1)!;
    expect(Object.keys(cleared.matchPending as object)).toHaveLength(0);
    // The tile is neither claimed nor revealed, so it is flippable again.
    expect((cleared.matchClaimed as (string | null)[])[pos]).toBeNull();
    expect((cleared.matchRevealed as Record<string, string>)[String(pos)]).toBeUndefined();
  });

  it('respects the presenter-configured timeout when auto-unflipping', async () => {
    presenter.send({ type: 'MATCH_SET_TIMEOUT', seconds: 2 });
    await presenter.waitFor((m) => m.type === 'SYNC_MATCH' && m.matchPendingTimeoutMs === 2000);

    const pos = 0;
    const flipAt = Date.now();
    player1.send({ type: 'MATCH_FLIP', pos });
    await player1.waitFor(
      (m) => m.type === 'SYNC_MATCH' && (m.matchPending as Record<string, string>)[String(pos)] !== undefined,
    );

    const stub = getPresentationRoomStub(roomId);

    // Before the 2s deadline: even when the alarm fires, the tile stays flipped.
    vi.useFakeTimers();
    vi.setSystemTime(flipAt + 1000);
    await runDurableObjectAlarm(stub);
    vi.useRealTimers();
    expect((latestSyncMatch(player1)!.matchPending as Record<string, string>)[String(pos)]).toBeDefined();

    // After the 2s deadline: the tile auto-unflips.
    vi.useFakeTimers();
    vi.setSystemTime(flipAt + 2500);
    await runDurableObjectAlarm(stub);
    vi.useRealTimers();
    expect((latestSyncMatch(player1)!.matchPending as Record<string, string>)[String(pos)]).toBeUndefined();
  });

  it('does not auto-unflip a tile that was matched within the timeout window', async () => {
    const state = latestSyncMatch(player1)!;
    const board = state.matchBoard as string[];
    const [a, b] = findMatchingPair(board)!;

    player1.send({ type: 'MATCH_FLIP', pos: a });
    await player1.waitFor(
      (m) => m.type === 'SYNC_MATCH' && (m.matchPending as Record<string, string>)[String(a)] !== undefined,
    );
    player1.send({ type: 'MATCH_FLIP', pos: b });
    await player1.waitFor((m) => m.type === 'SYNC_MATCH' && (m.matchClaimed as (string | null)[])[a] !== null);

    // A stale camp-timeout alarm from the first flip may still fire; it must not
    // disturb the already-claimed pair.
    const stub = getPresentationRoomStub(roomId);
    await runDurableObjectAlarm(stub);

    const sync = latestSyncMatch(player1)!;
    expect((sync.matchClaimed as (string | null)[])[a]).toBeTruthy();
    expect((sync.matchClaimed as (string | null)[])[b]).toBeTruthy();
  });

  it('lets the presenter configure the camp-unflip timeout but blocks participants', async () => {
    const initial = latestSyncMatch(player1)!;
    expect(initial.matchPendingTimeoutMs).toBe(5000);

    presenter.send({ type: 'MATCH_SET_TIMEOUT', seconds: 10 });
    const updated = await presenter.waitFor(
      (m) => m.type === 'SYNC_MATCH' && m.matchPendingTimeoutMs === 10000,
    );
    expect(updated.matchPendingTimeoutMs).toBe(10000);

    player1.send({ type: 'MATCH_SET_TIMEOUT', seconds: 30 });
    await new Promise((r) => setTimeout(r, 200));
    expect(latestSyncMatch(player1)!.matchPendingTimeoutMs).toBe(10000);
  });

  it('blocks a second player from flipping a tile already pending', async () => {
    const state = latestSyncMatch(player1)!;
    const board = state.matchBoard as string[];
    const pos = 0;

    player1.send({ type: 'MATCH_FLIP', pos });
    await player1.waitFor((m) => m.type === 'SYNC_MATCH' && (m.matchPending as Record<string, string>)[String(pos)] !== undefined);

    const countBefore = player2.messages.filter((m) => m.type === 'SYNC_MATCH').length;
    player2.send({ type: 'MATCH_FLIP', pos });
    await new Promise((r) => setTimeout(r, 200));
    const countAfter = player2.messages.filter((m) => m.type === 'SYNC_MATCH').length;
    expect(countAfter).toBe(countBefore);
  });

  it('lets presenter pause, reset, and resize the board', async () => {
    presenter.send({ type: 'MATCH_PAUSE' });
    const paused = await presenter.waitFor((m) => m.type === 'SYNC_MATCH' && m.matchPaused === true);
    expect(paused.matchPaused).toBe(true);

    presenter.send({ type: 'MATCH_SET_SIZE', count: 8 });
    const sized = await presenter.waitFor((m) => m.type === 'SYNC_MATCH' && m.matchElementCount === 8);
    expect(sized.matchElementCount).toBe(8);

    presenter.send({ type: 'MATCH_RESET' });
    const reset = await presenter.waitFor(
      (m) => m.type === 'SYNC_MATCH' && (m.matchBoard as string[]).length === 16,
    );
    expect(reset.matchPaused).toBe(false);
    expect(reset.matchElementCount).toBe(8);
  });

  it('denies participant presenter-only match controls', async () => {
    const before = latestSyncMatch(player1)!;

    player1.send({ type: 'MATCH_PAUSE' });
    player1.send({ type: 'MATCH_RESET' });
    player1.send({ type: 'MATCH_SET_SIZE', count: 10 });
    await new Promise((r) => setTimeout(r, 300));

    const after = latestSyncMatch(player1)!;
    expect(after.matchPaused).toBe(before.matchPaused);
    expect(after.matchElementCount).toBe(before.matchElementCount);
    expect((after.matchBoard as string[]).length).toBe((before.matchBoard as string[]).length);
  });

  it('includes full match state in WELCOME for late joiners', async () => {
    presenter.send({ type: 'MATCH_SET_SIZE', count: 6 });
    await presenter.waitFor((m) => m.type === 'SYNC_MATCH' && m.matchElementCount === 6);
    presenter.send({ type: 'MATCH_RESET' });
    await presenter.waitFor((m) => m.type === 'SYNC_MATCH' && (m.matchBoard as string[]).length === 12);

    const late = await connectRoom({ role: 'participant', email: 'carol@test.com', name: 'Carol', roomId });
    const welcome = await late.waitFor((m) => m.type === 'WELCOME');
    expect(welcome.matchElementCount).toBe(6);
    expect((welcome.matchBoard as string[]).length).toBe(12);
    expect(welcome.matchScores).toBeDefined();
    late.close();
  });

  it('reports game over when all pairs are claimed', async () => {
    presenter.send({ type: 'MATCH_SET_SIZE', count: 5 });
    await player1.waitFor((m) => m.type === 'SYNC_MATCH' && m.matchElementCount === 5, 10_000);
    presenter.send({ type: 'MATCH_RESET' });
    await player1.waitFor((m) => m.type === 'SYNC_MATCH' && (m.matchBoard as string[]).length === 10, 10_000);

    let sync = latestSyncMatch(player1)!;
    for (let round = 0; round < 10 && !sync.gameOver; round++) {
      const board = sync.matchBoard as string[];
      const claimed = sync.matchClaimed as (string | null)[];
      let pair: [number, number] | null = null;
      const bySymbol = new Map<string, number[]>();
      for (let i = 0; i < board.length; i++) {
        if (claimed[i]) continue;
        const sym = board[i];
        if (!bySymbol.has(sym)) bySymbol.set(sym, []);
        bySymbol.get(sym)!.push(i);
      }
      for (const positions of bySymbol.values()) {
        if (positions.length >= 2) {
          pair = [positions[0], positions[1]];
          break;
        }
      }
      expect(pair).not.toBeNull();
      const [a, b] = pair!;
      player1.send({ type: 'MATCH_FLIP', pos: a });
      await player1.waitFor((m) => m.type === 'SYNC_MATCH', 10_000);
      player1.send({ type: 'MATCH_FLIP', pos: b });
      sync = await player1.waitFor((m) => m.type === 'SYNC_MATCH', 10_000);
    }
    expect(sync.gameOver).toBe(true);
  }, 60_000);
});
