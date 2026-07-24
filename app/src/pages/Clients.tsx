import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { Archive, Download, FilePlus2, Pencil, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { Client, Project } from '@/lib/types';
import { db } from '@/lib/storage';
import { formatDA } from '@/lib/units';
import DataTable, { type Column } from '@/components/ds/DataTable';
import EmptyState from '@/components/ds/EmptyState';
import { Btn, Chip, inputCls } from '@/components/settings/Overlay';
import ClientDrawer from '@/components/clients/ClientDrawer';
import ClientModal from '@/components/clients/ClientModal';
import ProjectsBoard from '@/components/clients/ProjectsBoard';
import { avatarColor, clientCity, initials, seedCrmDemo, useCrmMeta } from '@/components/clients/crm-meta';
import { cn } from '@/lib/utils';

type SortId = 'recent' | 'active' | 'alpha';

const EASE = [0.22, 0.68, 0.26, 1] as [number, number, number, number];

/** العملاء والمشاريع — lightweight CRM: clients table + projects kanban. */
export default function Clients() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>(() => {
    seedCrmDemo();
    return db.clients.list();
  });
  const [projects, setProjects] = useState<Project[]>(() => db.projects.list());
  const [meta, setMeta] = useCrmMeta();
  const [tab, setTab] = useState<'clients' | 'projects'>('clients');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortId>('recent');
  const [selected, setSelected] = useState<Client | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // deep-link from the command palette: /clients?client=<id> opens the drawer
  useEffect(() => {
    const id = searchParams.get('client');
    if (!id) return;
    const found = db.clients.get(id);
    if (found) setSelected(found);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const refresh = () => {
    setClients(db.clients.list());
    setProjects(db.projects.list());
  };

  /** archive with undo — the row is kept and restored if the user cancels. */
  const archiveClient = (c: Client) => {
    db.clients.remove(c.id);
    refresh();
    toast(`أُرشف العميل «${c.name}»`, {
      action: {
        label: 'تراجع',
        onClick: () => {
          db.clients.create(c);
          refresh();
          toast.success('تمت استعادة العميل');
        },
      },
    });
  };

  const filtered = useMemo(() => {
    const q = query.trim();
    let rows = clients.filter(
      (c) => !q || c.name.includes(q) || (c.company ?? '').toLowerCase().includes(q.toLowerCase()) || (c.phone ?? '').includes(q),
    );
    rows = [...rows].sort((a, b) => {
      if (sort === 'alpha') return a.name.localeCompare(b.name, 'ar');
      if (sort === 'active') return (meta.stats[b.id]?.devis ?? 0) - (meta.stats[a.id]?.devis ?? 0);
      return b.createdAt.localeCompare(a.createdAt);
    });
    return rows;
  }, [clients, query, sort, meta.stats]);

  const activeProjects = projects.filter((p) => p.status !== 'done').length;

  const exportCsv = () => {
    const header = 'name,company,phone,email,address';
    const lines = clients.map((c) => [c.name, c.company ?? '', c.phone ?? '', c.email ?? '', c.address ?? ''].map((v) => `"${v.replaceAll('"', '""')}"`).join(','));
    const blob = new Blob(['﻿' + [header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'clients.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('صُدّر ملف clients.csv');
  };

  const columns = useMemo<Column<Client>[]>(
    () => [
      {
        key: 'client',
        header: 'العميل',
        render: (c) => {
          const { bg, fg } = avatarColor(c.name);
          return (
            <span className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold" style={{ backgroundColor: bg, color: fg }}>
                {initials(c.name)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-[var(--ink-900)]">{c.name}</span>
                <span className="block truncate text-[10px] text-[var(--ink-400)]">{c.company ?? '—'}</span>
              </span>
            </span>
          );
        },
      },
      { key: 'phone', header: 'الهاتف', render: (c) => <span dir="ltr" className="font-latin text-[12px] text-[var(--ink-500)]">{c.phone ?? '—'}</span> },
      { key: 'email', header: 'البريد', render: (c) => <span dir="ltr" className="font-latin text-[12px] text-[var(--ink-500)]">{c.email ?? '—'}</span> },
      { key: 'city', header: 'المدينة', render: (c) => clientCity(c) },
      {
        key: 'devis',
        header: 'عروض',
        render: (c) => {
          const real = db.devis.list().filter((d) => d.clientId === c.id).length;
          const n = meta.stats[c.id]?.devis ?? real;
          return <Chip tint="cyan">{n}</Chip>;
        },
      },
      { key: 'total', header: 'إجمالي التعامل', numeric: true, render: (c) => formatDA(meta.stats[c.id]?.total ?? 0) },
      { key: 'last', header: 'آخر نشاط', render: (c) => <span className="text-[var(--ink-400)]">{meta.stats[c.id]?.lastActivity ?? '—'}</span> },
    ],
    [meta.stats],
  );

  return (
    <div className="space-y-6">
      {/* header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }} className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[27px] leading-9 font-bold text-[var(--ink-900)]">العملاء والمشاريع</h1>
          <p className="mt-1 text-[13px] text-[var(--ink-500)]">
            {clients.length} عميلًا — {activeProjects} مشروعًا نشطًا
          </p>
        </div>
        <div className="flex gap-2">
          <Btn
            variant="secondary"
            onClick={() => {
              setTab('projects');
              toast.info('أنشئ المشروع من زر «＋ مشروع جديد» أسفل اللوحة');
            }}
          >
            <Plus size={15} /> مشروع جديد
          </Btn>
          <Btn
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
          >
            <Plus size={15} /> عميل جديد
          </Btn>
        </div>
      </motion.div>

      {/* tabs */}
      <div className="flex gap-1 border-b border-[var(--line)]">
        {(
          [
            { id: 'clients', label: 'العملاء' },
            { id: 'projects', label: 'المشاريع' },
          ] as const
        ).map((t, i) => (
          <motion.button
            key={t.id}
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => setTab(t.id)}
            className={cn(
              'relative px-4 py-2.5 text-[14px] transition-colors',
              tab === t.id ? 'font-semibold text-[var(--cyan-600)]' : 'text-[var(--ink-500)] hover:text-[var(--ink-700)]',
            )}
          >
            {t.label}
            {tab === t.id && (
              <motion.span
                layoutId="clients-tab-underline"
                className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-[var(--cyan-600)]"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
          </motion.button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'clients' ? (
          <motion.div key="clients" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="space-y-4">
            {/* filter bar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-72">
                <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--ink-400)]" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو الهاتف…" className={cn(inputCls, 'ps-9')} />
              </div>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortId)} className={cn(inputCls, 'w-40')}>
                <option value="recent">الأحدث</option>
                <option value="active">الأكثر تعاملًا</option>
                <option value="alpha">أبجدي</option>
              </select>
              <Btn variant="ghost" size="md" onClick={exportCsv}>
                <Download size={15} /> تصدير CSV
              </Btn>
            </div>

            {/* table */}
            <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="rounded-[14px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-card)]">
              <DataTable
                columns={columns}
                rows={filtered}
                rowKey={(c) => c.id}
                onRowClick={setSelected}
                rowActions={(c) => (
                  <>
                    <button
                      type="button"
                      aria-label="Devis جديد"
                      title="Devis جديد"
                      onClick={(e) => {
                        e.stopPropagation();
                        toast.success(`تم اختيار العميل: ${c.name}`);
                        navigate(`/devis/new?client=${c.id}`);
                      }}
                      className="grid h-8 w-8 place-items-center rounded-[8px] text-[var(--ink-400)] hover:bg-white hover:text-[var(--cyan-600)]"
                    >
                      <FilePlus2 size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label="تعديل"
                      title="تعديل"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(c);
                        setModalOpen(true);
                      }}
                      className="grid h-8 w-8 place-items-center rounded-[8px] text-[var(--ink-400)] hover:bg-white hover:text-[var(--ink-700)]"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label="أرشفة"
                      title="أرشفة"
                      onClick={(e) => {
                        e.stopPropagation();
                        archiveClient(c);
                      }}
                      className="grid h-8 w-8 place-items-center rounded-[8px] text-[var(--ink-400)] hover:bg-white hover:text-[var(--danger-600)]"
                    >
                      <Archive size={15} />
                    </button>
                  </>
                )}
                empty={
                  <EmptyState
                    image="/empty-clients.svg"
                    title={query ? 'لا نتائج مطابقة' : 'لا عملاء بعد'}
                    helper={query ? 'جرّب اسمًا أو رقم هاتف آخر.' : 'أضف أول عميل ليظهر هنا — سيغذّي قائمة العملاء في معالج Devis تلقائيًا.'}
                    action={
                      <Btn
                        onClick={() => {
                          setEditing(null);
                          setModalOpen(true);
                        }}
                      >
                        <Plus size={15} /> أضف أول عميل
                      </Btn>
                    }
                  />
                }
              />
            </motion.div>
          </motion.div>
        ) : (
          <motion.div key="projects" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <ProjectsBoard projects={projects} clients={clients} meta={meta} setMeta={setMeta} refresh={refresh} />
          </motion.div>
        )}
      </AnimatePresence>

      <ClientDrawer
        client={selected}
        stats={selected ? meta.stats[selected.id] : undefined}
        onClose={() => setSelected(null)}
        onEdit={(c) => {
          setEditing(c);
          setModalOpen(true);
        }}
      />
      <ClientModal open={modalOpen} onClose={() => setModalOpen(false)} client={editing} onSaved={refresh} />
    </div>
  );
}
