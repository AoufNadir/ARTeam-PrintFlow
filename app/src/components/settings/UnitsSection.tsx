import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import SectionCard from '@/components/ds/SectionCard';
import YesNoToggle from '@/components/ds/YesNoToggle';
import { useUnit } from '@/components/layout-context';
import { parseDecimal, trimNumber } from '@/lib/units';
import { FieldLabel } from './Overlay';
import { logAudit } from './audit';
import { cn } from '@/lib/utils';

const NUMERIC_KEY = 'arteam-printflow:settings-numbers';

interface NumbersCfg {
  tva: number;
  tvaIncluded: boolean;
  rounding: 'int' | 'half' | 'none';
}

function loadCfg(): NumbersCfg {
  try {
    const raw = localStorage.getItem(NUMERIC_KEY);
    if (raw) return { tva: 19, tvaIncluded: true, rounding: 'int', ...(JSON.parse(raw) as Partial<NumbersCfg>) };
  } catch {
    /* ignore */
  }
  return { tva: 19, tvaIncluded: true, rounding: 'int' };
}

/** Section 6 — الوحدات والأرقام (#units). */
export default function UnitsSection() {
  const { unit, setUnit } = useUnit();
  const [cfg, setCfg] = useState<NumbersCfg>(loadCfg);
  const [demoRaw, setDemoRaw] = useState('1,5');
  const [flash, setFlash] = useState(false);

  const parsed = parseDecimal(demoRaw);
  const valid = !Number.isNaN(parsed);

  const patch = (p: Partial<NumbersCfg>) => {
    const next = { ...cfg, ...p };
    setCfg(next);
    localStorage.setItem(NUMERIC_KEY, JSON.stringify(next));
  };

  return (
    <SectionCard title="الوحدات والأرقام">
      <div className="grid gap-3 sm:grid-cols-2">
        {/* default unit */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="rounded-[12px] border border-[var(--line)] p-4">
          <FieldLabel>الوحدة الافتراضية</FieldLabel>
          <div dir="ltr" className="flex w-44 overflow-hidden rounded-[8px] border border-[var(--line-strong)]">
            {(['mm', 'cm'] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => {
                  setUnit(u);
                  logAudit('catalog', `غيّر الوحدة الافتراضية إلى ${u}`, 'الإعدادات: الوحدات');
                }}
                className={cn(
                  'font-latin flex-1 py-2 text-[13px] font-semibold transition-colors',
                  unit === u ? 'bg-[var(--cyan-600)] text-white' : 'bg-white text-[var(--ink-500)] hover:bg-[var(--paper-100)]',
                )}
              >
                {u}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-4 text-[var(--ink-400)]">
            التحويل تلقائي ولا يغيّر المقاس الحقيقي — التخزين الداخلي بالمليمتر.
          </p>
        </motion.div>

        {/* decimal separator demo */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="rounded-[12px] border border-[var(--line)] p-4">
          <FieldLabel>الفاصلة العشرية — جرّب بنفسك</FieldLabel>
          <input
            dir="ltr"
            value={demoRaw}
            onChange={(e) => {
              setDemoRaw(e.target.value);
              setFlash(true);
              setTimeout(() => setFlash(false), 400);
            }}
            className={cn(
              'font-latin h-10 w-40 rounded-[8px] border px-3 text-[15px] tabular-nums outline-none transition-shadow',
              valid ? 'border-[var(--line-strong)] focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)]' : 'border-[var(--danger-600)]',
              flash && valid && 'border-[var(--success-600)]',
            )}
          />
          <div className="mt-2 flex items-center gap-2 text-[12px] text-[var(--ink-500)]">
            تُقرأ كـ
            <motion.span
              key={valid ? parsed : 'nan'}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              dir="ltr"
              className={cn('font-latin rounded-[6px] px-2 py-0.5 font-semibold tabular-nums', valid ? 'bg-[var(--cyan-100)] text-[var(--cyan-600)]' : 'bg-[#FEE2E2] text-[var(--danger-600)]')}
            >
              {valid ? trimNumber(parsed) : 'غير صالح'}
            </motion.span>
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--ink-400)]">
            كلتا الصيغتان مقبولتان: <span dir="ltr" className="font-latin">1.5 = 1,5</span>
          </p>
        </motion.div>

        {/* TVA */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="rounded-[12px] border border-[var(--line)] p-4">
          <FieldLabel>TVA</FieldLabel>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-28 items-stretch overflow-hidden rounded-[8px] border border-[var(--line-strong)] bg-white">
              <input
                dir="ltr"
                inputMode="decimal"
                value={String(cfg.tva)}
                onChange={(e) => {
                  const v = parseDecimal(e.target.value);
                  if (!Number.isNaN(v)) patch({ tva: v });
                }}
                className="font-latin w-full px-3 text-[15px] tabular-nums outline-none"
              />
              <span className="grid place-items-center border-s border-[var(--line)] bg-[var(--paper-100)] px-2 text-[12px] text-[var(--ink-500)]">%</span>
            </div>
            <YesNoToggle checked={cfg.tvaIncluded} onChange={(v) => patch({ tvaIncluded: v })} label="تضمين في العروض" className="flex-1" />
          </div>
        </motion.div>

        {/* rounding */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} className="rounded-[12px] border border-[var(--line)] p-4">
          <FieldLabel>تقريب الأسعار</FieldLabel>
          <div className="flex gap-1.5">
            {(
              [
                { id: 'int', label: 'دج صحيح' },
                { id: 'half', label: '0.5 دج' },
                { id: 'none', label: 'بدون' },
              ] as const
            ).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  patch({ rounding: r.id });
                  toast.success('حُفظت إعدادات التقريب');
                }}
                className={cn(
                  'h-9 flex-1 rounded-[8px] border text-[12px] font-medium transition-colors',
                  cfg.rounding === r.id
                    ? 'border-[var(--cyan-600)] bg-[var(--cyan-100)] text-[var(--cyan-600)]'
                    : 'border-[var(--line)] bg-white text-[var(--ink-500)] hover:bg-[var(--paper-100)]',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </SectionCard>
  );
}
