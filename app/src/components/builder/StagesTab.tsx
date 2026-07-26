import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Plus, X } from 'lucide-react';
import type { Service } from '@/lib/types';
import { db } from '@/lib/storage';
import { formatDA } from '@/lib/units';
import { Chip } from '@/components/settings/Overlay';
import { STAGE_DEFS, stageLabel, toggleId, type BuilderMeta } from './meta';
import { cn } from '@/lib/utils';

interface Props {
  service: Service;
  meta: BuilderMeta;
  setMeta: (patch: Partial<BuilderMeta>) => void;
  onUpdate: (patch: Partial<Service>) => void;
}

/** Tab 3 — multi-stage pipeline editor (RTL flow). */
export default function StagesTab({ service, meta, setMeta, onUpdate }: Props) {
  const stages = service.stages ?? [];
  const conditional = meta.conditionalStages[service.id] ?? [];
  const [adderAt, setAdderAt] = useState<number | null>(null); // insertion index

  const setStages = (next: string[]) => onUpdate({ stages: next });

  const insert = (idx: number, stageId: string) => {
    const next = [...stages];
    next.splice(idx, 0, stageId);
    setStages(next);
    setAdderAt(null);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const to = idx + dir;
    if (to < 0 || to >= stages.length) return;
    const next = [...stages];
    next.splice(to, 0, next.splice(idx, 1)[0]);
    setStages(next);
  };

  // demo per-stage cost preview derived from the attached rules
  const rules = db.currentRules().filter((r) => service.pricingRuleIds.includes(r.id));
  const stageCost = (stageId: string): number => {
    const bucket =
      stageId === 'impression' ? ['paper', 'printing'] : stageId === 'coupe' || stageId === 'cutcontour' ? ['cutting'] : ['finishing'];
    return rules.filter((r) => bucket.includes(r.appliesTo ?? '')).reduce((a, r) => a + (r.basis === 'percent' ? 0 : r.value), 0);
  };
  const total = stages.reduce((a, s) => a + stageCost(s), 0);

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-[var(--ink-500)]">
        الخدمات متعددة المراحل تُحسب كسلسلة: كل مرحلة تجمع قواعدها ثم تُمرَّر للتي بعدها.
      </p>

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max items-stretch gap-0">
          {stages.map((st, i) => {
            const isConditional = conditional.includes(st);
            return (
              <div key={`${st}-${i}`} className="flex items-center">
                <motion.div
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.08 }}
                  className="group relative w-56 rounded-[14px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-card)]"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    {/* stage names come from a fixed vocabulary (STAGE_DEFS) —
                        the old inline rename discarded whatever was typed */}
                    <span className="text-start text-[14px] font-semibold text-[var(--ink-900)]">
                      {stageLabel(st)}
                    </span>
                    <button
                      type="button"
                      aria-label="إزالة المرحلة"
                      onClick={() => setStages(stages.filter((_, x) => x !== i))}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-[var(--ink-400)] opacity-0 transition-opacity hover:bg-[var(--paper-100)] hover:text-[var(--danger-600)] group-hover:opacity-100"
                    >
                      <X size={13} />
                    </button>
                  </div>

                  <div className="mb-2 flex flex-wrap gap-1">
                    {rules
                      .filter((r) => {
                        const bucket =
                          st === 'impression' ? ['paper', 'printing'] : st === 'coupe' || st === 'cutcontour' ? ['cutting'] : ['finishing'];
                        return bucket.includes(r.appliesTo ?? '');
                      })
                      .slice(0, 3)
                      .map((r) => (
                        <Chip key={r.id}>{r.name}</Chip>
                      ))}
                  </div>

                  <div dir="ltr" className="font-latin text-[15px] font-semibold tabular-nums text-[var(--ink-900)]">
                    {formatDA(stageCost(st))}
                    <span className="ms-1 font-latin text-[10px] font-normal text-[var(--ink-400)]">/ نسخة تقريبًا</span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setMeta({
                        conditionalStages: {
                          ...meta.conditionalStages,
                          [service.id]: toggleId(conditional, st),
                        },
                      })
                    }
                    className={cn(
                      'mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-transform hover:scale-[1.03]',
                      isConditional ? 'bg-[#EDE9FE] text-[#7C3AED]' : 'bg-[var(--paper-100)] text-[var(--ink-400)] hover:text-[var(--ink-500)]',
                    )}
                  >
                    {isConditional ? 'شرط: يظهر فقط عند تفعيل الخيار' : 'دائمة — انقر لجعلها شرطية'}
                  </button>
                </motion.div>

                {/* connector + insert */}
                <div className="relative mx-1 flex w-10 items-center">
                  <motion.svg
                    width="40"
                    height="12"
                    viewBox="0 0 40 12"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 + i * 0.08 }}
                    className="text-[var(--cyan-500)]"
                  >
                    <motion.path
                      d="M40 6 H8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeDasharray="32"
                      initial={{ strokeDashoffset: 32 }}
                      animate={{ strokeDashoffset: 0 }}
                      transition={{ duration: 0.4, delay: 0.2 + i * 0.08 }}
                    />
                    <path d="M8 2 L2 6 L8 10" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </motion.svg>
                  <button
                    type="button"
                    aria-label="إدراج مرحلة"
                    onClick={() => setAdderAt(adderAt === i + 1 ? null : i + 1)}
                    className="absolute inset-0 m-auto grid h-5 w-5 place-items-center rounded-full border border-[var(--line)] bg-white text-[var(--ink-400)] opacity-0 transition-opacity hover:border-[var(--cyan-500)] hover:text-[var(--cyan-600)] [div:hover>&]:opacity-100"
                    style={{ opacity: adderAt === i + 1 ? 1 : undefined }}
                  >
                    <Plus size={11} />
                  </button>
                </div>
              </div>
            );
          })}

          {/* add at end */}
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setAdderAt(adderAt === stages.length ? null : stages.length)}
              className="grid h-24 w-14 place-items-center rounded-[14px] border border-dashed border-[var(--line-strong)] text-[var(--ink-400)] transition-colors hover:border-[var(--cyan-500)] hover:bg-[var(--cyan-50)] hover:text-[var(--cyan-600)]"
            >
              <Plus size={17} />
            </button>
          </div>
        </div>
      </div>

      {/* stage picker */}
      <AnimatePresence>
        {adderAt !== null && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex flex-wrap gap-1.5 rounded-[12px] border border-[var(--line)] bg-[var(--paper-100)] p-3"
          >
            {STAGE_DEFS.filter((d) => !stages.includes(d.id)).map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => insert(adderAt, d.id)}
                className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--ink-700)] transition-colors hover:border-[var(--cyan-600)] hover:bg-[var(--cyan-50)] hover:text-[var(--cyan-600)]"
              >
                {d.label}
              </button>
            ))}
            {STAGE_DEFS.filter((d) => !stages.includes(d.id)).length === 0 && (
              <span className="text-[12px] text-[var(--ink-400)]">كل المراحل المتاحة مضافة.</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* reorder controls */}
      {stages.length > 1 && (
        <div className="flex items-center gap-2 text-[12px] text-[var(--ink-400)]">
          إعادة الترتيب:
          {stages.map((st, i) => (
            <span key={`${st}-${i}`} className="inline-flex items-center gap-0.5 rounded-full border border-[var(--line)] bg-white px-2 py-1">
              {stageLabel(st)}
              <button type="button" aria-label="تقديم" onClick={() => move(i, -1)} className="text-[var(--ink-400)] hover:text-[var(--cyan-600)]">
                <ArrowRight size={11} />
              </button>
              <button type="button" aria-label="تأخير" onClick={() => move(i, 1)} className="text-[var(--ink-400)] hover:text-[var(--cyan-600)]">
                <ArrowLeft size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="rounded-[12px] border border-[var(--line)] bg-[var(--cyan-50)] px-4 py-3 text-[13px] text-[var(--ink-700)]">
        تكلفة الخدمة = مجموع تكاليف المراحل —{' '}
        <span dir="ltr" className="font-latin font-semibold tabular-nums text-[var(--ink-900)]">
          {stages.map((s) => stageCost(s).toFixed(1)).join(' + ')} = {total.toFixed(1)} دج/نسخة
        </span>
      </div>
    </div>
  );
}
