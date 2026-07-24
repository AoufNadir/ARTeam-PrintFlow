import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StageCardProps {
  /** stage letter badge, e.g. "A" */
  letter: string;
  title: string;
  /** one-line summary shown in the header when collapsed */
  summary?: string;
  defaultCollapsed?: boolean;
  children: ReactNode;
  className?: string;
}

/** Collapsible stage card for the montage controls column ("طيّ" behavior). */
export default function StageCard({ letter, title, summary, defaultCollapsed = false, children, className }: StageCardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <section className={cn('rounded-[14px] border border-[var(--line)] bg-white shadow-[var(--shadow-card)]', className)}>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-start"
        aria-expanded={!collapsed}
      >
        <span
          dir="ltr"
          className="font-latin grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--cyan-100)] text-[11px] font-semibold text-[var(--cyan-600)]"
        >
          {letter}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-[var(--ink-900)]">{title}</span>
          <AnimatePresence initial={false}>
            {collapsed && summary && (
              <motion.span
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="block truncate text-[11px] text-[var(--ink-400)]"
              >
                {summary}
              </motion.span>
            )}
          </AnimatePresence>
        </span>
        <motion.span animate={{ rotate: collapsed ? -180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0 text-[var(--ink-400)]">
          <ChevronDown size={16} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--line)] px-4 py-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
