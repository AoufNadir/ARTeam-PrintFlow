import { useState } from 'react';
import { NavLink } from 'react-router';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  FileText,
  FilePlus2,
  LayoutGrid,
  Users,
  Blocks,
  Settings,
  PanelRightClose,
  PanelRightOpen,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/', label: 'لوحة القيادة', icon: LayoutDashboard, end: true },
  { to: '/devis', label: 'عروض الأسعار', icon: FileText, end: true },
  { to: '/devis/new', label: 'إنشاء Devis', icon: FilePlus2, end: true },
  { to: '/montage', label: 'المونتاج الذكي', icon: LayoutGrid },
  { to: '/clients', label: 'العملاء والمشاريع', icon: Users },
  { to: '/builder', label: 'منشئ المنتجات', icon: Blocks },
  { to: '/settings', label: 'الإعدادات', icon: Settings },
];

export interface AppSidebarProps {
  /** called after a nav link is activated — used to close the mobile off-canvas drawer */
  onNavigate?: () => void;
  /** when provided (mobile drawer mode), shows a close button in the header */
  onClose?: () => void;
}

/** Right-docked RTL sidebar, 264px expanded / 76px collapsed. */
export default function AppSidebar({ onNavigate, onClose }: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <motion.aside
      animate={{ width: collapsed ? 76 : 264 }}
      transition={{ duration: 0.25, ease: [0.22, 0.68, 0.26, 1] }}
      className="sticky top-0 flex h-[100dvh] w-full shrink-0 flex-col bg-[var(--sidebar-900)] text-white"
    >
      {/* logo lockup */}
      <div className="flex h-16 items-center gap-3 border-b border-white/[0.07] px-4">
        <img src="/logo.svg" alt="ARTeam PrintFlow" className="h-9 w-9 shrink-0" />
        {!collapsed && (
          <div className="min-w-0">
            <div dir="ltr" className="font-latin truncate text-left text-[15px] font-semibold leading-5">
              ARTeam PrintFlow
            </div>
            <div className="text-[11px] text-white/50">غرفة التحضير</div>
          </div>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق القائمة"
            className="ms-auto grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-white/60 transition-colors hover:bg-[var(--sidebar-800)] hover:text-white"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} title={collapsed ? label : undefined} onClick={onNavigate}>
            {({ isActive }) => (
              <span
                className={cn(
                  'relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] font-medium transition-colors',
                  isActive ? 'bg-[var(--sidebar-800)] text-white' : 'text-white/60 hover:bg-[var(--sidebar-800)]/60 hover:text-white',
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="nav-active-bar"
                    className="absolute inset-y-2 end-0 w-[3px] rounded-full bg-[var(--cyan-500)]"
                    transition={{ duration: 0.25 }}
                  />
                )}
                <Icon size={20} className={cn('shrink-0', isActive && 'text-[var(--cyan-500)]')} />
                {!collapsed && <span className="truncate">{label}</span>}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* footer: CMYK bar + collapse + user chip */}
      <div className="border-t border-white/[0.07] px-4 py-4">
        {!collapsed && (
          <div className="mb-3 flex gap-1" aria-hidden>
            <span className="h-1 w-5 rounded-full bg-[#0284C7]" />
            <span className="h-1 w-5 rounded-full bg-[#DB2777]" />
            <span className="h-1 w-5 rounded-full bg-[#EAB308]" />
            <span className="h-1 w-5 rounded-full bg-[#15171E] ring-1 ring-white/20" />
          </div>
        )}
        <div className={cn('flex items-center gap-3', collapsed && 'flex-col')}>
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#E0F2FE] text-[13px] font-semibold text-[#0369A1]">
            أب
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">أمين بوزيد</div>
              <div className="truncate text-[11px] text-white/50">مدير المطبعة</div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'توسيع القائمة' : 'طيّ القائمة'}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-white/50 transition-colors hover:bg-[var(--sidebar-800)] hover:text-white"
          >
            {collapsed ? <PanelRightOpen size={18} /> : <PanelRightClose size={18} />}
          </button>
        </div>
      </div>
    </motion.aside>
  );
}
