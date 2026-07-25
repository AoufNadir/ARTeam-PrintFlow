import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  CopyPlus,
  Crosshair,
  Eye,
  EyeOff,
  Group,
  Magnet,
  Minus,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Trash2,
  Undo2,
  Ungroup,
  ZoomIn,
} from 'lucide-react';
import { toast } from 'sonner';
import { computeCutMarks } from '@/lib/cut-marks';
import { assertCutPattern, printableArea } from '@/lib/montage-engine';
import { computeSnap, type SnapOutcome } from '@/lib/snap-engine';
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
const SNAP_THRESHOLD_PX = 8;
const GEOMETRY_EPS = 0.01;

type AlignCommand = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';
type DistributeAxis = 'x' | 'y';
type RotateDirection = 1 | -1;

function makeEditorId(prefix: 'piece' | 'group'): string {
  return `${prefix}-${crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}

function pieceEditorId(piece: PlacedPiece, index: number): string {
  return piece.editorId ?? `legacy-${index}-${piece.groupId}-${piece.x}-${piece.y}`;
}

function cloneLayout(pieces: PlacedPiece[]): PlacedPiece[] {
  return pieces.map((piece) => ({ ...piece, bleed: piece.bleed ? { ...piece.bleed } : undefined }));
}

function rectBounds(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: right - x, h: bottom - y };
}

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
  showCutMarks: boolean;
  onToggleCutMarks: () => void;
  onSaveManual: () => void;
  onResetManual: () => void;
}

interface DragCtx {
  pointerId: number;
  anchorId: string;
  sourceIds: string[];
  startClientX: number;
  startClientY: number;
  valid: boolean;
  dxMm: number;
  dyMm: number;
  /** Once Alt is seen during a drag, duplication remains locked until drop. */
  duplicate: boolean;
}

interface MarqueeCtx {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  baseSelection: Set<string>;
  containOnly: boolean;
}

export default function SheetCanvas(props: SheetCanvasProps) {
  const { state, machine, result, placed, manualMode, unit, verso, onCommitPieces, onResetManual } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 520 });
  const [zoom, setZoom] = useState(1);
  const [hovered, setHovered] = useState<number | null>(null);
  const [dragCtx, setDragCtx] = useState<DragCtx | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [keyObjectId, setKeyObjectId] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<MarqueeCtx | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
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
  const editorGroups = useMemo(() => {
    const map = new Map<string, Rect & { ids: string[] }>();
    placed.forEach((piece, index) => {
      if (!piece.editorGroupId) return;
      const id = pieceEditorId(piece, index);
      const current = map.get(piece.editorGroupId);
      if (!current) {
        map.set(piece.editorGroupId, { x: piece.x, y: piece.y, w: piece.w, h: piece.h, ids: [id] });
        return;
      }
      const right = Math.max(current.x + current.w, piece.x + piece.w);
      const bottom = Math.max(current.y + current.h, piece.y + piece.h);
      current.x = Math.min(current.x, piece.x);
      current.y = Math.min(current.y, piece.y);
      current.w = right - current.x;
      current.h = bottom - current.y;
      current.ids.push(id);
    });
    return map;
  }, [placed]);
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
  const undoStack = useRef<PlacedPiece[][]>([]);
  const redoStack = useRef<PlacedPiece[][]>([]);
  const lastLocalCommit = useRef<PlacedPiece[] | null>(null);
  const [historyDepth, setHistoryDepth] = useState({ undo: 0, redo: 0 });

  const syncHistoryDepth = useCallback(() => {
    setHistoryDepth({ undo: undoStack.current.length, redo: redoStack.current.length });
  }, []);

  const commitWithoutHistory = useCallback(
    (next: PlacedPiece[]) => {
      const committed = cloneLayout(next);
      lastLocalCommit.current = committed;
      onCommitPieces(committed);
    },
    [onCommitPieces],
  );

  const commitEdit = useCallback(
    (next: PlacedPiece[], nextSelection?: Iterable<string>, silent = false) => {
      if (
        state.cutMethod === 'guillotine' &&
        next.length > 0 &&
        assertCutPattern(next, result?.flipAxis ?? null) === 'invalid'
      ) {
        if (!silent) toast.error('رُفض التعديل: المخطط الناتج لا يمكن فصله بضربات قص مستقيمة آمنة.');
        return false;
      }
      undoStack.current = [...undoStack.current.slice(-49), cloneLayout(placed)];
      redoStack.current = [];
      const committed = cloneLayout(next);
      lastLocalCommit.current = committed;
      onCommitPieces(committed);
      if (nextSelection) setSelectedIds(new Set(nextSelection));
      syncHistoryDepth();
      return true;
    },
    [state.cutMethod, result?.flipAxis, placed, onCommitPieces, syncHistoryDepth],
  );

  // Engine pieces do not carry editor identities. Assign them once when the
  // user enters manual mode; selection and grouping then remain stable across
  // copy/delete/undo instead of following fragile array indices.
  useEffect(() => {
    if (!manualMode || placed.every((piece) => piece.editorId)) return;
    commitWithoutHistory(
      placed.map((piece) => (piece.editorId ? piece : { ...piece, editorId: makeEditorId('piece') })),
    );
  }, [manualMode, placed, commitWithoutHistory]);

  // A layout coming from the engine/variant picker invalidates editor history.
  // Local commits preserve it because the parent keeps the committed reference.
  useEffect(() => {
    if (lastLocalCommit.current === placed) {
      lastLocalCommit.current = null;
      return;
    }
    undoStack.current = [];
    redoStack.current = [];
    setSelectedIds(new Set());
    setKeyObjectId(null);
    syncHistoryDepth();
  }, [placed, syncHistoryDepth]);

  useEffect(() => {
    const available = new Set(placed.map((piece, index) => pieceEditorId(piece, index)));
    setSelectedIds((current) => {
      const filtered = new Set([...current].filter((id) => available.has(id)));
      return filtered.size === current.size ? current : filtered;
    });
    setKeyObjectId((current) => (current && available.has(current) ? current : null));
  }, [placed]);

  const doUndo = useCallback(() => {
    const stack = undoStack.current;
    if (stack.length === 0) return;
    const prev = cloneLayout(stack[stack.length - 1]);
    undoStack.current = stack.slice(0, -1);
    redoStack.current = [...redoStack.current.slice(-49), cloneLayout(placed)];
    setSelectedIds(new Set());
    setKeyObjectId(null);
    commitWithoutHistory(prev);
    syncHistoryDepth();
  }, [placed, commitWithoutHistory, syncHistoryDepth]);

  const doRedo = useCallback(() => {
    const stack = redoStack.current;
    if (stack.length === 0) return;
    const next = cloneLayout(stack[stack.length - 1]);
    redoStack.current = stack.slice(0, -1);
    undoStack.current = [...undoStack.current.slice(-49), cloneLayout(placed)];
    setSelectedIds(new Set());
    setKeyObjectId(null);
    commitWithoutHistory(next);
    syncHistoryDepth();
  }, [placed, commitWithoutHistory, syncHistoryDepth]);

  // --------------------------- drag handlers --------------------------------

  const resolveDrag = useCallback(
    (sourceIds: string[], dxMm: number, dyMm: number) => {
      const wanted = new Set(sourceIds);
      const targets = placed
        .map((p, i) => ({ p, i, id: pieceEditorId(p, i) }))
        .filter(({ id }) => wanted.has(id));
      if (targets.length === 0) return null;
      const minX = Math.min(...targets.map((t) => t.p.x));
      const minY = Math.min(...targets.map((t) => t.p.y));
      const maxX = Math.max(...targets.map((t) => t.p.x + t.p.w));
      const maxY = Math.max(...targets.map((t) => t.p.y + t.p.h));
      const dx = Math.min(Math.max(dxMm, area.x - minX), area.x + area.w - maxX);
      const dy = Math.min(Math.max(dyMm, area.y - minY), area.y + area.h - maxY);
      return { targets, dx, dy, minX, minY, maxX, maxY };
    },
    [placed, area],
  );

  const noSnap = (measures: SnapOutcome['measures']): SnapOutcome => ({
    dx: 0,
    dy: 0,
    snappedX: false,
    snappedY: false,
    guides: [],
    measures,
  });

  const resolveSnap = useCallback(
    (sourceIds: string[], dxMm: number, dyMm: number, duplicate: boolean) => {
      const drag = resolveDrag(sourceIds, dxMm, dyMm);
      if (!drag) return null;
      const { targets, dx, dy, minX, minY, maxX, maxY } = drag;
      const movedIdx = new Set(targets.map((t) => t.i));
      const moving = targets.map((t) => ({ x: t.p.x + dx, y: t.p.y + dy, w: t.p.w, h: t.p.h }));

      // A duplicate is a new moving object, therefore its originals remain
      // static snap/overlap targets. A regular move excludes its own sources.
      const statics = placed
        .filter((_, j) => duplicate || !movedIdx.has(j))
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
      const thresholdMm = Math.min(5, Math.max(0.8, SNAP_THRESHOLD_PX / Math.max(s, 0.1)));
      const snap = snapEnabled
        ? computeSnap(moving, statics, { refsV, refsH, area }, thresholdMm)
        : noSnap([]);
      let fdx = Math.min(Math.max(dx + snap.dx, area.x - minX), area.x + area.w - maxX);
      let fdy = Math.min(Math.max(dy + snap.dy, area.y - minY), area.y + area.h - maxY);
      const keepsV = Math.abs(fdx - dx - snap.dx) <= 0.02;
      const keepsH = Math.abs(fdy - dy - snap.dy) <= 0.02;
      let effSnap: SnapOutcome = {
        ...snap,
        dx: fdx - dx,
        dy: fdy - dy,
        snappedX: keepsV && snap.guides.some((guide) => guide.axis === 'v'),
        snappedY: keepsH && snap.guides.some((guide) => guide.axis === 'h'),
        guides: snap.guides.filter((guide) => (guide.axis === 'v' ? keepsV : keepsH)),
      };

      const validAt = (offsetX: number, offsetY: number) => {
        if (duplicate) {
          const copies = targets.map(({ p }) => ({ x: p.x + offsetX, y: p.y + offsetY, w: p.w, h: p.h }));
          const base = placed.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }));
          return copies.every((candidate, copyIndex) =>
            placementValid(
              candidate,
              [...base, ...copies.filter((_, index) => index !== copyIndex)],
              area,
              bands,
            ),
          );
        }
        const fixed = placed
          .filter((_, index) => !movedIdx.has(index))
          .map((piece) => ({ x: piece.x, y: piece.y, w: piece.w, h: piece.h }));
        return targets.every(({ p }) =>
          placementValid({ x: p.x + offsetX, y: p.y + offsetY, w: p.w, h: p.h }, fixed, area, bands),
        );
      };

      // Prefer a valid raw position over a snap that would create an overlap.
      if (!validAt(fdx, fdy) && validAt(dx, dy)) {
        fdx = dx;
        fdy = dy;
        effSnap = noSnap(snap.measures);
      }
      return { targets, movedIdx, dx: fdx, dy: fdy, snap: effSnap };
    },
    [resolveDrag, placed, area, bands, result, s, snapEnabled],
  );

  const commitDrag = useCallback(
    (sourceIds: string[], dxMm: number, dyMm: number, duplicate: boolean, silent = false) => {
      if (!duplicate && Math.abs(dxMm) < 0.05 && Math.abs(dyMm) < 0.05) return false;
      const r = resolveSnap(sourceIds, dxMm, dyMm, duplicate);
      if (!r) return false;
      const { targets, movedIdx, dx, dy } = r;
      if (duplicate && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return false;

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
            return false;
          }
        }
        return commitEdit(next, sourceIds, silent);
      }

      const duplicatedGroups = new Map<string, string>();
      const copies = targets.map(({ p }) => {
        const editorGroupId = p.editorGroupId
          ? duplicatedGroups.get(p.editorGroupId) ?? (() => {
              const groupId = makeEditorId('group');
              duplicatedGroups.set(p.editorGroupId!, groupId);
              return groupId;
            })()
          : undefined;
        return {
          ...p,
          editorId: makeEditorId('piece'),
          editorGroupId,
          x: p.x + dx,
          y: p.y + dy,
        };
      });
      const base = placed.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }));
      for (let k = 0; k < copies.length; k++) {
        const others = [...base, ...copies.filter((_, j) => j !== k).map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }))];
        if (!placementValid(copies[k], others, area, bands)) {
          flashInvalid(copies[k]);
          return false;
        }
      }
      return commitEdit([...placed, ...copies], copies.map((piece) => piece.editorId!), silent);
    },
    [placed, area, bands, flashInvalid, resolveSnap, commitEdit],
  );

  const liveCheck = useCallback(
    (sourceIds: string[], dxMm: number, dyMm: number, duplicate: boolean): boolean => {
      const r = resolveSnap(sourceIds, dxMm, dyMm, duplicate);
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

  const selectedEntries = useMemo(
    () =>
      placed
        .map((piece, index) => ({ piece, index, id: pieceEditorId(piece, index) }))
        .filter(({ id }) => selectedIds.has(id)),
    [placed, selectedIds],
  );
  const selectionBounds = useMemo(() => {
    return rectBounds(selectedEntries.map(({ piece }) => piece));
  }, [selectedEntries]);

  const keyEntry = useMemo(
    () => selectedEntries.find(({ id }) => id === keyObjectId) ?? null,
    [selectedEntries, keyObjectId],
  );

  const firstInvalidPiece = useCallback(
    (layout: PlacedPiece[]): PlacedPiece | null => {
      const rects = layout.map((piece) => ({ x: piece.x, y: piece.y, w: piece.w, h: piece.h }));
      for (let index = 0; index < layout.length; index++) {
        const others = rects.filter((_, otherIndex) => otherIndex !== index);
        if (!placementValid(rects[index], others, area, bands)) return layout[index];
      }
      return null;
    },
    [area, bands],
  );

  const commitValidatedEdit = useCallback(
    (next: PlacedPiece[], nextSelection: Iterable<string>, invalidMessage: string) => {
      const invalid = firstInvalidPiece(next);
      if (invalid) {
        flashInvalid(invalid);
        toast.error(invalidMessage);
        return false;
      }
      return commitEdit(next, nextSelection);
    },
    [firstInvalidPiece, flashInvalid, commitEdit],
  );

  const fitSelectionIntoArea = useCallback(
    (layout: PlacedPiece[], ids: Set<string>) => {
      const selected = layout
        .map((piece, index) => ({ piece, id: pieceEditorId(piece, index) }))
        .filter(({ id }) => ids.has(id))
        .map(({ piece }) => piece);
      const bounds = rectBounds(selected);
      if (!bounds || bounds.w > area.w + GEOMETRY_EPS || bounds.h > area.h + GEOMETRY_EPS) return layout;

      let dx = 0;
      let dy = 0;
      if (bounds.x < area.x) dx = area.x - bounds.x;
      else if (bounds.x + bounds.w > area.x + area.w) dx = area.x + area.w - bounds.x - bounds.w;
      if (bounds.y < area.y) dy = area.y - bounds.y;
      else if (bounds.y + bounds.h > area.y + area.h) dy = area.y + area.h - bounds.y - bounds.h;
      if (Math.abs(dx) < GEOMETRY_EPS && Math.abs(dy) < GEOMETRY_EPS) return layout;
      return layout.map((piece, index) =>
        ids.has(pieceEditorId(piece, index)) ? { ...piece, x: piece.x + dx, y: piece.y + dy } : piece,
      );
    },
    [area],
  );

  const rotateSelection = useCallback(
    (direction: RotateDirection = 1) => {
      if (selectedEntries.length === 0 || !selectionBounds) return;
      const ids = new Set(selectedIds);
      const cx = selectionBounds.x + selectionBounds.w / 2;
      const cy = selectionBounds.y + selectionBounds.h / 2;
      const next = placed.map((piece, index) => {
        if (!ids.has(pieceEditorId(piece, index))) return piece;
        const pcx = piece.x + piece.w / 2;
        const pcy = piece.y + piece.h / 2;
        const relX = pcx - cx;
        const relY = pcy - cy;
        const nextRelX = direction === 1 ? -relY : relY;
        const nextRelY = direction === 1 ? relX : -relX;
        const nextW = piece.h;
        const nextH = piece.w;
        return {
          ...piece,
          x: cx + nextRelX - nextW / 2,
          y: cy + nextRelY - nextH / 2,
          w: nextW,
          h: nextH,
          rotated: !piece.rotated,
        };
      });
      const fitted = fitSelectionIntoArea(next, ids);
      commitValidatedEdit(fitted, selectedIds, 'تعذّر التدوير: توجد قطعة خارج الورقة أو فوق قطعة أخرى.');
    },
    [selectedEntries, selectionBounds, selectedIds, placed, fitSelectionIntoArea, commitValidatedEdit],
  );

  const alignSelection = useCallback(
    (command: AlignCommand) => {
      if (selectedEntries.length === 0) return;
      const reference =
        selectedEntries.length === 1
          ? area
          : keyEntry
            ? { x: keyEntry.piece.x, y: keyEntry.piece.y, w: keyEntry.piece.w, h: keyEntry.piece.h }
            : selectionBounds;
      if (!reference) return;

      const ids = new Set(selectedIds);
      const next = placed.map((piece, index) => {
        if (!ids.has(pieceEditorId(piece, index))) return piece;
        let x = piece.x;
        let y = piece.y;
        if (command === 'left') x = reference.x;
        else if (command === 'centerX') x = reference.x + reference.w / 2 - piece.w / 2;
        else if (command === 'right') x = reference.x + reference.w - piece.w;
        else if (command === 'top') y = reference.y;
        else if (command === 'centerY') y = reference.y + reference.h / 2 - piece.h / 2;
        else if (command === 'bottom') y = reference.y + reference.h - piece.h;
        return { ...piece, x, y };
      });
      commitValidatedEdit(next, selectedIds, 'تعذّرت المحاذاة: الوضعية الناتجة فيها تداخل أو خروج من مساحة الطباعة.');
    },
    [selectedEntries, area, keyEntry, selectionBounds, selectedIds, placed, commitValidatedEdit],
  );

  const distributeSelection = useCallback(
    (axis: DistributeAxis) => {
      if (selectedEntries.length < 3 || !selectionBounds) return;
      const sorted = [...selectedEntries].sort((a, b) =>
        axis === 'x' ? a.piece.x - b.piece.x : a.piece.y - b.piece.y,
      );
      const span = axis === 'x' ? selectionBounds.w : selectionBounds.h;
      const used = sorted.reduce((sum, entry) => sum + (axis === 'x' ? entry.piece.w : entry.piece.h), 0);
      const gap = (span - used) / (sorted.length - 1);
      if (gap < -GEOMETRY_EPS) {
        toast.error('لا توجد مساحة كافية لتوزيع العناصر بدون تداخل.');
        return;
      }

      const positions = new Map<string, number>();
      let cursor = axis === 'x' ? selectionBounds.x : selectionBounds.y;
      for (const entry of sorted) {
        positions.set(entry.id, cursor);
        cursor += (axis === 'x' ? entry.piece.w : entry.piece.h) + gap;
      }

      const next = placed.map((piece, index) => {
        const id = pieceEditorId(piece, index);
        const pos = positions.get(id);
        if (pos === undefined) return piece;
        return axis === 'x' ? { ...piece, x: pos } : { ...piece, y: pos };
      });
      commitValidatedEdit(next, selectedIds, 'تعذّر التوزيع: الوضعية الناتجة فيها تداخل أو خروج من مساحة الطباعة.');
    },
    [selectedEntries, selectionBounds, placed, selectedIds, commitValidatedEdit],
  );

  const deleteSelection = useCallback(() => {
    if (selectedIds.size === 0) return;
    setKeyObjectId(null);
    commitEdit(
      placed.filter((piece, index) => !selectedIds.has(pieceEditorId(piece, index))),
      [],
    );
  }, [placed, selectedIds, commitEdit]);

  const nudgeSelection = useCallback(
    (dxMm: number, dyMm: number) => {
      if (selectedIds.size === 0) return;
      commitDrag([...selectedIds], dxMm, dyMm, false);
    },
    [selectedIds, commitDrag],
  );

  const createEditorGroup = useCallback(() => {
    if (selectedIds.size < 2) {
      toast.info('حدد ملصقين أو أكثر باستعمال Shift ثم أنشئ المجموعة.');
      return;
    }
    const editorGroupId = makeEditorId('group');
    commitEdit(
      placed.map((piece, index) =>
        selectedIds.has(pieceEditorId(piece, index)) ? { ...piece, editorGroupId } : piece,
      ),
      selectedIds,
    );
  }, [placed, selectedIds, commitEdit]);

  const ungroupSelection = useCallback(() => {
    const hasGroup = selectedEntries.some(({ piece }) => piece.editorGroupId);
    if (!hasGroup) return;
    commitEdit(
      placed.map((piece, index) =>
        selectedIds.has(pieceEditorId(piece, index)) ? { ...piece, editorGroupId: undefined } : piece,
      ),
      selectedIds,
    );
  }, [placed, selectedIds, selectedEntries, commitEdit]);

  const duplicateSelection = useCallback(() => {
    if (selectedEntries.length === 0) return;
    const ids = [...selectedIds];
    const minX = Math.min(...selectedEntries.map(({ piece }) => piece.x));
    const minY = Math.min(...selectedEntries.map(({ piece }) => piece.y));
    const maxX = Math.max(...selectedEntries.map(({ piece }) => piece.x + piece.w));
    const maxY = Math.max(...selectedEntries.map(({ piece }) => piece.y + piece.h));
    const width = maxX - minX;
    const height = maxY - minY;
    const gap = Math.max(0, state.defaultGapMm);
    const candidates: [number, number][] = [
      [width + gap, 0],
      [-(width + gap), 0],
      [0, height + gap],
      [0, -(height + gap)],
      [width + gap, height + gap],
      [-(width + gap), height + gap],
    ];
    for (const [dx, dy] of candidates) {
      if (commitDrag(ids, dx, dy, true, true)) return;
    }
    toast.error('لا توجد وضعية صالحة وآمنة لنسخ التحديد داخل الورقة.');
  }, [selectedEntries, selectedIds, state.defaultGapMm, commitDrag]);

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
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) ungroupSelection();
        else createEditorGroup();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelection();
        return;
      }
      if (k === 'Delete' || k === 'Backspace') {
        e.preventDefault();
        deleteSelection();
        return;
      }
      if (k === 'Escape') {
        setSelectedIds(new Set());
        setKeyObjectId(null);
        return;
      }
      if (k === 'r' || k === 'R') {
        rotateSelection(e.shiftKey ? -1 : 1);
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
  }, [
    manualMode,
    verso,
    doUndo,
    doRedo,
    createEditorGroup,
    ungroupSelection,
    duplicateSelection,
    deleteSelection,
    rotateSelection,
    nudgeSelection,
  ]);

  // معلومات السحب الحي: الموضع الملتصق + خطوط الإرشاد والقياسات (Smart Guides)
  const dragInfo = useMemo(() => {
    if (!dragCtx) return null;
    return resolveSnap(dragCtx.sourceIds, dragCtx.dxMm, dragCtx.dyMm, dragCtx.duplicate);
  }, [dragCtx, resolveSnap]);

  const dragCtxRef = useRef<DragCtx | null>(null);
  const updateDragCtx = useCallback((ctx: DragCtx | null) => {
    dragCtxRef.current = ctx;
    setDragCtx(ctx);
  }, []);

  const handleHover = useCallback((i: number) => setHovered(i), []);
  const handleHoverEnd = useCallback((i: number) => setHovered((h) => (h === i ? null : h)), []);

  const handlePointerDown = useCallback(
    (i: number, event: React.PointerEvent<SVGGElement>) => {
      if (!manualMode || verso || event.button !== 0) return;
      const piece = placed[i];
      if (!piece) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);

      const clickedId = pieceEditorId(piece, i);
      const groupMembers = piece.editorGroupId
        ? placed
            .map((candidate, index) => ({ candidate, id: pieceEditorId(candidate, index) }))
            .filter(({ candidate }) => candidate.editorGroupId === piece.editorGroupId)
            .map(({ id }) => id)
        : [clickedId];

      const nextSelection = new Set(selectedIds);
      if (event.shiftKey) {
        const allSelected = groupMembers.every((id) => nextSelection.has(id));
        for (const id of groupMembers) {
          if (allSelected) nextSelection.delete(id);
          else nextSelection.add(id);
        }
      } else if (!nextSelection.has(clickedId)) {
        nextSelection.clear();
        groupMembers.forEach((id) => nextSelection.add(id));
      }
      if (nextSelection.size === 0) groupMembers.forEach((id) => nextSelection.add(id));
      setSelectedIds(nextSelection);
      setKeyObjectId(nextSelection.has(clickedId) ? clickedId : null);
      updateDragCtx({
        pointerId: event.pointerId,
        anchorId: clickedId,
        sourceIds: [...nextSelection],
        startClientX: event.clientX,
        startClientY: event.clientY,
        valid: true,
        dxMm: 0,
        dyMm: 0,
        duplicate: event.altKey,
      });
    },
    [manualMode, verso, placed, selectedIds, updateDragCtx],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGGElement>) => {
      const current = dragCtxRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const dxMm = (event.clientX - current.startClientX) / s;
      const dyMm = (event.clientY - current.startClientY) / s;
      const duplicate = current.duplicate || event.altKey;
      updateDragCtx({
        ...current,
        valid: liveCheck(current.sourceIds, dxMm, dyMm, duplicate),
        dxMm,
        dyMm,
        duplicate,
      });
    },
    [s, liveCheck, updateDragCtx],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<SVGGElement>) => {
      const current = dragCtxRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const dxMm = (event.clientX - current.startClientX) / s;
      const dyMm = (event.clientY - current.startClientY) / s;
      const duplicate = current.duplicate || event.altKey;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      updateDragCtx(null);
      commitDrag(current.sourceIds, dxMm, dyMm, duplicate);
    },
    [s, commitDrag, updateDragCtx],
  );

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<SVGGElement>) => {
      const current = dragCtxRef.current;
      if (!current || current.pointerId !== event.pointerId) return;
      updateDragCtx(null);
    },
    [updateDragCtx],
  );

  const canvasPoint = useCallback(
    (element: SVGSVGElement, clientX: number, clientY: number) => {
      const rect = element.getBoundingClientRect();
      return {
        x: (clientX - rect.left - ox) / s,
        y: (clientY - rect.top - oy) / s,
      };
    },
    [ox, oy, s],
  );

  const selectionFromMarquee = useCallback(
    (ctx: MarqueeCtx, endX = ctx.currentX, endY = ctx.currentY) => {
      const x1 = Math.min(ctx.startX, endX);
      const y1 = Math.min(ctx.startY, endY);
      const x2 = Math.max(ctx.startX, endX);
      const y2 = Math.max(ctx.startY, endY);
      if (x2 - x1 < 0.5 && y2 - y1 < 0.5) return new Set(ctx.baseSelection);

      const next = new Set(ctx.baseSelection);
      const touchedGroups = new Set<string>();
      placed.forEach((piece, index) => {
        const inside = piece.x >= x1 && piece.x + piece.w <= x2 && piece.y >= y1 && piece.y + piece.h <= y2;
        const intersects = piece.x < x2 && piece.x + piece.w > x1 && piece.y < y2 && piece.y + piece.h > y1;
        if (ctx.containOnly ? !inside : !intersects) return;
        next.add(pieceEditorId(piece, index));
        if (piece.editorGroupId) touchedGroups.add(piece.editorGroupId);
      });
      if (touchedGroups.size > 0) {
        placed.forEach((piece, index) => {
          if (piece.editorGroupId && touchedGroups.has(piece.editorGroupId)) next.add(pieceEditorId(piece, index));
        });
      }
      return next;
    },
    [placed],
  );

  const handleCanvasPointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (!manualMode || verso || event.button !== 0 || dragCtxRef.current) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const point = canvasPoint(event.currentTarget, event.clientX, event.clientY);
      const baseSelection = event.shiftKey ? new Set(selectedIds) : new Set<string>();
      if (!event.shiftKey) setSelectedIds(new Set());
      setKeyObjectId(null);
      setMarquee({
        pointerId: event.pointerId,
        startX: point.x,
        startY: point.y,
        currentX: point.x,
        currentY: point.y,
        baseSelection,
        containOnly: event.altKey,
      });
    },
    [manualMode, verso, canvasPoint, selectedIds],
  );

  const handleCanvasPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const current = marquee;
      if (!current || current.pointerId !== event.pointerId) return;
      const point = canvasPoint(event.currentTarget, event.clientX, event.clientY);
      const next = { ...current, currentX: point.x, currentY: point.y, containOnly: event.altKey };
      setMarquee(next);
      setSelectedIds(selectionFromMarquee(next));
    },
    [marquee, canvasPoint, selectionFromMarquee],
  );

  const finishMarquee = useCallback(
    (event: React.PointerEvent<SVGSVGElement>, cancelled = false) => {
      const current = marquee;
      if (!current || current.pointerId !== event.pointerId) return;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setMarquee(null);
      if (cancelled) return;
      const point = canvasPoint(event.currentTarget, event.clientX, event.clientY);
      const finalCtx = { ...current, currentX: point.x, currentY: point.y, containOnly: event.altKey };
      if (Math.abs(point.x - current.startX) < 0.5 && Math.abs(point.y - current.startY) < 0.5) {
        setSelectedIds(current.baseSelection);
        setKeyObjectId(null);
        return;
      }
      setSelectedIds(selectionFromMarquee(finalCtx));
      setKeyObjectId(null);
    },
    [marquee, canvasPoint, selectionFromMarquee],
  );

  const selectDesignType = useCallback(
    (designGroupId: string, additive: boolean) => {
      if (!manualMode || verso) return;
      const ids = placed
        .map((piece, index) => ({ piece, id: pieceEditorId(piece, index) }))
        .filter(({ piece }) => piece.groupId === designGroupId)
        .map(({ id }) => id);
      setSelectedIds((current) => {
        const next = additive ? new Set(current) : new Set<string>();
        const allSelected = ids.every((id) => current.has(id));
        for (const id of ids) {
          if (additive && allSelected) next.delete(id);
          else next.add(id);
        }
        return next;
      });
      setKeyObjectId(null);
    },
    [manualMode, verso, placed],
  );

  const resetEditor = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    setSelectedIds(new Set());
    setKeyObjectId(null);
    syncHistoryDepth();
    onResetManual();
  }, [onResetManual, syncHistoryDepth]);

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

  // Stable per-design bleed map for memoized pieces.
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
        {manualMode && !verso && (
          <button
            type="button"
            onClick={() => setSnapEnabled((enabled) => !enabled)}
            title={snapEnabled ? 'Smart Snap مفعّل — اضغط لتعطيله' : 'Smart Snap معطّل — اضغط لتفعيله'}
            className={cn(
              'flex h-8 items-center gap-1 rounded-[8px] border px-2 text-[10px] font-semibold transition-colors',
              snapEnabled
                ? 'border-[var(--cyan-600)] bg-[var(--cyan-50)] text-[var(--cyan-600)]'
                : 'border-[var(--line-strong)] text-[var(--ink-400)]',
            )}
          >
            <Magnet size={13} />
            SNAP
          </button>
        )}
        {manualMode && !verso && (
          <>
            <span className="h-5 w-px bg-[var(--line)]" />
            <button
              type="button"
              onClick={doUndo}
              disabled={historyDepth.undo === 0}
              title="تراجع (Ctrl+Z)"
              className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-500)] hover:bg-[var(--paper-100)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Undo2 size={14} />
            </button>
            <button
              type="button"
              onClick={doRedo}
              disabled={historyDepth.redo === 0}
              title="إعادة (Ctrl+Y)"
              className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-500)] hover:bg-[var(--paper-100)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Redo2 size={14} />
            </button>
            <button
              type="button"
              onClick={duplicateSelection}
              disabled={selectedIds.size === 0}
              title="نسخ التحديد (Ctrl+D أو Alt+سحب)"
              className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-500)] hover:bg-[var(--paper-100)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <CopyPlus size={14} />
            </button>
            <button
              type="button"
              onClick={createEditorGroup}
              disabled={selectedIds.size < 2}
              title="تجميع (Ctrl+G)"
              className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-500)] hover:bg-[var(--paper-100)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Group size={14} />
            </button>
            <button
              type="button"
              onClick={ungroupSelection}
              disabled={!selectedEntries.some(({ piece }) => piece.editorGroupId)}
              title="فك التجميع (Ctrl+Shift+G)"
              className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-500)] hover:bg-[var(--paper-100)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Ungroup size={14} />
            </button>
            <span className="h-5 w-px bg-[var(--line)]" />
            <button
              type="button"
              onClick={() => alignSelection('left')}
              disabled={selectedIds.size === 0}
              title="محاذاة يسار — عنصر واحد مع الورقة، عدة عناصر مع مرجع التحديد"
              className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-500)] hover:bg-[var(--paper-100)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <AlignStartVertical size={14} />
            </button>
            <button
              type="button"
              onClick={() => alignSelection('centerX')}
              disabled={selectedIds.size === 0}
              title="محاذاة وسط أفقي"
              className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-500)] hover:bg-[var(--paper-100)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <AlignCenterVertical size={14} />
            </button>
            <button
              type="button"
              onClick={() => alignSelection('right')}
              disabled={selectedIds.size === 0}
              title="محاذاة يمين"
              className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-500)] hover:bg-[var(--paper-100)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <AlignEndVertical size={14} />
            </button>
            <button
              type="button"
              onClick={() => alignSelection('top')}
              disabled={selectedIds.size === 0}
              title="محاذاة أعلى"
              className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-500)] hover:bg-[var(--paper-100)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <AlignStartHorizontal size={14} />
            </button>
            <button
              type="button"
              onClick={() => alignSelection('centerY')}
              disabled={selectedIds.size === 0}
              title="محاذاة وسط عمودي"
              className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-500)] hover:bg-[var(--paper-100)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <AlignCenterHorizontal size={14} />
            </button>
            <button
              type="button"
              onClick={() => alignSelection('bottom')}
              disabled={selectedIds.size === 0}
              title="محاذاة أسفل"
              className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-500)] hover:bg-[var(--paper-100)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <AlignEndHorizontal size={14} />
            </button>
            <button
              type="button"
              onClick={() => distributeSelection('x')}
              disabled={selectedIds.size < 3}
              title="توزيع أفقي بمسافات متساوية"
              className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-500)] hover:bg-[var(--paper-100)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <AlignHorizontalSpaceBetween size={14} />
            </button>
            <button
              type="button"
              onClick={() => distributeSelection('y')}
              disabled={selectedIds.size < 3}
              title="توزيع عمودي بمسافات متساوية"
              className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-500)] hover:bg-[var(--paper-100)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <AlignVerticalSpaceBetween size={14} />
            </button>
            <span className="h-5 w-px bg-[var(--line)]" />
            <button
              type="button"
              onClick={() => rotateSelection(-1)}
              disabled={selectedIds.size === 0}
              title="تدوير 90° يسار (Shift+R)"
              className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-500)] hover:bg-[var(--paper-100)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <RotateCcw size={14} />
            </button>
            <button
              type="button"
              onClick={() => rotateSelection(1)}
              disabled={selectedIds.size === 0}
              title="تدوير 90° يمين (R)"
              className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-500)] hover:bg-[var(--paper-100)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <RotateCw size={14} />
            </button>
            <button
              type="button"
              onClick={deleteSelection}
              disabled={selectedIds.size === 0}
              title="حذف التحديد (Del)"
              className="grid h-8 w-8 place-items-center rounded-[8px] border border-[var(--line-strong)] text-[var(--ink-500)] hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Trash2 size={14} />
            </button>
          </>
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
          {legend.map((g) => {
            const ids = placed
              .map((piece, index) => ({ piece, id: pieceEditorId(piece, index) }))
              .filter(({ piece }) => piece.groupId === g.id)
              .map(({ id }) => id);
            const active = ids.length > 0 && ids.every((id) => selectedIds.has(id));
            return (
              <button
                key={g.id}
                type="button"
                disabled={!manualMode || verso}
                onClick={(event) => selectDesignType(g.id, event.shiftKey)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:cursor-default',
                  active ? 'border-[var(--cyan-600)] bg-[var(--cyan-50)]' : 'border-[var(--line)] bg-white hover:bg-[var(--paper-100)]',
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
            );
          })}
          {manualMode && selectedIds.size > 0 && (
            <span className="text-[11px] text-[var(--cyan-600)]">
              {selectedIds.size} محدد — Shift لإضافة تحديد، Ctrl+G للتجميع
            </span>
          )}
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
              اسحب للتحريك والالتصاق • <span dir="ltr" className="font-latin font-semibold">Alt</span>+سحب للنسخ •{' '}
              اسحب في الفراغ لتحديد مساحة • <span dir="ltr" className="font-latin font-semibold">Shift</span> لإضافة تحديد •{' '}
              <span dir="ltr" className="font-latin font-semibold">Ctrl+G</span> تجميع • أسهم 1مم •{' '}
              <span dir="ltr" className="font-latin font-semibold">R/Shift+R</span> تدوير •{' '}
              <span dir="ltr" className="font-latin font-semibold">Ctrl+Z/Y</span> تراجع/إعادة
              {historyDepth.undo > 0 && <span className="ms-1 text-[var(--cyan-600)]/70">({historyDepth.undo}/50)</span>}
            </span>
            <button type="button" onClick={props.onSaveManual} className="rounded-full bg-white/70 px-2.5 py-0.5 text-[11px] font-semibold hover:bg-white">
              حفظ
            </button>
            <button type="button" onClick={resetEditor} className="rounded-full bg-white/70 px-2.5 py-0.5 text-[11px] font-semibold hover:bg-white">
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
          <svg
            width={size.w}
            height={size.h}
            className="block touch-none select-none"
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={(event) => finishMarquee(event)}
            onPointerCancel={(event) => finishMarquee(event, true)}
          >
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

              {marquee && (
                <rect
                  x={Math.min(marquee.startX, marquee.currentX)}
                  y={Math.min(marquee.startY, marquee.currentY)}
                  width={Math.abs(marquee.currentX - marquee.startX)}
                  height={Math.abs(marquee.currentY - marquee.startY)}
                  fill="rgba(2,132,199,0.10)"
                  stroke="var(--cyan-600)"
                  strokeWidth={1}
                  strokeDasharray="5 3"
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
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

              {/* User-created editor groups — independent from design groupId. */}
              {manualMode &&
                [...editorGroups.entries()].map(([groupId, bounds]) => {
                  const active = bounds.ids.every((id) => selectedIds.has(id));
                  const moving =
                    dragInfo &&
                    dragCtx &&
                    !dragCtx.duplicate &&
                    bounds.ids.every((id) => dragCtx.sourceIds.includes(id));
                  const groupDx = moving ? dragInfo.dx : 0;
                  const groupDy = moving ? dragInfo.dy : 0;
                  return (
                    <g key={`editor-group-${groupId}`} pointerEvents="none">
                      <rect
                        x={bounds.x + groupDx - 2.5}
                        y={bounds.y + groupDy - 2.5}
                        width={bounds.w + 5}
                        height={bounds.h + 5}
                        rx={2}
                        fill="none"
                        stroke="var(--cyan-600)"
                        strokeWidth={active ? 1.6 : 0.9}
                        strokeDasharray={active ? '6 3' : '3 3'}
                        vectorEffect="non-scaling-stroke"
                        opacity={active ? 0.95 : 0.45}
                      />
                      {active && (
                        <text
                          x={bounds.x + groupDx}
                          y={bounds.y + groupDy - 4}
                          fontSize={3.2}
                          fontWeight={700}
                          fill="var(--cyan-600)"
                          className="font-latin"
                        >
                          GROUP · {bounds.ids.length}
                        </text>
                      )}
                    </g>
                  );
                })}

              {manualMode && selectedEntries.length > 1 && selectionBounds && (
                <g pointerEvents="none">
                  <rect
                    x={selectionBounds.x + (dragInfo && dragCtx ? dragInfo.dx : 0) - 1.5}
                    y={selectionBounds.y + (dragInfo && dragCtx ? dragInfo.dy : 0) - 1.5}
                    width={selectionBounds.w + 3}
                    height={selectionBounds.h + 3}
                    fill="none"
                    stroke="var(--cyan-600)"
                    strokeWidth={1.2}
                    vectorEffect="non-scaling-stroke"
                  />
                  {[
                    [selectionBounds.x, selectionBounds.y],
                    [selectionBounds.x + selectionBounds.w, selectionBounds.y],
                    [selectionBounds.x, selectionBounds.y + selectionBounds.h],
                    [selectionBounds.x + selectionBounds.w, selectionBounds.y + selectionBounds.h],
                  ].map(([x, y], index) => (
                    <rect
                      key={`selection-handle-${index}`}
                      x={x + (dragInfo && dragCtx ? dragInfo.dx : 0) - 1.5}
                      y={y + (dragInfo && dragCtx ? dragInfo.dy : 0) - 1.5}
                      width={3}
                      height={3}
                      fill="#fff"
                      stroke="var(--cyan-600)"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </g>
              )}

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
                  {dragInfo.snap.guides.some((guide) => guide.axis === 'v') &&
                    dragInfo.snap.guides.some((guide) => guide.axis === 'h') && (
                      <circle
                        cx={dragInfo.snap.guides.find((guide) => guide.axis === 'v')!.pos}
                        cy={dragInfo.snap.guides.find((guide) => guide.axis === 'h')!.pos}
                        r={2.2}
                        fill="#fff"
                        stroke="var(--cyan-600)"
                        strokeWidth={1.2}
                        vectorEffect="non-scaling-stroke"
                      />
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
                const id = pieceEditorId(p, i);
                const isDragged = dragCtx?.sourceIds.includes(id) ?? false;
                const dragOffset =
                  dragInfo && dragCtx && isDragged && !dragCtx.duplicate
                    ? { dx: dragInfo.dx * s, dy: dragInfo.dy * s }
                    : null;
                return (
                  <Piece
                    key={id}
                    index={i}
                    piece={p}
                    x0={px * s}
                    y0={py * s}
                    s={s}
                    bleed={bleedFaceMap.get(p.groupId) ?? state.bleedShared}
                    showLabel={zoom >= 0.75 || hovered === i}
                    draggable={manualMode && !verso}
                    selected={selectedIds.has(id)}
                    keyObject={selectedIds.size > 1 && keyObjectId === id}
                    preview={false}
                    dragOffset={dragOffset}
                    invalid={isDragged && dragCtx?.valid === false}
                    delay={Math.min(i, 23) * 0.025}
                    onHover={handleHover}
                    onHoverEnd={handleHoverEnd}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                  />
                );
              })}
              {dragCtx?.duplicate &&
                dragInfo &&
                renderedPieces.map((p, i) => {
                  const id = pieceEditorId(p, i);
                  if (!dragCtx?.sourceIds.includes(id)) return null;
                  return (
                    <Piece
                      key={`duplicate-preview-${id}`}
                      index={i}
                      piece={p}
                      x0={pieceX(p) * s}
                      y0={pieceY(p) * s}
                      s={s}
                      bleed={bleedFaceMap.get(p.groupId) ?? state.bleedShared}
                      showLabel={zoom >= 0.75}
                      draggable={false}
                      selected
                      keyObject={selectedIds.size > 1 && keyObjectId === id}
                      preview
                      dragOffset={{ dx: dragInfo.dx * s, dy: dragInfo.dy * s }}
                      invalid={!dragCtx.valid}
                      delay={0}
                      onHover={handleHover}
                      onHoverEnd={handleHoverEnd}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerCancel}
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
  keyObject: boolean;
  preview: boolean;
  dragOffset: { dx: number; dy: number } | null;
  invalid: boolean;
  delay: number;
  onHover: (index: number) => void;
  onHoverEnd: (index: number) => void;
  onPointerDown: (index: number, event: React.PointerEvent<SVGGElement>) => void;
  onPointerMove: (event: React.PointerEvent<SVGGElement>) => void;
  onPointerUp: (event: React.PointerEvent<SVGGElement>) => void;
  onPointerCancel: (event: React.PointerEvent<SVGGElement>) => void;
}

const Piece = memo(function Piece(props: PieceProps) {
  const { piece: p, s, x0, y0, bleed } = props;
  const w = p.w * s;
  const h = p.h * s;

  return (
    <motion.g
      initial={{ scale: 0.6, opacity: 0, x: x0, y: y0 }}
      animate={{ x: x0, y: y0, scale: 1, opacity: props.preview ? 0.78 : 1 }}
      transition={{ ...SPRING_FLIP, delay: props.delay }}
      pointerEvents={props.preview ? 'none' : undefined}
      style={{ originX: 0.5, originY: 0.5, cursor: props.draggable ? 'grab' : 'default', touchAction: 'none' }}
      onPointerDown={(event) => props.onPointerDown(props.index, event)}
      onPointerMove={props.onPointerMove}
      onPointerUp={props.onPointerUp}
      onPointerCancel={props.onPointerCancel}
      whileHover={props.draggable ? undefined : { scale: 1.04 }}
      onHoverStart={() => props.onHover(props.index)}
      onHoverEnd={() => props.onHoverEnd(props.index)}
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
          strokeWidth={props.selected ? 2.2 : 1.5}
        />
        {props.selected && (
          <rect x={-2.5} y={-2.5} width={w + 5} height={h + 5} rx={3} fill="none" stroke="var(--cyan-600)" strokeWidth={1.4} strokeDasharray="4 3" />
        )}
        {props.keyObject && (
          <rect
            x={-4.5}
            y={-4.5}
            width={w + 9}
            height={h + 9}
            rx={4}
            fill="none"
            stroke="var(--cyan-600)"
            strokeWidth={2.1}
          />
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
