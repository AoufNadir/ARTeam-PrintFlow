import { motion } from 'framer-motion';
import { DELTA_UNIT_LABELS, formatDelta } from '@/lib/units';
import { cn } from '@/lib/utils';

export interface YesNoToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  latinLabel?: string;
  priceDelta?: number;
  deltaUnit?: keyof typeof DELTA_UNIT_LABELS;
  className?: string;
}

/** Spring-knob switch with optional inline price delta: "Pelliculage Mat — +3 دج/نسخة" */
export default function YesNoToggle({ checked, onChange, label, latinLabel, priceDelta, deltaUnit = 'perCopy', className }: YesNoToggleProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <span className="flex min-w-0 items-center gap-2 text-[14px] text-[var(--ink-700)]">
        <span className="truncate">{label}</span>
        {latinLabel && (
          <span dir="ltr" className="font-latin truncate text-[var(--ink-500)]">
            {latinLabel}
          </span>
        )}
        {priceDelta !== undefined && priceDelta !== 0 && (
          <span dir="ltr" className="font-latin shrink-0 font-semibold text-[var(--cyan-600)]">
            {formatDelta(priceDelta, DELTA_UNIT_LABELS[deltaUnit])}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-[var(--cyan-600)]' : 'bg-[var(--line-strong)]',
        )}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow', checked ? 'end-[22px]' : 'end-0.5')}
        />
      </button>
    </div>
  );
}
