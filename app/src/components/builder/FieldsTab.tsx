import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  GripVertical,
  Hash,
  List,
  Plus,
  Ruler,
  ToggleLeft,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { DeltaUnit, FieldOption, FieldType, Service, ServiceField } from '@/lib/types';
import { uid } from '@/lib/storage';
import { DELTA_UNIT_LABELS } from '@/lib/units';
import PriceChip from '@/components/ds/PriceChip';
import YesNoToggle from '@/components/ds/YesNoToggle';
import { Btn, Chip, FieldLabel, inputCls } from '@/components/settings/Overlay';
import { cn } from '@/lib/utils';

const TYPE_META: Record<FieldType | 'longtext', { label: string; icon: LucideIcon; example: string }> = {
  number: { label: 'رقم', icon: Hash, example: 'كمية، عرض، مساحة' },
  dimensions: { label: 'مجموعة أبعاد', icon: Ruler, example: 'عرض × ارتفاع × وحدة' },
  select: { label: 'قائمة اختيار', icon: List, example: 'نوع ورق، نوع قص' },
  yesno: { label: 'نعم/لا', icon: ToggleLeft, example: 'خدمة إضافية اختيارية' },
  text: { label: 'نص', icon: Type, example: 'مرجع، اسم ملف' },
  longtext: { label: 'نص طويل', icon: AlignLeft, example: 'ملاحظة للإنتاج' },
};

const RULE_LINKS: Record<string, string> = {
  quantity: 'أساس كل الحسابات',
  paper: 'سعر الورق',
  faces: 'سعر الوجه/الوجهين',
  format: 'المونتاج',
  pelliculage: 'تشطيب',
};

interface Props {
  service: Service;
  onUpdate: (patch: Partial<Service>) => void;
}

export default function FieldsTab({ service, onUpdate }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(service.fields[0]?.id ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);

  const fields = service.fields;
  const selected = fields.find((f) => f.id === selectedId) ?? null;

  const setFields = (next: ServiceField[]) => onUpdate({ fields: next });

  const patchField = (id: string, patch: Partial<ServiceField>) =>
    setFields(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const move = (id: string, dir: -1 | 1) => {
    const idx = fields.findIndex((f) => f.id === id);
    const to = idx + dir;
    if (idx === -1 || to < 0 || to >= fields.length) return;
    const next = [...fields];
    next.splice(to, 0, next.splice(idx, 1)[0]);
    setFields(next);
  };

  const addField = (type: FieldType | 'longtext') => {
    const realType: FieldType = type === 'longtext' ? 'text' : type;
    const f: ServiceField = {
      id: uid('field'),
      label: TYPE_META[type].label === 'نص طويل' ? 'ملاحظة' : 'حقل جديد',
      type: realType,
      required: false,
      ...(realType === 'select'
        ? { options: [{ id: uid('opt'), label: 'خيار أول', priceDelta: 0, deltaUnit: 'perCopy' as const }] }
        : {}),
      ...(realType === 'dimensions' ? { defaultValue: { widthMm: 100, heightMm: 100 } } : {}),
      ...(realType === 'yesno' ? { defaultValue: false } : {}),
    };
    setFields([...fields, f]);
    setPickerOpen(false);
    setSelectedId(f.id);
    setFlashId(f.id);
    setTimeout(() => setFlashId(null), 900);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[55%_1fr]">
      {/* ----------------------------- field list ----------------------------- */}
      <div>
        <div className="space-y-1.5">
          <AnimatePresence initial={false}>
            {fields.map((f, i) => {
              const meta = TYPE_META[f.type];
              const Icon = meta.icon;
              const activeSel = f.id === selectedId;
              return (
                <motion.div
                  key={f.id}
                  layout="position"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.3, delay: Math.min(i * 0.045, 0.3) }}
                  onClick={() => setSelectedId(f.id)}
                  className={cn(
                    'group flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2.5 transition-colors',
                    activeSel ? 'border-[var(--cyan-600)] bg-[var(--cyan-50)]' : 'border-[var(--line)] bg-white hover:bg-[var(--paper-100)]',
                    flashId === f.id && 'bg-[var(--cyan-100)]',
                  )}
                >
                  <GripVertical size={14} className="shrink-0 text-[var(--ink-400)] opacity-0 transition-opacity group-hover:opacity-100" />
                  <Chip tint={activeSel ? 'cyan' : 'paper'}>
                    <Icon size={11} />
                    {meta.label}
                  </Chip>
                  <span className={cn('min-w-0 flex-1 truncate text-[14px]', activeSel ? 'font-semibold text-[var(--ink-900)]' : 'text-[var(--ink-700)]')}>
                    {f.label}
                  </span>
                  <span className={cn('text-[11px]', f.required ? 'text-[var(--magenta-600)]' : 'text-[var(--ink-400)]')}>
                    {f.required ? 'مطلوب' : 'اختياري'}
                  </span>
                  <span className="hidden max-w-[140px] truncate text-[11px] text-[var(--ink-400)] lg:block">
                    {RULE_LINKS[f.id] ? `← قاعدة: ${RULE_LINKS[f.id]}` : 'بدون قاعدة'}
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      aria-label="أعلى"
                      onClick={(e) => {
                        e.stopPropagation();
                        move(f.id, -1);
                      }}
                      className="grid h-6 w-6 place-items-center rounded text-[var(--ink-400)] hover:bg-white"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      aria-label="أسفل"
                      onClick={(e) => {
                        e.stopPropagation();
                        move(f.id, 1);
                      }}
                      className="grid h-6 w-6 place-items-center rounded text-[var(--ink-400)] hover:bg-white"
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      type="button"
                      aria-label="حذف"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFields(fields.filter((x) => x.id !== f.id));
                        if (selectedId === f.id) setSelectedId(null);
                      }}
                      className="grid h-6 w-6 place-items-center rounded text-[var(--ink-400)] hover:bg-white hover:text-[var(--danger-600)]"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <div className="relative mt-3">
          <Btn variant="secondary" size="sm" onClick={() => setPickerOpen((v) => !v)}>
            <Plus size={14} /> إضافة حقل
          </Btn>
          <AnimatePresence>
            {pickerOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className="absolute z-30 mt-2 grid w-full max-w-md grid-cols-2 gap-2 rounded-[14px] border border-[var(--line)] bg-white p-3 shadow-[var(--shadow-pop)] sm:grid-cols-3"
              >
                {(Object.keys(TYPE_META) as (FieldType | 'longtext')[]).map((t, i) => {
                  const m = TYPE_META[t];
                  return (
                    <motion.button
                      key={t}
                      type="button"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.2, delay: i * 0.04 }}
                      onClick={() => addField(t)}
                      className="flex flex-col items-start gap-1 rounded-[10px] border border-[var(--line)] p-3 text-start transition-colors hover:border-[var(--cyan-600)] hover:bg-[var(--cyan-50)]"
                    >
                      <m.icon size={17} className="text-[var(--cyan-600)]" />
                      <span className="text-[13px] font-semibold text-[var(--ink-900)]">{m.label}</span>
                      <span className="text-[10px] leading-3.5 text-[var(--ink-400)]">{m.example}</span>
                    </motion.button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ---------------------------- config card ----------------------------- */}
      <AnimatePresence mode="wait">
        {selected ? (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="h-fit rounded-[14px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-card)]"
          >
            <h4 className="mb-3 text-[15px] font-semibold text-[var(--ink-900)]">إعدادات الحقل</h4>
            <div className="space-y-3">
              <div>
                <FieldLabel required>التسمية</FieldLabel>
                <input value={selected.label} onChange={(e) => patchField(selected.id, { label: e.target.value })} className={inputCls} />
              </div>
              <div>
                <FieldLabel>التسمية الفرنسية (اختياري)</FieldLabel>
                <input
                  dir="ltr"
                  value={selected.latinName ?? ''}
                  onChange={(e) => patchField(selected.id, { latinName: e.target.value || undefined })}
                  placeholder="Pelliculage Mat"
                  className={cn(inputCls, 'font-latin')}
                />
              </div>
              <YesNoToggle
                checked={!!selected.required}
                onChange={(v) => patchField(selected.id, { required: v })}
                label="حقل مطلوب"
              />
              <div>
                <FieldLabel>نص مساعد (يظهر كتلميح بجانب الحقل)</FieldLabel>
                <input
                  value={selected.placeholder ?? ''}
                  onChange={(e) => patchField(selected.id, { placeholder: e.target.value || undefined })}
                  className={inputCls}
                />
              </div>
              {selected.type === 'number' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <FieldLabel>الحد الأدنى</FieldLabel>
                    <input
                      dir="ltr"
                      inputMode="decimal"
                      value={selected.min ?? ''}
                      onChange={(e) => patchField(selected.id, { min: Number(e.target.value) || undefined })}
                      className={cn(inputCls, 'font-latin')}
                    />
                  </div>
                  <div>
                    <FieldLabel>الخطوة</FieldLabel>
                    <input
                      dir="ltr"
                      inputMode="decimal"
                      value={selected.step ?? ''}
                      onChange={(e) => patchField(selected.id, { step: Number(e.target.value) || undefined })}
                      className={cn(inputCls, 'font-latin')}
                    />
                  </div>
                </div>
              )}
              {selected.type === 'dimensions' && (
                <div>
                  <FieldLabel>الوحدة الافتراضية</FieldLabel>
                  <div dir="ltr" className="flex w-32 overflow-hidden rounded-[8px] border border-[var(--line-strong)]">
                    {(['mm', 'cm'] as const).map((u) => (
                      <span key={u} className={cn('font-latin flex-1 py-1.5 text-center text-[12px] font-semibold', u === 'mm' ? 'bg-[var(--cyan-600)] text-white' : 'bg-white text-[var(--ink-500)]')}>
                        {u}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--ink-400)]">التخزين الداخلي بالمليمتر دائمًا — التحويل تلقائي.</p>
                </div>
              )}
              {selected.type === 'select' && (
                <OptionsEditor field={selected} onChange={(opts) => patchField(selected.id, { options: opts })} />
              )}
              {selected.type === 'yesno' && (
                <YesNoDeltaEditor field={selected} onChange={(opts) => patchField(selected.id, { options: opts })} />
              )}
              <div>
                <FieldLabel>ربط بقاعدة تسعير</FieldLabel>
                <div className="flex h-10 items-center rounded-[8px] border border-[var(--line)] bg-[var(--paper-100)] px-3 text-[13px] text-[var(--ink-500)]">
                  {RULE_LINKS[selected.id] ? (
                    <Chip tint="cyan">مرتبط: {RULE_LINKS[selected.id]}</Chip>
                  ) : (
                    'بدون قاعدة — لا يؤثر على السعر'
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid h-40 place-items-center rounded-[14px] border border-dashed border-[var(--line-strong)] text-[13px] text-[var(--ink-400)]"
          >
            اختر حقلًا لتحرير إعداداته
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --------------------------- options editor (select) --------------------------

function OptionsEditor({ field, onChange }: { field: ServiceField; onChange: (opts: FieldOption[]) => void }) {
  const options = field.options ?? [];
  const patch = (id: string, p: Partial<FieldOption>) => onChange(options.map((o) => (o.id === id ? { ...o, ...p } : o)));
  const first = options[0];

  return (
    <div>
      <FieldLabel>الخيارات وأسعارها</FieldLabel>
      <div className="space-y-1.5">
        <AnimatePresence initial={false}>
          {options.map((o, idx) => (
            <motion.div
              key={o.id}
              layout="position"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-1.5 rounded-[8px] border border-[var(--line)] bg-[var(--paper-100)]/60 p-1.5"
            >
              <input
                value={o.label}
                onChange={(e) => patch(o.id, { label: e.target.value })}
                className="h-8 min-w-0 flex-1 rounded-[6px] border border-transparent bg-white px-2 text-[13px] outline-none focus:border-[var(--cyan-600)]"
              />
              <select
                value={idx === 0 && o.priceDelta === 0 && o.deltaUnit === 'perCopy' ? 'base' : o.deltaUnit}
                onChange={(e) => {
                  const v = e.target.value;
                  // "أساسي" = الخيار الافتراضي بلا فرق سعر — وإلا طبّق الوحدة المختارة كما هي
                  if (v === 'base') patch(o.id, { priceDelta: 0, deltaUnit: 'perCopy' });
                  else patch(o.id, { deltaUnit: v as DeltaUnit });
                }}
                className="h-8 rounded-[6px] border border-[var(--line)] bg-white px-1 text-[11px] text-[var(--ink-500)] outline-none"
              >
                <option value="base">أساسي</option>
                <option value="perCopy">+ لكل نسخة</option>
                <option value="perSheet">+ لكل ورقة</option>
                <option value="perM2">+ لكل م²</option>
                <option value="fixed">+ ثابت</option>
              </select>
              <input
                dir="ltr"
                inputMode="decimal"
                value={o.priceDelta === 0 ? '' : String(o.priceDelta)}
                placeholder="0"
                onChange={(e) => patch(o.id, { priceDelta: Number(e.target.value.replace(',', '.')) || 0 })}
                className="font-latin h-8 w-16 rounded-[6px] border border-transparent bg-white px-2 text-[12px] outline-none focus:border-[var(--cyan-600)]"
              />
              <span className="text-[10px] text-[var(--ink-400)]">دج</span>
              <button
                type="button"
                aria-label="حذف الخيار"
                onClick={() => onChange(options.filter((x) => x.id !== o.id))}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] text-[var(--ink-400)] hover:bg-white hover:text-[var(--danger-600)]"
              >
                <X size={13} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <Btn
        variant="dashed"
        size="sm"
        className="mt-1.5 w-full"
        onClick={() => onChange([...options, { id: uid('opt'), label: `خيار ${options.length + 1}`, priceDelta: 0, deltaUnit: 'perCopy' }])}
      >
        <Plus size={13} /> إضافة خيار
      </Btn>
      {first && (
        <div className="mt-3 rounded-[10px] border border-[var(--line)] bg-[var(--cyan-50)] p-3">
          <p className="mb-2 text-[11px] text-[var(--ink-500)]">تظهر هكذا في المعالج:</p>
          <PriceChip
            label={first.label}
            latinLabel={first.latinLabel}
            delta={first.priceDelta}
            deltaUnit={first.deltaUnit as keyof typeof DELTA_UNIT_LABELS}
          />
        </div>
      )}
    </div>
  );
}

// ------------------------- yes/no delta editor --------------------------------

function YesNoDeltaEditor({ field, onChange }: { field: ServiceField; onChange: (opts: FieldOption[]) => void }) {
  const opt = field.options?.[0];
  const set = (p: Partial<FieldOption>) => {
    const base: FieldOption = opt ?? { id: uid('opt'), label: field.label, priceDelta: 0, deltaUnit: 'perCopy' };
    onChange([{ ...base, ...p }]);
  };
  return (
    <div>
      <FieldLabel>فرق السعر عند «نعم»</FieldLabel>
      <div className="flex items-center gap-1.5">
        <input
          dir="ltr"
          inputMode="decimal"
          value={opt?.priceDelta ? String(opt.priceDelta) : ''}
          placeholder="0"
          onChange={(e) => set({ priceDelta: Number(e.target.value.replace(',', '.')) || 0 })}
          className={cn(inputCls, 'font-latin w-24')}
        />
        <select
          value={opt?.deltaUnit ?? 'perCopy'}
          onChange={(e) => set({ deltaUnit: e.target.value as DeltaUnit })}
          className="h-10 rounded-[8px] border border-[var(--line-strong)] bg-white px-2 text-[12px] outline-none"
        >
          <option value="perCopy">لكل نسخة</option>
          <option value="perSheet">لكل ورقة</option>
          <option value="perM2">لكل م²</option>
          <option value="fixed">ثابت</option>
        </select>
      </div>
    </div>
  );
}
