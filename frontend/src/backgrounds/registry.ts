import type { BgConfig } from '@workshop/protocol';
import type { Background, ParamSpec, ParamValues } from './types';

const registry = new Map<string, Background>();
const order: string[] = [];

export function register(bg: Background): void {
  if (!registry.has(bg.id)) order.push(bg.id);
  registry.set(bg.id, bg);
}

export function get(id: string): Background | undefined {
  return registry.get(id);
}

export function list(): Background[] {
  return order.map((id) => registry.get(id)!).filter(Boolean);
}

function defaultsFor(specs: ParamSpec[]): ParamValues {
  const out: ParamValues = {};
  for (const s of specs) out[s.key] = s.default;
  return out;
}

/**
 * Resolve a (possibly partial) param set against a background + strategy: every
 * param defined by the shared schema and the selected strategy gets a value,
 * preferring `partial` then falling back to schema defaults. Param keys that no
 * longer belong to the active schema are dropped.
 */
export function resolveParams(
  bg: Background,
  strategyId: string,
  partial: ParamValues = {},
): ParamValues {
  const strat = bg.strategies.find((s) => s.id === strategyId) ?? bg.strategies[0];
  const specs = [...bg.sharedParams, ...strat.params];
  const out: ParamValues = {};
  for (const s of specs) out[s.key] = s.key in partial ? partial[s.key] : s.default;
  return out;
}

/** Config used before the server delivers one (and when a stored id is unknown). */
export function defaultBgConfig(): BgConfig {
  const bg = list()[0];
  if (!bg) return { backgroundId: '', strategyId: '', params: {} };
  const strategyId = bg.strategies[0].id;
  return {
    backgroundId: bg.id,
    strategyId,
    params: { ...defaultsFor(bg.sharedParams), ...defaultsFor(bg.strategies[0].params) },
  };
}
