import { useEffect, useRef, useState, useCallback } from 'react';

export interface ConnectedUser { name: string; color?: string }

export interface MatchScore { id: string; name: string; color: string; count: number }

export interface WsState {
  stepIndex: number;
  role: 'presenter' | 'participant';
  pollResults: Record<string, Record<string, number>>;
  pollValues: Record<string, string[]>;
  pollResetSeq: Record<string, number>;
  canvas: (string | null)[][];
  progress: number;
  players: Record<string, { id: string; name: string; color: string }>;
  connectedUsers: ConnectedUser[];
  connected: boolean;
  matchBoard: string[];
  matchClaimed: (string | null)[];
  matchPending: Record<string, string>;
  matchRevealed: Record<string, string>;
  matchPaused: boolean;
  matchScores: MatchScore[];
  matchGameOver: boolean;
  matchElementCount: number;
}

const EMPTY_CANVAS: (string | null)[][] = Array.from({ length: 20 }, () => Array<string | null>(20).fill(null));

const DEFAULT_STATE: WsState = {
  stepIndex: 0,
  role: 'participant',
  pollResults: {},
  pollValues: {},
  pollResetSeq: {},
  canvas: EMPTY_CANVAS,
  progress: 0,
  players: {},
  connectedUsers: [],
  connected: false,
  matchBoard: [],
  matchClaimed: [],
  matchPending: {},
  matchRevealed: {},
  matchPaused: false,
  matchScores: [],
  matchGameOver: false,
  matchElementCount: 118,
};

type OutgoingMsg = Record<string, unknown> & { type: string };

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

      setState(prev => {
        switch (msg.type) {
          case 'WELCOME':
            return {
              ...prev,
              connected: true,
              stepIndex: (msg.stepIndex as number) ?? 0,
              role: (msg.role as 'presenter' | 'participant') ?? 'participant',
              pollResults: (msg.pollResults as Record<string, Record<string, number>>) ?? {},
              pollValues: (msg.pollValues as Record<string, string[]>) ?? {},
              canvas: (msg.canvas as (string | null)[][]) ?? EMPTY_CANVAS,
              progress: (msg.progress as number) ?? 0,
              players: (msg.players as WsState['players']) ?? {},
              matchBoard: (msg.matchBoard as string[]) ?? [],
              matchClaimed: (msg.matchClaimed as (string | null)[]) ?? [],
              matchPending: (msg.matchPending as Record<string, string>) ?? {},
              matchRevealed: (msg.matchRevealed as Record<string, string>) ?? {},
              matchPaused: (msg.matchPaused as boolean) ?? false,
              matchScores: (msg.matchScores as MatchScore[]) ?? [],
              matchGameOver: (msg.gameOver as boolean) ?? false,
              matchElementCount: (msg.matchElementCount as number) ?? 118,
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
              canvas: (msg.canvas as (string | null)[][]) ?? prev.canvas,
              progress: (msg.progress as number) ?? prev.progress,
              players: (msg.players as WsState['players']) ?? prev.players,
            };
          case 'SYNC_MATCH':
            return {
              ...prev,
              matchBoard: (msg.matchBoard as string[]) ?? prev.matchBoard,
              matchClaimed: (msg.matchClaimed as (string | null)[]) ?? prev.matchClaimed,
              matchPending: (msg.matchPending as Record<string, string>) ?? prev.matchPending,
              matchRevealed: (msg.matchRevealed as Record<string, string>) ?? prev.matchRevealed,
              matchPaused: (msg.matchPaused as boolean) ?? prev.matchPaused,
              matchScores: (msg.matchScores as MatchScore[]) ?? prev.matchScores,
              matchGameOver: (msg.gameOver as boolean) ?? prev.matchGameOver,
              matchElementCount: (msg.matchElementCount as number) ?? prev.matchElementCount,
            };
          case 'CONNECTED_USERS':
            return { ...prev, connectedUsers: (msg.users as ConnectedUser[]) ?? [] };
          default:
            return prev;
        }
      });
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return; // cleanup already ran — don't reconnect
      wsRef.current = null;
      setState(prev => ({ ...prev, connected: false }));
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
