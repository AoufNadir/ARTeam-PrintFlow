// ---------------------------------------------------------------------------
// Devis helpers shared by the wizard and the archive page: Algerian date
// formatting, TVA math, and human/Latin item-spec strings.
// ---------------------------------------------------------------------------

import type { Client, Devis, DevisDiscount, DevisItem, DevisTotals, DimensionValue, Service, ServiceDevisItem, Unit } from '@/lib/types';
import { isCustomProjectItem } from '@/lib/custom-project';
import { formatDimension } from '@/lib/units';

export const DEFAULT_TVA_RATE = 0.19;
export const TVA_RATE = DEFAULT_TVA_RATE;

/** Algerian month names (as used in the design docs: "14 جانفي 2025"). */
export const AR_MONTHS = [
  'جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان',
  'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

export function formatDateAr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** "2025-01-14" for <input type="date"> */
export function toInputDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromInputDate(value: string): string {
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

// ------------------------------- totals -------------------------------------

function money(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function discountAmount(discount: DevisDiscount | undefined, base: number): number {
  if (!discount || discount.value <= 0 || base <= 0) return 0;
  if (discount.mode === 'percent') return money((base * Math.min(100, discount.value)) / 100);
  return money(Math.min(base, discount.value));
}

export interface DevisTotalsInput {
  discount?: DevisDiscount;
  extraFees?: { amount: number }[];
  taxRate?: number;
  advance?: Devis['advance'];
}

/**
 * Fixed commercial calculation order:
 * items HT -> discounts -> fees -> TVA -> TTC -> advance -> balance.
 */
export interface DevisTotalsItem {
  total: number;
  discount?: DevisDiscount;
  kind?: 'service' | 'custom-project';
  customProject?: { completion: 'draft' | 'complete' };
}

export function devisTotals(items: DevisTotalsItem[], input: DevisTotalsInput = {}): DevisTotals {
  const billable = items.filter((item) => item.kind !== 'custom-project' || item.customProject?.completion === 'complete');
  const itemsGross = money(billable.reduce((s, it) => s + it.total, 0));
  const itemDiscounts = money(billable.reduce((s, it) => s + discountAmount(it.discount, it.total), 0));
  const itemsHt = money(Math.max(0, itemsGross - itemDiscounts));
  const quoteDiscount = discountAmount(input.discount, itemsHt);
  const extraFees = money((input.extraFees ?? []).reduce((s, fee) => s + Math.max(0, fee.amount || 0), 0));
  const ht = money(Math.max(0, itemsHt - quoteDiscount) + extraFees);
  const taxRate = Number.isFinite(input.taxRate) ? Math.max(0, input.taxRate ?? DEFAULT_TVA_RATE) : DEFAULT_TVA_RATE;
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

function isDim(v: unknown): v is DimensionValue {
  return typeof v === 'object' && v !== null && 'widthMm' in v && 'heightMm' in v;
}

function quantityOf(item: Pick<ServiceDevisItem, 'fieldValues' | 'quantity'>): number {
  const q = item.fieldValues['quantity'];
  return typeof q === 'number' ? q : Number(q) || item.quantity;
}

/**
 * Latin spec line for a Devis item (used in the document + PDF):
 * "Papier Couché 350g, Recto Verso, Pelliculage Mat".
 */
export function itemSpecLatin(service: Service | undefined, item: DevisItem): string {
  if (!service || isCustomProjectItem(item)) return '';
  const parts: string[] = [];
  for (const f of service.fields) {
    const v = item.fieldValues[f.id];
    if (f.type === 'select' && typeof v === 'string') {
      const opt = f.options?.find((o) => o.id === v);
      if (opt && opt.priceDelta >= 0 && opt.id !== 'pell-none') parts.push(opt.latinLabel ?? opt.label);
    }
    if (f.type === 'yesno' && v === true) parts.push(f.latinName ?? f.label);
  }
  return parts.join(', ');
}

/** Arabic spec line: "ورق كوشيه 350غ، وجهان، تغليف مطفي". */
export function itemSpecAr(service: Service | undefined, item: DevisItem): string {
  if (!service || isCustomProjectItem(item)) return '';
  const parts: string[] = [];
  for (const f of service.fields) {
    const v = item.fieldValues[f.id];
    if (f.type === 'select' && typeof v === 'string') {
      const opt = f.options?.find((o) => o.id === v);
      if (opt && opt.id !== 'pell-none') parts.push(opt.label);
    }
    if (f.type === 'yesno' && v === true) parts.push(f.label);
  }
  return parts.join('، ');
}

/** Dimension micro line: "9 × 5.5 cm — 1000 نسخة" (dimension part is LTR). */
export function itemDims(service: Service | undefined, item: DevisItem, unit: Unit): { dims: string | null; qty: number } {
  if (isCustomProjectItem(item)) return { dims: null, qty: item.customProject.finalQuantity };
  let dims: string | null = null;
  if (service) {
    for (const f of service.fields) {
      const v = item.fieldValues[f.id];
      if (f.type === 'dimensions' && isDim(v)) {
        dims = formatDimension(v.widthMm, v.heightMm, unit);
        break;
      }
    }
    if (!dims && service.defaultPieceSize) {
      dims = formatDimension(service.defaultPieceSize.widthMm, service.defaultPieceSize.heightMm, unit);
    }
  }
  return { dims, qty: quantityOf(item) };
}

/** Services column summary: "Carte Visite + 2". */
export function servicesSummary(devis: Devis): string {
  const first = devis.items[0]?.serviceName ?? '—';
  const extra = devis.items.length - 1;
  return extra > 0 ? `${first} + ${extra}` : first;
}

/** Client display helpers (name + company micro). */
export function clientLabel(client: Client | undefined): string {
  if (!client) return '—';
  return client.company ? `${client.name} — ${client.company}` : client.name;
}
