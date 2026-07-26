"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SHEET_AREA_M2 = exports.DEFAULT_SHEET = void 0;
exports.estimateCopiesPerSheet = estimateCopiesPerSheet;
exports.estimateSheets = estimateSheets;
exports.percentRule = percentRule;
exports.percentRuleValue = percentRuleValue;
exports.findPaperPricePerSheet = findPaperPricePerSheet;
exports.computePrice = computePrice;
exports.ruleConditionMet = ruleConditionMet;
exports.priceItem = priceItem;
const EMPTY = {
    paper: 0, printing: 0, cutting: 0, finishing: 0,
    waste: 0, overhead: 0, margin: 0, subtotal: 0, unitPrice: 0, total: 0,
};
function round(n) {
    return Math.round(n * 100) / 100;
}
// --------------------------- sheet estimation --------------------------------
/**
 * Default press sheet used to estimate the sheet count when no montage was
 * computed (Xerox Versant SRA3-class sheet, 5 mm unprintable margin, ~2 mm
 * bleed per piece side). Only used as a PRICING estimate — the real montage
 * result always wins when available.
 */
exports.DEFAULT_SHEET = { widthMm: 320, heightMm: 450, marginMm: 5, bleedMm: 4 };
/** Area of DEFAULT_SHEET in m² — the perSheetM2 fallback when no montage ran. */
exports.DEFAULT_SHEET_AREA_M2 = (exports.DEFAULT_SHEET.widthMm / 1000) * (exports.DEFAULT_SHEET.heightMm / 1000);
/** How many pieces of `piece` fit on the default sheet (best of the two rotations). */
function estimateCopiesPerSheet(piece) {
    const pw = exports.DEFAULT_SHEET.widthMm - exports.DEFAULT_SHEET.marginMm * 2;
    const ph = exports.DEFAULT_SHEET.heightMm - exports.DEFAULT_SHEET.marginMm * 2;
    const w = piece.widthMm + exports.DEFAULT_SHEET.bleedMm;
    const h = piece.heightMm + exports.DEFAULT_SHEET.bleedMm;
    if (w <= 0 || h <= 0)
        return 1;
    const straight = Math.floor(pw / w) * Math.floor(ph / h);
    const rotated = Math.floor(pw / h) * Math.floor(ph / w);
    return Math.max(1, straight, rotated);
}
/**
 * Estimated sheet count for a quantity when the montage engine did not run.
 * Returns `quantity` ONLY when no piece size is known (non-sheet services
 * where perSheet rules should not apply anyway).
 */
function estimateSheets(quantity, piece) {
    if (!piece)
        return quantity;
    return Math.max(1, Math.ceil(quantity / estimateCopiesPerSheet(piece)));
}
/**
 * Find the enabled global percent rule of a semantic kind. Matches on the
 * explicit `kind` field first, falling back to the legacy id-substring match
 * so rule sets seeded before `kind` existed keep working.
 */
function percentRule(rules, kind) {
    return rules.find((r) => r.enabled && r.basis === 'percent' && (r.kind === kind || r.id.includes(kind)));
}
function percentRuleValue(rules, kind) {
    return percentRule(rules, kind)?.value ?? 0;
}
// --------------------------- paper price lookup -------------------------------
function normalizeLabel(s) {
    return s.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, '');
}
/**
 * Match a selected paper field option to a catalog PaperType and return its
 * per-sheet price (DA). Matching is by normalized latin label / name.
 */
function findPaperPricePerSheet(opt, papers) {
    if (!opt)
        return undefined;
    const label = normalizeLabel(opt.latinLabel ?? opt.label);
    if (!label)
        return undefined;
    const match = papers.find((p) => {
        if (!p.enabled)
            return false;
        const name = normalizeLabel(p.name);
        return name === label || name.includes(label) || label.includes(name);
    });
    return match?.pricePerSheet;
}
// --------------------------- core computation ---------------------------------
function computePrice(input) {
    const { quantity, rules } = input;
    if (quantity <= 0)
        return { ...EMPTY };
    // NEVER sheets = quantity for sheet-priced services: estimate from the
    // piece size on the default press sheet when the montage engine did not run.
    const sheets = input.sheetsNeeded ?? estimateSheets(quantity, input.pieceSize);
    const faces = input.facesPerSheet ?? 1;
    const totalM2 = (input.pieceAreaM2 ?? 0) * quantity;
    // whole-sheet area actually run through the press (lamination, varnish…)
    const sheetAreaM2 = input.sheetAreaM2 ?? exports.DEFAULT_SHEET_AREA_M2;
    const totalSheetM2 = sheetAreaM2 * sheets;
    const out = { ...EMPTY };
    const addTo = (category, amount) => {
        const cat = category ?? 'finishing';
        if (cat === 'paper' || cat === 'printing' || cat === 'cutting' || cat === 'finishing') {
            out[cat] += amount;
        }
        else {
            out.finishing += amount;
        }
    };
    // 1) option deltas (per-copy / per-sheet / per-face / per-m² / fixed)
    //    — 'percent' option deltas are applied after base costs (step 3).
    for (const od of input.optionDeltas ?? []) {
        switch (od.unit) {
            case 'perCopy':
                addTo(od.category, od.delta * quantity);
                break;
            case 'perSheet':
                addTo(od.category, od.delta * sheets);
                break;
            case 'perFace':
                addTo(od.category, od.delta * sheets * faces);
                break;
            case 'perM2':
                addTo(od.category, od.delta * totalM2);
                break;
            case 'perSheetM2':
                addTo(od.category, od.delta * totalSheetM2);
                break;
            case 'fixed':
                addTo(od.category, od.delta);
                break;
            default: break;
        }
    }
    // 2) unit-based pricing rules (percent rules handled below, in fixed order)
    for (const rule of rules.filter((r) => r.enabled && r.basis !== 'percent')) {
        const cat = rule.appliesTo ?? 'finishing';
        switch (rule.basis) {
            case 'perSheet':
                addTo(cat, rule.value * sheets);
                break;
            case 'perFace':
                addTo(cat, rule.value * sheets * faces);
                break;
            case 'perM2':
                addTo(cat, rule.value * totalM2);
                break;
            case 'perSheetM2':
                addTo(cat, rule.value * totalSheetM2);
                break;
            case 'perCopy':
                addTo(cat, rule.value * quantity);
                break;
            case 'fixed':
                addTo(cat, rule.value);
                break;
            default: break;
        }
    }
    // 3) percent-based option deltas ride on the base and land in THEIR OWN
    //    category (a paper surcharge is paper cost, not finishing).
    const base = out.paper + out.printing + out.cutting + out.finishing;
    for (const od of input.optionDeltas ?? []) {
        if (od.unit === 'percent')
            addTo(od.category, (od.delta / 100) * base);
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
/**
 * Is a conditional rule active for these field values? Rules without
 * `requiresField` are unconditional and always pass.
 */
function ruleConditionMet(rule, fieldValues) {
    if (!rule.requiresField)
        return true;
    const v = fieldValues[rule.requiresField];
    if (v === undefined || v === null || v === false || v === '')
        return false;
    if (rule.requiresOption?.length)
        return typeof v === 'string' && rule.requiresOption.includes(v);
    return true;
}
function isDimension(v) {
    return typeof v === 'object' && v !== null && 'widthMm' in v && 'heightMm' in v;
}
function bucketForOption(fieldId, latinLabel) {
    const s = `${fieldId} ${latinLabel ?? ''}`.toLowerCase();
    if (s.includes('pap') || s.includes('couch') || s.includes('offset 80') || s.includes('paper'))
        return 'paper';
    if (s.includes('face') || s.includes('recto') || s.includes('print'))
        return 'printing';
    if (s.includes('cut') || s.includes('coupe') || s.includes('contour'))
        return 'cutting';
    return 'finishing';
}
function isPaperField(fieldId) {
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
function priceItem(service, fieldValues, rules, montage, papers) {
    const quantityRaw = fieldValues['quantity'];
    const quantity = typeof quantityRaw === 'number' ? quantityRaw : Number(quantityRaw) || 1;
    const optionDeltas = [];
    let pieceAreaM2;
    let pieceSize;
    let facesPerSheet;
    let paperRate;
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
                }
                else if (!(paperRate !== undefined && category === 'paper' && opt.deltaUnit === 'perCopy')) {
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
    // conditional rules: a finishing price attached to a field only counts when
    // that field was actually chosen (yes/no true, or a matching select option)
    applicable = applicable.filter((r) => ruleConditionMet(r, fieldValues));
    // override the fixed per-sheet paper rule with the catalog paper price
    if (paperRate !== undefined) {
        const rate = paperRate;
        applicable = applicable.map((r) => r.basis === 'perSheet' && r.appliesTo === 'paper' ? { ...r, value: rate } : r);
    }
    return computePrice({
        quantity,
        rules: applicable,
        optionDeltas,
        sheetsNeeded: montage?.sheetsNeeded,
        facesPerSheet: montage?.facesPerSheet ?? facesPerSheet,
        pieceAreaM2,
        pieceSize,
        sheetAreaM2: montage
            ? (montage.sheetWidthMm / 1000) * (montage.sheetHeightMm / 1000)
            : undefined,
    });
}
