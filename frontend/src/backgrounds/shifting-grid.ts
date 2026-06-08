import type { Background, BackgroundStrategy, FieldContext, ParamSpec, ParamValues } from './types';

// ── helpers ──────────────────────────────────────────────────────────────────

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
  if (!m) return { r: 2, g: 6, b: 23 }; // #020617
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Cheap deterministic value noise: smooth-interpolated hashed lattice in 0..1. */
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const tl = hash2(xi, yi);
  const tr = hash2(xi + 1, yi);
  const bl = hash2(xi, yi + 1);
  const br = hash2(xi + 1, yi + 1);
  return lerp(lerp(tl, tr, xf), lerp(bl, br, xf), yf);
}

// ── strategies ───────────────────────────────────────────────────────────────

const drift: BackgroundStrategy = {
  id: 'drift',
  label: 'Drift',
  params: [
    { kind: 'number', key: 'noiseScale', label: 'Noise scale', min: 0.05, max: 0.6, step: 0.01, default: 0.18 },
  ],
  field(cx, cy, fc) {
    const s = num(fc.params, 'noiseScale', 0.18);
    const t = fc.t * 0.12; // strategy moves slowly relative to global speed
    // Two drifting octaves so the field never looks like a static gradient.
    const a = valueNoise(cx * s + t, cy * s - t * 0.7);
    const b = valueNoise(cx * s * 2.1 - t * 0.5, cy * s * 2.1 + t * 0.9);
    return Math.min(1, Math.max(0, a * 0.65 + b * 0.35));
  },
};

const waves: BackgroundStrategy = {
  id: 'waves',
  label: 'Waves',
  params: [
    { kind: 'number', key: 'frequency', label: 'Frequency', min: 0.05, max: 1, step: 0.01, default: 0.25 },
    { kind: 'number', key: 'angle', label: 'Angle', min: 0, max: 6.28, step: 0.05, default: 0.6 },
  ],
  field(cx, cy, fc) {
    const f = num(fc.params, 'frequency', 0.25);
    const ang = num(fc.params, 'angle', 0.6);
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const t = fc.t;
    // Sum of a few sinusoids along the chosen axis + a cross ripple.
    const u = (cx * dx + cy * dy) * f;
    const v = (cx * -dy + cy * dx) * f;
    const s =
      Math.sin(u + t * 0.8) * 0.5 +
      Math.sin(u * 0.5 - t * 0.5) * 0.3 +
      Math.sin(v * 0.7 + t * 0.3) * 0.2;
    return (s + 1) / 2;
  },
};

const ripple: BackgroundStrategy = {
  id: 'ripple',
  label: 'Ripple',
  params: [
    { kind: 'number', key: 'wavelength', label: 'Wavelength', min: 1, max: 16, step: 0.5, default: 6 },
  ],
  field(cx, cy, fc) {
    const wl = num(fc.params, 'wavelength', 6);
    const t = fc.t;
    // Centre drifts slowly so the rings never sit still.
    const cxC = fc.cols * (0.5 + 0.25 * Math.sin(t * 0.13));
    const cyC = fc.rows * (0.5 + 0.25 * Math.cos(t * 0.11));
    const d = Math.hypot(cx - cxC, cy - cyC);
    return (Math.sin(d / wl - t * 0.9) + 1) / 2;
  },
};

// ── background ───────────────────────────────────────────────────────────────

const sharedParams: ParamSpec[] = [
  { kind: 'number', key: 'cellSize', label: 'Cell size', min: 12, max: 240, step: 2, default: 40 },
  { kind: 'color', key: 'baseColor', label: 'Base colour', default: '#020617' },
  { kind: 'color', key: 'tintColor', label: 'Tint colour', default: '#15244f' },
  { kind: 'number', key: 'intensity', label: 'Intensity', min: 0, max: 0.6, step: 0.01, default: 0.2 },
  { kind: 'number', key: 'speed', label: 'Speed', min: 0.05, max: 2, step: 0.05, default: 0.4 },
  { kind: 'number', key: 'borderWidth', label: 'Border width', min: 0, max: 8, step: 1, default: 1 },
  { kind: 'color', key: 'borderColor', label: 'Border colour', default: '#020617' },
];

export const shiftingGrid: Background = {
  id: 'shifting-grid',
  label: 'Shifting Grid',
  sharedParams,
  strategies: [drift, waves, ripple],
  render(ctx, frame) {
    const { width, height, params } = frame;
    const cell = Math.max(8, num(params, 'cellSize', 40));
    const cols = Math.ceil(width / cell);
    const rows = Math.ceil(height / cell);
    const intensity = num(params, 'intensity', 0.12);
    const speed = num(params, 'speed', 0.4);
    const base = hexToRgb(str(params, 'baseColor', '#020617'));
    const tint = hexToRgb(str(params, 'tintColor', '#0b1030'));
    // Border is static — it never varies with the strategy. It's painted as a
    // full-canvas fill that shows through the gaps between inset cells.
    const border = Math.max(0, Math.min(Math.floor(cell / 2), Math.round(num(params, 'borderWidth', 1))));
    const borderRgb = hexToRgb(str(params, 'borderColor', '#020617'));

    const strategy =
      this.strategies.find((s) => s.id === frame.strategyId) ?? this.strategies[0];
    const fc: FieldContext = { width, height, t: frame.t * speed, cols, rows, params };

    // Fill the whole canvas: with no border this is the base colour; with a
    // border it's the border colour, which the inset cells reveal as grid lines.
    const bg = border > 0 ? borderRgb : base;
    ctx.fillStyle = `rgb(${bg.r},${bg.g},${bg.b})`;
    ctx.fillRect(0, 0, width, height);

    const inner = cell - border; // cell size minus the top/left grid line
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const v = strategy.field(cx, cy, fc); // 0..1
        const mix = v * intensity;
        const r = Math.round(lerp(base.r, tint.r, mix));
        const g = Math.round(lerp(base.g, tint.g, mix));
        const b = Math.round(lerp(base.b, tint.b, mix));
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(cx * cell + border, cy * cell + border, inner, inner);
      }
    }
  },
};
