import type { ParamSpec, ParamValues } from '../backgrounds/types';

interface Props {
  specs: ParamSpec[];
  values: ParamValues;
  onChange: (key: string, value: number | string | boolean) => void;
}

/** Renders a control per ParamSpec, driving the background config. */
export function ParamControls({ specs, values, onChange }: Props) {
  return (
    <>
      {specs.map((spec) => {
        switch (spec.kind) {
          case 'number': {
            const v = typeof values[spec.key] === 'number' ? (values[spec.key] as number) : spec.default;
            return (
              <label key={spec.key} className="flex flex-col gap-1">
                <span>{spec.label}: {v}</span>
                <input
                  type="range"
                  min={spec.min}
                  max={spec.max}
                  step={spec.step}
                  value={v}
                  onChange={(e) => onChange(spec.key, Number(e.target.value))}
                />
              </label>
            );
          }
          case 'boolean': {
            const v = typeof values[spec.key] === 'boolean' ? (values[spec.key] as boolean) : spec.default;
            return (
              <label key={spec.key} className="flex items-center gap-2">
                <input type="checkbox" checked={v} onChange={(e) => onChange(spec.key, e.target.checked)} />
                <span>{spec.label}</span>
              </label>
            );
          }
          case 'color': {
            const v = typeof values[spec.key] === 'string' ? (values[spec.key] as string) : spec.default;
            return (
              <label key={spec.key} className="flex items-center justify-between gap-2">
                <span>{spec.label}</span>
                <input
                  type="color"
                  value={v}
                  onChange={(e) => onChange(spec.key, e.target.value)}
                  className="h-6 w-10 rounded border border-slate-600 bg-transparent"
                />
              </label>
            );
          }
          case 'select': {
            const v = typeof values[spec.key] === 'string' ? (values[spec.key] as string) : spec.default;
            return (
              <div key={spec.key} className="flex flex-col gap-1">
                <span>{spec.label}</span>
                <div className="flex flex-wrap gap-1.5">
                  {spec.options.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => onChange(spec.key, opt.value)}
                      className={[
                        'px-2 py-0.5 rounded text-xs border transition-colors',
                        v === opt.value
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-500',
                      ].join(' ')}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          }
          default:
            return null;
        }
      })}
    </>
  );
}
