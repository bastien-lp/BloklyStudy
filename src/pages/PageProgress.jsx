/**
 * PageProgress — Study progress dashboard
 * --------------------------------------------------------------------------
 * Read-only overview of planning progress: global score, weekly calendar,
 * subject distribution (pie), per-subject bars and an actionable agenda of
 * pending review blocks.
 *
 * Reads `users/{uid}/data/main`: subjects (with totalBlocks/doneBlocks),
 * blocks (planning blocks, type 'rev').
 * Toggling a block updates its status and recomputes each subject's doneBlocks.
 *
 * NOTE: the `data-tour="..."` attributes anchor the guided tour — keep them.
 *
 * Props: { user, onTuto }
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { GuidedTour, useGuidedTour, TourButton } from '../components/GuidedTour';
import { useTranslation } from '../i18n';
import { subjectReadiness, readinessBand } from '../data/readiness';
import { reportSaveError } from '../lib/notify';

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** Hours (e.g. 9.5) → "9h30". */
function hm(h) {
  const hh = Math.floor(h), mm = String(Math.round((h % 1) * 60)).padStart(2, '0');
  return `${hh}h${mm}`;
}

/** Resolve a block's ISO date (from explicit dateStr or week/day offsets). */
function blockDateStr(b) {
  if (b.dateStr) return b.dateStr;
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay() + 1 + (b.weekOffset || 0) * 7 + (b.day || 0));
  return d.toISOString().slice(0, 10);
}

function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr) - today) / 86400000);
}

/** Localized short weekday name for a Monday-based index (0=Mon … 6=Sun). */
function dayShort(formatDate, i) {
  // 2024-01-01 is a Monday → +i gives the right weekday.
  return formatDate(new Date(2024, 0, 1 + i), { weekday: 'short' });
}
/** Motivation message (i18n key + emoji) for a completion percentage. */
function getMotivation(pct) {
  if (pct === 0)  return { key: 'progress.motiv0', emoji: '🚀' };
  if (pct < 20)   return { key: 'progress.motiv1', emoji: '💪' };
  if (pct < 40)   return { key: 'progress.motiv2', emoji: '📈' };
  if (pct < 60)   return { key: 'progress.motiv3', emoji: '⚡' };
  if (pct < 80)   return { key: 'progress.motiv4', emoji: '🔥' };
  if (pct < 100)  return { key: 'progress.motiv5', emoji: '🎯' };
  return            { key: 'progress.motiv6', emoji: '🏆' };
}

// ── Mini week calendar ───────────────────────────────────────────────────────
function WeekCalendar({ blocks, subjects }) {
  const { formatDate } = useTranslation();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return d;
  });
  return (
    <div style={{ display: 'flex', gap: 5 }}>
      {days.map((d, i) => {
        const dateStr = d.toISOString().slice(0, 10);
        const isToday = d.toDateString() === today.toDateString();
        const isPast = d < today;
        const dayBlocks = blocks.filter(b => b.type === 'rev' && blockDateStr(b) === dateStr);
        const doneCount = dayBlocks.filter(b => b.status === 'done').length;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: '.58rem', color: isToday ? 'var(--accent)' : 'var(--text-muted)', fontWeight: isToday ? 700 : 400 }}>
              {dayShort(formatDate, i)}
            </span>
            <div style={{ width: '100%', minHeight: 44, borderRadius: 9, padding: '5px 3px',
              background: isToday ? 'var(--accent-subtle)' : 'var(--bg-card)',
              border: `1px solid ${isToday ? 'var(--accent)' : 'var(--border)'}`,
              display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
              {dayBlocks.length === 0 ? (
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--border)', marginTop: 3 }} />
              ) : dayBlocks.slice(0, 3).map((b, bi) => {
                const subj = subjects.find(s => s.id === b.subj);
                return <div key={bi} style={{ width: '88%', height: 5, borderRadius: 3,
                  background: b.status === 'done' ? `${subj?.color || '#4A90D9'}70` : (subj?.color || '#4A90D9'),
                  opacity: isPast && b.status !== 'done' ? .35 : 1 }} />;
              })}
              {dayBlocks.length > 3 && <span style={{ fontSize: '.42rem', color: 'var(--text-muted)' }}>+{dayBlocks.length - 3}</span>}
            </div>
            <span style={{ fontSize: '.52rem', color: doneCount > 0 ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600 }}>
              {doneCount > 0 ? `${doneCount}✓` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Compact pie chart (block distribution by subject) ────────────────────────
function PieChart({ subjects, blocks }) {
  const { t } = useTranslation();
  const bySubj = subjects.map(s => ({
    name: s.name, color: s.color || '#4A90D9',
    total: blocks.filter(b => b.type === 'rev' && b.subj === s.id).length,
    done: blocks.filter(b => b.type === 'rev' && b.subj === s.id && b.status === 'done').length,
  })).filter(s => s.total > 0);
  const total = bySubj.reduce((a, s) => a + s.total, 0);
  if (!total) return <p style={{ color: 'var(--text-muted)', fontSize: '.78rem', textAlign: 'center', padding: '1rem' }}>{t('progress.noBlocks')}</p>;
  const r = 60, cx = 75, cy = 75, innerR = 35;
  let angle = -Math.PI / 2;
  const slices = bySubj.map(s => {
    const slice = s.total / total * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(angle + slice), y2 = cy + r * Math.sin(angle + slice);
    const ix1 = cx + innerR * Math.cos(angle), iy1 = cy + innerR * Math.sin(angle);
    const ix2 = cx + innerR * Math.cos(angle + slice), iy2 = cy + innerR * Math.sin(angle + slice);
    const large = slice > Math.PI ? 1 : 0;
    const path = `M ${ix1} ${iy1} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${large} 0 ${ix1} ${iy1} Z`;
    angle += slice;
    return { ...s, path, pct: Math.round(s.total / total * 100) };
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <svg width="150" height="150" viewBox="0 0 150 150" style={{ flexShrink: 0 }}>
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} stroke="var(--bg-card)" strokeWidth="1.5"
            style={{ filter: `drop-shadow(0 0 3px ${s.color}40)` }} />
        ))}
        <text x="75" y="72" textAnchor="middle" fill="var(--text-primary)" fontSize="13" fontFamily="sans-serif" fontWeight="bold">{total}</text>
        <text x="75" y="84" textAnchor="middle" fill="var(--text-muted)" fontSize="8" fontFamily="sans-serif">{t('progress.blocks')}</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 100 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: '.68rem', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
            <span style={{ fontSize: '.65rem', color: s.color, fontWeight: 700, flexShrink: 0 }}>{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Agenda item ──────────────────────────────────────────────────────────────
function AgendaItem({ block, subjects, onToggle }) {
  const { t, formatDate } = useTranslation();
  const subj = subjects.find(s => s.id === block.subj);
  const color = subj?.color || '#4A90D9';
  const dateStr = blockDateStr(block);
  const dl = daysUntil(dateStr);
  const urgColor = dl < 0 ? 'var(--text-muted)' : dl === 0 ? '#E74C3C' : dl <= 3 ? '#F1C40F' : color;
  const urgLabel = dl < 0 ? t('progress.past') : dl === 0 ? t('common.today') : dl === 1 ? t('common.tomorrow') : t('progress.daysLeft', { count: dl });

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderLeft: `3px solid ${color}`, borderRadius: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subj?.name || '?'}</span>
          {block.task && (
            <span style={{ fontSize: '.65rem', color: 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {block.task}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.64rem', color: 'var(--text-muted)' }}>
            {dayShort(formatDate, block.day || 0)} {formatDate(dateStr, { day: 'numeric', month: 'short' })} · {hm(block.hour || 0)}–{hm((block.hour || 0) + (block.dur || 1))}
          </span>
          <span style={{ fontSize: '.6rem', padding: '2px 7px', borderRadius: 8,
            background: `${urgColor}18`, color: urgColor, fontWeight: 700, border: `1px solid ${urgColor}30` }}>
            {urgLabel}
          </span>
        </div>
      </div>
      <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }} onClick={() => onToggle(block.id)}
        style={{ padding: '5px 10px', borderRadius: 8, border: 'none', flexShrink: 0,
          background: 'rgba(39,174,96,.15)', color: '#27AE60',
          fontSize: '.72rem', fontWeight: 700, cursor: 'pointer' }}>
        ✓
      </motion.button>
    </motion.div>
  );
}

// ── Agenda section (collapsible) ─────────────────────────────────────────────
function AgendaSection({ title, color, items, subjects, onToggle }) {
  const [open, setOpen] = useState(true);
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 8 }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', background: 'transparent',
          border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: open ? 8 : 0 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontSize: '.7rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '.07em' }}>{title}</span>
        <span style={{ fontSize: '.63rem', color: 'var(--text-muted)', background: 'var(--bg-card)',
          padding: '1px 7px', borderRadius: 10, border: '1px solid var(--border)' }}>{items.length}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: .2 }}
          style={{ fontSize: '.58rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>▼</motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: .2 }} style={{ overflow: 'hidden' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map(b => <AgendaItem key={b.id} block={b} subjects={subjects} onToggle={onToggle} />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Readiness section (derived preparation score per subject) ────────────────
// Blends chapter completion, self-rated confidence and spaced-review health
// (see src/data/readiness.js). Pure display — reads existing data, writes none.
function ReadinessSection({ subjects, srData }) {
  const { t } = useTranslation();
  // Captured once per mount via a lazy state initializer; readiness only uses
  // it to flag overdue reviews, so a stable timestamp is fine.
  const [now] = useState(() => Date.now());

  if (!subjects.length) {
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.2rem' }}>
        <div style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{t('readiness.title')}</div>
        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{t('readiness.noSubjects')}</div>
      </div>
    );
  }

  const rows = subjects
    .map(s => ({ s, r: subjectReadiness(s, srData, now) }))
    .sort((a, b) => a.r.score - b.r.score); // least-ready first — that's where to act

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 'clamp(.9rem,3vw,1.4rem)' }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t('readiness.title')}</div>
        <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{t('readiness.subtitle')}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(({ s, r }, i) => {
          const band = readinessBand(r.score);
          return (
            <motion.div key={s.id}
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
              style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color || 'var(--accent)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  <span style={{ fontSize: '.7rem', fontWeight: 700, color: band.color, flexShrink: 0 }}>
                    {r.score}% · {t(`readiness.${band.key}`)}
                  </span>
                </div>
                <div style={{ height: 5, background: 'var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${r.score}%` }} transition={{ duration: .7, ease: 'easeOut' }}
                    style={{ height: '100%', background: band.color, borderRadius: 8 }} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function PageProgress({ user, onTuto }) {
  const { t } = useTranslation();
  const tour = useGuidedTour('progress');
  const [subjects, setSubjects] = useState([]);
  const [blocks, setBlocks]     = useState([]);
  const [srData, setSrData]     = useState({}); // read-only, feeds the readiness score
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'data', 'main'), snap => {
      if (snap.exists()) {
        const d = snap.data();
        setSubjects(d.subjects || []);
        setBlocks(d.blocks || []);
        setSrData(d.srData || {});
      }
      setLoading(false);
    });
    return unsub;
  }, [user]);

  async function toggleBlock(id) {
    const updated = blocks.map(b => b.id === id ? { ...b, status: b.status === 'done' ? 'todo' : 'done' } : b);
    const updatedSubjects = subjects.map(s => ({
      ...s,
      doneBlocks: updated.filter(b => b.subj === s.id && b.type === 'rev' && b.status === 'done').length,
    }));
    setBlocks(updated); setSubjects(updatedSubjects);
    try { await updateDoc(doc(db, 'users', user.uid, 'data', 'main'), { blocks: updated, subjects: updatedSubjects }); }
    catch (e) { reportSaveError(e, 'Progress — save'); }
  }

  const totalBlocks = subjects.reduce((a, s) => a + (s.totalBlocks || 0), 0);
  const doneBlocks  = subjects.reduce((a, s) => a + (s.doneBlocks || 0), 0);
  const globalPct   = totalBlocks > 0 ? Math.round(doneBlocks / totalBlocks * 100) : 0;
  const globalColor = globalPct < 30 ? '#E74C3C' : globalPct < 70 ? '#F1C40F' : '#27AE60';
  const motivation  = getMotivation(globalPct);

  const agenda = blocks
    .filter(b => b.type === 'rev' && b.status === 'todo')
    .sort((a, b) => blockDateStr(a).localeCompare(blockDateStr(b)) || a.hour - b.hour);

  const weekBlocks = blocks.filter(b => b.type === 'rev' && daysUntil(blockDateStr(b)) <= 7 && daysUntil(blockDateStr(b)) >= 0);
  const weekDone   = weekBlocks.filter(b => b.status === 'done').length;
  const nextBlock  = agenda[0];
  const nextDl     = nextBlock ? daysUntil(blockDateStr(nextBlock)) : null;

  const agendaToday    = agenda.filter(b => daysUntil(blockDateStr(b)) === 0);
  const agendaTomorrow = agenda.filter(b => daysUntil(blockDateStr(b)) === 1);
  const agendaWeek     = agenda.filter(b => { const dl = daysUntil(blockDateStr(b)); return dl > 1 && dl <= 7; });
  const agendaLater    = agenda.filter(b => daysUntil(blockDateStr(b)) > 7);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
      <motion.div animate={{ opacity: [.3, 1, .3] }} transition={{ duration: 1.5, repeat: Infinity }}
        style={{ color: 'var(--text-muted)', fontSize: '.9rem' }}>{t('common.loading')}</motion.div>
    </div>
  );

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {onTuto && (
        <TourButton onClick={tour.start} label={t('common.guidedTour')} />
      )}

      {/* ── 1. Global score ── */}
      <div data-tour="tour-progress-score" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 'clamp(.9rem,3vw,1.4rem)',
        display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>

        {/* Ring */}
        <div style={{ position: 'relative', width: 76, height: 76, flexShrink: 0 }}>
          <svg width="76" height="76" viewBox="0 0 76 76" style={{ transform: 'rotate(-90deg)', position: 'absolute', inset: 0 }}>
            <circle cx="38" cy="38" r="30" fill="none" stroke="var(--border)" strokeWidth="6" />
            <motion.circle cx="38" cy="38" r="30" fill="none" stroke={globalColor} strokeWidth="6"
              strokeDasharray={2 * Math.PI * 30}
              initial={{ strokeDashoffset: 2 * Math.PI * 30 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 30 * (1 - globalPct / 100) }}
              transition={{ duration: 1, ease: 'easeOut' }} strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 5px ${globalColor})` }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '1.1rem', fontWeight: 900, color: globalColor, lineHeight: 1 }}>{globalPct}%</span>
            <span style={{ fontSize: '.42rem', color: 'var(--text-muted)' }}>{t('progress.completed')}</span>
          </div>
        </div>

        {/* Text + bar + stats */}
        <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: '1rem' }}>{motivation.emoji}</span>
            <span style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{t(motivation.key)}</span>
          </div>
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${globalPct}%` }} transition={{ duration: 1, ease: 'easeOut' }}
              style={{ height: '100%', background: globalColor, borderRadius: 8, boxShadow: `0 0 8px ${globalColor}50` }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
            {[
              { v: doneBlocks,               l: t('progress.statsDone'),      c: '#27AE60' },
              { v: totalBlocks - doneBlocks, l: t('progress.statsRemaining'), c: 'var(--text-muted)' },
              { v: `${weekDone}/${weekBlocks.length}`, l: t('progress.statsWeek'), c: 'var(--accent)' },
              { v: nextDl !== null ? (nextDl === 0 ? t('progress.todayShort') : t('progress.daysLeft', { count: nextDl })) : '—', l: t('progress.statsNext'), c: '#F1C40F' },
            ].map((s, i) => (
              <div key={i} style={{ padding: '6px 8px', borderRadius: 8, background: 'var(--bg-card-hover)', textAlign: 'center' }}>
                <div style={{ fontSize: '.88rem', fontWeight: 900, color: s.c, lineHeight: 1.2 }}>{s.v}</div>
                <div style={{ fontSize: '.52rem', color: 'var(--text-muted)', marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 1b. Readiness by subject (derived preparation score) ── */}
      <ReadinessSection subjects={subjects} srData={srData} />

      {/* ── 2. Week + distribution ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>

        <div data-tour="tour-progress-week" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1rem' }}>
          <h2 style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px',
            display: 'flex', alignItems: 'center', gap: 6 }}>
            📅 {t('progress.thisWeek')}
            <span style={{ fontSize: '.65rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: 'auto' }}>
              {weekDone}/{weekBlocks.length} {t('progress.blocks')}
            </span>
          </h2>
          <WeekCalendar blocks={blocks} subjects={subjects} />
        </div>

        <div data-tour="tour-progress-pie" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1rem' }}>
          <h2 style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
            🥧 {t('progress.distribution')}
          </h2>
          <PieChart subjects={subjects} blocks={blocks} />
        </div>
      </div>

      {/* ── 4. Agenda ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14, alignItems: 'start' }}>

        <div data-tour="tour-progress-agenda" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1rem' }}>
          <h2 style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px',
            display: 'flex', alignItems: 'center', gap: 6 }}>
            📋 {t('progress.todo')}
            {agenda.length > 0 && (
              <span style={{ fontSize: '.65rem', padding: '2px 8px', borderRadius: 10,
                background: 'rgba(231,76,60,.15)', color: '#E74C3C', fontWeight: 700, border: '1px solid rgba(231,76,60,.25)' }}>
                {agenda.length}
              </span>
            )}
          </h2>
          {agenda.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: 6 }}>🎉</div>
              <div style={{ fontSize: '.82rem' }}>{t('progress.allDone')}</div>
            </div>
          ) : (
            <div style={{ maxHeight: 420, overflowY: 'auto', scrollbarWidth: 'none' }}>
              <AgendaSection title={t('common.today')}      color="#E74C3C" items={agendaToday}    subjects={subjects} onToggle={toggleBlock} />
              <AgendaSection title={t('common.tomorrow')}   color="#F1C40F" items={agendaTomorrow} subjects={subjects} onToggle={toggleBlock} />
              <AgendaSection title={t('progress.thisWeek')} color="var(--accent)" items={agendaWeek} subjects={subjects} onToggle={toggleBlock} />
              <AgendaSection title={t('progress.later')}    color="var(--text-muted)" items={agendaLater} subjects={subjects} onToggle={toggleBlock} />
            </div>
          )}
        </div>
      </div>

      <GuidedTour active={tour.active} step={tour.step} steps={tour.steps}
        onNext={tour.next} onPrev={tour.prev} onStop={tour.stop} />
    </div>
  );
}