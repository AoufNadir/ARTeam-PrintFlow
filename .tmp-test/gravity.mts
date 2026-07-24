// gravity.mts — اختبارات ضغط الجاذبية العمودي نحو حافة المسكة (gravityCompact)
// 1) مثال المستخدم: كل قطعة مرتكزة (قاع = قاع المساحة أو قمة خلية تحتها) وبلا فراغ تحتها
// 2) النقطة الثابتة: إعادة الضغط لا تغيّر شيئاً (idempotent)
// 3) bascule: تماثل تام حول المحور بعد الضغط + المرآة
// 4) النمط الثابت: نفس خاصية الارتكاز
// 5) bleed > 0: لا تداخل خلايا (trim+bleed) ولا حبر داخل شريط المسكة
import {
  computeMontage,
  computeMontageVariants,
  computeFixedMontage,
  gravityCompact,
  printableArea,
  flipAxisOf,
} from '../app/src/lib/montage-engine';
import { SEED_MACHINES } from '../app/src/lib/catalog';
import type { MontageInput, FixedMontageInput, BleedBox, PlacedPiece } from '../app/src/lib/types';

const machine = SEED_MACHINES.find((m) => m.id === 'machine-offset-sm52')!;
if (!machine) throw new Error('machine-offset-sm52 not found');

const zeroBleed: BleedBox = { top: 0, bottom: 0, left: 0, right: 0 };
const EPS = 0.011;

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}

interface Cell {
  l: number;
  t: number;
  r: number;
  b: number;
}
const cellOf = (p: PlacedPiece): Cell => ({
  l: p.x - (p.bleed?.left ?? 0),
  t: p.y - (p.bleed?.top ?? 0),
  r: p.x + p.w + (p.bleed?.right ?? 0),
  b: p.y + p.h + (p.bleed?.bottom ?? 0),
});

/** لا تداخل بين أي خليتين (التماس مسموح) */
function noOverlap(placed: PlacedPiece[]): boolean {
  const cs = placed.map(cellOf);
  for (let i = 0; i < cs.length; i++)
    for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i];
      const q = cs[j];
      const ox = Math.min(a.r, q.r) - Math.max(a.l, q.l);
      const oy = Math.min(a.b, q.b) - Math.max(a.t, q.t);
      if (ox > EPS && oy > EPS) return false;
    }
  return true;
}

/** كل الخلايا داخل مساحة العمل (بلا خروج ولا حبر في شريط المسكة) */
function allInside(placed: PlacedPiece[], area: { x: number; y: number; w: number; h: number }): boolean {
  return placed.every((p) => {
    const c = cellOf(p);
    return c.l >= area.x - EPS && c.t >= area.y - EPS && c.r <= area.x + area.w + EPS && c.b <= area.y + area.h + EPS;
  });
}

/** خاصية الارتكاز: قاع الخلية = قاع المساحة، أو ملامس لقمة خلية تحتها بتداخل إسقاط أفقي صارم */
function allSupported(placed: PlacedPiece[], areaBottom: number): { ok: boolean; bad: string[] } {
  const cs = placed.map(cellOf);
  const bad: string[] = [];
  for (let i = 0; i < placed.length; i++) {
    const c = cs[i];
    if (Math.abs(c.b - areaBottom) <= EPS) continue;
    const held = cs.some(
      (q, j) => j !== i && c.l < q.r - EPS && q.l < c.r - EPS && Math.abs(q.t - c.b) <= EPS,
    );
    if (!held) bad.push(`${placed[i].groupId}@(${placed[i].x.toFixed(1)},${placed[i].y.toFixed(1)}) b=${c.b.toFixed(1)}`);
  }
  return { ok: bad.length === 0, bad };
}

const USER_GROUPS = [
  { id: 'a', widthMm: 140, heightMm: 140, quantity: 4 },
  { id: 'b', widthMm: 89, heightMm: 89, quantity: 4 },
  { id: 'c', widthMm: 78, heightMm: 78, quantity: 4 },
];

// ---------- 1) مثال المستخدم: 4×140 + 4×89 + 4×78 على 500×350 أوفست bleed 0
{
  const input: MontageInput = {
    sheetWidthMm: 500,
    sheetHeightMm: 350,
    machineId: machine.id,
    bleedMm: zeroBleed,
    method: 'recto',
    quantity: 1,
    cutMethod: 'guillotine',
    groups: USER_GROUPS,
  };
  const area = printableArea(500, 350, machine);
  const bottom = area.y + area.h; // 340
  const variants = computeMontageVariants(input, machine);
  const best = computeMontage(input, [machine]);
  const layouts: [string, PlacedPiece[]][] = variants.map((v, i) => [`variant#${i}:${v.kind}`, v.result.placed]);
  if (best) layouts.push(['computeMontage', best.placed]);
  for (const [tag, placed] of layouts) {
    check(`مثال المستخدم/${tag}: لا تداخل خلايا`, noOverlap(placed));
    check(`مثال المستخدم/${tag}: كل الخلايا داخل المساحة (قاع ≤ ${bottom})`, allInside(placed, area));
    const sup = allSupported(placed, bottom);
    check(`مثال المستخدم/${tag}: كل قطعة مرتكزة (قاع=${bottom} أو على خلية تحتها)`, sup.ok, sup.bad.join(' '));
    // بلوك 140 تحديداً: قاعه = قاع المساحة أو كل قطعة فيه مرتكزة على خلية تحتها — ممنوع فراغ تحته
    const aPieces = placed.filter((p) => p.groupId === 'a');
    const aBottom = Math.max(...aPieces.map((p) => cellOf(p).b));
    const aOk = Math.abs(aBottom - bottom) <= EPS || allSupported(aPieces.length ? placed : placed, bottom).ok;
    check(`مثال المستخدم/${tag}: بلوك 140 هبط (قاع=${aBottom.toFixed(2)})`, aOk);
  }
  // ---------- 2) النقطة الثابتة: إعادة الضغط لا تغيّر المواضع
  for (const [tag, placed] of layouts) {
    const again = gravityCompact(placed, area, () => 0);
    const moved = again.filter((p, i) => Math.abs(p.y - placed[i].y) > 1e-9 || Math.abs(p.x - placed[i].x) > 1e-9);
    check(`idempotent/${tag}: إعادة الضغط لا تحرك شيئاً`, moved.length === 0, `${moved.length} moved`);
  }
}

// ---------- 3) bascule: التماثل تام حول محور القلب بعد الضغط + المرآة
{
  const input: MontageInput = {
    sheetWidthMm: 350,
    sheetHeightMm: 500,
    machineId: machine.id,
    bleedMm: zeroBleed,
    method: 'bascule',
    quantity: 1,
    groups: [
      { id: 'a', widthMm: 140, heightMm: 140, quantity: 3 },
      { id: 'b', widthMm: 89, heightMm: 89, quantity: 4 },
      { id: 'c', widthMm: 78, heightMm: 78, quantity: 4 },
    ],
  };
  const r = computeMontage(input, [machine]);
  check('bascule: النتيجة موجودة', !!r);
  if (r) {
    const flip = flipAxisOf(350, 500, 'bascule');
    const placed = r.placed;
    // لكل قطعة توأم مرآي: انعكاس حول المحور المطلق (نقطة المنتصف)
    let symmetric = true;
    for (const p of placed) {
      const mx = flip.axis === 'vertical' ? 2 * flip.position - p.x - p.w : p.x;
      const my = flip.axis === 'horizontal' ? 2 * flip.position - p.y - p.h : p.y;
      const twin = placed.some(
        (q) =>
          q !== p &&
          q.groupId === p.groupId &&
          Math.abs(q.x - mx) < 0.02 &&
          Math.abs(q.y - my) < 0.02 &&
          Math.abs(q.w - p.w) < 0.02 &&
          Math.abs(q.h - p.h) < 0.02,
      );
      if (!twin) symmetric = false;
    }
    check('bascule: تماثل تام حول المحور بعد الضغط + المرآة', symmetric, `axis=${flip.axis}@${flip.position}`);
    check('bascule: لا تداخل خلايا عبر النصفين', noOverlap(placed));
    const area = printableArea(350, 500, machine);
    check('bascule: كل الخلايا داخل المساحة الكاملة', allInside(placed, area));
  }
}

// ---------- 4) النمط الثابت: 4/4/4 على 500×350 — نفس خاصية الارتكاز
{
  const input: FixedMontageInput = {
    sheetWidthMm: 500,
    sheetHeightMm: 350,
    machineId: machine.id,
    bleedMm: zeroBleed,
    method: 'recto',
    quantity: 1,
    groups: USER_GROUPS.map((g) => ({ ...g, copiesPerSheet: 4 })),
  };
  const out = computeFixedMontage(input, machine);
  check('fixed 4/4/4: ok', out.ok, out.ok ? `copies=${out.copiesPerSheet}` : out.reason);
  if (out.ok) {
    const area = printableArea(500, 350, machine);
    const bottom = area.y + area.h;
    check('fixed: لا تداخل خلايا', noOverlap(out.placed));
    check('fixed: كل الخلايا داخل المساحة', allInside(out.placed, area));
    const sup = allSupported(out.placed, bottom);
    check('fixed: كل قطعة مرتكزة', sup.ok, sup.bad.join(' '));
    // بلوك 140 في النمط الثابت يلامس قاع المساحة بالضبط
    const aBottom = Math.max(...out.placed.filter((p) => p.groupId === 'a').map((p) => cellOf(p).b));
    check(`fixed: قاع بلوك 140 = ${bottom} ± 0.01`, Math.abs(aBottom - bottom) <= EPS, `got ${aBottom.toFixed(2)}`);
    const again = gravityCompact(out.placed, area, () => 0);
    const moved = again.filter((p, i) => Math.abs(p.y - out.placed[i].y) > 1e-9);
    check('fixed: idempotent', moved.length === 0, `${moved.length} moved`);
  }
}

// ---------- 5) bleed 3مم: لا تداخل خلايا (trim+bleed) ولا حبر داخل شريط المسكة
{
  const bleed3: BleedBox = { top: 3, bottom: 3, left: 3, right: 3 };
  const input: MontageInput = {
    sheetWidthMm: 500,
    sheetHeightMm: 350,
    machineId: machine.id,
    bleedMm: bleed3,
    method: 'recto',
    quantity: 1,
    groups: USER_GROUPS,
  };
  const area = printableArea(500, 350, machine);
  const variants = computeMontageVariants(input, machine);
  check('bleed 3: توجد نتائج', variants.length > 0);
  for (const v of variants) {
    const placed = v.result.placed;
    check(`bleed 3/${v.kind}: لا تداخل خلايا (trim+bleed)`, noOverlap(placed));
    // الحبر (الخلية كاملة) لا يتجاوز قاع المساحة = حافة شريط المسكة، ولا يخرج عن الورقة
    check(`bleed 3/${v.kind}: لا حبر في شريط المسكة ولا خروج عن المساحة`, allInside(placed, area));
    const sup = allSupported(placed, area.y + area.h);
    check(`bleed 3/${v.kind}: كل قطعة مرتكزة`, sup.ok, sup.bad.join(' '));
    const again = gravityCompact(placed, area, () => 0);
    const moved = again.filter((p, i) => Math.abs(p.y - placed[i].y) > 1e-9);
    check(`bleed 3/${v.kind}: idempotent`, moved.length === 0, `${moved.length} moved`);
  }
}

console.log(failures === 0 ? '\nALL GRAVITY TESTS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
