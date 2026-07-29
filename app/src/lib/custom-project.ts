import { percentRuleValue } from './pricing-engine';
import type {
  CustomProjectDevisItem,
  CustomProjectSnapshot,
  CustomProjectTotals,
  DevisItem,
  PreflightCheck,
  PriceBreakdown,
  PricingRule,
  PrintCategory,
  ProductionStage,
  ProductionStageKind,
} from './types';

const EMPTY_PRICE: PriceBreakdown = {
  paper: 0,
  printing: 0,
  cutting: 0,
  finishing: 0,
  waste: 0,
  overhead: 0,
  margin: 0,
  subtotal: 0,
  unitPrice: 0,
  total: 0,
};

export const PRODUCTION_STAGE_LABELS: Record<ProductionStageKind, string> = {
  print: 'طباعة',
  cut: 'قص',
  assembly: 'تجميع',
  finishing: 'تشطيب',
  packaging: 'تغليف',
  other: 'أخرى',
};

export function money(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

export function isCustomProjectItem(item: DevisItem): item is CustomProjectDevisItem {
  return item.kind === 'custom-project';
}

export function isBillableDevisItem(item: DevisItem): boolean {
  return !isCustomProjectItem(item) || item.customProject.completion === 'complete';
}

export function montageSignatureForStage(stage: ProductionStage): string {
  return JSON.stringify({
    kind: stage.kind,
    quantity: stage.quantity,
    paperId: stage.paper?.id,
    paperPrice: stage.paper?.pricePerSheet,
    machineId: stage.machine?.id,
    sheet: stage.sheetSize ? [stage.sheetSize.widthMm, stage.sheetSize.heightMm] : null,
    product: stage.productSize ? [stage.productSize.widthMm, stage.productSize.heightMm] : null,
    method: stage.printMethod,
  });
}

export function emptyProductionStage(
  id: string,
  order: number,
  kind: ProductionStageKind,
  quantity: number,
  printCategory: PrintCategory,
): ProductionStage {
  const canAuto = kind === 'print' && (printCategory === 'digital' || printCategory === 'offset');
  return {
    id,
    order,
    kind,
    name: `${PRODUCTION_STAGE_LABELS[kind]} ${order + 1}`,
    quantity: Math.max(1, quantity || 1),
    productSize: kind === 'print' ? { widthMm: 100, heightMm: 100 } : undefined,
    printMethod: kind === 'print' ? 'recto' : undefined,
    colorLabel: kind === 'print' ? 'ألوان' : undefined,
    calculation: { mode: canAuto ? 'automatic' : 'perUnit', rate: 0 },
    pricing: { ...EMPTY_PRICE },
    unitCost: 0,
    totalCost: 0,
  };
}

export function normalizeProductionStageOrder(stages: ProductionStage[]): ProductionStage[] {
  return stages.map((stage, order) => ({ ...stage, order }));
}

export function removeProductionStage(stages: ProductionStage[], id: string): ProductionStage[] {
  return normalizeProductionStageOrder(stages.filter((stage) => stage.id !== id));
}

export function duplicateProductionStage(stages: ProductionStage[], id: string, newId: string): ProductionStage[] {
  const index = stages.findIndex((stage) => stage.id === id);
  if (index < 0) return stages;
  const source = stages[index];
  const copy = { ...structuredClone(source), id: newId, name: `${source.name} (نسخة)` };
  return normalizeProductionStageOrder([...stages.slice(0, index + 1), copy, ...stages.slice(index + 1)]);
}

export function moveProductionStage(stages: ProductionStage[], id: string, direction: -1 | 1): ProductionStage[] {
  const index = stages.findIndex((stage) => stage.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= stages.length) return stages;
  const next = [...stages];
  [next[index], next[target]] = [next[target], next[index]];
  return normalizeProductionStageOrder(next);
}

export function repriceProductionStage(stage: ProductionStage, rules: PricingRule[]): ProductionStage {
  const quantity = Math.max(1, Number(stage.quantity) || 1);
  let pricing: PriceBreakdown = { ...EMPTY_PRICE };

  if (stage.calculation.mode === 'automatic') {
    const montage = stage.montageResult;
    if (stage.kind === 'print' && montage && stage.paper && stage.machine) {
      const paper = montage.sheetsNeeded * Math.max(0, stage.paper.pricePerSheet);
      const setupRule =
        stage.machine.kind === 'offset'
          ? rules.find((rule) => rule.enabled && rule.basis === 'fixed' && rule.appliesTo === 'printing' && rule.id.includes('offset'))
          : undefined;
      const printing =
        montage.sheetsNeeded * montage.facesPerSheet * Math.max(0, stage.machine.costPerFace) +
        Math.max(0, setupRule?.value ?? 0);
      const base = paper + printing;
      const waste = (base * percentRuleValue(rules, 'waste')) / 100;
      const overhead = ((base + waste) * percentRuleValue(rules, 'overhead')) / 100;
      const subtotal = money(base + waste + overhead);
      pricing = {
        ...EMPTY_PRICE,
        paper: money(paper),
        printing: money(printing),
        waste: money(waste),
        overhead: money(overhead),
        subtotal,
        unitPrice: money(subtotal / quantity),
        total: subtotal,
      };
    }
  } else {
    const rate = Math.max(0, Number(stage.calculation.rate) || 0);
    const sheets = Math.max(0, Number(stage.calculation.sheets) || (stage.montageState === 'confirmed' ? stage.montageResult?.sheetsNeeded ?? 0 : 0));
    const total = money(
      stage.calculation.mode === 'perUnit'
        ? rate * quantity
        : stage.calculation.mode === 'perSheet'
          ? rate * sheets
          : rate,
    );
    const category = stage.kind === 'cut' ? 'cutting' : 'finishing';
    pricing = {
      ...EMPTY_PRICE,
      [category]: total,
      subtotal: total,
      unitPrice: money(total / quantity),
      total,
    };
  }

  return {
    ...stage,
    quantity,
    pricing,
    unitCost: pricing.unitPrice,
    totalCost: pricing.total,
  };
}

export function calculateCustomProjectTotals(
  stages: ProductionStage[],
  finalQuantity: number,
  marginPercent: number,
  manualUnitPrice?: number,
): CustomProjectTotals {
  const quantity = Math.max(1, Number(finalQuantity) || 1);
  const stagesCost = money(stages.reduce((sum, stage) => sum + Math.max(0, stage.totalCost), 0));
  const unitPriceHt = money(
    manualUnitPrice !== undefined
      ? Math.max(0, manualUnitPrice)
      : (stagesCost * (1 + Math.max(0, marginPercent) / 100)) / quantity,
  );
  const priceHt = money(unitPriceHt * quantity);
  const marginAmount = money(priceHt - stagesCost);
  const effectiveMargin = stagesCost > 0 ? money((marginAmount / stagesCost) * 100) : 0;
  return { stagesCost, marginAmount, marginPercent: effectiveMargin, priceHt, unitPriceHt };
}

export function repriceCustomProject(project: CustomProjectSnapshot, rules: PricingRule[]): CustomProjectSnapshot {
  const stages = project.stages
    .map((stage, index) => repriceProductionStage({ ...stage, order: index }, rules))
    .sort((a, b) => a.order - b.order);
  return {
    ...project,
    finalQuantity: Math.max(1, Number(project.finalQuantity) || 1),
    stages,
    totals: calculateCustomProjectTotals(stages, project.finalQuantity, project.marginPercent, project.manualUnitPrice),
  };
}

export function validateCustomProject(project: CustomProjectSnapshot): string[] {
  const errors: string[] = [];
  if (!project.name.trim()) errors.push('اسم المشروع مطلوب.');
  if (!Number.isFinite(project.finalQuantity) || project.finalQuantity <= 0) errors.push('الكمية النهائية يجب أن تكون أكبر من صفر.');
  if (project.stages.length === 0) errors.push('أضف مرحلة إنتاج واحدة على الأقل.');

  project.stages.forEach((stage, index) => {
    const prefix = `المرحلة ${index + 1}`;
    if (!stage.name.trim()) errors.push(`${prefix}: الاسم مطلوب.`);
    if (!Number.isFinite(stage.quantity) || stage.quantity <= 0) errors.push(`${prefix}: الكمية غير صالحة.`);
    if (stage.calculation.mode === 'automatic') {
      if (project.printCategory !== 'digital' && project.printCategory !== 'offset') errors.push(`${prefix}: المونتاج الذكي متاح للطباعة الرقمية والأوفست فقط.`);
      if (stage.kind !== 'print') errors.push(`${prefix}: الحساب الآلي مخصص للطباعة.`);
      if (!stage.paper || !stage.machine || !stage.sheetSize || !stage.productSize) errors.push(`${prefix}: أكمل الورق والماكينة والمقاسات.`);
      if (stage.montageState !== 'confirmed' || !stage.montageResult) errors.push(`${prefix}: احسب المونتاج الذكي واعتمده.`);
      if (stage.montageSignature !== montageSignatureForStage(stage)) errors.push(`${prefix}: المونتاج قديم ويحتاج إعادة حساب.`);
    }
    if (stage.calculation.mode === 'perSheet' && !stage.montageResult && !(stage.calculation.sheets && stage.calculation.sheets > 0)) {
      errors.push(`${prefix}: أدخل عدد الأوراق.`);
    }
    if (stage.calculation.mode !== 'automatic' && (!Number.isFinite(stage.calculation.rate) || stage.calculation.rate < 0)) {
      errors.push(`${prefix}: قيمة الحساب غير صالحة.`);
    }
  });
  return errors;
}

export function customProjectPreflight(project: CustomProjectSnapshot): PreflightCheck[] {
  const errors = validateCustomProject(project);
  if (errors.length === 0) return [{ key: 'custom-project', label: 'مراحل المشروع', status: 'ok' }];
  return errors.map((message, index) => ({
    key: `custom-project-${index}`,
    label: 'مراحل المشروع',
    status: 'error' as const,
    message,
  }));
}

export function buildCustomProjectItem(
  id: string,
  order: number,
  projectInput: CustomProjectSnapshot,
  rules: PricingRule[],
): CustomProjectDevisItem {
  const project = repriceCustomProject(projectInput, rules);
  const complete = project.completion === 'complete';
  const aggregated = project.stages.reduce(
    (out, stage) => ({
      paper: out.paper + stage.pricing.paper,
      printing: out.printing + stage.pricing.printing,
      cutting: out.cutting + stage.pricing.cutting,
      finishing: out.finishing + stage.pricing.finishing,
      waste: out.waste + stage.pricing.waste,
      overhead: out.overhead + stage.pricing.overhead,
    }),
    { paper: 0, printing: 0, cutting: 0, finishing: 0, waste: 0, overhead: 0 },
  );
  const pricing: PriceBreakdown = {
    ...aggregated,
    margin: project.totals.marginAmount,
    subtotal: project.totals.stagesCost,
    unitPrice: project.totals.unitPriceHt,
    total: project.totals.priceHt,
  };
  return {
    id,
    order,
    kind: 'custom-project',
    serviceName: project.name || 'Projet personnalisé',
    quantity: project.finalQuantity,
    customProject: project,
    preflight: customProjectPreflight(project),
    pricing,
    unitPrice: complete ? pricing.unitPrice : 0,
    total: complete ? pricing.total : 0,
  };
}
