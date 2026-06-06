import type { WsState } from './hooks/useWebSocket';
import { StageRenderer } from './components/StageRenderer';

interface Props {
  state: WsState;
  send: (msg: Record<string, unknown> & { type: string }) => void;
  myName: string;
}

export function ParticipantApp({ state, send, myName }: Props) {
  return (
    <div className="w-screen h-screen bg-slate-950 overflow-hidden relative">
      <StageRenderer wsState={state} send={send} isPresenter={false} myName={myName} />
      <div className="absolute top-3 right-4 bg-slate-900/80 backdrop-blur-sm border border-slate-700/60 px-3 py-1.5 rounded-full text-xs text-slate-300 pointer-events-none z-50">
        {myName}
      </div>
    </div>
  );
}
