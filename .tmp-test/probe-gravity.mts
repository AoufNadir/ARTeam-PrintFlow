// STRICT independent check: after gravity, NO piece may have empty space below it.
// Every piece must rest on the work-area bottom OR on another piece (strict x-overlap).
import { computeMontage, computeMontageVariants, computeFixedMontage } from '../app/src/lib/montage-engine';
import { SEED_MACHINES } from '../app/src/lib/catalog';
import type { MontageInput, PlacedPiece } from '../app/src/lib/types';

const machine = SEED_MACHINES.find((m) => m.id === 'machine-offset-sm52') ?? SEED_MACHINES[1];
const groups = [
  { id: 'g140', widthMm: 140, heightMm: 140, quantity: 4 },
  { id: 'g89', widthMm: 89, heightMm: 89, quantity: 4 },
  { id: 'g78', widthMm: 78, heightMm: 78, quantity: 4 },
];
const B0 = { top: 0, bottom: 0, left: 0, right: 0 };
const EPS = 0.01;

const cellOf = (p: PlacedPiece) => ({
  x1: p.x - (p.bleed?.left ?? 0), y1: p.y - (p.bleed?.top ?? 0),
  x2: p.x + p.w + (p.bleed?.right ?? 0), y2: p.y + p.h + (p.bleed?.bottom ?? 0),
});

function strictCheck(label: string, placed: PlacedPiece[], areaBottom: number) {
  let floating = 0, resting = 0;
  for (const p of placed) {
    const c = cellOf(p);
    if (Math.abs(c.y2 - areaBottom) <= EPS) { resting++; continue; }
    // rests on another piece: some other cell whose top touches my bottom with strict x-overlap
    const supported = placed.some((q) => {
      if (q === p) return false;
      const d = cellOf(q);
      const xOverlap = Math.min(c.x2, d.x2) - Math.max(c.x1, d.x1);
      return xOverlap > EPS && Math.abs(d.y1 - c.y2) <= EPS;
    });
    if (supported) resting++;
    else {
      floating++;
      console.log(`  ✗ FLOATING: ${p.groupId}@(${p.x},${p.y}) bottom=${c.y2} (area bottom=${areaBottom}, gap=${(areaBottom - c.y2).toFixed(1)}mm below)`);
    }
  }
  console.log(`${label}: resting=${resting} floating=${floating} ${floating === 0 ? '✓ PASS' : '✗ FAIL'}`);
  return floating === 0;
}

let allOk = true;
for (const method of ['recto', 'bascule'] as const) {
  const input: MontageInput = {
    sheetWidthMm: 500, sheetHeightMm: 350, quantity: 12, groups,
    method, bleedMm: B0, gutterMm: 10, gripMm: 10, machineId: machine.id, cutMethod: 'guillotine',
  };
  const r = computeMontage(input, SEED_MACHINES);
  if (r) allOk = strictCheck(`computeMontage/${method}`, r.placed, r.printableArea.y + r.printableArea.h) && allOk;

  const variants = computeMontageVariants(input, machine);
  for (const v of variants) allOk = strictCheck(`variant/${v.kind}/${method}`, v.result.placed, v.result.printableArea.y + v.result.printableArea.h) && allOk;

  const fixed = computeFixedMontage({ ...input, quantity: 1, groups: groups.map((g) => ({ ...g, copiesPerSheet: 2 })) }, machine);
  if (fixed.ok) allOk = strictCheck(`fixed/${method}`, fixed.placed, fixed.printableArea.y + fixed.printableArea.h) && allOk;
}
console.log(allOk ? '\nALL ANCHORING CHECKS PASSED — no floating pieces' : '\nFAILURES FOUND');
process.exit(allOk ? 0 : 1);
