"use strict";
// ---------------------------------------------------------------------------
// Smart imposition (مونتاج) engine.
// Pure & deterministic. All coordinates in mm, sheet origin at top-left.
//
// Supports:
//  - single piece OR multi-sticker groups (each group = one sticker size,
//    pieces of a group share groupId + color); each group may carry its own
//    bleed (StickerGroup.bleedMm) overriding the global MontageInput.bleedMm
//  - bleed per side (top/bottom/left/right)
//  - print methods: recto | recto-verso | bascule (work & turn) |
//    double-pince (work & tumble)
//
// Flip rule (print-shop spec) — for BOTH bascule and double-pince the flip
// axis is ALWAYS the midpoint of the SMALLER sheet dimension (the physical
// sheet, not the printable area):
//  - width smaller (or tie)  → vertical axis at x = sheetW/2, verso mirrored
//    horizontally: x' = sheetW − x − w
//  - height smaller          → horizontal axis at y = sheetH/2, verso mirrored
//    vertically:   y' = sheetH − y − h
//
//  - bascule: central gutter on the axis, default 10mm, accepted as-is (≥ 0,
//    no engine-side minimum). Each half = (smaller dim − gutter) / 2.
//  - double-pince: NO central gutter (gutterMm ignored). Instead a grip strip
//    (MontageInput.gripMm, default 10mm) at EACH end of the smaller dimension,
//    REPLACING the machine margin on those two sides only (never additive).
//    The larger dimension keeps the normal machine margins (+ prise de pince
//    as before).
//
//  - machine constraints: digital (non-printable margins, layout centered in
//    printable area) & offset (prise de pince strip on the LARGEST edge)
//  - both rotations tried per group; layout maximizes pieces/sheet and
//    minimizes waste; alternatives = other sheet sizes ranked.
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.DOUBLE_PINCE_GRIP_MM = exports.BASCULE_MIN_GUTTER_MM = void 0;
exports.flipAxisOf = flipAxisOf;
exports.printableAreaForMethod = printableAreaForMethod;
exports.halfWorkArea = halfWorkArea;
exports.pairGapKey = pairGapKey;
exports.printableArea = printableArea;
exports.cutScoreOf = cutScoreOf;
exports.assertCutPattern = assertCutPattern;
exports.gravityCompact = gravityCompact;
exports.gutterBandOf = gutterBandOf;
exports.forbiddenBandsOf = forbiddenBandsOf;
exports.evaluateMontage = evaluateMontage;
exports.computeMontage = computeMontage;
exports.computeFixedMontage = computeFixedMontage;
exports.bestSheet = bestSheet;
exports.computeMontageVariants = computeMontageVariants;
const catalog_1 = require("./catalog");
const cut_marks_1 = require("./cut-marks");
/** Bascule central gutter: UI default (the engine itself accepts any gutter ≥ 0). */
exports.BASCULE_MIN_GUTTER_MM = 10;
/** Double-pince: default grip strip width at each end of the smaller sheet dimension (overridable via MontageInput.gripMm). */
exports.DOUBLE_PINCE_GRIP_MM = 10;
/**
 * The flip axis of a halved layout, on the PHYSICAL sheet (never the
 * printable area):
 *  - bascule (work-and-turn) → midpoint of the LARGER sheet dimension: the
 *    sheet is flipped sideways around that axis (same gripper edge) and cut
 *    along it — user spec: 35×50 → 35 × (50/2 − gutter).
 *  - double-pince (work-and-tumble) → midpoint of the SMALLER sheet
 *    dimension: the grip strips sit at the two ends of that dimension.
 */
function flipAxisOf(sheetW, sheetH, method) {
    const splitWidth = method === 'bascule' ? sheetW >= sheetH : sheetW <= sheetH;
    if (splitWidth)
        return { axis: 'vertical', position: sheetW / 2, split: 'width' };
    return { axis: 'horizontal', position: sheetH / 2, split: 'height' };
}
function intersectRects(a, b) {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w);
    const y2 = Math.min(a.y + a.h, b.y + b.h);
    return { x, y, w: Math.max(0, x2 - x), h: Math.max(0, y2 - y) };
}
/**
 * Printable rect adjusted for the print method. Identical to printableArea()
 * except for double-pince: the two ends of the SMALLER sheet dimension get a
 * grip strip (`gripMm`, default DOUBLE_PINCE_GRIP_MM) that REPLACES the
 * machine margin there (never added on top of it — the larger of the two
 * wins). The larger dimension keeps the normal margins (+ prise de pince on
 * the largest edge, as computed by printableArea()).
 */
function printableAreaForMethod(sheetW, sheetH, machine, method, gripMm) {
    const base = printableArea(sheetW, sheetH, machine);
    if (method !== 'double-pince')
        return base;
    const flip = flipAxisOf(sheetW, sheetH, method);
    const grip = Math.max(0, gripMm ?? exports.DOUBLE_PINCE_GRIP_MM);
    // grip replaces whatever the base margin is on those two ends — digital:
    // the machine margin; offset: zero (نموذج الأوفست — كامل الورقة صالحة)
    if (flip.split === 'width') {
        const left = Math.max(grip, base.x);
        const right = Math.max(grip, sheetW - (base.x + base.w));
        return { x: left, y: base.y, w: Math.max(0, sheetW - left - right), h: base.h };
    }
    const top = Math.max(grip, base.y);
    const bottom = Math.max(grip, sheetH - (base.y + base.h));
    return { x: base.x, y: top, w: base.w, h: Math.max(0, sheetH - top - bottom) };
}
/**
 * Area available to the "primary" half of a halved layout (bascule /
 * double-pince), in sheet space. It is the intersection of:
 *  1. the method-adjusted printable area,
 *  2. the primary half-strip of the sheet: [0, S/2 − gutter] on the SPLIT
 *     dimension S — the LARGER dimension for bascule (user model: 35×50 →
 *     35 × (50/2 − gutter)), the smaller one for double-pince. The gutter is
 *     taken IN FULL from each half, so the central gap totals 2 × gutter
 *     (gutter = 0 for double-pince),
 *  3. the mirror image of the printable area across the flip axis — so the
 *     mirrored copy of the block can never leave the printable area even when
 *     machine margins are asymmetric around the sheet axis.
 * For recto / recto-verso it returns the full printable area unchanged.
 */
function halfWorkArea(sheetW, sheetH, machine, method, gutterMm, gripMm) {
    const full = printableAreaForMethod(sheetW, sheetH, machine, method, gripMm);
    if (method !== 'bascule' && method !== 'double-pince')
        return full;
    const flip = flipAxisOf(sheetW, sheetH, method);
    // gutter accepted as-is (≥ 0) — no engine-side minimum since the field
    // validation: smaller gutters are physically printable on modern presses
    const gutter = method === 'bascule' ? Math.max(0, gutterMm) : 0;
    // نموذج المستخدم: المساحة الوسطية تُخصم كاملة من كل نصف ((القياس الأكبر)/2 − المساحة)،
    // فتكون الفجوة الكلية حول محور القلب = 2 × gutter (axis ± gutter)
    const halfLen = flip.split === 'width' ? sheetW / 2 - gutter : sheetH / 2 - gutter;
    const strip = flip.split === 'width'
        ? { x: 0, y: 0, w: halfLen, h: sheetH }
        : { x: 0, y: 0, w: sheetW, h: halfLen };
    const mirroredFull = flip.split === 'width'
        ? { x: sheetW - (full.x + full.w), y: full.y, w: full.w, h: full.h }
        : { x: full.x, y: sheetH - (full.y + full.h), w: full.w, h: full.h };
    return intersectRects(intersectRects(full, strip), mirroredFull);
}
// ---------------------------------------------------------------------------
// Multi-level spacing (فواصل): a gap is EXTRA AIR above bleed-box touching —
// gap 0 = legacy behavior (adjacent cells touch bleed-to-bleed). Priority:
// pair gap (pairGaps) > intra gap (same group) > default gap. All packers
// treat the resolved gap as a HARD constraint (never violated; small waste is
// accepted). Resolving to zeros everywhere reproduces the legacy layout
// formulas EXACTLY (floor((W+0)/(c+0)) = floor(W/c)).
// ---------------------------------------------------------------------------
/** Canonical key of a group pair: ids sorted alphabetically, joined with '|'. */
function pairGapKey(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}
/** Zero-gap resolver — bit-identical to the legacy behavior. */
const ZERO_GAP = () => 0;
/** Build the gap resolver for one computation (pair > intra > default, all clamped ≥ 0). */
function makeGapResolver(groups, defaultGapMm, pairGaps) {
    const d = Math.max(0, defaultGapMm ?? 0);
    const intra = new Map();
    for (const g of groups) {
        if (g.intraGapMm !== undefined && Number.isFinite(g.intraGapMm))
            intra.set(g.id, Math.max(0, g.intraGapMm));
    }
    const pairs = pairGaps ?? {};
    return (a, b) => (a === b ? Math.max(0, intra.get(a) ?? d) : Math.max(0, pairs[pairGapKey(a, b)] ?? d));
}
function normalizeGroups(input) {
    const raw = input.groups && input.groups.length > 0
        ? input.groups
        : [
            {
                id: 'g1',
                widthMm: input.pieceWidthMm ?? 0,
                heightMm: input.pieceHeightMm ?? 0,
                quantity: input.quantity,
            },
        ];
    return raw
        .filter((g) => g.widthMm > 0 && g.heightMm > 0 && g.quantity > 0)
        .map((g, i) => {
        // per-group bleed overrides the global one (full backward compatibility)
        const bleed = g.bleedMm ?? input.bleedMm;
        return {
            id: g.id,
            w: g.widthMm,
            h: g.heightMm,
            cellW: g.widthMm + bleed.left + bleed.right,
            cellH: g.heightMm + bleed.top + bleed.bottom,
            bleed,
            quantity: g.quantity,
            color: g.color ?? catalog_1.GROUP_COLORS[i % catalog_1.GROUP_COLORS.length],
            rotated: false,
            intraGapMm: g.intraGapMm,
        };
    });
}
/** Printable rect for a machine on a given sheet (mm, sheet space). */
function printableArea(sheetW, sheetH, machine) {
    if (!machine)
        return { x: 0, y: 0, w: sheetW, h: sheetH };
    // نموذج الأوفست: هوامش الماكينة الأربعة = صفر في حساب المساحة — كامل الورقة
    // صالح للطباعة؛ المنطقة الممنوعة الوحيدة هي شريط المسكة (prise de pince)
    // على الحافة الأكبر: أسفل ورقة العمل الأفقية (المطبَّعة)، أو يمينها إن
    // مرّر مدخل عمودي (حماية للمستدعين الخارجيين خارج تطبيع الواجهة).
    if (machine.kind === 'offset') {
        const pince = machine.priseDePince ?? 0;
        if (sheetW >= sheetH)
            return { x: 0, y: 0, w: sheetW, h: Math.max(0, sheetH - pince) };
        return { x: 0, y: 0, w: Math.max(0, sheetW - pince), h: sheetH };
    }
    const m = machine.margins;
    const top = m.top;
    const bottom = m.bottom;
    const left = m.left;
    const right = m.right;
    const x = left;
    const y = top;
    return {
        x,
        y,
        w: Math.max(0, sheetW - left - right),
        h: Math.max(0, sheetH - top - bottom),
    };
}
/**
 * Shelf-pack groups into an area. Tries per-group rotation (whichever
 * orientation yields more columns) and packs groups largest-first.
 * Returns placements (area-local coords) + placed count per group.
 */
function shelfPack(areaW, areaH, groups, gap = ZERO_GAP) {
    const pieces = [];
    const perGroup = new Map();
    let usedArea = 0;
    let cursorY = 0;
    let prevBandId = null;
    const ordered = [...groups].sort((a, b) => b.cellW * b.cellH - a.cellW * a.cellH);
    const totalQty = ordered.reduce((s, g) => s + g.quantity, 0);
    for (let gi = 0; gi < ordered.length; gi++) {
        const g = ordered[gi];
        // intra gap of this band: the pitch between its own copies
        const g0 = gap(g.id, g.id);
        // pair gap between this band and the band directly above it
        if (prevBandId !== null)
            cursorY += gap(prevBandId, g.id);
        if (cursorY >= areaH)
            break;
        // vertical band allotted to this group: proportional to its quantity share;
        // the last group (and single-group sheets) takes all the remaining area.
        const isLast = gi === ordered.length - 1;
        const allotted = isLast ? areaH - cursorY : Math.min(areaH - cursorY, (areaH * g.quantity) / totalQty);
        if (allotted <= 0)
            break;
        // choose rotation that maximizes pieces inside the allotted band
        const fits = (cw, ch) => cw <= areaW && ch <= allotted;
        // n cells of pitch (cell+g0) occupy n*(cell+g0) − g0 → count = floor((span+g0)/(cell+g0))
        const countIn = (cw, ch) => fits(cw, ch) ? Math.floor((areaW + g0) / (cw + g0)) * Math.floor((allotted + g0) / (ch + g0)) : 0;
        const normal = countIn(g.cellW, g.cellH);
        const rotW = g.cellH;
        const rotH = g.cellW;
        const rotated = countIn(rotW, rotH);
        let cellW = g.cellW;
        let cellH = g.cellH;
        let rot = false;
        if (rotated > normal) {
            cellW = rotW;
            cellH = rotH;
            rot = true;
        }
        if (cellW > areaW || cursorY + cellH > areaH)
            continue;
        const cols = Math.floor((areaW + g0) / (cellW + g0));
        const rows = Math.floor((allotted + g0) / (cellH + g0));
        if (rows <= 0)
            continue;
        const count = cols * rows;
        const cellTrimW = rot ? g.h : g.w;
        const cellTrimH = rot ? g.w : g.h;
        const bleedX = (cellW - cellTrimW) / 2;
        const bleedY = (cellH - cellTrimH) / 2;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                pieces.push({
                    x: c * (cellW + g0) + bleedX,
                    y: cursorY + r * (cellH + g0) + bleedY,
                    w: cellTrimW,
                    h: cellTrimH,
                    groupId: g.id,
                    color: g.color,
                    rotated: rot,
                    // the trim rect is centered inside its cell → symmetric bleed halves
                    bleed: { left: bleedX, right: bleedX, top: bleedY, bottom: bleedY },
                });
            }
        }
        perGroup.set(g.id, count);
        usedArea += count * g.w * g.h;
        // band height = rows pitches minus the trailing intra gap
        cursorY += rows * (cellH + g0) - g0;
        prevBandId = g.id;
    }
    return { pieces, perGroup, usedArea };
}
/**
 * Mirror the primary-half layout across the flip axis — an ABSOLUTE axis in
 * sheet space (always the midpoint of the smaller sheet dimension, see
 * flipAxisOf). Reflection: x' = 2·position − x − w (vertical axis) or
 * y' = 2·position − y − h (horizontal axis), i.e. exactly
 * x' = sheetW − x − w / y' = sheetH − y − h from the spec.
 */
function mirrorPieces(pieces, axis, position) {
    return pieces.map((p) => {
        if (axis === 'vertical') {
            // physical mirroring swaps the bleed sides facing the axis
            const bleed = p.bleed ? { ...p.bleed, left: p.bleed.right, right: p.bleed.left } : undefined;
            return { ...p, x: 2 * position - p.x - p.w, ...(bleed ? { bleed } : {}) };
        }
        const bleed = p.bleed ? { ...p.bleed, top: p.bleed.bottom, bottom: p.bleed.top } : undefined;
        return { ...p, y: 2 * position - p.y - p.h, ...(bleed ? { bleed } : {}) };
    });
}
// ---------------------------------------------------------------------------
// MaxRects free-rectangle packer (ترتيب حر — يجد تراكيب لا تكتشفها الأرفف)
// Best Short-Side Fit with Best-Area-Fit tie-break, both orientations tried
// per piece, free rects split on every placement and containment-pruned.
// ---------------------------------------------------------------------------
/** Safety cap: shelf candidates cover very large piece counts better/faster. */
const MAXRECTS_MAX_PIECES = 400;
/**
 * Tighter cap for the EXTRA MaxRects variants (BAF heuristic, additional
 * orders/interleaves). The base BSSF candidates always run up to
 * MAXRECTS_MAX_PIECES; the variants add diversity where layouts are small
 * enough that the extra probes stay cheap.
 */
const MAXRECTS_VARIANT_PIECES = 120;
/** Best placement of one group's cell inside the free rects (BSSF or BAF). */
function mrBestPlacement(free, g, heuristic = 'bssf', gap = ZERO_GAP, placed = []) {
    let best = null;
    for (const f of free) {
        // halo needed on the left / top edge of the free rect: the strongest gap
        // requirement among the already-placed cells touching that edge (with a
        // projection overlap along it). The halo stays free space (allowed waste).
        let leftHalo = 0;
        let topHalo = 0;
        for (const q of placed) {
            if (Math.abs(q.x + q.cw - f.x) <= FIXED_EPS && q.y < f.y + f.h - FIXED_EPS && f.y < q.y + q.ch - FIXED_EPS) {
                leftHalo = Math.max(leftHalo, gap(g.id, q.groupId));
            }
            if (Math.abs(q.y + q.ch - f.y) <= FIXED_EPS && q.x < f.x + f.w - FIXED_EPS && f.x < q.x + q.cw - FIXED_EPS) {
                topHalo = Math.max(topHalo, gap(g.id, q.groupId));
            }
        }
        const orientations = [
            { cw: g.cellW, ch: g.cellH, rot: false },
            { cw: g.cellH, ch: g.cellW, rot: true },
        ];
        for (const o of orientations) {
            if (leftHalo + o.cw > f.w + FIXED_EPS || topHalo + o.ch > f.h + FIXED_EPS)
                continue;
            const cw = Math.min(o.cw, f.w - leftHalo);
            const ch = Math.min(o.ch, f.h - topHalo);
            const x = f.x + leftHalo;
            const y = f.y + topHalo;
            // safety net (قيد صلب): the resolved gap must hold against EVERY placed
            // cell whose projection overlaps — never trust the halo alone.
            if (gapViolation(x, y, cw, ch, g.id, placed, gap))
                continue;
            const short = Math.min(f.w - leftHalo - cw, f.h - topHalo - ch);
            const areaFit = f.w * f.h - cw * ch;
            // BAF prefers the tightest-area free rect first (finds staggered / متدرّج
            // arrangements BSSF walks past); BSSF keeps the legacy behavior.
            const better = heuristic === 'baf'
                ? !best ||
                    areaFit < best.areaFit - FIXED_EPS ||
                    (Math.abs(areaFit - best.areaFit) <= FIXED_EPS && short < best.short - FIXED_EPS)
                : !best ||
                    short < best.short - FIXED_EPS ||
                    (Math.abs(short - best.short) <= FIXED_EPS && areaFit < best.areaFit - FIXED_EPS);
            if (better) {
                best = { x, y, cw, ch, rot: o.rot, short, areaFit };
            }
        }
    }
    return best;
}
/**
 * Gap safety net: true when placing the cell (x,y,cw,ch) of group gId would
 * violate the resolved gap against ANY already-placed cell q. For cells whose
 * Y projections overlap the horizontal air must be ≥ gap(gId, q.groupId); for
 * cells whose X projections overlap the vertical air must be ≥ that gap.
 * Touching projections (within FIXED_EPS) do not trigger the other-axis check.
 */
function gapViolation(x, y, cw, ch, gId, placed, gap) {
    for (const q of placed) {
        const need = gap(gId, q.groupId);
        if (need <= FIXED_EPS)
            continue;
        const yOverlap = y < q.y + q.ch - FIXED_EPS && q.y < y + ch - FIXED_EPS;
        if (yOverlap) {
            const dx = Math.max(q.x - (x + cw), x - (q.x + q.cw));
            if (dx < need - FIXED_EPS)
                return true;
        }
        const xOverlap = x < q.x + q.cw - FIXED_EPS && q.x < x + cw - FIXED_EPS;
        if (xOverlap) {
            const dy = Math.max(q.y - (y + ch), y - (q.y + q.ch));
            if (dy < need - FIXED_EPS)
                return true;
        }
    }
    return false;
}
/** Final hard check: every pair of placed cells respects the resolved gap. */
function layoutGapsOk(placed, gap) {
    if (placed.length < 2)
        return true;
    const cells = placed.map((p) => ({
        x: p.x - (p.bleed?.left ?? 0),
        y: p.y - (p.bleed?.top ?? 0),
        cw: p.w + (p.bleed?.left ?? 0) + (p.bleed?.right ?? 0),
        ch: p.h + (p.bleed?.top ?? 0) + (p.bleed?.bottom ?? 0),
        groupId: p.groupId,
    }));
    for (let i = 1; i < cells.length; i++) {
        const a = cells[i];
        if (gapViolation(a.x, a.y, a.cw, a.ch, a.groupId, cells.slice(0, i), gap))
            return false;
    }
    return true;
}
/** Split every free rect intersecting the placed cell, then prune contained ones. */
function mrSplitAndPrune(free, used) {
    const next = [];
    for (const f of free) {
        const disjoint = used.x >= f.x + f.w - FIXED_EPS ||
            used.x + used.w <= f.x + FIXED_EPS ||
            used.y >= f.y + f.h - FIXED_EPS ||
            used.y + used.h <= f.y + FIXED_EPS;
        if (disjoint) {
            next.push(f);
            continue;
        }
        if (used.x > f.x + FIXED_EPS)
            next.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
        if (used.x + used.w < f.x + f.w - FIXED_EPS)
            next.push({ x: used.x + used.w, y: f.y, w: f.x + f.w - (used.x + used.w), h: f.h });
        if (used.y > f.y + FIXED_EPS)
            next.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
        if (used.y + used.h < f.y + f.h - FIXED_EPS)
            next.push({ x: f.x, y: used.y + used.h, w: f.w, h: f.y + f.h - (used.y + used.h) });
    }
    const contains = (a, b) => a.x >= b.x - FIXED_EPS &&
        a.y >= b.y - FIXED_EPS &&
        a.x + a.w <= b.x + b.w + FIXED_EPS &&
        a.y + a.h <= b.y + b.h + FIXED_EPS;
    return next.filter((a, i) => !next.some((b, j) => {
        if (i === j || !contains(a, b))
            return false;
        if (!contains(b, a))
            return true; // a strictly inside b → prune a
        return j < i; // identical twins → keep only the first copy
    }));
}
/** Expand a need map into an ordered instance list (grouped or round-robin). */
function mrExpandNeed(order, need, interleave) {
    const out = [];
    if (!interleave) {
        for (const g of order) {
            for (let k = 0; k < (need.get(g.id) ?? 0); k++)
                out.push(g);
        }
        return out;
    }
    const remaining = new Map(need);
    let added = true;
    while (added) {
        added = false;
        for (const g of order) {
            const r = remaining.get(g.id) ?? 0;
            if (r > 0) {
                out.push(g);
                remaining.set(g.id, r - 1);
                added = true;
            }
        }
    }
    return out;
}
/** Place an ordered instance list; null when any piece does not fit. */
function mrPackInstances(areaW, areaH, instances, heuristic = 'bssf', gap = ZERO_GAP) {
    let free = [{ x: 0, y: 0, w: areaW, h: areaH }];
    const pieces = [];
    const placedCells = [];
    for (const g of instances) {
        const p = mrBestPlacement(free, g, heuristic, gap, placedCells);
        if (!p)
            return null;
        pushFixedPiece(pieces, g, p.rot, p.cw, p.ch, p.x, p.y);
        free = mrSplitAndPrune(free, { x: p.x, y: p.y, w: p.cw, h: p.ch });
        placedCells.push({ x: p.x, y: p.y, cw: p.cw, ch: p.ch, groupId: g.id });
    }
    return pieces;
}
/**
 * MaxRects fixed-count pack — packs EXACTLY `need` of every group, or null.
 * `interleave` spreads the designs round-robin (robust for mixed sizes);
 * otherwise groups are placed contiguously in the given order. `heuristic`
 * picks the free-rect scoring rule (BSSF legacy, BAF finds staggered layouts).
 */
function maxRectsFixedPack(areaW, areaH, order, need, interleave, heuristic = 'bssf', gap = ZERO_GAP) {
    const instances = mrExpandNeed(order, need, interleave);
    if (instances.length === 0 || instances.length > MAXRECTS_MAX_PIECES)
        return null;
    return mrPackInstances(areaW, areaH, instances, heuristic, gap);
}
/**
 * Quantity-mode MaxRects packs — same proportional-share binary search as
 * mixedShelfQuantityPacks, but feasibility is tested with the free-rectangle
 * packer, so arrangements no shelf can reach are found. Returns up to TWO
 * candidates: max filling and balanced (same sheet count, less overproduction).
 */
function maxRectsQuantityPacks(areaW, areaH, order, interleave, heuristic = 'bssf', gap = ZERO_GAP) {
    const totalQty = order.reduce((s, g) => s + g.quantity, 0);
    if (totalQty <= 0)
        return [];
    const minCellArea = Math.min(...order.map((g) => g.cellW * g.cellH));
    const nMax = Math.max(order.length, Math.ceil((areaW * areaH) / minCellArea) + order.length);
    if (nMax > MAXRECTS_MAX_PIECES)
        return []; // very small pieces: shelf candidates are enough
    const needFor = (n) => new Map(order.map((g) => [g.id, Math.max(1, Math.round((g.quantity / totalQty) * n))]));
    let lo = 0;
    let hi = nMax;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (maxRectsFixedPack(areaW, areaH, order, needFor(mid), interleave, heuristic, gap))
            lo = mid;
        else
            hi = mid - 1;
    }
    if (lo === 0)
        return [];
    const out = [];
    const maxNeed = needFor(lo);
    const maxPack = maxRectsFixedPack(areaW, areaH, order, maxNeed, interleave, heuristic, gap);
    if (!maxPack || maxPack.length === 0)
        return out;
    out.push(maxPack);
    const sheets = order.reduce((s, g) => Math.max(s, Math.ceil(g.quantity / (maxNeed.get(g.id) ?? 1))), 1);
    const balNeed = new Map(order.map((g) => [g.id, Math.max(1, Math.ceil(g.quantity / sheets))]));
    const same = order.every((g) => balNeed.get(g.id) === maxNeed.get(g.id));
    if (!same) {
        const balPack = maxRectsFixedPack(areaW, areaH, order, balNeed, interleave, heuristic, gap);
        if (balPack && balPack.length > 0)
            out.push(balPack);
    }
    return out;
}
/**
 * Round-robin MaxRects fill to capacity with every group present — an honest
 * "how many of each design fit TOGETHER" probe used for maximum-count reports.
 */
function maxRectsFill(areaW, areaH, order, heuristic = 'bssf', gap = ZERO_GAP) {
    const counts = new Map();
    let free = [{ x: 0, y: 0, w: areaW, h: areaH }];
    const placedCells = [];
    let total = 0;
    let progress = true;
    while (progress && total < MAXRECTS_MAX_PIECES) {
        progress = false;
        for (const g of order) {
            const p = mrBestPlacement(free, g, heuristic, gap, placedCells);
            if (!p)
                continue;
            free = mrSplitAndPrune(free, { x: p.x, y: p.y, w: p.cw, h: p.ch });
            placedCells.push({ x: p.x, y: p.y, cw: p.cw, ch: p.ch, groupId: g.id });
            counts.set(g.id, (counts.get(g.id) ?? 0) + 1);
            total++;
            progress = true;
        }
    }
    return counts;
}
/**
 * Objective guillotine-cut metric: the number of DISTINCT straight cut lines
 * of the layout (unique vertical edge positions + unique horizontal edge
 * positions of all trim rects, 0.1mm quantized). A regular m×n grid scores
 * low; a free MaxRects arrangement scores higher.
 */
function cutScoreOf(placed) {
    const xs = new Set();
    const ys = new Set();
    for (const p of placed) {
        xs.add(Math.round(p.x * 10));
        xs.add(Math.round((p.x + p.w) * 10));
        ys.add(Math.round(p.y * 10));
        ys.add(Math.round((p.y + p.h) * 10));
    }
    return xs.size + ys.size;
}
/** Stable identity of a layout, for variant de-duplication. */
function layoutSignature(placed) {
    return placed
        .map((p) => `${Math.round(p.x * 10)},${Math.round(p.y * 10)},${Math.round(p.w * 10)},${Math.round(p.h * 10)},${p.groupId}`)
        .sort()
        .join('|');
}
/**
 * Stable identity of a RAW fixed pack (area-local, pre-centering/mirroring).
 * Centering and mirroring are deterministic, so identical raw packs always
 * yield identical final layouts — deduplicating here skips redundant result
 * building in evaluateCandidates.
 */
function fixedPackSignature(pieces) {
    return pieces
        .map((p) => `${Math.round(p.x * 10)},${Math.round(p.y * 10)},${Math.round(p.w * 10)},${Math.round(p.h * 10)},${p.rotated ? 1 : 0},${p.groupId}`)
        .sort()
        .join('|');
}
/**
 * Transpose a pack (swap x↔y and w↔h) — turns a pack built for the
 * transposed area (areaH × areaW) back into the original space. This is how
 * "column shelves" (vertical bands) are produced from the row-band packers.
 * The `rotated` flag flips (a non-rotated trim in transposed space IS a
 * rotated trim in the original space) and bleed sides swap accordingly.
 */
function transposeFixedPieces(pieces) {
    return pieces.map((p) => ({
        x: p.y,
        y: p.x,
        w: p.h,
        h: p.w,
        groupId: p.groupId,
        color: p.color,
        rotated: !p.rotated,
        ...(p.bleed
            ? { bleed: { left: p.bleed.top, right: p.bleed.bottom, top: p.bleed.left, bottom: p.bleed.right } }
            : {}),
    }));
}
/**
 * Column-shelf quantity packs: the mixed first-fit shelf packer run on the
 * TRANSPOSED area, then transposed back — designs share vertical bands
 * instead of horizontal rows, reaching fillings row shelves cannot.
 */
function columnShelfQuantityPacks(areaW, areaH, order, orient, gap = ZERO_GAP) {
    return mixedShelfQuantityPacks(areaH, areaW, order, orient, gap).map(transposeFixedPieces);
}
/** De-duplicated candidate group orders (identical id sequences run once). */
function uniqueGroupOrders(orders) {
    const seen = new Set();
    const out = [];
    for (const o of orders) {
        const key = o.map((g) => g.id).join(',');
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(o);
    }
    return out;
}
// ---------------------------------------------------------------------------
// عائلات أنماط القص المستقيم (guillotine) — قاعدة معتمدة حرفياً:
//   1. قص أفقي  : صفوف كاملة متجانسة (مجموعة واحدة لكل صف) بخطوط قص أفقية مستمرة.
//   2. قص عمودي : أعمدة كاملة متجانسة بخطوط قص عمودية مستمرة.
//   3. قص بلوكات: كل مقاس في شبكة/شبكات n×m مكتملة تُفصل بتقسيم شريحي
//      (slicing) — بضربات قص مستقيمة متتالية؛ يُسمح بتعدد بلوكات المقاس الواحد.
// ممنوع: صف/عمود مختلط وتراكيب L/حرة تكسر خطوط القص. الترتيب الحجمي (فكرة 1):
// الأكبر في الأسفل عند المسكة ثم الأصغر صعوداً — تُبنى كل العائلات تصاعدياً
// من الأعلى (الأصغر أولاً) فتستقر بعد الجاذبية بالأكبر في القاع.
// ---------------------------------------------------------------------------
/** Ascending cell-area order (الأصغر أولاً في البناء = الأكبر في القاع بعد الجاذبية). */
const ascByCellArea = (groups) => [...groups].sort((a, b) => a.cellW * a.cellH - b.cellW * b.cellH || a.id.localeCompare(b.id));
/**
 * Proportional-share quantity search around ANY fixed-need packer: binary-
 * searches the largest scale N whose proportional needs still pack, then
 * returns the max pack plus a "balanced" pack (same sheet count, only the
 * copies covering the quantities — less overproduction for the same paper).
 * Shared by the three cut-pattern families (and the legacy mixed shelves).
 */
function quantitySearchPacks(areaW, areaH, order, pack) {
    const totalQty = order.reduce((s, g) => s + g.quantity, 0);
    if (totalQty <= 0)
        return [];
    const minCellArea = Math.min(...order.map((g) => g.cellW * g.cellH));
    const nMax = Math.max(order.length, Math.ceil((areaW * areaH) / minCellArea) + order.length);
    const needFor = (n) => new Map(order.map((g) => [g.id, Math.max(1, Math.round((g.quantity / totalQty) * n))]));
    let lo = 0;
    let hi = nMax;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (pack(needFor(mid)))
            lo = mid;
        else
            hi = mid - 1;
    }
    if (lo === 0)
        return [];
    const out = [];
    const maxNeed = needFor(lo);
    const maxPack = pack(maxNeed);
    if (!maxPack || maxPack.length === 0)
        return out;
    out.push(maxPack);
    const sheets = order.reduce((s, g) => Math.max(s, Math.ceil(g.quantity / (maxNeed.get(g.id) ?? 1))), 1);
    const balNeed = new Map(order.map((g) => [g.id, Math.max(1, Math.ceil(g.quantity / sheets))]));
    const same = order.every((g) => balNeed.get(g.id) === maxNeed.get(g.id));
    if (!same) {
        const balPack = pack(balNeed);
        if (balPack && balPack.length > 0)
            out.push(balPack);
    }
    return out;
}
/** عائلة القص الأفقي: أشرطة أفقية صارمة لكل مجموعة (أرفف متجانسة) بترتيب تصاعدي — الأكبر في القاع. */
function rowsQuantityPacks(areaW, areaH, groups, gap) {
    const asc = ascByCellArea(groups);
    return quantitySearchPacks(areaW, areaH, asc, (need) => strictShelfFixedPack(areaW, areaH, asc, need, gap));
}
/** عائلة القص العمودي: نفس الأشرطة الصارمة على المساحة المنقولة (أعمدة متجانسة) — تنازلي: العمود الأكبر عند الجهة الأولى ثم التصاعد. */
function columnsQuantityPacks(areaW, areaH, groups, gap) {
    const desc = [...ascByCellArea(groups)].reverse();
    return quantitySearchPacks(areaH, areaW, desc, (need) => strictShelfFixedPack(areaH, areaW, desc, need, gap)).map(transposeFixedPieces);
}
/** النسخة الثابتة من عائلة الأعمدة (عدد محدد لكل مجموعة). */
function columnsFixedPack(areaW, areaH, order, need, gap) {
    const p = strictShelfFixedPack(areaH, areaW, order, need, gap);
    return p ? transposeFixedPieces(p) : null;
}
/**
 * عائلة القص بالبلوكات: كل مقاس يُقسَّم إلى بلوك مستطيل ممتلئ واحد أو عدة
 * بلوكات n×m مستقلة. لا يوجد صف أخير ناقص داخل البلوك؛ الباقي يصبح بلوكاً
 * مستطيلاً مستقلاً. تُركّب البلوكات كرُصص شريحية: قص عمودي كامل بين الرصص،
 * ثم قص أفقي كامل داخل كل رصة. الأكبر يسبق الأصغر عند خط المسكة، ولا يُكدّس
 * بلوك فوق مضيف أضيق/أقصر منه. البحث محدود العقد ليبقى مناسباً للمعاينة.
 */
function blocksFixedPack(areaW, areaH, order, need, gap) {
    const orientsOf = (g) => [
        { cw: g.cellW, ch: g.cellH, rot: false },
        { cw: g.cellH, ch: g.cellW, rot: true },
    ];
    const gs = order.filter((g) => (need.get(g.id) ?? 0) > 0);
    if (gs.length === 0)
        return null;
    const makePlan = (g, o, cols, rows) => {
        const g0 = gap(g.id, g.id);
        return {
            g,
            rot: o.rot,
            cw: o.cw,
            ch: o.ch,
            cols,
            rows,
            w: cols * (o.cw + g0) - g0,
            h: rows * (o.ch + g0) - g0,
        };
    };
    /**
     * بدائل تقسيم العدد إلى مستطيلات مكتملة. نجرب أولاً بلوكاً واحداً (عوامل
     * العدد)، ثم تقسيمات صفّية محدودة: كتل cols×rows ممتلئة، والباقي الأصغر
     * كتلة rem×1 مستقلة. هذا يسمح بالتعدد من دون إدخال شكل L داخل أي بلوك.
     */
    const decompositionsOf = (g) => {
        const total = need.get(g.id) ?? 0;
        const g0 = gap(g.id, g.id);
        const out = [];
        const seen = new Set();
        const push = (plans) => {
            if (plans.length === 0)
                return;
            const sig = plans.map((p) => `${p.rot ? 1 : 0}:${p.cols}x${p.rows}`).join('|');
            if (seen.has(sig))
                return;
            seen.add(sig);
            out.push(plans);
        };
        for (const o of orientsOf(g)) {
            const maxCols = Math.floor((areaW + g0) / (o.cw + g0));
            const maxRows = Math.floor((areaH + g0) / (o.ch + g0));
            if (maxCols <= 0 || maxRows <= 0)
                continue;
            // بلوك واحد مستطيل مكتمل.
            for (let cols = 1; cols <= Math.min(total, maxCols); cols++) {
                if (total % cols !== 0)
                    continue;
                const rows = total / cols;
                if (rows <= maxRows)
                    push([makePlan(g, o, cols, rows)]);
            }
            // عدة بلوكات مستطيلة عند عدم ملاءمة عامل واحد أو عندما يفيد الرص.
            for (let cols = 1; cols <= Math.min(total, maxCols); cols++) {
                const plans = [];
                let remaining = total;
                while (remaining > 0) {
                    if (remaining < cols) {
                        plans.push(makePlan(g, o, remaining, 1));
                        remaining = 0;
                        continue;
                    }
                    const rows = Math.min(maxRows, Math.floor(remaining / cols));
                    if (rows <= 0)
                        break;
                    plans.push(makePlan(g, o, cols, rows));
                    remaining -= cols * rows;
                }
                if (remaining === 0)
                    push(plans);
            }
        }
        out.sort((a, b) => {
            if (a.length !== b.length)
                return a.length - b.length;
            const ah = Math.max(...a.map((p) => p.h));
            const bh = Math.max(...b.map((p) => p.h));
            const aw = a.reduce((s, p) => s + p.w, 0);
            const bw = b.reduce((s, p) => s + p.w, 0);
            return ah - bh || aw - bw;
        });
        return out.slice(0, 24);
    };
    const decompositions = gs.map(decompositionsOf);
    if (decompositions.some((list) => list.length === 0))
        return null;
    // بلوكان مختلفان يجب أن يبقيا مكوّنين مستقلين حتى عندما يكون gap المستخدم
    // صفراً؛ قناة 0.1مم تتجاوز إبسيلون التجميع ولا تؤثر عملياً في المقاس.
    const independentGap = cut_marks_1.CUT_MARK_EPS_MM * 2;
    const blockGap = (a, b) => Math.max(gap(a, b), independentGap);
    const stacks = [];
    let usedW = 0;
    let nodes = 0;
    const NODE_CAP = 12000;
    /** Y spans of plans in a stack — same top-down walk as emit. */
    const planRanges = (plans, totalH) => {
        const ranges = [];
        let y = totalH;
        for (let pi = 0; pi < plans.length; pi++) {
            const pl = plans[pi];
            if (pi > 0)
                y -= blockGap(plans[pi - 1].g.id, pl.g.id);
            y -= pl.h;
            ranges.push({ id: pl.g.id, y0: y, y1: y + pl.h, w: pl.w });
        }
        return ranges;
    };
    /**
     * Horizontal separation for a new baseline column: max pair-gap only against
     * groups on the right frontier whose vertical span overlaps the new block.
     * (Previously used max-of-ALL-pairs, so gap(1,3) incorrectly forced gap(2,3).)
     */
    const horizontalSepFor = (p) => {
        if (stacks.length === 0)
            return 0;
        let sep = independentGap;
        for (const s of stacks) {
            if (Math.abs(s.x + s.w - usedW) > FIXED_EPS)
                continue;
            for (const pl of planRanges(s.plans, s.h)) {
                // new column sits on the baseline occupying [0, p.h]
                if (pl.y0 < p.h - FIXED_EPS && pl.y1 > FIXED_EPS) {
                    sep = Math.max(sep, blockGap(pl.id, p.g.id));
                }
            }
        }
        return sep;
    };
    /**
     * When stacking p on host s, the host's x was fixed by earlier neighbors.
     * Reject if p would sit beside another stack closer than the pair gap requires.
     */
    const stackHorizOk = (s, p) => {
        const top = s.plans[s.plans.length - 1];
        const sg = blockGap(top.g.id, p.g.id);
        const newH = s.h + sg + p.h;
        const added = planRanges([...s.plans, p], newH).at(-1);
        if (!added)
            return true;
        for (const n of stacks) {
            if (n === s)
                continue;
            for (const nr of planRanges(n.plans, n.h)) {
                if (!(added.y0 < nr.y1 - FIXED_EPS && nr.y0 < added.y1 - FIXED_EPS))
                    continue;
                const need = gap(added.id, nr.id);
                if (need <= FIXED_EPS)
                    continue;
                const aLeft = s.x;
                const aRight = s.x + added.w;
                const bLeft = n.x;
                const bRight = n.x + nr.w;
                const dx = Math.max(bLeft - aRight, aLeft - bRight);
                if (dx < need - FIXED_EPS)
                    return false;
            }
        }
        return true;
    };
    const placeOne = (p, next) => {
        if (++nodes > NODE_CAP)
            return false;
        const sep = horizontalSepFor(p);
        if (p.h <= areaH + FIXED_EPS && usedW + sep + p.w <= areaW + FIXED_EPS) {
            stacks.push({ x: usedW + sep, w: p.w, h: p.h, plans: [p] });
            usedW += sep + p.w;
            if (next())
                return true;
            usedW -= sep + p.w;
            stacks.pop();
        }
        const hosts = stacks
            .filter((s) => {
            const t = s.plans[s.plans.length - 1];
            // عند gap=0 سيُسقط gravityCompact البلوك العلوي حتى يلامس السفلي؛
            // لو كانا من المقاس نفسه اندمجا في مكوّن L. أبقهما رصتين أفقيتين
            // مستقلتين، ولا نسمح بتكديسهما إلا إذا طلب المستخدم فجوة فعلية.
            if (t.g.id === p.g.id && gap(t.g.id, p.g.id) <= cut_marks_1.CUT_MARK_EPS_MM)
                return false;
            return (t.w + FIXED_EPS >= p.w &&
                t.h + FIXED_EPS >= p.h &&
                s.h + blockGap(t.g.id, p.g.id) + p.h <= areaH + FIXED_EPS &&
                stackHorizOk(s, p));
        })
            .sort((a, b) => a.h - b.h);
        for (const s of hosts) {
            const sg = blockGap(s.plans[s.plans.length - 1].g.id, p.g.id);
            s.plans.push(p);
            s.h += sg + p.h;
            if (next())
                return true;
            s.plans.pop();
            s.h -= sg + p.h;
        }
        return false;
    };
    const placePlans = (plans, idx, next) => {
        if (idx === plans.length)
            return next();
        return placeOne(plans[idx], () => placePlans(plans, idx + 1, next));
    };
    const placeGroup = (idx) => {
        if (idx === gs.length)
            return true;
        for (const plans of decompositions[idx]) {
            if (placePlans(plans, 0, () => placeGroup(idx + 1)))
                return true;
            if (nodes > NODE_CAP)
                return false;
        }
        return false;
    };
    if (!placeGroup(0))
        return null;
    // emit: الرصائص يساراً→يميناً؛ داخل الرصّ البلوك الأكبر أسفل (أكبر y في
    // إحداثيات الحزم) والأصغر فوقه — بعد الجاذبية يلامس بلوكُ القاع خطَ الأساس
    // ويستقر كل ضيف فوق مضيفه، فيبقى الترتيب الحجمي الصاعد محفوظاً
    const pieces = [];
    for (const s of stacks) {
        let y = s.h;
        for (const [pi, p] of s.plans.entries()) {
            if (pi > 0)
                y -= blockGap(s.plans[pi - 1].g.id, p.g.id);
            y -= p.h;
            const g0 = gap(p.g.id, p.g.id);
            for (let r = 0; r < p.rows; r++) {
                for (let cc = 0; cc < p.cols; cc++) {
                    pushFixedPiece(pieces, p.g, p.rot, p.cw, p.ch, s.x + cc * (p.cw + g0), y + r * (p.ch + g0));
                }
            }
        }
    }
    return pieces;
}
/** عائلة البلوكات بنمط الكمية: بحث الحصص النسبية حول blocksFixedPack. */
function blocksQuantityPacks(areaW, areaH, groups, gap) {
    const desc = [...ascByCellArea(groups)].reverse();
    return quantitySearchPacks(areaW, areaH, desc, (need) => blocksFixedPack(areaW, areaH, desc, need, gap));
}
/** تجميع القيم المتقاربة (ضمن eps) إلى خطوط ممثلة — نظير clusterLines في cut-marks */
function clusterValues(values, eps) {
    const sorted = [...values].sort((a, b) => a - b);
    const lines = [];
    for (const v of sorted) {
        if (lines.length === 0 || v - lines[lines.length - 1] > eps)
            lines.push(v);
    }
    return lines;
}
function valueIndexOf(v, lines, eps) {
    for (let i = 0; i < lines.length; i++)
        if (Math.abs(lines[i] - v) <= eps)
            return i;
    return -1;
}
/** هل تشكّل الخلايا شبكة n×m منتظمة ممتلئة (نفس منطق isFilledGrid في cut-marks)؟ */
function filledGridCells(cells, eps) {
    const gx = clusterValues(cells.flatMap((c) => [c.x, c.x + c.w]), eps);
    const gy = clusterValues(cells.flatMap((c) => [c.y, c.y + c.h]), eps);
    if ((gx.length - 1) * (gy.length - 1) !== cells.length)
        return false;
    const used = new Set();
    for (const c of cells) {
        const c0 = valueIndexOf(c.x, gx, eps);
        const c1 = valueIndexOf(c.x + c.w, gx, eps);
        const r0 = valueIndexOf(c.y, gy, eps);
        const r1 = valueIndexOf(c.y + c.h, gy, eps);
        if (c0 < 0 || c1 !== c0 + 1 || r0 < 0 || r1 !== r0 + 1)
            return false;
        const key = c0 * 4096 + r0;
        if (used.has(key))
            return false;
        used.add(key);
    }
    return true;
}
/**
 * فحص الشريحية (slicing) العودي حتى الشبكات: توجد دائماً ضربة قص مستقيمة
 * كاملة (عمودية أو أفقية) تفصل نطاقاً عن الباقي، وتكرارها يقسّم المخطط إلى
 * شبكات n×m ممتلئة (أوراق القسم = grids؛ القطعة المفردة شبكة 1×1). أي بنية
 * متشابكة (pinwheel/L متعشّق) لا يوجد لها قص كامل في مرحلة ما ← غير شريحية.
 * يجرب كل خطوط القص المرشحة مع مذكّرة فشل — لا يكتفي بأول قص يعثر عليه،
 * فيقبل تعدد بلوكات المقاس الواحد المتلامسة (فاصل صفري) متى كانت قابلة
 * للفصل بقص كامل، ويرفض التراكيب المتداخلة غير القابلة للقص المستقيم.
 */
function slicingGridDecomposable(cells, eps, failed) {
    if (cells.length <= 1)
        return true;
    if (filledGridCells(cells, eps))
        return true;
    const key = cells
        .map((c) => `${Math.round(c.x * 20)},${Math.round(c.y * 20)},${Math.round(c.w * 20)},${Math.round(c.h * 20)}`)
        .sort()
        .join('|');
    if (failed.has(key))
        return false;
    for (const axis of ['v', 'h']) {
        const startOf = (c) => (axis === 'v' ? c.x : c.y);
        const endOf = (c) => (axis === 'v' ? c.x + c.w : c.y + c.h);
        const coords = new Set();
        for (const c of cells) {
            coords.add(startOf(c));
            coords.add(endOf(c));
        }
        for (const cut of coords) {
            const lo = cells.filter((c) => endOf(c) <= cut + eps);
            const hi = cells.filter((c) => startOf(c) >= cut - eps);
            if (lo.length === 0 || hi.length === 0 || lo.length + hi.length !== cells.length)
                continue;
            if (slicingGridDecomposable(lo, eps, failed) && slicingGridDecomposable(hi, eps, failed))
                return true;
        }
    }
    failed.add(key);
    return false;
}
/**
 * مدقّق أنماط القص (معتمد — التعريفات الحرفية الثلاثة، لا شيء خارجها):
 * يصنّف أي مخطط نهائي إلى 'rows' | 'columns' | 'blocks' | 'invalid'.
 * في الطرق المشطورة يُدقَّق النصف الأول فقط (المرآة تُشتق بنفس النمط ويفصلها
 * قص المحور). الخوارزمية على خلايا القطع (trim+bleed):
 *  1. القص الفيزيائي: المخطط قابل للتقسيم العودي بضربات قص مستقيمة كاملة
 *     حتى شبكات n×m ممتلئة (slicingGridDecomposable) — أي تركيب متشابك
 *     (pinwheel/L متعشّق) ← invalid.
 *  2. كل مكوّن متصل من المقاس نفسه = بلوك مستطيل ممتلئ. يمكن أن يكون للمقاس
 *     الواحد أكثر من بلوك مستقل؛ لكن أي مكوّن L أو شبكة ناقصة ← invalid.
 *  3. التصنيف:
 *     - لا يتراكب مقاسان مختلفان على محور y ← rows.
 *     - وإلا لا يتراكبان على محور x ← columns.
 *     - وإلا، ما دام شريحياً وكل مكوّن مستطيل ← blocks.
 */
function assertCutPattern(placed, flip = null) {
    if (placed.length === 0)
        return 'invalid';
    const eps = cut_marks_1.CUT_MARK_EPS_MM;
    const cellsAll = placed.map((p) => ({
        x: p.x - (p.bleed?.left ?? 0),
        y: p.y - (p.bleed?.top ?? 0),
        w: p.w + (p.bleed?.left ?? 0) + (p.bleed?.right ?? 0),
        h: p.h + (p.bleed?.top ?? 0) + (p.bleed?.bottom ?? 0),
    }));
    let cells = cellsAll;
    let ids = placed.map((p) => p.groupId);
    if (flip) {
        const keep = cellsAll.map((c) => flip.axis === 'vertical' ? c.x + c.w <= flip.position + eps : c.y + c.h <= flip.position + eps);
        if (keep.some(Boolean)) {
            cells = cellsAll.filter((_, i) => keep[i]);
            ids = ids.filter((_, i) => keep[i]);
        }
    }
    if (!slicingGridDecomposable(cells, eps, new Set()))
        return 'invalid';
    // نفس نموذج البلوكات المستخدم لعلامات القص: كل مكوّن متصل للمقاس نفسه
    // يجب أن يكون شبكة مستطيلة ممتلئة. المكونات المنفصلة تبقى بلوكات مستقلة.
    const blocks = (0, cut_marks_1.computeCutBlocks)(cells.map((c, i) => ({ ...c, groupId: ids[i] ?? `__single__${i}` })), eps);
    if (blocks.some((b) => !b.grid))
        return 'invalid';
    const groupsDisjointOn = (axis) => {
        for (let i = 0; i < cells.length; i++) {
            for (let j = i + 1; j < cells.length; j++) {
                if (ids[i] === ids[j])
                    continue;
                const a0 = axis === 'x' ? cells[i].x : cells[i].y;
                const a1 = a0 + (axis === 'x' ? cells[i].w : cells[i].h);
                const b0 = axis === 'x' ? cells[j].x : cells[j].y;
                const b1 = b0 + (axis === 'x' ? cells[j].w : cells[j].h);
                if (Math.min(a1, b1) - Math.max(a0, b0) > eps)
                    return false;
            }
        }
        return true;
    };
    if (groupsDisjointOn('y'))
        return 'rows';
    if (groupsDisjointOn('x'))
        return 'columns';
    return 'blocks';
}
/**
 * Vertical gravity compaction toward the grip edge (ضغط الجاذبية نحو المسكة).
 * بديل ترسيخ صندوق الإحاطة: بدل إزاحة البلوك الكلي كصندوق واحد (فتبقى الكتل
 * الأقصر معلّقة بفراغ تحتها لأن أطول عمود هو من يلامس القاع)، تُسقَط كل قطعة
 * عمودياً بثبات x إلى أدنى موضع ممكن:
 *  - خلية التصادم = trim + bleed من كل الجهات (نفس دلالات placementValid —
 *    الـbleed حبر مطبوع لا يتداخل مع الجيران ولا يدخل شريط المسكة)،
 *  - تُعالج القطع تنازلياً حسب قاع الخلية (الأعمق أولاً) فيستقر الأسفل قبل
 *    الأعلى ولا يمكن أن يصطدم هبوط قطعة بقطعة لم تُعالج بعد،
 *  - حدود الهبوط: قاع مساحة العمل، أو قمة أي خلية مستقرة يتداخل معها الإسقاط
 *    الأفقي مطروحاً منها الفاصل المحلول gap — الفواصل تُطبَّق عمودياً بنفس
 *    دلالات gapViolation (الهواء الرأسي بين خليتين متداخلتي الإسقاط ≥ gap)،
 *  - الحركة للأسفل فقط (لا صعود إطلاقاً): لا تدخل القطعة شريطاً ممنوعاً ولا
 *    تغادر مساحة العمل، والنتيجة نقطة ثابتة — إعادة تشغيل الضغط على الناتج
 *    لا تغيّر شيئاً، وكل عمود يرتكز على القاع أو على عمود تحته.
 * يُطبَّق على النصف الأول في الطرق المشطورة (bascule/double-pince) ثم تُشتق
 * المرآة بعده فيبقى التماثل تاماً؛ وقاع مساحة العمل في double-pince فوق شريط
 * القبضة السفلي أصلاً فلا خرق.
 */
/**
 * قاعدة الترسيخ والترتيب الحجمي الصاعد (معتمدة — guillotine): خط الأساس =
 * الحافة السفلية لمنطقة العمل فوق المسكة.
 *  1. أكبر مجموعة (بمساحة القطعة) تلامس خط الأساس بقطعة واحدة على الأقل.
 *  2. أي قطعة مكدسة فوق قطعة من مجموعة أخرى (تقاطع إسقاط x وفصل عمودي)
 *     تنتمي لمجموعة أصغر أو تساوي — ممنوع مجموعة أكبر فوق أصغر، وممنوع
 *     مجموعة أصغر عند الأساس بينما الأكبر معلّق فوقها أو فوق فراغ.
 * يُفحص النصف الأول في الطرق المشطورة (الترتيب يُفرض قبل اشتقاق المرآة)،
 * وعلى خلايا القطع (trim+bleed) اتساقاً مع الجاذبية والفواصل.
 */
function anchoredOrderOk(placed, workArea, flip = null) {
    const eps = cut_marks_1.CUT_MARK_EPS_MM;
    const cells = placed.map((p) => ({
        g: p.groupId,
        area: p.w * p.h, // الدوران لا يغيّر مساحة القطعة
        l: p.x - (p.bleed?.left ?? 0),
        t: p.y - (p.bleed?.top ?? 0),
        r: p.x + p.w + (p.bleed?.right ?? 0),
        b: p.y + p.h + (p.bleed?.bottom ?? 0),
    }));
    let scope = cells;
    if (flip) {
        const prim = cells.filter((c) => (flip.axis === 'vertical' ? c.r <= flip.position + eps : c.b <= flip.position + eps));
        if (prim.length > 0)
            scope = prim;
    }
    const baseline = workArea.y + workArea.h;
    const maxArea = Math.max(...scope.map((c) => c.area));
    if (!scope.some((c) => Math.abs(c.area - maxArea) <= eps && c.b >= baseline - eps))
        return false;
    for (const p of scope) {
        for (const q of scope) {
            if (p.g === q.g)
                continue;
            const ox = Math.min(p.r, q.r) - Math.max(p.l, q.l);
            if (ox <= eps)
                continue;
            if (p.b <= q.t + eps && p.area > q.area + eps)
                return false; // مجموعة أكبر فوق أصغر
        }
    }
    return true;
}
function gravityCompact(pieces, workArea, gap = ZERO_GAP) {
    const areaBottom = workArea.y + workArea.h;
    const cells = pieces.map((p, i) => ({
        i,
        l: p.x - (p.bleed?.left ?? 0),
        t: p.y - (p.bleed?.top ?? 0),
        r: p.x + p.w + (p.bleed?.right ?? 0),
        b: p.y + p.h + (p.bleed?.bottom ?? 0),
    }));
    // الأعمق أولاً؛ التعادل بالفهرس الأصلي لثبات الترتيب (حتمية كاملة)
    const order = [...cells].sort((a, b) => b.b - a.b || a.i - b.i);
    const settled = [];
    const dyOf = new Array(pieces.length).fill(0);
    for (const c of order) {
        let limit = areaBottom;
        for (const q of settled) {
            // تداخل إسقاط أفقي صارم — التماس ضمن FIXED_EPS لا يحجب (اتساق gapViolation)
            if (!(c.l < q.r - FIXED_EPS && q.l < c.r - FIXED_EPS))
                continue;
            // عائق فقط إن كانت قمته المستقرة عند قاع القطعة الحالي أو أسفل منه
            if (q.t < c.b - FIXED_EPS)
                continue;
            limit = Math.min(limit, q.t - gap(pieces[c.i].groupId, pieces[q.i].groupId));
        }
        const newB = Math.max(c.b, limit); // جاذبية للأسفل فقط — لا صعود إطلاقاً
        dyOf[c.i] = newB - c.b;
        settled.push({ i: c.i, l: c.l, t: c.t + (newB - c.b), r: c.r, b: newB });
    }
    return pieces.map((p, i) => (dyOf[i] === 0 ? p : { ...p, y: p.y + dyOf[i] }));
}
/**
 * Build every feasible packing candidate for one sheet + machine, each with
 * its full result and judging metrics. Shared by evaluate (picks the best
 * run-waste) and computeMontageVariants (picks by different criteria).
 */
function evaluateCandidates(sheetW, sheetH, machine, groups, method, gutterMm, gripMm, gap = ZERO_GAP, cutMethod) {
    if (groups.length === 0)
        return [];
    const halved = method === 'bascule' || method === 'double-pince';
    // method-adjusted printable area (double-pince replaces the smaller-dim end
    // margins with the grip strips)
    const full = printableAreaForMethod(sheetW, sheetH, machine, method, gripMm);
    if (full.w <= 0 || full.h <= 0)
        return [];
    const flip = halved ? flipAxisOf(sheetW, sheetH, method) : null;
    // area available to the "primary" half of the layout
    const workArea = halved ? halfWorkArea(sheetW, sheetH, machine, method, gutterMm, gripMm) : full;
    if (workArea.w <= 0 || workArea.h <= 0)
        return [];
    // ---- packing candidates ---------------------------------------------------
    // وضع guillotine: عائلات أنماط القص الثلاث فقط (انظر التفرع أدناه). غيره
    // (die-cut/cutcontour/غير محدد — السلوك الحالي حرفياً): أشرطة أفقية منفصلة
    // لكل مجموعة بحصة نسبية من كميتها (shelfPack) + نسخة عمودية (أعمدة) منه.
    // المرشحون الإضافيون: أرفف مختلطة (صفوف وأعمدة) تخلط التصاميم داخل نفس الرف
    // بحصص نسبية، بعدة ترتيبات للمجموعات (بالحجم، بالارتفاع، بالعرض، بالمحيط).
    // وأخيراً مرشحو MaxRects (ترتيب حر) بهيuristictين (BSSF وBAF) وتداخل/تجميع —
    // يجدون تراكيب مدرّجة لا تصل إليها الأرفف إطلاقاً.
    const packLists = [];
    // وضع guillotine (قاعدة معتمدة): المرشحون حصرياً من عائلات أنماط القص
    // المستقيم الثلاث (rows/columns/blocks) المرتّبة حجمياً من القاع — الأرفف
    // المختلطة وMaxRects الحر لا تُولَّد أصلاً في هذا الوضع (لا تصل للنتيجة).
    const guillotine = cutMethod === 'guillotine';
    if (guillotine) {
        for (const p of rowsQuantityPacks(workArea.w, workArea.h, groups, gap)) {
            if (p.length > 0)
                packLists.push({ pieces: p, source: 'rows' });
        }
        for (const p of columnsQuantityPacks(workArea.w, workArea.h, groups, gap)) {
            if (p.length > 0)
                packLists.push({ pieces: p, source: 'columns' });
        }
        for (const p of blocksQuantityPacks(workArea.w, workArea.h, groups, gap)) {
            if (p.length > 0)
                packLists.push({ pieces: p, source: 'blocks' });
        }
    }
    if (!guillotine) {
        const strict = shelfPack(workArea.w, workArea.h, groups, gap);
        if (strict.pieces.length > 0)
            packLists.push({ pieces: strict.pieces, source: 'shelf' });
        const strictCols = shelfPack(workArea.h, workArea.w, groups, gap);
        if (strictCols.pieces.length > 0)
            packLists.push({ pieces: transposeFixedPieces(strictCols.pieces), source: 'shelf' });
        if (groups.length > 1) {
            const byAreaDesc = [...groups].sort((a, b) => b.cellW * b.cellH - a.cellW * a.cellH);
            const byHeightDesc = [...groups].sort((a, b) => Math.max(b.cellW, b.cellH) - Math.max(a.cellW, a.cellH));
            const byWidthDesc = [...groups].sort((a, b) => b.cellW - a.cellW);
            const byPerimeterDesc = [...groups].sort((a, b) => b.cellW + b.cellH - (a.cellW + a.cellH));
            const orders = uniqueGroupOrders([byAreaDesc, byHeightDesc, byWidthDesc, byPerimeterDesc]);
            // mixed shelves: rows AND columns, every order, both orientation goals
            for (const order of orders) {
                for (const orient of ['max-cols', 'min-height']) {
                    for (const mixed of mixedShelfQuantityPacks(workArea.w, workArea.h, order, orient, gap)) {
                        if (mixed.length > 0)
                            packLists.push({ pieces: mixed, source: 'mixed' });
                    }
                    for (const mixed of columnShelfQuantityPacks(workArea.w, workArea.h, order, orient, gap)) {
                        if (mixed.length > 0)
                            packLists.push({ pieces: mixed, source: 'mixed' });
                    }
                }
            }
            // MaxRects free-rectangle candidates: the two legacy probes always run
            // (grouped byAreaDesc + round-robin byHeightDesc); the full matrix
            // (every order × interleave × heuristic) runs under a tighter piece cap
            // so very large jobs stay fast — duplicates are pruned by signature below.
            for (const mr of maxRectsQuantityPacks(workArea.w, workArea.h, byAreaDesc, false, 'bssf', gap)) {
                if (mr.length > 0)
                    packLists.push({ pieces: mr, source: 'maxrects' });
            }
            for (const mr of maxRectsQuantityPacks(workArea.w, workArea.h, byHeightDesc, true, 'bssf', gap)) {
                if (mr.length > 0)
                    packLists.push({ pieces: mr, source: 'maxrects' });
            }
            const minCellArea = Math.min(...groups.map((g) => g.cellW * g.cellH));
            const nMax = Math.ceil((workArea.w * workArea.h) / minCellArea) + groups.length;
            if (nMax <= MAXRECTS_VARIANT_PIECES) {
                for (const order of orders) {
                    for (const interleave of [false, true]) {
                        for (const heuristic of ['bssf', 'baf']) {
                            // skip the two legacy probes already run above
                            if (heuristic === 'bssf') {
                                if (!interleave && order === byAreaDesc)
                                    continue;
                                if (interleave && order === byHeightDesc)
                                    continue;
                            }
                            for (const mr of maxRectsQuantityPacks(workArea.w, workArea.h, order, interleave, heuristic, gap)) {
                                if (mr.length > 0)
                                    packLists.push({ pieces: mr, source: 'maxrects' });
                            }
                        }
                    }
                }
            }
        }
    }
    if (packLists.length === 0)
        return [];
    const qtyTotal = groups.reduce((s, g) => s + g.quantity, 0);
    const requiredArea = groups.reduce((s, g) => s + g.quantity * g.w * g.h, 0);
    const out = [];
    const seenPacks = new Set();
    for (const { pieces, source } of packLists) {
        // early de-duplication: identical raw packs produce identical layouts —
        // skip them before paying for centering/mirroring/scoring
        const packSig = fixedPackSignature(pieces);
        if (seenPacks.has(packSig))
            continue;
        seenPacks.add(packSig);
        // الترسيخ على حافة المسكة بضغط الجاذبية (معتمد — انظر gravityCompact):
        // بدل إزاحة البلوك الكلي كصندوق إحاطة واحد، تُسقَط كل قطعة عمودياً إلى
        // أدنى موضع ممكن — قاع مساحة العمل أو قمة خلية تحتها — فترتكز كل كتلة/
        // عمود على خط الأساس نفسه ويكون الفراغ الحر كله في الأعلى. أفقياً يبقى
        // البلوك متمركزاً كما كان، وفي bascule/double-pince يُضغط النصف الأول هنا
        // ثم تُشتق المرآة بعده (أدناه) فيبقى التماثل تاماً حول محور القلب.
        const blockW = Math.max(...pieces.map((p) => p.x + p.w));
        const offX = workArea.x + (workArea.w - blockW) / 2;
        let placed = gravityCompact(pieces.map((p) => ({
            x: p.x + offX,
            y: p.y + workArea.y,
            w: p.w,
            h: p.h,
            rotated: p.rotated,
            groupId: p.groupId,
            color: p.color,
            ...(p.bleed ? { bleed: p.bleed } : {}),
        })), workArea, gap);
        if (halved && flip) {
            // mirror across the absolute sheet axis (midpoint of the smaller dim) —
            // both halves are then perfectly symmetric around it and the central gap
            // is always ≥ the gutter (exactly the gutter when the block fills its half)
            placed = placed.concat(mirrorPieces(placed, flip.axis, flip.position));
        }
        // شبكة الأمان الإلزامية (guillotine): أي مخطط لا يحقق أحد أنماط القص
        // المستقيم الثلاث بعد الجاذبية والمرآة يُستبعد تلقائياً ولا يُعرض
        const cutPattern = guillotine ? assertCutPattern(placed, flip) : undefined;
        if (cutPattern === 'invalid')
            continue;
        // فواصل الأزواج/الداخلي/العام: قيد صلب بعد الجاذبية والمرآة — يرفض أي
        // مرشح (خصوصاً mixed/MaxRects) تجاوز الفاصل الزوجي المطلوب
        if (!layoutGapsOk(placed, gap))
            continue;
        const perGroup = new Map();
        for (const p of placed)
            perGroup.set(p.groupId, (perGroup.get(p.groupId) ?? 0) + 1);
        const copiesPerSheet = placed.length;
        // sheets needed is driven by the most-demanded group; every design must
        // appear on the sheet, otherwise the run can never cover it
        let sheetsNeeded = 0;
        let coversAll = true;
        for (const g of groups) {
            const per = perGroup.get(g.id) ?? 0;
            if (per === 0) {
                coversAll = false;
                break;
            }
            sheetsNeeded = Math.max(sheetsNeeded, Math.ceil(g.quantity / per));
        }
        if (!coversAll)
            continue;
        const pieceArea = placed.reduce((s, p) => s + p.w * p.h, 0);
        const wastePercent = Math.max(0, Math.min(100, (1 - pieceArea / (full.w * full.h)) * 100));
        // الحكم: الهدر الفعلي على كامل الأوراق — الورق المستهلك في كامل المرة
        // الإنتاجية مقابل مساحة القطع المطلوبة فعلاً من الزبون. القطع الزائدة عن
        // المطلوب تُحسب هدراً، فلا يستطيع مرشح تجميل نتيجته بحشو الورقة بتصميم
        // صغير رخيص المقاس.
        const runWaste = 1 - requiredArea / (sheetsNeeded * full.w * full.h);
        // عند التعادل: الأقرب لنسبة الكميات (نسب الإنتاج بين التصاميم توافق نسب
        // كمياتها قدر الإمكان)
        const producedTotal = groups.reduce((s, g) => s + sheetsNeeded * (perGroup.get(g.id) ?? 0), 0);
        let ratioDev = 0;
        for (const g of groups) {
            ratioDev += Math.abs((sheetsNeeded * (perGroup.get(g.id) ?? 0)) / producedTotal - g.quantity / qtyTotal);
        }
        out.push({
            result: {
                placed,
                copiesPerSheet,
                sheetsNeeded,
                wastePercent: Math.round(wastePercent * 10) / 10,
                printableArea: full,
                sheetWidthMm: sheetW,
                sheetHeightMm: sheetH,
                rotated: pieces.some((p) => p.rotated),
                method,
                facesPerSheet: method === 'recto' ? 1 : 2,
                ...(flip ? { flipAxis: flip } : {}),
                ...(method === 'double-pince' ? { gripMm: Math.max(0, gripMm ?? exports.DOUBLE_PINCE_GRIP_MM) } : {}),
                ...(method === 'bascule' ? { gutterMm: Math.max(0, gutterMm) } : {}),
                ...(cutPattern ? { cutPattern } : {}),
            },
            runWaste,
            ratioDev,
            cutScore: cutScoreOf(placed),
            signature: layoutSignature(placed),
            source,
        });
    }
    return out;
}
function evaluate(sheetW, sheetH, machine, groups, method, gutterMm, gripMm, gap = ZERO_GAP, cutMethod) {
    const candidates = evaluateCandidates(sheetW, sheetH, machine, groups, method, gutterMm, gripMm, gap, cutMethod);
    let best = null;
    for (const c of candidates) {
        if (!best ||
            c.runWaste < best.runWaste - 1e-9 ||
            (Math.abs(c.runWaste - best.runWaste) <= 1e-9 && c.ratioDev < best.ratioDev)) {
            best = c;
        }
    }
    return best?.result ?? null;
}
/**
 * The ACTUAL central gutter band between the two mirrored halves of a BASCULE
 * layout, derived from the engine's own placement — single source of truth
 * for the canvas overlay, manual-mode validation and the PDF export (never
 * re-derive it by centering a strip inside the printable area).
 *
 * Edges are measured on the REAL printed extents: each piece's bleed (carried
 * on PlacedPiece.bleed) extends its trim rect, so the band matches the true
 * gap between the halves — when a half is filled to its boundary this equals
 * exactly `flipAxis.position ± gutter` (2 × gutter total — the gutter value
 * is taken in full from EACH half, per the user's spec). Results without
 * bleed info fall back to trim edges (legacy behavior).
 *
 * Double-pince has NO central gutter under the current spec (its forbidden
 * zones are the two grip strips — use forbiddenBandsOf), so this returns null
 * for it. Halves are split at the flip axis (midpoint of the LARGER SHEET
 * dimension for bascule), not at the printable-area center.
 */
function gutterBandOf(result) {
    if (result.method !== 'bascule' || result.placed.length === 0)
        return null;
    const flip = result.flipAxis ?? flipAxisOf(result.sheetWidthMm, result.sheetHeightMm, result.method);
    const a = result.printableArea;
    // The forbidden band is the DESIGNED gutter around the flip axis
    // (axis ± gutter — 2×gutter in total) — not the slack between placed
    // pieces, which can be wider when the block does not fill its half.
    const g = Math.max(0, result.gutterMm ?? 10);
    if (g <= 0)
        return null;
    if (flip.axis === 'vertical') {
        return { x: flip.position - g, y: a.y, w: 2 * g, h: a.h };
    }
    return { x: a.x, y: flip.position - g, w: a.w, h: 2 * g };
}
/**
 * All forbidden (non-printable-by-design) bands of a result, in sheet space:
 *  - bascule      → the central gutter band (see gutterBandOf), when present
 *  - double-pince → the two grip strips at the ends of the SMALLER sheet
 *                   dimension (width = result.gripMm, default 10mm; they
 *                   replace the machine margins there)
 *  - recto / recto-verso → []
 * The UI can hatch these directly; each band is { x, y, w, h } in mm.
 */
function forbiddenBandsOf(result) {
    if (result.method === 'bascule') {
        const band = gutterBandOf(result);
        return band ? [band] : [];
    }
    if (result.method === 'double-pince') {
        const flip = result.flipAxis ?? flipAxisOf(result.sheetWidthMm, result.sheetHeightMm, result.method);
        const g = result.gripMm ?? exports.DOUBLE_PINCE_GRIP_MM;
        const W = result.sheetWidthMm;
        const H = result.sheetHeightMm;
        if (flip.split === 'width') {
            return [
                { x: 0, y: 0, w: g, h: H },
                { x: W - g, y: 0, w: g, h: H },
            ];
        }
        return [
            { x: 0, y: 0, w: W, h: g },
            { x: 0, y: H - g, w: W, h: g },
        ];
    }
    return [];
}
/**
 * Lightweight evaluation for a single sheet + machine — same math as
 * computeMontage but WITHOUT the alternatives scan / fallback machinery.
 * Use it for per-sheet waste badges and any hot path.
 */
function evaluateMontage(input, machine) {
    const groups = normalizeGroups(input);
    if (groups.length === 0)
        return null;
    return evaluate(input.sheetWidthMm, input.sheetHeightMm, machine, groups, input.method, input.gutterMm ?? 10, input.gripMm, makeGapResolver(groups, input.defaultGapMm, input.pairGaps), input.cutMethod);
}
function alternativeFor(sheetW, sheetH, machineId, machine, groups, method, gutterMm, gripMm, gap = ZERO_GAP, cutMethod) {
    const r = evaluate(sheetW, sheetH, machine, groups, method, gutterMm, gripMm, gap, cutMethod);
    if (!r)
        return null;
    return {
        sheetWidthMm: sheetW,
        sheetHeightMm: sheetH,
        machineId,
        copiesPerSheet: r.copiesPerSheet,
        sheetsNeeded: r.sheetsNeeded,
        wastePercent: r.wastePercent,
        score: r.sheetsNeeded * 1000 + r.wastePercent,
    };
}
/**
 * Compute the best imposition for the given input.
 * `machines` defaults to the seed machines (pass repository machines in the app).
 */
function computeMontage(input, machines = catalog_1.SEED_MACHINES) {
    const groups = normalizeGroups(input);
    if (groups.length === 0)
        return null;
    const gutter = input.gutterMm ?? 10;
    const grip = input.gripMm;
    const gap = makeGapResolver(groups, input.defaultGapMm, input.pairGaps);
    const machine = machines.find((m) => m.id === input.machineId);
    const primary = evaluate(input.sheetWidthMm, input.sheetHeightMm, machine, groups, input.method, gutter, grip, gap, input.cutMethod);
    // gather alternatives across all enabled machine sheet sizes (plus the raw
    // input sheet without machine constraints as a fallback)
    const alts = [];
    for (const m of machines.filter((x) => x.enabled)) {
        for (const s of m.sheetSizes) {
            if (m.id === input.machineId && s.widthMm === input.sheetWidthMm && s.heightMm === input.sheetHeightMm)
                continue;
            const a = alternativeFor(s.widthMm, s.heightMm, m.id, m, groups, input.method, gutter, grip, gap, input.cutMethod);
            if (a)
                alts.push(a);
        }
    }
    alts.sort((a, b) => a.score - b.score);
    if (!primary) {
        // fall back to the best alternative as the recommendation
        const best = alts[0];
        if (!best)
            return null;
        const m = machines.find((x) => x.id === best.machineId);
        const r = evaluate(best.sheetWidthMm, best.sheetHeightMm, m, groups, input.method, gutter, grip, gap, input.cutMethod);
        if (!r)
            return null;
        return { ...r, alternatives: alts.slice(1, 6) };
    }
    return { ...primary, alternatives: alts.slice(0, 6) };
}
const FIXED_EPS = 0.01;
function pushFixedPiece(pieces, g, rot, cellW, cellH, cx, cy) {
    const trimW = rot ? g.h : g.w;
    const trimH = rot ? g.w : g.h;
    const bleedX = (cellW - trimW) / 2;
    const bleedY = (cellH - trimH) / 2;
    pieces.push({
        x: cx + bleedX,
        y: cy + bleedY,
        w: trimW,
        h: trimH,
        groupId: g.id,
        color: g.color,
        rotated: rot,
        bleed: { left: bleedX, right: bleedX, top: bleedY, bottom: bleedY },
    });
}
/** Candidate A — strict per-group shelves: each design gets its own row band. */
function strictShelfFixedPack(areaW, areaH, order, need, gap = ZERO_GAP) {
    const pieces = [];
    let cursorY = 0;
    let prevBandId = null;
    for (const g of order) {
        const n = need.get(g.id) ?? 0;
        if (n <= 0)
            continue;
        const g0 = gap(g.id, g.id);
        // pair gap between this band and the band directly above it
        if (prevBandId !== null)
            cursorY += gap(prevBandId, g.id);
        const orientations = [
            { cw: g.cellW, ch: g.cellH, rot: false },
            { cw: g.cellH, ch: g.cellW, rot: true },
        ].filter((o) => o.cw <= areaW + FIXED_EPS);
        let best = null;
        for (const o of orientations) {
            // n cells of pitch (cell+g0) occupy n*(cell+g0) − g0 → cols = floor((areaW+g0)/(cw+g0))
            const cols = Math.floor((areaW + g0) / (o.cw + g0));
            if (cols <= 0)
                continue;
            const rows = Math.ceil(n / cols);
            const height = rows * (o.ch + g0) - g0;
            if (!best || height < best.height - FIXED_EPS || (Math.abs(height - best.height) <= FIXED_EPS && cols > best.cols)) {
                best = { ...o, cols, height };
            }
        }
        if (!best)
            return null;
        if (cursorY + best.height > areaH + FIXED_EPS)
            return null;
        let placed = 0;
        for (let r = 0; placed < n && r * (best.ch + g0) < best.height; r++) {
            for (let c = 0; placed < n && c < best.cols; c++) {
                pushFixedPiece(pieces, g, best.rot, best.cw, best.ch, c * (best.cw + g0), cursorY + r * (best.ch + g0));
                placed++;
            }
        }
        cursorY += best.height;
        prevBandId = g.id;
    }
    return pieces;
}
/** Candidate B — mixed first-fit shelves: designs share shelves, leftovers reuse free width. */
function mixedShelfFixedPack(areaW, areaH, order, need, orient, gap = ZERO_GAP) {
    const pieces = [];
    const shelves = [];
    /**
     * Vertical compatibility of adding group gId to shelf s — EXACT check: for
     * every shelf t above s the air is (s.y − t.bottom), for every shelf t below
     * s the air is (t.y − s.bottom); the resolved pair gap against every group
     * of t must fit in that air. (Pieces sit top-aligned in s, so the air below
     * s's bottom edge is what matters downward.) Conservative only through
     * projection overlap being ignored — the gap is a hard constraint.
     */
    const verticalOk = (s, gId) => {
        const sBottom = s.y + s.h;
        for (const t of shelves) {
            if (t === s)
                continue;
            const tBottom = t.y + t.h;
            if (tBottom <= s.y + FIXED_EPS) {
                const air = s.y - tBottom;
                for (const ga of t.groups)
                    if (gap(gId, ga) > air + FIXED_EPS)
                        return false;
            }
            else if (t.y >= sBottom - FIXED_EPS) {
                const air = t.y - sBottom;
                for (const gb of t.groups)
                    if (gap(gb, gId) > air + FIXED_EPS)
                        return false;
            }
        }
        return true;
    };
    for (const g of order) {
        let remaining = need.get(g.id) ?? 0;
        if (remaining <= 0)
            continue;
        const g0 = gap(g.id, g.id);
        const options = [
            { cw: g.cellW, ch: g.cellH, rot: false },
            { cw: g.cellH, ch: g.cellW, rot: true },
        ].filter((o) => o.cw <= areaW + FIXED_EPS);
        if (options.length === 0)
            return null;
        options.sort((a, b) => orient === 'max-cols'
            ? Math.floor((areaW + g0) / (b.cw + g0)) - Math.floor((areaW + g0) / (a.cw + g0)) || a.ch - b.ch
            : a.ch - b.ch || Math.floor((areaW + g0) / (b.cw + g0)) - Math.floor((areaW + g0) / (a.cw + g0)));
        const cell = options[0];
        while (remaining > 0) {
            // candidate shelf: tall enough, vertically compatible, and room for the
            // lead gap (against the shelf's last group) + one cell
            let shelf = shelves.find((s) => {
                if (cell.ch > s.h + FIXED_EPS)
                    return false;
                if (!verticalOk(s, g.id))
                    return false;
                const lead = s.lastGroup !== null ? gap(s.lastGroup, g.id) : 0;
                return s.x + lead + cell.cw <= areaW + FIXED_EPS;
            });
            if (!shelf) {
                // new shelf under the deepest bottom: topGap must leave enough air
                // against EVERY existing shelf — for a shelf t the total air will be
                // topGap + (maxBottom − t.bottom), so the requirement is reduced by
                // the extra air (tight, not over-conservative, and formally correct)
                const maxBottom = shelves.reduce((m, t) => Math.max(m, t.y + t.h), 0);
                let topGap = 0;
                for (const t of shelves) {
                    const extraAir = maxBottom - (t.y + t.h);
                    let need = 0;
                    for (const gb of t.groups)
                        need = Math.max(need, gap(g.id, gb));
                    topGap = Math.max(topGap, need - extraAir);
                }
                const y = maxBottom + topGap;
                if (y + cell.ch > areaH + FIXED_EPS)
                    return null;
                shelf = { y, h: cell.ch, x: 0, lastGroup: null, groups: new Set(), topGap };
                shelves.push(shelf);
            }
            const lead = shelf.lastGroup !== null ? gap(shelf.lastGroup, g.id) : 0;
            const startX = shelf.x + lead;
            // first cell at startX, further copies at pitch (cw + g0)
            const fit = Math.min(remaining, Math.max(1, 1 + Math.floor((areaW - startX - cell.cw) / (cell.cw + g0))));
            for (let k = 0; k < fit; k++) {
                pushFixedPiece(pieces, g, cell.rot, cell.cw, cell.ch, startX + k * (cell.cw + g0), shelf.y);
            }
            shelf.x = startX + fit * (cell.cw + g0) - g0;
            shelf.lastGroup = g.id;
            shelf.groups.add(g.id);
            remaining -= fit;
        }
    }
    return pieces;
}
/**
 * Quantity-mode mixed shelves — the same first-fit mixed packer as the fixed
 * mode (mixedShelfFixedPack), but the per-sheet count of each design is a
 * PROPORTIONAL SHARE of the quantities: need_i = max(1, round(q_i/total · N)).
 * A binary search over the scale N keeps the largest filling that still fits,
 * so the sheet is packed as full as possible while per-sheet ratios stay as
 * close as achievable to the quantity ratios. Returns up to TWO candidates:
 * the max-filling pack and a "balanced" pack that — given the sheet count the
 * max pack implies — places only what covers the quantities in that many
 * sheets (less overproduction for the same paper). Empty when even one copy
 * of each design does not fit with this order/orientation.
 */
function mixedShelfQuantityPacks(areaW, areaH, order, orient, gap = ZERO_GAP) {
    const totalQty = order.reduce((s, g) => s + g.quantity, 0);
    if (totalQty <= 0)
        return [];
    const minCellArea = Math.min(...order.map((g) => g.cellW * g.cellH));
    // safe upper bound for the total piece count: the whole area filled with the
    // smallest cell (binary search only needs a feasible bracket, not a tight one)
    const nMax = Math.max(order.length, Math.ceil((areaW * areaH) / minCellArea) + order.length);
    const needFor = (n) => new Map(order.map((g) => [g.id, Math.max(1, Math.round((g.quantity / totalQty) * n))]));
    let lo = 0;
    let hi = nMax;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (mixedShelfFixedPack(areaW, areaH, order, needFor(mid), orient, gap))
            lo = mid;
        else
            hi = mid - 1;
    }
    if (lo === 0)
        return [];
    const out = [];
    const maxNeed = needFor(lo);
    const maxPack = mixedShelfFixedPack(areaW, areaH, order, maxNeed, orient, gap);
    if (!maxPack || maxPack.length === 0)
        return out;
    out.push(maxPack);
    // balanced candidate: same sheet count, only the copies needed to cover the
    // quantities (component-wise ≤ maxNeed, so it usually fits too)
    const sheets = order.reduce((s, g) => Math.max(s, Math.ceil(g.quantity / (maxNeed.get(g.id) ?? 1))), 1);
    const balNeed = new Map(order.map((g) => [g.id, Math.max(1, Math.ceil(g.quantity / sheets))]));
    const same = order.every((g) => balNeed.get(g.id) === maxNeed.get(g.id));
    if (!same) {
        const balPack = mixedShelfFixedPack(areaW, areaH, order, balNeed, orient, gap);
        if (balPack && balPack.length > 0)
            out.push(balPack);
    }
    return out;
}
/**
 * Maximum copies per sheet achievable per design — ACTUAL packing attempts:
 * every group gets a huge equal quantity so the quantity-proportional shelf
 * packer fills each design's band to its real capacity; BOTH band directions
 * (row shelves and column shelves) are probed and the best per group wins.
 * `multiplier` converts primary-half counts to full-sheet counts for halved
 * methods.
 */
function maxFixedPerGroup(areaW, areaH, groups, multiplier, gap = ZERO_GAP) {
    const huge = groups.map((g) => ({ ...g, quantity: 1000000 }));
    const rows = shelfPack(areaW, areaH, huge, gap);
    const cols = shelfPack(areaH, areaW, huge, gap); // column bands = shelves on the transposed area
    const out = {};
    for (const g of groups) {
        out[g.id] = Math.max(rows.perGroup.get(g.id) ?? 0, cols.perGroup.get(g.id) ?? 0) * multiplier;
    }
    return out;
}
function fixedPackCandidates(areaW, areaH, groups, need, gap = ZERO_GAP, mode = 'free') {
    const byAreaDesc = [...groups].sort((a, b) => b.cellW * b.cellH - a.cellW * a.cellH);
    const byAreaAsc = [...groups].sort((a, b) => a.cellW * a.cellH - b.cellW * b.cellH);
    const byHeightDesc = [...groups].sort((a, b) => Math.max(b.cellW, b.cellH) - Math.max(a.cellW, a.cellH));
    // بوابة التوليد الأولى في Guillotine: لا تُنشأ الأرفف المختلطة ولا
    // MaxRects أصلاً. كل ما يخرج من هنا ينتمي إلى rows/columns/blocks.
    if (mode === 'guillotine') {
        const familyCandidates = [
            strictShelfFixedPack(areaW, areaH, byAreaDesc, need, gap),
            strictShelfFixedPack(areaW, areaH, byAreaAsc, need, gap),
            columnsFixedPack(areaW, areaH, byAreaDesc, need, gap),
            columnsFixedPack(areaW, areaH, byAreaAsc, need, gap),
            blocksFixedPack(areaW, areaH, byAreaDesc, need, gap),
        ];
        return familyCandidates.filter((c) => !!c && c.length > 0);
    }
    const cands = [
        strictShelfFixedPack(areaW, areaH, byAreaDesc, need, gap),
        strictShelfFixedPack(areaW, areaH, byAreaAsc, need, gap),
        mixedShelfFixedPack(areaW, areaH, byAreaDesc, need, 'max-cols', gap),
        mixedShelfFixedPack(areaW, areaH, byHeightDesc, need, 'max-cols', gap),
        mixedShelfFixedPack(areaW, areaH, byAreaDesc, need, 'min-height', gap),
        mixedShelfFixedPack(areaW, areaH, byHeightDesc, need, 'min-height', gap),
    ];
    // Candidate G — MaxRects free-rectangle packing (مرشح سابع وما بعده):
    // legacy BSSF probes + BAF probes with grouped/interleaved and
    // ascending/reversed instance orders (staggered layouts live there)
    const totalNeed = [...need.values()].reduce((s, n) => s + n, 0);
    if (totalNeed > 0 && totalNeed <= MAXRECTS_MAX_PIECES) {
        cands.push(maxRectsFixedPack(areaW, areaH, byAreaDesc, need, false, 'bssf', gap), maxRectsFixedPack(areaW, areaH, byAreaDesc, need, true, 'bssf', gap), maxRectsFixedPack(areaW, areaH, byHeightDesc, need, true, 'bssf', gap), maxRectsFixedPack(areaW, areaH, byAreaDesc, need, false, 'baf', gap), maxRectsFixedPack(areaW, areaH, byAreaDesc, need, true, 'baf', gap), maxRectsFixedPack(areaW, areaH, byAreaAsc, need, false, 'baf', gap), maxRectsFixedPack(areaW, areaH, byAreaAsc, need, true, 'baf', gap), maxRectsFixedPack(areaW, areaH, byHeightDesc, need, false, 'baf', gap));
    }
    return cands.filter((c) => !!c && c.length > 0);
}
/** The most compact feasible fixed pack (shortest used height, then width). */
function bestFixedPack(areaW, areaH, groups, need, gap = ZERO_GAP, opts) {
    let best = null;
    let bestScore = Infinity;
    for (const cand of fixedPackCandidates(areaW, areaH, groups, need, gap, opts?.candidateMode ?? 'free')) {
        if (opts?.accept && !opts.accept(cand))
            continue;
        const usedH = Math.max(...cand.map((p) => p.y + p.h));
        const usedW = Math.max(...cand.map((p) => p.x + p.w));
        const score = usedH * 100000 + usedW;
        if (score < bestScore) {
            bestScore = score;
            best = cand;
        }
    }
    return best;
}
/**
 * Honest per-group maxima (primary-half space): the best of ALL available
 * packing probes —
 *  1. the proportional shelf fill, rows AND columns (maxFixedPerGroup),
 *  2. round-robin MaxRects fills with every group present, under BOTH
 *     heuristics (BSSF and BAF — the latter finds staggered layouts),
 *  3. per-group binary search: max copies of THIS design while the others
 *     stay at their requested counts, feasibility tested with the full
 *     fixedPackCandidates set (shelves + MaxRects BAF/reversed probes).
 * Probes 2–3 run for single-design sheets too: mixed-orientation MaxRects
 * packs can beat any one-orientation shelf grid, so the reported maximum is
 * never lower than what the sheet actually fits.
 */
function honestMaxPerGroupPrimary(areaW, areaH, groups, primaryNeed, gap = ZERO_GAP, opts) {
    const multiplier = 1; // all probes run in primary-half space
    const shelf = opts?.candidateMode === 'guillotine' ? {} : maxFixedPerGroup(areaW, areaH, groups, multiplier, gap);
    const out = {};
    for (const g of groups)
        out[g.id] = shelf[g.id] ?? 0;
    const byAreaDesc = [...groups].sort((a, b) => b.cellW * b.cellH - a.cellW * a.cellH);
    const minCellArea = Math.min(...groups.map((g) => g.cellW * g.cellH));
    if (opts?.candidateMode !== 'guillotine' && Math.ceil((areaW * areaH) / minCellArea) <= MAXRECTS_MAX_PIECES * 2) {
        for (const heuristic of ['bssf', 'baf']) {
            const fill = maxRectsFill(areaW, areaH, byAreaDesc, heuristic, gap);
            for (const g of groups)
                out[g.id] = Math.max(out[g.id], fill.get(g.id) ?? 0);
        }
    }
    for (const g of groups) {
        const hi = Math.floor((areaW * areaH) / (g.cellW * g.cellH));
        let lo = 0;
        let hiB = hi;
        while (lo < hiB) {
            const mid = (lo + hiB + 1) >> 1;
            const need = new Map(primaryNeed);
            need.set(g.id, mid);
            if (bestFixedPack(areaW, areaH, groups, need, gap, opts))
                lo = mid;
            else
                hiB = mid - 1;
        }
        out[g.id] = Math.max(out[g.id], lo);
    }
    return out;
}
/**
 * Build the failure-path suggestion: clamp every design to its achievable
 * maximum (others stay requested), pack for real, and if independent maxima
 * do not combine, greedily step down the most over-requested design until a
 * pack succeeds. Undefined when no all-designs-present layout can be offered.
 */
function buildFixedSuggestion(workArea, full, groups, primaryNeed, maxPrimary, halved, flip, gap = ZERO_GAP, opts) {
    const sugNeed = new Map();
    for (const g of groups) {
        const req = primaryNeed.get(g.id) ?? 0;
        const n = Math.max(0, Math.min(req, maxPrimary[g.id] ?? 0));
        if (n <= 0)
            return undefined; // a design would vanish — no honest suggestion
        sugNeed.set(g.id, n);
    }
    let pack = bestFixedPack(workArea.w, workArea.h, groups, sugNeed, gap, opts);
    let guard = 0;
    while (!pack && guard++ < 60) {
        let pick = null;
        let pickKey = -Infinity;
        for (const g of groups) {
            const cur = sugNeed.get(g.id) ?? 0;
            if (cur <= 1)
                continue;
            const mx = Math.max(1, maxPrimary[g.id] ?? 0);
            const key = (primaryNeed.get(g.id) ?? 0) / mx; // most over-requested first
            if (key > pickKey) {
                pickKey = key;
                pick = g;
            }
        }
        if (!pick)
            return undefined;
        sugNeed.set(pick.id, (sugNeed.get(pick.id) ?? 1) - 1);
        pack = bestFixedPack(workArea.w, workArea.h, groups, sugNeed, gap, opts);
    }
    if (!pack)
        return undefined;
    const placed = finalizeFixedPlaced(pack, workArea, halved, flip, gap);
    const perGroup = {};
    for (const p of placed)
        perGroup[p.groupId] = (perGroup[p.groupId] ?? 0) + 1;
    let sheetsNeeded = 0;
    for (const g of groups)
        sheetsNeeded = Math.max(sheetsNeeded, Math.ceil(g.quantity / Math.max(1, perGroup[g.id] ?? 0)));
    const pieceArea = placed.reduce((s, p) => s + p.w * p.h, 0);
    const wastePercent = Math.max(0, Math.min(100, (1 - pieceArea / (full.w * full.h)) * 100));
    return {
        placed,
        perGroup,
        copiesPerSheet: placed.length,
        sheetsNeeded,
        wastePercent: Math.round(wastePercent * 10) / 10,
    };
}
/** Anchor a fixed pack to the grip edge via vertical gravity compaction, then mirror it for halved methods. */
function finalizeFixedPlaced(pack, workArea, halved, flip, gap = ZERO_GAP) {
    const blockW = Math.max(...pack.map((p) => p.x + p.w));
    // الترسيخ بضغط الجاذبية (معتمد — انظر gravityCompact): كل قطعة تهبط عمودياً
    // حتى قاع مساحة العمل أو قمة خلية تحتها — خط أساس واحد لكل الكتل والفراغ
    // الحر في الأعلى؛ المرآة تُشتق بعد الضغط فيبقى التماثل تاماً، والـbleed
    // (ضمن خلية التصادم) لا يدخل شريط المسكة ولا يخرج عن الورقة
    const offX = workArea.x + (workArea.w - blockW) / 2;
    let placed = gravityCompact(pack.map((p) => ({
        x: p.x + offX,
        y: p.y + workArea.y,
        w: p.w,
        h: p.h,
        rotated: p.rotated,
        groupId: p.groupId,
        color: p.color,
        ...(p.bleed ? { bleed: p.bleed } : {}),
    })), workArea, gap);
    if (halved && flip) {
        placed = placed.concat(mirrorPieces(placed, flip.axis, flip.position));
    }
    return placed;
}
/**
 * Fixed-count imposition for a single sheet + machine. Places exactly the
 * requested `copiesPerSheet` of every group; on impossibility returns a
 * failure with the reason, the maximum achievable count per design and a
 * suggested arrangement with the counts reduced to what actually fits.
 */
function computeFixedMontage(input, machine) {
    const specs = (input.groups ?? []).filter((g) => g.widthMm > 0 && g.heightMm > 0 && g.quantity > 0 && g.copiesPerSheet > 0);
    if (specs.length === 0) {
        return { ok: false, reason: 'لا توجد تصاميم صالحة بأعداد ثابتة — أدخل عدد النسخ في الورقة لكل تصميم.', maxPerGroup: {} };
    }
    const groups = normalizeGroups({ ...input, groups: specs });
    const gap = makeGapResolver(groups, input.defaultGapMm, input.pairGaps);
    const sheetW = input.sheetWidthMm;
    const sheetH = input.sheetHeightMm;
    const method = input.method;
    const gutter = input.gutterMm ?? 10;
    const grip = input.gripMm;
    const halved = method === 'bascule' || method === 'double-pince';
    const full = printableAreaForMethod(sheetW, sheetH, machine, method, grip);
    if (full.w <= 0 || full.h <= 0) {
        return { ok: false, reason: 'الهوامش و/أو قبضة الماكينة تستهلك كامل الورقة — وسّع الورقة أو قلّل الهوامش.', maxPerGroup: {} };
    }
    const flip = halved ? flipAxisOf(sheetW, sheetH, method) : null;
    const workArea = halved ? halfWorkArea(sheetW, sheetH, machine, method, gutter, grip) : full;
    if (workArea.w <= 0 || workArea.h <= 0) {
        return { ok: false, reason: 'قيود طريقة الطباعة (الفجوة الوسطية / أشرطة القبضة) تستهلك كامل مساحة العمل — وسّع الورقة.', maxPerGroup: {} };
    }
    // requested counts are FINAL (post-cut, both halves included); the primary
    // half of a halved layout carries ceil(n/2) and the mirror completes it
    const requested = new Map();
    for (const s of specs)
        requested.set(s.id, Math.max(1, Math.floor(s.copiesPerSheet)));
    const primaryNeed = new Map();
    for (const [id, n] of requested)
        primaryNeed.set(id, halved ? Math.ceil(n / 2) : n);
    // شبكة أمان النمط الثابت: فواصل الأزواج دائماً؛ وفي guillotine أيضاً مدقّق
    // القص الشريحي وقاعدة الترسيخ والترتيب الحجمي الصاعد بعد الترسيخ والمرآة.
    const guillotine = input.cutMethod === 'guillotine';
    const accept = (pack) => {
        const fin = finalizeFixedPlaced(pack, workArea, halved, flip, gap);
        if (!layoutGapsOk(fin, gap))
            return false;
        if (!guillotine)
            return true;
        return assertCutPattern(fin, flip) !== 'invalid' && anchoredOrderOk(fin, workArea, flip);
    };
    const packOpts = { accept, candidateMode: guillotine ? 'guillotine' : 'free' };
    // generate packing candidates and keep the most compact feasible one
    const best = bestFixedPack(workArea.w, workArea.h, groups, primaryNeed, gap, packOpts);
    if (!best) {
        const maxPrimary = honestMaxPerGroupPrimary(workArea.w, workArea.h, groups, primaryNeed, gap, packOpts);
        const maxPerGroup = {};
        for (const g of groups)
            maxPerGroup[g.id] = (maxPrimary[g.id] ?? 0) * (halved ? 2 : 1);
        return {
            ok: false,
            reason: guillotine
                ? 'الأعداد المطلوبة لا تسع بأنماط القص المستقيم (صفوف/أعمدة/بلوكات متجانسة) — قلّل الأعداد أو وسّع الورقة أو بدّل إلى القص بالقالب (die-cut).'
                : 'الأعداد المطلوبة لا تسع معاً في الورقة الواحدة — قلّل الأعداد أو وسّع الورقة أو غيّر طريقة الطباعة.',
            maxPerGroup,
            suggestion: buildFixedSuggestion(workArea, full, groups, primaryNeed, maxPrimary, halved, flip, gap, packOpts),
        };
    }
    const placed = finalizeFixedPlaced(best, workArea, halved, flip, gap);
    const cutPattern = guillotine ? assertCutPattern(placed, flip) : undefined;
    // دفاع أخير مستقل عن فلترة المرشحين: لا تُرجع نتيجة Guillotine غير مصنفة.
    if (cutPattern === 'invalid') {
        return {
            ok: false,
            reason: 'تعذّر اعتماد المخطط لأنه لا ينفصل بضربات قص مستقيمة ضمن أحد الأنماط الثلاثة.',
            maxPerGroup: {},
        };
    }
    const perGroupCount = new Map();
    for (const p of placed)
        perGroupCount.set(p.groupId, (perGroupCount.get(p.groupId) ?? 0) + 1);
    // sheets driven by the most-demanded design (over its ACTUAL per-sheet count)
    let sheetsNeeded = 0;
    for (const g of groups) {
        const per = perGroupCount.get(g.id) ?? 0;
        if (per === 0) {
            return {
                ok: false,
                reason: 'تصميم لم يدخل الورقة إطلاقاً — قلّل عدده أو وسّع الورقة.',
                maxPerGroup: maxFixedPerGroup(workArea.w, workArea.h, groups, halved ? 2 : 1, gap),
            };
        }
        sheetsNeeded = Math.max(sheetsNeeded, Math.ceil(g.quantity / per));
    }
    const perGroup = {};
    for (const g of groups) {
        const per = perGroupCount.get(g.id) ?? 0;
        const produced = sheetsNeeded * per;
        perGroup[g.id] = {
            requested: requested.get(g.id) ?? 0,
            placedPerSheet: per,
            requiredQty: g.quantity,
            produced,
            extra: Math.max(0, produced - g.quantity),
        };
    }
    const pieceArea = placed.reduce((s, p) => s + p.w * p.h, 0);
    const wastePercent = Math.max(0, Math.min(100, (1 - pieceArea / (full.w * full.h)) * 100));
    return {
        ok: true,
        placed,
        copiesPerSheet: placed.length,
        sheetsNeeded,
        wastePercent: Math.round(wastePercent * 10) / 10,
        printableArea: full,
        sheetWidthMm: sheetW,
        sheetHeightMm: sheetH,
        rotated: placed.some((p) => p.rotated),
        method,
        facesPerSheet: method === 'recto' ? 1 : 2,
        ...(flip ? { flipAxis: flip } : {}),
        ...(method === 'double-pince' ? { gripMm: Math.max(0, grip ?? exports.DOUBLE_PINCE_GRIP_MM) } : {}),
        ...(method === 'bascule' ? { gutterMm: Math.max(0, input.gutterMm ?? 10) } : {}),
        ...(cutPattern ? { cutPattern } : {}),
        alternatives: [],
        perGroup,
    };
}
/**
 * Pick the lowest-waste sheet among candidates for the given piece size(s).
 * `pieces`: single size or multi-group list; quantities default to 1. Each
 * piece may carry its own `bleedMm` (overrides `opts.bleedMm` for that piece).
 * Pass the REAL bleed / print method / gutter via `opts` so the ranking
 * matches the actual montage instead of hard-coded recto/no-bleed defaults.
 */
function bestSheet(pieces, candidates, machines = catalog_1.SEED_MACHINES, opts) {
    const globalBleed = opts?.bleedMm ?? { top: 0, bottom: 0, left: 0, right: 0 };
    const method = opts?.method ?? 'recto';
    const gutter = opts?.gutterMm ?? 10;
    let best = null;
    for (const c of candidates) {
        const machine = machines.find((m) => m.id === c.machineId);
        const r = evaluate(c.widthMm, c.heightMm, machine, pieces.map((p, i) => {
            const bleed = p.bleedMm ?? globalBleed;
            return {
                id: `g${i + 1}`,
                w: p.widthMm,
                h: p.heightMm,
                cellW: p.widthMm + bleed.left + bleed.right,
                cellH: p.heightMm + bleed.top + bleed.bottom,
                bleed,
                quantity: p.quantity ?? 1,
                color: catalog_1.GROUP_COLORS[i % catalog_1.GROUP_COLORS.length],
                rotated: false,
            };
        }), method, gutter, opts?.gripMm);
        if (!r)
            continue;
        const score = r.wastePercent;
        if (!best || score < best.score) {
            best = { ...c, wastePercent: r.wastePercent, copiesPerSheet: r.copiesPerSheet, score };
        }
    }
    return best;
}
const VARIANT_META = {
    balanced: {
        label: 'متوازن',
        description: 'أقل هدر على كامل المرة الإنتاجية مع ترتيب قص معقول — الاختيار الافتراضي الحالي.',
    },
    'min-waste': {
        label: 'أقل هدر',
        description: 'أعلى تعبئة ممكنة للورقة الواحدة (غالباً ترتيب حر) — قد يتطلب قصاً أدق.',
    },
    'easy-cut': {
        label: 'أسهل قص',
        description: 'ترتيب منتظم بأقل عدد خطوط قص مستقيمة (guillotine) ولو بهدر أعلى.',
    },
    alt: {
        label: 'بديل',
        description: 'ترتيب بديل متميز بميزانية مختلفة بين هدر المرة الإنتاجية وعدد خطوط القص — مرتّب بعد الخيارات الرئيسية بهدرٍ ثم قصٍّ أدنى.',
    },
};
/**
 * Up to FIVE distinct imposition variants for the same input + sheet +
 * machine (no alternatives scan — the current sheet only):
 *  1. `balanced`  — lowest real run waste with a reasonable cut (today's pick)
 *  2. `min-waste` — absolute lowest sheet waste (usually a MaxRects layout)
 *  3. `easy-cut`  — fewest distinct guillotine cut lines, even with more waste
 *  4+. `alt`      — the best remaining signature-distinct candidates, ranked
 *                   by run waste then cut score (up to two)
 * Identical layouts are de-duplicated (priority: balanced → min-waste →
 * easy-cut → alt), so fewer than 5 variants may be returned. Empty when
 * nothing fits. computeMontage is unaffected.
 */
function computeMontageVariants(input, machine) {
    const groups = normalizeGroups(input);
    if (groups.length === 0)
        return [];
    const candidates = evaluateCandidates(input.sheetWidthMm, input.sheetHeightMm, machine, groups, input.method, input.gutterMm ?? 10, input.gripMm, makeGapResolver(groups, input.defaultGapMm, input.pairGaps), input.cutMethod);
    if (candidates.length === 0)
        return [];
    // de-duplicate identical layouts, keep the first occurrence per signature
    const uniq = new Map();
    for (const c of candidates)
        if (!uniq.has(c.signature))
            uniq.set(c.signature, c);
    const pool = [...uniq.values()];
    // وضع guillotine: pool كلها مرشحون من العائلات الثلاث المدقَّقين (الفلترة
    // والتدقيق يجريان داخل evaluateCandidates)، ويُختار الافتراضي balanced منها
    // بأدنى هدر تشغيل ثم أدنى انحراف كميات ثم تفضيل عائلة الصفوف (ترتيب حجمي
    // طبيعي: الأكبر في القاع) ثم أدنى ضربات قص.
    const guillotine = input.cutMethod === 'guillotine';
    const FAMILY_RANK = { rows: 0, blocks: 1, columns: 2 };
    const FAMILY_LABEL = { rows: 'قص أفقي', columns: 'قص عمودي', blocks: 'قص بلوكات' };
    const familyRank = (c) => FAMILY_RANK[c.source] ?? 3;
    // وسم العائلة يُشتق من المدقّق نفسه (تصنيف المخطط الفعلي) لا من اسم المولّد —
    // مخطط مولّد أعمدة قد يُصنَّف بلوكات فعلياً والعكس (المرآة تُمرَّر للمشطورة)
    const halved = input.method === 'bascule' || input.method === 'double-pince';
    const flip = halved ? flipAxisOf(input.sheetWidthMm, input.sheetHeightMm, input.method) : null;
    const pickBalanced = () => pool.reduce((a, b) => {
        if (b.runWaste < a.runWaste - 1e-9)
            return b;
        if (Math.abs(b.runWaste - a.runWaste) <= 1e-9) {
            if (b.ratioDev < a.ratioDev - 1e-9)
                return b;
            if (Math.abs(b.ratioDev - a.ratioDev) <= 1e-9) {
                if (guillotine && familyRank(b) < familyRank(a))
                    return b;
                if ((!guillotine || familyRank(b) === familyRank(a)) && b.cutScore < a.cutScore)
                    return b;
            }
        }
        return a;
    });
    const pickMinWaste = () => pool.reduce((a, b) => b.result.wastePercent < a.result.wastePercent - 1e-9 ||
        (Math.abs(b.result.wastePercent - a.result.wastePercent) <= 1e-9 && b.result.sheetsNeeded < a.result.sheetsNeeded)
        ? b
        : a);
    const pickEasyCut = () => pool.reduce((a, b) => b.cutScore < a.cutScore || (b.cutScore === a.cutScore && b.runWaste < a.runWaste - 1e-9) ? b : a);
    const out = [];
    const used = new Set();
    const push = (kind, c) => {
        if (used.has(c.signature))
            return;
        used.add(c.signature);
        const famLabel = guillotine ? FAMILY_LABEL[assertCutPattern(c.result.placed, flip)] : undefined;
        const description = guillotine && famLabel
            ? `${VARIANT_META[kind].description} — نمط القص: ${famLabel}.`
            : VARIANT_META[kind].description;
        out.push({ kind, label: VARIANT_META[kind].label, description, cutScore: c.cutScore, result: c.result });
    };
    push('balanced', pickBalanced());
    push('min-waste', pickMinWaste());
    push('easy-cut', pickEasyCut());
    // fill remaining slots with the best signature-distinct candidates left:
    // lowest real run waste first, then fewest cut lines
    const rest = pool
        .filter((c) => !used.has(c.signature))
        .sort((a, b) => a.runWaste - b.runWaste || a.cutScore - b.cutScore);
    for (const c of rest) {
        if (out.length >= 5)
            break;
        push('alt', c);
    }
    return out;
}
