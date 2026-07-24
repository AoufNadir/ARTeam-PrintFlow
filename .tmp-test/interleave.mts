// Does the strengthened engine now find 4/4/4 on ONE 350x500 offset sheet?
import { computeMontage, computeMontageVariants } from '../app/src/lib/montage-engine';
import { SEED_MACHINES } from '../app/src/lib/catalog';
import type { MontageInput } from '../app/src/lib/types';

const groups = [
  { id: 'g140', widthMm: 140, heightMm: 140, quantity: 4 },
  { id: 'g89', widthMm: 89, heightMm: 89, quantity: 4 },
  { id: 'g78', widthMm: 78, heightMm: 78, quantity: 4 },
];
const B0 = { top: 0, bottom: 0, left: 0, right: 0 };

for (const method of ['recto', 'bascule'] as const) {
  const input: MontageInput = {
    sheetWidthMm: 350, sheetHeightMm: 500, quantity: 12, groups,
    method, bleedMm: B0, gutterMm: 10, gripMm: 10, machineId: 'machine-offset-sm52',
  };
  const r = computeMontage(input, SEED_MACHINES);
  const counts = new Map<string, number>();
  if (r) for (const p of r.placed) counts.set(p.groupId, (counts.get(p.groupId) ?? 0) + 1);
  console.log(
    `4/4/4 ${method}:`,
    r ? `sheet=${r.sheetWidthMm}x${r.sheetHeightMm} sheets=${r.sheetsNeeded} perSheet=${JSON.stringify([...counts])} waste=${r.wastePercent}%` : 'NULL',
  );
  const vs = computeMontageVariants(input, SEED_MACHINES.find((m) => m.id === 'machine-offset-sm52'));
  console.log(
    `  variants: ${vs.length}`,
    vs.map((v) => `${v.kind}[n=${v.result.placed.length},sheets=${v.result.sheetsNeeded},w=${v.result.wastePercent}%,cut=${v.cutScore}]`),
  );
  // one-sheet variant present?
  const one = vs.find((v) => v.result.sheetsNeeded === 1);
  console.log(`  one-sheet variant: ${one ? `YES (${one.kind})` : 'no'}`);
}
