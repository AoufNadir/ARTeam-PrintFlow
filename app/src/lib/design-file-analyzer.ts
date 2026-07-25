import type {
  DesignBleedBox,
  DesignFileFormat,
  MeasurementConfidence,
} from '@/lib/design-file-types';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

const POINT_TO_MM = 25.4 / 72;
const PX_TO_MM = 25.4 / 96;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_PDF_PAGES = 50;
const MAX_PREVIEW_PAGES = 12;

export interface AnalyzedDesignPage {
  pageNumber?: number;
  pageCount?: number;
  widthMm: number;
  heightMm: number;
  measurementSource: string;
  confidence: MeasurementConfidence;
  pixelWidth?: number;
  pixelHeight?: number;
  dpi?: number;
  dpiAssumed?: boolean;
  detectedBleedMm?: DesignBleedBox;
  hasEmbeddedCutContour: boolean;
  previewDataUrl?: string;
  warnings: string[];
}

export interface AnalyzedDesignFile {
  file: File;
  checksum?: string;
  format: DesignFileFormat;
  mimeType: string;
  pages: AnalyzedDesignPage[];
}

export class DesignFileAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DesignFileAnalysisError';
  }
}

function roundMm(value: number): number {
  return Math.round(value * 100) / 100;
}

function safePositive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function extensionOf(name: string): string {
  return name.toLowerCase().split('.').pop() ?? '';
}

function mimeFor(format: DesignFileFormat): string {
  if (format === 'pdf' || format === 'ai') return 'application/pdf';
  if (format === 'svg') return 'image/svg+xml';
  return 'image/jpeg';
}

async function checksumOf(bytes: Uint8Array): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle) return undefined;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

function bytesStartWith(bytes: Uint8Array, values: number[]): boolean {
  return values.every((value, index) => bytes[index] === value);
}

function decodePrefix(bytes: Uint8Array, max = 16_384): string {
  return new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, max)));
}

function detectFormat(file: File, bytes: Uint8Array): { format: DesignFileFormat; warning?: string } {
  const extension = extensionOf(file.name);
  const prefix = decodePrefix(bytes);
  const pdf = prefix.includes('%PDF-');
  const postscript = prefix.startsWith('%!PS-Adobe');
  const jpeg = bytesStartWith(bytes, [0xff, 0xd8, 0xff]);
  const svg = /<svg[\s>]/i.test(prefix);

  if (extension === 'ai') {
    if (pdf) return { format: 'ai' };
    if (postscript) {
      throw new DesignFileAnalysisError(
        'ملف AI قديم وغير متوافق مع PDF. أعد حفظه من Illustrator مع تفعيل Create PDF Compatible File ثم ارفعه مجدداً.',
      );
    }
    throw new DesignFileAnalysisError('ملف AI غير صالح أو غير متوافق مع PDF.');
  }
  if (pdf) return { format: 'pdf', warning: extension !== 'pdf' ? 'تم التعرف على المحتوى كملف PDF رغم اختلاف الامتداد.' : undefined };
  if (svg) return { format: 'svg', warning: extension !== 'svg' ? 'تم التعرف على المحتوى كملف SVG رغم اختلاف الامتداد.' : undefined };
  if (jpeg) return { format: 'jpg', warning: !['jpg', 'jpeg'].includes(extension) ? 'تم التعرف على المحتوى كصورة JPEG رغم اختلاف الامتداد.' : undefined };

  if (postscript) {
    throw new DesignFileAnalysisError(
      'ملف PostScript/AI القديم غير مدعوم داخل المتصفح. احفظه كـPDF متوافق ثم أعد الرفع.',
    );
  }
  throw new DesignFileAnalysisError('نوع الملف غير معروف. الأنواع المدعومة: PDF وSVG وAI المتوافق مع PDF وJPG.');
}

function compactDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.76);
}

async function imagePreview(source: Blob, maxEdge = 420): Promise<{ dataUrl: string; width: number; height: number }> {
  const url = URL.createObjectURL(source);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('تعذر إنشاء معاينة للصورة.'));
      element.src = url;
    });
    const ratio = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('تعذر إنشاء مساحة معاينة.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { dataUrl: compactDataUrl(canvas), width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function hasPdfCutContour(bytes: Uint8Array): boolean {
  const searchable = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 12_000_000)));
  return /(Cut[\s_-]*Contour|Dieline|Die[\s_-]*Cut|Thru[\s_-]*Cut|Kiss[\s_-]*Cut|D[ée]coupe|Trac[ée])/i.test(searchable);
}

function normalizeBleed(value: number): number {
  return roundMm(Math.max(0, value * POINT_TO_MM));
}

async function analyzePdf(
  file: File,
  bytes: Uint8Array,
  format: 'pdf' | 'ai',
  inheritedWarning?: string,
): Promise<AnalyzedDesignFile> {
  const [{ PDFDocument, PDFName }, pdfjs] = await Promise.all([
    import('pdf-lib'),
    import('pdfjs-dist'),
  ]);

  let pdfDocument;
  try {
    pdfDocument = await PDFDocument.load(bytes.slice(), { updateMetadata: false });
  } catch {
    throw new DesignFileAnalysisError('تعذر قراءة ملف PDF/AI. قد يكون الملف تالفاً أو محمياً بكلمة مرور.');
  }

  const pages = pdfDocument.getPages();
  if (pages.length === 0) throw new DesignFileAnalysisError('الملف لا يحتوي على صفحات.');
  if (pages.length > MAX_PDF_PAGES) {
    throw new DesignFileAnalysisError(`الملف يحتوي على ${pages.length} صفحة. الحد الأقصى للتحليل هو ${MAX_PDF_PAGES} صفحة.`);
  }

  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  let previewDocument: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']> | null = null;
  try {
    previewDocument = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  } catch {
    previewDocument = null;
  }

  const hasEmbeddedCutContour = hasPdfCutContour(bytes);
  const analyzedPages: AnalyzedDesignPage[] = [];

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const hasTrim = page.node.has(PDFName.of('TrimBox'));
    const hasCrop = page.node.has(PDFName.of('CropBox'));
    const hasBleed = page.node.has(PDFName.of('BleedBox'));
    const trim = page.getTrimBox();
    const crop = page.getCropBox();
    const media = page.getMediaBox();
    const chosen = hasTrim ? trim : hasCrop ? crop : media;
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    const rotated = rotation === 90 || rotation === 270;
    const rawWidth = rotated ? chosen.height : chosen.width;
    const rawHeight = rotated ? chosen.width : chosen.height;
    const warnings: string[] = [];
    if (inheritedWarning) warnings.push(inheritedWarning);
    if (!hasTrim) {
      warnings.push(
        hasCrop
          ? 'لا يوجد TrimBox؛ استُخدم CropBox لتحديد القياس.'
          : 'لا يوجد TrimBox أو CropBox؛ استُخدم MediaBox ويُنصح بمراجعة القياس.',
      );
    }
    if (hasTrim && !hasBleed) warnings.push('يوجد TrimBox لكن لا يوجد BleedBox؛ راجع قيمة الـBleed قبل الطباعة.');
    if (hasEmbeddedCutContour) warnings.push('تم اكتشاف اسم/طبقة يُحتمل أنها مسار قص داخل الملف.');

    let detectedBleedMm: DesignBleedBox | undefined;
    if (hasTrim && hasBleed) {
      const bleed = page.getBleedBox();
      detectedBleedMm = {
        left: normalizeBleed(trim.x - bleed.x),
        bottom: normalizeBleed(trim.y - bleed.y),
        right: normalizeBleed(bleed.x + bleed.width - (trim.x + trim.width)),
        top: normalizeBleed(bleed.y + bleed.height - (trim.y + trim.height)),
      };
      if (Math.max(...Object.values(detectedBleedMm)) === 0) detectedBleedMm = undefined;
    }

    let previewDataUrl: string | undefined;
    if (previewDocument && index < MAX_PREVIEW_PAGES) {
      try {
        const previewPage = await previewDocument.getPage(index + 1);
        const baseViewport = previewPage.getViewport({ scale: 1 });
        const scale = Math.min(1.5, 420 / Math.max(baseViewport.width, baseViewport.height));
        const viewport = previewPage.getViewport({ scale });
        const canvas = window.document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        const context = canvas.getContext('2d');
        if (context) {
          context.fillStyle = '#fff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          await previewPage.render({ canvas, canvasContext: context, viewport }).promise;
          previewDataUrl = compactDataUrl(canvas);
        }
      } catch {
        warnings.push('تعذر إنشاء معاينة لهذه الصفحة، لكن القياسات قُرئت بنجاح.');
      }
    }

    analyzedPages.push({
      pageNumber: index + 1,
      pageCount: pages.length,
      widthMm: roundMm(rawWidth * POINT_TO_MM),
      heightMm: roundMm(rawHeight * POINT_TO_MM),
      measurementSource: hasTrim ? 'PDF TrimBox' : hasCrop ? 'PDF CropBox' : 'PDF MediaBox',
      confidence: hasTrim ? 'high' : hasCrop ? 'medium' : 'low',
      detectedBleedMm,
      hasEmbeddedCutContour,
      previewDataUrl,
      warnings,
    });
  }

  await previewDocument?.cleanup();
  return { file, format, mimeType: mimeFor(format), pages: analyzedPages };
}

interface SvgLength {
  mm: number;
  confidence: MeasurementConfidence;
  source: string;
}

function parseSvgLength(raw: string | null): SvgLength | null {
  if (!raw || raw.trim().endsWith('%')) return null;
  const match = raw.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+))(mm|cm|in|pt|pc|px)?$/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = (match[2] ?? 'px').toLowerCase();
  const factors: Record<string, number> = {
    mm: 1,
    cm: 10,
    in: 25.4,
    pt: POINT_TO_MM,
    pc: 25.4 / 6,
    px: PX_TO_MM,
  };
  return {
    mm: value * factors[unit],
    confidence: unit === 'px' ? 'medium' : 'high',
    source: unit === 'px' ? 'SVG px @ 96 DPI' : `SVG ${unit}`,
  };
}

function sanitizeSvg(documentNode: Document): string {
  for (const element of Array.from(documentNode.querySelectorAll('script, foreignObject, iframe, object, embed'))) {
    element.remove();
  }
  for (const element of Array.from(documentNode.querySelectorAll('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (
        name.startsWith('on') ||
        ((name === 'href' || name.endsWith(':href')) && /^(https?:|javascript:|data:text\/html)/.test(value)) ||
        (/url\s*\(\s*['"]?https?:/i.test(attribute.value))
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  for (const style of Array.from(documentNode.querySelectorAll('style'))) {
    if (/@import|url\s*\(\s*['"]?https?:/i.test(style.textContent ?? '')) style.remove();
  }
  const root = documentNode.documentElement;
  if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(root);
}

function svgCutContour(documentNode: Document): boolean {
  const named = Array.from(documentNode.querySelectorAll('*')).some((element) => {
    const combined = [
      element.getAttribute('id'),
      element.getAttribute('class'),
      element.getAttribute('inkscape:label'),
      element.getAttribute('data-name'),
      element.getAttribute('aria-label'),
    ]
      .filter(Boolean)
      .join(' ');
    return /(Cut[\s_-]*Contour|Dieline|Die[\s_-]*Cut|Thru[\s_-]*Cut|Kiss[\s_-]*Cut|D[ée]coupe|Trac[ée])/i.test(combined);
  });
  if (named) return true;
  return Array.from(documentNode.querySelectorAll('[stroke]')).some((element) => {
    const stroke = element.getAttribute('stroke')?.replace(/\s/g, '').toLowerCase() ?? '';
    return stroke === '#ff00ff' || stroke === 'magenta' || stroke === 'rgb(255,0,255)';
  });
}

async function analyzeSvg(
  file: File,
  bytes: Uint8Array,
  inheritedWarning?: string,
): Promise<AnalyzedDesignFile> {
  const text = new TextDecoder('utf-8').decode(bytes);
  const documentNode = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (documentNode.querySelector('parsererror') || documentNode.documentElement.localName.toLowerCase() !== 'svg') {
    throw new DesignFileAnalysisError('ملف SVG غير صالح.');
  }

  const root = documentNode.documentElement;
  const widthLength = parseSvgLength(root.getAttribute('width'));
  const heightLength = parseSvgLength(root.getAttribute('height'));
  const viewBoxValues = (root.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const hasViewBox = viewBoxValues.length === 4 && viewBoxValues.every(Number.isFinite) && viewBoxValues[2] > 0 && viewBoxValues[3] > 0;

  let widthMm = widthLength?.mm ?? 0;
  let heightMm = heightLength?.mm ?? 0;
  let confidence: MeasurementConfidence = 'high';
  let measurementSource = 'SVG';
  const warnings: string[] = [];
  if (inheritedWarning) warnings.push(inheritedWarning);

  if (widthLength && heightLength) {
    confidence = widthLength.confidence === 'high' && heightLength.confidence === 'high' ? 'high' : 'medium';
    measurementSource = widthLength.source === heightLength.source ? widthLength.source : `${widthLength.source} / ${heightLength.source}`;
  } else if (hasViewBox) {
    const aspect = viewBoxValues[2] / viewBoxValues[3];
    if (widthLength) {
      heightMm = widthLength.mm / aspect;
      confidence = widthLength.confidence;
      measurementSource = `${widthLength.source} + viewBox`;
    } else if (heightLength) {
      widthMm = heightLength.mm * aspect;
      confidence = heightLength.confidence;
      measurementSource = `${heightLength.source} + viewBox`;
    } else {
      widthMm = viewBoxValues[2] * PX_TO_MM;
      heightMm = viewBoxValues[3] * PX_TO_MM;
      confidence = 'low';
      measurementSource = 'SVG viewBox @ 96 DPI';
      warnings.push('لا يحتوي SVG على وحدة مادية؛ حُوّل viewBox على أساس 96 DPI ويجب مراجعة القياس.');
    }
  }

  if (safePositive(widthMm) === 0 || safePositive(heightMm) === 0) {
    throw new DesignFileAnalysisError('تعذر استخراج قياس SVG. يجب أن يحتوي الملف على width/height أو viewBox صالح.');
  }

  const hasEmbeddedCutContour = svgCutContour(documentNode);
  if (hasEmbeddedCutContour) warnings.push('تم اكتشاف طبقة أو لون يُحتمل أنه مسار قص داخل SVG.');

  let previewDataUrl: string | undefined;
  try {
    const safeSvg = sanitizeSvg(documentNode);
    previewDataUrl = (await imagePreview(new Blob([safeSvg], { type: 'image/svg+xml' }))).dataUrl;
  } catch {
    warnings.push('تعذر إنشاء معاينة SVG، لكن القياسات قُرئت بنجاح.');
  }

  return {
    file,
    format: 'svg',
    mimeType: mimeFor('svg'),
    pages: [
      {
        widthMm: roundMm(widthMm),
        heightMm: roundMm(heightMm),
        measurementSource,
        confidence,
        hasEmbeddedCutContour,
        previewDataUrl,
        warnings,
      },
    ],
  };
}

interface JpegInfo {
  width: number;
  height: number;
  dpiX?: number;
  dpiY?: number;
}

function readU16(bytes: Uint8Array, offset: number, littleEndian = false): number {
  return littleEndian
    ? bytes[offset] | (bytes[offset + 1] << 8)
    : (bytes[offset] << 8) | bytes[offset + 1];
}

function readU32(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  if (littleEndian) {
    return (
      bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)
    ) >>> 0;
  }
  return (
    ((bytes[offset] << 24) >>> 0) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function parseExifResolution(bytes: Uint8Array, start: number, end: number): { x?: number; y?: number } {
  if (start + 14 > end) return {};
  const littleEndian = bytes[start] === 0x49 && bytes[start + 1] === 0x49;
  const bigEndian = bytes[start] === 0x4d && bytes[start + 1] === 0x4d;
  if (!littleEndian && !bigEndian) return {};
  if (readU16(bytes, start + 2, littleEndian) !== 42) return {};
  const ifdOffset = readU32(bytes, start + 4, littleEndian);
  const directory = start + ifdOffset;
  if (directory + 2 > end) return {};
  const count = readU16(bytes, directory, littleEndian);
  let resolutionX: number | undefined;
  let resolutionY: number | undefined;
  let resolutionUnit = 2;

  for (let index = 0; index < count; index += 1) {
    const entry = directory + 2 + index * 12;
    if (entry + 12 > end) break;
    const tag = readU16(bytes, entry, littleEndian);
    const type = readU16(bytes, entry + 2, littleEndian);
    const itemCount = readU32(bytes, entry + 4, littleEndian);
    if ((tag === 0x011a || tag === 0x011b) && type === 5 && itemCount >= 1) {
      const valueOffset = start + readU32(bytes, entry + 8, littleEndian);
      if (valueOffset + 8 <= end) {
        const numerator = readU32(bytes, valueOffset, littleEndian);
        const denominator = readU32(bytes, valueOffset + 4, littleEndian);
        const value = denominator > 0 ? numerator / denominator : undefined;
        if (tag === 0x011a) resolutionX = value;
        else resolutionY = value;
      }
    }
    if (tag === 0x0128 && type === 3 && itemCount >= 1) {
      resolutionUnit = readU16(bytes, entry + 8, littleEndian);
    }
  }

  const factor = resolutionUnit === 3 ? 2.54 : 1;
  return {
    x: resolutionX ? resolutionX * factor : undefined,
    y: resolutionY ? resolutionY * factor : undefined,
  };
}

function parseJpeg(bytes: Uint8Array): JpegInfo {
  let offset = 2;
  let width = 0;
  let height = 0;
  let dpiX: number | undefined;
  let dpiY: number | undefined;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) break;
    if (offset + 2 > bytes.length) break;
    const length = readU16(bytes, offset);
    const dataStart = offset + 2;
    const segmentEnd = offset + length;
    if (length < 2 || segmentEnd > bytes.length) break;

    if (
      marker === 0xe0 &&
      segmentEnd - dataStart >= 12 &&
      String.fromCharCode(...bytes.subarray(dataStart, dataStart + 5)) === 'JFIF\u0000'
    ) {
      const unit = bytes[dataStart + 7];
      const xDensity = readU16(bytes, dataStart + 8);
      const yDensity = readU16(bytes, dataStart + 10);
      if (unit === 1) {
        dpiX = xDensity;
        dpiY = yDensity;
      } else if (unit === 2) {
        dpiX = xDensity * 2.54;
        dpiY = yDensity * 2.54;
      }
    }

    if (
      marker === 0xe1 &&
      segmentEnd - dataStart >= 14 &&
      String.fromCharCode(...bytes.subarray(dataStart, dataStart + 6)) === 'Exif\u0000\u0000'
    ) {
      const resolution = parseExifResolution(bytes, dataStart + 6, segmentEnd);
      dpiX = resolution.x ?? dpiX;
      dpiY = resolution.y ?? dpiY;
    }

    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) &&
      segmentEnd - dataStart >= 5
    ) {
      height = readU16(bytes, dataStart + 1);
      width = readU16(bytes, dataStart + 3);
    }

    offset = segmentEnd;
  }
  return { width, height, dpiX, dpiY };
}

async function analyzeJpeg(
  file: File,
  bytes: Uint8Array,
  inheritedWarning?: string,
): Promise<AnalyzedDesignFile> {
  const parsed = parseJpeg(bytes);
  const preview = await imagePreview(file);
  const pixelWidth = parsed.width || preview.width;
  const pixelHeight = parsed.height || preview.height;
  if (pixelWidth <= 0 || pixelHeight <= 0) throw new DesignFileAnalysisError('تعذر قراءة أبعاد صورة JPG.');

  const detectedDpi = parsed.dpiX && parsed.dpiY ? (parsed.dpiX + parsed.dpiY) / 2 : parsed.dpiX ?? parsed.dpiY;
  const dpi = detectedDpi && detectedDpi > 1 ? detectedDpi : 300;
  const dpiAssumed = !detectedDpi;
  const warnings: string[] = [];
  if (inheritedWarning) warnings.push(inheritedWarning);
  if (dpiAssumed) warnings.push('لا يحتوي JPG على DPI موثوق؛ استُخدم 300 DPI مؤقتاً. راجع القياس قبل الاعتماد.');
  if (!dpiAssumed && dpi < 200) warnings.push(`دقة الصورة ${Math.round(dpi)} DPI منخفضة للطباعة بالحجم المكتشف.`);
  else if (!dpiAssumed && dpi < 300) warnings.push(`دقة الصورة ${Math.round(dpi)} DPI متوسطة؛ يُفضّل 300 DPI للطباعة الدقيقة.`);
  if (Math.abs((parsed.dpiX ?? dpi) - (parsed.dpiY ?? dpi)) > 1) {
    warnings.push('دقة الصورة الأفقية والعمودية مختلفة؛ استُخدم متوسط DPI.');
  }

  return {
    file,
    format: 'jpg',
    mimeType: mimeFor('jpg'),
    pages: [
      {
        widthMm: roundMm((pixelWidth / dpi) * 25.4),
        heightMm: roundMm((pixelHeight / dpi) * 25.4),
        measurementSource: dpiAssumed ? 'JPG pixels @ 300 DPI (مفترض)' : 'JPG EXIF/JFIF DPI',
        confidence: dpiAssumed ? 'low' : 'high',
        pixelWidth,
        pixelHeight,
        dpi: Math.round(dpi * 100) / 100,
        dpiAssumed,
        hasEmbeddedCutContour: false,
        previewDataUrl: preview.dataUrl,
        warnings,
      },
    ],
  };
}

export async function analyzeDesignFile(file: File): Promise<AnalyzedDesignFile> {
  if (file.size <= 0) throw new DesignFileAnalysisError('الملف فارغ.');
  if (file.size > MAX_FILE_BYTES) throw new DesignFileAnalysisError('حجم الملف أكبر من 100MB.');

  const bytes = new Uint8Array(await file.arrayBuffer());
  const checksum = await checksumOf(bytes);
  const detected = detectFormat(file, bytes);
  let analyzed: AnalyzedDesignFile;
  if (detected.format === 'pdf' || detected.format === 'ai') {
    analyzed = await analyzePdf(file, bytes, detected.format, detected.warning);
  } else if (detected.format === 'svg') {
    analyzed = await analyzeSvg(file, bytes, detected.warning);
  } else {
    analyzed = await analyzeJpeg(file, bytes, detected.warning);
  }
  return { ...analyzed, checksum };
}

export function recalculateJpegDimensions(
  page: AnalyzedDesignPage,
  dpi: number,
): AnalyzedDesignPage {
  if (!page.pixelWidth || !page.pixelHeight || !Number.isFinite(dpi) || dpi <= 0) return page;
  return {
    ...page,
    dpi,
    dpiAssumed: false,
    widthMm: roundMm((page.pixelWidth / dpi) * 25.4),
    heightMm: roundMm((page.pixelHeight / dpi) * 25.4),
    measurementSource: 'JPG DPI مُراجع يدوياً',
    confidence: 'high',
    warnings: page.warnings.filter((warning) => !warning.includes('لا يحتوي JPG على DPI')),
  };
}
