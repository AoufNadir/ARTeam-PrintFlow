import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import ControlsPanel, { type SheetWasteInfo } from '@/components/montage/ControlsPanel';
import SheetCanvas from '@/components/montage/SheetCanvas';
import ResultsPanel from '@/components/montage/ResultsPanel';
import PdfExportModal from '@/components/montage/PdfExportModal';
import { migrateStateDraft } from '@/components/montage/montage-migrate';
import {
  INITIAL_STATE,
  MONTAGE_MACHINES,
  allGroups,
  buildEngineInput,
  computeFixedWithFallback,
  computeWithFallback,
  effectiveMachines,
  estimateCost,
  inputsValid,
  machineOf,
  normalizeSheetForKind,
  sheetSizeMatches,
  stickerBleed,
  stickerCopiesPerSheet,
  wasteForSheet,
  type MontageUIState,
} from '@/components/montage/montage-data';
import { useUnit } from '@/components/layout-context';
import { bestSheet, computeMontageVariants, type FixedMontageFailure, type MontageVariant } from '@/lib/montage-engine';
import { db } from '@/lib/storage';
import { trimNumber } from '@/lib/units';
import type { MachineKind, MontageResult, PlacedPiece, SheetAlternative } from '@/lib/types';

const EASE = [0.22, 0.68, 0.26, 1] as [number, number, number, number];
const MANUAL_KEY = 'arteam-printflow:montage-manual';
const DRAFT_KEY = 'arteam-printflow:montage-draft';
const STATE_DRAFT_KEY = 'arteam-printflow:montage-state-draft';

function loadStateDraft(): MontageUIState {
  try {
    const raw = localStorage.getItem(STATE_DRAFT_KEY);
    if (raw) {
      const migrated = migrateStateDraft(JSON.parse(raw));
      if (migrated) return migrated;
    }
  } catch {
    /* corrupted draft — fall back to the initial state */
  }
  return INITIAL_STATE;
}

/**
 * Single normalization gate for the studio state: offset sheets always live
 * LANDSCAPE in the UI/engine/PDF space (grip edge at the bottom). Every state
 * write passes through here so no layer ever sees a portrait offset sheet.
 */
function normalizeState(st: MontageUIState): MontageUIState {
  const n = normalizeSheetForKind(st.kind, st.sheetW, st.sheetH);
  if (n.sheetW === st.sheetW && n.sheetH === st.sheetH) return st;
  return { ...st, ...n };
}

export default function Montage() {
  const { unit, setUnit } = useUnit();
  const [state, setState] = useState<MontageUIState>(loadStateDraft);
  const [result, setResult] = useState<MontageResult | null>(null);
  const [fixedFailure, setFixedFailure] = useState<FixedMontageFailure | null>(null);
  const [suggestedCopies, setSuggestedCopies] = useState<Map<string, number>>(new Map());
  const [computing, setComputing] = useState(false);
  const [manualPlaced, setManualPlaced] = useState<PlacedPiece[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [variants, setVariants] = useState<MontageVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedPiece, setSelectedPiece] = useState<number | null>(null);
  const [verso, setVerso] = useState(false);
  const [showCutMarks, setShowCutMarks] = useState(true);
  const [pdfOpen, setPdfOpen] = useState(false);
  const debounceRef = useRef<number>(0);

  const machine = machineOf(state);
  const effMachine = useMemo(
    () => effectiveMachines(state).find((m) => m.id === state.machineId) ?? machine,
    [state, machine],
  );
  // pricing rules: re-read whenever they may have changed (another tab via
  // the `storage` event, or this tab regaining focus after editing prices in
  // the pricing page) instead of freezing them in an empty-deps useMemo.
  const [rules, setRules] = useState(() => db.currentRules());
  useEffect(() => {
    const refresh = () => {
      const next = db.currentRules();
      setRules((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const patch = useCallback(
    (p: Partial<MontageUIState>) => setState((st) => normalizeState({ ...st, ...p })),
    [],
  );

  // persist the studio state draft (debounced) — re-saves migrated legacy
  // drafts in the new stickers[] shape on the first run after load
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(STATE_DRAFT_KEY, JSON.stringify(state));
      } catch {
        /* storage full — non-blocking */
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [state]);

  // --------------------------- engine wiring ---------------------------------

  const runCompute = useCallback(
    (st: MontageUIState) => {
      if (!inputsValid(st)) return;
      let effective = st;
      // auto-suggest: pick the lowest-waste sheet via the engine's bestSheet()
      if (st.autoSuggest && !st.customSheet) {
        // candidates are evaluated in the normalized space: offset sheet sizes
        // arrive landscape from effectiveMachines (grip at the bottom)
        const candSheets =
          effectiveMachines(st).find((m) => m.id === st.machineId)?.sheetSizes ??
          machineOf(st).sheetSizes;
        const best = bestSheet(
          allGroups(st).map((g) => ({ widthMm: g.widthMm, heightMm: g.heightMm, quantity: g.quantity, bleedMm: g.bleedMm })),
          candSheets.map((s) => ({ widthMm: s.widthMm, heightMm: s.heightMm, machineId: st.machineId })),
          effectiveMachines(st),
          {
            bleedMm: st.stickers[0] ? stickerBleed(st, st.stickers[0]) : st.bleedShared,
            method: st.method,
            gutterMm: st.gutterMm,
            gripMm: st.gripMm,
          },
        );
        if (best && (best.widthMm !== st.sheetW || best.heightMm !== st.sheetH)) {
          effective = normalizeState({ ...st, sheetW: best.widthMm, sheetH: best.heightMm });
          setState(effective);
        }
      }
      if (effective.calcMode === 'fixed') {
        // fixed mode: exact per-sheet counts; failure is explicit (never a fake result)
        const outcome = computeFixedWithFallback(effective);
        if (outcome.ok) {
          setResult(outcome);
          setFixedFailure(null);
        } else {
          setResult(null);
          setFixedFailure(outcome);
        }
        setVariants([]);
        setSelectedVariant(0);
      } else {
        const r = computeWithFallback(effective);
        setFixedFailure(null);
        // candidate montage variants (balanced / min-waste / easy-cut) — the
        // user picks the trade-off; variant[0] (balanced) is the default.
        const vm = effectiveMachines(effective).find((m) => m.id === effective.machineId) ?? machineOf(effective);
        let vs = r ? computeMontageVariants(buildEngineInput(effective), vm) : [];
        if (vs.length === 0 && r) {
          vs = [{ kind: 'balanced', label: 'متوازن', description: '', cutScore: 0, result: r }];
        }
        setVariants(vs);
        setSelectedVariant(0);
        setResult(vs.length > 0 ? { ...vs[0].result, alternatives: r?.alternatives ?? [] } : r);
        if (r) {
          // remember the automatic per-design counts — they seed the fixed mode fields
          const counts = new Map<string, number>();
          for (const p of r.placed) counts.set(p.groupId, (counts.get(p.groupId) ?? 0) + 1);
          setSuggestedCopies(counts);
        }
      }
      setManualPlaced(null);
      setSelectedPiece(null);
      window.setTimeout(() => setComputing(false), 320);
    },
    [],
  );

  // debounced recalculation on every committed input change (250ms)
  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    const valid = inputsValid(state);
    debounceRef.current = window.setTimeout(() => {
      if (!valid) {
        setResult(null);
        setComputing(false);
        return;
      }
      setComputing(true);
      runCompute(state);
    }, 250);
    return () => window.clearTimeout(debounceRef.current);
  }, [state, runCompute]);

  const onCompute = useCallback(() => {
    window.clearTimeout(debounceRef.current);
    setComputing(true);
    runCompute(state);
  }, [state, runCompute]);

  // per-sheet waste badges + recommended chip
  const sheetWaste = useMemo(() => {
    const map = new Map<string, SheetWasteInfo | null>();
    if (!inputsValid(state)) return map;
    for (const s of machine.sheetSizes) map.set(s.id, wasteForSheet(state, s.widthMm, s.heightMm));
    return map;
  }, [state, machine]);

  const recommendedSheetId = useMemo(() => {
    let bestId: string | null = null;
    let bestWaste = Infinity;
    for (const s of machine.sheetSizes) {
      const w = sheetWaste.get(s.id);
      if (w && w.wastePercent < bestWaste) {
        bestWaste = w.wastePercent;
        bestId = s.id;
      }
    }
    return bestId;
  }, [machine, sheetWaste]);

  // fixed mode blocking warnings: requested count per design vs. the maximum
  // that actually fits (from the engine's real packing attempt)
  const fixedWarnings = useMemo(() => {
    if (state.calcMode !== 'fixed' || !fixedFailure) return null;
    const lines = state.stickers
      .map((s, i) => {
        const req = stickerCopiesPerSheet(s, suggestedCopies);
        const max = fixedFailure.maxPerGroup[s.id] ?? 0;
        if (req <= max) return null;
        return `العدد المطلوب من تصميم ${i + 1} (${trimNumber(req)} نسخة) لا يسع الورقة — أقصى عدد ممكن: ${trimNumber(max)}`;
      })
      .filter((l): l is string => l !== null);
    return lines.length > 0 ? lines : [fixedFailure.reason];
  }, [state.calcMode, state.stickers, fixedFailure, suggestedCopies]);

  // --------------------------- selections / canvas -----------------------------

  const placed: PlacedPiece[] = useMemo(
    () => manualPlaced ?? result?.placed ?? [],
    [manualPlaced, result],
  );

  // commit بسيط — سجل التراجع/الإعادة يعيش داخل SheetCanvas (الوضع اليدوي)
  const commitPieces = useCallback((next: PlacedPiece[]) => {
    setManualPlaced(next);
  }, []);

  const resetManual = useCallback(() => {
    setManualPlaced(null);
    setSelectedPiece(null);
    toast.info('عاد المخطط إلى اقتراح النظام');
  }, []);

  const onSelectVariant = useCallback(
    (i: number) => {
      const v = variants[i];
      if (!v) return;
      setSelectedVariant(i);
      setResult((prev) => ({ ...v.result, alternatives: prev?.alternatives ?? [] }));
      setManualPlaced(null);
      setSelectedPiece(null);
    },
    [variants],
  );

  const saveManual = useCallback(() => {
    try {
      localStorage.setItem(
        MANUAL_KEY,
        JSON.stringify({ input: buildEngineInput(state), placed, savedAt: new Date().toISOString() }),
      );
      toast.success('تم حفظ المخطط اليدوي');
    } catch {
      toast.error('تعذّر حفظ المخطط');
    }
  }, [state, placed]);

  // --------------------------- control handlers --------------------------------

  const onKindChange = useCallback((kind: MachineKind) => {
    setState((st) => {
      const m = MONTAGE_MACHINES.find((x) => x.kind === kind) ?? MONTAGE_MACHINES[0];
      const first = m.sheetSizes[0];
      return normalizeState({
        ...st,
        kind,
        machineId: m.id,
        margins: { ...m.margins },
        pinceMm: m.priseDePince ?? st.pinceMm,
        sheetW: first.widthMm,
        sheetH: first.heightMm,
        customSheet: false,
      });
    });
  }, []);

  const onMachineChange = useCallback((id: string) => {
    setState((st) => {
      const m = MONTAGE_MACHINES.find((x) => x.id === id) ?? MONTAGE_MACHINES[0];
      const keep = m.sheetSizes.find((s) => sheetSizeMatches(m.kind, s.widthMm, s.heightMm, st.sheetW, st.sheetH));
      const first = keep ?? m.sheetSizes[0];
      return normalizeState({
        ...st,
        machineId: m.id,
        margins: { ...m.margins },
        pinceMm: m.priseDePince ?? st.pinceMm,
        sheetW: first.widthMm,
        sheetH: first.heightMm,
        customSheet: false,
      });
    });
  }, []);

  const onSheetPick = useCallback(
    (w: number, h: number, custom: boolean) => {
      patch({ sheetW: w, sheetH: h, customSheet: custom, autoSuggest: false });
    },
    [patch],
  );

  const onAdoptAlternative = useCallback(
    (alt: SheetAlternative) => {
      setState((st) => {
        const targetMachine =
          alt.machineId && MONTAGE_MACHINES.some((m) => m.id === alt.machineId && m.kind === st.kind)
            ? MONTAGE_MACHINES.find((m) => m.id === alt.machineId)!
            : machineOf(st);
        const inPresets = targetMachine.sheetSizes.some((s) =>
          sheetSizeMatches(targetMachine.kind, s.widthMm, s.heightMm, alt.sheetWidthMm, alt.sheetHeightMm),
        );
        return normalizeState({
          ...st,
          machineId: targetMachine.id,
          margins: { ...targetMachine.margins },
          pinceMm: targetMachine.priseDePince ?? st.pinceMm,
          sheetW: alt.sheetWidthMm,
          sheetH: alt.sheetHeightMm,
          customSheet: !inPresets,
          autoSuggest: false,
        });
      });
      toast.success('تم اعتماد البديل — أُعيد الحساب');
    },
    [],
  );

  const onAdopt = useCallback(() => {
    if (!result) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ result, placed, input: buildEngineInput(state), savedAt: new Date().toISOString() }));
    } catch {
      /* storage full — non-blocking */
    }
    toast.success('تم اعتماد المخطط — سيُدرج في Devis الجديد');
  }, [result, placed, state]);

  // --------------------------- keyboard ----------------------------------------
  // (اختصارات الوضع اليدوي — تراجع/حذف/تدوير/أسهم — تعيش داخل SheetCanvas)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (typing) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return; // native text undo / editing keys win inside fields
      }
      if (e.key === 'Escape') {
        if (pdfOpen) setPdfOpen(false);
        else if (editing) setEditing(false);
      }
      if (e.key === 'Enter' && tag !== 'BUTTON') onCompute();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pdfOpen, editing, onCompute]);

  // --------------------------- render ------------------------------------------

  const cost = result ? estimateCost(result, effMachine, rules) : null;

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)_360px]">
      {/* Zone 1 — controls (right / start) */}
      <motion.div
        initial={{ x: 32, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.45, ease: EASE }}
        className="min-w-0"
      >
        <ControlsPanel
          state={state}
          patch={patch}
          onKindChange={onKindChange}
          onMachineChange={onMachineChange}
          onSheetPick={onSheetPick}
          unit={unit}
          onUnitChange={setUnit}
          sheetWaste={sheetWaste}
          recommendedSheetId={recommendedSheetId}
          suggestedCopies={suggestedCopies}
          fixedWarnings={fixedWarnings}
          computing={computing}
          onCompute={onCompute}
        />
      </motion.div>

      {/* Zone 2 — live sheet canvas (center, always beside inputs) */}
      <motion.div
        initial={{ scale: 0.97, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.45, delay: 0.1, ease: EASE }}
        className="h-[560px] min-w-0 xl:sticky xl:top-[88px] xl:h-[calc(100dvh-64px-48px)]"
      >
        <SheetCanvas
          state={state}
          machine={effMachine}
          result={result}
          placed={placed}
          onCommitPieces={commitPieces}
          manualMode={editing}
          onToggleEditing={() => setEditing((v) => !v)}
          computing={computing}
          unit={unit}
          onUnitChange={setUnit}
          verso={verso}
          onVersoChange={setVerso}
          selectedGroupId={selectedGroupId}
          onSelectGroup={setSelectedGroupId}
          selectedPiece={selectedPiece}
          onSelectPiece={setSelectedPiece}
          showCutMarks={showCutMarks}
          onToggleCutMarks={() => setShowCutMarks((v) => !v)}
          onSaveManual={saveManual}
          onResetManual={resetManual}
        />
      </motion.div>

      {/* Zone 3 — results (left / end) */}
      <motion.div
        initial={{ x: -32, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.45, delay: 0.2, ease: EASE }}
        className="min-w-0"
      >
        <ResultsPanel
          state={state}
          machine={effMachine}
          result={result}
          rules={rules}
          placedCount={placed.length}
          placedPieces={placed}
          fixedWarnings={fixedWarnings}
          unit={unit}
          variants={variants}
          selectedVariant={selectedVariant}
          onSelectVariant={onSelectVariant}
          onAdopt={onAdopt}
          onExportPdf={() => setPdfOpen(true)}
          onAdoptAlternative={onAdoptAlternative}
        />
      </motion.div>

      {/* PDF export modal */}
      {result && cost && (
        <PdfExportModal
          open={pdfOpen}
          onClose={() => setPdfOpen(false)}
          state={state}
          machine={effMachine}
          result={result}
          placed={placed}
          cost={cost}
        />
      )}
    </div>
  );
}
