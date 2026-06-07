import type { Player } from '@workshop/protocol';

export interface GameContext {
  sql: SqlStorage;
  players(): Player[];
  broadcast(msg: unknown): void;
  meta: {
    get(key: string): string | null;
    set(key: string, value: string): void;
  };
  scheduleAlarm(atMs: number): Promise<void>;
  playerKey(email: string, name: string): string;
  assignColor(playerKey: string): string;
}

export interface GameEngine<State = unknown> {
  id: string;
  config?: { maxAgentsPerOwner?: number };
  inboundTypes: string[];
  initSchema(ctx: GameContext): void;
  onJoin?(player: Player, ctx: GameContext): void;
  handleMessage(player: Player, msg: { type: string; [key: string]: unknown }, ctx: GameContext): Promise<void> | void;
  buildState(ctx: GameContext): State;
  onAlarm?(ctx: GameContext): Promise<void> | void;
}

export class GameRegistry {
  private engines = new Map<string, GameEngine>();
  private typeIndex = new Map<string, GameEngine>();

  register(engine: GameEngine): void {
    this.engines.set(engine.id, engine);
    for (const t of engine.inboundTypes) {
      this.typeIndex.set(t, engine);
    }
  }

  get(id: string): GameEngine | undefined {
    return this.engines.get(id);
  }

  all(): GameEngine[] {
    return [...this.engines.values()];
  }

  route(type: string): GameEngine | undefined {
    return this.typeIndex.get(type);
  }

  initAll(ctx: GameContext): void {
    for (const engine of this.engines.values()) {
      engine.initSchema(ctx);
    }
  }
}

export function createGameContext(
  sql: SqlStorage,
  deps: {
    getPlayers: () => Player[];
    broadcast: (msg: unknown) => void;
    scheduleAlarm: (atMs: number) => Promise<void>;
    playerKey: (email: string, name: string) => string;
    assignColor: (playerKey: string) => string;
  },
): GameContext {
  return {
    sql,
    players: deps.getPlayers,
    broadcast: deps.broadcast,
    scheduleAlarm: deps.scheduleAlarm,
    playerKey: deps.playerKey,
    assignColor: deps.assignColor,
    meta: {
      get(key: string) {
        const rows = [...sql.exec(`SELECT value FROM meta WHERE key = ?`, key)];
        return rows.length > 0 ? (rows[0].value as string) : null;
      },
      set(key: string, value: string) {
        sql.exec(`INSERT OR REPLACE INTO meta VALUES (?, ?)`, key, value);
      },
    },
  };
}
