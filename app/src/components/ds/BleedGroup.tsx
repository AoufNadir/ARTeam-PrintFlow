import { useState } from 'react';
import { Link2, Unlink2 } from 'lucide-react';
import type { Unit } from '@/lib/types';
import { formatMeasure, parseDecimal, toMm } from '@/lib/units';
import { cn } from '@/lib/utils';

export interface BleedValue {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface BleedGroupProps {
  label?: string;
  value: BleedValue; // mm per side
  onChange: (v: BleedValue) => void;
  unit: Unit;
  className?: string;
}

const SIDES = [
  { key: 'top', label: 'أعلى' },
  { key: 'bottom', label: 'أسفل' },
  { key: 'right', label: 'يمين' },
  { key: 'left', label: 'يسار' },
] as const;

/** 4 linked mini-inputs (chain icon) + mini rect diagram with dashed bleed halo. */
export default function BleedGroup({ label, value, onChange, unit, className }: BleedGroupProps) {
  const [linked, setLinked] = useState(true);
  const [raw, setRaw] = useState<Partial<Record<keyof BleedValue, string>>>({});

  const commit = (side: keyof BleedValue, text: string) => {
    const n = parseDecimal(text);
    if (Number.isNaN(n) || n < 0) return;
    const mm = toMm(n, unit);
    if (linked) {
      onChange({ top: mm, bottom: mm, left: mm, right: mm });
    } else {
      onChange({ ...value, [side]: mm });
    }
  };

  return (
    <div className={className}>
      {label && (
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[13px] font-medium text-[var(--ink-700)]">{label}</span>
          <button
            type="button"
            onClick={() => setLinked((l) => !l)}
            title={linked ? 'فك الارتباط' : 'ربط الجهات'}
            className={cn(
              'grid h-7 w-7 place-items-center rounded-[6px] transition-colors',
              linked ? 'bg-[var(--cyan-100)] text-[var(--cyan-600)]' : 'bg-[var(--paper-100)] text-[var(--ink-400)]',
            )}
          >
            {linked ? <Link2 size={14} /> : <Unlink2 size={14} />}
          </button>
        </div>
      )}
      <div className="flex items-center gap-3">
        <div className="grid grid-cols-2 gap-1.5">
          {SIDES.map(({ key, label: sideLabel }) => (
            <label key={key} className="flex items-center gap-1">
              <span className="w-7 text-[11px] text-[var(--ink-400)]">{sideLabel}</span>
              <input
                dir="ltr"
                inputMode="decimal"
                className="font-latin h-8 w-14 rounded-[6px] border border-[var(--line-strong)] px-1.5 text-center text-[13px] tabular-nums outline-none focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)]"
                value={raw[key] ?? formatMeasure(value[key], unit)}
                onChange={(e) => {
                  setRaw((r) => ({ ...r, [key]: e.target.value }));
                  commit(key, e.target.value);
                }}
                onBlur={() => setRaw((r) => ({ ...r, [key]: undefined }))}
              />
            </label>
          ))}
        </div>
        {/* mini diagram: rect with dashed bleed halo */}
        <svg width="64" height="48" viewBox="0 0 64 48" className="shrink-0" aria-hidden>
          <rect x="8" y="6" width="48" height="36" rx="3" fill="none" stroke="#DB2777" strokeWidth="1.5" strokeDasharray="4 3" />
          <rect x="14" y="12" width="36" height="24" rx="2" fill="var(--cyan-50)" stroke="var(--cyan-600)" strokeWidth="1.5" />
        </svg>
      </div>
    </div>
  );
}
