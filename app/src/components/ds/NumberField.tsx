import { useId, useState } from 'react';
import { parseDecimal, trimNumber } from '@/lib/units';
import { cn } from '@/lib/utils';

export interface NumberFieldProps {
  label?: string;
  value: number | undefined;
  onChange: (v: number) => void;
  unitSuffix?: string;
  presets?: number[];
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

/** LTR numeric input accepting "1.5" and "1,5", with unit chip + preset chips. */
export default function NumberField({ label, value, onChange, unitSuffix, presets, min, max, step = 1, className }: NumberFieldProps) {
  const [raw, setRaw] = useState<string | null>(null);
  const inputId = useId();

  const commit = (text: string) => {
    const n = parseDecimal(text);
    if (!Number.isNaN(n)) {
      let v = n;
      if (min !== undefined) v = Math.max(min, v);
      if (max !== undefined) v = Math.min(max, v);
      onChange(v);
    }
  };

  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-[13px] font-medium text-[var(--ink-700)]">
          {label}
        </label>
      )}
      <div className="group flex h-10 items-stretch overflow-hidden rounded-[8px] border border-[var(--line-strong)] bg-white transition-shadow focus-within:border-[var(--cyan-600)] focus-within:shadow-[var(--shadow-focus)]">
        <input
          id={inputId}
          dir="ltr"
          inputMode="decimal"
          className="font-latin w-full px-3 text-[15px] tabular-nums outline-none"
          value={raw ?? (value === undefined ? '' : trimNumber(value))}
          onChange={(e) => {
            setRaw(e.target.value);
            commit(e.target.value);
          }}
          onBlur={() => setRaw(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              onChange((value ?? 0) + step);
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              onChange(Math.max(min ?? -Infinity, (value ?? 0) - step));
            }
          }}
        />
        {unitSuffix && (
          <span className="grid place-items-center border-s border-[var(--line)] bg-[var(--paper-100)] px-3 text-[12px] font-medium text-[var(--ink-500)]">
            {unitSuffix}
          </span>
        )}
      </div>
      {presets && presets.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[12px] transition-colors',
                value === p
                  ? 'border-[var(--cyan-600)] bg-[var(--cyan-100)] text-[var(--cyan-600)]'
                  : 'border-[var(--line)] bg-white text-[var(--ink-500)] hover:bg-[var(--paper-100)]',
              )}
            >
              <span dir="ltr" className="font-latin tabular-nums">
                {p}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
