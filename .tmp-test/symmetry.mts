// Explicit symmetry + gutter check for the NEW user gutter model (2×gutter band)
import { computeMontage, gutterBandOf, halfWorkArea } from '../app/src/lib/montage-engine';
import { SEED_MACHINES } from '../app/src/lib/catalog';
import type { MontageInput } from '../app/src/lib/types';

const B0 = { top: 0, bottom: 0, left: 0, right: 0 };
const groups = [
  { id: 'g140', widthMm: 140, heightMm: 140, quantity: 3 },
  { id: 'g89', widthMm: 89, heightMm: 89, quantity: 4 },
  { id: 'g78', widthMm: 78, heightMm: 78, quantity: 4 },
];

console.log('halfWorkArea bascule 350x500 (expect h = 250-10 = 240 strip — larger dim split):', halfWorkArea(350, 500, SEED_MACHINES[1], 'bascule', 10));
console.log('halfWorkArea bascule 500x350 (expect w = 250-10 = 240 strip — larger dim split):', halfWorkArea(500, 350, SEED_MACHINES[1], 'bascule', 10));

for (const [W, H] of [[350, 500], [500, 350]] as const) {
  const input: MontageInput = {
    sheetWidthMm: W, sheetHeightMm: H, quantity: 11, groups,
    method: 'bascule', bleedMm: B0, gutterMm: 10, gripMm: 10, machineId: 'machine-offset-sm52',
  };
  const r = computeMontage(input, SEED_MACHINES);
  if (!r || r.sheetWidthMm !== W) {
    console.log(`${W}x${H}: fallback/no result — skipped (sheet=${r?.sheetWidthMm}x${r?.sheetHeightMm})`);
    continue;
  }
  const flip = r.flipAxis!;
  const axis = flip.position;
  const band = gutterBandOf(r)!;
  // 1) every piece has its exact mirror
  const key = (x: number, y: number, w: number, h: number, g: string) =>
    `${Math.round(x * 10)},${Math.round(y * 10)},${Math.round(w * 10)},${Math.round(h * 10)},${g}`;
  const set = new Set(r.placed.map((p) => key(p.x, p.y, p.w, p.h, p.groupId)));
  let symmetric = true;
  for (const p of r.placed) {
    const mx = flip.axis === 'vertical' ? 2 * axis - p.x - p.w : p.x;
    const my = flip.axis === 'horizontal' ? 2 * axis - p.y - p.h : p.y;
    if (!set.has(key(mx, my, p.w, p.h, p.groupId))) symmetric = false;
  }
  // 2) no piece enters the gutter band
  let clear = true;
  for (const p of r.placed) {
    const overlap =
      p.x < band.x + band.w && p.x + p.w > band.x && p.y < band.y + band.h && p.y + p.h > band.y;
    if (overlap) clear = false;
  }
  // 3) band = 2*gutter centered on axis
  const bandOk =
    Math.abs(band.x + band.w / 2 - (flip.axis === 'vertical' ? axis : band.x + band.w / 2)) < 1e-9 &&
    (flip.axis === 'vertical' ? Math.abs(band.x - (axis - 10)) < 1e-6 && Math.abs(band.w - 20) < 1e-6
                              : Math.abs(band.y - (axis - 10)) < 1e-6 && Math.abs(band.h - 20) < 1e-6);
  console.log(
    `${W}x${H} bascule: axis=${flip.axis}@${axis} band=${JSON.stringify(band)} pieces=${r.placed.length}`,
    `| symmetric=${symmetric ? 'PASS' : 'FAIL'} clear-of-band=${clear ? 'PASS' : 'FAIL'} band-2g-centered=${bandOk ? 'PASS' : 'FAIL'}`,
  );
}
