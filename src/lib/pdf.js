/**
 * PDF.js, loaded on demand.
 * --------------------------------------------------------------------------
 * Browsers' built-in PDF viewers are not reliable inside the app: iOS Safari
 * shows only a picture of the first page, Android Chrome shows nothing. PDF.js
 * (Mozilla's renderer, the one inside Firefox) draws every page ourselves, the
 * same way on every device.
 *
 * It is heavy (~1 MB with its worker), so this module is only ever imported
 * dynamically — when a PDF is opened or uploaded — and never slows down the
 * first load of the app. The worker file is emitted by Vite (`?url`) under the
 * site's base path.
 */

let pdfjsPromise = null;

/** The pdfjs-dist module, configured with its worker. Loaded once. */
export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    });
    pdfjsPromise.catch(() => { pdfjsPromise = null; }); // allow a retry after a network hiccup
  }
  return pdfjsPromise;
}

/** Opens a PDF from bytes (ArrayBuffer / Uint8Array). Caller must `closePdf()` it. */
export async function openPdf(data) {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({ data }).promise;
}

/**
 * Releases a document and its worker-side memory. Never throws, so it is safe
 * in `finally` blocks and React effect cleanups. (pdf.js 6 has no
 * `doc.destroy()` any more: the loading task owns the document.)
 */
export function closePdf(doc) {
  try {
    doc?.loadingTask?.destroy()?.catch(() => {});
  } catch {
    // already released
  }
}

/**
 * First page rendered to a JPEG Blob whose longest side is `maxSize` px —
 * the thumbnail shown on document cards. Resolves to null if the file cannot
 * be read (the card then falls back to the drawn sheet of paper).
 */
export async function renderPdfThumbnail(file, maxSize = 360) {
  let pdf;
  try {
    pdf = await openPdf(new Uint8Array(await file.arrayBuffer()));
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: maxSize / Math.max(base.width, base.height) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.75));
  } catch {
    return null;
  } finally {
    closePdf(pdf);
  }
}
