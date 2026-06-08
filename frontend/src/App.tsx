import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { PresenterApp } from './PresenterApp';
import { ParticipantApp } from './ParticipantApp';
import { TOKEN_KEY, decodeJwtName, decodeJwtEmail, decodeJwtRoom, isJwtExpired } from './jwt';

const WS_BASE = (import.meta.env.VITE_WS_URL as string | undefined) ||
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;

function getToken(): string | null {
  // 1. URL param (takes precedence, stored for future reloads)
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');
  if (urlToken) {
    localStorage.setItem(TOKEN_KEY, urlToken);
    params.delete('token');
    const newSearch = params.toString();
    window.history.replaceState({}, '', newSearch ? `?${newSearch}` : window.location.pathname);
    return urlToken;
  }
  // 2. localStorage (persists across reloads) — discard if expired
  const stored = localStorage.getItem(TOKEN_KEY);
  if (stored) {
    if (isJwtExpired(stored)) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return stored;
  }
  // 3. Env var baked in at build/dev time (written by dev.sh)
  const envToken = import.meta.env.VITE_AGENT_TOKEN as string | undefined;
  return envToken || null;
}

function NotAuthenticated() {
  return (
    <div className="w-screen h-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-400 text-center max-w-sm px-6">
        <p className="text-slate-200 text-lg font-semibold">Authentication required</p>
        <p className="text-sm">Run the workshop setup script to join the presentation.</p>
        <code className="mt-2 px-3 py-1.5 bg-slate-800 rounded text-indigo-300 text-xs font-mono">
          bash &lt;(curl -fsSL https://raw.githubusercontent.com/meriial/coop-game/main/setup.sh)
        </code>
      </div>
    </div>
  );
}

const IS_DEV = import.meta.env.DEV;

export function App() {
  const token = useMemo(() => getToken(), []);
  const [devRoleOverride, setDevRoleOverride] = useState<'presenter' | 'participant' | null>(null);

  const room = token ? decodeJwtRoom(token) : 'main';
  const wsUrl = useMemo(() => {
    const base = `${WS_BASE}/room/${room}?token=${encodeURIComponent(token ?? '')}`;
    return devRoleOverride ? `${base}&devRole=${devRoleOverride}` : base;
  }, [token, room, devRoleOverride]);

  const { state, send } = useWebSocket(wsUrl, !token);
  const myName = token ? decodeJwtName(token) : 'Guest';
  const myOwner = token ? (decodeJwtEmail(token) || myName) : myName;

  const [myVotes, setMyVotesState] = useState<Record<string, string | null>>({});
  const prevResetSeq = useRef<Record<string, number>>({});
  useEffect(() => {
    const newSeqs = state.pollResetSeq;
    const toClear: string[] = [];
    for (const [pid, seq] of Object.entries(newSeqs)) {
      if (seq !== (prevResetSeq.current[pid] ?? 0)) toClear.push(pid);
    }
    if (toClear.length > 0) {
      setMyVotesState(prev => {
        const next = { ...prev };
        for (const pid of toClear) delete next[pid];
        return next;
      });
    }
    prevResetSeq.current = { ...newSeqs };
  }, [state.pollResetSeq]);
  const setMyVote = useCallback((pollId: string, v: string | null) => {
    setMyVotesState(prev => ({ ...prev, [pollId]: v }));
  }, []);

  const toggleDevRole = (IS_DEV || state.role === 'presenter')
    ? () => setDevRoleOverride(prev => (prev ?? state.role) === 'presenter' ? 'participant' : 'presenter')
    : undefined;

  useEffect(() => {
    document.title = state.role === 'presenter' ? '🎤 Presenter — AI Workshop' : 'AI Workshop';
  }, [state.role]);

  if (!token) {
    return <NotAuthenticated />;
  }

  if (!state.connected) {
    return (
      <div className="w-screen h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-slate-400">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Connecting…</p>
        </div>
      </div>
    );
  }

  if (state.role === 'presenter') {
    return <PresenterApp state={state} send={send} myName={myName} myOwner={myOwner} token={token} onToggleDevRole={toggleDevRole} myVotes={myVotes} setMyVote={setMyVote} />;
  }
  return <ParticipantApp state={state} send={send} myName={myName} myOwner={myOwner} onToggleDevRole={toggleDevRole} myVotes={myVotes} setMyVote={setMyVote} />;
}
