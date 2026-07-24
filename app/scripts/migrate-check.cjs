// src/lib/catalog.ts
var SEED_PRICING_RULES = [
  { id: "rule-paper-sheet", name: "\u062A\u0643\u0644\u0641\u0629 \u0627\u0644\u0648\u0631\u0642", latinName: "Papier", basis: "perSheet", value: 18, appliesTo: "paper", enabled: true },
  { id: "rule-print-face-digital", name: "\u0637\u0628\u0627\u0639\u0629 \u0631\u0642\u0645\u064A\u0629 \u0644\u0644\u0648\u062C\u0647", latinName: "Impression digitale / face", basis: "perFace", value: 12, appliesTo: "printing", enabled: true },
  { id: "rule-print-face-offset", name: "\u0637\u0628\u0627\u0639\u0629 \u0623\u0648\u0641\u0633\u062A \u0644\u0644\u0648\u062C\u0647", latinName: "Impression offset / face", basis: "perFace", value: 7, appliesTo: "printing", enabled: true },
  { id: "rule-offset-setup", name: "\u062A\u062D\u0636\u064A\u0631 \u0627\u0644\u0623\u0648\u0641\u0633\u062A", latinName: "Calage offset", basis: "fixed", value: 4500, appliesTo: "printing", enabled: true },
  { id: "rule-cut-sheet", name: "\u0627\u0644\u0642\u0635", latinName: "Coupe", basis: "perSheet", value: 2.5, appliesTo: "cutting", enabled: true },
  { id: "rule-pelliculage-m2", name: "\u0627\u0644\u062A\u063A\u0644\u064A\u0641 \u0627\u0644\u0628\u0644\u0627\u0633\u062A\u064A\u0643\u064A", latinName: "Pelliculage", basis: "perM2", value: 90, appliesTo: "finishing", enabled: true },
  { id: "rule-waste", name: "\u0645\u0639\u0627\u0645\u0644 \u0627\u0644\u0647\u062F\u0631", latinName: "D\xE9chets", basis: "percent", value: 5, appliesTo: "global", kind: "waste", enabled: true },
  { id: "rule-overhead", name: "\u0627\u0644\u0645\u0635\u0627\u0631\u064A\u0641 \u0627\u0644\u0639\u0627\u0645\u0629", latinName: "Frais g\xE9n\xE9raux", basis: "percent", value: 8, appliesTo: "global", kind: "overhead", enabled: true },
  { id: "rule-margin", name: "\u0647\u0627\u0645\u0634 \u0627\u0644\u0631\u0628\u062D", latinName: "Marge", basis: "percent", value: 25, appliesTo: "global", kind: "margin", enabled: true }
];
var SEED_RULES_VERSION = {
  id: "rules-v1",
  version: 1,
  createdAt: (/* @__PURE__ */ new Date()).toISOString(),
  note: "\u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0623\u0648\u0644\u0649 \u0645\u0646 \u0642\u0648\u0627\u0639\u062F \u0627\u0644\u0623\u0633\u0639\u0627\u0631",
  rules: SEED_PRICING_RULES
};
var paperOptions = [
  { id: "pap-couche-350", label: "\u0648\u0631\u0642 \u0643\u0648\u0634\u064A\u0647 350\u063A", latinLabel: "Papier Couch\xE9 350g", priceDelta: 10, deltaUnit: "perCopy" },
  { id: "pap-couche-300", label: "\u0648\u0631\u0642 \u0643\u0648\u0634\u064A\u0647 300\u063A", latinLabel: "Papier Couch\xE9 300g", priceDelta: 8, deltaUnit: "perCopy" },
  { id: "pap-couche-170", label: "\u0648\u0631\u0642 \u0643\u0648\u0634\u064A\u0647 170\u063A", latinLabel: "Papier Couch\xE9 170g", priceDelta: 4, deltaUnit: "perCopy" },
  { id: "pap-offset-80", label: "\u0648\u0631\u0642 \u0623\u0648\u0641\u0633\u062A 80\u063A", latinLabel: "Papier Offset 80g", priceDelta: 0, deltaUnit: "perCopy" }
];
var facesOptions = [
  { id: "recto", label: "\u0648\u062C\u0647 \u0648\u0627\u062D\u062F", latinLabel: "Recto", priceDelta: 0, deltaUnit: "perCopy" },
  { id: "recto-verso", label: "\u0648\u062C\u0647\u0627\u0646", latinLabel: "Recto Verso", priceDelta: 2, deltaUnit: "perCopy" }
];
var pelliculageOptions = [
  { id: "pell-none", label: "\u0628\u062F\u0648\u0646", latinLabel: "Sans pelliculage", priceDelta: 0, deltaUnit: "perCopy" },
  { id: "pell-mat", label: "\u062A\u063A\u0644\u064A\u0641 \u0645\u0637\u0641\u064A", latinLabel: "Pelliculage Mat", priceDelta: 3, deltaUnit: "perCopy" },
  { id: "pell-brillant", label: "\u062A\u063A\u0644\u064A\u0641 \u0644\u0627\u0645\u0639", latinLabel: "Pelliculage Brillant", priceDelta: 3, deltaUnit: "perCopy" }
];
var SEED_SERVICES = [
  {
    id: "svc-carte-visite",
    sectionId: "sec-digital",
    name: "\u0628\u0637\u0627\u0642\u0629 \u0632\u064A\u0627\u0631\u0629",
    latinName: "Carte Visite",
    description: "\u0628\u0637\u0627\u0642\u0627\u062A \u0639\u0645\u0644 8.5\xD75.5 \u0633\u0645",
    defaultPieceSize: { widthMm: 85, heightMm: 55 },
    defaultBleedMm: 2,
    stages: ["impression", "pelliculage", "coupe"],
    pricingRuleIds: ["rule-paper-sheet", "rule-print-face-digital", "rule-cut-sheet", "rule-waste", "rule-overhead", "rule-margin"],
    fields: [
      { id: "quantity", label: "\u0627\u0644\u0643\u0645\u064A\u0629", type: "number", required: true, min: 50, step: 50, defaultValue: 500 },
      { id: "paper", label: "\u0646\u0648\u0639 \u0627\u0644\u0648\u0631\u0642", type: "select", required: true, defaultValue: "pap-couche-350", options: paperOptions },
      { id: "faces", label: "\u0627\u0644\u0637\u0628\u0627\u0639\u0629", type: "select", required: true, defaultValue: "recto", options: facesOptions },
      { id: "pelliculage", label: "\u0627\u0644\u062A\u063A\u0644\u064A\u0641 \u0627\u0644\u0628\u0644\u0627\u0633\u062A\u064A\u0643\u064A", type: "select", defaultValue: "pell-none", options: pelliculageOptions },
      { id: "rounded-corners", label: "\u0632\u0648\u0627\u064A\u0627 \u0645\u062F\u0648\u0631\u0629", type: "yesno", defaultValue: false }
    ]
  },
  {
    id: "svc-flyer",
    sectionId: "sec-digital",
    name: "\u0645\u0646\u0634\u0648\u0631",
    latinName: "Flyer",
    description: "\u0645\u0646\u0634\u0648\u0631\u0627\u062A \u0625\u0634\u0647\u0627\u0631\u064A\u0629 A6 / A5 / A4",
    defaultPieceSize: { widthMm: 148, heightMm: 210 },
    defaultBleedMm: 3,
    stages: ["impression", "coupe"],
    pricingRuleIds: ["rule-paper-sheet", "rule-print-face-digital", "rule-cut-sheet", "rule-waste", "rule-overhead", "rule-margin"],
    fields: [
      { id: "quantity", label: "\u0627\u0644\u0643\u0645\u064A\u0629", type: "number", required: true, min: 100, step: 100, defaultValue: 1e3 },
      { id: "format", label: "\u0627\u0644\u062D\u062C\u0645", type: "dimensions", required: true, defaultValue: { widthMm: 148, heightMm: 210 } },
      { id: "paper", label: "\u0646\u0648\u0639 \u0627\u0644\u0648\u0631\u0642", type: "select", required: true, defaultValue: "pap-couche-170", options: paperOptions },
      { id: "faces", label: "\u0627\u0644\u0637\u0628\u0627\u0639\u0629", type: "select", required: true, defaultValue: "recto-verso", options: facesOptions }
    ]
  },
  {
    id: "svc-depliant",
    sectionId: "sec-digital",
    name: "\u0645\u0646\u0634\u0648\u0631 \u0645\u0637\u0648\u064A",
    latinName: "D\xE9pliant",
    description: "\u0628\u0631\u0648\u0634\u0648\u0631\u0627\u062A \u0645\u0637\u0648\u064A\u0629 (2 \u0623\u0648 3 \u0637\u064A\u0627\u062A)",
    defaultPieceSize: { widthMm: 297, heightMm: 210 },
    defaultBleedMm: 3,
    stages: ["impression", "pliage", "coupe"],
    pricingRuleIds: ["rule-paper-sheet", "rule-print-face-offset", "rule-offset-setup", "rule-cut-sheet", "rule-waste", "rule-overhead", "rule-margin"],
    fields: [
      { id: "quantity", label: "\u0627\u0644\u0643\u0645\u064A\u0629", type: "number", required: true, min: 250, step: 250, defaultValue: 1e3 },
      { id: "format", label: "\u0627\u0644\u062D\u062C\u0645 \u0627\u0644\u0645\u0641\u062A\u0648\u062D", type: "dimensions", required: true, defaultValue: { widthMm: 297, heightMm: 210 } },
      { id: "folds", label: "\u0639\u062F\u062F \u0627\u0644\u0637\u064A\u0627\u062A", type: "select", required: true, defaultValue: "fold-2", options: [
        { id: "fold-2", label: "\u0637\u064A\u062A\u0627\u0646", latinLabel: "2 plis", priceDelta: 1, deltaUnit: "perCopy" },
        { id: "fold-3", label: "\u062B\u0644\u0627\u062B \u0637\u064A\u0627\u062A", latinLabel: "3 plis", priceDelta: 2, deltaUnit: "perCopy" }
      ] },
      { id: "paper", label: "\u0646\u0648\u0639 \u0627\u0644\u0648\u0631\u0642", type: "select", required: true, defaultValue: "pap-couche-170", options: paperOptions },
      { id: "faces", label: "\u0627\u0644\u0637\u0628\u0627\u0639\u0629", type: "select", required: true, defaultValue: "recto-verso", options: facesOptions },
      { id: "pelliculage", label: "\u0627\u0644\u062A\u063A\u0644\u064A\u0641 \u0627\u0644\u0628\u0644\u0627\u0633\u062A\u064A\u0643\u064A", type: "select", defaultValue: "pell-none", options: pelliculageOptions }
    ]
  },
  {
    id: "svc-etiquettes",
    sectionId: "sec-offset",
    name: "\u0645\u0644\u0635\u0642\u0627\u062A",
    latinName: "\xC9tiquettes",
    description: "\u0645\u0644\u0635\u0642\u0627\u062A \u0628\u0623\u062D\u062C\u0627\u0645 \u0645\u062A\u0639\u062F\u062F\u0629 \u0639\u0644\u0649 \u0646\u0641\u0633 \u0627\u0644\u0648\u0631\u0642\u0629",
    defaultPieceSize: { widthMm: 60, heightMm: 40 },
    defaultBleedMm: 2,
    stages: ["impression", "coupe"],
    pricingRuleIds: ["rule-paper-sheet", "rule-print-face-digital", "rule-cut-sheet", "rule-waste", "rule-overhead", "rule-margin"],
    fields: [
      { id: "quantity", label: "\u0627\u0644\u0643\u0645\u064A\u0629", type: "number", required: true, min: 100, step: 100, defaultValue: 1e3 },
      { id: "format", label: "\u062D\u062C\u0645 \u0627\u0644\u0645\u0644\u0635\u0642", type: "dimensions", required: true, defaultValue: { widthMm: 60, heightMm: 40 } },
      { id: "paper", label: "\u0646\u0648\u0639 \u0627\u0644\u0648\u0631\u0642", type: "select", required: true, defaultValue: "pap-couche-170", options: paperOptions },
      { id: "contour-cut", label: "\u0642\u0635 \u0639\u0644\u0649 \u0627\u0644\u0645\u062D\u064A\u0637", latinName: "CutContour", type: "yesno", defaultValue: false }
    ]
  },
  {
    id: "svc-grand-format",
    sectionId: "sec-grand-format",
    name: "\u0644\u0627\u0641\u062A\u0629 \u0643\u0628\u064A\u0631\u0629",
    latinName: "B\xE2che Grand Format",
    description: "\u0637\u0628\u0627\u0639\u0629 \u0628\u0627\u0646\u0631 / \u0628\u0627\u063A \u0628\u0627\u0644\u0645\u062A\u0631 \u0627\u0644\u0645\u0631\u0628\u0639",
    defaultPieceSize: { widthMm: 2e3, heightMm: 1e3 },
    defaultBleedMm: 20,
    stages: ["impression", "finition"],
    pricingRuleIds: ["rule-print-face-digital", "rule-waste", "rule-overhead", "rule-margin"],
    fields: [
      { id: "quantity", label: "\u0627\u0644\u0643\u0645\u064A\u0629", type: "number", required: true, min: 1, step: 1, defaultValue: 1 },
      { id: "format", label: "\u0627\u0644\u0623\u0628\u0639\u0627\u062F", type: "dimensions", required: true, defaultValue: { widthMm: 2e3, heightMm: 1e3 } },
      { id: "support", label: "\u0627\u0644\u062F\u0639\u0627\u0645\u0629", type: "select", required: true, defaultValue: "bache-510", options: [
        { id: "bache-510", label: "\u0628\u0627\u0646\u0631 510\u063A", latinLabel: "B\xE2che 510g", priceDelta: 0, deltaUnit: "perM2" },
        { id: "vinyle", label: "\u0641\u064A\u0646\u064A\u0644 \u0644\u0627\u0635\u0642", latinLabel: "Vinyle adh\xE9sif", priceDelta: 250, deltaUnit: "perM2" },
        { id: "backlight", label: "\u0628\u0627\u0643 \u0644\u0627\u064A\u062A", latinLabel: "Backlight", priceDelta: 400, deltaUnit: "perM2" }
      ] },
      { id: "eyelets", label: "\u0639\u064A\u0648\u0646 \u0645\u0639\u062F\u0646\u064A\u0629", type: "yesno", defaultValue: true }
    ]
  }
];
var SECTION_DEFS = [
  { id: "sec-digital", name: "\u0637\u0628\u0627\u0639\u0629 \u0631\u0642\u0645\u064A\u0629", latinName: "Impression num\xE9rique", description: "\u0643\u0645\u064A\u0627\u062A \u0635\u063A\u064A\u0631\u0629 \u0648\u0645\u062A\u0648\u0633\u0637\u0629\u060C \u062A\u0633\u0644\u064A\u0645 \u0633\u0631\u064A\u0639" },
  { id: "sec-offset", name: "\u0623\u0648\u0641\u0633\u062A", latinName: "Offset", description: "\u0643\u0645\u064A\u0627\u062A \u0643\u0628\u064A\u0631\u0629 \u0628\u062C\u0648\u062F\u0629 \u0639\u0627\u0644\u064A\u0629" },
  { id: "sec-grand-format", name: "\u062A\u0646\u0633\u064A\u0642 \u0643\u0628\u064A\u0631", latinName: "Grand Format", description: "\u0644\u0627\u0641\u062A\u0627\u062A\u060C \u0628\u0627\u0646\u0631\u0627\u062A\u060C \u0644\u0648\u062D\u0627\u062A \u0625\u0634\u0647\u0627\u0631\u064A\u0629" }
];
var SEED_SECTIONS = SECTION_DEFS.map((s) => ({
  ...s,
  serviceIds: SEED_SERVICES.filter((svc) => svc.sectionId === s.id).map((svc) => svc.id)
}));

// src/lib/units.ts
var numFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

// src/components/montage/montage-data.ts
var INITIAL_STATE = {
  kind: "digital",
  machineId: "mc-versant",
  margins: { top: 4, bottom: 4, left: 4, right: 4 },
  pinceMm: 12,
  sheetW: 320,
  sheetH: 450,
  customSheet: false,
  autoSuggest: true,
  stickers: [
    {
      id: "g1",
      widthMm: 89,
      heightMm: 89,
      bleed: { top: 3, bottom: 3, left: 3, right: 3 },
      bleedLinked: true,
      quantity: 1e3
    }
  ],
  bleedShared: { top: 3, bottom: 3, left: 3, right: 3 },
  method: "recto",
  gutterMm: 10,
  cutMethod: "guillotine",
  sharedCut: false,
  doubleCut: true,
  manualMode: false,
  manualCopies: void 0
};

// src/components/montage/montage-migrate.ts
function asBleed(v, fallback) {
  const o = v ?? {};
  const num = (x, fb) => typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : fb;
  return {
    top: num(o.top, fallback.top),
    bottom: num(o.bottom, fallback.bottom),
    left: num(o.left, fallback.left),
    right: num(o.right, fallback.right)
  };
}
function asSticker(v, index, shared) {
  if (!v || typeof v !== "object") return null;
  const o = v;
  return {
    id: typeof o.id === "string" && o.id ? o.id : `st-${index + 1}`,
    widthMm: typeof o.widthMm === "number" ? o.widthMm : 0,
    heightMm: typeof o.heightMm === "number" ? o.heightMm : 0,
    bleed: asBleed(o.bleed, shared),
    bleedLinked: typeof o.bleedLinked === "boolean" ? o.bleedLinked : true,
    quantity: typeof o.quantity === "number" ? o.quantity : 0
  };
}
function migrateStateDraft(raw) {
  if (!raw || typeof raw !== "object") return null;
  const o = raw;
  if (Array.isArray(o.stickers) && o.stickers.length > 0) {
    const shared = asBleed(o.bleedShared, INITIAL_STATE.bleedShared);
    const stickers = o.stickers.map((s, i) => asSticker(s, i, shared)).filter((s) => s !== null);
    if (stickers.length === 0) return null;
    const { stickers: _s, bleedShared: _b, ...rest } = o;
    return { ...INITIAL_STATE, ...rest, stickers, bleedShared: shared };
  }
  if (typeof o.pieceW === "number") {
    const shared = asBleed(o.bleed, INITIAL_STATE.bleedShared);
    const primary = asSticker(
      { id: "g1", widthMm: o.pieceW, heightMm: o.pieceH, quantity: o.quantity, bleed: shared, bleedLinked: true },
      0,
      shared
    );
    const extras = Array.isArray(o.extraGroups) ? o.extraGroups.map((g, i) => asSticker({ ...g, bleed: shared, bleedLinked: true }, i + 1, shared)).filter((s) => s !== null) : [];
    if (!primary) return null;
    const { pieceW: _w, pieceH: _h, bleed: _bl, quantity: _q, extraGroups: _e, ...rest } = o;
    return { ...INITIAL_STATE, ...rest, stickers: [primary, ...extras], bleedShared: shared };
  }
  return null;
}

// scripts/migrate-check.ts
var failures = 0;
function check(name, cond, extra) {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.error(`FAIL  ${name}`, extra ?? "");
  }
}
var legacy = {
  kind: "offset",
  machineId: "mc-heidelberg",
  margins: { top: 8, bottom: 8, left: 8, right: 8 },
  pinceMm: 12,
  sheetW: 500,
  sheetH: 700,
  customSheet: false,
  autoSuggest: false,
  pieceW: 90,
  pieceH: 55,
  bleed: { top: 2, bottom: 2, left: 2, right: 2 },
  quantity: 2500,
  method: "bascule",
  gutterMm: 12,
  cutMethod: "die-cut",
  sharedCut: true,
  doubleCut: false,
  manualMode: false,
  manualCopies: 12,
  extraGroups: [
    { id: "gx-abc", widthMm: 70, heightMm: 40, quantity: 500 },
    { id: "gx-def", widthMm: 60, heightMm: 60, quantity: 300 }
  ]
};
var m1 = migrateStateDraft(JSON.parse(JSON.stringify(legacy)));
check("legacy: migrated (not null)", m1 !== null);
if (m1) {
  check("legacy: stickers count = 3", m1.stickers.length === 3, m1.stickers);
  check("legacy: primary id kept", m1.stickers[0].id === "g1");
  check("legacy: primary dims", m1.stickers[0].widthMm === 90 && m1.stickers[0].heightMm === 55);
  check("legacy: primary qty", m1.stickers[0].quantity === 2500);
  check("legacy: primary bleed = shared", m1.stickers[0].bleed.top === 2 && m1.stickers[0].bleedLinked === true);
  check("legacy: bleedShared from legacy bleed", m1.bleedShared.top === 2);
  check("legacy: extras preserved", m1.stickers[1].id === "gx-abc" && m1.stickers[2].id === "gx-def");
  check("legacy: extras linked to shared bleed", m1.stickers[1].bleedLinked && m1.stickers[1].bleed.left === 2);
  check("legacy: extra qty", m1.stickers[2].quantity === 300);
  check("legacy: unrelated fields kept", m1.kind === "offset" && m1.machineId === "mc-heidelberg" && m1.method === "bascule");
  check("legacy: manualCopies kept", m1.manualCopies === 12);
  check("legacy: old fields absent", !("pieceW" in m1) && !("extraGroups" in m1) && !("bleed" in m1) && !("quantity" in m1));
}
var fresh = {
  ...INITIAL_STATE,
  sheetW: 330,
  sheetH: 480,
  bleedShared: { top: 5, bottom: 5, left: 5, right: 5 },
  stickers: [
    { id: "g1", widthMm: 100, heightMm: 50, bleed: { top: 5, bottom: 5, left: 5, right: 5 }, bleedLinked: true, quantity: 800 },
    { id: "st-xyz", widthMm: 45, heightMm: 45, bleed: { top: 1, bottom: 2, left: 3, right: 4 }, bleedLinked: false, quantity: 200 }
  ]
};
var m2 = migrateStateDraft(JSON.parse(JSON.stringify(fresh)));
check("new: migrated (not null)", m2 !== null);
if (m2) {
  check("new: stickers count = 2", m2.stickers.length === 2);
  check("new: unlinked custom bleed preserved", JSON.stringify(m2.stickers[1].bleed) === JSON.stringify({ top: 1, bottom: 2, left: 3, right: 4 }), m2.stickers[1].bleed);
  check("new: bleedShared preserved", m2.bleedShared.top === 5);
  check("new: dims kept", m2.sheetW === 330 && m2.sheetH === 480);
}
var m3 = m1 ? migrateStateDraft(JSON.parse(JSON.stringify(m1))) : null;
check("round-trip: stable", m3 !== null && JSON.stringify(m3) === JSON.stringify(m1));
check("garbage: null on non-object", migrateStateDraft("nope") === null);
check("garbage: null on empty object", migrateStateDraft({}) === null);
check("garbage: null on empty stickers", migrateStateDraft({ stickers: [] }) === null);
var m5 = migrateStateDraft({ pieceW: 89, pieceH: 89, bleed: { top: 3, bottom: 3, left: 3, right: 3 }, quantity: 1e3 });
check("legacy minimal: single sticker", m5 !== null && m5.stickers.length === 1 && m5.stickers[0].id === "g1");
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `
${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
