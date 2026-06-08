import { useEffect, useRef, useState, useCallback } from 'react';
import { emptyCanvasState, type MatchState, type CanvasState } from '@workshop/protocol';

export interface ConnectedUser { name: string; color?: string }

export interface WsState {
  stepIndex: number;
  role: 'presenter' | 'participant';
  pollResults: Record<string, Record<string, number>>;
  pollValues: Record<string, string[]>;
  pollResetSeq: Record<string, number>;
  games: Record<string, unknown>;
  connectedUsers: ConnectedUser[];
  connected: boolean;
}

const DEFAULT_STATE: WsState = {
  stepIndex: 0,
  role: 'participant',
  pollResults: {},
  pollValues: {},
  pollResetSeq: {},
  games: {
    'pixel-heart': emptyCanvasState() satisfies CanvasState,
    'periodic-match': {
      matchBoard: [],
      matchClaimed: [],
      matchPending: {},
      matchRevealed: {},
      matchPaused: false,
      matchScores: [],
      matchElementCount: 118,
      gameOver: false,
    } satisfies MatchState,
  },
  connectedUsers: [],
  connected: false,
};

type OutgoingMsg = Record<string, unknown> & { type: string };

function patchPeriodicMatch(msg: Record<string, unknown>): MatchState {
  return {
    matchBoard: (msg.matchBoard as string[]) ?? [],
    matchClaimed: (msg.matchClaimed as (string | null)[]) ?? [],
    matchPending: (msg.matchPending as Record<string, string>) ?? {},
    matchRevealed: (msg.matchRevealed as Record<string, string>) ?? {},
    matchPaused: (msg.matchPaused as boolean) ?? false,
    matchScores: (msg.matchScores as MatchState['matchScores']) ?? [],
    matchElementCount: (msg.matchElementCount as number) ?? 118,
    gameOver: (msg.gameOver as boolean) ?? false,
  };
}

function patchCanvas(msg: Record<string, unknown>): CanvasState {
  const base = emptyCanvasState();
  return {
    canvas: (msg.canvas as (string | null)[][]) ?? base.canvas,
    cols: (msg.cols as number) ?? base.cols,
    rows: (msg.rows as number) ?? base.rows,
    progress: (msg.progress as number) ?? 0,
    harmony: (msg.harmony as number) ?? 0,
    players: (msg.players as CanvasState['players']) ?? {},
    powerups: (msg.powerups as CanvasState['powerups']) ?? [],
    effects: (msg.effects as CanvasState['effects']) ?? {},
    claims: (msg.claims as string[]) ?? [],
    config: (msg.config as CanvasState['config']) ?? base.config,
  };
}

export function useWebSocket(url: string, disabled = false) {
  const [state, setState] = useState<WsState>(DEFAULT_STATE);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(500);

  const connect = useCallback(() => {
    if (wsRef.current) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retryDelay.current = 500;
    };

    ws.onmessage = (event: MessageEvent) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(event.data as string) as Record<string, unknown>; } catch { return; }

      setState((prev) => {
        switch (msg.type) {
          case 'WELCOME':
            return {
              ...prev,
              connected: true,
              stepIndex: (msg.stepIndex as number) ?? 0,
              role: (msg.role as 'presenter' | 'participant') ?? 'participant',
              pollResults: (msg.pollResults as Record<string, Record<string, number>>) ?? {},
              pollValues: (msg.pollValues as Record<string, string[]>) ?? {},
              games: {
                ...prev.games,
                'periodic-match': patchPeriodicMatch(msg),
                'pixel-heart': patchCanvas(msg),
              },
            };
          case 'SYNC_STEP':
            return { ...prev, stepIndex: msg.stepIndex as number };
          case 'POLL_UPDATES': {
            const pollId = msg.pollId as string;
            if (msg.values !== undefined) {
              return {
                ...prev,
                pollValues: { ...prev.pollValues, [pollId]: msg.values as string[] },
              };
            }
            return {
              ...prev,
              pollResults: { ...prev.pollResults, [pollId]: msg.results as Record<string, number> },
            };
          }
          case 'POLL_RESET': {
            const pollId = msg.pollId as string;
            return {
              ...prev,
              pollResults: { ...prev.pollResults, [pollId]: {} },
              pollValues: { ...prev.pollValues, [pollId]: [] },
              pollResetSeq: { ...prev.pollResetSeq, [pollId]: ((prev.pollResetSeq?.[pollId] ?? 0) as number) + 1 },
            };
          }
          case 'SYNC_CANVAS':
            return {
              ...prev,
              games: {
                ...prev.games,
                'pixel-heart': patchCanvas(msg),
              },
            };
          case 'SYNC_MATCH':
            return {
              ...prev,
              games: {
                ...prev.games,
                'periodic-match': patchPeriodicMatch(msg),
              },
            };
          case 'CONNECTED_USERS':
            return { ...prev, connectedUsers: (msg.users as ConnectedUser[]) ?? [] };
          default:
            return prev;
        }
      });
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setState((prev) => ({ ...prev, connected: false }));
      retryRef.current = setTimeout(() => {
        retryDelay.current = Math.min(retryDelay.current * 2, 5000);
        connect();
      }, retryDelay.current);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [url]);

  useEffect(() => {
    if (disabled) return;
    connect();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect, disabled]);

  const send = useCallback((msg: OutgoingMsg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { state, send };
}

/** @deprecated Use games['periodic-match'] — kept for gradual migration */
export type MatchScore = MatchState['matchScores'][number];
