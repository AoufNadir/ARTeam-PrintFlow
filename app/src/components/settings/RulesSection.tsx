import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/storage';
import { BASIS_LABELS } from '@/lib/units';
import SectionCard from '@/components/ds/SectionCard';
import { Btn, Chip } from './Overlay';
import { HistoryModal } from '@/components/builder/RulesTab';
import { logAudit, currentUserName } from './audit';
import { cn } from '@/lib/utils';

interface Props {
  rulesKey: number;
  onRulesChanged: () => void;
}

interface DefaultRow {
  ruleId: string | null; // null = local-only setting
  label: string;
  suffix: string;
  fallback: number;
}

const ROWS: DefaultRow[] = [
  { ruleId: 'rule-margin', label: 'هامش الربح الافتراضي', suffix: '%', fallback: 25 },
  { ruleId: 'rule-overhead', label: 'المصاريف العامة', suffix: '%', fallback: 8 },
  { ruleId: 'rule-waste', label: 'الهدر الافتراضي', suffix: '%', fallback: 5 },
  { ruleId: 'rule-print-face-digital', label: 'سعر وجه رقمي', suffix: 'دج', fallback: 12 },
  { ruleId: 'rule-print-face-offset', label: 'أوفست لكل وجه', suffix: 'دج', fallback: 7 },
  { ruleId: null, label: 'أقل قيمة عرض', suffix: 'دج', fallback: 1500 },
];

/**
 * Finishing operations. Each is charged only when its field is chosen, so a
 * price of 0 here means the shop does the work for free — hence the explicit
 * "بلا سعر" warning rather than a silent zero.
 */
const FINISHING_ROWS: DefaultRow[] = [
  { ruleId: 'rule-pelliculage', label: 'التغليف البلاستيكي', suffix: 'دج/م² ورقة', fallback: 90 },
  { ruleId: 'rule-arrondi', label: 'الزوايا المدورة', suffix: 'دج/نسخة', fallback: 0 },
  { ruleId: 'rule-contour-cut', label: 'القص على المحيط', suffix: 'دج/نسخة', fallback: 0 },
  { ruleId: 'rule-eyelets', label: 'العيون المعدنية', suffix: 'دج/نسخة', fallback: 0 },
];

const ALL_ROWS = [...ROWS, ...FINISHING_ROWS];

const MIN_QUOTE_KEY = 'arteam-printflow:min-quote';

/** Section 4 — قواعد التسعير العامة (#rules): defaults + version history. */
export default function RulesSection({ rulesKey, onRulesChanged }: Props) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- rulesKey is an intentional bump key: re-read rules from storage after each publish
  const version = useMemo(() => db.currentRulesVersion(), [rulesKey]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [historyOpen, setHistoryOpen] = useState(false);

  const valueOf = (row: DefaultRow): number => {
    if (row.ruleId === null) return Number(localStorage.getItem(MIN_QUOTE_KEY)) || row.fallback;
    return version.rules.find((r) => r.id === row.ruleId)?.value ?? row.fallback;
  };

  /** Parse a draft; NaN (non-numeric input) means "invalid" — never dirty, never saved. */
  const draftValue = (row: DefaultRow): number | undefined => {
    const d = drafts[row.label];
    if (d === undefined) return undefined;
    const v = Number(d.replace(',', '.'));
    return Number.isNaN(v) ? undefined : v;
  };

  // dirty = at least one draft holds a VALID number that REALLY differs from the stored value
  const dirtyRows = ALL_ROWS.filter((r) => {
    const v = draftValue(r);
    return v !== undefined && v !== valueOf(r);
  });
  const dirty = dirtyRows.length > 0;

  const saveAll = () => {
    // build the next rule set, skipping non-numeric input entirely
    const next = version.rules.map((r) => {
      const row = ALL_ROWS.find((x) => x.ruleId === r.id);
      const v = row ? draftValue(row) : undefined;
      return v === undefined ? r : { ...r, value: v };
    });

    // REAL diff: did any rule value actually change?
    const changedRules = next.filter((r) => version.rules.find((x) => x.id === r.id)?.value !== r.value);

    const minRow = ROWS.find((r) => r.ruleId === null)!;
    const minDraft = draftValue(minRow);
    const minChanged = minDraft !== undefined && minDraft !== valueOf(minRow);

    if (changedRules.length === 0 && !minChanged) {
      setDrafts({});
      toast.info('لا تغييرات فعلية — لم يُنشأ إصدار جديد');
      return;
    }

    if (minChanged && minDraft !== undefined) localStorage.setItem(MIN_QUOTE_KEY, String(minDraft));

    if (changedRules.length > 0) {
      const n = db.publishRules(next, `تحديث ${changedRules.length} قاعدة عامة من الإعدادات`);
      logAudit('margin', `تحديث ${changedRules.length} قاعدة عامة — أنشأ v${n}`, 'الإعدادات: قواعد التسعير');
      setDrafts({});
      toast.success(`حُفظت القواعد — أصبحت سارية في الإصدار v${n}`);
      onRulesChanged();
    } else {
      logAudit('margin', `حدّث أقل قيمة عرض إلى ${minDraft} دج`, 'الإعدادات: قواعد التسعير');
      setDrafts({});
      toast.success('حُفظ أقل قيمة عرض — لا حاجة لإصدار قواعد جديد');
    }
  };

  const renderRow = (row: DefaultRow, i: number, warnZero = false) => {
    const rule = row.ruleId ? version.rules.find((r) => r.id === row.ruleId) : undefined;
    const invalid = drafts[row.label] !== undefined && draftValue(row) === undefined;
    const effective = draftValue(row) ?? valueOf(row);
    return (
      <motion.div
        key={row.label}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: i * 0.04 }}
        className="rounded-[10px] border border-[var(--line)] p-3"
      >
        <div className="mb-1.5 flex items-center gap-2">
          <span className="flex-1 text-[13px] font-medium text-[var(--ink-700)]">{row.label}</span>
          {rule && <Chip tint="cyan">{BASIS_LABELS[rule.basis]}</Chip>}
        </div>
        <div className={cn(
          'flex h-10 items-stretch overflow-hidden rounded-[8px] border bg-white transition-shadow focus-within:shadow-[var(--shadow-focus)]',
          invalid ? 'border-[var(--danger-600)]' : 'border-[var(--line-strong)] focus-within:border-[var(--cyan-600)]',
        )}>
          <input
            dir="ltr"
            inputMode="decimal"
            value={drafts[row.label] ?? String(valueOf(row))}
            onChange={(e) => setDrafts((d) => ({ ...d, [row.label]: e.target.value }))}
            className="font-latin w-full px-3 text-[15px] tabular-nums outline-none"
          />
          <span className="grid place-items-center border-s border-[var(--line)] bg-[var(--paper-100)] px-3 text-[12px] text-[var(--ink-500)]">
            {row.suffix}
          </span>
        </div>
        {invalid && <p className="mt-1 text-[11px] text-[var(--danger-600)]">قيمة غير رقمية — ستُتجاهل عند الحفظ</p>}
        {!invalid && warnZero && effective === 0 && (
          <p className="mt-1 text-[11px] font-medium text-[#B45309]">بلا سعر — هذه الخطوة تُنفَّذ مجانًا في العروض</p>
        )}
      </motion.div>
    );
  };

  return (
    <div className="space-y-4">
      <SectionCard title="قواعد التسعير العامة">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ROWS.map((row, i) => renderRow(row, i))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-[var(--ink-400)]">القواعد الخاصة بالخدمة تتجاوز هذه القيم.</p>
          {dirty && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2">
              <Btn variant="ghost" size="sm" onClick={() => setDrafts({})}>
                تجاهل
              </Btn>
              <Btn size="sm" onClick={saveAll}>
                حفظ — إنشاء v{version.version + 1}
              </Btn>
            </motion.div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="أسعار التشطيب">
        <p className="mb-3 text-[12px] text-[var(--ink-500)]">
          تُحتسب فقط عند اختيار الخيار في العرض. التغليف يُحسب على مساحة الورقة المطبوعة كاملةً — لأن الورقة كلها تمرّ في آلة التغليف قبل القص.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FINISHING_ROWS.map((row, i) => renderRow(row, i, true))}
        </div>
      </SectionCard>

      <SectionCard
        title="سجل الإصدارات"
        actions={
          <Btn variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
            عرض كامل السجل
          </Btn>
        }
      >
        <div className="mb-3 flex items-center gap-2 rounded-[10px] border border-[var(--cyan-100)] bg-[var(--cyan-50)] px-3 py-2 text-[12px] text-[var(--ink-700)]">
          <Lock size={13} className="shrink-0 text-[var(--cyan-600)]" />
          كل Devis يحفظ نسخة كاملة من القواعد وقت إنشائه — عروضك القديمة لا تتغير أبدًا.
        </div>
        <VersionTimeline rulesKey={rulesKey} />
      </SectionCard>

      <HistoryModal open={historyOpen} onClose={() => setHistoryOpen(false)} current={version} onRestored={onRulesChanged} />
    </div>
  );
}

function VersionTimeline({ rulesKey }: { rulesKey: number }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- rulesKey is an intentional bump key: re-read the stored version list after each publish
  const versions = useMemo(() => [...db.pricingRuleVersions.list()].sort((a, b) => b.version - a.version).slice(0, 4), [rulesKey]);
  return (
    <div className="space-y-2">
      {versions.map((v, i) => (
        <motion.div
          key={v.id}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.06 }}
          className={cn('flex items-center gap-3 rounded-[10px] border px-3 py-2.5', i === 0 ? 'border-[var(--cyan-600)] bg-[var(--cyan-50)]/60' : 'border-[var(--line)]')}
        >
          {i === 0 && <motion.span layout className="h-full w-[3px] self-stretch rounded-full bg-[var(--cyan-500)]" />}
          <span dir="ltr" className="font-latin text-[14px] font-semibold tabular-nums text-[var(--ink-900)]">
            v{v.version}
          </span>
          {i === 0 && <Chip tint="cyan">الحالية</Chip>}
          <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-500)]">{v.note ?? '—'}</span>
          <span className="text-[11px] text-[var(--ink-400)]">
            {new Date(v.createdAt).toLocaleDateString('en-GB')} {new Date(v.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="text-[11px] text-[var(--ink-400)]">بواسطة {i === 0 ? currentUserName() : 'أمين'}</span>
        </motion.div>
      ))}
    </div>
  );
}
