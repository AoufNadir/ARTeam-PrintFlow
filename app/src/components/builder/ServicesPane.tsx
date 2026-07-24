import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import type { Section, Service } from '@/lib/types';
import { db, uid } from '@/lib/storage';
import { toast } from 'sonner';
import { Btn, Chip, FieldLabel, inputCls, Modal } from '@/components/settings/Overlay';
import { CropMarks } from '@/components/ds/SectionCard';
import { SERVICE_BASIS_LABELS, stageLabel, toggleId, type BuilderMeta } from './meta';
import { logAudit } from '@/components/settings/audit';
import { cn } from '@/lib/utils';

interface Props {
  section: Section | null;
  services: Service[];
  meta: BuilderMeta;
  setMeta: (patch: Partial<BuilderMeta>) => void;
  activeId: string | null;
  onSelect: (id: string) => void;
  refresh: () => void;
  sectionDisabled: boolean;
}

/** Pane 2 — services of the selected section. */
export default function ServicesPane({ section, services, meta, setMeta, activeId, onSelect, refresh, sectionDisabled }: Props) {
  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [latin, setLatin] = useState('');
  const [basis, setBasis] = useState<'perCopy' | 'perM2' | 'fixed'>('perCopy');
  const [template, setTemplate] = useState('empty');

  if (!section) {
    return (
      <div className="flex h-full w-[300px] shrink-0 items-center justify-center border-e border-[var(--line)] bg-[var(--paper-100)] px-6 text-center text-[13px] text-[var(--ink-400)]">
        اختر قسمًا لعرض خدماته
      </div>
    );
  }

  const inSection = services.filter((s) => s.sectionId === section.id);
  const ordered = [...inSection].sort((a, b) => {
    const ia = section.serviceIds.indexOf(a.id);
    const ib = section.serviceIds.indexOf(b.id);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  const createService = () => {
    const n = name.trim();
    if (!n) return;
    let base: Omit<Service, 'id' | 'sectionId'> = {
      name: n,
      latinName: latin.trim() || undefined,
      fields: [
        { id: 'quantity', label: 'الكمية', type: 'number', required: true, min: 1, step: 50, defaultValue: 500 },
      ],
      pricingRuleIds: ['rule-waste', 'rule-overhead', 'rule-margin'],
      stages: ['impression'],
    };
    if (template !== 'empty') {
      const tpl = services.find((s) => s.id === template);
      if (tpl) {
        base = {
          ...structuredClone(tpl),
          name: n,
          latinName: latin.trim() || tpl.latinName,
        };
      }
    }
    const svc: Service = { ...base, id: uid('svc'), sectionId: section.id };
    db.services.create(svc);
    db.sections.update(section.id, { serviceIds: [...section.serviceIds, svc.id] });
    setMeta({ serviceBasis: { ...meta.serviceBasis, [svc.id]: basis } });
    logAudit('catalog', `أضاف خدمة «${svc.latinName ?? svc.name}» إلى قسم ${section.name}`, `خدمة: ${svc.name}`);
    toast.success(`أُضيفت الخدمة «${svc.name}»`);
    setModal(false);
    setName('');
    setLatin('');
    setTemplate('empty');
    refresh();
    onSelect(svc.id);
  };

  return (
    <div className="flex h-full w-[300px] shrink-0 flex-col border-e border-[var(--line)] bg-[var(--paper-100)]/50">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <h3 className="min-w-0 truncate text-[17px] leading-[26px] font-semibold text-[var(--ink-900)]">
          خدمات: {section.name}
        </h3>
        <Btn variant="secondary" size="sm" onClick={() => setModal(true)}>
          <Plus size={14} /> خدمة جديدة
        </Btn>
      </div>

      <div className={cn('flex-1 space-y-2 overflow-y-auto px-3 pb-3 transition-opacity duration-250', sectionDisabled && 'pointer-events-none opacity-45')}>
        {ordered.map((s, i) => {
          const disabled = meta.disabledServices.includes(s.id);
          const active = s.id === activeId;
          const stages = s.stages ?? [];
          return (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: i * 0.055 }}
              onClick={() => onSelect(s.id)}
              className={cn(
                'relative cursor-pointer rounded-[12px] border bg-white p-3.5 transition-all',
                active ? 'border-[var(--cyan-600)] shadow-[var(--shadow-card)]' : 'border-[var(--line)] hover:border-[var(--line-strong)]',
                disabled && 'opacity-55',
              )}
            >
              {active && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                  <CropMarks opacity={0.5} offset={3} />
                </motion.span>
              )}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className={cn('truncate text-[14px] font-semibold', active ? 'text-[var(--ink-900)]' : 'text-[var(--ink-700)]')}>
                    {s.name}
                    {s.latinName && (
                      <span dir="ltr" className="font-latin ms-2 text-[11px] font-medium text-[var(--ink-400)]">
                        {s.latinName}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <Chip>{s.fields.length} حقول</Chip>
                    <Chip>{s.pricingRuleIds.length} قواعد تسعير</Chip>
                    <Chip tint={stages.length > 1 ? 'violet' : 'paper'}>
                      {stages.length <= 1 ? 'مرحلة واحدة' : `${stages.length} مراحل`}
                    </Chip>
                    {disabled && <Chip tint="danger">معطّلة</Chip>}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!disabled}
                  aria-label={disabled ? 'تفعيل الخدمة' : 'تعطيل الخدمة'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMeta({ disabledServices: toggleId(meta.disabledServices, s.id) });
                  }}
                  className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', !disabled ? 'bg-[var(--cyan-600)]' : 'bg-[var(--line-strong)]')}
                >
                  <motion.span
                    layout
                    transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                    className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow', !disabled ? 'end-[18px]' : 'end-0.5')}
                  />
                </button>
              </div>
              {stages.length > 1 && (
                <div dir="ltr" className="font-latin mt-2 truncate text-[10px] text-[var(--ink-400)]">
                  {stages.map(stageLabel).join(' → ')}
                </div>
              )}
            </motion.div>
          );
        })}
        {ordered.length === 0 && (
          <div className="rounded-[12px] border border-dashed border-[var(--line-strong)] px-4 py-8 text-center text-[13px] text-[var(--ink-400)]">
            لا خدمات بعد — أضف أول خدمة لهذا القسم
          </div>
        )}
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="خدمة جديدة"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setModal(false)}>
              إلغاء
            </Btn>
            <Btn onClick={createService} disabled={!name.trim()}>
              إنشاء الخدمة
            </Btn>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <FieldLabel required>اسم الخدمة</FieldLabel>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: بطاقة زيارة" className={inputCls} />
          </div>
          <div>
            <FieldLabel>التسمية الفرنسية (اختياري)</FieldLabel>
            <input dir="ltr" value={latin} onChange={(e) => setLatin(e.target.value)} placeholder="Carte Visite" className={cn(inputCls, 'font-latin')} />
          </div>
          <div>
            <FieldLabel>أساس التسعير</FieldLabel>
            <div className="flex gap-1.5">
              {(['perCopy', 'perM2', 'fixed'] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBasis(b)}
                  className={cn(
                    'h-9 flex-1 rounded-[8px] border text-[13px] font-medium transition-colors',
                    basis === b ? 'border-[var(--cyan-600)] bg-[var(--cyan-100)] text-[var(--cyan-600)]' : 'border-[var(--line)] bg-white text-[var(--ink-500)] hover:bg-[var(--paper-100)]',
                  )}
                >
                  {SERVICE_BASIS_LABELS[b]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <FieldLabel>ابدأ من</FieldLabel>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setTemplate('empty')}
                className={cn(
                  'h-9 rounded-[8px] border text-[13px] transition-colors',
                  template === 'empty' ? 'border-[var(--cyan-600)] bg-[var(--cyan-100)] text-[var(--cyan-600)]' : 'border-[var(--line)] text-[var(--ink-500)] hover:bg-[var(--paper-100)]',
                )}
              >
                فارغ
              </button>
              {services.slice(0, 5).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setTemplate(s.id)}
                  className={cn(
                    'h-9 truncate rounded-[8px] border px-2 text-[13px] transition-colors',
                    template === s.id ? 'border-[var(--cyan-600)] bg-[var(--cyan-100)] text-[var(--cyan-600)]' : 'border-[var(--line)] text-[var(--ink-500)] hover:bg-[var(--paper-100)]',
                  )}
                >
                  {s.latinName ?? s.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
