import { printableAreaForMethod } from '../app/src/lib/montage-engine';
import { SEED_MACHINES } from '../app/src/lib/catalog';

const machine = SEED_MACHINES.find((m) => m.id === 'machine-offset-sm52')!;
const area = printableAreaForMethod(350, 500, machine, 'recto');
console.log('printable recto 350x500 sm52:', JSON.stringify(area));

// exact overlap check for the user's claimed arrangements
function overlaps(a: number[], b: number[]) {
  return a[0] < b[0] + 165 - 1e-9 && b[0] < a[0] + 165 - 1e-9 && a[1] < b[1] + 165 - 1e-9 && b[1] < a[1] + 165 - 1e-9;
}
const claim165 = [[0, 0], [159, 0], [0, 165]];
console.log('claim 165 pairwise overlap:', overlaps(claim165[0], claim165[1]));

// pigeonhole: two squares of side s in a strip of width W<2s must be y-disjoint
for (const s of [165, 170]) {
  const maxChain = Math.floor(area.h / s);
  const sideBySide = 2 * s <= area.w + 1e-9;
  console.log(`s=${s}: sideBySide possible=${sideBySide}, y-chain max=${maxChain}`);
}
