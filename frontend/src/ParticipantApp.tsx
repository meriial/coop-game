import type { WsState } from './hooks/useWebSocket';
import { StageRenderer } from './components/StageRenderer';

interface Props {
  state: WsState;
  send: (msg: Record<string, unknown> & { type: string }) => void;
  myName: string;
}

export function ParticipantApp({ state, send, myName }: Props) {
  return (
    <div className="w-screen h-screen bg-slate-950 overflow-hidden">
      <StageRenderer wsState={state} send={send} isPresenter={false} myName={myName} />
    </div>
  );
}
