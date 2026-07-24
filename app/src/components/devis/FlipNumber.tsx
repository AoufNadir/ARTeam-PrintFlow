import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface FlipNumberProps {
  value: number;
  /** formatter, defaults to Latin thousands grouping */
  format?: (n: number) => string;
  className?: string;
}

const defaultFormat = (n: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Math.round(n * 100) / 100);

/**
 * Per-character digit flip: changed digits re-mount and slide y 12→0 with a
 * 30ms stagger — the price-recalculation signature motion (design.md §7).
 */
export default function FlipNumber({ value, format = defaultFormat, className }: FlipNumberProps) {
  const text = format(value);
  return (
    <span dir="ltr" className={cn('font-latin inline-flex tabular-nums', className)} aria-label={text}>
      {text.split('').map((ch, i) => (
        <span key={`${i}-${ch}`} className="inline-block overflow-hidden">
          <motion.span
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.18, delay: i * 0.03, ease: [0.22, 0.68, 0.26, 1] }}
            className="inline-block"
          >
            {ch === ' ' ? ' ' : ch}
          </motion.span>
        </span>
      ))}
    </span>
  );
}
