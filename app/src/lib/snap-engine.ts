// ---------------------------------------------------------------------------
// محرك الالتصاق (Smart Guides بأسلوب Illustrator) — وحدة نقية بلا React.
//
// المدخل: المستطيلات المتحركة (بعد الإزاحة المقترحة)، المستطيلات الثابتة،
// حواف مرجعية إضافية (منطقة الطباعة، محور القلب، حواف الأشرطة)، عتبة الالتصاق.
// المنطق: مرشحات المحاذاة لكل محور على حدة — حواف كل قطعة متحركة
// (يسار/وسط/يمين، أعلى/وسط/أسفل) مقابل حواف ومراكز كل مستطيل ثابت والمراجع؛
// يُختار أقرب مرشح ضمن العتبة لكل محور مستقلاً (محاذاة الأركان = snap to point
// تتحقق تلقائياً عندما يلتصق المحوران معاً).
// المخرج: تصحيح {dx, dy} يُضاف للإزاحة المقترحة + خطوط إرشاد فعالة + قياسات
// المسافات الحية لأقرب جار في كل اتجاه ولحواف منطقة الطباعة.
// ---------------------------------------------------------------------------

/** عتبة الالتصاق الافتراضية (مم) — قابلة للتجاوز */
export const SNAP_THRESHOLD_MM = 2;

export interface SnapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** خط إرشاد فعال: محور + موضع + امتداد بطول القطعتين المتجاورتين */
export interface SnapGuide {
  axis: 'v' | 'h';
  /** الموضع الثابت للخط (x للعمودي، y للأفقي) */
  pos: number;
  /** بداية ونهاية الخط على المحور العمودي عليه */
  from: number;
  to: number;
}

/** قياس مسافة حي: from→to على المحور axis، القيمة mm، وat موضع التسمية على المحور العمودي */
export interface SnapMeasure {
  axis: 'v' | 'h';
  from: number;
  to: number;
  mm: number;
  at: number;
}

export interface SnapOutcome {
  /** تصحيح الالتصاق (مم) يُضاف للإزاحة المقترحة — صفر عند عدم الالتصاق */
  dx: number;
  dy: number;
  snappedX: boolean;
  snappedY: boolean;
  guides: SnapGuide[];
  measures: SnapMeasure[];
}

export interface SnapContext {
  /** حواف مرجعية عمودية (x): منطقة الطباعة، محور القلب العمودي، حواف الأشرطة */
  refsV?: number[];
  /** حواف مرجعية أفقية (y) */
  refsH?: number[];
  /** منطقة الطباعة — لقياسات المسافة حتى حوافها */
  area?: SnapRect;
}

interface Candidate {
  delta: number;
  /** Lower wins: physical edge contact, aligned anchors, then generic refs. */
  priority: number;
  /** Distance between the two ranges on the perpendicular axis. */
  perpendicularGap: number;
  /** موضع خط الإرشاد (= موضع الهدف) */
  pos: number;
  /** امتداد القطعة المتحركة على المحور العمودي */
  mFrom: number;
  mTo: number;
  /** امتداد المستطيل الثابت الهدف (null لخط مرجعي) */
  sFrom: number | null;
  sTo: number | null;
}

const EPS = 1e-6;

/** يختار أقرب مرشح التصاق لمحور واحد (حواف + مراكز القطع المتحركة × الثابتة + المراجع) */
function bestCandidate(
  moving: SnapRect[],
  statics: SnapRect[],
  refs: number[],
  threshold: number,
  axis: 'x' | 'y',
): Candidate | null {
  let best: Candidate | null = null;
  const consider = (cand: Candidate) => {
    if (Math.abs(cand.delta) > threshold + EPS) return;
    if (
      !best ||
      cand.priority < best.priority ||
      (cand.priority === best.priority &&
        (Math.abs(cand.delta) < Math.abs(best.delta) - EPS ||
          (Math.abs(Math.abs(cand.delta) - Math.abs(best.delta)) <= EPS &&
            cand.perpendicularGap < best.perpendicularGap)))
    ) {
      best = cand;
    }
  };
  const intervalGap = (a1: number, a2: number, b1: number, b2: number) =>
    Math.max(0, Math.max(a1, b1) - Math.min(a2, b2));

  for (const m of moving) {
    const mEdges =
      axis === 'x'
        ? ([m.x, m.x + m.w / 2, m.x + m.w] as const)
        : ([m.y, m.y + m.h / 2, m.y + m.h] as const);
    const mFrom = axis === 'x' ? m.y : m.x;
    const mTo = axis === 'x' ? m.y + m.h : m.x + m.w;
    for (const s of statics) {
      const sEdges =
        axis === 'x'
          ? ([s.x, s.x + s.w / 2, s.x + s.w] as const)
          : ([s.y, s.y + s.h / 2, s.y + s.h] as const);
      const sFrom = axis === 'x' ? s.y : s.x;
      const sTo = axis === 'x' ? s.y + s.h : s.x + s.w;
      const perpendicularGap = intervalGap(mFrom, mTo, sFrom, sTo);

      // Illustrator-like "attach beside": opposite outer edges have priority
      // whenever the rectangles overlap (or nearly overlap) perpendicularly.
      if (perpendicularGap <= threshold * 1.5 + EPS) {
        consider({
          delta: sEdges[0] - mEdges[2],
          priority: 0,
          perpendicularGap,
          pos: sEdges[0],
          mFrom,
          mTo,
          sFrom,
          sTo,
        });
        consider({
          delta: sEdges[2] - mEdges[0],
          priority: 0,
          perpendicularGap,
          pos: sEdges[2],
          mFrom,
          mTo,
          sFrom,
          sTo,
        });
      }

      // Anchor alignment: start↔start, center↔center, end↔end. Avoid the old
      // every-edge-to-every-edge matrix, which could snap a left edge to an
      // unrelated centre and made the piece jump unpredictably.
      for (let edge = 0; edge < 3; edge += 1) {
        consider({
          delta: sEdges[edge] - mEdges[edge],
          priority: 1,
          perpendicularGap,
          pos: sEdges[edge],
          mFrom,
          mTo,
          sFrom,
          sTo,
        });
      }
    }
    for (const r of refs) {
      for (const me of mEdges) {
        consider({
          delta: r - me,
          priority: 2,
          perpendicularGap: 0,
          pos: r,
          mFrom,
          mTo,
          sFrom: null,
          sTo: null,
        });
      }
    }
  }
  return best;
}

/**
 * يحسب الالتصاق لمجموعة مستطيلات تتحرك كوحدة صلبة (إزاحة مشتركة).
 * `moving` = مواقع ما بعد الإزاحة المقترحة؛ الناتج dx/dy يُضافان لتلك الإزاحة.
 */
export function computeSnap(
  moving: SnapRect[],
  statics: SnapRect[],
  ctx: SnapContext = {},
  threshold: number = SNAP_THRESHOLD_MM,
): SnapOutcome {
  const guides: SnapGuide[] = [];
  let dx = 0;
  let dy = 0;
  let snappedX = false;
  let snappedY = false;

  const cx = bestCandidate(moving, statics, ctx.refsV ?? [], threshold, 'x');
  if (cx) {
    dx = cx.delta;
    // الالتصاق يُحسب فقط عندما يصحّح الموضع فعلاً (محاذاة تامة قائمة = إرشاد بلا التصاق)
    snappedX = Math.abs(dx) > EPS;
    guides.push({
      axis: 'v',
      pos: cx.pos,
      from: Math.min(cx.mFrom, cx.sFrom ?? cx.mFrom),
      to: Math.max(cx.mTo, cx.sTo ?? cx.mTo),
    });
  }
  const cy = bestCandidate(moving, statics, ctx.refsH ?? [], threshold, 'y');
  if (cy) {
    dy = cy.delta;
    snappedY = Math.abs(dy) > EPS;
    guides.push({
      axis: 'h',
      pos: cy.pos,
      from: Math.min(cy.mFrom, cy.sFrom ?? cy.mFrom),
      to: Math.max(cy.mTo, cy.sTo ?? cy.mTo),
    });
  }

  // قياسات المسافات الحية — على صندوق التحريك بعد التصحيح
  const measures: SnapMeasure[] = [];
  if (moving.length > 0) {
    const bx1 = Math.min(...moving.map((r) => r.x)) + dx;
    const by1 = Math.min(...moving.map((r) => r.y)) + dy;
    const bx2 = Math.max(...moving.map((r) => r.x + r.w)) + dx;
    const by2 = Math.max(...moving.map((r) => r.y + r.h)) + dy;
    const eps = 0.05;
    const pushIf = (m: SnapMeasure | null) => {
      if (m && m.mm > eps) measures.push(m);
    };
    // أقرب جار في كل اتجاه (بتداخل على المحور العمودي)
    let best: { gap: number; from: number; at: number } | null = null;
    for (const s of statics) {
      const ov1 = Math.max(by1, s.y);
      const ov2 = Math.min(by2, s.y + s.h);
      if (ov2 - ov1 <= eps) continue;
      if (s.x + s.w <= bx1 + eps) {
        const gap = bx1 - (s.x + s.w);
        if (!best || gap < best.gap) best = { gap, from: s.x + s.w, at: (ov1 + ov2) / 2 };
      }
    }
    pushIf(best ? { axis: 'h', from: best.from, to: bx1, mm: bx1 - best.from, at: best.at } : null);

    best = null;
    for (const s of statics) {
      const ov1 = Math.max(by1, s.y);
      const ov2 = Math.min(by2, s.y + s.h);
      if (ov2 - ov1 <= eps) continue;
      if (s.x >= bx2 - eps) {
        const gap = s.x - bx2;
        if (!best || gap < best.gap) best = { gap, from: s.x, at: (ov1 + ov2) / 2 };
      }
    }
    pushIf(best ? { axis: 'h', from: bx2, to: best.from, mm: best.from - bx2, at: best.at } : null);

    best = null;
    for (const s of statics) {
      const ov1 = Math.max(bx1, s.x);
      const ov2 = Math.min(bx2, s.x + s.w);
      if (ov2 - ov1 <= eps) continue;
      if (s.y + s.h <= by1 + eps) {
        const gap = by1 - (s.y + s.h);
        if (!best || gap < best.gap) best = { gap, from: s.y + s.h, at: (ov1 + ov2) / 2 };
      }
    }
    pushIf(best ? { axis: 'v', from: best.from, to: by1, mm: by1 - best.from, at: best.at } : null);

    best = null;
    for (const s of statics) {
      const ov1 = Math.max(bx1, s.x);
      const ov2 = Math.min(bx2, s.x + s.w);
      if (ov2 - ov1 <= eps) continue;
      if (s.y >= by2 - eps) {
        const gap = s.y - by2;
        if (!best || gap < best.gap) best = { gap, from: s.y, at: (ov1 + ov2) / 2 };
      }
    }
    pushIf(best ? { axis: 'v', from: by2, to: best.from, mm: best.from - by2, at: best.at } : null);

    // قياسات حتى حواف منطقة الطباعة
    if (ctx.area) {
      const a = ctx.area;
      const midX = (by1 + by2) / 2;
      const midY = (bx1 + bx2) / 2;
      pushIf({ axis: 'h', from: a.x, to: bx1, mm: bx1 - a.x, at: midX });
      pushIf({ axis: 'h', from: bx2, to: a.x + a.w, mm: a.x + a.w - bx2, at: midX });
      pushIf({ axis: 'v', from: a.y, to: by1, mm: by1 - a.y, at: midY });
      pushIf({ axis: 'v', from: by2, to: a.y + a.h, mm: a.y + a.h - by2, at: midY });
    }
  }

  return { dx, dy, snappedX, snappedY, guides, measures };
}
