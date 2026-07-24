// Verify anchoring across ALL UI compute paths: variants, fixed, evaluate.
import { computeMontageVariants, computeFixedMontage, evaluateMontage } from '../app/src/lib/montage-engine';
import { SEED_MACHINES } from '../app/src/lib/catalog';
import type { MontageInput } from '../app/src/lib/types';

const machine = SEED_MACHINES.find((m) => m.id === 'machine-offset-sm52') ?? SEED_MACHINES[1];
const groups = [
  { id: 'g140', widthMm: 140, heightMm: 140, quantity: 4 },
  { id: 'g89', widthMm: 89, heightMm: 89, quantity: 4 },
  { id: 'g78', widthMm: 78, heightMm: 78, quantity: 4 },
];
const B0 = { top: 0, bottom: 0, left: 0, right: 0 };
const base: MontageInput = {
  sheetWidthMm: 500, sheetHeightMm: 350, quantity: 12, groups,
  method: 'recto', bleedMm: B0, gutterMm: 10, gripMm: 10, machineId: machine.id, cutMethod: 'guillotine',
};

const check = (label: string, placed: { y: number; h: number; bleed?: { bottom: number } }[], areaBottom: number) => {
  const ink = Math.max(...placed.map((p) => p.y + p.h + (p.bleed?.bottom ?? 0)));
  console.log(`${label}: inkBottom=${ink.toFixed(1)} areaBottom=${areaBottom} gap=${(areaBottom - ink).toFixed(2)}mm ${areaBottom - ink <= 0.01 ? 'ANCHORED ✓' : 'NOT ANCHORED ✗'}`);
};

// 1) variants path (quantity mode — the 3 filter cards)
const variants = computeMontageVariants(base, machine);
for (const v of variants) check(`variant/${v.kind}`, v.result.placed, v.result.printableArea.y + v.result.printableArea.h);

// 2) fixed mode (النمط الثابت — copies per sheet)
const fixed = computeFixedMontage(
  { ...base, groups: groups.map((g) => ({ ...g, copiesPerSheet: 2 })), quantity: 1 },
  machine,
);
if (fixed.ok) check('fixed', fixed.placed, fixed.printableArea.y + fixed.printableArea.h);
else console.log('fixed: FAILED —', fixed.reason);

// 3) evaluateMontage (adopt-alternative / waste badges path)
const ev = evaluateMontage(base, machine);
if (ev) check('evaluate', ev.placed, ev.printableArea.y + ev.printableArea.h);
