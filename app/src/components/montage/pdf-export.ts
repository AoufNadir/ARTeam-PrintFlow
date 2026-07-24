// ---------------------------------------------------------------------------
// تصدير PDF تقني — يعيد رسم كل طبقات معاينة SheetCanvas حرفياً (WYSIWYG):
// hatching الهوامش، المساحة القابلة للطباعة + تسميتها، الصليب المركزي للرقمي،
// prise de pince، الشريط الوسطي/أشرطة القبضة، محور القلب، حدود المجموعات،
// القطع (تعبئة بلون المجموعة 18% + trim مصمت داكن + bleed متقطع بلون المجموعة
// + مقاس داخلي)، علامات القص من cut-marks.ts، علامات التسجيل، والتذييل.
// النصوص لاتينية/أرقام فقط (jsPDF helvetica) — نفس أسلوب التطبيق المعتمد.
// ---------------------------------------------------------------------------

import { jsPDF } from 'jspdf';
import { computeCutMarks } from '@/lib/cut-marks';
import { forbiddenBandsOf } from '@/lib/montage-engine';
import type { BleedBox, Machine, MontageResult, PlacedPiece } from '@/lib/types';
import { trimNumber } from '@/lib/units';
import { PRINT_METHODS, stickerBleed, type MontageUIState } from './montage-data';

export interface PdfExportInput {
  state: MontageUIState;
  machine: Machine;
  result: MontageResult;
  placed: PlacedPiece[];
}

export interface PdfOptions {
  /** علامات القص (traits de coupe) — من cut-marks.ts، نفس المعاينة */
  cropMarks: boolean;
  /** إطارات bleed المتقطعة بلون المجموعة */
  bleed: boolean;
  /** الشريط الوسطي/أشرطة القبضة + prise de pince + الصليب المركزي + محور القلب */
  bands: boolean;
  /** حدود المجموعات المتقطعة (قص مشترك/مزدوج) — للتصاميم المتعددة */
  groupBounds: boolean;
  /** نص المقاس داخل كل قطعة */
  pieceLabels: boolean;
  /** علامات تسجيل دائرية متقاطعة في الزوايا الأربع خارج مساحة الطباعة */
  registration: boolean;
  /** صفحة CutContour منفصلة (قص بقالب فقط) */
  cutContour: boolean;
  /** تذييل معلومات تقنية خارج مساحة الطباعة */
  metadata: boolean;
  /** صفحتان: Recto + Verso (للوجهين) */
  twoPages: boolean;
}

/**
 * الافتراضي = مطابق للمعاينة الحالية بالضبط (كل الطبقات المرئية مفعّلة)؛
 * Registration مفعّل افتراضياً للأوفست ومعطّل للرقمي.
 */
export function defaultPdfOptions(machine: Machine, duplex: boolean): PdfOptions {
  return {
    cropMarks: true,
    bleed: true,
    bands: true,
    groupBounds: true,
    pieceLabels: true,
    registration: machine.kind === 'offset',
    cutContour: false,
    metadata: true,
    twoPages: duplex,
  };
}

// -------------------- ألوان من قيم متغيرات CSS الفعلية (index.css) -----------

type Rgb = [number, number, number];
const INK_900: Rgb = [21, 23, 30]; // --ink-900  #15171E (trim المصمت الداكن)
const INK_700: Rgb = [52, 57, 71]; // --ink-700  #343947 (إطار الورقة)
const INK_400: Rgb = [107, 114, 128]; // --ink-400 #6B7280 (علامات أركان الورقة)
const CYAN_600: Rgb = [2, 132, 199]; // --cyan-600 #0284C7
const CYAN_500: Rgb = [14, 165, 233]; // --cyan-500 #0EA5E9
const PAPER_200: Rgb = [234, 230, 218]; // --paper-200 #EAE6DA (تعبئة hatching الهوامش)
const LINE_STRONG: Rgb = [212, 207, 192]; // --line-strong #D4CFC0
const AMBER_600: Rgb = [217, 119, 6]; // #D97706 (hatching القبضة في المعاينة)
const AMBER_700: Rgb = [180, 83, 9]; // #B45309 (نصوص القبضة في المعاينة)
const MARK_OUTER: Rgb = [17, 24, 39]; // #111827
const MARK_GUILLOTINE: Rgb = [55, 65, 81]; // #374151

function hexRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** محاكاة رسم لون بشفافية alpha فوق خلفية بيضاء */
function tintOnWhite(c: Rgb, alpha: number): Rgb {
  return [
    Math.round(c[0] * alpha + 255 * (1 - alpha)),
    Math.round(c[1] * alpha + 255 * (1 - alpha)),
    Math.round(c[2] * alpha + 255 * (1 - alpha)),
  ];
}

/**
 * hatching بسيط بخطوط مائلة خفيفة داخل مستطيل (تقريب أنماط المعاينة mg-hatch*):
 * تعبئة فاتحة ثم خطوط قطرية ±45° مقصوصة على حدود المستطيل.
 */
function hatchRect(doc: jsPDF, x: number, y: number, w: number, h: number, fill: Rgb, line: Rgb, slope: 1 | -1): void {
  if (w <= 0 || h <= 0) return;
  doc.setFillColor(fill[0], fill[1], fill[2]);
  doc.rect(x, y, w, h, 'F');
  doc.saveGraphicsState();
  doc.rect(x, y, w, h);
  doc.clip();
  doc.discardPath();
  doc.setDrawColor(line[0], line[1], line[2]);
  doc.setLineWidth(0.12);
  const spacing = 2.5;
  for (let k = -h; k <= w; k += spacing) {
    if (slope === 1) doc.line(x + k, y, x + k + h, y + h);
    else doc.line(x + k, y + h, x + k + h, y);
  }
  doc.restoreGraphicsState();
}

/** علامة تسجيل (registration): دائرة + دائرة داخلية + صليب متقاطع */
function registrationMark(doc: jsPDF, cx: number, cy: number, r: number): void {
  doc.setDrawColor(INK_900[0], INK_900[1], INK_900[2]);
  doc.setLineWidth(0.2);
  doc.circle(cx, cy, r, 'S');
  doc.circle(cx, cy, r * 0.35, 'S');
  const arm = r + 1.6;
  doc.line(cx - arm, cy, cx + arm, cy);
  doc.line(cx, cy - arm, cx, cy + arm);
}

/** Build the technical montage PDF (Latin/numbers only for reliability). */
export function buildPdf(input: PdfExportInput, opts: PdfOptions): jsPDF {
  const { state, machine, result, placed } = input;
  const sheetW = result.sheetWidthMm;
  const sheetH = result.sheetHeightMm;
  const doc = new jsPDF({
    unit: 'mm',
    format: [sheetW, sheetH],
    orientation: sheetW >= sheetH ? 'landscape' : 'portrait',
    compress: true,
  });

  const methodLabel = PRINT_METHODS.find((m) => m.id === result.method)?.latin ?? result.method;
  // per-design bleed: each placed piece uses its own design's bleed (linked
  // designs resolve to the shared one); falls back to the shared bleed
  const bleedFor = (groupId: string): BleedBox => {
    const s = state.stickers.find((x) => x.id === groupId);
    return s ? stickerBleed(state, s) : state.bleedShared;
  };
  // verso flip axis: use the engine's own flipAxis (midpoint of the LARGER
  // sheet dimension for bascule, SMALLER for double-pince). 'vertical' axis =
  // left-right mirror ('x'); 'horizontal' = top-bottom mirror ('y'). Falls
  // back to a dimension-aware heuristic only if the engine did not emit one.
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

  const drawFace = (face: 'Recto' | 'Verso') => {
    const flipX = face === 'Verso' && flipAxis === 'x';
    const flipY = face === 'Verso' && flipAxis === 'y';
    const rectOf = (p: PlacedPiece) => ({
      x: flipX ? sheetW - p.x - p.w : p.x,
      y: flipY ? sheetH - p.y - p.h : p.y,
      w: p.w,
      h: p.h,
    });
    const a = result.printableArea;

    // margin bands: نفس طبقات المعاينة — hatching فاتح على كامل الورقة ثم
    // مستطيل أبيض فوق المساحة القابلة للطباعة
    hatchRect(doc, 0, 0, sheetW, sheetH, PAPER_200, LINE_STRONG, 1);
    doc.setFillColor(255, 255, 255);
    doc.rect(a.x, a.y, a.w, a.h, 'F');

    // sheet outline (داخل حدود الصفحة قليلاً — لا يمكن الرسم خارجها)
    doc.setDrawColor(INK_700[0], INK_700[1], INK_700[2]);
    doc.setLineWidth(0.35);
    doc.rect(0.2, 0.2, sheetW - 0.4, sheetH - 0.4, 'S');

    // corner traits de coupe (sheet trim) — تُستبدل بعلامات Registration عند
    // تفعيلها (تتداخل معها في الهوامش الضيقة، والتسجيل أدق للأوفست)
    if (opts.cropMarks && !opts.registration) {
      doc.setDrawColor(INK_400[0], INK_400[1], INK_400[2]);
      doc.setLineWidth(0.2);
      const L = 5;
      const o = 1.5;
      const corners: [number, number, number, number][] = [
        [o, o, 1, 1],
        [sheetW - o, o, -1, 1],
        [o, sheetH - o, 1, -1],
        [sheetW - o, sheetH - o, -1, -1],
      ];
      for (const [x, y, sx, sy] of corners) {
        doc.line(x, y, x + sx * L, y);
        doc.line(x, y, x, y + sy * L);
      }
    }

    // printable area (متقطع سماوي) + تسمية — مثل المعاينة (باللاتينية هنا)
    doc.setDrawColor(CYAN_500[0], CYAN_500[1], CYAN_500[2]);
    doc.setLineWidth(0.25);
    doc.setLineDashPattern([2, 1.5], 0);
    doc.rect(a.x, a.y, a.w, a.h, 'S');
    doc.setLineDashPattern([], 0);
    doc.setTextColor(CYAN_600[0], CYAN_600[1], CYAN_600[2]);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    doc.text('Printable area', a.x + 1.5, a.y + 3);

    // center cross (digital: montage is centered) — مثل المعاينة
    if (opts.bands && machine.kind === 'digital') {
      doc.setDrawColor(CYAN_500[0], CYAN_500[1], CYAN_500[2]);
      doc.setLineWidth(0.1);
      const cx = a.x + a.w / 2;
      const cy = a.y + a.h / 2;
      doc.line(cx - 4, cy, cx + 4, cy);
      doc.line(cx, cy - 4, cx, cy + 4);
    }

    // prise de pince band (offset، غير double-pince) — hatching برتقالي + تسمية
    if (opts.bands && machine.kind !== 'digital' && machine.priseDePince && result.method !== 'double-pince') {
      const m = machine.margins;
      const p = machine.priseDePince;
      const band =
        sheetW >= sheetH
          ? { x: m.left, y: sheetH - m.bottom - p, w: sheetW - m.left - m.right, h: p }
          : { x: sheetW - m.right - p, y: m.top, w: p, h: sheetH - m.top - m.bottom };
      hatchRect(doc, band.x, band.y, band.w, band.h, tintOnWhite(AMBER_600, 0.1), tintOnWhite(AMBER_600, 0.45), 1);
      doc.setTextColor(AMBER_700[0], AMBER_700[1], AMBER_700[2]);
      doc.setFontSize(5);
      doc.text(`Prise de pince ${trimNumber(p)}mm`, band.x + band.w / 2, band.y + band.h / 2 + 1.2, { align: 'center' });
    }

    // forbidden bands (bascule gutter / double-pince grip strips) — من نتيجة
    // المحرك نفسها (مصدر حقيقة واحد)، بـhatching مثل المعاينة + تسمية
    if (opts.bands) {
      const grip = result.method === 'double-pince';
      for (const band of forbiddenBandsOf(result)) {
        if (grip) hatchRect(doc, band.x, band.y, band.w, band.h, tintOnWhite(AMBER_600, 0.1), tintOnWhite(AMBER_600, 0.45), 1);
        else hatchRect(doc, band.x, band.y, band.w, band.h, tintOnWhite(CYAN_600, 0.06), tintOnWhite(CYAN_600, 0.35), -1);
        doc.setTextColor(...(grip ? AMBER_700 : CYAN_600));
        doc.setFontSize(4.5);
        doc.text(
          grip ? `Grip ${trimNumber(result.gripMm ?? state.gripMm ?? 10)}mm` : `${trimNumber(result.gutterMm ?? state.gutterMm)}mm gutter`,
          band.x + band.w / 2,
          band.y + band.h / 2 + 1,
          { align: 'center' },
        );
      }
    }

    // flip axis — light dashed line across the whole sheet
    if (opts.bands && result.flipAxis) {
      doc.setDrawColor(CYAN_600[0], CYAN_600[1], CYAN_600[2]);
      doc.setLineWidth(0.15);
      doc.setLineDashPattern([3, 2.5], 0);
      if (result.flipAxis.axis === 'vertical') doc.line(result.flipAxis.position, 0, result.flipAxis.position, sheetH);
      else doc.line(0, result.flipAxis.position, sheetW, result.flipAxis.position);
      doc.setLineDashPattern([], 0);
    }

    // group bound containers (قص مشترك داخل المجموعة / قص مزدوج بين المجموعات)
    // — نفس مستطيلات المعاينة المتقطعة بألوان المجموعات (تصاميم متعددة فقط)
    if (opts.groupBounds && state.stickers.length > 1) {
      const gb = new Map<string, { x: number; y: number; w: number; h: number; color: Rgb }>();
      for (const p of placed) {
        const r0 = rectOf(p);
        const cur = gb.get(p.groupId);
        if (!cur) gb.set(p.groupId, { ...r0, color: hexRgb(p.color) });
        else {
          const x2 = Math.max(cur.x + cur.w, r0.x + r0.w);
          const y2 = Math.max(cur.y + cur.h, r0.y + r0.h);
          cur.x = Math.min(cur.x, r0.x);
          cur.y = Math.min(cur.y, r0.y);
          cur.w = x2 - cur.x;
          cur.h = y2 - cur.y;
        }
      }
      for (const b of gb.values()) {
        if (state.sharedCut) {
          doc.setDrawColor(b.color[0], b.color[1], b.color[2]);
          doc.setLineWidth(0.3);
          doc.setLineDashPattern([2.6, 1.4], 0);
          doc.roundedRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4, 1, 1, 'S');
        }
        if (state.doubleCut) {
          doc.setDrawColor(b.color[0], b.color[1], b.color[2]);
          doc.setLineWidth(0.2);
          doc.setLineDashPattern([1, 1], 0);
          doc.roundedRect(b.x - 4.5, b.y - 4.5, b.w + 9, b.h + 9, 1, 1, 'S');
        }
        doc.setLineDashPattern([], 0);
      }
    }

    // pieces — تعبئة بلون المجموعة 18% فوق أبيض + trim مصمت داكن + bleed متقطع
    // بلون المجموعة + نص المقاس (تطابق طبقات المعاينة بعد الحزمة 4)
    for (const p of placed) {
      const r0 = rectOf(p);
      const col = hexRgb(p.color);
      // bleed of this piece's design; sides swap after the flip: left/right on
      // a horizontal mirror, top/bottom on a vertical one
      const pb = bleedFor(p.groupId);
      const bleedOf = {
        left: flipX ? pb.right : pb.left,
        right: flipX ? pb.left : pb.right,
        top: flipY ? pb.bottom : pb.top,
        bottom: flipY ? pb.top : pb.bottom,
      };
      // bleed outline — متقطع بلون المجموعة (sides already swapped for the face)
      if (opts.bleed) {
        doc.setDrawColor(col[0], col[1], col[2]);
        doc.setLineWidth(0.35);
        doc.setLineDashPattern([1.6, 1.3], 0);
        doc.rect(
          r0.x - bleedOf.left,
          r0.y - bleedOf.top,
          p.w + bleedOf.left + bleedOf.right,
          p.h + bleedOf.top + bleedOf.bottom,
          'S',
        );
        doc.setLineDashPattern([], 0);
      }
      // body — تعبئة فاتحة + إطار trim مصمت داكن (ink-900) مثل المعاينة
      const fill = tintOnWhite(col, 0.18);
      doc.setFillColor(fill[0], fill[1], fill[2]);
      doc.setDrawColor(INK_900[0], INK_900[1], INK_900[2]);
      doc.setLineWidth(0.35);
      doc.roundedRect(r0.x, r0.y, p.w, p.h, 0.6, 0.6, 'FD');
      // size label
      if (opts.pieceLabels) {
        doc.setTextColor(col[0], col[1], col[2]);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(Math.min(7, p.w / 4));
        doc.text(`${trimNumber(p.w)}x${trimNumber(p.h)}`, r0.x + r0.w / 2, r0.y + r0.h / 2 + 1, { align: 'center' });
      }
    }

    // cut marks — مصدر حقيقة واحد: نفس وحدة cut-marks.ts المستعملة في المعاينة،
    // بحيث يطابق الـPDF الشاشة تماماً. guillotine يعمل بنموذج البلوكات: كل
    // مستطيل ممتلئ لنفس التصميم يحمل علامات قصيرة على محيطه (خطوطه الداخلية +
    // زوايا L عند أركانه) بلا خطوط طويلة، مع قاعدة التماس الديناميكية وتوحيد
    // المواضع المتماثلة بين البلوكات.
    if (opts.cropMarks && placed.length > 0) {
      const facePieces = placed.map((p) => {
        const r0 = rectOf(p);
        const pb = bleedFor(p.groupId);
        return {
          x: r0.x,
          y: r0.y,
          w: p.w,
          h: p.h,
          groupId: p.groupId,
          bleed: {
            left: flipX ? pb.right : pb.left,
            right: flipX ? pb.left : pb.right,
            top: flipY ? pb.bottom : pb.top,
            bottom: flipY ? pb.top : pb.bottom,
          },
        };
      });
      const segments = computeCutMarks(facePieces, {
        cutMethod: state.cutMethod,
        sharedCut: state.sharedCut,
        doubleCut: state.doubleCut,
        area: result.printableArea,
      });
      for (const seg of segments) {
        if (seg.kind === 'guillotine') {
          doc.setDrawColor(MARK_GUILLOTINE[0], MARK_GUILLOTINE[1], MARK_GUILLOTINE[2]);
          doc.setLineWidth(0.15);
        } else if (seg.kind === 'shared') {
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.2);
        } else {
          doc.setDrawColor(MARK_OUTER[0], MARK_OUTER[1], MARK_OUTER[2]);
          doc.setLineWidth(0.2);
        }
        doc.line(seg.x1, seg.y1, seg.x2, seg.y2);
      }
    }

    // Registration marks — دوائر متقاطعة في الزوايا الأربع خارج مساحة الطباعة
    // (في منتصف كل هامش قطرياً؛ تُخطى الزاوية إن كان الهامش أضيق من ~2مم)
    if (opts.registration) {
      const mx = { l: a.x / 2, r: a.x + a.w + (sheetW - a.x - a.w) / 2 };
      const my = { t: a.y / 2, b: a.y + a.h + (sheetH - a.y - a.h) / 2 };
      const corners: [number, number, number][] = [
        [mx.l, my.t, Math.min(a.x, a.y)],
        [mx.r, my.t, Math.min(sheetW - a.x - a.w, a.y)],
        [mx.l, my.b, Math.min(a.x, sheetH - a.y - a.h)],
        [mx.r, my.b, Math.min(sheetW - a.x - a.w, sheetH - a.y - a.h)],
      ];
      for (const [cx, cy, margin] of corners) {
        const r = Math.min(1.8, margin / 2 - 0.9);
        if (r >= 0.8) registrationMark(doc, cx, cy, r);
      }
    }

    // metadata block — placed in the sheet MARGIN (outside the printable
    // area) so it can never overlap pieces; picks the roomier of the
    // top/bottom strips and shrinks to fit. (لاتيني/أرقام — أسلوب التطبيق)
    if (opts.metadata) {
      doc.setTextColor(60, 64, 74);
      doc.setFont('helvetica', 'normal');
      const lines = [
        `ARTeam PrintFlow - Technical Montage (${face})`,
        `Sheet: ${trimNumber(sheetW)} x ${trimNumber(sheetH)} mm | Machine: ${machine.name}`,
        `Method: ${methodLabel} | Pieces/sheet: ${placed.length} | Sheets needed: ${result.sheetsNeeded}`,
        `Waste: ${result.wastePercent}% | Bleed: ${trimNumber(state.bleedShared.top)} mm | Cut: ${state.cutMethod} | Qty: ${state.stickers[0]?.quantity ?? 0} | ${new Date().toISOString().slice(0, 10)}`,
      ];
      const bottomRoom = sheetH - (a.y + a.h);
      const topRoom = a.y;
      const useBottom = bottomRoom >= topRoom;
      const room = Math.max(bottomRoom, topRoom, 8);
      const step = Math.min(3.2, Math.max(1.6, (room - 1.5) / lines.length));
      doc.setFontSize(Math.min(6, Math.max(3.2, step * 1.9)));
      const firstBaseline = useBottom ? a.y + a.h + step : Math.min(a.y - 1, step + 0.8);
      lines.forEach((line, i) => doc.text(line, Math.max(2, a.x), Math.min(sheetH - 0.8, firstBaseline + i * step)));
    }
    // face label
    doc.setTextColor(CYAN_600[0], CYAN_600[1], CYAN_600[2]);
    doc.setFontSize(8);
    doc.text(face, sheetW - 4, 6, { align: 'right' });
  };

  drawFace('Recto');
  if (opts.twoPages && result.facesPerSheet === 2) {
    doc.addPage([sheetW, sheetH], sheetW >= sheetH ? 'landscape' : 'portrait');
    drawFace('Verso');
  }
  // CutContour on its OWN PAGE (not a "layer" jsPDF cannot reliably emit):
  // magenta contour paths only, recto orientation.
  if (opts.cutContour && state.cutMethod !== 'guillotine' && placed.length > 0) {
    doc.addPage([sheetW, sheetH], sheetW >= sheetH ? 'landscape' : 'portrait');
    doc.setDrawColor(INK_900[0], INK_900[1], INK_900[2]);
    doc.setLineWidth(0.4);
    doc.rect(0.2, 0.2, sheetW - 0.4, sheetH - 0.4, 'S');
    doc.setDrawColor(219, 39, 119);
    doc.setLineWidth(0.35);
    doc.setLineDashPattern([2, 1], 0);
    for (const p of placed) {
      doc.roundedRect(p.x + 0.8, p.y + 0.8, p.w - 1.6, p.h - 1.6, 1.2, 1.2, 'S');
    }
    doc.setLineDashPattern([], 0);
    doc.setTextColor(219, 39, 119);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('CutContour - separate page', 4, 6);
  }
  return doc;
}
