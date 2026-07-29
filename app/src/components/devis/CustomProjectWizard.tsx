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
  buildCustomProjectItem,
  emptyProductionStage,
  duplicateProductionStage,
  montageSignatureForStage,
  moveProductionStage,
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
  PricingRule,
  ProductionStage,
  ProductionStageKind,
  Section,
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
  initialItem?: CustomProjectDevisItem;
  order: number;
  onDraftChange: (item: CustomProjectDevisItem) => void;
  onComplete: (item: CustomProjectDevisItem) => void;
  onOpenStudio: (itemId: string, stage: ProductionStage) => void;
  onBack: () => void;
}

function blankProject(section: Section, margin: number): CustomProjectSnapshot {
  return {
    schemaVersion: 1,
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
    margins: { ...machine.margins },
    priseDePince: machine.priseDePince,
  };
}

function paperSnapshot(paper: PaperType) {
  return { id: paper.id, name: paper.name, gsm: paper.gsm, pricePerSheet: paper.pricePerSheet };
}

export default function CustomProjectWizard({
  section,
  rules,
  defaultMargin,
  taxRate,
  unit,
  onUnitChange,
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
    repriceCustomProject(initialItem?.customProject ?? blankProject(section, defaultMargin), rules),
  );
  const [addOpen, setAddOpen] = useState(false);
  const [newKind, setNewKind] = useState<ProductionStageKind>('print');
  const [newName, setNewName] = useState('');
  const papers = useMemo(() => db.papers.list().filter((paper) => paper.enabled), []);
  const machines = useMemo(
    () => db.machines.list().filter((machine) => machine.enabled && machine.kind === project.printCategory),
    [project.printCategory],
  );

  const commit = (nextInput: CustomProjectSnapshot, completion: 'draft' | 'complete' = 'draft') => {
    const next = repriceCustomProject({ ...nextInput, completion }, rules);
    setProject(next);
    const item = buildCustomProjectItem(itemId, initialItem?.order ?? order, next, rules);
    if (completion === 'complete') onComplete(item);
    else onDraftChange(item);
    return next;
  };

  const patchProject = (patch: Partial<CustomProjectSnapshot>) => commit({ ...project, ...patch });

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
    if (!stage.productSize || !stage.sheetSize || !stage.machine) {
      toast.error('اختر الماكينة والورقة والمقاس النهائي أولًا');
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
    const result = computeMontage(input, machines);
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
            <NumberField label="الكمية النهائية *" value={project.finalQuantity} min={1} onChange={(value) => patchProject({ finalQuantity: value })} />
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
          {project.stages.length === 0 ? (
            <div className="rounded-[12px] border border-dashed border-[var(--line-strong)] px-5 py-10 text-center text-[13px] text-[var(--ink-500)]">أضف أول مرحلة طباعة أو قص أو تشطيب للمشروع.</div>
          ) : (
            <div className="space-y-3">
              {project.stages.map((stage, index) => (
                <StageEditor
                  key={stage.id}
                  stage={stage}
                  index={index}
                  count={project.stages.length}
                  printCategory={project.printCategory}
                  papers={papers}
                  machines={machines}
                  unit={unit}
                  onUnitChange={onUnitChange}
                  onPatch={(updater) => patchStage(stage.id, updater)}
                  onMontage={() => runStageMontage(stage)}
                  onOpenStudio={() => onOpenStudio(itemId, stage)}
                  onDuplicate={() => duplicateStage(stage.id)}
                  onMove={(direction) => moveStage(stage.id, direction)}
                  onRemove={() => removeStage(stage.id)}
                />
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {(step === 2 || step === 3) && (
        <SectionCard title={step === 2 ? 'التسعير' : 'مراجعة Devis'}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-[13px]">
              <thead><tr className="border-b border-[var(--line)] text-[var(--ink-500)]"><th className="py-2 text-start">اسم المرحلة</th><th>النوع</th><th>الكمية</th><th>عدد الأوراق</th><th>تكلفة المرحلة</th><th>سعر الوحدة</th></tr></thead>
              <tbody>{project.stages.map((stage) => <tr key={stage.id} className="border-b border-[var(--line)]"><td className="py-3 font-semibold">{stage.name}</td><td className="text-center">{PRODUCTION_STAGE_LABELS[stage.kind]}</td><td dir="ltr" className="text-center font-latin">{stage.quantity}</td><td dir="ltr" className="text-center font-latin">{stage.montageResult?.sheetsNeeded ?? stage.calculation.sheets ?? '—'}</td><td dir="ltr" className="text-center font-latin">{formatDA(stage.totalCost)}</td><td dir="ltr" className="text-center font-latin">{formatDA(stage.unitCost)}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="mt-5 ms-auto grid max-w-md gap-3 rounded-[12px] bg-[var(--paper-50)] p-4 text-[14px]">
            <div className="flex justify-between"><span>إجمالي تكلفة المراحل</span><span dir="ltr" className="font-latin font-semibold">{formatDA(project.totals.stagesCost)}</span></div>
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
  printCategory: Section['printCategory'];
  papers: PaperType[];
  machines: Machine[];
  unit: Unit;
  onUnitChange: (unit: Unit) => void;
  onPatch: (updater: (stage: ProductionStage) => ProductionStage) => void;
  onMontage: () => void;
  onOpenStudio: () => void;
  onDuplicate: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

function StageEditor({ stage, index, count, printCategory, papers, machines, unit, onUnitChange, onPatch, onMontage, onOpenStudio, onDuplicate, onMove, onRemove }: StageEditorProps) {
  const canAuto = stage.kind === 'print' && (printCategory === 'digital' || printCategory === 'offset');
  return (
    <Collapsible defaultOpen={index === 0} className="overflow-hidden rounded-[12px] border border-[var(--line)] bg-white">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <CollapsibleTrigger title="تفاصيل المرحلة" className="flex min-w-0 flex-1 items-center gap-2 text-start"><ChevronDown size={15} /><span className="font-latin text-[12px] text-[var(--ink-400)]">{index + 1}</span><span className="truncate font-semibold">{stage.name}</span><span className="rounded-full bg-[var(--paper-100)] px-2 py-0.5 text-[11px]">{PRODUCTION_STAGE_LABELS[stage.kind]}</span></CollapsibleTrigger>
        <span dir="ltr" className="font-latin text-[12px] text-[var(--ink-500)]">{stage.quantity} وحدة · {stage.montageResult?.sheetsNeeded ? `${stage.montageResult.sheetsNeeded} ورقة · ` : ''}{formatDA(stage.totalCost)}</span>
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', stage.montageState === 'stale' || stage.montageState === 'invalid' ? 'bg-amber-100 text-amber-700' : stage.totalCost > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-[var(--paper-100)] text-[var(--ink-500)]')}>{stage.montageState === 'stale' ? 'يحتاج حسابًا' : stage.montageState === 'invalid' ? 'غير صالح' : stage.totalCost > 0 ? 'محسوبة' : 'غير مسعّرة'}</span>
        <button type="button" title="تكرار" onClick={onDuplicate} className="p-1.5"><Copy size={14} /></button>
        <button type="button" disabled={index === 0} onClick={() => onMove(-1)} className="p-1.5 disabled:opacity-30">↑</button>
        <button type="button" disabled={index === count - 1} onClick={() => onMove(1)} className="p-1.5 disabled:opacity-30">↓</button>
        <button type="button" title="حذف" onClick={onRemove} className="p-1.5 text-[var(--danger-600)]"><Trash2 size={14} /></button>
      </div>
      <CollapsibleContent className="border-t border-[var(--line)] p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-[13px] font-medium">اسم المرحلة<input value={stage.name} onChange={(event) => onPatch((current) => ({ ...current, name: event.target.value }))} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line-strong)] px-3" /></label>
          <NumberField label="الكمية" value={stage.quantity} min={1} onChange={(value) => onPatch((current) => ({ ...current, quantity: value }))} />
          <label className="text-[13px] font-medium">طريقة الحساب<select value={stage.calculation.mode} onChange={(event) => onPatch((current) => ({ ...current, calculation: { ...current.calculation, mode: event.target.value as ProductionStage['calculation']['mode'] } }))} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-3">{canAuto && <option value="automatic">تلقائي بالمونتاج</option>}<option value="perUnit">لكل وحدة</option><option value="perSheet">لكل ورقة</option><option value="fixed">ثابت</option></select></label>
          {stage.calculation.mode !== 'automatic' && <NumberField label={stage.calculation.mode === 'fixed' ? 'التكلفة الثابتة' : 'السعر'} value={stage.calculation.rate} min={0} unitSuffix="دج" onChange={(value) => onPatch((current) => ({ ...current, calculation: { ...current.calculation, rate: value } }))} />}
          {stage.calculation.mode === 'perSheet' && <NumberField label="عدد الأوراق" value={stage.calculation.sheets} min={0} onChange={(value) => onPatch((current) => ({ ...current, calculation: { ...current.calculation, sheets: value } }))} />}

          {stage.kind === 'print' && (
            <>
              <label className="text-[13px] font-medium">الورق<select value={stage.paper?.id ?? ''} onChange={(event) => { const paper = papers.find((row) => row.id === event.target.value); if (paper) onPatch((current) => ({ ...current, paper: paperSnapshot(paper) })); }} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-3"><option value="">اختر الورق</option>{papers.map((paper) => <option key={paper.id} value={paper.id}>{paper.name}</option>)}</select></label>
              <label className="text-[13px] font-medium">الماكينة<select value={stage.machine?.id ?? ''} onChange={(event) => { const machine = machines.find((row) => row.id === event.target.value); if (machine) onPatch((current) => ({ ...current, machine: machineSnapshot(machine), sheetSize: machine.sheetSizes[0] })); }} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-3"><option value="">اختر الماكينة</option>{machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}</select></label>
              <label className="text-[13px] font-medium">مقاس الورقة<select value={stage.sheetSize?.id ?? ''} onChange={(event) => { const machine = machines.find((row) => row.id === stage.machine?.id); const sheet = machine?.sheetSizes.find((row) => row.id === event.target.value); if (sheet) onPatch((current) => ({ ...current, sheetSize: sheet })); }} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-3"><option value="">اختر المقاس</option>{machines.find((machine) => machine.id === stage.machine?.id)?.sheetSizes.map((sheet) => <option key={sheet.id} value={sheet.id}>{sheet.label}</option>)}</select></label>
              <DimensionGroup label="مقاس المنتج النهائي" value={stage.productSize ?? { widthMm: 100, heightMm: 100 }} unit={unit} onUnitChange={onUnitChange} onChange={(value) => onPatch((current) => ({ ...current, productSize: value }))} />
              <label className="text-[13px] font-medium">الأوجه<select value={stage.printMethod ?? 'recto'} onChange={(event) => onPatch((current) => ({ ...current, printMethod: event.target.value as ProductionStage['printMethod'] }))} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-3"><option value="recto">وجه واحد</option><option value="recto-verso">وجهان</option></select></label>
              <label className="text-[13px] font-medium">الألوان<input value={stage.colorLabel ?? ''} onChange={(event) => onPatch((current) => ({ ...current, colorLabel: event.target.value }))} className="mt-1 h-10 w-full rounded-[8px] border border-[var(--line-strong)] px-3" /></label>
              {canAuto && <div className="md:col-span-2 flex flex-wrap items-center gap-3 rounded-[10px] bg-[var(--cyan-50)] p-3"><button type="button" onClick={onMontage} className="flex h-10 items-center gap-2 rounded-[8px] bg-[var(--cyan-600)] px-4 text-[13px] font-semibold text-white"><Sparkles size={15} /> حساب المونتاج الذكي</button><button type="button" onClick={onOpenStudio} className="flex h-10 items-center gap-2 rounded-[8px] border border-[var(--cyan-600)] bg-white px-4 text-[13px] font-semibold text-[var(--cyan-600)]"><PanelTop size={15} /> فتح Montage Studio</button>{stage.montageResult && <span className="text-[12px] text-[var(--ink-600)]"><span dir="ltr" className="font-latin">{stage.montageResult.copiesPerSheet}</span> نسخة/ورقة · <span dir="ltr" className="font-latin">{stage.montageResult.sheetsNeeded}</span> ورقة · هدر <span dir="ltr" className="font-latin">{stage.montageResult.wastePercent.toFixed(1)}%</span>{stage.montageState === 'stale' && <strong className="ms-2 text-[#B45309]">يحتاج إعادة حساب</strong>}</span>}</div>}
            </>
          )}
        </div>
        <details className="mt-4 rounded-[9px] border border-[var(--line)] px-3 py-2"><summary className="cursor-pointer text-[12px] font-medium text-[var(--ink-600)]">إعدادات متقدمة وملاحظات</summary><textarea value={stage.notes ?? ''} onChange={(event) => onPatch((current) => ({ ...current, notes: event.target.value }))} rows={3} className="mt-3 w-full rounded-[8px] border border-[var(--line-strong)] px-3 py-2 text-[13px]" /></details>
      </CollapsibleContent>
    </Collapsible>
  );
}
