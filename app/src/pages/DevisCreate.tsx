import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileDown,
  Flag,
  Info,
  Layers,
  Lock,
  Package,
  Pencil,
  PanelTop,
  Plus,
  Printer,
  Puzzle,
  Save,
  Search,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DimensionGroup,
  EmptyState,
  NumberField,
  SectionCard,
  SelectWithPrice,
  StageStepper,
  VersionBadge,
  YesNoToggle,
} from '@/components/ds';
import { CropMarks } from '@/components/ds/SectionCard';
import ConfirmDialog from '@/components/devis/ConfirmDialog';
import FlipNumber from '@/components/devis/FlipNumber';
import MontageThumb from '@/components/devis/MontageThumb';
import DevisDocument from '@/components/devis/DevisDocument';
import RulesSnapshotModal from '@/components/devis/RulesSnapshotModal';
import { exportDevisPdf } from '@/components/devis/devis-pdf';
import { ensureDemoClients } from '@/components/devis/demo-data';
import {
  addDays,
  devisTotals,
  formatDateAr,
  fromInputDate,
  toInputDate,
} from '@/components/devis/devis-utils';
import { isSectionDisabled, isServiceDisabled } from '@/components/builder/meta';
import { useUnit } from '@/components/layout-context';
import DesignFileUploader from '@/components/montage/DesignFileUploader';
import type { Sticker } from '@/components/montage/montage-data';
import { logAudit } from '@/components/settings/audit';
import { designNameFromAsset, type DesignFileAsset } from '@/lib/design-file-types';
import { computeMontage } from '@/lib/montage-engine';
import { percentRule, priceItem, type FieldValues } from '@/lib/pricing-engine';
import { db, uid } from '@/lib/storage';
import type {
  Client,
  DevisAttachment,
  DevisDiscount,
  Devis,
  DevisItem,
  DevisStatus,
  DimensionValue,
  MontageResult,
  MontageState,
  PreflightCheck,
  PrintMethod,
  Project,
  QuantityOption,
  Section,
  Service,
  SheetAlternative,
} from '@/lib/types';
import { formatDA, formatPercent, round2 } from '@/lib/units';
import { cn } from '@/lib/utils';

const EASE = [0.22, 0.68, 0.26, 1] as [number, number, number, number];
const PHASES = ['العميل والعرض', 'الخدمات والتصاميم', 'التسعير والشروط', 'المراجعة'];
const QTY_PRESETS = [100, 250, 500, 1000, 2000];
const QUANTITY_COMPARE = [500, 1000, 2000];
const DRAFT_RESTORE_KEY = 'arteam-printflow:devis-active-draft';

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

function isDim(v: unknown): v is DimensionValue {
  return typeof v === 'object' && v !== null && 'widthMm' in v && 'heightMm' in v;
}

function firstDimensionFieldId(service: Service | undefined): string | undefined {
  return service?.fields.find((field) => field.type === 'dimensions')?.id;
}

function discountOrUndefined(mode: 'amount' | 'percent', value: number, reason?: string): DevisDiscount | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return { mode, value, reason: reason?.trim() || undefined };
}

function compareAssetToDims(asset: DesignFileAsset, dims: DimensionValue | undefined): PreflightCheck {
  if (!dims) {
    return { key: 'size', label: 'المقاس', status: 'warning', message: 'لا يوجد مقاس طلب للمقارنة.' };
  }
  const direct = Math.max(Math.abs(asset.widthMm - dims.widthMm), Math.abs(asset.heightMm - dims.heightMm));
  const rotated = Math.max(Math.abs(asset.widthMm - dims.heightMm), Math.abs(asset.heightMm - dims.widthMm));
  const best = Math.min(direct, rotated);
  if (best <= 0.5) return { key: 'size', label: 'المقاس', status: 'ok' };
  if (best <= 2) return { key: 'size', label: 'المقاس', status: 'warning', message: `فرق قياس صغير ${round2(best)} مم.` };
  return { key: 'size', label: 'المقاس', status: 'error', message: `مقاس الملف مختلف عن الطلب بـ ${round2(best)} مم.` };
}

function montageStateFrom(montage: MontageResult | null, montageStale: boolean, manualPrice: number | null): MontageState {
  if (montageStale) return 'stale';
  if (montage) return 'confirmed';
  return manualPrice !== null ? 'estimated' : 'estimated';
}

function attachmentOf(kind: DevisAttachment['kind'], asset: DesignFileAsset, linkedDesignId?: string): DevisAttachment {
  return {
    id: uid('att'),
    kind,
    asset,
    linkedDesignId,
    uploadedAt: new Date().toISOString(),
  };
}

function buildPreflight({
  dims,
  designAssets,
  cutContours,
  montageState,
}: {
  dims?: DimensionValue;
  designAssets: DesignFileAsset[];
  cutContours: DesignFileAsset[];
  montageState: MontageState;
}): PreflightCheck[] {
  const checks: PreflightCheck[] = [
    {
      key: 'file',
      label: 'الملف',
      status: designAssets.length > 0 ? 'ok' : 'warning',
      message: designAssets.length > 0 ? undefined : 'لم يُربط ملف تصميم بعد.',
    },
    {
      key: 'montage',
      label: 'المونتاج',
      status: montageState === 'confirmed' ? 'ok' : montageState === 'estimated' ? 'warning' : 'error',
      message:
        montageState === 'confirmed'
          ? undefined
          : montageState === 'estimated'
            ? 'السعر تقديري ويمكن حفظه كمسودة.'
            : 'يجب إعادة حساب المونتاج قبل الإرسال.',
    },
  ];
  if (designAssets[0]) checks.push(compareAssetToDims(designAssets[0], dims));
  const hasCutNeed = designAssets.some((asset) => asset.hasEmbeddedCutContour) || cutContours.length > 0;
  checks.push({
    key: 'cut-contour',
    label: 'tracé découpe',
    status: !hasCutNeed || cutContours.length > 0 ? 'ok' : 'warning',
    message: hasCutNeed && cutContours.length === 0 ? 'تم رصد مسار قص محتمل داخل التصميم؛ اربط ملف tracé عند الحاجة.' : undefined,
  });
  return checks;
}

function phaseForStep(step: number): number {
  if (step <= 2) return 0;
  if (step <= 4) return 1;
  if (step === 5) return 2;
  return 3;
}

function loadRestorableDraft(): Devis | null {
  if (typeof localStorage === 'undefined') return null;
  const id = localStorage.getItem(DRAFT_RESTORE_KEY);
  if (!id) return null;
  const draft = db.devis.get(id);
  return draft?.status === 'draft' ? draft : null;
}

/** Section icon per design.md step-1 catalog (fallbacks by latin name). */
function sectionIcon(section: Section) {
  const key = `${section.id} ${section.latinName ?? ''} ${section.name}`.toLowerCase();
  if (key.includes('digital') || key.includes('رقمية')) return Printer;
  if (key.includes('offset') || key.includes('أوفست')) return Layers;
  if (key.includes('grand') || key.includes('كبير')) return Flag;
  if (key.includes('enseigne') || key.includes('لافتات')) return PanelTop;
  if (key.includes('pack') || key.includes('تغليف')) return Package;
  if (key.includes('multi') || key.includes('مركّب') || key.includes('مركب')) return Puzzle;
  return Printer;
}

// ---------------------------------------------------------------------------
// Client combobox (search + create-new) — step 3
// ---------------------------------------------------------------------------

function ClientCombobox({
  clients,
  value,
  onChange,
  onCreateNew,
  error,
}: {
  clients: Client[];
  value: string;
  onChange: (id: string) => void;
  onCreateNew: () => void;
  error: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = clients.find((c) => c.id === value);
  const filtered = clients.filter(
    (c) => !q || c.name.includes(q) || (c.company ?? '').includes(q) || (c.phone ?? '').includes(q),
  );

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={ref} className="relative">
      <motion.button
        type="button"
        onClick={() => setOpen((o) => !o)}
        animate={error ? { x: [0, -6, 6, -4, 0] } : { x: 0 }}
        transition={{ duration: 0.3 }}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-[8px] border bg-white px-3 text-[14px] transition-shadow focus:shadow-[var(--shadow-focus)] focus:outline-none',
          error ? 'border-[var(--danger-600)]' : 'border-[var(--line-strong)] focus:border-[var(--cyan-600)]',
        )}
      >
        {selected ? (
          <motion.span
            key={selected.id}
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="flex min-w-0 items-center gap-2"
          >
            <span className="truncate font-medium text-[var(--ink-900)]">{selected.name}</span>
            {selected.company && <span className="truncate text-[var(--ink-500)]">— {selected.company}</span>}
          </motion.span>
        ) : (
          <span className="text-[var(--ink-400)]">اختر العميل…</span>
        )}
        <motion.span animate={{ rotate: open ? -180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0 text-[var(--ink-400)]">
          <ChevronLeft size={16} className="-rotate-90" />
        </motion.span>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="absolute z-40 mt-1 w-full overflow-hidden rounded-[10px] border border-[var(--line)] bg-white shadow-[var(--shadow-pop)]"
          >
            <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2">
              <Search size={14} className="text-[var(--ink-400)]" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ابحث عن عميل…"
                className="h-7 w-full bg-transparent text-[13px] outline-none"
              />
            </div>
            <ul className="max-h-52 overflow-y-auto">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(c.id);
                      setOpen(false);
                      setQ('');
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-[14px] transition-colors hover:bg-[var(--cyan-50)]"
                  >
                    {c.id === value ? <Check size={14} className="shrink-0 text-[var(--cyan-600)]" /> : <span className="w-3.5 shrink-0" />}
                    <span className="truncate font-medium">{c.name}</span>
                    {c.company && <span className="truncate text-[12px] text-[var(--ink-400)]">{c.company}</span>}
                  </button>
                </li>
              ))}
              {filtered.length === 0 && <li className="px-3 py-3 text-[13px] text-[var(--ink-400)]">لا نتائج</li>}
            </ul>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCreateNew();
              }}
              className="flex w-full items-center gap-2 border-t border-[var(--line)] px-3 py-2.5 text-[13px] font-medium text-[var(--cyan-600)] transition-colors hover:bg-[var(--cyan-50)]"
            >
              <Plus size={14} />
              عميل جديد
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project select (filtered by client + inline create) — step 3
// ---------------------------------------------------------------------------

function ProjectSelect({ clientId, value, onChange }: { clientId: string; value: string; onChange: (id: string) => void }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const projects = clientId ? db.projects.byClient(clientId) : [];

  return (
    <div>
      <div className="flex gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={!clientId}
          className="h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-3 text-[14px] outline-none transition-shadow focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)] disabled:opacity-50"
        >
          <option value="">{clientId ? 'بدون مشروع' : 'اختر العميل أولًا'}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!clientId}
          onClick={() => setCreating((c) => !c)}
          title="مشروع جديد"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-100)] disabled:opacity-50"
        >
          <Plus size={16} />
        </button>
      </div>
      <AnimatePresence>
        {creating && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="اسم المشروع الجديد"
                className="h-10 w-full rounded-[8px] border border-[var(--line-strong)] px-3 text-[14px] outline-none focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)]"
              />
              <button
                type="button"
                onClick={() => {
                  const n = name.trim();
                  if (!n) return;
                  const p = db.projects.create({ id: uid('prj'), clientId, name: n, status: 'active', createdAt: new Date().toISOString() });
                  onChange(p.id);
                  setName('');
                  setCreating(false);
                  toast.success('تمت إضافة المشروع');
                }}
                className="h-10 shrink-0 rounded-[8px] bg-[var(--cyan-600)] px-3 text-[13px] font-semibold text-white hover:bg-[var(--cyan-500)]"
              >
                إضافة
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New client modal — step 3 (clients.md §5 inline)
// ---------------------------------------------------------------------------

function NewClientModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (c: Client) => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] grid place-items-center bg-[rgba(21,23,30,0.3)] p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.24 }}
            className="relative w-[420px] max-w-[92vw] rounded-[18px] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-pop)]"
            onClick={(e) => e.stopPropagation()}
          >
            <CropMarks opacity={0.4} offset={8} />
            <h3 className="text-[17px] leading-[26px] font-semibold text-[var(--ink-900)]">عميل جديد</h3>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const name = String(fd.get('name') ?? '').trim();
                if (!name) return;
                const client = db.clients.create({
                  id: uid('cli'),
                  name,
                  company: String(fd.get('company') ?? '').trim() || undefined,
                  phone: String(fd.get('phone') ?? '').trim() || undefined,
                  email: String(fd.get('email') ?? '').trim() || undefined,
                  createdAt: new Date().toISOString(),
                });
                onCreated(client);
                onClose();
                toast.success('تمت إضافة العميل');
              }}
            >
              <input name="name" required placeholder="اسم العميل *" className="h-10 w-full rounded-[8px] border border-[var(--line-strong)] px-3 text-[14px] outline-none focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)]" />
              <input name="company" placeholder="الشركة / المحل" className="h-10 w-full rounded-[8px] border border-[var(--line-strong)] px-3 text-[14px] outline-none focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)]" />
              <input name="phone" placeholder="الهاتف" dir="ltr" className="font-latin h-10 w-full rounded-[8px] border border-[var(--line-strong)] px-3 text-[14px] outline-none focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)]" />
              <input name="email" placeholder="البريد الإلكتروني" dir="ltr" type="email" className="font-latin h-10 w-full rounded-[8px] border border-[var(--line-strong)] px-3 text-[14px] outline-none focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)]" />
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={onClose} className="h-10 rounded-[10px] border border-[var(--line-strong)] px-4 text-[14px] font-medium text-[var(--ink-700)] hover:bg-[var(--paper-100)]">
                  إلغاء
                </button>
                <button type="submit" className="h-10 rounded-[10px] bg-[var(--cyan-600)] px-4 text-[14px] font-semibold text-white hover:bg-[var(--cyan-500)] active:scale-[0.97]">
                  حفظ العميل
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Registration-target success graphic (step 7 motif)
// ---------------------------------------------------------------------------

function SuccessTarget() {
  return (
    <span className="relative inline-grid place-items-center">
      <motion.span
        initial={{ scale: 1, opacity: 0.5 }}
        animate={{ scale: 1.35, opacity: 0 }}
        transition={{ delay: 0.5, duration: 0.7, ease: 'easeOut' }}
        className="absolute h-20 w-20 rounded-full border-2 border-[var(--cyan-500)]"
      />
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none" aria-hidden>
        <motion.circle
          cx="40" cy="40" r="30" stroke="var(--cyan-600)" strokeWidth="2.5"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, ease: 'easeOut' }}
        />
        <motion.path
          d="M40 6v68M6 40h68" stroke="var(--ink-900)" strokeWidth="2"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.25, duration: 0.5, ease: 'easeOut' }}
        />
        <motion.circle
          cx="40" cy="40" r="9" stroke="var(--cyan-500)" strokeWidth="2.5"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.35, duration: 0.4 }}
        />
      </svg>
    </span>
  );
}

/** 12 tiny CMYK paper chips falling once — step 7 celebration. */
function PaperConfetti() {
  const chips = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        x: (i % 6) * 52 - 130 + (i % 2) * 18,
        delay: i * 0.05,
        rot: (i % 2 === 0 ? 1 : -1) * (120 + i * 30),
        color: ['#0284C7', '#DB2777', '#EAB308', '#15171E'][i % 4],
      })),
    [],
  );
  return (
    <span className="pointer-events-none absolute inset-x-0 top-0 flex justify-center overflow-visible" aria-hidden>
      {chips.map((c, i) => (
        <motion.span
          key={i}
          initial={{ x: c.x, y: -24, opacity: 1, rotate: 0 }}
          animate={{ y: 400, opacity: 0, rotate: c.rot }}
          transition={{ delay: 0.4 + c.delay, duration: 0.9, ease: 'easeIn' }}
          className="absolute h-2.5 w-4 rounded-[2px]"
          style={{ backgroundColor: c.color }}
        />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

export default function DevisCreate() {
  const navigate = useNavigate();
  const { unit, setUnit } = useUnit();
  const { id: editId } = useParams();

  // edit mode: load the existing draft ONCE. New quotes restore the last local draft if present.
  const [editDevis] = useState<Devis | null>(() => (editId ? db.devis.get(editId) ?? null : loadRestorableDraft()));

  useEffect(() => {
    if (editId && !editDevis) {
      toast.error('العرض المطلوب تعديله غير موجود');
      navigate('/devis', { replace: true });
    } else if (editId && editDevis && editDevis.status !== 'draft') {
      const revision = db.devis.createRevision(editDevis.id);
      if (revision) {
        logAudit('devis', `أنشأ مراجعة ${revision.number} من ${editDevis.number}`, revision.number);
        toast.success(`العرض مقفل — تم إنشاء مراجعة ${revision.number}`);
        navigate(`/devis/${revision.id}/edit`, { replace: true });
      } else {
        toast.error('تعذر إنشاء مراجعة لهذا العرض');
        navigate('/devis', { replace: true });
      }
    }
  }, [editId, editDevis, navigate]);

  // catalog data — disabled sections are hidden from the wizard (builder switch)
  const sections = useMemo(() => db.sections.list().filter((s) => !isSectionDisabled(s.id)), []);
  // when editing, price with the devis' FROZEN rules so items don't re-price silently
  const rules = useMemo(
    () => (editDevis?.rulesSnapshot?.length ? editDevis.rulesSnapshot : db.currentRules()),
    [editDevis],
  );
  const rulesVersion = useMemo(
    () =>
      editDevis
        ? { version: editDevis.rulesVersion, rules: editDevis.rulesSnapshot }
        : db.currentRulesVersion(),
    [editDevis],
  );
  // frozen paper prices of the edited devis win ("ثبات الماضي"); otherwise current
  const papers = useMemo(
    () => (editDevis?.papersSnapshot?.length ? editDevis.papersSnapshot : db.papers.list()),
    [editDevis],
  );
  const defaultMargin = useMemo(() => percentRule(rules, 'margin')?.value ?? 25, [rules]);
  const [clients, setClients] = useState<Client[]>(() => {
    ensureDemoClients();
    return db.clients.list();
  });

  // wizard state
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [serviceSearch, setServiceSearch] = useState('');

  // step 3 — general info (hydrated from the edited draft when present)
  const [clientId, setClientId] = useState(() => editDevis?.clientId ?? '');
  const [projectId, setProjectId] = useState(() => editDevis?.projectId ?? '');
  const [title, setTitle] = useState(() => editDevis?.title ?? '');
  const [titleTouched, setTitleTouched] = useState(() => Boolean(editDevis?.title));
  const [deliveryDate, setDeliveryDate] = useState(() =>
    editDevis?.deliveryDate
      ? toInputDate(editDevis.deliveryDate)
      : toInputDate(addDays(new Date().toISOString(), 7)),
  );
  const [validUntil, setValidUntil] = useState(() =>
    editDevis?.validUntil
      ? toInputDate(editDevis.validUntil)
      : toInputDate(addDays(new Date().toISOString(), 15)),
  );
  const [notes, setNotes] = useState(() => editDevis?.internalNotes ?? editDevis?.notes ?? '');
  const [clientNotes, setClientNotes] = useState(() => editDevis?.clientNotes ?? '');
  const [paymentTerms, setPaymentTerms] = useState(() => editDevis?.commercialTerms?.paymentTerms ?? '50% تسبيق، والباقي عند التسليم');
  const [deliveryMethod, setDeliveryMethod] = useState(() => editDevis?.commercialTerms?.deliveryMethod ?? '');
  const [deliveryDelay, setDeliveryDelay] = useState(() => editDevis?.commercialTerms?.deliveryDelay ?? '');
  const [documentLanguage, setDocumentLanguage] = useState<'ar' | 'fr' | 'bilingual'>(() => editDevis?.commercialTerms?.language ?? 'ar');
  const [taxRatePct, setTaxRatePct] = useState(() => round2((editDevis?.taxRate ?? 0.19) * 100));
  const [quoteDiscountMode, setQuoteDiscountMode] = useState<'amount' | 'percent'>(() => editDevis?.discount?.mode ?? 'amount');
  const [quoteDiscountValue, setQuoteDiscountValue] = useState(() => editDevis?.discount?.value ?? 0);
  const [quoteDiscountReason, setQuoteDiscountReason] = useState(() => editDevis?.discount?.reason ?? '');
  const [extraFeeLabel, setExtraFeeLabel] = useState(() => editDevis?.extraFees?.[0]?.label ?? 'مصاريف إضافية');
  const [extraFeeAmount, setExtraFeeAmount] = useState(() => editDevis?.extraFees?.[0]?.amount ?? 0);
  const [advanceMode, setAdvanceMode] = useState<'amount' | 'percent'>(() => editDevis?.advance?.mode ?? 'percent');
  const [advanceValue, setAdvanceValue] = useState(() => editDevis?.advance?.value ?? 0);
  const [clientError, setClientError] = useState(false);
  const [clientModal, setClientModal] = useState(false);

  // step 4 — service fields
  const [fieldValues, setFieldValues] = useState<FieldValues>({});
  const [designAssets, setDesignAssets] = useState<DesignFileAsset[]>([]);
  const [cutContourAssets, setCutContourAssets] = useState<DesignFileAsset[]>([]);

  // step 5 — montage
  const [montage, setMontage] = useState<MontageResult | null>(null);
  const [montageSig, setMontageSig] = useState('');
  const [montageLoading, setMontageLoading] = useState(false);
  const [manualPrice, setManualPrice] = useState<number | null>(null);

  // step 6 — review
  const [marginPct, setMarginPct] = useState<number | null>(null);
  const [overrideReason, setOverrideReason] = useState(() => editDevis?.overrideReason ?? '');
  const [hoveredLine, setHoveredLine] = useState<string | null>(null);

  // accumulated devis (hydrated from the edited draft when present)
  const [items, setItems] = useState<DevisItem[]>(() => editDevis?.items ?? []);
  const [devisId, setDevisId] = useState<string | null>(() => editDevis?.id ?? null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [removeItemId, setRemoveItemId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [negativeMarginConfirm, setNegativeMarginConfirm] = useState(false);

  const section = sectionId ? sections.find((s) => s.id === sectionId) : undefined;
  const service: Service | undefined = serviceId ? db.services.get(serviceId) : undefined;
  const client = clientId ? clients.find((c) => c.id === clientId) : undefined;
  const project: Project | undefined = projectId ? db.projects.get(projectId) : undefined;

  const quantity = useMemo(() => {
    const q = fieldValues['quantity'];
    return (typeof q === 'number' ? q : Number(q)) || 1;
  }, [fieldValues]);

  const currentDims = useMemo((): DimensionValue | undefined => {
    if (!service) return undefined;
    const df = service.fields.find((f) => f.type === 'dimensions');
    const v = df ? fieldValues[df.id] : undefined;
    return isDim(v) ? v : service.defaultPieceSize;
  }, [service, fieldValues]);

  const currentMethod = useMemo((): PrintMethod => (fieldValues['faces'] === 'recto' ? 'recto' : 'recto-verso'), [fieldValues]);

  const currentSig = useMemo(
    () => JSON.stringify({ q: quantity, w: currentDims?.widthMm, h: currentDims?.heightMm, m: currentMethod }),
    [quantity, currentDims, currentMethod],
  );
  const montageStale = montage !== null && montageSig !== currentSig;

  // pricing (re-totals on every change) — paper priced from the (possibly frozen) catalog
  const breakdown = useMemo(
    () => (service ? priceItem(service, fieldValues, rules, montage, papers) : null),
    [service, fieldValues, rules, montage, papers],
  );

  const effectiveMargin = marginPct ?? defaultMargin;

  const final = useMemo(() => {
    if (!breakdown) return null;
    // rounding reconciliation: unitPrice × qty === total, subtotal + margin === total
    let unitPrice: number;
    let total: number;
    if (manualPrice !== null) {
      unitPrice = round2(manualPrice);
      total = round2(unitPrice * quantity);
    } else {
      const rawTotal = breakdown.subtotal * (1 + effectiveMargin / 100);
      unitPrice = round2(rawTotal / quantity);
      total = round2(unitPrice * quantity);
    }
    const margin = round2(total - breakdown.subtotal);
    return { ...breakdown, margin, total, unitPrice };
  }, [breakdown, effectiveMargin, manualPrice, quantity]);

  // manual price below production cost → negative margin (warn, never save silently)
  const negativeMargin = final !== null && final.margin < -0.005;

  const taxRate = useMemo(() => Math.max(0, taxRatePct || 0) / 100, [taxRatePct]);
  const quoteDiscount = useMemo(
    () => discountOrUndefined(quoteDiscountMode, quoteDiscountValue, quoteDiscountReason),
    [quoteDiscountMode, quoteDiscountValue, quoteDiscountReason],
  );
  const extraFees = useMemo(
    () => (extraFeeAmount > 0 ? [{ id: 'fee-main', label: extraFeeLabel.trim() || 'مصاريف إضافية', amount: extraFeeAmount }] : []),
    [extraFeeAmount, extraFeeLabel],
  );
  const advance = useMemo(
    () => (advanceValue > 0 ? { mode: advanceMode, value: advanceValue } : undefined),
    [advanceMode, advanceValue],
  );
  const totals = useMemo(
    () => devisTotals(items, { discount: quoteDiscount, extraFees, taxRate, advance }),
    [items, quoteDiscount, extraFees, taxRate, advance],
  );
  const editingItem = useMemo(() => items.find((item) => item.id === editingItemId), [items, editingItemId]);
  const editingService = useMemo(() => (editingItem ? db.services.get(editingItem.serviceId) : undefined), [editingItem]);
  const editingDimFieldId = firstDimensionFieldId(editingService);
  const editingDims = editingDimFieldId && editingItem && isDim(editingItem.fieldValues[editingDimFieldId])
    ? editingItem.fieldValues[editingDimFieldId]
    : editingService?.defaultPieceSize;

  // auto-suggested title: «عرض — Carte Visite — مطعم الزيتونة» (until the user edits it)
  const suggestedTitle = ['عرض', service?.latinName ?? service?.name, client?.company ?? client?.name]
    .filter(Boolean)
    .join(' — ');
  const titleValue = titleTouched ? title : suggestedTitle;

  // ------------------------------- actions -----------------------------------

  const flashSaved = () => {
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2400);
  };

  const persistDevis = (nextItems: DevisItem[], status: DevisStatus = 'draft', opts: { silent?: boolean } = {}): Devis | null => {
    if (!clientId) {
      if (!opts.silent) toast.error('اختر عميلًا قبل حفظ العرض');
      return null;
    }
    const now = new Date().toISOString();
    const t = devisTotals(nextItems, { discount: quoteDiscount, extraFees, taxRate, advance });
    // quote-level fields collected in step 3 + manual-override audit reason
    const meta = {
      title: titleValue.trim() || undefined,
      deliveryDate: deliveryDate ? fromInputDate(deliveryDate) : undefined,
      validUntil: validUntil ? fromInputDate(validUntil) : undefined,
      notes: notes.trim() || undefined,
      internalNotes: notes.trim() || undefined,
      clientNotes: clientNotes.trim() || undefined,
      commercialTerms: {
        paymentTerms: paymentTerms.trim() || undefined,
        deliveryMethod: deliveryMethod.trim() || undefined,
        deliveryDelay: deliveryDelay.trim() || undefined,
        language: documentLanguage,
      },
      discount: quoteDiscount,
      extraFees,
      taxRate,
      advance,
      totals: t,
      overrideReason: overrideReason.trim() || undefined,
    };
    if (!devisId) {
      const fresh = db.pricingSnapshot({
          id: uid('devis'),
          number: db.devis.nextNumber(),
          revision: 1,
          clientId,
          projectId: projectId || undefined,
          status,
          items: nextItems,
          total: t.ttc,
          ...meta,
          createdAt: now,
          updatedAt: now,
      });
      const created = status === 'draft' ? db.devis.saveDraft(fresh) : db.devis.create(fresh);
      setDevisId(created.id);
      localStorage.setItem(DRAFT_RESTORE_KEY, created.id);
      logAudit('devis', `أنشأ مسودة العرض ${created.number}`, created.number);
      return created;
    }
    const updated = db.devis.update(devisId, {
      items: nextItems,
      total: t.ttc,
      status,
      clientId,
      projectId: projectId || undefined,
      ...meta,
      updatedAt: now,
    });
    if (updated) localStorage.setItem(DRAFT_RESTORE_KEY, updated.id);
    return updated ?? db.devis.get(devisId) ?? null;
  };

  const initFieldValues = (svc: Service): FieldValues => {
    const v: FieldValues = {};
    svc.fields.forEach((f) => {
      if (f.defaultValue !== undefined) v[f.id] = f.defaultValue as FieldValues[string];
    });
    return v;
  };

  const selectSection = (id: string) => {
    if (sectionId === id) return;
    setSectionId(id);
    setServiceId(null);
    setServiceSearch('');
    window.setTimeout(() => {
      setStep(1);
      setMaxStep((m) => Math.max(m, 1));
    }, 350);
  };

  const selectService = (id: string) => {
    const svc = db.services.get(id);
    if (!svc) return;
    setServiceId(id);
    setFieldValues(initFieldValues(svc));
    setMontage(null);
    setMontageSig('');
    setManualPrice(null);
    setMarginPct(null);
    setOverrideReason('');
    setDesignAssets([]);
    setCutContourAssets([]);
    window.setTimeout(() => {
      setStep(2);
      setMaxStep((m) => Math.max(m, 2));
    }, 350);
  };

  const goToPhase = (phase: number) => {
    const target = [0, 3, 5, 6][phase] ?? 0;
    if (phase <= phaseForStep(maxStep)) setStep(Math.min(target, maxStep));
  };

  const tryNext = () => {
    if (step === 2 && !clientId) {
      setClientError(true);
      toast.error('العميل مطلوب');
      return;
    }
    if (step === 3 && quantity <= 0) {
      toast.error('أدخل كمية صحيحة');
      return;
    }
    const n = Math.min(step + 1, 6);
    setStep(n);
    setMaxStep((m) => Math.max(m, n));
  };

  const runMontage = (sheet?: { w: number; h: number; machineId?: string }) => {
    if (!service || !currentDims) {
      toast.error('حدّد مقاس المنتج أولًا');
      return;
    }
    const bleed = service.defaultBleedMm ?? 2;
    const method = currentMethod;
    const dims = currentDims;
    setMontageLoading(true);
    window.setTimeout(() => {
      const result = computeMontage({
        sheetWidthMm: sheet?.w ?? 320,
        sheetHeightMm: sheet?.h ?? 450,
        pieceWidthMm: dims.widthMm,
        pieceHeightMm: dims.heightMm,
        bleedMm: { top: bleed, bottom: bleed, left: bleed, right: bleed },
        quantity,
        method,
        machineId: sheet?.machineId ?? 'machine-digital-versant',
      });
      setMontageLoading(false);
      if (!result) {
        toast.error('تعذّر حساب المونتاج لهذه الأبعاد — جرّب سعرًا يدويًا');
        return;
      }
      setMontage(result);
      setMontageSig(currentSig);
      setManualPrice(null);
      toast.success('تم حساب المونتاج الذكي');
    }, 650);
  };

  const adoptAlternative = (alt: SheetAlternative) => {
    runMontage({ w: alt.sheetWidthMm, h: alt.sheetHeightMm, machineId: alt.machineId });
  };

  const skipMontage = () => {
    setManualPrice(breakdown ? breakdown.unitPrice : 0);
    setMontage(null);
    tryNext();
  };

  const quantityOptions = useMemo<QuantityOption[]>(() => {
    if (!service) return [];
    return QUANTITY_COMPARE.map((q) => {
      const values = { ...fieldValues, quantity: q };
      const priced = priceItem(service, values, rules, montage, papers);
      const rawTotal = priced.subtotal * (1 + effectiveMargin / 100);
      const unitPrice = round2(rawTotal / q);
      const total = round2(unitPrice * q);
      const margin = round2(total - priced.subtotal);
      const marginPercent = priced.subtotal > 0 ? round2((margin / priced.subtotal) * 100) : 0;
      return { quantity: q, pricing: { ...priced, unitPrice, total, margin }, unitPrice, total, margin, marginPercent };
    });
  }, [service, fieldValues, rules, montage, papers, effectiveMargin]);

  const addItem = () => {
    if (!service || !final) return;
    // never persist a stale montage: the sheet count no longer matches the
    // current quantity/dimensions → force an explicit recalculation first
    if (montageStale) {
      toast.error('تغيّرت الكمية أو المقاس بعد حساب المونتاج — أعد الحساب قبل الإضافة');
      return;
    }
    // a manual price below cost is allowed, but never saved silently
    if (negativeMargin) {
      setNegativeMarginConfirm(true);
      return;
    }
    doAddItem();
  };

  const doAddItem = () => {
    if (!service || !final) return;
    const itemMontageState = montageStateFrom(montage, montageStale, manualPrice);
    const attachments = [
      ...designAssets.map((asset) => attachmentOf('artwork', asset)),
      ...cutContourAssets.map((asset) => attachmentOf('cut-contour', asset, asset.match ? asset.id : undefined)),
    ];
    const preflight = buildPreflight({
      dims: currentDims,
      designAssets,
      cutContours: cutContourAssets,
      montageState: itemMontageState,
    });
    const item: DevisItem = {
      id: uid('item'),
      order: items.length,
      serviceId: service.id,
      serviceName: service.latinName ?? service.name,
      quantity,
      fieldValues: { ...fieldValues },
      attachments,
      montageState: itemMontageState,
      preflight,
      quantityOptions,
      manualPriceReason: overrideReason.trim() || undefined,
      montageResult: montage ?? undefined,
      pricing: final,
      unitPrice: final.unitPrice,
      total: final.total,
    };
    const nextItems = [...items, item];
    setItems(nextItems);
    const saved = persistDevis(nextItems);
    if (!saved) return;
    if (negativeMargin || marginPct !== null) {
      logAudit('margin', `تعديل سعر/هامش في ${saved.number}: ${overrideReason || 'بدون سبب مفصل'}`, saved.number);
    }
    flashSaved();
    setStep(6);
    setMaxStep(6);
  };

  const removeItem = (id: string) => {
    const nextItems = normalizeItemOrder(items.filter((it) => it.id !== id));
    setItems(nextItems);
    if (devisId) {
      persistDevis(nextItems);
      flashSaved();
    }
  };

  const normalizeItemOrder = (rows: DevisItem[]) => rows.map((item, index) => ({ ...item, order: index }));

  const duplicateItem = (id: string) => {
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return;
    const copy: DevisItem = {
      ...structuredClone(items[index]),
      id: uid('item'),
      order: index + 1,
      serviceName: `${items[index].serviceName} copy`,
    };
    const nextItems = normalizeItemOrder([...items.slice(0, index + 1), copy, ...items.slice(index + 1)]);
    setItems(nextItems);
    persistDevis(nextItems, 'draft', { silent: true });
    flashSaved();
    toast.success('تم نسخ البند');
  };

  const moveItem = (id: string, direction: -1 | 1) => {
    const index = items.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    const nextItems = normalizeItemOrder(next);
    setItems(nextItems);
    persistDevis(nextItems, 'draft', { silent: true });
  };

  const updateExistingItem = (id: string, updater: (item: DevisItem) => DevisItem) => {
    const nextItems = normalizeItemOrder(items.map((item) => (item.id === id ? updater(item) : item)));
    setItems(nextItems);
    persistDevis(nextItems, 'draft', { silent: true });
  };

  const recalcItem = (item: DevisItem, fields: FieldValues, qty: number): DevisItem => {
    const itemService = db.services.get(item.serviceId);
    if (!itemService) return { ...item, fieldValues: fields, quantity: qty };
    const montageIsConfirmed = item.montageState === 'confirmed';
    const pricing = priceItem(itemService, fields, rules, montageIsConfirmed ? item.montageResult : null, papers);
    const unitPrice = round2(pricing.unitPrice);
    const total = round2(unitPrice * qty);
    return {
      ...item,
      quantity: qty,
      fieldValues: fields,
      montageState: item.montageResult ? 'stale' : item.montageState ?? 'estimated',
      preflight: (item.preflight ?? []).map((check) =>
        check.key === 'montage'
          ? { ...check, status: item.montageResult ? 'error' : check.status, message: item.montageResult ? 'تغير البند ويحتاج إعادة حساب المونتاج.' : check.message }
          : check,
      ),
      pricing: { ...pricing, unitPrice, total, margin: round2(total - pricing.subtotal) },
      unitPrice,
      total,
    };
  };

  const addAnother = () => {
    setSectionId(null);
    setServiceId(null);
    setServiceSearch('');
    setFieldValues({});
    setMontage(null);
    setMontageSig('');
    setManualPrice(null);
    setMarginPct(null);
    setOverrideReason('');
    setDesignAssets([]);
    setCutContourAssets([]);
    setStep(0);
    setMaxStep(2); // client info stays valid
  };

  const saveDraft = () => {
    const saved = persistDevis(items, 'draft');
    if (saved) {
      flashSaved();
      toast.success(`حُفظت المسودة ${saved.number}`);
    }
  };

  const finish = () => {
    const saved = persistDevis(items, 'draft');
    if (saved) {
      localStorage.removeItem(DRAFT_RESTORE_KEY);
      toast.success(`تم حفظ العرض ${saved.number}`);
      navigate('/devis');
    }
  };

  const exportPdf = async () => {
    const saved = persistDevis(items);
    if (!saved || pdfBusy) return;
    setPdfBusy(true);
    try {
      await exportDevisPdf(saved, client, project);
      logAudit('pdf', `صدّر PDF العميل ${saved.number}`, saved.number);
      toast.success(`تم تنزيل ${saved.number}.pdf`);
    } catch {
      toast.error('تعذّر توليد ملف PDF — حاول مجددًا');
    } finally {
      setPdfBusy(false);
    }
  };

  const hasSendBlocker = useMemo(
    () =>
      items.some(
        (item) =>
          item.montageState === 'invalid' ||
          item.montageState === 'stale' ||
          item.preflight?.some((check) => check.status === 'error'),
      ),
    [items],
  );

  const markReady = () => {
    if (items.length === 0) {
      toast.error('أضف بندًا واحدًا على الأقل');
      return;
    }
    const saved = persistDevis(items, 'ready');
    if (!saved) return;
    logAudit('status', `غيّر حالة العرض إلى جاهز`, saved.number);
    toast.success(`العرض ${saved.number} جاهز للمراجعة`);
  };

  const sendCurrent = () => {
    if (items.length === 0) {
      toast.error('أضف بندًا واحدًا على الأقل قبل الإرسال');
      return;
    }
    if (hasSendBlocker) {
      toast.error('لا يمكن إرسال العرض: يوجد بند يحتاج إعادة حساب أو فحص قبل الإنتاج');
      return;
    }
    const saved = persistDevis(items, 'ready');
    if (!saved) return;
    const sent = db.devis.transitionStatus(saved.id, 'sent', { sentVia: 'manual' });
    if (!sent) {
      toast.error('لا يمكن إرسال العرض قبل تصحيح تحذيرات الإنتاج');
      return;
    }
    localStorage.removeItem(DRAFT_RESTORE_KEY);
    logAudit('status', `أرسل العرض للعميل`, sent.number);
    toast.success(`تم إرسال العرض ${sent.number}`);
    navigate('/devis');
  };

  const startingPrice = (svc: Service): number => {
    const defaults = initFieldValues(svc);
    return priceItem(svc, defaults, rules, null, papers).unitPrice;
  };

  const canNext =
    step === 0 ? sectionId !== null
    : step === 1 ? serviceId !== null
    : step === 2 ? clientId !== ''
    : true;

  const savedDevis = devisId ? db.devis.get(devisId) : undefined;
  const previewDevis: Devis | null =
    items.length > 0
      ? {
          ...(savedDevis ?? {}),
          id: savedDevis?.id ?? 'preview',
          number: savedDevis?.number ?? 'D-····-····',
          revision: savedDevis?.revision ?? 1,
          clientId,
          projectId: projectId || undefined,
          status: savedDevis?.status ?? 'draft',
          items,
          total: totals.ttc,
          totals,
          discount: quoteDiscount,
          extraFees,
          taxRate,
          advance,
          title: titleValue.trim() || undefined,
          deliveryDate: deliveryDate ? fromInputDate(deliveryDate) : undefined,
          validUntil: validUntil ? fromInputDate(validUntil) : undefined,
          notes: notes.trim() || undefined,
          internalNotes: notes.trim() || undefined,
          clientNotes: clientNotes.trim() || undefined,
          commercialTerms: {
            paymentTerms: paymentTerms.trim() || undefined,
            deliveryMethod: deliveryMethod.trim() || undefined,
            deliveryDelay: deliveryDelay.trim() || undefined,
            language: documentLanguage,
          },
          rulesVersion: savedDevis?.rulesVersion ?? rulesVersion.version,
          rulesSnapshot: savedDevis?.rulesSnapshot ?? rulesVersion.rules,
          createdAt: savedDevis?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      : null;

  useEffect(() => {
    if (!clientId) {
      setSaveState('idle');
      return;
    }
    setSaveState('saving');
    const timer = window.setTimeout(() => {
      try {
        const saved = persistDevis(items, 'draft', { silent: true });
        setSaveState(saved ? 'saved' : 'failed');
      } catch {
        setSaveState('failed');
      }
    }, 800);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally tracks form state, persistDevis is recreated per render
  }, [
    clientId,
    projectId,
    titleValue,
    deliveryDate,
    validUntil,
    notes,
    clientNotes,
    paymentTerms,
    deliveryMethod,
    deliveryDelay,
    documentLanguage,
    taxRate,
    quoteDiscount,
    extraFees,
    advance,
    items,
  ]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        saveDraft();
      }
      if (key === 'd') {
        event.preventDefault();
        const target = editingItemId ?? items[items.length - 1]?.id;
        if (target) duplicateItem(target);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingItemId, items]);

  // ------------------------------- step 0: section ---------------------------

  const stepSection = (
    <div>
      <h1 className="text-[27px] leading-9 font-bold text-[var(--ink-900)]">ما نوع العمل؟</h1>
      <p className="mt-1 text-[13px] text-[var(--ink-500)]">اختر القسم الرئيسي — يمكنك إضافة أقسام جديدة من منشئ المنتجات.</p>
      <div className="mt-5 grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
        {sections.map((s, i) => {
          const Icon = sectionIcon(s);
          const selected = sectionId === s.id;
          const count = db.services.bySection(s.id).filter((sv) => !isServiceDisabled(sv.id)).length;
          return (
            <motion.button
              key={s.id}
              type="button"
              onClick={() => selectSection(s.id)}
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.42, ease: EASE }}
              whileHover={{ y: -4 }}
              className={cn(
                'group relative rounded-[14px] border bg-white p-5 text-start shadow-[var(--shadow-card)] transition-colors',
                selected ? 'border-2 border-[var(--cyan-600)] bg-[var(--cyan-50)]' : 'border-[var(--line)] hover:border-[var(--cyan-500)]',
              )}
            >
              <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <CropMarks opacity={0.5} offset={6} />
              </span>
              <span className="grid h-12 w-12 place-items-center rounded-[12px] bg-[var(--cyan-50)] text-[var(--cyan-600)]">
                <Icon size={24} />
              </span>
              <span className="mt-3 flex items-center gap-2 text-[17px] leading-[26px] font-semibold text-[var(--ink-900)]">
                {s.name}
                {selected && (
                  <motion.svg
                    width="18" height="18" viewBox="0 0 18 18" fill="none"
                    className="text-[var(--cyan-600)]"
                  >
                    <motion.circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="2" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35 }} />
                    <motion.path d="M5.5 9.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.15, duration: 0.35 }} />
                  </motion.svg>
                )}
              </span>
              {s.latinName && (
                <span dir="ltr" className="font-latin mt-0.5 block text-start text-[11px] tracking-[0.04em] text-[var(--ink-400)]">
                  {s.latinName}
                </span>
              )}
              <span className="mt-1 block text-[12px] text-[var(--ink-500)]">
                <span dir="ltr" className="font-latin">{count}</span> {count === 1 ? 'خدمة' : 'خدمات'}
              </span>
            </motion.button>
          );
        })}
      </div>
      <Link to="/builder" className="mt-5 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--cyan-600)] transition-colors hover:text-[var(--cyan-500)]">
        تعديل الأقسام
        <ChevronLeft size={14} />
      </Link>
    </div>
  );

  // ------------------------------- step 1: service ---------------------------

  const sectionServices = sectionId ? db.services.bySection(sectionId).filter((s) => !isServiceDisabled(s.id)) : [];
  const filteredServices = sectionServices.filter(
    (s) =>
      !serviceSearch ||
      s.name.includes(serviceSearch) ||
      (s.latinName ?? '').toLowerCase().includes(serviceSearch.toLowerCase()),
  );

  const stepService = (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        {section && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--cyan-600)] bg-[var(--cyan-100)] px-3 py-1 text-[13px] font-medium text-[var(--cyan-600)]">
            {section.name}
            <button
              type="button"
              aria-label="تغيير القسم"
              onClick={() => {
                setSectionId(null);
                setServiceId(null);
                setStep(0);
              }}
              className="grid h-4 w-4 place-items-center rounded-full hover:bg-[var(--cyan-600)] hover:text-white"
            >
              <X size={11} />
            </button>
          </span>
        )}
        <h1 className="text-[27px] leading-9 font-bold text-[var(--ink-900)]">اختر الخدمة</h1>
      </div>
      <div className="mt-4 flex h-11 max-w-md items-center gap-2 rounded-[10px] border border-[var(--line-strong)] bg-white px-3 transition-shadow focus-within:border-[var(--cyan-600)] focus-within:shadow-[var(--shadow-focus)]">
        <Search size={16} className="text-[var(--ink-400)]" />
        <input
          value={serviceSearch}
          onChange={(e) => setServiceSearch(e.target.value)}
          placeholder="ابحث عن خدمة…"
          className="w-full bg-transparent text-[14px] outline-none"
        />
      </div>
      {filteredServices.length === 0 ? (
        <EmptyState
          className="mt-5"
          title="لا توجد خدمة بهذا الاسم"
          helper="جرّب بحثًا آخر أو أنشئ خدمة جديدة من منشئ المنتجات."
          action={
            <Link to="/builder" className="flex h-10 items-center gap-1.5 rounded-[10px] border border-[var(--line-strong)] bg-white px-4 text-[14px] font-medium text-[var(--ink-700)] hover:bg-[var(--paper-100)]">
              أنشئها في منشئ المنتجات
            </Link>
          }
        />
      ) : (
        <ul className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pe-1">
          <AnimatePresence initial={false}>
            {filteredServices.slice(0, 10).map((s, i) => (
              <motion.li
                key={s.id}
                layout
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: i * 0.05, duration: 0.32, ease: EASE, layout: { type: 'spring', stiffness: 300, damping: 30 } }}
              >
                <button
                  type="button"
                  onClick={() => selectService(s.id)}
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-[12px] border bg-white px-4 py-3.5 text-start shadow-[var(--shadow-card)] transition-all duration-[180ms] hover:-translate-x-1 hover:bg-[var(--cyan-50)]',
                    serviceId === s.id ? 'border-[var(--cyan-600)]' : 'border-[var(--line)]',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-semibold text-[var(--ink-900)]">{s.name}</span>
                      {s.latinName && (
                        <span dir="ltr" className="font-latin text-[13px] text-[var(--ink-500)]">
                          {s.latinName}
                        </span>
                      )}
                      {s.stages && s.stages.length > 1 && (
                        <span className="rounded-full bg-[var(--paper-100)] px-2 py-0.5 text-[11px] text-[var(--ink-500)]">
                          <span dir="ltr" className="font-latin">{s.stages.length}</span> مراحل
                        </span>
                      )}
                    </span>
                    {s.description && <span className="mt-0.5 block truncate text-[12px] text-[var(--ink-400)]">{s.description}</span>}
                  </span>
                  <span className="shrink-0 text-[13px] text-[var(--ink-500)]">
                    ابتداءً من{' '}
                    <span dir="ltr" className="font-latin font-semibold text-[var(--cyan-600)]">
                      {formatDA(startingPrice(s))}
                    </span>
                    /نسخة
                  </span>
                  <ChevronLeft size={16} className="shrink-0 text-[var(--ink-400)] transition-transform group-hover:-translate-x-0.5" />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );

  // ------------------------------- step 2: general info ----------------------

  const fieldLabel = (text: string, required = false, hint?: string) => (
    <span className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-[var(--ink-700)]">
      {text}
      {required && <span className="text-[var(--danger-600)]">*</span>}
      {hint && (
        <span title={hint} className="text-[var(--ink-400)]">
          <Info size={13} />
        </span>
      )}
    </span>
  );

  const stepInfo = (
    <SectionCard title="معلومات العرض">
      <div className="grid gap-4 md:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0, duration: 0.35, ease: EASE }}>
          {fieldLabel('العميل', true)}
          <ClientCombobox
            clients={clients}
            value={clientId}
            onChange={(id) => {
              setClientId(id);
              setClientError(false);
            }}
            onCreateNew={() => setClientModal(true)}
            error={clientError}
          />
          {clientError && <p className="mt-1 text-[12px] font-medium text-[var(--danger-600)]">العميل مطلوب</p>}
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.055, duration: 0.35, ease: EASE }}>
          {fieldLabel('المشروع')}
          <ProjectSelect clientId={clientId} value={projectId} onChange={setProjectId} />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.11, duration: 0.35, ease: EASE }} className="md:col-span-2">
          {fieldLabel('عنوان العرض')}
          <input
            value={titleValue}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleTouched(true);
            }}
            placeholder="عرض — الخدمة — العميل"
            className="h-10 w-full rounded-[8px] border border-[var(--line-strong)] px-3 text-[14px] outline-none focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)]"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.165, duration: 0.35, ease: EASE }}>
          {fieldLabel('تاريخ التسليم المتوقع')}
          <input
            type="date"
            dir="ltr"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            className="font-latin h-10 w-full rounded-[8px] border border-[var(--line-strong)] px-3 text-[14px] outline-none focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)]"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22, duration: 0.35, ease: EASE }}>
          {fieldLabel('صالح حتى', false, 'افتراضيًا بعد 15 يومًا')}
          <input
            type="date"
            dir="ltr"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className="font-latin h-10 w-full rounded-[8px] border border-[var(--line-strong)] px-3 text-[14px] outline-none focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)]"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.275, duration: 0.35, ease: EASE }}>
          {fieldLabel('الوحدة', false, 'تؤثر على كل الحقول القادمة — التخزين الداخلي بالمليمتر')}
          <div dir="ltr" className="flex w-fit overflow-hidden rounded-[8px] border border-[var(--line-strong)]">
            {(['mm', 'cm'] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className={cn(
                  'font-latin px-4 py-2 text-[13px] font-semibold transition-colors',
                  unit === u ? 'bg-[var(--cyan-600)] text-white' : 'bg-white text-[var(--ink-500)] hover:bg-[var(--paper-100)]',
                )}
              >
                {u}
              </button>
            ))}
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.33, duration: 0.35, ease: EASE }} className="md:col-span-2">
          {fieldLabel('ملاحظات داخلية')}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-[8px] border border-[var(--line-strong)] px-3 py-2 text-[14px] outline-none focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)]"
          />
          <p className="mt-1 text-[11px] text-[var(--ink-400)]">لا تظهر في PDF.</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.385, duration: 0.35, ease: EASE }} className="md:col-span-2">
          {fieldLabel('ملاحظات وشروط تظهر للعميل')}
          <textarea
            value={clientNotes}
            onChange={(e) => setClientNotes(e.target.value)}
            rows={3}
            placeholder="ملاحظات تجارية تظهر في PDF العميل…"
            className="w-full rounded-[8px] border border-[var(--line-strong)] px-3 py-2 text-[14px] outline-none focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)]"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.44, duration: 0.35, ease: EASE }}>
          {fieldLabel('شروط الدفع')}
          <input
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            className="h-10 w-full rounded-[8px] border border-[var(--line-strong)] px-3 text-[14px] outline-none focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)]"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.495, duration: 0.35, ease: EASE }}>
          {fieldLabel('مدة الإنجاز')}
          <input
            value={deliveryDelay}
            onChange={(e) => setDeliveryDelay(e.target.value)}
            placeholder="مثلاً: 3 أيام عمل بعد اعتماد BAT"
            className="h-10 w-full rounded-[8px] border border-[var(--line-strong)] px-3 text-[14px] outline-none focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)]"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.35, ease: EASE }}>
          {fieldLabel('طريقة التسليم')}
          <input
            value={deliveryMethod}
            onChange={(e) => setDeliveryMethod(e.target.value)}
            placeholder="استلام من المطبعة / توصيل"
            className="h-10 w-full rounded-[8px] border border-[var(--line-strong)] px-3 text-[14px] outline-none focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)]"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.605, duration: 0.35, ease: EASE }}>
          {fieldLabel('قالب المستند')}
          <select
            value={documentLanguage}
            onChange={(e) => setDocumentLanguage(e.target.value as 'ar' | 'fr' | 'bilingual')}
            className="h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-3 text-[14px] outline-none focus:border-[var(--cyan-600)]"
          >
            <option value="ar">عربي</option>
            <option value="fr">Français</option>
            <option value="bilingual">ثنائي اللغة</option>
          </select>
        </motion.div>
      </div>
    </SectionCard>
  );

  // ------------------------------- step 3: service fields --------------------

  const setField = (id: string, v: FieldValues[string]) => setFieldValues((fv) => ({ ...fv, [id]: v }));
  const dimensionFieldId = firstDimensionFieldId(service);
  const uploadStickers = useMemo<Sticker[]>(() => {
    const bleed = service?.defaultBleedMm ?? 2;
    if (designAssets.length > 0) {
      return designAssets.map((asset) => ({
        id: asset.id,
        name: designNameFromAsset(asset),
        widthMm: asset.widthMm,
        heightMm: asset.heightMm,
        bleed: asset.detectedBleedMm ?? { top: bleed, bottom: bleed, left: bleed, right: bleed },
        bleedLinked: !asset.detectedBleedMm,
        quantity,
        asset,
        cutContour: cutContourAssets.find((contour) => contour.match?.status || contour.fileName),
      }));
    }
    if (currentDims) {
      return [
        {
          id: 'request-size',
          name: 'مقاس الطلب',
          widthMm: currentDims.widthMm,
          heightMm: currentDims.heightMm,
          bleed: { top: bleed, bottom: bleed, left: bleed, right: bleed },
          bleedLinked: true,
          quantity,
        },
      ];
    }
    return [];
  }, [service, designAssets, cutContourAssets, currentDims, quantity]);

  const addDesignFiles = (assets: DesignFileAsset[]) => {
    if (assets.length === 0) return;
    setDesignAssets((prev) => [...prev, ...assets]);
    const first = assets[0];
    if (dimensionFieldId) {
      setField(dimensionFieldId, { widthMm: first.widthMm, heightMm: first.heightMm });
      setMontage(null);
      setMontageSig('');
    }
  };

  const attachCutContour = (_stickerId: string, asset: DesignFileAsset) => {
    setCutContourAssets((prev) => [...prev, asset]);
  };

  const stepFields = service && (
    <SectionCard title={`حقول الخدمة — ${service.name}`}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-5">
          {service.fields.map((f, i) => {
            const v = fieldValues[f.id];
            const anim = {
              initial: { opacity: 0, y: 16 },
              animate: { opacity: 1, y: 0 },
              transition: { delay: i * 0.05, duration: 0.3, ease: EASE },
            } as const;
            if (f.type === 'number') {
              return (
                <motion.div key={f.id} {...anim}>
                  <NumberField
                    label={f.required ? `${f.label} *` : f.label}
                    value={typeof v === 'number' ? v : Number(v) || undefined}
                    onChange={(n) => setField(f.id, n)}
                    min={f.min}
                    max={f.max}
                    step={f.step ?? 1}
                    unitSuffix={f.id === 'quantity' ? 'نسخة' : undefined}
                    presets={f.id === 'quantity' ? QTY_PRESETS : undefined}
                  />
                </motion.div>
              );
            }
            if (f.type === 'dimensions') {
              return (
                <motion.div key={f.id} {...anim}>
                  {f.id === 'format' && (
                    <p className="mb-1 text-[11px] text-[var(--ink-400)]">المقاس النهائي بعد القص، بدون Bleed.</p>
                  )}
                  <DimensionGroup
                    label={f.required ? `${f.label} *` : f.label}
                    value={isDim(v) ? v : { widthMm: 0, heightMm: 0 }}
                    onChange={(d) => setField(f.id, d)}
                    unit={unit}
                    onUnitChange={setUnit}
                  />
                </motion.div>
              );
            }
            if (f.type === 'select' && f.options) {
              // الوجوه (Recto / Recto Verso) render as radio cards, others as dropdown
              if (f.id === 'faces') {
                return (
                  <motion.div key={f.id} {...anim}>
                    {fieldLabel(f.label, f.required)}
                    <div className="flex flex-wrap gap-2">
                      {f.options.map((o) => {
                        const active = v === o.id;
                        return (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => setField(f.id, o.id)}
                            className={cn(
                              'flex items-center gap-2 rounded-[10px] border px-4 py-2.5 text-[14px] transition-all',
                              active
                                ? 'border-[var(--cyan-600)] bg-[var(--cyan-50)] font-semibold text-[var(--ink-900)]'
                                : 'border-[var(--line-strong)] bg-white text-[var(--ink-700)] hover:border-[var(--cyan-500)]',
                            )}
                          >
                            {active && <Check size={14} className="text-[var(--cyan-600)]" />}
                            <span dir="ltr" className="font-latin">{o.latinLabel ?? o.label}</span>
                            <span className="text-[13px] text-[var(--ink-500)]">{o.label}</span>
                            {o.priceDelta !== 0 ? (
                              <span dir="ltr" className="font-latin text-[13px] font-semibold text-[var(--cyan-600)]">
                                +{o.priceDelta} دج/نسخة
                              </span>
                            ) : (
                              <span className="text-[12px] text-[var(--ink-400)]">أساسي</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                );
              }
              return (
                <motion.div key={f.id} {...anim}>
                  <SelectWithPrice
                    label={f.required ? `${f.label} *` : f.label}
                    options={f.options}
                    value={typeof v === 'string' ? v : undefined}
                    onChange={(id) => setField(f.id, id)}
                  />
                </motion.div>
              );
            }
            if (f.type === 'yesno') {
              const opt = f.options?.[0];
              return (
                <motion.div key={f.id} {...anim} className="rounded-[10px] border border-[var(--line)] px-4 py-3">
                  <YesNoToggle
                    checked={v === true}
                    onChange={(b) => setField(f.id, b)}
                    label={f.label}
                    latinLabel={f.latinName}
                    priceDelta={opt?.priceDelta}
                    deltaUnit={opt?.deltaUnit}
                  />
                </motion.div>
              );
            }
            // text
            return (
              <motion.div key={f.id} {...anim}>
                {fieldLabel(f.label, f.required)}
                <input
                  value={typeof v === 'string' ? v : ''}
                  onChange={(e) => setField(f.id, e.target.value)}
                  placeholder={f.placeholder}
                  className="h-10 w-full rounded-[8px] border border-[var(--line-strong)] px-3 text-[14px] outline-none focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)]"
                />
              </motion.div>
            );
          })}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: service.fields.length * 0.05, duration: 0.3, ease: EASE }}>
            {fieldLabel('ملفات التصميم و tracé découpe')}
            <DesignFileUploader
              stickers={uploadStickers}
              maxDesigns={12}
              onAddDesigns={addDesignFiles}
              onAttachCutContour={attachCutContour}
            />
            {(designAssets.length > 0 || cutContourAssets.length > 0) && (
              <div className="mt-2 space-y-1 rounded-[10px] border border-[var(--line)] bg-[var(--paper-50)] p-2 text-[11px] text-[var(--ink-500)]">
                {designAssets.map((asset) => (
                  <div key={asset.id} className="flex items-center justify-between gap-2">
                    <span className="truncate" dir="ltr">{asset.fileName}</span>
                    <span dir="ltr" className="font-latin shrink-0">{round2(asset.widthMm)}×{round2(asset.heightMm)} mm</span>
                  </div>
                ))}
                {cutContourAssets.map((asset) => (
                  <div key={asset.id} className="flex items-center justify-between gap-2 text-[var(--cyan-600)]">
                    <span className="truncate" dir="ltr">tracé: {asset.fileName}</span>
                    <span>{asset.match?.status === 'matched' ? 'مطابق' : asset.match?.status === 'review' ? 'مراجعة' : 'تحذير'}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* live price ticker */}
        <div className="border-t border-[var(--line)] pt-4 lg:border-s lg:border-t-0 lg:ps-6 lg:pt-0">
          <div className="text-[11px] font-medium tracking-[0.04em] text-[var(--ink-400)]">السعر الحالي</div>
          <motion.div
            key={final ? Math.round(final.unitPrice * 100) : 0}
            initial={{ backgroundColor: '#E0F2FE' }}
            animate={{ backgroundColor: 'rgba(224,242,254,0)' }}
            transition={{ duration: 0.5 }}
            className="mt-2 rounded-[10px] p-3"
          >
            <div className="text-[12px] text-[var(--ink-500)]">سعر النسخة</div>
            <div className="font-latin text-[22px] leading-7 font-semibold text-[var(--ink-900)]">
              <FlipNumber value={final?.unitPrice ?? 0} /> <span className="text-[13px] font-normal text-[var(--ink-500)]">دج</span>
            </div>
            <div className="mt-3 text-[12px] text-[var(--ink-500)]">الإجمالي</div>
            <div className="font-latin text-[30px] leading-9 font-semibold text-[var(--cyan-600)]">
              <FlipNumber value={final?.total ?? 0} /> <span className="text-[15px] font-normal text-[var(--ink-500)]">دج</span>
            </div>
          </motion.div>
          <div className="mt-2 space-y-1 text-[11px] text-[var(--ink-400)]">
            <div className="flex justify-between"><span>الكمية</span><span dir="ltr" className="font-latin">{quantity}</span></div>
            {montage && (
              <div className="flex justify-between"><span>الأوراق</span><span dir="ltr" className="font-latin">{montage.sheetsNeeded}</span></div>
            )}
            <div className="flex items-center gap-1 pt-1">
              <Lock size={11} />
              <VersionBadge version={rulesVersion.version} />
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );

  // ------------------------------- step 4: montage ---------------------------

  const stepMontage = (
    <SectionCard
      title="المونتاج والحساب المتقدم"
      actions={
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--paper-100)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink-500)]">
          <Sparkles size={12} className="text-[var(--cyan-600)]" />
          اختياري / متقدم
        </span>
      }
    >
      {montageLoading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 0.6, repeat: 1, delay: i * 0.15 }}
              className="h-16 rounded-[12px] bg-[var(--paper-100)]"
            />
          ))}
          <p className="text-center text-[13px] text-[var(--ink-500)]">جارٍ حساب أفضل توزيع…</p>
        </div>
      ) : !montage ? (
        <div className="relative flex flex-col items-center gap-3 overflow-hidden rounded-[12px] border border-dashed border-[var(--line-strong)] bg-[var(--paper-100)] px-6 py-10 text-center">
          <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'url(/texture-halftone.svg)', backgroundSize: '512px' }} aria-hidden />
          <img src="/empty-montage.svg" alt="" className="relative h-40 w-auto" />
          <h3 className="relative text-[17px] leading-[26px] font-semibold text-[var(--ink-900)]">احسب المونتاج الذكي</h3>
          <p className="relative max-w-md text-[13px] leading-5 text-[var(--ink-500)]">
            يقترح أفضل ورقة وأفضل توزيع بأقل هدر، ويحسب عدد الأوراق والتكلفة تلقائيًا.
          </p>
          <div className="relative mt-1 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => runMontage()}
              className="flex h-12 items-center gap-2 rounded-[10px] bg-[var(--cyan-600)] px-6 text-[15px] font-semibold text-white transition-all hover:-translate-y-px hover:bg-[var(--cyan-500)] active:translate-y-0 active:scale-[0.97]"
            >
              <Sparkles size={17} />
              تشغيل المونتاج الذكي
            </button>
            <button
              type="button"
              onClick={skipMontage}
              className="h-12 rounded-[10px] px-4 text-[14px] font-medium text-[var(--ink-500)] underline decoration-transparent underline-offset-4 transition-all hover:text-[var(--ink-700)] hover:decoration-[var(--ink-400)]"
            >
              تخطَّ (سعر يدوي)
            </button>
          </div>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, ease: EASE }}>
          {montageStale && (
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#D97706]/10 px-3 py-1 text-[12px] font-medium text-[#B45309]">
              <Info size={13} />
              تغيّرت الكمية أو المقاس — يتطلب إعادة حساب
            </div>
          )}
          <div className="rounded-[14px] bg-[var(--cyan-50)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-[17px] leading-[26px] font-semibold text-[var(--ink-900)]">التوصية الذكية</h3>
                <p className="mt-1 text-[21px] leading-[30px] font-bold text-[var(--ink-900)]">
                  ورقة{' '}
                  <span dir="ltr" className="font-latin">
                    {Math.round(montage.sheetWidthMm / 10)}×{Math.round(montage.sheetHeightMm / 10)} cm
                  </span>{' '}
                  — <span dir="ltr" className="font-latin">{montage.copiesPerSheet}</span> نسخة/ورقة —{' '}
                  <span dir="ltr" className="font-latin">{montage.sheetsNeeded}</span> ورقة
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    { label: 'الهدر', value: formatPercent(montage.wastePercent) },
                    { label: 'تكلفة الورق', value: formatDA(breakdown?.paper ?? 0) },
                    { label: 'الأوجه/ورقة', value: String(montage.facesPerSheet) },
                    { label: 'نسخ/ورقة', value: String(montage.copiesPerSheet) },
                  ].map((chip, i) => (
                    <motion.span
                      key={chip.label}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + i * 0.07, duration: 0.3 }}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[12px] text-[var(--ink-700)] ring-1 ring-[var(--line)]"
                    >
                      {chip.label}
                      <span dir="ltr" className="font-latin font-semibold text-[var(--cyan-600)]">{chip.value}</span>
                    </motion.span>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => runMontage()}
                    className="flex h-9 items-center gap-1.5 rounded-[8px] border border-[var(--line-strong)] bg-white px-3 text-[13px] font-medium text-[var(--ink-700)] transition-colors hover:bg-[var(--paper-100)]"
                  >
                    إعادة الحساب
                  </button>
                  <Link
                    to="/montage"
                    className="flex h-9 items-center gap-1.5 rounded-[8px] border border-[var(--line-strong)] bg-white px-3 text-[13px] font-medium text-[var(--ink-700)] transition-colors hover:bg-[var(--paper-100)]"
                  >
                    تعديل في الاستوديو
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setMontage(null);
                      setManualPrice(breakdown ? breakdown.unitPrice : 0);
                    }}
                    className="flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium text-[var(--ink-500)] underline decoration-transparent underline-offset-4 hover:decoration-[var(--ink-400)]"
                  >
                    إزالة المونتاج (سعر يدوي)
                  </button>
                </div>
              </div>
              <MontageThumb result={montage} width={170} />
            </div>
          </div>

          {/* alternatives accordion */}
          {montage.alternatives.length > 0 && (
            <details className="group mt-3 rounded-[12px] border border-[var(--line)]">
              <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-[13px] font-medium text-[var(--ink-700)]">
                البدائل (متقدم) — <span dir="ltr" className="font-latin">{montage.alternatives.length}</span> أوراق أخرى
                <ChevronLeft size={15} className="-rotate-90 transition-transform duration-200 group-open:rotate-0" />
              </summary>
              <ul className="border-t border-[var(--line)]">
                {montage.alternatives.map((alt) => (
                  <li key={`${alt.sheetWidthMm}x${alt.sheetHeightMm}-${alt.machineId}`} className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-2.5 text-[13px] last:border-0">
                    <span dir="ltr" className="font-latin font-semibold text-[var(--ink-900)]">
                      {Math.round(alt.sheetWidthMm / 10)}×{Math.round(alt.sheetHeightMm / 10)} cm
                    </span>
                    <span className="text-[var(--ink-500)]">
                      <span dir="ltr" className="font-latin">{alt.copiesPerSheet}</span> نسخة/ورقة ·{' '}
                      <span dir="ltr" className="font-latin">{alt.sheetsNeeded}</span> ورقة
                    </span>
                    <span className="flex h-2 w-20 overflow-hidden rounded-full bg-[var(--paper-100)]">
                      <span
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (alt.wastePercent / 30) * 100)}%`,
                          backgroundColor: alt.wastePercent < 10 ? '#16A34A' : alt.wastePercent < 20 ? '#D97706' : '#DC2626',
                        }}
                      />
                    </span>
                    <span dir="ltr" className="font-latin text-[12px] text-[var(--ink-400)]">{formatPercent(alt.wastePercent)}</span>
                    <button
                      type="button"
                      onClick={() => adoptAlternative(alt)}
                      className="ms-auto h-8 rounded-[8px] border border-[var(--line-strong)] px-3 text-[12px] font-medium text-[var(--ink-700)] transition-colors hover:bg-[var(--paper-100)]"
                    >
                      اعتماد هذا البديل
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </motion.div>
      )}
    </SectionCard>
  );

  // ------------------------------- step 5: price review ----------------------

  const reviewLines = breakdown
    ? [
        { id: 'paper', label: 'الورق', basis: montage ? `${montage.sheetsNeeded} ورقة` : 'تقدير من المقاس', amount: breakdown.paper, color: '#0284C7' },
        { id: 'printing', label: 'الطباعة', basis: montage ? `${montage.sheetsNeeded} ورقة × ${montage.facesPerSheet} وجه` : 'تقدير من المقاس', amount: breakdown.printing, color: '#0D9488' },
        { id: 'cutting', label: 'القص', basis: montage ? `${montage.sheetsNeeded} ورقة` : 'تقدير من المقاس', amount: breakdown.cutting, color: '#7C3AED' },
        { id: 'finishing', label: 'التشطيب', basis: `${quantity} نسخة`, amount: breakdown.finishing, color: '#D97706' },
        { id: 'waste', label: 'الهدر', basis: `${percentRule(rules, 'waste')?.value ?? 0}% من تكلفة الإنتاج`, amount: breakdown.waste, color: '#9AA1AF' },
        { id: 'overhead', label: 'المصاريف العامة', basis: `${percentRule(rules, 'overhead')?.value ?? 8}%`, amount: breakdown.overhead, color: '#6B7280' },
        { id: 'margin', label: 'هامش الربح', basis: `${effectiveMargin}%`, amount: final?.margin ?? 0, color: '#16A34A' },
      ].filter((l) => l.amount > 0.005)
    : [];

  const reviewTotal = reviewLines.reduce((s, l) => s + l.amount, 0);

  const stepReview = service && final && (
    <SectionCard title="مراجعة السعر">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* cost breakdown */}
        <div>
          <h3 className="text-[17px] leading-[26px] font-semibold text-[var(--ink-900)]">تفصيل التكلفة</h3>
          {manualPrice !== null && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#D97706]/10 px-3 py-1 text-[12px] font-medium text-[#B45309]">
              سعر يدوي — بدون مونتاج
            </div>
          )}
          {/* stacked bar */}
          <div className="mt-3 flex h-3.5 overflow-hidden rounded-full bg-[var(--paper-100)]">
            {reviewLines.map((l, i) => (
              <motion.span
                key={l.id}
                initial={{ width: 0 }}
                animate={{ width: reviewTotal > 0 ? `${(l.amount / reviewTotal) * 100}%` : 0 }}
                transition={{ delay: i * 0.09, duration: 0.7, ease: 'easeOut' }}
                className="h-full transition-opacity duration-200"
                style={{ backgroundColor: l.color, opacity: hoveredLine && hoveredLine !== l.id ? 0.45 : 1 }}
              />
            ))}
          </div>
          <ul className="mt-4 space-y-1">
            {reviewLines.map((l, i) => (
              <motion.li
                key={l.id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06, duration: 0.3, ease: EASE }}
                onMouseEnter={() => setHoveredLine(l.id)}
                onMouseLeave={() => setHoveredLine(null)}
                className="flex items-center gap-3 rounded-[8px] px-2 py-2 transition-colors hover:bg-[var(--paper-100)]"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-[var(--ink-900)]">{l.label}</span>
                  <span dir="ltr" className="font-latin block text-[11px] text-[var(--ink-400)]">{l.basis}</span>
                </span>
                <span dir="ltr" className="font-latin text-[14px] font-semibold tabular-nums text-[var(--ink-900)]" title={`${l.label}: ${formatDA(l.amount)}`}>
                  {formatDA(l.amount)}
                </span>
              </motion.li>
            ))}
          </ul>
        </div>

        {/* totals + margin editor */}
        <div className="border-t border-[var(--line)] pt-4 lg:border-s lg:border-t-0 lg:ps-6 lg:pt-0">
          {manualPrice !== null && (
            <div className="mb-4">
              <NumberField label="سعر الوحدة اليدوي (دج)" value={manualPrice} onChange={setManualPrice} min={0} step={0.5} unitSuffix="دج/نسخة" />
            </div>
          )}
          {negativeMargin && (
            <div className="mb-4 flex items-start gap-2 rounded-[10px] border border-[var(--danger-600)]/40 bg-[#FEE2E2] px-3 py-2.5 text-[12px] leading-5 font-medium text-[var(--danger-600)]">
              <Info size={15} className="mt-0.5 shrink-0" />
              <span>
                السعر اليدوي أدنى من تكلفة الإنتاج — الهامش سالب ({formatDA(final?.margin ?? 0)}). سيُطلب تأكيد صريح قبل الإضافة إلى العرض.
              </span>
            </div>
          )}
          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between text-[14px]">
              <span className="text-[var(--ink-500)]">سعر النسخة</span>
              <span className="font-latin text-[22px] leading-7 font-semibold text-[var(--ink-900)]">
                <FlipNumber value={final.unitPrice} /> <span className="text-[13px] font-normal text-[var(--ink-500)]">دج</span>
              </span>
            </div>
            <div className="flex items-baseline justify-between text-[14px]">
              <span className="text-[var(--ink-500)]">الإجمالي HT</span>
              <span className="font-latin text-[22px] leading-7 font-semibold text-[var(--ink-900)]">
                <FlipNumber value={final.total} /> <span className="text-[13px] font-normal text-[var(--ink-500)]">دج</span>
              </span>
            </div>
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="text-[var(--ink-500)]">TVA <span dir="ltr" className="font-latin">{taxRatePct}%</span></span>
              <span dir="ltr" className="font-latin tabular-nums text-[var(--ink-700)]">{formatDA(final.total * taxRate)}</span>
            </div>
            <motion.div
              key={Math.round(final.total * (1 + taxRate) * 100)}
              initial={{ backgroundColor: '#E0F2FE' }}
              animate={{ backgroundColor: 'rgba(224,242,254,0)' }}
              transition={{ duration: 0.6 }}
              className="flex items-baseline justify-between rounded-[10px] border-t border-[var(--line)] px-2 pt-3"
            >
              <span className="text-[15px] font-bold text-[var(--ink-900)]">الإجمالي TTC</span>
              <span className="font-latin text-[30px] leading-9 font-semibold text-[var(--cyan-600)]">
                <FlipNumber value={final.total * (1 + taxRate)} /> <span className="text-[15px] font-normal text-[var(--ink-500)]">دج</span>
              </span>
            </motion.div>
          </div>

          {/* margin editor */}
          <div className="mt-5 rounded-[12px] border border-[var(--line)] bg-[var(--paper-50)] p-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[var(--ink-700)]">هامش الربح</span>
              <div className="flex items-center gap-2" dir="ltr">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setMarginPct(Math.max(0, effectiveMargin - 1))}
                  className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line-strong)] bg-white text-[var(--ink-700)] hover:bg-[var(--paper-100)]"
                >
                  −
                </motion.button>
                <span className="font-latin w-12 text-center text-[17px] font-semibold tabular-nums text-[var(--ink-900)]">{effectiveMargin}%</span>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setMarginPct(Math.min(100, effectiveMargin + 1))}
                  className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line-strong)] bg-white text-[var(--ink-700)] hover:bg-[var(--paper-100)]"
                >
                  +
                </motion.button>
              </div>
            </div>
            {marginPct !== null && marginPct !== defaultMargin && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.2 }} className="overflow-hidden">
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#D97706]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#B45309]">
                  سعر معدّل يدويًا — القاعدة {defaultMargin}%
                </span>
                <input
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="سبب التعديل (يُسجَّل في سجل التدقيق)"
                  className="mt-2 h-9 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-3 text-[13px] outline-none focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)]"
                />
              </motion.div>
            )}
          </div>

          <div className="mt-4 rounded-[12px] border border-[var(--line)] bg-white p-4">
            <div className="mb-2 text-[13px] font-semibold text-[var(--ink-800)]">مقارنة كميات سريعة</div>
            <div className="grid gap-2 sm:grid-cols-3">
              {quantityOptions.map((option) => (
                <button
                  key={option.quantity}
                  type="button"
                  onClick={() => setField('quantity', option.quantity)}
                  className={cn(
                    'rounded-[10px] border px-3 py-2 text-start transition-colors',
                    quantity === option.quantity
                      ? 'border-[var(--cyan-600)] bg-[var(--cyan-50)]'
                      : 'border-[var(--line)] bg-[var(--paper-50)] hover:border-[var(--cyan-500)]',
                  )}
                >
                  <div className="font-latin text-[15px] font-semibold text-[var(--ink-900)]">{option.quantity}</div>
                  <div className="mt-1 text-[11px] text-[var(--ink-500)]">
                    وحدة <span dir="ltr" className="font-latin">{formatDA(option.unitPrice)}</span>
                  </div>
                  <div className="text-[11px] text-[var(--ink-500)]">
                    هامش <span dir="ltr" className="font-latin">{formatPercent(option.marginPercent)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );

  // ------------------------------- step 6: confirmation ----------------------

  const lastItem = items[items.length - 1];

  const stepDone = (
    <div className="relative overflow-hidden rounded-[14px] border border-[var(--line)] bg-white px-6 py-12 text-center shadow-[var(--shadow-card)]">
      <PaperConfetti key={lastItem?.id ?? 'none'} />
      <div className="flex justify-center">
        <SuccessTarget />
      </div>
      <h2 className="mt-5 text-[21px] leading-[30px] font-bold text-[var(--ink-900)]">تمت إضافة الخدمة إلى العرض</h2>
      {lastItem && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.4, ease: EASE }}
          className="mx-auto mt-4 flex max-w-md items-center justify-between gap-3 rounded-[12px] border border-[var(--line)] bg-[var(--paper-100)] px-4 py-3 text-start"
        >
          <div className="min-w-0">
            <div className="truncate font-semibold text-[var(--ink-900)]">
              <span dir="ltr" className="font-latin">{lastItem.serviceName}</span>
            </div>
            <div className="text-[12px] text-[var(--ink-500)]">
              <span dir="ltr" className="font-latin">{lastItem.quantity}</span> نسخة
            </div>
          </div>
          <div dir="ltr" className="font-latin text-[17px] font-semibold tabular-nums text-[var(--cyan-600)]">
            {formatDA(lastItem.total * (1 + taxRate))}
          </div>
        </motion.div>
      )}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.45, duration: 0.4 }}
        className="mt-6 flex flex-wrap items-center justify-center gap-2"
      >
        <button
          type="button"
          onClick={addAnother}
          className="flex h-11 items-center gap-1.5 rounded-[10px] bg-[var(--cyan-600)] px-5 text-[14px] font-semibold text-white transition-all hover:-translate-y-px hover:bg-[var(--cyan-500)] active:translate-y-0 active:scale-[0.97]"
        >
          <Plus size={16} />
          إضافة خدمة أخرى
        </button>
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="flex h-11 items-center gap-1.5 rounded-[10px] border border-[var(--line-strong)] bg-white px-5 text-[14px] font-semibold text-[var(--ink-700)] transition-colors hover:bg-[var(--paper-100)]"
        >
          معاينة العرض
        </button>
        <button
          type="button"
          onClick={exportPdf}
          disabled={pdfBusy}
          className="flex h-11 items-center gap-1.5 rounded-[10px] px-4 text-[14px] font-medium text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-200)] hover:text-[var(--ink-700)] disabled:opacity-50"
        >
          <FileDown size={16} />
          {pdfBusy ? 'جارٍ تجهيز PDF…' : 'تصدير PDF'}
        </button>
        <button
          type="button"
          onClick={finish}
          className="flex h-11 items-center gap-1.5 rounded-[10px] px-4 text-[14px] font-medium text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-200)] hover:text-[var(--ink-700)]"
        >
          حفظ وإنهاء
        </button>
      </motion.div>
    </div>
  );

  const stepContent = [stepSection, stepService, stepInfo, stepFields, stepMontage, stepReview, stepDone][step];

  // ------------------------------- render ------------------------------------

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-5">
      {/* header + autosave indicator */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[27px] leading-9 font-bold text-[var(--ink-900)]">
            {editDevis ? (
              <>
                تعديل العرض <span dir="ltr" className="font-latin">{editDevis.number}</span>
              </>
            ) : (
              'إنشاء Devis'
            )}
          </h1>
          <p className="mt-1 text-[13px] text-[var(--ink-500)]">
            {devisId && savedDevis ? (
              <>
                مسودة <span dir="ltr" className="font-latin font-semibold">{savedDevis.number}</span> — تُحفظ تلقائيًا
              </>
            ) : (
              'سبع خطوات — والسعر بجانب كل خيار.'
            )}
          </p>
        </div>
        <AnimatePresence>
          {(savedFlash || saveState !== 'idle') && (
            <motion.span
              key={`${saveState}-${savedFlash}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium',
                saveState === 'failed'
                  ? 'bg-[#FEE2E2] text-[var(--danger-600)]'
                  : saveState === 'saving'
                    ? 'bg-[#FEF3C7] text-[#B45309]'
                    : 'bg-[#DCFCE7] text-[#15803D]',
              )}
            >
              {saveState === 'saving' ? <Save size={13} /> : <Check size={13} />}
              {saveState === 'saving' ? 'جارٍ الحفظ…' : saveState === 'failed' ? 'فشل الحفظ' : 'محفوظ'}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* stepper (fixed at content top) */}
      <div className="sticky top-[80px] z-30 hidden rounded-[14px] border border-[var(--line)] bg-white/95 px-5 py-4 shadow-[var(--shadow-card)] backdrop-blur md:block">
        <StageStepper steps={PHASES} current={phaseForStep(step)} onStepClick={goToPhase} />
      </div>
      {/* mobile stepper */}
      <div className="rounded-[12px] border border-[var(--line)] bg-white px-4 py-3 md:hidden">
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-semibold text-[var(--ink-900)]">{PHASES[phaseForStep(step)]}</span>
          <span className="text-[var(--ink-500)]">
            المرحلة <span dir="ltr" className="font-latin">{phaseForStep(step) + 1}</span> من <span dir="ltr" className="font-latin">4</span>
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--paper-100)]">
          <motion.div className="h-full rounded-full bg-[var(--cyan-500)]" animate={{ width: `${((phaseForStep(step) + 1) / 4) * 100}%` }} transition={{ duration: 0.3 }} />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* main wizard column */}
        <div className="w-full max-w-[860px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40, transition: { duration: 0.3 } }}
              transition={{ duration: 0.38, delay: 0.08, ease: EASE }}
            >
              {stepContent}
            </motion.div>
          </AnimatePresence>

          {/* nav */}
          {step < 6 && step > 0 && (
            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="flex h-11 items-center gap-1.5 rounded-[10px] px-4 text-[14px] font-medium text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-200)] hover:text-[var(--ink-700)]"
              >
                <ChevronRight size={16} />
                رجوع
              </button>
              {step < 4 && (
                <button
                  type="button"
                  onClick={tryNext}
                  disabled={!canNext}
                  className="flex h-11 items-center gap-1.5 rounded-[10px] bg-[var(--cyan-600)] px-6 text-[14px] font-semibold text-white transition-all hover:-translate-y-px hover:bg-[var(--cyan-500)] active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  التالي
                  <ChevronLeft size={16} />
                </button>
              )}
              {step === 4 && (
                <button
                  type="button"
                  onClick={() => {
                    if (montageStale) {
                      toast.error('تغيّرت الكمية أو المقاس بعد حساب المونتاج — أعد الحساب قبل المتابعة');
                      return;
                    }
                    if (montage || manualPrice !== null) tryNext();
                    else skipMontage();
                  }}
                  className="flex h-11 items-center gap-1.5 rounded-[10px] bg-[var(--cyan-600)] px-6 text-[14px] font-semibold text-white transition-all hover:-translate-y-px hover:bg-[var(--cyan-500)] active:translate-y-0 active:scale-[0.97]"
                >
                  التالي: مراجعة السعر
                  <ChevronLeft size={16} />
                </button>
              )}
              {step === 5 && (
                <button
                  type="button"
                  onClick={addItem}
                  className="flex h-11 items-center gap-1.5 rounded-[10px] bg-[var(--cyan-600)] px-6 text-[14px] font-semibold text-white transition-all hover:-translate-y-px hover:bg-[var(--cyan-500)] active:translate-y-0 active:scale-[0.97]"
                >
                  <Plus size={16} />
                  إضافة إلى العرض
                </button>
              )}
            </div>
          )}
        </div>

        {/* sticky summary sidebar (physically on the left/end side) */}
        <aside className="w-full xl:sticky xl:top-[80px]">
          <SectionCard title="ملخص العرض">
            {/* client */}
            <div className="rounded-[10px] bg-[var(--paper-100)] px-3 py-2.5 text-[13px]">
              {client ? (
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--cyan-100)] text-[12px] font-semibold text-[var(--cyan-600)]">
                    {client.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-[var(--ink-900)]">{client.name}</div>
                    {client.company && <div className="truncate text-[11px] text-[var(--ink-500)]">{client.company}</div>}
                  </div>
                </div>
              ) : (
                <span className="text-[var(--ink-400)]">لم يُختر عميل بعد</span>
              )}
            </div>

            {/* items */}
            <ul className="mt-3 space-y-2">
              <AnimatePresence initial={false}>
                {items.map((it, index) => (
                  <motion.li
                    key={it.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="flex items-center gap-2 overflow-hidden rounded-[10px] border border-[var(--line)] bg-white px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-[var(--ink-900)]">
                        <span dir="ltr" className="font-latin">{it.serviceName}</span>
                      </div>
                      <div className="text-[11px] text-[var(--ink-400)]">
                        <span dir="ltr" className="font-latin">{it.quantity}</span> نسخة
                      </div>
                    </div>
                    <span dir="ltr" className="font-latin shrink-0 text-[13px] font-semibold tabular-nums text-[var(--ink-900)]">
                      {formatDA(it.total)}
                    </span>
                    <button
                      type="button"
                      aria-label="تعديل"
                      onClick={() => setEditingItemId(it.id)}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-[var(--ink-400)] transition-colors hover:bg-[var(--cyan-50)] hover:text-[var(--cyan-600)]"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label="نسخ"
                      onClick={() => duplicateItem(it.id)}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-[var(--ink-400)] transition-colors hover:bg-[var(--paper-200)] hover:text-[var(--ink-700)]"
                    >
                      <Copy size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label="رفع"
                      disabled={index === 0}
                      onClick={() => moveItem(it.id, -1)}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-[var(--ink-400)] transition-colors hover:bg-[var(--paper-200)] hover:text-[var(--ink-700)] disabled:opacity-30"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label="خفض"
                      disabled={index === items.length - 1}
                      onClick={() => moveItem(it.id, 1)}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-[var(--ink-400)] transition-colors hover:bg-[var(--paper-200)] hover:text-[var(--ink-700)] disabled:opacity-30"
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label="إزالة"
                      onClick={() => setRemoveItemId(it.id)}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-[var(--ink-400)] transition-colors hover:bg-[#FEE2E2] hover:text-[var(--danger-600)]"
                    >
                      <X size={13} />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
              {items.length === 0 && <li className="py-2 text-center text-[12px] text-[var(--ink-400)]">لا خدمات مضافة بعد</li>}
            </ul>

            <div className="mt-3 rounded-[10px] border border-[var(--line)] bg-[var(--paper-50)] p-3">
              <div className="mb-2 text-[12px] font-semibold text-[var(--ink-800)]">التسعير التجاري</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-[var(--ink-500)]">
                  الخصم
                  <div className="mt-1 flex overflow-hidden rounded-[8px] border border-[var(--line-strong)] bg-white">
                    <input
                      dir="ltr"
                      type="number"
                      min={0}
                      value={quoteDiscountValue}
                      onChange={(e) => setQuoteDiscountValue(Number(e.target.value) || 0)}
                      className="font-latin h-9 min-w-0 flex-1 px-2 text-[12px] outline-none"
                    />
                    <select
                      value={quoteDiscountMode}
                      onChange={(e) => setQuoteDiscountMode(e.target.value as 'amount' | 'percent')}
                      className="h-9 border-s border-[var(--line)] bg-[var(--paper-100)] px-1 text-[11px] outline-none"
                    >
                      <option value="amount">دج</option>
                      <option value="percent">%</option>
                    </select>
                  </div>
                </label>
                <label className="text-[11px] text-[var(--ink-500)]">
                  TVA %
                  <input
                    dir="ltr"
                    type="number"
                    min={0}
                    step={0.5}
                    value={taxRatePct}
                    onChange={(e) => setTaxRatePct(Number(e.target.value) || 0)}
                    className="font-latin mt-1 h-9 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-2 text-[12px] outline-none"
                  />
                </label>
                <label className="text-[11px] text-[var(--ink-500)]">
                  مصاريف
                  <input
                    dir="ltr"
                    type="number"
                    min={0}
                    value={extraFeeAmount}
                    onChange={(e) => setExtraFeeAmount(Number(e.target.value) || 0)}
                    className="font-latin mt-1 h-9 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-2 text-[12px] outline-none"
                  />
                </label>
                <label className="text-[11px] text-[var(--ink-500)]">
                  التسبيق
                  <div className="mt-1 flex overflow-hidden rounded-[8px] border border-[var(--line-strong)] bg-white">
                    <input
                      dir="ltr"
                      type="number"
                      min={0}
                      value={advanceValue}
                      onChange={(e) => setAdvanceValue(Number(e.target.value) || 0)}
                      className="font-latin h-9 min-w-0 flex-1 px-2 text-[12px] outline-none"
                    />
                    <select
                      value={advanceMode}
                      onChange={(e) => setAdvanceMode(e.target.value as 'amount' | 'percent')}
                      className="h-9 border-s border-[var(--line)] bg-[var(--paper-100)] px-1 text-[11px] outline-none"
                    >
                      <option value="amount">دج</option>
                      <option value="percent">%</option>
                    </select>
                  </div>
                </label>
              </div>
              <input
                value={quoteDiscountReason}
                onChange={(e) => setQuoteDiscountReason(e.target.value)}
                placeholder="سبب الخصم أو تعديل السعر"
                className="mt-2 h-8 w-full rounded-[8px] border border-[var(--line)] bg-white px-2 text-[11px] outline-none focus:border-[var(--cyan-600)]"
              />
              <input
                value={extraFeeLabel}
                onChange={(e) => setExtraFeeLabel(e.target.value)}
                placeholder="تسمية المصاريف"
                className="mt-2 h-8 w-full rounded-[8px] border border-[var(--line)] bg-white px-2 text-[11px] outline-none focus:border-[var(--cyan-600)]"
              />
            </div>

            {/* totals */}
            <motion.div
              key={Math.round(totals.ttc * 100)}
              initial={{ backgroundColor: '#E0F2FE' }}
              animate={{ backgroundColor: 'rgba(224,242,254,0)' }}
              transition={{ duration: 0.6 }}
              className="mt-4 space-y-1.5 rounded-[10px] border-t border-[var(--line)] p-2 pt-3 text-[13px]"
            >
              <div className="flex justify-between text-[var(--ink-700)]">
                <span>الإجمالي HT</span>
                <span className="font-latin text-[15px] font-semibold"><FlipNumber value={totals.itemsHt} /></span>
              </div>
              {totals.quoteDiscount > 0 && (
                <div className="flex justify-between text-[var(--ink-500)]">
                  <span>الخصم</span>
                  <span className="font-latin">-<FlipNumber value={totals.quoteDiscount} /></span>
                </div>
              )}
              {totals.extraFees > 0 && (
                <div className="flex justify-between text-[var(--ink-500)]">
                  <span>المصاريف</span>
                  <span className="font-latin"><FlipNumber value={totals.extraFees} /></span>
                </div>
              )}
              <div className="flex justify-between text-[var(--ink-500)]">
                <span>TVA <span dir="ltr" className="font-latin">{taxRatePct}%</span></span>
                <span className="font-latin"><FlipNumber value={totals.tva} /></span>
              </div>
              <div className="flex items-baseline justify-between pt-1">
                <span className="font-bold text-[var(--ink-900)]">الإجمالي TTC</span>
                <span className="font-latin text-[24px] leading-8 font-semibold text-[var(--cyan-600)]">
                  <FlipNumber value={totals.ttc} />
                </span>
              </div>
              {totals.advance > 0 && (
                <div className="flex justify-between text-[var(--ink-700)]">
                  <span>الباقي للدفع</span>
                  <span className="font-latin text-[15px] font-semibold"><FlipNumber value={totals.balanceDue} /></span>
                </div>
              )}
            </motion.div>

            {/* frozen rules badge */}
            <div className="mt-3 flex items-center gap-2 text-[11px] text-[var(--ink-500)]">
              <VersionBadge version={rulesVersion.version} />
              <span title="سيتم تثبيت نسخة من قواعد الأسعار الحالية داخل هذا العرض — لن تتغير لاحقًا" className="flex items-center gap-1">
                <Lock size={11} />
                تُثبَّت داخل العرض عند الحفظ
              </span>
            </div>

            {/* footer buttons */}
            <div className="mt-4 space-y-2">
              <button
                type="button"
                onClick={() => (items.length > 0 ? setPreviewOpen(true) : undefined)}
                disabled={items.length === 0}
                className="h-10 w-full rounded-[10px] bg-[var(--cyan-600)] text-[14px] font-semibold text-white transition-all hover:bg-[var(--cyan-500)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
              >
                معاينة العرض
              </button>
              <button
                type="button"
                onClick={saveDraft}
                disabled={!clientId}
                className="h-10 w-full rounded-[10px] text-[14px] font-medium text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-200)] hover:text-[var(--ink-700)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                حفظ كمسودة
              </button>
              <button
                type="button"
                onClick={markReady}
                disabled={!clientId || items.length === 0}
                className="flex h-10 w-full items-center justify-center gap-1.5 rounded-[10px] border border-[var(--line-strong)] bg-white text-[14px] font-semibold text-[var(--ink-700)] transition-colors hover:bg-[var(--paper-100)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check size={15} />
                تعليم كجاهز
              </button>
              <button
                type="button"
                onClick={sendCurrent}
                disabled={!clientId || items.length === 0 || hasSendBlocker}
                title={hasSendBlocker ? 'صحّح المونتاج أو فحص الإنتاج قبل الإرسال' : undefined}
                className="flex h-10 w-full items-center justify-center gap-1.5 rounded-[10px] bg-[var(--cyan-600)] text-[14px] font-semibold text-white transition-all hover:bg-[var(--cyan-500)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send size={15} />
                إرسال للعميل
              </button>
            </div>
          </SectionCard>
        </aside>
      </div>

      {/* new client modal */}
      <NewClientModal
        open={clientModal}
        onClose={() => setClientModal(false)}
        onCreated={(c) => {
          setClients(db.clients.list());
          setClientId(c.id);
        }}
      />

      {/* document preview modal */}
      <AnimatePresence>
        {previewOpen && previewDevis && (
          <motion.div
            className="fixed inset-0 z-[90] overflow-y-auto bg-[rgba(21,23,30,0.35)] p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 16 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="mx-auto my-8 w-[640px] max-w-[96vw] rounded-[14px] bg-[var(--paper-100)] p-5 shadow-[var(--shadow-pop)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[15px] font-semibold text-[var(--ink-900)]">معاينة العرض</h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={exportPdf}
                    disabled={pdfBusy}
                    className="flex h-9 items-center gap-1.5 rounded-[8px] bg-[var(--cyan-600)] px-3 text-[13px] font-semibold text-white hover:bg-[var(--cyan-500)] disabled:opacity-50"
                  >
                    <FileDown size={14} />
                    {pdfBusy ? 'جارٍ التجهيز…' : 'تصدير PDF'}
                  </button>
                  <button
                    type="button"
                    aria-label="إغلاق"
                    onClick={() => setPreviewOpen(false)}
                    className="grid h-9 w-9 place-items-center rounded-[8px] text-[var(--ink-400)] hover:bg-[var(--paper-200)] hover:text-[var(--ink-700)]"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              <DevisDocument devis={previewDevis} client={client} project={project} unit={unit} onShowRules={() => setRulesOpen(true)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* item side editor */}
      <AnimatePresence>
        {editingItem && (
          <>
            <motion.div
              className="fixed inset-0 z-[88] bg-[rgba(21,23,30,0.28)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingItemId(null)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.25, ease: EASE }}
              className="fixed inset-y-0 left-0 z-[89] flex w-[440px] max-w-[96vw] flex-col bg-white shadow-[var(--shadow-pop)]"
              role="dialog"
              aria-label="تحرير بند العرض"
            >
              <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
                <div>
                  <div className="text-[15px] font-bold text-[var(--ink-900)]">تحرير البند</div>
                  <div dir="ltr" className="font-latin text-[12px] text-[var(--ink-500)]">{editingItem.serviceName}</div>
                </div>
                <button
                  type="button"
                  aria-label="إغلاق"
                  onClick={() => setEditingItemId(null)}
                  className="grid h-9 w-9 place-items-center rounded-[8px] text-[var(--ink-400)] hover:bg-[var(--paper-100)] hover:text-[var(--ink-700)]"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                <NumberField
                  label="الكمية"
                  value={editingItem.quantity}
                  min={1}
                  presets={QTY_PRESETS}
                  onChange={(q) =>
                    updateExistingItem(editingItem.id, (item) => {
                      const fields = { ...item.fieldValues, quantity: Math.max(1, Math.floor(q)) };
                      return recalcItem(item, fields, Math.max(1, Math.floor(q)));
                    })
                  }
                />
                {editingDimFieldId && editingDims && (
                  <DimensionGroup
                    label="المقاس النهائي"
                    value={editingDims}
                    unit={unit}
                    onUnitChange={setUnit}
                    onChange={(dims) =>
                      updateExistingItem(editingItem.id, (item) => {
                        const fields = { ...item.fieldValues, [editingDimFieldId]: dims };
                        return recalcItem(item, fields, item.quantity);
                      })
                    }
                  />
                )}
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[12px] text-[var(--ink-500)]">
                    خصم البند
                    <input
                      dir="ltr"
                      type="number"
                      min={0}
                      value={editingItem.discount?.value ?? 0}
                      onChange={(e) =>
                        updateExistingItem(editingItem.id, (item) => ({
                          ...item,
                          discount: discountOrUndefined(item.discount?.mode ?? 'amount', Number(e.target.value) || 0, item.discount?.reason),
                        }))
                      }
                      className="font-latin mt-1 h-10 w-full rounded-[8px] border border-[var(--line-strong)] px-2 outline-none"
                    />
                  </label>
                  <label className="text-[12px] text-[var(--ink-500)]">
                    نوع الخصم
                    <select
                      value={editingItem.discount?.mode ?? 'amount'}
                      onChange={(e) =>
                        updateExistingItem(editingItem.id, (item) => ({
                          ...item,
                          discount: discountOrUndefined(e.target.value as 'amount' | 'percent', item.discount?.value ?? 0, item.discount?.reason),
                        }))
                      }
                      className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-2 outline-none"
                    >
                      <option value="amount">دج</option>
                      <option value="percent">%</option>
                    </select>
                  </label>
                </div>
                <NumberField
                  label="سعر الوحدة اليدوي"
                  value={editingItem.unitPrice}
                  min={0}
                  step={0.5}
                  unitSuffix="دج/نسخة"
                  onChange={(price) =>
                    updateExistingItem(editingItem.id, (item) => {
                      const total = round2(price * item.quantity);
                      return {
                        ...item,
                        unitPrice: round2(price),
                        total,
                        pricing: { ...item.pricing, unitPrice: round2(price), total, margin: round2(total - item.pricing.subtotal) },
                      };
                    })
                  }
                />
                <textarea
                  value={editingItem.manualPriceReason ?? ''}
                  onChange={(e) =>
                    updateExistingItem(editingItem.id, (item) => ({ ...item, manualPriceReason: e.target.value }))
                  }
                  placeholder="سبب السعر اليدوي أو الخصم"
                  rows={2}
                  className="w-full rounded-[8px] border border-[var(--line-strong)] px-3 py-2 text-[13px] outline-none focus:border-[var(--cyan-600)]"
                />
                <div className="rounded-[10px] border border-[var(--line)] bg-[var(--paper-50)] p-3">
                  <div className="mb-2 text-[12px] font-semibold text-[var(--ink-800)]">جاهزية البند</div>
                  <div className="space-y-1.5">
                    {(editingItem.preflight ?? []).map((check) => (
                      <div key={check.key} className="flex items-start justify-between gap-2 text-[11px]">
                        <span>{check.label}</span>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 font-semibold',
                            check.status === 'ok' && 'bg-emerald-50 text-emerald-700',
                            check.status === 'warning' && 'bg-amber-50 text-amber-700',
                            check.status === 'error' && 'bg-red-50 text-red-700',
                          )}
                        >
                          {check.status === 'ok' ? 'صالح' : check.status === 'warning' ? 'مراجعة' : 'خطأ'}
                        </span>
                      </div>
                    ))}
                  </div>
                  {editingItem.attachments && editingItem.attachments.length > 0 && (
                    <div className="mt-3 space-y-1 border-t border-[var(--line)] pt-2">
                      {editingItem.attachments.map((att) => (
                        <div key={att.id} className="flex items-center justify-between gap-2 text-[11px] text-[var(--ink-500)]">
                          <span className="truncate" dir="ltr">{att.asset.fileName}</span>
                          <span>{att.kind === 'artwork' ? 'تصميم' : 'tracé'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="border-t border-[var(--line)] p-4">
                <button
                  type="button"
                  onClick={() => setEditingItemId(null)}
                  className="h-10 w-full rounded-[10px] bg-[var(--cyan-600)] text-[14px] font-semibold text-white hover:bg-[var(--cyan-500)]"
                >
                  تم
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <RulesSnapshotModal
        open={rulesOpen}
        rules={previewDevis?.rulesSnapshot ?? rulesVersion.rules}
        version={previewDevis?.rulesVersion ?? rulesVersion.version}
        dateLabel={previewDevis ? formatDateAr(previewDevis.createdAt) : ''}
        onClose={() => setRulesOpen(false)}
      />

      {/* sidebar item removal confirmation */}
      <ConfirmDialog
        open={removeItemId !== null}
        title="إزالة الخدمة من العرض؟"
        message="ستُحذف هذه الخدمة من العرض الحالي ويُعاد حساب الإجمالي."
        confirmLabel="إزالة"
        onConfirm={() => {
          if (removeItemId) removeItem(removeItemId);
          setRemoveItemId(null);
        }}
        onCancel={() => setRemoveItemId(null)}
      />

      {/* negative manual margin — explicit confirmation instead of silent save */}
      <ConfirmDialog
        open={negativeMarginConfirm}
        danger={false}
        title="هامش سالب — متابعة الإضافة؟"
        message={`السعر اليدوي أدنى من تكلفة الإنتاج والهامش سالب (${formatDA(final?.margin ?? 0)}). هل تريد إضافة الخدمة بهذا السعر رغم ذلك؟`}
        confirmLabel="إضافة رغم ذلك"
        onConfirm={() => {
          setNegativeMarginConfirm(false);
          doAddItem();
        }}
        onCancel={() => setNegativeMarginConfirm(false)}
      />
    </motion.div>
  );
}
