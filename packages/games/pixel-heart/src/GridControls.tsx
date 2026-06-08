import type { PaintConfig } from '@workshop/protocol';
import { GRID_PRESETS, presetForConfig } from './grid-presets';

interface Props {
  config: Pick<PaintConfig, 'cols' | 'rows'>;
  onChange: (patch: { cols: number; rows: number }) => void;
  compact?: boolean;
}

export function CanvasGridControls({ config, onChange, compact = false }: Props) {
  const activePreset = presetForConfig(config);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-slate-500 text-xs hidden md:inline">Grid</span>
        <select
          value={activePreset ?? 'custom'}
          onChange={(e) => {
            const preset = GRID_PRESETS.find((p) => p.label === e.target.value);
            if (preset) onChange({ cols: preset.cols, rows: preset.rows });
          }}
          className="bg-slate-800 border border-slate-600 rounded-lg px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
        >
          {GRID_PRESETS.map((p) => (
            <option key={p.label} value={p.label}>{p.label} ({p.cols}×{p.rows})</option>
          ))}
          {!activePreset && (
            <option value="custom">Custom ({config.cols}×{config.rows})</option>
          )}
        </select>
        <label className="flex items-center gap-1 text-xs text-slate-400">
          <span className="hidden lg:inline">W</span>
          <input
            type="number" min={4} max={80} value={config.cols}
            onChange={(e) => onChange({ cols: Number(e.target.value), rows: config.rows })}
            className="w-12 bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
          />
        </label>
        <span className="text-slate-600 text-xs">×</span>
        <label className="flex items-center gap-1 text-xs text-slate-400">
          <span className="hidden lg:inline">H</span>
          <input
            type="number" min={4} max={80} value={config.rows}
            onChange={(e) => onChange({ cols: config.cols, rows: Number(e.target.value) })}
            className="w-12 bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
          />
        </label>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 col-span-2 sm:col-span-3">
      <span className="text-slate-400 text-xs font-medium">Grid size</span>
      <div className="flex flex-wrap gap-1.5">
        {GRID_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange({ cols: p.cols, rows: p.rows })}
            className={[
              'px-2.5 py-1 rounded-full text-xs border transition-colors',
              activePreset === p.label
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-500',
            ].join(' ')}
          >
            {p.label} ({p.cols}×{p.rows})
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-slate-500">Columns: {config.cols}</span>
          <input type="range" min={4} max={80} value={config.cols}
            onChange={(e) => onChange({ cols: Number(e.target.value), rows: config.rows })} />
        </label>
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-slate-500">Rows: {config.rows}</span>
          <input type="range" min={4} max={80} value={config.rows}
            onChange={(e) => onChange({ cols: config.cols, rows: Number(e.target.value) })} />
        </label>
      </div>
    </div>
  );
}
