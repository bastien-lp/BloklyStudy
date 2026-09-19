/**
 * DocViewer — full-screen reader for one document, with prev/next.
 * --------------------------------------------------------------------------
 * PDFs are drawn page by page with PDF.js (PdfPages.jsx), images get a
 * click-to-zoom view, text files are shown as text, and office files — which
 * browsers cannot render — get a download card. Keyboard: ← → to move,
 * Esc to close. `actions(doc)` lets the caller add buttons (share, delete…).
 *
 * Props: { user, docs, index, onIndexChange, onClose, actions? }
 */

import { lazy, Suspense, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Download, ExternalLink, X, ZoomIn, ZoomOut, AlertTriangle } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { getDocObjectUrl, formatBytes } from '../../lib/docs';
import { Button } from '../ui';
import DocCover from './DocCover';
import { visualFor, byteUnits } from './docVisuals';

// PDF.js is ~1 MB: only fetched the first time a PDF is opened.
const PdfPages = lazy(() => import('./PdfPages'));

const iconBtn = {
  width: 36, height: 36, borderRadius: '50%', border: 'none', cursor: 'pointer', flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--bg-card-hover)', color: 'var(--text-secondary)',
};

export default function DocViewer({ user, docs, index, onIndexChange, onClose, actions }) {
  const { t, formatNumber, formatDate } = useTranslation();
  const doc = docs[index];
  const [state, setState] = useState({ id: null, url: null, text: null, error: null });
  const [zoomed, setZoomed] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(null); // id of a PDF PDF.js could not read
  const loaded = state.id === doc?.id;

  // Load the current file (object URL; the text itself for text files).
  useEffect(() => {
    if (!doc) return undefined;
    let alive = true;
    getDocObjectUrl(user, doc.id, 'file')
      .then(async url => {
        const text = doc.kind === 'text' ? await (await fetch(url)).text() : null;
        if (alive) setState({ id: doc.id, url, text, error: null });
      })
      .catch(e => { if (alive) setState({ id: doc.id, url: null, text: null, error: e.code || 'failed' }); });
    return () => { alive = false; };
  }, [user, doc]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && index > 0) { setZoomed(false); onIndexChange(index - 1); }
      else if (e.key === 'ArrowRight' && index < docs.length - 1) { setZoomed(false); onIndexChange(index + 1); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, docs.length, onClose, onIndexChange]);

  if (!doc) return null;
  const { icon: KindIcon, tint } = visualFor(doc.kind);
  const go = next => { setZoomed(false); onIndexChange(next); };

  function renderBody() {
    if (state.error && loaded) {
      return (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={28} color="var(--warning)" aria-hidden="true" />
          <div style={{ fontSize: '.85rem' }}>{t(state.error === 'not_found' ? 'docs.notAvailable' : 'docs.loadError')}</div>
        </div>
      );
    }
    if (!loaded) {
      return (
        <motion.div animate={{ opacity: [.35, 1, .35] }} transition={{ duration: 1.4, repeat: Infinity }}
          style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>{t('common.loading')}</motion.div>
      );
    }
    if (doc.kind === 'pdf') {
      // PDF.js draws every page the same way on every device. If it cannot
      // read the file, fall back to the browser's own viewer.
      if (pdfFailed === doc.id) {
        return <iframe src={state.url} title={doc.name} style={{ width: '100%', height: '100%', border: 'none', borderRadius: 12, background: '#fff' }} />;
      }
      return (
        <Suspense fallback={<div style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>{t('common.loading')}</div>}>
          <PdfPages key={doc.id} url={state.url} name={doc.name} onFail={() => setPdfFailed(doc.id)} />
        </Suspense>
      );
    }
    if (doc.kind === 'image') {
      return (
        <div style={{ width: '100%', height: '100%', overflow: zoomed ? 'auto' : 'hidden', display: 'flex',
          alignItems: zoomed ? 'flex-start' : 'center', justifyContent: zoomed ? 'flex-start' : 'center' }}>
          <img src={state.url} alt={doc.name} onClick={() => setZoomed(z => !z)}
            style={zoomed
              ? { maxWidth: 'none', cursor: 'zoom-out', display: 'block' }
              : { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', cursor: 'zoom-in', borderRadius: 10 }} />
        </div>
      );
    }
    if (doc.kind === 'text') {
      return (
        <pre style={{ width: '100%', height: '100%', margin: 0, overflow: 'auto', padding: '1.2rem 1.4rem', boxSizing: 'border-box',
          background: 'var(--bg-card)', borderRadius: 12, color: 'var(--text-primary)', fontSize: '.85rem', lineHeight: 1.65,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
          {state.text}
        </pre>
      );
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center', maxWidth: 300 }}>
        <div style={{ width: 180 }}><DocCover user={user} doc={doc} height={135} /></div>
        <div style={{ fontSize: '.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t('docs.previewUnavailable')}</div>
        <div style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>{t('docs.previewDownloadHint')}</div>
        <Button variant="primary" icon={Download}
          onClick={() => { const a = document.createElement('a'); a.href = state.url; a.download = doc.name; a.click(); }}>
          {t('docs.download')}
        </Button>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      role="dialog" aria-modal="true" aria-label={doc.name}
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(12,10,8,.82)', backdropFilter: 'blur(12px)',
        display: 'flex', flexDirection: 'column', padding: 'clamp(8px, 2vw, 20px)', gap: 12 }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 8px 14px', borderRadius: 16,
        background: 'var(--bg-modal)', boxShadow: 'var(--card-shadow)' }}>
        <span style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${tint}22`, color: tint }}>
          <KindIcon size={17} strokeWidth={2} aria-hidden="true" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '.88rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
          <div style={{ fontSize: '.66rem', color: 'var(--text-muted)' }}>
            {formatBytes(doc.size, formatNumber, byteUnits(t))}
            {' · '}{formatDate(doc.sharedAt || doc.createdAt, { day: 'numeric', month: 'short' })}
            {doc.sharedBy && !doc.mine ? ` · ${t('docs.sharedBy', { name: doc.sharedBy })}` : ''}
            {docs.length > 1 ? ` · ${t('docs.counter', { index: index + 1, total: docs.length })}` : ''}
          </div>
        </div>
        {actions && actions(doc)}
        {doc.kind === 'image' && loaded && !state.error && (
          <button style={iconBtn} onClick={() => setZoomed(z => !z)} aria-label={t(zoomed ? 'docs.zoomOut' : 'docs.zoomIn')} title={t(zoomed ? 'docs.zoomOut' : 'docs.zoomIn')}>
            {zoomed ? <ZoomOut size={16} /> : <ZoomIn size={16} />}
          </button>
        )}
        {state.url && loaded && (
          <>
            <a href={state.url} target="_blank" rel="noopener noreferrer" style={iconBtn} aria-label={t('docs.openNewTab')} title={t('docs.openNewTab')}>
              <ExternalLink size={16} />
            </a>
            <a href={state.url} download={doc.name} style={iconBtn} aria-label={t('docs.download')} title={t('docs.download')}>
              <Download size={16} />
            </a>
          </>
        )}
        <button style={{ ...iconBtn, background: 'transparent' }} onClick={onClose} aria-label={t('docs.close')} title={t('docs.close')}>
          <X size={18} />
        </button>
      </div>

      {/* Body + side arrows */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
        {docs.length > 1 && (
          <button style={{ ...iconBtn, visibility: index > 0 ? 'visible' : 'hidden' }} onClick={() => go(index - 1)} aria-label={t('docs.prev')}>
            <ChevronLeft size={20} />
          </button>
        )}
        <AnimatePresence mode="wait">
          <motion.div key={doc.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: .2, ease: 'easeOut' }}
            style={{ flex: 1, height: '100%', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {renderBody()}
          </motion.div>
        </AnimatePresence>
        {docs.length > 1 && (
          <button style={{ ...iconBtn, visibility: index < docs.length - 1 ? 'visible' : 'hidden' }} onClick={() => go(index + 1)} aria-label={t('docs.next')}>
            <ChevronRight size={20} />
          </button>
        )}
      </div>
    </motion.div>
  );
}
