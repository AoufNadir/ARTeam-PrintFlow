import type { MontageMode, Section, Service } from './types';

/** One capability gate shared by the quote UI and tests. Legacy services stay disabled. */
export function resolveMontageMode(
  section: Pick<Section, 'printCategory'> | undefined,
  service: Pick<Service, 'montageMode'> | undefined,
): MontageMode {
  if (!section || !service) return 'disabled';
  if (section.printCategory !== 'digital' && section.printCategory !== 'offset') return 'disabled';
  return service.montageMode ?? 'disabled';
}

export function serviceAllowsMontage(
  section: Pick<Section, 'printCategory'> | undefined,
  service: Pick<Service, 'montageMode'> | undefined,
): boolean {
  return resolveMontageMode(section, service) !== 'disabled';
}

