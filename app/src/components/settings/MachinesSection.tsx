import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Star } from 'lucide-react';
import { toast } from 'sonner';
import type { Machine, MachineKind } from '@/lib/types';
import { db, uid } from '@/lib/storage';
import { formatDimension } from '@/lib/units';
import SectionCard from '@/components/ds/SectionCard';
import NumberField from '@/components/ds/NumberField';
import YesNoToggle from '@/components/ds/YesNoToggle';
import { Btn, Chip, Drawer, FieldLabel, inputCls } from './Overlay';
import { logAudit } from './audit';
import { cn } from '@/lib/utils';

interface Props {
  machines: Machine[];
  refresh: () => void;
}

/** Section 2 — الماكينات (#machines): digital + offset groups with edit drawer. */
export default function MachinesSection({ machines, refresh }: Props) {
  const [editing, setEditing] = useState<Machine | null>(null);
  const [defaultId, setDefaultId] = useState<string>('machine-digital-versant');

  const groups: { kind: MachineKind; title: string; latin: string; img: string }[] = [
    { kind: 'digital', title: 'رقمية', latin: 'Digital', img: '/machine-digital.svg' },
    { kind: 'offset', title: 'أوفست', latin: 'Offset', img: '/machine-offset.svg' },
  ];

  const addMachine = (kind: MachineKind) => {
    const m: Machine = {
      id: uid('machine'),
      name: kind === 'digital' ? 'ماكينة رقمية جديدة' : 'ماكينة أوفست جديدة',
      kind,
      margins: { top: 5, bottom: 5, left: 5, right: 5 },
      priseDePince: kind === 'offset' ? 10 : undefined,
      sheetSizes: [{ id: uid('sheet'), widthMm: 320, heightMm: 450, label: '32×45 cm' }],
      costPerFace: kind === 'digital' ? 12 : 7,
      enabled: true,
    };
    db.machines.create(m);
    logAudit('catalog', `أضاف ماكينة «${m.name}»`, `ماكينة: ${m.name}`);
    toast.success('أُضيفت الماكينة');
    refresh();
    setEditing(m);
  };

  return (
    <SectionCard title="الماكينات والهوامش">
      <div className="space-y-6">
        {groups.map((g) => {
          const list = machines.filter((m) => m.kind === g.kind);
          return (
            <div key={g.kind}>
              <div className="mb-3 flex items-baseline gap-2">
                <h3 className="text-[17px] leading-[26px] font-semibold text-[var(--ink-900)]">{g.title}</h3>
                <span dir="ltr" className="font-latin text-[11px] text-[var(--ink-400)]">
                  {g.latin}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {list.map((m, i) => {
                  const maxSheet = [...m.sheetSizes].sort((a, b) => b.widthMm * b.heightMm - a.widthMm * a.heightMm)[0];
                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: i * 0.07 }}
                      whileHover={{ y: -2 }}
                      className={cn('rounded-[14px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-card)]', !m.enabled && 'opacity-55')}
                    >
                      <div className="mb-3 grid h-24 place-items-center overflow-hidden rounded-[10px] bg-[var(--paper-100)]">
                        <img src={g.img} alt={m.name} className="h-20 w-auto object-contain transition-transform duration-200 hover:-translate-y-0.5" />
                      </div>
                      <div className="flex items-center gap-2">
                        <span dir="ltr" className="font-latin truncate text-[14px] font-semibold text-[var(--ink-900)]">
                          {m.name}
                        </span>
                        <button
                          type="button"
                          aria-label="افتراضية"
                          title="الماكينة الافتراضية"
                          onClick={() => {
                            setDefaultId(m.id);
                            toast.success(`«${m.name}» أصبحت الافتراضية`);
                          }}
                          className={cn('shrink-0 transition-colors', defaultId === m.id ? 'text-[var(--yellow-500)]' : 'text-[var(--line-strong)] hover:text-[var(--yellow-500)]')}
                        >
                          <Star size={16} fill={defaultId === m.id ? 'currentColor' : 'none'} />
                        </button>
                        <Btn variant="ghost" size="sm" className="ms-auto" onClick={() => setEditing(m)}>
                          تعديل
                        </Btn>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {maxSheet && (
                          <Chip>
                            أقصى ورقة <span dir="ltr" className="font-latin">{formatDimension(maxSheet.widthMm, maxSheet.heightMm, 'cm')}</span>
                          </Chip>
                        )}
                        <Chip>
                          هوامش <span dir="ltr" className="font-latin">{`${m.margins.top}/${m.margins.bottom}/${m.margins.right}/${m.margins.left} مم`}</span>
                        </Chip>
                        {m.priseDePince !== undefined && (
                          <Chip tint="warning">
                            Prise de pince <span dir="ltr" className="font-latin">{m.priseDePince}مم</span>
                          </Chip>
                        )}
                        {defaultId === m.id && <Chip tint="cyan">افتراضية</Chip>}
                        {!m.enabled && <Chip tint="danger">موقوفة</Chip>}
                      </div>
                    </motion.div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => addMachine(g.kind)}
                  className="grid min-h-[180px] place-items-center rounded-[14px] border border-dashed border-[var(--line-strong)] text-[13px] font-medium text-[var(--ink-400)] transition-colors hover:border-[var(--cyan-500)] hover:bg-[var(--cyan-50)] hover:text-[var(--cyan-600)]"
                >
                  <span className="flex items-center gap-1.5">
                    <Plus size={15} /> إضافة ماكينة
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <MachineDrawer machine={editing} onClose={() => setEditing(null)} refresh={refresh} />
    </SectionCard>
  );
}

// ------------------------------ edit drawer ----------------------------------

function MachineDrawer({ machine, onClose, refresh }: { machine: Machine | null; onClose: () => void; refresh: () => void }) {
  const [m, setM] = useState<Machine | null>(machine);
  const [linked, setLinked] = useState(true);

  // sync when a different machine opens (keep last during exit animation)
  if (machine && machine.id !== m?.id) setM(machine);

  if (!m) return <Drawer open={false} onClose={onClose}>{null}</Drawer>;

  const patch = (p: Partial<Machine>) => setM({ ...m, ...p });
  const patchMargins = (side: keyof Machine['margins'], v: number) => {
    const margins = linked ? { top: v, bottom: v, left: v, right: v } : { ...m.margins, [side]: v };
    patch({ margins });
  };

  const save = () => {
    db.machines.update(m.id, {
      name: m.name,
      margins: m.margins,
      priseDePince: m.priseDePince,
      costPerFace: m.costPerFace,
      enabled: m.enabled,
    });
    logAudit('catalog', `عدّل هوامش ماكينة «${m.name}»`, `ماكينة: ${m.name}`);
    toast.success('حُفظت إعدادات الماكينة — تُطبَّق تلقائيًا في المونتاج');
    refresh();
    onClose();
  };

  return (
    <Drawer
      open={!!machine}
      onClose={onClose}
      title={
        <div>
          <h3 className="text-[17px] leading-[26px] font-semibold text-[var(--ink-900)]">تعديل الماكينة</h3>
          <p dir="ltr" className="font-latin text-[12px] text-[var(--ink-500)]">
            {m.name}
          </p>
        </div>
      }
      footer={
        <>
          <Btn variant="ghost" onClick={onClose} className="flex-1">
            إلغاء
          </Btn>
          <Btn onClick={save} className="flex-1">
            حفظ
          </Btn>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <FieldLabel>الاسم</FieldLabel>
          <input dir="ltr" value={m.name} onChange={(e) => patch({ name: e.target.value })} className={cn(inputCls, 'font-latin')} />
        </div>

        {m.kind === 'offset' && (
          <div className="rounded-[10px] border border-[var(--cyan-100)] bg-[var(--cyan-50)] px-3 py-2 text-[12px] text-[var(--ink-700)]">
            <span dir="ltr" className="font-latin font-semibold">Prise de pince</span> تُطبَّق دائمًا على الحافة الأكبر للورقة.
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <FieldLabel>الهوامش غير القابلة للطباعة (مم)</FieldLabel>
            <button
              type="button"
              onClick={() => setLinked((v) => !v)}
              className={cn('rounded-full border px-2 py-0.5 text-[10px]', linked ? 'border-[var(--cyan-600)] bg-[var(--cyan-100)] text-[var(--cyan-600)]' : 'border-[var(--line)] text-[var(--ink-400)]')}
            >
              {linked ? 'مرتبطة' : 'مستقلة'}
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(['top', 'bottom', 'right', 'left'] as const).map((side) => (
              <div key={side}>
                <span className="mb-1 block text-center text-[10px] text-[var(--ink-400)]">
                  {{ top: 'أعلى', bottom: 'أسفل', right: 'يمين', left: 'يسار' }[side]}
                </span>
                <input
                  dir="ltr"
                  inputMode="decimal"
                  value={m.margins[side === 'right' ? 'right' : side]}
                  onChange={(e) => patchMargins(side, Number(e.target.value) || 0)}
                  className={cn(inputCls, 'font-latin text-center')}
                />
              </div>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-[var(--ink-400)]">تُطبَّق تلقائيًا في المونتاج وتظهر كمساحة غير قابلة للطباعة.</p>
          {/* live mini sheet diagram */}
          <SheetDiagram margins={m.margins} pince={m.priseDePince} />
        </div>

        {m.kind === 'offset' && (
          <NumberField label="Prise de pince (مم)" value={m.priseDePince ?? 10} onChange={(v) => patch({ priseDePince: v })} unitSuffix="مم" min={0} />
        )}

        <NumberField
          label={m.kind === 'digital' ? 'سعر الوجه الافتراضي (دج)' : 'التكلفة لكل 1000 (دج)'}
          value={m.costPerFace ?? 0}
          onChange={(v) => patch({ costPerFace: v })}
          unitSuffix="دج"
          min={0}
        />

        <YesNoToggle checked={m.enabled} onChange={(v) => patch({ enabled: v })} label="ماكينة نشطة" />
      </div>
    </Drawer>
  );
}

/** Mini SVG sheet with hatched non-printable margins — updates live. */
function SheetDiagram({ margins, pince }: { margins: Machine['margins']; pince?: number }) {
  const W = 200;
  const H = 140;
  const scale = 2; // visual scale of mm
  const mx = Math.min(margins.left * scale, 40);
  const mx2 = Math.min(margins.right * scale, 40);
  const my = Math.min(margins.top * scale, 30);
  const my2 = Math.min(margins.bottom * scale, 30);
  return (
    <svg viewBox={`0 0 ${W} ${H + 10}`} className="mt-3 w-full rounded-[10px] border border-[var(--line)] bg-white" style={{ direction: 'ltr' }} aria-hidden>
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#F4F1EA" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#DB2777" strokeWidth="1" opacity="0.5" />
        </pattern>
      </defs>
      <rect x="10" y="6" width={W - 20} height={H - 12} fill="#fff" stroke="#D4CFC0" rx="4" />
      {/* hatched margin strips */}
      {(
        [
          { x: 10, y: 6, w: W - 20, h: my },
          { x: 10, y: 6 + H - 12 - my2, w: W - 20, h: my2 },
          { x: 10, y: 6 + my, w: mx, h: H - 12 - my - my2 },
          { x: 10 + W - 20 - mx2, y: 6 + my, w: mx2, h: H - 12 - my - my2 },
        ] as const
      ).map((r, i) => (
        <motion.rect
          key={i}
          fill="url(#hatch)"
          animate={{ x: r.x, y: r.y, width: Math.max(r.w, 0), height: Math.max(r.h, 0) }}
          transition={{ duration: 0.25 }}
        />
      ))}
      <motion.rect
        fill="#F0F9FF"
        stroke="#0EA5E9"
        strokeDasharray="4 3"
        rx="3"
        animate={{ x: 10 + mx, y: 6 + my, width: Math.max(W - 20 - mx - mx2, 8), height: Math.max(H - 12 - my - my2, 8) }}
        transition={{ duration: 0.25 }}
      />
      {pince !== undefined && (
        <rect x={10} y={6} width={Math.min(pince * scale, 30)} height={H - 12} fill="#DB2777" opacity="0.18" rx="3" />
      )}
      <text x={W / 2} y={H + 6} textAnchor="middle" fontSize="9" fill="#9AA1AF" fontFamily="Space Grotesk">
        printable area
      </text>
    </svg>
  );
}
