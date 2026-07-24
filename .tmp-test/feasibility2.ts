// ---------------------------------------------------------------------------
// الجزء 1 (مصحّح): كشف fallback + فحص رياضي دقيق لإمكانية 4/4/4 في مساحة معطاة
// ---------------------------------------------------------------------------
import { computeMontage, computeMontageVariants } from '../app/src/lib/montage-engine';
import { SEED_MACHINES } from '../app/src/lib/catalog';
import type { BleedBox, MontageInput, PlacedPiece, PrintMethod } from '../app/src/lib/types';

const ZERO: BleedBox = { top: 0, bottom: 0, left: 0, right: 0 };
const GROUPS = [
  { id: 'g140', widthMm: 140, heightMm: 140, quantity: 4 },
  { id: 'g89', widthMm: 89, heightMm: 89, quantity: 4 },
  { id: 'g78', widthMm: 78, heightMm: 78, quantity: 4 },
];
const METHODS: PrintMethod[] = ['recto', 'recto-verso', 'bascule', 'double-pince'];

function mkInput(sheetW: number, sheetH: number, method: PrintMethod, machineId?: string): MontageInput {
  return {
    sheetWidthMm: sheetW,
    sheetHeightMm: sheetH,
    groups: GROUPS.map((g) => ({ ...g })),
    bleedMm: ZERO,
    quantity: 12,
    method,
    ...(machineId ? { machineId } : {}),
  };
}

// ---------------- فاحص دقيق (Korf-style exact rectangle feasibility) --------
// كل القطع مربعات هنا؛ الفحص: هل يمكن هندسياً حشو 4×140 + 4×89 + 4×78 في W×H؟
interface Sq { x: number; y: number; s: number }
const EPS = 1e-6;

function overlaps(a: Sq, b: Sq): boolean {
  return a.x < b.x + b.s - EPS && a.x + a.s > b.x + EPS && a.y < b.y + b.s - EPS && a.y + a.s > b.y + EPS;
}

interface FitsResult {
  verdict: boolean | null; // null = غير محسوم
  witness?: Sq[];
  nodes: number;
}

function exactFits(W: number, H: number, sizes: number[], nodeCap = 2_000_000): FitsResult {
  // فحص اكتمال عبر «الأنماط النظامية» (normal patterns): في أي تعبئة ممكنة
  // يوجد تكافؤ حيث إحداثي x لكل قطعة مجموع من عروض القطع، وy مجموع من ارتفاعاتها.
  const coords = (limit: number): number[] => {
    const set = new Set<number>([0]);
    for (const w of sizes) {
      for (const v of [...set]) {
        const nv = v + w;
        if (nv <= limit) set.add(nv);
      }
    }
    return [...set].sort((a, b) => a - b);
  };
  const X = coords(W);
  const Y = coords(H);
  const totalArea = sizes.reduce((a, s) => a + s * s, 0);
  if (totalArea > W * H + EPS) return { verdict: false, nodes: 0 };

  // القطع بترتيب تنازلي؛ المتماثلات لا فرق بينها
  const order = [...sizes].sort((a, b) => b - a);
  const placed: Sq[] = [];
  let nodes = 0;
  let capped = false;
  const NODE_CAP = nodeCap;

  function dfs(idx: number): boolean {
    if (++nodes > NODE_CAP) { capped = true; return false; }
    if (idx === order.length) return true;
    const s = order[idx];
    // كسر تماثل الحاوية: القطعة الأولى في الربع الأسفل-الأيسر
    const firstPiece = idx === 0;
    // ترتيب المواضع أسفل-يسار أولاً → الشاهد يُكتشف مبكراً عند الإمكان
    for (let yi = 0; yi < Y.length; yi++) {
      const y = Y[yi];
      if (y + s > H + EPS) break;
      if (firstPiece && y > (H - s) / 2 + EPS) break;
      for (let xi = 0; xi < X.length; xi++) {
        const x = X[xi];
        if (x + s > W + EPS) break;
        if (firstPiece && x > (W - s) / 2 + EPS) break;
        // القطع المتماثلة: فرض ترتيب lexicographic لتقليل التماثل
        if (idx > 0 && order[idx - 1] === s) {
          const prev = placed[placed.length - 1];
          if (prev.s === s && (y < prev.y - EPS || (Math.abs(y - prev.y) <= EPS && x < prev.x - EPS))) continue;
        }
        const sq: Sq = { x, y, s };
        if (placed.some((p) => overlaps(sq, p))) continue;
        placed.push(sq);
        if (dfs(idx + 1)) return true;
        placed.pop();
        if (capped) return false;
      }
    }
    return false;
  }
  const ok = dfs(0);
  return { verdict: capped ? null : ok, witness: ok ? [...placed] : undefined, nodes };
}

console.log('=== فحص رياضي دقيق (مستقل عن المحرك): هل 4/4/4 يسع هندسياً؟ ===');
const AREA_CASES: [string, number, number][] = [
  ['PDF footprint (أثبتت الأداة القديمة أنه يسع)', 344, 458],
  ['أوفست 35×50 — قابل للطباعة 324×484', 324, 484],
  ['رقمي 33×48 — قابل للطباعة 320×470', 320, 470],
  ['رقمي 32×45 — قابل للطباعة 310×440', 310, 440],
  ['أوفست 33×70 — قابل للطباعة 304×684', 304, 684],
  ['أوفست 50×70 — قابل للطباعة 474×684', 474, 684],
  ['ورقة 350×500 كاملة بلا هوامش', 350, 500],
];
const SIZES = [140, 140, 140, 140, 89, 89, 89, 89, 78, 78, 78, 78];
for (const [label, w, h] of AREA_CASES) {
  const t0 = Date.now();
  // حالات صعبة (أوفست 35×50) ترفع حد العقد لمحاولة الحسم
  const cap = w === 324 ? 30_000_000 : 2_000_000;
  const res = exactFits(w, h, SIZES, cap);
  const verdict =
    res.verdict === null ? '؟ غير محسوم (حد العقد)' : res.verdict ? '✓ يسع هندسياً' : '✗ مستحيل هندسياً';
  console.log(`  ${label}: ${verdict} (${Date.now() - t0}ms, nodes=${res.nodes})`);
  if (res.witness) {
    const sorted = [...res.witness].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const p of sorted) console.log(`      □${p.s} @ (${p.x}, ${p.y})`);
  }
}

// ---------------- الجزء 1 مصحّح: مع كشف fallback ---------------------------
console.log('\n=== الجزء 1 (مصحّح) — computeMontage مع sheet الفعلية للنتيجة ===');
for (const m of SEED_MACHINES) {
  for (const s of m.sheetSizes) {
    for (const method of METHODS) {
      const r = computeMontage(mkInput(s.widthMm, s.heightMm, method, m.id));
      if (!r) {
        console.log(`${m.name} | ${s.label} | ${method}: null (لا شيء)`);
        continue;
      }
      const fb = r.sheetWidthMm !== s.widthMm || r.sheetHeightMm !== s.heightMm;
      const pg: Record<string, number> = {};
      for (const p of r.placed) pg[p.groupId] = (pg[p.groupId] ?? 0) + 1;
      console.log(
        `${m.name} | ${s.label} (${s.widthMm}×${s.heightMm}) | ${method}: sheets=${r.sheetsNeeded} perSheet 140:${pg.g140 ?? 0}/89:${pg.g89 ?? 0}/78:${pg.g78 ?? 0} waste=${r.wastePercent}%` +
          (fb ? `  ⚠ FALLBACK → النتيجة فعلياً على ${r.sheetWidthMm}×${r.sheetHeightMm} (${r.alternatives.length} بدائل)` : ''),
      );
    }
  }
}

// ---------------- الجزء 3 تفصيلي: مواضع easy-cut على 33×70 و 50×70 -----------
console.log('\n=== تفصيل مواضع القطع للمرشحات الواعدة (ورقة واحدة، 12 قطعة) ===');
const offset = SEED_MACHINES.find((m) => m.id === 'machine-offset-sm52')!;
for (const [sw, sh, method] of [
  [330, 700, 'recto'],
  [500, 700, 'recto'],
] as const) {
  const vs = computeMontageVariants(mkInput(sw, sh, method, offset.id), offset);
  const easy = vs.find((v) => v.kind === 'easy-cut');
  if (!easy || easy.result.sheetsNeeded !== 1) continue;
  console.log(`--- ${sw}×${sh} ${method} / easy-cut (sheets=${easy.result.sheetsNeeded}, waste=${easy.result.wastePercent}%) ---`);
  const sorted = [...easy.result.placed].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const p of sorted) {
    console.log(`   ${p.groupId} @ x=${p.x.toFixed(1)} y=${p.y.toFixed(1)} w=${p.w} h=${p.h}`);
  }
}

// ---------------- اختبار PDF footprint بلا ماكينة (الهوامش مُهملة عمداً) -----
console.log('\n=== ماذا يفعل المحرك على 350×500 خام بدون machineId (الهوامش مُهملة) ===');
const raw = computeMontage(mkInput(350, 500, 'recto'));
if (raw) {
  const pg: Record<string, number> = {};
  for (const p of raw.placed) pg[p.groupId] = (pg[p.groupId] ?? 0) + 1;
  console.log(`sheets=${raw.sheetsNeeded} perSheet 140:${pg.g140 ?? 0}/89:${pg.g89 ?? 0}/78:${pg.g78 ?? 0} waste=${raw.wastePercent}%`);
  const sorted = [...raw.placed].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const p of sorted) console.log(`   ${p.groupId} @ x=${p.x.toFixed(1)} y=${p.y.toFixed(1)} w=${p.w} h=${p.h}`);
  const maxX = Math.max(...raw.placed.map((p) => p.x + p.w));
  const maxY = Math.max(...raw.placed.map((p) => p.y + p.h));
  console.log(`   extents: maxX=${maxX.toFixed(1)} maxY=${maxY.toFixed(1)} (PDF: maxX=344 maxY=458)`);
}
