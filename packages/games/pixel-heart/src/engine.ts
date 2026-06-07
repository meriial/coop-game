import type { GameContext, GameEngine } from '@workshop/game-core/server';
import type { CanvasState, Player } from '@workshop/protocol';
import { TARGET, TARGET_CELL_COUNT } from './target';

const GRID_SIZE = 20;

function buildCanvasState(ctx: GameContext): CanvasState {
  const canvas: (string | null)[][] = Array.from({ length: GRID_SIZE }, () =>
    Array<string | null>(GRID_SIZE).fill(null),
  );

  const cellRows = [...ctx.sql.exec(`SELECT x, y, color FROM canvas_cells`)];
  let filledCount = 0;
  for (const row of cellRows) {
    const x = row.x as number;
    const y = row.y as number;
    canvas[y][x] = row.color as string;
    if (TARGET[y][x]) filledCount++;
  }

  const playerRows = [...ctx.sql.exec(`SELECT id, name, color FROM players`)];
  const players: CanvasState['players'] = {};
  for (const row of playerRows) {
    players[row.id as string] = {
      id: row.id as string,
      name: row.name as string,
      color: row.color as string,
    };
  }

  return {
    canvas,
    progress: TARGET_CELL_COUNT > 0 ? Math.round((filledCount / TARGET_CELL_COUNT) * 100) : 0,
    players,
  };
}

export const pixelHeartEngine: GameEngine<CanvasState> = {
  id: 'pixel-heart',
  inboundTypes: ['GAME_PAINT', 'GAME_RESET'],

  initSchema(ctx) {
    ctx.sql.exec(`
      CREATE TABLE IF NOT EXISTS canvas_cells (
        x INTEGER NOT NULL, y INTEGER NOT NULL, color TEXT NOT NULL, painted_by TEXT NOT NULL,
        PRIMARY KEY (x, y)
      );
    `);
  },

  handleMessage(player, msg, ctx) {
    if (msg.type === 'GAME_PAINT') {
      const x = msg.x as number;
      const y = msg.y as number;
      if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE || !TARGET[y][x]) return;
      const playerKey = player.id;
      const playerRow = [...ctx.sql.exec(`SELECT color FROM players WHERE id = ?`, playerKey)];
      if (playerRow.length === 0) return;
      const color = playerRow[0].color as string;
      ctx.sql.exec(`INSERT OR REPLACE INTO canvas_cells VALUES (?, ?, ?, ?)`, x, y, color, playerKey);
      ctx.broadcast({ type: 'SYNC_CANVAS', ...buildCanvasState(ctx) });
      return;
    }
    if (msg.type === 'GAME_RESET') {
      ctx.sql.exec(`DELETE FROM canvas_cells`);
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
