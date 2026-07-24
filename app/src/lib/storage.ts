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
  Machine,
  PaperType,
  PricingRule,
  PricingRulesVersion,
  Project,
  Section,
  Service,
} from './types';

const PREFIX = 'arteam-printflow:';
const SEEDED_KEY = `${PREFIX}seeded-v1`;

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
  return {
    ...devis,
    rulesVersion: v.version,
    rulesSnapshot: structuredClone(v.rules),
    papersSnapshot: structuredClone(list('papers')),
    machinesSnapshot: structuredClone(list('machines')),
  };
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
    list: () => list('devis'),
    get: (id: string) => get('devis', id),
    create: (e: Devis) => create('devis', e),
    update: (id: string, p: Partial<Devis>) => update('devis', id, p),
    remove: (id: string) => remove('devis', id),
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
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      };
      return create('devis', copy);
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
