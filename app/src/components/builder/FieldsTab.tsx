import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  Check,
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
import type { DimensionPricing, DimensionValue, FieldOption, FieldType, Service, ServiceField } from '@/lib/types';
import { uid } from '@/lib/storage';
import { isQuantityField } from '@/lib/pricing-engine';
import { trimNumber } from '@/lib/units';
import YesNoToggle from '@/components/ds/YesNoToggle';
import { Btn, Chip, FieldLabel, inputCls } from '@/components/settings/Overlay';
import { cn } from '@/lib/utils';

const TYPE_META: Record<FieldType, { label: string; icon: LucideIcon; example: string }> = {
  number: { label: 'رقم', icon: Hash, example: 'كمية، عرض، مساحة' },
  dimensions: { label: 'أبعاد / مساحة', icon: Ruler, example: 'عرض × ارتفاع × وحدة' },
  select: { label: 'قائمة اختيار', icon: List, example: 'نوع ورق، نوع قص' },
  yesno: { label: 'نعم/لا', icon: ToggleLeft, example: 'خدمة إضافية اختيارية' },
  text: { label: 'نص / ملاحظة', icon: Type, example: 'مرجع، اسم ملف، ملاحظة' },
};

const RULE_LINKS: Record<string, string> = {
  quantity: 'أساس كل الحسابات',
  paper: 'سعر الورق',
  faces: 'سعر الوجه/الوجهين',
  format: 'المونتاج',
  pelliculage: 'تشطيب',
};

function uniqueFieldId(service: Service, base: string): string {
  if (!service.fields.some((field) => field.id === base)) return base;
  return uid(base);
}

function defaultDeltaUnit(basis: ServiceBasis): FieldOption['deltaUnit'] {
  return basis === 'perM2' ? 'perM2' : basis === 'perCm2' ? 'perCm2' : basis === 'fixed' ? 'fixed' : 'perCopy';
}

function defaultDimensionForBasis(basis: ServiceBasis): DimensionValue {
  return basis === 'perM2' ? { widthMm: 1000, heightMm: 1000 } : { widthMm: 100, heightMm: 100 };
}

function defaultLabelForType(type: FieldType, basis: ServiceBasis, fields: ServiceField[]): string {
  if (type === 'number') return fields.some(isQuantityField) ? 'رقم جديد' : 'الكمية';
  if (type === 'dimensions') return basis === 'perM2' ? 'الأبعاد' : 'مقاس المنتج';
  if (type === 'select') return basis === 'perM2' ? 'الخامة' : 'اختيار جديد';
  if (type === 'yesno') return 'خدمة إضافية';
  return 'ملاحظة';
}

function isDimensionValue(value: unknown): value is DimensionValue {
  return typeof value === 'object' && value !== null && 'widthMm' in value && 'heightMm' in value;
}

function areaText(value: unknown): string | null {
  if (!isDimensionValue(value)) return null;
  const m2 = (value.widthMm / 1000) * (value.heightMm / 1000);
  const cm2 = (value.widthMm / 10) * (value.heightMm / 10);
  if (!Number.isFinite(m2) || m2 <= 0) return null;
  return `${trimNumber(m2)} م² · ${trimNumber(cm2)} سم²`;
}

interface Props {
  service: Service;
  pricingBasis: ServiceBasis;
  onUpdate: (patch: Partial<Service>) => void;
}

type ServiceBasis = 'perCopy' | 'perM2' | 'perCm2' | 'fixed';

export default function FieldsTab({ service, pricingBasis, onUpdate }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(service.fields[0]?.id ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);

  const fields = service.fields;
  const selected = fields.find((f) => f.id === selectedId) ?? null;
  const areaPriceActive =
    service.dimensionPricing?.mode === 'perM2' ||
    service.dimensionPricing?.mode === 'perCm2' ||
    fields.some((field) => field.options?.some((option) => option.deltaUnit === 'perM2')) ||
    fields.some((field) => field.options?.some((option) => option.deltaUnit === 'perCm2')) ||
    service.pricingRuleIds.some((ruleId) => ruleId.toLowerCase().includes('m2'));

  const setFields = (next: ServiceField[]) => {
    const pricingFieldStillExists =
      service.dimensionPricing &&
      next.some((field) => field.id === service.dimensionPricing?.fieldId && field.type === 'dimensions');
    onUpdate({
      fields: next,
      ...(service.dimensionPricing && !pricingFieldStillExists ? { dimensionPricing: undefined } : {}),
    });
  };

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

  const addPreparedField = (field: ServiceField) => {
    setFields([...fields, field]);
    setPickerOpen(false);
    setSelectedId(field.id);
    setFlashId(field.id);
    setTimeout(() => setFlashId(null), 900);
  };

  const addField = (type: FieldType) => {
    const id = uniqueFieldId(service, type === 'dimensions' ? 'format' : type === 'select' ? 'choice' : type === 'yesno' ? 'extra' : type === 'number' && !fields.some(isQuantityField) ? 'quantity' : 'field');
    const f: ServiceField = {
      id,
      label: defaultLabelForType(type, pricingBasis, fields),
      type,
      required: type === 'dimensions' || (type === 'number' && !fields.some(isQuantityField)),
      ...(type === 'select'
        ? { options: [{ id: uid('opt'), label: 'خيار أول', priceDelta: 0, deltaUnit: defaultDeltaUnit(pricingBasis) }] }
        : {}),
      ...(type === 'dimensions' ? { defaultValue: service.defaultPieceSize ?? defaultDimensionForBasis(pricingBasis) } : {}),
      ...(type === 'yesno'
        ? { defaultValue: false, options: [{ id: uid('opt'), label: defaultLabelForType(type, pricingBasis, fields), priceDelta: 0, deltaUnit: defaultDeltaUnit(pricingBasis) }] }
        : {}),
    };
    addPreparedField(f);
  };

  return (
    <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
      {/* ----------------------------- field list ----------------------------- */}
      <div className="min-w-0">
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
                  <span className="hidden max-w-[140px] truncate text-[11px] text-[var(--ink-400)] 2xl:block">
                    {isQuantityField(f) ? '← قاعدة: أساس كل الحسابات' : RULE_LINKS[f.id] ? `← قاعدة: ${RULE_LINKS[f.id]}` : 'بدون قاعدة'}
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
                className="absolute z-30 mt-2 w-full max-w-md rounded-[14px] border border-[var(--line)] bg-white p-3 shadow-[var(--shadow-pop)]"
              >
                <div className="mb-2 px-1 text-[12px] font-semibold text-[var(--ink-700)]">إضافة حقل</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(Object.keys(TYPE_META) as FieldType[]).map((t, i) => {
                    const m = TYPE_META[t];
                    const label = t === 'number' && !fields.some(isQuantityField) ? 'الكمية' : m.label;
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
                        <span className="text-[13px] font-semibold text-[var(--ink-900)]">{label}</span>
                        <span className="text-[10px] leading-3.5 text-[var(--ink-400)]">{m.example}</span>
                      </motion.button>
                    );
                  })}
                </div>
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
            className="min-w-0 h-fit rounded-[14px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-card)]"
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
                  <div className="mt-2 rounded-[10px] border border-[var(--line)] bg-[var(--paper-100)] px-3 py-2">
                    <div className="text-[11px] text-[var(--ink-400)]">المساحة المحسوبة من القيمة الافتراضية</div>
                    <div dir="ltr" className="font-latin mt-0.5 text-[14px] font-semibold text-[var(--ink-900)]">
                      {areaText(selected.defaultValue) ?? '—'}
                    </div>
                    <p className="mt-1 text-[11px] leading-4 text-[var(--ink-500)]">
                      الحساب الداخلي: العرض × الارتفاع. عند اختيار وحدة دج/م² أو دج/سم² في التسعير تُضرب المساحة في الكمية.
                    </p>
                  </div>
                </div>
              )}
              {selected.type === 'select' && (
                <OptionsEditor
                  field={selected}
                  onChange={(opts) => patchField(selected.id, { options: opts })}
                  onDefaultChange={(value) => patchField(selected.id, { defaultValue: value })}
                />
              )}
              {selected.type === 'yesno' && (
                <YesNoDefaultEditor
                  field={selected}
                  onChange={(patch) => patchField(selected.id, patch)}
                />
              )}
              <div>
                <FieldLabel>ربط بقاعدة تسعير</FieldLabel>
                <PricingLinkCard
                  field={selected}
                  areaPriceActive={areaPriceActive}
                  dimensionPricing={service.dimensionPricing}
                />
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

function PricingLinkCard({
  field,
  areaPriceActive,
  dimensionPricing,
}: {
  field: ServiceField;
  areaPriceActive: boolean;
  dimensionPricing?: DimensionPricing;
}) {
  if (field.type === 'dimensions') {
    const linked = dimensionPricing?.fieldId === field.id && dimensionPricing.mode !== 'none';
    const unitLabel = dimensionPricing?.mode === 'perCm2' ? 'دج/سم²' : 'دج/م²';
    return (
      <div className="rounded-[10px] border border-[var(--line)] bg-[var(--paper-100)] px-3 py-2 text-[12px] leading-5 text-[var(--ink-600)]">
        {linked ? (
          <>
            <Chip tint="cyan">مرتبط: تسعير المساحة · {unitLabel}</Chip>
            <p className="mt-2">
              هذا الحقل يدخل في الحساب: العرض × الارتفاع × الكمية × السعر المحدد في تبويب التسعير.
            </p>
          </>
        ) : areaPriceActive ? (
          <>
            <Chip tint="paper">توجد أسعار مساحة في الخدمة</Chip>
            <p className="mt-2">
              راجع تبويب التسعير وحدد أي حقل أبعاد يستعمله حساب المساحة.
            </p>
          </>
        ) : (
          <>
            <Chip tint="paper">مرتبط بالمونتاج/تقدير الورق فقط</Chip>
            <p className="mt-2">
              لا يؤثر على السعر حاليًا. لتسعيره مثل اللافتات، انتقل إلى تبويب التسعير ثم فعّل “تسعير الأبعاد والمساحة”.
            </p>
          </>
        )}
      </div>
    );
  }

  if (field.type === 'select' || field.type === 'yesno') {
    const hasAreaOption = field.options?.some((option) => option.deltaUnit === 'perM2' || option.deltaUnit === 'perCm2');
    return (
      <div className="rounded-[10px] border border-[var(--line)] bg-[var(--paper-100)] px-3 py-2 text-[12px] leading-5 text-[var(--ink-600)]">
        <Chip tint="cyan">تأثير السعر يُدار من تبويب التسعير</Chip>
        <p className="mt-2">
          {hasAreaOption
            ? 'بعض خيارات هذا الحقل تُحسب بالمساحة، لذلك تحتاج الخدمة إلى حقل أبعاد لحساب العرض × الارتفاع.'
            : 'يمكنك جعل كل خيار بسعر للخدمة، لكل قطعة، لكل ورقة، لكل وجه، نسبة، أو بالمساحة حسب طبيعة الخدمة.'}
        </p>
      </div>
    );
  }

  if (isQuantityField(field) || RULE_LINKS[field.id]) {
    return (
      <div className="flex min-h-10 items-center rounded-[8px] border border-[var(--line)] bg-[var(--paper-100)] px-3 text-[13px] text-[var(--ink-500)]">
        <Chip tint="cyan">مرتبط: {isQuantityField(field) ? RULE_LINKS.quantity : RULE_LINKS[field.id]}</Chip>
      </div>
    );
  }

  return (
    <div className="flex min-h-10 items-center rounded-[8px] border border-[var(--line)] bg-[var(--paper-100)] px-3 text-[13px] text-[var(--ink-500)]">
      بدون قاعدة — لا يؤثر على السعر
    </div>
  );
}

// --------------------------- options editor (select) --------------------------

function OptionsEditor({
  field,
  onChange,
  onDefaultChange,
}: {
  field: ServiceField;
  onChange: (opts: FieldOption[]) => void;
  onDefaultChange: (value: string) => void;
}) {
  const options = field.options ?? [];
  const patch = (id: string, p: Partial<FieldOption>) => onChange(options.map((o) => (o.id === id ? { ...o, ...p } : o)));
  const defaultValue = typeof field.defaultValue === 'string' ? field.defaultValue : options[0]?.id;

  return (
    <div>
      <FieldLabel>الخيارات</FieldLabel>
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
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_88px_28px] items-center gap-1.5 rounded-[8px] border border-[var(--line)] bg-[var(--paper-100)]/60 p-1.5 max-sm:grid-cols-1"
            >
              <input
                value={o.label}
                onChange={(e) => patch(o.id, { label: e.target.value })}
                placeholder={`خيار ${idx + 1}`}
                className="h-8 min-w-0 flex-1 rounded-[6px] border border-transparent bg-white px-2 text-[13px] outline-none focus:border-[var(--cyan-600)]"
              />
              <input
                dir="ltr"
                value={o.latinLabel ?? ''}
                onChange={(e) => patch(o.id, { latinLabel: e.target.value || undefined })}
                placeholder="Nom français"
                className="font-latin h-8 min-w-0 rounded-[6px] border border-transparent bg-white px-2 text-[12px] outline-none focus:border-[var(--cyan-600)]"
              />
              <button
                type="button"
                onClick={() => onDefaultChange(o.id)}
                className={cn(
                  'inline-flex h-8 items-center justify-center gap-1 rounded-[6px] border px-2 text-[11px] font-medium transition-colors',
                  defaultValue === o.id
                    ? 'border-[var(--cyan-600)] bg-[var(--cyan-50)] text-[var(--cyan-600)]'
                    : 'border-[var(--line)] bg-white text-[var(--ink-500)] hover:bg-[var(--paper-100)]',
                )}
              >
                {defaultValue === o.id && <Check size={12} />}
                افتراضي
              </button>
              <button
                type="button"
                aria-label="حذف الخيار"
                onClick={() => {
                  const next = options.filter((x) => x.id !== o.id);
                  onChange(next);
                  if (defaultValue === o.id && next[0]) onDefaultChange(next[0].id);
                }}
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
      <p className="mt-2 text-[11px] leading-4 text-[var(--ink-400)]">
        هذا القسم يحدد ما يظهر داخل القالب فقط. تأثير كل خيار على السعر يُعدّل من تبويب التسعير.
      </p>
    </div>
  );
}

// ------------------------- yes/no default editor ------------------------------

function YesNoDefaultEditor({
  field,
  onChange,
}: {
  field: ServiceField;
  onChange: (patch: Partial<ServiceField>) => void;
}) {
  return (
    <div>
      <FieldLabel>القيمة الافتراضية</FieldLabel>
      <div className="rounded-[10px] border border-[var(--line)] bg-[var(--paper-100)] px-3 py-2.5">
        <YesNoToggle
          checked={field.defaultValue === true}
          onChange={(value) => onChange({ defaultValue: value })}
          label="مفعّل افتراضيًا"
          showPrice={false}
        />
      </div>
      <p className="mt-2 text-[11px] leading-4 text-[var(--ink-400)]">
        سعر حالة «نعم» يُعدّل من تبويب التسعير.
      </p>
    </div>
  );
}
