import { useState } from 'react';
import type { DimensionValue, Unit } from '@/lib/types';
import { formatMeasure, parseDecimal, toMm } from '@/lib/units';
import { cn } from '@/lib/utils';

export interface DimensionGroupProps {
  label?: string;
  value: DimensionValue; // mm internally
  onChange: (v: DimensionValue) => void;
  unit: Unit;
  onUnitChange: (u: Unit) => void;
  className?: string;
}

/** Fused control: [العرض] × [الارتفاع] [وحدة▾] — values stored in mm, unit toggle converts live. */
export default function DimensionGroup({ label, value, onChange, unit, onUnitChange, className }: DimensionGroupProps) {
  const [rawW, setRawW] = useState<string | null>(null);
  const [rawH, setRawH] = useState<string | null>(null);

  const commit = (text: string, side: 'w' | 'h') => {
    const n = parseDecimal(text);
    if (Number.isNaN(n) || n < 0) return;
    const mm = toMm(n, unit);
    onChange(side === 'w' ? { ...value, widthMm: mm } : { ...value, heightMm: mm });
  };

  const inputCls =
    'font-latin h-10 w-full bg-transparent px-3 text-center text-[15px] tabular-nums outline-none focus:bg-[var(--cyan-50)]';

  return (
    <div className={className}>
      {label && <span className="mb-1.5 block text-[13px] font-medium text-[var(--ink-700)]">{label}</span>}
      <div
        dir="ltr"
        className="flex h-10 items-stretch overflow-hidden rounded-[8px] border border-[var(--line-strong)] bg-white transition-shadow focus-within:border-[var(--cyan-600)] focus-within:shadow-[var(--shadow-focus)]"
      >
        <input
          inputMode="decimal"
          aria-label="العرض"
          className={inputCls}
          value={rawW ?? formatMeasure(value.widthMm, unit)}
          onChange={(e) => {
            setRawW(e.target.value);
            commit(e.target.value, 'w');
          }}
          onBlur={() => setRawW(null)}
        />
        <span className="grid shrink-0 place-items-center px-1 text-[var(--ink-400)]">×</span>
        <input
          inputMode="decimal"
          aria-label="الارتفاع"
          className={inputCls}
          value={rawH ?? formatMeasure(value.heightMm, unit)}
          onChange={(e) => {
            setRawH(e.target.value);
            commit(e.target.value, 'h');
          }}
          onBlur={() => setRawH(null)}
        />
        <button
          type="button"
          onClick={() => onUnitChange(unit === 'mm' ? 'cm' : 'mm')}
          className={cn(
            'shrink-0 border-s border-[var(--line)] bg-[var(--paper-100)] px-3 text-[12px] font-semibold text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-200)]',
          )}
        >
          <span dir="ltr" className="font-latin">
            {unit}
          </span>
        </button>
      </div>
    </div>
  );
}
