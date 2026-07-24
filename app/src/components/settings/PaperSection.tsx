import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Pencil, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { PaperType } from '@/lib/types';
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
                          setEditingId(p.id);
                          setPriceDraft(String(p.pricePerSheet));
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
    </SectionCard>
  );
}

function NewPaperModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [gsm, setGsm] = useState('300');
  const [price, setPrice] = useState('');

  const save = () => {
    const g = Number(gsm) || 0;
    const v = parseDecimal(price);
    if (!name.trim() || Number.isNaN(v)) return;
    db.papers.create({ id: uid('paper'), name: name.trim(), gsm: g, pricePerSheet: v, enabled: true });
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
      </div>
    </Modal>
  );
}
