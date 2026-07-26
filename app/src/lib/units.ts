// ---------------------------------------------------------------------------
// Units & formatting helpers. Internal storage is ALWAYS millimeters (mm).
// ---------------------------------------------------------------------------

import type { Unit } from './types';

export const MM_PER_CM = 10;

/** mm -> display unit value */
export function fromMm(mm: number, unit: Unit): number {
  return unit === 'cm' ? mm / MM_PER_CM : mm;
}

/** display unit value -> mm (lossless for both units) */
export function toMm(value: number, unit: Unit): number {
  return unit === 'cm' ? value * MM_PER_CM : value;
}

/** Round-trip safe conversion used by the mm ⇄ cm toggle. */
export function convertUnit(value: number, from: Unit, to: Unit): number {
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
export function parseDecimal(input: string): number {
  let s = input
    .trim()
    .replace(/[\s\u00A0]/g, '')
    .replace(/[،٫٬]/g, ',');
  if (s === '' || !/^[+-]?[0-9.,]+$/.test(s)) return NaN;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let decimalSep: '.' | ',' | null = null;
  if (lastDot !== -1 && lastComma !== -1) {
    decimalSep = lastDot > lastComma ? '.' : ','; // rightmost wins
  } else if (lastDot !== -1 || lastComma !== -1) {
    const sep: '.' | ',' = lastDot !== -1 ? '.' : ',';
    const parts = s.split(sep);
    const head = parts[0].replace(/^[+-]/, '');
    const isThousands =
      parts.length > 2 && head.length >= 1 && head.length <= 3 && parts.slice(1).every((p) => p.length === 3);
    decimalSep = isThousands ? null : sep;
  }
  if (decimalSep) {
    const other = decimalSep === '.' ? ',' : '.';
    s = s.split(other).join('');
    const i = s.lastIndexOf(decimalSep);
    s = s.slice(0, i).split(decimalSep).join('') + '.' + s.slice(i + 1);
  } else {
    s = s.split(',').join('').split('.').join('');
  }
  if (s === '' || s === '-' || s === '+' || s === '.' || s === '-.' || s === '+.') return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Format a number for display in the active unit (max 2 decimals, trimmed). */
export function formatMeasure(mm: number, unit: Unit): string {
  const v = fromMm(mm, unit);
  return trimNumber(unit === 'cm' ? round2(v) : Math.round(v));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/** Dimension string, e.g. "21 × 29.7 cm" or "85 × 55 mm" (use inside dir="ltr"). */
export function formatDimension(widthMm: number, heightMm: number, unit: Unit): string {
  return `${formatMeasure(widthMm, unit)} × ${formatMeasure(heightMm, unit)} ${unit}`;
}

// Latin digits with comma thousands separator: "1,240,000"
const numFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** DA currency: "1,240,000 دج" (currency word renders in Cairo outside LTR spans). */
export function formatDA(amount: number): string {
  return `${numFormatter.format(round2(amount))} دج`;
}

/** Latin-context currency: "1,240,000 DA". */
export function formatDALatin(amount: number): string {
  return `${numFormatter.format(round2(amount))} DA`;
}

/** Signed price delta for chips: "+10 دج/نسخة", "-2.1%". */
export function formatDelta(delta: number, unitLabel = ''): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '-' : '';
  const abs = trimNumber(round2(Math.abs(delta)));
  return `${sign}${abs}${unitLabel ? ` ${unitLabel}` : ''}`;
}

/** Percent: "9.4%" */
export function formatPercent(p: number, decimals = 1): string {
  return `${trimNumber(round2(Number(p.toFixed(decimals))))}%`;
}

export const DELTA_UNIT_LABELS: Record<string, string> = {
  perCopy: 'دج/نسخة',
  perSheet: 'دج/ورقة',
  perFace: 'دج/وجه',
  perM2: 'دج/م²',
  perSheetM2: 'دج/م² ورقة',
  fixed: 'دج',
  percent: '%',
};

export const BASIS_LABELS: Record<string, string> = {
  perSheet: 'لكل ورقة',
  perFace: 'لكل وجه',
  perM2: 'لكل م²',
  perSheetM2: 'لكل م² ورقة',
  perCopy: 'لكل نسخة',
  fixed: 'ثابت',
  percent: '%',
};
