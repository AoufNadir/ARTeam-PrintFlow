import { motion } from 'framer-motion';
import type { DevisStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const STATUS_STYLE: Record<DevisStatus, { label: string; dot: string; text: string; bg: string }> = {
  draft: { label: 'مسودة', dot: '#94A3B8', text: '#475569', bg: '#F1F5F9' },
  ready: { label: 'جاهز', dot: '#0D9488', text: '#0F766E', bg: '#CCFBF1' },
  sent: { label: 'مرسل', dot: '#0284C7', text: '#0369A1', bg: '#E0F2FE' },
  accepted: { label: 'مقبول', dot: '#16A34A', text: '#15803D', bg: '#DCFCE7' },
  rejected: { label: 'مرفوض', dot: '#DC2626', text: '#B91C1C', bg: '#FEE2E2' },
  expired: { label: 'منتهي', dot: '#D97706', text: '#B45309', bg: '#FEF3C7' },
  production: { label: 'إنتاج', dot: '#7C3AED', text: '#6D28D9', bg: '#EDE9FE' },
  done: { label: 'منفّذ', dot: '#7C3AED', text: '#6D28D9', bg: '#EDE9FE' },
};

export default function StatusPill({ status, className }: { status: DevisStatus; className?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <motion.span
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium', className)}
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
      {s.label}
    </motion.span>
  );
}
