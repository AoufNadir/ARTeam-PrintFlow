import { useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import AppSidebar from './AppSidebar';
import Topbar from './Topbar';
import CommandPalette from './ds/CommandPalette';
import type { Unit } from '@/lib/types';

/**
 * App shell — nested-route (layout-route) pattern:
 * renders <Outlet/>; App.tsx nests all shell routes under <Route element={<Layout/>}>.
 * Sidebar is right-docked (RTL first flex child = physical right), topbar is sticky
 * in normal flow, content scrolls in its own region. Pages MUST NOT add top offsets.
 * Pages read the global unit via `useUnit()` from './layout-context'.
 *
 * Below lg (~1024px) the fixed sidebar becomes an off-canvas drawer opened
 * from the Topbar hamburger button.
 */
export default function Layout() {
  const [unit, setUnit] = useState<Unit>('mm');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();

  // close the mobile drawer on navigation — adjust state during render
  // (React-sanctioned pattern; avoids setState inside an effect)
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setSidebarOpen(false);
  }

  return (
    <div className="flex min-h-[100dvh] bg-[var(--paper-50)]">
      {/* desktop sidebar */}
      <div className="hidden shrink-0 lg:block">
        <AppSidebar />
      </div>

      {/* mobile off-canvas sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <div className="fixed inset-0 z-[60] lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-[var(--ink-900)]/40"
              onClick={() => setSidebarOpen(false)}
              aria-hidden
            />
            <motion.div
              role="dialog"
              aria-modal
              aria-label="القائمة الرئيسية"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.28, ease: [0.22, 0.68, 0.26, 1] }}
              className="absolute inset-y-0 right-0 w-[264px] max-w-[85vw]"
            >
              <AppSidebar onNavigate={() => setSidebarOpen(false)} onClose={() => setSidebarOpen(false)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar unit={unit} onUnitChange={setUnit} onOpenPalette={() => setPaletteOpen(true)} onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-4 sm:px-6 sm:py-6 md:px-8 md:py-8">
          <Outlet context={{ unit, setUnit }} />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
