import type { GameContext, GameEngine } from '@workshop/game-core/server';
import type { Player } from '@workshop/protocol';
import type { KPDocType, KPPhase, KPState, KPStation } from './types';

const GAME_DURATION_MS = 180_000; // 3 minutes
const DOC_EXPIRY_MS = 50_000;     // 50 seconds per document
const DOC_INTERVAL_MS = 9_000;    // new doc every 9 seconds
const MAX_ACTIVE_DOCS = 5;
const DELIVER_POINTS = 10;

const DOC_TYPES: KPDocType[] = ['proclamation', 'bill', 'gazette', 'patent'];

// ── Meta helpers ─────────────────────────────────────────────────────────────

function getMeta(ctx: GameContext, key: string, fallback = '0'): string {
  return ctx.meta.get(`kp_${key}`) ?? fallback;
}
function setMeta(ctx: GameContext, key: string, val: string) {
  ctx.meta.set(`kp_${key}`, val);
}
function getInt(ctx: GameContext, key: string, fallback = 0): number {
  return parseInt(getMeta(ctx, key, String(fallback)), 10);
}

function getPhase(ctx: GameContext): KPPhase {
  return (getMeta(ctx, 'phase', 'waiting')) as KPPhase;
}

function timeRemaining(ctx: GameContext): number {
  const phase = getPhase(ctx);
  if (phase === 'waiting') return GAME_DURATION_MS / 1000;
  if (phase === 'finished') return 0;
  const startedAt = getInt(ctx, 'started_at');
  const elapsed = Date.now() - startedAt;
  return Math.max(0, Math.ceil((GAME_DURATION_MS - elapsed) / 1000));
}

function nextDocId(ctx: GameContext): string {
  const n = getInt(ctx, 'next_doc_id') + 1;
  setMeta(ctx, 'next_doc_id', String(n));
  return String(n);
}

function spawnDoc(ctx: GameContext): void {
  const id = nextDocId(ctx);
  const docType = DOC_TYPES[Math.floor(Math.random() * DOC_TYPES.length)];
  const now = Date.now();
  ctx.sql.exec(
    `INSERT INTO kp_documents (id, doc_type, step, holder_id, expires_at, created_at)
     VALUES (?, ?, 0, NULL, ?, ?)`,
    id, docType, now + DOC_EXPIRY_MS, now,
  );
}

// ── State builder ────────────────────────────────────────────────────────────

function buildKPState(ctx: GameContext): KPState {
  const docs = [...ctx.sql.exec(
    `SELECT id, doc_type, step, holder_id, expires_at FROM kp_documents WHERE step < 3`,
  )];
  const kpRows = [...ctx.sql.exec(
    `SELECT player_key, station, holding_id, score FROM kp_players`,
  )];
  const allPlayers = ctx.players();
  const playerMap = new Map(allPlayers.map((p) => [p.id, p]));

  return {
    kpPhase: getPhase(ctx),
    kpScore: getInt(ctx, 'score'),
    kpFailed: getInt(ctx, 'failed'),
    kpTimeRemaining: timeRemaining(ctx),
    kpDocuments: docs.map((d) => ({
      id: d.id as string,
      docType: d.doc_type as KPDocType,
      step: d.step as number,
      holderId: d.holder_id as string | null,
      expiresAt: d.expires_at as number,
    })),
    kpPlayers: kpRows.map((r) => {
      const info = playerMap.get(r.player_key as string);
      return {
        playerKey: r.player_key as string,
        name: info?.name ?? (r.player_key as string),
        color: info?.color ?? '#888',
        station: (r.station as KPStation | null),
        holdingId: r.holding_id as string | null,
        score: r.score as number,
      };
    }),
  };
}

function syncKP(ctx: GameContext): void {
  ctx.broadcast({ type: 'SYNC_KP', ...buildKPState(ctx) });
}

// ── Handlers ─────────────────────────────────────────────────────────────────

function handleStart(ctx: GameContext): void {
  if (getPhase(ctx) !== 'waiting') return;
  const now = Date.now();
  setMeta(ctx, 'phase', 'playing');
  setMeta(ctx, 'started_at', String(now));
  setMeta(ctx, 'score', '0');
  setMeta(ctx, 'failed', '0');
  setMeta(ctx, 'next_doc_at', String(now + DOC_INTERVAL_MS));
  ctx.sql.exec(`DELETE FROM kp_documents`);
  ctx.sql.exec(`UPDATE kp_players SET station = NULL, holding_id = NULL, score = 0`);
  spawnDoc(ctx);
  spawnDoc(ctx);
  void ctx.scheduleAlarm(now + 1000);
  syncKP(ctx);
}

function handleReset(ctx: GameContext): void {
  setMeta(ctx, 'phase', 'waiting');
  setMeta(ctx, 'score', '0');
  setMeta(ctx, 'failed', '0');
  ctx.sql.exec(`DELETE FROM kp_documents`);
  ctx.sql.exec(`UPDATE kp_players SET station = NULL, holding_id = NULL, score = 0`);
  syncKP(ctx);
}

function handleGoto(player: Player, station: KPStation, ctx: GameContext): void {
  if (getPhase(ctx) !== 'playing') return;

  ctx.sql.exec(
    `INSERT OR IGNORE INTO kp_players (player_key, station, holding_id, score) VALUES (?, NULL, NULL, 0)`,
    player.id,
  );

  const [row] = [...ctx.sql.exec(
    `SELECT holding_id FROM kp_players WHERE player_key = ?`, player.id,
  )];
  const holdingId = row ? (row.holding_id as string | null) : null;

  // Always update station
  ctx.sql.exec(`UPDATE kp_players SET station = ? WHERE player_key = ?`, station, player.id);

  if (station === 'queue') {
    if (holdingId !== null) {
      // Drop: release the document (keep its current step)
      ctx.sql.exec(`UPDATE kp_documents SET holder_id = NULL WHERE id = ?`, holdingId);
      ctx.sql.exec(`UPDATE kp_players SET holding_id = NULL WHERE player_key = ?`, player.id);
    } else {
      // Pick up the oldest unclaimed document
      const [avail] = [...ctx.sql.exec(
        `SELECT id FROM kp_documents WHERE holder_id IS NULL AND step < 3
         ORDER BY step ASC, created_at ASC LIMIT 1`,
      )];
      if (avail) {
        ctx.sql.exec(`UPDATE kp_documents SET holder_id = ? WHERE id = ?`, player.id, avail.id);
        ctx.sql.exec(`UPDATE kp_players SET holding_id = ? WHERE player_key = ?`, avail.id as string, player.id);
      }
    }
  } else if (holdingId !== null) {
    // Station action: advance doc step if it's the right station for this step
    const [doc] = [...ctx.sql.exec(
      `SELECT step FROM kp_documents WHERE id = ? AND holder_id = ?`, holdingId, player.id,
    )];
    if (doc) {
      const step = doc.step as number;
      const advances =
        (station === 'typeset' && step === 0) ||
        (station === 'press' && step === 1);

      if (advances) {
        ctx.sql.exec(`UPDATE kp_documents SET step = step + 1 WHERE id = ?`, holdingId);
      } else if (station === 'deliver' && step === 2) {
        // Deliver!
        ctx.sql.exec(`DELETE FROM kp_documents WHERE id = ?`, holdingId);
        setMeta(ctx, 'score', String(getInt(ctx, 'score') + DELIVER_POINTS));
        ctx.sql.exec(
          `UPDATE kp_players SET holding_id = NULL, score = score + 1, station = NULL WHERE player_key = ?`,
          player.id,
        );
      }
    }
  }

  syncKP(ctx);
}

// ── Engine export ─────────────────────────────────────────────────────────────

export const kingsPrinterEngine: GameEngine<KPState> = {
  id: 'kings-printer',
  config: { maxAgentsPerOwner: 0 },
  inboundTypes: ['KP_GOTO', 'KP_START', 'KP_RESET'],

  initSchema(ctx) {
    ctx.sql.exec(`
      CREATE TABLE IF NOT EXISTS kp_documents (
        id TEXT PRIMARY KEY,
        doc_type TEXT NOT NULL,
        step INTEGER NOT NULL DEFAULT 0,
        holder_id TEXT,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS kp_players (
        player_key TEXT PRIMARY KEY,
        station TEXT,
        holding_id TEXT,
        score INTEGER NOT NULL DEFAULT 0
      );
    `);
  },

  onJoin(player: Player, ctx: GameContext) {
    ctx.sql.exec(
      `INSERT OR IGNORE INTO kp_players (player_key, station, holding_id, score) VALUES (?, NULL, NULL, 0)`,
      player.id,
    );
    syncKP(ctx);
  },

  handleMessage(player: Player, msg: { type: string; [k: string]: unknown }, ctx: GameContext) {
    if (msg.type === 'KP_START') { handleStart(ctx); return; }
    if (msg.type === 'KP_RESET') { handleReset(ctx); return; }
    if (msg.type === 'KP_GOTO') { handleGoto(player, msg.station as KPStation, ctx); return; }
  },

  buildState: buildKPState,

  async onAlarm(ctx: GameContext) {
    if (getPhase(ctx) !== 'playing') return;

    const now = Date.now();
    const startedAt = getInt(ctx, 'started_at');

    if (now - startedAt >= GAME_DURATION_MS) {
      setMeta(ctx, 'phase', 'finished');
      // Release held documents
      [...ctx.sql.exec(`SELECT holder_id FROM kp_documents WHERE holder_id IS NOT NULL AND step < 3`)].forEach((r) => {
        ctx.sql.exec(`UPDATE kp_players SET holding_id = NULL WHERE player_key = ?`, r.holder_id);
      });
      ctx.sql.exec(`UPDATE kp_documents SET holder_id = NULL`);
      syncKP(ctx);
      return;
    }

    // Expire overdue documents
    const expired = [...ctx.sql.exec(
      `SELECT id, holder_id FROM kp_documents WHERE expires_at <= ? AND step < 3`, now,
    )];
    if (expired.length > 0) {
      setMeta(ctx, 'failed', String(getInt(ctx, 'failed') + expired.length));
      for (const row of expired) {
        if (row.holder_id) {
          ctx.sql.exec(`UPDATE kp_players SET holding_id = NULL WHERE player_key = ?`, row.holder_id);
        }
      }
      ctx.sql.exec(`DELETE FROM kp_documents WHERE expires_at <= ? AND step < 3`, now);
    }

    // Spawn new document if below cap
    const [cnt] = [...ctx.sql.exec(`SELECT COUNT(*) as n FROM kp_documents WHERE step < 3`)];
    const nextDocAt = getInt(ctx, 'next_doc_at');
    if (now >= nextDocAt && (cnt.n as number) < MAX_ACTIVE_DOCS) {
      spawnDoc(ctx);
      setMeta(ctx, 'next_doc_at', String(now + DOC_INTERVAL_MS));
    }

    syncKP(ctx);
    await ctx.scheduleAlarm(now + 1000);
  },
};
