import { useState, useEffect } from 'react';
import { POLL_QUESTIONS } from '../config/presentationConfig';

interface Props {
  open: boolean;
  drawerContent?: 'quiz' | 'results';
  pollId?: string;
  pollResults: Record<string, Record<string, number>>;
  pollResetSeq: Record<string, number>;
  onVote: (pollId: string, choice: string) => void;
  onResetPoll: (pollId: string) => void;
  isPresenter: boolean;
}

export function Drawer({ open, drawerContent, pollId, pollResults, pollResetSeq, onVote, onResetPoll, isPresenter }: Props) {
  const poll = pollId ? POLL_QUESTIONS[pollId] : null;
  const results = pollId ? (pollResults[pollId] ?? {}) : {};
  const totalVotes = Object.values(results).reduce((s, n) => s + n, 0);
  const resetSeq = pollId ? (pollResetSeq[pollId] ?? 0) : 0;

  const inner = (
    <DrawerContent
      drawerContent={drawerContent}
      poll={poll}
      pollId={pollId}
      results={results}
      totalVotes={totalVotes}
      resetSeq={resetSeq}
      onVote={onVote}
      onResetPoll={onResetPoll}
      isPresenter={isPresenter}
    />
  );

  return (
    <>
      {/* Desktop: right side panel */}
      <div className={[
        'hidden md:flex fixed right-0 top-0 bottom-0 w-80 bg-slate-900 border-l border-slate-700/60',
        'flex-col gap-6 p-6 z-40 shadow-2xl transition-transform duration-300 ease-in-out',
        open ? 'translate-x-0' : 'translate-x-full',
      ].join(' ')}>
        {inner}
      </div>

      {/* Mobile: bottom sheet */}
      <div className={[
        'md:hidden fixed left-0 right-0 bottom-0 bg-slate-900 border-t border-slate-700/60',
        'flex flex-col gap-5 p-5 z-40 shadow-2xl rounded-t-2xl max-h-[70vh] overflow-y-auto',
        'transition-transform duration-300 ease-in-out',
        open ? 'translate-y-0' : 'translate-y-full',
      ].join(' ')}>
        {inner}
      </div>
    </>
  );
}

interface ContentProps {
  drawerContent?: 'quiz' | 'results';
  poll: { question: string; options: string[] } | null;
  pollId?: string;
  results: Record<string, number>;
  totalVotes: number;
  resetSeq: number;
  onVote: (pollId: string, choice: string) => void;
  onResetPoll: (pollId: string) => void;
  isPresenter: boolean;
}

function DrawerContent({ drawerContent, poll, pollId, results, totalVotes, resetSeq, onVote, onResetPoll, isPresenter }: ContentProps) {
  const [myVote, setMyVote] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Clear local vote state when the presenter resets the poll
  useEffect(() => {
    setMyVote(null);
    setConfirmReset(false);
  }, [resetSeq]);

  if (!poll || !pollId) return null;

  const handleVote = (choice: string) => {
    if (isPresenter) return;
    const next = myVote === choice ? null : choice; // toggle off if same
    setMyVote(next);
    // Send the choice (or the previous choice to signal un-vote via server toggle logic)
    onVote(pollId, choice);
  };

  const handleReset = () => {
    onResetPoll(pollId);
    setConfirmReset(false);
  };

  const PresenterResetButton = () => (
    confirmReset ? (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-slate-400">Reset all votes?</span>
        <button onClick={handleReset} className="text-red-400 hover:text-red-300 font-medium transition-colors">Yes, reset</button>
        <button onClick={() => setConfirmReset(false)} className="text-slate-500 hover:text-slate-400 transition-colors">Cancel</button>
      </div>
    ) : (
      <button onClick={() => setConfirmReset(true)} className="text-slate-500 hover:text-slate-400 text-xs transition-colors self-end">
        Reset poll
      </button>
    )
  );

  if (drawerContent === 'quiz') {
    return (
      <>
        <h3 className="text-white text-lg font-bold leading-snug">{poll.question}</h3>
        <div className="flex flex-col gap-3">
          {poll.options.map(option => {
            const isSelected = myVote === option;
            return (
              <button
                key={option}
                onClick={() => handleVote(option)}
                disabled={isPresenter}
                className={[
                  'w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all',
                  isPresenter
                    ? 'bg-slate-800 border-slate-600 text-slate-500 cursor-not-allowed'
                    : isSelected
                    ? 'bg-indigo-500 border-indigo-400 text-white'
                    : 'bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700 hover:border-indigo-500 cursor-pointer',
                ].join(' ')}
              >
                {option}
                {isSelected && <span className="float-right opacity-70 text-xs">tap to undo</span>}
              </button>
            );
          })}
        </div>
        {isPresenter
          ? <PresenterResetButton />
          : myVote
          ? <p className="text-slate-400 text-xs text-center">Voted · tap your choice to undo</p>
          : <p className="text-slate-500 text-xs text-center">Tap an option to vote</p>
        }
      </>
    );
  }

  if (drawerContent === 'results') {
    return (
      <>
        <h3 className="text-white text-lg font-bold leading-snug">{poll.question}</h3>
        <div className="flex flex-col gap-3">
          {poll.options.map(option => {
            const count = results[option] ?? 0;
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            return (
              <div key={option} className="flex flex-col gap-1">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{option}</span>
                  <span>{count} vote{count !== 1 ? 's' : ''} ({pct}%)</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-pink-500 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-slate-500 text-xs text-center">{totalVotes} total vote{totalVotes !== 1 ? 's' : ''}</p>
        {isPresenter && <PresenterResetButton />}
      </>
    );
  }

  return null;
}
