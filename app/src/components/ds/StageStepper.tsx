import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StageStepperProps {
  steps: string[];
  current: number; // zero-based index of the current step
  className?: string;
  onStepClick?: (index: number) => void;
}

/** Horizontal RTL stepper: numbered circles + connector fill animation. */
export default function StageStepper({ steps, current, className, onStepClick }: StageStepperProps) {
  return (
    <ol className={cn('flex items-center', className)} dir="rtl">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className={cn('flex items-center', i < steps.length - 1 && 'flex-1')}>
            <button
              type="button"
              disabled={!onStepClick || i > current}
              onClick={() => onStepClick?.(i)}
              className="group flex items-center gap-2"
            >
              <motion.span
                animate={active ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                transition={{ duration: 0.4 }}
                className={cn(
                  'font-latin grid h-8 w-8 shrink-0 place-items-center rounded-full border text-[13px] font-semibold tabular-nums transition-colors',
                  done && 'border-[var(--cyan-500)] bg-[var(--cyan-500)] text-white',
                  active && 'border-[var(--cyan-600)] bg-white text-[var(--cyan-600)] ring-4 ring-[rgba(2,132,199,0.22)]',
                  !done && !active && 'border-[var(--line-strong)] bg-white text-[var(--ink-400)]',
                )}
              >
                {done ? <Check size={15} strokeWidth={3} /> : i + 1}
              </motion.span>
              <span
                className={cn(
                  'text-[13px] whitespace-nowrap',
                  active ? 'font-semibold text-[var(--ink-900)]' : done ? 'text-[var(--ink-700)]' : 'text-[var(--ink-400)]',
                )}
              >
                {label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <span className="relative mx-3 h-0.5 flex-1 overflow-hidden rounded-full bg-[var(--line)]">
                <motion.span
                  className="absolute inset-y-0 start-0 bg-[var(--cyan-500)]"
                  initial={false}
                  animate={{ width: done ? '100%' : '0%' }}
                  transition={{ duration: 0.3 }}
                />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
