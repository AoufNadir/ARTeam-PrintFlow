import { describe, expect, it } from 'vitest';
import { devisTotals } from '@/components/devis/devis-utils';
import {
  buildCustomProjectItem,
  emptyProductionStage,
  duplicateProductionStage,
  isBillableDevisItem,
  montageSignatureForStage,
  moveProductionStage,
  removeProductionStage,
  repriceCustomProject,
  repriceProductionStage,
  validateCustomProject,
} from './custom-project';
import type { CustomProjectSnapshot, MontageResult, PricingRule, ProductionStage } from './types';

const rules: PricingRule[] = [
  { id: 'rule-waste', name: 'waste', basis: 'percent', value: 5, appliesTo: 'global', kind: 'waste', enabled: true },
  { id: 'rule-overhead', name: 'overhead', basis: 'percent', value: 8, appliesTo: 'global', kind: 'overhead', enabled: true },
  { id: 'rule-margin', name: 'margin', basis: 'percent', value: 25, appliesTo: 'global', kind: 'margin', enabled: true },
];

function project(stages: ProductionStage[], completion: 'draft' | 'complete' = 'complete'): CustomProjectSnapshot {
  return {
    schemaVersion: 1,
    completion,
    name: 'Bloc-notes',
    sourceSectionId: 'sec-digital',
    sourceSectionName: 'Digital',
    printCategory: 'digital',
    finalQuantity: 100,
    stages,
    marginPercent: 25,
    totals: { stagesCost: 0, marginAmount: 0, marginPercent: 0, priceHt: 0, unitPriceHt: 0 },
  };
}

describe('custom project pricing', () => {
  it('sums stages, applies one project margin, and reconciles unit price', () => {
    const perUnit = {
      ...emptyProductionStage('s1', 0, 'assembly', 100, 'digital'),
      calculation: { mode: 'perUnit' as const, rate: 10 },
    };
    const fixed = {
      ...emptyProductionStage('s2', 1, 'finishing', 100, 'digital'),
      calculation: { mode: 'fixed' as const, rate: 500 },
    };
    const priced = repriceCustomProject(project([perUnit, fixed]), rules);

    expect(priced.totals.stagesCost).toBe(1500);
    expect(priced.totals.marginAmount).toBe(375);
    expect(priced.totals.unitPriceHt).toBe(18.75);
    expect(priced.totals.priceHt).toBe(priced.totals.unitPriceHt * priced.finalQuantity);
  });

  it('prices automatic printing from sheets without double-counting layout waste', () => {
    const montage: MontageResult = {
      placed: [],
      copiesPerSheet: 20,
      sheetsNeeded: 5,
      wastePercent: 31,
      printableArea: { x: 0, y: 0, w: 320, h: 450 },
      sheetWidthMm: 320,
      sheetHeightMm: 450,
      rotated: false,
      method: 'recto',
      facesPerSheet: 1,
      alternatives: [],
    };
    let stage: ProductionStage = {
      ...emptyProductionStage('print', 0, 'print', 100, 'digital'),
      paper: { id: 'p1', name: 'Paper', pricePerSheet: 10 },
      machine: { id: 'm1', name: 'Press', kind: 'digital', costPerFace: 2, margins: { top: 0, bottom: 0, left: 0, right: 0 } },
      sheetSize: { id: 'sheet', label: '32x45', widthMm: 320, heightMm: 450 },
      productSize: { widthMm: 50, heightMm: 90 },
      calculation: { mode: 'automatic', rate: 0 },
      montageResult: montage,
      montageState: 'confirmed',
    };
    stage = { ...stage, montageSignature: montageSignatureForStage(stage) };
    const priced = repriceProductionStage(stage, rules);

    expect(priced.pricing.paper).toBe(50);
    expect(priced.pricing.printing).toBe(10);
    expect(priced.pricing.waste).toBe(3);
    expect(priced.totalCost).toBe(68.04);
  });

  it('keeps incomplete projects out of billable totals and validates missing montage', () => {
    const stage = emptyProductionStage('print', 0, 'print', 100, 'digital');
    const draft = buildCustomProjectItem('item', 0, project([stage], 'draft'), rules);
    expect(draft.total).toBe(0);
    expect(isBillableDevisItem(draft)).toBe(false);
    expect(validateCustomProject(draft.customProject).some((error) => error.includes('المونتاج'))).toBe(true);
  });

  it('supports per-sheet pricing and reconciles rounded project unit totals', () => {
    const perSheet: ProductionStage = {
      ...emptyProductionStage('sheets', 0, 'cut', 3, 'digital'),
      calculation: { mode: 'perSheet', rate: 0.2, sheets: 5 },
    };
    const pricedStage = repriceProductionStage(perSheet, []);
    expect(pricedStage.totalCost).toBe(1);

    const pricedProject = repriceCustomProject({ ...project([pricedStage]), finalQuantity: 3, marginPercent: 0 }, []);
    expect(pricedProject.totals.unitPriceHt).toBe(0.33);
    expect(pricedProject.totals.priceHt).toBe(0.99);
    expect(pricedProject.totals.priceHt).toBe(pricedProject.totals.unitPriceHt * 3);
  });

  it('duplicates, moves, and removes stages while keeping contiguous order', () => {
    const first = emptyProductionStage('first', 0, 'cut', 10, 'digital');
    const second = emptyProductionStage('second', 1, 'finishing', 10, 'digital');
    const duplicated = duplicateProductionStage([first, second], 'first', 'copy');
    expect(duplicated.map((stage) => stage.id)).toEqual(['first', 'copy', 'second']);
    expect(duplicated.map((stage) => stage.order)).toEqual([0, 1, 2]);

    const moved = moveProductionStage(duplicated, 'second', -1);
    expect(moved.map((stage) => stage.id)).toEqual(['first', 'second', 'copy']);
    expect(removeProductionStage(moved, 'first').map((stage) => [stage.id, stage.order])).toEqual([['second', 0], ['copy', 1]]);
  });

  it('combines completed custom projects with normal services and excludes custom drafts', () => {
    const stage: ProductionStage = {
      ...emptyProductionStage('fixed', 0, 'other', 10, 'digital'),
      calculation: { mode: 'fixed', rate: 100 },
    };
    const complete = buildCustomProjectItem('complete', 1, project([stage]), []);
    const draft = buildCustomProjectItem('draft', 2, project([stage], 'draft'), []);
    const totals = devisTotals([{ total: 50, kind: 'service' }, complete, draft], { taxRate: 0 });

    expect(complete.total).toBe(125);
    expect(draft.total).toBe(0);
    expect(totals.ht).toBe(175);
  });
});
