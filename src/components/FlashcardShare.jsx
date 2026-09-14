/**
 * Sharing flashcards inside a group.
 * --------------------------------------------------------------------------
 * Before this, sharing meant retyping a question and an answer by hand, one
 * card per message, with no way to send cards you already had — and saving a
 * received card gave no feedback and happily created duplicates.
 *
 * Three pieces:
 *   - <ShareDeckModal>  : pick cards from your own collection (or write one)
 *                         and send them as a single deck
 *   - <DeckBubble>      : the deck card in the conversation, browsable
 *   - <ImportDeckModal> : import a whole deck into one subject/chapter,
 *                         skipping cards that are already there
 *
 * Storage is untouched: a user's cards stay at
 * `users/{uid}/data/main.flashcards["<subjId>_<chapterIndex>"] = [{ q, a, ok }]`.
 */

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { doc, getDoc } from 'firebase/firestore';
import {
  Layers, Check, X, Search, ChevronLeft, ChevronRight, Download, Send,
} from 'lucide-react';
import { db } from '../firebase/config';
import { useTranslation } from '../i18n';
import { reportSaveError } from '../lib/notify';
import { MAX_DECK_CARDS, cardKey } from '../lib/flashcardDeck';

const overlay = {
  position: 'fixed', inset: 0, zIndex: 1002, padding: '1rem',
  background: 'rgba(0,0,0,.8)', backdropFilter: 'blur(14px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const sheet = {
  width: 420, maxWidth: '100%', maxHeight: '88vh', borderRadius: 20, padding: '1.4rem',
  background: 'var(--bg-modal)', border: '1px solid var(--border-strong)',
  display: 'flex', flexDirection: 'column', gap: 12,
};

const field = {
  width: '100%', padding: '9px 11px', borderRadius: 9, boxSizing: 'border-box',
  border: '1px solid var(--border-strong)', background: 'var(--bg-input)',
  color: 'var(--text-primary)', fontSize: '.83rem', fontFamily: 'inherit',
};

const primaryBtn = {
  padding: '11px', borderRadius: 11, border: 'none', cursor: 'pointer',
  background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: '.83rem',
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
};

/** Chapter list for a subject, falling back to "Chapitre N" when unnamed. */
function chaptersOf(subject, t) {
  if (subject?.chapters?.length) return subject.chapters;
  return Array.from({ length: subject?.chaps || 0 },
    (_, i) => ({ name: t('flashcards.chapterFull', { count: i + 1 }) }));
}

// ── Share ───────────────────────────────────────────────────────────────────

/**
 * Pick cards to share. Two ways in: straight from your own collection (the
 * common case, and the one that was missing), or writing one by hand.
 */
export function ShareDeckModal({ user, onSend, onClose }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState('mine'); // 'mine' | 'write'
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState([]);
  const [flashcards, setFlashcards] = useState({});
  const [subjId, setSubjId] = useState('');
  const [chapIdx, setChapIdx] = useState(0);
  const [picked, setPicked] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let alive = true;
    getDoc(doc(db, 'users', user.uid, 'data', 'main'))
      .then(snap => {
        if (!alive) return;
        const d = snap.exists() ? snap.data() : {};
        const subs = d.subjects || [];
        setSubjects(subs);
        setFlashcards(d.flashcards || {});
        if (subs[0]) setSubjId(String(subs[0].id));
        setLoading(false);
      })
      .catch(e => {
        if (!alive) return;
        reportSaveError(e, 'Groups — load my cards');
        setLoading(false);
      });
    return () => { alive = false; };
  }, [user.uid]);

  const subject = subjects.find(s => String(s.id) === subjId);
  const chapters = chaptersOf(subject, t);
  // Memoised so the filtered list below does not see a brand-new array on
  // every render — the `|| []` fallback would otherwise be a fresh object.
  const bucket = useMemo(
    () => flashcards[`${subjId}_${chapIdx}`] || [],
    [flashcards, subjId, chapIdx],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bucket
      .map((c, i) => ({ ...c, i }))
      .filter(c => !q || (c.q || '').toLowerCase().includes(q) || (c.a || '').toLowerCase().includes(q));
  }, [bucket, search]);

  // Selection is per bucket, so changing chapter starts a fresh selection.
  function switchTo(nextSubj, nextChap) {
    setSubjId(nextSubj);
    setChapIdx(nextChap);
    setPicked(new Set());
    setSearch('');
  }

  function toggle(i) {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else if (next.size < MAX_DECK_CARDS) next.add(i);
      return next;
    });
  }

  function toggleAll() {
    setPicked(prev => {
      if (prev.size >= visible.length) return new Set();
      return new Set(visible.slice(0, MAX_DECK_CARDS).map(c => c.i));
    });
  }

  async function sendPicked() {
    if (!picked.size || sending) return;
    setSending(true);
    const cards = [...picked]
      .sort((a, b) => a - b)
      .map(i => ({ q: bucket[i]?.q || '', a: bucket[i]?.a || '' }))
      .filter(c => c.q.trim());
    const title = subject
      ? `${subject.name} · ${chapters[chapIdx]?.name || t('flashcards.chapterFull', { count: chapIdx + 1 })}`
      : '';
    try { await onSend(cards, title); onClose(); }
    finally { setSending(false); }
  }

  async function sendWritten() {
    if (!question.trim() || !answer.trim() || sending) return;
    setSending(true);
    try { await onSend([{ q: question.trim(), a: answer.trim() }], ''); onClose(); }
    finally { setSending(false); }
  }

  const tabStyle = active => ({
    flex: 1, padding: '7px 10px', borderRadius: 9, cursor: 'pointer', fontSize: '.74rem',
    fontWeight: 700, border: 'none',
    background: active ? 'var(--accent-subtle)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-muted)',
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: .93, y: 18 }} animate={{ scale: 1, y: 0 }} style={sheet}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Layers size={16} strokeWidth={2.2} style={{ color: 'var(--accent)' }} />
          <h3 style={{ margin: 0, fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)', flex: 1 }}>
            {t('groups.shareCardsTitle')}
          </h3>
          <button onClick={onClose} aria-label={t('common.close')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 11, background: 'var(--bg-card)' }}>
          <button style={tabStyle(mode === 'mine')} onClick={() => setMode('mine')}>
            {t('groups.shareFromMine')}
          </button>
          <button style={tabStyle(mode === 'write')} onClick={() => setMode('write')}>
            {t('groups.shareWrite')}
          </button>
        </div>

        {mode === 'write' ? (
          <>
            <div>
              <label style={{ fontSize: '.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                {t('groups.question')}
              </label>
              <textarea value={question} onChange={e => setQuestion(e.target.value)} rows={2}
                style={{ ...field, resize: 'vertical' }} autoFocus />
            </div>
            <div>
              <label style={{ fontSize: '.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                {t('groups.answer')}
              </label>
              <textarea value={answer} onChange={e => setAnswer(e.target.value)} rows={2}
                style={{ ...field, resize: 'vertical' }} />
            </div>
            <button onClick={sendWritten} disabled={!question.trim() || !answer.trim() || sending}
              style={{ ...primaryBtn, opacity: (!question.trim() || !answer.trim()) ? .5 : 1 }}>
              <Send size={14} strokeWidth={2.2} />
              {t('groups.shareSendOne')}
            </button>
          </>
        ) : loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.8rem' }}>
            {t('common.loading')}
          </div>
        ) : subjects.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.8rem' }}>
            {t('flashcards.noSubjectsDeck')}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={subjId} onChange={e => switchTo(e.target.value, 0)} style={{ ...field, flex: 1 }}>
                {subjects.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
              </select>
              <select value={chapIdx} onChange={e => switchTo(subjId, parseInt(e.target.value, 10))}
                style={{ ...field, flex: 1 }}>
                {chapters.map((c, i) => (
                  <option key={i} value={i}>{c.name || t('flashcards.chapterFull', { count: i + 1 })}</option>
                ))}
              </select>
            </div>

            {bucket.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '.78rem' }}>
                {t('groups.shareNoCardsHere')}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                    <Search size={13} style={{
                      position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
                      color: 'var(--text-muted)', pointerEvents: 'none',
                    }} />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                      placeholder={t('groups.shareSearch')} style={{ ...field, paddingLeft: 28 }} />
                  </div>
                  <button onClick={toggleAll}
                    style={{
                      padding: '7px 11px', borderRadius: 9, cursor: 'pointer', fontSize: '.7rem',
                      fontWeight: 700, whiteSpace: 'nowrap',
                      border: '1px solid var(--border-strong)', background: 'var(--bg-card)',
                      color: 'var(--text-secondary)',
                    }}>
                    {picked.size >= visible.length && visible.length > 0
                      ? t('groups.shareSelectNone')
                      : t('groups.shareSelectAll')}
                  </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 90 }}>
                  {visible.map(c => {
                    const on = picked.has(c.i);
                    return (
                      <button key={c.i} onClick={() => toggle(c.i)}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 8, textAlign: 'left',
                          padding: '8px 10px', borderRadius: 9, cursor: 'pointer',
                          background: on ? 'var(--accent-subtle)' : 'var(--bg-card)',
                          border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                        }}>
                        <span style={{
                          width: 15, height: 15, borderRadius: 4, flexShrink: 0, marginTop: 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: on ? 'var(--accent)' : 'transparent',
                          border: `1px solid ${on ? 'var(--accent)' : 'var(--border-strong)'}`,
                        }}>
                          {on && <Check size={10} strokeWidth={3} style={{ color: '#fff' }} />}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{
                            display: 'block', fontSize: '.76rem', color: 'var(--text-primary)',
                            fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {c.q}
                          </span>
                          <span style={{
                            display: 'block', fontSize: '.68rem', color: 'var(--text-muted)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {c.a}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button onClick={sendPicked} disabled={!picked.size || sending}
                  style={{ ...primaryBtn, opacity: picked.size ? 1 : .5 }}>
                  <Send size={14} strokeWidth={2.2} />
                  {t('groups.shareSendCount', { count: picked.size })}
                </button>
                {picked.size >= MAX_DECK_CARDS && (
                  <div style={{ fontSize: '.64rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                    {t('groups.shareMax', { count: MAX_DECK_CARDS })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── Deck bubble ─────────────────────────────────────────────────────────────

/** A shared deck in the conversation: browsable, flippable, importable. */
export function DeckBubble({ msg, onImport }) {
  const { t } = useTranslation();
  const cards = Array.isArray(msg.cards) ? msg.cards : [];
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (!cards.length) return null;
  const card = cards[Math.min(index, cards.length - 1)];

  function go(delta) {
    setIndex(i => (i + delta + cards.length) % cards.length);
    setFlipped(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 210 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <Layers size={14} strokeWidth={2.2} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '.74rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {t('groups.deckShared', { count: cards.length })}
          </div>
          {msg.title && (
            <div style={{
              fontSize: '.66rem', color: 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {msg.title}
            </div>
          )}
        </div>
      </div>

      {/* Preview — tap to flip */}
      <div onClick={() => setFlipped(f => !f)}
        style={{
          padding: '10px 11px', borderRadius: 10, cursor: 'pointer', minHeight: 54,
          background: flipped ? 'var(--accent-subtle)' : 'var(--bg-card)',
          border: '1px solid var(--border)', transition: 'background .25s',
        }}>
        <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', marginBottom: 3 }}>
          {flipped ? t('groups.answer') : t('groups.question')}
        </div>
        <div style={{ fontSize: '.8rem', color: 'var(--text-primary)', lineHeight: 1.4, wordBreak: 'break-word' }}>
          {flipped ? card.a : card.q}
        </div>
      </div>

      {cards.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <button onClick={() => go(-1)} aria-label={t('groups.deckPrev')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex' }}>
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: '.64rem', color: 'var(--text-muted)' }}>
            {index + 1} / {cards.length}
          </span>
          <button onClick={() => go(1)} aria-label={t('groups.deckNext')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex' }}>
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      <button onClick={() => onImport(msg)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          alignSelf: 'flex-start', padding: '6px 13px', borderRadius: 9, border: 'none',
          cursor: 'pointer', background: '#27AE60', color: '#fff', fontSize: '.73rem', fontWeight: 700,
        }}>
        <Download size={12} strokeWidth={2.4} />
        {t('groups.deckImport', { count: cards.length })}
      </button>
    </div>
  );
}

// ── Import ──────────────────────────────────────────────────────────────────

/**
 * Import a deck into one subject/chapter.
 *
 * Cards already present in the target bucket are counted and skipped rather
 * than appended again — importing the same deck twice used to silently double
 * every card.
 */
export function ImportDeckModal({ cards, title, subjects, flashcards, onConfirm, onClose }) {
  const { t } = useTranslation();
  const [subjId, setSubjId] = useState(subjects[0] ? String(subjects[0].id) : '');
  const [chapIdx, setChapIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { added, skipped }

  const subject = subjects.find(s => String(s.id) === subjId);
  const chapters = chaptersOf(subject, t);

  // How many would actually land, given what is already in that chapter.
  const existing = useMemo(() => {
    const bucket = flashcards[`${subjId}_${chapIdx}`] || [];
    return new Set(bucket.map(cardKey));
  }, [flashcards, subjId, chapIdx]);
  const fresh = cards.filter(c => !existing.has(cardKey(c))).length;
  const dupes = cards.length - fresh;

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await onConfirm(cards, parseInt(subjId, 10), chapIdx);
      setResult(r || { added: fresh, skipped: dupes });
      setTimeout(onClose, 1600);
    } finally { setBusy(false); }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: .93, y: 18 }} animate={{ scale: 1, y: 0 }}
        style={{ ...sheet, width: 380 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Download size={16} strokeWidth={2.2} style={{ color: '#27AE60' }} />
          <h3 style={{ margin: 0, fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)', flex: 1 }}>
            {t('groups.importTitle', { count: cards.length })}
          </h3>
          <button onClick={onClose} aria-label={t('common.close')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
            <X size={16} />
          </button>
        </div>

        {title && (
          <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{title}</div>
        )}

        {result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '10px 0' }}>
            <div style={{ fontSize: '.85rem', fontWeight: 700, color: '#27AE60' }}>
              {t('groups.importAdded', { count: result.added })}
            </div>
            {result.skipped > 0 && (
              <div style={{ fontSize: '.74rem', color: 'var(--text-muted)' }}>
                {t('groups.importSkipped', { count: result.skipped })}
              </div>
            )}
          </div>
        ) : subjects.length === 0 ? (
          <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
            {t('flashcards.noSubjectsDeck')}
          </div>
        ) : (
          <>
            <div>
              <label style={{ fontSize: '.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                {t('common.subject')}
              </label>
              <select value={subjId} onChange={e => { setSubjId(e.target.value); setChapIdx(0); }} style={field}>
                {subjects.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                {t('common.chapter')}
              </label>
              <select value={chapIdx} onChange={e => setChapIdx(parseInt(e.target.value, 10))} style={field}>
                {chapters.map((c, i) => (
                  <option key={i} value={i}>{c.name || t('flashcards.chapterFull', { count: i + 1 })}</option>
                ))}
              </select>
            </div>

            <div style={{
              padding: '8px 10px', borderRadius: 9, fontSize: '.72rem', lineHeight: 1.5,
              background: 'var(--bg-card)', color: 'var(--text-muted)',
            }}>
              {t('groups.importPreview', { count: fresh })}
              {dupes > 0 && ` · ${t('groups.importDupes', { count: dupes })}`}
            </div>

            <button onClick={confirm} disabled={busy || fresh === 0}
              style={{ ...primaryBtn, background: '#27AE60', opacity: (busy || fresh === 0) ? .5 : 1 }}>
              <Download size={14} strokeWidth={2.2} />
              {busy ? t('common.loading') : t('groups.importConfirm', { count: fresh })}
            </button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
