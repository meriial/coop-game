import { useState } from 'react';
import { POLL_QUESTIONS } from '../config/presentationConfig';
import { Slide } from './slide-kit';
import { ChoiceResults, Slider1DResults, Slider2DResults } from './PollWidget';

interface Props {
  pollIds: string[];
  pollResults: Record<string, Record<string, number>>;
  pollValues: Record<string, string[]>;
  isPresenter: boolean;
  onResetPoll: (pollId: string) => void;
}

export function AggregatedResultsSlide({ pollIds, pollResults, pollValues, isPresenter, onResetPoll }: Props) {
  return (
    <Slide bg="dot" accent="indigo">
      <div className="w-full h-full flex flex-col gap-6 p-6 md:p-10 overflow-y-auto">
        <h2 className="text-slate-300 text-sm font-semibold tracking-widest uppercase">Results</h2>
        <div className="flex flex-col md:flex-row gap-6 flex-1">
          {pollIds.map(pollId => {
            const poll = POLL_QUESTIONS[pollId];
            if (!poll) return null;
            return (
              <div
                key={pollId}
                className="flex-1 bg-slate-800/60 border border-slate-700/60 rounded-2xl p-5 flex flex-col gap-4"
              >
                <h3 className="text-white text-base font-semibold leading-snug">{poll.question}</h3>
                {poll.type === 'choice' && (
                  <ChoiceResults
                    results={pollResults[pollId] ?? {}}
                    options={poll.options}
                    totalVotes={Object.values(pollResults[pollId] ?? {}).reduce((s, n) => s + n, 0)}
                  />
                )}
                {poll.type === 'slider1d' && (
                  <Slider1DResults
                    values={pollValues[pollId] ?? []}
                    leftLabel={poll.leftLabel}
                    rightLabel={poll.rightLabel}
                  />
                )}
                {poll.type === 'slider2d' && (
                  <Slider2DResults
                    values={pollValues[pollId] ?? []}
                    labels={poll.labels}
                  />
                )}
                {isPresenter && (
                  <ResetPollButton pollId={pollId} onReset={onResetPoll} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Slide>
  );
}

function ResetPollButton({ pollId, onReset }: { pollId: string; onReset: (id: string) => void }) {
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <div className="flex items-center gap-2 text-xs justify-end mt-auto">
      <span className="text-slate-400">Reset?</span>
      <button onClick={() => { onReset(pollId); setConfirm(false); }} className="text-red-400 hover:text-red-300 font-medium transition-colors">Yes</button>
      <button onClick={() => setConfirm(false)} className="text-slate-500 hover:text-slate-400 transition-colors">Cancel</button>
    </div>
  ) : (
    <button onClick={() => setConfirm(true)} className="text-slate-500 hover:text-slate-400 text-xs transition-colors self-end mt-auto">
      Reset
    </button>
  );
}
