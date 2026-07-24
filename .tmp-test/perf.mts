// Perf smoke: variant generation must stay fast.
import { computeMontageVariants, computeMontage, computeFixedMontage } from '../app/src/lib/montage-engine';
import { SEED_MACHINES } from '../app/src/lib/catalog';
import type { MontageInput, FixedMontageInput, BleedBox } from '../app/src/lib/types';

const machine = SEED_MACHINES.find((m) => m.id === 'machine-offset-sm52')!;
const zeroBleed: BleedBox = { top: 0, bottom: 0, left: 0, right: 0 };

function time<T>(name: string, fn: () => T): T {
  const t0 = performance.now();
  const r = fn();
  console.log(`${name}: ${(performance.now() - t0).toFixed(1)}ms`);
  return r;
}

const small: MontageInput = {
  sheetWidthMm: 350, sheetHeightMm: 500, machineId: machine.id, bleedMm: zeroBleed,
  method: 'recto', quantity: 1,
  groups: [
    { id: 'a', widthMm: 140, heightMm: 140, quantity: 3 },
    { id: 'b', widthMm: 89, heightMm: 89, quantity: 4 },
    { id: 'c', widthMm: 78, heightMm: 78, quantity: 4 },
  ],
};
time('variants small (11 pcs)', () => computeMontageVariants(small, machine));
time('computeMontage small (+alternatives)', () => computeMontage(small, SEED_MACHINES));

const medium: MontageInput = {
  sheetWidthMm: 350, sheetHeightMm: 500, machineId: machine.id, bleedMm: zeroBleed,
  method: 'bascule', quantity: 1,
  groups: [
    { id: 'a', widthMm: 60, heightMm: 40, quantity: 200 },
    { id: 'b', widthMm: 50, heightMm: 50, quantity: 150 },
    { id: 'c', widthMm: 35, heightMm: 25, quantity: 300 },
  ],
};
time('variants medium (~50 pcs/sheet)', () => computeMontageVariants(medium, machine));
time('computeMontage medium', () => computeMontage(medium, SEED_MACHINES));

const tiny: MontageInput = {
  sheetWidthMm: 700, sheetHeightMm: 1000, machineId: machine.id, bleedMm: zeroBleed,
  method: 'recto', quantity: 1,
  groups: [
    { id: 'a', widthMm: 30, heightMm: 20, quantity: 5000 },
    { id: 'b', widthMm: 25, heightMm: 25, quantity: 4000 },
  ],
};
time('variants tiny (hundreds of pcs)', () => computeMontageVariants(tiny, machine));
time('computeMontage tiny', () => computeMontage(tiny, SEED_MACHINES));

const fixedBig: FixedMontageInput = {
  sheetWidthMm: 350, sheetHeightMm: 500, machineId: machine.id, bleedMm: zeroBleed,
  method: 'recto', quantity: 100,
  groups: [
    { id: 'a', widthMm: 140, heightMm: 140, quantity: 30, copiesPerSheet: 5 },
    { id: 'b', widthMm: 89, heightMm: 89, quantity: 40, copiesPerSheet: 6 },
  ],
};
time('computeFixedMontage failure path (honest maxima)', () => computeFixedMontage(fixedBig, machine));

const fixedTiny: FixedMontageInput = {
  sheetWidthMm: 700, sheetHeightMm: 1000, machineId: machine.id, bleedMm: zeroBleed,
  method: 'recto', quantity: 99999,
  groups: [{ id: 'a', widthMm: 22, heightMm: 18, quantity: 99999, copiesPerSheet: 3000 }],
};
time('computeFixedMontage tiny failure path', () => computeFixedMontage(fixedTiny, machine));
