import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GameComponentProps } from '@workshop/game-core/client';
import type { PowerUpKind } from '@workshop/protocol';
import type { PixelHeartState } from './types';
import { CanvasGridControls } from './GridControls';

const GAP = 1;

const POWERUP_META: Record<PowerUpKind, { icon: string; label: string; blurb: string }> = {
  bloom: { icon: '✿', label: 'Bloom', blurb: 'Your next paints blend much more strongly — lush, saturated edges.' },
  prism: { icon: '◈', label: 'Prism', blurb: 'Your color cycles through the rainbow with every paint.' },
  supernova: { icon: '✷', label: 'Supernova', blurb: 'Your paints spread two cells out instead of one.' },
  additive: { icon: '✤', label: 'Additive', blurb: 'Neighbors blend by adding light — colors brighten as they overlap.' },
};

function useBoardSize(cols: number, rows: number) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [cell, setCell] = useState(16);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === 0 || h === 0) return;
      const cw = (w - GAP * (cols - 1)) / cols;
      const ch = (h - GAP * (rows - 1)) / rows;
      setCell(Math.max(1, Math.floor(Math.min(cw, ch))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cols, rows]);

  return { wrapRef, cell };
}

export function PixelHeart({ state, send, isHost, myName }: GameComponentProps<PixelHeartState>) {
  const { cols, rows, canvas, config } = state;
  const { wrapRef, cell } = useBoardSize(cols, rows);
  const [showDrawer, setShowDrawer] = useState(false);
  const [paintOpacity, setPaintOpacity] = useState(1.0);

  useEffect(() => {
    send({ type: 'GAME_JOIN', name: myName });
  }, [send, myName]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePaint = (x: number, y: number) => send({ type: 'GAME_PAINT', x, y, opacity: paintOpacity });
  const handleReset = () => send({ type: 'GAME_RESET' });
  const handleClearPlayers = () => send({ type: 'GAME_CLEAR_PLAYERS' });
  const setConfig = (patch: Record<string, unknown>) => send({ type: 'GAME_CONFIG', config: patch });
  const handleDropPowerup = () => send({ type: 'GAME_DROP_POWERUP' });

  const players = Object.values(state.players);
  const me = players.find((p) => p.name === myName);
  const myEffect = me ? state.effects[me.id] : undefined;
  const myLastPaint = me ? state.wormLastPaints[me.id] : undefined;

  const powerupAt = new Map<string, PowerUpKind>();
  for (const pu of state.powerups) powerupAt.set(`${pu.x},${pu.y}`, pu.kind);

  // Worm mode: compute valid adjacent cells to highlight.
  const wormValidSet = config.wormMode && myLastPaint
    ? new Set(
        [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]
          .map(([dx, dy]) => `${myLastPaint.x + dx!},${myLastPaint.y + dy!}`)
          .filter((k) => {
            const [kx, ky] = k.split(',').map(Number);
            return kx! >= 0 && kx! < cols && ky! >= 0 && ky! < rows;
          }),
      )
    : null;

  const boardW = cell * cols + GAP * (cols - 1);
  const boardH = cell * rows + GAP * (rows - 1);

  return (
    <div className="flex flex-col w-full h-full py-2 gap-2">
      <div className="flex items-center justify-between flex-wrap gap-2 px-4">
        <h2 className="text-white text-xl font-bold">Co-op Canvas</h2>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-400">{state.progress}% covered</span>
          <span className="text-fuchsia-300">{state.harmony}% harmony</span>
          <span className="text-slate-400">{players.length} player{players.length !== 1 ? 's' : ''}</span>
          {isHost && (
            <button onClick={() => setShowDrawer(true)} className="text-indigo-300 hover:text-indigo-200">
              Settings
            </button>
          )}
          {isHost && (
            <button onClick={handleReset} className="text-red-400 hover:text-red-300">Reset</button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2 px-4">
        {myEffect ? (
          <div className="flex items-center gap-2 bg-indigo-900/40 border border-indigo-500/50 rounded-full px-3 py-1 text-sm">
            <span className="text-lg leading-none">{POWERUP_META[myEffect.kind].icon}</span>
            <span className="text-indigo-200 font-semibold">{POWERUP_META[myEffect.kind].label}</span>
            <span className="text-indigo-300/80">x{myEffect.charges} left</span>
            <span className="text-indigo-300/60 hidden sm:inline">{'—'} {POWERUP_META[myEffect.kind].blurb}</span>
          </div>
        ) : <div />}
        <div className="flex items-center gap-1">
          <span className="text-slate-500 text-xs mr-1">Opacity</span>
          {([1.0, 0.75, 0.5, 0.25] as const).map((v) => (
            <button
              key={v}
              onClick={() => setPaintOpacity(v)}
              className={[
                'w-7 h-7 rounded text-xs font-medium border transition-colors',
                paintOpacity === v
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500',
              ].join(' ')}
            >
              {v * 100}
            </button>
          ))}
        </div>
      </div>

      <div ref={wrapRef} className="flex-1 min-h-0 w-full flex items-center justify-center">
        <div
          className="grid bg-slate-950 rounded"
          style={{
            width: boardW,
            height: boardH,
            gridTemplateColumns: `repeat(${cols}, ${cell}px)`,
            gridTemplateRows: `repeat(${rows}, ${cell}px)`,
            gap: GAP,
          }}
        >
          {Array.from({ length: rows }, (_, y) =>
            Array.from({ length: cols }, (_, x) => {
              const color = canvas[y]?.[x] ?? null;
              const pu = powerupAt.get(`${x},${y}`);
              const isWormValid = wormValidSet?.has(`${x},${y}`);
              const isWormCenter = config.wormMode && myLastPaint && myLastPaint.x === x && myLastPaint.y === y;
              return (
                <div
                  key={`${x}-${y}`}
                  onClick={() => handlePaint(x, y)}
                  className={[
                    'cursor-pointer hover:brightness-150 transition-[filter] duration-75 flex items-center justify-center',
                    pu ? 'ring-1 ring-inset ring-amber-300/60' : '',
                    isWormCenter ? 'ring-1 ring-inset ring-indigo-400/80' : '',
                    isWormValid ? 'ring-1 ring-inset ring-white/25' : '',
                  ].join(' ')}
                  style={{
                    background: color ?? '#0b1220',
                    ...(pu ? { boxShadow: 'inset 0 0 6px 1px rgba(251,191,36,0.22)' } : {}),
                  }}
                >
                  {pu && (
                    <span
                      className="leading-none animate-pulse pointer-events-none drop-shadow-[0_0_4px_rgba(251,191,36,0.9)]"
                      style={{ fontSize: Math.max(8, Math.floor(cell * 0.82)) }}
                    >
                      {POWERUP_META[pu].icon}
                    </span>
                  )}
                </div>
              );
            }),
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 px-4">
        {players.map((p) => {
          const eff = state.effects[p.id];
          const isMe = p.name === myName;
          return (
            <div
              key={p.id}
              className={[
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs',
                isMe ? 'bg-slate-700 ring-1 ring-indigo-400/60' : 'bg-slate-800',
              ].join(' ')}
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
              <span className="text-slate-300">{p.name}</span>
              {eff && (
                <span className="text-indigo-300" title={POWERUP_META[eff.kind].label}>
                  {POWERUP_META[eff.kind].icon}x{eff.charges}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-4">
        {config.powerupsEnabled && config.powerupMax > 0 && state.powerups.length >= config.powerupMax ? (
          <p className="text-amber-500/80 text-xs text-center">Power-up slots full</p>
        ) : state.paintsUntilNextPowerup !== null ? (
          <p className="text-slate-500 text-xs text-center">
            Next power-up in{' '}
            <span className="text-amber-400 font-semibold">{state.paintsUntilNextPowerup}</span>{' '}
            paint{state.paintsUntilNextPowerup !== 1 ? 's' : ''}
          </p>
        ) : null}
      </div>

      {/* Admin drawer — presenter only */}
      {isHost && (
        <>
          {showDrawer && (
            <div
              className="fixed inset-0 z-40 bg-black/30"
              onClick={() => setShowDrawer(false)}
            />
          )}
          <div
            className={[
              'fixed top-0 right-0 h-full z-50 w-72 bg-slate-900 border-l border-slate-700/60 shadow-2xl',
              'flex flex-col overflow-y-auto transition-transform duration-200',
              showDrawer ? 'translate-x-0' : 'translate-x-full',
            ].join(' ')}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60 shrink-0">
              <span className="text-white font-semibold text-sm">Canvas Settings</span>
              <button
                onClick={() => setShowDrawer(false)}
                className="text-slate-400 hover:text-slate-200 text-lg leading-none transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-5 p-4 text-xs text-slate-300">
              {/* Grid */}
              <section className="flex flex-col gap-2">
                <span className="text-slate-400 font-medium uppercase tracking-wider text-[10px]">Grid</span>
                <CanvasGridControls config={config} onChange={(patch) => setConfig(patch)} />
              </section>

              {/* Paint */}
              <section className="flex flex-col gap-3 border-t border-slate-700/50 pt-4">
                <span className="text-slate-400 font-medium uppercase tracking-wider text-[10px]">Paint</span>
                <label className="flex flex-col gap-1">
                  <span>Mix strength: {config.mixStrength.toFixed(2)}</span>
                  <input type="range" min={0.05} max={0.95} step={0.05} value={config.mixStrength}
                    onChange={(e) => setConfig({ mixStrength: Number(e.target.value) })} />
                </label>
                <label className="flex flex-col gap-1">
                  <span>Cooldown: {config.cooldownMs}ms</span>
                  <input type="range" min={0} max={2000} step={50} value={config.cooldownMs}
                    onChange={(e) => setConfig({ cooldownMs: Number(e.target.value) })} />
                </label>
              </section>

              {/* Power-ups */}
              <section className="flex flex-col gap-3 border-t border-slate-700/50 pt-4">
                <span className="text-slate-400 font-medium uppercase tracking-wider text-[10px]">Power-ups</span>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={config.powerupsEnabled}
                    onChange={(e) => setConfig({ powerupsEnabled: e.target.checked })} />
                  <span>Enabled</span>
                </label>
                {config.powerupsEnabled && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0">Mode:</span>
                      <button
                        onClick={() => setConfig({ powerupMode: 'time' })}
                        className={[
                          'px-2 py-0.5 rounded text-xs border transition-colors',
                          config.powerupMode === 'time'
                            ? 'bg-indigo-600 border-indigo-500 text-white'
                            : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-500',
                        ].join(' ')}
                      >
                        Time
                      </button>
                      <button
                        onClick={() => setConfig({ powerupMode: 'count' })}
                        className={[
                          'px-2 py-0.5 rounded text-xs border transition-colors',
                          config.powerupMode === 'count'
                            ? 'bg-indigo-600 border-indigo-500 text-white'
                            : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-500',
                        ].join(' ')}
                      >
                        Count
                      </button>
                    </div>
                    {config.powerupMode === 'time' ? (
                      <label className="flex flex-col gap-1">
                        <span>Interval: {Math.round(config.powerupIntervalMs / 1000)}s</span>
                        <input type="range" min={2} max={120} value={Math.round(config.powerupIntervalMs / 1000)}
                          onChange={(e) => setConfig({ powerupIntervalMs: Number(e.target.value) * 1000 })} />
                      </label>
                    ) : (
                      <label className="flex flex-col gap-1">
                        <span>Paints per player: {config.powerupPaintsPerPlayer}</span>
                        <input type="range" min={1} max={20} value={config.powerupPaintsPerPlayer}
                          onChange={(e) => setConfig({ powerupPaintsPerPlayer: Number(e.target.value) })} />
                        <span className="text-slate-500">
                          Drop after {Math.max(1, players.length) * config.powerupPaintsPerPlayer} total paints
                        </span>
                      </label>
                    )}
                    <label className="flex flex-col gap-1">
                      <span>Max on board: {config.powerupMax}</span>
                      <input type="range" min={1} max={10} value={config.powerupMax}
                        onChange={(e) => setConfig({ powerupMax: Number(e.target.value) })} />
                    </label>
                    <button
                      onClick={handleDropPowerup}
                      className="w-full py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors"
                    >
                      Drop power-up now
                    </button>
                  </>
                )}
              </section>

              {/* Rules */}
              <section className="flex flex-col gap-3 border-t border-slate-700/50 pt-4">
                <span className="text-slate-400 font-medium uppercase tracking-wider text-[10px]">Rules</span>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" className="mt-0.5" checked={config.wormMode}
                    onChange={(e) => setConfig({ wormMode: e.target.checked })} />
                  <span className="flex flex-col gap-0.5">
                    <span>Worm mode</span>
                    <span className="text-slate-500">Each paint must be adjacent to your last one</span>
                  </span>
                </label>
              </section>

              {/* Danger */}
              <section className="flex flex-col gap-2 border-t border-slate-700/50 pt-4">
                <button
                  onClick={() => { handleReset(); setShowDrawer(false); }}
                  className="w-full py-1.5 rounded-lg bg-red-900/60 hover:bg-red-800/70 border border-red-700/50 text-red-300 text-xs transition-colors"
                >
                  Reset canvas
                </button>
                <button
                  onClick={() => { handleClearPlayers(); setShowDrawer(false); }}
                  className="w-full py-1.5 rounded-lg bg-red-900/60 hover:bg-red-800/70 border border-red-700/50 text-red-300 text-xs transition-colors"
                >
                  Clear player list
                </button>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
