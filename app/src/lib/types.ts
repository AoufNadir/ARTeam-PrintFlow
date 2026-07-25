// ---------------------------------------------------------------------------
// ARTeam PrintFlow — domain types (shared contract for all page agents)
// All dimensions are stored internally in millimeters (mm). See units.ts.
// ---------------------------------------------------------------------------

import type { DesignFileAsset } from './design-file-types';

export type Unit = 'mm' | 'cm';

export type FieldType = 'number' | 'select' | 'yesno' | 'text' | 'dimensions';

/** Unit basis shown next to a price delta, e.g. "+10 دج/نسخة" */
export type DeltaUnit = 'perCopy' | 'perSheet' | 'perFace' | 'perM2' | 'fixed' | 'percent';

export interface FieldOption {
  id: string;
  label: string; // Arabic label
  latinLabel?: string; // e.g. "Papier Couché 350g"
  priceDelta: number; // in DA
  deltaUnit: DeltaUnit;
}

export interface ServiceField {
  id: string;
  label: string;
  latinName?: string;
  type: FieldType;
  required?: boolean;
  defaultValue?: string | number | boolean | DimensionValue;
  options?: FieldOption[]; // for select
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}

export interface Service {
  id: string;
  sectionId: string;
  name: string; // Arabic display name
  latinName?: string; // e.g. "Carte Visite"
  description?: string;
  fields: ServiceField[];
  pricingRuleIds: string[];
  defaultPieceSize?: { widthMm: number; heightMm: number };
  defaultBleedMm?: number;
  stages?: string[]; // e.g. ["impression", "pelliculage", "coupe"]
}

export interface Section {
  id: string;
  name: string;
  latinName?: string;
  description?: string;
  serviceIds: string[];
}

// ------------------------------- Pricing rules -----------------------------

export type PricingBasis = 'perSheet' | 'perFace' | 'perM2' | 'perCopy' | 'fixed' | 'percent';

export interface PricingRule {
  id: string;
  name: string;
  latinName?: string;
  basis: PricingBasis;
  value: number; // DA per unit, or percentage points when basis === 'percent'
  appliesTo?: 'paper' | 'printing' | 'cutting' | 'finishing' | 'global';
  /** Semantic key for global percent rules — robust alternative to id-string matching */
  kind?: 'waste' | 'overhead' | 'margin';
  enabled: boolean;
}

export interface PricingRulesVersion {
  id: string;
  version: number;
  createdAt: string; // ISO
  note?: string;
  rules: PricingRule[];
}

// ------------------------------- CRM / Devis --------------------------------

export interface Client {
  id: string;
  name: string;
  company?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  createdAt: string;
}

export type ProjectStatus = 'active' | 'paused' | 'done';

export interface Project {
  id: string;
  clientId: string;
  name: string;
  status: ProjectStatus;
  createdAt: string;
}

export type DevisStatus =
  | 'draft'
  | 'ready'
  | 'sent'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'production'
  | 'done';

export type DiscountMode = 'amount' | 'percent';

export interface DevisDiscount {
  mode: DiscountMode;
  value: number;
  reason?: string;
}

export interface DevisExtraFee {
  id: string;
  label: string;
  amount: number;
}

export interface DevisAdvance {
  mode: DiscountMode;
  value: number;
}

export interface DevisTotals {
  itemsHt: number;
  itemDiscounts: number;
  quoteDiscount: number;
  extraFees: number;
  ht: number;
  taxRate: number;
  tva: number;
  ttc: number;
  advance: number;
  balanceDue: number;
}

export interface CommercialTerms {
  paymentTerms?: string;
  deliveryMethod?: string;
  deliveryDelay?: string;
  validityTerms?: string;
  language?: 'ar' | 'fr' | 'bilingual';
}

export type DevisAttachmentKind = 'artwork' | 'cut-contour';

export interface DevisAttachment {
  id: string;
  kind: DevisAttachmentKind;
  asset: DesignFileAsset;
  linkedDesignId?: string;
  uploadedAt: string;
}

export type MontageState = 'confirmed' | 'estimated' | 'stale' | 'invalid';

export type PreflightSeverity = 'ok' | 'warning' | 'error';

export interface PreflightCheck {
  key: string;
  label: string;
  status: PreflightSeverity;
  message?: string;
}

export interface QuantityOption {
  quantity: number;
  pricing: PriceBreakdown;
  unitPrice: number;
  total: number;
  margin: number;
  marginPercent: number;
}

export interface DevisDesign {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  quantity: number;
  bleedMm?: BleedBox;
  artwork?: DesignFileAsset;
  cutContour?: DesignFileAsset;
}

export interface DevisProductionSetup {
  serviceTemplateId?: string;
  paperId?: string;
  paperLabel?: string;
  method?: PrintMethod;
  machineId?: string;
  sheetWidthMm?: number;
  sheetHeightMm?: number;
  cutMethod?: MontageInput['cutMethod'];
  serviceFieldValues?: Record<string, string | number | boolean | DimensionValue>;
}

export interface DesignPriceAllocation {
  designId: string;
  name: string;
  quantity: number;
  copiesPerSheet: number;
  produced: number;
  areaShare: number;
  allocatedTotal: number;
  unitPrice: number;
}

export interface DevisItem {
  id: string;
  order?: number;
  serviceId: string;
  serviceName: string;
  quantity: number;
  fieldValues: Record<string, string | number | boolean | DimensionValue>;
  designs?: DevisDesign[];
  productionSetup?: DevisProductionSetup;
  designAllocations?: DesignPriceAllocation[];
  attachments?: DevisAttachment[];
  montageState?: MontageState;
  preflight?: PreflightCheck[];
  quantityOptions?: QuantityOption[];
  discount?: DevisDiscount;
  manualPriceReason?: string;
  montageResult?: MontageResult;
  pricing: PriceBreakdown;
  unitPrice: number; // DA
  total: number; // DA
}

export interface Devis {
  id: string;
  dataVersion?: number;
  number: string; // e.g. "D-2025-0147"
  revision?: number; // R1 = original, R2+ are locked quote revisions
  revisionOfId?: string;
  rootDevisId?: string;
  clientId: string;
  projectId?: string;
  status: DevisStatus;
  items: DevisItem[];
  total: number;
  totals?: DevisTotals;
  discount?: DevisDiscount;
  extraFees?: DevisExtraFee[];
  taxRate?: number;
  advance?: DevisAdvance;
  /** Optional free-form title shown next to the number (e.g. "حملة رمضان") */
  title?: string;
  /** ISO date — promised delivery date */
  deliveryDate?: string;
  /** ISO date — offer validity deadline ("صالح حتى") */
  validUntil?: string;
  /** Legacy notes. Migrated to internalNotes when possible. */
  notes?: string;
  /** Notes that never appear on the client PDF. */
  internalNotes?: string;
  /** Notes and terms that appear on the client PDF. */
  clientNotes?: string;
  commercialTerms?: CommercialTerms;
  /** Reason recorded when the computed price was manually overridden */
  overrideReason?: string;
  sentAt?: string;
  sentVia?: 'download' | 'email' | 'whatsapp' | 'manual';
  acceptedAt?: string;
  rejectedAt?: string;
  expiredAt?: string;
  lockedAt?: string;
  productionStatus?: 'not-started' | 'ready' | 'work-order-created';
  productionWorkOrderId?: string;
  rulesVersion: number; // frozen pricing-rules version, badge "قواعد v{n}"
  rulesSnapshot: PricingRule[]; // deep copy of the rules at creation time
  /** deep copy of paper prices at creation time ("ثبات الماضي") */
  papersSnapshot?: PaperType[];
  /** deep copy of machine costs at creation time ("ثبات الماضي") */
  machinesSnapshot?: Machine[];
  createdAt: string;
  updatedAt: string;
}

// ------------------------------- Montage ------------------------------------

export type PrintMethod = 'recto' | 'recto-verso' | 'bascule' | 'double-pince';

/** Bleed per side (mm) — same shape as the UI's BleedValue. */
export interface BleedBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface StickerGroup {
  id: string;
  name?: string;
  widthMm: number;
  heightMm: number;
  quantity: number;
  color?: string;
  /** Optional per-group bleed — overrides MontageInput.bleedMm for this group. */
  bleedMm?: BleedBox;
  /** Optional INTERNAL gap (mm) between copies of THIS group — extra air above
   *  bleed-box touching. Overrides MontageInput.defaultGapMm for same-group
   *  pairs. Undefined → the default gap applies. */
  intraGapMm?: number;
}

export interface MontageInput {
  sheetWidthMm: number;
  sheetHeightMm: number;
  /** Single-piece convenience (used when `groups` is absent) */
  pieceWidthMm?: number;
  pieceHeightMm?: number;
  /** Multi-sticker groups — pieces of the same size share a groupId/color */
  groups?: StickerGroup[];
  bleedMm: BleedBox;
  quantity: number;
  method: PrintMethod;
  /** gutter between the two halves for bascule / double-pince, in mm */
  gutterMm?: number;
  /** double-pince only: grip strip width at each end of the SMALLER sheet
   *  dimension (replaces the machine margin there). Default 10mm when absent. */
  gripMm?: number;
  machineId?: string;
  /** GLOBAL gap (mm) between any two cells — extra air above bleed-box
   *  touching (0 = legacy behavior: bleed boxes may touch). A hard constraint:
   *  packers never violate it. Default 0 when absent. */
  defaultGapMm?: number;
  /** PAIR gap overrides (mm), keyed by pairGapKey(a,b) = the two group ids
   *  sorted alphabetically, joined with '|'. Priority: pair > intra > default. */
  pairGaps?: Record<string, number>;
  /** Cut method of the job. Guillotine restricts generation and final
   *  validation to rows/columns/rectangular slicing blocks; free mixed
   *  MaxRects candidates remain available only to die-cut/cutcontour.
   *  Absent keeps the legacy free behavior. */
  cutMethod?: 'guillotine' | 'die-cut' | 'cutcontour';
}

export interface PlacedPiece {
  x: number; // mm, inside sheet coordinate space (origin top-left of sheet)
  y: number;
  w: number;
  h: number;
  rotated: boolean;
  groupId: string;
  color: string;
  /** Stable identity used only by the manual layout editor. Engine layouts may
   *  omit it; the editor assigns one on first entry. */
  editorId?: string;
  /** User-created editor group. Deliberately separate from `groupId`, which is
   *  the immutable design/type identity used by production calculations. */
  editorGroupId?: string;
  /** per-side bleed (mm) actually applied around the trim rect, in sheet space
   *  (already mirrored for the verso half). Present on engine-produced pieces;
   *  absent on legacy/manual ones. */
  bleed?: BleedBox;
}

export interface SheetAlternative {
  sheetWidthMm: number;
  sheetHeightMm: number;
  machineId?: string;
  copiesPerSheet: number;
  sheetsNeeded: number;
  wastePercent: number;
  score: number; // lower is better (sheets then waste)
}

/**
 * Flip axis for bascule / double-pince. Always the midpoint of the SMALLER
 * sheet dimension (sheet space, mm — not the printable area):
 *  - axis 'vertical'   → split left/right at x = position, verso mirrored
 *                        horizontally (x' = sheetW − x − w)
 *  - axis 'horizontal' → split top/bottom at y = position, verso mirrored
 *                        vertically (y' = sheetH − y − h)
 */
export interface FlipAxisInfo {
  axis: 'vertical' | 'horizontal';
  /** axis position in sheet space (mm) = split dimension / 2 — LARGER sheet
   *  dimension for bascule, SMALLER for double-pince (physical sheet) */
  position: number;
  /** which sheet dimension is split in half by the axis */
  split: 'width' | 'height';
}

export interface MontageResult {
  placed: PlacedPiece[];
  copiesPerSheet: number;
  sheetsNeeded: number;
  wastePercent: number;
  printableArea: { x: number; y: number; w: number; h: number };
  sheetWidthMm: number;
  sheetHeightMm: number;
  rotated: boolean;
  method: PrintMethod;
  facesPerSheet: 1 | 2;
  /** Flip axis actually used — present only for bascule / double-pince */
  flipAxis?: FlipAxisInfo;
  /** double-pince only: grip strip width (mm) actually applied at each end of
   *  the smaller sheet dimension — forbiddenBandsOf derives its bands from it */
  gripMm?: number;
  /** bascule only: central gutter width (mm) actually applied around the flip
   *  axis — gutterBandOf derives its band from it (axis ± gutterMm/2) */
  gutterMm?: number;
  /** Validated straight-cut family. Present on Guillotine results only. */
  cutPattern?: 'rows' | 'columns' | 'blocks';
  alternatives: SheetAlternative[];
}

// ------------------------------- Machines & paper ----------------------------

export type MachineKind = 'digital' | 'offset';

export interface SheetSize {
  id: string;
  widthMm: number;
  heightMm: number;
  label: string; // e.g. "32×45 cm"
}

export interface Machine {
  id: string;
  name: string;
  kind: MachineKind;
  /** non-printable margins (mm) — digital: centered frame; offset: side margins */
  margins: { top: number; bottom: number; left: number; right: number };
  /** offset gripper bite (mm) applied as a strip on the LARGEST sheet edge */
  priseDePince?: number;
  sheetSizes: SheetSize[];
  costPerFace?: number; // DA
  enabled: boolean;
}

export interface PaperType {
  id: string;
  name: string; // e.g. "Papier Couché 350g"
  gsm: number;
  pricePerSheet: number; // DA
  sheetSizeId?: string;
  enabled: boolean;
}

// ------------------------------- Pricing engine ------------------------------

export interface DimensionValue {
  widthMm: number;
  heightMm: number;
}

export interface PriceBreakdown {
  paper: number;
  printing: number;
  cutting: number;
  finishing: number;
  waste: number; // DA cost attributed to waste factor
  overhead: number;
  margin: number;
  subtotal: number; // before margin
  unitPrice: number;
  total: number;
}
