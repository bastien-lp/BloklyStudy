/**
 * AppPage — Authenticated shell: top bar, tab bar, page router, dock, modals.
 * Owns cross-cutting state: XP/level, presence, unread counts (groups + DMs),
 * subjects CRUD, theme editor, dev panel and the per-page tutorial.
 *
 * Page routing: PAGE_MAP holds a render fn per tab. `groups`, `profile` and
 * `stats` are special-cased in the render (they need extra props); everything
 * else goes through the generic <ActivePage user prefs onTuto onNavigate/>.
 *
 * Props: { user, prefs, setPrefs, setUserXp, devUnlocked, setDevUnlocked }
 */

import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { signOut } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, rtdb } from '../firebase/config';
import { doc, getDoc, onSnapshot, collection, query, orderBy, limit, getDocs, updateDoc } from 'firebase/firestore';
import { ref as dbRef, onValue } from 'firebase/database';
import Aurora from '../components/Aurora';
import { TutoModal } from '../components/TutoModal';
import LanguageSwitcher from '../components/LanguageSwitcher';
import {
  CalendarDays, CheckSquare, TrendingUp, Star, FileText,
  Layers, RefreshCw, CalendarClock, BarChart2, Users,
  BookOpen, HandMetal, Power, Zap, Play,
  LibraryBig, Palette, TreePine,
} from 'lucide-react';
import { useTranslation } from '../i18n';
import { isDue } from '../data/repetition';
import { GroupSessionEngine } from '../components/GroupSessionEngine';
import { ChronoStack } from '../components/ChronoStack';
import { reportSaveError } from '../lib/notify';
import { resolveOwnPhoto } from '../lib/profilePhoto';
import { startPresence, clearPresence } from '../lib/presence';
import { isAdmin, ADMIN_UIDS } from '../lib/admin';
import { auditBadges } from '../lib/badgeAudit';

// Each tab is a separate chunk, loaded the first time it is opened. This keeps
// the initial authenticated bundle small — a user who never opens Stats or the
// Study timer never downloads their code (or their heavy chart/animation deps).
// Aurora (always-visible background) and TutoModal (always mounted) stay static.
const PageExams      = lazy(() => import('./PageExams'));
const PageTodo       = lazy(() => import('./PageTodo'));
const PageStudy      = lazy(() => import('./PageStudy'));
const PagePlanning   = lazy(() => import('./PagePlanning'));
const PageSyntheses  = lazy(() => import('./PageSyntheses'));
const PageConfidence = lazy(() => import('./PageConfidence'));
const PageRepetition = lazy(() => import('./PageRepetition'));
const PageGroups     = lazy(() => import('./PageGroups'));
const PageStats      = lazy(() => import('./PageStats'));
const PageWhoarewe   = lazy(() => import('./PageWhoarewe'));
const PageFlashcards = lazy(() => import('./PageFlashcards'));
const PageProgress   = lazy(() => import('./PageProgress'));
const PageJournal    = lazy(() => import('./PageJournal'));
const PageProfile    = lazy(() => import('./PageProfile'));
const PageReserve    = lazy(() => import('./PageReserve'));
const ThemeEditor    = lazy(() => import('../themes/ThemeEditor'));
const DevPanel       = lazy(() => import('../components/DevPanel'));

// Short generated notification sound (no audio file needed).
let _audioCtx = null;
function playPing() {
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1170, now + 0.09);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    osc.start(now);
    osc.stop(now + 0.34);
  } catch { /* audio unavailable */ }
}

// Generic page renderers per tab. `onNavigate` lets a page jump to another tab
// (e.g. PageTodo's "see in spaced review" link).
const PAGE_MAP = {
  planning:   ({ user, onTuto }) => <PagePlanning user={user} onTuto={onTuto} />,
  todo:       ({ user, onTuto, onNavigate }) => <PageTodo user={user} onTuto={onTuto} onNavigate={onNavigate} />,
  progress:   ({ user, onTuto }) => <PageProgress user={user} onTuto={onTuto} />,
  confidence: ({ user, onTuto }) => <PageConfidence user={user} onTuto={onTuto} />,
  syntheses:  ({ user, onTuto }) => <PageSyntheses user={user} onTuto={onTuto} />,
  flashcards: ({ user, onTuto }) => <PageFlashcards user={user} onTuto={onTuto} />,
  repetition: ({ user, onTuto }) => <PageRepetition user={user} onTuto={onTuto} />,
  exams:      ({ user, onTuto }) => <PageExams user={user} onTuto={onTuto} />,
  stats:      ({ user, onTuto }) => <PageStats user={user} onTuto={onTuto} />,
  journal:    ({ user, onTuto }) => <PageJournal user={user} onTuto={onTuto} />,
  whoarewe:   ({ user, onTuto }) => <PageWhoarewe user={user} onTuto={onTuto} />,
  study:      ({ user, prefs, onTuto }) => <PageStudy user={user} prefs={prefs} onTuto={onTuto} />,
  profile:    ({ user }) => <PageProfile user={user} />,
  reserve:    ({ user }) => <PageReserve user={user} />,
};

// Tab bar definition. `labelKey` resolves to a localized label.
const TABS = [
  { id: 'planning',   Icon: CalendarDays,  labelKey: 'app.tabPlanning',   color: '#4A90D9' },
  { id: 'todo',       Icon: CheckSquare,   labelKey: 'app.tabTodo',       color: '#27AE60' },
  { id: 'progress',   Icon: TrendingUp,    labelKey: 'app.tabProgress',   color: '#9B59B6' },
  { id: 'confidence', Icon: Star,          labelKey: 'app.tabConfidence', color: '#F1C40F' },
  { id: 'syntheses',  Icon: FileText,      labelKey: 'app.tabSyntheses',  color: '#4A90D9' },
  { id: 'flashcards', Icon: Layers,        labelKey: 'app.tabFlashcards', color: '#9B59B6' },
  { id: 'repetition', Icon: RefreshCw,     labelKey: 'app.tabRepetition', color: '#E74C3C' },
  { id: 'exams',      Icon: CalendarClock, labelKey: 'app.tabExams',      color: '#E74C3C' },
  { id: 'stats',      Icon: BarChart2,     labelKey: 'app.tabStats',      color: '#E74C3C' },
  { id: 'reserve',    Icon: TreePine,      labelKey: 'app.tabReserve',    color: '#27AE60' },
  { id: 'groups',     Icon: Users,         labelKey: 'app.tabGroups',     color: '#27AE60' },
  { id: 'journal',    Icon: BookOpen,      labelKey: 'app.tabJournal',    color: '#E67E22' },
  { id: 'whoarewe',   Icon: HandMetal,     labelKey: 'app.tabWhoarewe',   color: '#4A90D9' },
];

const COLORS = ['#E74C3C', '#E67E22', '#F1C40F', '#27AE60', '#4A90D9', '#9B59B6', '#1ABC9C', '#E91E63', '#FF5722', '#607D8B'];

// Accounts allowed to use the full custom-theme editor: the administrators
// (see `lib/admin`, which the security rules mirror) plus anyone the dev panel
// has unlocked for the session.
const CUSTOM_THEME_UIDS = ADMIN_UIDS;

function ChaptersEditor({ subject, onEdit }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [chapters, setChapters] = useState(subject.chapters || []);
  const [saving, setSaving] = useState(false);

  async function save(updated) {
    setSaving(true);
    await onEdit(subject.id, { chapters: updated });
    setSaving(false);
  }

  function rename(i, name) {
    setChapters(chapters.map((c, j) => j === i ? { ...c, name } : c));
  }

  function addChapter() {
    const updated = [...chapters, { name: t('app.chapterDefault', { count: chapters.length + 1 }), status: 'todo', note: '' }];
    setChapters(updated);
    save(updated);
  }

  function removeChapter(i) {
    const updated = chapters.filter((_, j) => j !== i);
    setChapters(updated);
    save(updated);
  }

  const inp = { width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)',
    background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.78rem', fontFamily: 'var(--font-family)', boxSizing: 'border-box', outline: 'none' };

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,.05)', background: 'rgba(0,0,0,.15)' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', padding: '6px 12px', background: 'transparent', border: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', fontSize: '.72rem' }}>
        <motion.span animate={{ rotate: open ? 90 : 0 }} style={{ display: 'inline-block' }}>▶</motion.span>
        {t('app.chaptersManage', { count: chapters.length })}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {chapters.map((ch, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '.68rem', color: 'var(--text-muted)', minWidth: 20 }}>{i + 1}.</span>
                  <input value={ch.name} onChange={e => rename(i, e.target.value)}
                    onBlur={() => save(chapters)}
                    onKeyDown={e => e.key === 'Enter' && save(chapters)}
                    style={{ ...inp, flex: 1 }} />
                  <button onClick={() => removeChapter(i)}
                    style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid rgba(231,76,60,.2)',
                      background: 'rgba(231,76,60,.06)', color: '#E74C3C', fontSize: '.7rem', cursor: 'pointer', flexShrink: 0 }}>
                    ×
                  </button>
                </div>
              ))}
              <button onClick={addChapter}
                style={{ alignSelf: 'flex-start', padding: '4px 12px', borderRadius: 7,
                  border: '1px dashed var(--border)', background: 'transparent',
                  color: 'var(--text-muted)', fontSize: '.72rem', cursor: 'pointer', marginTop: 2 }}>
                + {t('app.addChapter')}
              </button>
              {saving && <span style={{ fontSize: '.62rem', color: 'rgba(255,255,255,.25)' }}>{t('app.saving')}</span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SubjectModal({ onAdd, onDelete, onEdit, subjects, onClose }) {
  const { t, formatDate } = useTranslation();
  const [tab, setTab]       = useState('add');
  const [name, setName]     = useState('');
  const [color, setColor]   = useState('#4A90D9');
  const [date, setDate]     = useState('');
  const [chaps, setChaps]   = useState(6);
  const [chapNames, setChapNames] = useState(() => Array.from({ length: 6 }, (_, i) => t('app.chapterDefault', { count: i + 1 })));
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName]   = useState('');
  const [editColor, setEditColor] = useState('');
  const [editDate, setEditDate]   = useState('');
  const [confirmDel, setConfirmDel] = useState(null);

  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.83rem', fontFamily: 'var(--font-family)', boxSizing: 'border-box' };

  async function handleAdd() {
    if (!name.trim()) return;
    setSaving(true);
    await onAdd(name, color, date, chaps, chapNames);
    setSaving(false);
    setName(''); setDate(''); setChaps(6); setColor('#4A90D9');
    onClose();
  }

  function startEdit(s) {
    setEditId(s.id);
    setEditName(s.name);
    setEditColor(s.color);
    setEditDate(s.date || '');
  }

  async function handleEdit() {
    if (!editName.trim()) return;
    setSaving(true);
    await onEdit(editId, { name: editName.trim(), color: editColor, date: editDate });
    setSaving(false);
    setEditId(null);
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(14px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: .92, y: 20 }} animate={{ scale: 1, y: 0 }}
        style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 20, padding: '1.5rem', width: 420, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '85vh', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '1rem', margin: 0 }}>📚 {t('app.subjectsTitle')}</h3>
          <button aria-label="Fermer" onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.3rem', cursor: 'pointer' }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', padding: 4, borderRadius: 10 }}>
          {[{ v: 'add', l: t('app.tabAdd') }, { v: 'manage', l: `⚙️ ${t('app.tabManage')} (${subjects.length})` }].map(tt => (
            <button key={tt.v} onClick={() => setTab(tt.v)}
              style={{ flex: 1, padding: '7px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: '.78rem', fontWeight: 500,
                background: tab === tt.v ? 'var(--accent-subtle)' : 'transparent',
                color: tab === tt.v ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {tt.l}
            </button>
          ))}
        </div>

        {/* ── Add tab ── */}
        {tab === 'add' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('app.name')} *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder={t('app.namePlaceholder')} style={inp} autoFocus />
            </div>
            <div>
              <label style={{ fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{t('app.color')}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: color === c ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer', transition: 'border .15s', flexShrink: 0 }} />
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
                  <input type="color" value={color} onChange={e => setColor(e.target.value)}
                    style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }} />
                  <span style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.3)', fontFamily: 'monospace' }}>{color}</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('app.examDate')}</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('app.chapters')}</label>
                <input type="number" min="1" max="30" value={chaps} onChange={e => {
                  const n = parseInt(e.target.value, 10) || 1;
                  setChaps(n);
                  setChapNames(prev => {
                    const arr = [...prev];
                    while (arr.length < n) arr.push(t('app.chapterDefault', { count: arr.length + 1 }));
                    return arr.slice(0, n);
                  });
                }} style={inp} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                {t('app.chapterNames')} <span style={{ color: 'rgba(255,255,255,.2)' }}>{t('app.optional')}</span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 150, overflowY: 'auto' }}>
                {chapNames.map((n, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.3)', minWidth: 18 }}>{i + 1}.</span>
                    <input value={n} onChange={e => { const a = [...chapNames]; a[i] = e.target.value; setChapNames(a); }}
                      placeholder={t('app.chapterDefault', { count: i + 1 })}
                      style={{ ...inp, flex: 1, padding: '5px 8px', fontSize: '.76rem' }} />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '.83rem', cursor: 'pointer' }}>{t('common.cancel')}</button>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: .98 }} onClick={handleAdd} disabled={!name.trim() || saving}
                style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none',
                  background: name.trim() ? 'linear-gradient(135deg,#4A90D9,#6366f1)' : 'rgba(255,255,255,.08)',
                  color: name.trim() ? '#fff' : 'rgba(255,255,255,.3)', fontSize: '.83rem', fontWeight: 700, cursor: name.trim() ? 'pointer' : 'default' }}>
                {saving ? t('app.savingLong') : `+ ${t('app.addBtn')}`}
              </motion.button>
            </div>
          </div>
        )}

        {/* ── Manage tab ── */}
        {tab === 'manage' && (
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {subjects.length === 0 && (
              <p style={{ color: 'rgba(255,255,255,.3)', fontSize: '.83rem', textAlign: 'center', padding: '1rem' }}>{t('app.noSubjects')}</p>
            )}
            {subjects.map(s => (
              <div key={s.id}>
                {/* Confirm delete */}
                {confirmDel === s.id ? (
                  <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(231,76,60,.1)', border: '1px solid rgba(231,76,60,.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: '.78rem', color: '#ff6b6b' }}>{t('app.deleteConfirm', { name: s.name })}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setConfirmDel(null)} style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: 'rgba(255,255,255,.5)', fontSize: '.72rem', cursor: 'pointer' }}>{t('app.no')}</button>
                      <button onClick={async () => { await onDelete(s.id); setConfirmDel(null); }}
                        style={{ padding: '4px 10px', borderRadius: 7, border: 'none', background: 'rgba(231,76,60,.7)', color: '#fff', fontSize: '.72rem', cursor: 'pointer', fontWeight: 700 }}>{t('app.yes')}</button>
                    </div>
                  </div>
                ) : editId === s.id ? (
                  /* Inline edit form */
                  <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...inp, padding: '6px 8px' }} />
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                      {COLORS.map(c => (
                        <button key={c} onClick={() => setEditColor(c)}
                          style={{ width: 22, height: 22, borderRadius: '50%', background: c, border: editColor === c ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer' }} />
                      ))}
                      <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)}
                        style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, flexShrink: 0 }} />
                      <span style={{ fontSize: '.6rem', color: 'rgba(255,255,255,.3)', fontFamily: 'monospace' }}>{editColor}</span>
                    </div>
                    <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} style={{ ...inp, padding: '6px 8px' }} />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setEditId(null)} style={{ flex: 1, padding: '6px', borderRadius: 8, border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: 'rgba(255,255,255,.4)', fontSize: '.75rem', cursor: 'pointer' }}>{t('common.cancel')}</button>
                      <button onClick={handleEdit} style={{ flex: 2, padding: '6px', borderRadius: 8, border: 'none', background: '#4A90D9', color: '#fff', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer' }}>
                        {saving ? '…' : `✓ ${t('app.save')}`}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Normal row */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderLeft: `3px solid ${s.color}`, borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px' }}>
                      <span style={{ flex: 1, fontSize: '.83rem', color: 'var(--text-primary)', fontWeight: 500 }}>{s.name}</span>
                      {s.date && <span style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>{formatDate(s.date, { day: 'numeric', month: 'short' })}</span>}
                      <button onClick={() => startEdit(s)}
                        style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: 'rgba(255,255,255,.5)', fontSize: '.8rem', cursor: 'pointer' }}>✏️</button>
                      <button onClick={() => setConfirmDel(s.id)}
                        style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(231,76,60,.2)', background: 'rgba(231,76,60,.08)', color: '#E74C3C', fontSize: '.8rem', cursor: 'pointer' }}>🗑</button>
                    </div>
                    {/* Chapters */}
                    {s.chapters?.length > 0 && (
                      <ChaptersEditor subject={s} onEdit={onEdit} />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// Lightweight fallback shown while a lazily-loaded tab chunk downloads. Mirrors
// the subtle pulse the individual pages use for their own loading states.
function PageFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh' }}>
      <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}
        style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)' }} />
    </div>
  );
}

export default function AppPage({ user, prefs, setPrefs, setUserXp, devUnlocked, setDevUnlocked }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('planning');
  const [pendingConv, setPendingConv] = useState(null); // friend to open as DM from profile
  const [xp, setXp]               = useState(0);
  const [level, setLevel]         = useState(1);
  const [onlineCount, setOnline]  = useState(0);

  const [srDueCount, setSrDueCount] = useState(0);
  const [unreadTotal, setUnreadTotal] = useState(0);   // total unread across all groups
  const [unreadByGroup, setUnreadByGroup] = useState({}); // { groupId: count }
  const [unreadPrivate, setUnreadPrivate] = useState(0);  // number of DM convs with unread

  const [pseudo, setPseudo] = useState(user?.displayName || user?.email?.split('@')[0] || 'U');
  // Top-bar avatar. Read from Firestore (see lib/profilePhoto.js), not Auth.
  const [myPhoto, setMyPhoto] = useState(user?.photoURL || null);
  // "Show me online" privacy switch (profile.privacy.online, default on).
  const [showOnline, setShowOnline] = useState(true);
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [showThemeEditor, setShowThemeEditor] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const badgeAuditRef = useRef(false); // retroactive badge catch-up runs once per session
  const [devClicks, setDevClicks]       = useState(0);
  const [devCodeInput, setDevCodeInput] = useState('');
  const [showDevCode, setShowDevCode]   = useState(false);
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [tutoPage, setTutoPage] = useState(null);

  // Spaced-review due count (badge on the "Rév. J" tab).
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'data', 'main'), snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      const srData = d.srData || {};
      const subjects = d.subjects || [];
      const now = Date.now();
      let count = 0;
      subjects.forEach(s => {
        const chaps = s.chapters || Array.from({ length: s.chaps || 0 });
        chaps.forEach((_, i) => {
          const sr = srData[`${s.id}_${i}`];
          if (!sr) return;
          if (isDue(sr, now)) count++;
        });
      });
      setSrDueCount(count);
    });
    return unsub;
  }, [user]);

  // Publish my own presence (see lib/presence.js) unless I opted out.
  useEffect(() => {
    if (!user || !showOnline) return undefined;
    return startPresence(user.uid);
  }, [user, showOnline]);

  // Presence.
  useEffect(() => {
    const unsub = onValue(dbRef(rtdb, 'presence'), snap => {
      setOnline(Object.keys(snap.val() || {}).length);
    }, () => {});
    return () => unsub();
  }, []);

  // Unread group messages.
  useEffect(() => {
    if (!user) return;
    let groupUnsubs = [];
    getDocs(collection(db, 'groups')).then(snap => {
      const mine = [];
      snap.forEach(d => { const g = { id: d.id, ...d.data() }; if (g.members?.[user.uid]) mine.push(g); });
      groupUnsubs = mine.map(g => {
        if (!g.members?.[user.uid]) return () => {};
        const lastReadKey = `blokly-lastread-${g.id}-${user.uid}`;
        const lastRead = localStorage.getItem(lastReadKey) || '1970-01-01T00:00:00.000Z';
        return onSnapshot(
          query(collection(db, 'groups', g.id, 'messages'), orderBy('sentAt', 'asc')),
          snap2 => {
            const count = snap2.docs.filter(d2 => {
              const m = d2.data();
              return m.uid !== user.uid && (m.sentAt || '') > lastRead;
            }).length;
            setUnreadByGroup(prev => {
              const next = { ...prev, [g.id]: count };
              setUnreadTotal(Object.values(next).reduce((a, b) => a + b, 0));
              return next;
            });
          }
        );
      });
    });
    return () => { groupUnsubs.forEach(u => typeof u === 'function' && u()); };
  }, [user]);

  // Unread private messages (count of conversations with at least one unread).
  useEffect(() => {
    if (!user) return;
    const convIdFor = (a, b) => [a, b].sort().join('_');
    let msgUnsubs = [];
    let lastReadMap = {};
    const previews = {}; // { convId: lastMessage }

    function recompute() {
      let count = 0;
      for (const [cid, last] of Object.entries(previews)) {
        if (!last) continue;
        const lastRead = lastReadMap[cid];
        if (last.uid !== user.uid && (!lastRead || last.sentAt > lastRead)) count++;
      }
      setUnreadPrivate(count);
    }

    // 1. Watch the friend list, then the last message of each conversation.
    const unsubFriends = onSnapshot(collection(db, 'friends', user.uid, 'list'), snap => {
      msgUnsubs.forEach(u => u()); msgUnsubs = [];
      const friends = snap.docs.map(d => d.data());
      msgUnsubs = friends.map(f => {
        const cid = convIdFor(user.uid, f.uid);
        return onSnapshot(
          query(collection(db, 'privateMessages', cid, 'messages'), orderBy('sentAt', 'desc'), limit(1)),
          s => { previews[cid] = s.docs[0]?.data() || null; recompute(); },
          () => {}
        );
      });
    });

    // 2. Watch last-read markers (stored on the user doc).
    const unsubRead = onSnapshot(doc(db, 'users', user.uid, 'data', 'main'), snap => {
      if (snap.exists()) { lastReadMap = snap.data().lastReadPrivate || {}; recompute(); }
    });

    return () => { unsubFriends(); unsubRead(); msgUnsubs.forEach(u => u()); };
  }, [user]);

  // XP / level / subjects / pseudo.
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'data', 'main'), snap => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.xp    !== undefined) { setXp(d.xp); setUserXp(d.xp || 0); }
        if (d.level !== undefined) setLevel(d.level);
        setSubjects(d.subjects || []);
        if (d.profile?.pseudo) setPseudo(d.profile.pseudo);
        setMyPhoto(resolveOwnPhoto(d, user));
        setShowOnline(d.profile?.privacy?.online !== false);

        // Badges added to the catalogue after a threshold was already passed
        // are never re-checked by the Cloud Function, so they stayed locked.
        // Catch them up once per session, from this first real snapshot.
        if (!badgeAuditRef.current) {
          badgeAuditRef.current = true;
          auditBadges(user.uid, d);
        } else {
          // Client-only badges unlock live (see lib/badgeAudit.js). Writes only when one is due.
          auditBadges(user.uid, d, { liveOnly: true });
        }
      }
    });
    return unsub;
  }, [user]);

  const xpPct = (xp % 500) / 500 * 100;
  const ActivePage = PAGE_MAP[activeTab] || PAGE_MAP.planning;
  const unreadBadge = unreadTotal + unreadPrivate; // combined groups + DMs

  // Play a sound when the unread count increases (new message received).
  const prevUnread = useRef(null);
  useEffect(() => {
    if (prevUnread.current !== null && unreadBadge > prevUnread.current) playPing();
    prevUnread.current = unreadBadge;
  }, [unreadBadge]);

  async function addSubject(name, color, date, chaps, chapNames = []) {
    if (!name.trim()) return;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid, 'data', 'main'));
      const d = snap.exists() ? snap.data() : {};
      const subs = d.subjects || [];
      const nid = subs.length > 0 ? Math.max(...subs.map(s => s.id)) + 1 : 1;
      const newSubj = {
        id: nid, name: name.trim(), color, date: date || '', chaps: chaps || 6,
        chapsDone: 0, totalBlocks: 8, doneBlocks: 0,
        conf: Array(chaps || 6).fill(0),
        chapters: Array.from({ length: chaps || 6 }, (_, i) => ({ name: chapNames[i] || t('app.chapterDefault', { count: i + 1 }), status: 'todo', note: '' })),
        epreuves: [],
      };
      await updateDoc(doc(db, 'users', user.uid, 'data', 'main'), { subjects: [...subs, newSubj] });
    } catch (e) { reportSaveError(e, 'AppPage — add subject'); }
  }

  async function deleteSubject(id) {
    try {
      await updateDoc(doc(db, 'users', user.uid, 'data', 'main'), { subjects: subjects.filter(s => s.id !== id) });
    } catch (e) { reportSaveError(e, 'AppPage — delete subject'); }
  }

  async function editSubject(id, changes) {
    try {
      await updateDoc(doc(db, 'users', user.uid, 'data', 'main'), { subjects: subjects.map(s => s.id === id ? { ...s, ...changes } : s) });
    } catch (e) { reportSaveError(e, 'AppPage — edit subject'); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-base)', fontFamily: 'var(--font-family)', transition: 'background .4s', overflowX: 'clip', position: 'relative' }}>
      {/* Aurora background */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '40vh', zIndex: 0, pointerEvents: 'none', opacity: prefs?.auroraIntensity != null ? prefs.auroraIntensity / 100 : 0.35 }}>
        <Aurora
          colorStops={(() => {
            const themeId = prefs?.themeId || 'nuit';
            const stops = {
              nuit:       ['#5227FF', '#9B59B6', '#4A90D9'],
              cendre:     ['#555566', '#888899', '#aaaacc'],
              aurora:     ['#00dbb4', '#00aacc', '#006688'],
              sakura_night:['#ff66aa', '#cc3377', '#9b1155'],
              foret_noire:['#1a7a3a', '#2d9e5a', '#0d4d22'],
              cyberpunk:  ['#bf00ff', '#7700cc', '#330066'],
              abyssal:    ['#7755ff', '#4422cc', '#110044'],
              aube:       ['#d46a1a', '#e8952a', '#f4b860'],
              petale:     ['#e0457a', '#cc2255', '#ff88aa'],
              prairie:    ['#2e7d4f', '#4caf6a', '#88cc99'],
              nuage:      ['#3d6ecc', '#5588ee', '#88aaff'],
              citron:     ['#c8a000', '#e8c000', '#f0d040'],
              ocean:      ['#0077cc', '#0099ee', '#44bbff'],
              neon_rouge: ['#ff0033', '#cc0022', '#ff4455'],
              matrix:     ['#00ff41', '#00cc33', '#004400'],
              electric:   ['#00ccff', '#0099cc', '#004466'],
              lavande:    ['#7c4dcc', '#9966dd', '#bbaaee'],
              peche:      ['#cc5522', '#ee7733', '#ffaa77'],
              glacier:    ['#2288bb', '#44aadd', '#88ccee'],
              candy:      ['#cc44dd', '#aa22bb', '#ff88ee'],
              // newer themes
              inferno:       ['#ff5500', '#dd2200', '#ff9900'],
              midnight_gold: ['#d4a800', '#aa7700', '#ffe066'],
              deep_space:    ['#4466ff', '#2233cc', '#88aaff'],
              neon_rose:     ['#ff00bb', '#cc0088', '#ff66dd'],
              arcade:        ['#ff6600', '#cc00ff', '#ffcc00'],
              soleil:        ['#c8a000', '#e8c000', '#f0d040'],
              papier:        ['#3a5fa0', '#5577bb', '#88aadd'],
              menthe:        ['#007a50', '#00aa70', '#44ddaa'],
              ciel:          ['#0060c0', '#0088ee', '#44bbff'],
              bibliotheque:  ['#8b4513', '#aa6633', '#ddaa77'],
            };
            return stops[themeId] || stops.nuit;
          })()}
          amplitude={1.2}
          blend={0.6}
        />
      </div>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 0.8rem', minHeight: 56,
        background: 'var(--bg-nav)', borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        position: 'sticky', top: 0, zIndex: 100, gap: 8,
      }}>
        {/* Logo — left (triple-click reveals the dev code prompt) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div onClick={() => {
            // The code prompt only appears for an administrator. The Firestore
            // rules grant write access to admin uids alone, so offering the
            // panel to anyone else would only produce writes that silently fail.
            if (!isAdmin(user)) return;
            const n = devClicks + 1; setDevClicks(n);
            if (n >= 3) { setShowDevCode(true); setDevClicks(0); }
          }} style={{ display: 'flex', flexDirection: 'column', gap: 2.5, cursor: 'pointer' }}>
            <div style={{ width: 18, height: 4, borderRadius: 2, background: '#E74C3C' }} />
            <div style={{ width: 18, height: 4, borderRadius: 2, background: '#F1C40F', marginLeft: 2 }} />
            <div style={{ width: 18, height: 4, borderRadius: 2, background: '#27AE60', marginLeft: 4 }} />
          </div>
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>Blokly</div>
            <div style={{ fontSize: '0.45rem', color: 'var(--text-muted)', letterSpacing: '0.2em', textTransform: 'uppercase', marginTop: 1 }}>Study</div>
          </div>
        </div>

        {/* Right — counters, XP & profile */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>

          {/* "Online" badge — compacted on mobile */}
          {onlineCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', borderRadius: 12,
              background: 'rgba(39,174,96,.1)', border: '1px solid rgba(39,174,96,.15)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#27AE60', display: 'inline-block' }} />
              <span style={{ fontSize: '0.6rem', color: 'rgba(39,174,96,.9)', fontWeight: 700, display: 'inline-block' }}>
                {onlineCount}<span className="hide-mobile">{t('app.onlineSuffix')}</span>
              </span>
            </div>
          )}

          {/* Focus chrono — appears just left of the XP pill while a session runs off the study tab */}
          <AnimatePresence>
            <ChronoStack user={user} activeTab={activeTab} subjects={subjects}
              onOpenStudy={() => setActiveTab('study')} onOpenGroups={() => setActiveTab('groups')} />
          </AnimatePresence>

          {/* Language */}
          <LanguageSwitcher lang={prefs?.lang} onChange={lang => setPrefs({ ...prefs, lang })} />

          {/* XP progress pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 20,
            background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.65rem', color: 'var(--xp-color)', fontWeight: 800, whiteSpace: 'nowrap' }}>
              <Zap size={11} fill="var(--xp-color)" strokeWidth={0} />
              {xp} <span style={{ fontSize: '0.55rem', fontWeight: 500, color: 'var(--text-muted)' }} className="hide-mobile">XP</span>
            </span>

            {/* XP bar hidden on very small screens to save space */}
            <div className="hide-mobile" style={{ width: 35, height: 3, background: 'var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <motion.div animate={{ width: `${xpPct}%` }} style={{ height: '100%', background: 'var(--xp-color)', borderRadius: 10 }} />
            </div>

            <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-card)', padding: '2px 5px', borderRadius: 6 }}>{t('app.levelShort', { count: level })}</span>
          </div>

          {/* Avatar → profile */}
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }}
            onClick={() => setActiveTab('profile')} title={t('app.myProfile')}
            style={{ width: 28, height: 28, borderRadius: '50%',
              background: 'linear-gradient(135deg,var(--accent),#9B59B6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '.75rem', fontWeight: 700, color: '#fff', cursor: 'pointer',
              border: activeTab === 'profile' ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,.15)',
              boxShadow: activeTab === 'profile' ? '0 0 10px var(--accent-glow)' : 'none',
              flexShrink: 0, transition: 'border .2s, box-shadow .2s' }}>
            {myPhoto ? (
              <img src={myPhoto} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              pseudo[0].toUpperCase()
            )}
          </motion.div>

          {/* Logout */}
          <motion.button onClick={async () => { await clearPresence(user.uid); signOut(auth); }}
            whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }} title={t('app.logout')}
            style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 8,
              color: 'var(--text-muted)', fontSize: '0.72rem', cursor: 'pointer', padding: '4px 8px',
              display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, transition: 'border-color .2s, color .2s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(231,76,60,.4)'; e.currentTarget.style.color = '#E74C3C'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
            <Power size={14} strokeWidth={2} />
          </motion.button>
        </div>
      </div>

      {/* ── Tabs bar ── */}
      <div style={{ overflowX: 'auto', scrollbarWidth: 'none',
        background: 'var(--bg-nav)', borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 56, zIndex: 99 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 8px', width: 'max-content', minWidth: '100%', justifyContent: 'center' }}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 4,
                  padding: '6px 10px', border: 'none', cursor: 'pointer', borderRadius: 8,
                  whiteSpace: 'nowrap', flexShrink: 0, transition: 'all .2s',
                  background: isActive ? `${
                    prefs?.tabColorMode === 'accent' ? 'var(--accent-subtle)' :
                    prefs?.tabColorMode === 'uniform' ? (prefs?.tabUniformColor || tab.color) + '18' :
                    tab.color + '18'
                  }` : 'transparent',
                  color: isActive ? (
                    prefs?.tabColorMode === 'accent' ? 'var(--accent)' :
                    prefs?.tabColorMode === 'uniform' ? (prefs?.tabUniformColor || '#4A90D9') :
                    tab.color
                  ) : 'var(--text-muted)',
                  fontSize: '.75rem', fontWeight: isActive ? 700 : 400,
                  outline: isActive ? `1px solid ${
                    prefs?.tabColorMode === 'uniform' ? (prefs?.tabUniformColor || tab.color) + '30' :
                    prefs?.tabColorMode === 'accent' ? 'var(--accent-glow)' :
                    tab.color + '30'
                  }` : 'none',
                  position: 'relative' }}>
                <tab.Icon size={14} strokeWidth={isActive ? 2.2 : 1.8} />
                {t(tab.labelKey)}
                {tab.id === 'repetition' && srDueCount > 0 && (
                  <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 14, height: 14, borderRadius: 7, background: '#E74C3C', color: '#fff', fontSize: '.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1 }}>
                    {srDueCount}
                  </span>
                )}
                {tab.id === 'groups' && unreadBadge > 0 && (
                  <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 14, height: 14, borderRadius: 7, background: '#27AE60', color: '#fff', fontSize: '.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1 }}>
                    {unreadBadge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Page content ── */}
      <main style={{ flex: 1, padding: 'clamp(0.75rem, 3vw, 1.5rem)', paddingBottom: '6rem', overflowY: 'auto' }}>
        <AnimatePresence mode="wait">
          <motion.div key={activeTab}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}>
            <Suspense fallback={<PageFallback />}>
              {activeTab === 'groups'
                ? <PageGroups user={user} prefs={prefs} unreadByGroup={unreadByGroup}
                    pendingConv={pendingConv} onConvOpened={() => setPendingConv(null)}
                    onMarkRead={(groupId) => {
                      const key = `blokly-lastread-${groupId}-${user.uid}`;
                      localStorage.setItem(key, new Date().toISOString());
                      setUnreadByGroup(prev => {
                        const next = { ...prev, [groupId]: 0 };
                        setUnreadTotal(Object.values(next).reduce((a, b) => a + b, 0));
                        return next;
                      });
                    }} />
                : activeTab === 'profile'
                ? <PageProfile user={user} onOpenConv={(friend) => { setPendingConv(friend); setActiveTab('groups'); }} />
                : activeTab === 'stats'
                ? <PageStats user={user} onOpenConv={(friend) => { setPendingConv(friend); setActiveTab('groups'); }} />
                : <ActivePage user={user} prefs={prefs} onTuto={setTutoPage} onNavigate={setActiveTab} />
              }
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Dock ── */}
      <div style={{
        position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 8, zIndex: 200,
        background: 'var(--bg-nav)', backdropFilter: 'blur(20px)',
        border: '1px solid var(--border-strong)', borderRadius: 20,
        padding: '8px 16px', boxShadow: '0 8px 40px rgba(0,0,0,.4)',
        maxWidth: 'calc(100vw - 32px)',
      }}>
        {[
          { Icon: CalendarDays, label: t('app.tabPlanning'), tab: 'planning', color: '#4A90D9' },
          { Icon: Users,        label: t('app.tabGroups'),   tab: 'groups',   color: '#9B59B6' },
        ].map(item => (
          <motion.button key={item.tab}
            onClick={() => setActiveTab(item.tab)}
            whileHover={{ scale: 1.2, y: -4 }} whileTap={{ scale: .95 }} title={item.label}
            style={{ width: 40, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer',
              background: activeTab === item.tab ? `${item.color}25` : 'var(--bg-card)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: activeTab === item.tab ? item.color : 'var(--text-muted)',
              boxShadow: activeTab === item.tab ? `0 0 12px ${item.color}40` : 'none',
              transition: 'background .2s, box-shadow .2s, color .2s', position: 'relative' }}>
            <item.Icon size={18} strokeWidth={activeTab === item.tab ? 2.2 : 1.8} />
            {item.tab === 'groups' && unreadBadge > 0 && (
              <span style={{ position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 8, background: '#27AE60', color: '#fff', fontSize: '.52rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1, boxShadow: '0 0 6px rgba(39,174,96,.6)' }}>
                {unreadBadge}
              </span>
            )}
          </motion.button>
        ))}

        <div style={{ width: 1, height: 28, background: 'var(--border)' }} />

        {/* Study button */}
        <motion.button onClick={() => setActiveTab('study')}
          whileHover={{ scale: 1.12, y: -5 }} whileTap={{ scale: .95 }} title={t('app.studyMode')}
          style={{ width: 56, height: 56, borderRadius: '50%', border: 'none', cursor: 'pointer',
            position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: activeTab === 'study' ? 'var(--accent)' : 'var(--accent-subtle)',
            boxShadow: activeTab === 'study' ? '0 0 22px var(--accent-glow), 0 4px 16px rgba(0,0,0,.3)' : '0 2px 8px rgba(0,0,0,.2)',
            transition: 'background .3s, box-shadow .3s' }}>
          {/* Pulsing ring when active */}
          {activeTab === 'study' && (
            <motion.div
              animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: '2px solid var(--accent)', pointerEvents: 'none' }}
            />
          )}
          <Play size={20} strokeWidth={0} fill="var(--accent-glow)"
            style={{ color: activeTab === 'study' ? '#fff' : 'var(--accent)', fill: activeTab === 'study' ? '#fff' : 'var(--accent)', marginLeft: 2 }} />
        </motion.button>

        <div style={{ width: 1, height: 28, background: 'var(--border)' }} />

        <motion.button onClick={() => setShowAddSubject(true)}
          whileHover={{ scale: 1.2, y: -4 }} whileTap={{ scale: .95 }} title={t('app.newSubject')}
          style={{ width: 40, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', transition: 'color .2s' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
          <LibraryBig size={18} strokeWidth={1.8} />
        </motion.button>

        <div style={{ width: 1, height: 28, background: 'var(--border)' }} />

        {/* Themes */}
        <motion.button onClick={() => setShowThemeEditor(true)}
          whileHover={{ scale: 1.15, y: -4 }} whileTap={{ scale: .95 }} title={t('app.customizeTheme')}
          style={{ width: 40, height: 40, borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', transition: 'color .2s' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
          <Palette size={18} strokeWidth={1.8} />
        </motion.button>
      </div>

      {showAddSubject && <SubjectModal subjects={subjects} onAdd={addSubject} onDelete={deleteSubject} onEdit={editSubject} onClose={() => setShowAddSubject(false)} />}

      <AnimatePresence>
        {showDevCode && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(12px)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={e => e.target === e.currentTarget && setShowDevCode(false)}>
            <motion.div initial={{ scale: .9, y: 20 }} animate={{ scale: 1, y: 0 }}
              style={{ background: '#0a0a18', border: '1px solid rgba(255,100,0,.3)', borderRadius: 16, padding: '2rem', width: 300, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: '1.5rem' }}>🛠️</div>
              <div style={{ fontSize: '.85rem', color: 'rgba(255,255,255,.6)', textAlign: 'center' }}>
                {t('app.devCodePrompt')}
              </div>
              <input type="password" value={devCodeInput}
                onChange={e => setDevCodeInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    // Second gate. The code alone proves nothing — it ships in
                    // the bundle — so admin status is re-checked here too.
                    if (devCodeInput === '220608' && isAdmin(user)) {
                      setShowDevPanel(true); setShowDevCode(false); setDevCodeInput('');
                    } else { setDevCodeInput(''); }
                  }
                }}
                placeholder="••••••" autoFocus
                style={{ width: '100%', padding: '10px', borderRadius: 9, textAlign: 'center',
                  border: '1px solid rgba(255,100,0,.3)', background: 'rgba(255,100,0,.05)',
                  color: '#ff6400', fontSize: '1.2rem', letterSpacing: '0.3em',
                  fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }} />
              <div style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.25)' }}>
                {t('app.enterToValidate')}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDevPanel && (
          <Suspense fallback={null}>
            <DevPanel
              onClose={() => setShowDevPanel(false)}
              userXp={xp}
              onUnlockAll={typeof setDevUnlocked === 'function' ? () => setDevUnlocked(true) : () => {}}
            />
          </Suspense>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showThemeEditor && (
          <Suspense fallback={null}>
            <ThemeEditor
              prefs={prefs}
              userXp={devUnlocked ? 999999 : xp}
              customAllowed={devUnlocked || CUSTOM_THEME_UIDS.includes(user?.uid)}
              key={devUnlocked ? 'unlocked' : 'locked'}
              // Persistence (account + per-account cache) lives in
              // lib/accountPrefs, behind setPrefs — no direct writes here.
              onSave={newPrefs => setPrefs(newPrefs)}
              onClose={() => setShowThemeEditor(false)}
            />
          </Suspense>
        )}
      </AnimatePresence>

      <TutoModal page={tutoPage} onClose={() => setTutoPage(null)} />

      {/* Headless: keeps a joined group session counting (and accruing focus
          time) even while the Groups tab is unmounted. */}
      <GroupSessionEngine user={user} />

      <style>{`
        ::-webkit-scrollbar { display:none; }

        /* Mobile optimizations */
        @media (max-width: 480px) {
          .hide-mobile { display: none !important; }
        }
      `}</style>
    </div>
  );
}