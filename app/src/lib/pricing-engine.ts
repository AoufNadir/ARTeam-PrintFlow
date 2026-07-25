// ---------------------------------------------------------------------------
// Pricing engine — pure & deterministic.
// Computes a Devis item price from field values + pricing rules, with waste
// factor, overhead and margin. Returns a full line-item cost breakdown.
//
// Key guarantees:
//  - perSheet / perFace costs are NEVER multiplied by the copy quantity for
//    paper-based services: without a montage result, the sheet count is
//    ESTIMATED from the piece size on a default press sheet.
//  - Paper cost per sheet comes from the matched PaperType price when the
//    selected paper option matches a catalog paper (fallback: the fixed rule).
//  - unitPrice × quantity === total and subtotal + margin === total exactly
//    (rounding is reconciled at the end of computePrice).
// ---------------------------------------------------------------------------

import type {
  DimensionValue,
  FieldOption,
  MontageResult,
  PaperType,
  PriceBreakdown,
  PricingRule,
  Service,
} from './types';

export interface PriceInput {
  /** number of final copies ordered */
  quantity: number;
  /** sheets needed from the montage engine (optional: estimated from pieceSize) */
  sheetsNeeded?: number;
  /** printed faces per sheet (1 recto, 2 otherwise) */
  facesPerSheet?: 1 | 2;
  /** area of ONE piece in m² (for perM2 bases) */
  pieceAreaM2?: number;
  /** size of ONE piece in mm — used to estimate sheets when no montage ran */
  pieceSize?: DimensionValue;
  /** extra priced option deltas already resolved (DA per deltaUnit) */
  optionDeltas?: { delta: number; unit: string; category?: keyof Omit<PriceBreakdown, 'subtotal' | 'unitPrice' | 'total' | 'waste' | 'overhead' | 'margin'> }[];
  rules: PricingRule[];
}

export const DESIGN_SIZE_FIELD = '__designSize';

const EMPTY: PriceBreakdown = {
  paper: 0, printing: 0, cutting: 0, finishing: 0,
  waste: 0, overhead: 0, margin: 0, subtotal: 0, unitPrice: 0, total: 0,
};

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// --------------------------- sheet estimation --------------------------------

/**
 * Default press sheet used to estimate the sheet count when no montage was
 * computed (Xerox Versant SRA3-class sheet, 5 mm unprintable margin, ~2 mm
 * bleed per piece side). Only used as a PRICING estimate — the real montage
 * result always wins when available.
 */
export const DEFAULT_SHEET = { widthMm: 320, heightMm: 450, marginMm: 5, bleedMm: 4 } as const;

/** How many pieces of `piece` fit on the default sheet (best of the two rotations). */
export function estimateCopiesPerSheet(piece: DimensionValue): number {
  const pw = DEFAULT_SHEET.widthMm - DEFAULT_SHEET.marginMm * 2;
  const ph = DEFAULT_SHEET.heightMm - DEFAULT_SHEET.marginMm * 2;
  const w = piece.widthMm + DEFAULT_SHEET.bleedMm;
  const h = piece.heightMm + DEFAULT_SHEET.bleedMm;
  if (w <= 0 || h <= 0) return 1;
  const straight = Math.floor(pw / w) * Math.floor(ph / h);
  const rotated = Math.floor(pw / h) * Math.floor(ph / w);
  return Math.max(1, straight, rotated);
}

/**
 * Estimated sheet count for a quantity when the montage engine did not run.
 * Returns `quantity` ONLY when no piece size is known (non-sheet services
 * where perSheet rules should not apply anyway).
 */
export function estimateSheets(quantity: number, piece?: DimensionValue): number {
  if (!piece) return quantity;
  return Math.max(1, Math.ceil(quantity / estimateCopiesPerSheet(piece)));
}

// --------------------------- percent rules -----------------------------------

export type PercentRuleKind = 'waste' | 'overhead' | 'margin';

/**
 * Find the enabled global percent rule of a semantic kind. Matches on the
 * explicit `kind` field first, falling back to the legacy id-substring match
 * so rule sets seeded before `kind` existed keep working.
 */
export function percentRule(rules: PricingRule[], kind: PercentRuleKind): PricingRule | undefined {
  return rules.find(
    (r) => r.enabled && r.basis === 'percent' && (r.kind === kind || r.id.includes(kind)),
  );
}

export function percentRuleValue(rules: PricingRule[], kind: PercentRuleKind): number {
  return percentRule(rules, kind)?.value ?? 0;
}

// --------------------------- paper price lookup -------------------------------

function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, '');
}

/**
 * Match a selected paper field option to a catalog PaperType and return its
 * per-sheet price (DA). Matching is by normalized latin label / name.
 */
export function findPaperPricePerSheet(opt: FieldOption | undefined, papers: PaperType[]): number | undefined {
  if (!opt) return undefined;
  const label = normalizeLabel(opt.latinLabel ?? opt.label);
  if (!label) return undefined;
  const match = papers.find((p) => {
    if (!p.enabled) return false;
    const name = normalizeLabel(p.name);
    return name === label || name.includes(label) || label.includes(name);
  });
  return match?.pricePerSheet;
}

// --------------------------- core computation ---------------------------------

export function computePrice(input: PriceInput): PriceBreakdown {
  const { quantity, rules } = input;
  if (quantity <= 0) return { ...EMPTY };
  // NEVER sheets = quantity for sheet-priced services: estimate from the
  // piece size on the default press sheet when the montage engine did not run.
  const sheets = input.sheetsNeeded ?? estimateSheets(quantity, input.pieceSize);
  const faces = input.facesPerSheet ?? 1;
  const totalM2 = (input.pieceAreaM2 ?? 0) * quantity;

  const out = { ...EMPTY };

  const addTo = (category: PricingRule['appliesTo'] | keyof PriceBreakdown | undefined, amount: number) => {
    const cat = category ?? 'finishing';
    if (cat === 'paper' || cat === 'printing' || cat === 'cutting' || cat === 'finishing') {
      out[cat] += amount;
    } else {
      out.finishing += amount;
    }
  };

  // 1) option deltas (per-copy / per-sheet / per-face / per-m² / fixed)
  //    — 'percent' option deltas are applied after base costs (step 3).
  for (const od of input.optionDeltas ?? []) {
    switch (od.unit) {
      case 'perCopy': addTo(od.category, od.delta * quantity); break;
      case 'perSheet': addTo(od.category, od.delta * sheets); break;
      case 'perFace': addTo(od.category, od.delta * sheets * faces); break;
      case 'perM2': addTo(od.category, od.delta * totalM2); break;
      case 'fixed': addTo(od.category, od.delta); break;
      default: break;
    }
  }

  // 2) unit-based pricing rules (percent rules handled below, in fixed order)
  for (const rule of rules.filter((r) => r.enabled && r.basis !== 'percent')) {
    const cat = rule.appliesTo ?? 'finishing';
    switch (rule.basis) {
      case 'perSheet': addTo(cat, rule.value * sheets); break;
      case 'perFace': addTo(cat, rule.value * sheets * faces); break;
      case 'perM2': addTo(cat, rule.value * totalM2); break;
      case 'perCopy': addTo(cat, rule.value * quantity); break;
      case 'fixed': addTo(cat, rule.value); break;
      default: break;
    }
  }

  // 3) percent-based option deltas ride on the base and land in THEIR OWN
  //    category (a paper surcharge is paper cost, not finishing).
  const base = out.paper + out.printing + out.cutting + out.finishing;
  for (const od of input.optionDeltas ?? []) {
    if (od.unit === 'percent') addTo(od.category, (od.delta / 100) * base);
  }

  const subtotalBeforeGlobal = out.paper + out.printing + out.cutting + out.finishing;

  // 4) waste factor = waste rule %.
  //    NOTE: the montage layout waste is NOT added here — it is already
  //    priced through copiesPerSheet → sheetsNeeded (adding it again would
  //    double-count the same paper).
  const wastePct = percentRuleValue(rules, 'waste');
  out.waste = (subtotalBeforeGlobal * wastePct) / 100;

  // 5) overhead on (production cost + waste)
  out.overhead = ((subtotalBeforeGlobal + out.waste) * percentRuleValue(rules, 'overhead')) / 100;

  out.subtotal = round(subtotalBeforeGlobal + out.waste + out.overhead);

  // 6) margin + rounding reconciliation:
  //    unitPrice = round(total/qty), total = unitPrice × qty, margin = total − subtotal
  //    so unitPrice × qty === total and subtotal + margin === total ALWAYS hold.
  const rawTotal = out.subtotal * (1 + percentRuleValue(rules, 'margin') / 100);
  out.unitPrice = round(rawTotal / quantity);
  out.total = round(out.unitPrice * quantity);
  out.margin = round(out.total - out.subtotal);

  out.paper = round(out.paper);
  out.printing = round(out.printing);
  out.cutting = round(out.cutting);
  out.finishing = round(out.finishing);
  out.waste = round(out.waste);
  out.overhead = round(out.overhead);
  return out;
}

// --------------------------- service-level helper ----------------------------

export type FieldValues = Record<string, string | number | boolean | DimensionValue>;

function isDimension(v: unknown): v is DimensionValue {
  return typeof v === 'object' && v !== null && 'widthMm' in v && 'heightMm' in v;
}

function bucketForOption(fieldId: string, latinLabel?: string): 'paper' | 'printing' | 'cutting' | 'finishing' {
  const s = `${fieldId} ${latinLabel ?? ''}`.toLowerCase();
  if (s.includes('pap') || s.includes('couch') || s.includes('offset 80') || s.includes('paper')) return 'paper';
  if (s.includes('face') || s.includes('recto') || s.includes('print')) return 'printing';
  if (s.includes('cut') || s.includes('coupe') || s.includes('contour')) return 'cutting';
  return 'finishing';
}

function isPaperField(fieldId: string): boolean {
  const s = fieldId.toLowerCase();
  return s.includes('pap') || s.includes('paper') || s === 'support';
}

/**
 * Price one Devis item: resolves select-option deltas from the service
 * definition, folds in the montage result (or a sheet estimate when absent),
 * prices paper from the catalog PaperType when matched, and runs computePrice.
 *
 * @param papers catalog paper types — pass a Devis' frozen `papersSnapshot`
 *               when re-pricing an old quote ("ثبات الماضي").
 */
export function priceItem(
  service: Service,
  fieldValues: FieldValues,
  rules: PricingRule[],
  montage?: MontageResult | null,
  papers?: PaperType[],
): PriceBreakdown {
  const quantityRaw = fieldValues['quantity'];
  const quantity = typeof quantityRaw === 'number' ? quantityRaw : Number(quantityRaw) || 1;

  const optionDeltas: PriceInput['optionDeltas'] = [];
  let pieceAreaM2: number | undefined;
  let pieceSize: DimensionValue | undefined;
  let facesPerSheet: 1 | 2 | undefined;
  let paperRate: number | undefined;

  for (const field of service.fields) {
    const v = fieldValues[field.id];
    if (field.type === 'select' && typeof v === 'string') {
      const opt = field.options?.find((o) => o.id === v);
      // paper cost per sheet from the catalog PaperType (fallback: fixed rule)
      if (opt && papers && isPaperField(field.id)) {
        paperRate = findPaperPricePerSheet(opt, papers) ?? paperRate;
      }
      if (opt && opt.priceDelta !== 0) {
        const category = bucketForOption(field.id, opt.latinLabel);
        if (opt.deltaUnit === 'percent') {
          // percent deltas are pushed ONCE (previously pushed twice → double charge)
          optionDeltas.push({ delta: opt.priceDelta, unit: 'percent', category });
        } else if (!(paperRate !== undefined && category === 'paper' && opt.deltaUnit === 'perCopy')) {
          // when the paper price comes from the PaperType per-sheet rate, the
          // legacy per-copy paper surcharge would double-count the paper.
          optionDeltas.push({ delta: opt.priceDelta, unit: opt.deltaUnit, category });
        }
      }
      if (field.id === 'faces' && typeof v === 'string') {
        facesPerSheet = v.toLowerCase().includes('verso') ? 2 : 1;
      }
    }
    if (field.type === 'yesno' && v === true) {
      // yes/no fields may carry a delta through a single option
      const opt = field.options?.[0];
      if (opt && opt.priceDelta !== 0) {
        optionDeltas.push({ delta: opt.priceDelta, unit: opt.deltaUnit, category: 'finishing' });
      }
    }
    if (field.type === 'dimensions' && isDimension(v)) {
      pieceSize = { widthMm: v.widthMm, heightMm: v.heightMm };
      pieceAreaM2 = (v.widthMm / 1000) * (v.heightMm / 1000);
    }
  }
  const detectedSize = fieldValues[DESIGN_SIZE_FIELD];
  if (!pieceSize && isDimension(detectedSize)) {
    pieceSize = { widthMm: detectedSize.widthMm, heightMm: detectedSize.heightMm };
  }
  if (!pieceSize && service.defaultPieceSize) {
    pieceSize = { ...service.defaultPieceSize };
  }
  if (!pieceAreaM2 && pieceSize) {
    pieceAreaM2 = (pieceSize.widthMm / 1000) * (pieceSize.heightMm / 1000);
  }

  // keep only the rules attached to the service (fall back to all)
  let applicable = service.pricingRuleIds.length
    ? rules.filter((r) => service.pricingRuleIds.includes(r.id))
    : rules;

  // override the fixed per-sheet paper rule with the catalog paper price
  if (paperRate !== undefined) {
    const rate = paperRate;
    applicable = applicable.map((r) =>
      r.basis === 'perSheet' && r.appliesTo === 'paper' ? { ...r, value: rate } : r,
    );
  }

  return computePrice({
    quantity,
    rules: applicable,
    optionDeltas,
    sheetsNeeded: montage?.sheetsNeeded,
    facesPerSheet: montage?.facesPerSheet ?? facesPerSheet,
    pieceAreaM2,
    pieceSize,
  });
}
