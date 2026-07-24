// Demonstrate strengthened fixed-mode honesty: non-square single design where
// mixed-orientation MaxRects packs more than any one-orientation shelf grid.
import { computeFixedMontage, printableAreaForMethod } from '../app/src/lib/montage-engine';
import { SEED_MACHINES } from '../app/src/lib/catalog';
import type { FixedMontageInput, BleedBox } from '../app/src/lib/types';

const machine = SEED_MACHINES.find((m) => m.id === 'machine-offset-sm52')!;
const zeroBleed: BleedBox = { top: 0, bottom: 0, left: 0, right: 0 };
const area = printableAreaForMethod(350, 500, machine, 'recto');
console.log(`area ${area.w}×${area.h}`);

// 100×200 design: shelf grid fits 6 (3 cols × 2 rows). Area bound ≈ 7.8.
const input: FixedMontageInput = {
  sheetWidthMm: 350,
  sheetHeightMm: 500,
  machineId: machine.id,
  bleedMm: zeroBleed,
  method: 'recto',
  quantity: 100,
  groups: [{ id: 'g1', widthMm: 100, heightMm: 200, quantity: 100, copiesPerSheet: 8 }],
};
const out = computeFixedMontage(input, machine);
if (out.ok) {
  console.log(`fixed 8×100×200 recto: OK placed=${out.copiesPerSheet}`);
  // show orientations
  const rot = out.placed.filter((p) => p.rotated).length;
  console.log(`  rotated pieces: ${rot}/${out.placed.length}`);
} else {
  console.log(`fixed 8×100×200 recto: FAIL maxPerGroup=${out.maxPerGroup['g1']}`);
  if (out.suggestion) console.log(`  suggestion perGroup=${JSON.stringify(out.suggestion.perGroup)}`);
}

// probe intermediate maxima
for (const n of [7, 8]) {
  const probe: FixedMontageInput = { ...input, groups: [{ ...input.groups[0], copiesPerSheet: n }] };
  const r = computeFixedMontage(probe, machine);
  console.log(`copies=${n}: ${r.ok ? `OK (${r.copiesPerSheet} placed)` : `fail max=${r.maxPerGroup['g1']}`}`);
}
