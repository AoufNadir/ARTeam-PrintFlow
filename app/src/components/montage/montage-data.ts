// ---------------------------------------------------------------------------
// Smart Montage studio — shared UI state, local machine catalog, cost helpers.
// Layout math lives in @/lib/montage-engine (computeMontage / bestSheet /
// printableArea); this module only adapts UI state to engine inputs.
// ---------------------------------------------------------------------------

import { GROUP_COLORS } from '@/lib/catalog';
import {
  DOUBLE_PINCE_GRIP_MM,
  computeFixedMontage,
  computeMontage,
  evaluateMontage,
  forbiddenBandsOf,
  gutterBandOf,
  halfWorkArea,
  printableAreaForMethod,
  type FixedGroupSpec,
  type FixedMontageOutcome,
} from '@/lib/montage-engine';
import { trimNumber } from '@/lib/units';
import type { DesignFileAsset } from '@/lib/design-file-types';
import type { BleedValue } from '@/components/ds/BleedGroup';
import type {
  Machine,
  MachineKind,
  MontageInput,
  MontageResult,
  PlacedPiece,
  PricingRule,
  PrintMethod,
  StickerGroup,
} from '@/lib/types';

export { GROUP_COLORS };
export type { BleedValue };

// ------------------------------- constants -----------------------------------

export type CutMethod = 'guillotine' | 'die-cut' | 'cutcontour';

export const CUT_METHODS: { id: CutMethod; label: string; latin: string }[] = [
  { id: 'guillotine', label: 'قص مستقيم', latin: 'Guillotine' },
  { id: 'die-cut', label: 'قص بقالب', latin: 'Die-cut' },
  { id: 'cutcontour', label: 'كشكول/بلوتر', latin: 'CutContour' },
];

export const PRINT_METHODS: { id: PrintMethod; label: string; latin: string }[] = [
  { id: 'recto', label: 'وجه واحد', latin: 'Recto' },
  { id: 'recto-verso', label: 'وجهان', latin: 'Recto / Verso' },
  { id: 'bascule', label: 'انقلاب على الوسط', latin: 'Bascule' },
  { id: 'double-pince', label: 'بنسّتين', latin: 'Double Pince' },
];

export const QUANTITY_PRESETS = [100, 250, 500, 1000];
export const MAX_GROUPS = 6;

/** Local machine catalog for the montage studio (digital + offset pickers). */
export const MONTAGE_MACHINES: Machine[] = [
  {
    id: 'mc-versant',
    name: 'Xerox Versant 180',
    kind: 'digital',
    margins: { top: 4, bottom: 4, left: 4, right: 4 },
    costPerFace: 12,
    enabled: true,
    sheetSizes: [
      { id: 'a4', widthMm: 210, heightMm: 297, label: 'A4' },
      { id: 'a4-plus', widthMm: 225, heightMm: 320, label: 'A4+' },
      { id: 'sh-330-245', widthMm: 330, heightMm: 245, label: '33×24.5 cm' },
      { id: 'sra3', widthMm: 320, heightMm: 450, label: 'SRA3 32×45' },
      { id: 'sh-330-480', widthMm: 330, heightMm: 480, label: '33×48 cm' },
    ],
  },
  {
    id: 'mc-primelink',
    name: 'Xerox PrimeLink',
    kind: 'digital',
    margins: { top: 5, bottom: 5, left: 5, right: 5 },
    costPerFace: 11,
    enabled: true,
    sheetSizes: [
      { id: 'a4', widthMm: 210, heightMm: 297, label: 'A4' },
      { id: 'a4-plus', widthMm: 225, heightMm: 320, label: '22.5×32 cm' },
    ],
  },
  {
    id: 'mc-canon',
    name: 'Canon imagePRESS',
    kind: 'digital',
    margins: { top: 4, bottom: 4, left: 4, right: 4 },
    costPerFace: 12,
    enabled: true,
    sheetSizes: [
      { id: 'a4', widthMm: 210, heightMm: 297, label: 'A4' },
      { id: 'a4-plus', widthMm: 225, heightMm: 320, label: 'A4+' },
      { id: 'sh-330-245', widthMm: 330, heightMm: 245, label: '33×24.5 cm' },
      { id: 'sra3', widthMm: 320, heightMm: 450, label: '32×45 cm' },
    ],
  },
  {
    id: 'mc-heidelberg',
    name: 'Heidelberg 4 لون',
    kind: 'offset',
    margins: { top: 8, bottom: 8, left: 8, right: 8 },
    priseDePince: 12,
    costPerFace: 7,
    enabled: true,
    sheetSizes: [
      { id: 'of-25-33', widthMm: 250, heightMm: 330, label: '25×33 cm' },
      { id: 'of-35-50', widthMm: 350, heightMm: 500, label: '35×50 cm' },
      { id: 'of-33-70', widthMm: 330, heightMm: 700, label: '33×70 cm' },
      { id: 'of-50-70', widthMm: 500, heightMm: 700, label: '50×70 cm' },
    ],
  },
  {
    id: 'mc-ryobi',
    name: 'Ryobi 2 لون',
    kind: 'offset',
    margins: { top: 8, bottom: 8, left: 8, right: 8 },
    priseDePince: 10,
    costPerFace: 7,
    enabled: true,
    sheetSizes: [
      { id: 'of-25-33', widthMm: 250, heightMm: 330, label: '25×33 cm' },
      { id: 'of-35-50', widthMm: 350, heightMm: 500, label: '35×50 cm' },
    ],
  },
];

export const MACHINE_MICRO: Record<string, string> = {
  'mc-versant': 'حتى 33×48 — هوامش 4مم',
  'mc-primelink': '22.5×32 — هوامش 5مم',
  'mc-canon': '32×45 — هوامش 4مم',
  'mc-heidelberg': '50×70 — Prise de pince 12مم',
  'mc-ryobi': '35×50 — pince 10مم',
};

// ------------------------------- UI state ------------------------------------

/**
 * One design (تصميم) composed on the sheet. stickers[0] is always the primary
 * design; up to MAX_GROUPS designs may share the same sheet. Each design
 * carries its own bleed; `bleedLinked` designs follow `bleedShared` and are
 * re-synced by the controls whenever the shared bleed changes. In fixed mode
 * each design also carries `copiesPerSheet` (exact copies per sheet).
 */
export interface Sticker {
  id: string;
  /** User-facing name; populated from the uploaded file when available. */
  name?: string;
  widthMm: number;
  heightMm: number;
  bleed: BleedValue;        // this design's own bleed
  bleedLinked: boolean;     // follows the shared bleed?
  quantity: number;
  /** fixed mode only: exact copies of this design per sheet (default = last automatic suggestion) */
  copiesPerSheet?: number;
  /** internal gap (mm) between copies of THIS design — extra air above bleed-box
   *  touching; overrides the global default gap. Undefined → default applies. */
  intraGapMm?: number;
  /** Uploaded artwork metadata; the binary itself is persisted in IndexedDB. */
  asset?: DesignFileAsset;
  /** Optional separate die-line/cut-contour file linked to this design. */
  cutContour?: DesignFileAsset;
}

/** How the sheet layout is driven: from quantities (automatic) or from fixed per-sheet counts. */
export type CalcMode = 'quantity' | 'fixed';

export interface MontageUIState {
  kind: MachineKind;
  machineId: string;
  margins: { top: number; bottom: number; left: number; right: number };
  pinceMm: number;
  sheetW: number;
  sheetH: number;
  customSheet: boolean;
  autoSuggest: boolean;
  calcMode: CalcMode;
  stickers: Sticker[]; // may be empty (blank sheet); stickers[0] is primary when present
  bleedShared: BleedValue; // the shared bleed that linked designs follow
  method: PrintMethod;
  gutterMm: number;
  /** double-pince only: grip strip width at each end of the smaller sheet dimension (default 10) */
  gripMm?: number;
  cutMethod: CutMethod;
  sharedCut: boolean;
  doubleCut: boolean;
  /** global gap (mm) between any two designs' cells — extra air above bleed-box
   *  touching (0 = legacy behavior: bleed boxes may touch). Hard constraint. */
  defaultGapMm: number;
  /** per-pair gap overrides (mm), keyed by pairGapKey(idA, idB) — highest priority. */
  pairGaps: Record<string, number>;
}

export const INITIAL_STATE: MontageUIState = {
  kind: 'digital',
  machineId: 'mc-versant',
  margins: { top: 4, bottom: 4, left: 4, right: 4 },
  pinceMm: 12,
  sheetW: 320,
  sheetH: 450,
  customSheet: false,
  autoSuggest: true,
  calcMode: 'quantity',
  stickers: [
    {
      id: 'g1',
      widthMm: 89,
      heightMm: 89,
      bleed: { top: 3, bottom: 3, left: 3, right: 3 },
      bleedLinked: true,
      quantity: 1000,
    },
  ],
  bleedShared: { top: 3, bottom: 3, left: 3, right: 3 },
  method: 'recto',
  gutterMm: 10,
  gripMm: 10,
  cutMethod: 'guillotine',
  sharedCut: false,
  doubleCut: true,
  defaultGapMm: 0,
  pairGaps: {},
};

export function machineOf(state: MontageUIState): Machine {
  return MONTAGE_MACHINES.find((m) => m.id === state.machineId) ?? MONTAGE_MACHINES[0];
}

// --------------------------- offset sheet orientation -------------------------

/**
 * Sheet-dimension normalization per machine kind. Offset sheets are worked
 * LANDSCAPE (the larger dimension across the press direction, grip edge at the
 * bottom); digital sheets keep the catalog orientation. Returns the normalized
 * { sheetW, sheetH } — swapping W/H for offset when H > W.
 */
export function normalizeSheetForKind(
  kind: MachineKind,
  w: number,
  h: number,
): { sheetW: number; sheetH: number } {
  if (kind === 'offset' && h > w) return { sheetW: h, sheetH: w };
  return { sheetW: w, sheetH: h };
}

/**
 * Does a catalog sheet size match the given (possibly normalized) dimensions?
 * Offset sheets may be stored either portrait (catalog) or landscape
 * (normalized), so both orientations count as a match.
 */
export function sheetSizeMatches(
  kind: MachineKind,
  catalogW: number,
  catalogH: number,
  w: number,
  h: number,
): boolean {
  const direct = catalogW === w && catalogH === h;
  if (direct) return true;
  return kind === 'offset' && catalogW === h && catalogH === w;
}

/** Machines of the active kind, with the selected machine's margins/pince overridden by user edits. */
export function effectiveMachines(state: MontageUIState): Machine[] {
  return MONTAGE_MACHINES.filter((m) => m.kind === state.kind).map((m) => {
    // Offset model: full usable sheet — no catalog margins, only the grip strip.
    // Sizes are exposed LANDSCAPE (normalizeSheetForKind) so the UI, the engine
    // and the PDF all work in the same normalized space (grip at the bottom).
    const offsetBase: Machine =
      m.kind === 'offset'
        ? {
            ...m,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            sheetSizes: m.sheetSizes.map((s) => {
              const n = normalizeSheetForKind('offset', s.widthMm, s.heightMm);
              return { ...s, widthMm: n.sheetW, heightMm: n.sheetH };
            }),
          }
        : m;
    return m.id === state.machineId
      ? {
          ...offsetBase,
          margins: state.kind === 'offset' ? offsetBase.margins : { ...state.margins },
          priseDePince: state.kind === 'offset' ? state.pinceMm : undefined,
        }
      : offsetBase;
  });
}

/** Effective bleed of a design: the shared one when linked, its own otherwise. */
export function stickerBleed(state: MontageUIState, s: Sticker): BleedValue {
  return s.bleedLinked ? state.bleedShared : s.bleed;
}

/** All sticker groups (one per design), colors from the palette. */
export function allGroups(state: MontageUIState): StickerGroup[] {
  return state.stickers.map((s, i) => ({
    id: s.id,
    name: s.name || `تصميم ${i + 1}`,
    widthMm: s.widthMm,
    heightMm: s.heightMm,
    quantity: s.quantity,
    bleedMm: stickerBleed(state, s),
    color: GROUP_COLORS[i % GROUP_COLORS.length],
    intraGapMm: s.intraGapMm,
  }));
}

export function isMulti(state: MontageUIState): boolean {
  return state.stickers.length > 1;
}

export function buildEngineInput(state: MontageUIState): MontageInput {
  const primary = state.stickers[0];
  return {
    sheetWidthMm: state.sheetW,
    sheetHeightMm: state.sheetH,
    pieceWidthMm: primary?.widthMm ?? 0,
    pieceHeightMm: primary?.heightMm ?? 0,
    groups: isMulti(state) ? allGroups(state) : undefined,
    // single-design path: the engine uses this global bleed for the primary piece
    bleedMm: primary ? stickerBleed(state, primary) : state.bleedShared,
    quantity: primary?.quantity ?? 0,
    method: state.method,
    gutterMm: state.gutterMm,
    gripMm: state.gripMm,
    machineId: state.machineId,
    defaultGapMm: state.defaultGapMm,
    pairGaps: state.pairGaps,
    cutMethod: state.cutMethod,
  };
}

export function inputsValid(state: MontageUIState): boolean {
  const stickersOk =
    state.stickers.length > 0 && state.stickers.every((s) => s.widthMm > 0 && s.heightMm > 0 && s.quantity > 0);
  return stickersOk && state.sheetW > 0 && state.sheetH > 0;
}

/** Waste for a specific sheet candidate (null when the piece does not fit).
 *  Uses the engine's lightweight evaluateMontage directly — no alternatives
 *  scan, no fallback to another sheet — so it stays cheap per sheet size. */
export function wasteForSheet(
  state: MontageUIState,
  sheetW: number,
  sheetH: number,
): { wastePercent: number; copiesPerSheet: number } | null {
  if (!inputsValid(state)) return null;
  const machine = effectiveMachines(state).find((m) => m.id === state.machineId);
  // evaluate in the normalized space (offset = landscape) regardless of how the
  // candidate dimensions arrived
  const n = normalizeSheetForKind(state.kind, sheetW, sheetH);
  const r = evaluateMontage(
    { ...buildEngineInput(state), sheetWidthMm: n.sheetW, sheetHeightMm: n.sheetH },
    machine,
  );
  if (!r) return null;
  return { wastePercent: r.wastePercent, copiesPerSheet: r.copiesPerSheet };
}

/**
 * Human-readable reason when the engine cannot place anything (null result).
 * Drives the canvas / results empty states instead of a generic message.
 */
export function infeasibilityReason(state: MontageUIState): string | null {
  if (!inputsValid(state)) return null;
  const machines = effectiveMachines(state);
  const machine = machines.find((m) => m.id === state.machineId) ?? machines[0];
  const area = printableAreaForMethod(state.sheetW, state.sheetH, machine, state.method, state.gripMm);
  if (area.w <= 0 || area.h <= 0)
    return 'الهوامش و/أو قبضة الماكينة (Prise de pince) تستهلك كامل الورقة — وسّع الورقة أو قلّل الهوامش.';
  // primary-half work area per the flip rule: the SMALLER sheet dimension is
  // halved; bascule keeps a central gutter, double-pince has grip strips at
  // the ends of the smaller dimension (and no central gutter)
  const work = halfWorkArea(state.sheetW, state.sheetH, machine, state.method, state.gutterMm, state.gripMm);
  const availW = work.w;
  const availH = work.h;
  if (state.method === 'bascule' && (availW <= 0 || availH <= 0))
    return 'الفجوة الوسطية تستهلك كامل القياس الأكبر للورقة — وسّع الورقة أو قلّل الفجوة.';
  if (state.method === 'double-pince' && (availW <= 0 || availH <= 0))
    return 'شريطا القبضة (من كل طرف من طرفي القياس الأصغر) يستهلكان كامل الورقة — وسّع الورقة أو قلّل عرض القبضة.';
  const groups = allGroups(state);
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const bleed = g.bleedMm ?? state.bleedShared;
    const bleedW = bleed.left + bleed.right;
    const bleedH = bleed.top + bleed.bottom;
    const cw = g.widthMm + bleedW;
    const ch = g.heightMm + bleedH;
    const eps = 0.01;
    const fitsNormal = cw <= availW + eps && ch <= availH + eps;
    const fitsRotated = ch <= availW + eps && cw <= availH + eps;
    if (fitsNormal || fitsRotated) continue;
    const overNormal = Math.max(cw - availW, ch - availH);
    const overRotated = Math.max(ch - availW, cw - availH);
    const over = Math.ceil(Math.min(overNormal, overRotated) * 10) / 10;
    const name = groups.length === 1 ? 'التصميم' : `تصميم ${i + 1}`;
    return `${name} (${trimNumber(g.widthMm)}×${trimNumber(g.heightMm)}مم مع Bleed) أكبر من المساحة القابلة للطباعة بحوالي ${trimNumber(over)} مم — وسّع الورقة أو قلّل المقاس أو الهوامش.`;
  }
  return 'لا يمكن تركيب أي نسخة مع القيود الحالية — راجع المقاسات أو طريقة الطباعة.';
}

// ------------------------------- cost estimate --------------------------------

export interface CostEstimate {
  faces: number;
  paperPerSheet: number;
  paper: number;
  printPerFace: number;
  printing: number;
  cutPerSheet: number;
  cutting: number;
  total: number;
}

export function estimateCost(
  result: MontageResult,
  machine: Machine | undefined,
  rules: PricingRule[],
): CostEstimate {
  const ruleVal = (appliesTo: string, basis: string, fallback: number) =>
    rules.find((r) => r.enabled && r.appliesTo === appliesTo && r.basis === basis)?.value ?? fallback;
  const paperPerSheet = ruleVal('paper', 'perSheet', 18);
  const printPerFace = machine?.costPerFace ?? ruleVal('printing', 'perFace', 12);
  const cutPerSheet = ruleVal('cutting', 'perSheet', 2.5);
  const faces = result.facesPerSheet;
  const paper = result.sheetsNeeded * paperPerSheet;
  const printing = result.sheetsNeeded * faces * printPerFace;
  const cutting = result.sheetsNeeded * cutPerSheet;
  return {
    faces,
    paperPerSheet,
    paper,
    printPerFace,
    printing,
    cutPerSheet,
    cutting,
    total: paper + printing + cutting,
  };
}

// ------------------------------- waste levels ---------------------------------

export type WasteLevel = 'success' | 'warning' | 'danger';

export function wasteLevel(p: number): WasteLevel {
  if (p < 8) return 'success';
  if (p < 18) return 'warning';
  return 'danger';
}

export const WASTE_COLORS: Record<WasteLevel, string> = {
  success: '#16A34A',
  warning: '#D97706',
  danger: '#DC2626',
};

// --------------------------- geometry helpers (UI) ----------------------------

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Central gutter band — BASCULE only (sheet space, mm). Double-pince has no
 * central gutter under the current spec; its forbidden zones are the two grip
 * strips → use forbiddenBands(). When an engine result is available the band
 * is derived from the engine's own placement (gutterBandOf — single source of
 * truth); the centered strip below is only a pre-computation fallback, placed
 * on the flip axis = midpoint of the SMALLER sheet dimension.
 */
export function gutterBand(state: MontageUIState, area: Rect, result?: MontageResult | null): Rect | null {
  if (state.method !== 'bascule') return null;
  if (result) {
    const actual = gutterBandOf(result);
    if (actual) return actual;
  }
  // pre-computation fallback: the engine accepts any gutter ≥ 0 (no minimum);
  // the gutter is taken IN FULL from each half → band = 2 × gutter on the axis
  const w = Math.max(0, state.gutterMm);
  if (state.sheetW <= state.sheetH) return { x: state.sheetW / 2 - w, y: area.y, w: 2 * w, h: area.h };
  return { x: area.x, y: state.sheetH / 2 - w, w: area.w, h: 2 * w };
}

/**
 * All forbidden bands for the current method (sheet space, mm):
 *  - bascule      → the central gutter band
 *  - double-pince → the two 10mm grip strips at the ends of the SMALLER sheet
 *    dimension (they replace the machine margins on those two sides)
 *  - recto / recto-verso → []
 * When an engine result is available the bands come from the engine's own
 * forbiddenBandsOf (single source of truth).
 */
export function forbiddenBands(state: MontageUIState, area: Rect, result?: MontageResult | null): Rect[] {
  if (result && (state.method === 'bascule' || state.method === 'double-pince')) {
    return forbiddenBandsOf(result);
  }
  if (state.method === 'bascule') {
    const band = gutterBand(state, area, result);
    return band ? [band] : [];
  }
  if (state.method === 'double-pince') {
    const g = state.gripMm ?? DOUBLE_PINCE_GRIP_MM;
    if (state.sheetW <= state.sheetH) {
      return [
        { x: 0, y: 0, w: g, h: state.sheetH },
        { x: state.sheetW - g, y: 0, w: g, h: state.sheetH },
      ];
    }
    return [
      { x: 0, y: 0, w: state.sheetW, h: g },
      { x: 0, y: state.sheetH - g, w: state.sheetW, h: g },
    ];
  }
  return [];
}

/** A manual placement is valid when fully inside the printable area, outside every forbidden band and non-overlapping. */
export function placementValid(piece: Rect, others: Rect[], area: Rect, bands: Rect[]): boolean {
  const eps = 0.01;
  if (piece.x < area.x - eps || piece.y < area.y - eps) return false;
  if (piece.x + piece.w > area.x + area.w + eps) return false;
  if (piece.y + piece.h > area.y + area.h + eps) return false;
  for (const band of bands) if (rectsOverlap(piece, band)) return false;
  return !others.some((o) => rectsOverlap(piece, o));
}

export function clampToArea(piece: Rect, area: Rect): Rect {
  return {
    ...piece,
    x: Math.min(Math.max(piece.x, area.x), area.x + area.w - piece.w),
    y: Math.min(Math.max(piece.y, area.y), area.y + area.h - piece.h),
  };
}

/** Hex → rgba string with alpha, for piece fills / hatched bands. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Per-group bounding boxes for the shared-cut containers / legend counts. */
export function groupBounds(
  placed: PlacedPiece[],
): Map<string, Rect & { count: number; color: string }> {
  const map = new Map<string, Rect & { count: number; color: string }>();
  for (const p of placed) {
    const cur = map.get(p.groupId);
    if (!cur) {
      map.set(p.groupId, { x: p.x, y: p.y, w: p.w, h: p.h, count: 1, color: p.color });
    } else {
      const x2 = Math.max(cur.x + cur.w, p.x + p.w);
      const y2 = Math.max(cur.y + cur.h, p.y + p.h);
      cur.x = Math.min(cur.x, p.x);
      cur.y = Math.min(cur.y, p.y);
      cur.w = x2 - cur.x;
      cur.h = y2 - cur.y;
      cur.count += 1;
    }
  }
  return map;
}

/**
 * Engine wrapper: compute the montage for the current UI state.
 * In multi-sticker mode the engine's quantity-proportional band allotment can
 * reject a large piece whose quantity share is too small; retry with area-
 * proportional shares and restore the real sheetsNeeded afterwards.
 */
export function computeWithFallback(state: MontageUIState): MontageResult | null {
  const machines = effectiveMachines(state);
  const input = buildEngineInput(state);
  const r = computeMontage(input, machines);
  if (r || !isMulti(state)) return r;
  const areaShares = allGroups(state).map((g) => ({
    ...g,
    // area-proportional share: real piece area (w×h), not the old (w²+h²) sum
    quantity: Math.max(1, Math.round((g.widthMm * g.heightMm) / 100)),
  }));
  const r2 = computeMontage({ ...input, groups: areaShares }, machines);
  if (!r2) return null;
  const perGroup = new Map<string, number>();
  for (const p of r2.placed) perGroup.set(p.groupId, (perGroup.get(p.groupId) ?? 0) + 1);
  let sheets = 0;
  for (const g of allGroups(state)) sheets = Math.max(sheets, Math.ceil(g.quantity / Math.max(1, perGroup.get(g.id) ?? 0)));
  return { ...r2, sheetsNeeded: sheets };
}

// --------------------------- fixed-count mode --------------------------------

/** Effective fixed count of a design (its explicit value, else the given suggestion, else 1). */
export function stickerCopiesPerSheet(s: Sticker, suggested?: Map<string, number>): number {
  return Math.max(1, Math.floor(s.copiesPerSheet ?? suggested?.get(s.id) ?? 1));
}

/**
 * Fixed-count engine wrapper («عدد ثابت في الورقة»): places exactly the
 * requested copies of every design on the CURRENT sheet (no alternatives
 * scan — the blocking warning with per-design maximums guides the user).
 */
export function computeFixedWithFallback(state: MontageUIState): FixedMontageOutcome {
  const machine = effectiveMachines(state).find((m) => m.id === state.machineId);
  // fixed mode = sheet designer: «كم نسخة في الورقة» فقط — لا كمية إجمالية،
  // لذا تُمرَّر الكمية = عدد النسخ في الورقة لتكون النتيجة «ورقة واحدة تنتج N»
  const groups: FixedGroupSpec[] = allGroups(state).map((g, i) => ({
    ...g,
    quantity: stickerCopiesPerSheet(state.stickers[i]),
    copiesPerSheet: stickerCopiesPerSheet(state.stickers[i]),
  }));
  return computeFixedMontage(
    {
      sheetWidthMm: state.sheetW,
      sheetHeightMm: state.sheetH,
      groups,
      bleedMm: state.bleedShared,
      quantity: state.stickers[0] ? stickerCopiesPerSheet(state.stickers[0]) : 1,
      method: state.method,
      gutterMm: state.gutterMm,
      gripMm: state.gripMm,
      machineId: state.machineId,
      defaultGapMm: state.defaultGapMm,
      pairGaps: state.pairGaps,
      cutMethod: state.cutMethod,
    },
    machine,
  );
}

// --------------------------- production transparency -------------------------

export interface TransparencyRow {
  id: string;
  name: string;
  /** quantity the user needs of this design */
  requested: number;
  /** copies of this design per sheet in the effective layout */
  perSheet: number;
  /** sheetsNeeded × perSheet */
  produced: number;
  /** produced − requested (≥ 0) */
  extra: number;
  /** produced < requested — the run does NOT cover the order */
  shortfall: boolean;
  /** sheets actually required to cover the requested quantity */
  neededSheets: number;
}

/**
 * Per-design production transparency from the EFFECTIVE placed pieces (engine
 * result or a manually edited layout): requested / per-sheet / produced /
 * difference, plus the shortfall flag that drives the explicit error message.
 */
export function transparencyRows(
  state: MontageUIState,
  placed: PlacedPiece[],
  sheetsNeeded: number,
): TransparencyRow[] {
  const counts = new Map<string, number>();
  for (const p of placed) counts.set(p.groupId, (counts.get(p.groupId) ?? 0) + 1);
  return state.stickers.map((s, i) => {
    const perSheet = counts.get(s.id) ?? 0;
    const neededSheets = perSheet > 0 ? Math.ceil(s.quantity / perSheet) : Number.POSITIVE_INFINITY;
    const produced = sheetsNeeded * perSheet;
    return {
      id: s.id,
      name: s.name || (state.stickers.length === 1 ? 'التصميم' : `تصميم ${i + 1}`),
      requested: s.quantity,
      perSheet,
      produced,
      extra: Math.max(0, produced - s.quantity),
      shortfall: produced < s.quantity,
      neededSheets,
    };
  });
}
