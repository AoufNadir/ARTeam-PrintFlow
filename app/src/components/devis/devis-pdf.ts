// ---------------------------------------------------------------------------
// Devis PDF export — REAL Arabic PDF.
//
// The on-screen paper document (DevisDocument) already renders fully-shaped
// Arabic with the brand identity, so instead of re-drawing a Latin-only
// approximation with jsPDF vector calls (the old latinSafe approach erased
// all Arabic), we rasterize the actual document with html2canvas and place
// the image into a multi-page A4 jsPDF. The output keeps the exact visual
// identity: letterhead, Arabic client block, items table, totals, frozen
// rules banner and the CMYK footer strip.
// ---------------------------------------------------------------------------

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Client, Devis, Project } from '@/lib/types';
import DevisDocument from './DevisDocument';

const PAGE_W_MM = 210;
const PAGE_H_MM = 297;
/** A4 width at 96 CSS-dpi; html2canvas scale doubles the pixel density. */
const RENDER_WIDTH_PX = 794;
const CAPTURE_SCALE = 2;

/**
 * Mount a print copy of DevisDocument off-screen, let fonts/images settle,
 * capture it to a canvas, then unmount and clean up.
 */
async function renderDevisCanvas(devis: Devis, client?: Client, project?: Project): Promise<HTMLCanvasElement> {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.width = `${RENDER_WIDTH_PX}px`;
  host.style.background = '#ffffff';
  host.setAttribute('aria-hidden', 'true');
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    flushSync(() => {
      root.render(
        createElement(DevisDocument, {
          devis,
          client,
          project,
          unit: 'cm',
          animated: false,
        }),
      );
    });
    // wait for webfonts (Cairo / Space Grotesk) and the logo SVG
    await document.fonts.ready;
    const imgs = Array.from(host.querySelectorAll('img'));
    await Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }),
      ),
    );
    // one extra frame so final layout paint is committed
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const target = (host.firstElementChild as HTMLElement | null) ?? host;
    return await html2canvas(target, {
      scale: CAPTURE_SCALE,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });
  } finally {
    root.unmount();
    host.remove();
  }
}

/** Slice a tall canvas into A4 pages and add each slice to the document. */
function addCanvasToDoc(doc: jsPDF, canvas: HTMLCanvasElement, firstPage: boolean): void {
  const pxPerMm = canvas.width / PAGE_W_MM;
  const pagePx = Math.floor(PAGE_H_MM * pxPerMm);
  let offset = 0;
  let page = 0;
  while (offset < canvas.height) {
    const sliceH = Math.min(pagePx, canvas.height - offset);
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = sliceH;
    const ctx = slice.getContext('2d');
    if (!ctx) break;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, offset, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
    if (!firstPage || page > 0) doc.addPage();
    doc.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, PAGE_W_MM, sliceH / pxPerMm);
    offset += pagePx;
    page += 1;
  }
}

/** Export one Devis as `<number>.pdf` — fully Arabic, multi-page A4. */
export async function exportDevisPdf(devis: Devis, client?: Client, project?: Project): Promise<void> {
  const canvas = await renderDevisCanvas(devis, client, project);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  addCanvasToDoc(doc, canvas, true);
  doc.save(`${devis.number}.pdf`);
}

/** Combined export: each selected Devis starts on a fresh A4 page in one file. */
export async function exportDevisPdfCombined(
  entries: { devis: Devis; client?: Client; project?: Project }[],
  filename = 'devis-export.pdf',
): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  for (let i = 0; i < entries.length; i++) {
    const canvas = await renderDevisCanvas(entries[i].devis, entries[i].client, entries[i].project);
    addCanvasToDoc(doc, canvas, i === 0);
  }
  doc.save(filename);
}
