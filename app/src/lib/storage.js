"use strict";
// ---------------------------------------------------------------------------
// Typed localStorage-backed repository.
//
// NOTE: this layer is intentionally shaped like an async-ready repository so
// it can be swapped with Supabase later (same method signatures; replace the
// bodies with supabase-js calls and make them async). Do NOT sprinkle
// localStorage access across pages — always go through `db`.
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.uid = uid;
exports.ensureSeeded = ensureSeeded;
exports.reconcileSections = reconcileSections;
exports.resetAndReseed = resetAndReseed;
exports.currentRulesVersion = currentRulesVersion;
exports.currentRules = currentRules;
exports.publishRules = publishRules;
exports.pricingSnapshot = pricingSnapshot;
const catalog_1 = require("./catalog");
const devis_utils_1 = require("@/components/devis/devis-utils");
const PREFIX = 'arteam-printflow:';
const SEEDED_KEY = `${PREFIX}seeded-v1`;
const DATA_VERSION = 3;
const SCHEMA_VERSION_KEY = `${PREFIX}schema-version`;
function key(kind) {
    return `${PREFIX}${kind}`;
}
function readAll(kind) {
    try {
        const raw = localStorage.getItem(key(kind));
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
function writeAll(kind, rows) {
    localStorage.setItem(key(kind), JSON.stringify(rows));
}
function uid(prefix = 'id') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
// ------------------------------- generic CRUD --------------------------------
function list(kind) {
    return readAll(kind);
}
function get(kind, id) {
    return readAll(kind).find((r) => r.id === id);
}
function create(kind, entity) {
    const rows = readAll(kind);
    rows.push(entity);
    writeAll(kind, rows);
    return entity;
}
function update(kind, id, patch) {
    const rows = readAll(kind);
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1)
        return undefined;
    rows[idx] = { ...rows[idx], ...patch };
    writeAll(kind, rows);
    return rows[idx];
}
function remove(kind, id) {
    const rows = readAll(kind);
    const next = rows.filter((r) => r.id !== id);
    if (next.length === rows.length)
        return false;
    writeAll(kind, next);
    return true;
}
// ------------------------------- seeding -------------------------------------
function seed() {
    writeAll('sections', catalog_1.SEED_SECTIONS);
    writeAll('services', catalog_1.SEED_SERVICES);
    writeAll('machines', catalog_1.SEED_MACHINES);
    writeAll('papers', catalog_1.SEED_PAPERS);
    writeAll('pricingRuleVersions', [catalog_1.SEED_RULES_VERSION]);
    writeAll('clients', []);
    writeAll('projects', []);
    writeAll('devis', []);
}
function ensureSeeded() {
    if (!localStorage.getItem(SEEDED_KEY)) {
        seed();
        localStorage.setItem(SEEDED_KEY, '1');
    }
    migrateStorage();
    reconcileSections();
}
/**
 * `Service.sectionId` is the single source of truth for section membership.
 * `Section.serviceIds` is a display-order cache only — this idempotent pass
 * re-syncs it (dropping ids whose service moved/left, appending new ones at
 * the end) so seeds or manual edits can never hide a service from its section.
 */
function reconcileSections() {
    const services = list('services');
    const sections = list('sections');
    let changed = false;
    const next = sections.map((sec) => {
        const owned = services.filter((s) => s.sectionId === sec.id).map((s) => s.id);
        const kept = sec.serviceIds.filter((id) => owned.includes(id));
        const missing = owned.filter((id) => !kept.includes(id));
        const serviceIds = [...kept, ...missing];
        if (serviceIds.length !== sec.serviceIds.length || serviceIds.some((id, i) => id !== sec.serviceIds[i])) {
            changed = true;
            return { ...sec, serviceIds };
        }
        return sec;
    });
    if (changed)
        writeAll('sections', next);
}
/** Wipe everything and reseed. DANGEROUS — gated behind a double-confirm UI in Settings › قاعدة البيانات. */
function resetAndReseed() {
    // also reset the persistent devis numbering counters
    const counterPrefix = `${PREFIX}devis-counter-`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith(counterPrefix))
            localStorage.removeItem(k);
    }
    seed();
    localStorage.setItem(SEEDED_KEY, '1');
    localStorage.setItem(SCHEMA_VERSION_KEY, String(DATA_VERSION));
}
// ------------------------------- migrations ----------------------------------
function migrateItem(item, index) {
    const montageState = item.montageState ?? (item.montageResult ? 'confirmed' : 'estimated');
    const preflight = item.preflight ?? [
        {
            key: 'montage',
            label: 'المونتاج',
            status: montageState === 'invalid' || montageState === 'stale' ? 'error' : montageState === 'estimated' ? 'warning' : 'ok',
            message: montageState === 'confirmed'
                ? undefined
                : montageState === 'estimated'
                    ? 'السعر تقديري لأن المونتاج غير مؤكد.'
                    : 'يحتاج المونتاج إلى مراجعة قبل الإرسال.',
        },
    ];
    return {
        ...item,
        order: item.order ?? index,
        attachments: item.attachments ?? [],
        montageState,
        preflight,
        quantityOptions: item.quantityOptions ?? [],
    };
}
function normalizeDevis(devis) {
    const items = devis.items.map(migrateItem).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const taxRate = Number.isFinite(devis.taxRate) ? devis.taxRate : devis_utils_1.DEFAULT_TVA_RATE;
    const totals = (0, devis_utils_1.devisTotals)(items, {
        discount: devis.discount,
        extraFees: devis.extraFees ?? [],
        taxRate,
        advance: devis.advance,
    });
    return {
        ...devis,
        dataVersion: DATA_VERSION,
        revision: devis.revision ?? 1,
        rootDevisId: devis.rootDevisId ?? devis.revisionOfId ?? devis.id,
        status: devis.status ?? 'draft',
        items,
        taxRate,
        extraFees: devis.extraFees ?? [],
        internalNotes: devis.internalNotes ?? devis.notes,
        commercialTerms: {
            language: 'ar',
            ...(devis.commercialTerms ?? {}),
        },
        productionStatus: devis.productionStatus ?? 'not-started',
        totals,
        total: totals.ttc,
    };
}
function migrateStorage() {
    const current = Number(localStorage.getItem(SCHEMA_VERSION_KEY));
    const rows = readAll('devis');
    const migrated = rows.map(normalizeDevis);
    const changed = current !== DATA_VERSION ||
        rows.length !== migrated.length ||
        rows.some((row, index) => JSON.stringify(row) !== JSON.stringify(migrated[index]));
    if (changed)
        writeAll('devis', migrated);
    if (current < 3)
        migrateFinishingRules();
    localStorage.setItem(SCHEMA_VERSION_KEY, String(DATA_VERSION));
}
/**
 * v3 — finishing costs moved out of field options into conditional rules.
 *
 * Installations seeded before this carry the per-copy pelliculage delta (which
 * billed a whole-sheet operation per piece) and no rule for arrondi / contour
 * cut / eyelets at all (silently free). Published rule versions are append-only
 * history, so this only touches the LIVE catalog and the current rule set —
 * existing Devis keep their frozen snapshot and their totals never move.
 */
function migrateFinishingRules() {
    const FINISHING_IDS = SEED_PRICING_RULES.filter((r) => r.requiresField).map((r) => r.id);
    const bySvc = {
        'svc-carte-visite': ['rule-pelliculage', 'rule-arrondi'],
        'svc-depliant': ['rule-pelliculage'],
        'svc-etiquettes': ['rule-contour-cut'],
        'svc-grand-format': ['rule-eyelets'],
    };
    // 1) add the new rules to the live version, drop the dead perM2 pelliculage
    const version = list('pricingRuleVersions').reduce((a, b) => (b.version > a.version ? b : a), list('pricingRuleVersions')[0] ?? catalog_1.SEED_RULES_VERSION);
    const have = new Set(version.rules.map((r) => r.id));
    const additions = SEED_PRICING_RULES.filter((r) => FINISHING_IDS.includes(r.id) && !have.has(r.id));
    if (additions.length > 0 || have.has('rule-pelliculage-m2')) {
        const rules = [...version.rules.filter((r) => r.id !== 'rule-pelliculage-m2'), ...additions];
        const versions = list('pricingRuleVersions').map((v) => (v.id === version.id ? { ...v, rules } : v));
        writeAll('pricingRuleVersions', versions);
    }
    // 2) attach them to their services and neutralise the per-copy pelliculage delta
    const services = list('services').map((svc) => {
        let next = svc;
        const wanted = (bySvc[svc.id] ?? []).filter((id) => !svc.pricingRuleIds.includes(id));
        if (wanted.length > 0) {
            next = { ...next, pricingRuleIds: [...next.pricingRuleIds, ...wanted] };
        }
        const pell = next.fields.find((f) => f.id === 'pelliculage');
        if (pell?.options?.some((o) => o.priceDelta !== 0)) {
            next = {
                ...next,
                fields: next.fields.map((f) => f.id === 'pelliculage'
                    ? { ...f, options: f.options?.map((o) => ({ ...o, priceDelta: 0 })) }
                    : f),
            };
        }
        return next;
    });
    writeAll('services', services);
}
function devisHasSendBlocker(devis) {
    return devis.items.some((item) => item.montageState === 'invalid' ||
        item.montageState === 'stale' ||
        item.preflight?.some((check) => check.status === 'error'));
}
// ------------------------------- pricing snapshots ---------------------------
/** Current (latest) pricing rules version. */
function currentRulesVersion() {
    ensureSeeded();
    const versions = list('pricingRuleVersions');
    return versions.reduce((a, b) => (b.version > a.version ? b : a), versions[0] ?? catalog_1.SEED_RULES_VERSION);
}
/** Current active rules (latest version). */
function currentRules() {
    return currentRulesVersion().rules;
}
/**
 * Publish a new rules version from an edited rule set.
 * Returns the new version number.
 */
function publishRules(rules, note) {
    const next = currentRulesVersion().version + 1;
    create('pricingRuleVersions', {
        id: uid('rules'),
        version: next,
        createdAt: new Date().toISOString(),
        note,
        rules: structuredClone(rules),
    });
    return next;
}
/**
 * Freeze the current pricing inputs into a Devis. Deep-copies the active rules,
 * paper prices and machine costs so the quote NEVER changes when any of them is
 * edited later ("ثبات الماضي"), and stamps the frozen version badge `قواعد v{n}`.
 */
function pricingSnapshot(devis) {
    const v = currentRulesVersion();
    return normalizeDevis({
        ...devis,
        rulesVersion: v.version,
        rulesSnapshot: structuredClone(v.rules),
        papersSnapshot: structuredClone(list('papers')),
        machinesSnapshot: structuredClone(list('machines')),
    });
}
// ------------------------------- public repo ---------------------------------
exports.db = {
    ensureSeeded,
    resetAndReseed,
    reconcileSections,
    currentRules,
    currentRulesVersion,
    publishRules,
    pricingSnapshot,
    sections: {
        list: () => list('sections'),
        get: (id) => get('sections', id),
        create: (e) => create('sections', e),
        update: (id, p) => update('sections', id, p),
        remove: (id) => remove('sections', id),
    },
    services: {
        list: () => list('services'),
        get: (id) => get('services', id),
        bySection: (sectionId) => list('services').filter((s) => s.sectionId === sectionId),
        create: (e) => create('services', e),
        update: (id, p) => update('services', id, p),
        remove: (id) => remove('services', id),
    },
    clients: {
        list: () => list('clients'),
        get: (id) => get('clients', id),
        create: (e) => create('clients', e),
        update: (id, p) => update('clients', id, p),
        remove: (id) => remove('clients', id),
    },
    projects: {
        list: () => list('projects'),
        get: (id) => get('projects', id),
        byClient: (clientId) => list('projects').filter((p) => p.clientId === clientId),
        create: (e) => create('projects', e),
        update: (id, p) => update('projects', id, p),
        remove: (id) => remove('projects', id),
    },
    devis: {
        list: () => list('devis').map(normalizeDevis),
        get: (id) => {
            const found = get('devis', id);
            return found ? normalizeDevis(found) : undefined;
        },
        create: (e) => create('devis', normalizeDevis(e)),
        update: (id, p) => {
            const updated = update('devis', id, p);
            if (!updated)
                return undefined;
            const normalized = normalizeDevis(updated);
            update('devis', id, normalized);
            return normalized;
        },
        remove: (id) => remove('devis', id),
        saveDraft: (draft) => {
            const now = new Date().toISOString();
            const normalized = normalizeDevis({ ...draft, status: 'draft', updatedAt: now });
            const existing = get('devis', normalized.id);
            if (!existing)
                return create('devis', normalized);
            update('devis', normalized.id, normalized);
            return normalizeDevis(get('devis', normalized.id));
        },
        transitionStatus: (id, status, meta = {}) => {
            const src = get('devis', id);
            if (!src)
                return undefined;
            const devis = normalizeDevis(src);
            if (status === 'sent' && devisHasSendBlocker(devis))
                return undefined;
            const now = new Date().toISOString();
            const patch = { status, updatedAt: now };
            if (status === 'sent') {
                patch.sentAt = devis.sentAt ?? now;
                patch.sentVia = meta.sentVia ?? devis.sentVia ?? 'manual';
                patch.lockedAt = devis.lockedAt ?? now;
            }
            if (status === 'accepted')
                patch.acceptedAt = devis.acceptedAt ?? now;
            if (status === 'rejected')
                patch.rejectedAt = devis.rejectedAt ?? now;
            if (status === 'expired')
                patch.expiredAt = devis.expiredAt ?? now;
            if (status === 'production') {
                patch.productionStatus = 'work-order-created';
                patch.productionWorkOrderId = devis.productionWorkOrderId ?? uid('wo');
            }
            return exports.db.devis.update(id, patch);
        },
        createRevision: (id) => {
            const src = exports.db.devis.get(id);
            if (!src)
                return undefined;
            const now = new Date().toISOString();
            const rootId = src.rootDevisId ?? src.id;
            const baseNumber = src.number.replace(/-R\d+$/i, '');
            const nextRevision = exports.db.devis
                .list()
                .filter((candidate) => (candidate.rootDevisId ?? candidate.id) === rootId)
                .reduce((max, candidate) => Math.max(max, candidate.revision ?? 1), 1) + 1;
            const revision = normalizeDevis({
                ...structuredClone(src),
                id: uid('devis'),
                number: `${baseNumber}-R${nextRevision}`,
                revision: nextRevision,
                revisionOfId: src.id,
                rootDevisId: rootId,
                status: 'draft',
                sentAt: undefined,
                sentVia: undefined,
                acceptedAt: undefined,
                rejectedAt: undefined,
                expiredAt: undefined,
                lockedAt: undefined,
                productionStatus: 'not-started',
                productionWorkOrderId: undefined,
                items: src.items.map((item, index) => ({ ...structuredClone(item), id: uid('item'), order: index })),
                createdAt: now,
                updatedAt: now,
            });
            return create('devis', revision);
        },
        convertToProduction: (id) => exports.db.devis.transitionStatus(id, 'production'),
        /**
         * Duplicate a quote (deep copy) with a fresh id, a NEW persistent number
         * and fresh timestamps; resets the copy to 'draft'. Optional fields
         * (title, deliveryDate, validUntil, notes, overrideReason) and the frozen
         * snapshots are carried over.
         */
        duplicate: (id) => {
            const src = get('devis', id);
            if (!src)
                return undefined;
            const now = new Date().toISOString();
            const copy = {
                ...structuredClone(src),
                id: uid('devis'),
                number: exports.db.devis.nextNumber(),
                revision: 1,
                revisionOfId: undefined,
                rootDevisId: undefined,
                status: 'draft',
                sentAt: undefined,
                sentVia: undefined,
                acceptedAt: undefined,
                rejectedAt: undefined,
                expiredAt: undefined,
                lockedAt: undefined,
                productionStatus: 'not-started',
                productionWorkOrderId: undefined,
                items: src.items.map((item, index) => ({ ...structuredClone(item), id: uid('item'), order: index })),
                createdAt: now,
                updatedAt: now,
            };
            return create('devis', normalizeDevis(copy));
        },
        /**
         * Next quote number from a PERSISTENT per-year counter
         * (`devis-counter-<year>`) — deleting quotes never causes number reuse.
         * On first use the counter is initialized from the highest existing number
         * of the year so installs with pre-existing data don't collide.
         */
        nextNumber: () => {
            const year = new Date().getFullYear();
            const counterKey = `${PREFIX}devis-counter-${year}`;
            let current = Number(localStorage.getItem(counterKey));
            if (!Number.isFinite(current) || current <= 0) {
                current = list('devis').reduce((max, d) => {
                    const m = new RegExp(`^D-${year}-(\\d+)$`).exec(d.number);
                    return m ? Math.max(max, Number(m[1])) : max;
                }, 0);
            }
            const next = current + 1;
            localStorage.setItem(counterKey, String(next));
            return `D-${year}-${String(next).padStart(4, '0')}`;
        },
    },
    pricingRuleVersions: {
        list: () => list('pricingRuleVersions'),
        get: (id) => get('pricingRuleVersions', id),
    },
    machines: {
        list: () => list('machines'),
        get: (id) => get('machines', id),
        create: (e) => create('machines', e),
        update: (id, p) => update('machines', id, p),
        remove: (id) => remove('machines', id),
    },
    papers: {
        list: () => list('papers'),
        get: (id) => get('papers', id),
        create: (e) => create('papers', e),
        update: (id, p) => update('papers', id, p),
        remove: (id) => remove('papers', id),
    },
};
// seed immediately on import in the browser
if (typeof window !== 'undefined') {
    ensureSeeded();
}
