import { emptyCanvasState, type CanvasState, type InboundMsg, type MatchState, type OutboundMsg } from '@workshop/protocol';

export interface AgentIdentity {
  name: string;
  ownerId: string;
  isAgent: boolean;
  agentLabel?: string;
}

export interface PresentationSnapshot {
  stepIndex: number;
  role: string;
  activeGameId: string | null;
  periodicMatch: MatchState;
  pixelHeart: CanvasState;
  identity: AgentIdentity;
  version: number;
}

type SyncListener = (snapshot: PresentationSnapshot) => void;

const PRESENTATION_STEPS: { type: string; gameId?: string }[] = [
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

function activeGameForStep(stepIndex: number): string | null {
  const step = PRESENTATION_STEPS[stepIndex];
  return step?.type === 'game' ? (step.gameId ?? null) : null;
}

export class PresentationClient {
  private ws: WebSocket | null = null;
  private version = 0;
  private stepIndex = 0;
  private role = 'participant';
  private periodicMatch: MatchState = {
    matchBoard: [],
    matchClaimed: [],
    matchPending: {},
    matchRevealed: {},
    matchPaused: false,
    matchScores: [],
    matchElementCount: 118,
    matchPendingTimeoutMs: 5000,
    gameOver: false,
    catchUpEnabled: false,
    showCooldown: false,
    matchCooldowns: {},
    catchupActiveWindowMs: 30000,
  };
  private pixelHeart: CanvasState = emptyCanvasState();
  private identity: AgentIdentity = { name: 'Guest', ownerId: '', isAgent: false };
  private listeners: SyncListener[] = [];
  private waiters: Array<{ minVersion: number; resolve: (s: PresentationSnapshot) => void; timer: ReturnType<typeof setTimeout> }> = [];

  constructor(
    private readonly wsUrl: string,
    private readonly displayName: string,
    private readonly agentMeta?: { ownerId: string; agentLabel: string },
  ) {}

  connect(): Promise<PresentationSnapshot> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      let settled = false;
      const settle = (fn: () => void) => {
        if (!settled) {
          settled = true;
          fn();
        }
      };

      ws.onmessage = (event) => {
        let msg: OutboundMsg;
        try {
          msg = JSON.parse(event.data as string) as OutboundMsg;
        } catch {
          return;
        }
        this.applyMessage(msg);
        if (msg.type === 'WELCOME') {
          if (this.agentMeta) {
            this.identity = {
              name: this.displayName,
              ownerId: this.agentMeta.ownerId,
              isAgent: true,
              agentLabel: this.agentMeta.agentLabel,
            };
          }
          settle(() => resolve(this.snapshot()));
        }
      };

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'GAME_JOIN', name: this.displayName } satisfies InboundMsg));
      };

      ws.onerror = () => settle(() => reject(new Error('WebSocket error')));
      ws.onclose = () => settle(() => reject(new Error('Connection closed before WELCOME')));
    });
  }

  onSync(cb: SyncListener): void {
    this.listeners.push(cb);
  }

  getSnapshot(): PresentationSnapshot {
    return this.snapshot();
  }

  sendAction(msg: InboundMsg | ({ type: string } & Record<string, unknown>)): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  waitForUpdate(minVersion = this.version, timeoutMs = 25_000): Promise<PresentationSnapshot> {
    if (this.version > minVersion) return Promise.resolve(this.snapshot());
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === resolve);
        if (idx >= 0) this.waiters.splice(idx, 1);
        resolve(this.snapshot());
      }, timeoutMs);
      this.waiters.push({ minVersion, resolve, timer });
    });
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  private snapshot(): PresentationSnapshot {
    return {
      stepIndex: this.stepIndex,
      role: this.role,
      activeGameId: activeGameForStep(this.stepIndex),
      periodicMatch: this.structuredClone(this.periodicMatch),
      pixelHeart: this.structuredClone(this.pixelHeart),
      identity: { ...this.identity },
      version: this.version,
    };
  }

  private structuredClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private bump(): void {
    this.version += 1;
    const snap = this.snapshot();
    for (const cb of this.listeners) cb(snap);
    const ready = this.waiters.filter((w) => this.version > w.minVersion);
    this.waiters = this.waiters.filter((w) => this.version <= w.minVersion);
    for (const w of ready) {
      clearTimeout(w.timer);
      w.resolve(snap);
    }
  }

  private applyMessage(msg: OutboundMsg): void {
    switch (msg.type) {
      case 'WELCOME':
        this.stepIndex = msg.stepIndex;
        this.role = msg.role;
        this.periodicMatch = {
          matchBoard: msg.matchBoard,
          matchClaimed: msg.matchClaimed,
          matchPending: msg.matchPending,
          matchRevealed: msg.matchRevealed,
          matchPaused: msg.matchPaused,
          matchScores: msg.matchScores,
          matchElementCount: msg.matchElementCount,
          matchPendingTimeoutMs: msg.matchPendingTimeoutMs,
          gameOver: msg.gameOver,
          catchUpEnabled: msg.catchUpEnabled,
          showCooldown: msg.showCooldown,
          matchCooldowns: msg.matchCooldowns,
          catchupActiveWindowMs: msg.catchupActiveWindowMs ?? 30000,
        };
        this.pixelHeart = extractCanvasState(msg);
        this.bump();
        break;
      case 'SYNC_STEP':
        this.stepIndex = msg.stepIndex;
        this.bump();
        break;
      case 'SYNC_MATCH':
        this.periodicMatch = {
          matchBoard: msg.matchBoard,
          matchClaimed: msg.matchClaimed,
          matchPending: msg.matchPending,
          matchRevealed: msg.matchRevealed,
          matchPaused: msg.matchPaused,
          matchScores: msg.matchScores,
          matchElementCount: msg.matchElementCount,
          matchPendingTimeoutMs: msg.matchPendingTimeoutMs,
          gameOver: msg.gameOver,
          catchUpEnabled: msg.catchUpEnabled,
          showCooldown: msg.showCooldown,
          matchCooldowns: msg.matchCooldowns,
          catchupActiveWindowMs: msg.catchupActiveWindowMs ?? 30000,
        };
        this.bump();
        break;
      case 'SYNC_CANVAS':
        this.pixelHeart = extractCanvasState(msg);
        this.bump();
        break;
      default:
        break;
    }
  }
}

function extractCanvasState(msg: OutboundMsg & Partial<CanvasState>): CanvasState {
  const base = emptyCanvasState();
  return {
    canvas: msg.canvas ?? base.canvas,
    cols: msg.cols ?? base.cols,
    rows: msg.rows ?? base.rows,
    progress: msg.progress ?? 0,
    harmony: msg.harmony ?? 0,
    players: msg.players ?? {},
    powerups: msg.powerups ?? [],
    effects: msg.effects ?? {},
    claims: msg.claims ?? [],
    config: { ...base.config, ...((msg.config as Partial<CanvasState['config']>) ?? {}) },
    wormLastPaints: msg.wormLastPaints ?? {},
    paintsUntilNextPowerup: msg.paintsUntilNextPowerup ?? null,
  };
}

export function buildRoomWsUrl(baseUrl: string, roomId: string, token: string, agentLabel?: string): string {
  const wsBase = baseUrl.replace(/^http/, 'ws');
  const url = new URL(`${wsBase}/room/${roomId}`);
  url.searchParams.set('token', token);
  if (agentLabel) url.searchParams.set('agentLabel', agentLabel);
  return url.toString();
}
