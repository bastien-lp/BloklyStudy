/**
 * PageTodo — Task manager
 * --------------------------------------------------------------------------
 * Tasks are stored in `users/{uid}/data/main` under `todos`:
 *   todo = { id, title, priority, subjId, due, recur, done, doneAt, createdAt }
 *   - priority : 'high' | 'medium' | 'low'
 *   - recur    : '' | 'daily' | 'weekly' (spawns the next occurrence on complete)
 *   - done/doneAt : completion flag + ISO timestamp (drives auto-delete)
 *
 * The page also surfaces spaced-repetition reviews that are due today (read
 * from `srData`), with a shortcut to the Rév. J page via `onNavigate`.
 *
 * The "auto-delete" preference lives in localStorage ('todo-autodelete').
 *
 * Props: { user, onNavigate } — onNavigate(tabId) switches the active page.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { X, Plus } from 'lucide-react';
import { db } from '../firebase/config';
import { useTranslation } from '../i18n';
import { GuidedTour, useGuidedTour, TourButton } from '../components/GuidedTour';
import { reportSaveError } from '../lib/notify';

// Priority definitions. `labelKey` is resolved at render time.
const P = {
  high:   { labelKey: 'todo.prioHigh',   color: '#ff4d6d', glow: 'rgba(255,77,109,.3)', icon: '🔴', bg: 'rgba(255,77,109,.08)' },
  medium: { labelKey: 'todo.prioMedium', color: '#f4a261', glow: 'rgba(244,162,97,.2)', icon: '🟡', bg: 'rgba(244,162,97,.06)' },
  low:    { labelKey: 'todo.prioLow',    color: '#52b788', glow: 'rgba(82,183,136,.2)', icon: '🟢', bg: 'rgba(82,183,136,.06)' },
};

// Auto-delete delays (ms) by preference value.
const AUTO_DELETE_MS = { off: Infinity, '1h': 3600000, '24h': 86400000, '48h': 172800000 };

function isOverdue(t) {
  if (!t.due || t.done) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(t.due) < today;
}

/** Human-readable due-date label, localized. */
function formatDueDate(d, t, formatDate) {
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((new Date(d) - today) / 86400000);
  if (diff === 0) return t('common.today');
  if (diff === 1) return t('common.tomorrow');
  if (diff < 0)  return t('todo.daysOverdue', { count: Math.abs(diff) });
  if (diff < 7)  return t('todo.inDays', { count: diff });
  return formatDate(d, { day: 'numeric', month: 'short' });
}

// ── Animated checkbox ────────────────────────────────────────────────────────
function Checkbox({ done, color, onClick }) {
  return (
    <button onClick={onClick}
      style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, cursor: 'pointer', border: `2px solid ${done ? color : 'var(--border-strong)'}`, background: done ? color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'border-color .2s, background .2s' }}>
      {done && (
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      )}
    </button>
  );
}

// ── Subtask checklist (shown under a task that has subtasks) ──────────────────
function SubtaskList({ subtasks, color, onToggle }) {
  if (!subtasks?.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, paddingLeft: 2 }}>
      {subtasks.map((st, i) => (
        <button key={i} onClick={() => onToggle(i)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'transparent', border: 'none',
            cursor: 'pointer', padding: 0, textAlign: 'left', width: '100%' }}>
          <span style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0,
            border: `1.5px solid ${st.done ? color : 'var(--border-strong)'}`, background: st.done ? color : 'transparent',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {st.done && (
              <svg width="9" height="9" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
            )}
          </span>
          <span style={{ fontSize: '.72rem', color: st.done ? 'var(--text-muted)' : 'var(--text-secondary)',
            textDecoration: st.done ? 'line-through' : 'none' }}>{st.text}</span>
        </button>
      ))}
    </div>
  );
}

/** "2/3" progress chip for a task's subtasks, or null when there are none. */
function SubtaskBadge({ subtasks }) {
  if (!subtasks?.length) return null;
  const done = subtasks.filter(st => st.done).length;
  const all = subtasks.length;
  return (
    <span style={{ fontSize: '.58rem', padding: '1px 6px', borderRadius: 8, fontWeight: 700,
      background: done === all ? 'rgba(39,174,96,.15)' : 'var(--bg-card-hover)',
      color: done === all ? '#27AE60' : 'var(--text-muted)' }}>
      {done}/{all}
    </span>
  );
}

// ── Big card (urgent tasks) ──────────────────────────────────────────────────
function UrgentCard({ todo, subjects, onToggle, onDelete, onEdit, onToggleSubtask }) {
  const { t, formatDate } = useTranslation();
  const p = P[todo.priority] || P.medium;
  const subj = subjects.find(s => s.id === todo.subjId);
  const overdue = isOverdue(todo);
  const dateLabel = formatDueDate(todo.due, t, formatDate);

  return (
    <motion.div initial={{ opacity: 0, scale: .95 }} animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -2 }}
      style={{
        background: `linear-gradient(135deg, ${p.bg} 0%, rgba(255,255,255,.03) 100%)`,
        border: `1px solid ${p.color}40`,
        borderLeft: `4px solid ${p.color}`,
        borderRadius: 16,
        padding: '1.4rem',
        boxShadow: `0 8px 32px ${p.glow}`,
        position: 'relative',
        overflow: 'hidden',
        opacity: todo.done ? 0.4 : 1,
      }}>

      {/* Glow */}
      <div style={{ position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: '50%', background: p.color, opacity: .06, filter: 'blur(30px)', pointerEvents: 'none' }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
        <Checkbox done={todo.done} color={p.color} onClick={() => onToggle(todo.id)} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: todo.done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: todo.done ? 'line-through' : 'none', lineHeight: 1.3, marginBottom: 6 }}>
            {todo.title}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '.65rem', padding: '2px 8px', borderRadius: 20, background: p.bg, color: p.color, fontWeight: 700, border: `1px solid ${p.color}40` }}>
              {t(p.labelKey)}
            </span>
            {subj && <span style={{ fontSize: '.62rem', padding: '2px 7px', borderRadius: 20, background: `${subj.color}22`, color: subj.color, fontWeight: 600 }}>{subj.name}</span>}
            {dateLabel && <span style={{ fontSize: '.62rem', color: overdue ? '#ff4d6d' : 'var(--text-muted)', fontWeight: overdue ? 700 : 400 }}>{overdue ? '⚠️ ' : ''}{dateLabel}</span>}
            <SubtaskBadge subtasks={todo.subtasks} />
          </div>
          <SubtaskList subtasks={todo.subtasks} color={p.color} onToggle={i => onToggleSubtask(todo.id, i)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button onClick={() => onEdit(todo)}
          style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '.7rem', cursor: 'pointer' }}>✏️ {t('common.edit')}</button>
        <button onClick={() => onDelete(todo.id)}
          style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,77,109,.2)', background: 'rgba(255,77,109,.08)', color: '#ff4d6d', fontSize: '.7rem', cursor: 'pointer' }}>🗑 {t('todo.deleteShort')}</button>
      </div>
    </motion.div>
  );
}

// ── Compact row (non-urgent tasks) ───────────────────────────────────────────
function CompactRow({ todo, subjects, onToggle, onDelete, onEdit, onToggleSubtask }) {
  const { t, formatDate } = useTranslation();
  const [hover, setHover] = useState(false);
  const p = P[todo.priority] || P.medium;
  const subj = subjects.find(s => s.id === todo.subjId);
  const overdue = isOverdue(todo);
  const dateLabel = formatDueDate(todo.due, t, formatDate);
  const hasSubs = todo.subtasks?.length > 0;

  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', flexDirection: 'column', padding: '9px 12px',
        background: hover ? 'var(--bg-card-hover)' : 'var(--bg-card)',
        border: `1px solid ${hover ? 'var(--border-strong)' : 'var(--border)'}`,
        borderRadius: 10, transition: 'background .15s, border-color .15s',
        opacity: todo.done ? 0.4 : 1,
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 3, height: 28, borderRadius: 3, background: p.color, flexShrink: 0 }} />
        <Checkbox done={todo.done} color={p.color} onClick={() => onToggle(todo.id)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '.83rem', fontWeight: 600, color: todo.done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: todo.done ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {todo.title}
          </div>
          {(subj || dateLabel || hasSubs) && (
            <div style={{ display: 'flex', gap: 5, marginTop: 2, alignItems: 'center' }}>
              {subj && <span style={{ fontSize: '.58rem', padding: '1px 5px', borderRadius: 6, background: `${subj.color}20`, color: subj.color }}>{subj.name}</span>}
              {dateLabel && <span style={{ fontSize: '.58rem', color: overdue ? '#ff4d6d' : 'var(--text-muted)', fontWeight: overdue ? 700 : 400 }}>{overdue ? '⚠️ ' : ''}{dateLabel}</span>}
              <SubtaskBadge subtasks={todo.subtasks} />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, opacity: hover ? 1 : 0, transition: 'opacity .15s' }}>
          <button onClick={() => onEdit(todo)}
            style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '.65rem', cursor: 'pointer' }}>✏️</button>
          <button onClick={() => onDelete(todo.id)}
            style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid rgba(255,77,109,.2)', background: 'rgba(255,77,109,.08)', color: '#ff4d6d', fontSize: '.65rem', cursor: 'pointer' }}>🗑</button>
        </div>
      </div>
      {hasSubs && (
        <div style={{ paddingLeft: 35 }}>
          <SubtaskList subtasks={todo.subtasks} color={p.color} onToggle={i => onToggleSubtask(todo.id, i)} />
        </div>
      )}
    </div>
  );
}

// ── Create / edit modal ──────────────────────────────────────────────────────
function TodoModal({ todo, subjects, onSave, onClose }) {
  const { t } = useTranslation();
  const [title, setTitle]       = useState(todo?.title || '');
  const [priority, setPriority] = useState(todo?.priority || 'medium');
  const [subjId, setSubjId]     = useState(todo?.subjId ? String(todo.subjId) : '');
  const [due, setDue]           = useState(todo?.due || '');
  const [recur, setRecur]       = useState(todo?.recur || '');
  const [subtasks, setSubtasks] = useState(() => (todo?.subtasks || []).map(st => ({ ...st })));
  const ref = useRef(null);
  useEffect(() => { setTimeout(() => ref.current?.focus(), 60); }, []);

  function addSubtask()          { setSubtasks(list => [...list, { text: '', done: false }]); }
  function setSubtaskText(i, v)  { setSubtasks(list => list.map((st, j) => j === i ? { ...st, text: v } : st)); }
  function removeSubtask(i)      { setSubtasks(list => list.filter((_, j) => j !== i)); }

  const s = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.83rem', fontFamily: 'var(--font-family)' };
  const l = { fontSize: '.7rem', color: 'var(--text-muted)', marginBottom: 4, display: 'block', fontWeight: 500 };

  function submit() {
    if (!title.trim()) return;
    const cleanSubs = subtasks.map(st => ({ text: st.text.trim(), done: !!st.done })).filter(st => st.text);
    onSave({ title: title.trim(), priority, subjId: subjId ? parseInt(subjId, 10) : '', due, recur, subtasks: cleanSubs });
  }

  const recurOptions = [
    { v: '', l: t('todo.recurNever') },
    { v: 'daily', l: `🔄 ${t('todo.recurDaily')}` },
    { v: 'weekly', l: `📅 ${t('todo.recurWeekly')}` },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(12px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: .9, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: .9, y: 30 }}
        style={{ background: 'var(--bg-modal)', border: '1px solid var(--border-strong)', borderRadius: 20, padding: '1.8rem', width: 420, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            {todo ? `✏️ ${t('common.edit')}` : `✨ ${t('todo.modalNew')}`}
          </h3>
          <button aria-label="Fermer" onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div>
          <label style={l}>{t('todo.titleLabel')} *</label>
          <input ref={ref} value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder={t('todo.titlePlaceholder')} style={s} />
        </div>

        {/* Priority pills */}
        <div>
          <label style={l}>{t('todo.priority')}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {Object.entries(P).map(([k, v]) => (
              <button key={k} onClick={() => setPriority(k)}
                style={{ flex: 1, padding: '7px 0', borderRadius: 10, border: `1px solid ${priority === k ? v.color : 'var(--border)'}`, background: priority === k ? v.bg : 'var(--bg-card)', color: priority === k ? v.color : 'var(--text-secondary)', fontSize: '.75rem', fontWeight: 600, cursor: 'pointer', transition: 'all .15s' }}>
                {v.icon} {t(v.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={l}>{t('common.subject')}</label>
            <select value={subjId} onChange={e => setSubjId(e.target.value)} style={s}>
              <option value="">{t('todo.noneSubject')}</option>
              {subjects.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={l}>{t('todo.dueDate')}</label>
            <input type="date" value={due} onChange={e => setDue(e.target.value)} style={s} />
          </div>
        </div>

        <div>
          <label style={l}>{t('todo.recurrence')}</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {recurOptions.map(opt => (
              <button key={opt.v} onClick={() => setRecur(opt.v)}
                style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: `1px solid ${recur === opt.v ? 'var(--accent)' : 'var(--border)'}`, background: recur === opt.v ? 'var(--accent-subtle)' : 'var(--bg-card)', color: recur === opt.v ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '.72rem', cursor: 'pointer', transition: 'all .15s' }}>
                {opt.l}
              </button>
            ))}
          </div>
        </div>

        {/* Subtasks */}
        <div>
          <label style={l}>{t('todo.subtasks')}</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {subtasks.map((st, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-muted)', flexShrink: 0 }} />
                <input value={st.text} onChange={e => setSubtaskText(i, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubtask(); } }}
                  placeholder={t('todo.subtaskPlaceholder')} style={{ ...s, flex: 1, padding: '6px 8px', fontSize: '.78rem' }} />
                <button onClick={() => removeSubtask(i)}
                  style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid rgba(255,77,109,.2)', background: 'rgba(255,77,109,.08)', color: '#ff4d6d', cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={12} strokeWidth={2.2} />
                </button>
              </div>
            ))}
            <button onClick={addSubtask}
              style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8,
                border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '.74rem', cursor: 'pointer' }}>
              <Plus size={13} strokeWidth={2} /> {t('todo.addSubtask')}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button onClick={onClose}
            style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '.83rem', cursor: 'pointer' }}>
            {t('common.cancel')}
          </button>
          <button onClick={submit}
            style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none', background: title.trim() ? `linear-gradient(135deg,var(--accent),#6366f1)` : 'var(--bg-card)', color: title.trim() ? '#fff' : 'var(--text-muted)', fontSize: '.83rem', fontWeight: 700, cursor: title.trim() ? 'pointer' : 'default', transition: 'background .2s' }}>
            {todo ? t('common.save') : `✨ ${t('todo.addTask')}`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function PageTodo({ user, onNavigate }) {
  const { t } = useTranslation();
  const tour = useGuidedTour('todo');
  const [todos, setTodos]           = useState([]);
  const [subjects, setSubjects]     = useState([]);
  const [srDue, setSrDue]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('all');
  const [filterSubj, setFilterSubj] = useState('');
  const [modal, setModal]           = useState(null);
  const [search, setSearch]         = useState('');
  const [autoDelete, setAutoDelete] = useState(() => {
    const v = localStorage.getItem('todo-autodelete');
    return v === null ? '24h' : v;
  });

  useEffect(() => { localStorage.setItem('todo-autodelete', autoDelete); }, [autoDelete]);

  // ── Firestore subscription (todos + subjects + due spaced reviews) ──
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'data', 'main'), snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      setTodos(d.todos || []);
      setSubjects(d.subjects || []);

      const srData = d.srData || {};
      const subjs = d.subjects || [];
      const now = Date.now();
      const due = [];
      subjs.forEach(s => {
        const chaps = s.chapters || Array.from({ length: s.chaps || 0 }, (_, i) => ({ name: t('todo.chapterFull', { count: i + 1 }) }));
        chaps.forEach((c, i) => {
          const sr = srData[`${s.id}_${i}`];
          if (!sr) return;
          const reviews = sr.reviews || [];
          const ni = reviews.length;
          if (ni >= 3) return;
          const last = reviews.length > 0 ? reviews[reviews.length - 1] : sr.firstStudy;
          const nextDue = last + [1, 7, 30][ni] * 86400000;
          if (nextDue <= now) due.push({ subjName: s.name, chapName: c.name || t('todo.chapterFull', { count: i + 1 }), color: s.color });
        });
      });
      setSrDue(due);
      setLoading(false);
    });
    return unsub;
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-delete completed tasks whose doneAt is older than the threshold.
  // Runs on load and whenever the preference changes (so stale done tasks from
  // a previous session are cleaned up when the app reopens).
  useEffect(() => {
    if (loading) return;
    const delayMs = AUTO_DELETE_MS[autoDelete] ?? AUTO_DELETE_MS['24h'];
    if (delayMs === Infinity) return;
    setTodos(prev => {
      const cleaned = prev.filter(t => !t.done || !t.doneAt || (Date.now() - new Date(t.doneAt).getTime()) < delayMs);
      if (cleaned.length === prev.length) return prev;
      saveTodos(cleaned);
      return cleaned;
    });
  }, [loading, autoDelete]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveTodos(updated) {
    if (!user) return;
    try { await updateDoc(doc(db, 'users', user.uid, 'data', 'main'), { todos: updated }); }
    catch (e) { reportSaveError(e, 'Todo — save'); }
  }

  function handleToggle(id) {
    const updated = todos.map(t => {
      if (t.id !== id) return t;
      const done = !t.done;
      const result = { ...t, done, doneAt: done ? new Date().toISOString() : null };
      // On completing a recurring task, schedule the next occurrence.
      if (done && t.recur) {
        // Next occurrence starts fresh: its subtasks are reset to unchecked.
        const next = { ...t, id: Date.now() + 1, done: false, doneAt: null,
          subtasks: (t.subtasks || []).map(st => ({ ...st, done: false })) };
        if (t.recur === 'daily' && t.due)  { const d = new Date(t.due); d.setDate(d.getDate() + 1); next.due = d.toISOString().slice(0, 10); }
        if (t.recur === 'weekly' && t.due) { const d = new Date(t.due); d.setDate(d.getDate() + 7); next.due = d.toISOString().slice(0, 10); }
        setTimeout(() => { setTodos(prev => { const u = [...prev, next]; saveTodos(u); return u; }); }, 300);
      }
      return result;
    });
    // Immediate cleanup pass (in case the just-completed task is already stale).
    const delayMs = AUTO_DELETE_MS[autoDelete] ?? AUTO_DELETE_MS['24h'];
    const cleaned = updated.filter(t => !t.done || !t.doneAt || (Date.now() - new Date(t.doneAt).getTime()) < delayMs);
    setTodos(cleaned); saveTodos(cleaned);
  }

  function handleDelete(id) { const u = todos.filter(t => t.id !== id); setTodos(u); saveTodos(u); }

  // Toggle a single subtask's done flag on a task.
  function handleToggleSubtask(todoId, subIdx) {
    const updated = todos.map(t => {
      if (t.id !== todoId || !Array.isArray(t.subtasks)) return t;
      return { ...t, subtasks: t.subtasks.map((st, i) => i === subIdx ? { ...st, done: !st.done } : st) };
    });
    setTodos(updated); saveTodos(updated);
  }

  function handleSave(data) {
    const updated = modal && modal.id
      ? todos.map(t => t.id === modal.id ? { ...t, ...data } : t)
      : [...todos, { id: Date.now(), ...data, done: false, createdAt: new Date().toISOString(), doneAt: null }];
    setTodos(updated); saveTodos(updated); setModal(null);
  }

  // ── Stats ──
  const total = todos.length;
  const done = todos.filter(t => t.done).length;
  const overdue = todos.filter(t => isOverdue(t)).length;
  const todayDone = todos.filter(t => t.done && t.doneAt && t.doneAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).length;

  // ── Filter + sort ──
  let filtered = todos.filter(t => {
    if (filter === 'todo') return !t.done;
    if (filter === 'done') return t.done;
    if (filter === 'high') return !t.done && t.priority === 'high';
    if (filter === 'overdue') return isOverdue(t);
    return true;
  });
  if (filterSubj) filtered = filtered.filter(t => String(t.subjId) === filterSubj);
  if (search) filtered = filtered.filter(t => t.title.toLowerCase().includes(search.toLowerCase()));

  const pOrd = { high: 0, medium: 1, low: 2 };
  filtered.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const ao = isOverdue(a), bo = isOverdue(b);
    if (ao !== bo) return ao ? -1 : 1;
    const pd = (pOrd[a.priority] || 1) - (pOrd[b.priority] || 1);
    if (pd !== 0) return pd;
    if (a.due && b.due) return new Date(a.due) - new Date(b.due);
    return 0;
  });

  const urgent = filtered.filter(t => !t.done && t.priority === 'high');
  const rest   = filtered.filter(t => t.done || t.priority !== 'high');

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}><motion.div animate={{ opacity: [.3, 1, .3] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</motion.div></div>;

  const filterPills = [
    { v: 'all',  l: t('todo.filterAll') },
    { v: 'todo', l: t('todo.statTodo') },
    { v: 'done', l: t('todo.filterDone') },
    { v: 'high', l: `🔴 ${t('todo.filterHigh')}` },
    ...(overdue > 0 ? [{ v: 'overdue', l: `⚠️ ${t('todo.filterOverdue')}` }] : []),
  ];

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20, fontFamily: 'var(--font-family)' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-.02em' }}>{t('todo.pageTitle')}</h1>
          {todayDone > 0 && (
            <motion.div initial={{ scale: 0, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', damping: 10 }}
              style={{ padding: '3px 12px', borderRadius: 20, background: 'rgba(87,255,43,.12)', border: '1px solid rgba(87,255,43,.25)', fontSize: '.7rem', fontWeight: 700, color: '#57FF2B' }}>
              🔥 {t('todo.doneToday', { count: todayDone })}
            </motion.div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>🗑 {t('todo.autoDelete')}</span>
          <select value={autoDelete} onChange={e => setAutoDelete(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '.75rem', cursor: 'pointer' }}>
            <option value="off">{t('todo.autoNever')}</option>
            <option value="1h">{t('todo.auto1h')}</option>
            <option value="24h">{t('todo.auto24h')}</option>
            <option value="48h">{t('todo.auto48h')}</option>
          </select>
        </div>
        <motion.button onClick={() => setModal('add')} whileHover={{ scale: 1.04 }} whileTap={{ scale: .97 }}
          style={{ padding: '9px 22px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#4A90D9,#6366f1)', color: '#fff', fontSize: '.85rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 20px rgba(74,144,217,.35)' }}>
          + {t('todo.modalNew')}
        </motion.button>
      </div>

      <TourButton onClick={tour.start} label={t('common.guidedTour')} />

      {/* ── Stats ── */}
      <div data-tour="tour-todo-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(100px,1fr))', gap: 8 }}>
        <div style={{ textAlign: 'center', padding: '12px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1 }}>{total - done}</div>
          <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 3 }}>{t('todo.statTodo')}</div>
        </div>
        <div style={{ textAlign: 'center', padding: '12px 8px', background: 'rgba(82,183,136,.08)', border: '1px solid rgba(82,183,136,.2)', borderRadius: 12 }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#52b788', lineHeight: 1 }}>{done}</div>
          <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 3 }}>{t('todo.statDone')}</div>
        </div>
        {overdue > 0 && (
          <div style={{ textAlign: 'center', padding: '12px 8px', background: 'rgba(255,77,109,.08)', border: '1px solid rgba(255,77,109,.2)', borderRadius: 12 }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#ff4d6d', lineHeight: 1 }}>{overdue}</div>
            <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 3 }}>{t('todo.statOverdue')}</div>
          </div>
        )}
        <div style={{ textAlign: 'center', padding: '12px 8px', background: 'rgba(74,144,217,.08)', border: '1px solid rgba(74,144,217,.2)', borderRadius: 12 }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#4A90D9', lineHeight: 1 }}>{total > 0 ? Math.round(done / total * 100) : 0}%</div>
          <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 3 }}>{t('todo.statComplete')}</div>
          {total > 0 && (
            <div style={{ marginTop: 6, height: 3, background: 'var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round(done / total * 100)}%`, background: '#4A90D9', borderRadius: 10, transition: 'width .8s ease' }} />
            </div>
          )}
        </div>
      </div>

      {/* Due spaced reviews */}
      {srDue.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
            background: 'rgba(74,144,217,.06)', border: '1px solid rgba(74,144,217,.2)', borderRadius: 12 }}>
          <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>🔁</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.82rem', fontWeight: 700, color: '#93c5fd', marginBottom: 2 }}>
              {t('todo.srBanner', { count: srDue.length })}
            </div>
            <div style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>
              {srDue.slice(0, 3).map(r => `${r.subjName} · ${r.chapName}`).join(' — ')}
              {srDue.length > 3 ? ` ${t('todo.andMore', { count: srDue.length - 3 })}` : ''}
            </div>
          </div>
          <button onClick={() => onNavigate?.('repetition')}
            style={{ padding: '5px 12px', borderRadius: 8, border: 'none',
              background: 'rgba(74,144,217,.15)', color: '#93c5fd',
              fontSize: '.72rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
            {t('todo.see')} →
          </button>
        </motion.div>
      )}

      {/* ── Filters ── */}
      <div data-tour="tour-todo-filters" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {filterPills.map(f => (
          <button key={f.v} onClick={() => setFilter(f.v)}
            style={{ padding: '5px 14px', borderRadius: 20, border: `1px solid ${filter === f.v ? 'var(--accent)' : 'var(--border)'}`,
              background: filter === f.v ? 'var(--accent-subtle)' : 'transparent',
              color: filter === f.v ? 'var(--accent)' : 'var(--text-muted)', fontSize: '.75rem', cursor: 'pointer', transition: 'all .15s', fontWeight: filter === f.v ? 600 : 400 }}>
            {f.l}
          </button>
        ))}
        {subjects.length > 0 && (
          <select value={filterSubj} onChange={e => setFilterSubj(e.target.value)}
            style={{ padding: '5px 10px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: '.75rem', cursor: 'pointer' }}>
            <option value="">{t('todo.allSubjects')}</option>
            {subjects.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
          </select>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`🔍 ${t('common.search')}`}
            style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.75rem', width: 160 }} />
        </div>
      </div>

      {/* ── Content ── */}
      <div data-tour="tour-todo-list">
      {filtered.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px dashed var(--border)', borderRadius: 16 }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>📭</div>
          <div style={{ fontSize: '.9rem' }}>{todos.length === 0 ? t('todo.emptyAll') : t('todo.emptyFiltered')}</div>
        </motion.div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Urgent tasks */}
          {urgent.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: '.7rem', fontWeight: 700, color: '#ff4d6d', letterSpacing: '.06em', textTransform: 'uppercase' }}>🔴 {t('todo.filterHigh')}</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,77,109,.2)' }} />
                <span style={{ fontSize: '.65rem', color: 'rgba(255,77,109,.5)' }}>{urgent.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 10 }}>
                {urgent.map(t => <UrgentCard key={t.id} todo={t} subjects={subjects} onToggle={handleToggle} onDelete={handleDelete} onEdit={setModal} onToggleSubtask={handleToggleSubtask} />)}
              </div>
            </div>
          )}

          {/* Other tasks */}
          {rest.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {urgent.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '.06em', textTransform: 'uppercase' }}>{t('todo.otherTasks')}</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  <span style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>{rest.length}</span>
                </div>
              )}
              {rest.map((t, i) => <CompactRow key={t.id} todo={t} subjects={subjects} onToggle={handleToggle} onDelete={handleDelete} onEdit={setModal} onToggleSubtask={handleToggleSubtask} index={i} />)}
            </div>
          )}
        </div>
      )}

      </div>

      {/* Modal */}
      <AnimatePresence>
        {modal && <TodoModal todo={modal === 'add' ? null : modal} subjects={subjects} onSave={handleSave} onClose={() => setModal(null)} />}
      </AnimatePresence>

      <GuidedTour active={tour.active} step={tour.step} steps={tour.steps}
        onNext={tour.next} onPrev={tour.prev} onStop={tour.stop} />
    </div>
  );
}