"use strict";
// ---------------------------------------------------------------------------
// Devis helpers shared by the wizard and the archive page: Algerian date
// formatting, TVA math, and human/Latin item-spec strings.
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.AR_MONTHS = exports.TVA_RATE = exports.DEFAULT_TVA_RATE = void 0;
exports.formatDateAr = formatDateAr;
exports.addDays = addDays;
exports.toInputDate = toInputDate;
exports.fromInputDate = fromInputDate;
exports.devisTotals = devisTotals;
exports.itemSpecLatin = itemSpecLatin;
exports.itemSpecAr = itemSpecAr;
exports.itemDims = itemDims;
exports.servicesSummary = servicesSummary;
exports.clientLabel = clientLabel;
const units_1 = require("@/lib/units");
exports.DEFAULT_TVA_RATE = 0.19;
exports.TVA_RATE = exports.DEFAULT_TVA_RATE;
/** Algerian month names (as used in the design docs: "14 جانفي 2025"). */
exports.AR_MONTHS = [
    'جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان',
    'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];
function formatDateAr(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return '';
    return `${d.getDate()} ${exports.AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function addDays(iso, days) {
    const d = new Date(iso);
    d.setDate(d.getDate() + days);
    return d.toISOString();
}
/** "2025-01-14" for <input type="date"> */
function toInputDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fromInputDate(value) {
    const d = new Date(`${value}T12:00:00`);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
// ------------------------------- totals -------------------------------------
function money(value) {
    return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}
function discountAmount(discount, base) {
    if (!discount || discount.value <= 0 || base <= 0)
        return 0;
    if (discount.mode === 'percent')
        return money((base * Math.min(100, discount.value)) / 100);
    return money(Math.min(base, discount.value));
}
/**
 * Fixed commercial calculation order:
 * items HT -> discounts -> fees -> TVA -> TTC -> advance -> balance.
 */
function devisTotals(items, input = {}) {
    const itemsGross = money(items.reduce((s, it) => s + it.total, 0));
    const itemDiscounts = money(items.reduce((s, it) => s + discountAmount(it.discount, it.total), 0));
    const itemsHt = money(Math.max(0, itemsGross - itemDiscounts));
    const quoteDiscount = discountAmount(input.discount, itemsHt);
    const extraFees = money((input.extraFees ?? []).reduce((s, fee) => s + Math.max(0, fee.amount || 0), 0));
    const ht = money(Math.max(0, itemsHt - quoteDiscount) + extraFees);
    const taxRate = Number.isFinite(input.taxRate) ? Math.max(0, input.taxRate ?? exports.DEFAULT_TVA_RATE) : exports.DEFAULT_TVA_RATE;
    const tva = money(ht * taxRate);
    const ttc = money(ht + tva);
    const advance = input.advance
        ? input.advance.mode === 'percent'
            ? money((ttc * Math.min(100, Math.max(0, input.advance.value))) / 100)
            : money(Math.min(ttc, Math.max(0, input.advance.value)))
        : 0;
    const balanceDue = money(Math.max(0, ttc - advance));
    return { itemsHt, itemDiscounts, quoteDiscount, extraFees, ht, taxRate, tva, ttc, advance, balanceDue };
}
// ------------------------------- item specs ---------------------------------
function isDim(v) {
    return typeof v === 'object' && v !== null && 'widthMm' in v && 'heightMm' in v;
}
function quantityOf(item) {
    const q = item.fieldValues['quantity'];
    return typeof q === 'number' ? q : Number(q) || item.quantity;
}
/**
 * Latin spec line for a Devis item (used in the document + PDF):
 * "Papier Couché 350g, Recto Verso, Pelliculage Mat".
 */
function itemSpecLatin(service, item) {
    if (!service)
        return '';
    const parts = [];
    for (const f of service.fields) {
        const v = item.fieldValues[f.id];
        if (f.type === 'select' && typeof v === 'string') {
            const opt = f.options?.find((o) => o.id === v);
            if (opt && opt.priceDelta >= 0 && opt.id !== 'pell-none')
                parts.push(opt.latinLabel ?? opt.label);
        }
        if (f.type === 'yesno' && v === true)
            parts.push(f.latinName ?? f.label);
    }
    return parts.join(', ');
}
/** Arabic spec line: "ورق كوشيه 350غ، وجهان، تغليف مطفي". */
function itemSpecAr(service, item) {
    if (!service)
        return '';
    const parts = [];
    for (const f of service.fields) {
        const v = item.fieldValues[f.id];
        if (f.type === 'select' && typeof v === 'string') {
            const opt = f.options?.find((o) => o.id === v);
            if (opt && opt.id !== 'pell-none')
                parts.push(opt.label);
        }
        if (f.type === 'yesno' && v === true)
            parts.push(f.label);
    }
    return parts.join('، ');
}
/** Dimension micro line: "9 × 5.5 cm — 1000 نسخة" (dimension part is LTR). */
function itemDims(service, item, unit) {
    let dims = null;
    if (service) {
        for (const f of service.fields) {
            const v = item.fieldValues[f.id];
            if (f.type === 'dimensions' && isDim(v)) {
                dims = (0, units_1.formatDimension)(v.widthMm, v.heightMm, unit);
                break;
            }
        }
        if (!dims && service.defaultPieceSize) {
            dims = (0, units_1.formatDimension)(service.defaultPieceSize.widthMm, service.defaultPieceSize.heightMm, unit);
        }
    }
    return { dims, qty: quantityOf(item) };
}
/** Services column summary: "Carte Visite + 2". */
function servicesSummary(devis) {
    const first = devis.items[0]?.serviceName ?? '—';
    const extra = devis.items.length - 1;
    return extra > 0 ? `${first} + ${extra}` : first;
}
/** Client display helpers (name + company micro). */
function clientLabel(client) {
    if (!client)
        return '—';
    return client.company ? `${client.name} — ${client.company}` : client.name;
}
