/**
 * McqDeck — the multiple-choice side of one flashcard chapter.
 * --------------------------------------------------------------------------
 * Lists the chapter's QCM items (right answer and its traps), lets the student
 * add (write, import from an external AI, or generate) / edit / delete them
 * (McqEditor) and practise them (McqPlayer), either
 * all of them or only the ones missed last time.
 *
 * The parent owns the data and the saving; this component only reports
 * changes through `onChange(items)` and results through `onFinished(results)`.
 *
 * Props: { user, items, cards, onChange(items), onFinished(results) }
 *   `cards` = the chapter's flashcards, offered as a source to the AI.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ListChecks, Plus, Play, RotateCcw, Pencil, Trash2, Check, X, PenLine, Sparkles, ClipboardPaste } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { isAiQuizAvailable } from '../../lib/aiQuiz';
import { Button, EmptyState } from '../ui';
import McqEditor from './McqEditor';
import McqPlayer from './McqPlayer';

export default function McqDeck({ user, items, cards, onChange, onFinished }) {
  const { t } = useTranslation();
  const [editor, setEditor] = useState(null);  // { mode, index? } while the editor is open
  const [playing, setPlaying] = useState(null); // the items of the running practice
  const [confirmDelete, setConfirmDelete] = useState(null); // index awaiting confirmation

  const missed = items.filter(i => i.ok === false);
  const aiOn = isAiQuizAvailable();

  function handleSave(newItems) {
    if (editor?.index !== undefined) {
      onChange(items.map((it, i) => (i === editor.index ? newItems[0] : it)));
    } else {
      onChange([...items, ...newItems]);
    }
  }

  if (playing) {
    return (
      <McqPlayer items={playing} onQuit={() => setPlaying(null)}
        onDone={results => { setPlaying(null); onFinished(results); }} />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, fontSize: '.74rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>{t('mcq.hint')}</div>
        {items.length > 0 && (
          <>
            <Button variant="primary" icon={Play} onClick={() => setPlaying(items)}>
              {t('mcq.practice')} ({items.length})
            </Button>
            {missed.length > 0 && (
              <Button variant="secondary" icon={RotateCcw} onClick={() => setPlaying(missed)}>
                {t('flashcards.toReview')} ({missed.length})
              </Button>
            )}
          </>
        )}
        <Button variant="secondary" icon={Plus} onClick={() => setEditor({ mode: aiOn && cards.length ? 'cards' : 'write' })}>
          {t('mcq.add')}
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={ListChecks} title={t('mcq.emptyTitle')} description={t('mcq.emptyText')}
          action={(
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {aiOn && cards.length > 0 && (
                <Button variant="primary" icon={Sparkles} onClick={() => setEditor({ mode: 'cards' })}>{t('mcq.fromCards')}</Button>
              )}
              {aiOn && (
                <Button variant="secondary" icon={Sparkles} onClick={() => setEditor({ mode: 'notes' })}>{t('mcq.fromNotes')}</Button>
              )}
              <Button variant={aiOn && cards.length > 0 ? 'secondary' : 'primary'} icon={ClipboardPaste}
                onClick={() => setEditor({ mode: 'import' })}>{t('mcq.import')}</Button>
              <Button variant="secondary" icon={PenLine}
                onClick={() => setEditor({ mode: 'write' })}>{t('mcq.write')}</Button>
              {aiOn && (
                <div style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontSize: '.68rem', color: 'var(--text-muted)' }}>
                  <Sparkles size={12} aria-hidden="true" />{t('aiQuota.legend')}
                </div>
              )}
            </div>
          )} />
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((it, i) => (
            <li key={i} style={{ padding: '12px 14px', borderRadius: 14, background: 'var(--bg-card)', display: 'flex', gap: 10 }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, marginTop: 6, borderRadius: '50%', flexShrink: 0,
                background: it.ok === true ? 'var(--success)' : it.ok === false ? 'var(--danger)' : 'var(--border-strong)' }} />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>{it.q}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 99,
                    fontSize: '.72rem', fontWeight: 700, color: 'var(--success)', background: 'var(--bg-card-hover)' }}>
                    <Check size={12} aria-label={t('mcq.rightAnswer')} />{it.a}
                  </span>
                  {it.wrong.map((w, j) => (
                    <span key={j} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 99,
                      fontSize: '.72rem', color: 'var(--text-muted)', background: 'var(--bg-card-hover)' }}>
                      <X size={12} aria-hidden="true" />{w}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button type="button" onClick={() => setEditor({ mode: 'write', index: i })} aria-label={t('common.edit')} title={t('common.edit')}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}>
                  <Pencil size={14} />
                </button>
                <button type="button" onClick={() => setConfirmDelete(i)} aria-label={t('common.delete')} title={t('common.delete')}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <AnimatePresence>
        {editor && (
          <McqEditor user={user} cards={cards} initialMode={editor.mode}
            item={editor.index !== undefined ? items[editor.index] : null}
            onSave={handleSave} onClose={() => setEditor(null)} />
        )}
        {confirmDelete !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            role="dialog" aria-modal="true" aria-label={t('mcq.deleteConfirm')}
            onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(10px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ width: 320, maxWidth: '100%', padding: '1.3rem', borderRadius: 18, background: 'var(--bg-modal)',
              display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: '.92rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('mcq.deleteConfirm')}</div>
              <div style={{ fontSize: '.78rem', color: 'var(--text-secondary)' }}>{items[confirmDelete]?.q}</div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={() => setConfirmDelete(null)}>{t('common.cancel')}</Button>
                <Button variant="primary" danger onClick={() => {
                  onChange(items.filter((_, i) => i !== confirmDelete));
                  setConfirmDelete(null);
                }}>{t('common.delete')}</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
