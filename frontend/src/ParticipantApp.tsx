import { Volume2, VolumeX, Presentation } from 'lucide-react';
import type { WsState } from './hooks/useWebSocket';
import { StageRenderer } from './components/StageRenderer';
import { SlideBackground } from './components/SlideBackground';
import { presentationSteps, stepHasSound } from './config/presentationConfig';
import { useSoundContext } from './contexts/SoundContext';
import { UserSwitcher } from './UserSwitcher';

interface Props {
  state: WsState;
  send: (msg: Record<string, unknown> & { type: string }) => void;
  myName: string;
  myOwner: string;
  onToggleDevRole?: () => void;
  myVotes: Record<string, string | null>;
  setMyVote: (pollId: string, v: string | null) => void;
}

export function ParticipantApp({ state, send, myName, myOwner, onToggleDevRole, myVotes, setMyVote }: Props) {
  const step = presentationSteps[state.stepIndex] ?? presentationSteps[0];
  const { muted, toggleMute } = useSoundContext();
  return (
    <div className="w-screen h-screen bg-slate-950 overflow-hidden relative isolate flex flex-col">
      <SlideBackground config={state.bgConfig} />
      {/* Top chrome strip — transparent, reserves vertical space so stage content never collides with the user pill. */}
      <div className="relative z-50 flex items-center justify-end gap-2 h-11 px-4 shrink-0">
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
        <UserSwitcher myName={myName} currentEmail={myOwner} />
      </div>
      <div className="relative flex-1 min-h-0">
        <StageRenderer wsState={state} send={send} isPresenter={false} myName={myName} myOwner={myOwner} myVotes={myVotes} setMyVote={setMyVote} />
      </div>
    </div>
  );
}
