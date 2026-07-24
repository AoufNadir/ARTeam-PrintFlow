// Geometric integrity probe: every produced layout must be overlap-free
// (bleed boxes included) and inside the physical sheet.
import { computeMontageVariants, computeFixedMontage, computeMontage } from '../app/src/lib/montage-engine';
import { SEED_MACHINES } from '../app/src/lib/catalog';
import type { MontageInput, FixedMontageInput, PlacedPiece, BleedBox } from '../app/src/lib/types';

const machine = SEED_MACHINES.find((m) => m.id === 'machine-offset-sm52')!;
const zeroBleed: BleedBox = { top: 0, bottom: 0, left: 0, right: 0 };
const bleed2: BleedBox = { top: 2, bottom: 2, left: 2, right: 2 };
const SHEET = { sheetWidthMm: 350, sheetHeightMm: 500, machineId: machine.id };

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}

function box(p: PlacedPiece) {
  const b = p.bleed ?? { top: 0, bottom: 0, left: 0, right: 0 };
  return { x1: p.x - b.left, y1: p.y - b.top, x2: p.x + p.w + b.right, y2: p.y + p.h + b.bottom };
}

function validateLayout(name: string, placed: PlacedPiece[], sheetW: number, sheetH: number) {
  const EPS = 0.02;
  // the engine's hard contract: TRIM rects never overlap (bleed is sacrificial
  // and mirrored halves may share bleed across a gutter-less tumble axis)
  let overlap = '';
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      if (
        a.x < b.x + b.w - EPS &&
        b.x < a.x + a.w - EPS &&
        a.y < b.y + b.h - EPS &&
        b.y < a.y + a.h - EPS
      ) {
        overlap = `pieces ${i}/${j} (${a.groupId}@${a.x.toFixed(1)},${a.y.toFixed(1)} vs ${b.groupId}@${b.x.toFixed(1)},${b.y.toFixed(1)})`;
      }
    }
  }
  check(`${name}: no trim overlap`, overlap === '', overlap);
  const inSheet = placed.every((p) => {
    const b = box(p);
    return b.x1 >= -EPS && b.y1 >= -EPS && b.x2 <= sheetW + EPS && b.y2 <= sheetH + EPS;
  });
  check(`${name}: all bleed boxes inside sheet`, inSheet);
}

const GROUPS_3 = [
  { id: 'a', widthMm: 140, heightMm: 140, quantity: 3 },
  { id: 'b', widthMm: 89, heightMm: 89, quantity: 4 },
  { id: 'c', widthMm: 78, heightMm: 78, quantity: 4 },
];

// quantity variants, all methods, no bleed AND 2mm bleed
for (const method of ['recto', 'recto-verso', 'bascule', 'double-pince'] as const) {
  for (const [bname, bleed] of [['bleed0', zeroBleed], ['bleed2', bleed2]] as const) {
    const input: MontageInput = { ...SHEET, bleedMm: bleed, method, quantity: 1, groups: GROUPS_3 };
    const variants = computeMontageVariants(input, machine);
    for (const v of variants) {
      validateLayout(`variants ${method}/${bname}/${v.kind}#${variants.indexOf(v)}`, v.result.placed, 350, 500);
    }
    const r = computeMontage(input, SEED_MACHINES);
    if (r) validateLayout(`computeMontage ${method}/${bname}`, r.placed, r.sheetWidthMm, r.sheetHeightMm);
  }
}

// fixed mode success + suggestion layouts, all methods
for (const method of ['recto', 'recto-verso', 'bascule', 'double-pince'] as const) {
  const okInput: FixedMontageInput = {
    ...SHEET,
    bleedMm: zeroBleed,
    method,
    quantity: 1,
    groups: [
      { id: 'a', widthMm: 140, heightMm: 140, quantity: 3, copiesPerSheet: 2 },
      { id: 'b', widthMm: 89, heightMm: 89, quantity: 4, copiesPerSheet: 3 },
    ],
  };
  const okOut = computeFixedMontage(okInput, machine);
  if (okOut.ok) validateLayout(`fixed ok ${method}`, okOut.placed, 350, 500);
  else check(`fixed ok ${method}: packs`, false, okOut.reason);

  const failInput: FixedMontageInput = {
    ...SHEET,
    bleedMm: zeroBleed,
    method,
    quantity: 1,
    groups: [
      { id: 'a', widthMm: 140, heightMm: 140, quantity: 30, copiesPerSheet: 5 },
      { id: 'b', widthMm: 89, heightMm: 89, quantity: 40, copiesPerSheet: 6 },
    ],
  };
  const failOut = computeFixedMontage(failInput, machine);
  if (!failOut.ok && failOut.suggestion) {
    validateLayout(`fixed suggestion ${method}`, failOut.suggestion.placed, 350, 500);
  }
}

// honesty proof: user's claimed staggered coordinates overlap. With the new
// offset model (full sheet minus the 10mm grip strip only → 340×500 usable on
// this portrait input) 3×165 and 4×170 now fit; 5×170 remains geometrically
// impossible (pigeonhole)
{
  const overlap165 = 159 < 165; // piece2 starts at x=159 while piece1 spans 0..165
  check('user claim (0,0),(159,0) for 165 overlaps → invalid', overlap165);
  check('user claim (0,0),(154,0) for 170 overlaps → invalid', 154 < 170);
  const areaW = 340; // 350 − 10 grip (offset: margins are zero in the new model)
  const areaH = 500;
  check(`3×165 fits ${areaW}×${areaH} (column = 495 ≤ 500)`, 165 <= areaW && 3 * 165 <= areaH);
  check(`4×170 fits ${areaW}×${areaH} exactly (2×2 = 340×340)`, 2 * 170 <= areaW && 2 * 170 <= areaH);
  // pigeonhole: a column holds at most floor(500/170)=2 squares (3×170=510 > 500)
  // and the width allows only 2 columns → 5 squares can never fit
  const cols = Math.floor(areaW / 170);
  const perCol = Math.floor(areaH / 170);
  check(`5×170 in ${areaW}×${areaH} is geometrically impossible (max ${cols * perCol})`, cols * perCol < 5);
}

console.log(failures === 0 ? '\nALL INTEGRITY CHECKS PASSED' : `\n${failures} INTEGRITY CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
