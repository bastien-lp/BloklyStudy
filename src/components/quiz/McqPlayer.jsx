/**
 * McqPlayer — solo practice of a multiple-choice set (lib/mcq.js).
 * --------------------------------------------------------------------------
 * One question at a time, four choices. A tap locks the answer and shows the
 * right one at once (immediate feedback is what makes practice stick), then
 * "Next". The end screen gives the score; "Finish" hands the results back.
 *
 * Choices are marked A–D and the correction uses an icon as well as colour,
 * so it never relies on colour alone.
 *
 * Props: { items: McqItem[], onDone(results: [{ q, ok }]), onQuit }
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, X, ArrowRight, Trophy } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { mcqToQuestion } from '../../lib/mcq';
import { Button } from '../ui';

const LETTERS = ['A', 'B', 'C', 'D'];

export default function McqPlayer({ items, onDone, onQuit }) {
  const { t } = useTranslation();
  // Shuffled once: a re-render of the parent must not reorder a running quiz.
  const [questions] = useState(() => [...items].sort(() => Math.random() - .5).map(item => mcqToQuestion(item)));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null);
  const [results, setResults] = useState([]);

  const total = questions.length;
  const finished = results.length === total && picked === null;

  function choose(i) {
    if (picked !== null) return;
    setPicked(i);
    setResults(r => [...r, { q: questions[index].q, ok: i === questions[index].correct }]);
  }

  function next() {
    setPicked(null);
    setIndex(i => i + 1);
  }

  if (finished || total === 0) {
    const knew = results.filter(r => r.ok).length;
    const score = total ? Math.round(knew / total * 100) : 0;
    return (
      <motion.div initial={{ opacity: 0, scale: .95 }} animate={{ opacity: 1, scale: 1 }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '2.5rem 1rem', textAlign: 'center' }}>
        <span style={{ width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
          <Trophy size={26} aria-hidden="true" />
        </span>
        <div style={{ fontSize: '2.6rem', fontWeight: 900, color: score >= 80 ? 'var(--success)' : score >= 50 ? 'var(--accent)' : 'var(--danger)' }}>
          {score}%
        </div>
        <div style={{ fontSize: '.95rem', color: 'var(--text-secondary)' }}>{t('mcq.result', { knew, total })}</div>
        <Button variant="primary" size="lg" onClick={() => onDone(results)}>{t('flashcards.finish')}</Button>
      </motion.div>
    );
  }

  const q = questions[index];
  const answered = picked !== null;
  const last = index === total - 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720, width: '100%', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {t('quiz.questionOf', { index: index + 1, total })}
        </span>
        <div style={{ flex: 1, height: 5, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
          <motion.div animate={{ width: `${((index + (answered ? 1 : 0)) / total) * 100}%` }}
            style={{ height: '100%', borderRadius: 99, background: 'var(--accent)' }} />
        </div>
        <Button size="sm" variant="ghost" onClick={onQuit}>{t('mcq.quit')}</Button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={index} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
          transition={{ duration: .22, ease: 'easeOut' }}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 'clamp(1.05rem, 2.6vw, 1.35rem)', fontWeight: 800, lineHeight: 1.4, color: 'var(--text-primary)',
            padding: '1.2rem', borderRadius: 18, background: 'var(--bg-card)', boxShadow: 'var(--card-shadow)' }}>
            {q.q}
          </div>

          <div role="group" aria-label={q.q} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
            {q.choices.map((c, i) => {
              const isRight = answered && i === q.correct;
              const isWrongPick = answered && i === picked && i !== q.correct;
              const tone = isRight ? 'var(--success)' : isWrongPick ? 'var(--danger)' : null;
              return (
                <motion.button key={i} type="button" onClick={() => choose(i)} disabled={answered}
                  whileTap={answered ? {} : { scale: .98 }} aria-pressed={picked === i}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, border: 'none',
                    textAlign: 'left', minHeight: 56, fontSize: '.88rem', fontWeight: 600, fontFamily: 'var(--font-family)',
                    color: 'var(--text-primary)', cursor: answered ? 'default' : 'pointer',
                    background: tone ? 'var(--bg-card-hover)' : 'var(--bg-card)',
                    boxShadow: tone ? `inset 0 0 0 2px ${tone}` : 'inset 0 0 0 1px var(--border)',
                    opacity: answered && !isRight && !isWrongPick ? .55 : 1, transition: 'opacity .2s, box-shadow .2s' }}>
                  <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '.75rem', fontWeight: 800,
                    background: tone || 'var(--accent-subtle)', color: tone ? '#fff' : 'var(--accent)' }}>
                    {isRight ? <Check size={15} /> : isWrongPick ? <X size={15} /> : LETTERS[i]}
                  </span>
                  <span style={{ flex: 1, wordBreak: 'break-word' }}>{c}</span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>

      <div aria-live="polite" style={{ minHeight: 44, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {answered && (
          <>
            <strong style={{ flex: 1, minWidth: 180, fontSize: '.85rem', color: picked === q.correct ? 'var(--success)' : 'var(--danger)' }}>
              {picked === q.correct ? t('mcq.right') : t('mcq.wrongWas', { answer: q.choices[q.correct] })}
            </strong>
            <Button variant="primary" icon={last ? Trophy : ArrowRight} onClick={next}>
              {last ? t('mcq.seeResult') : t('mcq.next')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
