import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Crosshair, Eye, EyeOff, Minus, Plus, RotateCw, ZoomIn } from 'lucide-react';
import { computeCutMarks } from '@/lib/cut-marks';
import { printableArea } from '@/lib/montage-engine';
import { computeSnap, SNAP_THRESHOLD_MM, type SnapOutcome } from '@/lib/snap-engine';
import type { Machine, MontageResult, PlacedPiece, Unit } from '@/lib/types';
import { formatMeasure, trimNumber } from '@/lib/units';
import { cn } from '@/lib/utils';
import {
  forbiddenBands,
  groupBounds,
  infeasibilityReason,
  inputsValid,
  placementValid,
  stickerBleed,
  withAlpha,
  type MontageUIState,
  type Rect,
} from './montage-data';
import type { BleedValue } from '@/components/ds/BleedGroup';

const SPRING_FLIP = { type: 'spring', stiffness: 260, damping: 30 } as const;

export interface SheetCanvasProps {
  state: MontageUIState;
  machine: Machine;
  result: MontageResult | null;
  placed: PlacedPiece[];
  onCommitPieces: (pieces: PlacedPiece[]) => void;
  manualMode: boolean;
  onToggleEditing: () => void;
  computing: boolean;
  unit: Unit;
  onUnitChange: (u: Unit) => void;
  verso: boolean;
  onVersoChange: (v: boolean) => void;
  selectedGroupId: string | null;
  onSelectGroup: (id: string | null) => void;
  selectedPiece: number | null;
  onSelectPiece: (i: number | null) => void;
  showCutMarks: boolean;
  onToggleCutMarks: () => void;
  onSaveManual: () => void;
  onResetManual: () => void;
}

interface DragCtx {
  index: number;
  valid: boolean;
  dxMm: number;
  dyMm: number;
  /** Alt + سحب: نسخ القطعة/المجموعة بدل تحريكها */
  duplicate: boolean;
  /** مرجع القطعة عند بدء السحب — يثبّت هويتها إن استُبدل placed أثناء سحب بطيء */
  piece: PlacedPiece;
}

export default function SheetCanvas(props: SheetCanvasProps) {
  const { state, machine, result, placed, manualMode, unit, verso } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 520 });
  const [zoom, setZoom] = useState(1);
  const [hovered, setHovered] = useState<number | null>(null);
  const [dragCtx, setDragCtx] = useState<DragCtx | null>(null);
  const [invalidFlash, setInvalidFlash] = useState<Rect | null>(null);
  // render-phase flag: has the first calculation already played its draw-in?
  const [calcPlayed, setCalcPlayed] = useState(false);
  if (result && !calcPlayed) setCalcPlayed(true);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sheetW = result?.sheetWidthMm ?? state.sheetW;
  const sheetH = result?.sheetHeightMm ?? state.sheetH;

  // px-per-mm scale: fit sheet inside the measured viewport, then apply zoom
  const pad = 56;
  const fit = Math.min((size.w - pad * 2) / sheetW, (size.h - pad * 2) / sheetH);
  const s = Math.max(0.05, fit * zoom);
  const ox = (size.w - sheetW * s) / 2;
  const oy = (size.h - sheetH * s) / 2;

  const area = useMemo(
    () => result?.printableArea ?? printableArea(sheetW, sheetH, machine),
    [result, sheetW, sheetH, machine],
  );
  const bands = useMemo(() => forbiddenBands(state, area, result), [state, area, result]);

  // prise de pince band (offset) — strip on the largest edge; never drawn for
  // double-pince: the engine drops it there and the two grip bands from
  // forbiddenBands cover the position instead
  const pinceBand: Rect | null = useMemo(() => {
    if (machine.kind !== 'offset' || !machine.priseDePince || state.method === 'double-pince') return null;
    const m = machine.margins;
    const p = machine.priseDePince;
    if (sheetW >= sheetH) return { x: m.left, y: sheetH - m.bottom - p, w: sheetW - m.left - m.right, h: p };
    return { x: sheetW - m.right - p, y: m.top, w: p, h: sheetH - m.top - m.bottom };
  }, [machine, sheetW, sheetH, state.method]);

  const groups = useMemo(() => groupBounds(placed), [placed]);
  const legend = useMemo(() => {
    return state.stickers.map((s) => {
      const b = groups.get(s.id);
      return { id: s.id, w: s.widthMm, h: s.heightMm, color: b?.color ?? '#94A3B8', count: b?.count ?? 0 };
    });
  }, [state.stickers, groups]);

  /** Per-design bleed lookup (linked designs resolve to the shared bleed). */
  const bleedByGroup = useMemo(() => {
    const m = new Map<string, BleedValue>();
    for (const s of state.stickers) m.set(s.id, stickerBleed(state, s));
    return m;
  }, [state]);

  const flashInvalid = useCallback((r: Rect) => {
    setInvalidFlash(r);
    window.setTimeout(() => setInvalidFlash(null), 350);
  }, []);

  // ----------------------- undo/redo (الوضع اليدوي) ---------------------------
  // سجل محدود (~50 خطوة) لتعديلات المخطط اليدوي: تحريك/نسخ/حذف/تدوير/أسهم.
  // اللقطات تُدفع قبل كل commit، والاسترجاع يمر عبر onCommitPieces للأب.
  const undoStack = useRef<PlacedPiece[][]>([]);
  const redoStack = useRef<PlacedPiece[][]>([]);
  // عدّاد يجبر إعادة الرسم لعرض عمق السجل في شريط الوضع اليدوي
  const [histDepth, setHistDepth] = useState(0);
  useLayoutEffect(() => {
    if (!manualMode) {
      undoStack.current = [];
      redoStack.current = [];
      setHistDepth(0);
    }
  }, [manualMode]);

  const pushUndo = useCallback(() => {
    undoStack.current = [...undoStack.current.slice(-49), placed];
    redoStack.current = [];
    setHistDepth(undoStack.current.length);
  }, [placed]);

  const doUndo = useCallback(() => {
    const stack = undoStack.current;
    if (stack.length === 0) return;
    const prev = stack[stack.length - 1];
    undoStack.current = stack.slice(0, -1);
    redoStack.current = [...redoStack.current, placed];
    setHistDepth(undoStack.current.length);
    props.onCommitPieces(prev);
  }, [placed, props]);

  const doRedo = useCallback(() => {
    const stack = redoStack.current;
    if (stack.length === 0) return;
    const next = stack[stack.length - 1];
    redoStack.current = stack.slice(0, -1);
    undoStack.current = [...undoStack.current, placed];
    setHistDepth(undoStack.current.length);
    props.onCommitPieces(next);
  }, [placed, props]);

  // --------------------------- drag handlers --------------------------------

  /**
   * هوية القطعة المسحوبة بمرجعها لا بفهرسها: placed قد يُستبدل أثناء سحب بطيء
   * (إعادة حساب مؤجَّلة في الصفحة الأم) فيزاح الفهرس عن قطعته. الترتيب: نفس
   * المرجع عند التلميح، ثم بحث بالمرجع، ثم ببصمة هندسية كاملة، وإلا −1
   * (يرفض المستدعي بأمان ولا يطبَّق السحب على قطعة أخرى).
   */
  const findPieceIndex = useCallback(
    (hint: number, ref: PlacedPiece | null): number => {
      if (!ref) return placed[hint] ? hint : -1;
      if (placed[hint] === ref) return hint;
      const byRef = placed.indexOf(ref);
      if (byRef >= 0) return byRef;
      return placed.findIndex(
        (p) => p.groupId === ref.groupId && p.x === ref.x && p.y === ref.y && p.w === ref.w && p.h === ref.h,
      );
    },
    [placed],
  );

  /**
   * Rigid shared offset for a drag: when a whole group is dragged, ONE common
   * (dx, dy) is clamped against the group's bounding box — never per piece —
   * so the group moves as a single block and cannot stretch or collapse.
   * Returns the clamp bounds too so resolveSnap can re-clamp AFTER snapping.
   */
  const resolveDrag = useCallback(
    (index: number, dxMm: number, dyMm: number) => {
      const piece = placed[index];
      if (!piece) return null;
      const isGroupDrag = props.selectedGroupId !== null && piece.groupId === props.selectedGroupId;
      const targets = isGroupDrag
        ? placed.map((p, i) => ({ p, i })).filter(({ p }) => p.groupId === piece.groupId)
        : [{ p: piece, i: index }];
      const minX = Math.min(...targets.map((t) => t.p.x));
      const minY = Math.min(...targets.map((t) => t.p.y));
      const maxX = Math.max(...targets.map((t) => t.p.x + t.p.w));
      const maxY = Math.max(...targets.map((t) => t.p.y + t.p.h));
      const dx = Math.min(Math.max(dxMm, area.x - minX), area.x + area.w - maxX);
      const dy = Math.min(Math.max(dyMm, area.y - minY), area.y + area.h - maxY);
      return { targets, dx, dy, minX, minY, maxX, maxY };
    },
    [placed, area, props.selectedGroupId],
  );

  /** نتيجة «بلا التصاق» — تحتفظ بقياسات المسافات الحية حتى عند تجاهل الالتصاق */
  const noSnap = (measures: SnapOutcome['measures']): SnapOutcome => ({
    dx: 0,
    dy: 0,
    snappedX: false,
    snappedY: false,
    guides: [],
    measures,
  });

  /**
   * resolveDrag + الالتصاق (Smart Guides): الإزاحة المشتركة الصارمة تلتصق
   * كوحدة واحدة على حواف/مراكز القطع الثابتة والمراجع (منطقة الطباعة، محور
   * القلب، حواف الأشرطة). قواعد معتمدة:
   *  1. بعد تطبيق تصحيح الالتصاق تُعاد التقييدات نفسها (clamp) — ناتج snap
   *     لا يخرج أبداً عن حدود منطقة الطباعة لصندوق التحريك.
   *  2. الموضع الصالح أولاً: إن كان الموضع الملتصق غير صالح (تداخل/شريط/حد)
   *     بينما غير الملتصق صالح ← يُتجاهل الالتصاق كلياً ويُعتمد الموضع الصالح.
   *  3. عند النسخ (Alt) تُستبعد القطع المصدر من الثوابت — وإلا انجذبت النسخة
   *     إلى موضع الأصل (dx≈0) فأُلغيت عند التحقق.
   * liveCheck/commitDrag يعملان على الموضع النهائي الملتصق المقيّد.
   */
  const resolveSnap = useCallback(
    (index: number, dxMm: number, dyMm: number, duplicate: boolean, pieceRef?: PlacedPiece) => {
      const idx = findPieceIndex(index, pieceRef ?? null);
      if (idx < 0) return null;
      const drag = resolveDrag(idx, dxMm, dyMm);
      if (!drag) return null;
      const { targets, dx, dy, minX, minY, maxX, maxY } = drag;
      const movedIdx = new Set(targets.map((t) => t.i));
      const moving = targets.map((t) => ({ x: t.p.x + dx, y: t.p.y + dy, w: t.p.w, h: t.p.h }));
      // الثوابت: كل القطع عدا المتحركة — المصادر تُستبعد أيضاً في وضع النسخ
      const statics = placed
        .filter((_, j) => !movedIdx.has(j))
        .map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }));
      const refsV: number[] = [area.x, area.x + area.w];
      const refsH: number[] = [area.y, area.y + area.h];
      if (result?.flipAxis) {
        if (result.flipAxis.axis === 'vertical') refsV.push(result.flipAxis.position);
        else refsH.push(result.flipAxis.position);
      }
      for (const b of bands) {
        refsV.push(b.x, b.x + b.w);
        refsH.push(b.y, b.y + b.h);
      }
      const snap = computeSnap(moving, statics, { refsV, refsH, area }, SNAP_THRESHOLD_MM);
      // 1) إعادة التقييد بعد التصحيح — نفس حدود resolveDrag تماماً
      let fdx = Math.min(Math.max(dx + snap.dx, area.x - minX), area.x + area.w - maxX);
      let fdy = Math.min(Math.max(dy + snap.dy, area.y - minY), area.y + area.h - maxY);
      let effSnap: SnapOutcome =
        Math.abs(fdx - dx) > 1e-9 || Math.abs(fdy - dy) > 1e-9
          ? { ...snap, dx: fdx - dx, dy: fdy - dy, snappedX: Math.abs(fdx - dx) > 1e-6 && snap.snappedX, snappedY: Math.abs(fdy - dy) > 1e-6 && snap.snappedY }
          : noSnap(snap.measures);
      // 2) الموضع الصالح أولاً: ملتصق غير صالح + غير ملتصق صالح ← تجاهل الالتصاق
      if (effSnap.snappedX || effSnap.snappedY) {
        const validAt = (ox: number, oy: number) => {
          if (duplicate) {
            const copies = targets.map(({ p }) => ({ x: p.x + ox, y: p.y + oy, w: p.w, h: p.h }));
            const base = placed.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }));
            return copies.every((cand, k) => {
              const others = [...base, ...copies.filter((_, j) => j !== k)];
              return placementValid(cand, others, area, bands);
            });
          }
          return targets.every(({ p }) => {
            const cand = { x: p.x + ox, y: p.y + oy, w: p.w, h: p.h };
            const others = placed.filter((_, j) => !movedIdx.has(j)).map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h }));
            return placementValid(cand, others, area, bands);
          });
        };
        if (!validAt(fdx, fdy) && validAt(dx, dy)) {
          fdx = dx;
          fdy = dy;
          effSnap = noSnap(snap.measures);
        }
      }
      return { targets, movedIdx, dx: fdx, dy: fdy, snap: effSnap };
    },
    [findPieceIndex, resolveDrag, placed, area, bands, result],
  );

  const commitDrag = useCallback(
    (index: number, dxMm: number, dyMm: number, duplicate: boolean, pieceRef?: PlacedPiece) => {
      // نقرة بلا سحب فعلي — لا شيء يُلتزم ولا خطوة تراجع
      if (!duplicate && Math.abs(dxMm) < 0.05 && Math.abs(dyMm) < 0.05) return;
      const r = resolveSnap(index, dxMm, dyMm, duplicate, pieceRef);
      if (!r) return;
      const { targets, movedIdx, dx, dy } = r;
      // حارس النقرة للنسخ يفحص الإزاحة النهائية (بعد التقييد والالتصاق) لا الخام
      if (duplicate && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

      if (!duplicate) {
        const next = placed.map((p) => ({ ...p }));
        for (const { i } of targets) {
          next[i] = { ...next[i], x: next[i].x + dx, y: next[i].y + dy };
        }
        // validate the WHOLE moved set (bounds + gutter + every unmoved piece)
        // before committing — one invalid piece rejects the whole group move
        for (const { i } of targets) {
          const others = next.filter((_, j) => !movedIdx.has(j)).map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }));
          const cand = next[i];
          if (!placementValid(cand, others, area, bands)) {
            flashInvalid(cand);
            return; // reject → framer springs the dragged piece back
          }
        }
        pushUndo();
        props.onCommitPieces(next);
        return;
      }

      // Alt + سحب: الأصل يبقى في مكانه؛ النسخ تُتحقق ضد كل القطع + بعضها
      const copies = targets.map(({ p }) => ({ ...p, x: p.x + dx, y: p.y + dy }));
      const base = placed.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }));
      for (let k = 0; k < copies.length; k++) {
        const others = [...base, ...copies.filter((_, j) => j !== k).map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }))];
        if (!placementValid(copies[k], others, area, bands)) {
          flashInvalid(copies[k]);
          return; // موضع غير صالح → تُلغى النسخة ويرتد الأصل
        }
      }
      pushUndo();
      props.onCommitPieces([...placed, ...copies]);
    },
    [placed, area, bands, props, flashInvalid, resolveSnap, pushUndo],
  );

  const liveCheck = useCallback(
    (index: number, dxMm: number, dyMm: number, duplicate: boolean, pieceRef?: PlacedPiece): boolean => {
      const r = resolveSnap(index, dxMm, dyMm, duplicate, pieceRef);
      if (!r) return true;
      const { targets, movedIdx, dx, dy } = r;
      if (!duplicate) {
        return targets.every(({ p }) => {
          const cand = { x: p.x + dx, y: p.y + dy, w: p.w, h: p.h };
          const others = placed.filter((_, j) => !movedIdx.has(j)).map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h }));
          return placementValid(cand, others, area, bands);
        });
      }
      // النسخ: ضد كل القطع الأصلية + النسخ الأخرى من نفس المجموعة
      const copies = targets.map(({ p }) => ({ x: p.x + dx, y: p.y + dy, w: p.w, h: p.h }));
      const base = placed.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }));
      return copies.every((cand, k) => {
        const others = [...base, ...copies.filter((_, j) => j !== k)];
        return placementValid(cand, others, area, bands);
      });
    },
    [placed, area, bands, resolveSnap],
  );

  // --------------------- عمليات التحرير (تدوير/حذف/أسهم) ----------------------

  /** R — تدوير القطعة المحددة 90° حول مركزها؛ تُرفض بومضة إن اصطدمت */
  const rotateLocal = useCallback(() => {
    if (props.selectedPiece === null) return;
    const p = placed[props.selectedPiece];
    if (!p) return;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const cand: PlacedPiece = { ...p, x: cx - p.h / 2, y: cy - p.w / 2, w: p.h, h: p.w, rotated: !p.rotated };
    const others = placed.filter((_, j) => j !== props.selectedPiece).map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h }));
    if (!placementValid(cand, others, area, bands)) {
      flashInvalid(cand);
      return;
    }
    pushUndo();
    props.onCommitPieces(placed.map((o, j) => (j === props.selectedPiece ? cand : o)));
  }, [props, placed, area, bands, flashInvalid, pushUndo]);

  /** Delete/Backspace — حذف القطعة المحددة، أو المجموعة بعد تأكيد بسيط */
  const deleteSelection = useCallback(() => {
    if (props.selectedPiece !== null && placed[props.selectedPiece]) {
      pushUndo();
      props.onCommitPieces(placed.filter((_, j) => j !== props.selectedPiece));
      props.onSelectPiece(null);
      return;
    }
    if (props.selectedGroupId) {
      const gid = props.selectedGroupId;
      const count = placed.filter((p) => p.groupId === gid).length;
      if (count === 0) return;
      if (!window.confirm(`حذف ${count} قطعة من هذه المجموعة؟`)) return;
      pushUndo();
      props.onCommitPieces(placed.filter((p) => p.groupId !== gid));
      props.onSelectGroup(null);
    }
  }, [props, placed, pushUndo]);

  /** الأسهم — تحريك القطعة/المجموعة المحددة step مم (Shift = ×10) مع نفس التحقق */
  const nudgeSelection = useCallback(
    (dxMm: number, dyMm: number) => {
      const isGroup = props.selectedPiece === null && props.selectedGroupId !== null;
      const anchorIdx =
        props.selectedPiece ?? (props.selectedGroupId ? placed.findIndex((p) => p.groupId === props.selectedGroupId) : -1);
      if (anchorIdx < 0 || !placed[anchorIdx]) return;
      const targets = isGroup
        ? placed.map((p, i) => ({ p, i })).filter(({ p }) => p.groupId === props.selectedGroupId)
        : [{ p: placed[anchorIdx], i: anchorIdx }];
      // إزاحة صارمة مشتركة مقيّدة بصندوق التحريك (نفس منطق resolveDrag)
      const minX = Math.min(...targets.map((t) => t.p.x));
      const minY = Math.min(...targets.map((t) => t.p.y));
      const maxX = Math.max(...targets.map((t) => t.p.x + t.p.w));
      const maxY = Math.max(...targets.map((t) => t.p.y + t.p.h));
      const dx = Math.min(Math.max(dxMm, area.x - minX), area.x + area.w - maxX);
      const dy = Math.min(Math.max(dyMm, area.y - minY), area.y + area.h - maxY);
      if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return; // عند الحد — بصمت
      const movedIdx = new Set(targets.map((t) => t.i));
      const next = placed.map((p) => ({ ...p }));
      for (const { i } of targets) next[i] = { ...next[i], x: next[i].x + dx, y: next[i].y + dy };
      for (const { i } of targets) {
        const others = next.filter((_, j) => !movedIdx.has(j)).map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }));
        if (!placementValid(next[i], others, area, bands)) {
          flashInvalid(next[i]);
          return;
        }
      }
      pushUndo();
      props.onCommitPieces(next);
    },
    [props, placed, area, bands, flashInvalid, pushUndo],
  );

  // اختصارات لوحة المفاتيح — الوضع اليدوي ووجه Recto فقط، وبعيداً عن حقول الإدخال
  useEffect(() => {
    if (!manualMode || verso) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
      const k = e.key;
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'y') {
        e.preventDefault();
        doRedo();
        return;
      }
      if (k === 'Delete' || k === 'Backspace') {
        e.preventDefault();
        deleteSelection();
        return;
      }
      if (k === 'r' || k === 'R') {
        rotateLocal();
        return;
      }
      if (k.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        if (k === 'ArrowLeft') nudgeSelection(-step, 0);
        else if (k === 'ArrowRight') nudgeSelection(step, 0);
        else if (k === 'ArrowUp') nudgeSelection(0, -step);
        else if (k === 'ArrowDown') nudgeSelection(0, step);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [manualMode, verso, doUndo, doRedo, deleteSelection, rotateLocal, nudgeSelection]);

  // معلومات السحب الحي: الموضع الملتصق + خطوط الإرشاد والقياسات (Smart Guides)
  const dragInfo = useMemo(() => {
    if (!dragCtx) return null;
    return resolveSnap(dragCtx.index, dragCtx.dxMm, dragCtx.dyMm, dragCtx.duplicate, dragCtx.piece);
  }, [dragCtx, resolveSnap]);

  // ---------------- معالجات أحداث القطع (مستقرة من أجل memo) -----------------
  // dragCtxRef يحمل آخر سياق سحب حتى تبقى المعالجات مستقرة أثناء السحب بينما
  // تقرأ أحدث مرجع للقطعة (isolation عن دورة state).
  const dragCtxRef = useRef<DragCtx | null>(null);
  const updateDragCtx = useCallback((ctx: DragCtx | null) => {
    dragCtxRef.current = ctx;
    setDragCtx(ctx);
  }, []);

  const handleHover = useCallback((i: number) => setHovered(i), []);
  const handleHoverEnd = useCallback((i: number) => setHovered((h) => (h === i ? null : h)), []);
  const handleClick = useCallback(
    (i: number) => props.onSelectPiece(props.selectedPiece === i ? null : i),
    [props],
  );
  const handleDragStart = useCallback(
    (i: number, alt: boolean) => {
      const piece = placed[i];
      if (!piece) return;
      updateDragCtx({ index: i, valid: true, dxMm: 0, dyMm: 0, duplicate: alt, piece });
    },
    [placed, updateDragCtx],
  );
  const handleDragMove = useCallback(
    (i: number, dxMm: number, dyMm: number, alt: boolean) => {
      const ref = dragCtxRef.current?.piece ?? placed[i];
      if (!ref) return;
      updateDragCtx({ index: i, valid: liveCheck(i, dxMm, dyMm, alt, ref), dxMm, dyMm, duplicate: alt, piece: ref });
    },
    [placed, liveCheck, updateDragCtx],
  );
  const handleDragEnd = useCallback(
    (i: number, dxMm: number, dyMm: number, alt: boolean) => {
      const ref = dragCtxRef.current?.piece ?? placed[i];
      updateDragCtx(null);
      if (ref) commitDrag(i, dxMm, dyMm, alt, ref);
    },
    [placed, commitDrag, updateDragCtx],
  );

  const duplex = (result?.facesPerSheet ?? (state.method === 'recto' ? 1 : 2)) === 2;
  const bleedOf = (groupId: string): BleedValue => bleedByGroup.get(groupId) ?? state.bleedShared;
  const designLabelOf = (groupId: string): string => {
    const i = state.stickers.findIndex((s) => s.id === groupId);
    return i >= 0 ? `تصميم ${i + 1}` : 'تصميم';
  };
  // verso flip axis: use the engine's actual axis when a result exists
  // (bascule: midpoint of the LARGER sheet dimension; double-pince: the
  // SMALLER one); fall back to a dimension-aware method heuristic —
  // work-and-turn splits the larger dimension, work-and-tumble the smaller
  const flipAxis: 'x' | 'y' = result?.flipAxis
    ? result.flipAxis.axis === 'vertical'
      ? 'x'
      : 'y'
    : state.method === 'double-pince'
      ? sheetW <= sheetH
        ? 'x'
        : 'y'
      : state.method === 'bascule'
        ? sheetW >= sheetH
          ? 'x'
          : 'y'
        : 'x';
  const pieceX = useCallback(
    (p: PlacedPiece) => (verso && flipAxis === 'x' ? sheetW - p.x - p.w : p.x),
    [verso, flipAxis, sheetW],
  );
  const pieceY = useCallback(
    (p: PlacedPiece) => (verso && flipAxis === 'y' ? sheetH - p.y - p.h : p.y),
    [verso, flipAxis, sheetH],
  );

  // علامات القص — مصدر حقيقة واحد: الوحدة النقية cut-marks.ts تحسب مقاطع
  // الوجه المعروض (مع مراعاة انعكاس verso وتبديل جهات الـ bleed). guillotine
  // يعمل بنموذج البلوكات: علامات قصيرة على محيط كل مستطيل ممتلئ (خطوطه
  // الداخلية + زوايا L) مع قاعدة التماس الديناميكية — تُعاد الحسابات من مواقع
  // القطع كل مرة، فتختفي/تظهر العلامات تلقائياً أثناء السحب اليدوي
  const cutMarks = useMemo(() => {
    if (!props.showCutMarks || placed.length === 0) return [];
    const facePieces = placed.map((p) => {
      const b = bleedByGroup.get(p.groupId) ?? state.bleedShared;
      const bleed = !verso
        ? b
        : {
            left: flipAxis === 'x' ? b.right : b.left,
            right: flipAxis === 'x' ? b.left : b.right,
            top: flipAxis === 'y' ? b.bottom : b.top,
            bottom: flipAxis === 'y' ? b.top : b.bottom,
          };
      return { x: pieceX(p), y: pieceY(p), w: p.w, h: p.h, bleed, groupId: p.groupId };
    });
    return computeCutMarks(facePieces, {
      cutMethod: state.cutMethod,
      sharedCut: state.sharedCut,
      doubleCut: state.doubleCut,
      area,
    });
  }, [
    props.showCutMarks,
    placed,
    bleedByGroup,
    state.bleedShared,
    state.cutMethod,
    state.sharedCut,
    state.doubleCut,
    verso,
    flipAxis,
    pieceX,
    pieceY,
    area,
  ]);

  // bleed sides for the displayed face: physical mirroring swaps left/right on
  // a horizontal flip (flipAxis 'x') and top/bottom on a vertical flip
  // ('y') — mirrors montage-engine.ts mirrorPieces and PdfExportModal.
  // (انظر bleedFaceMap أدناه — النسخة المخزّنة المستقرة الهوية من هذا المنطق)

  // performance: cap the number of rendered pieces (manual mode renders all
  // so editing stays consistent); overflow is summarized below the sheet.
  const MAX_RENDERED = 400;
  const renderedPieces = !manualMode && placed.length > MAX_RENDERED ? placed.slice(0, MAX_RENDERED) : placed;
  const hiddenCount = placed.length - renderedPieces.length;

  // خرائط مستقرة الهوية من أجل memo: bleedForFace/كائن areaPx كانا يُبنيان من
  // الصفر كل render فيكسران مقارنة الخصائص لكل القطع — هنا تُحسب مرة واحدة
  // ولا تتغير مراجعها إلا بتغير مدخلاتها فعلاً.
  const bleedFaceMap = useMemo(() => {
    const m = new Map<string, BleedValue>();
    for (const p of placed) {
      if (m.has(p.groupId)) continue;
      const b = bleedByGroup.get(p.groupId) ?? state.bleedShared;
      m.set(
        p.groupId,
        !verso
          ? b
          : {
              left: flipAxis === 'x' ? b.right : b.left,
              right: flipAxis === 'x' ? b.left : b.right,
              top: flipAxis === 'y' ? b.bottom : b.top,
              bottom: flipAxis === 'y' ? b.top : b.bottom,
            },
      );
    }
    return m;
  }, [placed, bleedByGroup, state.bleedShared, verso, flipAxis]);

  const areaPxList = useMemo(
    () =>
      renderedPieces.map((p) => ({
        left: area.x * s,
        top: area.y * s,
        right: (area.x + area.w - p.w) * s,
        bottom: (area.y + area.h - p.h) * s,
      })),
    [renderedPieces, area, s],
  );

  // clear reason when the engine cannot place anything
  const infeasible = !result && inputsValid(state) ? infeasibilityReason(state) : null;

  const rulerTicks = (len: number, horizontal: boolean) => {
    const ticks: React.ReactNode[] = [];
    for (let t = 0; t <= len + 0.01; t += 10) {
      const major = t % 50 === 0;
      const key = `${horizontal ? 'x' : 'y'}-${t}`;
      if (horizontal) {
        ticks.push(
          <line key={key} x1={t} y1={-1.5} x2={t} y2={major ? -5 : -3} stroke="var(--ink-400)" strokeWidth={0.25} />,
        );
        if (major)
          ticks.push(
            <text key={`${key}-t`} x={t} y={-6.5} textAnchor="middle" fontSize={3.4} fill="var(--ink-400)" className="font-latin">
              {formatMeasure(t, unit)}
            </text>,
          );
      } else {
        ticks.push(
          <line key={key} x1={sheetW + 1.5} y1={t} x2={sheetW + (major ? 5 : 3)} y2={t} stroke="var(--ink-400)" strokeWidth={0.25} />,
        );
        if (major)
          ticks.push(
            <text
              key={`${key}-t`}
              x={sheetW + 7.5}
              y={t + 1.2}
              textAnchor="middle"
              fontSize={3.4}
              fill="var(--ink-400)"
              className="font-latin"
              transform={`rotate(-90 ${sheetW + 7.5} ${t + 1.2})`}
            >
              {formatMeasure(t, unit)}
            </text>,
          );
      }
    }
    return ticks;
  };

  const zoomIn = () => setZoom((z) => Math.min(2, +(z + 0.25).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)));

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[18px] border border-[var(--line)] bg-white shadow-[var(--shadow-card)]">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-3 py-2">
        <div dir="ltr" className="flex items-center overflow-hidden rounded-[8px] border border-[var(--line-strong)]">
          <button type="button" onClick={zoomOut} aria-label="تصغير" className="grid h-8 w-8 place-items-center text-[var(--ink-500)] hover:bg-[var(--paper-100)]">
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            title="ملاءمة"
            className="font-latin h-8 min-w-14 px-1 text-center text-[12px] font-semibold text-[var(--ink-700)] hover:bg-[var(--paper-100)]"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" onClick={zoomIn} aria-label="تكبير" className="grid h-8 w-8 place-items-center text-[var(--ink-500)] hover:bg-[var(--paper-100)]">
            <Plus size={14} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => props.onUnitChange(unit === 'mm' ? 'cm' : 'mm')}
          dir="ltr"
          className="font-latin h-8 rounded-[8px] border border-[var(--line-strong)] px-2.5 text-[12px] font-semibold text-[var(--ink-700)] hover:bg-[var(--paper-100)]"
        >
          {unit}
        </button>
        {machine.kind === 'offset' && (
          <span
            className="flex h-8 items-center rounded-[8px] bg-[var(--paper-100)] px-2.5 text-[11px] font-semibold text-[var(--ink-700)]"
            title="ورقة الأوفست تعمل دائمًا أفقيًا — قبضة الماكينة على الحافة السفلية"
          >
            اتجاه العمل: {formatMeasure(sheetW, 'cm')}×{formatMeasure(sheetH, 'cm')} سم — المسكة من الأسفل
          </span>
        )}
        <button
          type="button"
          onClick={props.onToggleCutMarks}
          title="Traits de coupe"
          className={cn(
            'grid h-8 w-8 place-items-center rounded-[8px] border transition-colors',
            props.showCutMarks ? 'border-[var(--cyan-600)] bg-[var(--cyan-50)] text-[var(--cyan-600)]' : 'border-[var(--line-strong)] text-[var(--ink-400)] hover:bg-[var(--paper-100)]',
          )}
        >
          {props.showCutMarks ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button
          type="button"
          onClick={props.onToggleEditing}
          title="تحرير المخطط — سحب وتدوير القطع يدوياً"
          className={cn(
            'grid h-8 w-8 place-items-center rounded-[8px] border transition-colors',
            manualMode ? 'border-[var(--cyan-600)] bg-[var(--cyan-50)] text-[var(--cyan-600)]' : 'border-[var(--line-strong)] text-[var(--ink-400)] hover:bg-[var(--paper-100)]',
          )}
        >
          <Crosshair size={14} />
        </button>
        {manualMode && props.selectedPiece !== null && !verso && (
          <button
            type="button"
            onClick={rotateLocal}
            title="تدوير 90° (R)"
            className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-500)] hover:bg-[var(--paper-100)]"
          >
            <RotateCw size={14} />
          </button>
        )}

        {duplex && (
          <div dir="ltr" className="relative flex rounded-[8px] border border-[var(--line-strong)] p-0.5">
            {(['Recto', 'Verso'] as const).map((face, i) => {
              const active = verso === (i === 1);
              return (
                <button
                  key={face}
                  type="button"
                  onClick={() => props.onVersoChange(i === 1)}
                  className={cn('font-latin relative h-7 rounded-[6px] px-3 text-[11px] font-semibold transition-colors', active ? 'text-white' : 'text-[var(--ink-500)]')}
                >
                  {active && <motion.span layoutId="face-pill" className="absolute inset-0 rounded-[6px] bg-[var(--cyan-600)]" transition={{ duration: 0.2 }} />}
                  <span className="relative">{face}</span>
                </button>
              );
            })}
          </div>
        )}

        <span className="ms-auto flex items-center gap-1.5 text-[12px] text-[var(--ink-500)]">
          <ZoomIn size={13} className="text-[var(--ink-400)]" />
          <AnimatePresence mode="popLayout">
            <motion.span
              key={placed.length}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.18 }}
              dir="ltr"
              className="font-latin font-semibold text-[var(--ink-900)]"
            >
              {placed.length}
            </motion.span>
          </AnimatePresence>
          نسخة/ورقة
        </span>
      </div>

      {/* legend */}
      {result && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--line)] bg-[var(--paper-50)] px-3 py-1.5">
          {legend.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => props.onSelectGroup(props.selectedGroupId === g.id ? null : g.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                props.selectedGroupId === g.id ? 'border-[var(--cyan-600)] bg-[var(--cyan-50)]' : 'border-[var(--line)] bg-white hover:bg-[var(--paper-100)]',
              )}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.color }} />
              <span dir="ltr" className="font-latin font-semibold text-[var(--ink-700)]">
                {trimNumber(g.w)}×{trimNumber(g.h)}
              </span>
              <span dir="ltr" className="font-latin text-[var(--ink-400)]">
                ×{g.count}
              </span>
            </button>
          ))}
          {props.selectedGroupId && manualMode && <span className="text-[11px] text-[var(--cyan-600)]">المجموعة محددة — اسحب أي قطعة لتحريك الكل</span>}
        </div>
      )}

      {/* manual mode banner */}
      <AnimatePresence>
        {manualMode && (
          <motion.div
            initial={{ y: -8, opacity: 0, height: 0 }}
            animate={{ y: 0, opacity: 1, height: 'auto' }}
            exit={{ y: -8, opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="flex items-center gap-2 overflow-hidden border-b border-[var(--cyan-100)] bg-[var(--cyan-100)] px-3 py-1.5 text-[12px] text-[var(--cyan-600)]"
          >
            <Crosshair size={13} />
            <span className="flex-1">
              تحرير المخطط مفعّل — اسحب القطع (تلتصق بإرشادات ذكية)، <span dir="ltr" className="font-latin font-semibold">Alt</span>+سحب نسخ •{' '}
              <span dir="ltr" className="font-latin font-semibold">R</span> تدوير • أسهم 1مم (<span dir="ltr" className="font-latin font-semibold">Shift</span>=10) •{' '}
              <span dir="ltr" className="font-latin font-semibold">Del</span> حذف • <span dir="ltr" className="font-latin font-semibold">Ctrl+Z/Y</span> تراجع/إعادة
              {histDepth > 0 && <span className="ms-1 text-[var(--cyan-600)]/70">({histDepth}/50)</span>}
            </span>
            <button type="button" onClick={props.onSaveManual} className="rounded-full bg-white/70 px-2.5 py-0.5 text-[11px] font-semibold hover:bg-white">
              حفظ
            </button>
            <button type="button" onClick={props.onResetManual} className="rounded-full bg-white/70 px-2.5 py-0.5 text-[11px] font-semibold hover:bg-white">
              استعادة اقتراح النظام
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* canvas viewport */}
      <div
        ref={wrapRef}
        className="relative min-h-0 flex-1"
        style={{
          backgroundColor: 'var(--paper-100)',
          backgroundImage: 'url(/texture-grid.svg)',
          backgroundSize: '240px',
        }}
      >
        {!result ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <img src="/empty-montage.svg" alt="" className="h-48 w-auto object-contain" />
            {infeasible ? (
              <>
                <p className="max-w-[420px] text-[13px] font-semibold leading-6 text-[var(--danger-600)]">{infeasible}</p>
                <p className="text-[12px] text-[var(--ink-400)]">عدّل المقاس أو الورقة أو المساحة الوسطية ثم أعد الحساب</p>
              </>
            ) : (
              <p className="text-[13px] text-[var(--ink-500)]">أدخل المقاسات واضغط «احسب المونتاج»</p>
            )}
          </div>
        ) : (
          <svg width={size.w} height={size.h} className="block touch-none select-none">
            <defs>
              <pattern id="mg-hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <rect width="6" height="6" fill="var(--paper-200)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--line-strong)" strokeWidth="0.6" />
              </pattern>
              <pattern id="mg-hatch-pince" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <rect width="5" height="5" fill="rgba(217,119,6,0.10)" />
                <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(217,119,6,0.45)" strokeWidth="0.5" />
              </pattern>
              <pattern id="mg-hatch-danger" width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <rect width="5" height="5" fill="rgba(220,38,38,0.10)" />
                <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(220,38,38,0.55)" strokeWidth="0.6" />
              </pattern>
              <pattern id="mg-hatch-gutter" width="5" height="5" patternTransform="rotate(-45)" patternUnits="userSpaceOnUse">
                <rect width="5" height="5" fill="rgba(2,132,199,0.06)" />
                <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(2,132,199,0.35)" strokeWidth="0.5" />
              </pattern>
            </defs>

            {/* ---- mm-space layer: sheet, margins, printable, rulers ---- */}
            <g transform={`translate(${ox} ${oy}) scale(${s})`}>
              {/* margin bands (between sheet edge and printable area) */}
              <rect x={0} y={0} width={sheetW} height={sheetH} fill="#fff" />
              <rect x={0} y={0} width={sheetW} height={sheetH} fill="url(#mg-hatch)" />
              <rect x={area.x} y={area.y} width={area.w} height={area.h} fill="#fff" />

              {/* sheet outline — draws in on first calculation */}
              <motion.rect
                x={0}
                y={0}
                width={sheetW}
                height={sheetH}
                fill="none"
                stroke="var(--ink-700)"
                vectorEffect="non-scaling-stroke"
                initial={calcPlayed ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.6 }}
                style={{ strokeWidth: 1.5 }}
              />

              {/* corner crop marks (traits de coupe) outside the trim */}
              {[
                `M ${-2} ${-8} V ${-2} H ${-8}`,
                `M ${sheetW + 2} ${-8} V ${-2} H ${sheetW + 8}`,
                `M ${-2} ${sheetH + 8} V ${sheetH + 2} H ${-8}`,
                `M ${sheetW + 2} ${sheetH + 8} V ${sheetH + 2} H ${sheetW + 8}`,
              ].map((d) => (
                <motion.path
                  key={d}
                  d={d}
                  fill="none"
                  stroke="var(--ink-400)"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  initial={calcPlayed ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.5, delay: 0.25 }}
                />
              ))}

              {/* printable area overlay */}
              <motion.rect
                x={area.x}
                y={area.y}
                width={area.w}
                height={area.h}
                fill="none"
                stroke="var(--cyan-500)"
                strokeWidth={1.5}
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              />
              <text x={area.x + 2} y={area.y + 4.5} fontSize={3.6} fill="var(--cyan-600)" fontWeight={600}>
                المساحة القابلة للطباعة
              </text>

              {/* center cross (digital: montage is centered) */}
              {machine.kind === 'digital' && (
                <g stroke="var(--cyan-500)" strokeWidth={0.3} opacity={0.5}>
                  <line x1={area.x + area.w / 2 - 4} y1={area.y + area.h / 2} x2={area.x + area.w / 2 + 4} y2={area.y + area.h / 2} />
                  <line x1={area.x + area.w / 2} y1={area.y + area.h / 2 - 4} x2={area.x + area.w / 2} y2={area.y + area.h / 2 + 4} />
                </g>
              )}

              {/* prise de pince band */}
              {pinceBand && (
                <g>
                  <rect x={pinceBand.x} y={pinceBand.y} width={pinceBand.w} height={pinceBand.h} fill="url(#mg-hatch-pince)" />
                  <text
                    x={pinceBand.x + pinceBand.w / 2}
                    y={pinceBand.y + pinceBand.h / 2 + 1.4}
                    textAnchor="middle"
                    fontSize={3.6}
                    fontWeight={600}
                    fill="#B45309"
                  >
                    Prise de pince {trimNumber(machine.priseDePince ?? 0)}مم
                  </text>
                </g>
              )}

              {/* forbidden bands: bascule central gutter / double-pince grip strips */}
              {bands.map((b, bi) => (
                <g key={`band-${bi}`}>
                  <rect
                    x={b.x}
                    y={b.y}
                    width={b.w}
                    height={b.h}
                    fill={state.method === 'double-pince' ? 'url(#mg-hatch-pince)' : 'url(#mg-hatch-gutter)'}
                  />
                  <text
                    x={b.x + b.w / 2}
                    y={state.method === 'double-pince' ? b.y + b.h / 2 + 1.2 : b.y + 6}
                    textAnchor="middle"
                    fontSize={3.2}
                    fill={state.method === 'double-pince' ? '#B45309' : 'var(--cyan-600)'}
                  >
                    {state.method === 'double-pince'
                      ? `قبضة ${trimNumber(result?.gripMm ?? state.gripMm ?? 10)}مم`
                      : `${trimNumber(state.gutterMm)}مم`}
                  </text>
                </g>
              ))}

              {/* flip axis (bascule / double-pince): midpoint of the smaller sheet dimension */}
              {result?.flipAxis && (
                <line
                  x1={result.flipAxis.axis === 'vertical' ? result.flipAxis.position : 0}
                  y1={result.flipAxis.axis === 'vertical' ? 0 : result.flipAxis.position}
                  x2={result.flipAxis.axis === 'vertical' ? result.flipAxis.position : sheetW}
                  y2={result.flipAxis.axis === 'vertical' ? sheetH : result.flipAxis.position}
                  stroke="var(--cyan-600)"
                  strokeWidth={0.6}
                  strokeDasharray="5 4"
                  vectorEffect="non-scaling-stroke"
                  opacity={0.5}
                />
              )}

              {/* invalid drop flash */}
              <AnimatePresence>
                {invalidFlash && (
                  <motion.rect
                    x={invalidFlash.x - 1}
                    y={invalidFlash.y - 1}
                    width={invalidFlash.w + 2}
                    height={invalidFlash.h + 2}
                    fill="url(#mg-hatch-danger)"
                    stroke="var(--danger-600)"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                    initial={{ opacity: 0.9 }}
                    animate={{ opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                  />
                )}
              </AnimatePresence>

              {/* shared-cut group containers + double-cut gutters */}
              {state.stickers.length > 1 &&
                [...groups.entries()].map(([gid, b]) => (
                  <g key={`gb-${gid}`} pointerEvents="none">
                    {state.sharedCut && (
                      <rect
                        x={b.x - 2}
                        y={b.y - 2}
                        width={b.w + 4}
                        height={b.h + 4}
                        rx={2}
                        fill="none"
                        stroke={b.color}
                        strokeWidth={1.2}
                        strokeDasharray="8 4"
                        vectorEffect="non-scaling-stroke"
                        opacity={0.55}
                      />
                    )}
                    {state.doubleCut && (
                      <rect
                        x={b.x - 4.5}
                        y={b.y - 4.5}
                        width={b.w + 9}
                        height={b.h + 9}
                        rx={2}
                        fill="none"
                        stroke={b.color}
                        strokeWidth={0.8}
                        strokeDasharray="3 3"
                        vectorEffect="non-scaling-stroke"
                        opacity={0.35}
                      />
                    )}
                  </g>
                ))}

              {/* علامات القص — طبقة واحدة على مستوى الورقة من cut-marks.ts:
                  outer = زاوية قطعة منفردة، shared = خط مشترك مُدمج بين قطع
                  ملتصقة (يُرسم مرة واحدة)، guillotine = علامة قصيرة عند طرف
                  البلوك (النموذج الاحترافي — لا خطوط طويلة).
                  لون registration أسود مستقل يميّزها عن trim و bleed */}
              {cutMarks.length > 0 && (
                <g pointerEvents="none" fill="none">
                  {cutMarks.map((m, mi) => (
                    <line
                      key={`cm-${mi}`}
                      x1={m.x1}
                      y1={m.y1}
                      x2={m.x2}
                      y2={m.y2}
                      stroke={m.kind === 'guillotine' ? '#374151' : m.kind === 'shared' ? '#000000' : '#111827'}
                      strokeWidth={m.kind === 'guillotine' ? 0.9 : 1.3}
                      vectorEffect="non-scaling-stroke"
                      opacity={m.kind === 'guillotine' ? 0.8 : 1}
                    />
                  ))}
                </g>
              )}

              {/* Smart Guides — خطوط إرشاد الالتصاق + قياسات المسافات الحية
                  (أثناء السحب فقط، بلون سماوي مميز مثل Illustrator) */}
              {dragInfo && (
                <g pointerEvents="none">
                  {dragInfo.snap.guides.map((g, gi) =>
                    g.axis === 'v' ? (
                      <line
                        key={`guide-v-${gi}`}
                        x1={g.pos}
                        y1={g.from}
                        x2={g.pos}
                        y2={g.to}
                        stroke="var(--cyan-600)"
                        strokeWidth={0.8}
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : (
                      <line
                        key={`guide-h-${gi}`}
                        x1={g.from}
                        y1={g.pos}
                        x2={g.to}
                        y2={g.pos}
                        stroke="var(--cyan-600)"
                        strokeWidth={0.8}
                        vectorEffect="non-scaling-stroke"
                      />
                    ),
                  )}
                  {dragInfo.snap.measures.map((m, mi) => (
                    <g key={`measure-${mi}`}>
                      <line
                        x1={m.axis === 'h' ? m.from : m.at}
                        y1={m.axis === 'h' ? m.at : m.from}
                        x2={m.axis === 'h' ? m.to : m.at}
                        y2={m.axis === 'h' ? m.at : m.to}
                        stroke="var(--cyan-600)"
                        strokeWidth={0.4}
                        vectorEffect="non-scaling-stroke"
                        opacity={0.7}
                      />
                      <text
                        x={m.axis === 'h' ? (m.from + m.to) / 2 : m.at + 1.2}
                        y={m.axis === 'h' ? m.at - 1 : (m.from + m.to) / 2 + 1.2}
                        textAnchor="middle"
                        fontSize={3.2}
                        fontWeight={600}
                        fill="var(--cyan-600)"
                        className="font-latin"
                      >
                        {trimNumber(m.mm)}
                      </text>
                    </g>
                  ))}
                </g>
              )}

              {/* rulers (top + right) */}
              {rulerTicks(sheetW, true)}
              {rulerTicks(sheetH, false)}
            </g>

            {/* ---- px-space layer: draggable pieces (1 unit = 1 screen px) ---- */}
            <g transform={`translate(${ox} ${oy})`}>
              {renderedPieces.map((p, i) => {
                const px = pieceX(p);
                const py = pieceY(p);
                const isDragged = dragCtx?.index === i;
                const isGroupDragged =
                  dragCtx !== null &&
                  !isDragged &&
                  props.selectedGroupId === p.groupId &&
                  placed[dragCtx.index]?.groupId === p.groupId;
                // المجموعة تبقى كتلة واحدة بصرياً بلا تمدد ولا قفزات: القطعة
                // المسحوبة يحركها framer بالفعل مع المؤشر بالإزاحة الخام،
                // فنضيف لها فقط الفرق حتى الإزاحة المشتركة النهائية (بعد
                // التقييد + الالتصاق) — تصحيح snap ≤ العتبة فلا تقفز. بقية
                // أعضاء المجموعة يأخذون الإزاحة المشتركة كاملة.
                const dragOffset =
                  dragInfo && dragCtx
                    ? isDragged
                      ? { dx: (dragInfo.dx - dragCtx.dxMm) * s, dy: (dragInfo.dy - dragCtx.dyMm) * s }
                      : isGroupDragged
                        ? { dx: dragInfo.dx * s, dy: dragInfo.dy * s }
                        : null
                    : null;
                return (
                  <Piece
                    key={`${p.groupId}-${i}`}
                    index={i}
                    piece={p}
                    x0={px * s}
                    y0={py * s}
                    s={s}
                    bleed={bleedFaceMap.get(p.groupId) ?? state.bleedShared}
                    showLabel={zoom >= 0.75 || hovered === i}
                    draggable={manualMode && !verso}
                    selected={props.selectedPiece === i}
                    groupSelected={props.selectedGroupId === p.groupId}
                    dragOffset={dragOffset}
                    invalid={isDragged && !dragCtx.valid}
                    delay={Math.min(i, 23) * 0.025}
                    areaPx={areaPxList[i]}
                    onHover={handleHover}
                    onHoverEnd={handleHoverEnd}
                    onClick={handleClick}
                    onDragStart={handleDragStart}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                  />
                );
              })}
            </g>
          </svg>
        )}

        {/* hover tooltip */}
        {hovered !== null && placed[hovered] && !dragCtx && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-[8px] border border-[var(--line)] bg-white px-2.5 py-1.5 text-[11px] shadow-[var(--shadow-pop)]"
            style={{
              left: ox + (pieceX(placed[hovered]) + placed[hovered].w / 2) * s,
              top: Math.max(4, oy + pieceY(placed[hovered]) * s - 40),
            }}
          >
            <span dir="ltr" className="font-latin font-semibold text-[var(--ink-900)]">
              {trimNumber(placed[hovered].w)}×{trimNumber(placed[hovered].h)}mm
            </span>
            <span className="text-[var(--ink-500)]">
              {' '}
              + Bleed {trimNumber(bleedOf(placed[hovered].groupId).top)} — {CUT_LABEL[state.cutMethod]} —{' '}
              {designLabelOf(placed[hovered].groupId)}
            </span>
          </div>
        )}

        {/* render-cap summary */}
        {hiddenCount > 0 && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[var(--line)] bg-white/90 px-3 py-1 text-[11px] font-semibold text-[var(--ink-500)] shadow-[var(--shadow-card)]">
            <span dir="ltr" className="font-latin">
              +{hiddenCount}
            </span>{' '}
            قطعة إضافية (خُفّض العرض لتحسين الأداء)
          </div>
        )}

        {/* شارة وضع النسخ Alt+سحب */}
        {dragCtx?.duplicate && (
          <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-full border border-[var(--cyan-600)] bg-[var(--cyan-50)] px-3 py-1 text-[11px] font-semibold text-[var(--cyan-600)] shadow-[var(--shadow-card)]">
            وضع النسخ — الأصل يبقى في مكانه
          </div>
        )}

        {/* computing veil */}
        <AnimatePresence>
          {props.computing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 grid place-items-center bg-white/50 backdrop-blur-[1px]"
            >
              <svg width="44" height="44" viewBox="0 0 44 44" className="animate-spin text-[var(--cyan-600)]" fill="none">
                <circle cx="22" cy="22" r="16" stroke="currentColor" strokeWidth="2" strokeDasharray="24 16" />
                <circle cx="22" cy="22" r="5" stroke="currentColor" strokeWidth="2" />
                <path d="M22 2v8M22 34v8M2 22h8M34 22h8" stroke="currentColor" strokeWidth="2" />
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* وسيلة إيضاح الطبقات: ملصق نهائي / bleed / علامة قص */}
      {result && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--line)] bg-[var(--paper-50)] px-3 py-1.5 text-[11px] text-[var(--ink-500)]">
          <span className="flex items-center gap-1.5">
            <svg width="22" height="8" aria-hidden>
              <line x1="1" y1="4" x2="21" y2="4" stroke="var(--ink-900)" strokeWidth="2" />
            </svg>
            ملصق نهائي (Trim)
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="22" height="8" aria-hidden>
              <line x1="1" y1="4" x2="21" y2="4" stroke="#DB2777" strokeWidth="1.8" strokeDasharray="4 3" />
            </svg>
            Bleed — متقطع بلون المجموعة
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="14" height="12" aria-hidden>
              <path d="M4 1 V7 H11" fill="none" stroke="#111827" strokeWidth="1.6" />
            </svg>
            علامة قص (Registration)
          </span>
        </div>
      )}
    </div>
  );
}

const CUT_LABEL: Record<MontageUIState['cutMethod'], string> = {
  guillotine: 'قص مستقيم',
  'die-cut': 'قص بقالب',
  cutcontour: 'CutContour',
};

// ------------------------------- Piece ---------------------------------------

interface PieceProps {
  index: number;
  piece: PlacedPiece;
  x0: number;
  y0: number;
  s: number;
  bleed: { top: number; bottom: number; left: number; right: number };
  showLabel: boolean;
  draggable: boolean;
  selected: boolean;
  groupSelected: boolean;
  dragOffset: { dx: number; dy: number } | null;
  invalid: boolean;
  delay: number;
  areaPx: { left: number; top: number; right: number; bottom: number };
  onHover: (index: number) => void;
  onHoverEnd: (index: number) => void;
  onClick: (index: number) => void;
  onDragStart: (index: number, altKey: boolean) => void;
  onDragMove: (index: number, dxMm: number, dyMm: number, altKey: boolean) => void;
  onDragEnd: (index: number, dxMm: number, dyMm: number, altKey: boolean) => void;
}

// memo: أثناء السحب يتغير dragInfo كل حركة مؤشر فيعيد الأب الرسم — بفضل الخصائص
// المستقرة (معالجات useCallback + خرائط memo) لا تُعاد ترجمة سوى القطع المتأثرة.
const Piece = memo(function Piece(props: PieceProps) {
  const { piece: p, s, x0, y0, bleed } = props;
  const w = p.w * s;
  const h = p.h * s;

  return (
    <motion.g
      initial={{ scale: 0.6, opacity: 0, x: x0, y: y0 }}
      animate={{ x: x0, y: y0, scale: 1, opacity: 1 }}
      transition={{ ...SPRING_FLIP, delay: props.delay }}
      style={{ originX: 0.5, originY: 0.5, cursor: props.draggable ? 'grab' : 'default' }}
      drag={props.draggable}
      dragMomentum={false}
      dragElastic={0}
      // object constraints are relative to the piece's current position
      dragConstraints={{
        left: props.areaPx.left - x0,
        right: props.areaPx.right - x0,
        top: props.areaPx.top - y0,
        bottom: props.areaPx.bottom - y0,
      }}
      onDrag={(e, info) => props.onDragMove(props.index, info.offset.x / s, info.offset.y / s, (e as PointerEvent).altKey ?? false)}
      onDragStart={(e) => props.onDragStart(props.index, (e as PointerEvent).altKey ?? false)}
      onDragEnd={(e, info) => props.onDragEnd(props.index, info.offset.x / s, info.offset.y / s, (e as PointerEvent).altKey ?? false)}
      whileHover={props.draggable ? undefined : { scale: 1.04 }}
      onHoverStart={() => props.onHover(props.index)}
      onHoverEnd={() => props.onHoverEnd(props.index)}
      onClick={() => props.onClick(props.index)}
    >
      <g transform={props.dragOffset ? `translate(${props.dragOffset.dx} ${props.dragOffset.dy})` : undefined}>
        {/* bleed halo — خط متقطع بلون المجموعة */}
        <rect
          x={-bleed.left * s}
          y={-bleed.top * s}
          width={w + (bleed.left + bleed.right) * s}
          height={h + (bleed.top + bleed.bottom) * s}
          rx={3}
          fill="none"
          stroke={p.color}
          strokeWidth={1.5}
          strokeDasharray="5 4"
          opacity={0.85}
        />
        {/* body — إطار الـ trim: خط مصمت داكن */}
        <rect
          width={w}
          height={h}
          rx={2}
          fill={withAlpha(p.color, props.invalid ? 0.35 : 0.18)}
          stroke={props.invalid ? '#DC2626' : 'var(--ink-900)'}
          strokeWidth={props.selected || props.groupSelected ? 2.2 : 1.5}
        />
        {(props.selected || props.groupSelected) && (
          <rect x={-2.5} y={-2.5} width={w + 5} height={h + 5} rx={3} fill="none" stroke="var(--cyan-600)" strokeWidth={1.4} strokeDasharray="4 3" />
        )}
        {/* size label */}
        {props.showLabel && w > 26 && h > 14 && (
          <text
            x={w / 2}
            y={h / 2 + 3}
            textAnchor="middle"
            fontSize={Math.min(10, w / 5)}
            className="font-latin"
            fontWeight={600}
            fill={p.color}
            pointerEvents="none"
          >
            {trimNumber(p.w)}×{trimNumber(p.h)}
          </text>
        )}
      </g>
    </motion.g>
  );
});
