// Acceptance tests for montage-engine variant expansion + fixed-mode strength.
import {
  computeMontageVariants,
  computeFixedMontage,
  computeMontage,
  gutterBandOf,
  BASCULE_MIN_GUTTER_MM,
} from '../app/src/lib/montage-engine';
import { SEED_MACHINES } from '../app/src/lib/catalog';
import type { MontageInput, FixedMontageInput, BleedBox } from '../app/src/lib/types';

const machine = SEED_MACHINES.find((m) => m.id === 'machine-offset-sm52')!;
if (!machine) throw new Error('machine-offset-sm52 not found');

const zeroBleed: BleedBox = { top: 0, bottom: 0, left: 0, right: 0 };

const SHEET = { sheetWidthMm: 350, sheetHeightMm: 500, machineId: machine.id, bleedMm: zeroBleed };

const GROUPS_3 = [
  { id: 'a', widthMm: 140, heightMm: 140, quantity: 3 },
  { id: 'b', widthMm: 89, heightMm: 89, quantity: 4 },
  { id: 'c', widthMm: 78, heightMm: 78, quantity: 4 },
];

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}

// --- 1) quantity-mode variants: recto ≥ 3 distinct, bascule ≥ 2 distinct ----
for (const method of ['recto', 'bascule'] as const) {
  const input: MontageInput = { ...SHEET, method, quantity: 1, groups: GROUPS_3 };
  const variants = computeMontageVariants(input, machine);
  const sigs = new Set(
    variants.map((v) =>
      v.result.placed
        .map((p) => `${Math.round(p.x)},${Math.round(p.y)},${p.groupId}`)
        .sort()
        .join('|'),
    ),
  );
  const need = method === 'recto' ? 3 : 2;
  check(
    `variants ${method}: ≥ ${need} distinct`,
    variants.length >= need && sigs.size >= need,
    `got ${variants.length} variants (${sigs.size} distinct) kinds=[${variants.map((v) => v.kind).join(',')}]`,
  );
  for (const v of variants) {
    const perGroup = new Map<string, number>();
    for (const p of v.result.placed) perGroup.set(p.groupId, (perGroup.get(p.groupId) ?? 0) + 1);
    const covers = GROUPS_3.every((g) => (perGroup.get(g.id) ?? 0) > 0);
    check(`variants ${method}/${v.kind}: covers all groups`, covers, JSON.stringify(Object.fromEntries(perGroup)));
  }
  console.log(
    `   ${method} details: ` +
      variants
        .map((v) => `${v.kind}[copies=${v.result.copiesPerSheet},sheets=${v.result.sheetsNeeded},waste=${v.result.wastePercent}%,cut=${v.cutScore}]`)
        .join('  '),
  );
}

// --- 2) fixed mode: 4×165/170×170 recto — نموذج الأوفست الجديد: الهوامش = صفر
// والمسكة وحدها (10مم) ← المساحة الصالحة 340×500، فتسع شبكة 2×2 للمقاسين
// (165: 330 ≤ 340؛ 170: 340 ≤ 340 بالضبط) ويُتوقَّع ok:true
for (const size of [165, 170]) {
  const input: FixedMontageInput = {
    ...SHEET,
    method: 'recto',
    quantity: 1,
    groups: [{ id: 'g1', widthMm: size, heightMm: size, quantity: 4, copiesPerSheet: 4 }],
  };
  const out = computeFixedMontage(input, machine);
  if (out.ok) {
    check(`fixed 4×${size} recto: packs 2×2 (ok)`, true, `placed=${out.copiesPerSheet}`);
  } else {
    const mx = out.maxPerGroup['g1'] ?? 0;
    check(`fixed 4×${size} recto: packs 2×2 (ok)`, false, `failed — reason=${out.reason} maxPerGroup=${mx}`);
  }
}

// --- 2ب) guillotine: المرشح الافتراضي (balanced) = بلوكات مستطيلة من عائلة
// الأرفف (وليس MaxRects الحر) — معيار قبول معتمد على مثال المستخدم -----------
{
  const input: MontageInput = { ...SHEET, method: 'recto', quantity: 1, groups: GROUPS_3, cutMethod: 'guillotine' };
  const variants = computeMontageVariants(input, machine);
  const bal = variants[0];
  check('guillotine: المرشح الافتراضي موجود وبنوع balanced', !!bal && bal.kind === 'balanced', bal?.kind ?? 'none');
  if (bal) {
    // كل كتلة اتصال لكل تصميم يجب أن تكون مستطيلاً ممتلئاً (أو قطعة معزولة)
    const byGroup = new Map<string, { x: number; y: number; w: number; h: number }[]>();
    for (const p of bal.result.placed) {
      const arr = byGroup.get(p.groupId) ?? [];
      arr.push(p);
      byGroup.set(p.groupId, arr);
    }
    const details: string[] = [];
    let rectangular = true;
    for (const [gid, ps] of byGroup) {
      // كتل الاتصال داخل المجموعة (تلاصق trim على ضلع)
      const seen = new Set<number>();
      for (let i = 0; i < ps.length; i++) {
        if (seen.has(i)) continue;
        const comp = [i];
        seen.add(i);
        for (let q = 0; q < comp.length; q++) {
          for (let j = 0; j < ps.length; j++) {
            if (seen.has(j)) continue;
            const A = ps[comp[q]];
            const B = ps[j];
            const xOv = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
            const yOv = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
            const xT = Math.abs(A.x + A.w - B.x) < 0.05 || Math.abs(B.x + B.w - A.x) < 0.05;
            const yT = Math.abs(A.y + A.h - B.y) < 0.05 || Math.abs(B.y + B.h - A.y) < 0.05;
            if ((xOv > 0.05 && yT) || (yOv > 0.05 && xT)) {
              comp.push(j);
              seen.add(j);
            }
          }
        }
        const x0 = Math.min(...comp.map((k) => ps[k].x));
        const y0 = Math.min(...comp.map((k) => ps[k].y));
        const x1 = Math.max(...comp.map((k) => ps[k].x + ps[k].w));
        const y1 = Math.max(...comp.map((k) => ps[k].y + ps[k].h));
        const sumArea = comp.reduce((s, k) => s + ps[k].w * ps[k].h, 0);
        const filled = Math.abs(sumArea - (x1 - x0) * (y1 - y0)) < 0.5;
        details.push(`${gid}#${i}:${comp.length}${filled ? '' : '✗L'}`);
        if (!filled) rectangular = false;
      }
    }
    check('guillotine: الافتراضي = بلوكات مستطيلة ممتلئة لكل تصميم (قص مستقيم)', rectangular, details.join(' '));
    console.log(
      `   guillotine balanced: copies=${bal.result.copiesPerSheet} sheets=${bal.result.sheetsNeeded} waste=${bal.result.wastePercent}% [${details.join(' ')}]`,
    );
  }
}

// --- 3) old cases must not regress -------------------------------------------
// 3a. quantity 3/4/4 succeeds with all four methods
for (const method of ['recto', 'recto-verso', 'bascule', 'double-pince'] as const) {
  const input: MontageInput = { ...SHEET, method, quantity: 1, groups: GROUPS_3 };
  const r = computeMontage(input, SEED_MACHINES);
  check(`quantity 3/4/4 ${method}: succeeds`, !!r, r ? `copies=${r.copiesPerSheet} sheets=${r.sheetsNeeded}` : 'null');
}

// 3b. fixed 4×140 succeeds with all four methods
for (const method of ['recto', 'recto-verso', 'bascule', 'double-pince'] as const) {
  const input: FixedMontageInput = {
    ...SHEET,
    method,
    quantity: 1,
    groups: [{ id: 'g1', widthMm: 140, heightMm: 140, quantity: 4, copiesPerSheet: 4 }],
  };
  const out = computeFixedMontage(input, machine);
  check(`fixed 4×140 ${method}: ok`, out.ok, out.ok ? `placed=${out.copiesPerSheet}` : out.reason);
}

// 3c. bascule gutter band: نموذج المستخدم — المساحة الوسطية (10مم) تُخصم كاملة
// من كل نصف، والمحور على منتصف القياس الأكبر (500) → شريط أفقي: y=250−10=240, h=20
{
  const input: MontageInput = { ...SHEET, method: 'bascule', quantity: 1, groups: GROUPS_3 };
  const r = computeMontage(input, SEED_MACHINES);
  const band = r ? gutterBandOf(r) : null;
  check(
    `bascule gutter band: y=240 h=${2 * BASCULE_MIN_GUTTER_MM} (axis 250 on larger dim, ±10 per half)`,
    !!band && Math.abs(band.y - 240) < 1e-6 && Math.abs(band.h - 20) < 1e-6,
    band ? `y=${band.y} h=${band.h}` : 'no band',
  );
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
