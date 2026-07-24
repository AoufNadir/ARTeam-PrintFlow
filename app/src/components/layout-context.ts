import { useOutletContext } from 'react-router';
import type { Unit } from '@/lib/types';

export interface LayoutContext {
  unit: Unit;
  setUnit: (u: Unit) => void;
}

/** Pages inside the shell use this to read the global mm/cm unit. */
export function useUnit(): LayoutContext {
  return useOutletContext<LayoutContext>();
}
