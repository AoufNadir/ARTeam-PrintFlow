// Reproduction script — user-reported montage failures (2026-07-23)
import {
  computeMontage,
  computeFixedMontage,
  computeMontageVariants,
  halfWorkArea,
  printableArea,
  printableAreaForMethod,
} from '../app/src/lib/montage-engine';
import { SEED_MACHINES } from '../app/src/lib/catalog';
import type { MontageInput, PrintMethod } from '../app/src/lib/types';

const offset = SEED_MACHINES.find((m) => m.id === 'machine-offset-sm52')!;
const methods: PrintMethod[] = ['recto', 'bascule', 'double-pince', 'recto-verso'];

console.log('=== machine:', offset.name, 'margins:', offset.margins, 'pince:', offset.priseDePince);
console.log('printable 350x500:', printableArea(350, 500, offset));
for (const m of methods) {
  console.log(`halfWorkArea ${m}:`, halfWorkArea(350, 500, offset, m, 10));
  console.log(`printableForMethod ${m}:`, printableAreaForMethod(350, 500, offset, m, 10));
}

const groups = [
  { id: 'g140', widthMm: 140, heightMm: 140, quantity: 3 },
  { id: 'g89', widthMm: 89, heightMm: 89, quantity: 4 },
  { id: 'g78', widthMm: 78, heightMm: 78, quantity: 4 },
];

for (const method of methods) {
  const input: MontageInput = {
    sheetWidthMm: 350,
    sheetHeightMm: 500,
    quantity: 11,
    groups,
    method,
    bleedMm: { top: 0, bottom: 0, left: 0, right: 0 },
    gutterMm: 10,
    gripMm: 10,
    machineId: 'machine-offset-sm52',
  };
  const r = computeMontage(input, [offset]);
  const counts = new Map<string, number>();
  if (r) for (const p of r.placed) counts.set(p.groupId, (counts.get(p.groupId) ?? 0) + 1);
  console.log(
    `\n[A] quantity mode ${method}:`,
    r ? `OK sheets=${r.sheetsNeeded} placed=${r.placed.length} counts=${JSON.stringify([...counts])} waste=${r.wastePercent.toFixed(1)}%` : 'NULL (فشل كامل)',
  );
}

// fixed mode: 4 copies of 140x140 per sheet
for (const method of methods) {
  const out = computeFixedMontage(
    {
      sheetWidthMm: 350,
      sheetHeightMm: 500,
      quantity: 4,
      groups: [{ id: 'g140', widthMm: 140, heightMm: 140, quantity: 4, copiesPerSheet: 4 }],
      method,
      bleedMm: { top: 0, bottom: 0, left: 0, right: 0 },
      gutterMm: 10,
      gripMm: 10,
      machineId: 'machine-offset-sm52',
    },
    offset,
  );
  console.log(
    `[B] fixed 4x140 ${method}:`,
    out.ok ? `OK placed=${out.placed.length}` : `FAIL reason="${out.reason}" max=${JSON.stringify(out.maxPerGroup)}`,
  );
}

// variants diversity for the client example (recto + bascule)
for (const method of ['recto', 'bascule'] as PrintMethod[]) {
  const input: MontageInput = {
    sheetWidthMm: 350,
    sheetHeightMm: 500,
    quantity: 11,
    groups,
    method,
    bleedMm: { top: 0, bottom: 0, left: 0, right: 0 },
    gutterMm: 10,
    gripMm: 10,
    machineId: 'machine-offset-sm52',
  };
  const vs = computeMontageVariants(input, offset);
  console.log(
    `[C] variants ${method}: ${vs.length}`,
    vs.map((v) => `${v.kind}(cut=${v.cutScore},waste=${v.result.wastePercent.toFixed(1)}%,n=${v.result.placed.length})`),
  );
}

// the PDF expectation: 4x140 + 4x89 + 4x78
const pdfGroups = [
  { id: 'g140', widthMm: 140, heightMm: 140, quantity: 4 },
  { id: 'g89', widthMm: 89, heightMm: 89, quantity: 4 },
  { id: 'g78', widthMm: 78, heightMm: 78, quantity: 4 },
];
for (const method of methods) {
  const input: MontageInput = {
    sheetWidthMm: 350,
    sheetHeightMm: 500,
    quantity: 12,
    groups: pdfGroups,
    method,
    bleedMm: { top: 0, bottom: 0, left: 0, right: 0 },
    gutterMm: 10,
    gripMm: 10,
    machineId: 'machine-offset-sm52',
  };
  const r = computeMontage(input, [offset]);
  const counts = new Map<string, number>();
  if (r) for (const p of r.placed) counts.set(p.groupId, (counts.get(p.groupId) ?? 0) + 1);
  console.log(
    `[D] PDF case 4/4/4 ${method}:`,
    r ? `OK sheets=${r.sheetsNeeded} counts=${JSON.stringify([...counts])}` : 'NULL (فشل كامل)',
  );
}
