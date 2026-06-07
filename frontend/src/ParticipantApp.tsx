import { Volume2, VolumeX, Presentation } from 'lucide-react';
import type { WsState } from './hooks/useWebSocket';
import { StageRenderer } from './components/StageRenderer';
import { presentationSteps, stepHasSound } from './config/presentationConfig';
import { useSoundContext } from './contexts/SoundContext';

interface Props {
  state: WsState;
  send: (msg: Record<string, unknown> & { type: string }) => void;
  myName: string;
  onToggleDevRole?: () => void;
}

export function ParticipantApp({ state, send, myName, onToggleDevRole }: Props) {
  const step = presentationSteps[state.stepIndex] ?? presentationSteps[0];
  const { muted, toggleMute } = useSoundContext();
  return (
    <div className="w-screen h-screen bg-slate-950 overflow-hidden relative">
      <StageRenderer wsState={state} send={send} isPresenter={false} myName={myName} />
      <div className="absolute top-3 right-4 flex items-center gap-2 z-50">
        {stepHasSound(step) && (
          <button
            onClick={toggleMute}
            className={`flex items-center justify-center w-7 h-7 rounded-full bg-slate-900/80 backdrop-blur-sm border transition-colors ${muted ? 'border-slate-700/40 text-slate-600 hover:text-slate-400' : 'border-slate-700/60 text-slate-400 hover:text-slate-200'}`}
            title={muted ? 'Unmute sounds' : 'Mute sounds'}
          >
            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
        )}
        {onToggleDevRole && (
          <button
            onClick={onToggleDevRole}
            className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-900/80 backdrop-blur-sm border border-amber-500/50 text-amber-400 hover:text-amber-300 hover:border-amber-400 transition-colors"
            title="DEV: Switch to presenter view"
          >
            <Presentation size={13} />
          </button>
        )}
        <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-700/60 px-3 py-1.5 rounded-full text-xs text-slate-300 pointer-events-none">
          {myName}
        </div>
      </div>
    </div>
  );
}
