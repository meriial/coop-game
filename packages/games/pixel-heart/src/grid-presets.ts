import type { PaintConfig } from '@workshop/protocol';

export const GRID_PRESETS: { label: string; cols: number; rows: number }[] = [
  { label: 'Small', cols: 16, rows: 12 },
  { label: 'Default', cols: 32, rows: 18 },
  { label: 'Wide', cols: 48, rows: 18 },
  { label: 'Square', cols: 24, rows: 24 },
  { label: 'Large', cols: 48, rows: 32 },
];

export function presetForConfig(config: Pick<PaintConfig, 'cols' | 'rows'>): string | null {
  const match = GRID_PRESETS.find((p) => p.cols === config.cols && p.rows === config.rows);
  return match?.label ?? null;
}
