import type { GameContext, GameEngine } from '@workshop/game-core/server';
import {
  DEFAULT_PAINT_CONFIG,
  type CanvasState,
  type PaintConfig,
  type Player,
  type PowerUp,
  type PowerUpKind,
} from '@workshop/protocol';

const POWERUP_KINDS: PowerUpKind[] = ['bloom', 'prism', 'supernova', 'additive'];

// How many subsequent paints each power-up's blend-mode effect applies to.
const EFFECT_CHARGES: Record<PowerUpKind, number> = {
  bloom: 6,
  prism: 8,
  supernova: 3,
  additive: 6,
};

const MIN_DIM = 4;
const MAX_DIM = 80;
const MAX_PAINTERS_TRACKED = 8;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface CellRow {
  r: number;
  g: number;
  b: number;
  a: number;
  painters: string[];
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? Math.round(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function getConfig(ctx: GameContext): PaintConfig {
  const num = (key: string, fallback: number): number => {
    const raw = ctx.meta.get(key);
    if (raw === null) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const bool = (key: string, fallback: boolean): boolean => {
    const raw = ctx.meta.get(key);
    return raw === null ? fallback : raw === 'true';
  };
  const powerupModeRaw = ctx.meta.get('paint_powerup_mode');
  const powerupMode: PaintConfig['powerupMode'] =
    powerupModeRaw === 'count' ? 'count'
    : powerupModeRaw === 'time' ? 'time'
    : DEFAULT_PAINT_CONFIG.powerupMode;
  return {
    cols: num('paint_cols', DEFAULT_PAINT_CONFIG.cols),
    rows: num('paint_rows', DEFAULT_PAINT_CONFIG.rows),
    mixStrength: num('paint_mix_strength', DEFAULT_PAINT_CONFIG.mixStrength),
    cooldownMs: num('paint_cooldown_ms', DEFAULT_PAINT_CONFIG.cooldownMs),
    agentBatchMax: num('paint_agent_batch', DEFAULT_PAINT_CONFIG.agentBatchMax),
    powerupsEnabled: bool('paint_powerups_enabled', DEFAULT_PAINT_CONFIG.powerupsEnabled),
    powerupIntervalMs: num('paint_powerup_interval_ms', DEFAULT_PAINT_CONFIG.powerupIntervalMs),
    powerupMax: num('paint_powerup_max', DEFAULT_PAINT_CONFIG.powerupMax),
    wormMode: bool('paint_worm_mode', DEFAULT_PAINT_CONFIG.wormMode),
    powerupMode,
    powerupPaintsPerPlayer: num('paint_powerup_paints_per_player', DEFAULT_PAINT_CONFIG.powerupPaintsPerPlayer),
  };
}

function hexToRgb(hex: string): Rgb {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const int = parseInt(h, 16);
  if (!Number.isFinite(int)) return { r: 148, g: 163, b: 184 };
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

// Prism rotates the painter's hue every paint so they lay down a rainbow.
function prismRgb(charges: number): Rgb {
  const step = EFFECT_CHARGES.prism - charges;
  return hslToRgb(step * 45, 0.8, 0.58);
}

function readCell(ctx: GameContext, x: number, y: number): CellRow | null {
  const rows = [...ctx.sql.exec(
    `SELECT r, g, b, a, painters FROM paint_cells WHERE x = ? AND y = ?`,
    x, y,
  )];
  if (rows.length === 0) return null;
  const row = rows[0];
  let painters: string[] = [];
  try { painters = JSON.parse((row.painters as string) || '[]') as string[]; } catch { painters = []; }
  return {
    r: row.r as number,
    g: row.g as number,
    b: row.b as number,
    a: row.a as number,
    painters,
  };
}

function mergePainters(existing: string[], key: string): string {
  if (existing.includes(key)) return JSON.stringify(existing);
  const next = [...existing, key].slice(0, MAX_PAINTERS_TRACKED);
  return JSON.stringify(next);
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function writeCell(
  ctx: GameContext,
  x: number,
  y: number,
  incoming: Rgb,
  weight: number,
  isCenter: boolean,
  additive: boolean,
  painterKey: string,
): void {
  const existing = readCell(ctx, x, y);
  let r: number, g: number, b: number, a: number;

  if (isCenter) {
    if (additive && existing) {
      r = Math.min(255, existing.r + incoming.r);
      g = Math.min(255, existing.g + incoming.g);
      b = Math.min(255, existing.b + incoming.b);
    } else {
      r = incoming.r; g = incoming.g; b = incoming.b;
    }
    a = weight;
  } else if (!existing) {
    // Empty neighbour becomes the incoming color at partial alpha — the
    // "half-transparent" look when painting onto bare canvas.
    r = incoming.r; g = incoming.g; b = incoming.b;
    a = weight;
  } else {
    a = existing.a + (1 - existing.a) * weight;
    if (additive) {
      r = Math.min(255, existing.r + Math.round(incoming.r * weight));
      g = Math.min(255, existing.g + Math.round(incoming.g * weight));
      b = Math.min(255, existing.b + Math.round(incoming.b * weight));
    } else {
      r = lerp(existing.r, incoming.r, weight);
      g = lerp(existing.g, incoming.g, weight);
      b = lerp(existing.b, incoming.b, weight);
    }
  }

  const painters = mergePainters(existing?.painters ?? [], painterKey);
  ctx.sql.exec(
    `INSERT OR REPLACE INTO paint_cells (x, y, r, g, b, a, painters) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    x, y, r, g, b, Math.min(1, a), painters,
  );
}

function getActiveEffect(ctx: GameContext, playerKey: string): { kind: PowerUpKind; charges: number } | null {
  const rows = [...ctx.sql.exec(`SELECT kind, charges FROM paint_effects WHERE player_key = ?`, playerKey)];
  if (rows.length === 0) return null;
  return { kind: rows[0].kind as PowerUpKind, charges: rows[0].charges as number };
}

function consumeEffectCharge(ctx: GameContext, playerKey: string, charges: number): void {
  if (charges <= 1) {
    ctx.sql.exec(`DELETE FROM paint_effects WHERE player_key = ?`, playerKey);
  } else {
    ctx.sql.exec(`UPDATE paint_effects SET charges = ? WHERE player_key = ?`, charges - 1, playerKey);
  }
}

function tryPickupPowerup(ctx: GameContext, player: Player, x: number, y: number): boolean {
  const puRows = [...ctx.sql.exec(`SELECT id, kind FROM paint_powerups WHERE x = ? AND y = ?`, x, y)];
  if (puRows.length === 0) return false;

  // Fairness rotation: a player who already claimed this cycle is ineligible;
  // the power-up stays on the board until everyone else has had a turn.
  const claimed = [...ctx.sql.exec(`SELECT 1 FROM paint_powerup_claims WHERE player_key = ?`, player.id)];
  if (claimed.length > 0) return false;

  const kind = puRows[0].kind as PowerUpKind;
  ctx.sql.exec(`DELETE FROM paint_powerups WHERE id = ?`, puRows[0].id as string);
  ctx.sql.exec(
    `INSERT OR REPLACE INTO paint_effects (player_key, kind, charges) VALUES (?, ?, ?)`,
    player.id, kind, EFFECT_CHARGES[kind],
  );
  ctx.sql.exec(
    `INSERT OR REPLACE INTO paint_powerup_claims (player_key, claimed_ms) VALUES (?, ?)`,
    player.id, Date.now(),
  );

  const claimCount = [...ctx.sql.exec(`SELECT COUNT(*) as c FROM paint_powerup_claims`)][0].c as number;
  const playerCount = ctx.players().length;
  if (claimCount >= Math.max(1, playerCount)) {
    ctx.sql.exec(`DELETE FROM paint_powerup_claims`);
  }
  return true;
}

function spawnPowerup(ctx: GameContext, cfg: PaintConfig, now: number): boolean {
  for (let attempt = 0; attempt < 12; attempt++) {
    const x = Math.floor(Math.random() * cfg.cols);
    const y = Math.floor(Math.random() * cfg.rows);
    const taken = [...ctx.sql.exec(`SELECT 1 FROM paint_powerups WHERE x = ? AND y = ?`, x, y)];
    if (taken.length > 0) continue;
    const kind = POWERUP_KINDS[Math.floor(Math.random() * POWERUP_KINDS.length)];
    ctx.sql.exec(
      `INSERT INTO paint_powerups (id, x, y, kind, spawned_ms) VALUES (?, ?, ?, ?, ?)`,
      crypto.randomUUID(), x, y, kind, now,
    );
    return true;
  }
  return false;
}

function maybeSpawnPowerup(ctx: GameContext, cfg: PaintConfig, now: number): void {
  if (!cfg.powerupsEnabled) return;
  const active = [...ctx.sql.exec(`SELECT COUNT(*) as c FROM paint_powerups`)][0].c as number;
  if (active >= cfg.powerupMax) return;

  if (cfg.powerupMode === 'count') {
    const playerCount = ctx.players().length;
    const needed = Math.max(1, playerCount) * cfg.powerupPaintsPerPlayer;
    const paintsSince = Number(ctx.meta.get('paint_count_since_spawn') ?? 0);
    if (paintsSince < needed) return;
    if (spawnPowerup(ctx, cfg, now)) ctx.meta.set('paint_count_since_spawn', '0');
  } else {
    const lastRaw = ctx.meta.get('paint_last_spawn_ms');
    const last = lastRaw ? Number(lastRaw) : 0;
    if (now - last < cfg.powerupIntervalMs) return;
    if (spawnPowerup(ctx, cfg, now)) ctx.meta.set('paint_last_spawn_ms', String(now));
  }
}

// Applies a single paint (center + spread) and any side effects. Caller is
// responsible for cooldown gating and broadcasting.
function applyPaint(ctx: GameContext, player: Player, x: number, y: number, cfg: PaintConfig, now: number, opacity = 1): boolean {
  if (x < 0 || x >= cfg.cols || y < 0 || y >= cfg.rows) return false;

  // Worm mode: each paint must be within Chebyshev distance 1 of the player's last paint.
  if (cfg.wormMode) {
    const lastRow = [...ctx.sql.exec(`SELECT x, y FROM paint_worm_last WHERE player_key = ?`, player.id)];
    if (lastRow.length > 0) {
      const dx = Math.abs(x - (lastRow[0].x as number));
      const dy = Math.abs(y - (lastRow[0].y as number));
      if (Math.max(dx, dy) > 1) return false;
    }
  }

  const playerRow = [...ctx.sql.exec(`SELECT color FROM players WHERE id = ?`, player.id)];
  if (playerRow.length === 0) return false;

  const effect = getActiveEffect(ctx, player.id);
  let mix = cfg.mixStrength;
  let radius = 1;
  let additive = false;
  let rgb = hexToRgb(playerRow[0].color as string);
  if (effect) {
    if (effect.kind === 'bloom') mix = Math.max(mix, 0.85);
    if (effect.kind === 'supernova') radius = 2;
    if (effect.kind === 'additive') additive = true;
    if (effect.kind === 'prism') rgb = prismRgb(effect.charges);
  }

  writeCell(ctx, x, y, rgb, opacity, true, additive, player.id);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= cfg.cols || ny < 0 || ny >= cfg.rows) continue;
      const cheb = Math.max(Math.abs(dx), Math.abs(dy));
      const weight = (cheb === 1 ? mix : mix * 0.5) * opacity;
      writeCell(ctx, nx, ny, rgb, weight, false, additive, player.id);
    }
  }

  if (effect) consumeEffectCharge(ctx, player.id, effect.charges);

  // Update worm last-paint position.
  ctx.sql.exec(
    `INSERT OR REPLACE INTO paint_worm_last (player_key, x, y) VALUES (?, ?, ?)`,
    player.id, x, y,
  );

  const consumed = tryPickupPowerup(ctx, player, x, y);

  // Manage spawn clocks: freeze when at max capacity; restart on pickup.
  const active = [...ctx.sql.exec(`SELECT COUNT(*) as c FROM paint_powerups`)][0].c as number;
  if (active >= cfg.powerupMax) {
    // Slots full — keep the time-mode clock frozen so no interval accumulates.
    if (cfg.powerupMode === 'time') ctx.meta.set('paint_last_spawn_ms', String(now));
    // Count mode: simply don't increment.
  } else {
    if (consumed) {
      // A slot just opened — restart both clocks so the next drop is a
      // full interval/count away rather than firing immediately.
      ctx.meta.set('paint_count_since_spawn', '0');
      ctx.meta.set('paint_last_spawn_ms', String(now));
    }
    const paintsSince = Number(ctx.meta.get('paint_count_since_spawn') ?? 0);
    ctx.meta.set('paint_count_since_spawn', String(paintsSince + 1));
  }

  maybeSpawnPowerup(ctx, cfg, now);
  return true;
}

function withinCooldown(ctx: GameContext, playerKey: string, now: number, cooldownMs: number): boolean {
  const rows = [...ctx.sql.exec(`SELECT last_ms FROM paint_cooldown WHERE player_key = ?`, playerKey)];
  const last = rows.length > 0 ? (rows[0].last_ms as number) : 0;
  return now - last < cooldownMs;
}

function stampCooldown(ctx: GameContext, playerKey: string, now: number): void {
  ctx.sql.exec(
    `INSERT OR REPLACE INTO paint_cooldown (player_key, last_ms) VALUES (?, ?)`,
    playerKey, now,
  );
}

function buildCanvasState(ctx: GameContext): CanvasState {
  const cfg = getConfig(ctx);
  const canvas: (string | null)[][] = Array.from({ length: cfg.rows }, () =>
    Array<string | null>(cfg.cols).fill(null),
  );

  const cellRows = [...ctx.sql.exec(`SELECT x, y, r, g, b, a, painters FROM paint_cells`)];
  let painted = 0;
  let harmonious = 0;
  for (const row of cellRows) {
    const x = Math.floor(row.x as number);
    const y = Math.floor(row.y as number);
    if (x < 0 || x >= cfg.cols || y < 0 || y >= cfg.rows) continue;
    const a = Math.round((row.a as number) * 1000) / 1000;
    canvas[y][x] = `rgba(${row.r as number}, ${row.g as number}, ${row.b as number}, ${a})`;
    painted++;
    let painters: string[] = [];
    try { painters = JSON.parse((row.painters as string) || '[]') as string[]; } catch { painters = []; }
    if (painters.length >= 2) harmonious++;
  }

  const total = cfg.cols * cfg.rows;
  const progress = total > 0 ? Math.round((painted / total) * 100) : 0;
  const harmony = painted > 0 ? Math.round((harmonious / painted) * 100) : 0;

  const playerRows = [...ctx.sql.exec(`SELECT id, name, color FROM players`)];
  const players: CanvasState['players'] = {};
  for (const row of playerRows) {
    players[row.id as string] = {
      id: row.id as string,
      name: row.name as string,
      color: row.color as string,
    };
  }

  const powerups: PowerUp[] = [...ctx.sql.exec(`SELECT id, x, y, kind FROM paint_powerups`)].map((row) => ({
    id: row.id as string,
    x: row.x as number,
    y: row.y as number,
    kind: row.kind as PowerUpKind,
  }));

  const effects: CanvasState['effects'] = {};
  for (const row of ctx.sql.exec(`SELECT player_key, kind, charges FROM paint_effects`)) {
    effects[row.player_key as string] = {
      kind: row.kind as PowerUpKind,
      charges: row.charges as number,
    };
  }

  const claims = [...ctx.sql.exec(`SELECT player_key FROM paint_powerup_claims`)].map((r) => r.player_key as string);

  // Worm last-paint positions (always included; empty when worm mode is off).
  const wormLastPaints: CanvasState['wormLastPaints'] = {};
  for (const row of ctx.sql.exec(`SELECT player_key, x, y FROM paint_worm_last`)) {
    wormLastPaints[row.player_key as string] = { x: row.x as number, y: row.y as number };
  }

  // Paints-until-next-powerup counter (count mode, not at max capacity).
  let paintsUntilNextPowerup: number | null = null;
  if (cfg.powerupsEnabled && cfg.powerupMode === 'count') {
    const activeCount = [...ctx.sql.exec(`SELECT COUNT(*) as c FROM paint_powerups`)][0].c as number;
    if (activeCount < cfg.powerupMax) {
      const playerCount = ctx.players().length;
      const needed = Math.max(1, playerCount) * cfg.powerupPaintsPerPlayer;
      const paintsSince = Number(ctx.meta.get('paint_count_since_spawn') ?? 0);
      paintsUntilNextPowerup = Math.max(0, needed - paintsSince);
    }
  }

  return {
    canvas, cols: cfg.cols, rows: cfg.rows, progress, harmony,
    players, powerups, effects, claims, config: cfg,
    wormLastPaints, paintsUntilNextPowerup,
  };
}

function applyConfig(ctx: GameContext, partial: Record<string, unknown>): void {
  if ('cols' in partial) ctx.meta.set('paint_cols', String(clampInt(partial.cols, MIN_DIM, MAX_DIM, DEFAULT_PAINT_CONFIG.cols)));
  if ('rows' in partial) ctx.meta.set('paint_rows', String(clampInt(partial.rows, MIN_DIM, MAX_DIM, DEFAULT_PAINT_CONFIG.rows)));
  if ('mixStrength' in partial) {
    const m = typeof partial.mixStrength === 'number' ? partial.mixStrength : DEFAULT_PAINT_CONFIG.mixStrength;
    ctx.meta.set('paint_mix_strength', String(Math.min(0.95, Math.max(0.05, m))));
  }
  if ('cooldownMs' in partial) ctx.meta.set('paint_cooldown_ms', String(clampInt(partial.cooldownMs, 0, 5000, DEFAULT_PAINT_CONFIG.cooldownMs)));
  if ('agentBatchMax' in partial) ctx.meta.set('paint_agent_batch', String(clampInt(partial.agentBatchMax, 1, 64, DEFAULT_PAINT_CONFIG.agentBatchMax)));
  if ('powerupsEnabled' in partial) ctx.meta.set('paint_powerups_enabled', partial.powerupsEnabled ? 'true' : 'false');
  if ('powerupIntervalMs' in partial) ctx.meta.set('paint_powerup_interval_ms', String(clampInt(partial.powerupIntervalMs, 1000, 600_000, DEFAULT_PAINT_CONFIG.powerupIntervalMs)));
  if ('powerupMax' in partial) ctx.meta.set('paint_powerup_max', String(clampInt(partial.powerupMax, 0, 32, DEFAULT_PAINT_CONFIG.powerupMax)));
  if ('wormMode' in partial) ctx.meta.set('paint_worm_mode', partial.wormMode ? 'true' : 'false');
  if ('powerupMode' in partial) ctx.meta.set('paint_powerup_mode', partial.powerupMode === 'count' ? 'count' : 'time');
  if ('powerupPaintsPerPlayer' in partial) ctx.meta.set('paint_powerup_paints_per_player', String(clampInt(partial.powerupPaintsPerPlayer, 1, 100, DEFAULT_PAINT_CONFIG.powerupPaintsPerPlayer)));

  // Drop anything that fell outside the (possibly shrunk) grid.
  const cfg = getConfig(ctx);
  ctx.sql.exec(`DELETE FROM paint_cells WHERE x >= ? OR y >= ?`, cfg.cols, cfg.rows);
  ctx.sql.exec(`DELETE FROM paint_powerups WHERE x >= ? OR y >= ?`, cfg.cols, cfg.rows);
  ctx.sql.exec(`DELETE FROM paint_worm_last WHERE x >= ? OR y >= ?`, cfg.cols, cfg.rows);
}

function resetCanvas(ctx: GameContext): void {
  ctx.sql.exec(`DELETE FROM paint_cells`);
  ctx.sql.exec(`DELETE FROM paint_powerups`);
  ctx.sql.exec(`DELETE FROM paint_powerup_claims`);
  ctx.sql.exec(`DELETE FROM paint_effects`);
  ctx.sql.exec(`DELETE FROM paint_cooldown`);
  ctx.sql.exec(`DELETE FROM paint_worm_last`);
  ctx.sql.exec(`DELETE FROM meta WHERE key IN ('paint_last_spawn_ms', 'paint_count_since_spawn')`);
}

export const pixelHeartEngine: GameEngine<CanvasState> = {
  id: 'pixel-heart',
  inboundTypes: ['GAME_PAINT', 'GAME_PAINT_PATH', 'GAME_CONFIG', 'GAME_RESET', 'GAME_DROP_POWERUP'],

  initSchema(ctx) {
    ctx.sql.exec(`
      CREATE TABLE IF NOT EXISTS paint_cells (
        x INTEGER NOT NULL, y INTEGER NOT NULL,
        r INTEGER NOT NULL, g INTEGER NOT NULL, b INTEGER NOT NULL, a REAL NOT NULL,
        painters TEXT NOT NULL DEFAULT '[]',
        PRIMARY KEY (x, y)
      );
      CREATE TABLE IF NOT EXISTS paint_powerups (
        id TEXT PRIMARY KEY, x INTEGER NOT NULL, y INTEGER NOT NULL, kind TEXT NOT NULL, spawned_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS paint_powerup_claims (
        player_key TEXT PRIMARY KEY, claimed_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS paint_effects (
        player_key TEXT PRIMARY KEY, kind TEXT NOT NULL, charges INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS paint_cooldown (
        player_key TEXT PRIMARY KEY, last_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS paint_worm_last (
        player_key TEXT PRIMARY KEY, x INTEGER NOT NULL, y INTEGER NOT NULL
      );
    `);
  },

  handleMessage(player, msg, ctx) {
    if (msg.type === 'GAME_PAINT') {
      const cfg = getConfig(ctx);
      const now = Date.now();
      if (withinCooldown(ctx, player.id, now, cfg.cooldownMs)) return;
      const x = Math.floor(msg.x as number);
      const y = Math.floor(msg.y as number);
      const rawOpacity = typeof msg.opacity === 'number' ? msg.opacity : 1;
      const opacity = [0.25, 0.5, 0.75, 1.0].reduce((best, v) =>
        Math.abs(v - rawOpacity) < Math.abs(best - rawOpacity) ? v : best, 1.0);
      const changed = applyPaint(ctx, player, x, y, cfg, now, opacity);
      if (!changed) return;
      stampCooldown(ctx, player.id, now);
      ctx.broadcast({ type: 'SYNC_CANVAS', ...buildCanvasState(ctx) });
      return;
    }

    if (msg.type === 'GAME_PAINT_PATH') {
      const cfg = getConfig(ctx);
      const now = Date.now();
      if (withinCooldown(ctx, player.id, now, cfg.cooldownMs)) return;
      const cells = Array.isArray(msg.cells) ? (msg.cells as { x: number; y: number }[]) : [];
      let any = false;
      for (const cell of cells.slice(0, cfg.agentBatchMax)) {
        if (applyPaint(ctx, player, Math.floor(cell.x), Math.floor(cell.y), cfg, now)) any = true;
      }
      if (!any) return;
      stampCooldown(ctx, player.id, now);
      ctx.broadcast({ type: 'SYNC_CANVAS', ...buildCanvasState(ctx) });
      return;
    }

    if (msg.type === 'GAME_CONFIG') {
      const partial = (msg.config ?? {}) as Record<string, unknown>;
      applyConfig(ctx, partial);
      ctx.broadcast({ type: 'SYNC_CANVAS', ...buildCanvasState(ctx) });
      return;
    }

    if (msg.type === 'GAME_RESET') {
      resetCanvas(ctx);
      ctx.broadcast({ type: 'SYNC_CANVAS', ...buildCanvasState(ctx) });
      return;
    }

    if (msg.type === 'GAME_DROP_POWERUP') {
      const cfg = getConfig(ctx);
      if (!cfg.powerupsEnabled) return;
      const now = Date.now();
      if (spawnPowerup(ctx, cfg, now)) {
        ctx.meta.set('paint_last_spawn_ms', String(now));
        ctx.meta.set('paint_count_since_spawn', '0');
      }
      ctx.broadcast({ type: 'SYNC_CANVAS', ...buildCanvasState(ctx) });
    }
  },

  buildState(ctx) {
    return buildCanvasState(ctx);
  },
};

export function handleGameJoin(player: Player, ctx: GameContext): void {
  ctx.broadcast({ type: 'SYNC_CANVAS', ...buildCanvasState(ctx) });
}
