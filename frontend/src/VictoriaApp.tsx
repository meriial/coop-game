import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_KP_STATE, type KPState } from '@workshop/protocol';
import { KingsPrinterGame } from '@workshop/game-kings-printer/client';
import { Slide, Stack, H1, Subtext } from './components/slide-kit';

// ── Config ────────────────────────────────────────────────────────────────────

const HTTP_BASE =
  (import.meta.env.VITE_WS_URL as string | undefined)?.replace(/^wss?/, 'http') ??
  window.location.origin;

const WS_BASE =
  (import.meta.env.VITE_WS_URL as string | undefined) ??
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;

const VICTORIA_TOKEN_KEY = 'victoria-guest-token';

// ── JWT helpers ───────────────────────────────────────────────────────────────

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    return JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isTokenFresh(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  const exp = payload.exp as number | undefined;
  return !exp || exp > Date.now() / 1000;
}

// ── Victoria WS hook ──────────────────────────────────────────────────────────

interface VictoriaState {
  kpState: KPState;
  connected: boolean;
  myName: string;
  myOwner: string;
  connectedUsers: { name: string; color?: string }[];
}

function useVictoriaRoom() {
  const [token, setToken] = useState<string | null>(() => {
    const stored = sessionStorage.getItem(VICTORIA_TOKEN_KEY);
    return stored && isTokenFresh(stored) ? stored : null;
  });

  const [vs, setVs] = useState<VictoriaState>({
    kpState: DEFAULT_KP_STATE,
    connected: false,
    myName: 'Guest',
    myOwner: '',
    connectedUsers: [],
  });

  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(500);

  // Fetch guest token if needed
  useEffect(() => {
    if (token) return;
    fetch(`${HTTP_BASE}/victoria-join`)
      .then((r) => r.json())
      .then(({ token: t, name }: { token: string; name: string }) => {
        sessionStorage.setItem(VICTORIA_TOKEN_KEY, t);
        setToken(t);
        setVs((prev) => ({ ...prev, myName: name }));
      })
      .catch(console.error);
  }, [token]);

  // Decode identity from token
  useEffect(() => {
    if (!token) return;
    const payload = decodeJwtPayload(token);
    if (!payload) return;
    setVs((prev) => ({
      ...prev,
      myName: (payload.name as string) || prev.myName,
      myOwner: (payload.email as string) || '',
    }));
  }, [token]);

  const connect = useCallback(() => {
    if (!token || wsRef.current) return;
    const ws = new WebSocket(`${WS_BASE}/room/victoria?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      retryDelay.current = 500;
      setVs((prev) => ({ ...prev, connected: true }));
    };

    ws.onmessage = (e) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(e.data as string) as Record<string, unknown>; } catch { return; }

      if (msg.type === 'WELCOME' || msg.type === 'SYNC_KP') {
        const kp: KPState = {
          kpPhase: (msg.kpPhase as KPState['kpPhase']) ?? 'waiting',
          kpPlayers: (msg.kpPlayers as KPState['kpPlayers']) ?? [],
          kpDocuments: (msg.kpDocuments as KPState['kpDocuments']) ?? [],
          kpScore: (msg.kpScore as number) ?? 0,
          kpFailed: (msg.kpFailed as number) ?? 0,
          kpTimeRemaining: (msg.kpTimeRemaining as number) ?? 180,
        };
        setVs((prev) => ({ ...prev, kpState: kp }));
      }
      if (msg.type === 'CONNECTED_USERS') {
        setVs((prev) => ({ ...prev, connectedUsers: (msg.users as { name: string; color?: string }[]) ?? [] }));
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      setVs((prev) => ({ ...prev, connected: false }));
      retryRef.current = setTimeout(() => {
        retryDelay.current = Math.min(retryDelay.current * 2, 5000);
        connect();
      }, retryDelay.current);
    };

    ws.onerror = () => ws.close();
  }, [token]);

  useEffect(() => {
    connect();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const send = useCallback((msg: Record<string, unknown> & { type: string }) => {
    // Auto-join on first meaningful action
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { vs, send };
}

// ── Slides ────────────────────────────────────────────────────────────────────

function HelloWorldSlide() {
  return (
    <div className="w-full h-full">
      <Slide bg="dot" accent="emerald">
        <Stack gap="lg" align="center">
          <H1>Hello, World</H1>
          <Subtext>Victoria</Subtext>
        </Stack>
      </Slide>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

export function VictoriaApp() {
  const { vs, send } = useVictoriaRoom();
  const [stepIndex, setStepIndex] = useState(0);

  // Auto-send GAME_JOIN when connected so the player appears in the lobby
  const joinedRef = useRef(false);
  useEffect(() => {
    if (vs.connected && vs.myName && !joinedRef.current) {
      joinedRef.current = true;
      send({ type: 'GAME_JOIN', name: vs.myName });
    }
  }, [vs.connected, vs.myName, send]);

  const steps = [
    // Step 0: The King's Printer game
    <KingsPrinterGame
      key="game"
      state={vs.kpState}
      send={send}
      isHost={false}
      myName={vs.myName}
      myOwner={vs.myOwner}
      connectedUsers={vs.connectedUsers}
    />,
    // Step 1: Hello World slide
    <HelloWorldSlide key="hello" />,
  ];

  return (
    <div className="w-screen h-screen bg-slate-950 relative overflow-hidden">
      {steps[stepIndex]}

      {/* Step navigation */}
      {stepIndex > 0 && (
        <button
          onClick={() => setStepIndex((i) => i - 1)}
          className="fixed bottom-4 left-4 z-40 w-10 h-10 rounded-full bg-slate-800/80 border border-slate-600 text-slate-300 text-lg flex items-center justify-center hover:bg-slate-700 transition-colors"
          aria-label="Previous"
        >
          ←
        </button>
      )}
      {stepIndex < steps.length - 1 && (
        <button
          onClick={() => setStepIndex((i) => i + 1)}
          className="fixed bottom-4 right-4 z-40 w-10 h-10 rounded-full bg-slate-800/80 border border-slate-600 text-slate-300 text-lg flex items-center justify-center hover:bg-slate-700 transition-colors"
          aria-label="Next"
        >
          →
        </button>
      )}

      {/* Connection indicator */}
      {!vs.connected && (
        <div className="fixed top-2 right-2 z-40 flex items-center gap-1.5 bg-slate-900/90 rounded px-2 py-1">
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
          <span className="text-slate-400 text-xs">connecting…</span>
        </div>
      )}
    </div>
  );
}
