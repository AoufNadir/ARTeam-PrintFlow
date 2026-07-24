// probe: سلامة علامات القص على المواقع الجديدة بعد ضغط الجاذبية
import { computeMontageVariants, printableArea } from '../app/src/lib/montage-engine';
import { computeCutBlocks, computeCutMarks } from '../app/src/lib/cut-marks';
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
const variants = computeMontageVariants(input, machine);
let bad = 0;
for (const v of variants) {
  const pieces = v.result.placed.map((p) => ({
    x: p.x, y: p.y, w: p.w, h: p.h, bleed: p.bleed ?? zeroBleed, groupId: p.groupId,
  }));
  const blocks = computeCutBlocks(pieces);
  const marks = computeCutMarks(pieces, { cutMethod: 'guillotine', sharedCut: true, doubleCut: false, area });
  // كل علامة داخل مساحة الطباعة
  const inside = marks.every(
    (m) =>
      Math.min(m.x1, m.x2) >= area.x - 0.02 &&
      Math.max(m.x1, m.x2) <= area.x + area.w + 0.02 &&
      Math.min(m.y1, m.y2) >= area.y - 0.02 &&
      Math.max(m.y1, m.y2) <= area.y + area.h + 0.02,
  );
  // لا علامة تخترق خلية حبر (trim+bleed) لأي قطعة
  const crossesInk = marks.some((m) =>
    pieces.some((p) => {
      const l = p.x - p.bleed.left, t = p.y - p.bleed.top;
      const r = p.x + p.w + p.bleed.right, b = p.y + p.h + p.bleed.bottom;
      if (Math.abs(m.y1 - m.y2) < 0.02) return m.y1 > t + 0.02 && m.y1 < b - 0.02 && Math.max(m.x1, m.x2) > l + 0.02 && Math.min(m.x1, m.x2) < r - 0.02;
      return m.x1 > l + 0.02 && m.x1 < r - 0.02 && Math.max(m.y1, m.y2) > t + 0.02 && Math.min(m.y1, m.y2) < b - 0.02;
    }),
  );
  console.log(
    `${v.kind}: blocks=${blocks.length} marks=${marks.length} inside=${inside ? 'PASS' : 'FAIL'} no-ink-cross=${!crossesInk ? 'PASS' : 'FAIL'}`,
  );
  if (!inside || crossesInk) bad++;
}
console.log(bad === 0 ? 'CUT MARKS SANE ON NEW POSITIONS' : `${bad} VARIANT(S) BAD`);
process.exit(bad === 0 ? 0 : 1);
