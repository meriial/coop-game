import { useState } from 'react';
import { POLL_QUESTIONS } from '../config/presentationConfig';

interface Props {
  open: boolean;
  drawerContent?: 'quiz' | 'results';
  pollId?: string;
  pollResults: Record<string, Record<string, number>>;
  onVote: (pollId: string, choice: string) => void;
  isPresenter: boolean;
}

export function Drawer({ open, drawerContent, pollId, pollResults, onVote, isPresenter }: Props) {
  const [voted, setVoted] = useState<string | null>(null);

  const handleVote = (choice: string) => {
    if (voted || !pollId) return;
    setVoted(choice);
    onVote(pollId, choice);
  };

  const poll = pollId ? POLL_QUESTIONS[pollId] : null;
  const results = pollId ? (pollResults[pollId] ?? {}) : {};
  const totalVotes = Object.values(results).reduce((s, n) => s + n, 0);

  return (
    <>
      {/* Desktop: right side panel */}
      <div
        className={[
          'hidden md:flex fixed right-0 top-0 bottom-0 w-80 bg-slate-900 border-l border-slate-700/60',
          'flex-col gap-6 p-6 z-40 shadow-2xl',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        <DrawerContent
          drawerContent={drawerContent}
          poll={poll}
          results={results}
          totalVotes={totalVotes}
          voted={voted}
          onVote={handleVote}
          isPresenter={isPresenter}
        />
      </div>

      {/* Mobile: bottom sheet */}
      <div
        className={[
          'md:hidden fixed left-0 right-0 bottom-0 bg-slate-900 border-t border-slate-700/60',
          'flex flex-col gap-5 p-5 z-40 shadow-2xl rounded-t-2xl max-h-[70vh] overflow-y-auto',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
      >
        <DrawerContent
          drawerContent={drawerContent}
          poll={poll}
          results={results}
          totalVotes={totalVotes}
          voted={voted}
          onVote={handleVote}
          isPresenter={isPresenter}
        />
      </div>
    </>
  );
}

interface DrawerContentProps {
  drawerContent?: 'quiz' | 'results';
  poll: { question: string; options: string[] } | null;
  results: Record<string, number>;
  totalVotes: number;
  voted: string | null;
  onVote: (choice: string) => void;
  isPresenter: boolean;
}

function DrawerContent({ drawerContent, poll, results, totalVotes, voted, onVote, isPresenter }: DrawerContentProps) {
  if (!poll) return null;

  if (drawerContent === 'quiz') {
    return (
      <>
        <h3 className="text-white text-lg font-bold leading-snug">{poll.question}</h3>
        <div className="flex flex-col gap-3">
          {poll.options.map(option => (
            <button
              key={option}
              onClick={() => onVote(option)}
              disabled={voted !== null || isPresenter}
              className={[
                'w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-all',
                voted === option
                  ? 'bg-indigo-500 border-indigo-400 text-white'
                  : voted !== null || isPresenter
                  ? 'bg-slate-800 border-slate-600 text-slate-500 cursor-not-allowed'
                  : 'bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700 hover:border-indigo-500 cursor-pointer',
              ].join(' ')}
            >
              {option}
            </button>
          ))}
        </div>
        {voted && <p className="text-slate-400 text-xs text-center">Vote submitted!</p>}
        {isPresenter && <p className="text-slate-500 text-xs text-center">Presenter view — advance to show results</p>}
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
      </>
    );
  }

  return null;
}
