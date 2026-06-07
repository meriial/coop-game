import { presentationSteps, POLL_QUESTIONS } from '../config/presentationConfig';
import type { PollType } from '../config/presentationConfig';
import type { WsState } from '../hooks/useWebSocket';
import { SlideRenderer } from './SlideRenderer';
import { PollWidget } from './PollWidget';
import { AggregatedResultsSlide } from './AggregatedResultsSlide';
import { PixelHeart } from './games/PixelHeart';
import { PeriodicMatch } from './games/PeriodicMatch';

interface Props {
  wsState: WsState;
  send: (msg: Record<string, unknown> & { type: string }) => void;
  isPresenter: boolean;
  myName: string;
}

export function StageRenderer({ wsState, send, isPresenter, myName }: Props) {
  const step = presentationSteps[wsState.stepIndex] ?? presentationSteps[0];

  const onVote = (pollId: string, choice: string, pollType: PollType) =>
    send({ type: 'SUBMIT_VOTE', pollId, choice, pollType });

  const onResetPoll = (pollId: string) =>
    send({ type: 'RESET_POLL', pollId });

  if (step.type === 'game') {
    if (step.gameId === 'periodic-match') {
      return (
        <div className="w-full h-full overflow-hidden">
          <PeriodicMatch wsState={wsState} send={send} isHost={isPresenter} myName={myName} />
        </div>
      );
    }
    return (
      <div className="w-full h-full flex items-center justify-center overflow-y-auto">
        <PixelHeart wsState={wsState} send={send} isHost={isPresenter} myName={myName} />
      </div>
    );
  }

  if (step.type === 'poll') {
    const poll = POLL_QUESTIONS[step.pollId];
    return (
      <div className="w-full h-full relative">
        <SlideRenderer index={step.slideIndex} />
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm z-20 p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700/60 rounded-2xl p-6 shadow-2xl">
            {poll ? (
              <PollWidget
                pollId={step.pollId}
                poll={poll}
                pollResults={wsState.pollResults[step.pollId] ?? {}}
                pollValues={wsState.pollValues[step.pollId] ?? []}
                pollResetSeq={wsState.pollResetSeq[step.pollId] ?? 0}
                onVote={onVote}
                onResetPoll={onResetPoll}
                isPresenter={isPresenter}
              />
            ) : (
              <p className="text-slate-500 text-sm">Unknown poll: {step.pollId}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (step.type === 'results') {
    return (
      <AggregatedResultsSlide
        pollIds={step.pollIds}
        pollResults={wsState.pollResults}
        pollValues={wsState.pollValues}
        isPresenter={isPresenter}
        onResetPoll={onResetPoll}
      />
    );
  }

  return (
    <div className="w-full h-full relative">
      <SlideRenderer index={step.slideIndex} />
    </div>
  );
}
