import { DELTA_UNIT_LABELS, formatDelta } from '@/lib/units';
import { cn } from '@/lib/utils';

export interface PriceChipProps {
  label: string;
  latinLabel?: string;
  delta: number;
  deltaUnit?: keyof typeof DELTA_UNIT_LABELS;
  /** dark = chip rendered on dark surfaces */
  dark?: boolean;
  className?: string;
}

/** Signature pattern: option label + inline price delta: "Papier Couché 350g — +10 دج/نسخة" */
export default function PriceChip({ label, latinLabel, delta, deltaUnit = 'perCopy', dark = false, className }: PriceChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px]',
        dark ? 'bg-[var(--cyan-100)] text-[var(--ink-900)]' : 'bg-[var(--paper-100)] text-[var(--ink-700)]',
        className,
      )}
    >
      <span className="font-medium">{label}</span>
      {latinLabel && (
        <span dir="ltr" className="font-latin text-[var(--ink-500)]">
          {latinLabel}
        </span>
      )}
      {delta !== 0 && (
        <span dir="ltr" className={cn('font-latin font-semibold', dark ? 'text-[var(--cyan-600)]' : 'text-[var(--cyan-600)]')}>
          {formatDelta(delta, DELTA_UNIT_LABELS[deltaUnit])}
        </span>
      )}
    </span>
  );
}
