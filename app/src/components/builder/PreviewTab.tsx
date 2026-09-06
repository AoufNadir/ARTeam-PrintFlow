import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { DimensionValue, ProductionStageKind, Service, ServiceStageTemplate } from '@/lib/types';
import { db } from '@/lib/storage';
import { formatDA } from '@/lib/units';
import { firstQuantityFieldId, isQuantityField, priceItem, readServiceQuantity, type FieldValues } from '@/lib/pricing-engine';
import DimensionGroup from '@/components/ds/DimensionGroup';
import NumberField from '@/components/ds/NumberField';
import SelectWithPrice from '@/components/ds/SelectWithPrice';
import YesNoToggle from '@/components/ds/YesNoToggle';
import { useUnit } from '@/components/layout-context';
import { CropMarks } from '@/components/ds/SectionCard';
import { Chip, inputCls } from '@/components/settings/Overlay';

interface Props {
  service: Service;
  rulesKey: number;
}

function defaultValues(service: Service): FieldValues {
  const out: FieldValues = {};
  for (const f of service.fields) {
    if (f.defaultValue !== undefined) out[f.id] = f.defaultValue;
    else if (f.type === 'number') out[f.id] = f.min ?? 100;
    else if (f.type === 'yesno') out[f.id] = false;
    else if (f.type === 'select') out[f.id] = f.options?.[0]?.id ?? '';
    else if (f.type === 'dimensions') out[f.id] = { widthMm: 100, heightMm: 100 };
    else out[f.id] = '';
  }
  return out;
}

/** Tab 4 — live wizard preview + price ticker. */
export default function PreviewTab({ service, rulesKey }: Props) {
  const { unit, setUnit } = useUnit();
  const [values, setValues] = useState<FieldValues>(() => defaultValues(service));
  const [testQty, setTestQty] = useState(1000);

  // reset when switching services (or when its fields change) —
  // state adjusted during render (React-sanctioned pattern; no effect needed)
  const [prevService, setPrevService] = useState({ id: service.id, fields: service.fields });
  if (prevService.id !== service.id || prevService.fields !== service.fields) {
    setPrevService({ id: service.id, fields: service.fields });
    setValues(defaultValues(service));
  }

  const price = useMemo(() => {
    const rules = db.currentRules();
    const vals = { ...values };
    const quantityId = firstQuantityFieldId(service);
    const currentQuantity = quantityId ? vals[quantityId] : vals.quantity;
    if (typeof currentQuantity !== 'number' || !currentQuantity) {
      if (quantityId) vals[quantityId] = testQty;
      else vals.quantity = testQty;
    }
    return priceItem(service, vals, rules);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, values, testQty, rulesKey]);

  const previewQuantity = useMemo(() => {
    const quantityId = firstQuantityFieldId(service);
    const vals = { ...values };
    const currentQuantity = quantityId ? vals[quantityId] : vals.quantity;
    if (typeof currentQuantity !== 'number' || !currentQuantity) {
      if (quantityId) vals[quantityId] = testQty;
      else vals.quantity = testQty;
    }
    return readServiceQuantity(service, vals);
  }, [service, values, testQty]);

  const set = (id: string, v: string | number | boolean | DimensionValue) => setValues((prev) => ({ ...prev, [id]: v }));

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
      {/* wizard preview */}
      <motion.div
        key={`${service.id}-${service.fields.length}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="relative rounded-[14px] border border-[var(--line)] bg-white p-5 shadow-[var(--shadow-card)]"
      >
        <CropMarks opacity={0.3} />
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-[14px] font-semibold text-[var(--ink-900)]">كما تظهر في معالج Devis</h4>
          <span className="rounded-full bg-[var(--paper-100)] px-2 py-0.5 text-[10px] text-[var(--ink-400)]">الخطوة 4 — الحقول</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <AnimatePresence initial={false}>
            {service.fields.map((f) => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={f.type === 'text' ? 'sm:col-span-2' : ''}
              >
                {f.type === 'number' && (
                  <NumberField
                    label={f.label + (f.required ? ' *' : '')}
                    value={typeof values[f.id] === 'number' ? (values[f.id] as number) : undefined}
                    onChange={(v) => set(f.id, v)}
                    presets={isQuantityField(f) ? [100, 250, 500, 1000] : undefined}
                    min={f.min}
                    step={f.step}
                  />
                )}
                {f.type === 'dimensions' && (
                  <DimensionGroup
                    label={f.label + (f.required ? ' *' : '')}
                    unit={unit}
                    onUnitChange={setUnit}
                    value={(values[f.id] as DimensionValue) ?? { widthMm: 100, heightMm: 100 }}
                    onChange={(v) => set(f.id, v)}
                  />
                )}
                {f.type === 'select' && (
                  <SelectWithPrice
                    label={f.label + (f.required ? ' *' : '')}
                    options={f.options ?? []}
                    value={typeof values[f.id] === 'string' ? (values[f.id] as string) : undefined}
                    onChange={(id) => set(f.id, id)}
                    showPrices={false}
                  />
                )}
                {f.type === 'yesno' && (
                  <div className="rounded-[10px] border border-[var(--line)] px-3 py-2.5">
                    <YesNoToggle
                      checked={values[f.id] === true}
                      onChange={(v) => set(f.id, v)}
                      label={f.label}
                      latinLabel={f.latinName}
                      showPrice={false}
                    />
                  </div>
                )}
                {f.type === 'text' && (
                  <div>
                    <span className="mb-1.5 block text-[13px] font-medium text-[var(--ink-700)]">{f.label}</span>
                    <input
                      value={typeof values[f.id] === 'string' ? (values[f.id] as string) : ''}
                      onChange={(e) => set(f.id, e.target.value)}
                      placeholder={f.placeholder}
                      className={inputCls}
                    />
                  </div>
                )}
                {f.placeholder && f.type !== 'text' && <p className="mt-1 text-[11px] text-[var(--ink-400)]">{f.placeholder}</p>}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* price ticker */}
      <div className="h-fit space-y-3 rounded-[14px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-card)]">
        <h4 className="text-[14px] font-semibold text-[var(--ink-900)]">عدّاد السعر المباشر</h4>
        <div>
          <span className="mb-1.5 block text-[12px] text-[var(--ink-500)]">كمية تجريبية</span>
          <div className="flex gap-1.5">
            {[100, 500, 1000, 5000].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setTestQty(q)}
                className={
                  q === testQty
                    ? 'h-8 flex-1 rounded-[8px] border border-[var(--cyan-600)] bg-[var(--cyan-100)] text-[12px] font-semibold text-[var(--cyan-600)]'
                    : 'h-8 flex-1 rounded-[8px] border border-[var(--line)] bg-white text-[12px] text-[var(--ink-500)] hover:bg-[var(--paper-100)]'
                }
              >
                <span dir="ltr" className="font-latin tabular-nums">
                  {q}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[10px] bg-[var(--paper-100)] p-3">
          <div className="text-[11px] text-[var(--ink-400)]">سعر القطعة</div>
          <AnimatePresence mode="wait">
            <motion.div
              key={price.unitPrice}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0 }}
              transition={{ duration: 0.18 }}
              dir="ltr"
              className="font-latin text-[22px] leading-7 font-semibold tabular-nums text-[var(--ink-900)]"
            >
              {formatDA(price.unitPrice)}
            </motion.div>
          </AnimatePresence>
        </div>

        <motion.div
          key={price.total}
          initial={{ backgroundColor: '#E0F2FE' }}
          animate={{ backgroundColor: '#FFFFFF' }}
          transition={{ duration: 0.6 }}
          className="rounded-[10px] border border-[var(--line)] p-3"
        >
          <div className="text-[11px] text-[var(--ink-400)]">
            الإجمالي (<span dir="ltr" className="font-latin">{previewQuantity}</span> قطعة)
          </div>
          <div dir="ltr" className="font-latin text-[26px] leading-8 font-semibold tabular-nums text-[var(--cyan-600)]">
            {formatDA(price.total)}
          </div>
        </motion.div>

        <dl className="space-y-1 text-[12px]">
          {(
            [
              ['ورق', price.paper],
              ['طباعة', price.printing],
              ['قص', price.cutting],
              ['تشطيب', price.finishing],
              ['هدر', price.waste],
              ['مصاريف', price.overhead],
              ['هامش', price.margin],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-[var(--ink-500)]">
              <dt>{k}</dt>
              <dd dir="ltr" className="font-latin tabular-nums">
                {formatDA(v)}
              </dd>
            </div>
          ))}
        </dl>
        {service.workflow === 'multiStage' && (
          <div className="border-t border-[var(--line)] pt-3">
            <div className="mb-2 text-[12px] font-semibold text-[var(--ink-700)]">مراحل القالب</div>
            <div className="space-y-1.5">
              {serviceStageSummary(service).map((stage, index) => (
                <div key={stage.id} className="flex items-center gap-2 rounded-[8px] bg-[var(--paper-100)] px-2.5 py-2 text-[12px] text-[var(--ink-600)]">
                  <Chip tint="cyan">
                    <span dir="ltr" className="font-latin">{index + 1}</span>
                  </Chip>
                  <span className="min-w-0 flex-1 truncate">{stage.name}</span>
                  <span className="text-[10px] text-[var(--ink-400)]">{stageKindLabel(stage.kind)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function serviceStageSummary(service: Service): ServiceStageTemplate[] {
  if (service.stageTemplates?.length) return [...service.stageTemplates].sort((a, b) => a.order - b.order);
  return (service.stages?.length ? service.stages : ['impression']).map((stageId, index) => ({
    id: `legacy-${stageId}-${index}`,
    order: index,
    name: stageId === 'impression' ? 'مرحلة الطباعة' : stageId,
    kind: legacyStageKind(stageId),
  }));
}

function legacyStageKind(stageId: string): ProductionStageKind {
  if (stageId === 'impression') return 'print';
  if (stageId === 'coupe' || stageId === 'cutcontour') return 'cut';
  if (stageId === 'pliage') return 'assembly';
  if (stageId === 'livraison') return 'packaging';
  if (stageId === 'pelliculage' || stageId === 'finition') return 'finishing';
  return 'other';
}

function stageKindLabel(kind: ProductionStageKind): string {
  if (kind === 'print') return 'طباعة';
  if (kind === 'cut') return 'قص';
  if (kind === 'assembly') return 'تجميع';
  if (kind === 'finishing') return 'تشطيب';
  if (kind === 'packaging') return 'تغليف';
  return 'أخرى';
}
