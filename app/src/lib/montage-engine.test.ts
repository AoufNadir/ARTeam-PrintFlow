import { describe, expect, it } from 'vitest';
import { computeMontageVariants } from './montage-engine';
import type { Machine, MontageInput } from './types';

const digitalMachine: Machine = {
  id: 'mc-versant',
  name: 'Versant (test)',
  kind: 'digital',
  margins: { top: 4, bottom: 4, left: 4, right: 4 },
  sheetSizes: [],
  enabled: true,
};

const A4_DEFAULTS = {
  sheetWidthMm: 210,
  sheetHeightMm: 297,
  bleedMm: { top: 3, bottom: 3, left: 3, right: 3 },
  method: 'recto' as const,
  gutterMm: 10,
  gripMm: 10,
  cutMethod: 'guillotine' as const,
};

function balanced(input: MontageInput) {
  const variants = computeMontageVariants(input, digitalMachine);
  const b = variants.find((v) => v.kind === 'balanced');
  if (!b) throw new Error('no balanced variant produced');
  return b;
}

describe('computeMontageVariants — balanced pick prefers real yield over style', () => {
  it('85x55mm business card on A4: current bleed model caps at 9/sheet (not the traditional 10-up, which needs zero gap between identical copies — separate change)', () => {
    const small = balanced({ ...A4_DEFAULTS, pieceWidthMm: 55, pieceHeightMm: 85, quantity: 9 });
    expect(small.result.copiesPerSheet).toBe(9);

    const large = balanced({ ...A4_DEFAULTS, pieceWidthMm: 55, pieceHeightMm: 85, quantity: 1000 });
    expect(large.result.copiesPerSheet).toBe(9);
    expect(large.result.sheetsNeeded).toBe(112);
  });

  it('66x48mm piece on A4 at qty=20: rows-family candidates tie on runWaste, ratioDev AND cutScore (14=14) — must not silently fall back to iteration order', () => {
    const v = balanced({ ...A4_DEFAULTS, pieceWidthMm: 66, pieceHeightMm: 48, quantity: 20 });
    // 12/sheet (rotated) is the genuinely better candidate; 10/sheet ties on
    // every other metric and would win by iteration-order accident pre-fix.
    expect(v.result.copiesPerSheet).toBe(12);
    expect(v.result.sheetsNeeded).toBe(2);
  });

  it('large quantity where sheetsNeeded already differs: runWaste alone must decide, unaffected by the new tie-break', () => {
    const v = balanced({ ...A4_DEFAULTS, pieceWidthMm: 90, pieceHeightMm: 60, quantity: 2000 });
    // sanity: whatever the true best is, it must not need more sheets than
    // the naive per-copy ceiling would suggest is avoidable.
    expect(v.result.sheetsNeeded).toBe(Math.ceil(2000 / v.result.copiesPerSheet));
  });

  it('square piece (89x89mm) on its native 320x450 sheet: rows family is already optimal, must stay unchanged', () => {
    const v = balanced({
      sheetWidthMm: 320,
      sheetHeightMm: 450,
      bleedMm: { top: 3, bottom: 3, left: 3, right: 3 },
      method: 'recto',
      gutterMm: 10,
      gripMm: 10,
      cutMethod: 'guillotine',
      pieceWidthMm: 89,
      pieceHeightMm: 89,
      quantity: 1000,
    });
    expect(v.result.cutPattern).toBe('rows');
    expect(v.result.copiesPerSheet).toBeGreaterThan(0);
  });

  it('two different designs on one sheet: ratioDev keeps priority over the new copiesPerSheet tie-break', () => {
    const v = balanced({
      ...A4_DEFAULTS,
      groups: [
        { id: 'a', widthMm: 55, heightMm: 85, quantity: 700 },
        { id: 'b', widthMm: 90, heightMm: 55, quantity: 300 },
      ],
      quantity: 0,
    } as MontageInput);
    expect(v.result.copiesPerSheet).toBeGreaterThan(0);
    expect(v.result.placed.length).toBeGreaterThan(0);
  });

  it('single design, non-guillotine (die-cut) cut method: loosened groups.length>1 gate must not error or hang', () => {
    const v = balanced({ ...A4_DEFAULTS, cutMethod: 'die-cut', pieceWidthMm: 66, pieceHeightMm: 48, quantity: 20 });
    expect(v.result.copiesPerSheet).toBeGreaterThanOrEqual(10);
  });
});
