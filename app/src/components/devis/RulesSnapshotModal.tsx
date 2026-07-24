import { AnimatePresence, motion } from 'framer-motion';
import { Lock, X } from 'lucide-react';
import { CropMarks } from '@/components/ds/SectionCard';
import VersionBadge from '@/components/ds/VersionBadge';
import type { PricingRule } from '@/lib/types';
import { BASIS_LABELS } from '@/lib/units';

export interface RulesSnapshotModalProps {
  open: boolean;
  rules: PricingRule[];
  version: number;
  dateLabel: string;
  onClose: () => void;
}

/** Read-only view of the exact pricing-rules snapshot frozen inside a Devis. */
export default function RulesSnapshotModal({ open, rules, version, dateLabel, onClose }: RulesSnapshotModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(21,23,30,0.35)] p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="نسخة قواعد الأسعار المحفوظة"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.24, ease: [0.22, 0.68, 0.26, 1] }}
            className="relative w-[560px] max-w-[94vw] rounded-[18px] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-pop)]"
            onClick={(e) => e.stopPropagation()}
          >
            <CropMarks opacity={0.4} offset={8} />
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-[17px] leading-[26px] font-semibold text-[var(--ink-900)]">نسخة محفوظة داخل العرض</h3>
                  <VersionBadge version={version} />
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-[12px] text-[var(--ink-500)]">
                  <Lock size={12} />
                  قواعد الأسعار كما كانت بتاريخ {dateLabel} — للقراءة فقط.
                </p>
              </div>
              <button
                type="button"
                aria-label="إغلاق"
                onClick={onClose}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-[var(--ink-400)] transition-colors hover:bg-[var(--paper-100)] hover:text-[var(--ink-700)]"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 overflow-hidden rounded-[10px] border border-[var(--line)]">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="bg-[var(--paper-100)] text-[11px] tracking-[0.04em] text-[var(--ink-400)]">
                    <th className="px-3 py-2 text-start font-medium">القاعدة</th>
                    <th className="px-3 py-2 text-start font-medium">الأساس</th>
                    <th className="px-3 py-2 text-end font-medium">القيمة</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id} className="border-t border-[var(--line)]">
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-[var(--ink-900)]">{r.name}</div>
                        {r.latinName && (
                          <div dir="ltr" className="font-latin text-[11px] text-[var(--ink-400)]">{r.latinName}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-full bg-[var(--paper-100)] px-2 py-0.5 text-[11px] text-[var(--ink-500)]">
                          {BASIS_LABELS[r.basis] ?? r.basis}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-end">
                        <span dir="ltr" className="font-latin font-semibold tabular-nums text-[var(--ink-900)]">
                          {r.value}
                          {r.basis === 'percent' ? '%' : ' DA'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
