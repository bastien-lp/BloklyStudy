/**
 * PdfPages — every page of a PDF, drawn with PDF.js, scrollable, annotatable.
 * --------------------------------------------------------------------------
 * Replaces the browser's embedded viewer, which showed only the first page as
 * a fixed picture on iOS and nothing at all on Android. Pages are fitted to
 * the available width (capped for comfortable reading on wide screens) and
 * keep their real proportions; zoom goes from 50 % to 300 %.
 *
 * Each page has three layers: the drawn canvas, the reader's saved
 * highlights, and PDF.js's invisible text layer on top (so text can be
 * selected). Selecting text shows a small toolbar: highlight in a colour, or
 * highlight + note. Highlight positions are page fractions, so they stay put
 * at any zoom. Clicking a highlight reports it to the parent.
 *
 * Memory: a page is only drawn while it is near the visible area and its
 * canvas / text are released once it scrolls far away, so a 300-page
 * handout stays light on a phone. Drawing is sharp on high-density screens.
 *
 * Props: { url, name, onFail(), annotations?, activeId?, onCreate?(selection, { color, withNote }),
 *          onOpenAnnotation?(annotation), jumpTo?: { page, nonce } }
 * Default export so it can be React.lazy-loaded (PDF.js is ~1 MB).
 */

import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2, StickyNote } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { openPdf, closePdf, loadPdfjs } from '../../lib/pdf';
import { HIGHLIGHT_COLORS, HIGHLIGHT_SWATCH as SWATCH } from './docVisuals';
import './pdfTextLayer.css';

const MAX_READING_WIDTH = 900;
const PAGE_GAP = 14;
const PAD_TOP = 16;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const MAX_PIXEL_RATIO = 2;

/** One page: a placeholder of the right size, drawn only while near the viewport. */
function PdfPage({ pdf, number, width, ratio, root, highlights, activeId }) {
  const holderRef = useRef(null);
  const canvasRef = useRef(null);
  const textRef = useRef(null);
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

  // Draw (or redraw after a zoom / resize); release the bitmap and text when far away.
  useEffect(() => {
    const canvas = canvasRef.current;
    const textDiv = textRef.current;
    if (!canvas || !textDiv) return undefined;
    if (!near || !width) {
      canvas.width = 0;
      canvas.height = 0;
      textDiv.replaceChildren();
      return undefined;
    }
    let task = null;
    let textLayer = null;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const page = await pdf.getPage(number);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const cssScale = width / base.width;
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
        const viewport = page.getViewport({ scale: cssScale * dpr });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        task = page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport });
        await task.promise;
        if (cancelled) return;

        // Invisible, selectable text laid exactly over the drawing.
        const { TextLayer } = await loadPdfjs();
        if (cancelled) return;
        textDiv.replaceChildren();
        textDiv.style.setProperty('--total-scale-factor', String(cssScale));
        textDiv.style.setProperty('--scale-round-x', '1px');
        textDiv.style.setProperty('--scale-round-y', '1px');
        textLayer = new TextLayer({
          textContentSource: page.streamTextContent(),
          container: textDiv,
          viewport: page.getViewport({ scale: cssScale }),
        });
        await textLayer.render();
      } catch {
        // Cancelled by a newer render, or a damaged page: the white sheet stays.
      }
    }, 60); // coalesces bursts of zoom / resize events
    return () => { cancelled = true; clearTimeout(timer); task?.cancel(); textLayer?.cancel(); };
  }, [pdf, number, width, near]);

  return (
    <div ref={holderRef} data-page={number}
      style={{ position: 'relative', width, height: width * ratio, flexShrink: 0, background: '#fff', borderRadius: 4,
        boxShadow: '0 6px 22px -10px rgba(0,0,0,.55)', overflow: 'hidden' }}>
      <canvas ref={canvasRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      {highlights.map(a => a.rects.map(([x, y, w, h], i) => (
        <div key={`${a.id}-${i}`} className={`pdfHighlight ${a.color}${a.id === activeId ? ' active' : ''}`}
          style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` }} />
      )))}
      <div ref={textRef} className="textLayer" />
    </div>
  );
}

/**
 * The current selection as a highlight: its page, rectangles in page
 * fractions (merged per line) and text. Null if nothing usable is selected.
 */
function readSelection(scrollEl) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  const startEl = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
  const holder = startEl?.closest?.('[data-page]');
  if (!holder || !scrollEl.contains(holder)) return null;
  const box = holder.getBoundingClientRect();
  const lines = [];
  for (const r of range.getClientRects()) {
    if (r.width < 1 || r.height < 1) continue;
    const left = Math.max(r.left, box.left);
    const right = Math.min(r.right, box.right);
    const top = Math.max(r.top, box.top);
    const bottom = Math.min(r.bottom, box.bottom);
    if (right <= left || bottom <= top) continue; // outside this page (multi-page selections keep the first page)
    const rect = [(left - box.left) / box.width, (top - box.top) / box.height, (right - left) / box.width, (bottom - top) / box.height];
    // Merge with a rectangle on the same line.
    const same = lines.find(l => Math.abs(l[1] - rect[1]) < rect[3] * 0.5 && Math.abs(l[3] - rect[3]) < rect[3] * 0.6);
    if (same) {
      const x1 = Math.min(same[0], rect[0]);
      const x2 = Math.max(same[0] + same[2], rect[0] + rect[2]);
      same[0] = x1; same[2] = x2 - x1;
    } else {
      lines.push(rect);
    }
  }
  const quote = sel.toString().replace(/\s+/g, ' ').trim();
  if (!lines.length || !quote) return null;
  const last = range.getBoundingClientRect();
  const host = scrollEl.getBoundingClientRect();
  return {
    page: Number(holder.dataset.page),
    rects: lines.slice(0, 60),
    quote: quote.slice(0, 1000),
    // Toolbar anchor, relative to the viewer.
    x: Math.min(Math.max(last.left + last.width / 2 - host.left, 90), host.width - 90),
    y: Math.max(last.top - host.top - 8, 44),
  };
}

export default function PdfPages({ url, name, onFail, annotations = [], activeId, onCreate, onOpenAnnotation, jumpTo }) {
  const { t } = useTranslation();
  const scrollRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [ratios, setRatios] = useState([]);     // height / width of each page
  const [status, setStatus] = useState('loading');
  const [boxWidth, setBoxWidth] = useState(0);
  const [zoomIdx, setZoomIdx] = useState(ZOOM_STEPS.indexOf(1));
  const [current, setCurrent] = useState(1);
  const [root, setRoot] = useState(null);
  const [selection, setSelection] = useState(null); // pending text selection → toolbar

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

  // Touch screens adjust a selection with handles after the finger lifts:
  // follow the browser's selection changes too (debounced).
  useEffect(() => {
    if (!onCreate) return undefined;
    let timer = null;
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const el = scrollRef.current;
        const sel = window.getSelection();
        if (!el || !sel || sel.isCollapsed || !sel.rangeCount || !el.contains(sel.anchorNode)) return;
        const next = readSelection(el);
        if (next) setSelection(next);
      }, 350);
    };
    document.addEventListener('selectionchange', onChange);
    return () => { clearTimeout(timer); document.removeEventListener('selectionchange', onChange); };
  }, [onCreate]);

  // Scroll to a page on request (notes panel, chapter notes).
  useEffect(() => {
    if (!jumpTo || status !== 'ready' || !pageWidth) return;
    const el = scrollRef.current?.querySelector(`[data-page="${jumpTo.page}"]`);
    if (el) scrollRef.current.scrollTo({ top: el.offsetTop - PAD_TOP, behavior: 'smooth' });
  }, [jumpTo, status, pageWidth]);

  // "Page 3 / 12": the page crossing the upper third of the viewport.
  function onScroll(e) {
    if (selection) setSelection(null);
    const el = e.currentTarget;
    const probe = el.scrollTop + el.clientHeight / 3;
    let y = PAD_TOP;
    for (let i = 0; i < ratios.length; i++) {
      y += pageWidth * ratios[i] + PAGE_GAP;
      if (y > probe) { if (current !== i + 1) setCurrent(i + 1); return; }
    }
  }

  // After a selection gesture: toolbar for a selection, or open a clicked highlight.
  function onPointerUp(e) {
    if (!onCreate) return;
    setTimeout(() => { // let the browser finalise the selection first
      const sel = readSelection(scrollRef.current);
      if (sel) { setSelection(sel); return; }
      setSelection(null);
      const holder = e.target.closest?.('[data-page]');
      if (!holder || !onOpenAnnotation) return;
      const box = holder.getBoundingClientRect();
      const px = (e.clientX - box.left) / box.width;
      const py = (e.clientY - box.top) / box.height;
      const page = Number(holder.dataset.page);
      const hit = annotations.find(a => a.page === page &&
        a.rects.some(([x, y, w, h]) => px >= x && px <= x + w && py >= y && py <= y + h));
      if (hit) onOpenAnnotation(hit);
    }, 10);
  }

  function create(color, withNote) {
    if (!selection) return;
    onCreate(selection, { color, withNote });
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }

  const btn = {
    width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', color: 'var(--text-secondary)',
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={el => { scrollRef.current = el; if (el && el !== root) setRoot(el); }} onScroll={onScroll}
        onMouseUp={onPointerUp} onTouchEnd={e => onPointerUp(e.changedTouches?.[0] ? { target: e.target, clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY } : e)}
        role="document" aria-label={name}
        style={{ width: '100%', height: '100%', overflow: 'auto', borderRadius: 12, background: 'rgba(0,0,0,.25)',
          WebkitOverflowScrolling: 'touch', position: 'relative' }}>
        {status === 'loading' && (
          <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.82rem' }}>{t('common.loading')}</div>
        )}
        {status === 'error' && (
          <div role="alert" style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.82rem' }}>{t('docs.pdfError')}</div>
        )}
        {status === 'ready' && pageWidth > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: zoom > 1 ? 'flex-start' : 'center',
            gap: PAGE_GAP, padding: `${PAD_TOP}px 12px 72px`, width: zoom > 1 ? pageWidth + 24 : 'auto', boxSizing: 'border-box', margin: zoom > 1 ? 0 : '0 auto' }}>
            {ratios.map((ratio, i) => (
              <PdfPage key={i} pdf={pdf} number={i + 1} width={pageWidth} ratio={ratio} root={root}
                highlights={annotations.filter(a => a.page === i + 1)} activeId={activeId} />
            ))}
          </div>
        )}
      </div>

      {/* Selection toolbar */}
      {selection && (
        <div role="toolbar" aria-label={t('notes.toolbar')}
          onMouseDown={e => e.preventDefault()} /* keep the text selected while clicking */
          style={{ position: 'absolute', left: selection.x, top: selection.y, transform: 'translate(-50%, -100%)', zIndex: 5,
            display: 'flex', alignItems: 'center', gap: 4, padding: '5px 6px', borderRadius: 99, background: 'var(--bg-modal)',
            boxShadow: '0 10px 28px -10px rgba(0,0,0,.65)' }}>
          {HIGHLIGHT_COLORS.map(c => (
            <button key={c} type="button" onClick={() => create(c, false)} aria-label={t('notes.highlightIn', { color: t(`notes.color_${c}`) })}
              title={t('notes.highlightIn', { color: t(`notes.color_${c}`) })}
              style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--bg-modal)', boxShadow: '0 0 0 1px var(--border)',
                background: SWATCH[c], cursor: 'pointer' }} />
          ))}
          <button type="button" onClick={() => create('yellow', true)}
            style={{ ...btn, width: 'auto', height: 28, padding: '0 10px', gap: 5, borderRadius: 99, fontSize: '.72rem', fontWeight: 700,
              background: 'var(--accent)', color: 'var(--on-accent, #fff)' }}>
            <StickyNote size={14} aria-hidden="true" />{t('notes.addNote')}
          </button>
        </div>
      )}

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
