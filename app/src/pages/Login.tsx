import { memo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SESSION_KEY } from '@/lib/session';

const EASE = [0.22, 0.68, 0.26, 1] as [number, number, number, number];

const DEMO_ROLES = [
  { id: 'owner', label: 'صاحب شركة', name: 'أمين بوزيد', email: 'amine@arteam.dz' },
  { id: 'sales', label: 'مبيعات', name: 'سارة مرابط', email: 'sara@arteam.dz' },
  { id: 'pricing', label: 'مسؤول تسعير', name: 'يوسف بن عمر', email: 'youcef@arteam.dz' },
  { id: 'production', label: 'إنتاج', name: 'كمال حداد', email: 'kamel@arteam.dz' },
] as const;

function signIn(role: { name: string; email: string; label: string }) {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ name: role.name, email: role.email, role: role.label, at: new Date().toISOString() }),
  );
}

// ------------------------- ambient motifs (isolated) -------------------------

const CropMark = memo(function CropMark({ className, delay }: { className: string; delay: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.svg
      width="26"
      height="26"
      viewBox="0 0 26 26"
      fill="none"
      aria-hidden
      className={cn('pointer-events-none absolute text-white/25', className)}
      animate={reduce ? undefined : { x: [0, 10, 0, -8, 0], y: [0, -8, 6, 0, 0] }}
      transition={{ duration: 14, delay, repeat: Infinity, ease: 'easeInOut' }}
    >
      <path d="M1 25 V1 H25 M1 25 V1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M1 25 H25" stroke="currentColor" strokeWidth="1.5" />
    </motion.svg>
  );
});

const RegistrationTarget = memo(function RegistrationTarget() {
  const reduce = useReducedMotion();
  return (
    <motion.svg
      width="72"
      height="72"
      viewBox="0 0 72 72"
      fill="none"
      aria-hidden
      className="pointer-events-none absolute top-[18%] end-[12%] text-white/20"
      animate={reduce ? undefined : { rotate: 360 }}
      transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
    >
      <circle cx="36" cy="36" r="26" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="36" cy="36" r="9" stroke="#0EA5E9" strokeWidth="1.5" />
      <path d="M36 4v64M4 36h64" stroke="currentColor" strokeWidth="1" />
    </motion.svg>
  );
});

const FloatingHero = memo(function FloatingHero() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, scale: 1.06 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.9, ease: EASE }}
      className="relative w-[70%] max-w-[560px]"
    >
      <motion.img
        src="/login-hero.png"
        alt=""
        animate={reduce ? undefined : { y: [0, -8, 0, 8, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        className="w-full rounded-[18px] shadow-[var(--shadow-pop)]"
        style={{ transform: 'rotate(-4deg)' }}
      />
    </motion.div>
  );
});

// --------------------------------- page --------------------------------------

/** تسجيل الدخول — renders WITHOUT the app shell. */
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState<string | null>(null); // role id or 'form'
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // already signed in → go straight to the app
  let hasSession = false;
  try {
    hasSession = !!localStorage.getItem(SESSION_KEY);
  } catch {
    hasSession = false;
  }
  if (hasSession && !done) {
    return <Navigate to="/" replace />;
  }

  const go = (key: string, fn: () => void) => {
    setLoading(key);
    setTimeout(() => {
      fn();
      setDone(true);
      const from = (location.state as { from?: string } | null)?.from;
      setTimeout(() => navigate(from && from !== '/login' ? from : '/'), 500);
    }, 700);
  };

  const flashError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(null), 3000);
  };

  const submit = () => {
    // distinct messages: missing fields vs. wrong credentials
    if (!identifier.trim() || !password.trim()) {
      flashError('هذه الحقول مطلوبة — أدخل بريدك الإلكتروني (أو هاتفك) وكلمة المرور للمتابعة.');
      return;
    }
    go('form', () =>
      signIn({ ...DEMO_ROLES[0], email: identifier.trim() }),
    );
  };

  return (
    <div dir="rtl" className="grid min-h-[100dvh] lg:grid-cols-2">
      {/* ------------------------------- form zone ------------------------------ */}
      <div
        className="relative flex items-center justify-center bg-[var(--paper-50)] px-6 py-10"
        style={{ backgroundImage: 'url(/paper-grain.png)', backgroundSize: '512px' }}
      >
        <div
          className="pointer-events-none absolute bottom-0 end-0 h-64 w-64 opacity-[0.06]"
          style={{ backgroundImage: 'url(/texture-halftone.svg)', backgroundSize: '512px' }}
          aria-hidden
        />
        <AnimatePresence>
          {!done && (
            <motion.div
              key="form"
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="relative w-full max-w-[400px]"
            >
              <motion.div
                animate={error ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
                transition={{ duration: 0.32 }}
                className="space-y-5"
              >
                {/* logo */}
                <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }}>
                  <img src="/logo.svg" alt="ARTeam PrintFlow" className="w-40" />
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.07, ease: EASE }}>
                  <h1 className="text-[27px] leading-9 font-bold text-[var(--ink-900)]">مرحبًا بعودتك</h1>
                  <p className="mt-1 text-[13px] text-[var(--ink-500)]">سجّل الدخول لمتابعة عروض الأسعار والمونتاج.</p>
                </motion.div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div role="alert" className="rounded-[10px] border border-[var(--danger-600)]/30 bg-[#FEE2E2] px-3 py-2 text-[13px] font-medium text-[var(--danger-600)]">
                        {error}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit();
                  }}
                >
                  {[
                    <div key="id">
                      <label htmlFor="login-identifier" className="mb-1.5 block text-[13px] font-medium text-[var(--ink-700)]">البريد الإلكتروني أو الهاتف</label>
                      <input
                        id="login-identifier"
                        dir="ltr"
                        type="text"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="you@shop.dz"
                        autoComplete="username"
                        aria-invalid={!!error}
                        className="font-latin h-11 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-3 text-[14px] outline-none transition-shadow placeholder:text-[var(--ink-400)] focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)]"
                      />
                    </div>,
                    <div key="pw">
                      <div className="mb-1.5 flex items-center justify-between">
                        <label htmlFor="login-password" className="text-[13px] font-medium text-[var(--ink-700)]">كلمة المرور</label>
                        <button type="button" className="text-[11px] text-[var(--ink-400)] transition-colors hover:text-[var(--cyan-600)]">
                          نسيت كلمة المرور؟
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          id="login-password"
                          dir="ltr"
                          type={showPw ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          autoComplete="current-password"
                          aria-invalid={!!error}
                          className="h-11 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-3 pe-10 text-[14px] outline-none transition-shadow placeholder:text-[var(--ink-400)] focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)]"
                        />
                        <button
                          type="button"
                          aria-label={showPw ? 'إخفاء' : 'إظهار'}
                          onClick={() => setShowPw((v) => !v)}
                          className="absolute end-3 top-1/2 -translate-y-1/2 text-[var(--ink-400)] transition-colors hover:text-[var(--ink-700)]"
                        >
                          <AnimatePresence mode="wait" initial={false}>
                            <motion.span
                              key={showPw ? 'off' : 'on'}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.18 }}
                              className="block"
                            >
                              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                            </motion.span>
                          </AnimatePresence>
                        </button>
                      </div>
                    </div>,
                    <div key="remember" className="flex items-center gap-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={remember}
                        onClick={() => setRemember((v) => !v)}
                        className={cn('relative h-5 w-9 rounded-full transition-colors', remember ? 'bg-[var(--cyan-600)]' : 'bg-[var(--line-strong)]')}
                      >
                        <motion.span
                          layout
                          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                          className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow', remember ? 'end-[18px]' : 'end-0.5')}
                        />
                      </button>
                      <span className="cursor-pointer text-[13px] text-[var(--ink-500)]" onClick={() => setRemember((v) => !v)}>تذكرني</span>
                    </div>,
                    <button
                      key="submit"
                      type="submit"
                      disabled={loading !== null}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--cyan-600)] text-[15px] font-semibold text-white transition-all hover:-translate-y-px hover:bg-[var(--cyan-500)] active:translate-y-0 active:brightness-95 disabled:opacity-80"
                    >
                      {loading === 'form' ? (
                        <RegistrationSpinner />
                      ) : done ? (
                        <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }}>
                          <Check size={18} strokeWidth={3} />
                        </motion.span>
                      ) : (
                        'دخول'
                      )}
                    </button>,
                  ].map((el, i) => (
                    <motion.div
                      key={el.key}
                      initial={{ opacity: 0, y: 22 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.45, delay: 0.14 + i * 0.07, ease: EASE }}
                    >
                      {el}
                    </motion.div>
                  ))}
                </form>

                {/* demo roles */}
                <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.56, ease: EASE }}>
                  <div className="mb-3 flex items-center gap-3 text-[11px] tracking-[0.04em] text-[var(--ink-400)]">
                    <span className="h-px flex-1 bg-[var(--line)]" />
                    حسابات تجريبية — دخول فوري
                    <span className="h-px flex-1 bg-[var(--line)]" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {DEMO_ROLES.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        disabled={loading !== null}
                        onClick={() => go(r.id, () => signIn(r))}
                        className="flex h-10 items-center justify-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-white text-[13px] font-medium text-[var(--ink-700)] transition-all hover:border-[var(--cyan-500)] hover:bg-[var(--cyan-50)] hover:text-[var(--cyan-600)] disabled:opacity-70"
                      >
                        {loading === r.id ? <RegistrationSpinner small /> : r.label}
                      </button>
                    ))}
                  </div>
                </motion.div>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 }}
                  className="text-center text-[11px] text-[var(--ink-400)]"
                >
                  ARTeam PrintFlow — من المونتاج إلى Devis في دقائق.
                </motion.p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ------------------------------ visual panel ----------------------------- */}
      <motion.div
        initial={{ clipPath: 'inset(0 100% 0 0)' }}
        animate={{ clipPath: 'inset(0 0% 0 0)' }}
        transition={{ duration: 0.6, ease: EASE }}
        className="relative order-first hidden overflow-hidden lg:order-last lg:block"
        style={{ background: 'linear-gradient(160deg, #0E1220 0%, #0B1E33 100%)' }}
      >
        {/* halftone overlay fading toward top */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: 'url(/texture-halftone.svg)',
            backgroundSize: '512px',
            maskImage: 'linear-gradient(to top, black 30%, transparent 85%)',
            WebkitMaskImage: 'linear-gradient(to top, black 30%, transparent 85%)',
          }}
          aria-hidden
        />

        <div className="relative flex h-full flex-col items-center justify-center px-10 pb-40">
          <FloatingHero />
        </div>

        <CropMark className="top-10 start-10" delay={0} />
        <CropMark className="top-10 end-10 rotate-90" delay={2} />
        <CropMark className="bottom-32 start-10 -rotate-90" delay={4} />
        <CropMark className="bottom-32 end-24 rotate-180" delay={6} />
        <RegistrationTarget />

        {/* tagline */}
        <div className="absolute bottom-16 start-10 max-w-md">
          <h2 className="text-[28px] leading-[38px] font-extrabold text-white">
            {['من', 'المونتاج', 'إلى'].map((w, i) => (
              <motion.span
                key={w + i}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.06, duration: 0.4 }}
                className="inline-block"
              >
                {w}{' '}
              </motion.span>
            ))}
            <motion.span
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.58, duration: 0.4 }}
              dir="ltr"
              className="font-latin inline-block text-[#0EA5E9]"
            >
              Devis
            </motion.span>{' '}
            <motion.span initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.64, duration: 0.4 }} className="inline-block">
              في دقائق
            </motion.span>
          </h2>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="mt-2 text-[13px] text-white/60">
            مونتاج ذكي بأقل هدر، وقواعد أسعار تعدّلها بنفسك.
          </motion.p>
        </div>

        {/* CMYK bar pinned at panel bottom */}
        <div className="absolute inset-x-0 bottom-0 flex h-6" aria-hidden>
          <span className="flex-1 bg-[#0284C7]" />
          <span className="flex-1 bg-[#DB2777]" />
          <span className="flex-1 bg-[#EAB308]" />
          <span className="flex-1 bg-[#15171E]" />
        </div>
      </motion.div>
    </div>
  );
}

/** Registration-target spinner (loader motif). */
function RegistrationSpinner({ small }: { small?: boolean }) {
  const s = small ? 16 : 20;
  return (
    <motion.svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.3" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path d="M12 1v6M12 17v6M1 12h6M17 12h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </motion.svg>
  );
}
