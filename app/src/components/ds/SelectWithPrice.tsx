import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';
import type { FieldOption } from '@/lib/types';
import { DELTA_UNIT_LABELS, formatDelta } from '@/lib/units';
import { cn } from '@/lib/utils';

export interface SelectWithPriceProps {
  options: FieldOption[];
  value?: string;
  onChange: (id: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
}

/** Custom dropdown where every option row shows its price delta inline. */
export default function SelectWithPrice({ options, value, onChange, label, placeholder = 'اختر…', className }: SelectWithPriceProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const deltaText = (o: FieldOption) =>
    o.priceDelta !== 0 ? formatDelta(o.priceDelta, DELTA_UNIT_LABELS[o.deltaUnit]) : null;

  return (
    <div ref={ref} className={cn('relative', className)}>
      {label && <span className="mb-1.5 block text-[13px] font-medium text-[var(--ink-700)]">{label}</span>}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-[8px] border border-[var(--line-strong)] bg-white px-3 text-[14px] transition-shadow focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)] focus:outline-none"
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{selected.label}</span>
            {selected.latinLabel && (
              <span dir="ltr" className="font-latin truncate text-[var(--ink-500)]">
                {selected.latinLabel}
              </span>
            )}
            {deltaText(selected) && (
              <span dir="ltr" className="font-latin shrink-0 font-semibold text-[var(--cyan-600)]">
                {deltaText(selected)}
              </span>
            )}
          </span>
        ) : (
          <span className="text-[var(--ink-400)]">{placeholder}</span>
        )}
        <motion.span animate={{ rotate: open ? -180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0 text-[var(--ink-400)]">
          <ChevronDown size={16} />
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="absolute z-40 mt-1 w-full overflow-hidden rounded-[10px] border border-[var(--line)] bg-white shadow-[var(--shadow-pop)]"
          >
            {options.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-[14px] transition-colors hover:bg-[var(--cyan-50)]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {o.id === value ? (
                      <Check size={14} className="shrink-0 text-[var(--cyan-600)]" />
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )}
                    <span className="truncate">{o.label}</span>
                    {o.latinLabel && (
                      <span dir="ltr" className="font-latin truncate text-[var(--ink-500)]">
                        {o.latinLabel}
                      </span>
                    )}
                  </span>
                  {deltaText(o) && (
                    <span dir="ltr" className="font-latin shrink-0 font-semibold text-[var(--cyan-600)]">
                      {deltaText(o)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
