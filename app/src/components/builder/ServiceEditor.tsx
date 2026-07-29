import { useState } from 'react';
import { motion } from 'framer-motion';
import { Archive, Copy, Eye, MoreHorizontal, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { DesignInputMode, MontageMode, Section, Service } from '@/lib/types';
import { db, uid } from '@/lib/storage';
import { Chip, Modal, Btn } from '@/components/settings/Overlay';
import { SERVICE_BASIS_LABELS, type BuilderMeta } from './meta';
import FieldsTab from './FieldsTab';
import RulesTab from './RulesTab';
import StagesTab from './StagesTab';
import PreviewTab from './PreviewTab';
import { logAudit } from '@/components/settings/audit';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'fields', label: 'الحقول' },
  { id: 'rules', label: 'قواعد التسعير' },
  { id: 'stages', label: 'المراحل' },
  { id: 'preview', label: 'معاينة' },
] as const;

type TabId = (typeof TABS)[number]['id'];

interface Props {
  service: Service | null;
  section: Section | null;
  meta: BuilderMeta;
  setMeta: (patch: Partial<BuilderMeta>) => void;
  refresh: () => void;
  rulesKey: number;
  onRulesChanged: () => void;
}

/** Pane 3 — service editor with 4 tabs. */
export default function ServiceEditor({ service, section, meta, setMeta, refresh, rulesKey, onRulesChanged }: Props) {
  const [tab, setTab] = useState<TabId>('fields');
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  if (!service) {
    return (
      <div className="grid flex-1 place-items-center bg-[var(--paper-50)] text-[13px] text-[var(--ink-400)]">
        اختر خدمة من القائمة — أو أنشئ خدمة جديدة
      </div>
    );
  }

  const update = (patch: Partial<Service>) => {
    db.services.update(service.id, patch);
    refresh();
  };

  const duplicate = () => {
    const copy: Service = { ...structuredClone(service), id: uid('svc'), name: `${service.name} (نسخة)` };
    db.services.create(copy);
    if (section) db.sections.update(section.id, { serviceIds: [...section.serviceIds, copy.id] });
    logAudit('catalog', `نُسخت الخدمة «${service.name}»`, `خدمة: ${service.name}`);
    toast.success('نُسخت الخدمة');
    setMenuOpen(false);
    refresh();
  };

  /**
   * Soft archive — the service is NEVER deleted from the catalog (old quotes
   * keep referencing it). It is added to `disabledServices` in builder-meta so
   * it disappears from the quote wizard, and can be restored any time with the
   * enable toggle in the services list.
   */
  const archive = () => {
    setMeta({ disabledServices: meta.disabledServices.includes(service.id) ? meta.disabledServices : [...meta.disabledServices, service.id] });
    logAudit('catalog', `أرشفت الخدمة «${service.name}» (أرشفة ناعمة)`, `خدمة: ${service.name}`);
    toast.success('أُرشفت الخدمة — يمكن استرجاعها بمفتاح التفعيل في قائمة الخدمات');
    setConfirmArchive(false);
    setMenuOpen(false);
    refresh();
  };

  const basis = meta.serviceBasis[service.id] ?? 'perCopy';

  return (
    <motion.div
      key={service.id}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.16 }}
      className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-[var(--paper-50)]"
    >
      {/* header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-white px-5 py-4">
        {renaming ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              if (nameDraft.trim()) update({ name: nameDraft.trim() });
              setRenaming(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="h-9 rounded-[8px] border border-[var(--cyan-600)] px-3 text-[19px] font-bold outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setRenaming(true);
              setNameDraft(service.name);
            }}
            className="group flex items-center gap-2"
          >
            <h2 className="text-[21px] leading-[30px] font-bold text-[var(--ink-900)]">{service.name}</h2>
            <Pencil size={14} className="text-[var(--ink-400)] opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        )}
        {service.latinName && (
          <span dir="ltr" className="font-latin text-[12px] text-[var(--ink-400)]">
            {service.latinName}
          </span>
        )}
        <Chip tint="cyan">{SERVICE_BASIS_LABELS[basis]}</Chip>
        <label className="flex items-center gap-2 text-[11px] text-[var(--ink-500)]">
          المونتاج في Devis
          <select
            value={section?.printCategory === 'other' ? 'disabled' : service.montageMode ?? 'disabled'}
            disabled={!section || section.printCategory === 'other'}
            onChange={(event) => update({ montageMode: event.target.value as MontageMode })}
            className="h-8 rounded-[7px] border border-[var(--line-strong)] bg-white px-2 text-[12px] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="disabled">معطل</option>
            <option value="optional">اختياري</option>
            <option value="required">إجباري</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-[11px] text-[var(--ink-500)]">
          مدخل التصميم
          <select
            value={service.designInputMode ?? 'standard'}
            onChange={(event) => update({ designInputMode: event.target.value as DesignInputMode })}
            className="h-8 rounded-[7px] border border-[var(--line-strong)] bg-white px-2 text-[12px]"
          >
            <option value="standard">عادي</option>
            <option value="fixed-template">قالب ثابت</option>
          </select>
        </label>
        <div className="ms-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTab('preview')}
            className="flex h-9 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-100)] hover:text-[var(--cyan-600)]"
          >
            <Eye size={15} /> معاينة في المعالج
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="المزيد"
              className="grid h-9 w-9 place-items-center rounded-[8px] text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-100)]"
            >
              <MoreHorizontal size={17} />
            </button>
            {menuOpen && (
              <div className="absolute end-0 z-40 mt-1 w-44 overflow-hidden rounded-[10px] border border-[var(--line)] bg-white py-1 shadow-[var(--shadow-pop)]">
                <button type="button" onClick={duplicate} className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-[var(--ink-700)] hover:bg-[var(--paper-100)]">
                  <Copy size={14} /> نسخ الخدمة
                </button>
                <button type="button" onClick={() => { setMenuOpen(false); setConfirmArchive(true); }} className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-[var(--danger-600)] hover:bg-[var(--paper-100)]">
                  <Archive size={14} /> أرشفة
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* tabs */}
      <div className="border-b border-[var(--line)] bg-white px-5">
        <div className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'relative px-4 py-3 text-[14px] transition-colors',
                tab === t.id ? 'font-semibold text-[var(--cyan-600)]' : 'text-[var(--ink-500)] hover:text-[var(--ink-700)]',
              )}
            >
              {t.label}
              {tab === t.id && (
                <motion.span
                  layoutId="builder-tab-underline"
                  className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-[var(--cyan-600)]"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-5">
        {tab === 'fields' && <FieldsTab service={service} onUpdate={update} />}
        {tab === 'rules' && <RulesTab service={service} rulesKey={rulesKey} onRulesChanged={onRulesChanged} />}
        {tab === 'stages' && <StagesTab service={service} meta={meta} setMeta={setMeta} onUpdate={update} />}
        {tab === 'preview' && <PreviewTab service={service} rulesKey={rulesKey} />}
      </div>

      {/* archive confirmation (danger) */}
      <Modal
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title="أرشفة الخدمة"
        size="sm"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setConfirmArchive(false)}>
              إلغاء
            </Btn>
            <Btn variant="danger" onClick={archive}>
              <Archive size={14} /> تأكيد الأرشفة
            </Btn>
          </>
        }
      >
        <p className="text-[13px] leading-6 text-[var(--ink-700)]">
          ستُخفى الخدمة «<span className="font-semibold">{service.name}</span>» من معالج عروض الأسعار الجديدة، لكنها{' '}
          <span className="font-semibold">لن تُحذف</span> من الكتالوج وتبقى العروض القديمة التي تستخدمها سليمة.
        </p>
        <p className="mt-2 text-[12px] leading-5 text-[var(--ink-500)]">
          يمكنك استرجاعها في أي وقت بمفتاح التفعيل بجانبها في قائمة الخدمات.
        </p>
      </Modal>
    </motion.div>
  );
}
