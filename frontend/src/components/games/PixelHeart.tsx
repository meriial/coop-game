import { useEffect } from 'react';
import type { WsState } from '../../hooks/useWebSocket';

const GRID_SIZE = 20;

const TARGET: boolean[][] = [
  [false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false],
  [false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false],
  [false,false,false,true, true, true, false,false,false,false,false,false,true, true, true, false,false,false,false,false],
  [false,false,true, true, true, true, true, false,false,false,false,true, true, true, true, true, false,false,false,false],
  [false,true, true, true, true, true, true, true, false,false,true, true, true, true, true, true, true, false,false,false],
  [false,true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, false,false],
  [false,true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, false,false],
  [false,false,true, true, true, true, true, true, true, true, true, true, true, true, true, true, true, false,false,false],
  [false,false,false,true, true, true, true, true, true, true, true, true, true, true, true, true, false,false,false,false],
  [false,false,false,false,true, true, true, true, true, true, true, true, true, true, true, false,false,false,false,false],
  [false,false,false,false,false,true, true, true, true, true, true, true, true, true, false,false,false,false,false,false],
  [false,false,false,false,false,false,true, true, true, true, true, true, true, false,false,false,false,false,false,false],
  [false,false,false,false,false,false,false,true, true, true, true, true, false,false,false,false,false,false,false,false],
  [false,false,false,false,false,false,false,false,true, true, true, false,false,false,false,false,false,false,false,false],
  [false,false,false,false,false,false,false,false,false,true, false,false,false,false,false,false,false,false,false,false],
  [false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false],
  [false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false],
  [false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false],
  [false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false],
  [false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false,false],
];

interface Props {
  wsState: WsState;
  send: (msg: Record<string, unknown> & { type: string }) => void;
  isHost: boolean;
  myName: string;
}

export function PixelHeart({ wsState, send, isHost, myName }: Props) {
  useEffect(() => {
    send({ type: 'GAME_JOIN', name: myName });
  }, [send, myName]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePaint = (x: number, y: number) => {
    send({ type: 'GAME_PAINT', x, y });
  };

  const handleReset = () => send({ type: 'GAME_RESET' });

  const players = Object.values(wsState.players);

  return (
    <div className="flex flex-col items-center gap-5 w-full max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="w-full flex items-center justify-between">
        <h2 className="text-white text-xl font-bold">Fill the Heart</h2>
        <span className="text-slate-400 text-sm">{players.length} player{players.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Progress bar */}
      <div className="w-full">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>{wsState.progress}% complete</span>
          {isHost && (
            <button
              onClick={handleReset}
              className="text-red-400 hover:text-red-300 transition-colors text-xs"
            >
              Reset canvas
            </button>
          )}
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-pink-500 rounded-full transition-all duration-300"
            style={{ width: `${wsState.progress}%` }}
          />
        </div>
      </div>

      {/* Grid */}
      <div
        className="grid gap-px bg-slate-800 border border-slate-700 rounded p-px w-full aspect-square max-w-sm"
        style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}
      >
        {Array.from({ length: GRID_SIZE }, (_, y) =>
          Array.from({ length: GRID_SIZE }, (_, x) => {
            const isTarget = TARGET[y][x];
            const color = wsState.canvas[y]?.[x];
            return (
              <div
                key={`${x}-${y}`}
                onClick={() => isTarget && handlePaint(x, y)}
                style={{ background: color ?? (isTarget ? '#1e293b' : '#0f172a') }}
                className={[
                  'aspect-square transition-all duration-100',
                  isTarget ? 'cursor-pointer hover:brightness-125' : '',
                ].join(' ')}
              />
            );
          })
        )}
      </div>

      {/* Player chips */}
      <div className="flex flex-wrap gap-2 w-full">
        {players.map(p => (
          <div key={p.id} className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-full text-xs">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
            <span className="text-slate-300">{p.name}</span>
          </div>
        ))}
      </div>

      {/* Victory */}
      {wsState.progress === 100 && (
        <div className="w-full text-center py-4 bg-emerald-900/40 border border-emerald-500/50 rounded-xl text-emerald-300 font-semibold text-lg">
          Heart complete! ❤️
        </div>
      )}
    </div>
  );
}
