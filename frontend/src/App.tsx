import { useEffect, useMemo } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { PresenterApp } from './PresenterApp';
import { ParticipantApp } from './ParticipantApp';

const WS_BASE = (import.meta.env.VITE_WS_URL as string | undefined) ?? 'ws://localhost:8787';
const TOKEN_KEY = 'presenter_token';

function decodeJwtName(token: string): string {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { name?: string };
    return typeof payload.name === 'string' ? payload.name : 'Guest';
  } catch {
    return 'Guest';
  }
}

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
  // 2. localStorage (persists across reloads)
  const stored = localStorage.getItem(TOKEN_KEY);
  if (stored) return stored;
  // 3. Env var baked in at build/dev time (written by dev.sh)
  const envToken = import.meta.env.VITE_AGENT_TOKEN as string | undefined;
  return envToken ?? null;
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

export function App() {
  const token = useMemo(() => getToken(), []);
  const wsUrl = `${WS_BASE}/room/main?token=${encodeURIComponent(token ?? '')}`;
  const { state, send } = useWebSocket(wsUrl, !token);
  const myName = token ? decodeJwtName(token) : 'Guest';

  useEffect(() => {
    document.title = state.role === 'presenter' ? '🎤 Presenter — DrugBank Workshop' : 'DrugBank AI Workshop';
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
    return <PresenterApp state={state} send={send} myName={myName} token={token} />;
  }
  return <ParticipantApp state={state} send={send} myName={myName} />;
}
