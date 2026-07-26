"use strict";
// ---------------------------------------------------------------------------
// Units & formatting helpers. Internal storage is ALWAYS millimeters (mm).
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.BASIS_LABELS = exports.DELTA_UNIT_LABELS = exports.MM_PER_CM = void 0;
exports.fromMm = fromMm;
exports.toMm = toMm;
exports.convertUnit = convertUnit;
exports.parseDecimal = parseDecimal;
exports.formatMeasure = formatMeasure;
exports.round2 = round2;
exports.trimNumber = trimNumber;
exports.formatDimension = formatDimension;
exports.formatDA = formatDA;
exports.formatDALatin = formatDALatin;
exports.formatDelta = formatDelta;
exports.formatPercent = formatPercent;
exports.MM_PER_CM = 10;
/** mm -> display unit value */
function fromMm(mm, unit) {
    return unit === 'cm' ? mm / exports.MM_PER_CM : mm;
}
/** display unit value -> mm (lossless for both units) */
function toMm(value, unit) {
    return unit === 'cm' ? value * exports.MM_PER_CM : value;
}
/** Round-trip safe conversion used by the mm ⇄ cm toggle. */
function convertUnit(value, from, to) {
    return fromMm(toMm(value, from), to);
}
/**
 * Parse a decimal accepting both separators. Documented behavior:
 *  - "1.5" and "1,5" (plus Arabic "1،5" / "1٫5") all parse to 1.5.
 *  - When BOTH separators appear, the RIGHTMOST one is the decimal mark and
 *    the other is treated as thousands grouping: "1,234.5" and "1.234,5"
 *    both parse to 1234.5.
 *  - A repeated single separator in 3-digit groups is thousands grouping:
 *    "1,234,567" / "1.234.567" → 1234567. A LONE separator is always a
 *    decimal mark ("1,500" → 1.5, never 1500) — ambiguity resolved toward
 *    decimal because these inputs are dimensions, not quantities.
 * Returns NaN for invalid input so callers can show validation state.
 */
function parseDecimal(input) {
    let s = input
        .trim()
        .replace(/[\s\u00A0]/g, '')
        .replace(/[،٫٬]/g, ',');
    if (s === '' || !/^[+-]?[0-9.,]+$/.test(s))
        return NaN;
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    let decimalSep = null;
    if (lastDot !== -1 && lastComma !== -1) {
        decimalSep = lastDot > lastComma ? '.' : ','; // rightmost wins
    }
    else if (lastDot !== -1 || lastComma !== -1) {
        const sep = lastDot !== -1 ? '.' : ',';
        const parts = s.split(sep);
        const head = parts[0].replace(/^[+-]/, '');
        const isThousands = parts.length > 2 && head.length >= 1 && head.length <= 3 && parts.slice(1).every((p) => p.length === 3);
        decimalSep = isThousands ? null : sep;
    }
    if (decimalSep) {
        const other = decimalSep === '.' ? ',' : '.';
        s = s.split(other).join('');
        const i = s.lastIndexOf(decimalSep);
        s = s.slice(0, i).split(decimalSep).join('') + '.' + s.slice(i + 1);
    }
    else {
        s = s.split(',').join('').split('.').join('');
    }
    if (s === '' || s === '-' || s === '+' || s === '.' || s === '-.' || s === '+.')
        return NaN;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
}
/** Format a number for display in the active unit (max 2 decimals, trimmed). */
function formatMeasure(mm, unit) {
    const v = fromMm(mm, unit);
    return trimNumber(unit === 'cm' ? round2(v) : Math.round(v));
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
function trimNumber(n) {
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
/** Dimension string, e.g. "21 × 29.7 cm" or "85 × 55 mm" (use inside dir="ltr"). */
function formatDimension(widthMm, heightMm, unit) {
    return `${formatMeasure(widthMm, unit)} × ${formatMeasure(heightMm, unit)} ${unit}`;
}
// Latin digits with comma thousands separator: "1,240,000"
const numFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
/** DA currency: "1,240,000 دج" (currency word renders in Cairo outside LTR spans). */
function formatDA(amount) {
    return `${numFormatter.format(round2(amount))} دج`;
}
/** Latin-context currency: "1,240,000 DA". */
function formatDALatin(amount) {
    return `${numFormatter.format(round2(amount))} DA`;
}
/** Signed price delta for chips: "+10 دج/نسخة", "-2.1%". */
function formatDelta(delta, unitLabel = '') {
    const sign = delta > 0 ? '+' : delta < 0 ? '-' : '';
    const abs = trimNumber(round2(Math.abs(delta)));
    return `${sign}${abs}${unitLabel ? ` ${unitLabel}` : ''}`;
}
/** Percent: "9.4%" */
function formatPercent(p, decimals = 1) {
    return `${trimNumber(round2(Number(p.toFixed(decimals))))}%`;
}
exports.DELTA_UNIT_LABELS = {
    perCopy: 'دج/نسخة',
    perSheet: 'دج/ورقة',
    perFace: 'دج/وجه',
    perM2: 'دج/م²',
    perSheetM2: 'دج/م² ورقة',
    fixed: 'دج',
    percent: '%',
};
exports.BASIS_LABELS = {
    perSheet: 'لكل ورقة',
    perFace: 'لكل وجه',
    perM2: 'لكل م²',
    perSheetM2: 'لكل م² ورقة',
    perCopy: 'لكل نسخة',
    fixed: 'ثابت',
    percent: '%',
};
