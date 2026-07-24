import { cn } from '@/lib/utils';

export interface SkeletonProps {
  className?: string;
}

/** Loading placeholder block — pair with layout-matched sizing classes. */
export default function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden className={cn('animate-pulse rounded-[8px] bg-[var(--paper-200)]', className)} />;
}

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

/** Multi-line text placeholder (last line shortened for a natural look). */
export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div aria-hidden className={cn('space-y-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}
