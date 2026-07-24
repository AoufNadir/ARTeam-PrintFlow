import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Upload } from 'lucide-react';
import { toast } from 'sonner';
import SectionCard from '@/components/ds/SectionCard';
import { useUnit } from '@/components/layout-context';
import { Btn, FieldLabel, inputCls } from './Overlay';
import { cn } from '@/lib/utils';

interface CompanyForm {
  name: string;
  activity: string;
  phone: string;
  email: string;
  address: string;
  currency: string;
  /** الشعار كـ data URL (يُحفظ مع بيانات الشركة) — فارغ = الشعار الافتراضي */
  logo?: string;
}

const KEY = 'arteam-printflow:settings-company';

function load(): CompanyForm {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<CompanyForm>) };
  } catch {
    /* ignore */
  }
  return DEFAULTS;
}

const DEFAULTS: CompanyForm = {
  name: 'مطبعة ARTeam',
  activity: 'digital',
  phone: '021 12 34 56',
  email: 'contact@arteam.dz',
  address: 'حي الأعمال، الجزائر العاصمة',
  currency: 'دج',
};

const ACTIVITIES = [
  { id: 'digital', label: 'طباعة رقمية' },
  { id: 'offset', label: 'أوفست' },
  { id: 'grand-format', label: 'Grand Format' },
  { id: 'mixed', label: 'مركّبة' },
];

/** Section 1 — الشركة (#company). */
export default function CompanySection() {
  const [form, setForm] = useState<CompanyForm>(load);
  const [saved, setSaved] = useState<CompanyForm>(load);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // الوحدة الافتراضية مصدرها الوحيد هو سياق التخطيط العام (نفس ما تعرضه صفحة الوحدات)
  const { unit, setUnit } = useUnit();
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  const set = <K extends keyof CompanyForm>(k: K, v: CompanyForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = () => {
    localStorage.setItem(KEY, JSON.stringify(form));
    setSaved(form);
    toast.success('حُفظت بيانات الشركة');
  };

  const readLogo = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('الملف ليس صورة — اختر PNG أو SVG أو JPG');
      return;
    }
    if (file.size > 512 * 1024) {
      toast.error('حجم الشعار يتجاوز 512 ك.ب — صغّر الصورة أولًا');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      set('logo', String(reader.result));
      toast.success('أُرفق الشعار — احفظ التغييرات لتثبيته');
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      <SectionCard title="الشركة">
        <div className="grid gap-4 md:grid-cols-2">
          {/* logo drop zone */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.045 }}
            role="button"
            tabIndex={0}
            aria-label="رفع شعار الشركة"
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              readLogo(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              'relative flex h-[120px] cursor-pointer items-center justify-center gap-3 rounded-[12px] border border-dashed transition-all md:row-span-2',
              dragOver ? 'scale-[1.02] border-[var(--cyan-500)] bg-[var(--cyan-50)]' : 'border-[var(--line-strong)] bg-[var(--paper-100)]',
            )}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                readLogo(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <img src={form.logo || '/logo.svg'} alt="شعار الشركة" className="h-12 w-12 rounded-[8px] object-contain" />
            <div className="text-[12px] text-[var(--ink-500)]">
              <Upload size={14} className="mb-1 text-[var(--ink-400)]" />
              اسحب أو انقر للرفع
            </div>
          </motion.div>

          {[
            { el: <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} />, label: 'اسم الشركة' },
            {
              el: (
                <select value={form.activity} onChange={(e) => set('activity', e.target.value)} className={inputCls}>
                  {ACTIVITIES.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              ),
              label: 'النشاط',
            },
            {
              el: <input dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={cn(inputCls, 'font-latin')} />,
              label: 'الهاتف',
            },
            {
              el: <input dir="ltr" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={cn(inputCls, 'font-latin')} />,
              label: 'البريد',
            },
            { el: <input value={form.address} onChange={(e) => set('address', e.target.value)} className={inputCls} />, label: 'العنوان' },
            {
              el: (
                <div className="grid grid-cols-2 gap-3">
                  <select value={form.currency} onChange={(e) => set('currency', e.target.value)} className={inputCls}>
                    <option value="دج">دج</option>
                    <option value="DA">DA</option>
                  </select>
                  <div className="flex h-10 items-center rounded-[8px] border border-[var(--line)] bg-[var(--paper-100)] px-3 text-[13px] text-[var(--ink-500)]">
                    العربية
                  </div>
                </div>
              ),
              label: 'العملة + اللغة',
            },
            {
              el: (
                <div dir="ltr" className="flex w-40 overflow-hidden rounded-[8px] border border-[var(--line-strong)]">
                  {(['mm', 'cm'] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUnit(u)}
                      className={cn(
                        'font-latin flex-1 py-2 text-[12px] font-semibold transition-colors',
                        unit === u ? 'bg-[var(--cyan-600)] text-white' : 'bg-white text-[var(--ink-500)] hover:bg-[var(--paper-100)]',
                      )}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              ),
              label: 'الوحدة الافتراضية',
            },
          ].map((f, i) => (
            <motion.div key={f.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.09 + i * 0.045 }}>
              <FieldLabel>{f.label}</FieldLabel>
              {f.el}
            </motion.div>
          ))}
          <p className="text-[11px] text-[var(--ink-400)] md:col-span-2">المصطلحات الفرنسية مدعومة دائمًا بجانب العربية.</p>
        </div>
      </SectionCard>

      {/* dirty save bar */}
      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.25 }}
            className="sticky bottom-4 z-30 mt-4 flex items-center gap-2 rounded-[12px] border border-[var(--line)] bg-white px-4 py-3 shadow-[var(--shadow-pop)]"
          >
            <Check size={15} className="text-[var(--warning-600)]" />
            <span className="flex-1 text-[13px] text-[var(--ink-700)]">لديك تغييرات غير محفوظة</span>
            <Btn variant="ghost" size="sm" onClick={() => setForm(saved)}>
              تجاهل
            </Btn>
            <Btn size="sm" onClick={save}>
              حفظ التغييرات
            </Btn>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
