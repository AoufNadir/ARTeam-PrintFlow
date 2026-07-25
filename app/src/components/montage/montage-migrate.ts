// ---------------------------------------------------------------------------
// Montage studio — persisted state-draft migration.
// Pure & dependency-light so it can be unit-tested outside the page bundle.
// The studio state draft lives in localStorage under
// 'arteam-printflow:montage-state-draft'. Drafts saved by older builds use the
// legacy shape (pieceW/pieceH/bleed/quantity/extraGroups); migrateStateDraft
// upgrades them to the current stickers[]/bleedShared shape without losing
// any user data, and the persist effect re-saves the new shape afterwards.
// ---------------------------------------------------------------------------

import type { BleedValue } from '@/components/ds/BleedGroup';
import type { DesignFileAsset } from '@/lib/design-file-types';
import { INITIAL_STATE, normalizeSheetForKind, type MontageUIState, type Sticker } from './montage-data';

function asBleed(v: unknown, fallback: BleedValue): BleedValue {
  const o = (v ?? {}) as Partial<Record<keyof BleedValue, unknown>>;
  const num = (x: unknown, fb: number) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : fb);
  return {
    top: num(o.top, fallback.top),
    bottom: num(o.bottom, fallback.bottom),
    left: num(o.left, fallback.left),
    right: num(o.right, fallback.right),
  };
}

function asAsset(v: unknown): DesignFileAsset | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const format = o.format;
  const confidence = o.confidence;
  if (
    typeof o.id !== 'string' ||
    typeof o.storageKey !== 'string' ||
    typeof o.fileName !== 'string' ||
    !['pdf', 'svg', 'ai', 'jpg'].includes(String(format)) ||
    !['high', 'medium', 'low'].includes(String(confidence)) ||
    typeof o.widthMm !== 'number' ||
    typeof o.heightMm !== 'number'
  ) {
    return undefined;
  }
  return v as DesignFileAsset;
}

function asSticker(v: unknown, index: number, shared: BleedValue): Sticker | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  return {
    id: typeof o.id === 'string' && o.id ? o.id : `st-${index + 1}`,
    name: typeof o.name === 'string' && o.name.trim() ? o.name : undefined,
    widthMm: typeof o.widthMm === 'number' ? o.widthMm : 0,
    heightMm: typeof o.heightMm === 'number' ? o.heightMm : 0,
    bleed: asBleed(o.bleed, shared),
    bleedLinked: typeof o.bleedLinked === 'boolean' ? o.bleedLinked : true,
    quantity: typeof o.quantity === 'number' ? o.quantity : 0,
    copiesPerSheet:
      typeof o.copiesPerSheet === 'number' && Number.isFinite(o.copiesPerSheet) && o.copiesPerSheet > 0
        ? Math.floor(o.copiesPerSheet)
        : undefined,
    intraGapMm:
      typeof o.intraGapMm === 'number' && Number.isFinite(o.intraGapMm) && o.intraGapMm > 0
        ? o.intraGapMm
        : undefined,
    asset: asAsset(o.asset),
    cutContour: asAsset(o.cutContour),
  };
}

/** Sanitize the persisted pair-gap table: numeric finite values ≥ 0 only. */
function asPairGaps(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) out[k] = n;
  }
  return out;
}

/**
 * Migrate a persisted montage-studio state draft to the current shape.
 *  - new shape (stickers[]/bleedShared) → sanitized and returned as-is;
 *  - legacy shape (pieceW/pieceH/bleed/quantity/extraGroups) → converted to
 *    stickers (primary + extras, all linked to the shared bleed) so no user
 *    data is lost.
 * Returns null when the draft is unusable.
 */
export function migrateStateDraft(raw: unknown): MontageUIState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  if (Array.isArray(o.stickers)) {
    const shared = asBleed(o.bleedShared, INITIAL_STATE.bleedShared);
    // empty stickers is valid (blank sheet); drop only unparsable entries
    const stickers = o.stickers.map((s, i) => asSticker(s, i, shared)).filter((s): s is Sticker => s !== null);
    const rest = { ...o };
    delete rest.stickers;
    delete rest.bleedShared;
    delete rest.calcMode;
    delete rest.defaultGapMm;
    delete rest.pairGaps;
    // retired fields of the removed manual-mode card
    delete rest.manualMode;
    delete rest.manualCopies;
    // old drafts never had calcMode → 'quantity' (the INITIAL_STATE default);
    // only an explicit 'fixed' is honored
    const calcMode = o.calcMode === 'fixed' ? ('fixed' as const) : INITIAL_STATE.calcMode;
    // spacing fields: sanitized (old drafts never had them → INITIAL_STATE defaults)
    const defaultGapMm =
      typeof o.defaultGapMm === 'number' && Number.isFinite(o.defaultGapMm) && o.defaultGapMm >= 0
        ? o.defaultGapMm
        : INITIAL_STATE.defaultGapMm;
    const pairGaps = asPairGaps(o.pairGaps);
    const merged: MontageUIState = { ...INITIAL_STATE, ...(rest as Partial<MontageUIState>), calcMode, stickers, bleedShared: shared, defaultGapMm, pairGaps };
    // offset sheets are stored landscape in the new model: flip legacy portrait
    // offset drafts (e.g. 350×500 → 500×350) so the loaded draft matches the
    // normalized space (grip at the bottom)
    return { ...merged, ...normalizeSheetForKind(merged.kind, merged.sheetW, merged.sheetH) };
  }

  if (typeof o.pieceW === 'number') {
    const shared = asBleed(o.bleed, INITIAL_STATE.bleedShared);
    const primary = asSticker(
      { id: 'g1', widthMm: o.pieceW, heightMm: o.pieceH, quantity: o.quantity, bleed: shared, bleedLinked: true },
      0,
      shared,
    );
    const extras = Array.isArray(o.extraGroups)
      ? o.extraGroups
          .map((g, i) => asSticker({ ...(g as Record<string, unknown>), bleed: shared, bleedLinked: true }, i + 1, shared))
          .filter((s): s is Sticker => s !== null)
      : [];
    if (!primary) return null;
    const rest = { ...o };
    for (const k of ['pieceW', 'pieceH', 'bleed', 'quantity', 'extraGroups']) delete rest[k];
    const merged: MontageUIState = { ...INITIAL_STATE, ...(rest as Partial<MontageUIState>), stickers: [primary, ...extras], bleedShared: shared };
    return { ...merged, ...normalizeSheetForKind(merged.kind, merged.sheetW, merged.sheetH) };
  }

  return null;
}
