import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDownWideNarrow,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  FileDown,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, EmptyState, SectionCard, StatusPill, VersionBadge } from '@/components/ds';
import type { Column } from '@/components/ds/DataTable';
import ConfirmDialog from '@/components/devis/ConfirmDialog';
import DevisDocument from '@/components/devis/DevisDocument';
import RulesSnapshotModal from '@/components/devis/RulesSnapshotModal';
import { exportDevisPdf, exportDevisPdfCombined } from '@/components/devis/devis-pdf';
import { ensureDemoDevis } from '@/components/devis/demo-data';
import { clientLabel, formatDateAr, servicesSummary } from '@/components/devis/devis-utils';
import { useUnit } from '@/components/layout-context';
import { logAudit } from '@/components/settings/audit';
import { db } from '@/lib/storage';
import type { Client, Devis, DevisStatus, Project } from '@/lib/types';
import { formatDA } from '@/lib/units';
import { cn } from '@/lib/utils';

const EASE = [0.22, 0.68, 0.26, 1] as [number, number, number, number];

const STATUS_CHIPS: { id: DevisStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'draft', label: 'مسودة' },
  { id: 'ready', label: 'جاهز' },
  { id: 'sent', label: 'مرسل' },
  { id: 'accepted', label: 'مقبول' },
  { id: 'rejected', label: 'مرفوض' },
  { id: 'expired', label: 'منتهي' },
  { id: 'production', label: 'إنتاج' },
  { id: 'done', label: 'منفّذ' },
];

const STATUS_TOAST: Record<DevisStatus, string> = {
  draft: 'أُعيد العرض إلى المسودات',
  ready: 'العرض جاهز للإرسال',
  sent: 'تم إرسال العرض للعميل',
  accepted: 'تم تعليم العرض كمقبول',
  rejected: 'تم تعليم العرض كمرفوض',
  expired: 'تم تعليم العرض كمنتهي الصلاحية',
  production: 'تم تحويل العرض إلى الإنتاج',
  done: 'تم تعليم العرض كمنفّذ',
};

const ALL_STATUSES: DevisStatus[] = ['draft', 'ready', 'sent', 'accepted', 'rejected', 'expired', 'production', 'done'];

type SortKey = 'date-desc' | 'date-asc' | 'total-desc';

export default function Quotes() {
  const { unit } = useUnit();
  const [searchParams, setSearchParams] = useSearchParams();

  const [devisList, setDevisList] = useState<Devis[]>(() => ensureDemoDevis());
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statuses, setStatuses] = useState<DevisStatus[]>([]);
  const [clientFilter, setClientFilter] = useState('');
  const [sort, setSort] = useState<SortKey>('date-desc');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [overflowId, setOverflowId] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read clients after any devis mutation
  const clients = useMemo(() => db.clients.list(), [devisList]);

  const refresh = () => setDevisList(db.devis.list());

  // global search deep-link: /devis?quote=<id> opens + highlights that quote
  useEffect(() => {
    const q = searchParams.get('quote');
    if (q && db.devis.get(q)) setSelectedId(q);
  }, [searchParams]);

  const closeDrawer = () => {
    setSelectedId(null);
    if (searchParams.get('quote')) setSearchParams({}, { replace: true });
  };

  // debounced search (250ms)
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statuses, clientFilter, sort]);

  // Esc closes drawer / overflow menu
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDrawer();
        setOverflowId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // outside click closes the row overflow menu
  useEffect(() => {
    if (!overflowId) return;
    const onDoc = () => setOverflowId(null);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [overflowId]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(ALL_STATUSES.map((status) => [status, 0])) as Record<DevisStatus, number>;
    devisList.forEach((d) => {
      c[d.status] += 1;
    });
    return c;
  }, [devisList]);

  const yearTotal = useMemo(() => {
    const y = new Date().getFullYear();
    return devisList.filter((d) => new Date(d.createdAt).getFullYear() === y).reduce((s, d) => s + d.total, 0);
  }, [devisList]);

  const clientOf = (d: Devis): Client | undefined => clients.find((c) => c.id === d.clientId);
  const projectOf = (d: Devis): Project | undefined => (d.projectId ? db.projects.get(d.projectId) : undefined);

  const filtered = useMemo(() => {
    let rows = devisList;
    if (statuses.length > 0) rows = rows.filter((d) => statuses.includes(d.status));
    if (clientFilter) rows = rows.filter((d) => d.clientId === clientFilter);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      rows = rows.filter((d) => {
        const c = clientOf(d);
        return (
          d.number.toLowerCase().includes(q) ||
          (c?.name ?? '').includes(debouncedSearch) ||
          (c?.company ?? '').includes(debouncedSearch) ||
          d.items.some((it) => it.serviceName.toLowerCase().includes(q))
        );
      });
    }
    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (sort === 'total-desc') return b.total - a.total;
      const da = new Date(a.createdAt).getTime();
      const dbt = new Date(b.createdAt).getTime();
      return sort === 'date-asc' ? da - dbt : dbt - da;
    });
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devisList, statuses, clientFilter, debouncedSearch, sort, clients]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);

  const selected = selectedId ? devisList.find((d) => d.id === selectedId) : undefined;

  // ------------------------------- actions -----------------------------------

  const setStatus = (d: Devis, status: DevisStatus) => {
    const updated = db.devis.transitionStatus(d.id, status, { sentVia: status === 'sent' ? 'manual' : undefined });
    if (!updated) {
      toast.error('لا يمكن تغيير الحالة: يوجد بند يحتاج مراجعة قبل الإرسال');
      return;
    }
    refresh();
    logAudit('status', `${STATUS_TOAST[status]} — ${d.number}`, d.number);
    toast.success(STATUS_TOAST[status]);
  };

  const createRevision = (d: Devis) => {
    const revision = db.devis.createRevision(d.id);
    if (!revision) {
      toast.error('تعذر إنشاء مراجعة');
      return;
    }
    refresh();
    logAudit('devis', `أنشأ مراجعة ${revision.number} من ${d.number}`, revision.number);
    toast.success(`تم إنشاء مراجعة ${revision.number}`);
  };

  const duplicate = (d: Devis) => {
    // db.devis.duplicate keeps the ORIGINAL frozen rulesVersion/rulesSnapshot —
    // the copy badge is honest: identical to its source on rules v{n}.
    const copy = db.devis.duplicate(d.id);
    if (!copy) {
      toast.error('تعذّر نسخ العرض');
      return;
    }
    refresh();
    toast.success(`نُسخ العرض ${copy.number} — نسخة مطابقة للأصل على قواعد v${copy.rulesVersion}`);
  };

  const confirmDelete = (ids: string[]) => {
    const drafts = ids.filter((id) => db.devis.get(id)?.status === 'draft');
    if (drafts.length === 0) {
      toast.error('يمكن حذف المسودات فقط');
      return;
    }
    setDeleteIds(drafts);
  };

  const doDelete = () => {
    if (!deleteIds) return;
    deleteIds.forEach((id) => db.devis.remove(id));
    if (selectedId && deleteIds.includes(selectedId)) setSelectedId(null);
    setChecked((prev) => {
      const next = new Set(prev);
      deleteIds.forEach((id) => next.delete(id));
      return next;
    });
    refresh();
    toast.success(deleteIds.length === 1 ? 'حُذفت المسودة' : `حُذفت ${deleteIds.length} مسودات`);
    setDeleteIds(null);
  };

  const exportOne = async (d: Devis) => {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      await exportDevisPdf(d, clientOf(d), projectOf(d));
      logAudit('pdf', `صدّر PDF العميل ${d.number}`, d.number);
      toast.success(`تم تنزيل ${d.number}.pdf`);
    } catch {
      toast.error('تعذّر توليد ملف PDF — حاول مجددًا');
    } finally {
      setPdfBusy(false);
    }
  };

  const exportChecked = async () => {
    const entries = devisList
      .filter((d) => checked.has(d.id))
      .map((d) => ({ devis: d, client: clientOf(d), project: projectOf(d) }));
    if (entries.length === 0 || pdfBusy) return;
    setPdfBusy(true);
    try {
      await exportDevisPdfCombined(entries);
      logAudit('pdf', `صدّر ${entries.length} عروض في PDF مجمّع`);
      toast.success(`تم تصدير ${entries.length} عروض في ملف واحد`);
    } catch {
      toast.error('تعذّر توليد ملف PDF — حاول مجددًا');
    } finally {
      setPdfBusy(false);
    }
  };

  const toggleChecked = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyNumber = (d: Devis) => {
    navigator.clipboard?.writeText(d.number).catch(() => undefined);
    toast.success(`نُسخ الرقم ${d.number}`);
  };

  const resetFilters = () => {
    setSearch('');
    setStatuses([]);
    setClientFilter('');
  };

  // ------------------------------- table -------------------------------------

  const columns: Column<Devis>[] = [
    {
      key: 'select',
      header: '',
      render: (d) => (
        <input
          type="checkbox"
          checked={checked.has(d.id)}
          onChange={() => toggleChecked(d.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`تحديد ${d.number}`}
          className="h-4 w-4 accent-[#0284C7]"
        />
      ),
    },
    {
      key: 'number',
      header: 'الرقم',
      render: (d) => (
        <button
          type="button"
          title="نسخ الرقم"
          onClick={(e) => {
            e.stopPropagation();
            copyNumber(d);
          }}
          className="rounded px-1 font-semibold text-[var(--ink-900)] transition-colors hover:bg-[var(--cyan-100)]"
        >
          <span dir="ltr" className="font-latin">{d.number}</span>
        </button>
      ),
    },
    {
      key: 'client',
      header: 'العميل',
      render: (d) => {
        const c = clientOf(d);
        return (
          <span>
            <span className="block font-medium text-[var(--ink-900)]">{c?.name ?? '—'}</span>
            {c?.company && <span className="block text-[11px] text-[var(--ink-400)]">{c.company}</span>}
          </span>
        );
      },
    },
    {
      key: 'project',
      header: 'المشروع',
      render: (d) => <span className="text-[var(--ink-500)]">{projectOf(d)?.name ?? '—'}</span>,
    },
    {
      key: 'services',
      header: 'الخدمات',
      render: (d) => (
        <span dir="ltr" className="font-latin text-[var(--ink-500)]">
          {servicesSummary(d)}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'الإجمالي TTC',
      numeric: true,
      render: (d) => <span className="font-semibold text-[var(--ink-900)]">{formatDA(d.total)}</span>,
    },
    { key: 'status', header: 'الحالة', render: (d) => <StatusPill key={d.status} status={d.status} /> },
    { key: 'version', header: 'قواعد', render: (d) => <VersionBadge version={d.rulesVersion} /> },
    { key: 'date', header: 'التاريخ', render: (d) => <span className="text-[var(--ink-400)]">{formatDateAr(d.createdAt)}</span> },
  ];

  const rowActions = (d: Devis) => (
    <>
      <button
        type="button"
        title="معاينة"
        onClick={(e) => {
          e.stopPropagation();
          setSelectedId(d.id);
        }}
        className="grid h-7 w-7 place-items-center rounded-[6px] text-[var(--ink-400)] hover:bg-white hover:text-[var(--ink-700)]"
      >
        <Eye size={15} />
      </button>
      <button
        type="button"
        title="PDF"
        onClick={(e) => {
          e.stopPropagation();
          exportOne(d);
        }}
        className="grid h-7 w-7 place-items-center rounded-[6px] text-[var(--ink-400)] hover:bg-white hover:text-[var(--ink-700)]"
      >
        <FileDown size={15} />
      </button>
      <button
        type="button"
        title="نسخ"
        onClick={(e) => {
          e.stopPropagation();
          duplicate(d);
        }}
        className="grid h-7 w-7 place-items-center rounded-[6px] text-[var(--ink-400)] hover:bg-white hover:text-[var(--ink-700)]"
      >
        <Copy size={15} />
      </button>
      <span className="relative">
        <button
          type="button"
          title="المزيد"
          onClick={(e) => {
            e.stopPropagation();
            setOverflowId((o) => (o === d.id ? null : d.id));
          }}
          className="grid h-7 w-7 place-items-center rounded-[6px] text-[var(--ink-400)] hover:bg-white hover:text-[var(--ink-700)]"
        >
          <MoreHorizontal size={15} />
        </button>
        <AnimatePresence>
          {overflowId === d.id && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="absolute end-0 top-8 z-40 w-44 overflow-hidden rounded-[10px] border border-[var(--line)] bg-white shadow-[var(--shadow-pop)]"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {d.status === 'draft' && (
                <Link
                  to={`/devis/${d.id}/edit`}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-[13px] text-[var(--ink-700)] transition-colors hover:bg-[var(--paper-100)]"
                >
                  <Pencil size={14} />
                  تعديل المسودة
                </Link>
              )}
              {d.status !== 'draft' && (
                <button
                  type="button"
                  onClick={() => {
                    setOverflowId(null);
                    createRevision(d);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-[13px] text-[var(--ink-700)] transition-colors hover:bg-[var(--paper-100)]"
                >
                  <Pencil size={14} />
                  إنشاء مراجعة R2
                </button>
              )}
              <button
                type="button"
                disabled={d.status !== 'draft'}
                onClick={() => {
                  setOverflowId(null);
                  confirmDelete([d.id]);
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-[13px] text-[var(--danger-600)] transition-colors hover:bg-[#FEE2E2] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Trash2 size={14} />
                حذف المسودة
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </span>
    </>
  );

  // ------------------------------- drawer actions ----------------------------

  const drawerActions = (d: Devis) => (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => exportOne(d)}
        className="flex h-10 items-center gap-1.5 rounded-[10px] bg-[var(--cyan-600)] px-4 text-[14px] font-semibold text-white transition-all hover:bg-[var(--cyan-500)] active:scale-[0.97]"
      >
        <FileDown size={15} />
        تصدير PDF
      </button>
      {d.status === 'draft' && (
        <Link
          to={`/devis/${d.id}/edit`}
          className="flex h-10 items-center gap-1.5 rounded-[10px] border border-[var(--line-strong)] bg-white px-4 text-[14px] font-medium text-[var(--ink-700)] transition-colors hover:bg-[var(--paper-100)]"
        >
          <Pencil size={15} />
          تعديل
        </Link>
      )}
      {d.status === 'draft' && (
        <button
          type="button"
          onClick={() => setStatus(d, 'ready')}
          className="flex h-10 items-center gap-1.5 rounded-[10px] border border-[var(--line-strong)] bg-white px-4 text-[14px] font-medium text-[var(--ink-700)] transition-colors hover:bg-[var(--paper-100)]"
        >
          <Check size={15} />
          جاهز
        </button>
      )}
      {(d.status === 'draft' || d.status === 'ready') && (
        <button
          type="button"
          onClick={() => setStatus(d, 'sent')}
          className="flex h-10 items-center gap-1.5 rounded-[10px] border border-[var(--line-strong)] bg-white px-4 text-[14px] font-medium text-[var(--ink-700)] transition-colors hover:bg-[var(--paper-100)]"
        >
          <Send size={15} />
          إرسال للعميل
        </button>
      )}
      {d.status === 'sent' && (
        <>
          <button
            type="button"
            onClick={() => setStatus(d, 'accepted')}
            className="flex h-10 items-center gap-1.5 rounded-[10px] border border-[var(--success-600)] bg-white px-4 text-[14px] font-semibold text-[var(--success-600)] transition-colors hover:bg-[#DCFCE7]"
          >
            <Check size={15} />
            تعليم كمقبول
          </button>
          <button
            type="button"
            onClick={() => setStatus(d, 'rejected')}
            className="flex h-10 items-center gap-1.5 rounded-[10px] px-3 text-[14px] font-medium text-[var(--danger-600)] transition-colors hover:bg-[#FEE2E2]"
          >
            <X size={15} />
            مرفوض
          </button>
        </>
      )}
      {d.status === 'accepted' && (
        <button
          type="button"
          onClick={() => setStatus(d, 'production')}
          className="flex h-10 items-center gap-1.5 rounded-[10px] border border-[#7C3AED] bg-white px-4 text-[14px] font-semibold text-[#7C3AED] transition-colors hover:bg-[#EDE9FE]"
        >
          <Check size={15} />
          تحويل للإنتاج
        </button>
      )}
      {d.status === 'production' && (
        <button
          type="button"
          onClick={() => setStatus(d, 'done')}
          className="flex h-10 items-center gap-1.5 rounded-[10px] border border-[#7C3AED] bg-white px-4 text-[14px] font-semibold text-[#7C3AED] transition-colors hover:bg-[#EDE9FE]"
        >
          <Check size={15} />
          تعليم كمنفّذ
        </button>
      )}
      {d.status === 'rejected' && (
        <button
          type="button"
          onClick={() => setStatus(d, 'draft')}
          className="flex h-10 items-center gap-1.5 rounded-[10px] px-3 text-[14px] font-medium text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-200)]"
        >
          <RotateCcw size={15} />
          إرجاع كمسودة
        </button>
      )}
      <button
        type="button"
        onClick={() => duplicate(d)}
        className="flex h-10 items-center gap-1.5 rounded-[10px] px-3 text-[14px] font-medium text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-200)] hover:text-[var(--ink-700)]"
      >
        <Copy size={15} />
        نسخ
      </button>
      {d.status !== 'draft' && (
        <button
          type="button"
          onClick={() => createRevision(d)}
          className="flex h-10 items-center gap-1.5 rounded-[10px] px-3 text-[14px] font-medium text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-200)] hover:text-[var(--ink-700)]"
        >
          <Pencil size={15} />
          مراجعة جديدة
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          exportOne(d);
          toast.info('جهّز ملف PDF ثم اطبعه من عارض الملفات');
        }}
        className="flex h-10 items-center gap-1.5 rounded-[10px] px-3 text-[14px] font-medium text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-200)] hover:text-[var(--ink-700)]"
      >
        <Printer size={15} />
        طباعة
      </button>
      {d.status === 'draft' && (
        <button
          type="button"
          onClick={() => confirmDelete([d.id])}
          className="flex h-10 items-center gap-1.5 rounded-[10px] px-3 text-[14px] font-medium text-[var(--danger-600)] transition-colors hover:bg-[#FEE2E2]"
        >
          <Trash2 size={15} />
          حذف
        </button>
      )}
    </div>
  );

  // ------------------------------- render ------------------------------------

  return (
    <div className="space-y-6">
      {/* Section 1 — header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <h1 className="text-[27px] leading-9 font-bold text-[var(--ink-900)]">عروض الأسعار</h1>
          <p className="mt-1 text-[13px] text-[var(--ink-500)]">
            <span dir="ltr" className="font-latin font-semibold">{devisList.length}</span> عرضًا — إجمالي هذا العام{' '}
            <span dir="ltr" className="font-latin font-semibold">{formatDA(yearTotal)}</span>
          </p>
        </div>
        <Link
          to="/devis/new"
          className="flex h-11 items-center gap-1.5 rounded-[10px] bg-[var(--cyan-600)] px-5 text-[14px] font-semibold text-white transition-all hover:-translate-y-px hover:bg-[var(--cyan-500)] active:translate-y-0 active:scale-[0.97]"
        >
          <Plus size={16} strokeWidth={2.5} />
          Devis جديد
        </Link>
      </motion.div>

      {/* filter bar (sticky under topbar) */}
      <div className="sticky top-[64px] z-30 -mx-2 space-y-3 border-b border-[var(--line)] bg-[var(--surface)]/95 px-2 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-10 w-72 max-w-full items-center gap-2 rounded-[10px] border border-[var(--line-strong)] bg-white px-3 transition-shadow focus-within:border-[var(--cyan-600)] focus-within:shadow-[var(--shadow-focus)]">
            <Search size={15} className="shrink-0 text-[var(--ink-400)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث برقم العرض أو العميل…"
              className="w-full bg-transparent text-[13px] outline-none"
            />
            {search && (
              <button type="button" aria-label="مسح" onClick={() => setSearch('')} className="text-[var(--ink-400)] hover:text-[var(--ink-700)]">
                <X size={14} />
              </button>
            )}
          </div>

          {/* status chips */}
          <div className="flex flex-wrap gap-1.5">
            {STATUS_CHIPS.map((chip, i) => {
              const active = chip.id === 'all' ? statuses.length === 0 : statuses.includes(chip.id);
              const count = chip.id === 'all' ? devisList.length : counts[chip.id];
              return (
                <motion.button
                  key={chip.id}
                  type="button"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.045, duration: 0.28, ease: EASE }}
                  onClick={() => {
                    if (chip.id === 'all') setStatuses([]);
                    else
                      setStatuses((prev) =>
                        prev.includes(chip.id as DevisStatus)
                          ? prev.filter((s) => s !== chip.id)
                          : [...prev, chip.id as DevisStatus],
                      );
                  }}
                  className={cn(
                    'relative rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors',
                    active ? 'text-white' : 'bg-[var(--paper-100)] text-[var(--ink-500)] hover:bg-[var(--paper-200)]',
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId={`status-chip-${chip.id}`}
                      className="absolute inset-0 rounded-full bg-[var(--cyan-600)]"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  )}
                  <span className="relative">
                    {chip.label} <span dir="ltr" className="font-latin tabular-nums">{count}</span>
                  </span>
                </motion.button>
              );
            })}
          </div>

          {/* client filter */}
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="h-10 max-w-44 rounded-[10px] border border-[var(--line-strong)] bg-white px-2.5 text-[13px] text-[var(--ink-700)] outline-none focus:border-[var(--cyan-600)]"
          >
            <option value="">كل العملاء</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {clientLabel(c)}
              </option>
            ))}
          </select>

          {/* sort */}
          <div className="flex overflow-hidden rounded-[10px] border border-[var(--line-strong)]">
            {(
              [
                { id: 'date-desc', label: 'الأحدث' },
                { id: 'date-asc', label: 'الأقدم' },
                { id: 'total-desc', label: 'الأعلى قيمة' },
              ] as { id: SortKey; label: string }[]
            ).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSort(s.id)}
                className={cn(
                  'flex h-10 items-center gap-1 px-3 text-[12px] font-medium transition-colors',
                  sort === s.id ? 'bg-[var(--cyan-600)] text-white' : 'bg-white text-[var(--ink-500)] hover:bg-[var(--paper-100)]',
                )}
              >
                <ArrowDownWideNarrow size={13} />
                {s.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={resetFilters}
            className="flex h-10 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-200)] hover:text-[var(--ink-700)]"
          >
            <RotateCcw size={14} />
            إعادة تعيين
          </button>
        </div>
      </div>

      {/* Section 2 — table */}
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.45, ease: EASE }}>
        <SectionCard
          title="سجل العروض"
          actions={
            <span className="text-[12px] text-[var(--ink-400)]">
              <span dir="ltr" className="font-latin">{filtered.length}</span> نتيجة
            </span>
          }
        >
          {devisList.length === 0 ? (
            <EmptyState
              image="/empty-quotes.svg"
              title="لا توجد عروض بعد"
              helper="أنشئ أول عرض سعر في دقائق — المونتاج الذكي يحسب التكلفة تلقائيًا."
              action={
                <Link
                  to="/devis/new"
                  className="flex h-10 items-center gap-1.5 rounded-[10px] bg-[var(--cyan-600)] px-4 text-[14px] font-semibold text-white hover:bg-[var(--cyan-500)]"
                >
                  <Plus size={16} />
                  أنشئ أول Devis
                </Link>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              image="/empty-quotes.svg"
              title="لا نتائج مطابقة"
              helper="جرّب تعديل البحث أو الفلاتر."
              action={
                <button
                  type="button"
                  onClick={resetFilters}
                  className="flex h-10 items-center gap-1.5 rounded-[10px] border border-[var(--line-strong)] bg-white px-4 text-[14px] font-medium text-[var(--ink-700)] hover:bg-[var(--paper-100)]"
                >
                  <RotateCcw size={15} />
                  إعادة تعيين الفلاتر
                </button>
              }
            />
          ) : (
            <>
              <DataTable
                columns={columns}
                rows={pageRows}
                rowKey={(d) => d.id}
                onRowClick={(d) => setSelectedId(d.id)}
                rowActions={rowActions}
              />
              {/* pagination footer */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12px] text-[var(--ink-500)]">
                <span>
                  عرض <span dir="ltr" className="font-latin">{(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)}</span> من{' '}
                  <span dir="ltr" className="font-latin">{filtered.length}</span>
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={perPage}
                    onChange={(e) => {
                      setPerPage(Number(e.target.value));
                      setPage(1);
                    }}
                    className="h-8 rounded-[8px] border border-[var(--line-strong)] bg-white px-2 text-[12px] outline-none"
                    aria-label="عدد الصفوف"
                  >
                    {[10, 20, 50].map((n) => (
                      <option key={n} value={n}>
                        {n} / صفحة
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1" dir="ltr">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                      aria-label="السابق"
                      className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-100)] disabled:opacity-40"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <span className="font-latin px-2 tabular-nums">
                      {page} / {pageCount}
                    </span>
                    <button
                      type="button"
                      disabled={page >= pageCount}
                      onClick={() => setPage((p) => p + 1)}
                      aria-label="التالي"
                      className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-100)] disabled:opacity-40"
                    >
                      <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </SectionCard>
      </motion.div>

      {/* Section 4 — floating bulk bar */}
      <AnimatePresence>
        {checked.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4"
          >
            <div className="flex items-center gap-2 rounded-[14px] border border-[var(--line)] bg-white px-4 py-2.5 shadow-[var(--shadow-pop)]">
              <span className="text-[13px] font-medium text-[var(--ink-900)]">
                <span dir="ltr" className="font-latin">{checked.size}</span> محدَّد
              </span>
              <span className="h-5 w-px bg-[var(--line)]" />
              <button
                type="button"
                onClick={exportChecked}
                disabled={pdfBusy}
                className="flex h-9 items-center gap-1.5 rounded-[8px] border border-[var(--line-strong)] px-3 text-[13px] font-medium text-[var(--ink-700)] transition-colors hover:bg-[var(--paper-100)] disabled:opacity-50"
              >
                <FileText size={14} />
                {pdfBusy ? 'جارٍ التجهيز…' : 'تصدير PDF مجمّع'}
              </button>
              <button
                type="button"
                onClick={() => confirmDelete([...checked])}
                className="flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium text-[var(--danger-600)] transition-colors hover:bg-[#FEE2E2]"
              >
                <Trash2 size={14} />
                حذف المسودات
              </button>
              <button
                type="button"
                onClick={() => setChecked(new Set(pageRows.map((d) => d.id)))}
                className="flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-100)]"
              >
                تحديد الصفحة
              </button>
              <button
                type="button"
                onClick={() => setChecked(new Set())}
                aria-label="إلغاء التحديد"
                className="grid h-9 w-9 place-items-center rounded-[8px] text-[var(--ink-400)] transition-colors hover:bg-[var(--paper-100)]"
              >
                <X size={15} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Section 3 — detail drawer (from the left / end side) */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[70] bg-[rgba(21,23,30,0.3)]"
              onClick={closeDrawer}
            />
            <motion.aside
              key="drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%', transition: { duration: 0.25 } }}
              transition={{ duration: 0.3, ease: EASE }}
              className="fixed inset-y-0 left-0 z-[80] flex w-[560px] max-w-[96vw] flex-col bg-[var(--paper-100)] shadow-[var(--shadow-pop)]"
              role="dialog"
              aria-label={`تفاصيل العرض ${selected.number}`}
            >
              {/* drawer header */}
              <div className="flex items-center justify-between border-b border-[var(--line)] bg-white px-5 py-3">
                <div className="flex items-center gap-2">
                  <span dir="ltr" className="font-latin text-[15px] font-bold text-[var(--ink-900)]">{selected.number}</span>
                  <StatusPill key={selected.status} status={selected.status} />
                </div>
                <button
                  type="button"
                  aria-label="إغلاق"
                  onClick={closeDrawer}
                  className="grid h-9 w-9 place-items-center rounded-[8px] text-[var(--ink-400)] transition-colors hover:bg-[var(--paper-100)] hover:text-[var(--ink-700)]"
                >
                  <X size={17} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                {/* actions row */}
                <div className="mb-4">{drawerActions(selected)}</div>
                {/* paper document */}
                <motion.div animate={{ scale: [1, 1.03, 1] }} transition={{ duration: 0.4 }} key={`${selected.id}-${selected.status}`}>
                  <DevisDocument
                    devis={selected}
                    client={clientOf(selected)}
                    project={projectOf(selected)}
                    unit={unit}
                    onShowRules={() => setRulesOpen(true)}
                  />
                </motion.div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* frozen rules snapshot modal */}
      <RulesSnapshotModal
        open={rulesOpen}
        rules={selected?.rulesSnapshot ?? []}
        version={selected?.rulesVersion ?? 0}
        dateLabel={selected ? formatDateAr(selected.createdAt) : ''}
        onClose={() => setRulesOpen(false)}
      />

      {/* delete confirmation */}
      <ConfirmDialog
        open={deleteIds !== null}
        title={deleteIds && deleteIds.length > 1 ? `حذف ${deleteIds.length} مسودات؟` : 'حذف المسودة؟'}
        message="سيتم حذف المسودة نهائيًا ولا يمكن التراجع. العروض المرسلة أو المقبولة لا تُحذف."
        confirmLabel="حذف نهائي"
        onConfirm={doDelete}
        onCancel={() => setDeleteIds(null)}
      />

      {/* quick new-devis access for empty short screens */}
      {devisList.length > 0 && filtered.length > 0 && pageRows.length === 0 && (
        <div className="text-center">
          <button type="button" onClick={() => setPage(1)} className="text-[13px] font-medium text-[var(--cyan-600)] hover:underline">
            العودة إلى الصفحة الأولى
          </button>
        </div>
      )}
    </div>
  );
}
