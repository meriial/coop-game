import type { Background, BackgroundStrategy, FieldContext, ParamSpec, ParamValues } from './types';

function num(p: ParamValues, k: string, fallback: number): number {
  const v = p[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(p: ParamValues, k: string, fallback: string): string {
  const v = p[k];
  return typeof v === 'string' ? v : fallback;
}

interface RGB { r: number; g: number; b: number }

function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 2, g: 6, b: 23 };
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// ── strategies ────────────────────────────────────────────────────────────────
// The field function receives the sparkle's lifecycle phase (0..1) as `cx`;
// `cy` is unused. It returns a brightness multiplier (0..1).

const fade: BackgroundStrategy = {
  id: 'fade',
  label: 'Fade',
  params: [
    { kind: 'number', key: 'fadeIn', label: 'Fade in', min: 0, max: 0.5, step: 0.05, default: 0.25 },
    { kind: 'number', key: 'fadeOut', label: 'Fade out', min: 0.1, max: 0.8, step: 0.05, default: 0.4 },
  ],
  field(phase, _cy, fc) {
    const fi = num(fc.params, 'fadeIn', 0.25);
    const fo = num(fc.params, 'fadeOut', 0.4);
    if (phase < fi) return phase / fi;
    if (phase > 1 - fo) return (1 - phase) / fo;
    return 1;
  },
};

// Appears instantly, then fades out.
const flash: BackgroundStrategy = {
  id: 'flash',
  label: 'Flash',
  params: [
    { kind: 'number', key: 'fadeOut', label: 'Fade out', min: 0.2, max: 1.0, step: 0.05, default: 0.6 },
  ],
  field(phase, _cy, fc) {
    const fo = num(fc.params, 'fadeOut', 0.6);
    if (phase > 1 - fo) return (1 - phase) / fo;
    return 1;
  },
};

// Smooth sine arch: soft bloom that rises and falls organically.
const pulse: BackgroundStrategy = {
  id: 'pulse',
  label: 'Pulse',
  params: [],
  field(phase) {
    return Math.sin(phase * Math.PI);
  },
};

// ── background ────────────────────────────────────────────────────────────────

const sharedParams: ParamSpec[] = [
  { kind: 'number', key: 'cellSize', label: 'Cell size', min: 8, max: 120, step: 4, default: 32 },
  { kind: 'color', key: 'baseColor', label: 'Base colour', default: '#020617' },
  { kind: 'color', key: 'sparkleColor', label: 'Sparkle colour', default: '#c7d2fe' },
  { kind: 'number', key: 'maxAlpha', label: 'Max brightness', min: 0.05, max: 1, step: 0.05, default: 0.7 },
  { kind: 'number', key: 'frequency', label: 'Frequency /s', min: 0.2, max: 20, step: 0.2, default: 4 },
  { kind: 'number', key: 'lifespan', label: 'Lifespan (s)', min: 0.2, max: 6, step: 0.1, default: 1.2 },
];

// Linear-congruential hash: maps a slot index to a stable pseudo-random 32-bit value.
function slotHash(i: number): number {
  return ((i * 1664525 + 1013904223) >>> 0);
}

export const sparkles: Background = {
  id: 'sparkles',
  label: 'Sparkles',
  sharedParams,
  strategies: [fade, flash, pulse],

  render(ctx, frame) {
    const { width, height, params, t } = frame;
    const cellSize = Math.max(8, num(params, 'cellSize', 32));
    const cols = Math.ceil(width / cellSize);
    const rows = Math.ceil(height / cellSize);
    const base = hexToRgb(str(params, 'baseColor', '#020617'));
    const spk = hexToRgb(str(params, 'sparkleColor', '#c7d2fe'));
    const maxAlpha = num(params, 'maxAlpha', 0.7);
    const frequency = Math.max(0.1, num(params, 'frequency', 4));
    const lifespan = Math.max(0.1, num(params, 'lifespan', 1.2));
    const spawnInterval = 1 / frequency;

    ctx.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
    ctx.fillRect(0, 0, width, height);

    const strategy = this.strategies.find((s) => s.id === frame.strategyId) ?? this.strategies[0];
    const fc: FieldContext = { width, height, t, cols, rows, params };

    // Each "slot" i spawns one sparkle at time i * spawnInterval. We look back
    // far enough to cover any sparkle still within its lifespan.
    const currentSlot = Math.floor(t / spawnInterval);
    const lookback = Math.ceil(lifespan / spawnInterval) + 1;

    for (let i = Math.max(0, currentSlot - lookback); i <= currentSlot; i++) {
      const age = t - i * spawnInterval;
      if (age < 0 || age > lifespan) continue;

      const phase = age / lifespan; // 0..1
      const brightness = strategy.field(phase, 0, fc);
      if (brightness <= 0.001) continue;

      // Map the slot to a deterministic grid cell.
      const h = slotHash(i);
      const cellIdx = h % (cols * rows);
      const cx = cellIdx % cols;
      const cy = Math.floor(cellIdx / cols);

      ctx.fillStyle = `rgba(${spk.r},${spk.g},${spk.b},${brightness * maxAlpha})`;
      ctx.fillRect(cx * cellSize, cy * cellSize, cellSize, cellSize);
    }
  },
};
