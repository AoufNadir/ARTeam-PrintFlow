import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { CropMarks } from '@/components/ds/SectionCard';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Centered destructive-action confirm dialog with crop-marks + icon shake. */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[95] grid place-items-center bg-[rgba(21,23,30,0.35)] p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onCancel}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.24, ease: [0.22, 0.68, 0.26, 1] }}
            className="relative w-[420px] max-w-[92vw] rounded-[18px] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-pop)]"
            onClick={(e) => e.stopPropagation()}
          >
            <CropMarks opacity={0.4} offset={8} />
            <div className="flex items-start gap-3">
              <motion.span
                animate={{ rotate: [0, -6, 6, -3, 0] }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className={
                  danger
                    ? 'grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[#FEE2E2] text-[var(--danger-600)]'
                    : 'grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[var(--cyan-100)] text-[var(--cyan-600)]'
                }
              >
                <AlertTriangle size={19} />
              </motion.span>
              <div className="min-w-0">
                <h3 className="text-[17px] leading-[26px] font-semibold text-[var(--ink-900)]">{title}</h3>
                <p className="mt-1 text-[13px] leading-5 text-[var(--ink-500)]">{message}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="h-10 rounded-[10px] border border-[var(--line-strong)] px-4 text-[14px] font-medium text-[var(--ink-700)] transition-colors hover:bg-[var(--paper-100)]"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={
                  danger
                    ? 'h-10 rounded-[10px] bg-[var(--danger-600)] px-4 text-[14px] font-semibold text-white transition-all hover:brightness-110 active:scale-[0.97]'
                    : 'h-10 rounded-[10px] bg-[var(--cyan-600)] px-4 text-[14px] font-semibold text-white transition-all hover:bg-[var(--cyan-500)] active:scale-[0.97]'
                }
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
