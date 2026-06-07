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

  return {
    matchBoard,
    matchClaimed,
    matchPending,
    matchRevealed,
    matchPaused,
    matchScores,
    matchElementCount,
    gameOver: claimedCount === matchBoard.length,
  };
}

async function handleFlip(player: Player, pos: number, ctx: GameContext): Promise<void> {
  if (pos < 0 || pos >= ELEMENTS.length * 2) return;
  if (ctx.meta.get('match_paused') === 'true') return;

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

  const myPending = [...ctx.sql.exec(`SELECT pos FROM match_pending WHERE player_key = ?`, playerKey)];

  if (myPending.length === 0) {
    const playerReveal = [...ctx.sql.exec(`SELECT pos FROM match_reveal WHERE player_key = ?`, playerKey)];
    if (playerReveal.length > 0) return;
    ctx.sql.exec(`INSERT OR REPLACE INTO match_pending VALUES (?, ?)`, playerKey, pos);
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
      const expiry = Date.now() + 1000;
      ctx.sql.exec(`INSERT OR REPLACE INTO match_reveal VALUES (?, ?, ?, ?)`, pos, playerColor, expiry, playerKey);
      ctx.sql.exec(`INSERT OR REPLACE INTO match_reveal VALUES (?, ?, ?, ?)`, firstPos, playerColor, expiry, playerKey);
      const earliest = [...ctx.sql.exec(`SELECT MIN(expiry_ms) as t FROM match_reveal`)][0].t as number;
      await ctx.scheduleAlarm(earliest);
    }
  }

  ctx.broadcast({ type: 'SYNC_MATCH', ...buildMatchState(ctx) });
}

export const periodicMatchEngine: GameEngine<MatchState> = {
  id: 'periodic-match',
  config: { maxAgentsPerOwner: 1 },
  inboundTypes: ['MATCH_FLIP', 'MATCH_PAUSE', 'MATCH_RESET', 'MATCH_SET_SIZE'],

  initSchema(ctx) {
    ctx.sql.exec(`
      CREATE TABLE IF NOT EXISTS match_board (
        pos INTEGER PRIMARY KEY, symbol TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS match_claimed (
        pos INTEGER PRIMARY KEY, player_key TEXT NOT NULL, color TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS match_pending (
        player_key TEXT PRIMARY KEY, pos INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS match_reveal (
        pos INTEGER PRIMARY KEY, color TEXT NOT NULL, expiry_ms INTEGER NOT NULL, player_key TEXT NOT NULL DEFAULT ''
      );
    `);
    try {
      ctx.sql.exec(`ALTER TABLE match_reveal ADD COLUMN player_key TEXT NOT NULL DEFAULT ''`);
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
      ctx.sql.exec(`DELETE FROM meta WHERE key = 'match_paused'`);
      initMatchBoard(ctx);
      ctx.broadcast({ type: 'SYNC_MATCH', ...buildMatchState(ctx) });
      return;
    }
    if (msg.type === 'MATCH_SET_SIZE') {
      const count = Math.min(Math.max(5, Math.floor(msg.count as number)), ELEMENTS.length);
      ctx.meta.set('match_element_count', String(count));
      ctx.broadcast({ type: 'SYNC_MATCH', ...buildMatchState(ctx) });
    }
  },

  buildState(ctx) {
    return buildMatchState(ctx);
  },

  onAlarm(ctx) {
    const now = Date.now();
    ctx.sql.exec(`DELETE FROM match_reveal WHERE expiry_ms <= ?`, now);
    ctx.broadcast({ type: 'SYNC_MATCH', ...buildMatchState(ctx) });
    const rows = [...ctx.sql.exec(`SELECT MIN(expiry_ms) as t FROM match_reveal`)];
    const next = rows[0]?.t as number | null;
    if (next) return ctx.scheduleAlarm(next);
  },
};

export function clearMatchPendingForPlayer(ctx: GameContext, playerKey: string): void {
  ctx.sql.exec(`DELETE FROM match_pending WHERE player_key = ?`, playerKey);
}
