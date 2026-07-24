import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import gsap from 'gsap';
import { cn } from '@/lib/utils';

export interface KpiCardProps {
  label: string;
  /** numeric value for count-up; formatted via `format` */
  value: number;
  format?: (n: number) => string;
  delta?: { label: string; tone: 'success' | 'danger' | 'slate' };
  /** sparkline / gauge slot (recharts, WasteMeter, ...) */
  chart?: ReactNode;
  onClick?: () => void;
  className?: string;
  delay?: number;
}

const TONE: Record<string, string> = {
  success: 'bg-[#DCFCE7] text-[#15803D]',
  danger: 'bg-[#FEE2E2] text-[#B91C1C]',
  slate: 'bg-[#F1F5F9] text-[#475569]',
};

export default function KpiCard({ label, value, format, delta, chart, onClick, className, delay = 0 }: KpiCardProps) {
  const [display, setDisplay] = useState(0);
  const numRef = useRef({ v: 0 });
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return; // reduced motion: render `value` directly, no tween
    const tween = gsap.to(numRef.current, {
      v: value,
      duration: 1.1,
      delay,
      ease: 'power2.out',
      onUpdate: () => setDisplay(numRef.current.v),
    });
    return () => {
      tween.kill();
    };
  }, [value, delay, reduceMotion]);

  const fmt = format ?? ((n: number) => String(Math.round(n)));
  const interactive = !!onClick;

  return (
    <motion.div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 0.68, 0.26, 1] }}
      whileHover={interactive ? { y: -2, transition: { duration: 0.2 } } : undefined}
      className={cn(
        'rounded-[14px] border border-[var(--line)] bg-white p-5 text-start shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-pop)]',
        interactive && 'cursor-pointer',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium tracking-[0.04em] text-[var(--ink-400)]">{label}</span>
        {delta && (
          // bidi handles mixed Arabic/numbers — no forced dir="ltr" (it broke Arabic labels)
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', TONE[delta.tone])}>
            {delta.label}
          </span>
        )}
      </div>
      <div className="font-latin mt-2 text-[30px] leading-9 font-semibold text-[var(--ink-900)] tabular-nums" dir="ltr">
        {fmt(reduceMotion ? value : display)}
      </div>
      {chart && <div className="mt-3 h-12">{chart}</div>}
    </motion.div>
  );
}
