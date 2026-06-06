import { useEffect, useRef, useState, useCallback } from 'react';

export interface WsState {
  stepIndex: number;
  role: 'presenter' | 'participant';
  pollResults: Record<string, Record<string, number>>;
  pollResetSeq: Record<string, number>;
  canvas: (string | null)[][];
  progress: number;
  players: Record<string, { id: string; name: string; color: string }>;
  connected: boolean;
}

const EMPTY_CANVAS: (string | null)[][] = Array.from({ length: 20 }, () => Array<string | null>(20).fill(null));

const DEFAULT_STATE: WsState = {
  stepIndex: 0,
  role: 'participant',
  pollResults: {},
  pollResetSeq: {},
  canvas: EMPTY_CANVAS,
  progress: 0,
  players: {},
  connected: false,
};

type OutgoingMsg = Record<string, unknown> & { type: string };

export function useWebSocket(url: string) {
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
              canvas: (msg.canvas as (string | null)[][]) ?? EMPTY_CANVAS,
              progress: (msg.progress as number) ?? 0,
              players: (msg.players as WsState['players']) ?? {},
            };
          case 'SYNC_STEP':
            return { ...prev, stepIndex: msg.stepIndex as number };
          case 'POLL_UPDATES': {
            const pollId = msg.pollId as string;
            return {
              ...prev,
              pollResults: {
                ...prev.pollResults,
                [pollId]: msg.results as Record<string, number>,
              },
            };
          }
          case 'POLL_RESET': {
            const pollId = msg.pollId as string;
            return {
              ...prev,
              pollResults: { ...prev.pollResults, [pollId]: {} },
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
          default:
            return prev;
        }
      });
    };

    ws.onclose = () => {
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
    connect();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const send = useCallback((msg: OutgoingMsg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { state, send };
}
