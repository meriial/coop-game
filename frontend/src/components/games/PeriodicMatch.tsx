import { useEffect, useCallback } from 'react';
import type { WsState } from '../../hooks/useWebSocket';

interface Props {
  wsState: WsState;
  send: (msg: Record<string, unknown> & { type: string }) => void;
  isHost: boolean;
  myName: string;
}

export function PeriodicMatch({ wsState, send, isHost, myName }: Props) {
  const { matchBoard, matchClaimed, matchPending, matchPaused, matchScores, matchGameOver } = wsState;

  useEffect(() => {
    send({ type: 'GAME_JOIN', name: myName });
  }, [send, myName]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFlip = useCallback((pos: number) => {
    send({ type: 'MATCH_FLIP', pos });
  }, [send]);

  const handlePause = useCallback(() => send({ type: 'MATCH_PAUSE' }), [send]);
  const handleReset = useCallback(() => send({ type: 'MATCH_RESET' }), [send]);

  const totalPairs = matchBoard.length / 2;
  const claimedPairs = matchClaimed.filter(c => c !== null).length / 2;
  const progressPct = totalPairs > 0 ? (claimedPairs / totalPairs) * 100 : 0;

  return (
    <div className="w-full h-full flex overflow-hidden bg-slate-950 relative">
      {/* Grid area */}
      <div className="flex-1 flex flex-col gap-2 p-3 overflow-hidden min-w-0">
        {/* Header row */}
        <div className="flex items-center justify-between shrink-0 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-white text-lg font-bold shrink-0">Element Match</h2>
            <span className="text-slate-500 text-sm shrink-0">
              {claimedPairs} / {totalPairs} pairs
            </span>
          </div>
          {matchPaused && (
            <div className="px-3 py-1 bg-amber-500/20 border border-amber-500/50 rounded-full text-amber-300 text-xs font-semibold uppercase tracking-wide shrink-0">
              Paused
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-slate-800 rounded-full overflow-hidden shrink-0">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Tile grid */}
        <div
          className="flex-1 overflow-hidden"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(50px, 1fr))',
            gap: '3px',
            alignContent: 'start',
          }}
        >
          {matchBoard.map((symbol, pos) => {
            const claimedColor = matchClaimed[pos] ?? null;
            const pendingColor = matchPending[String(pos)];
            const isClaimed = claimedColor !== null;
            const isPending = pendingColor !== undefined;
            const isClickable = !isClaimed && !isPending && !matchPaused && !matchGameOver;

            return (
              <Tile
                key={pos}
                symbol={symbol}
                claimedColor={claimedColor}
                pendingColor={isPending ? pendingColor : null}
                isClickable={isClickable}
                dimmed={matchPaused && !isClaimed}
                onClick={isClickable ? () => handleFlip(pos) : undefined}
              />
            );
          })}
        </div>
      </div>

      {/* Leaderboard sidebar */}
      <div className="w-48 shrink-0 flex flex-col gap-3 p-3 border-l border-slate-800 bg-slate-900/50">
        <h3 className="text-slate-300 font-semibold text-xs uppercase tracking-wider shrink-0">
          Leaderboard
        </h3>
        <div className="flex-1 flex flex-col gap-1 overflow-y-auto min-h-0">
          {matchScores.length === 0 ? (
            <p className="text-slate-600 text-xs">No players yet</p>
          ) : (
            matchScores.map((player, i) => (
              <div
                key={player.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-800/60"
              >
                <span className="text-slate-600 text-xs w-3 shrink-0">{i + 1}</span>
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: player.color }}
                />
                <span className="text-slate-300 text-xs flex-1 truncate">{player.name}</span>
                <span className="text-white text-xs font-bold tabular-nums">{player.count}</span>
              </div>
            ))
          )}
        </div>

        {isHost && (
          <div className="flex flex-col gap-2 shrink-0 pt-2 border-t border-slate-700/60">
            <button
              onClick={handlePause}
              className={[
                'w-full py-1.5 rounded-lg text-xs font-medium transition-colors',
                matchPaused
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-amber-600 hover:bg-amber-500 text-white',
              ].join(' ')}
            >
              {matchPaused ? 'Resume' : 'Pause'}
            </button>
            <button
              onClick={handleReset}
              className="w-full py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs transition-colors"
            >
              Reshuffle
            </button>
          </div>
        )}
      </div>

      {/* Game-over overlay */}
      {matchGameOver && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center z-20">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-white text-2xl font-bold mb-1">All matched!</h2>
            <p className="text-slate-400 text-sm mb-5">Final scores</p>
            <div className="flex flex-col gap-2 mb-6 text-left">
              {matchScores.map((p, i) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-3 py-2 bg-slate-800 rounded-lg"
                >
                  <span className="text-slate-500 text-sm w-4">{i + 1}</span>
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: p.color }} />
                  <span className="text-slate-200 text-sm flex-1">{p.name}</span>
                  <span className="text-white font-bold tabular-nums">{p.count}</span>
                </div>
              ))}
            </div>
            {isHost && (
              <button
                onClick={handleReset}
                className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
              >
                Play Again
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface TileProps {
  symbol: string;
  claimedColor: string | null;
  pendingColor: string | null;
  isClickable: boolean;
  dimmed: boolean;
  onClick?: () => void;
}

function Tile({ symbol, claimedColor, pendingColor, isClickable, dimmed, onClick }: TileProps) {
  const isClaimed = claimedColor !== null;
  const isPending = pendingColor !== null;
  const revealed = isClaimed || isPending;

  let bg: string;
  let textColor: string;
  let border: string;
  let boxShadow: string | undefined;

  if (isClaimed) {
    bg = claimedColor!;
    textColor = '#ffffff';
    border = `1px solid ${claimedColor}`;
    boxShadow = undefined;
  } else if (isPending) {
    bg = '#f8fafc';
    textColor = '#0f172a';
    border = `2px solid ${pendingColor}`;
    boxShadow = `0 0 6px ${pendingColor}60`;
  } else {
    bg = '#1e293b';
    textColor = 'transparent';
    border = '1px solid #334155';
    boxShadow = undefined;
  }

  return (
    <button
      onClick={onClick}
      disabled={!isClickable}
      className={[
        'aspect-square rounded flex items-center justify-center text-xs font-bold transition-all duration-75 select-none',
        isClickable ? 'hover:brightness-125 cursor-pointer active:scale-95' : 'cursor-default',
        dimmed ? 'opacity-40' : '',
      ].join(' ')}
      style={{ backgroundColor: bg, color: textColor, border, boxShadow, opacity: dimmed ? 0.4 : 1 }}
      title={revealed ? symbol : undefined}
    >
      {revealed ? symbol : null}
    </button>
  );
}
