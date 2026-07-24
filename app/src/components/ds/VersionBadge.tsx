import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Frozen pricing-rules badge: "قواعد v12" + lock. Old quotes never change. */
export default function VersionBadge({ version, className }: { version: number; className?: string }) {
  return (
    <span
      title="محفوظة داخل هذا العرض — لن تتغير بتعديل الأسعار"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--paper-100)] px-2 py-0.5 text-[11px] font-medium text-[var(--ink-500)]',
        className,
      )}
    >
      <Lock size={11} />
      قواعد
      <span dir="ltr" className="font-latin font-semibold tabular-nums">
        v{version}
      </span>
    </span>
  );
}
