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
import { subjectCounts, bumpSubject, bumpChapter, askMode } from '../data/revTracker';
import { startOfWeek, weekDateStrings } from '../lib/weeklyRecap';
import { shortDayName } from '../lib/dayNames';
import { reportSaveError } from '../lib/notify';
import { Repeat, ChevronDown, Plus, Minus } from 'lucide-react';
import { PAGE_MAX_W } from '../components/ui/scale';

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Clock time from a fractional hour: 9 → "9h", 9.5 → "9h30".
 * Same shape as the planner's own formatter, so an agenda row and the block it
 * points at read alike.
 */
function hm(h) {
  const hh = Math.floor(h), mm = String(Math.round((h % 1) * 60)).padStart(2, '0');
  return mm === '00' ? `${hh}h` : `${hh}h${mm}`;
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

/** Hours elapsed in the current day, e.g. 14.5 at 14:30. */
function hoursIntoDay() {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

/** Localized short weekday name for a Monday-based index (0=Mon … 6=Sun). */
function dayShort(formatDate, i) {
  // Shared with the planner (lib/dayNames) so the same day is not spelled
  // "Lun" on one page and "lun." on the next.
  return shortDayName(formatDate, i);
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

// ── Revision counters: −/+ around a number ──────────────────────────────────
// Used twice: once per subject (md) and once per chapter (sm). The minus is
// disabled at zero rather than hidden, so the row never changes width.
function CounterStepper({ value, size = 'md', onBump, disabled }) {
  const { t } = useTranslation();
  const dim = size === 'sm' ? 20 : 26;
  const font = size === 'sm' ? '.7rem' : '.9rem';
  const width = size === 'sm' ? 18 : 24;

  const btn = (delta, label) => (
    <motion.button whileTap={{ scale: .85 }} onClick={() => onBump(delta)}
      disabled={disabled || (delta < 0 && value <= 0)}
      aria-label={label} title={label}
      style={{ width: dim, height: dim, flexShrink: 0, display: 'flex', alignItems: 'center',
        justifyContent: 'center', borderRadius: 7, background: 'var(--bg-card-hover)',
        border: '1px solid var(--border)', color: 'var(--text-secondary)',
        cursor: delta < 0 && value <= 0 ? 'default' : 'pointer',
        opacity: disabled || (delta < 0 && value <= 0) ? .35 : 1 }}>
      {delta < 0 ? <Minus size={size === 'sm' ? 10 : 13} strokeWidth={2.6} />
                 : <Plus size={size === 'sm' ? 10 : 13} strokeWidth={2.6} />}
    </motion.button>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      {btn(-1, t('revTracker.decrease'))}
      {/* The number stays on the theme ink: a pale subject colour (yellow,
          mint) disappears on a light theme. The dot carries the identity. */}
      <span title={t('revTracker.passes', { count: value })}
        style={{ minWidth: width, textAlign: 'center', fontSize: font, fontWeight: 800,
          color: value ? 'var(--text-primary)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
      {btn(1, t('revTracker.increase'))}
    </div>
  );
}

// ── Revision tracker (a manual tally, see src/data/revTracker.js) ────────────
// One counter per subject, one per chapter, all moved by hand. Nothing here is
// derived from the planner, the timer or the spaced-repetition schedule — the
// only assisted path is the opt-in prompt after a spaced review, whose setting
// (`main.revAskAfterReview`) is edited at the bottom of this section.
function RevTrackerSection({ subjects, revCounts, ask, onBumpSubject, onBumpChapter, onSetAsk }) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState(null);

  if (!subjects.length) {
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.2rem' }}>
        <div style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{t('revTracker.title')}</div>
        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{t('revTracker.noSubjects')}</div>
      </div>
    );
  }

  const chapterLabel = i => t('app.chapterDefault', { count: i + 1 });
  const rows = subjects.map(s => ({ s, c: subjectCounts(s, revCounts, chapterLabel) }));
  const askOptions = [
    { v: 'always', l: t('revTracker.askAlways') },
    { v: 'ask',    l: t('revTracker.askAsk') },
    { v: 'never',  l: t('revTracker.askNever') },
  ];

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 16, padding: 'clamp(.9rem,3vw,1.4rem)' }}>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text-primary)',
          display: 'flex', alignItems: 'center', gap: 6 }}>
          <Repeat size={15} strokeWidth={2} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          {t('revTracker.title')}
        </div>
        <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{t('revTracker.subtitle')}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map(({ s, c }, i) => {
          const open = openId === s.id;
          const color = s.color || 'var(--accent)';
          return (
            <motion.div key={s.id}
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>

              {/* Subject row: the label expands the chapters, the stepper stays
                  outside that button so the two never fight for the same tap. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                borderRadius: 10, background: open ? 'var(--bg-card-hover)' : 'transparent' }}>
                <button onClick={() => setOpenId(open ? null : s.id)} aria-expanded={open}
                  style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 9,
                    padding: 0, background: 'none', border: 'none', cursor: 'pointer',
                    textAlign: 'left', fontFamily: 'inherit' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    {c.chaptersTotal > 0 && (
                      <span style={{ display: 'block', fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 1 }}>
                        {t('revTracker.chapterTally', { count: c.chaptersTotal })}
                      </span>
                    )}
                  </span>
                  <ChevronDown size={14} strokeWidth={2} style={{ color: 'var(--text-muted)', flexShrink: 0,
                    transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }} />
                </button>
                <CounterStepper value={c.n} onBump={d => onBumpSubject(s.id, d)} />
              </div>

              {/* One small counter per chapter */}
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: .22, ease: 'easeOut' }}
                    style={{ overflow: 'hidden' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '4px 8px 10px 25px' }}>
                      {c.chapters.length === 0 ? (
                        <div style={{ fontSize: '.66rem', color: 'var(--text-muted)' }}>{t('revTracker.noChapters')}</div>
                      ) : c.chapters.map(ch => (
                        <div key={ch.index} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ flex: 1, minWidth: 0, fontSize: '.7rem', color: 'var(--text-secondary)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.name}</span>
                          <CounterStepper value={ch.count} size="sm"
                            onBump={d => onBumpChapter(s.id, ch.index, d)} />
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Footer: what the tracker is, and — deliberately quiet, on the same
          line — what a finished spaced review should do to these counters. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexWrap: 'wrap', marginTop: 10,
        fontSize: '.62rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
        <span>{t('revTracker.legend')}</span>
        <span aria-hidden="true" style={{ opacity: .45 }}>·</span>
        <label style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
          {t('revTracker.askLabel')}
          <select value={ask} onChange={e => onSetAsk(e.target.value)}
            style={{ background: 'transparent', border: 'none', borderBottom: '1px dotted var(--border-strong)',
              color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: '.62rem', fontWeight: 600,
              padding: '0 2px 1px', cursor: 'pointer' }}>
            {askOptions.map(o => (
              /* The option list is drawn by the OS, so it needs explicit
                 colours rather than the transparent select background. */
              <option key={o.v} value={o.v}
                style={{ background: 'var(--bg-modal)', color: 'var(--text-primary)' }}>{o.l}</option>
            ))}
          </select>
        </label>
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
  const [revCounts, setRevCounts] = useState({});   // manual revision counters
  const [ask, setAsk] = useState('ask');                // what a finished spaced review does
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'data', 'main'), snap => {
      if (snap.exists()) {
        const d = snap.data();
        setSubjects(d.subjects || []);
        setBlocks(d.blocks || []);
        setSrData(d.srData || {});
        setRevCounts(d.revCounts || {});
        setAsk(askMode(d.revAskAfterReview));
      }
      setLoading(false);
    });
    return unsub;
  }, [user]);

  // The manual counters. Optimistic, like toggleBlock below: the snapshot
  // confirms a moment later. A bump that would change nothing (going below
  // zero) returns null and is not written at all.
  async function saveCounts(next) {
    if (!next) return;
    setRevCounts(next);
    try { await updateDoc(doc(db, 'users', user.uid, 'data', 'main'), { revCounts: next }); }
    catch (e) { reportSaveError(e, 'Progress — revision counter'); }
  }

  const bumpSubjectCount = (subjectId, delta) => saveCounts(bumpSubject(revCounts, subjectId, delta));
  const bumpChapterCount = (subjectId, index, delta) => saveCounts(bumpChapter(revCounts, subjectId, index, delta));

  // Whether finishing a spaced review offers to add +1 to that chapter.
  async function saveAsk(mode) {
    setAsk(mode);
    try { await updateDoc(doc(db, 'users', user.uid, 'data', 'main'), { revAskAfterReview: mode }); }
    catch (e) { reportSaveError(e, 'Progress — review prompt setting'); }
  }

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

  // The calendar week, Monday 00:00 → Sunday 23:59 local, shared with the
  // Stats recap (lib/weeklyRecap) so both pages count the same blocks.
  const weekStrs   = new Set(weekDateStrings(startOfWeek()));
  const weekBlocks = blocks.filter(b => b.type === 'rev' && weekStrs.has(blockDateStr(b)));
  const weekDone   = weekBlocks.filter(b => b.status === 'done').length;

  // "Next block" is the next one in the FUTURE: the first still to do that has
  // not started yet. Anything earlier is late, not next, and a countdown built
  // from it was negative.
  const nowH = hoursIntoDay();
  const nextBlock = agenda.find(b => {
    const dl = daysUntil(blockDateStr(b));
    if (dl !== 0) return dl > 0;
    return (b.hour || 0) + (b.dur || 1) > nowH; // today and not over yet
  });
  // Clamped as a belt and braces: the label must never be able to show 'J-' + a
  // negative number again.
  const nextDl = nextBlock ? Math.max(0, daysUntil(blockDateStr(nextBlock))) : null;

  // Every bucket of the agenda, overdue INCLUDED: without it, blocks whose day
  // has passed belonged to no group, so the list rendered empty while its badge
  // still counted them.
  const agendaOverdue  = agenda.filter(b => daysUntil(blockDateStr(b)) < 0);
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
    <div style={{ maxWidth: PAGE_MAX_W, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
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

      {/* ── 1c. Revision tracker (how many times each subject was revised) ── */}
      <RevTrackerSection subjects={subjects} revCounts={revCounts} ask={ask}
        onBumpSubject={bumpSubjectCount} onBumpChapter={bumpChapterCount} onSetAsk={saveAsk} />

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
              <AgendaSection title={t('progress.overdue')}  color="var(--danger)" items={agendaOverdue} subjects={subjects} onToggle={toggleBlock} />
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