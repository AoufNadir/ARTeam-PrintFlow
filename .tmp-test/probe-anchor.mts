// Probe: does the montage anchor the block to the gripper edge (bottom of work area)?
import { computeMontage } from '../app/src/lib/montage-engine';
import { SEED_MACHINES } from '../app/src/lib/catalog';
import type { MontageInput } from '../app/src/lib/types';

const machine = SEED_MACHINES.find((m) => m.id === 'machine-offset-sm52') ?? SEED_MACHINES[1];
const groups = [
  { id: 'g140', widthMm: 140, heightMm: 140, quantity: 4 },
  { id: 'g89', widthMm: 89, heightMm: 89, quantity: 4 },
  { id: 'g78', widthMm: 78, heightMm: 78, quantity: 4 },
];
const B0 = { top: 0, bottom: 0, left: 0, right: 0 };

for (const method of ['recto', 'bascule'] as const) {
  const input: MontageInput = {
    sheetWidthMm: 500, sheetHeightMm: 350, quantity: 12, groups,
    method, bleedMm: B0, gutterMm: 10, gripMm: 10, machineId: machine.id, cutMethod: 'guillotine',
  };
  const r = computeMontage(input, SEED_MACHINES);
  if (!r) { console.log(`${method}: NO RESULT`); continue; }
  const area = r.printableArea;
  const maxInkBottom = Math.max(...r.placed.map((p) => p.y + p.h + (p.bleed?.bottom ?? 0)));
  const areaBottom = area.y + area.h;
  console.log(
    `${method}: sheet=${r.sheetWidthMm}x${r.sheetHeightMm} area=[${area.x},${area.y} ${area.w}x${area.h}] bottom=${areaBottom}`,
    `| inkBottom=${maxInkBottom} | gap-to-gripper=${(areaBottom - maxInkBottom).toFixed(2)}mm`,
    `| ${maxInkBottom >= areaBottom - 0.01 ? 'ANCHORED ✓' : 'NOT ANCHORED ✗'}`,
  );
  const ys = r.placed.map((p) => `${p.groupId}@(${p.x},${p.y})`);
  console.log('  placed:', ys.join(' '));
}
