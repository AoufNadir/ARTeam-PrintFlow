import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FileDown, Fullscreen, X } from 'lucide-react';
import { toast } from 'sonner';
import { CropMarks } from '@/components/ds/SectionCard';
import { computeCutMarks, type CutMarkSegment } from '@/lib/cut-marks';
import { forbiddenBandsOf } from '@/lib/montage-engine';
import type { Machine, MontageResult, PlacedPiece } from '@/lib/types';
import { trimNumber } from '@/lib/units';
import { cn } from '@/lib/utils';
import { stickerBleed, withAlpha, type CostEstimate, type MontageUIState } from './montage-data';
import { buildPdf, defaultPdfOptions, type PdfOptions } from './pdf-export';

export interface PdfExportModalProps {
  open: boolean;
  onClose: () => void;
  state: MontageUIState;
  machine: Machine;
  result: MontageResult;
  placed: PlacedPiece[];
  cost: CostEstimate;
}

// ------------------------------- thumbnails ----------------------------------

/** مصغّرة حية تعكس خيارات التصدير — نفس طبقات المعاينة والـPDF */
function Thumb({ props, face, opts }: { props: PdfExportModalProps; face: 'Recto' | 'Verso'; opts: PdfOptions }) {
  const { result, placed, state, machine } = props;
  const sheetW = result.sheetWidthMm;
  const sheetH = result.sheetHeightMm;
  const W = 170;
  const s = W / sheetW;
  const H = sheetH * s;
  // same flip axis as the PDF: engine's flipAxis first ('vertical' = mirror X,
  // 'horizontal' = mirror Y), dimension-aware method heuristic as fallback
  // (double-pince splits the SMALLER dimension, bascule the LARGER one)
  const flipAxis: 'x' | 'y' = result.flipAxis
    ? result.flipAxis.axis === 'vertical'
      ? 'x'
      : 'y'
    : result.method === 'double-pince'
      ? sheetW <= sheetH
        ? 'x'
        : 'y'
      : result.method === 'bascule'
        ? sheetW >= sheetH
          ? 'x'
          : 'y'
        : 'x';
  const mirrorX = (x: number, w: number) => (face === 'Verso' && flipAxis === 'x' ? sheetW - x - w : x);
  const mirrorY = (y: number, h: number) => (face === 'Verso' && flipAxis === 'y' ? sheetH - y - h : y);

  const bleedOf = (groupId: string) => {
    const s0 = state.stickers.find((x) => x.id === groupId);
    const pb = s0 ? stickerBleed(state, s0) : state.bleedShared;
    const flipX = face === 'Verso' && flipAxis === 'x';
    const flipY = face === 'Verso' && flipAxis === 'y';
    return {
      left: flipX ? pb.right : pb.left,
      right: flipX ? pb.left : pb.right,
      top: flipY ? pb.bottom : pb.top,
      bottom: flipY ? pb.top : pb.bottom,
    };
  };

  // علامات القص في المصغّرة — نفس وحدة cut-marks.ts لتطابق المعاينة والـPDF
  const thumbMarks: CutMarkSegment[] = useMemo(() => {
    if (!opts.cropMarks || placed.length === 0) return [];
    const facePieces = placed.map((p) => ({
      x: mirrorX(p.x, p.w),
      y: mirrorY(p.y, p.h),
      w: p.w,
      h: p.h,
      groupId: p.groupId,
      bleed: bleedOf(p.groupId),
    }));
    return computeCutMarks(facePieces, {
      cutMethod: state.cutMethod,
      sharedCut: state.sharedCut,
      doubleCut: state.doubleCut,
      area: result.printableArea,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.cropMarks, placed, face, flipAxis, state, result.printableArea]);

  // حدود المجموعات (قص مشترك/مزدوج) — مثل المعاينة والـPDF
  const groupBoxes = useMemo(() => {
    if (!opts.groupBounds || state.stickers.length <= 1) return [];
    const map = new Map<string, { x: number; y: number; w: number; h: number; color: string }>();
    for (const p of placed) {
      const x = mirrorX(p.x, p.w);
      const y = mirrorY(p.y, p.h);
      const cur = map.get(p.groupId);
      if (!cur) map.set(p.groupId, { x, y, w: p.w, h: p.h, color: p.color });
      else {
        const x2 = Math.max(cur.x + cur.w, x + p.w);
        const y2 = Math.max(cur.y + cur.h, y + p.h);
        cur.x = Math.min(cur.x, x);
        cur.y = Math.min(cur.y, y);
        cur.w = x2 - cur.x;
        cur.h = y2 - cur.y;
      }
    }
    return [...map.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.groupBounds, placed, face, flipAxis, state.stickers.length]);

  const a = result.printableArea;
  const pinceBand =
    opts.bands && machine.kind !== 'digital' && machine.priseDePince && result.method !== 'double-pince'
      ? sheetW >= sheetH
        ? { x: machine.margins.left, y: sheetH - machine.margins.bottom - machine.priseDePince, w: sheetW - machine.margins.left - machine.margins.right, h: machine.priseDePince }
        : { x: sheetW - machine.margins.right - machine.priseDePince, y: machine.margins.top, w: machine.priseDePince, h: sheetH - machine.margins.top - machine.margins.bottom }
      : null;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={W} height={H} className="rounded-[6px] border border-[var(--line-strong)] bg-white shadow-sm">
        <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill="#fff" stroke="var(--ink-700)" strokeWidth={1} />
        <rect
          x={a.x * s}
          y={a.y * s}
          width={a.w * s}
          height={a.h * s}
          fill="none"
          stroke="var(--cyan-500)"
          strokeWidth={0.8}
          strokeDasharray="3 2"
        />
        {opts.bands && machine.kind === 'digital' && (
          <g stroke="var(--cyan-500)" strokeWidth={0.5} opacity={0.6}>
            <line x1={(a.x + a.w / 2 - 4) * s} y1={(a.y + a.h / 2) * s} x2={(a.x + a.w / 2 + 4) * s} y2={(a.y + a.h / 2) * s} />
            <line x1={(a.x + a.w / 2) * s} y1={(a.y + a.h / 2 - 4) * s} x2={(a.x + a.w / 2) * s} y2={(a.y + a.h / 2 + 4) * s} />
          </g>
        )}
        {pinceBand && (
          <rect
            x={pinceBand.x * s}
            y={pinceBand.y * s}
            width={pinceBand.w * s}
            height={pinceBand.h * s}
            fill="rgba(217,119,6,0.10)"
            stroke="rgba(217,119,6,0.45)"
            strokeWidth={0.6}
          />
        )}
        {opts.bands &&
          forbiddenBandsOf(result).map((b, bi) => (
            <rect
              key={`band-${bi}`}
              x={b.x * s}
              y={b.y * s}
              width={b.w * s}
              height={b.h * s}
              fill={result.method === 'double-pince' ? 'rgba(217,119,6,0.10)' : 'rgba(2,132,199,0.10)'}
              stroke={result.method === 'double-pince' ? 'rgba(217,119,6,0.45)' : 'rgba(2,132,199,0.45)'}
              strokeWidth={0.6}
              strokeDasharray="2 2"
            />
          ))}
        {opts.bands && result.flipAxis && (
          <line
            x1={result.flipAxis.axis === 'vertical' ? result.flipAxis.position * s : 0}
            y1={result.flipAxis.axis === 'vertical' ? 0 : result.flipAxis.position * s}
            x2={result.flipAxis.axis === 'vertical' ? result.flipAxis.position * s : W}
            y2={result.flipAxis.axis === 'vertical' ? H : result.flipAxis.position * s}
            stroke="var(--cyan-600)"
            strokeWidth={0.7}
            strokeDasharray="4 3"
            opacity={0.55}
          />
        )}
        {groupBoxes.map((b, bi) => (
          <g key={`gb-${bi}`}>
            {state.sharedCut && (
              <rect
                x={(b.x - 2) * s}
                y={(b.y - 2) * s}
                width={(b.w + 4) * s}
                height={(b.h + 4) * s}
                rx={1}
                fill="none"
                stroke={b.color}
                strokeWidth={0.9}
                strokeDasharray="5 3"
                opacity={0.55}
              />
            )}
            {state.doubleCut && (
              <rect
                x={(b.x - 4.5) * s}
                y={(b.y - 4.5) * s}
                width={(b.w + 9) * s}
                height={(b.h + 9) * s}
                rx={1}
                fill="none"
                stroke={b.color}
                strokeWidth={0.6}
                strokeDasharray="2 2"
                opacity={0.35}
              />
            )}
          </g>
        ))}
        {placed.map((p, i) => {
          const bl = bleedOf(p.groupId);
          return (
            <g key={i}>
              {opts.bleed && (
                <rect
                  x={(mirrorX(p.x, p.w) - bl.left) * s}
                  y={(mirrorY(p.y, p.h) - bl.top) * s}
                  width={(p.w + bl.left + bl.right) * s}
                  height={(p.h + bl.top + bl.bottom) * s}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={0.7}
                  strokeDasharray="3 2"
                  opacity={0.85}
                />
              )}
              <motion.rect
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i, 24) * 0.015 }}
                x={mirrorX(p.x, p.w) * s}
                y={mirrorY(p.y, p.h) * s}
                width={p.w * s}
                height={p.h * s}
                rx={1}
                fill={withAlpha(p.color, 0.18)}
                stroke="var(--ink-900)"
                strokeWidth={0.8}
              />
            </g>
          );
        })}
        {thumbMarks.map((m, mi) => (
          <line
            key={`tm-${mi}`}
            x1={m.x1 * s}
            y1={m.y1 * s}
            x2={m.x2 * s}
            y2={m.y2 * s}
            stroke={m.kind === 'guillotine' ? '#374151' : m.kind === 'shared' ? '#000000' : '#111827'}
            strokeWidth={m.kind === 'guillotine' ? 0.6 : 0.9}
          />
        ))}
        {opts.registration &&
          [
            [a.x / 2, a.y / 2],
            [a.x + a.w + (sheetW - a.x - a.w) / 2, a.y / 2],
            [a.x / 2, a.y + a.h + (sheetH - a.y - a.h) / 2],
            [a.x + a.w + (sheetW - a.x - a.w) / 2, a.y + a.h + (sheetH - a.y - a.h) / 2],
          ].map(([cx, cy], ci) => (
            <g key={`reg-${ci}`} stroke="#15171E" strokeWidth={0.6}>
              <circle cx={cx * s} cy={cy * s} r={2.2} fill="none" />
              <line x1={cx * s - 4} y1={cy * s} x2={cx * s + 4} y2={cy * s} />
              <line x1={cx * s} y1={cy * s - 4} x2={cx * s} y2={cy * s + 4} />
            </g>
          ))}
        {opts.cropMarks &&
          !opts.registration &&
          [4, W - 4].map((cx) =>
            [4, H - 4].map((cy) => (
              <g key={`${cx}-${cy}`} stroke="var(--ink-400)" strokeWidth={0.7}>
                <line x1={cx - 3} y1={cy} x2={cx + 3} y2={cy} />
                <line x1={cx} y1={cy - 3} x2={cx} y2={cy + 3} />
              </g>
            )),
          )}
      </svg>
      <span dir="ltr" className="font-latin text-[10px] font-semibold text-[var(--ink-500)]">
        {face}
      </span>
      {state.cutMethod !== 'guillotine' && opts.cutContour && (
        <span dir="ltr" className="font-latin text-[9px] text-[var(--magenta-600)]">
          CutContour ON
        </span>
      )}
    </div>
  );
}

// ------------------------------- modal ---------------------------------------

export default function PdfExportModal(props: PdfExportModalProps) {
  const { open, onClose, result, state, machine } = props;
  const duplex = result.facesPerSheet === 2;
  const contourAllowed = state.cutMethod !== 'guillotine';
  const multi = state.stickers.length > 1;
  // الافتراضي = مطابق للمعاينة الحالية بالضبط (defaultPdfOptions)
  const [opts, setOpts] = useState<PdfOptions>(() => defaultPdfOptions(machine, duplex));

  const effectiveOpts = useMemo(
    () => ({
      ...opts,
      twoPages: opts.twoPages && duplex,
      cutContour: opts.cutContour && contourAllowed,
      groupBounds: opts.groupBounds && multi,
    }),
    [opts, duplex, contourAllowed, multi],
  );

  const checks = useMemo(
    () =>
      [
        { key: 'cropMarks' as const, latin: 'Traits de coupe', ar: 'علامات القص', enabled: true, note: '' },
        { key: 'bleed' as const, latin: 'Bleed', ar: `${trimNumber(state.bleedShared.top)}مم`, enabled: true, note: '' },
        { key: 'bands' as const, latin: '', ar: 'الأشرطة/الشريط الوسطي ومحور القلب', enabled: true, note: '' },
        { key: 'groupBounds' as const, latin: '', ar: 'حدود المجموعات', enabled: multi, note: '— يتطلب أكثر من تصميم' },
        { key: 'pieceLabels' as const, latin: '', ar: 'المقاسات داخل القطع', enabled: true, note: '' },
        { key: 'registration' as const, latin: 'Registration', ar: 'علامات التسجيل', enabled: true, note: '' },
        { key: 'cutContour' as const, latin: 'CutContour', ar: 'مسار القص', enabled: contourAllowed, note: '— يتطلب قصًا بقالب' },
        { key: 'metadata' as const, latin: '', ar: 'معلومات تقنية في التذييل', enabled: true, note: '' },
        { key: 'twoPages' as const, latin: '', ar: 'صفحتان: Recto + Verso', enabled: duplex, note: '' },
      ].map((c) => ({ ...c, checked: c.enabled ? opts[c.key] : false })),
    [opts, contourAllowed, duplex, multi, state.bleedShared.top],
  );

  const download = () => {
    const doc = buildPdf(props, effectiveOpts);
    doc.save(`montage-${trimNumber(result.sheetWidthMm)}x${trimNumber(result.sheetHeightMm)}mm-${result.method}.pdf`);
    toast.success('تم تصدير المخطط التقني PDF');
    onClose();
  };

  const preview = () => {
    const doc = buildPdf(props, effectiveOpts);
    const url = doc.output('bloburl');
    window.open(url, '_blank');
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center bg-[var(--ink-900)]/30 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.24 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[760px] rounded-[18px] border border-[var(--line)] bg-white p-6 shadow-[var(--shadow-pop)]"
            role="dialog"
            aria-modal="true"
            aria-label="تصدير PDF تقني"
          >
            <CropMarks opacity={0.4} offset={8} />
            <header className="mb-4 flex items-center justify-between">
              <h3 className="text-[17px] leading-[26px] font-semibold text-[var(--ink-900)]">تصدير PDF تقني</h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="إغلاق"
                className="grid h-8 w-8 place-items-center rounded-[8px] text-[var(--ink-500)] hover:bg-[var(--paper-100)]"
              >
                <X size={17} />
              </button>
            </header>

            <div className="grid gap-6 md:grid-cols-[240px_1fr]">
              {/* options checklist */}
              <ul className="space-y-2.5">
                {checks.map((c) => (
                  <li key={c.key}>
                    <label
                      className={cn(
                        'flex items-center gap-2 text-[13px]',
                        c.enabled ? 'cursor-pointer text-[var(--ink-700)]' : 'cursor-not-allowed text-[var(--ink-400)]',
                      )}
                      title={
                        !c.enabled && c.key === 'cutContour'
                          ? 'متاح فقط مع قص بقالب / CutContour'
                          : !c.enabled && c.key === 'groupBounds'
                            ? 'متاح مع أكثر من تصميم على الورقة'
                            : undefined
                      }
                    >
                      <input
                        type="checkbox"
                        checked={c.checked}
                        disabled={!c.enabled}
                        onChange={(e) => setOpts((o) => ({ ...o, [c.key]: e.target.checked }))}
                        className="h-4 w-4 accent-[var(--cyan-600)]"
                      />
                      {c.latin && (
                        <span dir="ltr" className="font-latin font-medium">
                          {c.latin}
                        </span>
                      )}
                      <span className={c.latin ? 'text-[var(--ink-500)]' : ''}>
                        ({c.ar}){!c.enabled && c.note ? ` ${c.note}` : ''}
                      </span>
                    </label>
                  </li>
                ))}
                <li className="pt-2 text-[11px] leading-5 text-[var(--ink-400)]">
                  ملف الـPDF يُرسم بالأحرف اللاتينية والأرقام فقط لضمان التوافق مع أنظمة المطبعة. الافتراضي يطابق المعاينة
                  الحالية تماماً.
                </li>
              </ul>

              {/* live thumbnails */}
              <div className="flex flex-wrap items-start justify-center gap-4 rounded-[12px] bg-[var(--paper-100)] p-4">
                <Thumb props={props} face="Recto" opts={effectiveOpts} />
                {duplex && effectiveOpts.twoPages && <Thumb props={props} face="Verso" opts={effectiveOpts} />}
              </div>
            </div>

            <footer className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={preview}
                className="flex h-10 items-center gap-2 rounded-[10px] border border-[var(--line-strong)] px-4 text-[13px] font-medium text-[var(--ink-700)] hover:bg-[var(--paper-100)]"
              >
                <Fullscreen size={15} />
                معاينة بملء الشاشة
              </button>
              <button
                type="button"
                onClick={download}
                className="flex h-10 items-center gap-2 rounded-[10px] bg-[var(--cyan-600)] px-5 text-[13px] font-bold text-white transition-all hover:-translate-y-px hover:bg-[var(--cyan-500)] active:translate-y-0 active:brightness-95"
              >
                <FileDown size={15} />
                تحميل PDF
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
