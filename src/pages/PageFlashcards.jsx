/**
 * PageFlashcards — Flashcard decks per subject/chapter, quiz, sharing
 * --------------------------------------------------------------------------
 * Cards live in `users/{uid}/data/main` under `flashcards`:
 *   flashcards = { "<subjectId>_<chapterIndex>": [{ q, a, ok }] }
 *   - ok: true (mastered) | false (to review) | null (new)
 *
 * Public decks live in the top-level `public_decks` collection.
 *
 * SHARE CODE CAVEAT: a deck's share code is the first 8 chars of its Firestore
 * document id (uppercased). Two ids can in theory share that prefix (collision),
 * and importing by code scans the public decks client-side because Firestore
 * can't query by id prefix. Fine at the current scale; a dedicated indexed
 * `shareCode` field would be the proper long-term fix. Behavior is unchanged
 * here (we just reuse the already-loaded list instead of refetching).
 *
 * Props: { user }
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, onSnapshot, updateDoc, setDoc, deleteField, collection, addDoc, getDocs, query, orderBy, limit, increment, arrayUnion, arrayRemove, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import FlashcardStack from '../components/FlashcardStack';
import FlashcardMasonry from '../components/FlashcardMasonry';
import { useTranslation } from '../i18n';
import { GuidedTour, useGuidedTour, TourButton } from '../components/GuidedTour';
import { reportSaveError } from '../lib/notify';

// ── Add / edit card modal ────────────────────────────────────────────────────
function CardModal({ card, subjects, currentSubjId, currentChapIdx, onSave, onClose }) {
  const { t } = useTranslation();
  const [sid, setSid] = useState(card?.subjId ?? currentSubjId ?? '');
  const [ci, setCi]   = useState(card?.chapIdx ?? currentChapIdx ?? 0);
  const [q, setQ]     = useState(card?.q ?? '');
  const [a, setA]     = useState(card?.a ?? '');
  const [importMode, setImportMode] = useState(false);
  const [importText, setImportText] = useState('');

  const subj = subjects.find(s => String(s.id) === String(sid));
  const chaps = subj?.chapters || Array.from({ length: subj?.chaps || 0 }, (_, i) => ({ name: t('flashcards.chapterFull', { count: i + 1 }) }));

  // Parse pasted text into cards. Primary format: "Q: … / R: …" or "Q: … / A: …"
  // (one pair per blank-line-separated block). Fallback: alternating lines.
  function parseImport(raw) {
    const cards = [];
    const blocks = raw.split(/\n\s*\n/).filter(b => b.trim());
    for (const block of blocks) {
      const m = block.match(/^Q\s*:\s*(.+?)[\n\r]+[RA]\s*:\s*(.+)$/si);
      if (m) { cards.push({ q: m[1].trim(), a: m[2].trim(), ok: null }); continue; }
    }
    if (!cards.length) {
      const lines = raw.split('\n').map(l => l.trim()).filter(l => l);
      for (let i = 0; i < lines.length - 1; i += 2) cards.push({ q: lines[i], a: lines[i + 1], ok: null });
    }
    return cards;
  }

  function handleSave() {
    if (importMode) {
      const cards = parseImport(importText);
      if (cards.length) onSave(parseInt(sid, 10), ci, cards);
    } else {
      if (!q.trim() || !a.trim()) return;
      onSave(parseInt(sid, 10), ci, [{ q: q.trim(), a: a.trim(), ok: card?.ok ?? null }], card?.cardIdx);
    }
    onClose();
  }

  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.83rem', fontFamily: 'var(--font-family)', boxSizing: 'border-box' };
  const lbl = { fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', backdropFilter: 'blur(14px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: .92, y: 20 }} animate={{ scale: 1, y: 0 }}
        style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 20, padding: '1.5rem', width: 440, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '1rem', margin: 0 }}>{card ? `✏️ ${t('common.edit')}` : `🃏 ${t('flashcards.addCards')}`}</h3>
          <button aria-label="Fermer" onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.3rem', cursor: 'pointer' }}>×</button>
        </div>
        {!card && (
          <div style={{ display: 'flex', gap: 6, background: 'var(--bg-card)', padding: 4, borderRadius: 10 }}>
            {[{ v: false, l: `✏️ ${t('flashcards.manual')}` }, { v: true, l: `📥 ${t('flashcards.import')}` }].map(m => (
              <button key={String(m.v)} onClick={() => setImportMode(m.v)}
                style={{ flex: 1, padding: '6px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: '.75rem',
                  background: importMode === m.v ? 'var(--accent-subtle)' : 'transparent',
                  color: importMode === m.v ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {m.l}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={lbl}>{t('common.subject')}</label>
            <select value={sid} onChange={e => { setSid(e.target.value); setCi(0); }} style={inp}>
              {subjects.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>{t('common.chapter')}</label>
            <select value={ci} onChange={e => setCi(parseInt(e.target.value, 10))} style={inp}>
              {chaps.map((c, i) => <option key={i} value={i}>{c.name || t('flashcards.chapterFull', { count: i + 1 })}</option>)}
            </select>
          </div>
        </div>
        {importMode ? (
          <div>
            <label style={lbl}>{t('flashcards.importLabel')}</label>
            <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={6}
              placeholder={t('flashcards.importPlaceholder')}
              style={{ ...inp, resize: 'vertical' }} />
            {importText && <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', marginTop: 3 }}>{t('flashcards.cardsDetected', { count: parseImport(importText).length })}</div>}
          </div>
        ) : (
          <>
            <div><label style={lbl}>{t('flashcards.question')} *</label><input value={q} onChange={e => setQ(e.target.value)} style={inp} /></div>
            <div><label style={lbl}>{t('flashcards.answer')} *</label><textarea value={a} onChange={e => setA(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} /></div>
          </>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '.83rem', cursor: 'pointer' }}>{t('common.cancel')}</button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: .98 }} onClick={handleSave}
            style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#4A90D9,#6366f1)', color: '#fff', fontSize: '.83rem', fontWeight: 700, cursor: 'pointer' }}>
            {importMode ? `📥 ${t('flashcards.importBtn')}` : card ? `✓ ${t('common.save')}` : `+ ${t('flashcards.addBtn')}`}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Publish modal (share a deck to the community hub) ────────────────────────
function PublishModal({ deck, author, user, onClose }) {
  const { t } = useTranslation();
  const [title, setTitle]   = useState(deck.title);
  const [desc, setDesc]     = useState('');
  const [isPublic, setPublic] = useState(true);
  const [code, setCode]     = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function publish() {
    setLoading(true);
    try {
      const ref = await addDoc(collection(db, 'public_decks'), {
        title: (title.trim() || deck.title).slice(0, 80),
        description: desc.trim().slice(0, 200),
        cards: deck.cards.map(c => ({ q: c.q, a: c.a })), // strip personal mastery flags
        cardCount: deck.cards.length,
        subject: deck.subject || '', subjectColor: deck.subjectColor || '#4A90D9',
        author, authorId: user.uid,
        public: isPublic, importCount: 0, likes: 0,
        createdAt: Date.now(),
      });
      setCode(ref.id.slice(0, 8).toUpperCase());
    } catch (e) { reportSaveError(e, 'Flashcards — publish'); }
    setLoading(false);
  }

  function copy() { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }

  const inp = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border-strong)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.83rem', fontFamily: 'var(--font-family)', boxSizing: 'border-box' };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', backdropFilter: 'blur(14px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: .92, y: 20 }} animate={{ scale: 1, y: 0 }}
        style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 20, padding: '1.6rem', width: 400, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ color: 'var(--text-primary)', fontWeight: 800, margin: 0 }}>🚀 {t('flashcards.publishTitle')}</h3>
          <button aria-label="Fermer" onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.3rem', cursor: 'pointer' }}>×</button>
        </div>

        {!code ? (
          <>
            <div>
              <label style={{ fontSize: '.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>{t('flashcards.deckTitle')}</label>
              <input value={title} onChange={e => setTitle(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: '.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>{t('flashcards.deckDescription')}</label>
              <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder={t('flashcards.deckDescPlaceholder')} style={{ ...inp, resize: 'vertical' }} />
            </div>
            <div>
              <label style={{ fontSize: '.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>{t('flashcards.visibility')}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[{ v: true, l: t('flashcards.visPublic') }, { v: false, l: t('flashcards.visCode') }].map(o => (
                  <button key={String(o.v)} onClick={() => setPublic(o.v)}
                    style={{ flex: 1, padding: '8px', borderRadius: 9, cursor: 'pointer', fontSize: '.76rem', fontWeight: 600,
                      border: `1px solid ${isPublic === o.v ? 'var(--accent)' : 'var(--border)'}`,
                      background: isPublic === o.v ? 'var(--accent-subtle)' : 'var(--bg-card)',
                      color: isPublic === o.v ? 'var(--accent)' : 'var(--text-muted)' }}>{o.l}</button>
                ))}
              </div>
            </div>
            <div style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>{t('flashcards.deckCount', { count: deck.cards.length })}{deck.subject ? ` · ${deck.subject}` : ''}</div>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: .98 }} onClick={publish} disabled={loading}
              style={{ padding: '11px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg,#4A90D9,#6366f1)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              {loading ? t('flashcards.generating') : t('flashcards.publishBtn')}
            </motion.button>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: '.82rem', color: '#27AE60', fontWeight: 700 }}>✓ {t('flashcards.published')}</div>
            <div style={{ width: '100%', padding: '16px', borderRadius: 14, background: 'rgba(74,144,217,.1)', border: '1px solid rgba(74,144,217,.3)' }}>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: '#4A90D9', letterSpacing: '.2em', fontFamily: 'monospace' }}>{code}</div>
              <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', marginTop: 4 }}>{t('flashcards.shareCode')}</div>
            </div>
            <button onClick={copy} style={{ width: '100%', padding: '10px', borderRadius: 10, border: `1px solid ${copied ? 'rgba(39,174,96,.3)' : 'var(--border)'}`, background: copied ? 'rgba(39,174,96,.15)' : 'var(--bg-card)', color: copied ? '#27AE60' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 }}>
              {copied ? `✓ ${t('flashcards.copied')}` : `📋 ${t('flashcards.copyCode')}`}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── Import destination picker ────────────────────────────────────────────────
function ImportDestModal({ deck, subjects, onConfirm, onClose }) {
  const { t } = useTranslation();
  const [subjId, setSubjId] = useState(subjects[0] ? String(subjects[0].id) : '');
  const [chapIdx, setChapIdx] = useState(0);
  const subj = subjects.find(s => String(s.id) === subjId);
  const chaps = subj?.chapters?.length ? subj.chapters : Array.from({ length: subj?.chaps || 0 }, (_, i) => ({ name: t('flashcards.chapterFull', { count: i + 1 }) }));
  const inp = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border-strong)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.83rem', boxSizing: 'border-box' };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', backdropFilter: 'blur(14px)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: .92, y: 20 }} animate={{ scale: 1, y: 0 }}
        style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 20, padding: '1.6rem', width: 380, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ color: 'var(--text-primary)', fontWeight: 800, margin: 0 }}>📥 {t('flashcards.importBtn')} · {deck.title}</h3>
        <p style={{ fontSize: '.72rem', color: 'var(--text-muted)', margin: 0 }}>{t('flashcards.importDestHint')}</p>
        {subjects.length === 0 ? (
          <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{t('flashcards.noSubjectsDeck')}</div>
        ) : (
          <>
            <div>
              <label style={{ fontSize: '.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>{t('common.subject')}</label>
              <select value={subjId} onChange={e => { setSubjId(e.target.value); setChapIdx(0); }} style={inp}>
                {subjects.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '.68rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>{t('common.chapter')}</label>
              <select value={chapIdx} onChange={e => setChapIdx(parseInt(e.target.value, 10))} style={inp}>
                {chaps.map((c, i) => <option key={i} value={i}>{c.name || t('flashcards.chapterFull', { count: i + 1 })}</option>)}
              </select>
            </div>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: .98 }}
              onClick={() => onConfirm(deck, parseInt(subjId, 10), chapIdx)}
              style={{ padding: '11px', borderRadius: 11, border: 'none', background: '#27AE60', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              {t('flashcards.importBtn')} ({deck.cards?.length || 0})
            </motion.button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

// ── Community hub (inline tab) ───────────────────────────────────────────────
// Browse shared decks: search, subject filter, sort by recent/popular, card
// preview, like, and import (into a chosen chapter). Reads the newest decks
// server-side (orderBy createdAt, single-field auto-index) then filters/sorts
// in memory.
function HubView({ onImport, likedDecks, onToggleLike, myUid }) {
  const { t } = useTranslation();
  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [search, setSearch] = useState('');
  const [subjFilter, setSubjFilter] = useState('');
  const [sort, setSort] = useState('recent'); // 'recent' | 'popular'
  const [preview, setPreview] = useState(null); // deck id whose cards are shown
  const [confirmDel, setConfirmDel] = useState(null); // deck id awaiting delete confirmation
  const likedSet = new Set(likedDecks || []);

  // Popularity = imports + likes combined (both signal a useful deck).
  const popularity = d => (d.importCount || 0) + (d.likes || 0);

  // Unpublish one of your own decks (allowed for the author by the rules).
  function del(deck) {
    setDecks(prev => prev.filter(d => d.id !== deck.id));
    setConfirmDel(null);
    deleteDoc(doc(db, 'public_decks', deck.id)).catch(e => reportSaveError(e, 'Flashcards — unpublish'));
  }

  useEffect(() => {
    getDocs(query(collection(db, 'public_decks'), orderBy('createdAt', 'desc'), limit(80)))
      .then(snap => { setDecks(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); })
      .catch(e => { reportSaveError(e, 'Flashcards — community load'); setLoading(false); });
  }, []);

  function importByCode() {
    if (!code.trim()) return;
    const found = decks.find(d => d.id.slice(0, 8).toUpperCase() === code.trim().toUpperCase());
    if (found) onImport(found);
  }

  // Optimistic like: reflect the new count locally + delegate the writes.
  function like(deck) {
    const willLike = !likedSet.has(deck.id);
    setDecks(prev => prev.map(d => d.id === deck.id ? { ...d, likes: Math.max(0, (d.likes || 0) + (willLike ? 1 : -1)) } : d));
    onToggleLike(deck);
  }

  const subjectTags = [...new Set(decks.filter(d => d.public !== false && d.subject).map(d => d.subject))];
  const q = search.trim().toLowerCase();
  let list = decks.filter(d => d.public !== false);
  if (subjFilter) list = list.filter(d => d.subject === subjFilter);
  if (q) list = list.filter(d => `${d.title} ${d.author} ${d.subject} ${d.description || ''}`.toLowerCase().includes(q));
  list = [...list].sort((a, b) => sort === 'popular' ? popularity(b) - popularity(a) : (b.createdAt || 0) - (a.createdAt || 0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Search + code import */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`🔍 ${t('common.search')}`}
          style={{ flex: 2, minWidth: 140, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.83rem' }} />
        <input value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && importByCode()} placeholder={t('flashcards.codePlaceholder')}
          style={{ flex: 1, minWidth: 120, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.83rem' }} />
        <button onClick={importByCode} style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: '#4A90D9', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '.83rem' }}>{t('flashcards.importBtn')}</button>
      </div>

      {/* Sort + subject filters */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {[{ v: 'recent', l: t('flashcards.sortRecent') }, { v: 'popular', l: t('flashcards.sortPopular') }].map(o => (
          <button key={o.v} onClick={() => setSort(o.v)}
            style={{ padding: '5px 12px', borderRadius: 20, cursor: 'pointer', fontSize: '.72rem', fontWeight: 600,
              border: `1px solid ${sort === o.v ? 'var(--accent)' : 'var(--border)'}`, background: sort === o.v ? 'var(--accent-subtle)' : 'transparent', color: sort === o.v ? 'var(--accent)' : 'var(--text-muted)' }}>{o.l}</button>
        ))}
        {subjectTags.length > 0 && <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />}
        {subjectTags.slice(0, 8).map(sTag => (
          <button key={sTag} onClick={() => setSubjFilter(subjFilter === sTag ? '' : sTag)}
            style={{ padding: '5px 12px', borderRadius: 20, cursor: 'pointer', fontSize: '.72rem', fontWeight: 600,
              border: `1px solid ${subjFilter === sTag ? 'var(--accent)' : 'var(--border)'}`, background: subjFilter === sTag ? 'var(--accent-subtle)' : 'transparent', color: subjFilter === sTag ? 'var(--accent)' : 'var(--text-muted)' }}>{sTag}</button>
        ))}
      </div>

      {/* Decks */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>{t('common.loading')}</div>
      ) : list.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '.85rem', background: 'var(--bg-card)', border: '1px dashed var(--border)', borderRadius: 14 }}>{t('flashcards.noDecks')}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 10 }}>
          {list.map(deck => {
            const col = deck.subjectColor || '#4A90D9';
            const liked = likedSet.has(deck.id);
            return (
              <div key={deck.id} style={{ padding: '14px', borderRadius: 14, background: 'var(--bg-card)', border: `1px solid ${col}30`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {deck.subject && <span style={{ fontSize: '.6rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: `${col}22`, color: col, whiteSpace: 'nowrap' }}>{deck.subject}</span>}
                  {(deck.importCount > 0) && <span style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>↓ {t('flashcards.importedTimes', { count: deck.importCount })}</span>}
                </div>
                <div style={{ fontSize: '.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>{deck.title || t('flashcards.untitledDeck')}</div>
                {deck.description && <div style={{ fontSize: '.7rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{deck.description}</div>}
                <div style={{ fontSize: '.66rem', color: 'var(--text-muted)' }}>{t('flashcards.by')} {deck.author} · {t('flashcards.deckCount', { count: deck.cardCount ?? deck.cards?.length ?? 0 })}</div>

                {preview === deck.id && deck.cards?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto',
                    background: 'var(--bg-card-hover)', borderRadius: 8, padding: '8px' }}>
                    {deck.cards.map((c, ci) => (
                      <div key={ci} style={{ fontSize: '.68rem', color: 'var(--text-secondary)', paddingBottom: 5, borderBottom: ci < deck.cards.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{ci + 1}. {c.q}</div>
                        <div>{c.a}</div>
                      </div>
                    ))}
                  </div>
                )}

                {confirmDel === deck.id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                    <span style={{ fontSize: '.72rem', color: '#E74C3C', flex: 1 }}>{t('flashcards.unpublishConfirm')}</span>
                    <button onClick={() => setConfirmDel(null)}
                      style={{ padding: '6px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '.72rem', cursor: 'pointer' }}>{t('common.cancel')}</button>
                    <button onClick={() => del(deck)}
                      style={{ padding: '6px 12px', borderRadius: 9, border: 'none', background: 'rgba(231,76,60,.8)', color: '#fff', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer' }}>{t('common.delete')}</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                    <button onClick={() => like(deck)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 9, cursor: 'pointer', fontSize: '.72rem', fontWeight: 700,
                        border: `1px solid ${liked ? '#E74C3C' : 'var(--border)'}`, background: liked ? 'rgba(231,76,60,.12)' : 'transparent', color: liked ? '#E74C3C' : 'var(--text-muted)' }}>
                      {liked ? '❤️' : '🤍'} {deck.likes || 0}
                    </button>
                    {deck.cards?.length > 0 && (
                      <button onClick={() => setPreview(preview === deck.id ? null : deck.id)}
                        style={{ padding: '6px 10px', borderRadius: 9, cursor: 'pointer', fontSize: '.72rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)' }}>
                        👁 {t('flashcards.preview')}
                      </button>
                    )}
                    {deck.authorId === myUid && (
                      <button onClick={() => setConfirmDel(deck.id)} title={t('flashcards.unpublish')}
                        style={{ padding: '6px 10px', borderRadius: 9, cursor: 'pointer', fontSize: '.72rem', border: '1px solid rgba(231,76,60,.25)', background: 'rgba(231,76,60,.08)', color: '#E74C3C' }}>
                        🗑
                      </button>
                    )}
                    <button onClick={() => onImport(deck)}
                      style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 9, border: 'none', background: 'rgba(74,144,217,.2)', color: '#4A90D9', fontWeight: 700, fontSize: '.76rem', cursor: 'pointer' }}>
                      {t('flashcards.importBtn')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function PageFlashcards({ user }) {
  const tour = useGuidedTour('flashcards');
  const { t } = useTranslation();
  const [subjects, setSubjects]     = useState([]);
  const [flashcards, setFlashcards] = useState({});
  const [srData, setSrData]         = useState({}); // spaced-repetition schedule (shared with PageRepetition)
  const [pseudo, setPseudo]         = useState('');  // author name for published decks
  const [likedDecks, setLikedDecks] = useState([]);  // ids of hub decks this user liked
  const [scheduledToast, setScheduledToast] = useState(false); // brief "chapter scheduled for review" notice
  const [loading, setLoading]       = useState(true);
  const [selSubj, setSelSubj]       = useState('');
  const [selChap, setSelChap]       = useState(0);
  const selSubjRef = useRef('');

  function setSelSubjSafe(v) { selSubjRef.current = v; setSelSubj(v); }
  const [tab, setTab]                     = useState('mine');  // 'mine' | 'hub'
  const [view, setView]                   = useState('grid');  // 'grid' | 'deck' | 'quiz'
  const [quizSubset, setQuizSubset]       = useState('all');   // 'all' | 'missed'
  const [showCardModal, setShowCardModal] = useState(false);
  const [editCard, setEditCard]           = useState(null);
  const [showShare, setShowShare]         = useState(false);
  const [importDeck, setImportDeck]       = useState(null); // hub deck awaiting a destination pick
  // Unfinished quizzes, keyed by subject_chapter_subset (see quizKeyFor).
  const [quizSessions, setQuizSessions]   = useState({});
  const [resumePrompt, setResumePrompt]   = useState(null); // { subset, saved } awaiting resume/restart
  const [quizRun, setQuizRun]             = useState(null); // { key, cards, results } of the running quiz

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'data', 'main'), snap => {
      if (snap.exists()) {
        const d = snap.data();
        setSubjects(d.subjects || []);
        setFlashcards(d.flashcards || {});
        setSrData(d.srData || {});
        setPseudo(d.profile?.pseudo || user.displayName || user.email?.split('@')[0] || 'Anonyme');
        setLikedDecks(Array.isArray(d.likedDecks) ? d.likedDecks : []);
        if (!selSubjRef.current && d.subjects?.length) setSelSubjSafe(String(d.subjects[0].id));
      }
      setLoading(false);
    });
    return unsub;
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'data', 'quizSessions'), snap => {
      setQuizSessions(snap.exists() ? (snap.data().sessions || {}) : {});
    }, () => setQuizSessions({}));
    return unsub;
  }, [user]);

  async function save(updated) {
    try { await updateDoc(doc(db, 'users', user.uid, 'data', 'main'), { flashcards: updated }); }
    catch (e) { reportSaveError(e, 'Flashcards — save'); }
  }

  function handleSaveCard(sid, ci, newCards, editIdx) {
    const k = `${sid}_${ci}`;
    let updated;
    if (editIdx !== undefined) {
      const arr = [...(flashcards[k] || [])];
      arr[editIdx] = { ...arr[editIdx], ...newCards[0] };
      updated = { ...flashcards, [k]: arr };
    } else {
      updated = { ...flashcards, [k]: [...(flashcards[k] || []), ...newCards] };
    }
    setFlashcards(updated); save(updated);
    if (!selSubj) { setSelSubj(String(sid)); setSelChap(ci); }
  }

  function handleDelete(cardIdx) {
    const k = `${selSubj}_${selChap}`;
    const currentSubj = selSubj, currentChap = selChap;
    const updated = { ...flashcards, [k]: (flashcards[k] || []).filter((_, i) => i !== cardIdx) };
    setFlashcards(updated);
    save(updated).then(() => { setSelSubj(currentSubj); setSelChap(currentChap); });
  }

  function handleQuizDone(results) {
    if (quizRun) clearQuizSession(quizRun.key);
    setQuizRun(null);
    const k = `${selSubj}_${selChap}`;
    const cards = [...(flashcards[k] || [])];
    results.forEach(r => { const orig = cards.find(c => c.q === r.q); if (orig) orig.ok = r.ok; });
    const updated = { ...flashcards, [k]: cards };
    setFlashcards(updated); save(updated); setView('deck'); setQuizSubset('all');

    // Bridge to spaced repetition: if the user missed cards on this chapter and
    // it isn't already in the SR cycle, schedule it (same shape as PageRepetition
    // writes — firstStudy now, empty reviews). Nudges them to revisit what they
    // struggled with instead of the two memory systems ignoring each other.
    const missedNow = results.some(r => r.ok === false);
    if (missedNow && !srData[k]?.firstStudy) {
      const newSr = { ...srData, [k]: { firstStudy: Date.now(), reviews: [] } };
      setSrData(newSr);
      updateDoc(doc(db, 'users', user.uid, 'data', 'main'), { srData: newSr })
        .catch(e => reportSaveError(e, 'Flashcards — schedule review'));
      setScheduledToast(true);
      setTimeout(() => setScheduledToast(false), 3500);
    }
  }

  // Import a hub deck's cards into a chosen subject/chapter, and bump the
  // deck's public import counter (best-effort — allowed by the security rules).
  function handleImportTo(deck, subjId, chapIdx) {
    if (!deck.cards?.length) return;
    const k = `${subjId}_${chapIdx}`;
    const updated = { ...flashcards, [k]: [...(flashcards[k] || []), ...deck.cards.map(c => ({ q: c.q, a: c.a, ok: null })) ] };
    setFlashcards(updated); save(updated);
    if (deck.id) updateDoc(doc(db, 'public_decks', deck.id), { importCount: increment(1) }).catch(() => {});
    setImportDeck(null);
  }

  // Toggle a like on a hub deck: record it on the user's own doc (dedup) and
  // adjust the deck's public like counter.
  function handleToggleLike(deck) {
    if (!deck.id) return;
    const willLike = !likedDecks.includes(deck.id);
    setLikedDecks(prev => willLike ? [...prev, deck.id] : prev.filter(id => id !== deck.id));
    updateDoc(doc(db, 'users', user.uid, 'data', 'main'), { likedDecks: willLike ? arrayUnion(deck.id) : arrayRemove(deck.id) }).catch(() => {});
    updateDoc(doc(db, 'public_decks', deck.id), { likes: increment(willLike ? 1 : -1) }).catch(() => {});
  }

  const subj  = subjects.find(s => String(s.id) === selSubj);
  const chapters = subj?.chapters?.length ? subj.chapters : Array.from({ length: subj?.chaps || 0 }, (_, i) => ({ name: t('flashcards.chapterFull', { count: i + 1 }) }));
  const cardsOf = (ci) => flashcards[`${selSubj}_${ci}`] || [];
  const openCards = cardsOf(selChap);
  const missedCards = openCards.filter(c => c.ok === false);

  function openDeck(ci) { setSelChap(ci); setView('deck'); }

  /** A quiz is identified by its chapter AND its subset: the decks differ. */
  function quizKeyFor(subset) { return `${selSubj}_${selChap}_${subset}`; }

  function deckFor(subset) {
    return subset === 'missed' && missedCards.length ? missedCards : openCards;
  }

  /** Offer to resume when an unfinished run exists for this exact set. */
  function startQuiz(subset) {
    const saved = quizSessions[quizKeyFor(subset)];
    if (saved?.remaining?.length) setResumePrompt({ subset, saved });
    else beginQuiz(subset, null);
  }

  /** Start the quiz, either from scratch or from a saved position. */
  function beginQuiz(subset, saved) {
    setResumePrompt(null);
    setQuizSubset(subset);
    setQuizRun({
      key: quizKeyFor(subset),
      // Shuffled once, here, so a re-render cannot reorder a running quiz.
      cards: saved ? saved.remaining : [...deckFor(subset)].sort(() => Math.random() - .5),
      results: saved?.results || [],
    });
    setView('quiz');
  }

  /**
   * Save the position after every card, so closing the app mid-quiz loses
   * nothing. An empty remainder means the last card was just answered: drop
   * the save rather than leave a finished session lying around.
   */
  function saveQuizProgress(results, remaining) {
    if (!quizRun) return;
    if (!remaining.length) { clearQuizSession(quizRun.key); return; }
    setDoc(doc(db, 'users', user.uid, 'data', 'quizSessions'), {
      sessions: {
        [quizRun.key]: {
          subset: quizSubset,
          results,
          remaining,
          total: results.length + remaining.length,
          updatedAt: new Date().toISOString(),
        },
      },
    }, { merge: true })
      .catch(e => reportSaveError(e, 'Flashcards — save quiz progress'));
  }

  /** Forget a saved run (finished, or restarted from scratch). */
  function clearQuizSession(key) {
    return updateDoc(doc(db, 'users', user.uid, 'data', 'quizSessions'),
      { [`sessions.${key}`]: deleteField() }).catch(() => {});
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <motion.div animate={{ opacity: [.3, 1, .3] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</motion.div>
    </div>
  );

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14, fontFamily: 'var(--font-family)' }}>
      <style>{`
        @media (max-width:600px) {
          .neon-card { width: calc(100vw - 48px) !important; height: 240px !important; }
        }
      `}</style>

      {/* Toast: a struggled-with chapter was added to spaced repetition */}
      <AnimatePresence>
        {scheduledToast && (
          <motion.div initial={{ opacity: 0, y: -20, scale: .9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12 }}
            style={{ position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
              padding: '10px 20px', borderRadius: 16, background: 'var(--bg-modal)', border: '1px solid var(--accent-glow)',
              color: 'var(--text-primary)', fontSize: '.82rem', fontWeight: 600, boxShadow: '0 8px 32px rgba(0,0,0,.3)',
              display: 'flex', alignItems: 'center', gap: 8 }}>
            🔁 {t('flashcards.scheduledReview')}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header + tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>🃏 {t('flashcards.title')}</h1>
      </div>
      <TourButton onClick={tour.start} label={t('common.guidedTour')} align='flex-start' />

      <div data-tour="tour-flash-tabs" style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', padding: 4, borderRadius: 12, alignSelf: 'flex-start' }}>
        {[{ v: 'mine', l: `📚 ${t('flashcards.myCards')}` }, { v: 'hub', l: `🌍 ${t('flashcards.community')}` }].map(tb => (
          <button key={tb.v} onClick={() => { setTab(tb.v); setView('grid'); }}
            style={{ padding: '7px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: '.82rem', fontWeight: 700,
              background: tab === tb.v ? 'var(--accent-subtle)' : 'transparent',
              color: tab === tb.v ? 'var(--accent)' : 'var(--text-muted)', transition: 'all .15s' }}>
            {tb.l}
          </button>
        ))}
      </div>

      {/* ── HUB TAB ── */}
      {tab === 'hub' && <HubView onImport={setImportDeck} likedDecks={likedDecks} onToggleLike={handleToggleLike} myUid={user.uid} />}

      {/* ── MY CARDS TAB ── */}
      {tab === 'mine' && (
        <AnimatePresence mode="wait">

          {/* Deck grid — subjects + visual chapter decks */}
          {view === 'grid' && (
            <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {subjects.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px dashed var(--border)', borderRadius: 16 }}>
                  {t('flashcards.noSubjectsDeck')}
                </div>
              ) : (
                <>
                  {/* Subject pills */}
                  <div data-tour="tour-flash-subjects" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
                    {subjects.map(s => {
                      const active = String(s.id) === selSubj;
                      return (
                        <motion.button key={s.id} onClick={() => { setSelSubjSafe(String(s.id)); setSelChap(0); }}
                          whileHover={{ scale: 1.04, y: -1 }} whileTap={{ scale: .97 }}
                          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 20,
                            border: `1px solid ${active ? s.color : 'rgba(255,255,255,.08)'}`,
                            background: active ? `${s.color}18` : 'var(--bg-card)', color: active ? s.color : 'var(--text-muted)',
                            fontSize: '.8rem', fontWeight: active ? 700 : 400, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                          {s.name}
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Chapter decks grid */}
                  <div data-tour="tour-flash-decks" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
                    {chapters.map((c, i) => {
                      const cc = cardsOf(i);
                      const mastered = cc.filter(x => x.ok === true).length;
                      const toReview = cc.filter(x => x.ok === false).length;
                      const col = subj?.color || '#4A90D9';
                      const pct = cc.length ? Math.round(mastered / cc.length * 100) : 0;
                      return (
                        <motion.button key={i} onClick={() => openDeck(i)}
                          whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: .97 }}
                          style={{ textAlign: 'left', padding: '14px', borderRadius: 14, cursor: 'pointer',
                            border: `1px solid ${cc.length ? `${col}40` : 'var(--border)'}`,
                            background: cc.length ? `${col}0e` : 'var(--bg-card)', display: 'flex', flexDirection: 'column', gap: 8,
                            opacity: cc.length ? 1 : .7 }}>
                          <div style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.name || t('flashcards.chapterFull', { count: i + 1 })}
                          </div>
                          <div style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>
                            {cc.length ? t('flashcards.deckCount', { count: cc.length }) : `+ ${t('flashcards.addCards')}`}
                          </div>
                          {cc.length > 0 && (
                            <>
                              <div style={{ height: 5, borderRadius: 8, background: 'var(--border)', overflow: 'hidden', display: 'flex' }}>
                                <div style={{ width: `${(mastered / cc.length) * 100}%`, background: '#27AE60' }} />
                                <div style={{ width: `${(toReview / cc.length) * 100}%`, background: '#E74C3C' }} />
                              </div>
                              <div style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>{pct}% {t('flashcards.mastered').toLowerCase()}</div>
                            </>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* Deck view — one chapter's cards + unified review */}
          {view === 'deck' && (
            <motion.div key="deck" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Deck header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }} onClick={() => setView('grid')}
                  style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer' }}>←</motion.button>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>{chapters[selChap]?.name || t('flashcards.chapterFull', { count: selChap + 1 })}</div>
                  <div style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>{subj?.name} · {t('flashcards.deckCount', { count: openCards.length })}</div>
                </div>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: .97 }} onClick={() => setShowCardModal(true)}
                  style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '.8rem', fontWeight: 700, cursor: 'pointer' }}>+ {t('flashcards.card')}</motion.button>
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: .97 }} onClick={() => setShowShare(true)}
                  style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '.8rem', cursor: 'pointer' }}>🔗 {t('flashcards.share')}</motion.button>
              </div>

              {/* Unified review bar */}
              {openCards.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12, background: 'rgba(39,174,96,.08)', border: '1px solid rgba(39,174,96,.2)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '.82rem', fontWeight: 700, color: '#27AE60', display: 'flex', alignItems: 'center', gap: 6 }}>🎴 {t('flashcards.review')}</span>
                  <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
                    <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: .96 }} onClick={() => startQuiz('all')}
                      style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: '#27AE60', color: '#fff', fontSize: '.78rem', fontWeight: 700, cursor: 'pointer' }}>
                      {t('flashcards.allCards')} ({openCards.length})
                    </motion.button>
                    {missedCards.length > 0 && (
                      <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: .96 }} onClick={() => startQuiz('missed')}
                        style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid #E67E22', background: 'rgba(230,126,34,.12)', color: '#E67E22', fontSize: '.78rem', fontWeight: 700, cursor: 'pointer' }}>
                        {t('flashcards.toReview')} ({missedCards.length})
                      </motion.button>
                    )}
                  </div>
                </div>
              )}

              {/* Cards */}
              {openCards.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px dashed var(--border)', borderRadius: 16 }}>
                  <div style={{ fontSize: '3rem', marginBottom: 12 }}>🃏</div>
                  <div style={{ marginBottom: 16 }}>{t('flashcards.emptyChapter')}</div>
                  <button onClick={() => setShowCardModal(true)}
                    style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: '#4A90D9', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                    + {t('flashcards.addCards')}
                  </button>
                </div>
              ) : (
                <FlashcardMasonry
                  cards={openCards.map((c, i) => ({ ...c, i }))}
                  onEdit={card => { setEditCard({ ...card, subjId: selSubj, chapIdx: selChap, cardIdx: card.i }); setShowCardModal(true); }}
                  onDelete={handleDelete}
                />
              )}
            </motion.div>
          )}

          {/* Quiz */}
          {view === 'quiz' && (
            <motion.div key="quiz" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ height: 'calc(100vh - 200px)', minHeight: 400, position: 'relative' }}>
              {quizRun && (
                <FlashcardStack
                  cards={quizRun.cards}
                  initialResults={quizRun.results}
                  onProgress={saveQuizProgress}
                  onDone={handleQuizDone} />
              )}
            </motion.div>
          )}

        </AnimatePresence>
      )}

      {/* Modals */}
      <AnimatePresence>
        {resumePrompt && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={e => e.target === e.currentTarget && setResumePrompt(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 1100, padding: '1rem',
              background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(12px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <motion.div initial={{ scale: .93, y: 16 }} animate={{ scale: 1, y: 0 }}
              style={{ width: 340, maxWidth: '100%', borderRadius: 18, padding: '1.5rem',
                background: 'var(--bg-modal)', border: '1px solid var(--border-strong)',
                display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {t('flashcards.resumeTitle')}
              </h3>
              <p style={{ margin: 0, fontSize: '.84rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                {t('flashcards.resumeBody', {
                  done: (resumePrompt.saved.results || []).length,
                  total: resumePrompt.saved.total
                    || ((resumePrompt.saved.results || []).length + resumePrompt.saved.remaining.length),
                })}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => beginQuiz(resumePrompt.subset, null)}
                  style={{ flex: 1, padding: '10px', borderRadius: 11, cursor: 'pointer',
                    border: '1px solid var(--border-strong)', background: 'var(--bg-card)',
                    color: 'var(--text-secondary)', fontSize: '.82rem', fontWeight: 700 }}>
                  {t('flashcards.restartBtn')}
                </button>
                <button onClick={() => beginQuiz(resumePrompt.subset, resumePrompt.saved)}
                  style={{ flex: 1, padding: '10px', borderRadius: 11, cursor: 'pointer',
                    border: 'none', background: 'var(--accent)', color: '#fff',
                    fontSize: '.82rem', fontWeight: 700 }}>
                  {t('flashcards.resumeBtn')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {showCardModal && (
          <CardModal card={editCard} subjects={subjects} currentSubjId={parseInt(selSubj, 10)} currentChapIdx={selChap}
            onSave={handleSaveCard} onClose={() => { setShowCardModal(false); setEditCard(null); }} />
        )}
        {showShare && subj && (
          <PublishModal
            deck={{ title: `${subj.name} — ${chapters[selChap]?.name || t('flashcards.chapterFull', { count: selChap + 1 })}`, cards: openCards,
              subject: subj.name, subjectColor: subj.color }}
            author={pseudo} user={user} onClose={() => setShowShare(false)} />
        )}
        {importDeck && (
          <ImportDestModal deck={importDeck} subjects={subjects}
            onConfirm={handleImportTo} onClose={() => setImportDeck(null)} />
        )}
      </AnimatePresence>

      <GuidedTour active={tour.active} step={tour.step} steps={tour.steps}
        onNext={tour.next} onPrev={tour.prev} onStop={tour.stop} />
    </div>
  );
}