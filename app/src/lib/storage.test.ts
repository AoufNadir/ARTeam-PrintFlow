import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './storage';
import type { Devis } from './types';

class MemoryStorage {
  private rows = new Map<string, string>();

  get length() {
    return this.rows.size;
  }

  clear() {
    this.rows.clear();
  }

  getItem(key: string) {
    return this.rows.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.rows.set(key, value);
  }

  removeItem(key: string) {
    this.rows.delete(key);
  }

  key(index: number) {
    return [...this.rows.keys()][index] ?? null;
  }
}

function legacyDevis(): Devis {
  return {
    id: 'devis-legacy',
    number: 'D-2026-0001',
    clientId: 'client-1',
    status: 'draft',
    items: [
      {
        id: 'item-1',
        serviceId: 'svc-1',
        serviceName: 'Carte Visite',
        quantity: 100,
        fieldValues: { quantity: 100 },
        pricing: {
          paper: 0,
          printing: 0,
          cutting: 0,
          finishing: 0,
          waste: 0,
          overhead: 0,
          margin: 200,
          subtotal: 800,
          unitPrice: 10,
          total: 1000,
        },
        unitPrice: 10,
        total: 1000,
      },
    ],
    total: 1190,
    notes: 'internal only',
    rulesVersion: 1,
    rulesSnapshot: [],
    createdAt: '2026-07-25T10:00:00.000Z',
    updatedAt: '2026-07-25T10:00:00.000Z',
  };
}

describe('local devis repository migration', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    db.ensureSeeded();
  });

  it('normalizes legacy quotes without losing the commercial total', () => {
    const created = db.devis.create(legacyDevis());

    expect(created.dataVersion).toBe(2);
    expect(created.revision).toBe(1);
    expect(created.items[0].order).toBe(0);
    expect(created.items[0].montageState).toBe('estimated');
    expect(created.internalNotes).toBe('internal only');
    expect(created.taxRate).toBe(0.19);
    expect(created.totals?.ttc).toBe(1190);
    expect(created.total).toBe(1190);
  });

  it('blocks sending when a line has stale montage or preflight errors', () => {
    const created = db.devis.create({
      ...legacyDevis(),
      id: 'devis-stale',
      items: [
        {
          ...legacyDevis().items[0],
          montageState: 'stale',
          preflight: [{ key: 'montage', label: 'المونتاج', status: 'error' }],
        },
      ],
    });

    expect(db.devis.transitionStatus(created.id, 'sent')).toBeUndefined();
    expect(db.devis.get(created.id)?.status).toBe('draft');
  });
});
