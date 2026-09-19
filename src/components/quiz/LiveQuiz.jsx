/**
 * LiveQuiz — the full-screen live quiz of a study group.
 * --------------------------------------------------------------------------
 * Screens follow lib/groupQuiz.js's timeline (derived from the shared server
 * clock): lobby → 3-2-1 → question (4 answers, countdown) → reveal (right
 * answer, points, top 5) → … → podium. Everyone sees the same second.
 *
 * Answers: four colours from the nature palette, each also marked with a
 * shape, so they are never told apart by colour alone. White text on each
 * colour keeps a contrast of at least 4.5:1.
 *
 * The host starts the quiz and may end it early; it then runs on its own.
 *
 * Props: { user, groupId, pseudo, onClose }
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Triangle, Diamond, Circle, Square, Trophy, Users, X, Check, Crown, Play, Timer } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { serverNow, startServerClock } from '../../lib/serverClock';
import {
  subscribeQuiz, subscribePlayers, quizPhase, standings, pointsFor, joinQuiz, answerQuiz,
  startQuiz, endQuiz, clearQuiz, REVEAL_SEC,
} from '../../lib/groupQuiz';
import { Button } from '../ui';

const CHOICES = [
  { color: '#B5462F', icon: Triangle },
  { color: '#2F6199', icon: Diamond },
  { color: '#8A6100', icon: Circle },
  { color: '#236B43', icon: Square },
];

export default function LiveQuiz({ user, groupId, pseudo, onClose }) {
  const { t, formatNumber } = useTranslation();
  const [quiz, setQuiz] = useState(undefined); // undefined = loading
  const [players, setPlayers] = useState({});
  const [now, setNow] = useState(() => serverNow());

  useEffect(() => startServerClock(), []);
  useEffect(() => subscribeQuiz(groupId, setQuiz), [groupId]);
  useEffect(() => subscribePlayers(groupId, setPlayers), [groupId]);
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 200);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isHost = quiz?.hostUid === user.uid;
  const joined = !!players[user.uid];
  const phase = quizPhase(quiz, now);
  const q = quiz?.questions?.[phase.index];
  const myAnswer = players[user.uid]?.answers?.[phase.index];
  const playerCount = Object.keys(players).length;
  const answeredCount = Object.values(players).filter(p => p.answers?.[phase.index]).length;
  const countdown = quiz?.startedAt && now < quiz.startedAt ? Math.ceil((quiz.startedAt - now) / 1000) : 0;

  function answer(choice) {
    if (!joined || phase.phase !== 'question' || myAnswer) return;
    const slot = (quiz.secondsPerQ + (quiz.revealSec ?? REVEAL_SEC)) * 1000;
    const ms = now - quiz.startedAt - phase.index * slot;
    answerQuiz(groupId, user.uid, phase.index, choice, ms).catch(() => {});
  }

  function closeAndMaybeClear() {
    if (isHost && phase.phase === 'done') clearQuiz(groupId).catch(() => {});
    onClose();
  }

  const shell = (children) => (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      role="dialog" aria-modal="true" aria-label={t('quiz.title')}
      style={{ position: 'fixed', inset: 0, zIndex: 1250, background: 'var(--bg-base)', display: 'flex', flexDirection: 'column',
        padding: 'clamp(12px, 3vw, 28px)', gap: 16, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Trophy size={20} color="var(--accent)" aria-hidden="true" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {quiz?.title || t('quiz.title')}
          </div>
          <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>
            {quiz ? t('quiz.hostedBy', { name: quiz.hostPseudo }) : ''} · <Users size={11} aria-hidden="true" /> {playerCount}
          </div>
        </div>
        {isHost && phase.phase !== 'done' && phase.phase !== 'lobby' && (
          <Button size="sm" variant="ghost" danger onClick={() => endQuiz(groupId)}>{t('quiz.endNow')}</Button>
        )}
        <button type="button" onClick={closeAndMaybeClear} aria-label={t('docs.close')}
          style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'var(--bg-card-hover)', color: 'var(--text-secondary)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={18} />
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', maxWidth: 860, margin: '0 auto', gap: 18 }}>
        {children}
      </div>
    </motion.div>
  );

  if (quiz === undefined) return shell(<div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{t('common.loading')}</div>);
  if (!quiz) {
    return shell(
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
        <div style={{ color: 'var(--text-muted)' }}>{t('quiz.noneRunning')}</div>
        <Button variant="secondary" onClick={onClose}>{t('docs.close')}</Button>
      </div>,
    );
  }

  const ranking = standings(quiz, players, phase.phase === 'done' ? Infinity : phase.index);

  // ── Lobby / get ready ──
  if (phase.phase === 'lobby' || countdown > 0) {
    return shell(
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center' }}>
        {countdown > 0 ? (
          <motion.div key={countdown} initial={{ scale: .6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            style={{ fontSize: '5rem', fontWeight: 900, color: 'var(--accent)' }}>{countdown}</motion.div>
        ) : (
          <>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('quiz.lobbyTitle')}</div>
            <div style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>
              {t('quiz.lobbyInfo', { count: quiz.questions.length, seconds: quiz.secondsPerQ })}
            </div>
          </>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 560 }}>
          <AnimatePresence>
            {Object.entries(players).map(([uid, p]) => (
              <motion.span key={uid} layout initial={{ scale: .6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                style={{ padding: '6px 12px', borderRadius: 99, fontSize: '.8rem', fontWeight: 700,
                  background: uid === user.uid ? 'var(--accent)' : 'var(--bg-card)', color: uid === user.uid ? 'var(--on-accent, #fff)' : 'var(--text-primary)' }}>
                {uid === quiz.hostUid && <Crown size={12} aria-hidden="true" style={{ marginRight: 4 }} />}{p.pseudo}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
        {!joined && (
          <Button variant="primary" size="lg" icon={Users} onClick={() => joinQuiz(groupId, user.uid, pseudo)}>{t('quiz.join')}</Button>
        )}
        {countdown === 0 && (isHost ? (
          <Button variant="primary" size="lg" icon={Play} onClick={() => startQuiz(groupId)}>{t('quiz.start')}</Button>
        ) : joined && (
          <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{t('quiz.waitHost')}</div>
        ))}
      </div>,
    );
  }

  // ── Question / reveal ──
  if (phase.phase === 'question' || phase.phase === 'reveal') {
    const reveal = phase.phase === 'reveal';
    const secs = Math.ceil(phase.remainingMs / 1000);
    const myPoints = reveal ? pointsFor(q, myAnswer, quiz.secondsPerQ) : 0;
    return shell(
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
            {t('quiz.questionOf', { index: phase.index + 1, total: quiz.questions.length })}
          </span>
          <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}
            role="progressbar" aria-valuemin={0} aria-valuemax={quiz.secondsPerQ} aria-valuenow={reveal ? 0 : secs} aria-label={t('quiz.timeLeft')}>
            <div style={{ height: '100%', borderRadius: 99, background: reveal ? 'var(--border)' : 'var(--accent)',
              width: reveal ? '0%' : `${(phase.remainingMs / (quiz.secondsPerQ * 1000)) * 100}%`, transition: 'width .2s linear' }} />
          </div>
          {!reveal && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.95rem', fontWeight: 900, color: 'var(--text-primary)',
              fontVariantNumeric: 'tabular-nums', minWidth: 44 }}>
              <Timer size={16} aria-hidden="true" />{secs}
            </span>
          )}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={phase.index} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ fontSize: 'clamp(1.1rem, 3vw, 1.7rem)', fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', lineHeight: 1.35,
              padding: '1rem', borderRadius: 18, background: 'var(--bg-card)' }}>
            {q.q}
          </motion.div>
        </AnimatePresence>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          {q.choices.map((c, i) => {
            const { color, icon: Icon } = CHOICES[i];
            const picked = myAnswer?.c === i;
            const isRight = reveal && i === q.correct;
            const dim = reveal ? !isRight : (myAnswer && !picked);
            return (
              <motion.button key={i} type="button" whileTap={myAnswer || reveal ? {} : { scale: .96 }}
                onClick={() => answer(i)} disabled={!joined || !!myAnswer || reveal}
                aria-pressed={picked}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderRadius: 16, border: 'none',
                  background: color, color: '#fff', fontSize: '1rem', fontWeight: 800, textAlign: 'left', minHeight: 72,
                  cursor: !joined || myAnswer || reveal ? 'default' : 'pointer', opacity: dim ? .35 : 1, transition: 'opacity .2s',
                  boxShadow: picked || isRight ? '0 0 0 3px var(--bg-base), 0 0 0 6px #fff' : '0 6px 18px -10px rgba(0,0,0,.6)' }}>
                <Icon size={22} fill="#fff" aria-hidden="true" style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, wordBreak: 'break-word' }}>{c}</span>
                {isRight && <Check size={22} aria-hidden="true" />}
              </motion.button>
            );
          })}
        </div>

        <div style={{ textAlign: 'center', fontSize: '.85rem', color: 'var(--text-secondary)', minHeight: 24 }} aria-live="polite">
          {!joined ? (
            <Button variant="primary" icon={Users} onClick={() => joinQuiz(groupId, user.uid, pseudo)}>{t('quiz.joinNow')}</Button>
          ) : reveal ? (
            <strong style={{ color: myPoints ? 'var(--success)' : 'var(--text-muted)', fontSize: '1.05rem' }}>
              {myPoints ? t('quiz.points', { points: formatNumber(myPoints) }) : myAnswer ? t('quiz.wrong') : t('quiz.noAnswer')}
            </strong>
          ) : myAnswer ? t('quiz.answered', { done: answeredCount, total: playerCount }) : t('quiz.pickOne')}
        </div>

        {reveal && ranking.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 420, width: '100%', margin: '0 auto' }}>
            {ranking.slice(0, 5).map((r, i) => (
              <div key={r.uid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderRadius: 12,
                background: r.uid === user.uid ? 'var(--accent-subtle)' : 'var(--bg-card)', fontSize: '.82rem' }}>
                <strong style={{ width: 20, color: 'var(--text-muted)' }}>{i + 1}</strong>
                <span style={{ flex: 1, color: 'var(--text-primary)', fontWeight: r.uid === user.uid ? 800 : 600 }}>{r.pseudo}</span>
                <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(r.score)}</strong>
              </div>
            ))}
          </div>
        )}
      </>,
    );
  }

  // ── Podium ──
  const podium = ranking.slice(0, 3);
  const myRank = ranking.findIndex(r => r.uid === user.uid);
  const heights = [140, 104, 80];
  const order = [1, 0, 2];
  return shell(
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text-primary)' }}>{t('quiz.finished')}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
        {order.map(i => podium[i] && (
          <motion.div key={podium[i].uid} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (2 - i) * .15 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 110 }}>
            {i === 0 && <Crown size={22} color="#E3B341" fill="#E3B341" aria-hidden="true" />}
            <strong style={{ fontSize: '.85rem', color: 'var(--text-primary)', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{podium[i].pseudo}</strong>
            <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{formatNumber(podium[i].score)}</span>
            <motion.div initial={{ height: 0 }} animate={{ height: heights[i] }} transition={{ delay: .3 + (2 - i) * .15, duration: .5 }}
              style={{ width: '100%', borderRadius: '12px 12px 0 0', display: 'flex', justifyContent: 'center', paddingTop: 10,
                background: ['#E3B341', '#AEB7C2', '#C98A5B'][i], color: '#1b1b1b', fontSize: '1.6rem', fontWeight: 900 }}>
              {i + 1}
            </motion.div>
          </motion.div>
        ))}
      </div>
      {myRank >= 0 && (
        <div style={{ fontSize: '.9rem', color: 'var(--text-secondary)' }}>
          {t('quiz.yourRank', { rank: myRank + 1, total: ranking.length, points: formatNumber(ranking[myRank].score), correct: ranking[myRank].correct, count: quiz.questions.length })}
        </div>
      )}
      <Button variant="primary" onClick={closeAndMaybeClear}>{t('quiz.close')}</Button>
    </div>,
  );
}
