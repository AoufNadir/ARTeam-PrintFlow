import { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileScan,
  FileText,
  ImageIcon,
  Loader2,
  Ruler,
  Scissors,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  analyzeDesignFile,
  DesignFileAnalysisError,
  recalculateJpegDimensions,
  type AnalyzedDesignFile,
  type AnalyzedDesignPage,
} from '@/lib/design-file-analyzer';
import { saveDesignFile } from '@/lib/design-file-storage';
import type { DesignFileAsset, DesignFileMatch, MeasurementConfidence } from '@/lib/design-file-types';
import { cn } from '@/lib/utils';
import type { Sticker } from './montage-data';

const ACCEPTED_FILES = '.pdf,.svg,.ai,.jpg,.jpeg,application/pdf,image/svg+xml,image/jpeg';

interface ReviewItem {
  id: string;
  analysis: AnalyzedDesignFile;
  page: AnalyzedDesignPage;
}

interface PendingReview {
  mode: 'design' | 'contour';
  items: ReviewItem[];
  selectedIds: Set<string>;
  targetStickerId: string;
}

interface DesignFileUploaderProps {
  stickers: Sticker[];
  maxDesigns: number;
  onAddDesigns: (assets: DesignFileAsset[]) => void;
  onAttachCutContour: (stickerId: string, asset: DesignFileAsset) => void;
}

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function confidenceLabel(confidence: MeasurementConfidence): string {
  if (confidence === 'high') return 'قياس مؤكّد';
  if (confidence === 'medium') return 'ثقة متوسطة';
  return 'يحتاج مراجعة';
}

function compareDimensions(
  contourWidth: number,
  contourHeight: number,
  designWidth: number,
  designHeight: number,
): DesignFileMatch {
  const direct = {
    deltaWidthMm: Math.abs(contourWidth - designWidth),
    deltaHeightMm: Math.abs(contourHeight - designHeight),
    rotated: false,
  };
  const rotated = {
    deltaWidthMm: Math.abs(contourWidth - designHeight),
    deltaHeightMm: Math.abs(contourHeight - designWidth),
    rotated: true,
  };
  const directScore = Math.max(direct.deltaWidthMm, direct.deltaHeightMm);
  const rotatedScore = Math.max(rotated.deltaWidthMm, rotated.deltaHeightMm);
  const best = rotatedScore < directScore ? rotated : direct;
  const largestDelta = Math.max(best.deltaWidthMm, best.deltaHeightMm);
  return {
    ...best,
    status: largestDelta <= 0.5 ? 'matched' : largestDelta <= 2 ? 'review' : 'mismatch',
  };
}

function closestSticker(page: AnalyzedDesignPage, stickers: Sticker[]): string {
  let bestId = stickers[0]?.id ?? '';
  let bestScore = Number.POSITIVE_INFINITY;
  for (const sticker of stickers) {
    const match = compareDimensions(page.widthMm, page.heightMm, sticker.widthMm, sticker.heightMm);
    const score = Math.max(match.deltaWidthMm, match.deltaHeightMm);
    if (score < bestScore) {
      bestId = sticker.id;
      bestScore = score;
    }
  }
  return bestId;
}

function assetOf(item: ReviewItem, storageKey: string, match?: DesignFileMatch): DesignFileAsset {
  const { analysis, page } = item;
  return {
    id: makeId('file'),
    storageKey,
    fileName: analysis.file.name,
    fileSize: analysis.file.size,
    checksum: analysis.checksum,
    mimeType: analysis.mimeType,
    format: analysis.format,
    pageNumber: page.pageNumber,
    pageCount: page.pageCount,
    widthMm: page.widthMm,
    heightMm: page.heightMm,
    measurementSource: page.measurementSource,
    confidence: page.confidence,
    pixelWidth: page.pixelWidth,
    pixelHeight: page.pixelHeight,
    dpi: page.dpi,
    dpiAssumed: page.dpiAssumed,
    detectedBleedMm: page.detectedBleedMm,
    hasEmbeddedCutContour: page.hasEmbeddedCutContour,
    match,
    previewDataUrl: page.previewDataUrl,
    warnings: page.warnings,
    uploadedAt: new Date().toISOString(),
  };
}

function fileIcon(item: ReviewItem) {
  if (item.analysis.format === 'jpg') return ImageIcon;
  if (item.analysis.format === 'svg') return FileScan;
  return FileText;
}

export default function DesignFileUploader({
  stickers,
  maxDesigns,
  onAddDesigns,
  onAttachCutContour,
}: DesignFileUploaderProps) {
  const designInputRef = useRef<HTMLInputElement>(null);
  const contourInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<PendingReview | null>(null);

  const placeholderWillBeReplaced = stickers.length === 1 && !stickers[0]?.asset;
  const availableSlots = placeholderWillBeReplaced ? maxDesigns : Math.max(0, maxDesigns - stickers.length);

  const reviewFiles = async (files: File[], mode: 'design' | 'contour') => {
    if (files.length === 0) return;
    if (mode === 'design' && availableSlots <= 0) {
      toast.error(`وصلت إلى الحد الأقصى: ${maxDesigns} تصاميم في الورقة.`);
      return;
    }
    setBusy(true);
    const items: ReviewItem[] = [];
    const errors: string[] = [];
    try {
      for (const file of files) {
        try {
          const analysis = await analyzeDesignFile(file);
          analysis.pages.forEach((page) => {
            const duplicate = stickers.some(
              (sticker) =>
                analysis.checksum &&
                sticker.asset?.checksum === analysis.checksum &&
                (sticker.asset.pageNumber ?? 1) === (page.pageNumber ?? 1),
            );
            if (mode === 'design' && duplicate) {
              errors.push(
                `${file.name}${page.pageNumber ? ` (صفحة ${page.pageNumber})` : ''}: هذا التصميم مضاف مسبقاً.`,
              );
              return;
            }
            items.push({ id: makeId('review'), analysis, page });
          });
        } catch (error) {
          const message =
            error instanceof DesignFileAnalysisError || error instanceof Error
              ? error.message
              : 'تعذر تحليل الملف.';
          errors.push(`${file.name}: ${message}`);
        }
      }
      if (errors.length > 0) toast.error(errors.join('\n'), { duration: 9000 });
      if (items.length === 0) return;

      const selected = new Set<string>();
      const selectionLimit = mode === 'design' ? availableSlots : 1;
      items.slice(0, selectionLimit).forEach((item) => selected.add(item.id));
      const firstPage = items[0].page;
      setPending({
        mode,
        items,
        selectedIds: selected,
        targetStickerId: mode === 'contour' ? closestSticker(firstPage, stickers) : '',
      });
    } finally {
      setBusy(false);
    }
  };

  const updateItemPage = (id: string, updater: (page: AnalyzedDesignPage) => AnalyzedDesignPage) => {
    setPending((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) => (item.id === id ? { ...item, page: updater(item.page) } : item)),
          }
        : current,
    );
  };

  const toggleSelection = (itemId: string) => {
    setPending((current) => {
      if (!current) return current;
      if (current.mode === 'contour') return { ...current, selectedIds: new Set([itemId]) };
      const selectedIds = new Set(current.selectedIds);
      if (selectedIds.has(itemId)) selectedIds.delete(itemId);
      else if (selectedIds.size < availableSlots) selectedIds.add(itemId);
      else toast.error(`يمكن اعتماد ${availableSlots} تصميم إضافي فقط في المونتاج الحالي.`);
      return { ...current, selectedIds };
    });
  };

  const confirmReview = async () => {
    if (!pending || pending.selectedIds.size === 0) return;
    const selectedItems = pending.items.filter((item) => pending.selectedIds.has(item.id));
    if (selectedItems.some((item) => item.page.widthMm <= 0 || item.page.heightMm <= 0)) {
      toast.error('راجع القياسات: العرض والارتفاع يجب أن يكونا أكبر من صفر.');
      return;
    }
    if (pending.mode === 'contour' && !pending.targetStickerId) {
      toast.error('اختر التصميم الذي سيتصل به مسار القص.');
      return;
    }

    setBusy(true);
    try {
      const storageByFile = new Map<File, string>();
      for (const item of selectedItems) {
        if (storageByFile.has(item.analysis.file)) continue;
        const storageKey = makeId('asset');
        await saveDesignFile(storageKey, item.analysis.file);
        storageByFile.set(item.analysis.file, storageKey);
      }

      if (pending.mode === 'design') {
        const assets = selectedItems.map((item) => assetOf(item, storageByFile.get(item.analysis.file)!));
        onAddDesigns(assets);
        toast.success(assets.length === 1 ? 'تم إنشاء بطاقة التصميم من الملف.' : `تم إنشاء ${assets.length} بطاقات تصميم.`);
      } else {
        const item = selectedItems[0];
        const sticker = stickers.find((candidate) => candidate.id === pending.targetStickerId);
        if (!sticker) throw new Error('تعذر العثور على بطاقة التصميم المستهدفة.');
        const match = compareDimensions(item.page.widthMm, item.page.heightMm, sticker.widthMm, sticker.heightMm);
        onAttachCutContour(
          sticker.id,
          assetOf(item, storageByFile.get(item.analysis.file)!, match),
        );
        if (match.status === 'matched') toast.success('تم ربط مسار القص، والقياسات متطابقة.');
        else if (match.status === 'review') toast.warning('تم ربط مسار القص مع فرق صغير في القياسات؛ راجعه قبل التنفيذ.');
        else toast.warning('تم ربط الملف، لكن قياس مسار القص لا يطابق التصميم.');
      }
      setPending(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر حفظ الملف محلياً.');
    } finally {
      setBusy(false);
    }
  };

  const selectedContourItem =
    pending?.mode === 'contour'
      ? pending.items.find((item) => pending.selectedIds.has(item.id))
      : undefined;
  const selectedContourSticker =
    pending?.mode === 'contour'
      ? stickers.find((sticker) => sticker.id === pending.targetStickerId)
      : undefined;
  const contourMatch =
    selectedContourItem && selectedContourSticker
      ? compareDimensions(
          selectedContourItem.page.widthMm,
          selectedContourItem.page.heightMm,
          selectedContourSticker.widthMm,
          selectedContourSticker.heightMm,
        )
      : null;

  return (
    <>
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void reviewFiles(Array.from(event.dataTransfer.files), 'design');
        }}
        className={cn(
          'rounded-[12px] border border-dashed p-3 transition-colors',
          dragging
            ? 'border-[var(--cyan-600)] bg-[var(--cyan-50)]'
            : 'border-[var(--line-strong)] bg-white',
        )}
      >
        <div className="flex items-start gap-2.5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[var(--cyan-50)] text-[var(--cyan-600)]">
            {busy ? <Loader2 size={20} className="animate-spin" /> : <UploadCloud size={20} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-[var(--ink-800)]">ارفع التصميم لاكتشاف القياس</p>
            <p className="mt-0.5 text-[11px] leading-5 text-[var(--ink-400)]">
              PDF / SVG / AI المتوافق مع PDF / JPG — التحليل محلي على هذا الجهاز
            </p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy || availableSlots <= 0}
            onClick={() => designInputRef.current?.click()}
            className="flex h-9 items-center justify-center gap-1.5 rounded-[9px] bg-[var(--cyan-600)] px-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <UploadCloud size={14} />
            رفع تصميم
          </button>
          <button
            type="button"
            disabled={busy || stickers.length === 0}
            onClick={() => contourInputRef.current?.click()}
            className="flex h-9 items-center justify-center gap-1.5 rounded-[9px] border border-[var(--line-strong)] bg-white px-2 text-[12px] font-semibold text-[var(--ink-600)] transition-colors hover:border-[var(--cyan-600)] hover:text-[var(--cyan-600)] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Scissors size={14} />
            رفع tracé découpe
          </button>
        </div>
        <p className="mt-2 flex items-center gap-1 text-[10px] text-[var(--ink-400)]">
          <ShieldCheck size={11} />
          لا تُرسل الملفات إلى الإنترنت. الحد الأقصى 100MB للملف.
        </p>
        <input
          ref={designInputRef}
          className="hidden"
          type="file"
          accept={ACCEPTED_FILES}
          multiple
          onChange={(event) => {
            void reviewFiles(Array.from(event.target.files ?? []), 'design');
            event.target.value = '';
          }}
        />
        <input
          ref={contourInputRef}
          className="hidden"
          type="file"
          accept={ACCEPTED_FILES}
          onChange={(event) => {
            void reviewFiles(Array.from(event.target.files ?? []), 'contour');
            event.target.value = '';
          }}
        />
      </div>

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setPending(null);
        }}
      >
        <DialogContent dir="rtl" className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader className="text-right sm:text-right">
            <DialogTitle>
              {pending?.mode === 'contour' ? 'مراجعة وربط مسار القص' : 'مراجعة التصاميم قبل الإضافة'}
            </DialogTitle>
            <DialogDescription>
              راجع القياسات ومصدرها. لن تُنشأ أو تُعدّل أي بطاقة قبل الضغط على اعتماد.
            </DialogDescription>
          </DialogHeader>

          {pending?.mode === 'contour' && (
            <div className="rounded-[10px] border border-[var(--line)] bg-[var(--paper-50)] p-3">
              <label className="mb-1.5 block text-[12px] font-semibold text-[var(--ink-700)]">ربط المسار بالتصميم</label>
              <select
                value={pending.targetStickerId}
                onChange={(event) => setPending({ ...pending, targetStickerId: event.target.value })}
                className="h-10 w-full rounded-[8px] border border-[var(--line-strong)] bg-white px-3 text-[13px] outline-none focus:border-[var(--cyan-600)]"
              >
                {stickers.map((sticker, index) => (
                  <option key={sticker.id} value={sticker.id}>
                    {sticker.name || `تصميم ${index + 1}`} — {sticker.widthMm}×{sticker.heightMm} مم
                  </option>
                ))}
              </select>
              {contourMatch && (
                <div
                  className={cn(
                    'mt-2 flex items-start gap-2 rounded-[8px] px-2.5 py-2 text-[11px]',
                    contourMatch.status === 'matched' && 'bg-emerald-50 text-emerald-700',
                    contourMatch.status === 'review' && 'bg-amber-50 text-amber-700',
                    contourMatch.status === 'mismatch' && 'bg-red-50 text-red-700',
                  )}
                >
                  {contourMatch.status === 'matched' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                  <span>
                    {contourMatch.status === 'matched'
                      ? 'القياسات متطابقة.'
                      : contourMatch.status === 'review'
                        ? 'يوجد فرق صغير ويجب مراجعته.'
                        : 'قياس مسار القص لا يطابق التصميم.'}
                    {' '}فرق العرض {contourMatch.deltaWidthMm.toFixed(2)} مم، الارتفاع {contourMatch.deltaHeightMm.toFixed(2)} مم
                    {contourMatch.rotated ? ' — المطابقة بعد التدوير' : ''}.
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            {pending?.items.map((item) => {
              const Icon = fileIcon(item);
              const checked = pending.selectedIds.has(item.id);
              return (
                <div
                  key={item.id}
                  className={cn(
                    'rounded-[11px] border p-3 transition-colors',
                    checked ? 'border-[var(--cyan-600)] bg-[var(--cyan-50)]/40' : 'border-[var(--line)] bg-white',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      aria-label={checked ? 'إلغاء اختيار الملف' : 'اختيار الملف'}
                      onClick={() => toggleSelection(item.id)}
                      className={cn(
                        'mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border',
                        checked
                          ? 'border-[var(--cyan-600)] bg-[var(--cyan-600)] text-white'
                          : 'border-[var(--line-strong)] bg-white',
                      )}
                    >
                      {checked && <CheckCircle2 size={13} />}
                    </button>
                    <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--paper-100)]">
                      {item.page.previewDataUrl ? (
                        <img src={item.page.previewDataUrl} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <Icon size={25} className="text-[var(--ink-300)]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p dir="ltr" className="font-latin max-w-full truncate text-[12px] font-semibold text-[var(--ink-800)]">
                          {item.analysis.file.name}
                        </p>
                        {item.page.pageCount && item.page.pageCount > 1 && (
                          <span className="rounded-full bg-[var(--paper-200)] px-2 py-0.5 text-[10px] text-[var(--ink-500)]">
                            صفحة {item.page.pageNumber}/{item.page.pageCount}
                          </span>
                        )}
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                            item.page.confidence === 'high' && 'bg-emerald-50 text-emerald-700',
                            item.page.confidence === 'medium' && 'bg-amber-50 text-amber-700',
                            item.page.confidence === 'low' && 'bg-red-50 text-red-700',
                          )}
                        >
                          {confidenceLabel(item.page.confidence)}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] text-[var(--ink-400)]">
                        {item.analysis.format.toUpperCase()} · {formatBytes(item.analysis.file.size)} · {item.page.measurementSource}
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="text-[10px] text-[var(--ink-500)]">
                          العرض (مم)
                          <input
                            dir="ltr"
                            type="number"
                            min={0.01}
                            step={0.01}
                            value={item.page.widthMm}
                            onChange={(event) =>
                              updateItemPage(item.id, (page) => ({
                                ...page,
                                widthMm: Number(event.target.value),
                                measurementSource: 'قياس راجعه المستخدم',
                                confidence: 'high',
                              }))
                            }
                            className="mt-1 h-8 w-full rounded-[7px] border border-[var(--line-strong)] bg-white px-2 text-center text-[12px] outline-none focus:border-[var(--cyan-600)]"
                          />
                        </label>
                        <label className="text-[10px] text-[var(--ink-500)]">
                          الارتفاع (مم)
                          <input
                            dir="ltr"
                            type="number"
                            min={0.01}
                            step={0.01}
                            value={item.page.heightMm}
                            onChange={(event) =>
                              updateItemPage(item.id, (page) => ({
                                ...page,
                                heightMm: Number(event.target.value),
                                measurementSource: 'قياس راجعه المستخدم',
                                confidence: 'high',
                              }))
                            }
                            className="mt-1 h-8 w-full rounded-[7px] border border-[var(--line-strong)] bg-white px-2 text-center text-[12px] outline-none focus:border-[var(--cyan-600)]"
                          />
                        </label>
                      </div>
                      {item.analysis.format === 'jpg' && item.page.pixelWidth && item.page.pixelHeight && (
                        <label className="mt-2 flex items-center gap-2 text-[10px] text-[var(--ink-500)]">
                          <Ruler size={12} />
                          DPI
                          <input
                            dir="ltr"
                            type="number"
                            min={36}
                            max={2400}
                            step={1}
                            value={item.page.dpi ?? 300}
                            onChange={(event) =>
                              updateItemPage(item.id, (page) =>
                                recalculateJpegDimensions(page, Number(event.target.value)),
                              )
                            }
                            className="h-8 w-24 rounded-[7px] border border-[var(--line-strong)] bg-white px-2 text-center text-[12px] outline-none focus:border-[var(--cyan-600)]"
                          />
                          <span dir="ltr">{item.page.pixelWidth}×{item.page.pixelHeight}px</span>
                        </label>
                      )}
                    </div>
                  </div>
                  {item.page.detectedBleedMm && (
                    <p className="mt-2 rounded-[7px] bg-sky-50 px-2.5 py-1.5 text-[10px] text-sky-700">
                      Bleed مكتشف: أعلى {item.page.detectedBleedMm.top}، أسفل {item.page.detectedBleedMm.bottom}،
                      يمين {item.page.detectedBleedMm.right}، يسار {item.page.detectedBleedMm.left} مم.
                    </p>
                  )}
                  {item.page.warnings.map((warning) => (
                    <p key={warning} className="mt-1.5 flex items-start gap-1 text-[10px] leading-5 text-amber-700">
                      <AlertTriangle size={11} className="mt-1 shrink-0" />
                      {warning}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>

          <DialogFooter className="flex-row justify-start sm:justify-start">
            <button
              type="button"
              disabled={busy || !pending || pending.selectedIds.size === 0}
              onClick={() => void confirmReview()}
              className="flex h-10 items-center justify-center gap-1.5 rounded-[9px] bg-[var(--cyan-600)] px-5 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {pending?.mode === 'contour' ? 'اعتماد وربط المسار' : `اعتماد ${pending?.selectedIds.size ?? 0} تصميم`}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPending(null)}
              className="h-10 rounded-[9px] border border-[var(--line-strong)] bg-white px-4 text-[13px] font-medium text-[var(--ink-600)]"
            >
              إلغاء
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
