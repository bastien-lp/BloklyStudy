/**
 * McqEditor — create or edit multiple-choice questions for one chapter.
 * --------------------------------------------------------------------------
 * Four ways in:
 *   - write  : the student types the question, the right answer and 3 traps;
 *   - import : text pasted from an external AI (ChatGPT, …) or typed, read by
 *              lib/mcqImport.js; a ready-made prompt can be copied for that AI;
 *   - cards  : our AI turns this chapter's flashcards into questions, keeping
 *              each card and adding 3 plausible wrong answers (lib/aiQuiz.js);
 *   - notes  : our AI writes questions from pasted course notes.
 * Imported and generated items are always shown as editable items, to be
 * checked (and completed) before saving. The AI tabs only appear when the
 * worker is configured; each tab says whether it uses the daily AI quota.
 *
 * Props: { user, item?, cards, initialMode, onSave(items), onClose }
 *   `item` set = edit that one question (write mode only).
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { X, PenLine, Layers, FileText, Sparkles, Trash2, ClipboardPaste, Copy, Check } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { sanitizeMcqItem, MCQ_WRONG } from '../../lib/mcq';
import { parseMcqImport } from '../../lib/mcqImport';
import { generateAiQuiz, isAiQuizAvailable, AI_QUIZ_MAX_CARDS } from '../../lib/aiQuiz';
import { AI_MIN_TEXT_CHARS, AI_MAX_TEXT_CHARS, AI_CARD_COUNTS } from '../../lib/aiFlashcards';
import { Button } from '../ui';
import AiQuotaNote from '../AiQuotaNote';

/** Most characters accepted in the import box (a long chapter's worth of questions). */
const IMPORT_MAX_CHARS = 30000;

/**
 * An imported item made editable: exactly MCQ_WRONG wrong-answer fields, blank
 * ones left for the student to fill in rather than dropping the question.
 */
const toDraft = it => ({
  q: String(it.q || ''), a: String(it.a || ''), ok: null,
  wrong: [...(it.wrong || []).map(String), ...Array(MCQ_WRONG).fill('')].slice(0, MCQ_WRONG),
});

/** Worker error code → i18n key (the flashcard generator's messages fit as they are). */
const AI_ERROR_KEYS = {
  daily_limit: 'flashcards.aiErrorLimit',
  text_too_short: 'flashcards.aiErrorShort',
  text_too_long: 'flashcards.aiErrorLong',
  ai_busy: 'flashcards.aiErrorBusy',
  network: 'flashcards.aiErrorNetwork',
};

const emptyItem = () => ({ q: '', a: '', wrong: Array(MCQ_WRONG).fill(''), ok: null });

const inputStyle = {
  width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border-strong)', background: 'var(--bg-input)',
  color: 'var(--text-primary)', fontSize: '.82rem', fontFamily: 'var(--font-family)', boxSizing: 'border-box',
};
const labelStyle = { fontSize: '.68rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 };

/** The fields of one question. Used for writing by hand and for reviewing AI items. */
function ItemFields({ item, onChange, compact }) {
  const { t } = useTranslation();
  const setWrong = (i, value) => onChange({ ...item, wrong: item.wrong.map((w, j) => (j === i ? value : w)) });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 6 : 10 }}>
      <label>
        <span style={labelStyle}>{t('flashcards.question')}</span>
        <textarea rows={compact ? 2 : 3} value={item.q} onChange={e => onChange({ ...item, q: e.target.value })}
          style={{ ...inputStyle, resize: 'vertical' }} />
      </label>
      <label>
        <span style={{ ...labelStyle, color: 'var(--success)' }}>{t('mcq.rightAnswer')}</span>
        <input value={item.a} onChange={e => onChange({ ...item, a: e.target.value })}
          style={{ ...inputStyle, boxShadow: 'inset 3px 0 0 var(--success)' }} />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 6 }}>
        {item.wrong.map((w, i) => (
          <label key={i}>
            <span style={labelStyle}>{t('mcq.wrongAnswer', { index: i + 1 })}</span>
            <input value={w} onChange={e => setWrong(i, e.target.value)}
              style={{ ...inputStyle, boxShadow: 'inset 3px 0 0 var(--danger)' }} />
          </label>
        ))}
      </div>
    </div>
  );
}

export default function McqEditor({ user, item, cards, initialMode = 'write', onSave, onClose }) {
  const { t, lang } = useTranslation();
  const editing = !!item;
  const aiOn = isAiQuizAvailable() && !editing;
  const isAiMode = m => m === 'cards' || m === 'notes';
  const [mode, setMode] = useState(editing || (isAiMode(initialMode) && !aiOn) ? 'write' : initialMode);
  const [draft, setDraft] = useState(() => (item ? toDraft(item) : emptyItem()));
  const [notes, setNotes] = useState('');
  const [count, setCount] = useState(AI_CARD_COUNTS[1]);
  const [importText, setImportText] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);
  // Imported or generated items, under review before saving.
  const [generated, setGenerated] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState(null);

  const usableCards = (cards || []).filter(c => c.q && c.a).slice(0, AI_QUIZ_MAX_CARDS);
  const parsed = mode === 'import' && importText.trim() ? parseMcqImport(importText) : null;
  const recognized = parsed ? parsed.items.filter(it => String(it.q || '').trim()) : [];

  async function generate() {
    setLoading(true);
    setError('');
    try {
      const source = mode === 'cards' ? { cards: usableCards } : { text: notes, count };
      const res = await generateAiQuiz(user, source, lang);
      setGenerated(res.items.map(toDraft));
      setRemaining(res.remaining);
    } catch (e) {
      setError(AI_ERROR_KEYS[e.code] || 'flashcards.aiErrorGeneric');
    } finally {
      setLoading(false);
    }
  }

  function readImport() {
    setError('');
    if (!recognized.length) { setError('mcq.importNone'); return; }
    setGenerated(recognized.map(toDraft));
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(t('mcq.aiPrompt'));
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2500);
    } catch {
      setError('mcq.copyFailed');
    }
  }

  function switchMode(next) {
    setMode(next);
    setGenerated([]);
    setError('');
  }

  const toSave = mode === 'write' ? [draft] : generated;
  const valid = toSave.map(sanitizeMcqItem).filter(Boolean);
  const allValid = toSave.length > 0 && valid.length === toSave.length;

  function save() {
    if (!allValid) { setError('mcq.invalid'); return; }
    onSave(valid);
    onClose();
  }

  const tabs = editing ? [] : [
    { id: 'write', icon: PenLine, label: t('mcq.write') },
    { id: 'import', icon: ClipboardPaste, label: t('mcq.import') },
    ...(aiOn ? [
      { id: 'cards', icon: Layers, label: t('mcq.fromCards'), ai: true },
      { id: 'notes', icon: FileText, label: t('mcq.fromNotes'), ai: true },
    ] : []),
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      role="dialog" aria-modal="true" aria-label={t(editing ? 'mcq.editTitle' : 'mcq.modalTitle')}
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <motion.div initial={{ y: 16, scale: .97 }} animate={{ y: 0, scale: 1 }} transition={{ duration: .22, ease: 'easeOut' }}
        style={{ width: 580, maxWidth: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: 14,
          background: 'var(--bg-modal)', borderRadius: 22, padding: '1.3rem', boxShadow: 'var(--card-shadow)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, fontSize: '.98rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            {t(editing ? 'mcq.editTitle' : 'mcq.modalTitle')}
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {tabs.length > 1 && (
          <div role="tablist" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: 4,
            background: 'var(--bg-card)', padding: 4, borderRadius: 12 }}>
            {tabs.map(({ id, icon: Icon, label, ai }) => (
              <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => switchMode(id)}
                title={ai ? t('aiQuota.uses') : t('aiQuota.free')}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 8px',
                  borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: '.74rem', fontWeight: 700, whiteSpace: 'nowrap',
                  background: mode === id ? 'var(--accent-subtle)' : 'transparent', color: mode === id ? 'var(--accent)' : 'var(--text-muted)' }}>
                <Icon size={14} aria-hidden="true" />{label}
                {ai && <Sparkles size={11} aria-label={t('aiQuota.aiBadge')} style={{ flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        )}

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 60 }}>
          {mode === 'write' && (
            <>
              <ItemFields item={draft} onChange={setDraft} />
              <div style={{ fontSize: '.7rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>{t('mcq.wrongHint')}</div>
              {!editing && <AiQuotaNote free />}
            </>
          )}

          {mode === 'import' && generated.length === 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 12, background: 'var(--bg-card)' }}>
                <div style={{ flex: 1, minWidth: 200, fontSize: '.74rem', lineHeight: 1.55, color: 'var(--text-secondary)' }}>{t('mcq.promptHint')}</div>
                <Button size="sm" variant="secondary" icon={promptCopied ? Check : Copy} onClick={copyPrompt}>
                  {promptCopied ? t('mcq.promptCopied') : t('mcq.copyPrompt')}
                </Button>
              </div>
              <label>
                <span style={labelStyle}>{t('mcq.importLabel')}</span>
                <textarea rows={9} value={importText} maxLength={IMPORT_MAX_CHARS} onChange={e => setImportText(e.target.value)}
                  placeholder={t('mcq.importPlaceholder')} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: '.76rem' }} />
              </label>
              <div style={{ fontSize: '.68rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                {parsed ? t('mcq.importDetected', { count: recognized.length }) : t('mcq.importFormats')}
              </div>
              <Button variant="primary" icon={ClipboardPaste} onClick={readImport} disabled={!recognized.length}>
                {t('mcq.importRead')}
              </Button>
              <AiQuotaNote free />
            </>
          )}

          {isAiMode(mode) && generated.length === 0 && (
            <>
              {mode === 'cards' ? (
                <div style={{ fontSize: '.78rem', lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                  {usableCards.length
                    ? t('mcq.fromCardsHint', { count: usableCards.length })
                    : t('mcq.fromCardsNone')}
                </div>
              ) : (
                <>
                  <label>
                    <span style={labelStyle}>{t('flashcards.aiLabel')}</span>
                    <textarea rows={8} value={notes} maxLength={AI_MAX_TEXT_CHARS} onChange={e => setNotes(e.target.value)}
                      placeholder={t('flashcards.aiPlaceholder')} style={{ ...inputStyle, resize: 'vertical' }} />
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: '.68rem', color: 'var(--text-muted)' }}>
                    <span style={{ flex: 1 }}>
                      {notes.trim().length < AI_MIN_TEXT_CHARS
                        ? t('flashcards.aiMinChars', { count: AI_MIN_TEXT_CHARS })
                        : t('flashcards.aiCharCount', { count: notes.length, max: AI_MAX_TEXT_CHARS })}
                    </span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {t('quiz.questions')}
                      <select value={count} onChange={e => setCount(Number(e.target.value))} style={{ ...inputStyle, width: 'auto', padding: '5px 8px' }}>
                        {AI_CARD_COUNTS.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                  </div>
                </>
              )}
              <Button variant="primary" icon={Sparkles} onClick={generate}
                disabled={loading || remaining === 0 || (mode === 'cards' ? !usableCards.length : notes.trim().length < AI_MIN_TEXT_CHARS)}>
                {loading ? t('flashcards.aiGenerating') : t('mcq.generate')}
              </Button>
              <AiQuotaNote user={user} remaining={remaining} />
            </>
          )}

          {mode !== 'write' && generated.length > 0 && (
            <>
              <div style={{ fontSize: '.72rem', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                {mode === 'import' ? t('mcq.importReviewHint') : t('mcq.reviewHint')}
              </div>
              {isAiMode(mode) && <AiQuotaNote user={user} remaining={remaining} />}
              {generated.map((g, i) => (
                <div key={i} style={{ position: 'relative', padding: '12px', borderRadius: 14, background: 'var(--bg-card)',
                  boxShadow: sanitizeMcqItem(g) ? 'none' : 'inset 0 0 0 1.5px var(--warning)' }}>
                  <button type="button" onClick={() => setGenerated(list => list.filter((_, j) => j !== i))}
                    aria-label={t('mcq.remove')} title={t('mcq.remove')}
                    style={{ position: 'absolute', top: 8, right: 8, background: 'transparent', border: 'none', cursor: 'pointer',
                      color: 'var(--text-muted)', display: 'flex' }}>
                    <Trash2 size={14} />
                  </button>
                  <ItemFields compact item={g} onChange={next => setGenerated(list => list.map((x, j) => (j === i ? next : x)))} />
                  {!sanitizeMcqItem(g) && (
                    <div style={{ marginTop: 6, fontSize: '.68rem', color: 'var(--warning)' }}>{t('mcq.incomplete')}</div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        {error && <div role="alert" style={{ fontSize: '.74rem', color: 'var(--danger)' }}>{t(error)}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          {(mode === 'write' || generated.length > 0) && (
            <Button variant="primary" onClick={save} disabled={!toSave.length}>
              {mode === 'write' ? t('common.save') : t('mcq.saveCount', { count: generated.length })}
            </Button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
