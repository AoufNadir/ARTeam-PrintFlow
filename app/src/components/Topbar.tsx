import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { Bell, ChevronLeft, LogOut, Menu, Plus, Search } from 'lucide-react';
import type { Unit } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SESSION_KEY } from '@/lib/session';

const ROUTE_TITLES: Record<string, string> = {
  '/': 'لوحة القيادة',
  '/devis': 'عروض الأسعار',
  '/devis/new': 'إنشاء Devis',
  '/montage': 'المونتاج الذكي',
  '/clients': 'العملاء والمشاريع',
  '/builder': 'منشئ المنتجات',
  '/settings': 'الإعدادات',
};

interface SessionInfo {
  name?: string;
  email?: string;
  role?: string;
}

function readSession(): SessionInfo | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SessionInfo) : null;
  } catch {
    return null;
  }
}

export interface TopbarProps {
  unit: Unit;
  onUnitChange: (u: Unit) => void;
  onOpenPalette: () => void;
  /** opens the off-canvas sidebar on small screens */
  onOpenSidebar?: () => void;
}

/** Sticky topbar: hamburger (mobile), breadcrumb, Ctrl+K trigger, unit toggle, quick action, bell, user menu. */
export default function Topbar({ unit, onUnitChange, onOpenPalette, onOpenSidebar }: TopbarProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const title = ROUTE_TITLES[pathname] ?? 'ARTeam PrintFlow';
  const [menuOpen, setMenuOpen] = useState(false);
  const session = useMemo(() => readSession(), []);

  const initials = (session?.name ?? 'أ ب')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('');

  const signOut = () => {
    localStorage.removeItem(SESSION_KEY);
    setMenuOpen(false);
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-[var(--line)] bg-white px-3 sm:px-4 lg:h-16 lg:gap-4 lg:px-6">
      {/* hamburger — mobile only */}
      {onOpenSidebar && (
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="فتح القائمة الرئيسية"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-100)] lg:hidden"
        >
          <Menu size={20} />
        </button>
      )}

      {/* breadcrumb */}
      <nav className="flex min-w-0 items-center gap-1.5 text-[13px] text-[var(--ink-400)]">
        <Link to="/" className="hidden transition-colors hover:text-[var(--ink-700)] md:inline">
          ARTeam
        </Link>
        <ChevronLeft size={14} aria-hidden className="hidden md:inline" />
        <span className="truncate font-medium text-[var(--ink-900)]">{title}</span>
      </nav>

      {/* command palette trigger */}
      <button
        type="button"
        onClick={onOpenPalette}
        aria-label="البحث والأوامر (Ctrl K)"
        className="mx-auto flex h-10 w-full max-w-md items-center gap-2 rounded-[10px] border border-[var(--line)] bg-[var(--paper-100)] px-3 text-[13px] text-[var(--ink-400)] transition-colors hover:bg-[var(--paper-200)]"
      >
        <Search size={15} />
        <span className="hidden flex-1 text-start sm:inline">ابحث أو نفّذ أمرًا…</span>
        <kbd dir="ltr" className="font-latin hidden rounded border border-[var(--line-strong)] bg-white px-1.5 py-0.5 text-[10px] sm:inline">
          Ctrl K
        </kbd>
      </button>

      {/* unit toggle */}
      <div dir="ltr" className="hidden overflow-hidden rounded-[8px] border border-[var(--line-strong)] sm:flex">
        {(['mm', 'cm'] as Unit[]).map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => onUnitChange(u)}
            className={cn(
              'font-latin relative px-3 py-1.5 text-[12px] font-semibold transition-colors',
              unit === u ? 'text-white' : 'bg-white text-[var(--ink-500)] hover:bg-[var(--paper-100)]',
            )}
          >
            {unit === u && <motion.span layoutId="unit-pill" className="absolute inset-0 bg-[var(--cyan-600)]" transition={{ duration: 0.2 }} />}
            <span className="relative">{u}</span>
          </button>
        ))}
      </div>

      {/* quick action */}
      <Link
        to="/devis/new"
        aria-label="Devis جديد"
        className="flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] bg-[var(--cyan-600)] px-3 text-[14px] font-semibold text-white transition-all hover:-translate-y-px hover:bg-[var(--cyan-500)] active:translate-y-0 active:brightness-95 md:px-4"
      >
        <Plus size={16} strokeWidth={2.5} />
        <span className="hidden md:inline">
          Devis <span className="font-normal">جديد</span>
        </span>
      </Link>

      {/* bell */}
      <button
        type="button"
        aria-label="الإشعارات"
        className="relative grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-100)]"
      >
        <Bell size={19} />
        <span className="absolute end-2 top-2 h-2 w-2 rounded-full bg-[var(--magenta-600)]" />
      </button>

      {/* user menu */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={session?.name ? `قائمة المستخدم — ${session.name}` : 'قائمة المستخدم'}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className="grid h-9 w-9 place-items-center rounded-full bg-[#E0F2FE] text-[13px] font-semibold text-[#0369A1]"
        >
          {initials}
        </button>
        {menuOpen && (
          <>
            <button
              type="button"
              aria-label="إغلاق القائمة"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setMenuOpen(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setMenuOpen(false);
              }}
            />
            <div
              role="menu"
              className="absolute end-0 top-11 z-50 w-56 overflow-hidden rounded-[12px] border border-[var(--line)] bg-white py-1.5 shadow-[var(--shadow-pop)]"
            >
              <div className="border-b border-[var(--line)] px-4 py-2.5">
                <div className="truncate text-[14px] font-semibold text-[var(--ink-900)]">{session?.name ?? 'مستخدم'}</div>
                {session?.role && <div className="truncate text-[11px] text-[var(--ink-400)]">{session.role}</div>}
                {session?.email && (
                  <div dir="ltr" className="font-latin truncate text-end text-[11px] text-[var(--ink-400)]">
                    {session.email}
                  </div>
                )}
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={signOut}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-[13px] font-medium text-[var(--danger-600)] transition-colors hover:bg-[#FEF2F2]"
              >
                <LogOut size={15} />
                تسجيل الخروج
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
