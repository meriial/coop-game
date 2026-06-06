import type { Player, ClientMsg, ServerMsg } from './types';

const GRID_SIZE = 20;

const PLAYER_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#84cc16', '#06b6d4', '#e11d48',
  '#a855f7', '#10b981', '#0ea5e9', '#f43f5e',
  '#d97706', '#7c3aed', '#0891b2', '#65a30d',
];

// Heart shape — true = cell must be painted, false = leave empty
const T = true, F = false;
const TARGET: boolean[][] = [
  [F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
  [F,F,F,T,T,T,F,F,F,F,F,F,T,T,T,F,F,F,F,F],
  [F,F,T,T,T,T,T,F,F,F,F,T,T,T,T,T,F,F,F,F],
  [F,T,T,T,T,T,T,T,F,F,T,T,T,T,T,T,T,F,F,F],
  [F,T,T,T,T,T,T,T,T,T,T,T,T,T,T,T,T,T,F,F],
  [F,T,T,T,T,T,T,T,T,T,T,T,T,T,T,T,T,T,F,F],
  [F,F,T,T,T,T,T,T,T,T,T,T,T,T,T,T,T,F,F,F],
  [F,F,F,T,T,T,T,T,T,T,T,T,T,T,T,T,F,F,F,F],
  [F,F,F,F,T,T,T,T,T,T,T,T,T,T,T,F,F,F,F,F],
  [F,F,F,F,F,T,T,T,T,T,T,T,T,T,F,F,F,F,F,F],
  [F,F,F,F,F,F,T,T,T,T,T,T,T,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,T,T,T,T,T,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,T,T,T,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,T,F,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
  [F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F,F],
];

const TARGET_CELL_COUNT = TARGET.reduce((sum, row) => sum + row.filter(Boolean).length, 0);

export class GameRoom {
  private canvas: (string | null)[][];
  private colorIndex = 0;
  private players = new Map<string, Player>();

  constructor(private readonly ctx: DurableObjectState) {
    this.canvas = Array.from({ length: GRID_SIZE }, () =>
      Array<string | null>(GRID_SIZE).fill(null)
    );
    ctx.blockConcurrencyWhile(async () => {
      const storedCanvas = await ctx.storage.get<(string | null)[][]>('canvas');
      if (storedCanvas) this.canvas = storedCanvas;
      const storedIndex = await ctx.storage.get<number>('colorIndex');
      if (storedIndex !== undefined) this.colorIndex = storedIndex;
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }
    const [client, server] = Object.values(new WebSocketPair());
    const playerId = crypto.randomUUID();
    this.ctx.acceptWebSocket(server, [playerId]);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const playerId = ws.getTags()[0];
    let msg: ClientMsg;
    try {
      const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
      msg = JSON.parse(text) as ClientMsg;
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' } satisfies ServerMsg));
      return;
    }

    if (msg.type === 'join') {
      const color = PLAYER_COLORS[this.colorIndex % PLAYER_COLORS.length];
      this.colorIndex++;
      await this.ctx.storage.put('colorIndex', this.colorIndex);
      this.players.set(playerId, { id: playerId, name: msg.name.slice(0, 30), color });
      this.broadcast(this.buildStateMsg());
    } else if (msg.type === 'paint') {
      const player = this.players.get(playerId);
      if (!player) {
        ws.send(JSON.stringify({ type: 'error', message: 'Join first' } satisfies ServerMsg));
        return;
      }
      const { x, y } = msg;
      if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE || !TARGET[y][x]) return;
      this.canvas[y][x] = player.color;
      await this.ctx.storage.put('canvas', this.canvas);
      this.broadcast(this.buildStateMsg());
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.players.delete(ws.getTags()[0]);
    this.broadcast(this.buildStateMsg());
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.players.delete(ws.getTags()[0]);
  }

  private broadcast(msg: ServerMsg): void {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(text); } catch { /* ignore closed sockets */ }
    }
  }

  private buildStateMsg(): ServerMsg {
    let filledCount = 0;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (TARGET[y][x] && this.canvas[y][x] !== null) filledCount++;
      }
    }
    return {
      type: 'state',
      state: {
        canvas: this.canvas,
        target: TARGET,
        players: Object.fromEntries(this.players),
        progress: TARGET_CELL_COUNT > 0
          ? Math.round((filledCount / TARGET_CELL_COUNT) * 100)
          : 0,
      },
    };
  }
}
