/**
 * ChapterNotesModal — every highlight and note linked to one chapter.
 * --------------------------------------------------------------------------
 * Opened from a chapter row in Syntheses. Grouped by document; a click opens
 * the PDF at the note's page (DocViewer `initialPage`), where it can be edited.
 *
 * Props: { user, subject, chapterIdx, onClose }
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { StickyNote, X, FileText } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { listChapterAnnotations } from '../../lib/docs';
import DocViewer from './DocViewer';
import { HIGHLIGHT_SWATCH } from './docVisuals';
import { docErrorKey } from './docErrors';

export default function ChapterNotesModal({ user, subject, chapterIdx, onClose }) {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null); // { doc, page }
  const chapterName = subject.chapters?.[chapterIdx]?.name || t('docs.chapterShort', { count: chapterIdx + 1 });

  useEffect(() => {
    if (open) return undefined; // refresh after the viewer closes (notes may have changed)
    let alive = true;
    listChapterAnnotations(user, subject.id, chapterIdx)
      .then(data => { if (alive) setItems(data.annotations); })
      .catch(e => { if (alive) { setItems([]); setError(docErrorKey(e.code)); } });
    return () => { alive = false; };
  }, [user, subject.id, chapterIdx, open]);

  const groups = [];
  for (const a of items || []) {
    const g = groups.find(x => x.doc.id === a.docId);
    if (g) g.notes.push(a); else groups.push({ doc: a.doc, notes: [a] });
  }

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        role="dialog" aria-modal="true" aria-label={t('notes.chapterTitle')}
        onClick={e => e.target === e.currentTarget && onClose()}
        style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <motion.div initial={{ y: 16, scale: .97 }} animate={{ y: 0, scale: 1 }} transition={{ duration: .22, ease: 'easeOut' }}
          style={{ width: 520, maxWidth: '100%', maxHeight: '86vh', display: 'flex', flexDirection: 'column', gap: 12,
            background: 'var(--bg-modal)', borderRadius: 22, padding: '1.2rem', boxShadow: 'var(--card-shadow)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 36, height: 36, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
              <StickyNote size={17} aria-hidden="true" />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('notes.chapterTitle')}</div>
              <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {subject.name} · {chapterName}
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label={t('docs.close')}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {items === null ? (
              <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{t('common.loading')}</div>
            ) : groups.length === 0 ? (
              <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>{t('notes.chapterEmpty')}</div>
            ) : groups.map(g => (
              <section key={g.doc.id}>
                <button type="button" onClick={() => setOpen({ doc: g.doc, page: g.notes[0].page })}
                  style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
                    fontSize: '.78rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  <FileText size={14} color="var(--accent)" aria-hidden="true" />{g.doc.name}
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {g.notes.map(a => (
                    <button key={a.id} type="button" onClick={() => setOpen({ doc: g.doc, page: a.page })}
                      style={{ all: 'unset', cursor: 'pointer', display: 'block', padding: '8px 10px', borderRadius: 12, background: 'var(--bg-card)',
                        borderLeft: `3px solid ${HIGHLIGHT_SWATCH[a.color] || HIGHLIGHT_SWATCH.yellow}` }}>
                      <div style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--accent)', marginBottom: 2 }}>{t('notes.page', { page: a.page })}</div>
                      <div style={{ fontSize: '.76rem', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.45,
                        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>« {a.quote} »</div>
                      {a.note && <div style={{ fontSize: '.78rem', color: 'var(--text-primary)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{a.note}</div>}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
          {error && <div role="alert" style={{ fontSize: '.72rem', color: 'var(--danger)' }}>{t(error)}</div>}
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {open && (
          <DocViewer user={user} docs={[open.doc]} index={0} onIndexChange={() => {}} initialPage={open.page}
            onClose={() => setOpen(null)} />
        )}
      </AnimatePresence>
    </>
  );
}
