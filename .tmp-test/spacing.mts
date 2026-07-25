// ---------------------------------------------------------------------------
// الحزمة 1 — التحكم متعدد المستويات في الفواصل (spacing) — اختبارات المحرك.
// دلالة الفاصل المعتمدة: هواء إضافي فوق تلاصق صناديق الـBleed (gap=0 = السلوك
// القديم 100%). في كل السيناريوهات الهندسية bleed=0 → الخلية = الـtrim تماماً،
// فيتطابق «هواء فوق الـbleed» مع «trim-ب-trim» حرفياً.
// الأولوية: زوجي (pairGaps) > داخلي (intraGapMm) > عام (defaultGapMm).
// ---------------------------------------------------------------------------
import {
  computeFixedMontage,
  computeMontage,
  computeMontageVariants,
  pairGapKey,
} from '../app/src/lib/montage-engine';
import type { MontageInput, PlacedPiece } from '../app/src/lib/types';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}

const EPS = 0.05;
const NO_BLEED = { top: 0, bottom: 0, left: 0, right: 0 };

/** توقيع مستقر لترتيب (للمقارنة الدقيقة بين تشغيلتين) */
function sig(placed: PlacedPiece[]): string {
  const r = (v: number) => Math.round(v * 1000);
  return placed
    .map((p) => `${r(p.x)},${r(p.y)},${r(p.w)},${r(p.h)},${p.rotated ? 1 : 0},${p.groupId}`)
    .sort()
    .join('|');
}

// ---- هندسة الأزواج (على مستطيلات الـtrim؛ bleed=0 → تساوي الخلايا) ---------
const yOverlap = (a: PlacedPiece, b: PlacedPiece) => a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
const xOverlap = (a: PlacedPiece, b: PlacedPiece) => a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS;
const dx = (a: PlacedPiece, b: PlacedPiece) => Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
const dy = (a: PlacedPiece, b: PlacedPiece) => Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));

/** أدنى مسافة بين زوج مجموعتين عبر كل الأزواج المتداخلة إسقاطياً (أفقي أو عمودي) */
function minPairDistance(placed: PlacedPiece[], ga: string, gb: string): { count: number; min: number } {
  let count = 0;
  let min = Infinity;
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      const isPair = (a.groupId === ga && b.groupId === gb) || (a.groupId === gb && b.groupId === ga);
      if (!isPair) continue;
      let d = Infinity;
      if (yOverlap(a, b)) d = Math.min(d, dx(a, b));
      if (xOverlap(a, b)) d = Math.min(d, dy(a, b));
      if (d < Infinity) {
        count++;
        min = Math.min(min, d);
      }
    }
  }
  return { count, min };
}

// ---------------------------------------------------------------------------
// 0) pairGapKey: مفتاح مرتّب أبجدياً
// ---------------------------------------------------------------------------
check('pairGapKey مرتّب أبجدياً', pairGapKey('st-b', 'st-a') === 'st-a|st-b', pairGapKey('st-b', 'st-a'));

// ---------------------------------------------------------------------------
// 1) التوافق الخلفي: فواصل صريحة بأصفار/{} ≡ غيابها تماماً (توقيع مطابق)
//    — quantity mode وfixed mode معاً
// ---------------------------------------------------------------------------
{
  const base: MontageInput = {
    sheetWidthMm: 320,
    sheetHeightMm: 450,
    groups: [
      { id: 'g1', widthMm: 89, heightMm: 55, quantity: 500, bleedMm: { top: 3, bottom: 3, left: 3, right: 3 } },
      { id: 'g2', widthMm: 60, heightMm: 90, quantity: 300, bleedMm: { top: 2, bottom: 2, left: 2, right: 2 } },
    ],
    bleedMm: { top: 3, bottom: 3, left: 3, right: 3 },
    quantity: 500,
    method: 'recto',
  };
  const plain = computeMontage(base, []);
  const zeroed = computeMontage({ ...base, defaultGapMm: 0, pairGaps: {} }, []);
  check(
    'توافق خلفي (quantity): defaultGapMm:0 + pairGaps:{} = توقيع مطابق',
    !!plain && !!zeroed && sig(plain.placed) === sig(zeroed.placed),
    plain && zeroed ? `${plain.placed.length} vs ${zeroed.placed.length} قطعة` : 'null',
  );

  const fixedBase = {
    sheetWidthMm: 320,
    sheetHeightMm: 450,
    groups: [
      { id: 'g1', widthMm: 89, heightMm: 55, quantity: 6, copiesPerSheet: 6, bleedMm: { top: 3, bottom: 3, left: 3, right: 3 } },
      { id: 'g2', widthMm: 60, heightMm: 90, quantity: 4, copiesPerSheet: 4, bleedMm: { top: 2, bottom: 2, left: 2, right: 2 } },
    ],
    bleedMm: { top: 3, bottom: 3, left: 3, right: 3 },
    quantity: 6,
    method: 'recto' as const,
  };
  const fPlain = computeFixedMontage(fixedBase);
  const fZeroed = computeFixedMontage({ ...fixedBase, defaultGapMm: 0, pairGaps: {} });
  check(
    'توافق خلفي (fixed): أصفار صريحة = توقيع مطابق',
    fPlain.ok && fZeroed.ok && sig(fPlain.placed) === sig(fZeroed.placed),
    fPlain.ok && fZeroed.ok ? `${fPlain.placed.length} قطعة` : 'failure',
  );
}

// ---------------------------------------------------------------------------
// 2) فاصل زوجي: A(60×40) B(40×40) C(50×40) بـbleed=0، pairGaps {A|C:10}
//    — كل زوج A-C متداخل إسقاطياً مسافته ≥ 10، وC-B (العام=3) ≥ 3
// ---------------------------------------------------------------------------
{
  const r = computeMontage(
    {
      sheetWidthMm: 200,
      sheetHeightMm: 120,
      groups: [
        { id: 'A', widthMm: 60, heightMm: 40, quantity: 100, bleedMm: NO_BLEED },
        { id: 'B', widthMm: 40, heightMm: 40, quantity: 100, bleedMm: NO_BLEED },
        { id: 'C', widthMm: 50, heightMm: 40, quantity: 100, bleedMm: NO_BLEED },
      ],
      bleedMm: NO_BLEED,
      quantity: 100,
      method: 'recto',
      defaultGapMm: 3,
      pairGaps: { [pairGapKey('A', 'B')]: 0, [pairGapKey('A', 'C')]: 10 },
    },
    [],
  );
  check('زوجي: النتيجة موجودة وتغطي التصاميم الثلاثة', !!r && new Set(r.placed.map((p) => p.groupId)).size === 3);
  if (r) {
    const ac = minPairDistance(r.placed, 'A', 'C');
    check('زوجي: يوجد زوج A-C متداخل إسقاطياً فعلاً', ac.count > 0, `count=${ac.count}`);
    check('زوجي: كل A-C ≥ 10مم (قيد صلب)', ac.min >= 10 - EPS, `min=${ac.min.toFixed(2)}`);
    const cb = minPairDistance(r.placed, 'C', 'B');
    if (cb.count > 0) check('زوجي: C-B يتبع الفاصل العام 3مم', cb.min >= 3 - EPS, `min=${cb.min.toFixed(2)}`);
    // ملاحظة: A-B=0 لا يُختبر هنا — لا يضمن أي مرشح فائز تجاور A وB فعلاً؛
    // أولوية الزوجي على العام مُثبتة حاسماً في السيناريو 2ب أدناه.
  }
}

// ---------------------------------------------------------------------------
// 2ب) أولوية الزوجي على العام: عام 8 + زوجي A|B=2 → المسافة الفعلية ≈ 2 لا 8
// ---------------------------------------------------------------------------
{
  const r = computeMontage(
    {
      sheetWidthMm: 200,
      sheetHeightMm: 120,
      groups: [
        { id: 'A', widthMm: 40, heightMm: 40, quantity: 100, bleedMm: NO_BLEED },
        { id: 'B', widthMm: 40, heightMm: 40, quantity: 100, bleedMm: NO_BLEED },
      ],
      bleedMm: NO_BLEED,
      quantity: 100,
      method: 'recto',
      defaultGapMm: 8,
      pairGaps: { [pairGapKey('A', 'B')]: 2 },
    },
    [],
  );
  const ab = r ? minPairDistance(r.placed, 'A', 'B') : { count: 0, min: Infinity };
  check('أولوية: يوجد زوج A-B متداخل إسقاطياً', ab.count > 0, `count=${ab.count}`);
  check('أولوية: الزوجي 2 يتغلّب على العام 8 (min ≈ 2)', ab.min >= 2 - EPS && ab.min <= 2 + 0.5, `min=${ab.min.toFixed(2)}`);
}

// ---------------------------------------------------------------------------
// 2ج) استقلال الأزواج: A|C=10 لا يفرض فراغاً على B|C أو A|B (كان sepGap العام)
// ---------------------------------------------------------------------------
{
  const r = computeFixedMontage({
    sheetWidthMm: 300,
    sheetHeightMm: 100,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    groups: [
      { id: 'A', widthMm: 80, heightMm: 90, quantity: 1, bleedMm: NO_BLEED, copiesPerSheet: 1 },
      { id: 'B', widthMm: 80, heightMm: 90, quantity: 1, bleedMm: NO_BLEED, copiesPerSheet: 1 },
      { id: 'C', widthMm: 80, heightMm: 90, quantity: 1, bleedMm: NO_BLEED, copiesPerSheet: 1 },
    ],
    bleedMm: NO_BLEED,
    quantity: 1,
    method: 'recto',
    cutMethod: 'guillotine',
    defaultGapMm: 0,
    pairGaps: {
      [pairGapKey('A', 'C')]: 10,
      [pairGapKey('A', 'B')]: 0,
      [pairGapKey('B', 'C')]: 0,
    },
  });
  check('استقلال: التركيب ينجح', r.ok, r.ok ? '' : 'fail');
  if (r.ok) {
    const ab = minPairDistance(r.placed, 'A', 'B');
    const bc = minPairDistance(r.placed, 'B', 'C');
    const ac = minPairDistance(r.placed, 'A', 'C');
    check('استقلال: A-B متجاوران ≈ 0 (لا 10)', ab.count > 0 && ab.min <= 0.5, `min=${ab.min.toFixed(2)}`);
    check('استقلال: B-C متجاوران ≈ 0 (لا 10)', bc.count > 0 && bc.min <= 0.5, `min=${bc.min.toFixed(2)}`);
    check('استقلال: A-C يحترم ≥ 10 إن تجاورا', ac.count === 0 || ac.min >= 10 - EPS, `min=${ac.min.toFixed(2)} count=${ac.count}`);
  }
}
{
  const r = computeFixedMontage({
    sheetWidthMm: 300,
    sheetHeightMm: 100,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    groups: [
      { id: 'A', widthMm: 80, heightMm: 90, quantity: 1, bleedMm: NO_BLEED, copiesPerSheet: 1 },
      { id: 'B', widthMm: 80, heightMm: 90, quantity: 1, bleedMm: NO_BLEED, copiesPerSheet: 1 },
      { id: 'C', widthMm: 80, heightMm: 90, quantity: 1, bleedMm: NO_BLEED, copiesPerSheet: 1 },
    ],
    bleedMm: NO_BLEED,
    quantity: 1,
    method: 'recto',
    cutMethod: 'guillotine',
    defaultGapMm: 0,
    pairGaps: {
      [pairGapKey('A', 'C')]: 0,
      [pairGapKey('A', 'B')]: 0,
      [pairGapKey('B', 'C')]: 10,
    },
  });
  check('استقلال-BC: التركيب ينجح', r.ok);
  if (r.ok) {
    const ab = minPairDistance(r.placed, 'A', 'B');
    const bc = minPairDistance(r.placed, 'B', 'C');
    check('استقلال-BC: A-B ≈ 0', ab.count > 0 && ab.min <= 0.5, `min=${ab.min.toFixed(2)}`);
    check('استقلال-BC: B-C ≈ 10 فقط', bc.count > 0 && bc.min >= 10 - EPS && bc.min <= 10.5, `min=${bc.min.toFixed(2)}`);
  }
}

// ---------------------------------------------------------------------------
// 2د) die-cut: كل المرشحين يحترمون الزوجي (لا يمرّ مخطط يخرق B|C=10)
// ---------------------------------------------------------------------------
{
  const vs = computeMontageVariants({
    sheetWidthMm: 500,
    sheetHeightMm: 350,
    margins: { top: 0, bottom: 10, left: 0, right: 0 },
    groups: [
      { id: 'g1', widthMm: 140, heightMm: 100, quantity: 4, bleedMm: { top: 3, bottom: 3, left: 3, right: 3 } },
      { id: 'g2', widthMm: 89, heightMm: 89, quantity: 4, bleedMm: { top: 3, bottom: 3, left: 3, right: 3 } },
      { id: 'g3', widthMm: 78, heightMm: 78, quantity: 4, bleedMm: { top: 3, bottom: 3, left: 3, right: 3 } },
    ],
    bleedMm: { top: 3, bottom: 3, left: 3, right: 3 },
    quantity: 4,
    method: 'recto',
    cutMethod: 'die-cut',
    defaultGapMm: 0,
    pairGaps: { [pairGapKey('g2', 'g3')]: 10 },
  });
  check('die-cut+زوجي: يوجد مرشحون', vs.length > 0, `${vs.length}`);
  let allOk = true;
  for (const v of vs) {
    const d = minPairDistance(v.result.placed, 'g2', 'g3');
    // bleed 3+3=6 between cells when gap=0; with pair gap 10 → cell air ≥ 10, trim≥16
    if (d.count > 0 && d.min < 10 - EPS) {
      allOk = false;
      check(`die-cut+زوجي: ${v.kind} يحترم B-C≥10`, false, `min=${d.min.toFixed(2)}`);
    }
  }
  if (allOk) check('die-cut+زوجي: كل المرشحين يحترمون B-C≥10', true, `${vs.length} variants`);
}

// ---------------------------------------------------------------------------
// 3) فاصل داخلي: مجموعة واحدة intraGap=5 مع عام=8 → الداخلي يتغلّب (≈5 لا 8)
// ---------------------------------------------------------------------------
{
  const r = computeMontage(
    {
      sheetWidthMm: 200,
      sheetHeightMm: 120,
      groups: [{ id: 'g1', widthMm: 40, heightMm: 40, quantity: 100, bleedMm: NO_BLEED, intraGapMm: 5 }],
      bleedMm: NO_BLEED,
      quantity: 100,
      method: 'recto',
      defaultGapMm: 8,
    },
    [],
  );
  check('داخلي: النتيجة موجودة وبها ≥ 4 نسخ', !!r && r.placed.length >= 4, r ? `${r.placed.length}` : 'null');
  if (r) {
    const same = minPairDistance(r.placed, 'g1', 'g1');
    check('داخلي: كل أزواج نفس المجموعة ≥ 5مم', same.count > 0 && same.min >= 5 - EPS, `min=${same.min.toFixed(2)}`);
    check('داخلي: الداخلي 5 يتغلّب على العام 8 (min ≈ 5)', same.min <= 5 + 0.5, `min=${same.min.toFixed(2)}`);
  }
}

// ---------------------------------------------------------------------------
// 4) fixed mode: فاصل 50 على ورقة 100×100 وقطع 40×40 → نسختان مستحيلتان
//    — ok:false + maxPerGroup صادق (=1) + اقتراح بنسخة واحدة
// ---------------------------------------------------------------------------
{
  const r = computeFixedMontage({
    sheetWidthMm: 100,
    sheetHeightMm: 100,
    groups: [{ id: 'g1', widthMm: 40, heightMm: 40, quantity: 2, copiesPerSheet: 2, bleedMm: NO_BLEED }],
    bleedMm: NO_BLEED,
    quantity: 2,
    method: 'recto',
    defaultGapMm: 50,
  });
  check('fixed+فاصل 50: الرفض الصادق ok:false', !r.ok);
  if (!r.ok) {
    check('fixed+فاصل 50: maxPerGroup = 1 (فعلي لا نظري)', r.maxPerGroup['g1'] === 1, `got ${r.maxPerGroup['g1']}`);
    check(
      'fixed+فاصل 50: اقتراح بنسخة واحدة يُركَّب فعلاً',
      !!r.suggestion && r.suggestion.perGroup['g1'] === 1 && r.suggestion.placed.length === 1,
      r.suggestion ? `perGroup=${r.suggestion.perGroup['g1']}` : 'no suggestion',
    );
  }
}

// ---------------------------------------------------------------------------
// 5) bascule (gutter 10) بـintraGap=6: كل أزواج نفس المجموعة ≥ 6 في الناتج
//    الكامل — النصف المنعكس يرث الفواصل تلقائياً (الانعكاس يحفظ المسافات)
// ---------------------------------------------------------------------------
{
  const r = computeMontage(
    {
      sheetWidthMm: 200,
      sheetHeightMm: 200,
      groups: [{ id: 'g1', widthMm: 40, heightMm: 40, quantity: 100, bleedMm: NO_BLEED, intraGapMm: 6 }],
      bleedMm: NO_BLEED,
      quantity: 100,
      method: 'bascule',
      gutterMm: 10,
    },
    [],
  );
  check('bascule+داخلي: النتيجة موجودة وبها نسختان على الأقل لكل نصف', !!r && r.placed.length >= 4, r ? `${r.placed.length}` : 'null');
  if (r) {
    const same = minPairDistance(r.placed, 'g1', 'g1');
    check(
      'bascule+داخلي: كل الأزواج (النصفان معاً) ≥ 6مم',
      same.count > 0 && same.min >= 6 - EPS,
      `count=${same.count} min=${same.min.toFixed(2)}`,
    );
  }
}

console.log(failures === 0 ? '\nALL SPACING TESTS PASSED' : `\n${failures} SPACING TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
