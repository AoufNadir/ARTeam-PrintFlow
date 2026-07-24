// Builder-only UI metadata that doesn't belong to the shared domain schema
// (enable/disable flags, section icons, section ordering, service basis,
// conditional stages). Domain CRUD (sections/services) goes through `db`.
import { useCallback, useState } from 'react';

export interface BuilderMeta {
  disabledSections: string[];
  disabledServices: string[];
  sectionOrder: string[];
  sectionIcons: Record<string, string>;
  serviceBasis: Record<string, 'perCopy' | 'perM2' | 'fixed'>;
  conditionalStages: Record<string, string[]>;
}

const KEY = 'arteam-printflow:builder-meta';

const DEFAULT_META: BuilderMeta = {
  disabledSections: [],
  disabledServices: [],
  sectionOrder: [],
  sectionIcons: {
    'sec-digital': 'printer',
    'sec-offset': 'layers',
    'sec-grand-format': 'flag',
  },
  serviceBasis: {},
  conditionalStages: {},
};

export function loadMeta(): BuilderMeta {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_META;
    return { ...DEFAULT_META, ...(JSON.parse(raw) as Partial<BuilderMeta>) };
  } catch {
    return DEFAULT_META;
  }
}

export function saveMeta(meta: BuilderMeta): void {
  localStorage.setItem(KEY, JSON.stringify(meta));
}

export function useBuilderMeta(): [BuilderMeta, (patch: Partial<BuilderMeta>) => void] {
  const [meta, setMeta] = useState<BuilderMeta>(loadMeta);
  const update = useCallback((patch: Partial<BuilderMeta>) => {
    setMeta((prev) => {
      const next = { ...prev, ...patch };
      saveMeta(next);
      return next;
    });
  }, []);
  return [meta, update];
}

export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

// --------------------- public enable/disable queries -------------------------
// These read builder-meta directly from storage, so ANY page (DevisCreate,
// Quotes, …) can respect the builder's enable/disable switches without the hook.

/** Is this section hidden from quote creation? (importable anywhere) */
export function isSectionDisabled(sectionId: string): boolean {
  return loadMeta().disabledSections.includes(sectionId);
}

/** Is this service disabled/archived in the builder? (importable anywhere) */
export function isServiceDisabled(serviceId: string): boolean {
  return loadMeta().disabledServices.includes(serviceId);
}

/** All disabled service ids (e.g. to filter a service picker). */
export function listDisabledServices(): string[] {
  return loadMeta().disabledServices;
}

/** All disabled section ids (e.g. to filter a section picker). */
export function listDisabledSections(): string[] {
  return loadMeta().disabledSections;
}

// ------------------------------- stages --------------------------------------

export interface StageDef {
  id: string;
  label: string;
  latin?: string;
}

export const STAGE_DEFS: StageDef[] = [
  { id: 'impression', label: 'مرحلة الطباعة', latin: 'Impression' },
  { id: 'pliage', label: 'مرحلة الطي', latin: 'Pliage' },
  { id: 'pelliculage', label: 'مرحلة Pelliculage', latin: 'Pelliculage' },
  { id: 'coupe', label: 'مرحلة القص', latin: 'Coupe' },
  { id: 'cutcontour', label: 'مرحلة CutContour', latin: 'CutContour' },
  { id: 'finition', label: 'مرحلة التشطيب', latin: 'Finition' },
  { id: 'livraison', label: 'مرحلة التسليم', latin: 'Livraison' },
];

export function stageLabel(id: string): string {
  return STAGE_DEFS.find((s) => s.id === id)?.label ?? id;
}

export const SERVICE_BASIS_LABELS: Record<string, string> = {
  perCopy: 'لكل نسخة',
  perM2: 'لكل م²',
  fixed: 'ثابت',
};
