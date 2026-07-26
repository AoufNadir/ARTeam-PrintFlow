"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const storage_1 = require("./storage");
class MemoryStorage {
    constructor() {
        this.rows = new Map();
    }
    get length() {
        return this.rows.size;
    }
    clear() {
        this.rows.clear();
    }
    getItem(key) {
        return this.rows.get(key) ?? null;
    }
    setItem(key, value) {
        this.rows.set(key, value);
    }
    removeItem(key) {
        this.rows.delete(key);
    }
    key(index) {
        return [...this.rows.keys()][index] ?? null;
    }
}
function legacyDevis() {
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
(0, vitest_1.describe)('local devis repository migration', () => {
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.stubGlobal('localStorage', new MemoryStorage());
        storage_1.db.ensureSeeded();
    });
    (0, vitest_1.it)('normalizes legacy quotes without losing the commercial total', () => {
        const created = storage_1.db.devis.create(legacyDevis());
        (0, vitest_1.expect)(created.dataVersion).toBe(2);
        (0, vitest_1.expect)(created.revision).toBe(1);
        (0, vitest_1.expect)(created.items[0].order).toBe(0);
        (0, vitest_1.expect)(created.items[0].montageState).toBe('estimated');
        (0, vitest_1.expect)(created.internalNotes).toBe('internal only');
        (0, vitest_1.expect)(created.taxRate).toBe(0.19);
        (0, vitest_1.expect)(created.totals?.ttc).toBe(1190);
        (0, vitest_1.expect)(created.total).toBe(1190);
    });
    (0, vitest_1.it)('blocks sending when a line has stale montage or preflight errors', () => {
        const created = storage_1.db.devis.create({
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
        (0, vitest_1.expect)(storage_1.db.devis.transitionStatus(created.id, 'sent')).toBeUndefined();
        (0, vitest_1.expect)(storage_1.db.devis.get(created.id)?.status).toBe('draft');
    });
});
