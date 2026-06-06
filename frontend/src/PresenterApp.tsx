import { useEffect } from 'react';
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
      <div className="flex-1 overflow-hidden">
        <StageRenderer wsState={state} send={send} isPresenter myName={myName} />
      </div>

      {/* Presenter control bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-t border-slate-700/60 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-indigo-400 text-xs font-semibold uppercase tracking-widest">Presenter</span>
          <span className="text-slate-500 text-xs">·</span>
          <span className="text-slate-400 text-xs">{myName}</span>
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
    </div>
  );
}
