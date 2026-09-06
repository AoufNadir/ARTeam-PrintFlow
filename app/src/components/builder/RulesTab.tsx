import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { DeltaUnit, DimensionPricingMode, FieldOption, PricingRule, PricingRulesVersion, Service, ServiceField } from '@/lib/types';
import { db } from '@/lib/storage';
import { DELTA_UNIT_LABELS, formatDA, trimNumber } from '@/lib/units';
import { Btn, Chip, FieldLabel, Modal, inputCls } from '@/components/settings/Overlay';
import { logAudit } from '@/components/settings/audit';
import { cn } from '@/lib/utils';

const OPTION_UNITS: DeltaUnit[] = ['fixed', 'perCopy', 'perSheet', 'perFace', 'perM2', 'perCm2', 'percent'];

interface Props {
  service: Service;
  rulesKey: number;
  onRulesChanged: () => void;
  onUpdate: (patch: Partial<Service>) => void;
}

export default function RulesTab({ service, onUpdate }: Props) {
  const pricedFields = useMemo(
    () => service.fields.filter((field) => field.type === 'select' || field.type === 'yesno'),
    [service.fields],
  );
  const dimensionFields = useMemo(
    () => service.fields.filter((field) => field.type === 'dimensions'),
    [service.fields],
  );

  const patchFieldOptions = (fieldId: string, nextOptions: FieldOption[]) => {
    onUpdate({
      fields: service.fields.map((field) => (field.id === fieldId ? { ...field, options: nextOptions } : field)),
    });
  };

  const patchOption = (field: ServiceField, optionId: string, patch: Partial<FieldOption>) => {
    const currentOptions = field.options ?? [];
    const options =
      currentOptions.length > 0
        ? currentOptions
        : [{ id: optionId, label: field.label, priceDelta: 0, deltaUnit: 'perCopy' as const }];
    patchFieldOptions(
      field.id,
      options.map((option) => (option.id === optionId ? { ...option, ...patch } : option)),
    );
  };

  const patchDimensionPricing = (patch: Partial<NonNullable<Service['dimensionPricing']>>) => {
    const current = service.dimensionPricing ?? {
      fieldId: dimensionFields[0]?.id ?? '',
      mode: 'none' as const,
      value: 0,
    };
    onUpdate({ dimensionPricing: { ...current, ...patch } });
  };

  return (
    <div className="space-y-4">
      <DimensionPricingEditor service={service} fields={dimensionFields} onPatch={patchDimensionPricing} />
      <ChoicePricingEditor service={service} fields={pricedFields} onPatchOption={patchOption} />
    </div>
  );
}

// ------------------------- dimensions / area pricing -------------------------

function DimensionPricingEditor({
  service,
  fields,
  onPatch,
}: {
  service: Service;
  fields: ServiceField[];
  onPatch: (patch: Partial<NonNullable<Service['dimensionPricing']>>) => void;
}) {
  if (fields.length === 0) return null;

  const firstFieldId = fields[0]?.id ?? '';
  const saved = service.dimensionPricing;
  const fieldId = saved && fields.some((field) => field.id === saved.fieldId) ? saved.fieldId : firstFieldId;
  const mode = saved?.mode ?? 'none';
  const value = saved?.value ?? 0;
  const minTotal = saved?.minTotal ?? 0;
  const active = mode !== 'none';

  const modeLabel: Record<DimensionPricingMode, string> = {
    none: 'لا يؤثر على السعر',
    perM2: 'دج / م²',
    perCm2: 'دج / سم²',
  };

  return (
    <div className="rounded-[12px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-[14px] font-semibold text-[var(--ink-900)]">تسعير الأبعاد والمساحة</h4>
          <p className="mt-1 text-[11px] leading-4 text-[var(--ink-400)]">
            استعمله للخدمات التي سعرها يعتمد على العرض × الارتفاع مثل اللافتات والملصقات الكبيرة.
          </p>
        </div>
        <Chip tint={active ? 'cyan' : 'paper'}>{active ? modeLabel[mode] : 'اختياري'}</Chip>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(180px,1fr)_minmax(220px,1.2fr)_140px_140px]">
        <label className="text-[12px] font-medium text-[var(--ink-700)]">
          حقل الأبعاد
          <select
            value={fieldId}
            onChange={(event) => onPatch({ fieldId: event.target.value })}
            className="mt-1.5 h-9 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-2 text-[12px] outline-none focus:border-[var(--cyan-600)]"
          >
            {fields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.label}
              </option>
            ))}
          </select>
        </label>

        <div>
          <div className="mb-1.5 text-[12px] font-medium text-[var(--ink-700)]">طريقة الحساب</div>
          <div className="grid grid-cols-3 gap-1.5">
            {(['none', 'perM2', 'perCm2'] as DimensionPricingMode[]).map((nextMode) => (
              <button
                key={nextMode}
                type="button"
                onClick={() => onPatch({ fieldId, mode: nextMode })}
                className={cn(
                  'h-9 rounded-[8px] border px-2 text-[12px] font-medium transition-colors',
                  mode === nextMode
                    ? 'border-[var(--cyan-600)] bg-[var(--cyan-100)] text-[var(--cyan-600)]'
                    : 'border-[var(--line)] bg-white text-[var(--ink-500)] hover:bg-[var(--paper-100)]',
                )}
              >
                {modeLabel[nextMode]}
              </button>
            ))}
          </div>
        </div>

        <label className="text-[12px] font-medium text-[var(--ink-700)]">
          السعر
          <input
            dir="ltr"
            inputMode="decimal"
            disabled={!active}
            value={value === 0 ? '' : String(value)}
            placeholder="0"
            onChange={(event) => onPatch({ fieldId, value: Number(event.target.value.replace(',', '.')) || 0 })}
            className={cn(inputCls, 'font-latin mt-1.5 h-9 text-end disabled:cursor-not-allowed disabled:bg-[var(--paper-100)] disabled:text-[var(--ink-400)]')}
          />
        </label>

        <label className="text-[12px] font-medium text-[var(--ink-700)]">
          حد أدنى
          <input
            dir="ltr"
            inputMode="decimal"
            disabled={!active}
            value={minTotal === 0 ? '' : String(minTotal)}
            placeholder="اختياري"
            onChange={(event) => onPatch({ fieldId, minTotal: Number(event.target.value.replace(',', '.')) || 0 })}
            className={cn(inputCls, 'font-latin mt-1.5 h-9 text-end disabled:cursor-not-allowed disabled:bg-[var(--paper-100)] disabled:text-[var(--ink-400)]')}
          />
        </label>
      </div>

      <div className="mt-3 rounded-[10px] bg-[var(--paper-100)] px-3 py-2 text-[12px] leading-5 text-[var(--ink-500)]">
        {active ? (
          <>
            المعادلة: <span className="font-semibold text-[var(--ink-800)]">العرض × الارتفاع × الكمية × {modeLabel[mode]}</span>
            {minTotal > 0 && (
              <>
                {' '}
                مع حد أدنى <span className="font-latin font-semibold">{formatDA(minTotal)}</span>.
              </>
            )}
          </>
        ) : (
          'الأبعاد موجودة في الحقول لكنها لا تغيّر السعر حاليًا. اختر دج/م² أو دج/سم² لتفعيلها.'
        )}
      </div>
    </div>
  );
}

// ------------------------- service option pricing ----------------------------

function ChoicePricingEditor({
  service,
  fields,
  onPatchOption,
}: {
  service: Service;
  fields: ServiceField[];
  onPatchOption: (field: ServiceField, optionId: string, patch: Partial<FieldOption>) => void;
}) {
  return (
    <div className="rounded-[12px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-[14px] font-semibold text-[var(--ink-900)]">تأثير اختيارات الخدمة على السعر</h4>
          <p className="mt-1 text-[11px] leading-4 text-[var(--ink-400)]">
            ضع هنا السعر الذي تريد اعتماده لكل اختيار داخل قالب الخدمة.
          </p>
        </div>
        <Chip tint="cyan">محلي للخدمة</Chip>
      </div>

      {fields.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[var(--line-strong)] bg-[var(--paper-100)] px-4 py-6 text-center text-[13px] text-[var(--ink-400)]">
          لا توجد حقول اختيارية تؤثر على السعر في هذه الخدمة.
        </div>
      ) : (
        <div className="space-y-4">
          {fields.map((field) => (
            <div key={field.id} className="rounded-[10px] border border-[var(--line)] bg-[var(--paper-50)] p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <FieldLabel>{field.label}</FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  {service.workflow === 'multiStage' && <Chip tint="violet">{service.stageTemplates?.find((stage) => stage.fieldIds?.includes(field.id))?.name ?? 'معلومات المشروع'}</Chip>}
                  <Chip>{field.type === 'yesno' ? 'نعم/لا' : 'قائمة اختيار'}</Chip>
                </div>
              </div>
              <div className="space-y-1.5">
                {optionRows(field).map((option) => (
                  <div
                    key={option.id}
                    className="grid grid-cols-[minmax(0,1fr)_128px_110px] items-center gap-2 rounded-[8px] border border-[var(--line)] bg-white p-2 max-md:grid-cols-1"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold text-[var(--ink-800)]">{option.label}</div>
                      {option.latinLabel && (
                        <div dir="ltr" className="font-latin truncate text-[11px] text-[var(--ink-400)]">
                          {option.latinLabel}
                        </div>
                      )}
                    </div>
                    <select
                      value={option.deltaUnit}
                      onChange={(event) => onPatchOption(field, option.id, { deltaUnit: event.target.value as DeltaUnit })}
                      className="h-9 rounded-[8px] border border-[var(--line-strong)] bg-white px-2 text-[12px] text-[var(--ink-700)] outline-none focus:border-[var(--cyan-600)]"
                    >
                      {OPTION_UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {DELTA_UNIT_LABELS[unit]}
                        </option>
                      ))}
                    </select>
                    <input
                      dir="ltr"
                      inputMode="decimal"
                      value={option.priceDelta === 0 ? '' : String(option.priceDelta)}
                      placeholder="0"
                      onChange={(event) => onPatchOption(field, option.id, { priceDelta: Number(event.target.value.replace(',', '.')) || 0 })}
                      className={cn(inputCls, 'font-latin h-9 text-end')}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function optionRows(field: ServiceField): FieldOption[] {
  if (field.type === 'yesno') {
    const option = field.options?.[0];
    return [option ?? { id: `${field.id}-yes`, label: `عند تفعيل ${field.label}`, priceDelta: 0, deltaUnit: 'perCopy' }];
  }
  return field.options ?? [];
}

// ------------------------------ version history ------------------------------

function diffRules(prev: PricingRule[], next: PricingRule[]) {
  const rows: { name: string; before?: string; after?: string }[] = [];
  for (const n of next) {
    const p = prev.find((x) => x.id === n.id);
    const fmt = (r: PricingRule) => (r.basis === 'percent' ? `${trimNumber(r.value)}%` : formatDA(r.value));
    if (!p) rows.push({ name: n.name, after: fmt(n) });
    else if (p.value !== n.value || p.enabled !== n.enabled) rows.push({ name: n.name, before: fmt(p), after: fmt(n) });
  }
  return rows;
}

export function HistoryModal({
  open,
  onClose,
  current,
  onRestored,
}: {
  open: boolean;
  onClose: () => void;
  current: PricingRulesVersion;
  onRestored: () => void;
}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read the stored version list whenever the modal opens or the current version changes
  const versions = useMemo(() => [...db.pricingRuleVersions.list()].sort((a, b) => b.version - a.version), [open, current.version]);
  const [expanded, setExpanded] = useState<number | null>(null);

  const restore = (v: PricingRulesVersion) => {
    const n = db.publishRules(v.rules, `استرجاع الإصدار v${v.version}`);
    logAudit('rule', `استُرجع الإصدار v${v.version} كإصدار جديد v${n}`, 'سجل الإصدارات');
    toast.success(`أُنشئ الإصدار v${n} من استرجاع v${v.version} — التاريخ لا يُعاد كتابته`);
    onRestored();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="سجل إصدارات الأسعار" size="lg">
      <div className="space-y-2">
        {versions.map((v, i) => {
          const prev = versions[i + 1];
          const rows = prev ? diffRules(prev.rules, v.rules) : [];
          const isCurrent = v.version === current.version;
          const openRow = expanded === v.version;
          return (
            <motion.div
              key={v.id}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.06, 0.36) }}
              className={cn('rounded-[12px] border', isCurrent ? 'border-[var(--cyan-600)] bg-[var(--cyan-50)]/50' : 'border-[var(--line)] bg-white')}
            >
              <button type="button" onClick={() => setExpanded(openRow ? null : v.version)} className="flex w-full items-center gap-3 px-4 py-3 text-start">
                <span dir="ltr" className="font-latin text-[15px] font-semibold tabular-nums text-[var(--ink-900)]">
                  v{v.version}
                </span>
                {isCurrent && <Chip tint="cyan">الحالية</Chip>}
                <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink-500)]">{v.note ?? '—'}</span>
                <span className="text-[11px] text-[var(--ink-400)]">{new Date(v.createdAt).toLocaleDateString('en-GB')}</span>
                {!isCurrent && (
                  <Btn
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      restore(v);
                    }}
                  >
                    <RotateCcw size={13} /> استرجاع
                  </Btn>
                )}
              </button>
              <AnimatePresence initial={false}>
                {openRow && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-[var(--line)] px-4 py-3">
                      {rows.length === 0 ? (
                        <p className="text-[12px] text-[var(--ink-400)]">{prev ? 'لا فروقات مسجلة.' : 'النسخة الأولى من القواعد.'}</p>
                      ) : (
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="text-[10px] text-[var(--ink-400)]">
                              <th className="py-1 text-start">القاعدة</th>
                              <th className="py-1 text-start">قبل</th>
                              <th className="py-1 text-start">بعد</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r, j) => (
                              <motion.tr
                                key={r.name}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: j * 0.05 }}
                                className="border-t border-[var(--line)]"
                              >
                                <td className="py-1.5 font-medium text-[var(--ink-700)]">{r.name}</td>
                                <td className="py-1.5">
                                  {r.before ? (
                                    <motion.span initial={{ x: 8 }} animate={{ x: 0 }} dir="ltr" className="font-latin text-[var(--danger-600)] line-through">
                                      {r.before}
                                    </motion.span>
                                  ) : (
                                    <span className="text-[var(--ink-400)]">—</span>
                                  )}
                                </td>
                                <td className="py-1.5">
                                  {r.after && (
                                    <motion.span initial={{ x: -8 }} animate={{ x: 0 }} dir="ltr" className="font-latin font-semibold text-[var(--success-600)]">
                                      {r.after}
                                    </motion.span>
                                  )}
                                </td>
                              </motion.tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </Modal>
  );
}
