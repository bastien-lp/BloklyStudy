/**
 * QuizSetupModal — start a live quiz in a study group.
 * --------------------------------------------------------------------------
 * Source: a deck already shared in this group's chat, or one of my own
 * flashcard chapters. Settings: how many questions, how long to answer, and
 * how long the right answer stays on screen.
 * Needs at least 4 cards with different answers (the wrong choices come from
 * the other answers of the same deck).
 *
 * Props: { user, groupId, pseudo, deckMessages, onCreated({ title }), onClose }
 */

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { doc, getDoc } from 'firebase/firestore';
import { Trophy, X, Users, Layers } from 'lucide-react';
import { db } from '../../firebase/config';
import { useTranslation } from '../../i18n';
import { buildQuestions, createQuiz, QUIZ_COUNTS, QUIZ_SECONDS, QUIZ_REVEALS, REVEAL_SEC, MIN_CARDS } from '../../lib/groupQuiz';
import { Button } from '../ui';

export default function QuizSetupModal({ user, groupId, pseudo, deckMessages, onCreated, onClose }) {
  const { t } = useTranslation();
  const [mine, setMine] = useState(null);  // [{ key, title, cards }]
  const [pick, setPick] = useState(null);  // source key
  const [count, setCount] = useState(QUIZ_COUNTS[1]);
  const [seconds, setSeconds] = useState(QUIZ_SECONDS[3]);
  const [reveal, setReveal] = useState(REVEAL_SEC);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // My flashcard chapters that can make a quiz.
  useEffect(() => {
    let alive = true;
    getDoc(doc(db, 'users', user.uid, 'data', 'main'))
      .then(snap => {
        if (!alive) return;
        const d = snap.data() || {};
        const subjects = d.subjects || [];
        const list = Object.entries(d.flashcards || {})
          .filter(([, cards]) => Array.isArray(cards) && cards.length >= MIN_CARDS)
          .map(([key, cards]) => {
            const [sid, ci] = key.split('_');
            const s = subjects.find(x => String(x.id) === sid);
            const chap = s?.chapters?.[Number(ci)]?.name || t('docs.chapterShort', { count: Number(ci) + 1 });
            return { key: `mine:${key}`, title: s ? `${s.name} · ${chap}` : chap, cards };
          });
        setMine(list);
      })
      .catch(() => { if (alive) setMine([]); });
    return () => { alive = false; };
  }, [user.uid, t]);

  const groupDecks = useMemo(() => deckMessages
    .filter(m => Array.isArray(m.cards) && m.cards.length >= MIN_CARDS)
    .map(m => ({ key: `deck:${m.id}`, title: m.title || t('quiz.deckBy', { name: m.pseudo || '?' }), cards: m.cards, by: m.pseudo })),
  [deckMessages, t]);

  const sources = [...groupDecks, ...(mine || [])];
  const chosen = sources.find(s => s.key === pick);
  const possible = chosen ? buildQuestions(chosen.cards, 99).length : 0;

  async function start() {
    if (!chosen) return;
    const questions = buildQuestions(chosen.cards, count);
    if (questions.length === 0) { setError('quiz.errTooFew'); return; }
    setBusy(true);
    setError('');
    try {
      await createQuiz(groupId, {
        uid: user.uid, pseudo, title: chosen.title, questions, secondsPerQ: seconds, revealSec: reveal,
      });
      onCreated({ title: chosen.title });
    } catch {
      setError('quiz.errCreate');
      setBusy(false);
    }
  }

  const field = {
    padding: '7px 9px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-input)',
    color: 'var(--text-primary)', fontSize: '.78rem', fontFamily: 'var(--font-family)', width: '100%',
  };
  const Source = ({ s, icon: Icon }) => (
    <button type="button" onClick={() => setPick(s.key)} aria-pressed={pick === s.key}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 11px', borderRadius: 12,
        border: 'none', cursor: 'pointer', background: pick === s.key ? 'var(--accent-subtle)' : 'var(--bg-card)',
        boxShadow: pick === s.key ? 'inset 0 0 0 1.5px var(--accent)' : 'none' }}>
      <Icon size={16} color="var(--accent)" aria-hidden="true" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '.8rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
        <span style={{ fontSize: '.66rem', color: 'var(--text-muted)' }}>{t('quiz.cards', { count: s.cards.length })}</span>
      </span>
    </button>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      role="dialog" aria-modal="true" aria-label={t('quiz.setupTitle')}
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <motion.div initial={{ y: 16, scale: .97 }} animate={{ y: 0, scale: 1 }} transition={{ duration: .22, ease: 'easeOut' }}
        style={{ width: 480, maxWidth: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column', gap: 14,
          background: 'var(--bg-modal)', borderRadius: 22, padding: '1.3rem', boxShadow: 'var(--card-shadow)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
            <Trophy size={18} aria-hidden="true" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.98rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('quiz.setupTitle')}</div>
            <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{t('quiz.setupHint')}</div>
          </div>
          <button type="button" onClick={onClose} aria-label={t('docs.close')}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 80 }}>
          {groupDecks.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>{t('quiz.fromGroup')}</div>
              {groupDecks.map(s => <Source key={s.key} s={s} icon={Users} />)}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--text-muted)' }}>{t('quiz.fromMine')}</div>
            {mine === null ? (
              <div style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>{t('common.loading')}</div>
            ) : mine.length === 0 ? (
              <div style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>{t('quiz.noDecks', { count: MIN_CARDS })}</div>
            ) : mine.map(s => <Source key={s.key} s={s} icon={Layers} />)}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
          <label style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>
            {t('quiz.questions')}
            <select style={{ ...field, marginTop: 4 }} value={count} onChange={e => setCount(Number(e.target.value))}>
              {QUIZ_COUNTS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>
            {t('quiz.secondsPerQ')}
            <select style={{ ...field, marginTop: 4 }} value={seconds} onChange={e => setSeconds(Number(e.target.value))}>
              {QUIZ_SECONDS.map(n => <option key={n} value={n}>{t('quiz.seconds', { count: n })}</option>)}
            </select>
          </label>
          <label style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>
            {t('quiz.revealSec')}
            <select style={{ ...field, marginTop: 4 }} value={reveal} onChange={e => setReveal(Number(e.target.value))}>
              {QUIZ_REVEALS.map(n => <option key={n} value={n}>{t('quiz.seconds', { count: n })}</option>)}
            </select>
          </label>
        </div>
        <div style={{ fontSize: '.66rem', color: 'var(--text-muted)' }}>
          {t('quiz.lengthHint', { minutes: Math.max(1, Math.round((Math.min(count, possible || count) * (seconds + reveal)) / 60)) })}
        </div>
        {chosen && possible < count && (
          <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{t('quiz.limited', { count: possible })}</div>
        )}
        {error && <div role="alert" style={{ fontSize: '.74rem', color: 'var(--danger)' }}>{t(error, { count: MIN_CARDS })}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" icon={Trophy} disabled={!chosen || busy} onClick={start}>{t('quiz.create')}</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
