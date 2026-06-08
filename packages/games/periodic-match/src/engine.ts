import type { GameContext, GameEngine } from '@workshop/game-core/server';
import type { MatchState, Player } from '@workshop/protocol';

const ELEMENTS = [
  'H',  'He',
  'Li', 'Be', 'B',  'C',  'N',  'O',  'F',  'Ne',
  'Na', 'Mg', 'Al', 'Si', 'P',  'S',  'Cl', 'Ar',
  'K',  'Ca', 'Sc', 'Ti', 'V',  'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr',
  'Rb', 'Sr', 'Y',  'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I',  'Xe',
  'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu',
  'Hf', 'Ta', 'W',  'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn',
  'Fr', 'Ra', 'Ac', 'Th', 'Pa', 'U',  'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm', 'Md', 'No', 'Lr',
  'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds', 'Rg', 'Cn', 'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og',
];

const DEFAULT_PENDING_TIMEOUT_MS = 5000;
const MIN_PENDING_TIMEOUT_SEC = 1;
const MAX_PENDING_TIMEOUT_SEC = 60;
const REVEAL_DURATION_MS = 1000;

const DEFAULT_ACTIVE_WINDOW_MS = 30_000;
const MIN_ACTIVE_WINDOW_SEC = 5;
const MAX_ACTIVE_WINDOW_SEC = 120;
// Catch-up cooldown bounds (ms).
const CATCHUP_MIN_COOLDOWN_MS = 1_000;
const CATCHUP_MAX_COOLDOWN_MS = 5_000;

function getPendingTimeoutMs(ctx: GameContext): number {
  const raw = ctx.meta.get('match_pending_timeout_ms');
  if (!raw) return DEFAULT_PENDING_TIMEOUT_MS;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_PENDING_TIMEOUT_MS;
}

function getActiveWindowMs(ctx: GameContext): number {
  const raw = ctx.meta.get('match_catchup_active_window_ms');
  if (!raw) return DEFAULT_ACTIVE_WINDOW_MS;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_ACTIVE_WINDOW_MS;
}

// Returns the catch-up cooldown for a single player given all active players' pair counts.
// All active players receive a cooldown proportional to their advantage over last-place.
// The max cooldown scales with the actual spread (1s per pair gap, capped at 5s),
// so players who are all close together get small cooldowns.
function catchupCooldownMs(myPairs: number, activePairs: number[]): number {
  if (activePairs.length < 2) return 0;
  const lowestPairs = Math.min(...activePairs);
  const leaderPairs = Math.max(...activePairs);
  const spread = leaderPairs - lowestPairs;
  if (spread === 0) return 0;
  const scaledMax = Math.min(CATCHUP_MAX_COOLDOWN_MS, Math.max(CATCHUP_MIN_COOLDOWN_MS, spread * 1_000));
  const normPos = (myPairs - lowestPairs) / spread;
  return Math.round(CATCHUP_MIN_COOLDOWN_MS + normPos * (scaledMax - CATCHUP_MIN_COOLDOWN_MS));
}

// Reschedules the durable-object alarm to the earliest expiry across pending tiles,
// mismatched reveals, and catch-up cooldowns.
async function scheduleNextAlarm(ctx: GameContext): Promise<void> {
  const rows = [...ctx.sql.exec(`
    SELECT MIN(t) as next FROM (
      SELECT MIN(expiry_ms) as t FROM match_pending
      UNION ALL
      SELECT MIN(expiry_ms) as t FROM match_reveal
      UNION ALL
      SELECT MIN(cooldown_until_ms) as t FROM match_cooldown
    )
  `)];
  const next = rows[0]?.next as number | null;
  if (next) await ctx.scheduleAlarm(next);
}

function initMatchBoard(ctx: GameContext): void {
  const countRaw = ctx.meta.get('match_element_count');
  const count = countRaw
    ? Math.min(Math.max(5, parseInt(countRaw, 10)), ELEMENTS.length)
    : ELEMENTS.length;
  const elements = ELEMENTS.slice(0, count);
  const deck = [...elements, ...elements];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  ctx.sql.exec(`DELETE FROM match_board`);
  ctx.sql.exec(`DELETE FROM match_reveal`);
  for (let i = 0; i < deck.length; i++) {
    ctx.sql.exec(`INSERT INTO match_board VALUES (?, ?)`, i, deck[i]);
  }
}

function buildMatchState(ctx: GameContext): MatchState {
  const boardRows = [...ctx.sql.exec(`SELECT symbol FROM match_board ORDER BY pos`)];
  const matchBoard = boardRows.map((r) => r.symbol as string);

  const claimedRows = [...ctx.sql.exec(`SELECT pos, color FROM match_claimed`)];
  const matchClaimed: (string | null)[] = Array(matchBoard.length).fill(null);
  for (const row of claimedRows) {
    matchClaimed[row.pos as number] = row.color as string;
  }
  const claimedCount = claimedRows.length;

  const pendingRows = [...ctx.sql.exec(`
    SELECT mp.pos, COALESCE(p.color, '#64748b') as color
    FROM match_pending mp
    LEFT JOIN players p ON p.id = mp.player_key
  `)];
  const matchPending: Record<string, string> = {};
  for (const row of pendingRows) {
    matchPending[String(row.pos as number)] = row.color as string;
  }

  const revealRows = [...ctx.sql.exec(`SELECT pos, color FROM match_reveal`)];
  const matchRevealed: Record<string, string> = {};
  for (const row of revealRows) {
    matchRevealed[String(row.pos as number)] = row.color as string;
  }

  const matchPaused = ctx.meta.get('match_paused') === 'true';

  const countRaw = ctx.meta.get('match_element_count');
  const matchElementCount = countRaw
    ? Math.min(Math.max(5, parseInt(countRaw, 10)), ELEMENTS.length)
    : ELEMENTS.length;

  const scoreRows = [...ctx.sql.exec(`
    SELECT p.id, p.name, p.color, COUNT(mc.pos) as cnt
    FROM players p
    LEFT JOIN match_claimed mc ON mc.player_key = p.id
    GROUP BY p.id
    ORDER BY cnt DESC
  `)];
  const matchScores = scoreRows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    color: r.color as string,
    count: Math.floor((r.cnt as number) / 2),
  }));

  const catchUpEnabled = ctx.meta.get('match_catchup_enabled') === 'true';
  const showCooldown = ctx.meta.get('match_show_cooldown') === 'true';

  const matchCooldowns: Record<string, number> = {};
  for (const row of ctx.sql.exec(`SELECT player_key, cooldown_until_ms FROM match_cooldown`)) {
    matchCooldowns[row.player_key as string] = row.cooldown_until_ms as number;
  }

  return {
    matchBoard,
    matchClaimed,
    matchPending,
    matchRevealed,
    matchPaused,
    matchScores,
    matchElementCount,
    matchPendingTimeoutMs: getPendingTimeoutMs(ctx),
    gameOver: claimedCount === matchBoard.length,
    catchUpEnabled,
    showCooldown,
    matchCooldowns,
    catchupActiveWindowMs: getActiveWindowMs(ctx),
  };
}

async function handleFlip(player: Player, pos: number, ctx: GameContext): Promise<void> {
  if (pos < 0 || pos >= ELEMENTS.length * 2) return;
  if (ctx.meta.get('match_paused') === 'true') return;

  // Enforce catch-up cooldown before any flip.
  const now = Date.now();
  const cooldownRow = [...ctx.sql.exec(`SELECT cooldown_until_ms FROM match_cooldown WHERE player_key = ?`, player.id)];
  if (cooldownRow.length > 0 && (cooldownRow[0].cooldown_until_ms as number) > now) return;

  const claimedAt = [...ctx.sql.exec(`SELECT pos FROM match_claimed WHERE pos = ?`, pos)];
  if (claimedAt.length > 0) return;

  const pendingAt = [...ctx.sql.exec(`SELECT player_key FROM match_pending WHERE pos = ?`, pos)];
  if (pendingAt.length > 0) return;

  const revealedAt = [...ctx.sql.exec(`SELECT pos FROM match_reveal WHERE pos = ?`, pos)];
  if (revealedAt.length > 0) return;

  const playerKey = player.id;
  const playerRow = [...ctx.sql.exec(`SELECT color FROM players WHERE id = ?`, playerKey)];
  if (playerRow.length === 0) return;
  const playerColor = playerRow[0].color as string;

  const symbolRow = [...ctx.sql.exec(`SELECT symbol FROM match_board WHERE pos = ?`, pos)];
  if (symbolRow.length === 0) return;
  const symbol = symbolRow[0].symbol as string;

  // Record activity for catch-up window tracking.
  ctx.sql.exec(`INSERT OR REPLACE INTO match_activity (player_key, last_flip_ms) VALUES (?, ?)`, playerKey, now);

  const myPending = [...ctx.sql.exec(`SELECT pos FROM match_pending WHERE player_key = ?`, playerKey)];

  if (myPending.length === 0) {
    const playerReveal = [...ctx.sql.exec(`SELECT pos FROM match_reveal WHERE player_key = ?`, playerKey)];
    if (playerReveal.length > 0) return;
    // A lone flipped tile auto-unflips after the camp timeout so players cannot
    // sit on a revealed tile indefinitely.
    const expiry = now + getPendingTimeoutMs(ctx);
    ctx.sql.exec(`INSERT OR REPLACE INTO match_pending VALUES (?, ?, ?)`, playerKey, pos, expiry);
    await scheduleNextAlarm(ctx);
  } else {
    const firstPos = myPending[0].pos as number;
    if (firstPos === pos) return;

    const firstRow = [...ctx.sql.exec(`SELECT symbol FROM match_board WHERE pos = ?`, firstPos)];
    const firstSymbol = firstRow.length > 0 ? (firstRow[0].symbol as string) : '';
    ctx.sql.exec(`DELETE FROM match_pending WHERE player_key = ?`, playerKey);

    if (symbol === firstSymbol) {
      ctx.sql.exec(`INSERT OR REPLACE INTO match_claimed VALUES (?, ?, ?)`, pos, playerKey, playerColor);
      ctx.sql.exec(`INSERT OR REPLACE INTO match_claimed VALUES (?, ?, ?)`, firstPos, playerKey, playerColor);
    } else {
      const expiry = now + REVEAL_DURATION_MS;
      ctx.sql.exec(`INSERT OR REPLACE INTO match_reveal VALUES (?, ?, ?, ?)`, pos, playerColor, expiry, playerKey);
      ctx.sql.exec(`INSERT OR REPLACE INTO match_reveal VALUES (?, ?, ?, ?)`, firstPos, playerColor, expiry, playerKey);
    }

    // Apply catch-up cooldowns to ALL active players after each completed pair attempt.
    if (ctx.meta.get('match_catchup_enabled') === 'true') {
      const activeWindow = now - getActiveWindowMs(ctx);
      const activeRows = [...ctx.sql.exec(`
        SELECT p.id, COUNT(mc.pos) as cnt
        FROM players p
        INNER JOIN match_activity a ON a.player_key = p.id AND a.last_flip_ms > ?
        LEFT JOIN match_claimed mc ON mc.player_key = p.id
        GROUP BY p.id
      `, activeWindow)];
      const activePairs = activeRows.map((r) => Math.floor((r.cnt as number) / 2));
      for (const row of activeRows) {
        const pPairs = Math.floor((row.cnt as number) / 2);
        const cooldown = catchupCooldownMs(pPairs, activePairs);
        if (cooldown > 0) {
          ctx.sql.exec(
            `INSERT OR REPLACE INTO match_cooldown (player_key, cooldown_until_ms) VALUES (?, ?)`,
            row.id, now + cooldown,
          );
        }
      }
    }

    await scheduleNextAlarm(ctx);
  }

  ctx.broadcast({ type: 'SYNC_MATCH', ...buildMatchState(ctx) });
}

export const periodicMatchEngine: GameEngine<MatchState> = {
  id: 'periodic-match',
  config: { maxAgentsPerOwner: 1 },
  inboundTypes: [
    'MATCH_FLIP', 'MATCH_PAUSE', 'MATCH_RESET', 'MATCH_SET_SIZE', 'MATCH_SET_TIMEOUT',
    'MATCH_SET_CATCHUP', 'MATCH_SET_SHOW_COOLDOWN', 'MATCH_SET_ACTIVE_WINDOW',
    'MATCH_CLEAR_LEADERBOARD',
  ],

  initSchema(ctx) {
    ctx.sql.exec(`
      CREATE TABLE IF NOT EXISTS match_board (
        pos INTEGER PRIMARY KEY, symbol TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS match_claimed (
        pos INTEGER PRIMARY KEY, player_key TEXT NOT NULL, color TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS match_pending (
        player_key TEXT PRIMARY KEY, pos INTEGER NOT NULL, expiry_ms INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS match_reveal (
        pos INTEGER PRIMARY KEY, color TEXT NOT NULL, expiry_ms INTEGER NOT NULL, player_key TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS match_activity (
        player_key TEXT PRIMARY KEY, last_flip_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS match_cooldown (
        player_key TEXT PRIMARY KEY, cooldown_until_ms INTEGER NOT NULL
      );
    `);
    try {
      ctx.sql.exec(`ALTER TABLE match_reveal ADD COLUMN player_key TEXT NOT NULL DEFAULT ''`);
    } catch {
      /* already exists */
    }
    try {
      ctx.sql.exec(`ALTER TABLE match_pending ADD COLUMN expiry_ms INTEGER NOT NULL DEFAULT 0`);
    } catch {
      /* already exists */
    }
    const cnt = [...ctx.sql.exec('SELECT COUNT(*) as cnt FROM match_board')][0].cnt as number;
    if (cnt === 0) initMatchBoard(ctx);
  },

  async handleMessage(player, msg, ctx) {
    if (msg.type === 'MATCH_FLIP') {
      const pos = typeof msg.pos === 'number' ? Math.floor(msg.pos) : -1;
      await handleFlip(player, pos, ctx);
      return;
    }
    if (msg.type === 'MATCH_PAUSE') {
      const currentlyPaused = ctx.meta.get('match_paused') === 'true';
      ctx.meta.set('match_paused', currentlyPaused ? 'false' : 'true');
      ctx.broadcast({ type: 'SYNC_MATCH', ...buildMatchState(ctx) });
      return;
    }
    if (msg.type === 'MATCH_RESET') {
      ctx.sql.exec(`DELETE FROM match_claimed`);
      ctx.sql.exec(`DELETE FROM match_pending`);
      ctx.sql.exec(`DELETE FROM match_reveal`);
      ctx.sql.exec(`DELETE FROM match_activity`);
      ctx.sql.exec(`DELETE FROM match_cooldown`);
      ctx.sql.exec(`DELETE FROM meta WHERE key = 'match_paused'`);
      initMatchBoard(ctx);
      ctx.broadcast({ type: 'SYNC_MATCH', ...buildMatchState(ctx) });
      return;
    }
    if (msg.type === 'MATCH_SET_SIZE') {
      const count = Math.min(Math.max(5, Math.floor(msg.count as number)), ELEMENTS.length);
      ctx.meta.set('match_element_count', String(count));
      ctx.broadcast({ type: 'SYNC_MATCH', ...buildMatchState(ctx) });
      return;
    }
    if (msg.type === 'MATCH_SET_TIMEOUT') {
      const seconds = Math.min(
        Math.max(MIN_PENDING_TIMEOUT_SEC, Math.round(msg.seconds as number)),
        MAX_PENDING_TIMEOUT_SEC,
      );
      ctx.meta.set('match_pending_timeout_ms', String(seconds * 1000));
      ctx.broadcast({ type: 'SYNC_MATCH', ...buildMatchState(ctx) });
      return;
    }
    if (msg.type === 'MATCH_SET_CATCHUP') {
      ctx.meta.set('match_catchup_enabled', msg.enabled ? 'true' : 'false');
      ctx.broadcast({ type: 'SYNC_MATCH', ...buildMatchState(ctx) });
      return;
    }
    if (msg.type === 'MATCH_SET_SHOW_COOLDOWN') {
      ctx.meta.set('match_show_cooldown', msg.enabled ? 'true' : 'false');
      ctx.broadcast({ type: 'SYNC_MATCH', ...buildMatchState(ctx) });
      return;
    }
    if (msg.type === 'MATCH_SET_ACTIVE_WINDOW') {
      const seconds = Math.min(MAX_ACTIVE_WINDOW_SEC, Math.max(MIN_ACTIVE_WINDOW_SEC, Math.round(msg.seconds as number)));
      ctx.meta.set('match_catchup_active_window_ms', String(seconds * 1000));
      ctx.broadcast({ type: 'SYNC_MATCH', ...buildMatchState(ctx) });
    }
    if (msg.type === 'MATCH_CLEAR_LEADERBOARD') {
      ctx.sql.exec(`DELETE FROM players`);
      ctx.sql.exec(`DELETE FROM match_claimed`);
      ctx.sql.exec(`DELETE FROM match_pending`);
      ctx.sql.exec(`DELETE FROM match_reveal`);
      ctx.sql.exec(`DELETE FROM match_activity`);
      ctx.sql.exec(`DELETE FROM match_cooldown`);
      ctx.broadcast({ type: 'SYNC_MATCH', ...buildMatchState(ctx) });
    }
  },

  buildState(ctx) {
    return buildMatchState(ctx);
  },

  async onAlarm(ctx) {
    const now = Date.now();
    ctx.sql.exec(`DELETE FROM match_reveal WHERE expiry_ms <= ?`, now);
    ctx.sql.exec(`DELETE FROM match_pending WHERE expiry_ms <= ?`, now);
    ctx.sql.exec(`DELETE FROM match_cooldown WHERE cooldown_until_ms <= ?`, now);
    ctx.broadcast({ type: 'SYNC_MATCH', ...buildMatchState(ctx) });
    await scheduleNextAlarm(ctx);
  },
};

export function clearMatchPendingForPlayer(ctx: GameContext, playerKey: string): void {
  ctx.sql.exec(`DELETE FROM match_pending WHERE player_key = ?`, playerKey);
}
