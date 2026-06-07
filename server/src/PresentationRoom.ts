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

interface MatchState {
  matchBoard: string[];
  matchClaimed: (string | null)[];
  matchPending: Record<string, string>;
  matchRevealed: Record<string, string>;
  matchPaused: boolean;
  matchScores: { id: string; name: string; color: string; count: number }[];
  matchElementCount: number;
  gameOver: boolean;
}

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
  | { type: 'GAME_RESET' }
  | { type: 'MATCH_FLIP'; pos: number }
  | { type: 'MATCH_PAUSE' }
  | { type: 'MATCH_RESET' }
  | { type: 'MATCH_SET_SIZE'; count: number };

type ConnectedUser = { name: string; color?: string };

type OutboundMsg =
  | ({ type: 'WELCOME'; stepIndex: number; role: string; canvas: (string | null)[][]; progress: number; players: Record<string, { id: string; name: string; color: string }> } & MatchState)
  | { type: 'SYNC_STEP'; stepIndex: number }
  | { type: 'POLL_UPDATES'; pollId: string; results: Record<string, number> }
  | { type: 'POLL_RESET'; pollId: string }
  | { type: 'SYNC_CANVAS'; canvas: (string | null)[][]; progress: number; players: Record<string, { id: string; name: string; color: string }> }
  | ({ type: 'SYNC_MATCH' } & MatchState)
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
      // Migrate match_reveal table if player_key column is missing
      try { this.sql.exec(`ALTER TABLE match_reveal ADD COLUMN player_key TEXT NOT NULL DEFAULT ''`); } catch { /* already exists */ }
      const cnt = [...this.sql.exec('SELECT COUNT(*) as cnt FROM match_board')][0].cnt as number;
      if (cnt === 0) this.initMatchBoard();
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
    const matchState = this.buildMatchState();
    const stepIndex = this.getStepIndex();
    server.send(JSON.stringify({
      type: 'WELCOME',
      stepIndex,
      role,
      ...canvasState,
      ...matchState,
    } satisfies OutboundMsg));

    this.broadcastConnectedUsers();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
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
        this.sql.exec(`DELETE FROM vote_records WHERE poll_id = ? AND participant_id = ?`, pollId, participantId);
        this.sql.exec(`UPDATE votes SET count = MAX(0, count - 1) WHERE poll_id = ? AND choice = ?`, pollId, choice);
      } else {
        if (previousChoice !== null) {
          this.sql.exec(`UPDATE votes SET count = MAX(0, count - 1) WHERE poll_id = ? AND choice = ?`, pollId, previousChoice);
        }
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
      const playerKey = attachment.email || attachment.name;
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
      this.broadcast({ type: 'SYNC_MATCH', ...this.buildMatchState() });
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

    else if (msg.type === 'MATCH_FLIP') {
      const pos = typeof msg.pos === 'number' ? Math.floor(msg.pos) : -1;
      if (pos < 0 || pos >= ELEMENTS.length * 2) return;

      const pausedRow = [...this.sql.exec(`SELECT value FROM meta WHERE key = 'match_paused'`)];
      if (pausedRow.length > 0 && pausedRow[0].value === 'true') return;

      const claimedAt = [...this.sql.exec(`SELECT pos FROM match_claimed WHERE pos = ?`, pos)];
      if (claimedAt.length > 0) return;

      const pendingAt = [...this.sql.exec(`SELECT player_key FROM match_pending WHERE pos = ?`, pos)];
      if (pendingAt.length > 0) return;

      const revealedAt = [...this.sql.exec(`SELECT pos FROM match_reveal WHERE pos = ?`, pos)];
      if (revealedAt.length > 0) return;

      const playerKey = attachment.email || attachment.name;
      const playerRow = [...this.sql.exec(`SELECT color FROM players WHERE id = ?`, playerKey)];
      if (playerRow.length === 0) return;
      const playerColor = playerRow[0].color as string;

      const symbolRow = [...this.sql.exec(`SELECT symbol FROM match_board WHERE pos = ?`, pos)];
      if (symbolRow.length === 0) return;
      const symbol = symbolRow[0].symbol as string;

      const myPending = [...this.sql.exec(`SELECT pos FROM match_pending WHERE player_key = ?`, playerKey)];

      if (myPending.length === 0) {
        // Block new first flips while player's mismatch reveal is still showing
        const playerReveal = [...this.sql.exec(`SELECT pos FROM match_reveal WHERE player_key = ?`, playerKey)];
        if (playerReveal.length > 0) return;
        this.sql.exec(`INSERT OR REPLACE INTO match_pending VALUES (?, ?)`, playerKey, pos);
      } else {
        const firstPos = myPending[0].pos as number;
        if (firstPos === pos) return;

        const firstRow = [...this.sql.exec(`SELECT symbol FROM match_board WHERE pos = ?`, firstPos)];
        const firstSymbol = firstRow.length > 0 ? firstRow[0].symbol as string : '';
        this.sql.exec(`DELETE FROM match_pending WHERE player_key = ?`, playerKey);

        if (symbol === firstSymbol) {
          this.sql.exec(`INSERT OR REPLACE INTO match_claimed VALUES (?, ?, ?)`, pos, playerKey, playerColor);
          this.sql.exec(`INSERT OR REPLACE INTO match_claimed VALUES (?, ?, ?)`, firstPos, playerKey, playerColor);
        } else {
          // Show both tiles face-up for 1s, then auto-hide via alarm
          const expiry = Date.now() + 1000;
          this.sql.exec(`INSERT OR REPLACE INTO match_reveal VALUES (?, ?, ?, ?)`, pos, playerColor, expiry, playerKey);
          this.sql.exec(`INSERT OR REPLACE INTO match_reveal VALUES (?, ?, ?, ?)`, firstPos, playerColor, expiry, playerKey);
          const earliest = [...this.sql.exec(`SELECT MIN(expiry_ms) as t FROM match_reveal`)][0].t as number;
          await this.ctx.storage.setAlarm(earliest);
        }
      }

      this.broadcast({ type: 'SYNC_MATCH', ...this.buildMatchState() });
    }

    else if (msg.type === 'MATCH_PAUSE') {
      if (role !== 'presenter') return;
      const pausedRow = [...this.sql.exec(`SELECT value FROM meta WHERE key = 'match_paused'`)];
      const currentlyPaused = pausedRow.length > 0 && pausedRow[0].value === 'true';
      this.sql.exec(`INSERT OR REPLACE INTO meta VALUES ('match_paused', ?)`, currentlyPaused ? 'false' : 'true');
      this.broadcast({ type: 'SYNC_MATCH', ...this.buildMatchState() });
    }

    else if (msg.type === 'MATCH_RESET') {
      if (role !== 'presenter') return;
      this.sql.exec(`DELETE FROM match_claimed`);
      this.sql.exec(`DELETE FROM match_pending`);
      this.sql.exec(`DELETE FROM match_reveal`);
      this.sql.exec(`DELETE FROM meta WHERE key = 'match_paused'`);
      this.initMatchBoard();
      this.broadcast({ type: 'SYNC_MATCH', ...this.buildMatchState() });
    }

    else if (msg.type === 'MATCH_SET_SIZE') {
      if (role !== 'presenter') return;
      const count = Math.min(Math.max(5, Math.floor(msg.count)), ELEMENTS.length);
      this.sql.exec(`INSERT OR REPLACE INTO meta VALUES ('match_element_count', ?)`, String(count));
      this.broadcast({ type: 'SYNC_MATCH', ...this.buildMatchState() });
    }
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    this.sql.exec(`DELETE FROM match_reveal WHERE expiry_ms <= ?`, now);
    this.broadcast({ type: 'SYNC_MATCH', ...this.buildMatchState() });
    // Re-schedule if more reveals are still pending
    const rows = [...this.sql.exec(`SELECT MIN(expiry_ms) as t FROM match_reveal`)];
    const next = rows[0]?.t as number | null;
    if (next) await this.ctx.storage.setAlarm(next);
  }

  webSocketClose(ws: WebSocket): void {
    const att = ws.deserializeAttachment() as Attachment;
    const playerKey = att.email || att.name;
    this.sql.exec(`DELETE FROM match_pending WHERE player_key = ?`, playerKey);
    this.broadcastConnectedUsers(ws);
  }

  webSocketError(ws: WebSocket, _error: unknown): void {
    this.broadcastConnectedUsers(ws);
  }

  private initMatchBoard(): void {
    const countRow = [...this.sql.exec(`SELECT value FROM meta WHERE key = 'match_element_count'`)];
    const count = countRow.length > 0
      ? Math.min(Math.max(5, parseInt(countRow[0].value as string, 10)), ELEMENTS.length)
      : ELEMENTS.length;
    const elements = ELEMENTS.slice(0, count);
    const deck = [...elements, ...elements];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    this.sql.exec(`DELETE FROM match_board`);
    this.sql.exec(`DELETE FROM match_reveal`);
    for (let i = 0; i < deck.length; i++) {
      this.sql.exec(`INSERT INTO match_board VALUES (?, ?)`, i, deck[i]);
    }
  }

  private buildMatchState(): MatchState {
    const boardRows = [...this.sql.exec(`SELECT symbol FROM match_board ORDER BY pos`)];
    const matchBoard = boardRows.map(r => r.symbol as string);

    const claimedRows = [...this.sql.exec(`SELECT pos, color FROM match_claimed`)];
    const matchClaimed: (string | null)[] = Array(matchBoard.length).fill(null);
    for (const row of claimedRows) {
      matchClaimed[row.pos as number] = row.color as string;
    }
    const claimedCount = claimedRows.length;

    const pendingRows = [...this.sql.exec(`
      SELECT mp.pos, COALESCE(p.color, '#64748b') as color
      FROM match_pending mp
      LEFT JOIN players p ON p.id = mp.player_key
    `)];
    const matchPending: Record<string, string> = {};
    for (const row of pendingRows) {
      matchPending[String(row.pos as number)] = row.color as string;
    }

    const revealRows = [...this.sql.exec(`SELECT pos, color FROM match_reveal`)];
    const matchRevealed: Record<string, string> = {};
    for (const row of revealRows) {
      matchRevealed[String(row.pos as number)] = row.color as string;
    }

    const pausedRow = [...this.sql.exec(`SELECT value FROM meta WHERE key = 'match_paused'`)];
    const matchPaused = pausedRow.length > 0 && pausedRow[0].value === 'true';

    const countRow = [...this.sql.exec(`SELECT value FROM meta WHERE key = 'match_element_count'`)];
    const matchElementCount = countRow.length > 0
      ? Math.min(Math.max(5, parseInt(countRow[0].value as string, 10)), ELEMENTS.length)
      : ELEMENTS.length;

    const scoreRows = [...this.sql.exec(`
      SELECT p.id, p.name, p.color, COUNT(mc.pos) as cnt
      FROM players p
      LEFT JOIN match_claimed mc ON mc.player_key = p.id
      GROUP BY p.id
      ORDER BY cnt DESC
    `)];
    const matchScores = scoreRows.map(r => ({
      id: r.id as string,
      name: r.name as string,
      color: r.color as string,
      count: Math.floor((r.cnt as number) / 2),
    }));

    return { matchBoard, matchClaimed, matchPending, matchRevealed, matchPaused, matchScores, matchElementCount, gameOver: claimedCount === matchBoard.length };
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

  private colorForKey(key: string): string {
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (Math.imul(hash, 31) + key.charCodeAt(i)) >>> 0;
    return PLAYER_COLORS[hash % PLAYER_COLORS.length];
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
      const color = playerRow.length > 0 ? (playerRow[0].color as string) : this.colorForKey(key);
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
