// Shared overlay primitives used across the builder-ops pages (builder / clients / settings).
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { CropMarks } from '@/components/ds/SectionCard';
import { cn } from '@/lib/utils';

const EASE = [0.22, 0.68, 0.26, 1] as [number, number, number, number];

const SIZES = { sm: 420, md: 560, lg: 760, xl: 1040 } as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Simple a11y behavior for an open dialog mounted under AnimatePresence:
 * - initial focus moves inside the panel (respects an existing inner autoFocus)
 * - Escape closes
 * - Tab / Shift+Tab cycles inside the panel (focus trap)
 * - focus is restored to the previously focused element on unmount
 */
function useDialogA11y(panelRef: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    const prev = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length > 0);

    const t = window.setTimeout(() => {
      if (!node.contains(document.activeElement)) {
        (focusables()[0] ?? node).focus();
      }
    }, 60);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: keyof typeof SIZES;
  children: ReactNode;
  footer?: ReactNode;
}

/** Centered modal with crop-marks draw-in, scale .95→1, 240ms. */
export function Modal({ open, onClose, title, size = 'md', children, footer }: ModalProps) {
  return (
    <AnimatePresence>
      {open && <ModalPanel onClose={onClose} title={title} size={size} footer={footer}>{children}</ModalPanel>}
    </AnimatePresence>
  );
}

function ModalPanel({ onClose, title, size = 'md', children, footer }: Omit<ModalProps, 'open'>) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y(panelRef, onClose);

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-[var(--ink-900)]/30"
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.24, ease: EASE }}
        className="relative w-full overflow-hidden rounded-[18px] border border-[var(--line)] bg-white shadow-[var(--shadow-pop)] outline-none"
        style={{ maxWidth: SIZES[size] }}
      >
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.1 }}>
          <CropMarks opacity={0.4} offset={8} />
        </motion.div>
        <header className="flex items-center justify-between gap-3 px-6 pt-5 pb-1">
          <h3 id={titleId} className="text-[17px] leading-[26px] font-semibold text-[var(--ink-900)]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="grid h-8 w-8 place-items-center rounded-[8px] text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-100)]"
          >
            <X size={17} />
          </button>
        </header>
        <div className="max-h-[70dvh] overflow-y-auto px-6 py-4">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-[var(--line)] px-6 py-4">{footer}</footer>}
      </motion.div>
    </div>
  );
}

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

/** Left-side (end side, RTL) drawer: x -100%→0, 300ms, ink-900/30 overlay. */
export function Drawer({ open, onClose, title, children, footer, width = 480 }: DrawerProps) {
  return (
    <AnimatePresence>
      {open && (
        <DrawerPanel onClose={onClose} title={title} footer={footer} width={width}>
          {children}
        </DrawerPanel>
      )}
    </AnimatePresence>
  );
}

function DrawerPanel({ onClose, title, children, footer, width = 480 }: Omit<DrawerProps, 'open'>) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);
  useDialogA11y(panelRef, onClose);

  return (
    <div className="fixed inset-0 z-[70]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="absolute inset-0 bg-[var(--ink-900)]/30"
        onClick={onClose}
        aria-hidden
      />
      <motion.aside
        ref={panelRef}
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        exit={{ x: '-100%' }}
        transition={{ duration: 0.3, ease: EASE }}
        className="absolute inset-y-0 left-0 flex w-full flex-col bg-white shadow-[var(--shadow-pop)] outline-none"
        style={{ maxWidth: width }}
      >
        <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <div id={titleId} className="min-w-0 flex-1">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-100)]"
          >
            <X size={17} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex items-center gap-2 border-t border-[var(--line)] px-5 py-4">{footer}</footer>}
      </motion.aside>
    </div>
  );
}

// ------------------------------ buttons & inputs -----------------------------

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dashed';
type BtnSize = 'sm' | 'md' | 'lg';

export interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: BtnSize;
}

const BTN_VARIANT: Record<BtnVariant, string> = {
  primary:
    'bg-[var(--cyan-600)] text-white hover:-translate-y-px hover:bg-[var(--cyan-500)] active:translate-y-0 active:brightness-95 shadow-sm',
  secondary: 'border border-[var(--line-strong)] bg-white text-[var(--ink-700)] hover:bg-[var(--paper-100)]',
  ghost: 'text-[var(--ink-500)] hover:bg-[var(--paper-100)] hover:text-[var(--ink-700)]',
  danger: 'bg-[var(--danger-600)] text-white hover:brightness-110',
  dashed:
    'border border-dashed border-[var(--line-strong)] bg-transparent text-[var(--ink-500)] hover:border-[var(--cyan-500)] hover:text-[var(--cyan-600)] hover:bg-[var(--cyan-50)]',
};

const BTN_SIZE: Record<BtnSize, string> = {
  sm: 'h-8 px-3 text-[13px] rounded-[8px]',
  md: 'h-10 px-4 text-[14px] rounded-[10px]',
  lg: 'h-12 px-5 text-[15px] rounded-[10px]',
};

export function Btn({ variant = 'primary', size = 'md', className, ...props }: BtnProps) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 font-semibold transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        BTN_VARIANT[variant],
        BTN_SIZE[size],
        className,
      )}
    />
  );
}

export const inputCls =
  'h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-3 text-[14px] text-[var(--ink-900)] outline-none transition-shadow placeholder:text-[var(--ink-400)] focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)]';

export function FieldLabel({ children, required, htmlFor }: { children: ReactNode; required?: boolean; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-1 text-[13px] font-medium text-[var(--ink-700)]">
      {children}
      {required && <span className="h-1.5 w-1.5 rounded-full bg-[var(--magenta-600)]" role="img" aria-label="مطلوب" />}
    </label>
  );
}

/** Small chip pill used for meta info. */
export function Chip({
  children,
  tint = 'paper',
  className,
}: {
  children: ReactNode;
  tint?: 'paper' | 'cyan' | 'violet' | 'danger' | 'success' | 'warning';
  className?: string;
}) {
  const tints = {
    paper: 'bg-[var(--paper-100)] text-[var(--ink-500)]',
    cyan: 'bg-[var(--cyan-100)] text-[var(--cyan-600)]',
    violet: 'bg-[#EDE9FE] text-[#7C3AED]',
    danger: 'bg-[#FEE2E2] text-[var(--danger-600)]',
    success: 'bg-[#DCFCE7] text-[var(--success-600)]',
    warning: 'bg-[#FEF3C7] text-[var(--warning-600)]',
  } as const;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', tints[tint], className)}>
      {children}
    </span>
  );
}
