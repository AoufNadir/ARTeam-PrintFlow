import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  title?: string;
  helper?: string;
  /** retry / recovery action slot */
  action?: ReactNode;
  className?: string;
}

/** Friendly error panel (danger tint, registration-target motif), announced via role="alert". */
export default function ErrorState({ title = 'حدث خطأ غير متوقع', helper, action, className }: ErrorStateProps) {
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 0.68, 0.26, 1] }}
      className={cn(
        'relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-[14px] border border-[var(--danger-600)]/25 bg-[#FEF2F2] px-6 py-12 text-center',
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{ backgroundImage: 'url(/texture-halftone.svg)', backgroundSize: '512px' }}
        aria-hidden
      />
      <span className="relative grid h-12 w-12 place-items-center rounded-full bg-[#FEE2E2] text-[var(--danger-600)]">
        <AlertTriangle size={22} />
      </span>
      <h3 className="relative text-[17px] leading-[26px] font-semibold text-[var(--ink-900)]">{title}</h3>
      {helper && <p className="relative max-w-sm text-[13px] leading-5 text-[var(--ink-500)]">{helper}</p>}
      {action && <div className="relative mt-1">{action}</div>}
    </motion.div>
  );
}
