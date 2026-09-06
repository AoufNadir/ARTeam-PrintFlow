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
  Service,
  ServiceField,
  ServiceStageTemplate,
  Section,
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
    printCategory: stage.printCategory,
    quantity: stage.quantity,
    paperId: stage.paper?.id,
    paperVariantId: stage.paper?.variantId,
    paperPrice: stage.paper?.pricePerSheet,
    machineId: stage.machine?.id,
    machinePricing: stage.machine?.pricing,
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
    printCategory: canAuto ? printCategory : undefined,
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

function serviceOptionCost(
  service: Service | undefined,
  fieldIds: string[],
  values: ProductionStage['fieldValues'] | CustomProjectSnapshot['projectFieldValues'],
  context: { quantity: number; sheets: number; faces: number; areaM2: number; base: number },
): number {
  if (!service || !values) return 0;
  let absolute = 0;
  let percent = 0;
  for (const field of service.fields.filter((candidate) => fieldIds.includes(candidate.id))) {
    const value = values[field.id];
    const option = field.type === 'yesno'
      ? value === true ? field.options?.[0] : undefined
      : field.type === 'select' && typeof value === 'string'
        ? field.options?.find((candidate) => candidate.id === value)
        : undefined;
    if (!option || !Number.isFinite(option.priceDelta)) continue;
    const rate = option.priceDelta;
    if (option.deltaUnit === 'percent') percent += rate;
    else if (option.deltaUnit === 'perCopy') absolute += rate * context.quantity;
    else if (option.deltaUnit === 'perSheet') absolute += rate * context.sheets;
    else if (option.deltaUnit === 'perFace') absolute += rate * context.faces;
    else if (option.deltaUnit === 'perM2') absolute += rate * context.areaM2;
    else if (option.deltaUnit === 'perCm2') absolute += rate * context.areaM2 * 10000;
    else absolute += rate;
  }
  return money(absolute + ((context.base + absolute) * percent) / 100);
}

export function repriceProductionStage(stage: ProductionStage, rules: PricingRule[], service?: Service): ProductionStage {
  if (stage.enabled === false) {
    return { ...stage, pricing: { ...EMPTY_PRICE }, unitCost: 0, totalCost: 0 };
  }
  const quantity = Math.max(1, Number(stage.quantity) || 1);
  let pricing: PriceBreakdown = { ...EMPTY_PRICE };
  const serviceStage = service?.stageTemplates?.find((template) => template.id === stage.templateStageId);
  const areaM2 = stage.productSize
    ? (stage.productSize.widthMm / 1000) * (stage.productSize.heightMm / 1000) * quantity
    : 0;

  if (stage.calculation.mode === 'automatic') {
    const montage = stage.montageResult;
    if (stage.kind === 'print' && montage && stage.paper && stage.machine) {
      const paper = montage.sheetsNeeded * Math.max(0, stage.paper.pricePerSheet);
      const printedFaces = montage.sheetsNeeded * montage.facesPerSheet;
      const tariff = stage.machine.pricing;
      const legacySetup =
        !tariff && stage.machine.kind === 'offset'
          ? Math.max(0, rules.find((rule) => rule.enabled && rule.basis === 'fixed' && rule.appliesTo === 'printing' && rule.id.includes('offset'))?.value ?? 0)
          : 0;
      const runCost = tariff
        ? tariff.basis === 'perSheet'
          ? montage.sheetsNeeded * Math.max(0, tariff.rate)
          : tariff.basis === 'per1000Faces'
            ? (printedFaces / 1000) * Math.max(0, tariff.rate)
            : printedFaces * Math.max(0, tariff.rate)
        : printedFaces * Math.max(0, stage.machine.costPerFace);
      const printing = tariff
        ? Math.max(Math.max(0, tariff.minimumCharge ?? 0), Math.max(0, tariff.setupCost ?? 0) + runCost)
        : runCost + legacySetup;
      const baseBeforeOptions = paper + printing;
      const finishing = serviceOptionCost(service, serviceStage?.fieldIds ?? [], stage.fieldValues, {
        quantity,
        sheets: montage.sheetsNeeded,
        faces: printedFaces,
        areaM2,
        base: baseBeforeOptions,
      });
      const base = baseBeforeOptions + finishing;
      const waste = (base * percentRuleValue(rules, 'waste')) / 100;
      const overhead = ((base + waste) * percentRuleValue(rules, 'overhead')) / 100;
      const subtotal = money(base + waste + overhead);
      pricing = {
        ...EMPTY_PRICE,
        paper: money(paper),
        printing: money(printing),
        finishing,
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
    const faces = sheets * (stage.montageResult?.facesPerSheet ?? 1);
    const manualBase = money(
      stage.calculation.mode === 'perUnit'
        ? rate * quantity
        : stage.calculation.mode === 'perSheet'
          ? rate * sheets
          : stage.calculation.mode === 'perFace'
            ? rate * faces
            : stage.calculation.mode === 'perM2'
              ? rate * areaM2
              : stage.calculation.mode === 'perCm2'
                ? rate * areaM2 * 10000
                : rate,
    );
    const optionCost = serviceOptionCost(service, serviceStage?.fieldIds ?? [], stage.fieldValues, { quantity, sheets, faces, areaM2, base: manualBase });
    const total = money(manualBase + optionCost);
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
  projectOptionsCost = 0,
): CustomProjectTotals {
  const quantity = Math.max(1, Number(finalQuantity) || 1);
  const stagesCost = money(stages.reduce((sum, stage) => sum + Math.max(0, stage.totalCost), 0) + Math.max(0, projectOptionsCost));
  const unitPriceHt = money(
    manualUnitPrice !== undefined
      ? Math.max(0, manualUnitPrice)
      : (stagesCost * (1 + Math.max(0, marginPercent) / 100)) / quantity,
  );
  const priceHt = money(unitPriceHt * quantity);
  const marginAmount = money(priceHt - stagesCost);
  const effectiveMargin = stagesCost > 0 ? money((marginAmount / stagesCost) * 100) : 0;
  return { stagesCost, projectOptionsCost: money(projectOptionsCost), marginAmount, marginPercent: effectiveMargin, priceHt, unitPriceHt };
}

export function repriceCustomProject(project: CustomProjectSnapshot, rules: PricingRule[]): CustomProjectSnapshot {
  const conditioned = applyProjectStageConditions(project);
  const service = conditioned.templateSnapshot;
  const stages = conditioned.stages
    .map((stage, index) => repriceProductionStage({ ...stage, order: index }, rules, service))
    .sort((a, b) => a.order - b.order);
  const stageFieldIds = new Set(service?.stageTemplates?.flatMap((stage) => [
    ...(stage.fieldIds ?? []),
    ...Object.values(stage.fieldBindings ?? {}).filter((value): value is string => Boolean(value)),
  ]) ?? []);
  const projectFieldIds = service?.projectFieldIds ?? service?.fields.filter((field) => !stageFieldIds.has(field.id)).map((field) => field.id) ?? [];
  const projectOptionsCost = serviceOptionCost(service, projectFieldIds, conditioned.projectFieldValues, {
    quantity: conditioned.finalQuantity,
    sheets: 0,
    faces: 0,
    areaM2: 0,
    base: stages.reduce((sum, stage) => sum + stage.totalCost, 0),
  });
  return {
    ...conditioned,
    finalQuantity: Math.max(1, Number(conditioned.finalQuantity) || 1),
    stages,
    totals: calculateCustomProjectTotals(stages, conditioned.finalQuantity, conditioned.marginPercent, conditioned.manualUnitPrice, projectOptionsCost),
  };
}

export function validateCustomProject(project: CustomProjectSnapshot): string[] {
  const errors: string[] = [];
  if (!project.name.trim()) errors.push('اسم المشروع مطلوب.');
  if (!Number.isFinite(project.finalQuantity) || project.finalQuantity <= 0) errors.push('الكمية النهائية يجب أن تكون أكبر من صفر.');
  if (project.stages.length === 0) errors.push('أضف مرحلة إنتاج واحدة على الأقل.');
  const template = project.templateSnapshot;
  const isMissing = (value: unknown) => value === undefined || value === null || value === '' || (typeof value === 'number' && !Number.isFinite(value));
  if (template) {
    const stageIds = new Set(template.stageTemplates?.flatMap((stage) => [
      ...(stage.fieldIds ?? []),
      ...Object.values(stage.fieldBindings ?? {}).filter((value): value is string => Boolean(value)),
    ]) ?? []);
    const projectIds = template.projectFieldIds ?? template.fields.filter((field) => !stageIds.has(field.id)).map((field) => field.id);
    template.fields.filter((field) => field.required && projectIds.includes(field.id)).forEach((field) => {
      if (isMissing(project.projectFieldValues?.[field.id])) errors.push(`معلومات المشروع: حقل «${field.label}» مطلوب.`);
    });
  }

  project.stages.forEach((stage, index) => {
    if (stage.enabled === false) return;
    const prefix = `المرحلة ${index + 1}`;
    if (!stage.name.trim()) errors.push(`${prefix}: الاسم مطلوب.`);
    if (!Number.isFinite(stage.quantity) || stage.quantity <= 0) errors.push(`${prefix}: الكمية غير صالحة.`);
    const stageTemplate = template?.stageTemplates?.find((candidate) => candidate.id === stage.templateStageId);
    template?.fields.filter((field) => field.required && stageTemplate?.fieldIds?.includes(field.id)).forEach((field) => {
      if (isMissing(stage.fieldValues?.[field.id])) errors.push(`${prefix}: حقل «${field.label}» مطلوب.`);
    });
    if (stage.calculation.mode === 'automatic') {
      if (stage.printCategory !== 'digital' && stage.printCategory !== 'offset') errors.push(`${prefix}: اختر الطباعة الرقمية أو الأوفست.`);
      if (stage.kind !== 'print') errors.push(`${prefix}: الحساب الآلي مخصص للطباعة.`);
      if (!stage.paper || !stage.machine || !stage.sheetSize || !stage.productSize) errors.push(`${prefix}: أكمل الورق والماكينة والمقاسات.`);
      if (stage.machine && stage.printCategory && stage.machine.kind !== stage.printCategory) errors.push(`${prefix}: الماكينة لا تطابق نوع الطباعة.`);
      if (stage.montageState !== 'confirmed' || !stage.montageResult) errors.push(`${prefix}: احسب المونتاج الذكي واعتمده.`);
      if (stage.montageSignature !== montageSignatureForStage(stage)) errors.push(`${prefix}: المونتاج قديم ويحتاج إعادة حساب.`);
    }
    if ((stage.calculation.mode === 'perSheet' || stage.calculation.mode === 'perFace') && !stage.montageResult && !(stage.calculation.sheets && stage.calculation.sheets > 0)) {
      errors.push(`${prefix}: أدخل عدد الأوراق.`);
    }
    if ((stage.calculation.mode === 'perM2' || stage.calculation.mode === 'perCm2') && !stage.productSize) errors.push(`${prefix}: أدخل المقاس لحساب المساحة.`);
    if (stage.calculation.mode !== 'automatic' && (!Number.isFinite(stage.calculation.rate) || stage.calculation.rate <= 0)) {
      errors.push(`${prefix}: أدخل سعر المرحلة.`);
    }
  });
  return errors;
}

function conditionMatches(project: CustomProjectSnapshot, stage: ProductionStage, template: ServiceStageTemplate): boolean {
  if (!template.condition) return true;
  const value = project.projectFieldValues?.[template.condition.fieldId]
    ?? stage.fieldValues?.[template.condition.fieldId]
    ?? project.stages.find((candidate) => candidate.fieldValues?.[template.condition!.fieldId] !== undefined)?.fieldValues?.[template.condition.fieldId];
  if (template.condition.optionId !== undefined) return value === template.condition.optionId;
  if (template.condition.value !== undefined) return value === template.condition.value;
  return true;
}

export function applyProjectStageConditions(project: CustomProjectSnapshot): CustomProjectSnapshot {
  const templates = project.templateSnapshot?.stageTemplates ?? [];
  if (templates.length === 0) return project;
  return {
    ...project,
    stages: project.stages.map((stage) => {
      const template = templates.find((candidate) => candidate.id === stage.templateStageId);
      return template ? { ...stage, enabled: conditionMatches(project, stage, template) } : stage;
    }),
  };
}

function fieldDefault(field: ServiceField) {
  if (field.defaultValue !== undefined) return structuredClone(field.defaultValue);
  if (field.type === 'select') return field.options?.[0]?.id ?? '';
  if (field.type === 'yesno') return false;
  if (field.type === 'number') return field.min ?? 1;
  if (field.type === 'dimensions') return { widthMm: 100, heightMm: 100 };
  return '';
}

function valuesForFields(service: Service, ids: string[]) {
  return Object.fromEntries(service.fields.filter((field) => ids.includes(field.id)).map((field) => [field.id, fieldDefault(field)]));
}

export function stageFromServiceTemplate(
  service: Service,
  template: ServiceStageTemplate,
  order: number,
  finalQuantity: number,
  fallbackCategory: PrintCategory,
): ProductionStage {
  const stage = emptyProductionStage(`stage-${template.id}-${Date.now().toString(36)}-${order}`, order, template.kind, finalQuantity, fallbackCategory);
  const selectedCategory = template.printCategory === 'digital' || template.printCategory === 'offset' ? template.printCategory : stage.printCategory;
  return {
    ...stage,
    templateStageId: template.id,
    name: template.name,
    printCategory: template.kind === 'print' ? selectedCategory : undefined,
    fieldValues: valuesForFields(service, template.fieldIds ?? []),
    calculation: template.kind === 'print' ? { mode: 'automatic', rate: 0 } : { mode: 'fixed', rate: 0 },
  };
}

export function projectFromServiceTemplate(section: Section, service: Service, marginPercent: number): CustomProjectSnapshot {
  const templates = [...(service.stageTemplates ?? [])].sort((a, b) => a.order - b.order);
  const stageFieldIds = new Set(templates.flatMap((stage) => [
    ...(stage.fieldIds ?? []),
    ...Object.values(stage.fieldBindings ?? {}).filter((value): value is string => Boolean(value)),
  ]));
  const projectFieldIds = service.projectFieldIds?.length
    ? service.projectFieldIds
    : service.fields.filter((field) => !stageFieldIds.has(field.id)).map((field) => field.id);
  const finalQuantity = 1;
  return applyProjectStageConditions({
    schemaVersion: 2,
    completion: 'draft',
    name: service.name,
    description: service.description ?? '',
    sourceSectionId: section.id,
    sourceSectionName: section.name,
    printCategory: section.printCategory ?? 'other',
    templateServiceId: service.id,
    templateServiceName: service.name,
    templateSnapshot: structuredClone(service),
    projectFieldValues: valuesForFields(service, projectFieldIds),
    finalQuantity,
    notes: '',
    stages: templates.map((template, index) => stageFromServiceTemplate(service, template, index, finalQuantity, section.printCategory ?? 'other')),
    marginPercent,
    totals: { stagesCost: 0, marginAmount: 0, marginPercent, priceHt: 0, unitPriceHt: 0 },
  });
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
