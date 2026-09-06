import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Plus, X } from 'lucide-react';
import type {
  FieldOption,
  PrintCategory,
  ProductionStageKind,
  Service,
  ServiceField,
  ServiceStageCondition,
  ServiceStageTemplate,
} from '@/lib/types';
import { uid } from '@/lib/storage';
import { Chip, FieldLabel, inputCls } from '@/components/settings/Overlay';
import { STAGE_DEFS, stageLabel, type BuilderMeta, type StageCondition } from './meta';

interface Props {
  service: Service;
  meta: BuilderMeta;
  setMeta: (patch: Partial<BuilderMeta>) => void;
  onUpdate: (patch: Partial<Service>) => void;
}

interface ConditionTarget {
  value: string;
  field: ServiceField;
  option?: FieldOption;
  boolValue?: boolean;
  label: string;
}

const KIND_OPTIONS: Array<{ value: ProductionStageKind; label: string; latin: string }> = [
  { value: 'print', label: 'طباعة', latin: 'Print' },
  { value: 'cut', label: 'قص', latin: 'Cut' },
  { value: 'assembly', label: 'تجميع', latin: 'Assembly' },
  { value: 'finishing', label: 'تشطيب', latin: 'Finishing' },
  { value: 'packaging', label: 'تغليف', latin: 'Packaging' },
  { value: 'other', label: 'أخرى', latin: 'Other' },
];

const PRINT_CATEGORY_OPTIONS: Array<{ value: PrintCategory | ''; label: string }> = [
  { value: '', label: 'حسب قسم الخدمة' },
  { value: 'digital', label: 'طباعة رقمية' },
  { value: 'offset', label: 'طباعة أوفست' },
  { value: 'other', label: 'أخرى' },
];

/** Tab 3 — production workflow editor. Pricing lives in the rules tab only. */
export default function StagesTab(props: Props) {
  if (props.service.workflow === 'multiStage') return <MultiStageEditor {...props} />;
  return <LegacyStagesEditor {...props} />;
}

function MultiStageEditor({ service, onUpdate }: Props) {
  const stages = useMemo(() => normalizeStageTemplates(service), [service]);
  const assignedFieldIds = useMemo(() => new Set(stages.flatMap((stage) => stage.fieldIds ?? [])), [stages]);
  const projectFieldIds = service.projectFieldIds ?? service.fields.filter((field) => !assignedFieldIds.has(field.id)).map((field) => field.id);
  const conditionTargets = buildConditionTargets(service.fields.filter((field) => projectFieldIds.includes(field.id)));

  const setStages = (next: ServiceStageTemplate[]) => {
    const ordered = next.map((stage, index) => ({ ...stage, order: index }));
    const assigned = new Set(ordered.flatMap((stage) => stage.fieldIds ?? []));
    const nextProjectFields = Array.from(new Set([...(service.projectFieldIds ?? []), ...service.fields.filter((field) => !assigned.has(field.id)).map((field) => field.id)]))
      .filter((fieldId) => !assigned.has(fieldId));
    onUpdate({
      stageTemplates: ordered,
      projectFieldIds: nextProjectFields,
      stages: ordered.map((stage) => legacyStageIdForKind(stage.kind)),
    });
  };

  const patchStage = (id: string, patch: Partial<ServiceStageTemplate>) => {
    setStages(stages.map((stage) => (stage.id === id ? { ...stage, ...patch } : stage)));
  };

  const assignField = (fieldId: string, targetStageId?: string) => {
    const nextStages = stages.map((stage) => ({
      ...stage,
      fieldIds: targetStageId === stage.id
        ? Array.from(new Set([...(stage.fieldIds ?? []), fieldId]))
        : (stage.fieldIds ?? []).filter((id) => id !== fieldId),
    }));
    onUpdate({
      stageTemplates: nextStages,
      projectFieldIds: targetStageId ? projectFieldIds.filter((id) => id !== fieldId) : Array.from(new Set([...projectFieldIds, fieldId])),
      stages: nextStages.map((stage) => legacyStageIdForKind(stage.kind)),
    });
  };

  const addStage = (kind: ProductionStageKind) => {
    setStages([
      ...stages,
      {
        id: uid('stage'),
        order: stages.length,
        name: defaultStageName(kind, stages.length + 1),
        kind,
        printCategory: kind === 'print' ? undefined : undefined,
        montageMode: kind === 'print' ? 'required' : 'disabled',
        fieldIds: [],
      },
    ]);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const to = idx + dir;
    if (to < 0 || to >= stages.length) return;
    const next = [...stages];
    next.splice(to, 0, next.splice(idx, 1)[0]);
    setStages(next);
  };

  return (
    <div className="space-y-5">
      <div className="rounded-[12px] border border-[var(--cyan-100)] bg-[var(--cyan-50)] px-4 py-3 text-[13px] leading-6 text-[var(--ink-700)]">
        هذا القالب متعدد المراحل. الحقول تجمع اختيارات المستخدم، والتسعير يحدد تأثير الاختيارات، أما هنا فنربط كل مرحلة بالحقول التي تحتاجها أثناء إنشاء Devis.
      </div>

      <div className="rounded-[12px] border border-[var(--line)] bg-white p-4">
        <div className="mb-2 text-[13px] font-semibold text-[var(--ink-800)]">حقول معلومات المشروع</div>
        <p className="mb-3 text-[11px] text-[var(--ink-400)]">تظهر مرة واحدة قبل مراحل الإنتاج. اضغط على الحقل لنقله إلى معلومات المشروع.</p>
        <div className="flex flex-wrap gap-2">
          {service.fields.map((field) => (
            <button key={field.id} type="button" onClick={() => assignField(field.id)} className={projectFieldIds.includes(field.id) ? 'rounded-full border border-[var(--cyan-600)] bg-[var(--cyan-50)] px-3 py-1.5 text-[11px] font-medium text-[var(--cyan-600)]' : 'rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-[11px] text-[var(--ink-500)]'}>
              {field.label}
            </button>
          ))}
          {service.fields.length === 0 && <span className="text-[12px] text-[var(--ink-400)]">لا توجد حقول إضافية بعد.</span>}
        </div>
      </div>

      <div className="grid gap-3">
        {stages.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-[var(--line-strong)] bg-white px-4 py-8 text-center text-[13px] text-[var(--ink-400)]">
            لا توجد مراحل بعد. أضف مرحلة طباعة أو قص أو تشطيب لبناء قالب المشروع.
          </div>
        ) : (
          stages.map((stage, index) => (
            <motion.div
              key={stage.id}
              layout="position"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(index * 0.04, 0.24) }}
              className="rounded-[14px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-card)]"
            >
              <div className="mb-3 flex flex-wrap items-start gap-2">
                <Chip tint="cyan">
                  <span dir="ltr" className="font-latin">{index + 1}</span>
                </Chip>
                <div className="min-w-[220px] flex-1">
                  <FieldLabel>اسم المرحلة</FieldLabel>
                  <input
                    value={stage.name}
                    onChange={(event) => patchStage(stage.id, { name: event.target.value })}
                    className={inputCls}
                  />
                </div>
                <label className="min-w-[160px] text-[12px] font-medium text-[var(--ink-700)]">
                  نوع المرحلة
                  <select
                    value={stage.kind}
                    onChange={(event) => {
                      const kind = event.target.value as ProductionStageKind;
                      patchStage(stage.id, {
                        kind,
                        name: stage.name || defaultStageName(kind, index + 1),
                        montageMode: kind === 'print' ? 'required' : 'disabled',
                      });
                    }}
                    className="mt-1.5 h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-2 text-[13px] outline-none focus:border-[var(--cyan-600)]"
                  >
                    {KIND_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="ms-auto flex shrink-0 items-center gap-1 pt-6">
                  <button type="button" aria-label="تقديم" onClick={() => move(index, -1)} className="grid h-8 w-8 place-items-center rounded-[8px] text-[var(--ink-400)] hover:bg-[var(--paper-100)] hover:text-[var(--cyan-600)]">
                    <ArrowRight size={14} />
                  </button>
                  <button type="button" aria-label="تأخير" onClick={() => move(index, 1)} className="grid h-8 w-8 place-items-center rounded-[8px] text-[var(--ink-400)] hover:bg-[var(--paper-100)] hover:text-[var(--cyan-600)]">
                    <ArrowLeft size={14} />
                  </button>
                  <button type="button" aria-label="حذف المرحلة" onClick={() => setStages(stages.filter((item) => item.id !== stage.id))} className="grid h-8 w-8 place-items-center rounded-[8px] text-[var(--ink-400)] hover:bg-[var(--paper-100)] hover:text-[var(--danger-600)]">
                    <X size={14} />
                  </button>
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                <label className="text-[12px] font-medium text-[var(--ink-700)]">
                  تظهر عندما
                  <select
                    value={stage.condition ? encodeCondition(stage.condition) : ''}
                    onChange={(event) => patchStage(stage.id, { condition: event.target.value ? decodeCondition(event.target.value) : undefined })}
                    className="mt-1.5 h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-2 text-[13px] outline-none focus:border-[var(--cyan-600)]"
                  >
                    <option value="">دائمة في المشروع</option>
                    {conditionTargets.map((target) => (
                      <option key={target.value} value={target.value}>
                        {target.label}
                      </option>
                    ))}
                  </select>
                </label>

                {stage.kind === 'print' && (
                  <label className="text-[12px] font-medium text-[var(--ink-700)]">
                    النوع الافتراضي للطباعة (قابل للتغيير في Devis)
                    <select
                      value={stage.printCategory ?? ''}
                      onChange={(event) => patchStage(stage.id, { printCategory: (event.target.value || undefined) as PrintCategory | undefined })}
                      className="mt-1.5 h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-2 text-[13px] outline-none focus:border-[var(--cyan-600)]"
                    >
                      {PRINT_CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value || 'section'} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              {stage.kind === 'print' && (
                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  <div className="rounded-[8px] border border-[var(--line)] bg-[var(--paper-50)] px-3 py-2 text-[11px] leading-5 text-[var(--ink-500)]">
                    الكمية، الورق، الماكينة، مقاس الورقة، مقاس المنتج والأوجه تظهر تلقائيًا داخل مرحلة الطباعة في Devis.
                  </div>
                  <label className="text-[12px] font-medium text-[var(--ink-700)]">
                    المونتاج
                    <div className="mt-1.5 flex h-10 items-center rounded-[8px] border border-[var(--cyan-100)] bg-[var(--cyan-50)] px-3 text-[12px] font-semibold text-[var(--cyan-600)]">
                      إجباري لكل مرحلة طباعة
                    </div>
                  </label>
                </div>
              )}

              {service.fields.length > 0 && (
                <div className="mt-3 rounded-[10px] border border-[var(--line)] bg-[var(--paper-50)] p-3">
                  <div className="mb-2 text-[12px] font-semibold text-[var(--ink-700)]">الحقول الإضافية داخل هذه المرحلة</div>
                  <div className="flex flex-wrap gap-2">
                    {service.fields.map((field) => {
                      const active = (stage.fieldIds ?? []).includes(field.id);
                      return <button key={field.id} type="button" onClick={() => assignField(field.id, active ? undefined : stage.id)} className={active ? 'rounded-full border border-[var(--violet-600)] bg-violet-50 px-3 py-1.5 text-[11px] font-medium text-[var(--violet-600)]' : 'rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-[11px] text-[var(--ink-500)]'}>{field.label}</button>;
                    })}
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-[var(--ink-500)]">
                <Chip>{KIND_OPTIONS.find((option) => option.value === stage.kind)?.latin ?? stage.kind}</Chip>
                <Chip tint={stage.condition ? 'violet' : 'paper'}>
                  {stage.condition ? conditionLabel(stage.condition, conditionTargets) : 'دائمة'}
                </Chip>
                {stage.kind === 'print' && (
                  <Chip tint="danger">
                    مونتاج إجباري
                  </Chip>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>

      <div className="rounded-[14px] border border-[var(--line)] bg-white p-3">
        <div className="mb-2 text-[12px] font-semibold text-[var(--ink-700)]">إضافة مرحلة</div>
        <div className="flex flex-wrap gap-1.5">
          {KIND_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => addStage(option.value)}
              className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-[var(--line)] bg-white px-3 text-[12px] font-medium text-[var(--ink-700)] transition-colors hover:border-[var(--cyan-600)] hover:bg-[var(--cyan-50)] hover:text-[var(--cyan-600)]"
            >
              <Plus size={13} />
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[12px] border border-[var(--line)] bg-white px-4 py-3 text-[13px] text-[var(--ink-700)]">
        مسار الإنتاج: {' '}
        <span className="font-semibold text-[var(--ink-900)]">
          {stages.length ? stages.map((stage) => stage.name).join(' ← ') : 'لم تُضف مراحل بعد'}
        </span>
      </div>
    </div>
  );
}

function LegacyStagesEditor({ service, meta, setMeta, onUpdate }: Props) {
  const stages = service.stages ?? [];
  const labels = meta.stageLabels[service.id] ?? {};
  const conditions = meta.stageConditions[service.id] ?? {};
  const [adderAt, setAdderAt] = useState<number | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  const conditionTargets = useMemo(() => buildConditionTargets(service.fields), [service.fields]);

  const setStages = (next: string[]) => onUpdate({ stages: next });

  const displayLabel = (stageId: string) => labels[stageId] ?? stageLabel(stageId);

  const insert = (idx: number, stageId: string) => {
    const next = [...stages];
    next.splice(idx, 0, stageId);
    setStages(next);
    setAdderAt(null);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const to = idx + dir;
    if (to < 0 || to >= stages.length) return;
    const next = [...stages];
    next.splice(to, 0, next.splice(idx, 1)[0]);
    setStages(next);
  };

  const saveStageName = (stageId: string, value: string) => {
    const nextLabels = { ...labels };
    const clean = value.trim();
    if (!clean || clean === stageLabel(stageId)) delete nextLabels[stageId];
    else nextLabels[stageId] = clean;
    setMeta({ stageLabels: { ...meta.stageLabels, [service.id]: nextLabels } });
  };

  const setStageCondition = (stageId: string, encoded: string) => {
    const nextConditions = { ...conditions };
    if (!encoded) {
      delete nextConditions[stageId];
    } else {
      nextConditions[stageId] = decodeCondition(encoded);
    }
    setMeta({ stageConditions: { ...meta.stageConditions, [service.id]: nextConditions } });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-[12px] border border-[var(--cyan-100)] bg-[var(--cyan-50)] px-4 py-3 text-[13px] leading-5 text-[var(--ink-700)]">
        الإنتاج هنا يصف ترتيب العمل فقط: ماذا يحدث أولًا، وما الذي يظهر حسب اختيار العميل. الأسعار تُدار من تبويب التسعير.
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max items-stretch gap-0">
          {stages.map((st, i) => {
            const condition = conditions[st];
            const conditionText = condition ? conditionLabel(condition, conditionTargets) : 'دائمة';
            return (
              <div key={`${st}-${i}`} className="flex items-center">
                <motion.div
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.08 }}
                  className="group relative w-64 rounded-[14px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-card)]"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    {editingIdx === i ? (
                      <input
                        autoFocus
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onBlur={() => {
                          saveStageName(st, nameDraft);
                          setEditingIdx(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                          if (e.key === 'Escape') setEditingIdx(null);
                        }}
                        className="h-8 w-full rounded-[6px] border border-[var(--cyan-600)] px-2 text-[13px] outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingIdx(i);
                          setNameDraft(displayLabel(st));
                        }}
                        className="text-start text-[14px] font-semibold text-[var(--ink-900)] hover:text-[var(--cyan-600)]"
                      >
                        {displayLabel(st)}
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="إزالة المرحلة"
                      onClick={() => setStages(stages.filter((_, x) => x !== i))}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-[var(--ink-400)] opacity-0 transition-opacity hover:bg-[var(--paper-100)] hover:text-[var(--danger-600)] group-hover:opacity-100"
                    >
                      <X size={13} />
                    </button>
                  </div>

                  <div className="mb-3 flex flex-wrap gap-1">
                    <Chip>{STAGE_DEFS.find((stage) => stage.id === st)?.latin ?? st}</Chip>
                    <Chip tint={condition ? 'violet' : 'paper'}>{conditionText}</Chip>
                  </div>

                  <label className="text-[11px] text-[var(--ink-500)]">
                    ظهور المرحلة
                    <select
                      value={condition ? encodeCondition(condition) : ''}
                      onChange={(event) => setStageCondition(st, event.target.value)}
                      className="mt-1 h-9 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-2 text-[12px] outline-none focus:border-[var(--cyan-600)]"
                    >
                      <option value="">دائمة في أمر الإنتاج</option>
                      {conditionTargets.map((target) => (
                        <option key={target.value} value={target.value}>
                          {target.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {conditionTargets.length === 0 && (
                    <p className="mt-2 text-[11px] leading-4 text-[var(--ink-400)]">
                      أضف حقل اختيار أو نعم/لا حتى تستطيع جعل المرحلة شرطية.
                    </p>
                  )}
                </motion.div>

                <div className="relative mx-1 flex w-10 items-center">
                  <motion.svg
                    width="40"
                    height="12"
                    viewBox="0 0 40 12"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 + i * 0.08 }}
                    className="text-[var(--cyan-500)]"
                  >
                    <motion.path
                      d="M40 6 H8"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeDasharray="32"
                      initial={{ strokeDashoffset: 32 }}
                      animate={{ strokeDashoffset: 0 }}
                      transition={{ duration: 0.4, delay: 0.2 + i * 0.08 }}
                    />
                    <path d="M8 2 L2 6 L8 10" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </motion.svg>
                  <button
                    type="button"
                    aria-label="إدراج مرحلة"
                    onClick={() => setAdderAt(adderAt === i + 1 ? null : i + 1)}
                    className="absolute inset-0 m-auto grid h-5 w-5 place-items-center rounded-full border border-[var(--line)] bg-white text-[var(--ink-400)] opacity-0 transition-opacity hover:border-[var(--cyan-500)] hover:text-[var(--cyan-600)] [div:hover>&]:opacity-100"
                    style={{ opacity: adderAt === i + 1 ? 1 : undefined }}
                  >
                    <Plus size={11} />
                  </button>
                </div>
              </div>
            );
          })}

          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setAdderAt(adderAt === stages.length ? null : stages.length)}
              className="grid h-24 w-14 place-items-center rounded-[14px] border border-dashed border-[var(--line-strong)] text-[var(--ink-400)] transition-colors hover:border-[var(--cyan-500)] hover:bg-[var(--cyan-50)] hover:text-[var(--cyan-600)]"
            >
              <Plus size={17} />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {adderAt !== null && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex flex-wrap gap-1.5 rounded-[12px] border border-[var(--line)] bg-[var(--paper-100)] p-3"
          >
            {STAGE_DEFS.filter((d) => !stages.includes(d.id)).map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => insert(adderAt, d.id)}
                className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-[12px] font-medium text-[var(--ink-700)] transition-colors hover:border-[var(--cyan-600)] hover:bg-[var(--cyan-50)] hover:text-[var(--cyan-600)]"
              >
                {d.label}
              </button>
            ))}
            {STAGE_DEFS.filter((d) => !stages.includes(d.id)).length === 0 && (
              <span className="text-[12px] text-[var(--ink-400)]">كل المراحل المتاحة مضافة.</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {stages.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--ink-400)]">
          إعادة الترتيب:
          {stages.map((st, i) => (
            <span key={`${st}-${i}`} className="inline-flex items-center gap-0.5 rounded-full border border-[var(--line)] bg-white px-2 py-1">
              {displayLabel(st)}
              <button type="button" aria-label="تقديم" onClick={() => move(i, -1)} className="text-[var(--ink-400)] hover:text-[var(--cyan-600)]">
                <ArrowRight size={11} />
              </button>
              <button type="button" aria-label="تأخير" onClick={() => move(i, 1)} className="text-[var(--ink-400)] hover:text-[var(--cyan-600)]">
                <ArrowLeft size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="rounded-[12px] border border-[var(--line)] bg-white px-4 py-3 text-[13px] text-[var(--ink-700)]">
        مسار الإنتاج: {' '}
        <span className="font-semibold text-[var(--ink-900)]">
          {stages.length ? stages.map(displayLabel).join(' ← ') : 'لم تُضف مراحل بعد'}
        </span>
      </div>
    </div>
  );
}

function normalizeStageTemplates(service: Service): ServiceStageTemplate[] {
  if (service.stageTemplates?.length) {
    return [...service.stageTemplates].sort((a, b) => a.order - b.order);
  }
  return (service.stages?.length ? service.stages : ['impression']).map((stageId, index) => ({
    id: `legacy-${stageId}-${index}`,
    order: index,
    name: stageLabel(stageId),
    kind: kindFromLegacyStageId(stageId),
    montageMode: stageId === 'impression' ? service.montageMode ?? 'optional' : 'disabled',
  }));
}

function kindFromLegacyStageId(stageId: string): ProductionStageKind {
  if (stageId === 'impression') return 'print';
  if (stageId === 'coupe' || stageId === 'cutcontour') return 'cut';
  if (stageId === 'pliage') return 'assembly';
  if (stageId === 'pelliculage' || stageId === 'finition') return 'finishing';
  if (stageId === 'livraison') return 'packaging';
  return 'other';
}

function legacyStageIdForKind(kind: ProductionStageKind): string {
  if (kind === 'print') return 'impression';
  if (kind === 'cut') return 'coupe';
  if (kind === 'assembly') return 'pliage';
  if (kind === 'packaging') return 'livraison';
  if (kind === 'finishing') return 'finition';
  return 'finition';
}

function defaultStageName(kind: ProductionStageKind, index: number): string {
  const label = KIND_OPTIONS.find((option) => option.value === kind)?.label ?? 'مرحلة';
  return `مرحلة ${label} ${index}`;
}

function buildConditionTargets(fields: ServiceField[]): ConditionTarget[] {
  return fields.flatMap<ConditionTarget>((field) => {
    if (field.type === 'yesno') {
      return [{
        value: `${field.id}::true`,
        field,
        boolValue: true,
        label: `${field.label} = نعم`,
      }];
    }
    if (field.type !== 'select') return [];
    return (field.options ?? []).map((option) => ({
      value: `${field.id}::${option.id}`,
      field,
      option,
      label: `${field.label} = ${option.latinLabel ?? option.label}`,
    }));
  });
}

function decodeCondition(encoded: string): ServiceStageCondition {
  const [fieldId, optionOrValue] = encoded.split('::');
  if (optionOrValue === 'true') return { fieldId, value: true };
  return { fieldId, optionId: optionOrValue };
}

function encodeCondition(condition: ServiceStageCondition | StageCondition): string {
  if (condition.value === true) return `${condition.fieldId}::true`;
  return `${condition.fieldId}::${condition.optionId ?? ''}`;
}

function conditionLabel(condition: ServiceStageCondition | StageCondition, targets: ConditionTarget[]): string {
  return targets.find((target) => target.value === encodeCondition(condition))?.label ?? 'شرط غير مكتمل';
}
