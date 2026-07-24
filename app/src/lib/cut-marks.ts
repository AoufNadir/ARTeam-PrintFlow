// ---------------------------------------------------------------------------
// علامات القص (traits de coupe) — وحدة نقية بلا React، مصدر حقيقة واحد
// تستهلكها معاينة SheetCanvas وتصدير PdfExportModal حتى يتطابقا تماماً.
//
// القواعد:
//  1. علامات الزوايا خارج الـ trim فقط (إزاحة markOffset ثم امتداد markLength).
//  2. إلغاء التكرار الهندسي: المقاطع المتماثلة/المتداخلة على نفس الخط تُدمج —
//     الخط المشترك بين قطعتين ملتصقتين (فاصل ≤ CUT_MARK_EPS_MM) يُرسم مرة واحدة
//     بنوع 'shared'.
//  3. قمع العلامات الداخلية: أي مقطع يقع داخل trim أو bleed لقطعة أخرى يُحذف.
//  4. وضع guillotine (نموذج البلوكات الاحترافي): يُمنع أي خط طويل. البلوك =
//     أكبر مستطيل ممتلئ من قطع متجاورة لنفس التصميم (شبكة n×m منتظمة بلا
//     فراغات ولا قطع شاذة؛ ما لم يدخل مستطيلاً ممتلئاً يُعامل بلوكاً مفرداً
//     1×1). كل بلوك يحمل علاماته على محيطه: كل خط قص داخلي ← علامتان قصيرتان
//     (markLength) عند طرفي البلوك، تبدأ بعد gapFromBleed من حافة الـ bleed
//     الخارجية للبلوك وتمتد للخارج فقط، وزاوية L صغيرة عند كل ركن من أركانه
//     الأربعة. قاعدة التماس: لا تُرسم علامة إلا إذا كان كامل امتدادها
//     (الفراغ gap + العلامة) خالياً من trim/bleed أي قطعة أخرى — علامات منطقة
//     اللمس تختفي وحدها وتبقى باقي علامات الضلع، فيكون الاختفاء/الظهور
//     ديناميكياً تلقائياً أثناء السحب اليدوي. الموضع الهندسي نفسه من بلوكين =
//     علامة واحدة (dedupe).
//  5. كل المقاطع تُقصّ عند حدود منطقة الطباعة فلا تخرج عنها (die-cut)، أو
//     تُحذف كلياً إن لم تسع بالكامل (guillotine).
//
// ملاحظة تصميمية: sharedCut / doubleCut تُقبَلان في المدخلات لثبات الواجهة،
// لكن إلغاء التكرار الهندسي هو الحاكم — التصاق حقيقي (فاصل ≈ 0) ينتج خطاً
// مشتركاً واحداً دائماً، سواء كان الالتصاق داخل المجموعة أو بين مجموعتين.
// ---------------------------------------------------------------------------

import type { BleedBox } from './types';

/** طول علامة القص الافتراضي (مم) — قابل للتجاوز عبر options.markLength */
export const CUT_MARK_LEN_MM = 5;
/** إزاحة علامات الزوايا عن حد الـ trim الافتراضية (مم) — die-cut/cutcontour فقط، قابلة للتجاوز عبر options.markOffset */
export const CUT_MARK_OFFSET_MM = 2;
/** الفجوة بين حافة الـ bleed الخارجية للبلوك وبداية علامة الـ guillotine (مم)
 *  — أي الإزاحة = bleed + هذه القيمة من trim؛ قابلة للتجاوز عبر options.gapFromBleed */
export const CUT_MARK_GAP_FROM_BLEED_MM = 1;
/** إبسيلون الالتصاق/الدمج الهندسي (مم) */
export const CUT_MARK_EPS_MM = 0.05;

export type CutMarkMethod = 'guillotine' | 'die-cut' | 'cutcontour';

export type CutMarkKind = 'outer' | 'shared' | 'guillotine';

/** قطعة موضوعة بإطار trim + bleed لكل جهة (فضاء الورقة، مم) */
export interface CutMarkPiece {
  x: number;
  y: number;
  w: number;
  h: number;
  /** bleed لكل جهة؛ يُعامل الغائب كصفر */
  bleed?: Partial<BleedBox>;
  groupId?: string;
}

export interface CutMarkRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** مقطع علامة قص محوري (أفقي أو عمودي) في فضاء الورقة (مم) */
export interface CutMarkSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: CutMarkKind;
}

export interface CutMarkOptions {
  cutMethod: CutMarkMethod;
  /** قص مشترك داخل المجموعة — يُقبل لثبات الواجهة (انظر الملاحظة أعلاه) */
  sharedCut?: boolean;
  /** قص مزدوج بين المجموعات — يُقبل لثبات الواجهة (انظر الملاحظة أعلاه) */
  doubleCut?: boolean;
  /** منطقة الطباعة — كل المقاطع تُقصّ عند حدودها */
  area: CutMarkRect;
  /** طول العلامة (مم)، الافتراضي CUT_MARK_LEN_MM */
  markLength?: number;
  /** إزاحة علامات الزوايا عن trim (مم)، الافتراضي CUT_MARK_OFFSET_MM — die-cut/cutcontour فقط */
  markOffset?: number;
  /** فجوة علامة الـ guillotine عن حافة الـ bleed الخارجية للبلوك (مم)، الافتراضي CUT_MARK_GAP_FROM_BLEED_MM */
  gapFromBleed?: number;
}

// ------------------------------- أدوات داخلية --------------------------------

interface RawSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** فهرس القطعة المنتِجة */
  piece: number;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** نقطة داخل مستطيل بشكل صارم (مع هامش إبسيلون) — الحدود لا تُعدّ داخلاً */
function pointStrictlyInside(px: number, py: number, r: CutMarkRect, eps: number): boolean {
  return px > r.x + eps && px < r.x + r.w - eps && py > r.y + eps && py < r.y + r.h - eps;
}

/** مستطيل الـ bleed الكامل لقطعة = trim موسّع بقيم bleed كل جهة */
function bleedRectOf(p: CutMarkPiece): CutMarkRect {
  const b = p.bleed ?? {};
  const left = b.left ?? 0;
  const right = b.right ?? 0;
  const top = b.top ?? 0;
  const bottom = b.bottom ?? 0;
  return { x: p.x - left, y: p.y - top, w: p.w + left + right, h: p.h + top + bottom };
}

/** هل يقع المقطع (عبر نقاط عيّنة: الطرفان والمنتصف) داخل trim أو bleed قطعة أخرى؟ */
function segmentSuppressed(seg: RawSegment, others: { trim: CutMarkRect; bleed: CutMarkRect }[], eps: number): boolean {
  const mx = (seg.x1 + seg.x2) / 2;
  const my = (seg.y1 + seg.y2) / 2;
  const samples: [number, number][] = [
    [seg.x1, seg.y1],
    [mx, my],
    [seg.x2, seg.y2],
  ];
  return others.some((o) =>
    samples.some(([px, py]) => pointStrictlyInside(px, py, o.trim, eps) || pointStrictlyInside(px, py, o.bleed, eps)),
  );
}

/**
 * إلغاء التكرار الهندسي: تجميع المقاطع حسب (الاتجاه، إحداثي الخط) بكمّ إبسيلون،
 * ثم دمج الفترات المتداخلة/المتلاصقة. المقطع المدمج من قطعتين فأكثر يصبح 'shared'.
 */
function mergeSegments(raws: RawSegment[], eps: number): { seg: CutMarkSegment; contributors: Set<number> }[] {
  const q = (v: number) => Math.round(v / eps);
  interface Group {
    horizontal: boolean;
    line: number; // الإحداثي الثابت (y للأفقي، x للعمودي)
    intervals: { a: number; b: number; pieces: Set<number> }[];
  }
  const groups = new Map<string, Group>();
  for (const r of raws) {
    const horizontal = Math.abs(r.y1 - r.y2) <= eps;
    const line = horizontal ? r.y1 : r.x1;
    const a = horizontal ? Math.min(r.x1, r.x2) : Math.min(r.y1, r.y2);
    const b = horizontal ? Math.max(r.x1, r.x2) : Math.max(r.y1, r.y2);
    const key = `${horizontal ? 'h' : 'v'}:${q(line)}`;
    let g = groups.get(key);
    if (!g) {
      g = { horizontal, line, intervals: [] };
      groups.set(key, g);
    }
    // دمج مع فترة قائمة إن لامستها (تداخل أو التصاق ≤ eps)
    let merged = false;
    for (const iv of g.intervals) {
      if (a <= iv.b + eps && b >= iv.a - eps) {
        iv.a = Math.min(iv.a, a);
        iv.b = Math.max(iv.b, b);
        iv.pieces.add(r.piece);
        merged = true;
        break;
      }
    }
    if (!merged) g.intervals.push({ a, b, pieces: new Set([r.piece]) });
  }
  const out: { seg: CutMarkSegment; contributors: Set<number> }[] = [];
  for (const g of groups.values()) {
    // تمريرة دمج ثانية داخل المجموعة (فترات أصبحت متلاصقة بعد توسّع سابق)
    g.intervals.sort((u, v) => u.a - v.a);
    const stack: { a: number; b: number; pieces: Set<number> }[] = [];
    for (const iv of g.intervals) {
      const last = stack[stack.length - 1];
      if (last && iv.a <= last.b + eps) {
        last.b = Math.max(last.b, iv.b);
        for (const p of iv.pieces) last.pieces.add(p);
      } else {
        stack.push({ ...iv, pieces: new Set(iv.pieces) });
      }
    }
    for (const iv of stack) {
      const seg: CutMarkSegment = g.horizontal
        ? { x1: r3(iv.a), y1: r3(g.line), x2: r3(iv.b), y2: r3(g.line), kind: 'outer' }
        : { x1: r3(g.line), y1: r3(iv.a), x2: r3(g.line), y2: r3(iv.b), kind: 'outer' };
      out.push({ seg, contributors: iv.pieces });
    }
  }
  return out;
}

/** قصّ مقطع محوري عند حدود منطقة الطباعة؛ null إن خرج كلياً */
function clipToArea(seg: CutMarkSegment, area: CutMarkRect, eps: number): CutMarkSegment | null {
  const horizontal = Math.abs(seg.y1 - seg.y2) <= eps;
  if (horizontal) {
    const y = seg.y1;
    if (y < area.y - eps || y > area.y + area.h + eps) return null;
    const a = Math.max(Math.min(seg.x1, seg.x2), area.x);
    const b = Math.min(Math.max(seg.x1, seg.x2), area.x + area.w);
    if (b - a <= eps) return null;
    return { ...seg, x1: r3(a), x2: r3(b) };
  }
  const x = seg.x1;
  if (x < area.x - eps || x > area.x + area.w + eps) return null;
  const a = Math.max(Math.min(seg.y1, seg.y2), area.y);
  const b = Math.min(Math.max(seg.y1, seg.y2), area.y + area.h);
  if (b - a <= eps) return null;
  return { ...seg, y1: r3(a), y2: r3(b) };
}

// ------------------------------- guillotine (نموذج البلوكات) ------------------

/**
 * بلوك قصّ: أكبر مستطيل ممتلئ من قطع متجاورة لنفس التصميم + خطوط قصّه الداخلية.
 * يُصدَّر للمحرك (montage-engine) لقياس «ودّ القص» لمخطط مرشّح.
 */
export interface CutBlock {
  /** فهارس القطع الأعضاء (في مصفوفة الإدخال) */
  members: number[];
  /** صندوق trim الكلي للبلوك */
  trim: CutMarkRect;
  /** صندوق الـ bleed الخارجي للبلوك (اتحاد خلايا الأعضاء) */
  bleed: CutMarkRect;
  /** خطوط القص العمودية الداخلية (إحداثيات x) بكمّ إبسيلون */
  xs: number[];
  /** خطوط القص الأفقية الداخلية (إحداثيات y) بكمّ إبسيلون */
  ys: number[];
  /** true = مستطيل ممتلئ حقيقي (أو قطعة معزولة 1×1 مشروعة)؛
   *  false = قطعة شاذة اضطرّت للخروج من كتلة غير مستطيلة (بلوك 1×1 قسري) */
  grid: boolean;
}

/** تجميع قيم محورية بكمّ إبسيلون ← مواضع خطوط (متوسط كل عنقود) */
function clusterLines(values: number[], eps: number): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const lines: number[] = [];
  let acc = sorted[0];
  let n = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - acc / n <= eps) {
      acc += sorted[i];
      n++;
    } else {
      lines.push(acc / n);
      acc = sorted[i];
      n = 1;
    }
  }
  lines.push(acc / n);
  return lines;
}

/** فهرس الخط المطابق للقيمة ضمن إبسيلون (−1 إن لم يوجد) */
function lineIndexOf(v: number, lines: number[], eps: number): number {
  for (let i = 0; i < lines.length; i++) if (Math.abs(lines[i] - v) <= eps) return i;
  return -1;
}

/**
 * خوارزمية كشف البلوكات (صارمة):
 *  1. تُجمَّع القطع حسب groupId (قطعة بلا groupId = كتلة مستقلة). «الخلية» =
 *     مستطيل الـ bleed الكامل للقطعة (trim موسّعاً بـbleed كل جهة) — التلاصق
 *     bleed-إلى-bleed هو شكل الجوار في التركيب.
 *  2. داخل كل مجموعة تُبنى كتل اتصال (union-find): قطعتان متصلتان إذا تلاصقت
 *     خليتاهما على ضلع فعلي — إسقاط x يتداخل بأكثر من eps مع تلاصق y (أو
 *     العكس). اللمس القطري (ركن-لركن) لا يصل — وإلا اندمجت كتلتان مشروعتان
 *     وخسرتا مستطيليتهما معاً.
 *  3. التحقق من المستطيل الممتلئ المنتظم لكل كتلة اتصال: تُجمَّع حواف الخلايا
 *     إلى خطوط شبكة gx/gy بكمّ إبسيلون، ويُشترط أن
 *     (|gx|−1)·(|gy|−1) = عدد القطع، وأن كل قطعة تغطي خلية شبكة واحدة تماماً
 *     (حواف خليتها تطابق خطين متتاليين في كل محور)، وألا تتقاسم قطعتان الخلية
 *     نفسها. يساوي هذا شبكة n×m منتظمة بلا فراغات ولا قطع شاذة (يشمل القطع
 *     المدوّرة طالما بقيت الخلايا على الشبكة).
 *  4. الكتلة الناجحة = بلوك واحد (grid: true). الكتلة الفاشلة تُفكّك إلى
 *     بلوكات مفردة 1×1 (grid: false — شاذة). القطعة المعزولة أصلاً = بلوك 1×1
 *     مشروع (grid: true).
 * خطوط القص الداخلية للبلوك = حواف trim الفريدة الواقعة بصرامة داخل صندوق trim
 * الكلي (مع bleed > 0 قد يظهر خطان متجاوران عند الوصلة — حافة trim كل قطعة —
 * وهذا متعمَّد ومتسق مع نموذج die-cut).
 */
export function computeCutBlocks(pieces: CutMarkPiece[], eps: number = CUT_MARK_EPS_MM): CutBlock[] {
  const cells = pieces.map(bleedRectOf);

  const makeBlock = (members: number[], grid: boolean): CutBlock => {
    const tx0 = Math.min(...members.map((i) => pieces[i].x));
    const ty0 = Math.min(...members.map((i) => pieces[i].y));
    const tx1 = Math.max(...members.map((i) => pieces[i].x + pieces[i].w));
    const ty1 = Math.max(...members.map((i) => pieces[i].y + pieces[i].h));
    const bx0 = Math.min(...members.map((i) => cells[i].x));
    const by0 = Math.min(...members.map((i) => cells[i].y));
    const bx1 = Math.max(...members.map((i) => cells[i].x + cells[i].w));
    const by1 = Math.max(...members.map((i) => cells[i].y + cells[i].h));
    // خطوط القص الداخلية: حواف trim الفريدة بصرامة داخل صندوق trim الكلي
    const allX = clusterLines(members.flatMap((i) => [pieces[i].x, pieces[i].x + pieces[i].w]), eps);
    const allY = clusterLines(members.flatMap((i) => [pieces[i].y, pieces[i].y + pieces[i].h]), eps);
    return {
      members,
      trim: { x: tx0, y: ty0, w: tx1 - tx0, h: ty1 - ty0 },
      bleed: { x: bx0, y: by0, w: bx1 - bx0, h: by1 - by0 },
      xs: allX.filter((x) => x > tx0 + eps && x < tx1 - eps),
      ys: allY.filter((y) => y > ty0 + eps && y < ty1 - eps),
      grid,
    };
  };

  /** هل تشكّل كتلة الاتصال شبكة n×m منتظمة ممتلئة؟ (التحقق على الخلايا) */
  const isFilledGrid = (members: number[]): boolean => {
    const gx = clusterLines(members.flatMap((i) => [cells[i].x, cells[i].x + cells[i].w]), eps);
    const gy = clusterLines(members.flatMap((i) => [cells[i].y, cells[i].y + cells[i].h]), eps);
    if ((gx.length - 1) * (gy.length - 1) !== members.length) return false;
    const used = new Set<number>();
    for (const i of members) {
      const c0 = lineIndexOf(cells[i].x, gx, eps);
      const c1 = lineIndexOf(cells[i].x + cells[i].w, gx, eps);
      const r0 = lineIndexOf(cells[i].y, gy, eps);
      const r1 = lineIndexOf(cells[i].y + cells[i].h, gy, eps);
      if (c0 < 0 || c1 !== c0 + 1 || r0 < 0 || r1 !== r0 + 1) return false;
      const key = c0 * 4096 + r0;
      if (used.has(key)) return false;
      used.add(key);
    }
    return true;
  };

  // تجميع الفهارس حسب groupId (القطع بلا groupId كتل مستقلة)
  const byGroup = new Map<string, number[]>();
  pieces.forEach((p, i) => {
    const key = p.groupId ?? `__single__${i}`;
    const arr = byGroup.get(key) ?? [];
    arr.push(i);
    byGroup.set(key, arr);
  });

  const blocks: CutBlock[] = [];
  for (const members of byGroup.values()) {
    if (members.length === 1) {
      blocks.push(makeBlock(members, true));
      continue;
    }
    // كتل اتصال عبر تلاصق أضلاع الخلايا (union-find)
    const pos = new Map<number, number>(members.map((m, k) => [m, k]));
    const parent = members.map((_, k) => k);
    const find = (k: number): number => {
      while (parent[k] !== k) {
        parent[k] = parent[parent[k]];
        k = parent[k];
      }
      return k;
    };
    for (let a = 0; a < members.length; a++) {
      for (let b = a + 1; b < members.length; b++) {
        const A = cells[members[a]];
        const B = cells[members[b]];
        const xOverlap = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
        const yOverlap = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
        const xTouch =
          Math.abs(A.x + A.w - B.x) <= eps || Math.abs(B.x + B.w - A.x) <= eps;
        const yTouch =
          Math.abs(A.y + A.h - B.y) <= eps || Math.abs(B.y + B.h - A.y) <= eps;
        if ((xOverlap > eps && yTouch) || (yOverlap > eps && xTouch)) {
          const ra = find(a);
          const rb = find(b);
          if (ra !== rb) parent[ra] = rb;
        }
      }
    }
    const comps = new Map<number, number[]>();
    for (const m of members) {
      const root = find(pos.get(m)!);
      const arr = comps.get(root) ?? [];
      arr.push(m);
      comps.set(root, arr);
    }
    for (const comp of comps.values()) {
      if (comp.length === 1) blocks.push(makeBlock(comp, true));
      else if (isFilledGrid(comp)) blocks.push(makeBlock(comp, true));
      else for (const m of comp) blocks.push(makeBlock([m], false)); // شاذة ← 1×1 قسري
    }
  }
  return blocks;
}

/** هل يقع المقطع كاملاً داخل منطقة الطباعة (بهامش إبسيلون)؟ — شرط بقاء علامة guillotine */
function fullyInsideArea(seg: CutMarkSegment, area: CutMarkRect, eps: number): boolean {
  return (
    Math.min(seg.x1, seg.x2) >= area.x - eps &&
    Math.max(seg.x1, seg.x2) <= area.x + area.w + eps &&
    Math.min(seg.y1, seg.y2) >= area.y - eps &&
    Math.max(seg.y1, seg.y2) <= area.y + area.h + eps
  );
}

/**
 * قاعدة التماس لعلامات guillotine (معتمدة حرفياً): العلامة تختفي إذا لم توجد
 * مساحة فيزيائية كاملة لها — كامل امتدادها (الفراغ gap + العلامة len) خالٍ من
 * trim/bleed أي قطعة أخرى. الفحص «مغلق الحدود» (الملامسة بالحدّ تُعدّ تماساً)
 * على الامتداد المفتوح: نقطة الإرساء على حافة bleed البلوك نفسه تُستثنى (هي
 * ملك البلوك)، وتُعايَّن نقطة المنتصف والطرف البعيد. هكذا تختفي علامات منطقة
 * اللمس وحدها وتبقى باقي علامات الضلع (تماس جزئي)، ويظهر كل شيء مجدداً عند
 * الفصل — ديناميكي تلقائي لأن الحساب من مواقع القطع.
 */
function clearanceSuppressed(anchor: [number, number], far: [number, number], others: { trim: CutMarkRect; bleed: CutMarkRect }[], eps: number): boolean {
  const samples: [number, number][] = [
    [(anchor[0] + far[0]) / 2, (anchor[1] + far[1]) / 2],
    far,
  ];
  const inClosed = (px: number, py: number, r: CutMarkRect) =>
    px >= r.x - eps && px <= r.x + r.w + eps && py >= r.y - eps && py <= r.y + r.h + eps;
  return others.some((o) => samples.some(([px, py]) => inClosed(px, py, o.trim) || inClosed(px, py, o.bleed)));
}

/**
 * علامات guillotine بنموذج البلوكات — لا خطوط طويلة إطلاقاً. كل بلوك (انظر
 * computeCutBlocks) يحمل علاماته على محيطه:
 *  - كل خط قص عمودي داخلي ← علامة أعلى البلوك وأخرى أسفله؛ كل خط أفقي داخلي
 *    ← علامة يمينه ويساره (طول len، تبدأ بعد gap من حافة الـ bleed الخارجية
 *    للبلوك وتمتد للخارج فقط)،
 *  - زاوية L (مقطعان بنفس المقاسات) عند كل ركن من أركان trim الأربعة.
 * قاعدة التماس (clearanceSuppressed): العلامة تُرسم فقط إذا كان كامل امتدادها
 * خالياً من trim/bleed أي قطعة ليست عضواً في البلوك، وواقعة كاملة داخل منطقة
 * الطباعة. توحيد المواضع: الموضع الهندسي نفسه من بلوكين = علامة واحدة.
 */
function guillotineMarks(pieces: CutMarkPiece[], area: CutMarkRect, len: number, gap: number, eps: number): CutMarkSegment[] {
  if (pieces.length === 0) return [];
  const blocks = computeCutBlocks(pieces, eps);
  const rects = pieces.map((p) => ({ trim: { x: p.x, y: p.y, w: p.w, h: p.h }, bleed: bleedRectOf(p) }));

  const out: CutMarkSegment[] = [];
  const seen = new Set<string>();

  /**
   * محاولة إضافة علامة لبلوك: seg = مقطع العلامة نفسه؛ anchor = نقطة بداية
   * الفراغ على حافة الـ bleed الخارجية للبلوك. التحقق يجري على كامل الامتداد
   * anchor→الطرف البعيد (الفراغ gap + العلامة len) ضد القطع غير الأعضاء.
   */
  const tryPush = (block: CutBlock, seg: CutMarkSegment, anchor: [number, number]) => {
    // توحيد المواضع: مفاتيح هندسية مرتّبة الاتجاه (العلامة المكررة = واحدة)
    const vertical = Math.abs(seg.x1 - seg.x2) <= eps;
    const key = vertical
      ? `v:${r3(seg.x1)}:${r3(Math.min(seg.y1, seg.y2))}:${r3(Math.max(seg.y1, seg.y2))}`
      : `h:${r3(seg.y1)}:${r3(Math.min(seg.x1, seg.x2))}:${r3(Math.max(seg.x1, seg.x2))}`;
    if (seen.has(key)) return;
    // القص عند حدود منطقة الطباعة: علامة لا تسع كاملة ← تُحذف (لا رسم مشوَّه)
    if (!fullyInsideArea(seg, area, eps)) return;
    // قاعدة التماس: كامل الامتداد (الفراغ + العلامة) خالٍ من trim/bleed الآخرين
    const farX = vertical ? seg.x1 : Math.abs(seg.x1 - anchor[0]) >= Math.abs(seg.x2 - anchor[0]) ? seg.x1 : seg.x2;
    const farY = vertical ? (Math.abs(seg.y1 - anchor[1]) >= Math.abs(seg.y2 - anchor[1]) ? seg.y1 : seg.y2) : seg.y1;
    const memberSet = new Set(block.members);
    const others = rects.filter((_, j) => !memberSet.has(j));
    if (clearanceSuppressed(anchor, [farX, farY], others, eps)) return;
    seen.add(key);
    out.push(seg);
  };

  for (const block of blocks) {
    const { trim, bleed } = block;
    const bTop = bleed.y;
    const bBottom = bleed.y + bleed.h;
    const bLeft = bleed.x;
    const bRight = bleed.x + bleed.w;

    // خطوط القص العمودية الداخلية ← علامة أعلى البلوك وأخرى أسفله
    for (const x of block.xs) {
      tryPush(block, { x1: x, y1: r3(bTop - gap - len), x2: x, y2: r3(bTop - gap), kind: 'guillotine' }, [x, bTop]);
      tryPush(block, { x1: x, y1: r3(bBottom + gap), x2: x, y2: r3(bBottom + gap + len), kind: 'guillotine' }, [x, bBottom]);
    }
    // خطوط القص الأفقية الداخلية ← علامة يسار البلوك وأخرى يمينه
    for (const y of block.ys) {
      tryPush(block, { x1: r3(bLeft - gap - len), y1: y, x2: r3(bLeft - gap), y2: y, kind: 'guillotine' }, [bLeft, y]);
      tryPush(block, { x1: r3(bRight + gap), y1: y, x2: r3(bRight + gap + len), y2: y, kind: 'guillotine' }, [bRight, y]);
    }
    // زوايا L عند أركان trim الأربعة (مقطعان لكل ركن بنفس المقاسات)
    const tx0 = trim.x;
    const ty0 = trim.y;
    const tx1 = trim.x + trim.w;
    const ty1 = trim.y + trim.h;
    // أعلى-يسار / أعلى-يمين
    tryPush(block, { x1: r3(bLeft - gap - len), y1: ty0, x2: r3(bLeft - gap), y2: ty0, kind: 'guillotine' }, [bLeft, ty0]);
    tryPush(block, { x1: tx0, y1: r3(bTop - gap - len), x2: tx0, y2: r3(bTop - gap), kind: 'guillotine' }, [tx0, bTop]);
    tryPush(block, { x1: r3(bRight + gap), y1: ty0, x2: r3(bRight + gap + len), y2: ty0, kind: 'guillotine' }, [bRight, ty0]);
    tryPush(block, { x1: tx1, y1: r3(bTop - gap - len), x2: tx1, y2: r3(bTop - gap), kind: 'guillotine' }, [tx1, bTop]);
    // أسفل-يسار / أسفل-يمين
    tryPush(block, { x1: r3(bLeft - gap - len), y1: ty1, x2: r3(bLeft - gap), y2: ty1, kind: 'guillotine' }, [bLeft, ty1]);
    tryPush(block, { x1: tx0, y1: r3(bBottom + gap), x2: tx0, y2: r3(bBottom + gap + len), kind: 'guillotine' }, [tx0, bBottom]);
    tryPush(block, { x1: r3(bRight + gap), y1: ty1, x2: r3(bRight + gap + len), y2: ty1, kind: 'guillotine' }, [bRight, ty1]);
    tryPush(block, { x1: tx1, y1: r3(bBottom + gap), x2: tx1, y2: r3(bBottom + gap + len), kind: 'guillotine' }, [tx1, bBottom]);
  }
  return out;
}

// ------------------------------- الواجهة العامة -------------------------------

/**
 * يحسب مقاطع علامات القص من القطع الموضوعة + الإعدادات.
 * die-cut / cutcontour → علامات زوايا L خارج الـ trim (مدمجة ومقموعة داخلياً).
 * guillotine → نموذج البلوكات: كل مستطيل ممتلئ لنفس التصميم يحمل علامات
 * قصيرة على محيطه (خطوطه الداخلية + زوايا L عند أركانه)، بلا أي خطوط طويلة.
 */
export function computeCutMarks(pieces: CutMarkPiece[], opts: CutMarkOptions): CutMarkSegment[] {
  const eps = CUT_MARK_EPS_MM;
  const len = opts.markLength ?? CUT_MARK_LEN_MM;
  const off = opts.markOffset ?? CUT_MARK_OFFSET_MM;

  if (opts.cutMethod === 'guillotine') {
    return guillotineMarks(pieces, opts.area, len, opts.gapFromBleed ?? CUT_MARK_GAP_FROM_BLEED_MM, eps);
  }

  // علامات الزوايا الخام: مقطعان (أفقي + عمودي) لكل ركن، خارج الـ trim فقط
  const raws: RawSegment[] = [];
  pieces.forEach((p, i) => {
    const corners: { cx: number; cy: number; sx: 1 | -1; sy: 1 | -1 }[] = [
      { cx: p.x, cy: p.y, sx: -1, sy: -1 },
      { cx: p.x + p.w, cy: p.y, sx: 1, sy: -1 },
      { cx: p.x, cy: p.y + p.h, sx: -1, sy: 1 },
      { cx: p.x + p.w, cy: p.y + p.h, sx: 1, sy: 1 },
    ];
    for (const c of corners) {
      raws.push({ x1: c.cx + c.sx * off, y1: c.cy, x2: c.cx + c.sx * (off + len), y2: c.cy, piece: i });
      raws.push({ x1: c.cx, y1: c.cy + c.sy * off, x2: c.cx, y2: c.cy + c.sy * (off + len), piece: i });
    }
  });

  // قمع العلامات الداخلية (داخل trim أو bleed قطعة أخرى)
  const blocked = pieces.map((p) => ({ trim: { x: p.x, y: p.y, w: p.w, h: p.h }, bleed: bleedRectOf(p) }));
  const survivors = raws.filter((r) => {
    const others = blocked.filter((_, j) => j !== r.piece);
    return !segmentSuppressed(r, others, eps);
  });

  // إلغاء التكرار الهندسي + تصنيف shared/outer ثم القص عند منطقة الطباعة
  const out: CutMarkSegment[] = [];
  for (const { seg, contributors } of mergeSegments(survivors, eps)) {
    const kind: CutMarkKind = contributors.size >= 2 ? 'shared' : 'outer';
    const clipped = clipToArea({ ...seg, kind }, opts.area, eps);
    if (clipped) out.push(clipped);
  }
  return out;
}
