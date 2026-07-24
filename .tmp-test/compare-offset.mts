// قبل/بعد — نموذج الأوفست: الحالة القياسية 3×140 + 4×89 + 4×78 (bleed 0)
// على ورقة 35×50 مع Heidelberg SM 52 (machine-offset-sm52)، recto و bascule.
// «قبل»: الورقة العمودية 350×500 مع هوامش 8مم + مسكة 10مم ← مساحة 324×484
//        (تُحاكى بماكينة رقمية وهمية هوامشها تعيد إنتاج نفس المستطيل هندسياً:
//         يمين = 8 + 10 مسكة على الحافة الأكبر).
// «بعد»: الورقة الأفقية المطبَّعة 500×350 — هوامش صفر، المسكة 10مم أسفل
//        ← مساحة 500×340 (recto) / 240×340 لكل نصف (bascule).
import { evaluateMontage, printableAreaForMethod } from '../app/src/lib/montage-engine';
import { SEED_MACHINES } from '../app/src/lib/catalog';
import type { BleedBox, Machine, MontageInput } from '../app/src/lib/types';

const zero: BleedBox = { top: 0, bottom: 0, left: 0, right: 0 };
const GROUPS = [
  { id: 'a', widthMm: 140, heightMm: 140, quantity: 3 },
  { id: 'b', widthMm: 89, heightMm: 89, quantity: 4 },
  { id: 'c', widthMm: 78, heightMm: 78, quantity: 4 },
];

const sm52 = SEED_MACHINES.find((m) => m.id === 'machine-offset-sm52')!;

// محاكاة النموذج القديم: هوامش 8مم من كل جانب + مسكة 10مم على الحافة اليمنى
// (الحافة الأكبر للورقة العمودية) — نفس هندسة printableArea القديمة تماماً.
const legacyMachine: Machine = {
  id: 'legacy-offset-sim',
  name: 'SM 52 (النموذج القديم)',
  kind: 'digital',
  margins: { top: 8, bottom: 8, left: 8, right: 8 + 10 },
  costPerFace: 7,
  enabled: true,
  sheetSizes: [{ id: 'of-35-50', widthMm: 350, heightMm: 500, label: '35×50 cm' }],
};

interface Row {
  model: string;
  method: string;
  sheet: string;
  area: string;
  copies: number | string;
  sheets: number | string;
  waste: string;
}

const rows: Row[] = [];

for (const [model, machine, W, H] of [
  ['قبل', legacyMachine, 350, 500],
  ['بعد', sm52, 500, 350],
] as const) {
  for (const method of ['recto', 'bascule'] as const) {
    const area = printableAreaForMethod(W, H, machine, method);
    const input: MontageInput = {
      sheetWidthMm: W,
      sheetHeightMm: H,
      machineId: machine.id,
      groups: GROUPS.map((g) => ({ ...g })),
      bleedMm: zero,
      quantity: 1,
      method,
      gutterMm: 10,
    };
    const r = evaluateMontage(input, machine);
    rows.push({
      model,
      method,
      sheet: `${W}×${H}`,
      area: `${area.w}×${area.h}`,
      copies: r ? r.copiesPerSheet : '—',
      sheets: r ? r.sheetsNeeded : '—',
      waste: r ? `${r.wastePercent}%` : '—',
    });
  }
}

console.log('| النموذج | الطريقة | الورقة | المساحة الصالحة | نسخ/ورقة | أوراق | الهدر |');
console.log('|---|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(`| ${r.model} | ${r.method} | ${r.sheet} | ${r.area} | ${r.copies} | ${r.sheets} | ${r.waste} |`);
}

// تشغيل إنتاجي (100 طقم = 300/400/400 نسخة) — يُظهر الطاقة الحقيقية للورقة
// لأن النسخ لم تعد محدودة بالكمية المطلوبة الصغيرة
const GROUPS_PROD = [
  { id: 'a', widthMm: 140, heightMm: 140, quantity: 300 },
  { id: 'b', widthMm: 89, heightMm: 89, quantity: 400 },
  { id: 'c', widthMm: 78, heightMm: 78, quantity: 400 },
];
const prodRows: Row[] = [];
for (const [model, machine, W, H] of [
  ['قبل', legacyMachine, 350, 500],
  ['بعد', sm52, 500, 350],
] as const) {
  for (const method of ['recto', 'bascule'] as const) {
    const area = printableAreaForMethod(W, H, machine, method);
    const input: MontageInput = {
      sheetWidthMm: W,
      sheetHeightMm: H,
      machineId: machine.id,
      groups: GROUPS_PROD.map((g) => ({ ...g })),
      bleedMm: zero,
      quantity: 1,
      method,
      gutterMm: 10,
    };
    const r = evaluateMontage(input, machine);
    prodRows.push({
      model,
      method,
      sheet: `${W}×${H}`,
      area: `${area.w}×${area.h}`,
      copies: r ? r.copiesPerSheet : '—',
      sheets: r ? r.sheetsNeeded : '—',
      waste: r ? `${r.wastePercent}%` : '—',
    });
  }
}
console.log('\nتشغيل إنتاجي: 100 طقم (300×140 + 400×89 + 400×78):');
console.log('| النموذج | الطريقة | الورقة | المساحة الصالحة | نسخ/ورقة | أوراق | الهدر |');
console.log('|---|---|---|---|---|---|---|');
for (const r of prodRows) {
  console.log(`| ${r.model} | ${r.method} | ${r.sheet} | ${r.area} | ${r.copies} | ${r.sheets} | ${r.waste} |`);
}
