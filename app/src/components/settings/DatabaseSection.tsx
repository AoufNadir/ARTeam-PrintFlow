import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Copy, FileJson, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import SectionCard from '@/components/ds/SectionCard';
import { db } from '@/lib/storage';
import { Btn, Chip, Modal } from './Overlay';
import { logAudit } from './audit';
import { ENTITIES, schemaJson } from './schema';

/** Section 7 — قاعدة البيانات، جاهزية Supabase (#database). */
export default function DatabaseSection() {
  const exportJson = () => {
    const blob = new Blob([schemaJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'schema.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('تم تصدير schema.json');
  };

  const copyNames = () => {
    navigator.clipboard?.writeText(ENTITIES.map((e) => e.table).join('\n')).catch(() => {});
    toast.success('نُسخت أسماء الجداول');
  };

  return (
    <SectionCard title="قاعدة البيانات — جاهزية Supabase">
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[12px] border border-[#16A34A]/25 bg-[#DCFCE7]/60 px-4 py-3">
        <CheckCircle2 size={17} className="shrink-0 text-[var(--success-600)]" />
        <p className="flex-1 text-[13px] font-medium text-[var(--ink-700)]">البنية جاهزة للربط مع Supabase</p>
        <Btn variant="ghost" size="sm" onClick={exportJson}>
          <FileJson size={14} /> تصدير المخطط JSON
        </Btn>
        <Btn variant="ghost" size="sm" onClick={copyNames}>
          <Copy size={14} /> نسخ أسماء الجداول
        </Btn>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {ENTITIES.map((e, i) => (
          <motion.div
            key={e.table}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.32, delay: Math.min(i * 0.05, 0.6) }}
            whileHover={{ y: -2 }}
            className="group rounded-[12px] border border-[var(--line)] bg-white p-3.5 shadow-[var(--shadow-card)]"
          >
            <div dir="ltr" className="font-latin text-left text-[14px] font-semibold text-[var(--ink-900)]">
              {e.table}
            </div>
            <div className="mt-0.5 text-[12px] text-[var(--ink-500)]">{e.label}</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {e.fields.slice(0, 4).map((f) => (
                <span key={f} dir="ltr" className="font-latin rounded-full bg-[var(--paper-100)] px-1.5 py-0.5 text-[9px] text-[var(--ink-400)]">
                  {f}
                </span>
              ))}
              {e.fields.length > 4 && (
                <span className="rounded-full bg-[var(--paper-100)] px-1.5 py-0.5 text-[9px] text-[var(--ink-400)]">+{e.fields.length - 4}</span>
              )}
            </div>
            {(e.relations ?? []).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1 border-t border-[var(--line)] pt-2">
                {e.relations!.map((r) => (
                  <span
                    key={r.to + r.label}
                    dir="ltr"
                    className="font-latin rounded-full border border-[var(--cyan-100)] bg-[var(--cyan-50)] px-2 py-0.5 text-[9px] font-semibold text-[var(--cyan-600)] transition-colors group-hover:border-[var(--cyan-500)]"
                  >
                    {e.table} → {r.to} · {r.label}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 text-[11px] text-[var(--ink-400)]">
        <Chip>للقراءة فقط</Chip>
        الربط الفعلي يتم في مرحلة لاحقة — هذه الصفحة توثّق البنية وتصدّرها.
      </div>

      <ResetZone />
    </SectionCard>
  );
}

/** منطقة الخطر — مسح كل البيانات وإعادة البذر، بتأكيد مزدوج واضح. */
function ResetZone() {
  const [step, setStep] = useState<0 | 1 | 2>(0); // 0=closed, 1=warning, 2=final confirm

  const doReset = () => {
    db.resetAndReseed();
    logAudit('catalog', 'مسح كل البيانات وأعاد بذر قاعدة البيانات', 'الإعدادات: قاعدة البيانات');
    setStep(0);
    toast.warning('مُسحت كل البيانات وأُعيد بذر الكتالوج — ستُعاد الصفحة');
    setTimeout(() => window.location.reload(), 900);
  };

  return (
    <div className="mt-6 rounded-[12px] border border-[var(--danger-600)]/30 bg-[#FEE2E2]/40 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <AlertTriangle size={17} className="shrink-0 text-[var(--danger-600)]" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[var(--ink-900)]">منطقة الخطر</p>
          <p className="text-[12px] text-[var(--ink-500)]">مسح كل البيانات المحلية (العروض، العملاء، الكتالوج) وإعادة البيانات الأولية.</p>
        </div>
        <Btn variant="danger" size="sm" onClick={() => setStep(1)}>
          <Trash2 size={14} /> مسح وإعادة بذر
        </Btn>
      </div>

      {/* التأكيد الأول — تحذير */}
      <Modal
        open={step === 1}
        onClose={() => setStep(0)}
        title="مسح كل البيانات؟"
        size="sm"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setStep(0)}>
              تراجع
            </Btn>
            <Btn variant="danger" onClick={() => setStep(2)}>
              نعم، متابعة
            </Btn>
          </>
        }
      >
        <p className="text-[13px] leading-6 text-[var(--ink-700)]">
          هذا الإجراء <span className="font-semibold text-[var(--danger-600)]">لا يمكن التراجع عنه</span>: ستُحذف جميع
          عروض الأسعار والعملاء والمشاريع والتعديلات على الكتالوج والقواعد، وتُستعاد البيانات الأولية للتطبيق.
        </p>
      </Modal>

      {/* التأكيد الثاني — نهائي */}
      <Modal
        open={step === 2}
        onClose={() => setStep(0)}
        title="تأكيد نهائي"
        size="sm"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setStep(0)}>
              إلغاء
            </Btn>
            <Btn variant="danger" onClick={doReset}>
              <Trash2 size={14} /> نعم، امسح كل شيء الآن
            </Btn>
          </>
        }
      >
        <p className="text-[13px] leading-6 text-[var(--ink-700)]">
          هذا هو التأكيد الأخير. بالضغط على «نعم، امسح كل شيء الآن» ستفقد كل البيانات الحالية فورًا وتُعاد الصفحة
          بالكتالوج الأولي.
        </p>
      </Modal>
    </div>
  );
}
