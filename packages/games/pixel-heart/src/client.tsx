import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GameComponentProps } from '@workshop/game-core/client';
import type { PowerUpKind } from '@workshop/protocol';
import type { PixelHeartState } from './types';
import { CanvasGridControls } from './GridControls';

const GAP = 1;

const POWERUP_META: Record<PowerUpKind, { icon: string; label: string; blurb: string }> = {
  bloom: { icon: '\u273F', label: 'Bloom', blurb: 'Your next paints blend much more strongly \u2014 lush, saturated edges.' },
  prism: { icon: '\u25C8', label: 'Prism', blurb: 'Your color cycles through the rainbow with every paint.' },
  supernova: { icon: '\u2737', label: 'Supernova', blurb: 'Your paints spread two cells out instead of one.' },
  additive: { icon: '\u2724', label: 'Additive', blurb: 'Neighbors blend by adding light \u2014 colors brighten as they overlap.' },
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
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    send({ type: 'GAME_JOIN', name: myName });
  }, [send, myName]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePaint = (x: number, y: number) => send({ type: 'GAME_PAINT', x, y });
  const handleReset = () => send({ type: 'GAME_RESET' });
  const setConfig = (patch: Record<string, unknown>) => send({ type: 'GAME_CONFIG', config: patch });

  const players = Object.values(state.players);
  const me = players.find((p) => p.name === myName);
  const myEffect = me ? state.effects[me.id] : undefined;

  const powerupAt = new Map<string, PowerUpKind>();
  for (const pu of state.powerups) powerupAt.set(`${pu.x},${pu.y}`, pu.kind);

  const boardW = cell * cols + GAP * (cols - 1);
  const boardH = cell * rows + GAP * (rows - 1);

  return (
    <div className="flex flex-col w-full h-full max-w-5xl mx-auto px-4 py-4 gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-white text-xl font-bold">Co-op Canvas</h2>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-400">{state.progress}% covered</span>
          <span className="text-fuchsia-300">{state.harmony}% harmony</span>
          <span className="text-slate-400">{players.length} player{players.length !== 1 ? 's' : ''}</span>
          {isHost && (
            <button onClick={() => setShowConfig((v) => !v)} className="text-indigo-300 hover:text-indigo-200">
              {showConfig ? 'Hide settings' : 'Settings'}
            </button>
          )}
          {isHost && (
            <button onClick={handleReset} className="text-red-400 hover:text-red-300">Reset</button>
          )}
        </div>
      </div>

      {myEffect && (
        <div className="flex items-center gap-2 self-start bg-indigo-900/40 border border-indigo-500/50 rounded-full px-3 py-1 text-sm">
          <span className="text-lg leading-none">{POWERUP_META[myEffect.kind].icon}</span>
          <span className="text-indigo-200 font-semibold">{POWERUP_META[myEffect.kind].label}</span>
          <span className="text-indigo-300/80">x{myEffect.charges} left</span>
          <span className="text-indigo-300/60 hidden sm:inline">{'\u2014'} {POWERUP_META[myEffect.kind].blurb}</span>
        </div>
      )}

      {isHost && showConfig && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-900/70 border border-slate-700 rounded-xl p-3 text-xs text-slate-300">
          <CanvasGridControls
            config={config}
            onChange={(patch) => setConfig(patch)}
          />
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
          <label className="flex flex-col gap-1">
            <span>Power-up every: {Math.round(config.powerupIntervalMs / 1000)}s</span>
            <input type="range" min={2} max={120} value={Math.round(config.powerupIntervalMs / 1000)}
              onChange={(e) => setConfig({ powerupIntervalMs: Number(e.target.value) * 1000 })} />
          </label>
          <label className="flex items-center gap-2 mt-4">
            <input type="checkbox" checked={config.powerupsEnabled}
              onChange={(e) => setConfig({ powerupsEnabled: e.target.checked })} />
            <span>Power-ups enabled</span>
          </label>
        </div>
      )}

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
              return (
                <div
                  key={`${x}-${y}`}
                  onClick={() => handlePaint(x, y)}
                  className="cursor-pointer hover:brightness-150 transition-[filter] duration-75 flex items-center justify-center"
                  style={{ background: color ?? '#0b1220' }}
                >
                  {pu && (
                    <span
                      className="leading-none animate-pulse pointer-events-none"
                      style={{ fontSize: Math.max(8, Math.floor(cell * 0.7)) }}
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

      <div className="flex flex-wrap gap-2">
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
    </div>
  );
}
