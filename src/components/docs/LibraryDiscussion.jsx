/**
 * LibraryDiscussion — star rating and comments of a library document.
 * --------------------------------------------------------------------------
 * Opened from the library viewer. Shows the average rating and lets the
 * student give (or change / remove) their own 1–5 stars — not on their own
 * document. Comments are plain text; the author, the document owner and
 * admins can delete one, anyone else can report it (hidden after several
 * reports, see worker/src/libraryCommunity.js).
 *
 * Props: { user, doc, pseudo, onClose, onChange(libraryPatch, docPatch) }
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Star, X, Send, Trash2, Flag, MessageSquare } from 'lucide-react';
import { useTranslation } from '../../i18n';
import {
  listLibraryComments, addLibraryComment, deleteLibraryComment, reportLibraryComment, rateLibraryDoc,
} from '../../lib/docs';
import { docErrorKey } from './docErrors';

const MAX_LENGTH = 600;

/** Five stars as a radio group: arrows / click to rate, click the current value to clear. */
function StarPicker({ value, onChange, disabled, label }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'inline-flex', gap: 2 }} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n}/5`} disabled={disabled}
          onMouseEnter={() => setHover(n)} onClick={() => onChange(value === n ? 0 : n)}
          onKeyDown={e => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onChange(Math.min(5, (value || 0) + 1)); }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onChange(Math.max(0, (value || 0) - 1)); }
          }}
          style={{ border: 'none', background: 'transparent', padding: 2, cursor: disabled ? 'default' : 'pointer', display: 'flex',
            color: n <= shown ? '#E3B341' : 'var(--text-muted)', opacity: disabled ? .5 : 1 }}>
          <Star size={22} fill={n <= shown ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

export default function LibraryDiscussion({ user, doc, pseudo, onClose, onChange }) {
  const { t, formatDate, formatNumber } = useTranslation();
  const [comments, setComments] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rating, setRating] = useState({ mine: doc.myRating || 0, avg: doc.library.rating, count: doc.library.ratingCount || 0 });
  const listRef = useRef(null);

  useEffect(() => {
    let alive = true;
    listLibraryComments(user, doc.id)
      .then(data => { if (alive) setComments(data.comments); })
      .catch(e => { if (alive) { setComments([]); setError(docErrorKey(e.code)); } });
    return () => { alive = false; };
  }, [user, doc.id]);

  async function rate(stars) {
    const before = rating;
    setRating(r => ({ ...r, mine: stars }));
    try {
      const res = await rateLibraryDoc(user, doc.id, stars);
      setRating({ mine: res.myRating, avg: res.rating, count: res.ratingCount });
      onChange({ rating: res.rating, ratingCount: res.ratingCount }, { myRating: res.myRating });
    } catch (e) {
      setRating(before);
      setError(docErrorKey(e.code));
    }
  }

  async function send(e) {
    e.preventDefault();
    if (text.trim().length < 2) return;
    setBusy(true);
    setError('');
    try {
      const { comment } = await addLibraryComment(user, doc.id, text, pseudo);
      setComments(list => [...(list || []), comment]);
      setText('');
      onChange({ comments: (comments?.length || 0) + 1 });
      setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }), 50);
    } catch (err) {
      setError(docErrorKey(err.code));
    }
    setBusy(false);
  }

  async function remove(c) {
    try {
      await deleteLibraryComment(user, doc.id, c.id);
      setComments(list => list.filter(x => x.id !== c.id));
      onChange({ comments: Math.max(0, (comments?.length || 1) - 1) });
    } catch (err) { setError(docErrorKey(err.code)); }
  }

  async function report(c) {
    try {
      await reportLibraryComment(user, doc.id, c.id);
      setComments(list => list.map(x => (x.id === c.id ? { ...x, reported: true } : x)));
    } catch (err) { setError(docErrorKey(err.code)); }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      role="dialog" aria-modal="true" aria-label={t('libraryTalk.title')}
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <motion.div initial={{ y: 16, scale: .97 }} animate={{ y: 0, scale: 1 }} transition={{ duration: .22, ease: 'easeOut' }}
        style={{ width: 480, maxWidth: '100%', height: 'min(640px, 88vh)', display: 'flex', flexDirection: 'column', gap: 14,
          background: 'var(--bg-modal)', borderRadius: 22, padding: '1.2rem', boxShadow: 'var(--card-shadow)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 36, height: 36, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
            <MessageSquare size={17} aria-hidden="true" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('libraryTalk.title')}</div>
            <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.library.title}</div>
          </div>
          <button type="button" onClick={onClose} aria-label={t('docs.close')}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {/* Rating */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 14, background: 'var(--bg-card)' }}>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1 }}>
              {rating.avg != null ? formatNumber(rating.avg, { maximumFractionDigits: 1 }) : '–'}<span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}> /5</span>
            </div>
            <div style={{ fontSize: '.64rem', color: 'var(--text-muted)' }}>{t('libraryTalk.ratings', { count: rating.count })}</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: '.66rem', color: 'var(--text-muted)', marginBottom: 2 }}>
              {doc.mine ? t('libraryTalk.ownDoc') : rating.mine ? t('libraryTalk.yourRating') : t('libraryTalk.rateIt')}
            </div>
            <StarPicker value={rating.mine} onChange={rate} disabled={doc.mine} label={t('libraryTalk.rateIt')} />
          </div>
        </div>

        {/* Comments */}
        <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }} aria-live="polite">
          {comments === null ? (
            <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{t('common.loading')}</div>
          ) : comments.length === 0 ? (
            <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem 0' }}>{t('libraryTalk.empty')}</div>
          ) : comments.map(c => (
            <div key={c.id} style={{ padding: '8px 11px', borderRadius: 12, background: c.mine ? 'var(--accent-subtle)' : 'var(--bg-card)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <strong style={{ fontSize: '.74rem', color: 'var(--text-primary)' }}>{c.pseudo}</strong>
                <span style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>{formatDate(c.createdAt, { day: 'numeric', month: 'short' })}</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
                  {c.canDelete && (
                    <button type="button" onClick={() => remove(c)} aria-label={t('libraryTalk.delete')} title={t('libraryTalk.delete')}
                      style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 2 }}>
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  )}
                  {!c.mine && (
                    <button type="button" onClick={() => report(c)} disabled={c.reported}
                      aria-label={c.reported ? t('libraryTalk.reported') : t('libraryTalk.report')} title={c.reported ? t('libraryTalk.reported') : t('libraryTalk.report')}
                      style={{ border: 'none', background: 'transparent', color: c.reported ? 'var(--danger)' : 'var(--text-muted)', cursor: c.reported ? 'default' : 'pointer', display: 'flex', padding: 2 }}>
                      <Flag size={13} aria-hidden="true" />
                    </button>
                  )}
                </span>
              </div>
              <div style={{ fontSize: '.8rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>{c.body}</div>
            </div>
          ))}
        </div>

        {error && <div role="alert" style={{ fontSize: '.72rem', color: 'var(--danger)' }}>{t(error)}</div>}

        <form onSubmit={send} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea value={text} onChange={e => setText(e.target.value)} maxLength={MAX_LENGTH} rows={2}
            placeholder={t('libraryTalk.placeholder')} aria-label={t('libraryTalk.placeholder')}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e); }}
            style={{ flex: 1, resize: 'none', padding: '9px 11px', borderRadius: 12, border: '1px solid var(--border)',
              background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.8rem', fontFamily: 'var(--font-family)' }} />
          <button type="submit" disabled={busy || text.trim().length < 2} aria-label={t('libraryTalk.send')} title={t('libraryTalk.send')}
            style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--accent)', color: 'var(--on-accent, #fff)', cursor: busy ? 'default' : 'pointer',
              opacity: busy || text.trim().length < 2 ? .45 : 1 }}>
            <Send size={16} aria-hidden="true" />
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}
