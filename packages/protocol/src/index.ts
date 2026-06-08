export interface Player {
  id: string;
  name: string;
  color: string;
  ownerId: string;
  isAgent: boolean;
  agentLabel?: string;
}

export interface MatchScore {
  id: string;
  name: string;
  color: string;
  count: number;
}

export interface MatchState {
  matchBoard: string[];
  matchClaimed: (string | null)[];
  matchPending: Record<string, string>;
  matchRevealed: Record<string, string>;
  matchPaused: boolean;
  matchScores: MatchScore[];
  matchElementCount: number;
  matchPendingTimeoutMs: number;
  gameOver: boolean;
  catchUpEnabled: boolean;
  showCooldown: boolean;
  /** player_key → absolute timestamp (ms) when cooldown expires */
  matchCooldowns: Record<string, number>;
  catchupActiveWindowMs: number;
}

/** Power-up effects double as blend modes that change how the next few paints behave. */
export type PowerUpKind = 'bloom' | 'prism' | 'supernova' | 'additive';

export interface PowerUp {
  id: string;
  x: number;
  y: number;
  kind: PowerUpKind;
}

export interface PlayerEffect {
  kind: PowerUpKind;
  /** Remaining paints this effect applies to. */
  charges: number;
}

export interface PaintConfig {
  cols: number;
  rows: number;
  /** 0..1 blend weight applied to the 8 neighbours of a painted cell. */
  mixStrength: number;
  /** Minimum ms between paints, applied to humans and agents alike. */
  cooldownMs: number;
  /** Max cells an agent may paint in a single GAME_PAINT_PATH batch. */
  agentBatchMax: number;
  powerupsEnabled: boolean;
  /** Used when powerupMode === 'time'. */
  powerupIntervalMs: number;
  powerupMax: number;
  /** When enabled, each paint must be adjacent (Chebyshev ≤ 1) to the player's last paint. */
  wormMode: boolean;
  /** 'time': spawn on a timer; 'count': spawn after playerCount × powerupPaintsPerPlayer paints. */
  powerupMode: 'time' | 'count';
  /** Paints per player before a power-up drops (used when powerupMode === 'count'). */
  powerupPaintsPerPlayer: number;
  /** 'random': server assigns colors; 'pick': players choose their own color. */
  colorMode: 'random' | 'pick';
  /** Allowed hex colors when colorMode === 'pick'. Empty = any color. */
  colorPalette: string[];
}

export const DEFAULT_PAINT_CONFIG: PaintConfig = {
  cols: 32,
  rows: 18,
  mixStrength: 0.5,
  cooldownMs: 500,
  agentBatchMax: 8,
  powerupsEnabled: true,
  powerupIntervalMs: 12_000,
  powerupMax: 3,
  wormMode: false,
  powerupMode: 'count',
  powerupPaintsPerPlayer: 3,
  colorMode: 'random',
  colorPalette: [],
};

export interface CanvasState {
  /** rows × cols matrix of composited CSS colors (e.g. "rgba(...)") or null. */
  canvas: (string | null)[][];
  cols: number;
  rows: number;
  /** Coverage: painted cells / total cells, 0..100. */
  progress: number;
  /** Harmony: cells blended by 2+ distinct painters / painted cells, 0..100. */
  harmony: number;
  players: Record<string, Pick<Player, 'id' | 'name' | 'color'>>;
  powerups: PowerUp[];
  /** Per-player active blend-mode effect, keyed by player id. */
  effects: Record<string, PlayerEffect>;
  /** Player ids that have claimed a power-up in the current rotation cycle. */
  claims: string[];
  config: PaintConfig;
  /** Last painted cell per player (paint anchor — determines valid next-paint positions). Keyed by player id. */
  wormLastPaints: Record<string, { x: number; y: number }>;
  /** Keyboard cursor position per player (visual only — moves with arrow keys without painting). Keyed by player id. */
  wormCursors: Record<string, { x: number; y: number }>;
  /** Paints remaining until the next power-up drops (count mode only), or null. */
  paintsUntilNextPowerup: number | null;
  /** Active painting prompt, or null when no round is set up. */
  prompt: string | null;
  /** Round lifecycle: idle → painting → judging → reveal. */
  phase: 'idle' | 'painting' | 'judging' | 'reveal';
  /** Epoch ms when the current painting round ends, or null. */
  roundEndMs: number | null;
  /** Judge score 1–10, set after judging. */
  score: number | null;
  /** One-sentence judge commentary, set after judging. */
  commentary: string | null;
}

export function emptyCanvasState(
  cols: number = DEFAULT_PAINT_CONFIG.cols,
  rows: number = DEFAULT_PAINT_CONFIG.rows,
): CanvasState {
  return {
    canvas: Array.from({ length: rows }, () => Array<string | null>(cols).fill(null)),
    cols,
    rows,
    progress: 0,
    harmony: 0,
    players: {},
    powerups: [],
    effects: {},
    claims: [],
    config: { ...DEFAULT_PAINT_CONFIG, cols, rows },
    wormLastPaints: {},
    wormCursors: {},
    paintsUntilNextPowerup: null,
    prompt: null,
    phase: 'idle',
    roundEndMs: null,
    score: null,
    commentary: null,
  };
}

export interface ConnectedUser {
  name: string;
  color?: string;
}

/**
 * Presentation background selection. The server treats this as an opaque blob —
 * it persists and relays it without knowing the param schemas (those live in the
 * frontend background registry). The frontend always sends a fully-resolved config.
 */
export interface BgConfig {
  /** Registered background id, e.g. 'shifting-grid'. */
  backgroundId: string;
  /** Selected strategy within that background, e.g. 'drift' | 'waves' | 'ripple'. */
  strategyId: string;
  /** Resolved shared + strategy param values. */
  params: Record<string, number | string | boolean>;
}

export type InboundMsg =
  | { type: 'STEP_CHANGE'; stepIndex: number }
  | { type: 'SUBMIT_VOTE'; pollId: string; choice: string; pollType?: string }
  | { type: 'RESET_POLL'; pollId: string }
  | { type: 'GAME_JOIN'; name: string }
  | { type: 'GAME_PAINT'; x: number; y: number; opacity?: number; fromCursor?: boolean }
  | { type: 'GAME_PAINT_PATH'; cells: { x: number; y: number }[] }
  | { type: 'GAME_CONFIG'; config: Partial<PaintConfig> }
  | { type: 'GAME_RESET' }
  | { type: 'GAME_DROP_POWERUP' }
  | { type: 'GAME_SET_COLOR'; color: string }
  | { type: 'GAME_WORM_MOVE'; x: number; y: number }
  | { type: 'GAME_SET_PROMPT'; prompt: string }
  | { type: 'GAME_START_ROUND'; durationMs: number }
  | { type: 'GAME_END_ROUND' }
  | { type: 'GAME_SET_SCORE'; score: number; commentary: string }
  | { type: 'MATCH_FLIP'; pos: number }
  | { type: 'MATCH_PAUSE' }
  | { type: 'MATCH_RESET' }
  | { type: 'MATCH_SET_SIZE'; count: number }
  | { type: 'MATCH_SET_TIMEOUT'; seconds: number }
  | { type: 'MATCH_SET_CATCHUP'; enabled: boolean }
  | { type: 'MATCH_SET_SHOW_COOLDOWN'; enabled: boolean }
  | { type: 'MATCH_SET_ACTIVE_WINDOW'; seconds: number }
  | { type: 'MATCH_CLEAR_LEADERBOARD' }
  | { type: 'BG_CONFIG'; config: BgConfig }
  | { type: 'RELOAD_CLIENTS' };

export type OutboundMsg =
  | ({ type: 'WELCOME'; stepIndex: number; role: string; pollResults: Record<string, Record<string, number>>; pollValues: Record<string, string[]>; bgConfig: BgConfig | null } & CanvasState & MatchState)
  | { type: 'SYNC_STEP'; stepIndex: number }
  | { type: 'SYNC_BG'; config: BgConfig }
  | { type: 'RELOAD' }
  | { type: 'POLL_UPDATES'; pollId: string; results?: Record<string, number>; values?: string[] }
  | { type: 'POLL_RESET'; pollId: string }
  | ({ type: 'SYNC_CANVAS' } & CanvasState)
  | ({ type: 'SYNC_MATCH' } & MatchState)
  | { type: 'CONNECTED_USERS'; users: ConnectedUser[] };

export interface RoomAttachment {
  role: 'presenter' | 'participant';
  email: string;
  name: string;
  participantId: string;
  ownerId?: string;
  isAgent?: boolean;
  agentLabel?: string;
}

/** Stable player-row id: one row per human email, one per agent label under an owner. */
export function resolvePlayerKey(att: Pick<RoomAttachment, 'email' | 'name' | 'ownerId' | 'isAgent' | 'agentLabel'>): string {
  if (att.isAgent && att.agentLabel) {
    const owner = att.ownerId ?? att.email ?? att.name;
    return `${owner}::agent::${att.agentLabel}`;
  }
  return att.email || att.name;
}
