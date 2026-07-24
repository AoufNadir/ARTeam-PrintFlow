import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { Toaster } from 'sonner';
import Layout from './components/Layout';
import Home from './pages/Home';
import Quotes from './pages/Quotes';
import DevisCreate from './pages/DevisCreate';
import Montage from './pages/Montage';
import Clients from './pages/Clients';
import Builder from './pages/Builder';
import Settings from './pages/Settings';
import Login from './pages/Login';
import { hasSession } from './lib/session';

/** Route guard: no session → redirect to /login (preserving the attempted path). */
function RequireAuth() {
  const location = useLocation();
  if (!hasSession()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** 404 — unknown routes inside the shell. */
function NotFound() {
  return (
    <div className="grid min-h-[60dvh] place-items-center px-6 py-16">
      <div className="space-y-3 text-center">
        <div dir="ltr" className="font-latin text-[64px] leading-none font-bold text-[var(--cyan-600)]">
          404
        </div>
        <h1 className="text-[22px] font-bold text-[var(--ink-900)]">الصفحة غير موجودة</h1>
        <p className="text-[14px] text-[var(--ink-500)]">المسار الذي طلبته غير متوفر أو ربما تم نقله.</p>
        <Link
          to="/"
          className="inline-flex h-10 items-center rounded-[10px] bg-[var(--cyan-600)] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[var(--cyan-500)]"
        >
          العودة إلى لوحة القيادة
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Routes>
        {/* auth renders WITHOUT the app shell */}
        <Route path="/login" element={<Login />} />
        {/* everything else requires a session */}
        <Route element={<RequireAuth />}>
          {/* nested-route pattern: Layout renders <Outlet/> */}
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="devis" element={<Quotes />} />
            <Route path="devis/new" element={<DevisCreate />} />
            <Route path="devis/:id/edit" element={<DevisCreate />} />
            <Route path="montage" element={<Montage />} />
            <Route path="clients" element={<Clients />} />
            <Route path="builder" element={<Builder />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
      <Toaster position="bottom-left" dir="rtl" richColors toastOptions={{ style: { fontFamily: 'Cairo, sans-serif' } }} />
    </>
  );
}
