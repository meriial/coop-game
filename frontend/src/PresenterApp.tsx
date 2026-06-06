import { useEffect, useState } from 'react';
import { presentationSteps } from './config/presentationConfig';
import type { WsState } from './hooks/useWebSocket';
import { StageRenderer } from './components/StageRenderer';

interface Props {
  state: WsState;
  send: (msg: Record<string, unknown> & { type: string }) => void;
  myName: string;
}

export function PresenterApp({ state, send, myName }: Props) {
  const step = presentationSteps[state.stepIndex] ?? presentationSteps[0];
  const isGame = step.type === 'game';
  const total = presentationSteps.length;
  const [usersOpen, setUsersOpen] = useState(false);

  const goTo = (idx: number) => {
    const clamped = Math.max(0, Math.min(total - 1, idx));
    send({ type: 'STEP_CHANGE', stepIndex: clamped });
  };

  useEffect(() => {
    if (isGame) return; // disable global keys during game
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') goTo(state.stepIndex + 1);
      if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   goTo(state.stepIndex - 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.stepIndex, isGame]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-screen h-screen bg-slate-950 overflow-hidden relative flex flex-col">
      {/* Main stage */}
      <div className="flex-1 overflow-hidden relative">
        <StageRenderer wsState={state} send={send} isPresenter myName={myName} />
        {/* Name badge */}
        <div className="absolute top-3 right-4 bg-slate-900/80 backdrop-blur-sm border border-slate-700/60 px-3 py-1.5 rounded-full text-xs text-slate-300 pointer-events-none z-50">
          {myName}
        </div>
      </div>

      {/* Presenter control bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-t border-slate-700/60 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-indigo-400 text-xs font-semibold uppercase tracking-widest">Presenter</span>
          <span className="text-slate-500 text-xs">·</span>
          <span className="text-slate-400 text-xs">{myName}</span>
          <button
            onClick={() => setUsersOpen(o => !o)}
            className="ml-2 flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2.5 py-1 rounded-full text-xs text-slate-300 transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            {state.connectedUsers.length} connected
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => goTo(state.stepIndex - 1)}
            disabled={state.stepIndex === 0}
            className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-slate-300 text-sm hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          <span className="text-slate-400 text-sm font-mono">
            {state.stepIndex + 1} / {total}
          </span>
          <button
            onClick={() => goTo(state.stepIndex + 1)}
            disabled={state.stepIndex === total - 1}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 border border-indigo-500 text-white text-sm hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>

        <div className="text-slate-500 text-xs hidden sm:block">
          {isGame ? 'Game active — arrow keys disabled' : '← → or PageUp/Down to navigate'}
        </div>
      </div>

      {/* Connected users drawer */}
      {usersOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setUsersOpen(false)}
        />
      )}
      <div className={[
        'fixed bottom-[52px] left-6 z-50 bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl w-64 transition-all duration-200 origin-bottom-left',
        usersOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none',
      ].join(' ')}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60">
          <span className="text-white text-sm font-semibold">Connected</span>
          <span className="text-slate-400 text-xs">{state.connectedUsers.length} user{state.connectedUsers.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="max-h-64 overflow-y-auto py-2">
          {state.connectedUsers.length === 0 ? (
            <p className="text-slate-500 text-xs px-4 py-2">No users connected</p>
          ) : (
            state.connectedUsers.map((u, i) => (
              <div key={i} className="flex items-center gap-2.5 px-4 py-2 hover:bg-slate-800/50">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: u.color ?? '#64748b' }}
                />
                <span className="text-slate-300 text-sm truncate">{u.name}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
