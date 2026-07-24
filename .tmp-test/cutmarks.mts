// اختبارات وحدات للوحدة النقية cut-marks.ts (علامات القص / traits de coupe)
// النموذج الحالي لـ guillotine: نموذج البلوكات (مستطيلات ممتلئة لكل تصميم +
// علامات محيط قصيرة + زوايا L + قاعدة التماس الديناميكية + توحيد المواضع).
import {
  computeCutBlocks,
  computeCutMarks,
  CUT_MARK_EPS_MM,
  CUT_MARK_GAP_FROM_BLEED_MM,
  CUT_MARK_LEN_MM,
  CUT_MARK_OFFSET_MM,
  type CutMarkPiece,
  type CutMarkSegment,
} from '../app/src/lib/cut-marks';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;
const AREA = { x: 0, y: 0, w: 300, h: 400 };
const GAP = CUT_MARK_GAP_FROM_BLEED_MM; // 1
const LEN = CUT_MARK_LEN_MM; // 5

/** هل يوجد مقطع آخر على نفس الخط يتداخل مع s؟ (كشف التكرار/الرسم المزدوج) */
function hasDuplicateOnSameLine(segs: CutMarkSegment[]): boolean {
  const eps = CUT_MARK_EPS_MM;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i];
      const b = segs[j];
      const aH = near(a.y1, a.y2, eps);
      const bH = near(b.y1, b.y2, eps);
      if (aH !== bH) continue;
      if (aH) {
        if (!near(a.y1, b.y1, eps)) continue;
        const overlap = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
        if (overlap > eps) return true;
      } else {
        if (!near(a.x1, b.x1, eps)) continue;
        const overlap = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
        if (overlap > eps) return true;
      }
    }
  }
  return false;
}

const isV = (s: CutMarkSegment) => near(s.x1, s.x2);
const isH = (s: CutMarkSegment) => near(s.y1, s.y2);

// ---------------------------------------------------------------------------
// 1) die-cut: قطعتان ملتصقتان (فاصل = 0) → الخط المشترك مرة واحدة بنوع shared
// ---------------------------------------------------------------------------
{
  const pieces: CutMarkPiece[] = [
    { x: 10, y: 10, w: 50, h: 80, groupId: 'a' },
    { x: 60, y: 10, w: 50, h: 80, groupId: 'b' },
  ];
  const segs = computeCutMarks(pieces, { cutMethod: 'die-cut', sharedCut: true, doubleCut: true, area: AREA });
  const junction = segs.filter((s) => near(s.x1, 60) && near(s.x2, 60));
  check('ملتصقتان: خط الوصلة العمودي مرة واحدة أعلى ومرة أسفل', junction.length === 2, `got ${junction.length}`);
  check(
    'ملتصقتان: خطا الوصلة بنوع shared',
    junction.every((s) => s.kind === 'shared'),
    junction.map((s) => s.kind).join(','),
  );
  check('ملتصقتان: لا يوجد أي تكرار هندسي على نفس الخط', !hasDuplicateOnSameLine(segs));
  const topJunction = junction.find((s) => s.y2 <= 10 + CUT_MARK_EPS_MM);
  check(
    'ملتصقتان: الوصلة العلوية تمتد من (y−7) إلى (y−2)',
    !!topJunction && near(topJunction.y1, 10 - CUT_MARK_OFFSET_MM - CUT_MARK_LEN_MM) && near(topJunction.y2, 10 - CUT_MARK_OFFSET_MM),
    topJunction ? `y1=${topJunction.y1} y2=${topJunction.y2}` : 'missing',
  );
}

// ---------------------------------------------------------------------------
// 2) die-cut: قمع العلامات الداخلية (مقطع داخل bleed قطعة أخرى يُحذف)
// ---------------------------------------------------------------------------
{
  const pieces: CutMarkPiece[] = [
    { x: 10, y: 10, w: 50, h: 80, groupId: 'a' },
    { x: 60, y: 10, w: 50, h: 80, groupId: 'b', bleed: { left: 3, right: 3, top: 3, bottom: 3 } },
  ];
  const segs = computeCutMarks(pieces, { cutMethod: 'die-cut', area: AREA });
  const insideBleed = segs.filter((s) => near(s.y1, s.y2) && (near(s.y1, 10) || near(s.y1, 90)) && s.x1 >= 61 && s.x2 <= 68);
  check('قمع: علامات A الأفقية داخل bleed الجار محذوفة', insideBleed.length === 0, `got ${insideBleed.length}`);
  const bleedRect = { x: 57, y: 7, w: 56, h: 86 };
  const trimA = { x: 10, y: 10, w: 50, h: 80 };
  const trimB = { x: 60, y: 10, w: 50, h: 80 };
  const violates = segs.some((s) => {
    const mx = (s.x1 + s.x2) / 2;
    const my = (s.y1 + s.y2) / 2;
    const inR = (r: { x: number; y: number; w: number; h: number }) =>
      mx > r.x + CUT_MARK_EPS_MM && mx < r.x + r.w - CUT_MARK_EPS_MM && my > r.y + CUT_MARK_EPS_MM && my < r.y + r.h - CUT_MARK_EPS_MM;
    return inR(bleedRect) || inR(trimA) || inR(trimB);
  });
  check('قمع: لا مقطع منتصفه داخل trim/bleed قطعة أخرى', !violates);
}

// ---------------------------------------------------------------------------
// 3) نموذج البلوكات: كشف شبكة 2×2 لنفس التصميم = بلوك واحد + علامات المحيط
//    عند الخطوط الداخلية + زوايا L عند الأركان الأربعة
// ---------------------------------------------------------------------------
{
  const pieces: CutMarkPiece[] = [
    { x: 10, y: 10, w: 50, h: 50, groupId: 'g' },
    { x: 60, y: 10, w: 50, h: 50, groupId: 'g' },
    { x: 10, y: 60, w: 50, h: 50, groupId: 'g' },
    { x: 60, y: 60, w: 50, h: 50, groupId: 'g' },
  ];
  const blocks = computeCutBlocks(pieces);
  check('بلوك: شبكة 2×2 لنفس التصميم = بلوك واحد منتظم', blocks.length === 1 && blocks[0].grid && blocks[0].members.length === 4,
    `got ${blocks.length} blocks`);
  check(
    'بلوك: صندوق trim = 10,10 بقياس 100×100 وخط داخلي واحد لكل محور',
    !!blocks[0] &&
      near(blocks[0].trim.x, 10) && near(blocks[0].trim.y, 10) &&
      near(blocks[0].trim.w, 100) && near(blocks[0].trim.h, 100) &&
      blocks[0].xs.length === 1 && near(blocks[0].xs[0], 60) &&
      blocks[0].ys.length === 1 && near(blocks[0].ys[0], 60),
    blocks[0] ? `xs=[${blocks[0].xs}] ys=[${blocks[0].ys}]` : 'none',
  );

  const segs = computeCutMarks(pieces, { cutMethod: 'guillotine', area: AREA });
  const v = segs.filter(isV);
  const h = segs.filter(isH);
  // 6 عمودية: خط داخلي x=60 (أعلى+أسفل) + أركان x=10 وx=110 (أعلى+أسفل لكلٍّ)
  // 6 أفقية: خط داخلي y=60 (يسار+يمين) + أركان y=10 وy=110 (يسار+يمين لكلٍّ)
  check('بلوك: 6 علامات عمودية (خط داخلي + أركان)', v.length === 6, `got ${v.length}`);
  check('بلوك: 6 علامات أفقية (خط داخلي + أركان)', h.length === 6, `got ${h.length}`);
  check('بلوك: كل المقاطع بنوع guillotine', segs.every((s) => s.kind === 'guillotine'));
  check('بلوك: لا تكرار هندسي على نفس الخط', !hasDuplicateOnSameLine(segs));
  const maxLen = Math.max(...segs.map((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1)));
  check('بلوك: لا مقطع أطول من 5مم (يُمنع أي خط طويل)', maxLen <= LEN + CUT_MARK_EPS_MM, `max=${maxLen}`);
  // bleed=0 ← العلامة تبدأ بعد gap=1مم من trim وتمتد 5مم للخارج
  const top = v.filter((s) => s.y2 < 10);
  const bottom = v.filter((s) => s.y1 > 110);
  check(
    'بلوك: 3 علامات عمودية أعلى و3 أسفل عند x∈{10,60,110} بمواضع bleed+gap',
    top.length === 3 && bottom.length === 3 &&
      top.every((s) => near(s.y2, 10 - GAP) && near(s.y1, 10 - GAP - LEN)) &&
      bottom.every((s) => near(s.y1, 110 + GAP) && near(s.y2, 110 + GAP + LEN)) &&
      [10, 60, 110].every((x) => top.some((s) => near(s.x1, x)) && bottom.some((s) => near(s.x1, x))),
    v.map((s) => `(${s.x1},${s.y1}→${s.y2})`).join(' | '),
  );
  const left = h.filter((s) => s.x2 < 10);
  const right = h.filter((s) => s.x1 > 110);
  check(
    'بلوك: 3 علامات أفقية يسار و3 يمين عند y∈{10,60,110} بمواضع bleed+gap',
    left.length === 3 && right.length === 3 &&
      left.every((s) => near(s.x2, 10 - GAP) && near(s.x1, 10 - GAP - LEN)) &&
      right.every((s) => near(s.x1, 110 + GAP) && near(s.x2, 110 + GAP + LEN)) &&
      [10, 60, 110].every((y) => left.some((s) => near(s.y1, y)) && right.some((s) => near(s.y1, y))),
    h.map((s) => `(${s.x1}→${s.x2},${s.y1})`).join(' | '),
  );
  // زوايا L: عند كل ركن مقطعان متعامدان بنفس المقاسات
  const corners: [number, number][] = [[10, 10], [110, 10], [10, 110], [110, 110]];
  check(
    'بلوك: زاوية L (مقطعان) عند كل ركن من الأركان الأربعة',
    corners.every(([cx, cy]) => {
      const hasH = h.some((s) => near(s.y1, cy) && (near(s.x2, cx - GAP) || near(s.x1, cx + GAP)));
      const hasV = v.some((s) => near(s.x1, cx) && (near(s.y2, cy - GAP) || near(s.y1, cy + GAP)));
      return hasH && hasV;
    }),
  );
  // bleed موحّد 3مم ← الإزاحة = bleed(3) + gap(1) = 4مم من trim
  const withBleed = computeCutMarks(
    [{ x: 10, y: 10, w: 50, h: 50, bleed: { top: 3, bottom: 3, left: 3, right: 3 }, groupId: 'g' }],
    { cutMethod: 'guillotine', area: AREA },
  );
  const wbTop = withBleed.find((s) => isV(s) && s.y2 < 10);
  check(
    'بلوك+bleed: العلامة تبدأ بعد bleed+1مم من trim (y2 = 10−4)',
    !!wbTop && near(wbTop.y2, 10 - 3 - GAP) && near(wbTop.y1, 10 - 3 - GAP - LEN),
    wbTop ? `y1=${wbTop.y1} y2=${wbTop.y2}` : 'missing',
  );
  // كتلة غير مستطيلة (L من 3 قطع) ← كل قطعة بلوك 1×1 شاذ
  const lShape = computeCutBlocks([
    { x: 10, y: 10, w: 50, h: 50, groupId: 'g' },
    { x: 60, y: 10, w: 50, h: 50, groupId: 'g' },
    { x: 10, y: 60, w: 50, h: 50, groupId: 'g' },
  ]);
  check('بلوك: كتلة L غير المستطيلة ← 3 بلوكات مفردة شاذة', lShape.length === 3 && lShape.every((b) => !b.grid),
    `got ${lShape.length} grid=[${lShape.map((b) => b.grid)}]`);
}

// ---------------------------------------------------------------------------
// 4) قاعدة التماس الكامل + توحيد المواضع: بلوكان متلاصقان (فاصل = 0)
// ---------------------------------------------------------------------------
{
  const a: CutMarkPiece[] = [
    { x: 10, y: 10, w: 50, h: 50, groupId: 'a' },
    { x: 60, y: 10, w: 50, h: 50, groupId: 'a' },
  ];
  const b: CutMarkPiece[] = [{ x: 110, y: 10, w: 50, h: 50, groupId: 'b' }];
  const segs = computeCutMarks([...a, ...b], { cutMethod: 'guillotine', area: AREA });
  // علامات A الأفقية اليمنى (x>110 عند y=10 وy=60): داخل منطقة تماس B ← تختفي
  const aRightH = segs.filter((s) => isH(s) && s.x1 >= 110 + GAP - CUT_MARK_EPS_MM && s.x1 < 160);
  check('تماس: علامات A الأفقية نحو B المتلاصق تختفي كلياً', aRightH.length === 0, `got ${aRightH.length}`);
  // علامات B الأفقية اليسرى (نحو A) تختفي أيضاً
  const bLeftH = segs.filter((s) => isH(s) && s.x2 <= 110 - GAP + CUT_MARK_EPS_MM && s.x2 > 60);
  check('تماس: علامات B الأفقية نحو A المتلاصق تختفي كلياً', bLeftH.length === 0, `got ${bLeftH.length}`);
  // العلامات العمودية عند x=110 (فوق/تحت — نحو الفراغ): تبقى، ومن البلوكين معاً
  // ← موضع واحد (توحيد): علامتان فقط لا أربع
  const atSeam = segs.filter((s) => isV(s) && near(s.x1, 110));
  check('تماس+توحيد: علامتا x=110 (أعلى+أسفل) مرة واحدة من البلوكين', atSeam.length === 2,
    atSeam.map((s) => `${s.y1}→${s.y2}`).join(' | '));
  check('تماس: لا تكرار هندسي على نفس الخط', !hasDuplicateOnSameLine(segs));
  // باقي علامات A (خطها الداخلي x=60 وأركانها اليسرى) لا تتأثر بالتماس
  const aInternal = segs.filter((s) => isV(s) && near(s.x1, 60));
  check('تماس: خط A الداخلي (x=60) يحتفظ بعلامتيه', aInternal.length === 2, `got ${aInternal.length}`);
}

// ---------------------------------------------------------------------------
// 5) التماس الجزئي: جار يلامس نصف الضلع ← تختفي علامات منطقة اللمس فقط
// ---------------------------------------------------------------------------
{
  const a: CutMarkPiece[] = [
    { x: 10, y: 10, w: 50, h: 50, groupId: 'a' },
    { x: 60, y: 10, w: 50, h: 50, groupId: 'a' },
  ];
  // B يلامس النصف العلوي فقط من ضلع A الأيمن (y من 10 إلى 35)
  const b: CutMarkPiece[] = [{ x: 110, y: 10, w: 50, h: 25, groupId: 'b' }];
  const segs = computeCutMarks([...a, ...b], { cutMethod: 'guillotine', area: AREA });
  // علامة A الأفقية عند الركن العلوي الأيمن (y=10 نحو اليمين، x1=111) ← في منطقة اللمس ← تختفي
  // (علامة B عند ركنها الأيمن x1=161 مشروعة ولا تُعدّ هنا)
  const aTopRightH = segs.filter((s) => isH(s) && near(s.y1, 10) && s.x1 > 110 && s.x1 < 120);
  check('تماس جزئي: علامة A الأفقية في منطقة اللمس (y=10) تختفي', aTopRightH.length === 0, `got ${aTopRightH.length}`);
  // علامة A الأفقية عند الركن السفلي الأيمن (y=60 نحو اليمين) ← خارج منطقة اللمس ← تبقى
  const aBottomRightH = segs.filter((s) => isH(s) && near(s.y1, 60) && s.x1 > 110);
  check(
    'تماس جزئي: علامة A الأفقية خارج منطقة اللمس (y=60) تبقى',
    aBottomRightH.length === 1 && near(aBottomRightH[0].x1, 110 + GAP) && near(aBottomRightH[0].x2, 110 + GAP + LEN),
    aBottomRightH.map((s) => `${s.x1}→${s.x2}`).join(' | '),
  );
}

// ---------------------------------------------------------------------------
// 6) الفصل يعيد الظهور (ديناميكي): نفس البلوكين بفاصل 10مم ← كل العلامات تعود
// ---------------------------------------------------------------------------
{
  const a: CutMarkPiece[] = [
    { x: 10, y: 10, w: 50, h: 50, groupId: 'a' },
    { x: 60, y: 10, w: 50, h: 50, groupId: 'a' },
  ];
  const b: CutMarkPiece[] = [{ x: 120, y: 10, w: 50, h: 50, groupId: 'b' }];
  const segs = computeCutMarks([...a, ...b], { cutMethod: 'guillotine', area: AREA });
  // A: خط داخلي x=60 (2) + أركان V عند x=10,110 (4) = 6 عمودية؛ H أركان 4
  // B: أركان V عند x=120,170 (4)؛ H أركان 4 ← المجموع 18 علامة
  check('فصل: كل علامات البلوكين تظهر عند إبعادهما (18 علامة)', segs.length === 18, `got ${segs.length}`);
  const aRightH = segs.filter((s) => isH(s) && near(s.x1, 110 + GAP));
  check('فصل: علامتا A الأفقيتان اليمنى عادتا', aRightH.length === 2, `got ${aRightH.length}`);
  const bLeftH = segs.filter((s) => isH(s) && near(s.x2, 120 - GAP));
  check('فصل: علامتا B الأفقيتان اليسرى ظهرتا', bLeftH.length === 2, `got ${bLeftH.length}`);
  // في فجوة 10مم (< 2×(gap+len)) تتعايش علامتا البلوكين في الفجوة — النموذج
  // يوحّد المواضع المتماثلة تماماً فقط (قاعدة 5 المعتمدة)
  const inGap = segs.filter((s) => isH(s) && s.x1 >= 111 - CUT_MARK_EPS_MM && s.x2 <= 119 + CUT_MARK_EPS_MM && s.x2 > 110);
  check('فصل: علامتا الفجوة (A اليمنى + B اليسرى) تتعايشان', inGap.length === 4, `got ${inGap.length}`);
}

// ---------------------------------------------------------------------------
// 7) الاستغناء عند حدود منطقة الطباعة: علامة لا تسع كاملة ← تُحذف (لا قصّ مشوَّه)
// ---------------------------------------------------------------------------
{
  const tightArea = { x: 0, y: 0, w: 300, h: 400 };
  const pieces: CutMarkPiece[] = [{ x: 10, y: 1, w: 50, h: 50, groupId: 'a' }];
  const segs = computeCutMarks(pieces, { cutMethod: 'guillotine', area: tightArea });
  const eps = CUT_MARK_EPS_MM;
  const inside = segs.every(
    (s) =>
      Math.min(s.x1, s.x2) >= tightArea.x - eps &&
      Math.max(s.x1, s.x2) <= tightArea.x + tightArea.w + eps &&
      Math.min(s.y1, s.y2) >= tightArea.y - eps &&
      Math.max(s.y1, s.y2) <= tightArea.y + tightArea.h + eps,
  );
  check('استغناء: كل العلامات الباقية داخل منطقة الطباعة كاملةً', inside, segs.map((s) => `(${s.x1},${s.y1})→(${s.x2},${s.y2})`).join(' | '));
  const topMarks = segs.filter((s) => isV(s) && s.y2 <= 1 + eps);
  check('استغناء: العلامات العمودية العلوية المستحيلة حُذفت كلياً', topMarks.length === 0, `got ${topMarks.length}`);
  const bottomMarks = segs.filter((s) => isV(s) && s.y1 > 51);
  check('استغناء: العلامات العمودية السفلية الممكنة بقيت (ركنان)', bottomMarks.length === 2, `got ${bottomMarks.length}`);
}

// ---------------------------------------------------------------------------
// 8) القص عند حدود منطقة الطباعة: لا مقطع يخرج عنها (die-cut + guillotine)
// ---------------------------------------------------------------------------
{
  const tightArea = { x: 20, y: 20, w: 100, h: 100 };
  const pieces: CutMarkPiece[] = [{ x: 20, y: 20, w: 50, h: 50, groupId: 'a' }];
  const segs = computeCutMarks(pieces, { cutMethod: 'die-cut', area: tightArea });
  const eps = CUT_MARK_EPS_MM;
  const inside = segs.every(
    (s) =>
      Math.min(s.x1, s.x2) >= tightArea.x - eps &&
      Math.max(s.x1, s.x2) <= tightArea.x + tightArea.w + eps &&
      Math.min(s.y1, s.y2) >= tightArea.y - eps &&
      Math.max(s.y1, s.y2) <= tightArea.y + tightArea.h + eps,
  );
  check('قص الحدود: كل المقاطع داخل منطقة الطباعة', inside);
  const outside = segs.filter((s) => Math.max(s.x1, s.x2) < tightArea.x - eps || Math.max(s.y1, s.y2) < tightArea.y - eps);
  check('قص الحدود: لا مقطع خارج المنطقة كلياً', outside.length === 0);
  // guillotine مع بلوك يلامس حدود المنطقة ← العلامات الخارجة تُحذف كلياً
  const g = computeCutMarks([{ x: 20, y: 20, w: 50, h: 50, groupId: 'a' }], { cutMethod: 'guillotine', area: tightArea });
  check(
    'guillotine + حدود: العلامات الباقية كاملة داخل منطقة الطباعة',
    g.every(
      (s) =>
        Math.min(s.x1, s.x2) >= tightArea.x - eps &&
        Math.max(s.x1, s.x2) <= tightArea.x + tightArea.w + eps &&
        Math.min(s.y1, s.y2) >= tightArea.y - eps &&
        Math.max(s.y1, s.y2) <= tightArea.y + tightArea.h + eps,
    ),
    g.map((s) => `(${s.x1},${s.y1})→(${s.x2},${s.y2})`).join(' | '),
  );
}

// ---------------------------------------------------------------------------
// 9) معاملات قابلة للتجاوز: markLength / markOffset مخصّصة (die-cut)
// ---------------------------------------------------------------------------
{
  const pieces: CutMarkPiece[] = [{ x: 50, y: 50, w: 40, h: 40, groupId: 'a' }];
  const segs = computeCutMarks(pieces, { cutMethod: 'die-cut', area: AREA, markLength: 8, markOffset: 3 });
  const topLeftH = segs.find((s) => near(s.y1, 50) && s.x2 <= 50);
  check(
    'تجاوز المعاملات: علامة بطول 8 وإزاحة 3',
    !!topLeftH && near(topLeftH.x1, 50 - 3 - 8) && near(topLeftH.x2, 50 - 3),
    topLeftH ? `x1=${topLeftH.x1} x2=${topLeftH.x2}` : 'missing',
  );
}

console.log(failures === 0 ? '\nALL CUTMARKS TESTS PASSED' : `\n${failures} CUTMARKS TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
