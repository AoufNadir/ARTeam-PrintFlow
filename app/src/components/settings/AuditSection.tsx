import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import SectionCard from '@/components/ds/SectionCard';
import { Chip } from './Overlay';
import { AUDIT_EVENT, AUDIT_OP_LABELS, formatAuditTime, listAudit, type AuditEntry, type AuditOp } from './audit';
import { avatarColor, initials } from '@/components/clients/crm-meta';
import { cn } from '@/lib/utils';

const OP_TINTS: Record<AuditOp, 'cyan' | 'violet' | 'warning' | 'success' | 'danger' | 'paper'> = {
  rule: 'cyan',
  margin: 'warning',
  devis: 'success',
  pdf: 'violet',
  status: 'paper',
  catalog: 'paper',
  project: 'violet',
  user: 'danger',
};

/** Section 8 — سجل العمليات (#audit): latest 20 with live inserts. */
export default function AuditSection() {
  const [rows, setRows] = useState<AuditEntry[]>(() => listAudit().slice(0, 20));
  const [filter, setFilter] = useState<AuditOp | 'all'>('all');

  useEffect(() => {
    const onLog = () => setRows(listAudit().slice(0, 20));
    window.addEventListener(AUDIT_EVENT, onLog);
    return () => window.removeEventListener(AUDIT_EVENT, onLog);
  }, []);

  const filtered = useMemo(() => rows.filter((r) => filter === 'all' || r.op === filter), [rows, filter]);
  const ops = useMemo(() => Array.from(new Set(rows.map((r) => r.op))), [rows]);

  return (
    <SectionCard title="سجل العمليات">
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={cn(
            'rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
            filter === 'all' ? 'border-[var(--cyan-600)] bg-[var(--cyan-100)] text-[var(--cyan-600)]' : 'border-[var(--line)] text-[var(--ink-500)] hover:bg-[var(--paper-100)]',
          )}
        >
          الكل
        </button>
        {ops.map((op) => (
          <button
            key={op}
            type="button"
            onClick={() => setFilter(op)}
            className={cn(
              'rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
              filter === op ? 'border-[var(--cyan-600)] bg-[var(--cyan-100)] text-[var(--cyan-600)]' : 'border-[var(--line)] text-[var(--ink-500)] hover:bg-[var(--paper-100)]',
            )}
          >
            {AUDIT_OP_LABELS[op]}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-[12px] border border-[var(--line)]">
        <table className="w-full text-[13px]">
          <thead className="bg-[var(--paper-100)]">
            <tr>
              {['الوقت', 'المستخدم', 'العملية', 'التفاصيل', 'المرجع'].map((h) => (
                <th key={h} className="px-3 py-2.5 text-start text-[11px] font-medium tracking-[0.04em] text-[var(--ink-400)]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {filtered.map((r, i) => {
                const { bg, fg } = avatarColor(r.user);
                return (
                  <motion.tr
                    key={r.id}
                    layout="position"
                    initial={{ opacity: 0, y: -14, backgroundColor: '#E0F2FE' }}
                    animate={{ opacity: 1, y: 0, backgroundColor: '#FFFFFF' }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35, delay: Math.min(i * 0.035, 0.25) }}
                    className="border-t border-[var(--line)]"
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap text-[12px] text-[var(--ink-400)]">{formatAuditTime(r.at)}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-1.5">
                        <span className="grid h-6 w-6 place-items-center rounded-full text-[9px] font-bold" style={{ backgroundColor: bg, color: fg }}>
                          {initials(r.user)}
                        </span>
                        <span className="text-[12px] text-[var(--ink-700)]">{r.user}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Chip tint={OP_TINTS[r.op]}>{r.opLabel}</Chip>
                    </td>
                    <td className="max-w-[320px] truncate px-3 py-2.5 text-[12px] text-[var(--ink-700)]" title={r.details}>
                      {r.details}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.ref && (
                        <span dir="ltr" className="font-latin cursor-pointer text-[11px] font-semibold text-[var(--cyan-600)] hover:underline">
                          {r.ref}
                        </span>
                      )}
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
        {filtered.length === 0 && <div className="px-4 py-8 text-center text-[13px] text-[var(--ink-400)]">لا عمليات من هذا النوع.</div>}
      </div>
    </SectionCard>
  );
}
