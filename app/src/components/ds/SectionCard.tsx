import { useState, type CSSProperties, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SectionCardProps {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** "document" mode draws subtle crop marks (traits de coupe) at the corners */
  document?: boolean;
  defaultCollapsed?: boolean;
  accent?: 'default' | 'warning';
}

/** 4 corner L crop-marks (traits de coupe), 12x12, 1.5px stroke. Place inside a relative container. */
export function CropMarks({ opacity = 0.4, offset = 6 }: { opacity?: number; offset?: number }) {
  const L = 12;
  const corner = (pos: CSSProperties, d: string) => (
    <svg
      key={d + JSON.stringify(pos)}
      className="pointer-events-none absolute"
      style={{ ...pos, opacity }}
      width={L + 2}
      height={L + 2}
      viewBox={`0 0 ${L + 2} ${L + 2}`}
      fill="none"
      aria-hidden
    >
      <path d={d} stroke="#9AA1AF" strokeWidth={1.5} />
    </svg>
  );
  return (
    <>
      {corner({ top: offset, insetInlineStart: offset }, `M1 ${L + 1} V1 H${L + 1}`)}
      {corner({ top: offset, insetInlineEnd: offset }, `M${L + 1} ${L + 1} V1 H1`)}
      {corner({ bottom: offset, insetInlineStart: offset }, `M1 1 V${L + 1} H${L + 1}`)}
      {corner({ bottom: offset, insetInlineEnd: offset }, `M${L + 1} 1 V${L + 1} H1`)}
    </>
  );
}

export default function SectionCard({
  title,
  actions,
  children,
  className,
  document = false,
  defaultCollapsed = false,
  accent = 'default',
}: SectionCardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <section
      className={cn(
        'relative rounded-[14px] border bg-white shadow-[var(--shadow-card)]',
        accent === 'warning' ? 'border-[#D97706]/40' : 'border-[var(--line)]',
        className,
      )}
    >
      {document && <CropMarks opacity={0.35} />}
      <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
        <h2 className="text-[21px] leading-[30px] font-bold text-[var(--ink-900)]">{title}</h2>
        <div className="flex items-center gap-2">
          {actions}
          <button
            type="button"
            aria-label={collapsed ? 'فتح' : 'طيّ'}
            onClick={() => setCollapsed((c) => !c)}
            className="grid h-8 w-8 place-items-center rounded-[8px] text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-100)]"
          >
            <motion.span animate={{ rotate: collapsed ? -180 : 0 }} transition={{ duration: 0.2 }} className="inline-flex">
              <ChevronDown size={18} />
            </motion.span>
          </button>
        </div>
      </header>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
