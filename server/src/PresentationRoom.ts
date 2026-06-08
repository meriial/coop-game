import type { BgConfig, ConnectedUser, OutboundMsg, Player, RoomAttachment } from '@workshop/protocol';
import { resolvePlayerKey } from '@workshop/protocol';
import { createGameContext } from '@workshop/game-core/server';
import { periodicMatchEngine, clearMatchPendingForPlayer } from '@workshop/game-periodic-match/engine';
import { pixelHeartEngine } from '@workshop/game-pixel-heart/engine';
import { gameRegistry } from './game-registry';

const PLAYER_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#84cc16', '#06b6d4', '#e11d48',
  '#a855f7', '#10b981', '#0ea5e9', '#f43f5e',
  '#d97706', '#7c3aed', '#0891b2', '#65a30d',
];

const PRESENTER_ONLY_GAME_TYPES = new Set([
  'GAME_RESET',
  'GAME_CONFIG',
  'GAME_DROP_POWERUP',
  'GAME_CLEAR_PLAYERS',
  'MATCH_PAUSE',
  'MATCH_RESET',
  'MATCH_SET_SIZE',
  'MATCH_SET_TIMEOUT',
  'MATCH_SET_CATCHUP',
  'MATCH_SET_SHOW_COOLDOWN',
  'MATCH_SET_ACTIVE_WINDOW',
  'MATCH_CLEAR_LEADERBOARD',
]);

type InboundMsg = { type: string; [key: string]: unknown };

export class PresentationRoom {
  private sql: SqlStorage;
  private gameCtx: ReturnType<typeof createGameContext>;

  constructor(private readonly ctx: DurableObjectState) {
    this.sql = ctx.storage.sql;
    this.gameCtx = createGameContext(this.sql, {
      getPlayers: () => this.getPlayers(),
      broadcast: (msg) => this.broadcast(msg as OutboundMsg),
      scheduleAlarm: (atMs) => this.ctx.storage.setAlarm(atMs),
      playerKey: (email, name) => email || name,
      assignColor: (playerKey) => this.assignColor(playerKey),
    });

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
        CREATE TABLE IF NOT EXISTS slider_records (
          poll_id TEXT NOT NULL, participant_id TEXT NOT NULL, value TEXT NOT NULL,
          PRIMARY KEY (poll_id, participant_id)
        );
        CREATE TABLE IF NOT EXISTS players (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL,
          owner_id TEXT NOT NULL DEFAULT '', is_agent INTEGER NOT NULL DEFAULT 0, agent_label TEXT
        );
      `);
      try { this.sql.exec(`ALTER TABLE players ADD COLUMN owner_id TEXT NOT NULL DEFAULT ''`); } catch { /* exists */ }
      try { this.sql.exec(`ALTER TABLE players ADD COLUMN is_agent INTEGER NOT NULL DEFAULT 0`); } catch { /* exists */ }
      try { this.sql.exec(`ALTER TABLE players ADD COLUMN agent_label TEXT`); } catch { /* exists */ }
      gameRegistry.initAll(this.gameCtx);
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const reqUrl = new URL(request.url);
    const agentLabel = reqUrl.searchParams.get('agentLabel')?.trim() || undefined;
    const role = (request.headers.get('X-User-Role') ?? 'participant') as 'presenter' | 'participant';
    const email = request.headers.get('X-User-Email') ?? '';
    const name = request.headers.get('X-User-Name') ?? 'Guest';
    const ownerId = email;
    const isAgent = Boolean(agentLabel);
    const displayName = isAgent && agentLabel ? `${name}'s ${agentLabel}` : name;
    const participantId = email || displayName;

    if (isAgent && agentLabel) {
      const activeGameId = this.getActiveGameId();
      const engine = activeGameId ? gameRegistry.get(activeGameId) : undefined;
      const cap = engine?.config?.maxAgentsPerOwner;
      if (cap !== undefined) {
        const sameLabel = [...this.sql.exec(
          `SELECT 1 FROM players WHERE owner_id = ? AND is_agent = 1 AND agent_label = ?`,
          ownerId, agentLabel,
        )].length > 0;
        if (!sameLabel) {
          const existing = [...this.sql.exec(
            `SELECT COUNT(*) as cnt FROM players WHERE owner_id = ? AND is_agent = 1`,
            ownerId,
          )][0].cnt as number;
          if (existing >= cap) {
            return new Response(`Agent limit (${cap}) reached for this owner`, { status: 403 });
          }
        }
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({
      role,
      email,
      name: displayName,
      participantId,
      ownerId,
      isAgent,
      agentLabel,
    } satisfies RoomAttachment);

    const matchState = periodicMatchEngine.buildState(this.gameCtx);
    const canvasState = pixelHeartEngine.buildState(this.gameCtx);
    const stepIndex = this.getStepIndex();
    server.send(JSON.stringify({
      type: 'WELCOME',
      stepIndex,
      role,
      ...canvasState,
      ...matchState,
      pollResults: this.buildAllPollResults(),
      pollValues: this.buildAllPollValues(),
      bgConfig: this.getBgConfig(),
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

    const attachment = ws.deserializeAttachment() as RoomAttachment;
    const { role, participantId } = attachment;

    if (msg.type === 'STEP_CHANGE') {
      if (role !== 'presenter') return;
      const idx = Math.max(0, Math.floor(msg.stepIndex as number));
      this.sql.exec(`INSERT OR REPLACE INTO meta VALUES ('stepIndex', ?)`, String(idx));
      this.broadcast({ type: 'SYNC_STEP', stepIndex: idx });
      return;
    }

    if (msg.type === 'BG_CONFIG') {
      if (role !== 'presenter') return;
      const config = msg.config as BgConfig;
      this.sql.exec(`INSERT OR REPLACE INTO meta VALUES ('bg_config', ?)`, JSON.stringify(config));
      this.broadcast({ type: 'SYNC_BG', config });
      return;
    }

    if (msg.type === 'RELOAD_CLIENTS') {
      if (role !== 'presenter') return;
      this.broadcastReload();
      return;
    }

    if (msg.type === 'SUBMIT_VOTE') {
      await this.handleVote(participantId, msg);
      return;
    }

    if (msg.type === 'RESET_POLL') {
      if (role !== 'presenter') return;
      const pollId = msg.pollId as string;
      this.sql.exec(`DELETE FROM votes WHERE poll_id = ?`, pollId);
      this.sql.exec(`DELETE FROM vote_records WHERE poll_id = ?`, pollId);
      this.sql.exec(`DELETE FROM slider_records WHERE poll_id = ?`, pollId);
      this.broadcast({ type: 'POLL_RESET', pollId });
      return;
    }

    if (msg.type === 'GAME_JOIN') {
      const player = this.upsertPlayer(attachment, msg.name as string);
      this.broadcast({ type: 'SYNC_CANVAS', ...pixelHeartEngine.buildState(this.gameCtx) });
      this.broadcast({ type: 'SYNC_MATCH', ...periodicMatchEngine.buildState(this.gameCtx) });
      this.broadcastConnectedUsers();
      periodicMatchEngine.onJoin?.(player, this.gameCtx);
      pixelHeartEngine.onJoin?.(player, this.gameCtx);
      return;
    }

    if (PRESENTER_ONLY_GAME_TYPES.has(msg.type) && role !== 'presenter') return;

    const engine = gameRegistry.route(msg.type);
    if (!engine) return;

    const playerKey = resolvePlayerKey(attachment);
    let player = this.getPlayerById(playerKey);
    if (!player && role === 'presenter' && PRESENTER_ONLY_GAME_TYPES.has(msg.type)) {
      player = {
        id: playerKey,
        name: attachment.name,
        color: '#64748b',
        ownerId: attachment.ownerId ?? attachment.email ?? attachment.name,
        isAgent: Boolean(attachment.isAgent),
        agentLabel: attachment.agentLabel,
      };
    } else if (!player && !PRESENTER_ONLY_GAME_TYPES.has(msg.type)) {
      // Player was cleared but is still connected — re-register on first action.
      player = this.upsertPlayer(attachment, attachment.name);
      this.broadcastConnectedUsers();
    }
    if (!player) return;

    await engine.handleMessage(player, msg, this.gameCtx);
  }

  async alarm(): Promise<void> {
    await periodicMatchEngine.onAlarm?.(this.gameCtx);
  }

  webSocketClose(ws: WebSocket): void {
    const att = ws.deserializeAttachment() as RoomAttachment;
    clearMatchPendingForPlayer(this.gameCtx, resolvePlayerKey(att));
    this.broadcastConnectedUsers(ws);
  }

  webSocketError(ws: WebSocket, _error: unknown): void {
    this.broadcastConnectedUsers(ws);
  }

  getActiveGameId(): string | null {
    const stepIndex = this.getStepIndex();
    const steps = this.getPresentationSteps();
    const step = steps[stepIndex];
    return step?.type === 'game' ? step.gameId : null;
  }

  private getPresentationSteps(): { type: string; gameId?: string }[] {
    const raw = this.gameCtx.meta.get('presentation_steps');
    if (raw) {
      try { return JSON.parse(raw) as { type: string; gameId?: string }[]; } catch { /* fall through */ }
    }
    return [
      { type: 'game', gameId: 'periodic-match' },
      { type: 'slide' },
      { type: 'slide' },
      { type: 'poll' },
      { type: 'poll' },
      { type: 'poll' },
      { type: 'results' },
      { type: 'game', gameId: 'pixel-heart' },
      { type: 'slide' },
    ];
  }

  private upsertPlayer(att: RoomAttachment, rawName: string): Player {
    const playerKey = resolvePlayerKey(att);
    this.sql.exec(`DELETE FROM players WHERE length(id) = 36 AND id LIKE '________-____-____-____-____________'`);
    const color = this.assignColor(playerKey);
    const displayName = rawName.slice(0, 30);
    const ownerId = att.ownerId ?? att.email ?? att.name;
    const isAgent = att.isAgent ? 1 : 0;
    this.sql.exec(
      `INSERT OR REPLACE INTO players (id, name, color, owner_id, is_agent, agent_label) VALUES (?, ?, ?, ?, ?, ?)`,
      playerKey,
      displayName,
      color,
      ownerId,
      isAgent,
      att.agentLabel ?? null,
    );
    return {
      id: playerKey,
      name: displayName,
      color,
      ownerId,
      isAgent: Boolean(att.isAgent),
      agentLabel: att.agentLabel,
    };
  }

  private getPlayerById(id: string): Player | undefined {
    return this.getPlayers().find((p) => p.id === id);
  }

  private getPlayers(): Player[] {
    const rows = [...this.sql.exec(`SELECT id, name, color, owner_id, is_agent, agent_label FROM players`)];
    return rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      color: row.color as string,
      ownerId: (row.owner_id as string) || (row.id as string),
      isAgent: Boolean(row.is_agent),
      agentLabel: (row.agent_label as string | null) ?? undefined,
    }));
  }

  private assignColor(playerKey: string): string {
    const existing = [...this.sql.exec(`SELECT color FROM players WHERE id = ?`, playerKey)];
    if (existing.length > 0) return existing[0].color as string;
    const indexRow = [...this.sql.exec(`SELECT value FROM meta WHERE key = 'colorIndex'`)];
    const idx = indexRow.length > 0 ? parseInt(indexRow[0].value as string, 10) : 0;
    const color = PLAYER_COLORS[idx % PLAYER_COLORS.length];
    this.sql.exec(`INSERT OR REPLACE INTO meta VALUES ('colorIndex', ?)`, String(idx + 1));
    return color;
  }

  private async handleVote(participantId: string, msg: InboundMsg): Promise<void> {
    const pollId = msg.pollId as string;
    const choice = msg.choice as string;
    const pollType = msg.pollType as string | undefined;

    if (pollType === 'slider1d' || pollType === 'slider2d') {
      this.sql.exec(
        `INSERT INTO slider_records (poll_id, participant_id, value) VALUES (?, ?, ?)
         ON CONFLICT(poll_id, participant_id) DO UPDATE SET value = excluded.value`,
        pollId, participantId, choice,
      );
      this.broadcast({ type: 'POLL_UPDATES', pollId, values: this.getSliderValues(pollId) });
      return;
    }

    const existing = [...this.sql.exec(
      `SELECT choice FROM vote_records WHERE poll_id = ? AND participant_id = ?`,
      pollId, participantId,
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
        pollId, choice,
      );
      this.sql.exec(
        `INSERT INTO vote_records (poll_id, participant_id, choice) VALUES (?, ?, ?)
         ON CONFLICT(poll_id, participant_id) DO UPDATE SET choice = excluded.choice`,
        pollId, participantId, choice,
      );
    }
    this.broadcast({ type: 'POLL_UPDATES', pollId, results: this.getPollResults(pollId) });
  }

  private getStepIndex(): number {
    const rows = [...this.sql.exec(`SELECT value FROM meta WHERE key = 'stepIndex'`)];
    return rows.length > 0 ? parseInt(rows[0].value as string, 10) : 0;
  }

  /** Stored background config, or null so the client falls back to its registry default. */
  private getBgConfig(): BgConfig | null {
    const rows = [...this.sql.exec(`SELECT value FROM meta WHERE key = 'bg_config'`)];
    if (rows.length === 0) return null;
    try { return JSON.parse(rows[0].value as string) as BgConfig; } catch { return null; }
  }

  private getPollResults(pollId: string): Record<string, number> {
    const rows = [...this.sql.exec(`SELECT choice, count FROM votes WHERE poll_id = ?`, pollId)];
    const results: Record<string, number> = {};
    for (const row of rows) results[row.choice as string] = row.count as number;
    return results;
  }

  private getSliderValues(pollId: string): string[] {
    const rows = [...this.sql.exec(`SELECT value FROM slider_records WHERE poll_id = ?`, pollId)];
    return rows.map((r) => r.value as string);
  }

  private buildAllPollResults(): Record<string, Record<string, number>> {
    const pollIds = [...this.sql.exec(`SELECT DISTINCT poll_id FROM votes`)].map((r) => r.poll_id as string);
    const out: Record<string, Record<string, number>> = {};
    for (const pid of pollIds) out[pid] = this.getPollResults(pid);
    return out;
  }

  private buildAllPollValues(): Record<string, string[]> {
    const pollIds = [...this.sql.exec(`SELECT DISTINCT poll_id FROM slider_records`)].map((r) => r.poll_id as string);
    const out: Record<string, string[]> = {};
    for (const pid of pollIds) out[pid] = this.getSliderValues(pid);
    return out;
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
      const att = ws.deserializeAttachment() as RoomAttachment;
      const key = resolvePlayerKey(att);
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

  /** Tell participant clients to reload (e.g. to pick up newly deployed assets). Skips presenters. */
  private broadcastReload(): void {
    const text = JSON.stringify({ type: 'RELOAD' } satisfies OutboundMsg);
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as RoomAttachment;
      if (att.role === 'presenter') continue;
      try { ws.send(text); } catch { /* ignore closed sockets */ }
    }
  }
}
