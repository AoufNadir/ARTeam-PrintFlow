// Sweep hunt — find ANY failing combo near the user's example
import { computeMontage, computeFixedMontage } from '../app/src/lib/montage-engine';
import { SEED_MACHINES } from '../app/src/lib/catalog';
import type { BleedBox, MontageInput, PrintMethod } from '../app/src/lib/types';

const B = (v: number): BleedBox => ({ top: v, bottom: v, left: v, right: v });
const machines = SEED_MACHINES;
const methods: PrintMethod[] = ['recto', 'bascule', 'double-pince', 'recto-verso'];

let fails = 0;
function run(tag: string, input: MontageInput) {
  const r = computeMontage(input, machines);
  if (!r) {
    fails++;
    console.log(`FAIL ${tag}`);
  }
  return r;
}

// 1) previous example with bleed 2/3/5mm, all methods, 35x50 offset
for (const bleed of [2, 3, 5]) {
  for (const method of methods) {
    run(`bleed=${bleed} ${method} 3/4/4`, {
      sheetWidthMm: 350, sheetHeightMm: 500, quantity: 11,
      groups: [
        { id: 'g140', widthMm: 140, heightMm: 140, quantity: 3 },
        { id: 'g89', widthMm: 89, heightMm: 89, quantity: 4 },
        { id: 'g78', widthMm: 78, heightMm: 78, quantity: 4 },
      ],
      method, bleedMm: B(bleed), gutterMm: 10, gripMm: 10, machineId: 'machine-offset-sm52',
    });
  }
}

// 2) big quantities
for (const method of methods) {
  run(`big qty ${method}`, {
    sheetWidthMm: 350, sheetHeightMm: 500, quantity: 600,
    groups: [
      { id: 'g140', widthMm: 140, heightMm: 140, quantity: 300 },
      { id: 'g89', widthMm: 89, heightMm: 89, quantity: 200 },
      { id: 'g78', widthMm: 78, heightMm: 78, quantity: 100 },
    ],
    method, bleedMm: B(0), gutterMm: 10, gripMm: 10, machineId: 'machine-offset-sm52',
  });
}

// 3) single design sizes around 130-200 (grid boundary sizes), recto+bascule
for (const s of [130, 140, 146, 150, 152, 155, 160, 162, 165, 170, 175, 180, 200]) {
  for (const method of ['recto', 'bascule'] as PrintMethod[]) {
    const input: MontageInput = {
      sheetWidthMm: 350, sheetHeightMm: 500, quantity: 4,
      pieceWidthMm: s, pieceHeightMm: s, method, bleedMm: B(0), gutterMm: 10, gripMm: 10, machineId: 'machine-offset-sm52',
    };
    const r = computeMontage(input, machines);
    const n = r?.copiesPerSheet ?? 0;
    console.log(`single ${s}x${s} ${method}: ${r ? `${n}/sheet, ${r!.sheetsNeeded} sheets` : 'NULL'}`);
  }
}

// 4) fixed mode: 4 copies of sizes near boundary
for (const s of [140, 150, 160, 165, 170]) {
  for (const method of methods) {
    const out = computeFixedMontage(
      {
        sheetWidthMm: 350, sheetHeightMm: 500, quantity: 4,
        groups: [{ id: 'g1', widthMm: s, heightMm: s, quantity: 4, copiesPerSheet: 4 }],
        method, bleedMm: B(0), gutterMm: 10, gripMm: 10, machineId: 'machine-offset-sm52',
      },
      machines.find((m) => m.id === 'machine-offset-sm52'),
    );
    console.log(
      `fixed 4x${s} ${method}:`,
      out.ok ? `OK (${out.placed.length})` : `FAIL max=${JSON.stringify(out.maxPerGroup)}`,
    );
  }
}

// 5) landscape 50x35 + digital 32x45 with the example
run('landscape 500x350 recto', {
  sheetWidthMm: 500, sheetHeightMm: 350, quantity: 11,
  groups: [
    { id: 'g140', widthMm: 140, heightMm: 140, quantity: 3 },
    { id: 'g89', widthMm: 89, heightMm: 89, quantity: 4 },
    { id: 'g78', widthMm: 78, heightMm: 78, quantity: 4 },
  ],
  method: 'recto', bleedMm: B(0), gutterMm: 10, gripMm: 10, machineId: 'machine-offset-sm52',
});

console.log(`\nTOTAL FAILS: ${fails}`);
