import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, GripVertical, History, Info, Lock, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import type { PricingRule, PricingRulesVersion, Service } from '@/lib/types';
import { db } from '@/lib/storage';
import { BASIS_LABELS, formatDA, trimNumber } from '@/lib/units';
import VersionBadge from '@/components/ds/VersionBadge';
import { Btn, Chip, Modal } from '@/components/settings/Overlay';
import { logAudit } from '@/components/settings/audit';
import { cn } from '@/lib/utils';

const FIELD_LINK: Record<string, string> = {
  paper: 'نوع الورق (اختيار)',
  printing: 'الطباعة = Recto/Verso',
  cutting: 'نوع القص',
  finishing: 'Pelliculage = نعم',
  global: 'عام',
};

interface Props {
  service: Service;
  /** bump key to re-read rules after publish */
  rulesKey: number;
  onRulesChanged: () => void;
}

export default function RulesTab({ service, rulesKey, onRulesChanged }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [flashId, setFlashId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [formulaUnlocked, setFormulaUnlocked] = useState(false);
  const [confirmUnlock, setConfirmUnlock] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- rulesKey is an intentional bump key: re-read rules from storage after each publish
  const version = useMemo(() => db.currentRulesVersion(), [rulesKey]);
  const rules = useMemo(() => {
    const all = version.rules;
    const attached = service.pricingRuleIds.length ? all.filter((r) => service.pricingRuleIds.includes(r.id)) : all;
    return attached;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rulesKey, service.pricingRuleIds]);

  const startEdit = (r: PricingRule) => {
    setEditingId(r.id);
    setEditValue(String(r.value));
  };

  const saveEdit = (r: PricingRule) => {
    const v = Number(editValue.replace(',', '.'));
    if (Number.isNaN(v)) {
      setEditingId(null);
      return;
    }
    const next = version.rules.map((x) => (x.id === r.id ? { ...x, value: v } : x));
    const n = db.publishRules(next, `تعديل «${r.name}»: ${r.value}→${v}`);
    logAudit(r.appliesTo === 'global' ? 'margin' : 'rule', `${r.name}: ${r.value}→${v} — أنشأ v${n}`, `قاعدة: ${r.name}`);
    setEditingId(null);
    setFlashId(r.id);
    setTimeout(() => setFlashId(null), 800);
    toast.success(`حُفظت القاعدة — أصبحت سارية في الإصدار v${n}`);
    onRulesChanged();
  };

  return (
    <div className="space-y-4">
      {/* intro banner */}
      <div className="flex items-center gap-3 rounded-[12px] border border-[var(--cyan-100)] bg-[var(--cyan-50)] px-4 py-3">
        <Info size={17} className="shrink-0 text-[var(--cyan-600)]" />
        <p className="flex-1 text-[13px] text-[var(--ink-700)]">
          أي تعديل هنا ينشئ إصدار أسعار جديدًا (
          <span dir="ltr" className="font-latin font-semibold">
            v{version.version + 1}
          </span>
          ). العروض السابقة تحتفظ بنسختها ولن تتغير.
        </p>
        <VersionBadge version={version.version} />
        <Btn variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
          <History size={14} /> سجل الإصدارات
        </Btn>
      </div>

      {/* rules table */}
      <div className="overflow-hidden rounded-[12px] border border-[var(--line)]">
        <table className="w-full text-[13px]">
          <thead className="bg-[var(--paper-100)]">
            <tr>
              {['القاعدة', 'الأساس', 'القيمة', 'مربوطة بالحقل', ''].map((h) => (
                <th key={h} className="px-3 py-2.5 text-start text-[11px] font-medium tracking-[0.04em] text-[var(--ink-400)]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rules.map((r, i) => (
              <motion.tr
                key={r.id}
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0, backgroundColor: flashId === r.id ? '#E0F2FE' : '#FFFFFF' }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.045, 0.3) }}
                className="border-t border-[var(--line)]"
              >
                <td className="px-3 py-2.5">
                  <div className="font-semibold text-[var(--ink-900)]">{r.name}</div>
                  {r.latinName && (
                    <div dir="ltr" className="font-latin text-[10px] text-[var(--ink-400)]">
                      {r.latinName}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <Chip tint="cyan">{BASIS_LABELS[r.basis]}</Chip>
                </td>
                <td className="px-3 py-2.5">
                  {editingId === r.id ? (
                    <span className="flex items-center gap-1">
                      <input
                        autoFocus
                        dir="ltr"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit(r);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="font-latin h-8 w-20 rounded-[6px] border border-[var(--cyan-600)] px-2 text-[13px] outline-none"
                      />
                      <button type="button" onClick={() => saveEdit(r)} aria-label="حفظ" className="grid h-7 w-7 place-items-center rounded-[6px] bg-[var(--cyan-600)] text-white">
                        <Check size={13} />
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} aria-label="إلغاء" className="grid h-7 w-7 place-items-center rounded-[6px] text-[var(--ink-400)] hover:bg-[var(--paper-100)]">
                        <X size={13} />
                      </button>
                    </span>
                  ) : (
                    <span dir="ltr" className="font-latin font-semibold tabular-nums text-[var(--ink-900)]">
                      {r.basis === 'percent' ? `${trimNumber(r.value)}%` : formatDA(r.value)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-[var(--ink-500)]">{FIELD_LINK[r.appliesTo ?? 'global']}</td>
                <td className="px-3 py-2.5 text-end">
                  <button
                    type="button"
                    onClick={() => startEdit(r)}
                    aria-label="تعديل"
                    className="grid h-7 w-7 place-items-center rounded-[6px] text-[var(--ink-400)] transition-colors hover:bg-[var(--paper-100)] hover:text-[var(--cyan-600)]"
                  >
                    <Pencil size={13} />
                  </button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* formula mini-builder */}
      <div className="rounded-[12px] border border-[var(--line)] bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-[14px] font-semibold text-[var(--ink-900)]">ترتيب الحساب (معادلة المرحلة)</h4>
          {formulaUnlocked ? (
            <Chip tint="warning">وضع التعديل المتقدم</Chip>
          ) : (
            <Btn variant="ghost" size="sm" onClick={() => setConfirmUnlock(true)}>
              <Lock size={13} /> تعديل متقدم
            </Btn>
          )}
        </div>
        <div dir="ltr" className="flex flex-wrap items-center gap-1.5 text-[13px]">
          {['تكلفة الورق', 'تكلفة الطباعة', 'القص', 'التشطيب'].map((t, i) => (
            <span key={t} className="flex items-center gap-1.5">
              {i > 0 && <span className="font-latin text-[var(--ink-400)]">+</span>}
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--paper-100)] px-2.5 py-1 text-[12px] font-medium text-[var(--ink-700)]',
                  formulaUnlocked && 'cursor-grab border-[var(--cyan-500)] bg-[var(--cyan-50)]',
                )}
              >
                {formulaUnlocked && <GripVertical size={11} className="text-[var(--ink-400)]" />}
                {t}
              </span>
            </span>
          ))}
          {['(1 + الهدر)', '(1 + المصاريف)', '(1 + الهامش)'].map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className="font-latin text-[var(--ink-400)]">×</span>
              <span className="rounded-full border border-[var(--cyan-100)] bg-[var(--cyan-50)] px-2.5 py-1 text-[12px] font-medium text-[var(--cyan-600)]">{t}</span>
            </span>
          ))}
          {formulaUnlocked && (
            <button type="button" className="grid h-7 w-7 place-items-center rounded-full border border-dashed border-[var(--line-strong)] text-[var(--ink-400)] hover:border-[var(--cyan-500)] hover:text-[var(--cyan-600)]">
              <Plus size={13} />
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-[var(--ink-400)]">
          وضع القراءة الآمن مفعّل افتراضيًا — المعادلة تُبنى تلقائيًا من القواعد المفعّلة.
        </p>
      </div>

      {/* unlock confirm */}
      <Modal
        open={confirmUnlock}
        onClose={() => setConfirmUnlock(false)}
        title="تعديل متقدم للمعادلة"
        size="sm"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setConfirmUnlock(false)}>
              إلغاء
            </Btn>
            <Btn
              variant="danger"
              onClick={() => {
                setFormulaUnlocked(true);
                setConfirmUnlock(false);
                toast.warning('فُتح وضع التعديل المتقدم — رتّب الرموز بحذر');
              }}
            >
              فتح التعديل
            </Btn>
          </>
        }
      >
        <p className="text-[13px] leading-5 text-[var(--ink-700)]">
          تغيير ترتيب الحساب قد يكسر أسعار الخدمة. هل أنت متأكد أنك تريد فتح وضع التعديل المتقدم؟
        </p>
      </Modal>

      <HistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} current={version} onRestored={onRulesChanged} />
    </div>
  );
}

// ------------------------------ version history ------------------------------

function diffRules(prev: PricingRule[], next: PricingRule[]) {
  const rows: { name: string; before?: string; after?: string }[] = [];
  for (const n of next) {
    const p = prev.find((x) => x.id === n.id);
    const fmt = (r: PricingRule) => (r.basis === 'percent' ? `${trimNumber(r.value)}%` : formatDA(r.value));
    if (!p) rows.push({ name: n.name, after: fmt(n) });
    else if (p.value !== n.value || p.enabled !== n.enabled) rows.push({ name: n.name, before: fmt(p), after: fmt(n) });
  }
  return rows;
}

export function HistoryModal({
  open,
  onClose,
  current,
  onRestored,
}: {
  open: boolean;
  onClose: () => void;
  current: PricingRulesVersion;
  onRestored: () => void;
}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read the stored version list whenever the modal opens or the current version changes
  const versions = useMemo(() => [...db.pricingRuleVersions.list()].sort((a, b) => b.version - a.version), [open, current.version]);
  const [expanded, setExpanded] = useState<number | null>(null);

  const restore = (v: PricingRulesVersion) => {
    const n = db.publishRules(v.rules, `استرجاع الإصدار v${v.version}`);
    logAudit('rule', `استُرجع الإصدار v${v.version} كإصدار جديد v${n}`, 'سجل الإصدارات');
    toast.success(`أُنشئ الإصدار v${n} من استرجاع v${v.version} — التاريخ لا يُعاد كتابته`);
    onRestored();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="سجل إصدارات الأسعار" size="lg">
      <div className="space-y-2">
        {versions.map((v, i) => {
          const prev = versions[i + 1];
          const rows = prev ? diffRules(prev.rules, v.rules) : [];
          const isCurrent = v.version === current.version;
          const openRow = expanded === v.version;
          return (
            <motion.div
              key={v.id}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.06, 0.36) }}
              className={cn('rounded-[12px] border', isCurrent ? 'border-[var(--cyan-600)] bg-[var(--cyan-50)]/50' : 'border-[var(--line)] bg-white')}
            >
              <button type="button" onClick={() => setExpanded(openRow ? null : v.version)} className="flex w-full items-center gap-3 px-4 py-3 text-start">
                <span dir="ltr" className="font-latin text-[15px] font-semibold tabular-nums text-[var(--ink-900)]">
                  v{v.version}
                </span>
                {isCurrent && <Chip tint="cyan">الحالية</Chip>}
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink-500)]">{v.note ?? '—'}</span>
                <span className="text-[11px] text-[var(--ink-400)]">{new Date(v.createdAt).toLocaleDateString('en-GB')}</span>
                {!isCurrent && (
                  <Btn
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      restore(v);
                    }}
                  >
                    <RotateCcw size={13} /> استرجاع
                  </Btn>
                )}
              </button>
              <AnimatePresence initial={false}>
                {openRow && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-[var(--line)] px-4 py-3">
                      {rows.length === 0 ? (
                        <p className="text-[12px] text-[var(--ink-400)]">{prev ? 'لا فروقات مسجلة.' : 'النسخة الأولى من القواعد.'}</p>
                      ) : (
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="text-[10px] text-[var(--ink-400)]">
                              <th className="py-1 text-start">القاعدة</th>
                              <th className="py-1 text-start">قبل</th>
                              <th className="py-1 text-start">بعد</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r, j) => (
                              <motion.tr
                                key={r.name}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: j * 0.05 }}
                                className="border-t border-[var(--line)]"
                              >
                                <td className="py-1.5 font-medium text-[var(--ink-700)]">{r.name}</td>
                                <td className="py-1.5">
                                  {r.before ? (
                                    <motion.span initial={{ x: 8 }} animate={{ x: 0 }} dir="ltr" className="font-latin text-[var(--danger-600)] line-through">
                                      {r.before}
                                    </motion.span>
                                  ) : (
                                    <span className="text-[var(--ink-400)]">—</span>
                                  )}
                                </td>
                                <td className="py-1.5">
                                  {r.after && (
                                    <motion.span initial={{ x: -8 }} animate={{ x: 0 }} dir="ltr" className="font-latin font-semibold text-[var(--success-600)]">
                                      {r.after}
                                    </motion.span>
                                  )}
                                </td>
                              </motion.tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </Modal>
  );
}
