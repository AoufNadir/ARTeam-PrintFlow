import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronDown,
  FileText,
  Hash,
  Layers,
  Link2,
  Pencil,
  Plus,
  Printer,
  Scissors,
  Sparkles,
  TriangleAlert,
  Unlink2,
  X,
} from 'lucide-react';
import BleedGroup from '@/components/ds/BleedGroup';
import DimensionGroup from '@/components/ds/DimensionGroup';
import NumberField from '@/components/ds/NumberField';
import SelectWithPrice from '@/components/ds/SelectWithPrice';
import YesNoToggle from '@/components/ds/YesNoToggle';
import DesignFileUploader from './DesignFileUploader';
import StageCard from './StageCard';
import {
  CUT_METHODS,
  GROUP_COLORS,
  MACHINE_MICRO,
  MAX_GROUPS,
  MONTAGE_MACHINES,
  PRINT_METHODS,
  QUANTITY_PRESETS,
  machineOf,
  sheetSizeMatches,
  stickerCopiesPerSheet,
  wasteLevel,
  WASTE_COLORS,
  type CalcMode,
  type MontageUIState,
} from './montage-data';
import type { MachineKind, PrintMethod, Unit } from '@/lib/types';
import { deleteDesignFile } from '@/lib/design-file-storage';
import { designNameFromAsset, type DesignFileAsset } from '@/lib/design-file-types';
import { pairGapKey } from '@/lib/montage-engine';
import { formatMeasure, formatPercent, trimNumber } from '@/lib/units';
import { cn } from '@/lib/utils';

const EASE = [0.22, 0.68, 0.26, 1] as [number, number, number, number];

export interface SheetWasteInfo {
  wastePercent: number;
  copiesPerSheet: number;
}

export interface ControlsPanelProps {
  state: MontageUIState;
  patch: (p: Partial<MontageUIState>) => void;
  onKindChange: (k: MachineKind) => void;
  onMachineChange: (id: string) => void;
  onSheetPick: (w: number, h: number, custom: boolean) => void;
  unit: Unit;
  onUnitChange: (u: Unit) => void;
  sheetWaste: Map<string, SheetWasteInfo | null>;
  recommendedSheetId: string | null;
  /** per-design copies/sheet from the last automatic (quantity-mode) computation */
  suggestedCopies: Map<string, number>;
  /** blocking warnings of the fixed mode (null = no failure) */
  fixedWarnings: string[] | null;
  computing: boolean;
  onCompute: () => void;
}

// ------------------------------- sub pieces ----------------------------------

function MachinePicker({
  kind,
  value,
  onChange,
}: {
  kind: MachineKind;
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const machines = MONTAGE_MACHINES.filter((m) => m.kind === kind);
  const selected = machines.find((m) => m.id === value);
  const img = kind === 'digital' ? '/machine-digital.svg' : '/machine-offset.svg';

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={ref} className="relative">
      <span className="mb-1.5 block text-[13px] font-medium text-[var(--ink-700)]">الماكينة</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-14 w-full items-center gap-3 rounded-[10px] border border-[var(--line-strong)] bg-white px-3 transition-shadow focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)] focus:outline-none"
      >
        <img src={img} alt="" className="h-10 w-16 shrink-0 rounded-[6px] border border-[var(--line)] bg-[var(--paper-100)] object-cover" />
        <span className="min-w-0 flex-1 text-start">
          <span dir="ltr" className="font-latin block truncate text-[13px] font-semibold text-[var(--ink-900)]">
            {selected?.name}
          </span>
          <span className="block truncate text-[11px] text-[var(--ink-400)]">{selected ? MACHINE_MICRO[selected.id] : ''}</span>
        </span>
        <ChevronDown size={16} className={cn('shrink-0 text-[var(--ink-400)] transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="absolute z-40 mt-1 w-full overflow-hidden rounded-[10px] border border-[var(--line)] bg-white shadow-[var(--shadow-pop)]"
          >
            {machines.map((m, i) => (
              <motion.li key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.2 }}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--cyan-50)]"
                >
                  <img src={img} alt="" className="h-11 w-[72px] shrink-0 rounded-[6px] border border-[var(--line)] bg-[var(--paper-100)] object-cover" />
                  <span className="min-w-0 flex-1 text-start">
                    <span dir="ltr" className="font-latin block truncate text-[13px] font-semibold text-[var(--ink-900)]">
                      {m.name}
                    </span>
                    <span className="block truncate text-[11px] text-[var(--ink-400)]">{MACHINE_MICRO[m.id]}</span>
                  </span>
                  {m.id === value && <Check size={15} className="shrink-0 text-[var(--cyan-600)]" />}
                </button>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Linked 4-side margin mini-inputs (digital machines). */
function MarginInputs({
  value,
  onChange,
}: {
  value: { top: number; bottom: number; left: number; right: number };
  onChange: (v: { top: number; bottom: number; left: number; right: number }) => void;
}) {
  const [linked, setLinked] = useState(true);
  const [raw, setRaw] = useState<Partial<Record<'top' | 'bottom' | 'left' | 'right', string>>>({});
  const sides = [
    { key: 'top' as const, label: 'أعلى' },
    { key: 'bottom' as const, label: 'أسفل' },
    { key: 'right' as const, label: 'يمين' },
    { key: 'left' as const, label: 'يسار' },
  ];
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[13px] font-medium text-[var(--ink-700)]">هوامش الماكينة (مم)</span>
        <button
          type="button"
          onClick={() => setLinked((l) => !l)}
          title={linked ? 'فك الارتباط' : 'ربط الجهات'}
          className={cn(
            'grid h-7 w-7 place-items-center rounded-[6px] transition-colors',
            linked ? 'bg-[var(--cyan-100)] text-[var(--cyan-600)]' : 'bg-[var(--paper-100)] text-[var(--ink-400)]',
          )}
        >
          {linked ? <Link2 size={14} /> : <Unlink2 size={14} />}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {sides.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-1">
            <span className="w-7 text-[11px] text-[var(--ink-400)]">{label}</span>
            <input
              dir="ltr"
              inputMode="decimal"
              className="font-latin h-8 w-14 rounded-[6px] border border-[var(--line-strong)] px-1.5 text-center text-[13px] tabular-nums outline-none focus:border-[var(--cyan-600)] focus:shadow-[var(--shadow-focus)]"
              value={raw[key] ?? trimNumber(value[key])}
              onChange={(e) => {
                setRaw((r) => ({ ...r, [key]: e.target.value }));
                const n = Number(e.target.value.replace(',', '.'));
                if (Number.isNaN(n) || n < 0) return;
                onChange(linked ? { top: n, bottom: n, left: n, right: n } : { ...value, [key]: n });
              }}
              onBlur={() => setRaw((r) => ({ ...r, [key]: undefined }))}
            />
          </label>
        ))}
      </div>
      <p className="mt-1.5 flex items-center gap-1 text-[11px] text-[var(--ink-400)]">
        <Pencil size={11} />
        تلقائي من الماكينة — قابل للتعديل
      </p>
    </div>
  );
}

function MethodDiagram({ method, active }: { method: PrintMethod; active: boolean }) {
  const stroke = active ? 'var(--cyan-600)' : 'var(--ink-400)';
  return (
    <svg width="46" height="34" viewBox="0 0 46 34" fill="none" aria-hidden>
      {method === 'recto' && <rect x="8" y="5" width="30" height="24" rx="2" stroke={stroke} strokeWidth="1.5" />}
      {method === 'recto-verso' && (
        <>
          <rect x="8" y="3" width="30" height="13" rx="2" stroke={stroke} strokeWidth="1.5" />
          <rect x="8" y="18" width="30" height="13" rx="2" stroke={stroke} strokeWidth="1.5" strokeDasharray="3 2" />
        </>
      )}
      {method === 'bascule' && (
        <>
          {/* sheet 38×24: larger dimension is width → flip axis is the vertical
              midline, so the central gutter strip is vertical */}
          <rect x="4" y="5" width="38" height="24" rx="2" stroke={stroke} strokeWidth="1.5" />
          <rect x="21" y="5" width="4" height="24" fill={active ? 'var(--cyan-100)' : 'var(--paper-200)'} stroke={stroke} strokeWidth="1" />
        </>
      )}
      {method === 'double-pince' && (
        <>
          <rect x="4" y="3" width="38" height="28" rx="2" stroke={stroke} strokeWidth="1.5" />
          <rect x="4" y="3" width="38" height="5" fill={active ? 'var(--cyan-100)' : 'var(--paper-200)'} stroke={stroke} strokeWidth="1" />
          <rect x="4" y="26" width="38" height="5" fill={active ? 'var(--cyan-100)' : 'var(--paper-200)'} stroke={stroke} strokeWidth="1" />
        </>
      )}
    </svg>
  );
}

// ------------------------------- main panel ----------------------------------

export default function ControlsPanel(props: ControlsPanelProps) {
  const { state, patch, onKindChange, onMachineChange, onSheetPick, unit, onUnitChange } = props;
  const machine = machineOf(state);
  const canCompute =
    state.stickers.length > 0 && state.stickers.every((s) => s.widthMm > 0 && s.heightMm > 0 && s.quantity > 0);

  const primary = state.stickers[0];
  const designSummary =
    state.stickers.length === 1 && primary
      ? `تصميم واحد ${formatMeasure(primary.widthMm, 'cm')}×${formatMeasure(primary.heightMm, 'cm')} سم`
      : `${state.stickers.length} تصاميم في نفس الورقة`;

  /** Shared bleed change: linked designs follow it immediately. */
  const setSharedBleed = (bleedShared: typeof state.bleedShared) => {
    patch({
      bleedShared,
      stickers: state.stickers.map((s) => (s.bleedLinked ? { ...s, bleed: { ...bleedShared } } : s)),
    });
  };

  const updateSticker = (id: string, p: Partial<(typeof state.stickers)[number]>) => {
    patch({ stickers: state.stickers.map((s) => (s.id === id ? { ...s, ...p } : s)) });
  };

  const uploadedSticker = (asset: DesignFileAsset, quantity = 500) => {
    const detectedBleed = asset.detectedBleedMm;
    return {
      id: `st-${crypto.randomUUID?.() ?? Date.now().toString(36)}`,
      name: designNameFromAsset(asset),
      widthMm: asset.widthMm,
      heightMm: asset.heightMm,
      bleed: detectedBleed ? { ...detectedBleed } : { ...state.bleedShared },
      bleedLinked: !detectedBleed,
      quantity,
      asset,
    };
  };

  /**
   * The untouched first card is a placeholder, so the first uploaded page
   * replaces it. Later uploads append new cards up to MAX_GROUPS.
   */
  const addUploadedDesigns = (assets: DesignFileAsset[]) => {
    if (assets.length === 0) return;
    let stickers = [...state.stickers];
    let remaining = assets;
    if (stickers.length === 1 && !stickers[0].asset) {
      const first = assets[0];
      const detectedBleed = first.detectedBleedMm;
      stickers = [
        {
          ...stickers[0],
          name: designNameFromAsset(first),
          widthMm: first.widthMm,
          heightMm: first.heightMm,
          bleed: detectedBleed ? { ...detectedBleed } : stickers[0].bleed,
          bleedLinked: detectedBleed ? false : stickers[0].bleedLinked,
          asset: first,
        },
      ];
      remaining = assets.slice(1);
    }
    stickers = [...stickers, ...remaining.map((asset) => uploadedSticker(asset))].slice(0, MAX_GROUPS);
    patch({
      stickers,
      ...(assets.some((asset) => asset.hasEmbeddedCutContour) ? { cutMethod: 'cutcontour' as const } : {}),
    });
  };

  const attachCutContour = (stickerId: string, asset: DesignFileAsset) => {
    patch({
      stickers: state.stickers.map((sticker) =>
        sticker.id === stickerId ? { ...sticker, cutContour: asset } : sticker,
      ),
      cutMethod: 'cutcontour',
    });
  };

  const storageUsedByAnotherCard = (storageKey: string, stickerId: string) =>
    state.stickers.some(
      (sticker) =>
        sticker.id !== stickerId &&
        (sticker.asset?.storageKey === storageKey || sticker.cutContour?.storageKey === storageKey),
    );

  const clearStoredAttachment = (stickerId: string, kind: 'asset' | 'cutContour') => {
    const sticker = state.stickers.find((candidate) => candidate.id === stickerId);
    const attachment = sticker?.[kind];
    if (attachment && !storageUsedByAnotherCard(attachment.storageKey, stickerId)) {
      void deleteDesignFile(attachment.storageKey).catch(() => {
        /* Metadata removal remains valid even if browser storage cleanup fails. */
      });
    }
    updateSticker(stickerId, kind === 'asset' ? { asset: undefined, name: undefined } : { cutContour: undefined });
  };

  /** All design pairs (i < j) with their canonical engine key, for the pair-gap table. */
  const designPairs: { key: string; label: string }[] = [];
  for (let i = 0; i < state.stickers.length; i++) {
    for (let j = i + 1; j < state.stickers.length; j++) {
      designPairs.push({
        key: pairGapKey(state.stickers[i].id, state.stickers[j].id),
        label: `تصميم ${i + 1} ↔ تصميم ${j + 1}`,
      });
    }
  }

  const setPairGap = (key: string, v: number) => {
    patch({ pairGaps: { ...state.pairGaps, [key]: Math.max(0, v) } });
  };

  /**
   * «التصاق ذكي»: zeroes EVERY design pair explicitly (the panel never sees the
   * computed layout, so actual adjacency is unknown — zeroing all pairs is the
   * honest interpretation: any two designs may touch bleed-to-bleed).
   */
  const smartSnap = () => {
    const pairGaps: Record<string, number> = {};
    for (const p of designPairs) pairGaps[p.key] = 0;
    patch({ pairGaps });
  };

  /** Mode switch; the first switch to fixed seeds the counts from the last automatic suggestion. */
  const setCalcMode = (mode: CalcMode) => {
    if (mode === state.calcMode) return;
    if (mode === 'fixed') {
      patch({
        calcMode: 'fixed',
        stickers: state.stickers.map((s) =>
          s.copiesPerSheet && s.copiesPerSheet > 0
            ? s
            : { ...s, copiesPerSheet: stickerCopiesPerSheet(s, props.suggestedCopies) },
        ),
      });
    } else {
      patch({ calcMode: 'quantity' });
    }
  };

  const removeSticker = (id: string) => {
    const removed = state.stickers.find((sticker) => sticker.id === id);
    for (const attachment of [removed?.asset, removed?.cutContour]) {
      if (attachment && !storageUsedByAnotherCard(attachment.storageKey, id)) {
        void deleteDesignFile(attachment.storageKey).catch(() => {
          /* Orphan cleanup is best-effort and never blocks removing the card. */
        });
      }
    }
    patch({ stickers: state.stickers.filter((s) => s.id !== id) });
  };

  const addSticker = () => {
    patch({
      stickers: [
        ...state.stickers,
        {
          id: `st-${Date.now().toString(36)}`,
          widthMm: 78,
          heightMm: 78,
          bleed: { ...state.bleedShared },
          bleedLinked: true,
          quantity: 500,
        },
      ],
    });
  };

  const sheetSummary = state.customSheet
    ? `${formatMeasure(state.sheetW, 'cm')}×${formatMeasure(state.sheetH, 'cm')} سم — مخصص`
    : `${machine.sheetSizes.find((s) => sheetSizeMatches(machine.kind, s.widthMm, s.heightMm, state.sheetW, state.sheetH))?.label ?? `${formatMeasure(state.sheetW, 'cm')}×${formatMeasure(state.sheetH, 'cm')}`} — ${machine.name}`;

  return (
    <div className="flex flex-col gap-3">
      {/* Stage A — print type */}
      <StageCard letter="A" title="نوع الطباعة" summary={`${state.kind === 'digital' ? 'رقمية' : 'أوفست'} — ${machine.name}`}>
        <div className="relative mb-3 grid grid-cols-2 rounded-[10px] border border-[var(--line)] bg-[var(--paper-100)] p-1">
          {(
            [
              { id: 'digital', label: 'رقمية', icon: Printer },
              { id: 'offset', label: 'أوفست', icon: Layers },
            ] as { id: MachineKind; label: string; icon: typeof Printer }[]
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onKindChange(id)}
              className={cn(
                'relative flex h-9 items-center justify-center gap-1.5 rounded-[8px] text-[14px] font-semibold transition-colors',
                state.kind === id ? 'text-white' : 'text-[var(--ink-500)] hover:text-[var(--ink-700)]',
              )}
            >
              {state.kind === id && (
                <motion.span
                  layoutId="print-kind-pill"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                  className="absolute inset-0 rounded-[8px] bg-[var(--cyan-600)]"
                />
              )}
              <Icon size={16} className="relative" />
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={state.kind}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="space-y-3"
          >
            <MachinePicker kind={state.kind} value={state.machineId} onChange={onMachineChange} />
            {state.kind === 'digital' ? (
              <MarginInputs value={state.margins} onChange={(margins) => patch({ margins })} />
            ) : (
              <div>
                <NumberField
                  label="Prise de pince (مم)"
                  value={state.pinceMm}
                  onChange={(pinceMm) => patch({ pinceMm })}
                  min={0}
                  unitSuffix="mm"
                />
                <p className="mt-1.5 text-[11px] text-[var(--ink-400)]">تُطبَّق دائمًا على الحافة الأكبر للورقة.</p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </StageCard>

      {/* Stage B — sheet */}
      <StageCard letter="B" title="الورقة" summary={sheetSummary}>
        <label className="mb-3 flex items-center gap-2 text-[13px] text-[var(--ink-700)]">
          <input
            type="checkbox"
            checked={state.autoSuggest}
            onChange={(e) => patch({ autoSuggest: e.target.checked })}
            className="h-4 w-4 accent-[var(--cyan-600)]"
          />
          اقتراح تلقائي (أفضل ورقة بأقل هدر)
        </label>
        <div className="flex flex-wrap gap-1.5">
          {machine.sheetSizes.map((s, i) => {
            const active =
              !state.customSheet && sheetSizeMatches(machine.kind, s.widthMm, s.heightMm, state.sheetW, state.sheetH);
            const waste = props.sheetWaste.get(s.id);
            const rec = props.recommendedSheetId === s.id;
            return (
              <motion.button
                key={s.id}
                type="button"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.035, duration: 0.2 }}
                onClick={() => onSheetPick(s.widthMm, s.heightMm, false)}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors',
                  active
                    ? 'border-[var(--cyan-600)] bg-[var(--cyan-50)] font-semibold text-[var(--cyan-600)]'
                    : 'border-[var(--line-strong)] bg-white text-[var(--ink-700)] hover:bg-[var(--paper-100)]',
                )}
              >
                {active && <Check size={12} />}
                <span dir="ltr" className="font-latin">
                  {s.label}
                </span>
                {state.autoSuggest && waste && (
                  <span
                    dir="ltr"
                    className="font-latin rounded-full px-1.5 py-px text-[10px] font-semibold text-white"
                    style={{ backgroundColor: WASTE_COLORS[wasteLevel(waste.wastePercent)] }}
                  >
                    {formatPercent(waste.wastePercent, 0)}
                  </span>
                )}
                {state.autoSuggest && rec && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 20 }}
                    className="text-[var(--cyan-600)]"
                  >
                    <Sparkles size={13} />
                  </motion.span>
                )}
              </motion.button>
            );
          })}
          <button
            type="button"
            onClick={() => patch({ customSheet: true })}
            className={cn(
              'rounded-full border px-3 py-1.5 text-[12px] transition-colors',
              state.customSheet
                ? 'border-[var(--cyan-600)] bg-[var(--cyan-50)] font-semibold text-[var(--cyan-600)]'
                : 'border-dashed border-[var(--line-strong)] text-[var(--ink-500)] hover:bg-[var(--paper-100)]',
            )}
          >
            مقاس مخصص
          </button>
        </div>
        <AnimatePresence>
          {state.customSheet && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <DimensionGroup
                className="mt-3"
                label="مقاس الورقة المخصص"
                value={{ widthMm: state.sheetW, heightMm: state.sheetH }}
                onChange={(v) => patch({ sheetW: v.widthMm, sheetH: v.heightMm })}
                unit={unit}
                onUnitChange={onUnitChange}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </StageCard>

      {/* Stage C — designs (unified: primary design + multi-montage) */}
      <StageCard letter="C" title="التصاميم" summary={designSummary}>
        <div className="space-y-3">
          {/* calc-mode segmented toggle (same pill style as the print-kind switch) */}
          <div>
            <div className="relative grid grid-cols-2 rounded-[10px] border border-[var(--line)] bg-[var(--paper-100)] p-1">
              {(
                [
                  { id: 'quantity', label: 'تلقائي من الكميات', icon: Sparkles },
                  { id: 'fixed', label: 'عدد ثابت في الورقة', icon: Hash },
                ] as { id: CalcMode; label: string; icon: typeof Sparkles }[]
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCalcMode(id)}
                  className={cn(
                    'relative flex h-9 items-center justify-center gap-1.5 rounded-[8px] text-[13px] font-semibold transition-colors',
                    state.calcMode === id ? 'text-white' : 'text-[var(--ink-500)] hover:text-[var(--ink-700)]',
                  )}
                >
                  {state.calcMode === id && (
                    <motion.span
                      layoutId="calc-mode-pill"
                      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                      className="absolute inset-0 rounded-[8px] bg-[var(--cyan-600)]"
                    />
                  )}
                  <Icon size={15} className="relative" />
                  <span className="relative">{label}</span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--ink-400)]">
              {state.calcMode === 'fixed'
                ? 'تحدد أنت عدد نسخ كل تصميم في الورقة — يُركَّب العدد بالضبط أو يُرفض بتحذير.'
                : 'النظام يوزّع الورقة تلقائيًا بأقرب نسبة تحترم الكميات.'}
            </p>
          </div>

          <div>
            <BleedGroup label="Bleed موحّد للجميع" value={state.bleedShared} onChange={setSharedBleed} unit={unit} />
            <p className="mt-1.5 text-[11px] text-[var(--ink-400)]">التصاميم المربوطة تتبع هذا الـBleed تلقائيًا — افك الربط لتخصيص Bleed خاص.</p>
          </div>

          <DesignFileUploader
            stickers={state.stickers}
            maxDesigns={MAX_GROUPS}
            onAddDesigns={addUploadedDesigns}
            onAttachCutContour={attachCutContour}
          />

          <AnimatePresence initial={false}>
            {state.stickers.map((s, i) => (
              <motion.div
                key={s.id}
                layout
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="rounded-[10px] border border-[var(--line)] bg-[var(--paper-50)] p-2.5"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[12px] font-semibold text-[var(--ink-700)]">
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 20 }}
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: GROUP_COLORS[i % GROUP_COLORS.length] }}
                    />
                    {s.name || `تصميم ${i + 1}`}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateSticker(s.id, s.bleedLinked ? { bleedLinked: false } : { bleedLinked: true, bleed: { ...state.bleedShared } })}
                      title={s.bleedLinked ? 'فك الربط عن الـBleed الموحّد' : 'الربط بالـBleed الموحّد'}
                      className={cn(
                        'grid h-7 w-7 place-items-center rounded-[6px] transition-colors',
                        s.bleedLinked ? 'bg-[var(--cyan-100)] text-[var(--cyan-600)]' : 'bg-[var(--paper-100)] text-[var(--ink-400)]',
                      )}
                    >
                      {s.bleedLinked ? <Link2 size={14} /> : <Unlink2 size={14} />}
                    </button>
                    <button
                      type="button"
                      aria-label="حذف التصميم"
                      onClick={() => removeSticker(s.id)}
                      className="grid h-7 w-7 place-items-center rounded-[6px] text-[var(--ink-400)] transition-colors hover:bg-[var(--paper-200)] hover:text-[var(--danger-600)]"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
                {s.asset && (
                  <div className="mb-2 rounded-[9px] border border-[var(--line)] bg-white p-2">
                    <div className="flex items-center gap-2">
                      <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[7px] border border-[var(--line)] bg-[var(--paper-100)]">
                        {s.asset.previewDataUrl ? (
                          <img src={s.asset.previewDataUrl} alt="" className="h-full w-full object-contain" />
                        ) : (
                          <FileText size={18} className="text-[var(--ink-300)]" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p dir="ltr" className="font-latin truncate text-[11px] font-semibold text-[var(--ink-700)]">
                          {s.asset.fileName}
                        </p>
                        <p className="mt-0.5 text-[10px] text-[var(--ink-400)]">
                          {s.asset.format.toUpperCase()}
                          {s.asset.pageCount && s.asset.pageCount > 1 ? ` · صفحة ${s.asset.pageNumber}/${s.asset.pageCount}` : ''}
                          {' · '}{s.asset.measurementSource}
                        </p>
                      </div>
                      <button
                        type="button"
                        title="فصل ملف التصميم مع إبقاء القياسات"
                        onClick={() => clearStoredAttachment(s.id, 'asset')}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] text-[var(--ink-400)] hover:bg-[var(--paper-200)] hover:text-[var(--danger-600)]"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    {s.asset.warnings.length > 0 && (
                      <p className="mt-1.5 flex items-start gap-1 text-[10px] leading-4 text-amber-700">
                        <TriangleAlert size={11} className="mt-0.5 shrink-0" />
                        {s.asset.warnings[0]}
                      </p>
                    )}
                  </div>
                )}
                {s.cutContour && (
                  <div
                    className={cn(
                      'mb-2 rounded-[8px] border px-2.5 py-2',
                      s.cutContour.match?.status === 'matched' && 'border-emerald-200 bg-emerald-50',
                      s.cutContour.match?.status === 'review' && 'border-amber-200 bg-amber-50',
                      s.cutContour.match?.status === 'mismatch' && 'border-red-200 bg-red-50',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Scissors size={13} className="shrink-0 text-[var(--ink-500)]" />
                      <div className="min-w-0 flex-1">
                        <p dir="ltr" className="font-latin truncate text-[10px] font-semibold text-[var(--ink-700)]">
                          {s.cutContour.fileName}
                        </p>
                        <p className="mt-0.5 text-[10px] text-[var(--ink-500)]">
                          {s.cutContour.match?.status === 'matched'
                            ? 'مسار القص مطابق للقياس'
                            : s.cutContour.match?.status === 'review'
                              ? 'فرق صغير — يحتاج مراجعة'
                              : 'تحذير: قياس مسار القص مختلف'}
                        </p>
                      </div>
                      <button
                        type="button"
                        title="إزالة مسار القص"
                        onClick={() => clearStoredAttachment(s.id, 'cutContour')}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-[6px] text-[var(--ink-400)] hover:bg-white/70 hover:text-[var(--danger-600)]"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                )}
                <DimensionGroup
                  value={{ widthMm: s.widthMm, heightMm: s.heightMm }}
                  onChange={(v) => updateSticker(s.id, { widthMm: v.widthMm, heightMm: v.heightMm })}
                  unit={unit}
                  onUnitChange={onUnitChange}
                />
                {state.calcMode === 'quantity' && (
                  <div className="mt-2">
                    <NumberField
                      label="الكمية"
                      value={s.quantity}
                      onChange={(q) => updateSticker(s.id, { quantity: Math.max(1, Math.floor(q)) })}
                      min={1}
                      presets={i === 0 ? QUANTITY_PRESETS : undefined}
                    />
                    {i === 0 && <p className="mt-1.5 text-[11px] text-[var(--ink-400)]">النظام يحترم الكمية أو أقرب نسبة ممكنة.</p>}
                  </div>
                )}
                {state.calcMode === 'fixed' && (
                  <div className="mt-2">
                    <NumberField
                      label="نسخ/ورقة"
                      value={stickerCopiesPerSheet(s, props.suggestedCopies)}
                      onChange={(n) => updateSticker(s.id, { copiesPerSheet: Math.max(1, Math.floor(n)) })}
                      min={1}
                    />
                    <p className="mt-1.5 text-[11px] text-[var(--ink-400)]">
                      العدد الدقيق من هذا التصميم في الورقة الواحدة — الافتراضي من آخر اقتراح تلقائي.
                    </p>
                  </div>
                )}
                {s.bleedLinked ? (
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-[var(--ink-400)]">
                    <Link2 size={11} className="text-[var(--cyan-600)]" />
                    يتبع الـBleed الموحّد — {trimNumber(state.bleedShared.top)}مم من كل جهة
                  </p>
                ) : (
                  <BleedGroup
                    className="mt-2"
                    label="Bleed خاص بهذا التصميم"
                    value={s.bleed}
                    onChange={(bleed) => updateSticker(s.id, { bleed })}
                    unit={unit}
                  />
                )}
                <NumberField
                  className="mt-2"
                  label="فاصل النسخ (مم)"
                  value={s.intraGapMm ?? 0}
                  onChange={(v) => updateSticker(s.id, { intraGapMm: v > 0 ? v : undefined })}
                  min={0}
                  unitSuffix="mm"
                />
                <p className="mt-1 text-[11px] text-[var(--ink-400)]">هواء إضافي بين نسخ هذا التصميم نفسه — 0 = تلاصق (فوق الـBleed).</p>
              </motion.div>
            ))}
          </AnimatePresence>

          {state.stickers.length < MAX_GROUPS && (
            <button
              type="button"
              onClick={addSticker}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-[var(--line-strong)] text-[13px] font-medium text-[var(--ink-500)] transition-colors hover:border-[var(--cyan-600)] hover:text-[var(--cyan-600)]"
            >
              <Plus size={15} />
              أضف تصميماً آخر
            </button>
          )}
          {state.stickers.length > 1 && state.calcMode === 'quantity' && <RatioHint state={state} />}
        </div>
      </StageCard>

      {/* Stage D — print method */}
      <StageCard letter="D" title="طريقة الطباعة" summary={PRINT_METHODS.find((m) => m.id === state.method)?.latin}>
        <div className="grid grid-cols-2 gap-2">
          {PRINT_METHODS.map((m, i) => {
            const active = state.method === m.id;
            return (
              <motion.button
                key={m.id}
                type="button"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.045, duration: 0.25 }}
                onClick={() => patch({ method: m.id })}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-[10px] border px-2 py-2.5 text-center transition-colors',
                  active ? 'border-[var(--cyan-600)] bg-[var(--cyan-50)]' : 'border-[var(--line)] bg-white hover:bg-[var(--paper-100)]',
                )}
              >
                <MethodDiagram method={m.id} active={active} />
                <span className={cn('text-[12px] font-semibold', active ? 'text-[var(--cyan-600)]' : 'text-[var(--ink-700)]')}>{m.label}</span>
                <span dir="ltr" className="font-latin text-[10px] text-[var(--ink-400)]">
                  {m.latin}
                </span>
              </motion.button>
            );
          })}
        </div>
        <AnimatePresence>
          {state.method === 'bascule' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <NumberField
                className="mt-3"
                label="المساحة الوسطية (مم)"
                value={state.gutterMm}
                onChange={(gutterMm) => patch({ gutterMm })}
                min={0}
                unitSuffix="mm"
              />
              <p className="mt-1.5 text-[11px] text-[var(--ink-400)]">الافتراضي 10 مم (1 سم) ويمكن التقليل حسب الماكينة — محور القلب منتصف القياس الأكبر</p>
            </motion.div>
          )}
          {state.method === 'double-pince' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <NumberField
                className="mt-3"
                label="عرض القبضة (مم)"
                value={state.gripMm ?? 10}
                onChange={(gripMm) => patch({ gripMm })}
                min={0}
                unitSuffix="mm"
              />
              <p className="mt-1.5 text-[11px] text-[var(--ink-400)]">الافتراضي 10 مم (1 سم) ويمكن التقليل حسب الماكينة — تحل محل الهامش على طرفي القياس الأصغر (المقاسات العالمية)</p>
            </motion.div>
          )}
        </AnimatePresence>
      </StageCard>

      {/* Stage E — cutting */}
      <StageCard letter="E" title="القص" summary={CUT_METHODS.find((c) => c.id === state.cutMethod)?.latin}>
        <div className="space-y-3">
          <SelectWithPrice
            label="طريقة القص لكل ملصق"
            options={CUT_METHODS.map((c) => ({ id: c.id, label: c.label, latinLabel: c.latin, priceDelta: 0, deltaUnit: 'perCopy' as const }))}
            value={state.cutMethod}
            onChange={(id) => patch({ cutMethod: id as MontageUIState['cutMethod'] })}
          />
          <AnimatePresence>
            {state.cutMethod !== 'guillotine' && (
              <motion.span
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.85, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--magenta-600)]/40 bg-[var(--magenta-600)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--magenta-600)]"
              >
                <Scissors size={12} />
                <span dir="ltr" className="font-latin font-semibold">
                  CutContour
                </span>
                سيُصدَّر مسار القص كصفحة منفصلة في PDF
              </motion.span>
            )}
          </AnimatePresence>
          <YesNoToggle label="قص مشترك داخل المجموعة" checked={state.sharedCut} onChange={(sharedCut) => patch({ sharedCut })} />
          <YesNoToggle label="قص مزدوج بين المجموعات" checked={state.doubleCut} onChange={(doubleCut) => patch({ doubleCut })} />
          <div className="border-t border-[var(--line)] pt-3">
            <NumberField
              label="الفاصل العام (مم)"
              value={state.defaultGapMm}
              onChange={(v) => patch({ defaultGapMm: Math.max(0, v) })}
              min={0}
              unitSuffix="mm"
            />
            <p className="mt-1.5 text-[11px] text-[var(--ink-400)]">
              هواء إضافي بين أي قطعتين (فوق تلاصق الـBleed) — قيد صلب لا يُخرَق. 0 = السلوك الحالي.
            </p>
          </div>
          {designPairs.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[13px] font-medium text-[var(--ink-700)]">فواصل الأزواج (مم)</span>
                <button
                  type="button"
                  onClick={smartSnap}
                  title="تصفير كل فواصل الأزواج — أي تصميمين قد يتلاصقان"
                  className="flex items-center gap-1 rounded-full border border-[var(--line-strong)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink-500)] transition-colors hover:border-[var(--cyan-600)] hover:text-[var(--cyan-600)]"
                >
                  <Sparkles size={12} />
                  التصاق ذكي
                </button>
              </div>
              <div className="space-y-2">
                {designPairs.map((p) => (
                  <div key={p.key} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 text-[12px] text-[var(--ink-500)]">{p.label}</span>
                    <NumberField
                      className="flex-1"
                      value={state.pairGaps[p.key] ?? 0}
                      onChange={(v) => setPairGap(p.key, v)}
                      min={0}
                      unitSuffix="mm"
                    />
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-[var(--ink-400)]">
                أولوية أعلى من الفاصل العام والفاصل الداخلي — «التصاق ذكي» يصفّر كل الأزواج.
              </p>
            </div>
          )}
        </div>
      </StageCard>

      {/* sticky primary action */}
      <div className="sticky bottom-0 -mx-1 bg-gradient-to-t from-[var(--paper-50)] via-[var(--paper-50)] to-transparent px-1 pb-1 pt-4">
        <AnimatePresence>
          {state.calcMode === 'fixed' && props.fixedWarnings && props.fixedWarnings.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="mb-2 rounded-[10px] border border-[var(--danger-600)]/40 bg-[var(--danger-600)]/10 p-2.5">
                <p className="mb-1 flex items-center gap-1.5 text-[12px] font-bold text-[var(--danger-600)]">
                  <TriangleAlert size={14} />
                  الأعداد المطلوبة لا تسع الورقة
                </p>
                <ul className="space-y-0.5 text-[11px] leading-5 text-[var(--ink-700)]">
                  {props.fixedWarnings.map((w) => (
                    <li key={w}>• {w}</li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          type="button"
          onClick={props.onCompute}
          disabled={!canCompute || props.computing}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--cyan-600)] text-[15px] font-bold text-white shadow-[var(--shadow-card)] transition-all hover:-translate-y-px hover:bg-[var(--cyan-500)] active:translate-y-0 active:brightness-95 disabled:translate-y-0 disabled:opacity-50"
        >
          {props.computing ? (
            <>
              <svg width="18" height="18" viewBox="0 0 18 18" className="animate-spin" fill="none" aria-hidden>
                <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.6" strokeDasharray="10 6" />
                <circle cx="9" cy="9" r="2" fill="currentColor" />
              </svg>
              جارٍ الحساب…
            </>
          ) : (
            <>
              <Sparkles size={17} />
              احسب المونتاج
            </>
          )}
        </button>
        {!canCompute && <p className="mt-1.5 text-center text-[11px] text-[var(--ink-400)]">أدخل مقاس التصميم والكمية أولًا</p>}
        <p className="mt-2 text-center text-[10px] tracking-wide text-[var(--ink-300)]" dir="ltr">
          ARTeam PrintFlow · engine v13.1 · 2026-07-24 20:10
        </p>
      </div>
    </div>
  );
}

function RatioHint({ state }: { state: MontageUIState }) {
  const qtys = state.stickers.map((s) => s.quantity);
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = qtys.reduce((acc, q) => gcd(acc, Math.max(1, Math.round(q))), Math.max(1, Math.round(qtys[0] ?? 1)));
  const ratio = qtys.map((q) => Math.max(1, Math.round(q / g)));
  return (
    <p className="text-[11px] text-[var(--ink-400)]">
      النسبة بين التصاميم{' '}
      <span dir="ltr" className="font-latin font-semibold text-[var(--ink-700)]">
        {ratio.join(':')}
      </span>{' '}
      — أقرب توزيع يحترم الكميات
    </p>
  );
}
