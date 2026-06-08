import { useEffect, useCallback, useRef, useState } from 'react';
import type { GameComponentProps } from '@workshop/game-core/client';
import type { PeriodicMatchState } from './types';
import { useSoundContext } from '@frontend/contexts/SoundContext';

const MIN_ELEMENTS = 5;
const MAX_ELEMENTS = 118;
const MIN_TIMEOUT_SEC = 1;
const MAX_TIMEOUT_SEC = 60;
const GAP = 3;

function bestCols(W: number, H: number, N: number): number {
  for (let c = 1; c <= N; c++) {
    const tileW = (W - (c - 1) * GAP) / c;
    const rows = Math.ceil(N / c);
    const totalH = rows * tileW + (rows - 1) * GAP;
    if (totalH <= H) return c;
  }
  return N;
}

export function PeriodicMatch({
  state,
  send,
  isHost,
  myName,
  connectedUsers,
}: GameComponentProps<PeriodicMatchState>) {
  const {
    matchBoard,
    matchClaimed,
    matchPending,
    matchRevealed,
    matchPaused,
    matchScores,
    gameOver: matchGameOver,
    matchElementCount,
    matchPendingTimeoutMs,
    catchUpEnabled,
    showCooldown,
    matchCooldowns,
    catchupActiveWindowMs,
  } = state;

  const gridRef = useRef<HTMLDivElement>(null);
  const nRef = useRef(matchBoard.length);
  nRef.current = matchBoard.length;
  const [{ cols, tileSize }, setGridState] = useState({ cols: 17, tileSize: 54 });

  const recomputeGrid = useCallback(() => {
    const el = gridRef.current;
    if (!el || nRef.current === 0) return;
    const W = el.clientWidth;
    const H = el.clientHeight;
    const c = bestCols(W, H, nRef.current);
    const s = Math.floor((W - (c - 1) * GAP) / c);
    setGridState({ cols: c, tileSize: s });
  }, []);

  useEffect(() => {
    recomputeGrid();
  }, [matchBoard.length, recomputeGrid]);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const obs = new ResizeObserver(recomputeGrid);
    obs.observe(el);
    return () => obs.disconnect();
  }, [recomputeGrid]);

  const { playBleep, playBoop, playBing, playDoorbell } = useSoundContext();

  const prevPendingRef = useRef(matchPending);
  const prevRevealedRef = useRef(matchRevealed);
  const prevClaimedRef = useRef(matchClaimed);
  useEffect(() => {
    const prevPending = prevPendingRef.current;
    const prevRevealed = prevRevealedRef.current;

    for (const pos of Object.keys(matchPending)) {
      if (!(pos in prevPending)) { playBleep(); break; }
    }
    for (const pos of Object.keys(matchRevealed)) {
      if (!(pos in prevRevealed)) { playBoop(); break; }
    }
    for (const pos of Object.keys(prevPending)) {
      if (!(pos in matchPending) && !(pos in matchRevealed)) {
        const idx = parseInt(pos, 10);
        if (matchClaimed[idx] !== null) { playBing(); }
        break;
      }
    }

    prevPendingRef.current = matchPending;
    prevRevealedRef.current = matchRevealed;
    prevClaimedRef.current = matchClaimed;
  }, [matchPending, matchRevealed, matchClaimed]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevUserCountRef = useRef(connectedUsers.length);
  useEffect(() => {
    if (!isHost) return;
    const curr = connectedUsers.length;
    if (curr > prevUserCountRef.current) playDoorbell();
    prevUserCountRef.current = curr;
  }, [connectedUsers.length, isHost, playDoorbell]);

  const [inputVal, setInputVal] = useState(String(matchElementCount));
  useEffect(() => {
    setInputVal(String(matchElementCount));
  }, [matchElementCount]);

  const timeoutSeconds = Math.round(matchPendingTimeoutMs / 1000);
  const [timeoutVal, setTimeoutVal] = useState(String(timeoutSeconds));
  useEffect(() => {
    setTimeoutVal(String(timeoutSeconds));
  }, [timeoutSeconds]);

  useEffect(() => {
    send({ type: 'GAME_JOIN', name: myName });
  }, [send, myName]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cooldown ticker: re-computes remaining ms every 100ms so the display stays live.
  const me = matchScores.find((p) => p.name === myName);
  const myCooldownUntil = me ? (matchCooldowns[me.id] ?? 0) : 0;
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  useEffect(() => {
    const tick = () => setCooldownRemaining(Math.max(0, myCooldownUntil - Date.now()));
    tick();
    if (myCooldownUntil <= Date.now()) return;
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [myCooldownUntil]);

  const handleFlip = useCallback((pos: number) => {
    send({ type: 'MATCH_FLIP', pos });
  }, [send]);

  const handlePause = useCallback(() => send({ type: 'MATCH_PAUSE' }), [send]);
  const handleReset = useCallback(() => send({ type: 'MATCH_RESET' }), [send]);

  const setSize = useCallback((n: number) => {
    send({ type: 'MATCH_SET_SIZE', count: Math.min(Math.max(MIN_ELEMENTS, n), MAX_ELEMENTS) });
  }, [send]);

  const commitInput = (val: string) => {
    const n = parseInt(val, 10);
    if (!isNaN(n)) setSize(n);
  };

  const setTimeoutSecs = useCallback((s: number) => {
    send({ type: 'MATCH_SET_TIMEOUT', seconds: Math.min(Math.max(MIN_TIMEOUT_SEC, s), MAX_TIMEOUT_SEC) });
  }, [send]);

  const commitTimeout = (val: string) => {
    const n = parseInt(val, 10);
    if (!isNaN(n)) setTimeoutSecs(n);
  };

  const totalPairs = matchBoard.length / 2;
  const claimedPairs = matchClaimed.filter((c) => c !== null).length / 2;
  const progressPct = totalPairs > 0 ? (claimedPairs / totalPairs) * 100 : 0;
  const isOnCooldown = cooldownRemaining > 0;

  return (
    <div className="w-full h-full flex overflow-hidden bg-slate-950 relative">
      <div className="flex-1 flex flex-col gap-2 p-3 overflow-hidden min-w-0">
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

        <div className="h-1 bg-slate-800 rounded-full overflow-hidden shrink-0">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Cooldown notice for this participant */}
        {showCooldown && isOnCooldown && (
          <div className="flex items-center justify-center gap-2 shrink-0">
            <div className="px-3 py-1 bg-amber-900/40 border border-amber-600/40 rounded-full text-amber-300 text-xs">
              Ready in{' '}
              <span className="font-bold tabular-nums">
                {(cooldownRemaining / 1000).toFixed(1)}s
              </span>
            </div>
          </div>
        )}

        <div
          ref={gridRef}
          className="flex-1 overflow-hidden"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: `${GAP}px`,
            alignContent: 'center',
          }}
        >
          {matchBoard.map((symbol, pos) => {
            const posKey = String(pos);
            const claimedColor = matchClaimed[pos] ?? null;
            const pendingColor = matchPending[posKey];
            const revealedColor = matchRevealed[posKey];
            const isClaimed = claimedColor !== null;
            const isPending = pendingColor !== undefined;
            const isRevealed = revealedColor !== undefined;
            const faceUpColor = pendingColor ?? revealedColor ?? null;
            const isClickable = !isClaimed && !isPending && !isRevealed && !matchPaused && !matchGameOver && !isOnCooldown;

            return (
              <Tile
                key={pos}
                symbol={symbol}
                claimedColor={claimedColor}
                pendingColor={faceUpColor}
                isClickable={isClickable}
                dimmed={(matchPaused || isOnCooldown) && !isClaimed}
                tileSize={tileSize}
                onClick={isClickable ? () => handleFlip(pos) : undefined}
              />
            );
          })}
        </div>
      </div>

      <div className="w-52 shrink-0 flex flex-col gap-3 p-3 border-l border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between shrink-0">
          <h3 className="text-slate-300 font-semibold text-xs uppercase tracking-wider">
            Leaderboard
          </h3>
          {isHost && (
            <button
              onClick={() => send({ type: 'MATCH_CLEAR_LEADERBOARD' })}
              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 hover:bg-red-700 text-slate-400 hover:text-white transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex-1 flex flex-col gap-1 overflow-y-auto min-h-0">
          {matchScores.length === 0 ? (
            <p className="text-slate-600 text-xs">No players yet</p>
          ) : (
            matchScores.map((player, i) => (
              <div key={player.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-800/60">
                <span className="text-slate-600 text-xs w-3 shrink-0">{i + 1}</span>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: player.color }} />
                <span className="text-slate-300 text-xs flex-1 truncate">{player.name}</span>
                <span className="text-white text-xs font-bold tabular-nums">{player.count}</span>
              </div>
            ))
          )}
        </div>

        {isHost && (
          <div className="flex flex-col gap-2.5 shrink-0 pt-2 border-t border-slate-700/60">
            <div className="flex flex-col gap-1.5">
              <span className="text-slate-500 text-xs">Elements (5–118)</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSize(matchElementCount - 1)}
                  disabled={matchElementCount <= MIN_ELEMENTS}
                  className="w-7 h-7 shrink-0 rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-slate-200 font-bold transition-colors flex items-center justify-center text-base leading-none"
                >
                  −
                </button>
                <input
                  type="number"
                  min={MIN_ELEMENTS}
                  max={MAX_ELEMENTS}
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  onBlur={(e) => commitInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitInput((e.target as HTMLInputElement).value);
                  }}
                  className="flex-1 min-w-0 bg-slate-800 border border-slate-600 rounded-md text-center text-white text-sm font-mono font-bold focus:outline-none focus:border-indigo-500 focus:ring-1"
                  style={{ appearance: 'textfield' } as React.CSSProperties}
                />
                <button
                  onClick={() => setSize(matchElementCount + 1)}
                  disabled={matchElementCount >= MAX_ELEMENTS}
                  className="w-7 h-7 shrink-0 rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-slate-200 font-bold transition-colors flex items-center justify-center text-base leading-none"
                >
                  +
                </button>
              </div>
              <p className="text-slate-600 text-xs">applies on reshuffle</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-slate-500 text-xs">Unflip timeout (1–60s)</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTimeoutSecs(timeoutSeconds - 1)}
                  disabled={timeoutSeconds <= MIN_TIMEOUT_SEC}
                  className="w-7 h-7 shrink-0 rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-slate-200 font-bold transition-colors flex items-center justify-center text-base leading-none"
                >
                  −
                </button>
                <input
                  type="number"
                  min={MIN_TIMEOUT_SEC}
                  max={MAX_TIMEOUT_SEC}
                  value={timeoutVal}
                  onChange={(e) => setTimeoutVal(e.target.value)}
                  onBlur={(e) => commitTimeout(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitTimeout((e.target as HTMLInputElement).value);
                  }}
                  className="flex-1 min-w-0 bg-slate-800 border border-slate-600 rounded-md text-center text-white text-sm font-mono font-bold focus:outline-none focus:border-indigo-500 focus:ring-1"
                  style={{ appearance: 'textfield' } as React.CSSProperties}
                />
                <button
                  onClick={() => setTimeoutSecs(timeoutSeconds + 1)}
                  disabled={timeoutSeconds >= MAX_TIMEOUT_SEC}
                  className="w-7 h-7 shrink-0 rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-slate-200 font-bold transition-colors flex items-center justify-center text-base leading-none"
                >
                  +
                </button>
              </div>
              <p className="text-slate-600 text-xs">lone tile auto-unflips after this</p>
            </div>

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

            {/* Rule toggles */}
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-700/40">
              <span className="text-slate-500 text-[10px] uppercase tracking-wider font-medium">Rules</span>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0"
                  checked={catchUpEnabled}
                  onChange={(e) => send({ type: 'MATCH_SET_CATCHUP', enabled: e.target.checked })}
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-slate-300 text-xs">Catch-up</span>
                  <span className="text-slate-600 text-[10px]">All players get cooldowns proportional to their lead</span>
                </span>
              </label>
              {catchUpEnabled && (
                <label className="flex flex-col gap-1 pl-5">
                  <span className="text-slate-400 text-[10px]">Active window: {catchupActiveWindowMs / 1000}s</span>
                  <input
                    type="range"
                    min={5}
                    max={120}
                    step={5}
                    value={catchupActiveWindowMs / 1000}
                    onChange={(e) => send({ type: 'MATCH_SET_ACTIVE_WINDOW', seconds: Number(e.target.value) })}
                  />
                </label>
              )}
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0"
                  checked={showCooldown}
                  onChange={(e) => send({ type: 'MATCH_SET_SHOW_COOLDOWN', enabled: e.target.checked })}
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-slate-300 text-xs">Show cooldown</span>
                  <span className="text-slate-600 text-[10px]">Participants see countdown</span>
                </span>
              </label>
            </div>
          </div>
        )}
      </div>

      {matchGameOver && (
        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center z-20">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-2xl">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-white text-2xl font-bold mb-1">All matched!</h2>
            <p className="text-slate-400 text-sm mb-5">Final scores</p>
            <div className="flex flex-col gap-2 mb-6 text-left">
              {matchScores.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2 bg-slate-800 rounded-lg">
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
  tileSize: number;
  onClick?: () => void;
}

function Tile({ symbol, claimedColor, pendingColor, isClickable, dimmed, tileSize, onClick }: TileProps) {
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
    boxShadow = `0 0 8px ${pendingColor}70`;
  } else {
    bg = '#1e293b';
    textColor = 'transparent';
    border = '1px solid #334155';
    boxShadow = undefined;
  }

  const fontSize = Math.round(tileSize * 0.52);

  return (
    <button
      onClick={onClick}
      disabled={!isClickable}
      className={[
        'aspect-square rounded flex items-center justify-center font-bold transition-all duration-75 select-none leading-none',
        isClickable ? 'hover:brightness-125 cursor-pointer active:scale-95' : 'cursor-default',
      ].join(' ')}
      style={{ backgroundColor: bg, color: textColor, border, boxShadow, opacity: dimmed ? 0.4 : 1, fontSize }}
      title={revealed ? symbol : undefined}
    >
      {revealed ? symbol : null}
    </button>
  );
}
