// ---------------------------------------------------------------------------
// Typed localStorage-backed repository.
//
// NOTE: this layer is intentionally shaped like an async-ready repository so
// it can be swapped with Supabase later (same method signatures; replace the
// bodies with supabase-js calls and make them async). Do NOT sprinkle
// localStorage access across pages — always go through `db`.
// ---------------------------------------------------------------------------

import {
  SEED_MACHINES,
  SEED_PAPERS,
  SEED_RULES_VERSION,
  SEED_SECTIONS,
  SEED_SERVICES,
} from './catalog';
import type {
  Client,
  Devis,
  DevisItem,
  DevisStatus,
  Machine,
  PaperType,
  PricingRule,
  PricingRulesVersion,
  Project,
  Section,
  Service,
} from './types';
import { customProjectPreflight, isCustomProjectItem } from './custom-project';
import { DEFAULT_TVA_RATE, devisTotals } from '@/components/devis/devis-utils';

const PREFIX = 'arteam-printflow:';
const SEEDED_KEY = `${PREFIX}seeded-v1`;
const DATA_VERSION = 4;
const SCHEMA_VERSION_KEY = `${PREFIX}schema-version`;

type EntityMap = {
  sections: Section;
  services: Service;
  clients: Client;
  projects: Project;
  devis: Devis;
  pricingRuleVersions: PricingRulesVersion;
  machines: Machine;
  papers: PaperType;
};

export type EntityKind = keyof EntityMap;

function key(kind: EntityKind) {
  return `${PREFIX}${kind}`;
}

function readAll<T>(kind: EntityKind): T[] {
  try {
    const raw = localStorage.getItem(key(kind));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeAll<T>(kind: EntityKind, rows: T[]): void {
  localStorage.setItem(key(kind), JSON.stringify(rows));
}

export function uid(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ------------------------------- generic CRUD --------------------------------

function list<K extends EntityKind>(kind: K): EntityMap[K][] {
  return readAll<EntityMap[K]>(kind);
}

function get<K extends EntityKind>(kind: K, id: string): EntityMap[K] | undefined {
  return readAll<EntityMap[K]>(kind).find((r) => (r as { id: string }).id === id);
}

function create<K extends EntityKind>(kind: K, entity: EntityMap[K]): EntityMap[K] {
  const rows = readAll<EntityMap[K]>(kind);
  rows.push(entity);
  writeAll(kind, rows);
  return entity;
}

function update<K extends EntityKind>(kind: K, id: string, patch: Partial<EntityMap[K]>): EntityMap[K] | undefined {
  const rows = readAll<EntityMap[K]>(kind);
  const idx = rows.findIndex((r) => (r as { id: string }).id === id);
  if (idx === -1) return undefined;
  rows[idx] = { ...rows[idx], ...patch };
  writeAll(kind, rows);
  return rows[idx];
}

function remove(kind: EntityKind, id: string): boolean {
  const rows = readAll<unknown>(kind);
  const next = rows.filter((r) => (r as { id: string }).id !== id);
  if (next.length === rows.length) return false;
  writeAll(kind, next);
  return true;
}

// ------------------------------- seeding -------------------------------------

function seed(): void {
  writeAll('sections', SEED_SECTIONS);
  writeAll('services', SEED_SERVICES);
  writeAll('machines', SEED_MACHINES);
  writeAll('papers', SEED_PAPERS);
  writeAll('pricingRuleVersions', [SEED_RULES_VERSION]);
  writeAll('clients', []);
  writeAll('projects', []);
  writeAll('devis', []);
}

export function ensureSeeded(): void {
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
export function reconcileSections(): void {
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
  if (changed) writeAll('sections', next);
}

/** Wipe everything and reseed. DANGEROUS — gated behind a double-confirm UI in Settings › قاعدة البيانات. */
export function resetAndReseed(): void {
  // also reset the persistent devis numbering counters
  const counterPrefix = `${PREFIX}devis-counter-`;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith(counterPrefix)) localStorage.removeItem(k);
  }
  seed();
  localStorage.setItem(SEEDED_KEY, '1');
  localStorage.setItem(SCHEMA_VERSION_KEY, String(DATA_VERSION));
}

export function exportLocalSnapshot() {
  ensureSeeded();
  return {
    sections: list('sections'),
    services: list('services'),
    clients: list('clients'),
    projects: list('projects'),
    devis: list('devis').map(normalizeDevis),
    pricingRuleVersions: list('pricingRuleVersions'),
    machines: list('machines'),
    papers: list('papers'),
  };
}

// ------------------------------- migrations ----------------------------------

function migrateItem(item: DevisItem, index: number): DevisItem {
  if (isCustomProjectItem(item)) {
    const stages = (item.customProject.stages ?? [])
      .map((stage, stageIndex) => ({ ...stage, order: stageIndex }))
      .sort((a, b) => a.order - b.order);
    const customProject = {
      ...item.customProject,
      schemaVersion: 1 as const,
      completion: item.customProject.completion ?? 'draft',
      stages,
    };
    const complete = customProject.completion === 'complete';
    return {
      ...item,
      kind: 'custom-project',
      order: item.order ?? index,
      customProject,
      preflight: customProjectPreflight(customProject),
      unitPrice: complete ? item.unitPrice : 0,
      total: complete ? item.total : 0,
    };
  }

  const hasMontageData = Boolean(item.montageResult || item.montageState);
  const montageState = item.montageState ?? (item.montageResult ? 'confirmed' : undefined);
  const preflight = item.preflight ?? (hasMontageData && montageState
    ? [{
        key: 'montage',
        label: 'المونتاج',
        status: montageState === 'invalid' || montageState === 'stale' ? 'error' : montageState === 'estimated' ? 'warning' : 'ok',
        message: montageState === 'confirmed' ? undefined : montageState === 'estimated' ? 'السعر تقديري لأن المونتاج غير مؤكد.' : 'يحتاج المونتاج إلى مراجعة قبل الإرسال.',
      }]
    : []);
  return {
    ...item,
    kind: 'service',
    order: item.order ?? index,
    attachments: item.attachments ?? [],
    montageState,
    preflight,
    quantityOptions: item.quantityOptions ?? [],
  };
}

function normalizeDevis(devis: Devis): Devis {
  const items = devis.items.map(migrateItem).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const taxRate = Number.isFinite(devis.taxRate) ? devis.taxRate : DEFAULT_TVA_RATE;
  const totals = devisTotals(items, {
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

function migrateStorage(): void {
  const current = Number(localStorage.getItem(SCHEMA_VERSION_KEY));
  const sections = readAll<Section>('sections');
  const migratedSections = sections.map((section) => {
    if (section.printCategory) return section;
    const key = `${section.id} ${section.name} ${section.latinName ?? ''}`.toLowerCase();
    const printCategory = key.includes('offset') || key.includes('أوفست')
      ? 'offset'
      : key.includes('digital') || key.includes('numérique') || key.includes('رقمي')
        ? 'digital'
        : 'other';
    return { ...section, printCategory } as Section;
  });
  const services = readAll<Service>('services');
  const migratedServices = services.map((service) => ({
    ...service,
    montageMode: service.montageMode ?? 'disabled',
    designInputMode: service.designInputMode ?? (service.id === 'svc-carte-visite' ? 'fixed-template' : 'standard'),
  }));
  const rows = readAll<Devis>('devis');
  const migrated = rows.map(normalizeDevis);
  const changed =
    current !== DATA_VERSION ||
    rows.length !== migrated.length ||
    rows.some((row, index) => JSON.stringify(row) !== JSON.stringify(migrated[index]));
  if (sections.some((row, index) => JSON.stringify(row) !== JSON.stringify(migratedSections[index]))) {
    writeAll('sections', migratedSections);
  }
  if (services.some((row, index) => JSON.stringify(row) !== JSON.stringify(migratedServices[index]))) {
    writeAll('services', migratedServices);
  }
  if (changed) writeAll('devis', migrated);
  localStorage.setItem(SCHEMA_VERSION_KEY, String(DATA_VERSION));
}

function devisHasSendBlocker(devis: Devis): boolean {
  return devis.items.some(
    (item) => {
      if (isCustomProjectItem(item)) {
        return item.customProject.completion !== 'complete' || item.preflight?.some((check) => check.status === 'error');
      }
      return item.montageState === 'invalid' || item.montageState === 'stale' || item.preflight?.some((check) => check.status === 'error');
    },
  );
}

// ------------------------------- pricing snapshots ---------------------------

/** Current (latest) pricing rules version. */
export function currentRulesVersion(): PricingRulesVersion {
  ensureSeeded();
  const versions = list('pricingRuleVersions');
  return versions.reduce((a, b) => (b.version > a.version ? b : a), versions[0] ?? SEED_RULES_VERSION);
}

/** Current active rules (latest version). */
export function currentRules(): PricingRule[] {
  return currentRulesVersion().rules;
}

/**
 * Publish a new rules version from an edited rule set.
 * Returns the new version number.
 */
export function publishRules(rules: PricingRule[], note?: string): number {
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
export function pricingSnapshot(devis: Omit<Devis, 'rulesVersion' | 'rulesSnapshot'>): Devis {
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

export const db = {
  ensureSeeded,
  resetAndReseed,
  reconcileSections,
  currentRules,
  currentRulesVersion,
  publishRules,
  pricingSnapshot,
  sections: {
    list: () => list('sections'),
    get: (id: string) => get('sections', id),
    create: (e: Section) => create('sections', e),
    update: (id: string, p: Partial<Section>) => update('sections', id, p),
    remove: (id: string) => remove('sections', id),
  },
  services: {
    list: () => list('services'),
    get: (id: string) => get('services', id),
    bySection: (sectionId: string) => list('services').filter((s) => s.sectionId === sectionId),
    create: (e: Service) => create('services', e),
    update: (id: string, p: Partial<Service>) => update('services', id, p),
    remove: (id: string) => remove('services', id),
  },
  clients: {
    list: () => list('clients'),
    get: (id: string) => get('clients', id),
    create: (e: Client) => create('clients', e),
    update: (id: string, p: Partial<Client>) => update('clients', id, p),
    remove: (id: string) => remove('clients', id),
  },
  projects: {
    list: () => list('projects'),
    get: (id: string) => get('projects', id),
    byClient: (clientId: string) => list('projects').filter((p) => p.clientId === clientId),
    create: (e: Project) => create('projects', e),
    update: (id: string, p: Partial<Project>) => update('projects', id, p),
    remove: (id: string) => remove('projects', id),
  },
  devis: {
    list: () => list('devis').map(normalizeDevis),
    get: (id: string) => {
      const found = get('devis', id);
      return found ? normalizeDevis(found) : undefined;
    },
    create: (e: Devis) => create('devis', normalizeDevis(e)),
    update: (id: string, p: Partial<Devis>) => {
      const updated = update('devis', id, p);
      if (!updated) return undefined;
      const normalized = normalizeDevis(updated);
      update('devis', id, normalized);
      return normalized;
    },
    remove: (id: string) => remove('devis', id),
    saveDraft: (draft: Devis): Devis => {
      const now = new Date().toISOString();
      const normalized = normalizeDevis({ ...draft, status: 'draft', updatedAt: now });
      const existing = get('devis', normalized.id);
      if (!existing) return create('devis', normalized);
      update('devis', normalized.id, normalized);
      return normalizeDevis(get('devis', normalized.id)!);
    },
    transitionStatus: (
      id: string,
      status: DevisStatus,
      meta: { sentVia?: Devis['sentVia'] } = {},
    ): Devis | undefined => {
      const src = get('devis', id);
      if (!src) return undefined;
      const devis = normalizeDevis(src);
      if ((status === 'ready' || status === 'sent') && devisHasSendBlocker(devis)) return undefined;
      const now = new Date().toISOString();
      const patch: Partial<Devis> = { status, updatedAt: now };
      if (status === 'sent') {
        patch.sentAt = devis.sentAt ?? now;
        patch.sentVia = meta.sentVia ?? devis.sentVia ?? 'manual';
        patch.lockedAt = devis.lockedAt ?? now;
      }
      if (status === 'accepted') patch.acceptedAt = devis.acceptedAt ?? now;
      if (status === 'rejected') patch.rejectedAt = devis.rejectedAt ?? now;
      if (status === 'expired') patch.expiredAt = devis.expiredAt ?? now;
      if (status === 'production') {
        patch.productionStatus = 'work-order-created';
        patch.productionWorkOrderId = devis.productionWorkOrderId ?? uid('wo');
      }
      return db.devis.update(id, patch);
    },
    createRevision: (id: string): Devis | undefined => {
      const src = db.devis.get(id);
      if (!src) return undefined;
      const now = new Date().toISOString();
      const rootId = src.rootDevisId ?? src.id;
      const baseNumber = src.number.replace(/-R\d+$/i, '');
      const nextRevision =
        db.devis
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
    convertToProduction: (id: string): Devis | undefined => db.devis.transitionStatus(id, 'production'),
    /**
     * Duplicate a quote (deep copy) with a fresh id, a NEW persistent number
     * and fresh timestamps; resets the copy to 'draft'. Optional fields
     * (title, deliveryDate, validUntil, notes, overrideReason) and the frozen
     * snapshots are carried over.
     */
    duplicate: (id: string): Devis | undefined => {
      const src = get('devis', id);
      if (!src) return undefined;
      const now = new Date().toISOString();
      const copy: Devis = {
        ...structuredClone(src),
        id: uid('devis'),
        number: db.devis.nextNumber(),
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
    get: (id: string) => get('pricingRuleVersions', id),
  },
  machines: {
    list: () => list('machines'),
    get: (id: string) => get('machines', id),
    create: (e: Machine) => create('machines', e),
    update: (id: string, p: Partial<Machine>) => update('machines', id, p),
    remove: (id: string) => remove('machines', id),
  },
  papers: {
    list: () => list('papers'),
    get: (id: string) => get('papers', id),
    create: (e: PaperType) => create('papers', e),
    update: (id: string, p: Partial<PaperType>) => update('papers', id, p),
    remove: (id: string) => remove('papers', id),
  },
};

// seed immediately on import in the browser
if (typeof window !== 'undefined') {
  ensureSeeded();
}
