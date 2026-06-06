const GRID_SIZE = 20;

const PLAYER_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#84cc16', '#06b6d4', '#e11d48',
  '#a855f7', '#10b981', '#0ea5e9', '#f43f5e',
  '#d97706', '#7c3aed', '#0891b2', '#65a30d',
];

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

interface Attachment {
  role: 'presenter' | 'participant';
  email: string;
  name: string;
  participantId: string;
}

type InboundMsg =
  | { type: 'STEP_CHANGE'; stepIndex: number }
  | { type: 'SUBMIT_VOTE'; pollId: string; choice: string }
  | { type: 'RESET_POLL'; pollId: string }
  | { type: 'GAME_JOIN'; name: string }
  | { type: 'GAME_PAINT'; x: number; y: number }
  | { type: 'GAME_RESET' };

type ConnectedUser = { name: string; color?: string };

type OutboundMsg =
  | { type: 'WELCOME'; stepIndex: number; role: string; canvas: (string | null)[][]; progress: number; players: Record<string, { id: string; name: string; color: string }> }
  | { type: 'SYNC_STEP'; stepIndex: number }
  | { type: 'POLL_UPDATES'; pollId: string; results: Record<string, number> }
  | { type: 'POLL_RESET'; pollId: string }
  | { type: 'SYNC_CANVAS'; canvas: (string | null)[][]; progress: number; players: Record<string, { id: string; name: string; color: string }> }
  | { type: 'CONNECTED_USERS'; users: ConnectedUser[] };

export class PresentationRoom {
  private sql: SqlStorage;

  constructor(private readonly ctx: DurableObjectState) {
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS votes (
          poll_id TEXT NOT NULL, choice TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (poll_id, choice)
        );
        CREATE TABLE IF NOT EXISTS vote_records (
          poll_id TEXT NOT NULL, participant_id TEXT NOT NULL, choice TEXT NOT NULL,
          PRIMARY KEY (poll_id, participant_id)
        );
        CREATE TABLE IF NOT EXISTS canvas_cells (
          x INTEGER NOT NULL, y INTEGER NOT NULL, color TEXT NOT NULL, painted_by TEXT NOT NULL,
          PRIMARY KEY (x, y)
        );
        CREATE TABLE IF NOT EXISTS players (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL
        );
      `);
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const role = (request.headers.get('X-User-Role') ?? 'participant') as 'presenter' | 'participant';
    const email = request.headers.get('X-User-Email') ?? '';
    const name = request.headers.get('X-User-Name') ?? 'Guest';
    const participantId = crypto.randomUUID();

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ role, email, name, participantId } satisfies Attachment);

    const canvasState = this.buildCanvasState();
    const stepIndex = this.getStepIndex();
    server.send(JSON.stringify({
      type: 'WELCOME',
      stepIndex,
      role,
      ...canvasState,
    } satisfies OutboundMsg));

    this.broadcastConnectedUsers();
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    let msg: InboundMsg;
    try {
      msg = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message)) as InboundMsg;
    } catch {
      return;
    }

    const attachment = ws.deserializeAttachment() as Attachment;
    const { role, participantId } = attachment;

    if (msg.type === 'STEP_CHANGE') {
      if (role !== 'presenter') return;
      const idx = Math.max(0, Math.floor(msg.stepIndex));
      this.sql.exec(`INSERT OR REPLACE INTO meta VALUES ('stepIndex', ?)`, String(idx));
      this.broadcast({ type: 'SYNC_STEP', stepIndex: idx });
    }

    else if (msg.type === 'SUBMIT_VOTE') {
      const { pollId, choice } = msg;
      const existing = [...this.sql.exec(
        `SELECT choice FROM vote_records WHERE poll_id = ? AND participant_id = ?`,
        pollId, participantId
      )];
      const previousChoice = existing.length > 0 ? existing[0].choice as string : null;

      if (previousChoice === choice) {
        // Same choice clicked → un-vote
        this.sql.exec(`DELETE FROM vote_records WHERE poll_id = ? AND participant_id = ?`, pollId, participantId);
        this.sql.exec(`UPDATE votes SET count = MAX(0, count - 1) WHERE poll_id = ? AND choice = ?`, pollId, choice);
      } else {
        if (previousChoice !== null) {
          // Different choice → decrement old
          this.sql.exec(`UPDATE votes SET count = MAX(0, count - 1) WHERE poll_id = ? AND choice = ?`, pollId, previousChoice);
        }
        // Increment new
        this.sql.exec(
          `INSERT INTO votes (poll_id, choice, count) VALUES (?, ?, 1)
           ON CONFLICT(poll_id, choice) DO UPDATE SET count = count + 1`,
          pollId, choice
        );
        this.sql.exec(
          `INSERT INTO vote_records (poll_id, participant_id, choice) VALUES (?, ?, ?)
           ON CONFLICT(poll_id, participant_id) DO UPDATE SET choice = excluded.choice`,
          pollId, participantId, choice
        );
      }
      this.broadcast({ type: 'POLL_UPDATES', pollId, results: this.getPollResults(pollId) });
    }

    else if (msg.type === 'RESET_POLL') {
      if (role !== 'presenter') return;
      const { pollId } = msg;
      this.sql.exec(`DELETE FROM votes WHERE poll_id = ?`, pollId);
      this.sql.exec(`DELETE FROM vote_records WHERE poll_id = ?`, pollId);
      this.broadcast({ type: 'POLL_RESET', pollId });
    }

    else if (msg.type === 'GAME_JOIN') {
      // Use email as stable player key so reconnects don't create duplicate entries
      const playerKey = attachment.email || attachment.name;
      // Clean up legacy UUID-keyed rows from before this fix
      this.sql.exec(`DELETE FROM players WHERE length(id) = 36 AND id LIKE '________-____-____-____-____________'`);
      const existing = [...this.sql.exec(`SELECT color FROM players WHERE id = ?`, playerKey)];
      let color: string;
      if (existing.length > 0) {
        color = existing[0].color as string;
      } else {
        const indexRow = [...this.sql.exec(`SELECT value FROM meta WHERE key = 'colorIndex'`)];
        const idx = indexRow.length > 0 ? parseInt(indexRow[0].value as string, 10) : 0;
        color = PLAYER_COLORS[idx % PLAYER_COLORS.length];
        this.sql.exec(`INSERT OR REPLACE INTO meta VALUES ('colorIndex', ?)`, String(idx + 1));
      }
      const displayName = msg.name.slice(0, 30);
      this.sql.exec(`INSERT OR REPLACE INTO players VALUES (?, ?, ?)`, playerKey, displayName, color);
      this.broadcast({ type: 'SYNC_CANVAS', ...this.buildCanvasState() });
      this.broadcastConnectedUsers();
    }

    else if (msg.type === 'GAME_PAINT') {
      const { x, y } = msg;
      if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE || !TARGET[y][x]) return;
      const playerKey = attachment.email || attachment.name;
      const playerRow = [...this.sql.exec(`SELECT color FROM players WHERE id = ?`, playerKey)];
      if (playerRow.length === 0) return;
      const color = playerRow[0].color as string;
      this.sql.exec(
        `INSERT OR REPLACE INTO canvas_cells VALUES (?, ?, ?, ?)`,
        x, y, color, playerKey
      );
      this.broadcast({ type: 'SYNC_CANVAS', ...this.buildCanvasState() });
    }

    else if (msg.type === 'GAME_RESET') {
      if (role !== 'presenter') return;
      this.sql.exec(`DELETE FROM canvas_cells`);
      this.broadcast({ type: 'SYNC_CANVAS', ...this.buildCanvasState() });
    }
  }

  webSocketClose(ws: WebSocket): void {
    this.broadcastConnectedUsers(ws);
  }

  webSocketError(ws: WebSocket, _error: unknown): void {
    this.broadcastConnectedUsers(ws);
  }

  private getStepIndex(): number {
    const rows = [...this.sql.exec(`SELECT value FROM meta WHERE key = 'stepIndex'`)];
    return rows.length > 0 ? parseInt(rows[0].value as string, 10) : 0;
  }

  private getPollResults(pollId: string): Record<string, number> {
    const rows = [...this.sql.exec(`SELECT choice, count FROM votes WHERE poll_id = ?`, pollId)];
    const results: Record<string, number> = {};
    for (const row of rows) results[row.choice as string] = row.count as number;
    return results;
  }

  private buildCanvasState(): { canvas: (string | null)[][]; progress: number; players: Record<string, { id: string; name: string; color: string }> } {
    const canvas: (string | null)[][] = Array.from({ length: GRID_SIZE }, () =>
      Array<string | null>(GRID_SIZE).fill(null)
    );

    const cellRows = [...this.sql.exec(`SELECT x, y, color FROM canvas_cells`)];
    let filledCount = 0;
    for (const row of cellRows) {
      const x = row.x as number, y = row.y as number;
      canvas[y][x] = row.color as string;
      if (TARGET[y][x]) filledCount++;
    }

    const playerRows = [...this.sql.exec(`SELECT id, name, color FROM players`)];
    const players: Record<string, { id: string; name: string; color: string }> = {};
    for (const row of playerRows) {
      players[row.id as string] = { id: row.id as string, name: row.name as string, color: row.color as string };
    }

    return {
      canvas,
      progress: TARGET_CELL_COUNT > 0 ? Math.round((filledCount / TARGET_CELL_COUNT) * 100) : 0,
      players,
    };
  }

  private getConnectedUsers(exclude?: WebSocket): ConnectedUser[] {
    const seen = new Set<string>();
    const users: ConnectedUser[] = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      const att = ws.deserializeAttachment() as Attachment;
      const key = att.email || att.name;
      if (seen.has(key)) continue;
      seen.add(key);
      const playerRow = [...this.sql.exec(`SELECT color FROM players WHERE id = ?`, key)];
      const color = playerRow.length > 0 ? (playerRow[0].color as string) : undefined;
      users.push({ name: att.name, color });
    }
    return users;
  }

  private broadcastConnectedUsers(exclude?: WebSocket): void {
    const users = this.getConnectedUsers(exclude);
    const text = JSON.stringify({ type: 'CONNECTED_USERS', users } satisfies OutboundMsg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      try { ws.send(text); } catch { /* ignore closed sockets */ }
    }
  }

  private broadcast(msg: OutboundMsg): void {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(text); } catch { /* ignore closed sockets */ }
    }
  }
}
