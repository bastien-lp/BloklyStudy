/**
 * AnnotationsPanel — my highlights and notes on the open PDF.
 * --------------------------------------------------------------------------
 * Listed in page order: the colour, the highlighted text, an editable note
 * (saved when the field loses focus), colour change, delete, and "go to the
 * page". At the top, the chapter new notes are linked to — which is where
 * they appear in Syntheses.
 *
 * Props: { ann (useAnnotations), subjects, onGoTo(annotation), onClose, narrow }
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { StickyNote, X, Trash2, CornerDownRight } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { HIGHLIGHT_COLORS, HIGHLIGHT_SWATCH } from './docVisuals';

function NoteEditor({ value, onSave, autoFocus, placeholder }) {
  const [text, setText] = useState(value || '');
  const ref = useRef(null);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  return (
    <textarea ref={ref} value={text} onChange={e => setText(e.target.value)} maxLength={2000} rows={2}
      placeholder={placeholder} aria-label={placeholder}
      onBlur={() => { if (text !== (value || '')) onSave(text); }}
      style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '7px 9px', borderRadius: 10, marginTop: 6,
        border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.76rem',
        fontFamily: 'var(--font-family)' }} />
  );
}

export default function AnnotationsPanel({ ann, subjects, onGoTo, onClose, narrow }) {
  const { t } = useTranslation();
  const listRef = useRef(null);
  const subject = subjects.find(s => String(s.id) === String(ann.link.subjectId));
  const chapters = subject?.chapters || [];
  const sorted = [...ann.list].sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);

  // Bring the active note into view.
  useEffect(() => {
    if (!ann.activeId) return;
    listRef.current?.querySelector(`[data-ann="${ann.activeId}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [ann.activeId]);

  const select = {
    padding: '6px 8px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-input)',
    color: 'var(--text-primary)', fontSize: '.72rem', fontFamily: 'var(--font-family)', minWidth: 0, flex: 1,
  };

  return (
    <motion.aside initial={narrow ? { y: 40, opacity: 0 } : { x: 20, opacity: 0 }} animate={{ x: 0, y: 0, opacity: 1 }}
      transition={{ duration: .22, ease: 'easeOut' }} aria-label={t('notes.panelTitle')}
      style={{
        display: 'flex', flexDirection: 'column', gap: 10, padding: '12px', borderRadius: 16, background: 'var(--bg-modal)',
        boxShadow: '0 12px 36px -14px rgba(0,0,0,.6)', boxSizing: 'border-box',
        ...(narrow
          ? { position: 'absolute', left: 8, right: 8, bottom: 8, height: '58%', zIndex: 6 }
          : { width: 320, flexShrink: 0, height: '100%' }),
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <StickyNote size={16} color="var(--accent)" aria-hidden="true" />
        <strong style={{ fontSize: '.85rem', color: 'var(--text-primary)', flex: 1 }}>{t('notes.panelTitle')} · {ann.list.length}</strong>
        <button type="button" onClick={onClose} aria-label={t('docs.close')}
          style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
          <X size={16} />
        </button>
      </div>

      {/* Chapter link for new notes */}
      <div>
        <div style={{ fontSize: '.64rem', color: 'var(--text-muted)', marginBottom: 4 }}>{t('notes.linkTo')}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <select aria-label={t('common.subject')} style={select} value={ann.link.subjectId ?? ''}
            onChange={e => ann.setLink({ subjectId: e.target.value || null, chapterIdx: e.target.value ? 0 : null })}>
            <option value="">{t('notes.noLink')}</option>
            {subjects.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
          </select>
          {chapters.length > 0 && (
            <select aria-label={t('common.chapter')} style={select} value={ann.link.chapterIdx ?? 0}
              onChange={e => ann.setLink(l => ({ ...l, chapterIdx: Number(e.target.value) }))}>
              {chapters.map((c, i) => <option key={i} value={i}>{c.name || t('docs.chapterShort', { count: i + 1 })}</option>)}
            </select>
          )}
        </div>
      </div>

      <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.length === 0 ? (
          <div style={{ fontSize: '.74rem', color: 'var(--text-muted)', lineHeight: 1.55, padding: '8px 2px' }}>{t('notes.empty')}</div>
        ) : sorted.map(a => {
          const active = a.id === ann.activeId;
          return (
            <div key={a.id} data-ann={a.id}
              style={{ padding: '8px 10px', borderRadius: 12, background: active ? 'var(--accent-subtle)' : 'var(--bg-card)',
                borderLeft: `3px solid ${HIGHLIGHT_SWATCH[a.color] || HIGHLIGHT_SWATCH.yellow}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <button type="button" onClick={() => onGoTo(a)}
                  style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: '.64rem', fontWeight: 700, color: 'var(--accent)' }}>
                  <CornerDownRight size={12} aria-hidden="true" />{t('notes.page', { page: a.page })}
                </button>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 3 }}>
                  {HIGHLIGHT_COLORS.map(c => (
                    <button key={c} type="button" onClick={() => ann.update(a.id, { color: c })}
                      aria-label={t('notes.highlightIn', { color: t(`notes.color_${c}`) })} aria-pressed={a.color === c}
                      style={{ width: 14, height: 14, borderRadius: '50%', border: 'none', cursor: 'pointer', background: HIGHLIGHT_SWATCH[c],
                        boxShadow: a.color === c ? '0 0 0 2px var(--bg-modal), 0 0 0 3px var(--text-secondary)' : 'none' }} />
                  ))}
                  <button type="button" onClick={() => ann.remove(a.id)} aria-label={t('notes.delete')} title={t('notes.delete')}
                    style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '0 0 0 4px' }}>
                    <Trash2 size={13} />
                  </button>
                </span>
              </div>
              <button type="button" onClick={() => onGoTo(a)}
                style={{ all: 'unset', cursor: 'pointer', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  fontSize: '.76rem', color: 'var(--text-secondary)', fontStyle: 'italic', lineHeight: 1.45 }}>
                « {a.quote} »
              </button>
              <NoteEditor key={`${a.id}-${active}`} value={a.note} autoFocus={active && !a.note}
                placeholder={t('notes.notePlaceholder')} onSave={note => ann.update(a.id, { note })} />
            </div>
          );
        })}
      </div>
    </motion.aside>
  );
}
