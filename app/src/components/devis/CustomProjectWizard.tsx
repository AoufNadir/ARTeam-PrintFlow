import { useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Copy, PanelTop, Plus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import SectionCard from '@/components/ds/SectionCard';
import StageStepper from '@/components/ds/StageStepper';
import NumberField from '@/components/ds/NumberField';
import DimensionGroup from '@/components/ds/DimensionGroup';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  PRODUCTION_STAGE_LABELS,
  applyProjectStageConditions,
  buildCustomProjectItem,
  emptyProductionStage,
  duplicateProductionStage,
  montageSignatureForStage,
  moveProductionStage,
  projectFromServiceTemplate,
  removeProductionStage,
  repriceCustomProject,
  validateCustomProject,
} from '@/lib/custom-project';
import { computeMontage } from '@/lib/montage-engine';
import { db, uid } from '@/lib/storage';
import type {
  CustomProjectDevisItem,
  CustomProjectSnapshot,
  Machine,
  PaperType,
  PaperVariant,
  PricingRule,
  ProductionStage,
  ProductionStageKind,
  Section,
  Service,
  ServiceField,
  Unit,
} from '@/lib/types';
import { formatDA } from '@/lib/units';
import { cn } from '@/lib/utils';

const WIZARD_STEPS = ['معلومات المشروع', 'مراحل الإنتاج', 'التسعير', 'مراجعة Devis'];
const STAGE_KINDS = Object.keys(PRODUCTION_STAGE_LABELS) as ProductionStageKind[];

interface Props {
  section: Section;
  rules: PricingRule[];
  defaultMargin: number;
  taxRate: number;
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
  templateService?: Service;
  papersCatalog?: PaperType[];
  machinesCatalog?: Machine[];
  initialItem?: CustomProjectDevisItem;
  order: number;
  onDraftChange: (item: CustomProjectDevisItem) => void;
  onComplete: (item: CustomProjectDevisItem) => void;
  onOpenStudio: (itemId: string, stage: ProductionStage) => void;
  onBack: () => void;
}

function blankProject(section: Section, margin: number): CustomProjectSnapshot {
  return {
    schemaVersion: 2,
    completion: 'draft',
    name: '',
    description: '',
    sourceSectionId: section.id,
    sourceSectionName: section.name,
    printCategory: section.printCategory ?? 'other',
    finalQuantity: 1,
    notes: '',
    stages: [],
    marginPercent: margin,
    totals: { stagesCost: 0, marginAmount: 0, marginPercent: margin, priceHt: 0, unitPriceHt: 0 },
  };
}

function machineSnapshot(machine: Machine) {
  return {
    id: machine.id,
    name: machine.name,
    kind: machine.kind,
    costPerFace: machine.costPerFace ?? 0,
    pricing: machine.pricing ? structuredClone(machine.pricing) : undefined,
    margins: { ...machine.margins },
    priseDePince: machine.priseDePince,
  };
}

function paperSnapshot(paper: PaperType, variant?: PaperVariant) {
  return {
    id: paper.id,
    name: paper.name,
    gsm: paper.gsm,
    variantId: variant?.id,
    variantLabel: variant?.label,
    widthMm: variant?.widthMm,
    heightMm: variant?.heightMm,
    pricePerSheet: variant?.pricePerSheet ?? paper.pricePerSheet,
  };
}

export default function CustomProjectWizard({
  section,
  rules,
  defaultMargin,
  taxRate,
  unit,
  onUnitChange,
  templateService,
  papersCatalog,
  machinesCatalog,
  initialItem,
  order,
  onDraftChange,
  onComplete,
  onOpenStudio,
  onBack,
}: Props) {
  const [step, setStep] = useState(initialItem ? 1 : 0);
  const [itemId] = useState(() => initialItem?.id ?? uid('item'));
  const [project, setProject] = useState<CustomProjectSnapshot>(() =>
    repriceCustomProject(initialItem?.customProject ?? (templateService ? projectFromServiceTemplate(section, templateService, defaultMargin) : blankProject(section, defaultMargin)), rules),
  );
  const [addOpen, setAddOpen] = useState(false);
  const [newKind, setNewKind] = useState<ProductionStageKind>('print');
  const [newName, setNewName] = useState('');
  const papers = useMemo(() => (papersCatalog ?? db.papers.list()).filter((paper) => paper.enabled), [papersCatalog]);
  const machines = useMemo(() => (machinesCatalog ?? db.machines.list()).filter((machine) => machine.enabled), [machinesCatalog]);
  const activeStages = project.stages.filter((stage) => stage.enabled !== false);
  const sourceTemplate = project.templateSnapshot ?? templateService;
  const templateStages = sourceTemplate?.stageTemplates ?? [];
  const stageScopedIds = new Set(templateStages.flatMap((stage) => [
    ...(stage.fieldIds ?? []),
    ...Object.values(stage.fieldBindings ?? {}).filter((value): value is string => Boolean(value)),
  ]));
  const projectFields = sourceTemplate?.fields.filter((field) =>
    (sourceTemplate.projectFieldIds ?? sourceTemplate.fields.filter((row) => !stageScopedIds.has(row.id)).map((row) => row.id)).includes(field.id),
  ) ?? [];

  const commit = (nextInput: CustomProjectSnapshot, completion: 'draft' | 'complete' = 'draft') => {
    const next = repriceCustomProject(applyProjectStageConditions({ ...nextInput, completion }), rules);
    setProject(next);
    const item = buildCustomProjectItem(itemId, initialItem?.order ?? order, next, rules);
    if (completion === 'complete') onComplete(item);
    else onDraftChange(item);
    return next;
  };

  const patchProject = (patch: Partial<CustomProjectSnapshot>) => commit({ ...project, ...patch });

  const changeFinalQuantity = (value: number) => {
    const nextQuantity = Math.max(1, value || 1);
    const stages = project.stages.map((stage) => ({
      ...stage,
      quantity: stage.quantity === project.finalQuantity ? nextQuantity : stage.quantity,
      ...(stage.montageResult && stage.quantity === project.finalQuantity ? { montageState: 'stale' as const } : {}),
    }));
    commit({ ...project, finalQuantity: nextQuantity, stages });
  };

  const patchProjectField = (fieldId: string, value: string | number | boolean | { widthMm: number; heightMm: number }) => {
    patchProject({ projectFieldValues: { ...(project.projectFieldValues ?? {}), [fieldId]: value } });
  };

  const patchStage = (id: string, updater: (stage: ProductionStage) => ProductionStage) => {
    const stages = project.stages.map((stage) => {
      if (stage.id !== id) return stage;
      const next = updater(stage);
      if (stage.montageResult && montageSignatureForStage(next) !== stage.montageSignature) {
        return { ...next, montageState: 'stale' as const };
      }
      return next;
    });
    commit({ ...project, stages });
  };

  const addStage = () => {
    const stage = emptyProductionStage(uid('stage'), project.stages.length, newKind, project.finalQuantity, project.printCategory);
    stage.name = newName.trim() || stage.name;
    if (newKind === 'print') stage.calculation = { mode: 'automatic', rate: 0 };
    commit({ ...project, stages: [...project.stages, stage] });
    setAddOpen(false);
    setNewName('');
  };

  const removeStage = (id: string) => {
    commit({ ...project, stages: removeProductionStage(project.stages, id) });
  };

  const duplicateStage = (id: string) => {
    commit({ ...project, stages: duplicateProductionStage(project.stages, id, uid('stage')) });
  };

  const moveStage = (id: string, direction: -1 | 1) => {
    commit({ ...project, stages: moveProductionStage(project.stages, id, direction) });
  };

  const runStageMontage = (stage: ProductionStage) => {
    if (!stage.printCategory || !stage.productSize || !stage.sheetSize || !stage.machine || !stage.paper) {
      toast.error('اختر نوع الطباعة والماكينة والورق والمقاس النهائي أولًا');
      return;
    }
    const input = {
      sheetWidthMm: stage.sheetSize.widthMm,
      sheetHeightMm: stage.sheetSize.heightMm,
      pieceWidthMm: stage.productSize.widthMm,
      pieceHeightMm: stage.productSize.heightMm,
      bleedMm: { top: 2, bottom: 2, left: 2, right: 2 },
      quantity: stage.quantity,
      method: stage.printMethod ?? 'recto',
      machineId: stage.machine.id,
      cutMethod: 'guillotine' as const,
    };
    const result = computeMontage(input, machines.filter((machine) => machine.kind === stage.printCategory));
    if (!result) {
      toast.error('تعذر حساب المونتاج لهذه المقاسات');
      return;
    }
    patchStage(stage.id, (current) => {
      const next = { ...current, montageInput: input, montageResult: result, montageState: 'confirmed' as const };
      return { ...next, montageSignature: montageSignatureForStage(next) };
    });
    toast.success('تم حساب مونتاج المرحلة');
  };

  const next = () => {
    if (step === 0 && (!project.name.trim() || project.finalQuantity <= 0)) {
      toast.error('أدخل اسم المشروع والكمية النهائية');
      return;
    }
    if (step === 1) {
      const errors = validateCustomProject(project);
      if (errors.length > 0) {
        toast.error(errors[0]);
        return;
      }
    }
    commit(project);
    setStep((current) => Math.min(3, current + 1));
  };

  const finish = () => {
    const errors = validateCustomProject(project);
    if (errors.length > 0) {
      toast.error(errors[0]);
      setStep(1);
      return;
    }
    commit(project, 'complete');
  };

  return (
    <div className="space-y-5">
      <div className="rounded-[14px] border border-[var(--line)] bg-white px-5 py-4 shadow-[var(--shadow-card)]">
        <StageStepper steps={WIZARD_STEPS} current={step} onStepClick={(index) => index <= step && setStep(index)} />
      </div>

      {step === 0 && (
        <SectionCard title="معلومات المشروع" actions={<span dir="ltr" className="font-latin text-[12px] text-[var(--cyan-600)]">Projet personnalisé</span>}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-[13px] font-medium text-[var(--ink-700)]">
              اسم المشروع *
              <input value={project.name} onChange={(event) => patchProject({ name: event.target.value })} className="mt-1.5 h-10 w-full rounded-[8px] border border-[var(--line-strong)] px-3 outline-none focus:border-[var(--cyan-600)]" />
            </label>
            <NumberField label="الكمية النهائية *" value={project.finalQuantity} min={1} onChange={changeFinalQuantity} />
            {projectFields.map((field) => (
              <TemplateFieldInput
                key={field.id}
                field={field}
                value={project.projectFieldValues?.[field.id]}
                onChange={(value) => patchProjectField(field.id, value)}
                unit={unit}
                onUnitChange={onUnitChange}
              />
            ))}
            <details className="md:col-span-2 rounded-[10px] border border-[var(--line)] px-4 py-3">
              <summary className="cursor-pointer text-[13px] font-medium text-[var(--ink-600)]">تفاصيل تجارية وملاحظات اختيارية</summary>
              <div className="mt-3 grid gap-3">
                <label className="text-[13px] font-medium text-[var(--ink-700)]">وصف مختصر<textarea value={project.description ?? ''} onChange={(event) => patchProject({ description: event.target.value })} rows={2} className="mt-1.5 w-full rounded-[8px] border border-[var(--line-strong)] px-3 py-2 outline-none focus:border-[var(--cyan-600)]" /></label>
                <label className="text-[13px] font-medium text-[var(--ink-700)]">ملاحظات داخلية<textarea value={project.notes ?? ''} onChange={(event) => patchProject({ notes: event.target.value })} rows={2} className="mt-1.5 w-full rounded-[8px] border border-[var(--line-strong)] px-3 py-2 outline-none focus:border-[var(--cyan-600)]" /></label>
              </div>
            </details>
          </div>
        </SectionCard>
      )}

      {step === 1 && (
        <SectionCard
          title="مراحل الإنتاج"
          actions={<button type="button" onClick={() => setAddOpen(true)} className="flex h-9 items-center gap-1 rounded-[8px] bg-[var(--cyan-600)] px-3 text-[13px] font-semibold text-white"><Plus size={14} /> إضافة مرحلة</button>}
        >
          {activeStages.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-[var(--line-strong)] px-5 py-10 text-center text-[13px] text-[var(--ink-500)]">أضف أول مرحلة طباعة أو قص أو تشطيب للمشروع.</div>
          ) : (
            <div className="space-y-3">
              {activeStages.map((stage) => {
                const index = project.stages.findIndex((candidate) => candidate.id === stage.id);
                return (
                <StageEditor
                  key={stage.id}
                  stage={stage}
                  index={index}
                  count={project.stages.length}
                  papers={papers}
                  machines={machines}
                  extraFields={sourceTemplate?.fields.filter((field) => {
                    const template = templateStages.find((row) => row.id === stage.templateStageId);
                    return Boolean(template?.fieldIds?.includes(field.id));
                  }) ?? []}
                  unit={unit}
                  onUnitChange={onUnitChange}
                  onPatch={(updater) => patchStage(stage.id, updater)}
                  onMontage={() => runStageMontage(stage)}
                  onOpenStudio={() => onOpenStudio(itemId, stage)}
                  onDuplicate={() => duplicateStage(stage.id)}
                  onMove={(direction) => moveStage(stage.id, direction)}
                  onRemove={() => removeStage(stage.id)}
                />
                );
              })}
            </div>
          )}
        </SectionCard>
      )}

      {(step === 2 || step === 3) && (
        <SectionCard title={step === 2 ? 'التسعير' : 'مراجعة Devis'}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-[13px]">
              <thead><tr className="border-b border-[var(--line)] text-[var(--ink-500)]"><th className="py-2 text-start">اسم المرحلة</th><th>النوع</th><th>الكمية</th><th>عدد الأوراق</th><th>تكلفة المرحلة</th><th>سعر الوحدة</th></tr></thead>
              <tbody>{activeStages.map((stage) => <tr key={stage.id} className="border-b border-[var(--line)]"><td className="py-3 font-semibold">{stage.name}</td><td className="text-center">{PRODUCTION_STAGE_LABELS[stage.kind]}</td><td dir="ltr" className="text-center font-latin">{stage.quantity}</td><td dir="ltr" className="text-center font-latin">{stage.montageResult?.sheetsNeeded ?? stage.calculation.sheets ?? '—'}</td><td dir="ltr" className="text-center font-latin">{formatDA(stage.totalCost)}</td><td dir="ltr" className="text-center font-latin">{formatDA(stage.unitCost)}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="mt-5 ms-auto grid max-w-md gap-3 rounded-[12px] bg-[var(--paper-50)] p-4 text-[14px]">
            <div className="flex justify-between"><span>إجمالي تكلفة المراحل</span><span dir="ltr" className="font-latin font-semibold">{formatDA(project.totals.stagesCost)}</span></div>
            {(project.totals.projectOptionsCost ?? 0) > 0 && <div className="flex justify-between text-[12px] text-[var(--ink-500)]"><span>منها اختيارات المشروع</span><span dir="ltr" className="font-latin">{formatDA(project.totals.projectOptionsCost ?? 0)}</span></div>}
            <NumberField label="هامش الربح" value={project.marginPercent} min={0} step={1} unitSuffix="%" onChange={(value) => patchProject({ marginPercent: value, manualUnitPrice: undefined })} />
            <div className="flex justify-between"><span>قيمة الهامش</span><span dir="ltr" className="font-latin">{formatDA(project.totals.marginAmount)}</span></div>
            <div className="flex justify-between border-t border-[var(--line)] pt-3 font-bold"><span>السعر النهائي HT</span><span dir="ltr" className="font-latin text-[var(--cyan-600)]">{formatDA(project.totals.priceHt)}</span></div>
            <div className="flex justify-between"><span>سعر الوحدة النهائي</span><span dir="ltr" className="font-latin font-semibold">{formatDA(project.totals.unitPriceHt)}</span></div>
            <div className="flex justify-between"><span>TVA <span dir="ltr" className="font-latin">{(taxRate * 100).toFixed(0)}%</span></span><span dir="ltr" className="font-latin">{formatDA(project.totals.priceHt * taxRate)}</span></div>
            <div className="flex justify-between border-t border-[var(--line)] pt-3 font-bold"><span>المجموع TTC</span><span dir="ltr" className="font-latin text-[var(--cyan-600)]">{formatDA(project.totals.priceHt * (1 + taxRate))}</span></div>
          </div>
          {step === 3 && <p className="mt-4 rounded-[10px] bg-[var(--cyan-50)] px-3 py-2 text-[12px] text-[var(--ink-600)]">ستُربط كل المراحل بنفس العميل ونفس Devis. تكاليف الإنتاج والهامش لا تظهر في PDF العميل.</p>}
        </SectionCard>
      )}

      <div className="flex items-center justify-between">
        <button type="button" onClick={() => step === 0 ? onBack() : setStep((current) => current - 1)} className="flex h-11 items-center gap-1 rounded-[9px] px-4 text-[14px] text-[var(--ink-600)]"><ChevronRight size={16} /> رجوع</button>
        {step < 3 ? (
          <button type="button" onClick={next} className="flex h-11 items-center gap-1 rounded-[9px] bg-[var(--cyan-600)] px-5 text-[14px] font-semibold text-white">التالي <ChevronLeft size={16} /></button>
        ) : (
          <button type="button" onClick={finish} className="flex h-11 items-center gap-1 rounded-[9px] bg-[var(--cyan-600)] px-5 text-[14px] font-semibold text-white"><Plus size={16} /> إضافة المشروع إلى العرض</button>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إضافة مرحلة إنتاج</DialogTitle><DialogDescription>اختر نوع المرحلة ثم أعطها اسمًا واضحًا.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{STAGE_KINDS.map((kind) => <button key={kind} type="button" onClick={() => setNewKind(kind)} className={cn('rounded-[9px] border px-3 py-3 text-[13px]', newKind === kind ? 'border-[var(--cyan-600)] bg-[var(--cyan-50)] text-[var(--cyan-600)]' : 'border-[var(--line)]')}>{PRODUCTION_STAGE_LABELS[kind]}</button>)}</div>
          <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="اسم المرحلة" className="h-10 rounded-[8px] border border-[var(--line-strong)] px-3 outline-none" />
          <DialogFooter><button type="button" onClick={() => setAddOpen(false)} className="h-10 rounded-[8px] px-4">إلغاء</button><button type="button" onClick={addStage} className="h-10 rounded-[8px] bg-[var(--cyan-600)] px-4 font-semibold text-white">إضافة</button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface StageEditorProps {
  stage: ProductionStage;
  index: number;
  count: number;
  papers: PaperType[];
  machines: Machine[];
  extraFields: ServiceField[];
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
  onPatch: (updater: (stage: ProductionStage) => ProductionStage) => void;
  onMontage: () => void;
  onOpenStudio: () => void;
  onDuplicate: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

function StageEditor({ stage, index, count, papers, machines, extraFields, unit, onUnitChange, onPatch, onMontage, onOpenStudio, onDuplicate, onMove, onRemove }: StageEditorProps) {
  const canAuto = stage.kind === 'print' && (stage.printCategory === 'digital' || stage.printCategory === 'offset');
  const compatibleMachines = machines.filter((machine) => machine.kind === stage.printCategory);
  const selectedMachine = compatibleMachines.find((machine) => machine.id === stage.machine?.id);
  const selectedSheet = selectedMachine?.sheetSizes.find((sheet) => sheet.id === stage.sheetSize?.id);
  const compatiblePapers = papers.filter((paper) => !stage.printCategory || !paper.allowedMachineKinds?.length || paper.allowedMachineKinds.includes(stage.printCategory));
  const variantForSheet = (paper: PaperType) => {
    const variants = (paper.variants ?? []).filter((variant) => variant.enabled);
    if (!selectedSheet) return variants.find((variant) => variant.widthMm === 0 && variant.heightMm === 0) ?? variants[0];
    return variants.find((variant) =>
      (variant.widthMm === selectedSheet.widthMm && variant.heightMm === selectedSheet.heightMm)
      || (variant.widthMm === selectedSheet.heightMm && variant.heightMm === selectedSheet.widthMm),
    ) ?? variants.find((variant) => variant.widthMm === 0 && variant.heightMm === 0);
  };
  return (
    <Collapsible defaultOpen={index === 0} className="overflow-hidden rounded-[12px] border border-[var(--line)] bg-white">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <CollapsibleTrigger title="تفاصيل المرحلة" className="flex min-w-0 flex-1 items-center gap-2 text-start"><ChevronDown size={15} /><span className="font-latin text-[12px] text-[var(--ink-400)]">{index + 1}</span><span className="truncate font-semibold">{stage.name}</span><span className="rounded-full bg-[var(--paper-100)] px-2 py-0.5 text-[11px]">{PRODUCTION_STAGE_LABELS[stage.kind]}</span></CollapsibleTrigger>
        <span className="text-[12px] text-[var(--ink-500)]">{stage.paper?.name ? `${stage.paper.name} · ` : ''}<span dir="ltr" className="font-latin">{stage.quantity} وحدة · {stage.montageResult?.sheetsNeeded ? `${stage.montageResult.sheetsNeeded} ورقة · ` : ''}{formatDA(stage.totalCost)}</span></span>
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', stage.montageState === 'stale' || stage.montageState === 'invalid' ? 'bg-amber-100 text-amber-700' : stage.totalCost > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-[var(--paper-100)] text-[var(--ink-500)]')}>{stage.montageState === 'stale' ? 'يحتاج حسابًا' : stage.montageState === 'invalid' ? 'غير صالح' : stage.totalCost > 0 ? 'محسوبة' : 'غير مسعّرة'}</span>
        <button type="button" title="تكرار" onClick={onDuplicate} className="p-1.5"><Copy size={14} /></button>
        <button type="button" disabled={index === 0} onClick={() => onMove(-1)} className="p-1.5 disabled:opacity-30">↑</button>
        <button type="button" disabled={index === count - 1} onClick={() => onMove(1)} className="p-1.5 disabled:opacity-30">↓</button>
        <button type="button" title="حذف" onClick={onRemove} className="p-1.5 text-[var(--danger-600)]"><Trash2 size={14} /></button>
      </div>
      <CollapsibleContent className="border-t border-[var(--line)] p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-[13px] font-medium">اسم المرحلة<input value={stage.name} onChange={(event) => onPatch((current) => ({ ...current, name: event.target.value }))} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line-strong)] px-3" /></label>
          <label className="text-[13px] font-medium">نوع المرحلة<select value={stage.kind} onChange={(event) => { const kind = event.target.value as ProductionStageKind; onPatch((current) => ({ ...current, kind, printCategory: kind === 'print' ? current.printCategory : undefined, calculation: kind === 'print' ? { mode: 'automatic', rate: 0 } : { mode: 'fixed', rate: 0 }, machine: kind === 'print' ? current.machine : undefined, paper: kind === 'print' ? current.paper : undefined, sheetSize: kind === 'print' ? current.sheetSize : undefined, montageState: kind === 'print' && current.montageResult ? 'stale' : undefined })); }} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-3">{STAGE_KINDS.map((kind) => <option key={kind} value={kind}>{PRODUCTION_STAGE_LABELS[kind]}</option>)}</select></label>
          <NumberField label="الكمية" value={stage.quantity} min={1} onChange={(value) => onPatch((current) => ({ ...current, quantity: value }))} />
          {stage.kind === 'print' ? (
            <label className="text-[13px] font-medium">طريقة الحساب<div className="mt-1 flex h-10 items-center rounded-[8px] border border-[var(--cyan-100)] bg-[var(--cyan-50)] px-3 text-[12px] font-semibold text-[var(--cyan-600)]">تلقائي بعد المونتاج</div></label>
          ) : (
            <label className="text-[13px] font-medium">طريقة الحساب<select value={stage.calculation.mode} onChange={(event) => onPatch((current) => ({ ...current, calculation: { ...current.calculation, mode: event.target.value as ProductionStage['calculation']['mode'] } }))} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-3"><option value="fixed">دج/الخدمة</option><option value="perUnit">دج/القطعة</option><option value="perSheet">دج/الورقة</option><option value="perFace">دج/الوجه</option><option value="perM2">دج/م²</option><option value="perCm2">دج/سم²</option></select></label>
          )}
          {stage.calculation.mode !== 'automatic' && <NumberField label={stage.calculation.mode === 'fixed' ? 'التكلفة الثابتة' : 'السعر'} value={stage.calculation.rate} min={0} unitSuffix="دج" onChange={(value) => onPatch((current) => ({ ...current, calculation: { ...current.calculation, rate: value } }))} />}
          {(stage.calculation.mode === 'perSheet' || stage.calculation.mode === 'perFace') && <NumberField label={stage.calculation.mode === 'perFace' ? 'عدد الأوجه' : 'عدد الأوراق'} value={stage.calculation.sheets} min={0} onChange={(value) => onPatch((current) => ({ ...current, calculation: { ...current.calculation, sheets: value } }))} />}
          {(stage.calculation.mode === 'perM2' || stage.calculation.mode === 'perCm2') && <DimensionGroup label="المقاس المستخدم في الحساب" value={stage.productSize ?? { widthMm: 100, heightMm: 100 }} unit={unit} onUnitChange={onUnitChange} onChange={(value) => onPatch((current) => ({ ...current, productSize: value }))} />}

          {stage.kind === 'print' && (
            <>
              <label className="text-[13px] font-medium">نوع الطباعة<select value={stage.printCategory ?? ''} onChange={(event) => onPatch((current) => ({ ...current, printCategory: event.target.value as ProductionStage['printCategory'], machine: undefined, sheetSize: undefined, paper: undefined, calculation: { mode: 'automatic', rate: 0 }, montageState: current.montageResult ? 'stale' : undefined }))} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-3"><option value="">اختر النوع</option><option value="digital">طباعة رقمية</option><option value="offset">طباعة أوفست</option></select></label>
              <label className="text-[13px] font-medium">الماكينة<select disabled={!stage.printCategory} value={stage.machine?.id ?? ''} onChange={(event) => { const machine = compatibleMachines.find((row) => row.id === event.target.value); if (machine) onPatch((current) => ({ ...current, machine: machineSnapshot(machine), sheetSize: machine.sheetSizes[0], paper: undefined, calculation: { mode: 'automatic', rate: 0 } })); }} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-3 disabled:bg-[var(--paper-100)]"><option value="">اختر الماكينة</option>{compatibleMachines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}</select></label>
              <label className="text-[13px] font-medium">مقاس الورقة<select disabled={!selectedMachine} value={stage.sheetSize?.id ?? ''} onChange={(event) => { const sheet = selectedMachine?.sheetSizes.find((row) => row.id === event.target.value); if (sheet) onPatch((current) => { const currentPaper = compatiblePapers.find((paper) => paper.id === current.paper?.id); const nextVariant = currentPaper ? ((currentPaper.variants ?? []).find((variant) => (variant.widthMm === sheet.widthMm && variant.heightMm === sheet.heightMm) || (variant.widthMm === sheet.heightMm && variant.heightMm === sheet.widthMm)) ?? (currentPaper.variants ?? []).find((variant) => variant.widthMm === 0 && variant.heightMm === 0)) : undefined; return { ...current, sheetSize: sheet, paper: currentPaper && nextVariant ? paperSnapshot(currentPaper, nextVariant) : undefined }; }); }} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-3 disabled:bg-[var(--paper-100)]"><option value="">اختر المقاس</option>{selectedMachine?.sheetSizes.map((sheet) => <option key={sheet.id} value={sheet.id}>{sheet.label}</option>)}</select></label>
              <label className="text-[13px] font-medium">الورق<select disabled={!selectedSheet} value={stage.paper?.id ?? ''} onChange={(event) => { const paper = compatiblePapers.find((row) => row.id === event.target.value); const variant = paper ? variantForSheet(paper) : undefined; onPatch((current) => ({ ...current, paper: paper && variant ? paperSnapshot(paper, variant) : undefined })); }} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-3 disabled:bg-[var(--paper-100)]"><option value="">اختر الورق</option>{compatiblePapers.filter((paper) => Boolean(variantForSheet(paper))).map((paper) => { const variant = variantForSheet(paper); return <option key={paper.id} value={paper.id}>{paper.name}{variant ? ` — ${variant.label} — ${variant.pricePerSheet} دج` : ''}</option>; })}</select></label>
              <DimensionGroup label="مقاس المنتج النهائي" value={stage.productSize ?? { widthMm: 100, heightMm: 100 }} unit={unit} onUnitChange={onUnitChange} onChange={(value) => onPatch((current) => ({ ...current, productSize: value }))} />
              <label className="text-[13px] font-medium">الأوجه<select value={stage.printMethod ?? 'recto'} onChange={(event) => onPatch((current) => ({ ...current, printMethod: event.target.value as ProductionStage['printMethod'] }))} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-3"><option value="recto">وجه واحد</option><option value="recto-verso">وجهان</option></select></label>
              <label className="text-[13px] font-medium">الألوان<input value={stage.colorLabel ?? ''} onChange={(event) => onPatch((current) => ({ ...current, colorLabel: event.target.value }))} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line-strong)] px-3" /></label>
              {canAuto && <div className="md:col-span-2 flex flex-wrap items-center gap-3 rounded-[10px] bg-[var(--cyan-50)] p-3"><button type="button" onClick={onMontage} className="flex h-10 items-center gap-2 rounded-[8px] bg-[var(--cyan-600)] px-4 text-[13px] font-semibold text-white"><Sparkles size={15} /> حساب المونتاج</button><button type="button" onClick={onOpenStudio} className="flex h-10 items-center gap-2 rounded-[8px] border border-[var(--cyan-600)] bg-white px-4 text-[13px] font-semibold text-[var(--cyan-600)]"><PanelTop size={15} /> فتح Montage Studio</button>{stage.montageResult && <span className="text-[12px] text-[var(--ink-600)]"><span dir="ltr" className="font-latin">{stage.montageResult.copiesPerSheet}</span> قطعة/ورقة · <span dir="ltr" className="font-latin">{stage.montageResult.sheetsNeeded}</span> ورقة · هدر <span dir="ltr" className="font-latin">{stage.montageResult.wastePercent.toFixed(1)}%</span>{stage.montageState === 'stale' && <strong className="ms-2 text-[#B45309]">يحتاج إعادة حساب</strong>}</span>}</div>}
            </>
          )}
          {extraFields.map((field) => (
            <TemplateFieldInput key={field.id} field={field} value={stage.fieldValues?.[field.id]} onChange={(value) => onPatch((current) => ({ ...current, fieldValues: { ...(current.fieldValues ?? {}), [field.id]: value } }))} unit={unit} onUnitChange={onUnitChange} />
          ))}
        </div>
        <details className="mt-4 rounded-[9px] border border-[var(--line)] px-3 py-2"><summary className="cursor-pointer text-[12px] font-medium text-[var(--ink-600)]">إعدادات متقدمة وملاحظات</summary><textarea value={stage.notes ?? ''} onChange={(event) => onPatch((current) => ({ ...current, notes: event.target.value }))} rows={3} className="mt-3 w-full rounded-[8px] border border-[var(--line-strong)] px-3 py-2 text-[13px]" /></details>
      </CollapsibleContent>
    </Collapsible>
  );
}

function TemplateFieldInput({
  field,
  value,
  onChange,
  unit,
  onUnitChange,
}: {
  field: ServiceField;
  value: string | number | boolean | { widthMm: number; heightMm: number } | undefined;
  onChange: (value: string | number | boolean | { widthMm: number; heightMm: number }) => void;
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
}) {
  if (field.type === 'dimensions') {
    const dimension = typeof value === 'object' && value && 'widthMm' in value ? value : { widthMm: 100, heightMm: 100 };
    return <DimensionGroup label={field.label} value={dimension} unit={unit} onUnitChange={onUnitChange} onChange={onChange} />;
  }
  if (field.type === 'select') {
    return (
      <label className="text-[13px] font-medium">{field.label}{field.required ? ' *' : ''}
        <select value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-3">
          <option value="">اختر…</option>
          {(field.options ?? []).map((option) => <option key={option.id} value={option.id}>{option.label}{option.latinLabel ? ` — ${option.latinLabel}` : ''}</option>)}
        </select>
      </label>
    );
  }
  if (field.type === 'yesno') {
    return <label className="flex h-10 items-center justify-between rounded-[8px] border border-[var(--line-strong)] px-3 text-[13px] font-medium"><span>{field.label}</span><input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-[var(--cyan-600)]" /></label>;
  }
  return (
    <label className="text-[13px] font-medium">{field.label}{field.required ? ' *' : ''}
      <input
        type={field.type === 'number' ? 'number' : 'text'}
        value={typeof value === 'number' || typeof value === 'string' ? value : ''}
        min={field.min}
        max={field.max}
        step={field.step}
        placeholder={field.placeholder}
        onChange={(event) => onChange(field.type === 'number' ? Number(event.target.value) || 0 : event.target.value)}
        className={cn('mt-1 h-10 w-full rounded-[8px] border border-[var(--line-strong)] px-3', field.type === 'number' && 'font-latin')}
      />
    </label>
  );
}
