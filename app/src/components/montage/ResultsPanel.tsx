import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, CheckCircle2, ChevronDown, FileDown, Info, Sparkles, TriangleAlert } from 'lucide-react';
import WasteMeter from '@/components/ds/WasteMeter';
import EmptyState from '@/components/ds/EmptyState';
import type { Machine, MontageResult, PlacedPiece, SheetAlternative, Unit } from '@/lib/types';
import type { MontageVariant } from '@/lib/montage-engine';
import { formatDA, formatMeasure, formatPercent, trimNumber } from '@/lib/units';
import { cn } from '@/lib/utils';
import {
  estimateCost,
  infeasibilityReason,
  transparencyRows,
  wasteLevel,
  GROUP_COLORS,
  MONTAGE_MACHINES,
  WASTE_COLORS,
  type CostEstimate,
  type MontageUIState,
} from './montage-data';
import type { PricingRule } from '@/lib/types';

const EASE = [0.22, 0.68, 0.26, 1] as [number, number, number, number];

export interface ResultsPanelProps {
  state: MontageUIState;
  machine: Machine;
  result: MontageResult | null;
  rules: PricingRule[];
  placedCount: number;
  /** the EFFECTIVE pieces on the sheet (engine result or a manually edited layout) */
  placedPieces: PlacedPiece[];
  /** blocking warnings of the fixed mode (null = no failure) */
  fixedWarnings: string[] | null;
  unit: Unit;
  /** montage layout candidates (quantity mode) — the user picks the trade-off */
  variants: MontageVariant[];
  selectedVariant: number;
  onSelectVariant: (i: number) => void;
  onAdopt: () => void;
  onExportPdf: () => void;
  onAdoptAlternative: (alt: SheetAlternative) => void;
}

/** Animated count-up number (900ms, ease-out). */
function CountUp({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  const [display, setDisplay] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const from = display;
    const start = performance.now();
    const dur = 900;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setDisplay(from + (value - from) * eased);
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <span dir="ltr" className={cn('font-latin tabular-nums', className)}>
      {display.toLocaleString('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}
    </span>
  );
}

export default function ResultsPanel(props: ResultsPanelProps) {
  const { state, machine, result, rules, placedCount, unit } = props;
  const [altsOpen, setAltsOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const cost: CostEstimate | null = useMemo(
    () => (result ? estimateCost(result, machine, rules) : null),
    [result, machine, rules],
  );

  if (!result || !cost) {
    // fixed mode: a failed fixed computation carries explicit per-design maximums
    if (state.calcMode === 'fixed' && props.fixedWarnings && props.fixedWarnings.length > 0) {
      return (
        <EmptyState
          image="/empty-montage.svg"
          title="العدد المطلوب لا يسع الورقة"
          helper={props.fixedWarnings.join(' — ')}
          className="min-h-[320px]"
        />
      );
    }
    const reason = !result ? infeasibilityReason(state) : null;
    if (reason) {
      return (
        <EmptyState
          image="/empty-montage.svg"
          title="تعذّر تركيب المونتاج"
          helper={reason}
          className="min-h-[320px]"
        />
      );
    }
    return (
      <EmptyState
        image="/empty-montage.svg"
        title="التوصية الذكية تظهر هنا"
        helper="بعد إدخال المقاسات والضغط على «احسب المونتاج» يقترح النظام أفضل ورقة بأقل هدر."
        className="min-h-[320px]"
      />
    );
  }

  const level = wasteLevel(result.wastePercent);
  const sheetLabel = `${formatMeasure(result.sheetWidthMm, 'cm')}×${formatMeasure(result.sheetHeightMm, 'cm')} سم`;
  const verdictWords = ['ورقة', sheetLabel];
  // surplus copies: what the run actually produces beyond the requested qty
  const totalQty = state.stickers.reduce((s, g) => s + g.quantity, 0);
  const surplus = result.sheetsNeeded * placedCount - totalQty;
  // per-design production transparency (fixed mode always; quantity mode when multi-design)
  const rows = transparencyRows(state, props.placedPieces, result.sheetsNeeded);
  const showTable = state.calcMode === 'fixed' || state.stickers.length > 1;
  const shortfalls = rows.filter((r) => r.shortfall);
  // silent sheet fallback: when the SELECTED sheet cannot fit the job the
  // engine quietly substitutes the closest workable sheet (result dims differ
  // from state dims) — surface that explicitly so the printer is not misled
  const sheetFallback = result.sheetWidthMm !== state.sheetW || result.sheetHeightMm !== state.sheetH;

  return (
    <div className="flex flex-col gap-3">
      {/* ---------------- montage variants (quantity mode) ---------------- */}
      {state.calcMode === 'quantity' && props.variants.length > 1 && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="rounded-[14px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-card)]"
        >
          <h3 className="mb-2.5 text-[14px] font-semibold text-[var(--ink-900)]">خيارات الترتيب</h3>
          <div className="flex flex-col gap-2">
            {props.variants.map((v, i) => {
              const active = i === props.selectedVariant;
              const r = v.result;
              const maxDim = Math.max(r.sheetWidthMm, r.sheetHeightMm);
              return (
                <motion.button
                  key={`${v.kind}-${i}`}
                  type="button"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.25 }}
                  onClick={() => props.onSelectVariant(i)}
                  className={cn(
                    'flex items-center gap-3 rounded-[12px] border p-2.5 text-start transition-colors',
                    active ? 'border-[var(--cyan-600)] bg-[var(--cyan-50)]' : 'border-[var(--line)] bg-white hover:bg-[var(--paper-100)]',
                  )}
                >
                  <svg
                    viewBox={`0 0 ${r.sheetWidthMm} ${r.sheetHeightMm}`}
                    style={{ width: (r.sheetWidthMm / maxDim) * 56, height: (r.sheetHeightMm / maxDim) * 56 }}
                    className="shrink-0 rounded-[4px] border border-[var(--line-strong)] bg-white"
                    aria-hidden
                  >
                    {r.placed.map((p, j) => (
                      <rect
                        key={j}
                        x={p.x}
                        y={p.y}
                        width={p.w}
                        height={p.h}
                        fill={p.color}
                        fillOpacity={0.3}
                        stroke={p.color}
                        strokeWidth={maxDim / 120}
                      />
                    ))}
                  </svg>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[13px] font-bold text-[var(--ink-900)]">
                      {v.label}
                      {i === 0 && (
                        <span className="rounded-full bg-[var(--cyan-600)]/10 px-1.5 py-px text-[10px] font-semibold text-[var(--cyan-600)]">افتراضي</span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-[var(--ink-400)]">
                      <span dir="ltr" className="font-latin font-semibold text-[var(--ink-700)]">
                        {formatPercent(r.wastePercent)}
                      </span>{' '}
                      هدر •{' '}
                      <span dir="ltr" className="font-latin font-semibold text-[var(--ink-700)]">
                        {r.sheetsNeeded}
                      </span>{' '}
                      ورقة •{' '}
                      <span dir="ltr" className="font-latin font-semibold text-[var(--ink-700)]">
                        {v.cutScore}
                      </span>{' '}
                      خط قص
                    </span>
                  </span>
                  {active && <Check size={16} className="shrink-0 text-[var(--cyan-600)]" />}
                </motion.button>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* ---------------- silent sheet fallback warning ---------------- */}
      {sheetFallback && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="flex items-start gap-2 rounded-[10px] border border-[var(--warning-600)]/40 bg-[var(--warning-600)]/10 p-2.5 text-[12px] font-semibold leading-5 text-[var(--warning-600)]"
        >
          <TriangleAlert size={15} className="mt-0.5 shrink-0" />
          <span>
            المقاس المختار لا يسع الكمية — عرضنا أقرب بديل مناسب (نتجت على ورقة{' '}
            <span dir="ltr" className="font-latin">
              {sheetLabel}
            </span>
            )
          </span>
        </motion.div>
      )}

      {/* ---------------- RecommendationCard ---------------- */}
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        className="rounded-[14px] border border-[var(--cyan-100)] bg-[var(--cyan-50)] p-4 shadow-[var(--shadow-card)]"
      >
        <header className="mb-2 flex items-center gap-2">
          <Sparkles size={17} className="text-[var(--cyan-600)]" />
          <h3 className="text-[17px] leading-[26px] font-semibold text-[var(--ink-900)]">التوصية الذكية</h3>
        </header>

        {/* verdict */}
        <p className="mb-1 text-[26px] leading-[34px] font-extrabold text-[var(--ink-900)]">
          {verdictWords.map((w, i) => (
            <motion.span
              key={`${w}-${i}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
              className="inline-block"
            >
              {i === 1 ? (
                <span dir="ltr" className="font-latin text-[var(--cyan-600)]">
                  {w}
                </span>
              ) : (
                w
              )}{' '}
            </motion.span>
          ))}
        </p>
        <p className="mb-3 text-[13px] text-[var(--ink-500)]">
          {state.calcMode === 'fixed' ? (
            <>
              كل ورقة تنتج{' '}
              <span dir="ltr" className="font-latin font-semibold text-[var(--ink-900)]">
                {placedCount}
              </span>{' '}
              نسخة
            </>
          ) : (
            <>
              <span dir="ltr" className="font-latin font-semibold text-[var(--ink-900)]">{placedCount}</span> نسخة/ورقة —{' '}
              <span dir="ltr" className="font-latin font-semibold text-[var(--ink-900)]">{result.sheetsNeeded}</span> ورقة لإنتاج{' '}
              <span dir="ltr" className="font-latin font-semibold text-[var(--ink-900)]">{trimNumber(totalQty)}</span>
            </>
          )}
        </p>
        {state.calcMode === 'quantity' && surplus > 0 && !showTable && (
          <p className="mb-3 -mt-1.5 inline-flex w-fit items-center gap-1.5 rounded-full border border-[var(--warning-600)]/40 bg-[var(--warning-600)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--warning-600)]">
            <Info size={12} />
            نسخ زائدة متوقعة:{' '}
            <span dir="ltr" className="font-latin">
              +{surplus.toLocaleString('en-US')}
            </span>{' '}
            (عدد النسخ في الورقة يتجاوز الكمية المطلوبة)
          </p>
        )}

        {/* explicit error when the computed sheets no longer cover a design's quantity
            (e.g. a manual path capped the copies per sheet) */}
        {state.calcMode === 'quantity' && shortfalls.length > 0 && (
          <div className="mb-3 rounded-[10px] border border-[var(--danger-600)]/40 bg-[var(--danger-600)]/10 p-2.5">
            <p className="mb-1 flex items-center gap-1.5 text-[12px] font-bold text-[var(--danger-600)]">
              <TriangleAlert size={14} />
              الكمية لا تغطيها الأوراق المحسوبة
            </p>
            <ul className="space-y-0.5 text-[11px] leading-5 text-[var(--ink-700)]">
              {shortfalls.map((r) => (
                <li key={r.id}>
                  • الكمية المطلوبة من {r.name} (
                  <span dir="ltr" className="font-latin font-semibold">
                    {trimNumber(r.requested)}
                  </span>
                  ) تحتاج{' '}
                  <span dir="ltr" className="font-latin font-semibold">
                    {Number.isFinite(r.neededSheets) ? trimNumber(r.neededSheets) : '∞'}
                  </span>{' '}
                  ورقة
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* metric tiles 2x2 */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          {[
            { label: 'عدد الأوراق', value: <CountUp value={result.sheetsNeeded} /> },
            { label: 'نسخ/ورقة', value: <CountUp value={placedCount} /> },
            {
              label: 'الهدر',
              value: (
                <span dir="ltr" className="font-latin font-semibold" style={{ color: WASTE_COLORS[level] }}>
                  {formatPercent(result.wastePercent)}
                </span>
              ),
            },
            { label: 'التكلفة التقديرية', value: <CountUp value={cost.total} /> },
          ].map((t) => (
            <motion.div
              key={t.label}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="rounded-[12px] bg-[var(--paper-100)] p-3"
            >
              <div className="text-[11px] font-medium tracking-wide text-[var(--ink-400)]">{t.label}</div>
              <div className="font-latin text-[22px] leading-7 font-semibold text-[var(--ink-900)]">{t.value}</div>
            </motion.div>
          ))}
        </div>

        {/* waste meter */}
        <div className="mb-3 flex flex-col items-center rounded-[12px] bg-white/70 py-3">
          <WasteMeter percent={result.wastePercent} size={140} />
          <p className="mt-1 text-[11px] text-[var(--ink-400)]">مساحة مهدورة من القابلة للطباعة</p>
        </div>

        {/* why note */}
        <p className="mb-3 flex items-start gap-1.5 text-[13px] leading-5 text-[var(--ink-500)]">
          <Info size={14} className="mt-1 shrink-0 text-[var(--cyan-600)]" />
          <span>
            اخترنا{' '}
            <span dir="ltr" className="font-latin font-semibold text-[var(--ink-700)]">
              {sheetLabel}
            </span>{' '}
            لأنها تحقق أقل هدر مع احترام قيود{' '}
            <span dir="ltr" className="font-latin font-semibold text-[var(--ink-700)]">
              {machine.name}
            </span>{' '}
            ({machine.kind === 'digital' ? `هوامش ${trimNumber(machine.margins.top)}مم` : `Prise de pince ${trimNumber(machine.priseDePince ?? 0)}مم`}).
          </span>
        </p>

        {/* CTAs */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={props.onAdopt}
            className="flex h-11 items-center justify-center gap-2 rounded-[10px] bg-[var(--cyan-600)] text-[14px] font-bold text-white transition-all hover:-translate-y-px hover:bg-[var(--cyan-500)] active:translate-y-0 active:brightness-95"
          >
            <CheckCircle2 size={16} />
            اعتماد وإدراج في Devis
          </button>
          <button
            type="button"
            onClick={props.onExportPdf}
            className="flex h-10 items-center justify-center gap-2 rounded-[10px] border border-[var(--line-strong)] bg-white text-[14px] font-medium text-[var(--ink-700)] transition-colors hover:bg-[var(--paper-100)]"
          >
            <FileDown size={16} />
            تصدير PDF تقني
          </button>
        </div>
      </motion.section>

      {/* ---------------- per-design transparency table ---------------- */}
      {showTable && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="rounded-[14px] border border-[var(--line)] bg-white p-4 shadow-[var(--shadow-card)]"
        >
          <h3 className="mb-2.5 text-[14px] font-semibold text-[var(--ink-900)]">
            {state.calcMode === 'fixed' ? 'محتوى الورقة' : 'شفافية الإنتاج لكل تصميم'}
          </h3>
          {state.calcMode === 'fixed' ? (
            <ul className="space-y-1.5">
              {rows.map((r, i) => (
                <li key={r.id} className="flex items-center gap-2 text-[12px]">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: GROUP_COLORS[i % GROUP_COLORS.length] }} />
                  <span className="flex-1 font-medium text-[var(--ink-700)]">{r.name}</span>
                  <span dir="ltr" className="font-latin font-semibold tabular-nums text-[var(--ink-900)]">
                    {r.perSheet}
                  </span>
                  <span className="text-[11px] text-[var(--ink-400)]">نسخة/ورقة</span>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-[var(--line)] text-[11px] text-[var(--ink-400)]">
                    <th className="pb-1.5 text-start font-medium">التصميم</th>
                    <th className="pb-1.5 text-end font-medium">المطلوب</th>
                    <th className="pb-1.5 text-end font-medium">نسخ/ورقة</th>
                    <th className="pb-1.5 text-end font-medium">المنتَج</th>
                    <th className="pb-1.5 text-end font-medium">الفارق</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-dashed border-[var(--line)] last:border-0">
                      <td className="py-1.5 text-start font-medium text-[var(--ink-700)]">{r.name}</td>
                      <td dir="ltr" className="font-latin py-1.5 text-end tabular-nums text-[var(--ink-900)]">
                        {trimNumber(r.requested)}
                      </td>
                      <td dir="ltr" className="font-latin py-1.5 text-end tabular-nums text-[var(--ink-900)]">
                        {r.perSheet}
                      </td>
                      <td
                        dir="ltr"
                        className={cn(
                          'font-latin py-1.5 text-end tabular-nums font-semibold',
                          r.shortfall ? 'text-[var(--danger-600)]' : 'text-[var(--ink-900)]',
                        )}
                      >
                        {trimNumber(r.produced)}
                      </td>
                      <td dir="ltr" className="font-latin py-1.5 text-end tabular-nums">
                        {r.shortfall ? (
                          <span className="font-semibold text-[var(--danger-600)]">−{trimNumber(r.requested - r.produced)}</span>
                        ) : r.extra > 0 ? (
                          <span className="rounded-full border border-[var(--warning-600)]/40 bg-[var(--warning-600)]/10 px-1.5 py-px text-[10px] font-semibold text-[var(--warning-600)]">
                            +{trimNumber(r.extra)}
                          </span>
                        ) : (
                          <span className="text-[var(--success-600)]">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] leading-5 text-[var(--ink-400)]">
                المنتَج = عدد الأوراق × النسخ في الورقة — الفارق الكهرماني زيادة إنتاج عن الكمية المطلوبة.
              </p>
            </>
          )}
        </motion.section>
      )}

      {/* ---------------- Alternatives accordion ---------------- */}
      {result.alternatives.length > 0 && (
        <section className="rounded-[14px] border border-[var(--line)] bg-white shadow-[var(--shadow-card)]">
          <button
            type="button"
            onClick={() => setAltsOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-3"
            aria-expanded={altsOpen}
          >
            <span className="text-[14px] font-semibold text-[var(--ink-900)]">
              البدائل <span className="font-normal text-[var(--ink-400)]">(متقدم — {result.alternatives.length})</span>
            </span>
            <motion.span animate={{ rotate: altsOpen ? -180 : 0 }} transition={{ duration: 0.2 }} className="text-[var(--ink-400)]">
              <ChevronDown size={16} />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {altsOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <ul className="space-y-2 px-4 pb-4">
                  {result.alternatives.map((alt, i) => {
                    // cost of the alternative must use ITS machine's face price
                    // (alt.machineId), not the currently selected machine's
                    const altMachine = alt.machineId ? MONTAGE_MACHINES.find((m) => m.id === alt.machineId) : undefined;
                    const altPrintPerFace = altMachine?.costPerFace ?? cost.printPerFace;
                    const altCost = alt.sheetsNeeded * (cost.paperPerSheet + cost.faces * altPrintPerFace + cost.cutPerSheet);
                    const delta = altCost - cost.total;
                    const altLevel = wasteLevel(alt.wastePercent);
                    const altLabel = `${formatMeasure(alt.sheetWidthMm, 'cm')}×${formatMeasure(alt.sheetHeightMm, 'cm')}`;
                    return (
                      <motion.li
                        key={`${alt.sheetWidthMm}x${alt.sheetHeightMm}-${alt.machineId ?? 'none'}`}
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.07, duration: 0.3, ease: EASE }}
                        className="rounded-[10px] border border-[var(--line)] p-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span dir="ltr" className="font-latin text-[14px] font-semibold text-[var(--ink-900)]">
                            {altLabel}
                          </span>
                          <span className="text-[11px] text-[var(--ink-500)]">
                            <span dir="ltr" className="font-latin font-semibold">{alt.copiesPerSheet}</span> نسخ/ورقة
                          </span>
                          <span
                            dir="ltr"
                            className={cn('font-latin text-[11px] font-semibold', delta > 0 ? 'text-[var(--warning-600)]' : 'text-[var(--success-600)]')}
                          >
                            {delta === 0 ? '±0' : `${delta > 0 ? '+' : '−'}${Math.abs(Math.round(delta)).toLocaleString('en-US')}`} دج
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <div dir="ltr" className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--paper-100)]">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(100, alt.wastePercent * 2.5)}%` }}
                              transition={{ duration: 0.6, delay: i * 0.07 }}
                              className="h-full rounded-full"
                              style={{ backgroundColor: WASTE_COLORS[altLevel] }}
                            />
                          </div>
                          <span dir="ltr" className="font-latin w-10 text-end text-[10px] text-[var(--ink-400)]">
                            {formatPercent(alt.wastePercent)}
                          </span>
                          <button
                            type="button"
                            onClick={() => props.onAdoptAlternative(alt)}
                            className="rounded-full border border-[var(--line-strong)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--ink-700)] transition-colors hover:border-[var(--cyan-600)] hover:text-[var(--cyan-600)]"
                          >
                            اعتماد هذا البديل
                          </button>
                        </div>
                      </motion.li>
                    );
                  })}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {/* ---------------- cost mini-breakdown ---------------- */}
      <section className="rounded-[14px] border border-[var(--line)] bg-white shadow-[var(--shadow-card)]">
        <button
          type="button"
          onClick={() => setDetailOpen((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-3"
          aria-expanded={detailOpen}
        >
          <span className="text-[14px] font-semibold text-[var(--ink-900)]">تفصيل سريع</span>
          <motion.span animate={{ rotate: detailOpen ? -180 : 0 }} transition={{ duration: 0.2 }} className="text-[var(--ink-400)]">
            <ChevronDown size={16} />
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {detailOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <ul className="space-y-1.5 px-4 pb-4 text-[13px]">
                {[
                  {
                    label: 'الورق',
                    detail: `${result.sheetsNeeded} × ${trimNumber(cost.paperPerSheet)}`,
                    amount: cost.paper,
                  },
                  {
                    label: `طباعة ${cost.faces > 1 ? `${cost.faces} وجه` : 'وجه واحد'}`,
                    detail: `${result.sheetsNeeded} × ${trimNumber(cost.printPerFace)} × ${cost.faces}`,
                    amount: cost.printing,
                  },
                  { label: 'القص', detail: `${result.sheetsNeeded} × ${trimNumber(cost.cutPerSheet)}`, amount: cost.cutting },
                ].map((row, i) => (
                  <motion.li
                    key={row.label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.25 }}
                    className="flex items-center justify-between gap-2 border-b border-dashed border-[var(--line)] pb-1.5 last:border-0"
                  >
                    <span className="text-[var(--ink-700)]">{row.label}</span>
                    <span dir="ltr" className="font-latin text-[11px] text-[var(--ink-400)]">
                      {row.detail}
                    </span>
                    <span className="font-latin font-semibold text-[var(--ink-900)]">{formatDA(row.amount)}</span>
                  </motion.li>
                ))}
                <li className="flex items-center justify-between pt-1 text-[14px] font-bold">
                  <span>الإجمالي التقديري</span>
                  <span className="font-latin text-[var(--cyan-600)]">{formatDA(cost.total)}</span>
                </li>
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <p className="px-1 text-center text-[11px] text-[var(--ink-400)]">
        أسعار الورق والطباعة من قواعد الأسعار الحالية — مقاسات بـ<span dir="ltr" className="font-latin">{unit}</span>
      </p>
    </div>
  );
}
