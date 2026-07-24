import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  /** illustration path under /public, e.g. "/empty-quotes.svg" */
  image?: string;
  title: string;
  helper?: string;
  action?: ReactNode;
  className?: string;
}

/** Registration-target / themed illustration + H3 + helper + primary CTA. */
export default function EmptyState({ image, title, helper, action, className }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 0.68, 0.26, 1] }}
      className={cn(
        'relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-[14px] border border-dashed border-[var(--line-strong)] bg-[var(--paper-100)] px-6 py-12 text-center',
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: 'url(/texture-halftone.svg)', backgroundSize: '512px' }}
        aria-hidden
      />
      {image ? (
        <img src={image} alt="" className="relative h-40 w-auto object-contain" />
      ) : (
        <svg width="56" height="56" viewBox="0 0 56 56" className="relative text-[var(--ink-400)]" fill="none" aria-hidden>
          <circle cx="28" cy="28" r="20" stroke="currentColor" strokeWidth="2" />
          <circle cx="28" cy="28" r="6" stroke="var(--cyan-500)" strokeWidth="2" />
          <path d="M28 4v48M4 28h48" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )}
      <h3 className="relative text-[17px] leading-[26px] font-semibold text-[var(--ink-900)]">{title}</h3>
      {helper && <p className="relative max-w-sm text-[13px] leading-5 text-[var(--ink-500)]">{helper}</p>}
      {action && <div className="relative mt-1">{action}</div>}
    </motion.div>
  );
}
