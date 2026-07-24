import { useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { Client, Project, ProjectStatus } from '@/lib/types';
import { db, uid } from '@/lib/storage';
import { formatDA } from '@/lib/units';
import StageStepper from '@/components/ds/StageStepper';
import { Btn, Chip, Drawer, FieldLabel, inputCls, Modal } from '@/components/settings/Overlay';
import { logAudit } from '@/components/settings/audit';
import type { CrmMeta as CrmMeta_ } from './crm-meta';
import { cn } from '@/lib/utils';

const LANES: { id: ProjectStatus; label: string; tint: 'cyan' | 'violet' | 'success' }[] = [
  { id: 'active', label: 'نشط', tint: 'cyan' },
  { id: 'paused', label: 'قيد الإنتاج', tint: 'violet' },
  { id: 'done', label: 'مكتمل', tint: 'success' },
];

const PROD_STAGES = ['طباعة', 'قص', 'تشطيب', 'تسليم'];

interface Props {
  projects: Project[];
  clients: Client[];
  meta: CrmMeta_;
  setMeta: (patch: Partial<CrmMeta_>) => void;
  refresh: () => void;
}

/** Tab B — projects kanban board (3 lanes) + project drawer + new project modal. */
export default function ProjectsBoard({ projects, clients, meta, setMeta, refresh }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overLane, setOverLane] = useState<ProjectStatus | null>(null);
  const [selected, setSelected] = useState<Project | null>(null);
  const [modal, setModal] = useState(false);

  const clientOf = (id: string) => clients.find((c) => c.id === id);

  const dropTo = (lane: ProjectStatus) => {
    if (!dragId) return;
    const p = projects.find((x) => x.id === dragId);
    if (p && p.status !== lane) {
      db.projects.update(p.id, { status: lane });
      const label = LANES.find((l) => l.id === lane)?.label ?? lane;
      logAudit('project', `انتقل مشروع «${p.name}» إلى ${label}`, `مشروع: ${p.name}`);
      toast.success(`انتقل المشروع إلى "${label}"`);
      refresh();
    }
    setDragId(null);
    setOverLane(null);
  };

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {LANES.map((lane, li) => {
          const cards = projects.filter((p) => p.status === lane.id);
          return (
            <motion.div
              key={lane.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: li * 0.09 }}
              onDragOver={(e) => {
                e.preventDefault();
                setOverLane(lane.id);
              }}
              onDragLeave={() => setOverLane((l) => (l === lane.id ? null : l))}
              onDrop={() => dropTo(lane.id)}
              className={cn(
                'flex min-h-[300px] flex-col rounded-[14px] bg-[var(--paper-100)] p-3 transition-colors',
                overLane === lane.id && dragId && 'bg-[var(--cyan-100)] ring-2 ring-[var(--cyan-500)] ring-inset',
              )}
            >
              <div className="mb-3 flex items-center gap-2 px-1">
                <h3 className="text-[17px] leading-[26px] font-semibold text-[var(--ink-900)]">{lane.label}</h3>
                <Chip tint={lane.tint}>{cards.length}</Chip>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto">
                {cards.map((p, i) => {
                  const extra = meta.projects[p.id];
                  const client = clientOf(p.clientId);
                  const overdue = extra?.due && p.status !== 'done' && new Date(extra.due) < new Date();
                  return (
                    <motion.div
                      key={p.id}
                      layout="position"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: dragId === p.id ? 1.03 : 1 }}
                      transition={{ duration: 0.3, delay: Math.min(i * 0.07, 0.4), type: 'spring', stiffness: 300, damping: 28 }}
                      draggable
                      onDragStart={() => setDragId(p.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverLane(null);
                      }}
                      onClick={() => setSelected(p)}
                      className={cn(
                        'cursor-pointer rounded-[12px] border border-[var(--line)] bg-white p-3.5 transition-shadow hover:shadow-[var(--shadow-card)]',
                        dragId === p.id && 'shadow-[var(--shadow-pop)]',
                      )}
                    >
                      <div className="truncate text-[14px] font-semibold text-[var(--ink-900)]">{p.name}</div>
                      <div className="mt-0.5 truncate text-[11px] text-[var(--ink-400)]">{client?.name ?? '—'}</div>
                      {(extra?.devisRefs?.length ?? 0) > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {extra!.devisRefs!.map((r) => (
                            <span
                              key={r}
                              dir="ltr"
                              className="font-latin rounded-full bg-[var(--cyan-50)] px-2 py-0.5 text-[10px] font-semibold text-[var(--cyan-600)]"
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--ink-500)]">
                        {extra?.total !== undefined && (
                          <span dir="ltr" className="font-latin tabular-nums">
                            إجمالي {formatDA(extra.total)}
                          </span>
                        )}
                        {extra?.stage && <Chip tint="violet">{extra.stage}</Chip>}
                      </div>
                      {extra?.due && (
                        <div className={cn('mt-2 flex items-center gap-1 text-[11px]', overdue ? 'text-[var(--danger-600)]' : 'text-[var(--ink-400)]')}>
                          <Calendar size={11} />
                          <span dir="ltr" className="font-latin">
                            {extra.due}
                          </span>
                          {overdue && <span className="font-medium">متأخر</span>}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
                {cards.length === 0 && (
                  <div className="rounded-[12px] border border-dashed border-[var(--line-strong)] px-3 py-6 text-center text-[12px] text-[var(--ink-400)]">
                    اسحب مشروعًا هنا
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-4">
        <Btn variant="dashed" onClick={() => setModal(true)}>
          <Plus size={15} /> مشروع جديد
        </Btn>
      </div>

      <ProjectDrawer project={selected} clients={clients} meta={meta} onClose={() => setSelected(null)} refresh={refresh} />
      <NewProjectModal open={modal} onClose={() => setModal(false)} clients={clients} meta={meta} setMeta={setMeta} refresh={refresh} />
    </>
  );
}

// ------------------------------ project drawer -------------------------------

function ProjectDrawer({
  project,
  clients,
  meta,
  onClose,
  refresh,
}: {
  project: Project | null;
  clients: Client[];
  meta: CrmMeta_;
  onClose: () => void;
  refresh: () => void;
}) {
  if (!project) return null;
  const extra = meta.projects[project.id];
  const client = clients.find((c) => c.id === project.clientId);
  const stageIdx = Math.max(0, PROD_STAGES.indexOf(extra?.stage ?? 'طباعة'));
  const linked = db.devis.list().filter((d) => d.projectId === project.id);

  return (
    <Drawer
      open={!!project}
      onClose={onClose}
      title={
        <div>
          <h3 className="text-[17px] leading-[26px] font-semibold text-[var(--ink-900)]">{project.name}</h3>
          <p className="text-[12px] text-[var(--ink-500)]">{client ? `${client.name} — ${client.company ?? ''}` : 'بدون عميل'}</p>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <FieldLabel>الحالة</FieldLabel>
          <div className="flex gap-1.5">
            {LANES.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  db.projects.update(project.id, { status: l.id });
                  logAudit('project', `انتقل مشروع «${project.name}» إلى ${l.label}`, `مشروع: ${project.name}`);
                  toast.success(`انتقل المشروع إلى "${l.label}"`);
                  refresh();
                  onClose();
                }}
                className={cn(
                  'h-9 flex-1 rounded-[8px] border text-[13px] font-medium transition-colors',
                  project.status === l.id
                    ? 'border-[var(--cyan-600)] bg-[var(--cyan-100)] text-[var(--cyan-600)]'
                    : 'border-[var(--line)] bg-white text-[var(--ink-500)] hover:bg-[var(--paper-100)]',
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel>مرحلة الإنتاج</FieldLabel>
          <StageStepper steps={PROD_STAGES} current={project.status === 'done' ? PROD_STAGES.length : stageIdx + (project.status === 'paused' ? 1 : 0)} />
        </div>

        <div>
          <FieldLabel>Devis المرتبطة</FieldLabel>
          <div className="space-y-1.5">
            {linked.map((d) => (
              <div key={d.id} className="flex items-center gap-2 rounded-[10px] border border-[var(--line)] px-3 py-2 text-[12px]">
                <span dir="ltr" className="font-latin font-semibold text-[var(--ink-900)]">
                  {d.number}
                </span>
                <span dir="ltr" className="font-latin ms-auto tabular-nums text-[var(--ink-500)]">
                  {formatDA(d.total)}
                </span>
              </div>
            ))}
            {linked.length === 0 && (extra?.devisRefs ?? []).map((r) => (
              <div key={r} className="flex items-center gap-2 rounded-[10px] border border-[var(--line)] px-3 py-2 text-[12px]">
                <span dir="ltr" className="font-latin font-semibold text-[var(--ink-900)]">
                  {r}
                </span>
                <span className="ms-auto text-[10px] text-[var(--ink-400)]">عرض محفوظ</span>
              </div>
            ))}
            {linked.length === 0 && !(extra?.devisRefs?.length) && (
              <p className="text-[12px] text-[var(--ink-400)]">لا عروض مرتبطة بعد.</p>
            )}
          </div>
        </div>

        {extra?.notes && (
          <div>
            <FieldLabel>ملاحظات</FieldLabel>
            <p className="rounded-[10px] bg-[var(--paper-100)] p-3 text-[13px] leading-5 text-[var(--ink-700)]">{extra.notes}</p>
          </div>
        )}

        {extra?.due && (
          <div className="flex items-center gap-2 text-[13px] text-[var(--ink-500)]">
            <Calendar size={14} />
            التسليم:{' '}
            <span dir="ltr" className="font-latin font-semibold text-[var(--ink-900)]">
              {extra.due}
            </span>
          </div>
        )}
      </div>
    </Drawer>
  );
}

// ----------------------------- new project modal -----------------------------

function NewProjectModal({
  open,
  onClose,
  clients,
  meta,
  setMeta,
  refresh,
}: {
  open: boolean;
  onClose: () => void;
  clients: Client[];
  meta: CrmMeta_;
  setMeta: (patch: Partial<CrmMeta_>) => void;
  refresh: () => void;
}) {
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [due, setDue] = useState('');
  const [stage, setStage] = useState(PROD_STAGES[0]);

  const save = () => {
    if (!name.trim() || !clientId) return;
    const p: Project = { id: uid('pr'), clientId, name: name.trim(), status: 'active', createdAt: new Date().toISOString() };
    db.projects.create(p);
    setMeta({ projects: { ...meta.projects, [p.id]: { due: due || undefined, stage, devisRefs: [] } } });
    logAudit('project', `أنشأ مشروعًا جديدًا «${p.name}»`, `مشروع: ${p.name}`);
    toast.success('أُنشئ المشروع');
    setName('');
    setClientId('');
    setDue('');
    onClose();
    refresh();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="مشروع جديد"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            إلغاء
          </Btn>
          <Btn onClick={save} disabled={!name.trim() || !clientId}>
            إنشاء المشروع
          </Btn>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <FieldLabel required>اسم المشروع</FieldLabel>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="هوية مطعم الزيتونة" />
        </div>
        <div>
          <FieldLabel required>العميل</FieldLabel>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputCls}>
            <option value="">اختر عميلًا…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.company ? `— ${c.company}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>تاريخ التسليم</FieldLabel>
            <input dir="ltr" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={cn(inputCls, 'font-latin')} />
          </div>
          <div>
            <FieldLabel>المرحلة</FieldLabel>
            <select value={stage} onChange={(e) => setStage(e.target.value)} className={inputCls}>
              {PROD_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </Modal>
  );
}

