import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  action?: { label: string; onClick: () => void };
}

export interface OnboardingChecklistProps {
  title: string;
  items: ChecklistItem[];
  footerNote?: string;
  className?: string;
}

/** First-run milestones card with animated progress bar. */
export default function OnboardingChecklist({ title, items, footerNote, className }: OnboardingChecklistProps) {
  const doneCount = items.filter((i) => i.done).length;
  const pct = items.length ? (doneCount / items.length) * 100 : 0;

  return (
    <div className={cn('rounded-[14px] border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-card)]', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-[17px] leading-[26px] font-semibold text-[var(--ink-900)]">{title}</h3>
        <span dir="ltr" className="font-latin text-[13px] font-semibold text-[var(--cyan-600)] tabular-nums">
          {doneCount}/{items.length}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--paper-100)]">
        <motion.div
          className="h-full rounded-full bg-[var(--cyan-500)]"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.22, 0.68, 0.26, 1] }}
        />
      </div>
      <ul className="mt-4 space-y-2">
        {items.map((item, i) => (
          <motion.li
            key={item.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.09, duration: 0.35 }}
            className="flex items-center justify-between gap-2 rounded-[8px] px-2 py-1.5"
          >
            <span className="flex items-center gap-2.5">
              <span
                className={cn(
                  'grid h-5 w-5 place-items-center rounded-full border',
                  item.done ? 'border-[var(--success-600)] bg-[var(--success-600)] text-white' : 'border-[var(--line-strong)] bg-white',
                )}
              >
                {item.done && <Check size={12} strokeWidth={3} />}
              </span>
              <span className={cn('text-[14px]', item.done ? 'text-[var(--ink-400)] line-through' : 'text-[var(--ink-700)]')}>
                {item.label}
              </span>
            </span>
            {!item.done && item.action && (
              <button
                type="button"
                onClick={item.action.onClick}
                className="rounded-[8px] px-2.5 py-1 text-[13px] font-medium text-[var(--cyan-600)] transition-colors hover:bg-[var(--cyan-50)]"
              >
                {item.action.label}
              </button>
            )}
          </motion.li>
        ))}
      </ul>
      {footerNote && <p className="mt-3 text-[11px] leading-4 text-[var(--ink-400)]">{footerNote}</p>}
    </div>
  );
}
