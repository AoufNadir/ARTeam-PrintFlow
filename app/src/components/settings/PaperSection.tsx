import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { MachineKind, PaperType, PaperVariant } from '@/lib/types';
import { db, uid } from '@/lib/storage';
import { formatDA, parseDecimal } from '@/lib/units';
import SectionCard from '@/components/ds/SectionCard';
import { Btn, Chip, FieldLabel, inputCls, Modal } from './Overlay';
import { logAudit } from './audit';
import { cn } from '@/lib/utils';

interface Props {
  papers: PaperType[];
  refresh: () => void;
}


function kindOf(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('couché')) return 'Couché';
  if (n.includes('offset')) return 'Offset';
  if (n.includes('création')) return 'Création';
  if (n.includes('adhésif') || n.includes('vinyle')) return 'Adhésif';
  if (n.includes('bâche') || n.includes('bache')) return 'Vinyle';
  if (n.includes('carton')) return 'Carton';
  return 'Couché';
}

const AGE: Record<string, { label: string; stale: boolean }> = {
  'paper-couche-350': { label: 'منذ 90 يوم', stale: true },
  'paper-couche-300': { label: 'منذ 40 يوم', stale: false },
  'paper-couche-170': { label: 'منذ 20 يوم', stale: false },
  'paper-couche-135': { label: 'منذ 12 يوم', stale: false },
  'paper-offset-80': { label: 'منذ 30 يوم', stale: false },
  'paper-bache-510': { label: 'منذ 7 أيام', stale: false },
};

/** Section 3 — الورق والمواد (#paper). */
export default function PaperSection({ papers, refresh }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState('');
  const [flashId, setFlashId] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [editingPaper, setEditingPaper] = useState<PaperType | null>(null);
  const [fresh, setFresh] = useState<Record<string, string>>({});

  const rows = useMemo(() => papers, [papers]);

  const savePrice = (p: PaperType) => {
    const v = parseDecimal(priceDraft);
    if (Number.isNaN(v) || v <= 0) {
      setEditingId(null);
      return;
    }
    db.papers.update(p.id, { pricePerSheet: v });
    setFresh((f) => ({ ...f, [p.id]: 'اليوم' }));
    logAudit('rule', `سعر ${p.name}: ${p.pricePerSheet}→${v} دج — يُطبَّق على العروض الجديدة فقط`, `ورق: ${p.name}`);
    setEditingId(null);
    setFlashId(p.id);
    setTimeout(() => setFlashId(null), 800);
    toast.success('حُفظ السعر — يُطبَّق على العروض الجديدة فقط، والعروض السابقة ثابتة على لقطتها');
    refresh();
  };

  return (
    <SectionCard
      title="الورق والمواد"
      actions={
        <Btn variant="secondary" size="sm" onClick={() => setModal(true)}>
          <Plus size={14} /> ورق جديد
        </Btn>
      }
    >
      <div className="overflow-hidden rounded-[12px] border border-[var(--line)]">
        <table className="w-full text-[13px]">
          <thead className="bg-[var(--paper-100)]">
            <tr>
              {['الاسم', 'النوع', 'الأساس', 'السعر', 'المخزون', 'آخر تحديث', ''].map((h) => (
                <th key={h} className="px-3 py-2.5 text-start text-[11px] font-medium tracking-[0.04em] text-[var(--ink-400)]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {rows.map((p, i) => {
                const age = fresh[p.id] ? { label: fresh[p.id], stale: false } : (AGE[p.id] ?? { label: 'اليوم', stale: false });
                return (
                  <motion.tr
                    key={p.id}
                    layout="position"
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: p.enabled ? 1 : 0.55, x: 0, backgroundColor: flashId === p.id ? '#E0F2FE' : '#FFFFFF' }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(i * 0.045, 0.3) }}
                    className="border-t border-[var(--line)]"
                  >
                    <td className="px-3 py-2.5">
                      <span dir="ltr" className="font-latin font-semibold text-[var(--ink-900)]">
                        {p.name}
                      </span>
                      <span dir="ltr" className="font-latin ms-2 text-[10px] text-[var(--ink-400)]">
                        {p.gsm}g
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Chip>{kindOf(p.name)}</Chip>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--ink-500)]">{p.name.includes('m²') ? 'لكل م²' : 'لكل ورقة'}</td>
                    <td className="px-3 py-2.5">
                      {editingId === p.id ? (
                        <span className="flex items-center gap-1">
                          <input
                            autoFocus
                            dir="ltr"
                            value={priceDraft}
                            onChange={(e) => setPriceDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') savePrice(p);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="font-latin h-8 w-20 rounded-[6px] border border-[var(--cyan-600)] px-2 text-[13px] outline-none"
                          />
                          <button type="button" onClick={() => savePrice(p)} aria-label="حفظ" className="grid h-7 w-7 place-items-center rounded-[6px] bg-[var(--cyan-600)] text-white">
                            <Check size={13} />
                          </button>
                          <button type="button" onClick={() => setEditingId(null)} aria-label="إلغاء" className="grid h-7 w-7 place-items-center rounded-[6px] text-[var(--ink-400)] hover:bg-[var(--paper-100)]">
                            <X size={13} />
                          </button>
                        </span>
                      ) : (
                        <span dir="ltr" className="font-latin font-semibold tabular-nums text-[var(--ink-900)]" title="يُطبَّق على العروض الجديدة فقط — العروض السابقة ثابتة على لقطتها">
                          {formatDA(p.pricePerSheet)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={p.enabled}
                          onClick={() => {
                            db.papers.update(p.id, { enabled: !p.enabled });
                            if (p.enabled) toast.warning(`نفد مخزون «${p.name}»`);
                            refresh();
                          }}
                          className={cn('relative h-5 w-9 rounded-full transition-colors', p.enabled ? 'bg-[var(--cyan-600)]' : 'bg-[var(--line-strong)]')}
                        >
                          <motion.span
                            layout
                            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                            className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow', p.enabled ? 'end-[18px]' : 'end-0.5')}
                          />
                        </button>
                        {!p.enabled && (
                          <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                            <Chip tint="danger">نفد</Chip>
                          </motion.span>
                        )}
                      </span>
                    </td>
                    <td className={cn('px-3 py-2.5', age.stale ? 'font-medium text-[var(--warning-600)]' : 'text-[var(--ink-400)]')}>{age.label}</td>
                    <td className="px-3 py-2.5 text-end">
                      <button
                        type="button"
                        aria-label="تعديل السعر"
                        onClick={() => {
                          setEditingPaper(p);
                        }}
                        className="grid h-7 w-7 place-items-center rounded-[6px] text-[var(--ink-400)] transition-colors hover:bg-[var(--paper-100)] hover:text-[var(--cyan-600)]"
                      >
                        <Pencil size={13} />
                      </button>
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      <NewPaperModal
        open={modal}
        onClose={() => setModal(false)}
        onCreated={() => {
          refresh();
          setModal(false);
        }}
      />
      <PaperVariantsModal
        key={editingPaper?.id ?? 'closed'}
        paper={editingPaper}
        onClose={() => setEditingPaper(null)}
        onSaved={() => {
          refresh();
          setEditingPaper(null);
        }}
      />
    </SectionCard>
  );
}

function NewPaperModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [gsm, setGsm] = useState('300');
  const [price, setPrice] = useState('');
  const [width, setWidth] = useState('320');
  const [height, setHeight] = useState('450');
  const [sizeLabel, setSizeLabel] = useState('32×45 cm');

  const save = () => {
    const g = Number(gsm) || 0;
    const v = parseDecimal(price);
    if (!name.trim() || Number.isNaN(v)) return;
    const paperId = uid('paper');
    db.papers.create({
      id: paperId,
      name: name.trim(),
      gsm: g,
      pricePerSheet: v,
      variants: [{ id: uid('paper-size'), label: sizeLabel.trim() || `${width}×${height} mm`, widthMm: Number(width) || 0, heightMm: Number(height) || 0, pricePerSheet: v, enabled: true }],
      allowedMachineKinds: ['digital', 'offset'],
      enabled: true,
    });
    logAudit('catalog', `أضاف ورقًا جديدًا «${name.trim()}»`, `ورق: ${name.trim()}`);
    toast.success('أُضيف الورق إلى الكتالوج');
    setName('');
    setPrice('');
    onCreated();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="ورق جديد"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>
            إلغاء
          </Btn>
          <Btn onClick={save} disabled={!name.trim() || !price.trim()}>
            إضافة
          </Btn>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <FieldLabel required>الاسم (فرنسي)</FieldLabel>
          <input dir="ltr" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Papier Couché 350g" className={cn(inputCls, 'font-latin')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>الغراماج</FieldLabel>
            <input dir="ltr" inputMode="numeric" value={gsm} onChange={(e) => setGsm(e.target.value)} className={cn(inputCls, 'font-latin')} />
          </div>
          <div>
            <FieldLabel required>السعر (دج)</FieldLabel>
            <input dir="ltr" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="40" className={cn(inputCls, 'font-latin')} />
          </div>
        </div>
        <div className="rounded-[10px] border border-[var(--line)] bg-[var(--paper-50)] p-3">
          <FieldLabel>أول مقاس للورق</FieldLabel>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <input value={sizeLabel} onChange={(event) => setSizeLabel(event.target.value)} placeholder="32×45 cm" className={inputCls} />
            <input dir="ltr" type="number" min={1} value={width} onChange={(event) => setWidth(event.target.value)} placeholder="العرض mm" className={cn(inputCls, 'font-latin')} />
            <input dir="ltr" type="number" min={1} value={height} onChange={(event) => setHeight(event.target.value)} placeholder="الارتفاع mm" className={cn(inputCls, 'font-latin')} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

function PaperVariantsModal({ paper, onClose, onSaved }: { paper: PaperType | null; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<PaperType | null>(paper);
  if (paper && paper.id !== draft?.id) setDraft(structuredClone(paper));
  if (!draft) return <Modal open={false} onClose={onClose} title="مقاسات الورق">{null}</Modal>;
  const variants = draft.variants?.length
    ? draft.variants
    : [{ id: uid('paper-size'), label: 'كل المقاسات', widthMm: 0, heightMm: 0, pricePerSheet: draft.pricePerSheet, enabled: true }];
  const patchVariants = (next: PaperVariant[]) => setDraft({ ...draft, variants: next, pricePerSheet: next[0]?.pricePerSheet ?? draft.pricePerSheet });
  const toggleKind = (kind: MachineKind) => {
    const current = draft.allowedMachineKinds ?? ['digital', 'offset'];
    const next = current.includes(kind) ? current.filter((value) => value !== kind) : [...current, kind];
    setDraft({ ...draft, allowedMachineKinds: next });
  };
  const save = () => {
    db.papers.update(draft.id, {
      name: draft.name,
      gsm: draft.gsm,
      variants,
      pricePerSheet: variants[0]?.pricePerSheet ?? draft.pricePerSheet,
      allowedMachineKinds: draft.allowedMachineKinds,
      enabled: draft.enabled,
    });
    logAudit('catalog', `عدّل مقاسات وأسعار «${draft.name}»`, `ورق: ${draft.name}`);
    toast.success('حُفظت مقاسات وأسعار الورق');
    onSaved();
  };
  return (
    <Modal
      open={Boolean(paper)}
      onClose={onClose}
      title="مقاسات وأسعار الورق"
      size="lg"
      footer={<><Btn variant="ghost" onClick={onClose}>إلغاء</Btn><Btn onClick={save}>حفظ</Btn></>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label><FieldLabel>اسم الورق</FieldLabel><input dir="ltr" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={cn(inputCls, 'font-latin')} /></label>
          <label><FieldLabel>الغراماج</FieldLabel><input dir="ltr" type="number" value={draft.gsm} onChange={(event) => setDraft({ ...draft, gsm: Number(event.target.value) || 0 })} className={cn(inputCls, 'font-latin')} /></label>
        </div>
        <div>
          <FieldLabel>متوافق مع</FieldLabel>
          <div className="mt-2 flex gap-2">
            {([['digital', 'رقمية'], ['offset', 'أوفست']] as const).map(([kind, label]) => <button key={kind} type="button" onClick={() => toggleKind(kind)} className={cn('rounded-[8px] border px-3 py-2 text-[12px]', (draft.allowedMachineKinds ?? ['digital', 'offset']).includes(kind) ? 'border-[var(--cyan-600)] bg-[var(--cyan-50)] text-[var(--cyan-600)]' : 'border-[var(--line)] text-[var(--ink-500)]')}>{label}</button>)}
          </div>
        </div>
        <div className="space-y-2">
          {variants.map((variant) => (
            <div key={variant.id} className="grid grid-cols-[minmax(0,1fr)_100px_100px_110px_34px] items-end gap-2 max-md:grid-cols-2">
              <label className="text-[11px] text-[var(--ink-500)]">اسم المقاس<input value={variant.label} onChange={(event) => patchVariants(variants.map((row) => row.id === variant.id ? { ...row, label: event.target.value } : row))} className={cn(inputCls, 'mt-1')} /></label>
              <label className="text-[11px] text-[var(--ink-500)]">العرض mm<input dir="ltr" type="number" min={0} value={variant.widthMm} onChange={(event) => patchVariants(variants.map((row) => row.id === variant.id ? { ...row, widthMm: Number(event.target.value) || 0 } : row))} className={cn(inputCls, 'font-latin mt-1')} /></label>
              <label className="text-[11px] text-[var(--ink-500)]">الارتفاع mm<input dir="ltr" type="number" min={0} value={variant.heightMm} onChange={(event) => patchVariants(variants.map((row) => row.id === variant.id ? { ...row, heightMm: Number(event.target.value) || 0 } : row))} className={cn(inputCls, 'font-latin mt-1')} /></label>
              <label className="text-[11px] text-[var(--ink-500)]">دج/ورقة<input dir="ltr" type="number" min={0} step="0.01" value={variant.pricePerSheet} onChange={(event) => patchVariants(variants.map((row) => row.id === variant.id ? { ...row, pricePerSheet: Number(event.target.value) || 0 } : row))} className={cn(inputCls, 'font-latin mt-1')} /></label>
              <button type="button" aria-label="حذف" disabled={variants.length === 1} onClick={() => patchVariants(variants.filter((row) => row.id !== variant.id))} className="mb-1 grid h-9 place-items-center rounded-[8px] text-[var(--danger-600)] hover:bg-red-50 disabled:opacity-30"><Trash2 size={14} /></button>
            </div>
          ))}
          <Btn type="button" variant="secondary" size="sm" onClick={() => patchVariants([...variants, { id: uid('paper-size'), label: 'مقاس جديد', widthMm: 320, heightMm: 450, pricePerSheet: variants[0]?.pricePerSheet ?? 0, enabled: true }])}><Plus size={13} /> إضافة مقاس</Btn>
        </div>
      </div>
    </Modal>
  );
}
