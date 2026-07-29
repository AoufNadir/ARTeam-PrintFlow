import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy, GripVertical, Pencil, Plus } from 'lucide-react';
import type { PrintCategory, Section, Service } from '@/lib/types';
import { db, uid } from '@/lib/storage';
import { toast } from 'sonner';
import { Chip, inputCls } from '@/components/settings/Overlay';
import { toggleId, type BuilderMeta } from './meta';
import { SECTION_ICONS, sectionIcon } from './section-icons';
import { logAudit } from '@/components/settings/audit';
import { cn } from '@/lib/utils';

interface Props {
  sections: Section[];
  services: Service[];
  meta: BuilderMeta;
  setMeta: (patch: Partial<BuilderMeta>) => void;
  activeId: string | null;
  onSelect: (id: string) => void;
  refresh: () => void;
}

export default function SectionsPane({ sections, services, meta, setMeta, activeId, onSelect, refresh }: Props) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('printer');
  const [newCategory, setNewCategory] = useState<PrintCategory>('other');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);

  const ordered = [...sections].sort((a, b) => {
    const ia = meta.sectionOrder.indexOf(a.id);
    const ib = meta.sectionOrder.indexOf(b.id);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  const commitOrder = (ids: string[]) => setMeta({ sectionOrder: ids });

  const addSection = () => {
    const name = newName.trim();
    if (!name) return;
    const s: Section = { id: uid('sec'), name, serviceIds: [], printCategory: newCategory };
    db.sections.create(s);
    setMeta({ sectionIcons: { ...meta.sectionIcons, [s.id]: newIcon } });
    logAudit('catalog', `أضاف قسمًا جديدًا «${name}»`, `قسم: ${name}`);
    toast.success(`أُضيف القسم «${name}»`);
    setAdding(false);
    setNewName('');
    setNewCategory('other');
    refresh();
    onSelect(s.id);
  };

  const duplicate = (s: Section) => {
    const copy: Section = { ...s, id: uid('sec'), name: `${s.name} (نسخة)`, serviceIds: [] };
    db.sections.create(copy);
    // duplicate its services too
    services
      .filter((sv) => sv.sectionId === s.id)
      .forEach((sv) => {
        const svcCopy = { ...structuredClone(sv), id: uid('svc'), sectionId: copy.id };
        db.services.create(svcCopy);
        copy.serviceIds.push(svcCopy.id);
      });
    db.sections.update(copy.id, { serviceIds: copy.serviceIds });
    toast.success(`نُسخ القسم «${s.name}»`);
    refresh();
  };

  const commitRename = (id: string) => {
    const name = renameValue.trim();
    if (name) {
      db.sections.update(id, { name });
      refresh();
    }
    setRenamingId(null);
  };

  return (
    <div className="flex h-full w-[260px] shrink-0 flex-col border-e border-[var(--line)] bg-white">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h3 className="text-[17px] leading-[26px] font-semibold text-[var(--ink-900)]">الأقسام</h3>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          aria-label="قسم جديد"
          className="grid h-8 w-8 place-items-center rounded-[8px] text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-100)] hover:text-[var(--cyan-600)]"
        >
          <Plus size={17} />
        </button>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {adding && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-2 rounded-[12px] border border-[var(--cyan-600)] bg-[var(--cyan-50)] p-3"
          >
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSection()}
              placeholder="اسم القسم…"
              className={inputCls}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(SECTION_ICONS).map(([key, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setNewIcon(key)}
                  className={cn(
                    'grid h-8 w-8 place-items-center rounded-[8px] border transition-colors',
                    newIcon === key ? 'border-[var(--cyan-600)] bg-white text-[var(--cyan-600)]' : 'border-[var(--line)] bg-white text-[var(--ink-400)] hover:bg-[var(--paper-100)]',
                  )}
                >
                  <Icon size={15} />
                </button>
              ))}
            </div>
            <select
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value as PrintCategory)}
              className="mt-2 h-9 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-2 text-[12px]"
            >
              <option value="digital">طباعة رقمية</option>
              <option value="offset">طباعة أوفست</option>
              <option value="other">خدمات أخرى</option>
            </select>
            <button
              type="button"
              onClick={addSection}
              className="mt-2 flex h-8 w-full items-center justify-center gap-1 rounded-[8px] bg-[var(--cyan-600)] text-[13px] font-semibold text-white"
            >
              <Check size={14} /> إضافة
            </button>
          </motion.div>
        )}

        {ordered.map((s, i) => {
          const disabled = meta.disabledSections.includes(s.id);
          const count = services.filter((sv) => sv.sectionId === s.id).length;
          const Icon = sectionIcon(meta, s);
          const active = s.id === activeId;
          return (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              draggable
              onDragStart={() => setDragId(s.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (!dragId || dragId === s.id) return;
                const ids = ordered.map((x) => x.id);
                const from = ids.indexOf(dragId);
                const to = ids.indexOf(s.id);
                ids.splice(to, 0, ids.splice(from, 1)[0]);
                commitOrder(ids);
                setDragId(null);
              }}
              className={cn(
                'group relative flex items-center gap-2 rounded-[10px] px-2 py-2 transition-all',
                active ? 'bg-[var(--cyan-50)]' : 'hover:bg-[var(--paper-100)]',
                disabled && 'opacity-45',
                dragId === s.id && 'scale-[1.02] shadow-[var(--shadow-pop)]',
              )}
            >
              {active && <span className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-[var(--cyan-600)]" />}
              <GripVertical size={14} className="shrink-0 cursor-grab text-[var(--ink-400)] opacity-0 transition-opacity group-hover:opacity-100" />
              <Icon size={17} className={cn('shrink-0', active ? 'text-[var(--cyan-600)]' : 'text-[var(--ink-500)]')} />
              {renamingId === s.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(s.id)}
                  onKeyDown={(e) => e.key === 'Enter' && commitRename(s.id)}
                  className="h-7 w-full rounded-[6px] border border-[var(--cyan-600)] px-2 text-[13px] outline-none"
                />
              ) : (
                <button type="button" onClick={() => onSelect(s.id)} className="min-w-0 flex-1 text-start">
                  <span className={cn('block truncate text-[14px]', active ? 'font-semibold text-[var(--ink-900)]' : 'text-[var(--ink-700)]')}>
                    {s.name}
                  </span>
                  <span dir="ltr" className="font-latin block text-[10px] text-[var(--ink-400)]">
                    {count} {disabled && '· off'}
                  </span>
                </button>
              )}
              {disabled && <Chip tint="danger">معطّل</Chip>}
              <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  aria-label="إعادة تسمية"
                  onClick={() => {
                    setRenamingId(s.id);
                    setRenameValue(s.name);
                  }}
                  className="grid h-7 w-7 place-items-center rounded-[6px] text-[var(--ink-400)] hover:bg-white hover:text-[var(--ink-700)]"
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  aria-label="نسخ"
                  onClick={() => duplicate(s)}
                  className="grid h-7 w-7 place-items-center rounded-[6px] text-[var(--ink-400)] hover:bg-white hover:text-[var(--ink-700)]"
                >
                  <Copy size={13} />
                </button>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={!disabled}
                aria-label={disabled ? 'تفعيل القسم' : 'تعطيل القسم'}
                onClick={() => setMeta({ disabledSections: toggleId(meta.disabledSections, s.id) })}
                className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', !disabled ? 'bg-[var(--cyan-600)]' : 'bg-[var(--line-strong)]')}
              >
                <motion.span
                  layout
                  transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                  className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow', !disabled ? 'end-[18px]' : 'end-0.5')}
                />
              </button>
            </motion.div>
          );
        })}
      </div>

      <div className="border-t border-[var(--line)] px-4 py-3">
        {activeId && (
          <label className="mb-2 block text-[11px] text-[var(--ink-500)]">
            تصنيف الطباعة
            <select
              value={sections.find((section) => section.id === activeId)?.printCategory ?? 'other'}
              onChange={(event) => {
                db.sections.update(activeId, { printCategory: event.target.value as PrintCategory });
                refresh();
              }}
              className="mt-1 h-8 w-full rounded-[7px] border border-[var(--line-strong)] bg-white px-2 text-[12px]"
            >
              <option value="digital">رقمية</option>
              <option value="offset">أوفست</option>
              <option value="other">خدمات أخرى</option>
            </select>
          </label>
        )}
        <p className="text-[11px] leading-4 text-[var(--ink-400)]">
          الترتيب هنا هو ترتيب الظهور في معالج Devis. الكتالوج الأولي قابل للتعديل أو التعطيل.
        </p>
      </div>
    </div>
  );
}
