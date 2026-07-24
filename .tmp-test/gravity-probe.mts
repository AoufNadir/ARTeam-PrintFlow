// probe: مثال المستخدم بعد ضغط الجاذبية — مواضع القطع الفعلية
import { computeMontageVariants, gravityCompact, printableArea } from '../app/src/lib/montage-engine';
import { SEED_MACHINES } from '../app/src/lib/catalog';
import type { MontageInput, BleedBox } from '../app/src/lib/types';

const machine = SEED_MACHINES.find((m) => m.id === 'machine-offset-sm52')!;
const zeroBleed: BleedBox = { top: 0, bottom: 0, left: 0, right: 0 };

const input: MontageInput = {
  sheetWidthMm: 500,
  sheetHeightMm: 350,
  machineId: machine.id,
  bleedMm: zeroBleed,
  method: 'recto',
  quantity: 1,
  cutMethod: 'guillotine',
  groups: [
    { id: 'a', widthMm: 140, heightMm: 140, quantity: 4 },
    { id: 'b', widthMm: 89, heightMm: 89, quantity: 4 },
    { id: 'c', widthMm: 78, heightMm: 78, quantity: 4 },
  ],
};

const area = printableArea(500, 350, machine);
console.log('printableArea:', JSON.stringify(area), ' bottom =', area.y + area.h);

const variants = computeMontageVariants(input, machine);
for (const v of variants) {
  console.log(`\n=== variant ${v.kind} (source=${v.result.placed.length} pieces) ===`);
  const rows = v.result.placed
    .map((p) => ({ g: p.groupId, x: +p.x.toFixed(2), y: +p.y.toFixed(2), w: p.w, h: p.h, bottom: +(p.y + p.h).toFixed(2) }))
    .sort((r1, r2) => r1.g.localeCompare(r2.g) || r1.y - r2.y || r1.x - r2.x);
  for (const r of rows) console.log(`  ${r.g} x=${r.x} y=${r.y} ${r.w}×${r.h} bottom=${r.bottom}`);
  // idempotency check inline
  const again = gravityCompact(v.result.placed, area, () => 0);
  const moved = again.filter((p, i) => Math.abs(p.y - v.result.placed[i].y) > 1e-9).length;
  console.log(`  idempotent: ${moved === 0 ? 'YES' : `NO — ${moved} moved`}`);
}
