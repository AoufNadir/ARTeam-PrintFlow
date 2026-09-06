import { describe, expect, it } from 'vitest';
import { firstQuantityFieldId, priceItem, readServiceQuantity } from './pricing-engine';
import type { PricingRule, Service } from './types';

const perCopyRule: PricingRule = {
  id: 'rule-copy',
  name: 'copy',
  basis: 'perCopy',
  value: 2,
  appliesTo: 'printing',
  enabled: true,
};

describe('service quantity detection', () => {
  it('uses builder-created Quantité fields in pricing, even when their id is generated', () => {
    const service: Service = {
      id: 'svc-card',
      sectionId: 'sec-digital',
      name: 'بطاقة زيارة',
      latinName: 'Carte Visite',
      fields: [
        {
          id: 'field-generated-quantity',
          label: 'Quantité',
          latinName: 'Quantité',
          type: 'number',
          required: true,
        },
      ],
      pricingRuleIds: ['rule-copy'],
      montageMode: 'disabled',
      designInputMode: 'fixed-template',
      defaultPieceSize: { widthMm: 85, heightMm: 55 },
    };

    expect(firstQuantityFieldId(service)).toBe('field-generated-quantity');
    expect(readServiceQuantity(service, { 'field-generated-quantity': 100 })).toBe(100);

    const priced = priceItem(service, { 'field-generated-quantity': 100 }, [perCopyRule]);
    expect(priced.unitPrice).toBe(2);
    expect(priced.total).toBe(200);
  });

  it('prices a dimensions field by square meter when enabled on the service', () => {
    const service: Service = {
      id: 'svc-area',
      sectionId: 'sec-grand-format',
      name: 'لافتة',
      fields: [
        { id: 'quantity', label: 'الكمية', type: 'number', required: true },
        { id: 'format', label: 'الأبعاد', type: 'dimensions', required: true },
      ],
      pricingRuleIds: [],
      dimensionPricing: { fieldId: 'format', mode: 'perM2', value: 650 },
    };

    const priced = priceItem(
      service,
      { quantity: 2, format: { widthMm: 2000, heightMm: 1000 } },
      [],
    );

    expect(priced.unitPrice).toBe(1300);
    expect(priced.total).toBe(2600);
  });

  it('prices a dimensions field by square centimeter when enabled on the service', () => {
    const service: Service = {
      id: 'svc-cm2',
      sectionId: 'sec-other',
      name: 'قص صغير',
      fields: [
        { id: 'quantity', label: 'الكمية', type: 'number', required: true },
        { id: 'format', label: 'الأبعاد', type: 'dimensions', required: true },
      ],
      pricingRuleIds: [],
      dimensionPricing: { fieldId: 'format', mode: 'perCm2', value: 0.5 },
    };

    const priced = priceItem(
      service,
      { quantity: 3, format: { widthMm: 100, heightMm: 100 } },
      [],
    );

    expect(priced.unitPrice).toBe(50);
    expect(priced.total).toBe(150);
  });

  it('prices option deltas by square centimeter without changing old perCopy data', () => {
    const service: Service = {
      id: 'svc-sticker',
      sectionId: 'sec-other',
      name: 'ملصق',
      fields: [
        { id: 'quantity', label: 'الكمية', type: 'number', required: true },
        { id: 'format', label: 'الأبعاد', type: 'dimensions', required: true },
        {
          id: 'finition',
          label: 'تشطيب',
          type: 'select',
          options: [
            { id: 'none', label: 'بدون', priceDelta: 0, deltaUnit: 'perCopy' },
            { id: 'uv', label: 'UV', priceDelta: 0.2, deltaUnit: 'perCm2' },
          ],
        },
      ],
      pricingRuleIds: [],
    };

    const priced = priceItem(
      service,
      { quantity: 10, format: { widthMm: 100, heightMm: 100 }, finition: 'uv' },
      [],
    );

    expect(priced.unitPrice).toBe(20);
    expect(priced.total).toBe(200);
  });

  it('ignores stale dimension pricing after its dimensions field is removed', () => {
    const service: Service = {
      id: 'svc-card-with-old-area-rule',
      sectionId: 'sec-digital',
      name: 'بطاقة زيارة',
      fields: [
        { id: 'quantity', label: 'الكمية', type: 'number', required: true },
      ],
      pricingRuleIds: ['rule-copy'],
      dimensionPricing: { fieldId: 'format', mode: 'perCm2', value: 18 },
      defaultPieceSize: { widthMm: 85, heightMm: 55 },
    };

    const priced = priceItem(service, { quantity: 100 }, [perCopyRule]);

    expect(priced.unitPrice).toBe(2);
    expect(priced.total).toBe(200);
  });
});
