/**
 * PdfPages — every page of a PDF, drawn with PDF.js, scrollable.
 * --------------------------------------------------------------------------
 * Replaces the browser's embedded viewer, which showed only the first page as
 * a fixed picture on iOS and nothing at all on Android. Pages are fitted to
 * the available width (capped for comfortable reading on wide screens) and
 * keep their real proportions; zoom goes from 50 % to 300 %.
 *
 * Memory: a page is only drawn while it is near the visible area and its
 * canvas is released once it scrolls far away, so a 300-page handout stays
 * light on a phone. Drawing is sharp on high-density screens (up to 2×).
 *
 * Props: { url, name, onFail() }  — url is an object URL of the PDF bytes.
 * Default export so it can be React.lazy-loaded (PDF.js is ~1 MB).
 */

import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { openPdf, closePdf } from '../../lib/pdf';

const MAX_READING_WIDTH = 900;
const PAGE_GAP = 14;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const MAX_PIXEL_RATIO = 2;

/** One page: a placeholder of the right size, drawn only while near the viewport. */
function PdfPage({ pdf, number, width, ratio, root }) {
  const holderRef = useRef(null);
  const canvasRef = useRef(null);
  const [near, setNear] = useState(false);

  // Near the visible area? (generous margin so pages are ready before they show)
  useEffect(() => {
    const el = holderRef.current;
    if (!el || !root) return undefined;
    const io = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      root, rootMargin: '1200px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  // Draw (or redraw after a zoom / resize); release the bitmap when far away.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    if (!near || !width) {
      canvas.width = 0;
      canvas.height = 0;
      return undefined;
    }
    let task = null;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const page = await pdf.getPage(number);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
        const viewport = page.getViewport({ scale: (width / base.width) * dpr });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        task = page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport });
        await task.promise;
      } catch {
        // Cancelled by a newer render, or a damaged page: the white sheet stays.
      }
    }, 60); // coalesces bursts of zoom / resize events
    return () => { cancelled = true; clearTimeout(timer); task?.cancel(); };
  }, [pdf, number, width, near]);

  return (
    <div ref={holderRef} data-page={number}
      style={{ width, height: width * ratio, flexShrink: 0, background: '#fff', borderRadius: 4,
        boxShadow: '0 6px 22px -10px rgba(0,0,0,.55)', overflow: 'hidden' }}>
      <canvas ref={canvasRef} aria-hidden="true" style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}

export default function PdfPages({ url, name, onFail }) {
  const { t } = useTranslation();
  const scrollRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [ratios, setRatios] = useState([]);     // height / width of each page
  const [status, setStatus] = useState('loading');
  const [boxWidth, setBoxWidth] = useState(0);
  const [zoomIdx, setZoomIdx] = useState(ZOOM_STEPS.indexOf(1));
  const [current, setCurrent] = useState(1);
  const [root, setRoot] = useState(null);

  // Open the document and read every page's proportions (cheap: no drawing).
  useEffect(() => {
    let alive = true;
    let doc = null;
    (async () => {
      try {
        const bytes = await (await fetch(url)).arrayBuffer();
        doc = await openPdf(bytes);
        if (!alive) { closePdf(doc); return; }
        const pages = await Promise.all(Array.from({ length: doc.numPages }, (_, i) => doc.getPage(i + 1)));
        const sizes = pages.map(p => { const vp = p.getViewport({ scale: 1 }); return vp.height / vp.width; });
        if (!alive) return;
        setPdf(doc);
        setRatios(sizes);
        setStatus('ready');
      } catch {
        if (alive) { setStatus('error'); onFail?.(); }
      }
    })();
    return () => { alive = false; closePdf(doc); };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps -- onFail is a fire-and-forget callback

  // Track the available width (window resize, rotation, side panel…).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setBoxWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoom = ZOOM_STEPS[zoomIdx];
  const fitWidth = Math.max(0, Math.min(boxWidth - 24, MAX_READING_WIDTH));
  const pageWidth = Math.round(fitWidth * zoom);

  // "Page 3 / 12": the page crossing the upper third of the viewport.
  function onScroll(e) {
    const el = e.currentTarget;
    const probe = el.scrollTop + el.clientHeight / 3;
    let y = 16;
    for (let i = 0; i < ratios.length; i++) {
      y += pageWidth * ratios[i] + PAGE_GAP;
      if (y > probe) { if (current !== i + 1) setCurrent(i + 1); return; }
    }
  }

  const btn = {
    width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', color: 'var(--text-secondary)',
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={el => { scrollRef.current = el; if (el && el !== root) setRoot(el); }} onScroll={onScroll}
        role="document" aria-label={name}
        style={{ width: '100%', height: '100%', overflow: 'auto', borderRadius: 12, background: 'rgba(0,0,0,.25)',
          WebkitOverflowScrolling: 'touch' }}>
        {status === 'loading' && (
          <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.82rem' }}>{t('common.loading')}</div>
        )}
        {status === 'error' && (
          <div role="alert" style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.82rem' }}>{t('docs.pdfError')}</div>
        )}
        {status === 'ready' && pageWidth > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: zoom > 1 ? 'flex-start' : 'center',
            gap: PAGE_GAP, padding: '16px 12px 72px', width: zoom > 1 ? pageWidth + 24 : 'auto', boxSizing: 'border-box', margin: zoom > 1 ? 0 : '0 auto' }}>
            {ratios.map((ratio, i) => (
              <PdfPage key={i} pdf={pdf} number={i + 1} width={pageWidth} ratio={ratio} root={root} />
            ))}
          </div>
        )}
      </div>

      {status === 'ready' && (
        <div style={{ position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center',
          gap: 2, padding: '4px 6px', borderRadius: 99, background: 'var(--bg-modal)', boxShadow: '0 8px 24px -8px rgba(0,0,0,.6)' }}>
          <button type="button" style={{ ...btn, opacity: zoomIdx > 0 ? 1 : .35 }} disabled={zoomIdx === 0}
            onClick={() => setZoomIdx(z => Math.max(0, z - 1))} aria-label={t('docs.zoomOut')} title={t('docs.zoomOut')}>
            <ZoomOut size={16} />
          </button>
          <button type="button" style={{ ...btn, width: 'auto', padding: '0 8px', fontSize: '.72rem', fontWeight: 700 }}
            onClick={() => setZoomIdx(ZOOM_STEPS.indexOf(1))} aria-label={t('docs.fitWidth')} title={t('docs.fitWidth')}>
            {zoom === 1 ? <Maximize2 size={14} /> : `${Math.round(zoom * 100)} %`}
          </button>
          <button type="button" style={{ ...btn, opacity: zoomIdx < ZOOM_STEPS.length - 1 ? 1 : .35 }} disabled={zoomIdx === ZOOM_STEPS.length - 1}
            onClick={() => setZoomIdx(z => Math.min(ZOOM_STEPS.length - 1, z + 1))} aria-label={t('docs.zoomIn')} title={t('docs.zoomIn')}>
            <ZoomIn size={16} />
          </button>
          <span aria-live="polite" style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-secondary)', padding: '0 8px 0 4px',
            fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {t('docs.pageOf', { page: current, total: ratios.length })}
          </span>
        </div>
      )}
    </div>
  );
}
