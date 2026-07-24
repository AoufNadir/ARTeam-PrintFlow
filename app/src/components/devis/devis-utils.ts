// ---------------------------------------------------------------------------
// Devis helpers shared by the wizard and the archive page: Algerian date
// formatting, TVA math, and human/Latin item-spec strings.
// ---------------------------------------------------------------------------

import type { Client, Devis, DevisItem, DimensionValue, Service, Unit } from '@/lib/types';
import { formatDimension } from '@/lib/units';

export const TVA_RATE = 0.19;

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

/** Devis totals: items carry HT; TTC = HT + TVA 19%. */
export function devisTotals(items: Pick<DevisItem, 'total'>[]) {
  const ht = items.reduce((s, it) => s + it.total, 0);
  const tva = ht * TVA_RATE;
  return { ht, tva, ttc: ht + tva };
}

// ------------------------------- item specs ---------------------------------

function isDim(v: unknown): v is DimensionValue {
  return typeof v === 'object' && v !== null && 'widthMm' in v && 'heightMm' in v;
}

function quantityOf(item: Pick<DevisItem, 'fieldValues' | 'quantity'>): number {
  const q = item.fieldValues['quantity'];
  return typeof q === 'number' ? q : Number(q) || item.quantity;
}

/**
 * Latin spec line for a Devis item (used in the document + PDF):
 * "Papier Couché 350g, Recto Verso, Pelliculage Mat".
 */
export function itemSpecLatin(service: Service | undefined, item: DevisItem): string {
  if (!service) return '';
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
  if (!service) return '';
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
