export type DesignFileFormat = 'pdf' | 'svg' | 'ai' | 'jpg';

export type MeasurementConfidence = 'high' | 'medium' | 'low';

export interface DesignBleedBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface DesignFileMatch {
  status: 'matched' | 'review' | 'mismatch';
  deltaWidthMm: number;
  deltaHeightMm: number;
  rotated: boolean;
}

/**
 * Persisted metadata for an uploaded artwork or cut-contour file.
 *
 * The original binary lives in IndexedDB under `storageKey`; only the compact
 * metadata and a small raster preview are kept in the montage draft.
 */
export interface DesignFileAsset {
  id: string;
  storageKey: string;
  fileName: string;
  fileSize: number;
  /** SHA-256 used to detect accidental duplicate uploads. */
  checksum?: string;
  mimeType: string;
  format: DesignFileFormat;
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
  hasEmbeddedCutContour?: boolean;
  match?: DesignFileMatch;
  previewDataUrl?: string;
  warnings: string[];
  uploadedAt: string;
}

export function designNameFromAsset(asset: DesignFileAsset): string {
  const base = asset.fileName.replace(/\.[^.]+$/, '').trim() || 'تصميم';
  return asset.pageCount && asset.pageCount > 1 ? `${base} — صفحة ${asset.pageNumber}` : base;
}
