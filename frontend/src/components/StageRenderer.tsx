import { presentationSteps } from '../config/presentationConfig';
import type { WsState } from '../hooks/useWebSocket';
import { SlideRenderer } from './SlideRenderer';
import { Drawer } from './Drawer';
import { PixelHeart } from './games/PixelHeart';

interface Props {
  wsState: WsState;
  send: (msg: Record<string, unknown> & { type: string }) => void;
  isPresenter: boolean;
  myName: string;
}

export function StageRenderer({ wsState, send, isPresenter, myName }: Props) {
  const step = presentationSteps[wsState.stepIndex] ?? presentationSteps[0];

  if (step.type === 'game') {
    return (
      <div className="w-full h-full flex items-center justify-center overflow-y-auto">
        <PixelHeart wsState={wsState} send={send} isHost={isPresenter} myName={myName} />
      </div>
    );
  }

  const onVote = (pollId: string, choice: string) =>
    send({ type: 'SUBMIT_VOTE', pollId, choice });

  const onResetPoll = (pollId: string) =>
    send({ type: 'RESET_POLL', pollId });

  return (
    <div className="w-full h-full relative">
      <SlideRenderer index={step.slideIndex} />
      <Drawer
        open={step.drawerOpen}
        drawerContent={step.drawerOpen ? step.drawerContent : undefined}
        pollId={step.drawerOpen ? step.pollId : undefined}
        pollResults={wsState.pollResults}
        pollResetSeq={wsState.pollResetSeq}
        onVote={onVote}
        onResetPoll={onResetPoll}
        isPresenter={isPresenter}
      />
    </div>
  );
}
