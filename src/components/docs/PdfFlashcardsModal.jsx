/**
 * PdfFlashcardsModal — turn pages of a PDF into flashcards (AI).
 * --------------------------------------------------------------------------
 * 1. The PDF's text is extracted page by page with PDF.js (lib/pdf.js).
 * 2. The student picks a page range; the preselected range fits the AI's
 *    input limit (AI_MAX_TEXT_CHARS). Longer selections are cut at the limit,
 *    and the student is told so.
 * 3. The existing worker endpoint generates the cards (same daily quota as
 *    the "Generate" tab of the Flashcards page).
 * 4. After review (cards can be removed), they are appended to the chosen
 *    subject / chapter with lib/flashcardStore.js — duplicates skipped.
 *
 * Scanned PDFs have no text layer: that case is detected and explained.
 *
 * Props: { user, doc, pdfUrl, onClose }
 */

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { doc as fsDoc, getDoc } from 'firebase/firestore';
import { Sparkles, X, Check, ScanText } from 'lucide-react';
import { db } from '../../firebase/config';
import { useTranslation } from '../../i18n';
import { extractPdfText } from '../../lib/pdf';
import { generateAiFlashcards, AI_MIN_TEXT_CHARS, AI_MAX_TEXT_CHARS, AI_CARD_COUNTS } from '../../lib/aiFlashcards';
import { appendFlashcards } from '../../lib/flashcardStore';
import { Button } from '../ui';

/** Worker / network error code → i18n key (same wording as the Flashcards page). */
const AI_ERROR_KEYS = {
  daily_limit: 'flashcards.aiErrorLimit',
  text_too_short: 'flashcards.aiErrorShort',
  text_too_long: 'flashcards.aiErrorLong',
  ai_busy: 'flashcards.aiErrorBusy',
  network: 'flashcards.aiErrorNetwork',
};

/** Largest range starting at page 1 whose text fits the AI limit (at least one page). */
function defaultRange(pages) {
  let total = 0;
  let to = 1;
  for (const p of pages) {
    total += p.text.length + 2;
    if (total > AI_MAX_TEXT_CHARS && p.page > 1) break;
    to = p.page;
  }
  return { from: 1, to };
}

export default function PdfFlashcardsModal({ user, doc, pdfUrl, onClose }) {
  const { t, lang } = useTranslation();
  const [pages, setPages] = useState(null);       // [{ page, text }]
  const [status, setStatus] = useState('loading'); // loading | ready | noText | error
  const [range, setRange] = useState({ from: 1, to: 1 });
  const [subjects, setSubjects] = useState([]);
  const [dest, setDest] = useState({
    subjectId: doc.mine && doc.subjectId != null ? String(doc.subjectId) : '',
    chapterIdx: doc.mine && doc.chapterIdx != null ? doc.chapterIdx : 0,
  });
  const [count, setCount] = useState(AI_CARD_COUNTS[1]);
  const [cards, setCards] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [added, setAdded] = useState(null);       // number of cards saved

  // Extract the text once.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const bytes = await (await fetch(pdfUrl)).arrayBuffer();
        const extracted = await extractPdfText(bytes);
        if (!alive) return;
        const totalText = extracted.reduce((n, p) => n + p.text.length, 0);
        setPages(extracted);
        setRange(defaultRange(extracted));
        setStatus(totalText < AI_MIN_TEXT_CHARS ? 'noText' : 'ready');
      } catch {
        if (alive) setStatus('error');
      }
    })();
    return () => { alive = false; };
  }, [pdfUrl]);

  // My subjects, for the destination picker.
  useEffect(() => {
    let alive = true;
    getDoc(fsDoc(db, 'users', user.uid, 'data', 'main'))
      .then(snap => {
        if (!alive) return;
        const list = snap.data()?.subjects || [];
        setSubjects(list);
        setDest(d => (d.subjectId || !list.length ? d : { subjectId: String(list[0].id), chapterIdx: 0 }));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [user.uid]);

  const numPages = pages?.length || 0;
  const selected = (pages || []).filter(p => p.page >= range.from && p.page <= range.to).map(p => p.text).join('\n\n');
  const cut = selected.length > AI_MAX_TEXT_CHARS;
  const text = selected.slice(0, AI_MAX_TEXT_CHARS);
  const subject = subjects.find(s => String(s.id) === String(dest.subjectId));
  const chapters = subject?.chapters?.length
    ? subject.chapters
    : Array.from({ length: subject?.chaps || 0 }, (_, i) => ({ name: t('flashcards.chapterFull', { count: i + 1 }) }));

  function setPage(key, value) {
    const n = Math.min(numPages, Math.max(1, Math.round(Number(value) || 1)));
    setRange(r => {
      const next = { ...r, [key]: n };
      if (next.from > next.to) next[key === 'from' ? 'to' : 'from'] = n;
      return next;
    });
  }

  async function generate() {
    setBusy(true);
    setError('');
    try {
      const res = await generateAiFlashcards(user, { text, count, lang });
      setCards(res.cards);
    } catch (e) {
      setError(AI_ERROR_KEYS[e.code] || 'flashcards.aiErrorGeneric');
    }
    setBusy(false);
  }

  async function save() {
    if (!subject) { setError('pdfCards.errNoSubject'); return; }
    setBusy(true);
    setError('');
    try {
      setAdded(await appendFlashcards(user.uid, subject.id, dest.chapterIdx, cards));
    } catch {
      setError('pdfCards.errSave');
    }
    setBusy(false);
  }

  const field = {
    padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-input)',
    color: 'var(--text-primary)', fontSize: '.8rem', fontFamily: 'var(--font-family)', minWidth: 0, boxSizing: 'border-box',
  };
  const label = { display: 'block', fontSize: '.68rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      role="dialog" aria-modal="true" aria-label={t('pdfCards.title')}
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <motion.div initial={{ y: 16, scale: .97 }} animate={{ y: 0, scale: 1 }} transition={{ duration: .22, ease: 'easeOut' }}
        style={{ width: 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14,
          background: 'var(--bg-modal)', borderRadius: 22, padding: '1.3rem', boxShadow: 'var(--card-shadow)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
            <Sparkles size={18} aria-hidden="true" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('pdfCards.title')}</div>
            <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
          </div>
          <button type="button" onClick={onClose} aria-label={t('docs.close')}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {status === 'loading' && <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{t('pdfCards.reading')}</div>}
        {status === 'error' && <div role="alert" style={{ fontSize: '.8rem', color: 'var(--danger)' }}>{t('docs.pdfError')}</div>}
        {status === 'noText' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 12, background: 'var(--bg-card)' }}>
            <ScanText size={18} color="var(--warning)" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: '.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{t('pdfCards.noText')}</div>
          </div>
        )}

        {added !== null ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '1rem 0', textAlign: 'center' }}>
            <span style={{ width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--accent-subtle)', color: 'var(--success)' }}>
              <Check size={22} aria-hidden="true" />
            </span>
            <div style={{ fontSize: '.9rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {t('pdfCards.added', { count: added })}
            </div>
            <div style={{ fontSize: '.74rem', color: 'var(--text-muted)' }}>
              {subject?.name}{chapters[dest.chapterIdx]?.name ? ` · ${chapters[dest.chapterIdx].name}` : ''}
            </div>
            <Button variant="primary" onClick={onClose}>{t('docs.close')}</Button>
          </div>
        ) : status === 'ready' && (
          <>
            {/* Pages */}
            <div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ width: 90 }}>
                  <label style={label} htmlFor="pc-from">{t('pdfCards.fromPage')}</label>
                  <input id="pc-from" type="number" min={1} max={numPages} value={range.from}
                    onChange={e => setPage('from', e.target.value)} style={{ ...field, width: '100%' }} />
                </div>
                <div style={{ width: 90 }}>
                  <label style={label} htmlFor="pc-to">{t('pdfCards.toPage')}</label>
                  <input id="pc-to" type="number" min={1} max={numPages} value={range.to}
                    onChange={e => setPage('to', e.target.value)} style={{ ...field, width: '100%' }} />
                </div>
                <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', paddingBottom: 9 }}>
                  {t('pdfCards.ofPages', { count: numPages })}
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <div role="meter" aria-valuemin={0} aria-valuemax={AI_MAX_TEXT_CHARS} aria-valuenow={Math.min(selected.length, AI_MAX_TEXT_CHARS)}
                  aria-label={t('pdfCards.textAmount')}
                  style={{ height: 5, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, (selected.length / AI_MAX_TEXT_CHARS) * 100)}%`, height: '100%', borderRadius: 99,
                    background: cut ? 'var(--warning)' : 'var(--accent)', transition: 'width .25s' }} />
                </div>
                <div style={{ fontSize: '.64rem', color: cut ? 'var(--warning)' : 'var(--text-muted)', marginTop: 4 }}>
                  {cut ? t('pdfCards.cut') : t('pdfCards.fits')}
                </div>
              </div>
            </div>

            {/* Destination + count */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
              <div>
                <label style={label} htmlFor="pc-subject">{t('common.subject')}</label>
                <select id="pc-subject" style={{ ...field, width: '100%' }} value={dest.subjectId}
                  onChange={e => setDest({ subjectId: e.target.value, chapterIdx: 0 })}>
                  {subjects.length === 0 && <option value="">{t('pdfCards.noSubjects')}</option>}
                  {subjects.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={label} htmlFor="pc-chapter">{t('common.chapter')}</label>
                <select id="pc-chapter" style={{ ...field, width: '100%' }} value={dest.chapterIdx}
                  onChange={e => setDest(d => ({ ...d, chapterIdx: Number(e.target.value) }))}>
                  {chapters.map((c, i) => <option key={i} value={i}>{c.name || t('flashcards.chapterFull', { count: i + 1 })}</option>)}
                </select>
              </div>
              <div>
                <label style={label} htmlFor="pc-count">{t('flashcards.aiCount')}</label>
                <select id="pc-count" style={{ ...field, width: '100%' }} value={count} onChange={e => setCount(Number(e.target.value))}>
                  {AI_CARD_COUNTS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            <Button variant={cards.length ? 'secondary' : 'primary'} icon={Sparkles} disabled={busy || text.length < AI_MIN_TEXT_CHARS} onClick={generate}>
              {busy && !cards.length ? t('flashcards.aiGenerating') : cards.length ? t('flashcards.aiRegenerate') : t('flashcards.aiGenerate')}
            </Button>

            {cards.length > 0 && (
              <ul aria-label={t('flashcards.aiPreview')} style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cards.map((c, i) => (
                  <li key={`${i}-${c.q}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 10, background: 'var(--bg-card)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>{c.q}</div>
                      <div style={{ fontSize: '.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>{c.a}</div>
                    </div>
                    <button type="button" onClick={() => setCards(list => list.filter((_, j) => j !== i))} aria-label={t('flashcards.aiRemoveCard')}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'flex' }}>
                      <X size={14} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {error && <div role="alert" style={{ fontSize: '.74rem', color: 'var(--danger)' }}>{t(error)}</div>}
            <div style={{ fontSize: '.64rem', color: 'var(--text-muted)' }}>{t('flashcards.aiHint')}</div>

            {cards.length > 0 && (
              <Button variant="primary" icon={Check} disabled={busy || !subject} onClick={save}>
                {t('flashcards.aiAddBtn', { count: cards.length })}
              </Button>
            )}
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
