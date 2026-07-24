// ---------------------------------------------------------------------------
// PDF_Feasibility_Analyst — سكربت جدوى (للقراءة فقط بالنسبة لـ app)
// يختبر: هل 4×(140×140) + 4×(89×89) + 4×(78×78) بلا bleed تسع في ورقة واحدة؟
// ---------------------------------------------------------------------------
import {
  bestSheet,
  computeMontage,
  computeMontageVariants,
  printableArea,
  type SheetCandidate,
} from '../app/src/lib/montage-engine';
import { SEED_MACHINES } from '../app/src/lib/catalog';
import type { BleedBox, MontageInput, PlacedPiece, PrintMethod } from '../app/src/lib/types';

const ZERO: BleedBox = { top: 0, bottom: 0, left: 0, right: 0 };
const GROUPS = [
  { id: 'g140', name: '140×140', widthMm: 140, heightMm: 140, quantity: 4 },
  { id: 'g89', name: '89×89', widthMm: 89, heightMm: 89, quantity: 4 },
  { id: 'g78', name: '78×78', widthMm: 78, heightMm: 78, quantity: 4 },
];
const METHODS: PrintMethod[] = ['recto', 'recto-verso', 'bascule', 'double-pince'];

function perGroupCount(placed: PlacedPiece[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const p of placed) m[p.groupId] = (m[p.groupId] ?? 0) + 1;
  return m;
}

function bbox(placed: PlacedPiece[], gid: string) {
  const ps = placed.filter((p) => p.groupId === gid);
  if (ps.length === 0) return null;
  return {
    x: Math.min(...ps.map((p) => p.x)),
    y: Math.min(...ps.map((p) => p.y)),
    x2: Math.max(...ps.map((p) => p.x + p.w)),
    y2: Math.max(...ps.map((p) => p.y + p.h)),
  };
}

/** هل الترتيب يشبه PDF؟ بلوك 140 أعلى، وبلوكا 89 و78 جنباً إلى جنب تحته */
function pdfLike(placed: PlacedPiece[]): boolean {
  const b140 = bbox(placed, 'g140');
  const b89 = bbox(placed, 'g89');
  const b78 = bbox(placed, 'g78');
  if (!b140 || !b89 || !b78) return false;
  const topOk = b140.y2 <= b89.y + 1 && b140.y2 <= b78.y + 1; // 140 فوق الاثنين
  const sameRow = Math.abs(b89.y - b78.y) <= 1; // نفس الشريط الأفقي
  const sideBySide =
    Math.abs(b89.x2 - b78.x) <= 1 || Math.abs(b78.x2 - b89.x) <= 1; // متلاصقان أفقياً
  return topOk && sameRow && sideBySide;
}

function mkInput(sheetW: number, sheetH: number, method: PrintMethod, machineId: string): MontageInput {
  return {
    sheetWidthMm: sheetW,
    sheetHeightMm: sheetH,
    groups: GROUPS.map((g) => ({ ...g })),
    bleedMm: ZERO,
    quantity: 12,
    method,
    machineId,
  };
}

// ============================ الجزء 1: computeMontage ========================
console.log('================================================================');
console.log('الجزء 1 — computeMontage لكل ماكينة × مقاس × طريقة (machineId ممرّر)');
console.log('================================================================');
interface Row {
  machine: string;
  sheet: string;
  printable: string;
  method: PrintMethod;
  fits: string;
  sheets: number | string;
  perSheet: string;
  copies: number | string;
  waste: number | string;
  pdfLike: string;
}
const rows: Row[] = [];
for (const m of SEED_MACHINES) {
  for (const s of m.sheetSizes) {
    const pa = printableArea(s.widthMm, s.heightMm, m);
    const paStr = `x${pa.x}..${pa.x + pa.w} y${pa.y}..${pa.y + pa.h} (${pa.w}×${pa.h})`;
    for (const method of METHODS) {
      const r = computeMontage(mkInput(s.widthMm, s.heightMm, method, m.id));
      if (!r) {
        rows.push({
          machine: m.name, sheet: s.label, printable: paStr, method,
          fits: '✗ لا يُركَّب', sheets: '-', perSheet: '-', copies: '-', waste: '-', pdfLike: '-',
        });
        continue;
      }
      const pg = perGroupCount(r.placed);
      const oneSheet = r.sheetsNeeded === 1 && (pg.g140 ?? 0) >= 4 && (pg.g89 ?? 0) >= 4 && (pg.g78 ?? 0) >= 4;
      rows.push({
        machine: m.name,
        sheet: s.label,
        printable: paStr,
        method,
        fits: oneSheet ? '✓ ورقة واحدة' : '✗',
        sheets: r.sheetsNeeded,
        perSheet: `140:${pg.g140 ?? 0} 89:${pg.g89 ?? 0} 78:${pg.g78 ?? 0}`,
        copies: r.copiesPerSheet,
        waste: r.wastePercent,
        pdfLike: pdfLike(r.placed) ? '✓ يشبه PDF' : '—',
      });
    }
  }
}
for (const r of rows) {
  console.log(
    `${r.machine} | ${r.sheet} | ${r.method} | printable ${r.printable} | ${r.fits} | sheets=${r.sheets} | perSheet ${r.perSheet} | copies=${r.copies} | waste=${r.waste}% | ${r.pdfLike}`,
  );
}

// ============================ الجزء 2: bestSheet =============================
console.log('\n================================================================');
console.log('الجزء 2 — bestSheet (المحرك ~سطر 1446)');
console.log('================================================================');
const pieces = GROUPS.map((g) => ({ widthMm: g.widthMm, heightMm: g.heightMm, quantity: g.quantity }));
const allCandidates: SheetCandidate[] = SEED_MACHINES.flatMap((m) =>
  m.sheetSizes.map((s) => ({ widthMm: s.widthMm, heightMm: s.heightMm, machineId: m.id })),
);
for (const method of METHODS) {
  // (أ) اقتراح حر بين كل الماكينات
  const free = bestSheet(pieces, allCandidates, SEED_MACHINES, { bleedMm: ZERO, method });
  // (ب) كما تفعل الواجهة فعلاً: مقاسات الماكينة الحالية فقط
  const perMachine = SEED_MACHINES.map((m) => {
    const cands = m.sheetSizes.map((s) => ({ widthMm: s.widthMm, heightMm: s.heightMm, machineId: m.id }));
    const b = bestSheet(pieces, cands, SEED_MACHINES, { bleedMm: ZERO, method });
    return `${m.name} → ${b ? `${b.widthMm}×${b.heightMm} (copies=${b.copiesPerSheet}, waste=${b.wastePercent.toFixed(1)}%)` : 'لا شيء يسع'}`;
  });
  console.log(`method=${method}`);
  console.log(
    `  [حر — كل الماكينات] ${free ? `${free.machineId} ${free.widthMm}×${free.heightMm} copies=${free.copiesPerSheet} waste=${free.wastePercent.toFixed(1)}%` : 'null'}`,
  );
  for (const line of perMachine) console.log(`  [واجهة — ماكينة واحدة] ${line}`);
}

// ==================== الجزء 3: computeMontageVariants ========================
console.log('\n================================================================');
console.log('الجزء 3 — computeMontageVariants للحالات التي تسع في ورقة واحدة');
console.log('================================================================');
for (const m of SEED_MACHINES) {
  for (const s of m.sheetSizes) {
    for (const method of METHODS) {
      const probe = computeMontage(mkInput(s.widthMm, s.heightMm, method, m.id));
      if (!probe || probe.sheetsNeeded !== 1) continue;
      const pg = perGroupCount(probe.placed);
      if ((pg.g140 ?? 0) < 4 || (pg.g89 ?? 0) < 4 || (pg.g78 ?? 0) < 4) continue;
      const vs = computeMontageVariants(mkInput(s.widthMm, s.heightMm, method, m.id), m);
      console.log(`${m.name} | ${s.label} | ${method}: ${vs.length} مرشحاً`);
      for (const v of vs) {
        const vpg = perGroupCount(v.result.placed);
        console.log(
          `   - ${v.kind} (${v.label}): sheets=${v.result.sheetsNeeded} perSheet 140:${vpg.g140 ?? 0}/89:${vpg.g89 ?? 0}/78:${vpg.g78 ?? 0} waste=${v.result.wastePercent}% cutScore=${v.cutScore} pdfLike=${pdfLike(v.result.placed) ? '✓' : '✗'}`,
        );
      }
    }
  }
}
