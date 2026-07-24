// Section icon registry for the builder (kept out of component files for fast-refresh).
import {
  BookOpen,
  CreditCard,
  FileText,
  Flag,
  Layers,
  Package,
  PanelTop,
  Printer,
  Puzzle,
  Ruler,
  Scissors,
  Sticker,
  type LucideIcon,
} from 'lucide-react';
import type { Section } from '@/lib/types';
import type { BuilderMeta } from './meta';

export const SECTION_ICONS: Record<string, LucideIcon> = {
  printer: Printer,
  layers: Layers,
  flag: Flag,
  'panel-top': PanelTop,
  package: Package,
  puzzle: Puzzle,
  scissors: Scissors,
  ruler: Ruler,
  sticker: Sticker,
  book: BookOpen,
  card: CreditCard,
  file: FileText,
};

export function sectionIcon(meta: BuilderMeta, section: Section): LucideIcon {
  const key = meta.sectionIcons[section.id] ?? 'file';
  return SECTION_ICONS[key] ?? FileText;
}
