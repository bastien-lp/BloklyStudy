/**
 * PageJournal — Revision journal
 * --------------------------------------------------------------------------
 * The user writes session notes, each tagged with a mood and (optionally) a
 * subject. Entries live in the Firestore document `users/{uid}/data/main`
 * under the `journalEntries` key.
 *
 * Entry shape (UNCHANGED — existing accounts depend on it):
 *   { date, dateISO, subj, color, text, mood }
 *   - date    : human-readable label, kept for backward compatibility (display
 *               is now derived from dateISO so it stays locale-correct)
 *   - dateISO : full ISO timestamp → stable identity (sorting, React keys)
 *   - subj    : subject name (empty string if none)
 *   - color   : subject color (defaults to #4A90D9)
 *   - text    : note body
 *   - mood    : mood emoji — this glyph IS the stored value, so the MOODS
 *               table below must never change its `emoji` fields
 *
 * Props: { user } — authenticated Firebase user.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import {
  NotebookPen, Search, Trash2, Pencil, Check, X, Flame, Save,
} from 'lucide-react';
import { db } from '../firebase/config';
import { useTranslation } from '../i18n';
import { GuidedTour, useGuidedTour, TourButton } from '../components/GuidedTour';
import { EmptyState } from '../components/ui';
import { reportSaveError } from '../lib/notify';
import { dayKey } from '../lib/dayKeys';

// ── Moods ───────────────────────────────────────────────────────────────────
// `emoji` is the persisted value; labels are i18n keys resolved at render time.
const MOODS = [
  { emoji: '😴', labelKey: 'journal.moodTired',   color: '#6b7280' },
  { emoji: '😐', labelKey: 'journal.moodNeutral', color: '#F1C40F' },
  { emoji: '🙂', labelKey: 'journal.moodGood',    color: '#4A90D9' },
  { emoji: '🔥', labelKey: 'journal.moodFire',    color: '#E74C3C' },
];
const DEFAULT_MOOD = '🙂';
const DEFAULT_COLOR = '#4A90D9';
const PREVIEW_LENGTH = 220;           // characters shown before "Read more"
const DRAFT_KEY = 'blokly-journal-draft';

const DATE_FORMAT = { day: 'numeric', month: 'short', year: 'numeric' };
const DAY_HEADER_FORMAT = { weekday: 'long', day: 'numeric', month: 'long' };

// ── Helpers ────────────────────────────────────────────────────────────────

/** Legacy entries may predate a field; never let a missing string crash a render. */
const safeText = e => (typeof e?.text === 'string' ? e.text : '');
const safeSubj = e => (typeof e?.subj === 'string' ? e.subj : '');

/** Build a new entry. `formatDate` comes from the active locale. */
function buildEntry({ now, subject, text, mood, formatDate }) {
  return {
    date: formatDate(now, DATE_FORMAT),
    dateISO: now.toISOString(),
    subj: subject?.name || '',
    color: subject?.color || DEFAULT_COLOR,
    text: text.trim(),
    mood,
  };
}

/**
 * Consecutive days with at least one entry.
 *
 * The old version counted back only from today, so the streak read 0 all
 * morning until you had written — discouraging, and not really true: a streak
 * is not broken until the day actually ends. If today is still blank we start
 * counting from yesterday and flag it, so the UI can nudge instead of scold.
 *
 * @returns {{ days: number, writtenToday: boolean }}
 */
function computeStreak(entries) {
  const writtenDays = new Set(
    entries
      .map(e => (e.dateISO ? new Date(e.dateISO) : null))
      .filter(d => d && !Number.isNaN(d.getTime()))
      .map(d => dayKey(d)),
  );
  if (!writtenDays.size) return { days: 0, writtenToday: false };

  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  const writtenToday = writtenDays.has(dayKey(cursor));
  if (!writtenToday) cursor.setDate(cursor.getDate() - 1);   // grace period

  let days = 0;
  while (writtenDays.has(dayKey(cursor))) {
    days += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { days, writtenToday };
}

/** Accent-insensitive, case-insensitive haystack matching. */
const normalise = s =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Group already-sorted entries into day buckets, preserving order. */
function groupByDay(entries) {
  const groups = [];
  let current = null;
  for (const entry of entries) {
    const key = entry.dateISO ? dayKey(new Date(entry.dateISO)) : 'unknown';
    if (!current || current.key !== key) {
      current = { key, iso: entry.dateISO, items: [] };
      groups.push(current);
    }
    current.items.push(entry);
  }
  return groups;
}

// ── Draft persistence ───────────────────────────────────────────────────────
// A half-written note should survive a reload or a stray navigation. Kept in
// localStorage under its own key, so the `blokly-prefs-v3` contract is untouched.
function loadDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || null; } catch { return null; }
}
function saveDraft(draft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* private mode */ }
}
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* private mode */ }
}

// ── Single entry card ───────────────────────────────────────────────────────
function JournalEntry({ entry, index, onDelete, onSave }) {
  const { t, formatDate } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => safeText(entry));
  const editRef = useRef(null);

  const color = entry.color || DEFAULT_COLOR;
  const text = safeText(entry);
  const subj = safeSubj(entry);
  const needsExpand = text.length > PREVIEW_LENGTH;
  const dateLabel = entry.dateISO
    ? formatDate(entry.dateISO, { hour: '2-digit', minute: '2-digit' })
    : entry.date;

  useEffect(() => {
    if (editing) editRef.current?.focus();
  }, [editing]);

  function beginEdit() {
    setDraft(text);
    setEditing(true);
    setExpanded(true);
  }

  function commitEdit() {
    const next = draft.trim();
    if (next && next !== text) onSave({ ...entry, text: next });
    setEditing(false);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.03, duration: .25, ease: 'easeOut' }}
      style={{
        position: 'relative',
        background: 'var(--bg-card)',
        borderRadius: 14,
        padding: '13px 15px 13px 17px',
        overflow: 'hidden',
      }}
    >
      {/* The subject's colour as a spine, rather than a full border */}
      <span aria-hidden="true" style={{
        position: 'absolute', left: 0, top: 10, bottom: 10,
        width: 3, borderRadius: 3, background: color,
      }} />

      {/* Header: mood, time, subject, actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <span style={{ fontSize: '1.05rem', lineHeight: 1 }}>{entry.mood || DEFAULT_MOOD}</span>
        <span style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--text-muted)' }}>
          {dateLabel}
        </span>
        {subj && (
          <span style={{
            fontSize: '.66rem', padding: '2px 8px', borderRadius: 20,
            background: `${color}1f`, color, fontWeight: 700,
          }}>
            {subj}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <AnimatePresence mode="wait" initial={false}>
            {confirming ? (
              // Inline confirmation: a journal entry is not something to lose
              // to a stray click, and there is no undo behind it.
              <motion.div key="confirm"
                initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>
                  {t('journal.confirmDelete')}
                </span>
                <button onClick={onDelete} aria-label={t('journal.confirmYes')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                    borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: '.68rem', fontWeight: 700,
                    background: 'rgba(231,76,60,.14)', color: 'var(--danger)' }}>
                  <Trash2 size={12} strokeWidth={2.4} />{t('journal.confirmYes')}
                </button>
                <button onClick={() => setConfirming(false)}
                  style={{ padding: '4px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    fontSize: '.68rem', fontWeight: 600,
                    background: 'var(--bg-card-hover)', color: 'var(--text-secondary)' }}>
                  {t('journal.confirmNo')}
                </button>
              </motion.div>
            ) : (
              <motion.div key="actions"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ display: 'flex', gap: 4 }}>
                <button onClick={beginEdit} aria-label={t('journal.edit')} title={t('journal.edit')}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 26, height: 26, borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: 'transparent', color: 'var(--text-muted)' }}>
                  <Pencil size={13} strokeWidth={2.2} />
                </button>
                <button onClick={() => setConfirming(true)}
                  aria-label={t('journal.deleteEntry')} title={t('journal.deleteEntry')}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 26, height: 26, borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: 'transparent', color: 'var(--text-muted)' }}>
                  <Trash2 size={13} strokeWidth={2.2} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Body — read or edit */}
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            ref={editRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setEditing(false); return; }
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') commitEdit();
            }}
            rows={Math.min(14, Math.max(3, draft.split('\n').length + 1))}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, boxSizing: 'border-box',
              border: '1px solid var(--accent)', background: 'var(--bg-input)',
              color: 'var(--text-primary)', fontSize: '.82rem', lineHeight: 1.6,
              fontFamily: 'var(--font-family)', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={commitEdit} disabled={!draft.trim()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px',
                borderRadius: 20, border: 'none', fontSize: '.72rem', fontWeight: 700,
                cursor: draft.trim() ? 'pointer' : 'not-allowed',
                opacity: draft.trim() ? 1 : .5,
                background: 'var(--accent)', color: '#fff' }}>
              <Check size={13} strokeWidth={2.6} />{t('journal.saveEdit')}
            </button>
            <button onClick={() => setEditing(false)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: '.72rem', fontWeight: 600,
                background: 'var(--bg-card-hover)', color: 'var(--text-secondary)' }}>
              <X size={13} strokeWidth={2.4} />{t('journal.cancelEdit')}
            </button>
            <span style={{ marginLeft: 'auto', fontSize: '.64rem', color: 'var(--text-muted)' }}>
              {t('journal.shortcutHint')}
            </span>
          </div>
        </div>
      ) : (
        <>
          <p style={{ fontSize: '.82rem', color: 'var(--text-secondary)', lineHeight: 1.65,
            margin: 0, whiteSpace: 'pre-wrap' }}>
            {expanded || !needsExpand ? text : `${text.slice(0, PREVIEW_LENGTH)}…`}
          </p>
          {needsExpand && (
            <button onClick={() => setExpanded(e => !e)}
              style={{ background: 'transparent', border: 'none', padding: 0, marginTop: 6,
                color: 'var(--accent)', fontSize: '.7rem', fontWeight: 600, cursor: 'pointer' }}>
              {expanded ? t('journal.readLess') : t('journal.readMore')}
            </button>
          )}
        </>
      )}
    </motion.div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function PageJournal({ user }) {
  const { t, formatDate, formatNumber } = useTranslation();
  const tour = useGuidedTour('journal');

  const [subjects, setSubjects] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  // New-entry form, seeded from any draft left behind by a previous visit.
  const [restoredDraft] = useState(loadDraft);
  const [selSubj, setSelSubj] = useState(() => restoredDraft?.subj ?? '');
  const [mood, setMood] = useState(() => restoredDraft?.mood ?? DEFAULT_MOOD);
  const [text, setText] = useState(() => restoredDraft?.text ?? '');
  const [draftNoticeOpen, setDraftNoticeOpen] = useState(() => !!restoredDraft?.text);
  const textRef = useRef(null);

  // Filters
  const [filter, setFilter] = useState('all'); // 'all' | mood emoji
  const [search, setSearch] = useState('');

  // ── Firestore subscription ──
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'data', 'main'), snap => {
      if (snap.exists()) {
        const d = snap.data();
        setSubjects(d.subjects || []);
        setEntries(Array.isArray(d.journalEntries) ? d.journalEntries : []);
        // Preselect the first subject while none is chosen.
        setSelSubj(prev => prev || (d.subjects?.length ? String(d.subjects[0].id) : ''));
      }
      setLoading(false);
    });
    return unsub;
  }, [user]);

  // ── Draft autosave ──
  // Debounced so we are not hammering localStorage on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => {
      if (text.trim()) saveDraft({ text, mood, subj: selSubj });
      else clearDraft();
    }, 400);
    return () => clearTimeout(id);
  }, [text, mood, selSubj]);

  // ── Persistence ──
  const persist = useCallback(async updated => {
    try {
      await updateDoc(doc(db, 'users', user.uid, 'data', 'main'), { journalEntries: updated });
    } catch (e) {
      reportSaveError(e, 'Journal — save');
    }
  }, [user]);

  function handleAdd() {
    if (!text.trim()) return;
    const subject = subjects.find(s => String(s.id) === String(selSubj));
    const updated = [buildEntry({ now: new Date(), subject, text, mood, formatDate }), ...entries];
    setEntries(updated);
    persist(updated);
    setText('');
    clearDraft();
    setDraftNoticeOpen(false);
    textRef.current?.focus();
  }

  // Delete by object identity → reliable even if dateISO is missing.
  function handleDelete(target) {
    const updated = entries.filter(e => e !== target);
    setEntries(updated);
    persist(updated);
  }

  /** Replace one entry in place, keeping its position in the list. */
  function handleUpdate(target, next) {
    const updated = entries.map(e => (e === target ? next : e));
    setEntries(updated);
    persist(updated);
  }

  function discardDraft() {
    setText('');
    clearDraft();
    setDraftNoticeOpen(false);
  }

  // ── Derived data ──
  const moodCounts = useMemo(
    () => MOODS.map(m => ({ ...m, count: entries.filter(e => e.mood === m.emoji).length })),
    [entries],
  );
  const { days: streak, writtenToday } = useMemo(() => computeStreak(entries), [entries]);

  const filtered = useMemo(() => {
    const q = normalise(search.trim());
    return entries.filter(e => {
      if (filter !== 'all' && e.mood !== filter) return false;
      if (!q) return true;
      return normalise(safeText(e)).includes(q) || normalise(safeSubj(e)).includes(q);
    });
  }, [entries, filter, search]);

  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  /** "Today" / "Yesterday" / a full date, for a day header. */
  const dayLabel = useCallback(iso => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (dayKey(d) === dayKey(today)) return t('journal.today');
    if (dayKey(d) === dayKey(yesterday)) return t('journal.yesterday');
    return formatDate(d, DAY_HEADER_FORMAT);
  }, [t, formatDate]);

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}
          style={{ color: 'var(--text-muted)' }}>
          {t('common.loading')}
        </motion.div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18,
      fontFamily: 'var(--font-family)' }}>

      <TourButton onClick={tour.start} label={t('common.guidedTour')} />

      {/* ── Summary: one row, no boxes inside boxes ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
        padding: '14px 18px', borderRadius: 16, background: 'var(--bg-card)' }}>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
          <span style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1 }}>
            {formatNumber(entries.length)}
          </span>
          <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{t('journal.entries')}</span>
        </div>

        <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Flame size={18} strokeWidth={2.2}
            color={streak > 0 ? '#E8963C' : 'var(--text-muted)'}
            fill={writtenToday && streak > 0 ? '#E8963C' : 'none'} />
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontSize: '1.15rem', fontWeight: 800, lineHeight: 1,
                color: streak > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{streak}</span>
              <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{t('journal.streakLabel')}</span>
            </div>
            {/* The streak survives an unwritten today; say so instead of showing 0. */}
            {streak > 0 && !writtenToday && (
              <div style={{ fontSize: '.62rem', color: '#E8963C', marginTop: 1 }}>
                {t('journal.streakGrace')}
              </div>
            )}
          </div>
        </div>

        {/* Mood distribution doubles as the filter */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }} role="group"
          aria-label={t('journal.filterByMood')}>
          {moodCounts.map(m => {
            const active = filter === m.emoji;
            return (
              <button key={m.emoji}
                onClick={() => setFilter(active ? 'all' : m.emoji)}
                aria-pressed={active}
                title={`${t(m.labelKey)} · ${m.count}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px',
                  borderRadius: 20, border: 'none', cursor: 'pointer',
                  transition: 'background .15s',
                  background: active ? `${m.color}22` : 'var(--bg-card-hover)',
                  color: active ? m.color : 'var(--text-muted)',
                  fontSize: '.72rem', fontWeight: active ? 800 : 600 }}>
                <span style={{ fontSize: '.86rem', lineHeight: 1 }}>{m.emoji}</span>
                {m.count}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── New entry ── */}
      <motion.div
        data-tour="tour-journal-form"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ background: 'var(--bg-card)', borderRadius: 16, padding: '1.3rem' }}
      >
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.9rem', fontWeight: 700,
          color: 'var(--text-primary)', margin: '0 0 14px' }}>
          <NotebookPen size={16} strokeWidth={2.2} color="var(--accent)" />
          {t('journal.newEntry')}
        </h2>

        {/* A note left half-written last time is restored, not silently dropped. */}
        <AnimatePresence>
          {draftNoticeOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px',
                borderRadius: 10, background: 'var(--accent-subtle)' }}>
                <Save size={14} strokeWidth={2.2} color="var(--accent)" style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '.72rem', color: 'var(--text-secondary)' }}>
                  {t('journal.draftRestored')}
                </span>
                <button onClick={discardDraft}
                  style={{ padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    background: 'transparent', color: 'var(--text-muted)', fontSize: '.68rem', fontWeight: 600 }}>
                  {t('journal.discardDraft')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selSubj}
            onChange={e => setSelSubj(e.target.value)}
            style={{ flex: 1, minWidth: 120, padding: '8px 10px', borderRadius: 10,
              border: '1px solid var(--border-strong)', background: 'var(--bg-input)',
              color: 'var(--text-primary)', fontSize: '.82rem' }}
          >
            <option value="" style={{ background: 'var(--bg-modal)' }}>{t('journal.subjectPlaceholder')}</option>
            {subjects.map(s => (
              <option key={s.id} value={String(s.id)} style={{ background: 'var(--bg-modal)' }}>{s.name}</option>
            ))}
          </select>

          <div style={{ display: 'flex', gap: 5 }}>
            {MOODS.map(m => {
              const active = mood === m.emoji;
              return (
                <motion.button key={m.emoji}
                  onClick={() => setMood(m.emoji)}
                  whileTap={{ scale: .9 }}
                  animate={{ scale: active ? 1.1 : 1 }}
                  aria-pressed={active}
                  title={t(m.labelKey)}
                  style={{ width: 38, height: 38, borderRadius: 11, border: 'none', cursor: 'pointer',
                    fontSize: '1.1rem', lineHeight: 1,
                    background: active ? `${m.color}26` : 'var(--bg-card-hover)',
                    boxShadow: active ? `inset 0 0 0 2px ${m.color}` : 'none',
                    transition: 'background .15s, box-shadow .15s' }}>
                  {m.emoji}
                </motion.button>
              );
            })}
          </div>
        </div>

        <textarea
          ref={textRef}
          value={text}
          onChange={e => { setText(e.target.value); if (draftNoticeOpen) setDraftNoticeOpen(false); }}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleAdd(); }}
          placeholder={t('journal.textPlaceholder')}
          rows={4}
          style={{ width: '100%', padding: '11px 13px', borderRadius: 12,
            border: '1px solid var(--border-strong)', background: 'var(--bg-input)',
            color: 'var(--text-primary)', fontSize: '.85rem', resize: 'vertical',
            fontFamily: 'var(--font-family)', lineHeight: 1.65, boxSizing: 'border-box' }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>
            {wordCount > 0
              ? `${t('journal.wordCount', { count: wordCount })} · ${t('journal.shortcutHint')}`
              : t('journal.shortcutHint')}
          </span>
          <motion.button
            whileHover={text.trim() ? { scale: 1.03 } : {}}
            whileTap={text.trim() ? { scale: 0.97 } : {}}
            onClick={handleAdd}
            disabled={!text.trim()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '9px 20px', borderRadius: 22, border: 'none',
              background: text.trim() ? 'var(--accent)' : 'var(--bg-card-hover)',
              color: text.trim() ? '#fff' : 'var(--text-muted)',
              fontSize: '.82rem', fontWeight: 700,
              cursor: text.trim() ? 'pointer' : 'default',
              boxShadow: text.trim() ? '0 4px 14px -8px var(--accent-glow)' : 'none',
            }}
          >
            <Check size={15} strokeWidth={2.6} />
            {t('journal.saveBtn')}
          </motion.button>
        </div>
      </motion.div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={() => setFilter('all')}
          style={{
            padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
            fontSize: '.75rem', fontWeight: filter === 'all' ? 700 : 500,
            background: filter === 'all' ? 'var(--accent-subtle)' : 'var(--bg-card)',
            color: filter === 'all' ? 'var(--accent)' : 'var(--text-muted)',
          }}
        >
          {t('journal.allFilter', { count: entries.length })}
        </button>

        <div style={{ marginLeft: 'auto', position: 'relative' }}>
          <Search size={13} strokeWidth={2.2} color="var(--text-muted)"
            style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('journal.searchPlaceholder')}
            style={{ padding: '6px 12px 6px 30px', borderRadius: 20, border: 'none',
              background: 'var(--bg-card)', color: 'var(--text-primary)',
              fontSize: '.75rem', width: 180 }}
          />
        </div>
      </div>

      {/* ── Entries list, grouped by day ── */}
      <div data-tour="tour-journal-entries">
        {grouped.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <EmptyState
              icon={NotebookPen}
              description={entries.length === 0 ? t('journal.emptyAll') : t('journal.emptyFiltered')}
            />
          </motion.div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {grouped.map(group => (
              <div key={group.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Day header: a rule with the date sitting on it */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text-secondary)',
                    textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                    {dayLabel(group.iso)}
                  </span>
                  <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  <span style={{ fontSize: '.64rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {t('journal.entriesOnDay', { count: group.items.length })}
                  </span>
                </div>

                <AnimatePresence initial={false}>
                  {group.items.map((entry, i) => (
                    <JournalEntry
                      key={entry.dateISO || `${group.key}-${i}`}
                      entry={entry}
                      index={i}
                      onDelete={() => handleDelete(entry)}
                      onSave={next => handleUpdate(entry, next)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </div>

      <GuidedTour active={tour.active} step={tour.step} steps={tour.steps}
        onNext={tour.next} onPrev={tour.prev} onStop={tour.stop} />
    </div>
  );
}
