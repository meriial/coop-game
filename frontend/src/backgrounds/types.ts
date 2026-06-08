// Strategy-pattern background system.
//
// A *background* (broad algorithm) owns its render loop and exposes a set of
// *shared params* plus one or more swappable *strategies*. Each strategy is a
// tiny pure function plus its own *param schema*. The admin UI is generated from
// these ParamSpecs, so adding a strategy/background is just appending to an array.

export type ParamSpec =
  | { kind: 'number'; key: string; label: string; min: number; max: number; step: number; default: number }
  | { kind: 'boolean'; key: string; label: string; default: boolean }
  | { kind: 'color'; key: string; label: string; default: string }
  | { kind: 'select'; key: string; label: string; options: { value: string; label: string }[]; default: string };

export type ParamValues = Record<string, number | string | boolean>;

/** Context handed to a strategy's per-cell field function. */
export interface FieldContext {
  width: number;
  height: number;
  /** Elapsed seconds since the renderer mounted. */
  t: number;
  cols: number;
  rows: number;
  params: ParamValues;
}

export interface BackgroundStrategy {
  id: string;
  label: string;
  params: ParamSpec[];
  /** Scalar field in 0..1 for cell (cx, cy); drives the colour modulation. */
  field(cx: number, cy: number, fc: FieldContext): number;
}

/** Context handed to a background's whole-frame render. */
export interface FrameContext {
  width: number;
  height: number;
  t: number;
  strategyId: string;
  params: ParamValues;
}

export interface Background {
  id: string;
  label: string;
  /** Params shared across every strategy of this background (cell size, colours, …). */
  sharedParams: ParamSpec[];
  strategies: BackgroundStrategy[];
  /** Paint one frame onto the 2D context. */
  render(ctx: CanvasRenderingContext2D, frame: FrameContext): void;
}
