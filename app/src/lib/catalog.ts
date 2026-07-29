// ---------------------------------------------------------------------------
// Seed catalog: sections, services (with priced field options), pricing rules,
// machines (digital + offset) and paper types. Used by storage.ts on first load.
// ---------------------------------------------------------------------------

import type {
  Machine,
  PaperType,
  PricingRule,
  PricingRulesVersion,
  Section,
  Service,
} from './types';

// ------------------------------- Pricing rules -------------------------------

export const SEED_PRICING_RULES: PricingRule[] = [
  { id: 'rule-paper-sheet', name: 'تكلفة الورق', latinName: 'Papier', basis: 'perSheet', value: 18, appliesTo: 'paper', enabled: true },
  { id: 'rule-print-face-digital', name: 'طباعة رقمية للوجه', latinName: 'Impression digitale / face', basis: 'perFace', value: 12, appliesTo: 'printing', enabled: true },
  { id: 'rule-print-face-offset', name: 'طباعة أوفست للوجه', latinName: 'Impression offset / face', basis: 'perFace', value: 7, appliesTo: 'printing', enabled: true },
  { id: 'rule-offset-setup', name: 'تحضير الأوفست', latinName: 'Calage offset', basis: 'fixed', value: 4500, appliesTo: 'printing', enabled: true },
  { id: 'rule-cut-sheet', name: 'القص', latinName: 'Coupe', basis: 'perSheet', value: 2.5, appliesTo: 'cutting', enabled: true },
  { id: 'rule-pelliculage-m2', name: 'التغليف البلاستيكي', latinName: 'Pelliculage', basis: 'perM2', value: 90, appliesTo: 'finishing', enabled: true },
  { id: 'rule-waste', name: 'معامل الهدر', latinName: 'Déchets', basis: 'percent', value: 5, appliesTo: 'global', kind: 'waste', enabled: true },
  { id: 'rule-overhead', name: 'المصاريف العامة', latinName: 'Frais généraux', basis: 'percent', value: 8, appliesTo: 'global', kind: 'overhead', enabled: true },
  { id: 'rule-margin', name: 'هامش الربح', latinName: 'Marge', basis: 'percent', value: 25, appliesTo: 'global', kind: 'margin', enabled: true },
];

export const SEED_RULES_VERSION: PricingRulesVersion = {
  id: 'rules-v1',
  version: 1,
  createdAt: new Date().toISOString(),
  note: 'النسخة الأولى من قواعد الأسعار',
  rules: SEED_PRICING_RULES,
};

// ------------------------------- Sections & services -------------------------
//
// SINGLE SOURCE OF TRUTH: `Service.sectionId` decides which section a service
// belongs to. `Section.serviceIds` is only a display-order cache and is DERIVED
// from the services below (and re-synced at runtime by storage.reconcileSections).
// Earlier the seed listed 'svc-depliant' under sec-offset while its sectionId
// was 'sec-digital', so it could never appear under Offset — do not reintroduce
// that kind of mismatch.

const paperOptions = [
  { id: 'pap-couche-350', label: 'ورق كوشيه 350غ', latinLabel: 'Papier Couché 350g', priceDelta: 10, deltaUnit: 'perCopy' as const },
  { id: 'pap-couche-300', label: 'ورق كوشيه 300غ', latinLabel: 'Papier Couché 300g', priceDelta: 8, deltaUnit: 'perCopy' as const },
  { id: 'pap-couche-170', label: 'ورق كوشيه 170غ', latinLabel: 'Papier Couché 170g', priceDelta: 4, deltaUnit: 'perCopy' as const },
  { id: 'pap-offset-80', label: 'ورق أوفست 80غ', latinLabel: 'Papier Offset 80g', priceDelta: 0, deltaUnit: 'perCopy' as const },
];

const facesOptions = [
  { id: 'recto', label: 'وجه واحد', latinLabel: 'Recto', priceDelta: 0, deltaUnit: 'perCopy' as const },
  { id: 'recto-verso', label: 'وجهان', latinLabel: 'Recto Verso', priceDelta: 2, deltaUnit: 'perCopy' as const },
];

const pelliculageOptions = [
  { id: 'pell-none', label: 'بدون', latinLabel: 'Sans pelliculage', priceDelta: 0, deltaUnit: 'perCopy' as const },
  { id: 'pell-mat', label: 'تغليف مطفي', latinLabel: 'Pelliculage Mat', priceDelta: 3, deltaUnit: 'perCopy' as const },
  { id: 'pell-brillant', label: 'تغليف لامع', latinLabel: 'Pelliculage Brillant', priceDelta: 3, deltaUnit: 'perCopy' as const },
];

export const SEED_SERVICES: Service[] = [
  {
    id: 'svc-carte-visite',
    sectionId: 'sec-digital',
    name: 'بطاقة زيارة',
    latinName: 'Carte Visite',
    description: 'بطاقات عمل 8.5×5.5 سم',
    defaultPieceSize: { widthMm: 85, heightMm: 55 },
    defaultBleedMm: 2,
    designInputMode: 'fixed-template',
    stages: ['impression', 'pelliculage', 'coupe'],
    pricingRuleIds: ['rule-paper-sheet', 'rule-print-face-digital', 'rule-cut-sheet', 'rule-waste', 'rule-overhead', 'rule-margin'],
    fields: [
      { id: 'quantity', label: 'الكمية', type: 'number', required: true, min: 50, step: 50, defaultValue: 500 },
      { id: 'paper', label: 'نوع الورق', type: 'select', required: true, defaultValue: 'pap-couche-350', options: paperOptions },
      { id: 'faces', label: 'الطباعة', type: 'select', required: true, defaultValue: 'recto', options: facesOptions },
      { id: 'pelliculage', label: 'التغليف البلاستيكي', type: 'select', defaultValue: 'pell-none', options: pelliculageOptions },
      { id: 'rounded-corners', label: 'زوايا مدورة', type: 'yesno', defaultValue: false },
    ],
  },
  {
    id: 'svc-flyer',
    sectionId: 'sec-digital',
    name: 'منشور',
    latinName: 'Flyer',
    description: 'منشورات إشهارية A6 / A5 / A4',
    defaultPieceSize: { widthMm: 148, heightMm: 210 },
    defaultBleedMm: 3,
    stages: ['impression', 'coupe'],
    pricingRuleIds: ['rule-paper-sheet', 'rule-print-face-digital', 'rule-cut-sheet', 'rule-waste', 'rule-overhead', 'rule-margin'],
    fields: [
      { id: 'quantity', label: 'الكمية', type: 'number', required: true, min: 100, step: 100, defaultValue: 1000 },
      { id: 'format', label: 'الحجم', type: 'dimensions', required: true, defaultValue: { widthMm: 148, heightMm: 210 } },
      { id: 'paper', label: 'نوع الورق', type: 'select', required: true, defaultValue: 'pap-couche-170', options: paperOptions },
      { id: 'faces', label: 'الطباعة', type: 'select', required: true, defaultValue: 'recto-verso', options: facesOptions },
    ],
  },
  {
    id: 'svc-depliant',
    sectionId: 'sec-digital',
    name: 'منشور مطوي',
    latinName: 'Dépliant',
    description: 'بروشورات مطوية (2 أو 3 طيات)',
    defaultPieceSize: { widthMm: 297, heightMm: 210 },
    defaultBleedMm: 3,
    stages: ['impression', 'pliage', 'coupe'],
    pricingRuleIds: ['rule-paper-sheet', 'rule-print-face-offset', 'rule-offset-setup', 'rule-cut-sheet', 'rule-waste', 'rule-overhead', 'rule-margin'],
    fields: [
      { id: 'quantity', label: 'الكمية', type: 'number', required: true, min: 250, step: 250, defaultValue: 1000 },
      { id: 'format', label: 'الحجم المفتوح', type: 'dimensions', required: true, defaultValue: { widthMm: 297, heightMm: 210 } },
      { id: 'folds', label: 'عدد الطيات', type: 'select', required: true, defaultValue: 'fold-2', options: [
        { id: 'fold-2', label: 'طيتان', latinLabel: '2 plis', priceDelta: 1, deltaUnit: 'perCopy' },
        { id: 'fold-3', label: 'ثلاث طيات', latinLabel: '3 plis', priceDelta: 2, deltaUnit: 'perCopy' },
      ] },
      { id: 'paper', label: 'نوع الورق', type: 'select', required: true, defaultValue: 'pap-couche-170', options: paperOptions },
      { id: 'faces', label: 'الطباعة', type: 'select', required: true, defaultValue: 'recto-verso', options: facesOptions },
      { id: 'pelliculage', label: 'التغليف البلاستيكي', type: 'select', defaultValue: 'pell-none', options: pelliculageOptions },
    ],
  },
  {
    id: 'svc-etiquettes',
    sectionId: 'sec-offset',
    name: 'ملصقات',
    latinName: 'Étiquettes',
    description: 'ملصقات بأحجام متعددة على نفس الورقة',
    defaultPieceSize: { widthMm: 60, heightMm: 40 },
    defaultBleedMm: 2,
    stages: ['impression', 'coupe'],
    pricingRuleIds: ['rule-paper-sheet', 'rule-print-face-digital', 'rule-cut-sheet', 'rule-waste', 'rule-overhead', 'rule-margin'],
    fields: [
      { id: 'quantity', label: 'الكمية', type: 'number', required: true, min: 100, step: 100, defaultValue: 1000 },
      { id: 'format', label: 'حجم الملصق', type: 'dimensions', required: true, defaultValue: { widthMm: 60, heightMm: 40 } },
      { id: 'paper', label: 'نوع الورق', type: 'select', required: true, defaultValue: 'pap-couche-170', options: paperOptions },
      { id: 'contour-cut', label: 'قص على المحيط', latinName: 'CutContour', type: 'yesno', defaultValue: false },
    ],
  },
  {
    id: 'svc-grand-format',
    sectionId: 'sec-grand-format',
    name: 'لافتة كبيرة',
    latinName: 'Bâche Grand Format',
    description: 'طباعة بانر / باغ بالمتر المربع',
    defaultPieceSize: { widthMm: 2000, heightMm: 1000 },
    defaultBleedMm: 20,
    stages: ['impression', 'finition'],
    pricingRuleIds: ['rule-print-face-digital', 'rule-waste', 'rule-overhead', 'rule-margin'],
    fields: [
      { id: 'quantity', label: 'الكمية', type: 'number', required: true, min: 1, step: 1, defaultValue: 1 },
      { id: 'format', label: 'الأبعاد', type: 'dimensions', required: true, defaultValue: { widthMm: 2000, heightMm: 1000 } },
      { id: 'support', label: 'الدعامة', type: 'select', required: true, defaultValue: 'bache-510', options: [
        { id: 'bache-510', label: 'بانر 510غ', latinLabel: 'Bâche 510g', priceDelta: 0, deltaUnit: 'perM2' },
        { id: 'vinyle', label: 'فينيل لاصق', latinLabel: 'Vinyle adhésif', priceDelta: 250, deltaUnit: 'perM2' },
        { id: 'backlight', label: 'باك لايت', latinLabel: 'Backlight', priceDelta: 400, deltaUnit: 'perM2' },
      ] },
      { id: 'eyelets', label: 'عيون معدنية', type: 'yesno', defaultValue: true },
    ],
  },
];

// Sections are declared after the services so their serviceIds can be derived
// from `Service.sectionId` (the single source of truth), preserving the order
// in which services appear in SEED_SERVICES.
const SECTION_DEFS: Omit<Section, 'serviceIds'>[] = [
  { id: 'sec-digital', name: 'طباعة رقمية', latinName: 'Impression numérique', description: 'كميات صغيرة ومتوسطة، تسليم سريع', printCategory: 'digital' },
  { id: 'sec-offset', name: 'أوفست', latinName: 'Offset', description: 'كميات كبيرة بجودة عالية', printCategory: 'offset' },
  { id: 'sec-grand-format', name: 'تنسيق كبير', latinName: 'Grand Format', description: 'لافتات، بانرات، لوحات إشهارية', printCategory: 'other' },
];

export const SEED_SECTIONS: Section[] = SECTION_DEFS.map((s) => ({
  ...s,
  serviceIds: SEED_SERVICES.filter((svc) => svc.sectionId === s.id).map((svc) => svc.id),
}));

// ------------------------------- Machines ------------------------------------

export const SEED_MACHINES: Machine[] = [
  {
    id: 'machine-digital-versant',
    name: 'Xerox Versant 180',
    kind: 'digital',
    margins: { top: 5, bottom: 5, left: 5, right: 5 },
    costPerFace: 12,
    enabled: true,
    sheetSizes: [
      { id: 'a4', widthMm: 210, heightMm: 297, label: 'A4' },
      { id: 'a4-plus', widthMm: 225, heightMm: 320, label: 'A4+' },
      { id: 'sra3-225-320', widthMm: 225, heightMm: 320, label: '22.5×32 cm' },
      { id: 'sh-33-245', widthMm: 330, heightMm: 245, label: '33×24.5 cm' },
      { id: 'sh-320-450', widthMm: 320, heightMm: 450, label: '32×45 cm' },
      { id: 'sh-330-480', widthMm: 330, heightMm: 480, label: '33×48 cm' },
    ],
  },
  {
    id: 'machine-offset-sm52',
    name: 'Heidelberg SM 52',
    kind: 'offset',
    margins: { top: 8, bottom: 8, left: 8, right: 8 },
    priseDePince: 10, // gripper bite on the largest edge
    costPerFace: 7,
    enabled: true,
    sheetSizes: [
      { id: 'of-25-33', widthMm: 250, heightMm: 330, label: '25×33 cm' },
      { id: 'of-35-50', widthMm: 350, heightMm: 500, label: '35×50 cm' },
      { id: 'of-33-70', widthMm: 330, heightMm: 700, label: '33×70 cm' },
      { id: 'of-50-70', widthMm: 500, heightMm: 700, label: '50×70 cm' },
    ],
  },
];

// ------------------------------- Paper types ---------------------------------

export const SEED_PAPERS: PaperType[] = [
  { id: 'paper-couche-350', name: 'Papier Couché 350g', gsm: 350, pricePerSheet: 32, enabled: true },
  { id: 'paper-couche-300', name: 'Papier Couché 300g', gsm: 300, pricePerSheet: 27, enabled: true },
  { id: 'paper-couche-170', name: 'Papier Couché 170g', gsm: 170, pricePerSheet: 14, enabled: true },
  { id: 'paper-couche-135', name: 'Papier Couché 135g', gsm: 135, pricePerSheet: 11, enabled: true },
  { id: 'paper-offset-80', name: 'Papier Offset 80g', gsm: 80, pricePerSheet: 6, enabled: true },
  { id: 'paper-bache-510', name: 'Bâche 510g (m²)', gsm: 510, pricePerSheet: 650, enabled: true },
];

/** Montage group palette (up to 6 groups) — matches design.md §2. */
export const GROUP_COLORS = ['#0D9488', '#DB2777', '#D97706', '#7C3AED', '#0284C7', '#65A30D'];
