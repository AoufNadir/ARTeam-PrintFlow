// اختبارات وحدات لمحرك الالتصاق snap-engine.ts (Smart Guides)
import { computeSnap, SNAP_THRESHOLD_MM, type SnapRect } from '../app/src/lib/snap-engine';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;
const AREA: SnapRect = { x: 0, y: 0, w: 300, h: 400 };

// ---------------------------------------------------------------------------
// 1) محاذاة حافة-بحافة ضمن العتبة: الحافة اليمنى للمتحرك قرب اليسرى للثابت
// ---------------------------------------------------------------------------
{
  const moving: SnapRect[] = [{ x: 20, y: 20, w: 28.6, h: 40 }]; // الحافة اليمنى عند 48.6
  const statics: SnapRect[] = [{ x: 50, y: 10, w: 30, h: 30 }];
  const r = computeSnap(moving, statics, { area: AREA });
  check('حافة-بحافة: dx = +1.4 نحو x=50', near(r.dx, 1.4), `dx=${r.dx}`);
  check('حافة-بحافة: snappedX', r.snappedX === true);
  const g = r.guides.find((g) => g.axis === 'v');
  check('حافة-بحافة: خط إرشاد عمودي عند 50', !!g && near(g.pos, 50), g ? `pos=${g.pos}` : 'missing');
  check(
    'حافة-بحافة: الإرشاد يمتد بطول القطعتين',
    !!g && near(g.from, Math.min(20, 10)) && near(g.to, Math.max(60, 40)),
    g ? `${g.from}→${g.to}` : 'missing',
  );
}

// ---------------------------------------------------------------------------
// 2) محاذاة المراكز: مركز المتحرك الأفقي قرب مركز الثابت
// ---------------------------------------------------------------------------
{
  const moving: SnapRect[] = [{ x: 30, y: 100, w: 39, h: 20 }]; // المركز عند 49.5
  const statics: SnapRect[] = [{ x: 35, y: 200, w: 30, h: 30 }]; // المركز عند 50
  const r = computeSnap(moving, statics, { area: AREA });
  check('مراكز: dx = +0.5 لمحاذاة المركزين', near(r.dx, 0.5), `dx=${r.dx}`);
  check('مراكز: snappedX وخط إرشاد عند 50', r.snappedX && r.guides.some((g) => g.axis === 'v' && near(g.pos, 50)));
}

// ---------------------------------------------------------------------------
// 3) snap to point: ركن المتحرك قرب ركن الثابت → يلتصق المحوران معاً
// ---------------------------------------------------------------------------
{
  const moving: SnapRect[] = [{ x: 79.3, y: 59.2, w: 20, h: 20 }]; // ركنه العلوي الأيسر ~(79.3, 59.2)
  const statics: SnapRect[] = [{ x: 50, y: 50, w: 30, h: 10 }]; // ركنه السفلي الأيمن (80, 60)
  const r = computeSnap(moving, statics, { area: AREA });
  check('نقطة: dx = +0.7 (محاذاة الحواف الأفقية)', near(r.dx, 0.7), `dx=${r.dx}`);
  check('نقطة: dy = +0.8 (محاذاة الحواف العمودية)', near(r.dy, 0.8), `dy=${r.dy}`);
  check('نقطة: خطا إرشاد (عمودي + أفقي)', r.guides.filter((g) => g.axis === 'v').length >= 1 && r.guides.filter((g) => g.axis === 'h').length >= 1);
}

// ---------------------------------------------------------------------------
// 4) خارج العتبة: لا التصاق
// ---------------------------------------------------------------------------
{
  const moving: SnapRect[] = [{ x: 20, y: 20, w: 26.5, h: 40 }]; // يمينه 46.5 — بعيد 3.5مم عن 50
  const statics: SnapRect[] = [{ x: 50, y: 10, w: 30, h: 30 }];
  const r = computeSnap(moving, statics, { area: AREA }, SNAP_THRESHOLD_MM);
  check('خارج العتبة: dx = 0 ولا snappedX', near(r.dx, 0) && !r.snappedX, `dx=${r.dx}`);
  check('خارج العتبة: لا خط إرشاد عمودي عند 50', !r.guides.some((g) => g.axis === 'v' && near(g.pos, 50)));
}

// ---------------------------------------------------------------------------
// 5) تعدد المرشحات: يُختار الأقرب
// ---------------------------------------------------------------------------
{
  const moving: SnapRect[] = [{ x: 20, y: 20, w: 28.4, h: 40 }]; // يمينه 48.4
  const statics: SnapRect[] = [
    { x: 50, y: 10, w: 30, h: 30 }, // مرشح: 50 (delta 1.6)
    { x: 49, y: 100, w: 30, h: 30 }, // مرشح: 49 (delta 0.6) ← الأقرب
  ];
  const r = computeSnap(moving, statics, { area: AREA });
  check('الأقرب: dx = +0.6 نحو 49 وليس 50', near(r.dx, 0.6), `dx=${r.dx}`);
  check('الأقرب: الإرشاد عند 49', r.guides.some((g) => g.axis === 'v' && near(g.pos, 49)));
}

// ---------------------------------------------------------------------------
// 6) استقلالية المحورين: x يلتصق وy لا يلتصق
// ---------------------------------------------------------------------------
{
  const moving: SnapRect[] = [{ x: 20, y: 200, w: 28.6, h: 40 }]; // يمينه 48.6 قرب 50؛ عمودياً بعيد عن الكل
  const statics: SnapRect[] = [{ x: 50, y: 10, w: 30, h: 30 }];
  const r = computeSnap(moving, statics, { area: AREA });
  check('استقلالية: snappedX=true وsnappedY=false', r.snappedX && !r.snappedY, `x=${r.snappedX} y=${r.snappedY}`);
  check('استقلالية: dy = 0', near(r.dy, 0));
}

// ---------------------------------------------------------------------------
// 7) الحواف المرجعية (منطقة الطباعة/محور القلب) تعمل كأهداف
// ---------------------------------------------------------------------------
{
  const moving: SnapRect[] = [{ x: 148.7, y: 20, w: 20, h: 20 }]; // يساره 148.7 قرب محور 150
  const r = computeSnap(moving, [], { refsV: [150], refsH: [], area: AREA });
  check('مرجع: dx = +1.3 نحو محور القلب 150', near(r.dx, 1.3), `dx=${r.dx}`);
  const g = r.guides.find((g) => g.axis === 'v');
  check('مرجع: الإرشاد يمتد بطول القطعة المتحركة فقط', !!g && near(g.from, 20) && near(g.to, 40), g ? `${g.from}→${g.to}` : 'missing');
}

// ---------------------------------------------------------------------------
// 8) قياسات المسافات: أقرب جار في كل اتجاه + حواف منطقة الطباعة
// ---------------------------------------------------------------------------
{
  const moving: SnapRect[] = [{ x: 100, y: 100, w: 40, h: 40 }];
  const statics: SnapRect[] = [
    { x: 70, y: 105, w: 20, h: 30 }, // جار أيسر: فجوة 10
    { x: 160, y: 100, w: 20, h: 40 }, // جار أيمن: فجوة 20
  ];
  const r = computeSnap(moving, statics, { area: AREA });
  const left = r.measures.find((m) => m.axis === 'h' && near(m.to, 100) && near(m.from, 90));
  const right = r.measures.find((m) => m.axis === 'h' && near(m.from, 140) && near(m.to, 160));
  check('قياس: جار أيسر 10مم', !!left && near(left.mm, 10), left ? `mm=${left.mm}` : 'missing');
  check('قياس: جار أيمن 20مم', !!right && near(right.mm, 20), right ? `mm=${right.mm}` : 'missing');
  const areaLeft = r.measures.find((m) => m.axis === 'h' && near(m.from, 0) && near(m.to, 100));
  const areaBottom = r.measures.find((m) => m.axis === 'v' && near(m.from, 140) && near(m.to, 400));
  check('قياس: حافة منطقة الطباعة اليسرى 100مم', !!areaLeft && near(areaLeft.mm, 100));
  check('قياس: حافة منطقة الطباعة السفلية 260مم', !!areaBottom && near(areaBottom.mm, 260));
  check('قياس: التسمية عند منتصف التداخل العمودي للجار', !!left && near(left.at, (105 + 135) / 2), left ? `at=${left.at}` : 'missing');
}

// ---------------------------------------------------------------------------
// 9) عتبة مخصّصة قابلة للتجاوز
// ---------------------------------------------------------------------------
{
  const moving: SnapRect[] = [{ x: 20, y: 20, w: 26.5, h: 40 }]; // بعيد 3.5مم عن 50
  const statics: SnapRect[] = [{ x: 50, y: 10, w: 30, h: 30 }];
  const r = computeSnap(moving, statics, { area: AREA }, 5);
  check('عتبة مخصصة 5مم: يلتصق dx = +3.5', near(r.dx, 3.5), `dx=${r.dx}`);
}

// ---------------------------------------------------------------------------
// 10) مجموعة تتحرك كوحدة: تصحيح واحد مشترك لكل القطع
// ---------------------------------------------------------------------------
{
  const moving: SnapRect[] = [
    { x: 10, y: 10, w: 20, h: 20 },
    { x: 30, y: 10, w: 18.8, h: 20 }, // يمينها 48.8 قرب 50
  ];
  const statics: SnapRect[] = [{ x: 50, y: 10, w: 20, h: 20 }];
  const r = computeSnap(moving, statics, { area: AREA });
  check('مجموعة: تصحيح مشترك dx = +1.2', near(r.dx, 1.2), `dx=${r.dx}`);
}

console.log(failures === 0 ? '\nALL SNAP ENGINE TESTS PASSED' : `\n${failures} SNAP ENGINE TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
