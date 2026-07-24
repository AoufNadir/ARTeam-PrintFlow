import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  Copy,
  Eye,
  FileDown,
  LayoutGrid,
  Plus,
  Ruler,
  TrendingUp,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import SectionCard, { CropMarks } from '@/components/ds/SectionCard';
import KpiCard from '@/components/ds/KpiCard';
import StatusPill from '@/components/ds/StatusPill';
import VersionBadge from '@/components/ds/VersionBadge';
import WasteMeter from '@/components/ds/WasteMeter';
import DataTable, { type Column } from '@/components/ds/DataTable';
import EmptyState from '@/components/ds/EmptyState';
import OnboardingChecklist from '@/components/ds/OnboardingChecklist';
import { Btn, FieldLabel, inputCls, Modal } from '@/components/settings/Overlay';
import type { DevisStatus } from '@/lib/types';

const EASE = [0.22, 0.68, 0.26, 1] as [number, number, number, number];

// ------------------------------- demo data -----------------------------------

interface RecentDevis {
  id: string;
  number: string;
  client: string;
  services: string;
  total: string;
  status: DevisStatus;
  version: number;
  date: string;
}

const RECENT: RecentDevis[] = [
  { id: 'r1', number: 'D-2025-0147', client: 'مقهى الروضة', services: 'Carte Visite + 2', total: '45,600 دج', status: 'sent', version: 12, date: 'قبل ساعتين' },
  { id: 'r2', number: 'D-2025-0146', client: 'مكتبة النور', services: 'Flyer', total: '18,200 دج', status: 'accepted', version: 12, date: 'قبل 5 ساعات' },
  { id: 'r3', number: 'D-2025-0145', client: 'حلويات الأمير', services: 'Étiquettes + 1', total: '96,400 دج', status: 'draft', version: 11, date: 'أمس' },
  { id: 'r4', number: 'D-2025-0144', client: 'وكالة الأفق', services: 'Dépliant', total: '132,000 دج', status: 'sent', version: 11, date: 'أمس' },
  { id: 'r5', number: 'D-2025-0143', client: 'صيدلية الشفاء', services: 'Grand Format', total: '74,800 دج', status: 'accepted', version: 11, date: 'قبل يومين' },
];

const SPARK1 = [3, 5, 2, 6, 4, 7, 5, 8, 6, 9, 7, 8].map((v, i) => ({ i, v }));
const SPARK2 = [80, 120, 95, 140, 110, 160, 130, 190, 150, 210, 180, 220].map((v, i) => ({ i, v }));
const SPARK3 = [52, 55, 58, 54, 61, 63, 60, 66, 64, 67, 68, 68].map((v, i) => ({ i, v }));

const DEMAND = [
  { name: 'Carte Visite', count: 42, color: '#0284C7' },
  { name: 'Flyer', count: 31, color: '#0D9488' },
  { name: 'Étiquettes', count: 18, color: '#7C3AED' },
  { name: 'Dépliant', count: 12, color: '#D97706' },
  { name: 'Grand Format', count: 9, color: '#DB2777' },
];

const WEEK = [
  { day: 'السبت', offers: 4, accepted: 2 },
  { day: 'الأحد', offers: 6, accepted: 4 },
  { day: 'الاثنين', offers: 5, accepted: 3 },
  { day: 'الثلاثاء', offers: 6, accepted: 4 },
  { day: 'الأربعاء', offers: 3, accepted: 2 },
  { day: 'الخميس', offers: 7, accepted: 5 },
  { day: 'الجمعة', offers: 2, accepted: 1 },
];

interface Alert {
  id: string;
  icon: 'triangle' | 'ruler' | 'trend';
  text: string;
  action: string;
  to: string;
}

const INITIAL_ALERTS: Alert[] = [
  { id: 'a1', icon: 'triangle', text: 'سعر Papier Couché 350g لم يُحدَّث منذ 90 يومًا', action: 'تحديث', to: '/settings#paper' },
  { id: 'a2', icon: 'ruler', text: 'هوامش ماكينة Xerox Versant 180 تحتاج تأكيدًا', action: 'مراجعة', to: '/settings#machines' },
  { id: 'a3', icon: 'trend', text: 'هامش الربح على Grand Format أقل من 15%', action: 'تعديل القاعدة', to: '/settings#rules' },
];

// ------------------------------- component -----------------------------------

export default function Home() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState(INITIAL_ALERTS);
  const [clientModal, setClientModal] = useState(false);
  const [recent, setRecent] = useState(RECENT);
  const [series, setSeries] = useState({ offers: true, accepted: true });

  const columns = useMemo<Column<RecentDevis>[]>(
    () => [
      { key: 'number', header: 'الرقم', numeric: true, render: (r) => <span className="font-semibold text-[var(--ink-900)]">{r.number}</span> },
      { key: 'client', header: 'العميل', render: (r) => r.client },
      { key: 'services', header: 'الخدمات', render: (r) => <span dir="ltr" className="font-latin text-[var(--ink-500)]">{r.services}</span> },
      { key: 'total', header: 'الإجمالي', numeric: true, render: (r) => r.total },
      { key: 'status', header: 'الحالة', render: (r) => <StatusPill status={r.status} /> },
      { key: 'version', header: 'قواعد', render: (r) => <VersionBadge version={r.version} /> },
      { key: 'date', header: 'التاريخ', render: (r) => <span className="text-[var(--ink-400)]">{r.date}</span> },
    ],
    [],
  );

  const copyIdRef = useRef(100);
  const duplicate = (row: RecentDevis) => {
    copyIdRef.current += 1;
    const copy = { ...row, id: `r-copy-${copyIdRef.current}`, number: 'D-2025-0148', status: 'draft' as DevisStatus, date: 'الآن' };
    setRecent((rows) => [copy, ...rows]);
    toast.success('تم إنشاء نسخة D-2025-0148');
  };

  const dismiss = (id: string) => {
    setAlerts((a) => a.filter((x) => x.id !== id));
    toast.info('تم تأجيل التنبيه لمدة 7 أيام');
  };

  const greetingWords = 'صباح الخير، أمين'.split(' ');

  return (
    <div className="space-y-6">
      {/* ---------------- Section 1: welcome band ---------------- */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="relative overflow-hidden rounded-[18px] bg-[var(--paper-100)] px-7 py-6"
      >
        <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'url(/texture-grid.svg)', backgroundSize: '240px' }} aria-hidden />
        <div
          className="halftone-drift pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'url(/texture-halftone.svg)', backgroundSize: '512px' }}
          aria-hidden
        />
        <CropMarks opacity={0.4} offset={8} />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[34px] leading-[42px] font-extrabold text-[var(--ink-900)]">
              {greetingWords.map((w, i) => (
                <motion.span
                  key={i}
                  className="inline-block"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.07, duration: 0.45, ease: EASE }}
                >
                  {w}
                  {i < greetingWords.length - 1 ? '\u00A0' : ''}
                </motion.span>
              ))}
            </h1>
            <p className="mt-1 text-[13px] leading-5 text-[var(--ink-500)]">
              الثلاثاء 14 جانفي 2025 — عندك <span dir="ltr" className="font-latin font-semibold">3</span> عروض تنتظر الرد، و
              <span dir="ltr" className="font-latin font-semibold">2</span> قواعد أسعار تحتاج مراجعة.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {[
              <Link
                key="new"
                to="/devis/new"
                className="flex h-12 items-center gap-2 rounded-[10px] bg-[var(--cyan-600)] px-5 text-[15px] font-semibold text-white transition-all hover:-translate-y-px hover:bg-[var(--cyan-500)] active:translate-y-0 active:scale-[0.97] active:brightness-95"
              >
                <Plus size={18} strokeWidth={2.5} />
                Devis جديد
              </Link>,
              <Link
                key="montage"
                to="/montage"
                className="flex h-12 items-center gap-2 rounded-[10px] border border-[var(--line-strong)] bg-white px-5 text-[15px] font-semibold text-[var(--ink-700)] transition-all hover:-translate-y-px hover:bg-[var(--paper-100)] active:translate-y-0 active:scale-[0.97]"
              >
                <LayoutGrid size={18} />
                مونتاج سريع
              </Link>,
              <button
                key="client"
                type="button"
                onClick={() => setClientModal(true)}
                className="h-12 rounded-[10px] px-4 text-[15px] font-medium text-[var(--ink-500)] transition-colors hover:bg-[var(--paper-200)] hover:text-[var(--ink-700)] active:scale-[0.97]"
              >
                عميل جديد
              </button>,
            ].map((btn, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 + i * 0.09, duration: 0.35, ease: EASE }}
              >
                {btn}
              </motion.span>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ---------------- Section 2: KPI row ---------------- */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="عروض هذا الشهر"
          value={24}
          delta={{ label: '+18%', tone: 'success' }}
          delay={0.1}
          onClick={() => navigate('/devis?month=current')}
          chart={
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={SPARK1}>
                <Line type="monotone" dataKey="v" stroke="#0284C7" strokeWidth={2} dot={false} isAnimationActive animationDuration={900} animationBegin={300} />
              </LineChart>
            </ResponsiveContainer>
          }
        />
        <KpiCard
          label="قيمة قيد الانتظار"
          value={1240000}
          format={(n) => `${Math.round(n).toLocaleString('en-US')} دج`}
          delta={{ label: '8 عروض', tone: 'slate' }}
          delay={0.18}
          onClick={() => navigate('/devis?status=sent')}
          chart={
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={SPARK2}>
                <Bar dataKey="v" fill="#0284C7" radius={[3, 3, 0, 0]} isAnimationActive animationDuration={900} animationBegin={300} />
              </BarChart>
            </ResponsiveContainer>
          }
        />
        <KpiCard
          label="نسبة القبول"
          value={68}
          format={(n) => `${Math.round(n)}%`}
          delta={{ label: '+5 نقاط', tone: 'success' }}
          delay={0.26}
          chart={
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={SPARK3}>
                <Area type="monotone" dataKey="v" stroke="#16A34A" fill="#16A34A" fillOpacity={0.15} strokeWidth={2} isAnimationActive animationDuration={900} animationBegin={300} />
              </AreaChart>
            </ResponsiveContainer>
          }
        />
        <KpiCard
          label="متوسط الهدر"
          value={9.4}
          format={(n) => `${n.toFixed(1)}%`}
          delta={{ label: '-2.1%', tone: 'success' }}
          delay={0.34}
          onClick={() => navigate('/montage')}
          chart={
            <div className="flex justify-start">
              <WasteMeter percent={9.4} size={110} />
            </div>
          }
        />
      </div>

      {/* ---------------- Section 3: main grid ---------------- */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.45, ease: EASE }}>
          <SectionCard
            title="أحدث عروض الأسعار"
            actions={
              <Link to="/devis" className="flex items-center gap-1 text-[13px] font-medium text-[var(--cyan-600)] transition-colors hover:text-[var(--cyan-500)]">
                عرض الكل
                <ArrowLeft size={14} />
              </Link>
            }
          >
            <DataTable
              columns={columns}
              rows={recent}
              rowKey={(r) => r.id}
              onRowClick={() => navigate('/devis')}
              rowActions={(r) => (
                <>
                  <button type="button" title="معاينة" onClick={(e) => { e.stopPropagation(); navigate('/devis'); }} className="grid h-7 w-7 place-items-center rounded-[6px] text-[var(--ink-400)] hover:bg-white hover:text-[var(--ink-700)]">
                    <Eye size={15} />
                  </button>
                  <button type="button" title="PDF" onClick={(e) => { e.stopPropagation(); toast.success('تم تصدير PDF'); }} className="grid h-7 w-7 place-items-center rounded-[6px] text-[var(--ink-400)] hover:bg-white hover:text-[var(--ink-700)]">
                    <FileDown size={15} />
                  </button>
                  <button type="button" title="نسخ" onClick={(e) => { e.stopPropagation(); duplicate(r); }} className="grid h-7 w-7 place-items-center rounded-[6px] text-[var(--ink-400)] hover:bg-white hover:text-[var(--ink-700)]">
                    <Copy size={15} />
                  </button>
                </>
              )}
              empty={
                <EmptyState
                  image="/empty-quotes.svg"
                  title="لا توجد عروض أسعار بعد"
                  helper="أنشئ أول عرض سعر في دقائق — المونتاج الذكي يحسب التكلفة تلقائيًا."
                  action={
                    <Link to="/devis/new" className="flex h-10 items-center gap-1.5 rounded-[10px] bg-[var(--cyan-600)] px-4 text-[14px] font-semibold text-white hover:bg-[var(--cyan-500)]">
                      <Plus size={16} />
                      أنشئ أول Devis
                    </Link>
                  }
                />
              }
            />
          </SectionCard>
        </motion.div>

        <div className="space-y-6">
          {/* 3b services demand */}
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.45, ease: EASE }}>
            <SectionCard title="الخدمات الأكثر طلبًا">
              <p className="-mt-1 mb-4 text-[11px] tracking-[0.04em] text-[var(--ink-400)]">آخر 30 يوم</p>
              <ul className="space-y-3">
                {DEMAND.map((d, i) => (
                  <li key={d.name} className="group cursor-pointer" title="آخر عرض: D-2025-0141 — قبل 3 أيام" onClick={() => navigate('/builder')}>
                    <div className="mb-1 flex items-center justify-between text-[13px]">
                      <span dir="ltr" className="font-latin font-medium text-[var(--ink-700)]">{d.name}</span>
                      <span dir="ltr" className="font-latin font-semibold text-[var(--ink-900)] tabular-nums">{d.count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--paper-100)]">
                      <motion.div
                        className="h-full rounded-full transition-colors group-hover:brightness-110"
                        style={{ backgroundColor: d.color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${(d.count / 42) * 100}%` }}
                        transition={{ delay: 0.3 + i * 0.1, duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </motion.div>

          {/* 3c alerts */}
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.45, ease: EASE }}>
            <SectionCard
              title="تنبيهات"
              accent="warning"
              actions={
                <span dir="ltr" className="font-latin rounded-full bg-[#D97706]/10 px-2 py-0.5 text-[11px] font-semibold text-[#B45309] tabular-nums">
                  {alerts.length}
                </span>
              }
            >
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {alerts.map((a, i) => {
                    const Icon = a.icon === 'triangle' ? AlertTriangle : a.icon === 'ruler' ? Ruler : TrendingUp;
                    return (
                      <motion.li
                        key={a.id}
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
                        transition={{ delay: i * 0.09, duration: 0.3 }}
                        className="flex items-center gap-3 overflow-hidden rounded-[10px] border border-[var(--line)] bg-[var(--paper-50)] px-3 py-2.5"
                      >
                        <motion.span
                          initial={{ rotate: 0 }}
                          animate={{ rotate: [0, -4, 4, 0] }}
                          transition={{ delay: 1, duration: 0.4 }}
                          className="text-[#D97706]"
                        >
                          <Icon size={17} />
                        </motion.span>
                        <span className="min-w-0 flex-1 text-[13px] leading-5 text-[var(--ink-700)]">{a.text}</span>
                        <button type="button" onClick={() => navigate(a.to)} className="shrink-0 text-[13px] font-medium text-[var(--cyan-600)] hover:underline">
                          {a.action}
                        </button>
                        <button type="button" aria-label="تجاهل" onClick={() => dismiss(a.id)} className="grid h-6 w-6 shrink-0 place-items-center rounded-[6px] text-[var(--ink-400)] hover:bg-[var(--paper-200)]">
                          <X size={13} />
                        </button>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </SectionCard>
          </motion.div>
        </div>
      </div>

      {/* ---------------- Section 4: chart + onboarding ---------------- */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
        <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-15%' }} transition={{ duration: 0.45, ease: EASE }}>
          <SectionCard
            title="نشاط الأسبوع"
            actions={
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSeries((s) => ({ ...s, offers: !s.offers }))}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-opacity ${series.offers ? 'border-[var(--line)] text-[var(--ink-700)]' : 'border-[var(--line)] text-[var(--ink-400)] opacity-50'}`}
                >
                  <span className="h-2 w-2 rounded-full bg-[#0284C7]" />
                  عروض
                </button>
                <button
                  type="button"
                  onClick={() => setSeries((s) => ({ ...s, accepted: !s.accepted }))}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-opacity ${series.accepted ? 'border-[var(--line)] text-[var(--ink-700)]' : 'border-[var(--line)] text-[var(--ink-400)] opacity-50'}`}
                >
                  <span className="h-2 w-2 rounded-full bg-[#16A34A]" />
                  مقبولة
                </button>
              </div>
            }
          >
            <div dir="ltr" className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={WEEK} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="#E6E2D6" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: '#9AA1AF', fontSize: 12, fontFamily: 'Cairo' }} axisLine={{ stroke: '#E6E2D6' }} tickLine={false} />
                  <YAxis tick={{ fill: '#9AA1AF', fontSize: 11, fontFamily: 'Space Grotesk' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(21,23,30,0.04)' }}
                    contentStyle={{ background: '#fff', border: '1px solid #E6E2D6', borderRadius: 10, boxShadow: 'var(--shadow-pop)', fontFamily: 'Cairo', fontSize: 13 }}
                    formatter={(value: number, name: string) => [value, name === 'offers' ? 'عروض' : 'مقبولة']}
                  />
                  {series.offers && <Bar dataKey="offers" fill="#0284C7" radius={[6, 6, 0, 0]} barSize={26} isAnimationActive animationDuration={600} />}
                  {series.accepted && <Line type="monotone" dataKey="accepted" stroke="#16A34A" strokeWidth={2.5} dot={{ r: 3.5, fill: '#16A34A' }} isAnimationActive animationDuration={1000} animationBegin={400} />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-15%' }} transition={{ delay: 0.2, duration: 0.45, ease: EASE }}>
          <OnboardingChecklist
            title="ابدأ في 4 خطوات"
            footerNote="تختفي هذه القائمة عند إكمالها."
            items={[
              { id: 'c1', label: 'أضف أول عميل', done: true },
              { id: 'c2', label: 'أنشئ أول Devis', done: true },
              { id: 'c3', label: 'جرّب المونتاج الذكي', done: false, action: { label: 'فتح', onClick: () => navigate('/montage') } },
              { id: 'c4', label: 'راجع قواعد الأسعار', done: false, action: { label: 'فتح', onClick: () => navigate('/settings#rules') } },
            ]}
          />
        </motion.div>
      </div>

      {/* ---------------- new-client modal (shared a11y Modal) ---------------- */}
      <Modal
        open={clientModal}
        onClose={() => setClientModal(false)}
        title="عميل جديد"
        size="sm"
        footer={
          <>
            <Btn variant="secondary" onClick={() => setClientModal(false)}>
              إلغاء
            </Btn>
            <Btn type="submit" form="home-new-client-form">
              حفظ العميل
            </Btn>
          </>
        }
      >
        <form
          id="home-new-client-form"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setClientModal(false);
            toast.success('تمت إضافة العميل');
          }}
        >
          <div>
            <FieldLabel required htmlFor="home-client-name">اسم العميل</FieldLabel>
            <input id="home-client-name" required placeholder="اسم العميل" className={inputCls} />
          </div>
          <div>
            <FieldLabel htmlFor="home-client-phone">الهاتف</FieldLabel>
            <input id="home-client-phone" placeholder="0550 12 34 56" dir="ltr" className={`${inputCls} font-latin`} />
          </div>
          <div>
            <FieldLabel htmlFor="home-client-email">البريد الإلكتروني</FieldLabel>
            <input id="home-client-email" placeholder="client@mail.dz" dir="ltr" type="email" className={`${inputCls} font-latin`} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
