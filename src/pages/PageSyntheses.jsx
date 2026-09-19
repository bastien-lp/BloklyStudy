/**
 * PageSyntheses — Chapter status tracker per subject
 * --------------------------------------------------------------------------
 * Each subject has a list of chapters, each with a status (todo / wip / done)
 * and an optional note. Stored in `users/{uid}/data/main` under `subjects`:
 *   subject.chapters = [{ name, status, note }]
 *
 * NOTE — legacy fields kept for backward compatibility:
 *   Older data / other pages still read `subject.chaps` (count) and
 *   `subject.chapsDone` (count). We keep writing them alongside `chapters`
 *   so nothing downstream breaks. `chapters` is the source of truth here.
 *
 * DOCUMENTS (when the Cloudflare worker is configured): a second view lists
 * the files the student attached to subjects / chapters (R2, see
 * src/lib/docs.js and components/docs/). Chapter rows show how many files
 * they hold and accept files dropped straight onto them. Nothing about
 * documents is written to users/{uid}/data/main.
 *
 * Props: { user }
 */

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useTranslation } from '../i18n';
import { GuidedTour, useGuidedTour, TourButton } from '../components/GuidedTour';
import { reportSaveError } from '../lib/notify';
import { ListChecks, FolderOpen, Paperclip, Library } from 'lucide-react';
import { useDocs } from '../hooks/useDocs';
import DocLibrary from '../components/docs/DocLibrary';
import LibraryBrowser from '../components/docs/LibraryBrowser';

const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');

// Status definitions. `labelKey` is resolved to text at render time.
const STATUS = {
  todo: { labelKey: 'syntheses.statusTodo', emoji: '⭕', color: 'rgba(255,255,255,.3)', bg: 'rgba(255,255,255,.05)' },
  wip:  { labelKey: 'syntheses.statusWip',  emoji: '📝', color: '#F1C40F',             bg: 'rgba(241,196,15,.12)' },
  done: { labelKey: 'syntheses.statusDone', emoji: '✅', color: '#27AE60',             bg: 'rgba(39,174,96,.12)' },
};

// ── Mini heatmap (one square per chapter) ────────────────────────────────────
function ChapterHeatmap({ chapters, color }) {
  return (
    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', maxWidth: 180 }}>
      {chapters.map((c, i) => (
        <div key={i} title={c.name}
          style={{ width: 10, height: 10, borderRadius: 2,
            background: c.status === 'done' ? color : c.status === 'wip' ? '#F1C40F' : 'var(--border)',
            transition: 'background .2s' }} />
      ))}
    </div>
  );
}

// ── Status toggle (todo / wip / done) ────────────────────────────────────────
function StatusToggle({ current, onChange }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', background: 'var(--bg-card-hover)', borderRadius: 10, padding: 3, gap: 2 }}>
      {Object.entries(STATUS).map(([key, s]) => (
        <button key={key} onClick={e => { e.stopPropagation(); onChange(key); }}
          style={{ padding: '4px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: '.68rem', fontWeight: 600,
            background: current === key ? s.bg : 'transparent',
            color: current === key ? s.color : 'var(--text-muted)',
            transition: 'all .15s' }}>
          {s.emoji} {t(s.labelKey)}
        </button>
      ))}
    </div>
  );
}

// ── Single chapter row ───────────────────────────────────────────────────────
function ChapterRow({ chap, idx, onSetStatus, onEditName, onEditNote, docCount = 0, onOpenDocs, onDropFiles }) {
  const { t } = useTranslation();
  const [fileOver, setFileOver] = useState(false);
  const [showNote, setShowNote] = useState(!!chap.note);
  const [editNote, setEditNote] = useState(false);
  const [note, setNote] = useState(chap.note || '');
  const s = STATUS[chap.status] || STATUS.todo;

  // Keep the local note in sync with remote changes (e.g. another device),
  // but never overwrite what the user is actively typing.
  useEffect(() => {
    if (!editNote) setNote(chap.note || '');
  }, [chap.note]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * .03 }}
      {...(onDropFiles ? {
        onDragOver: e => { if (hasFiles(e)) { e.preventDefault(); setFileOver(true); } },
        onDragLeave: () => setFileOver(false),
        onDrop: e => { if (!hasFiles(e)) return; e.preventDefault(); setFileOver(false); onDropFiles(e.dataTransfer.files); },
      } : {})}
      style={{ background: fileOver ? 'var(--accent-subtle)' : 'var(--bg-card)', border: `1px solid ${fileOver ? 'var(--accent)' : 'var(--border)'}`,
        borderLeft: `2px solid ${s.color}`, borderRadius: 10, overflow: 'hidden', transition: 'border-color .2s, background .2s' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '.68rem', color: 'var(--text-muted)', minWidth: 32, flexShrink: 0 }}>{t('syntheses.chapAbbr', { count: idx + 1 })}</span>
        <span style={{ flex: 1, fontSize: '.83rem', color: 'var(--text-primary)', fontWeight: 500, minWidth: 80,
          cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          onDoubleClick={() => onEditName(idx)}>
          {chap.name}
        </span>
        <StatusToggle current={chap.status || 'todo'} onChange={st => onSetStatus(idx, st)} />
        {onOpenDocs && (
          <button onClick={() => onOpenDocs(idx)}
            aria-label={docCount ? t('docs.chapterDocs', { count: docCount }) : t('docs.attachToChapter')}
            title={docCount ? t('docs.chapterDocs', { count: docCount }) : t('docs.attachToChapter')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 7, flexShrink: 0, cursor: 'pointer',
              border: 'none', fontSize: '.65rem', fontWeight: 700,
              background: docCount ? 'var(--accent-subtle)' : 'transparent',
              color: docCount ? 'var(--accent)' : 'var(--text-muted)' }}>
            <Paperclip size={12} aria-hidden="true" />{docCount > 0 && docCount}
          </button>
        )}
        <button onClick={() => setShowNote(n => !n)}
          style={{ padding: '4px 8px', borderRadius: 7, border: `1px solid ${chap.note ? 'rgba(74,144,217,.3)' : 'rgba(255,255,255,.08)'}`,
            background: chap.note ? 'rgba(74,144,217,.08)' : 'transparent',
            color: chap.note ? '#93c5fd' : 'rgba(255,255,255,.3)', fontSize: '.65rem', cursor: 'pointer', flexShrink: 0 }}>
          {chap.note ? '📌' : '+'} {t('syntheses.note')}
        </button>
      </div>

      <AnimatePresence>
        {showNote && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0 12px 10px', paddingLeft: 48 }}>
              {editNote ? (
                <textarea value={note} onChange={e => setNote(e.target.value)}
                  onBlur={() => { onEditNote(idx, note); setEditNote(false); }}
                  autoFocus rows={2}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border-strong)',
                    background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.75rem', resize: 'vertical',
                    fontFamily: 'var(--font-family)', boxSizing: 'border-box' }} />
              ) : (
                <p onClick={() => setEditNote(true)}
                  style={{ fontSize: '.72rem', color: note ? 'var(--text-secondary)' : 'var(--text-muted)',
                    lineHeight: 1.5, cursor: 'text', margin: 0, whiteSpace: 'pre-wrap',
                    fontStyle: note ? 'normal' : 'italic' }}>
                  {note || t('syntheses.notePlaceholder')}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Subject card (collapsible, with its chapters) ────────────────────────────
function SubjectCard({ subject, filter, onUpdate, index, docCounts, onOpenDocs, onDropFiles }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [editingChap, setEditingChap] = useState(null);
  const [editName, setEditName] = useState('');

  const chapters = subject.chapters || [];
  const total = chapters.length;
  const done  = chapters.filter(c => c.status === 'done').length;
  const wip   = chapters.filter(c => c.status === 'wip').length;
  const pct   = total > 0 ? Math.round(done / total * 100) : 0;
  const color = subject.color || '#4A90D9';

  const filtered = filter === 'all' ? chapters : chapters.filter(c => c.status === filter);
  if (filter !== 'all' && filtered.length === 0) return null;

  function handleSetStatus(idx, status) {
    const updated = chapters.map((c, i) => i === idx ? { ...c, status } : c);
    onUpdate(subject.id, { chapters: updated, chapsDone: updated.filter(c => c.status === 'done').length });
  }

  function handleEditNote(idx, note) {
    onUpdate(subject.id, { chapters: chapters.map((c, i) => i === idx ? { ...c, note } : c) });
  }

  function saveChapName() {
    if (editingChap === null) return;
    onUpdate(subject.id, { chapters: chapters.map((c, i) => i === editingChap ? { ...c, name: editName } : c) });
    setEditingChap(null);
  }

  function addChapter() {
    const newChap = { name: t('syntheses.chapterFull', { count: total + 1 }), status: 'todo', note: '' };
    onUpdate(subject.id, { chapters: [...chapters, newChap], chaps: total + 1 });
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .06 }}
      style={{ background: 'var(--bg-card)', border: `1px solid var(--border)`,
        borderRadius: 16, overflow: 'hidden',
        boxShadow: pct === 100 ? `0 0 24px ${color}15` : 'none', transition: 'box-shadow .4s' }}>

      {/* Header */}
      <div onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.025)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

        <div style={{ width: 4, height: 42, borderRadius: 4, background: color, flexShrink: 0,
          boxShadow: pct > 0 ? `0 0 10px ${color}60` : 'none', transition: 'box-shadow .4s' }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>{subject.name}</span>
            <span style={{ fontSize: '.65rem', padding: '2px 8px', borderRadius: 10,
              background: `${color}20`, color, fontWeight: 700 }}>{pct}%</span>
            {pct === 100 && <span style={{ fontSize: '.65rem', color: '#27AE60', fontWeight: 700 }}>🎉 {t('syntheses.complete')}</span>}
          </div>

          {/* Progress bar */}
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 6 }}>
            <motion.div animate={{ width: `${pct}%` }} transition={{ duration: .7, ease: 'easeOut' }}
              style={{ height: '100%', background: color, borderRadius: 10,
                boxShadow: pct > 0 ? `0 0 8px ${color}` : 'none' }} />
          </div>

          {/* Heatmap */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ChapterHeatmap chapters={chapters} color={color} />
            <span style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>
              {done}/{total} · {wip > 0 ? t('syntheses.wipCount', { count: wip }) : ''}
            </span>
          </div>
        </div>

        <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: .2 }}
          style={{ fontSize: '.65rem', color: 'var(--text-muted)', flexShrink: 0 }}>▼</motion.span>
      </div>

      {/* Chapters */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: .25 }} style={{ overflow: 'hidden' }}>
            <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>

              {filtered.length === 0 ? (
                <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
                  {t('syntheses.emptyChapters')}
                </p>
              ) : filtered.map(chap => {
                const realIdx = chapters.indexOf(chap);
                return editingChap === realIdx ? (
                  <div key={realIdx} style={{ display: 'flex', gap: 6 }}>
                    <input value={editName} onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveChapName()} autoFocus
                      style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-strong)',
                        background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.82rem' }} />
                    <button onClick={saveChapName}
                      style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#4A90D9', color: '#fff', fontSize: '.78rem', cursor: 'pointer', fontWeight: 700 }}>✓</button>
                  </div>
                ) : (
                  <ChapterRow key={realIdx} chap={chap} idx={realIdx}
                    docCount={docCounts?.[`${subject.id}_${realIdx}`] || 0}
                    onOpenDocs={onOpenDocs && (i => onOpenDocs(subject.id, i))}
                    onDropFiles={onDropFiles && (files => onDropFiles(subject.id, realIdx, files))}
                    onSetStatus={handleSetStatus}
                    onEditName={idx => { setEditingChap(idx); setEditName(chapters[idx]?.name || ''); }}
                    onEditNote={handleEditNote} />
                );
              })}

              <button onClick={addChapter}
                style={{ alignSelf: 'flex-start', padding: '5px 14px', borderRadius: 8,
                  border: '1px dashed var(--border)', background: 'transparent',
                  color: 'var(--text-muted)', fontSize: '.73rem', cursor: 'pointer', marginTop: 4 }}>
                + {t('common.chapter')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function PageSyntheses({ user }) {
  const { t } = useTranslation();
  const tour = useGuidedTour('syntheses');
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('all'); // 'all' | 'todo' | 'wip' | 'done'
  const [pseudo, setPseudo]     = useState(user?.displayName || user?.email?.split('@')[0] || '');
  const [view, setView]         = useState('progress'); // 'progress' | 'docs' | 'library'
  const [profile, setProfile]   = useState(null);       // main.profile (school, year) for the library
  const [docFocus, setDocFocus] = useState(null);       // { subjectId, chapterIdx } | null
  const docs = useDocs(user);

  // "subjectId_chapterIdx" → number of attached documents (chapter badges).
  const docCounts = useMemo(() => {
    const counts = {};
    docs.docs.forEach(d => {
      if (d.subjectId != null && d.chapterIdx != null) {
        const k = `${d.subjectId}_${d.chapterIdx}`;
        counts[k] = (counts[k] || 0) + 1;
      }
    });
    return counts;
  }, [docs.docs]);

  function openChapterDocs(subjectId, chapterIdx) {
    setDocFocus({ subjectId: String(subjectId), chapterIdx });
    setView('docs');
  }

  // Files dropped on a chapter row: upload there and show the progress.
  function dropOnChapter(subjectId, chapterIdx, files) {
    if (docs.usage?.storageFull) return;
    docs.upload(files, { subjectId: String(subjectId), chapterIdx });
    openChapterDocs(subjectId, chapterIdx);
  }

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'data', 'main'), snap => {
      if (snap.exists()) {
        setSubjects(snap.data().subjects || []);
        if (snap.data().profile?.pseudo) setPseudo(snap.data().profile.pseudo);
        setProfile(snap.data().profile || null);
      }
      setLoading(false);
    });
    return unsub;
  }, [user]);

  async function handleUpdate(subjId, changes) {
    const updated = subjects.map(s => s.id === subjId ? { ...s, ...changes } : s);
    setSubjects(updated);
    try { await updateDoc(doc(db, 'users', user.uid, 'data', 'main'), { subjects: updated }); }
    catch (e) { reportSaveError(e, 'Syntheses — save'); }
  }

  // Stats fall back to the legacy chaps/chapsDone counters when a subject has
  // no `chapters` array yet.
  const totalChaps = subjects.reduce((a, s) => a + (s.chapters?.length || s.chaps || 0), 0);
  const doneChaps  = subjects.reduce((a, s) => a + (s.chapters?.filter(c => c.status === 'done').length || s.chapsDone || 0), 0);
  const wipChaps   = subjects.reduce((a, s) => a + (s.chapters?.filter(c => c.status === 'wip').length || 0), 0);
  const globalPct  = totalChaps > 0 ? Math.round(doneChaps / totalChaps * 100) : 0;

  const stats = [
    { v: totalChaps, l: t('syntheses.total'), c: 'rgba(255,255,255,.5)' },
    { v: doneChaps,  l: `✅ ${t('syntheses.donePlural')}`, c: '#27AE60' },
    { v: wipChaps,   l: `📝 ${t('syntheses.statusWip')}`, c: '#F1C40F' },
    { v: totalChaps - doneChaps - wipChaps, l: `⭕ ${t('syntheses.statusTodo')}`, c: 'rgba(255,255,255,.3)' },
  ];
  const filters = [
    { v: 'all',  l: t('syntheses.filterAll') },
    { v: 'todo', l: `⭕ ${t('syntheses.statusTodo')}` },
    { v: 'wip',  l: `📝 ${t('syntheses.statusWip')}` },
    { v: 'done', l: `✅ ${t('syntheses.donePlural')}` },
  ];

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
      <motion.div animate={{ opacity: [.3, 1, .3] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</motion.div>
    </div>
  );

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

      <TourButton onClick={tour.start} label={t('common.guidedTour')} />

      {/* View switch: chapter progress / attached documents */}
      {docs.available && (
        <div role="tablist" aria-label={t('docs.viewSwitch')}
          style={{ display: 'flex', alignSelf: 'flex-start', gap: 4, padding: 4, borderRadius: 99, background: 'var(--bg-card)' }}>
          {[
            { v: 'progress', icon: ListChecks, label: t('docs.tabProgress') },
            { v: 'docs', icon: FolderOpen, label: t('docs.tabDocs'), count: docs.docs.length },
            { v: 'library', icon: Library, label: t('library.tab') },
          ].map(tab => (
            <button key={tab.v} role="tab" aria-selected={view === tab.v}
              onClick={() => { setView(tab.v); if (tab.v === 'docs') setDocFocus(null); }}
              style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 99,
                border: 'none', cursor: 'pointer', fontSize: '.78rem', fontWeight: 700, background: 'transparent',
                color: view === tab.v ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {view === tab.v && (
                <motion.span layoutId="synth-view-pill" transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  style={{ position: 'absolute', inset: 0, borderRadius: 99, background: 'var(--accent-subtle)' }} />
              )}
              <tab.icon size={14} aria-hidden="true" style={{ position: 'relative' }} />
              <span style={{ position: 'relative' }}>{tab.label}</span>
              {tab.count > 0 && <span style={{ position: 'relative', fontSize: '.64rem', opacity: .7 }}>{tab.count}</span>}
            </button>
          ))}
        </div>
      )}

      {view === 'library' && docs.available ? (
        <LibraryBrowser user={user} profile={profile}
          onPublishOwn={() => { setDocFocus(null); setView('docs'); }} />
      ) : view === 'docs' && docs.available ? (
        <DocLibrary user={user} subjects={subjects} pseudo={pseudo} profile={profile} lib={docs}
          focus={docFocus} onFocusChange={setDocFocus} />
      ) : (<>

      {/* Global ring + stats */}
      <div data-tour="tour-synth-global" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'center',
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.2rem' }}>

        {/* Ring */}
        <div style={{ position: 'relative', width: 80, height: 80 }}>
          <svg width="80" height="80" viewBox="0 0 80 80" style={{ transform: 'rotate(-90deg)', position: 'absolute', inset: 0 }}>
            <circle cx="40" cy="40" r="32" fill="none" stroke="var(--border)" strokeWidth="7" />
            <motion.circle cx="40" cy="40" r="32" fill="none" stroke="#27AE60" strokeWidth="7"
              strokeDasharray={2 * Math.PI * 32}
              initial={{ strokeDashoffset: 2 * Math.PI * 32 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 32 * (1 - globalPct / 100) }}
              transition={{ duration: 1, ease: 'easeOut' }}
              strokeLinecap="round"
              style={{ filter: 'drop-shadow(0 0 6px #27AE60)' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#27AE60', lineHeight: 1 }}>{globalPct}%</span>
            <span style={{ fontSize: '.45rem', color: 'var(--text-muted)' }}>{t('syntheses.global')}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${globalPct}%` }} transition={{ duration: 1, ease: 'easeOut' }}
              style={{ height: '100%', background: 'linear-gradient(90deg,#27AE60,#1abc9c)', borderRadius: 10,
                boxShadow: '0 0 8px rgba(39,174,96,.5)' }} />
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {stats.map((s, i) => (
              <div key={i}>
                <span style={{ fontSize: '1.1rem', fontWeight: 900, color: s.c }}>{s.v}</span>
                <span style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginLeft: 4 }}>{s.l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div data-tour="tour-synth-filters" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {filters.map(f => (
          <button key={f.v} onClick={() => setFilter(f.v)}
            style={{ padding: '5px 14px', borderRadius: 20,
              border: `1px solid ${filter === f.v ? 'var(--accent)' : 'var(--border)'}`,
              background: filter === f.v ? 'var(--accent-subtle)' : 'transparent',
              color: filter === f.v ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: '.75rem', cursor: 'pointer', fontWeight: filter === f.v ? 600 : 400 }}>
            {f.l}
          </button>
        ))}
      </div>

      {/* Subject cards */}
      <div data-tour="tour-synth-subjects">
      {subjects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)',
          background: 'var(--bg-card)', border: '1px dashed var(--border)', borderRadius: 14 }}>
          📭 {t('syntheses.noSubjects')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {subjects.map((s, i) => (
            <SubjectCard key={s.id} subject={s} filter={filter} onUpdate={handleUpdate} index={i}
              {...(docs.available ? { docCounts, onOpenDocs: openChapterDocs, onDropFiles: dropOnChapter } : {})} />
          ))}
        </div>
      )}
      </div>
      </>)}

      <GuidedTour active={tour.active} step={tour.step} steps={tour.steps}
        onNext={tour.next} onPrev={tour.prev} onStop={tour.stop} />
    </div>
  );
}