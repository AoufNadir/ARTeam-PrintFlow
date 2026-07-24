// اختبار تطابق PDF مع المعاينة (الحزمة 3): خيارات التصدير الافتراضية تطابق
// طبقات المعاينة + بناء PDF فعلي بطبقاته الجديدة عبر jsPDF في Node.
import {
  buildPdf,
  defaultPdfOptions,
  type PdfExportInput,
} from '../app/src/components/montage/pdf-export';
import { computeMontage } from '../app/src/lib/montage-engine';
import { SEED_MACHINES } from '../app/src/lib/catalog';
import type { BleedBox, MontageInput } from '../app/src/lib/types';
import type { MontageUIState } from '../app/src/components/montage/montage-data';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
}

const digital = SEED_MACHINES.find((m) => m.id === 'machine-digital-versant')!;
const offset = SEED_MACHINES.find((m) => m.id === 'machine-offset-sm52')!;
if (!digital || !offset) throw new Error('seed machines not found');

// ---------------------------------------------------------------------------
// 1) الخيارات الافتراضية = كل طبقات المعاينة مفعّلة؛ Registration للأوفست فقط
// ---------------------------------------------------------------------------
{
  const d = defaultPdfOptions(digital, false);
  const o = defaultPdfOptions(offset, true);
  check(
    'افتراضي رقمي: كل طبقات المعاينة مفعّلة',
    d.cropMarks && d.bleed && d.bands && d.groupBounds && d.pieceLabels && d.metadata,
    JSON.stringify(d),
  );
  check('افتراضي رقمي: registration معطّل، twoPages يتبع duplex', d.registration === false && d.twoPages === false);
  check('افتراضي أوفست: registration مفعّل', o.registration === true);
  check('افتراضي أوفست: twoPages=true عند duplex', o.twoPages === true);
  check('افتراضي: cutContour معطّل (يتطلب قص بقالب)', d.cutContour === false && o.cutContour === false);
}

// ---------------------------------------------------------------------------
// 2) بناء PDF فعلي من نتيجة محرك حقيقية — recto رقمي (وجه واحد)
// ---------------------------------------------------------------------------
const bleed: BleedBox = { top: 3, bottom: 3, left: 3, right: 3 };
const input: MontageInput = {
  sheetWidthMm: 320,
  sheetHeightMm: 450,
  pieceWidthMm: 89,
  pieceHeightMm: 89,
  bleedMm: bleed,
  quantity: 20,
  method: 'recto',
  machineId: digital.id,
};
const result = computeMontage(input, [digital]);
if (!result) throw new Error('computeMontage recto returned null');

const uiState = {
  stickers: [
    { id: 'g1', widthMm: 89, heightMm: 89, bleed, bleedLinked: true, quantity: 20 },
  ],
  bleedShared: bleed,
  cutMethod: 'guillotine',
  sharedCut: false,
  doubleCut: true,
  gutterMm: 10,
  gripMm: 10,
} as unknown as MontageUIState;

const pdfInput: PdfExportInput = { state: uiState, machine: digital, result, placed: result.placed };

{
  const doc = buildPdf(pdfInput, defaultPdfOptions(digital, false));
  check('recto رقمي: صفحة واحدة', doc.getNumberOfPages() === 1, `got ${doc.getNumberOfPages()}`);
  const buf = doc.output('arraybuffer');
  check('recto رقمي: مخرجات PDF غير فارغة', buf.byteLength > 2000, `${buf.byteLength} bytes`);
}

// ---------------------------------------------------------------------------
// 3) bascule أوفست بوجهين: صفحتان مع twoPages، +صفحة CutContour عند تفعيله
// ---------------------------------------------------------------------------
{
  const input2: MontageInput = { ...input, sheetWidthMm: 350, sheetHeightMm: 500, method: 'bascule', machineId: offset.id };
  const result2 = computeMontage(input2, [offset]);
  if (!result2) throw new Error('computeMontage bascule returned null');
  const pdfInput2: PdfExportInput = { state: uiState, machine: offset, result: result2, placed: result2.placed };

  const twoPages = buildPdf(pdfInput2, defaultPdfOptions(offset, true));
  check('bascule أوفست duplex: صفحتان Recto+Verso', twoPages.getNumberOfPages() === 2, `got ${twoPages.getNumberOfPages()}`);

  const onePage = buildPdf(pdfInput2, { ...defaultPdfOptions(offset, true), twoPages: false });
  check('bascule بدون twoPages: صفحة واحدة', onePage.getNumberOfPages() === 1, `got ${onePage.getNumberOfPages()}`);

  const contour = buildPdf(pdfInput2, {
    ...defaultPdfOptions(offset, true),
    cutContour: true,
    cropMarks: true,
  });
  // cutMethod = guillotine في uiState → CutContour لا يُرسم (محميّ بالشرط)
  check('cutContour محميّ: لا صفحة إضافية مع guillotine', contour.getNumberOfPages() === 2, `got ${contour.getNumberOfPages()}`);

  const dieState = { ...uiState, cutMethod: 'die-cut' } as MontageUIState;
  const contour2 = buildPdf({ ...pdfInput2, state: dieState }, { ...defaultPdfOptions(offset, true), cutContour: true });
  check('cutContour مع die-cut: صفحة ثالثة منفصلة', contour2.getNumberOfPages() === 3, `got ${contour2.getNumberOfPages()}`);
}

// ---------------------------------------------------------------------------
// 4) كل الطبقات الاختيارية تُطفأ بنجاح (PDF مينيمال لا يفشل)
// ---------------------------------------------------------------------------
{
  const minimal = buildPdf(pdfInput, {
    cropMarks: false,
    bleed: false,
    bands: false,
    groupBounds: false,
    pieceLabels: false,
    registration: false,
    cutContour: false,
    metadata: false,
    twoPages: false,
  });
  check('كل الطبقات مطفأة: يُبنى بنجاح بصفحة واحدة', minimal.getNumberOfPages() === 1);
}

console.log(failures === 0 ? '\nALL PDF PARITY TESTS PASSED' : `\n${failures} PDF PARITY TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
