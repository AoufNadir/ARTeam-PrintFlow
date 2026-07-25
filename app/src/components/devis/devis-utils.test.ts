import { describe, expect, it } from 'vitest';
import { devisTotals } from './devis-utils';

describe('devisTotals', () => {
  it('uses the fixed HT -> discount -> fees -> TVA -> advance order', () => {
    const totals = devisTotals(
      [
        { total: 1000, discount: { mode: 'percent', value: 10 } },
        { total: 500 },
      ],
      {
        discount: { mode: 'amount', value: 50 },
        extraFees: [{ amount: 25 }],
        taxRate: 0.19,
        advance: { mode: 'percent', value: 50 },
      },
    );

    expect(totals.itemsHt).toBe(1400);
    expect(totals.quoteDiscount).toBe(50);
    expect(totals.extraFees).toBe(25);
    expect(totals.ht).toBe(1375);
    expect(totals.tva).toBe(261.25);
    expect(totals.ttc).toBe(1636.25);
    expect(totals.advance).toBe(818.13);
    expect(totals.balanceDue).toBe(818.12);
  });

  it('caps percentage discounts and amount advances to valid totals', () => {
    const totals = devisTotals(
      [{ total: 1000 }],
      {
        discount: { mode: 'percent', value: 150 },
        taxRate: 0.19,
        advance: { mode: 'amount', value: 99999 },
      },
    );

    expect(totals.ht).toBe(0);
    expect(totals.ttc).toBe(0);
    expect(totals.advance).toBe(0);
    expect(totals.balanceDue).toBe(0);
  });
});
