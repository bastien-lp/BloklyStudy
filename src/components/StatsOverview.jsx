/**
 * StatsOverview — the single opening card of the Stats page.
 * --------------------------------------------------------------------------
 * Merges what used to be three stacked sections (weekly recap, level & XP,
 * global summary) into ONE card, because they all answer the same question:
 * "where do I stand?". Reading them in one place also removes the
 * frames-inside-frames look of three boxes in a row.
 *
 * Reading order, from identity to detail:
 *   1. level ring, level name and the XP bar to the next level;
 *   2. the week: focus time, change against the previous week, 7-day chart;
 *   3. tiles — streak, today, totals, planning, reviews, chapters, subjects;
 *   4. overall completion bar, most studied subjects and exams coming up.
 *
 * Week figures come from lib/weeklyRecap.js (pure, from the main document);
 * level figures from data/levels.js. Nothing is written here.
 *
 * On Mondays the week toggle opens on LAST week (the new one is still empty).
 *
 * Props: { data }  — the users/{uid}/data/main document
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import {
  CalendarCheck, Flame, RotateCcw, BookOpenCheck, TrendingUp, TrendingDown, Minus,
  GraduationCap, Clock, Timer, Hourglass, Library, Zap, Lightbulb,
} from 'lucide-react';
import { useTranslation } from '../i18n';
import { weeklyRecap, startOfWeek } from '../lib/weeklyRecap';
import { formatDuration } from '../lib/duration';
import { XP_LEVELS } from '../data/levels';

const DAY_MS = 86_400_000;
const CHART_H = 76;
const RING = 84;          // level ring diameter
const RING_R = 34;        // its stroke radius

/** One figure of the tile row: icon, value, label, optional unit. */
function Tile({ icon: Icon, value, label, unit }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, background: 'var(--bg-card-hover)' }}>
      <span style={{ width: 30, height: 30, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
        <Icon size={15} aria-hidden="true" />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: '.64rem', color: 'var(--text-muted)', lineHeight: 1.25 }}>
          {unit ? `${label} · ${unit}` : label}
        </div>
      </div>
    </div>
  );
}

/** A hairline between two parts of the card — one line instead of a new box. */
const Divider = () => <div aria-hidden="true" style={{ height: 1, background: 'var(--border)' }} />;

export default function StatsOverview({ data }) {
  const { t, lang, formatDate, formatNumber } = useTranslation();
  // "Now" is frozen when the card mounts: renders stay pure and consistent.
  const [now] = useState(() => new Date());
  const thisWeekMs = startOfWeek(now).getTime();
  const [which, setWhich] = useState(now.getDay() === 1 ? 'last' : 'this');
  const [hover, setHover] = useState(null); // day index under the pointer / focus

  const weekStartMs = which === 'this' ? thisWeekMs : thisWeekMs - 7 * DAY_MS;
  const weekStart = new Date(weekStartMs);
  const recap = weeklyRecap(data, weekStart, now); // cheap: a few dozen entries

  const weekEnd = new Date(weekStartMs + 6 * DAY_MS);
  const range = `${formatDate(weekStart, { day: 'numeric', month: 'short' })} – ${formatDate(weekEnd, { day: 'numeric', month: 'short' })}`;
  const max = Math.max(60, ...recap.perDay);
  const todayIdx = which === 'this' ? Math.floor((now.getTime() - thisWeekMs) / DAY_MS) : -1;
  const delta = recap.focusMin - recap.prevFocusMin;
  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const dur = mins => formatDuration(mins / 60, lang);

  // ── Level & XP (same lookup as before: tolerates the 12 → 15 level gap) ──
  const { xp = 0, streak = 0, todaySess = 0, todayMins = 0, totalFocusHours = 0, subjects = [] } = data || {};
  const curDef = [...XP_LEVELS].reverse().find(l => xp >= l.xpNeeded) || XP_LEVELS[0];
  const nextDef = XP_LEVELS.find(l => l.xpNeeded > xp);
  const xpInLvl = nextDef ? xp - curDef.xpNeeded : xp;
  const xpNeeded = nextDef ? nextDef.xpNeeded - curDef.xpNeeded : 0;
  const xpPct = nextDef ? Math.round((xpInLvl / xpNeeded) * 100) : 100;

  // ── Overall completion (all subjects, all time) ──
  const totalBlocks = subjects.reduce((a, s) => a + (s.totalBlocks || 0), 0);
  const doneBlocks = subjects.reduce((a, s) => a + (s.doneBlocks || 0), 0);
  const donePct = totalBlocks > 0 ? Math.round((doneBlocks / totalBlocks) * 100) : 0;
  const chapterPct = recap.chaptersTotal ? Math.round((recap.chaptersDone / recap.chaptersTotal) * 100) : 0;

  const tiles = [
    { icon: Flame, value: streak, label: t('stats.streak'), unit: t('stats.unitDays') },
    { icon: Clock, value: todayMins, label: t('stats.focus'), unit: t('stats.unitMinToday') },
    { icon: Timer, value: todaySess, label: t('stats.sessions'), unit: t('stats.unitToday') },
    { icon: Hourglass, value: formatNumber(Math.round(totalFocusHours * 10) / 10), label: t('stats.total'), unit: t('stats.unitHours') },
    { icon: CalendarCheck, value: `${recap.blocksDone}/${recap.blocksPlanned}`, label: t('recap.blocksDone') },
    { icon: RotateCcw, value: recap.reviewsDue, label: t('recap.reviewsDue', { count: recap.reviewsDue }) },
    { icon: BookOpenCheck, value: `${recap.chaptersDone}/${recap.chaptersTotal}`, label: t('stats.chaptersDone') },
    { icon: Library, value: subjects.length, label: t('stats.subjects') },
  ];

  return (
    <section aria-labelledby="overview-title" data-tour="tour-stats-xp"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16,
        padding: '1.4rem 1.4rem 1.3rem', display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Header: title + week toggle ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 id="overview-title" style={{ margin: 0, fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            {t('stats.overviewTitle')}
          </h2>
          <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{range}</div>
        </div>
        <div role="group" aria-label={t('recap.title')} style={{ display: 'inline-flex', padding: 3, borderRadius: 99, background: 'var(--bg-card-hover)' }}>
          {[{ v: 'this', l: t('recap.thisWeek') }, { v: 'last', l: t('recap.lastWeek') }].map(o => (
            <button key={o.v} type="button" onClick={() => setWhich(o.v)} aria-pressed={which === o.v}
              style={{ padding: '5px 12px', borderRadius: 99, border: 'none', cursor: 'pointer', fontSize: '.7rem', fontWeight: 700,
                background: which === o.v ? 'var(--accent)' : 'transparent', color: which === o.v ? 'var(--on-accent, #fff)' : 'var(--text-muted)' }}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {/* ── Level & XP ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', width: RING, height: RING, flexShrink: 0 }}>
          <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} style={{ transform: 'rotate(-90deg)', position: 'absolute', inset: 0 }} aria-hidden="true">
            <circle cx={RING / 2} cy={RING / 2} r={RING_R} fill="none" stroke="var(--border)" strokeWidth="6" />
            <motion.circle cx={RING / 2} cy={RING / 2} r={RING_R} fill="none" stroke="var(--xp-color)" strokeWidth="6"
              strokeDasharray={2 * Math.PI * RING_R}
              animate={{ strokeDashoffset: 2 * Math.PI * RING_R * (1 - xpPct / 100) }}
              transition={{ duration: .8, ease: 'easeOut' }} strokeLinecap="round" />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--xp-color)', lineHeight: 1 }}>{curDef.level}</span>
            <span style={{ fontSize: '.46rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              {t('stats.levelShort')}
            </span>
          </div>
        </div>

        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: '1rem', fontWeight: 800, color: curDef.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {curDef.title}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, fontSize: '.8rem', fontWeight: 800, color: 'var(--xp-color)' }}>
              <Zap size={13} strokeWidth={2.6} fill="currentColor" aria-hidden="true" />
              {formatNumber(xp)} XP
            </span>
          </div>
          <div style={{ height: 8, background: 'var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 5 }}>
            <motion.div animate={{ width: `${xpPct}%` }} transition={{ duration: .8, ease: 'easeOut' }}
              style={{ height: '100%', background: 'linear-gradient(90deg,var(--xp-color),var(--success, #27AE60))', borderRadius: 10 }} />
          </div>
          <div style={{ fontSize: '.66rem', color: 'var(--text-muted)' }}>
            {nextDef
              ? t('stats.nextLevel', { cur: formatNumber(xpInLvl), need: formatNumber(xpNeeded), lvl: nextDef.level, label: nextDef.title })
              : t('stats.maxLevel')}
          </div>
        </div>
      </div>

      <Divider />

      {/* ── The week: hero number + daily bars ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 18, alignItems: 'end' }}>
        <div>
          <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginBottom: 2 }}>{t('recap.focusTime')}</div>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1 }}>{dur(recap.focusMin)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: '.72rem', color: 'var(--text-secondary)' }}>
            <DeltaIcon size={14} aria-hidden="true" color={delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--warning)' : 'var(--text-muted)'} />
            {delta === 0
              ? t('recap.sameAsBefore')
              : t(delta > 0 ? 'recap.moreThanBefore' : 'recap.lessThanBefore', { time: dur(Math.abs(delta)) })}
          </div>
          <div style={{ fontSize: '.66rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {t('recap.sessions', { count: recap.sessions })}
          </div>
        </div>

        <div role="group" aria-label={t('recap.chartLabel')}>
          <div style={{ position: 'relative', height: CHART_H, display: 'flex', alignItems: 'flex-end', gap: 2, borderBottom: '1px solid var(--border)' }}>
            {recap.perDay.map((mins, i) => {
              const day = new Date(weekStart.getTime() + i * DAY_MS);
              const label = `${formatDate(day, { weekday: 'long' })} : ${mins ? dur(mins) : t('recap.noFocus')}`;
              return (
                <button key={i} type="button" aria-label={label} title={label}
                  onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)} onBlur={() => setHover(null)} onClick={() => setHover(h => (h === i ? null : i))}
                  style={{ flex: 1, height: '100%', padding: '0 3px', border: 'none', background: 'transparent', cursor: 'default',
                    display: 'flex', alignItems: 'flex-end', position: 'relative' }}>
                  <motion.span initial={{ height: 0 }} animate={{ height: mins ? Math.max(4, (mins / max) * (CHART_H - 4)) : 2 }}
                    transition={{ duration: .5, delay: i * .04, ease: 'easeOut' }}
                    style={{ display: 'block', width: '100%', borderRadius: '4px 4px 0 0',
                      background: mins ? 'var(--accent)' : 'var(--border)',
                      opacity: hover === null || hover === i ? 1 : .45, transition: 'opacity .15s',
                      boxShadow: i === todayIdx ? '0 0 0 2px var(--bg-card), 0 0 0 3px var(--accent)' : 'none' }} />
                  {hover === i && (
                    <span role="tooltip" style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translate(-50%, -6px)',
                      padding: '4px 8px', borderRadius: 8, background: 'var(--bg-modal)', color: 'var(--text-primary)', fontSize: '.64rem',
                      fontWeight: 700, whiteSpace: 'nowrap', boxShadow: '0 6px 16px -6px rgba(0,0,0,.5)', pointerEvents: 'none', zIndex: 2 }}>
                      {label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
            {recap.perDay.map((_, i) => (
              <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: '.6rem', color: i === todayIdx ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: i === todayIdx ? 800 : 500 }}>
                {formatDate(new Date(weekStart.getTime() + i * DAY_MS), { weekday: 'narrow' })}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tiles ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
        {tiles.map((tile, i) => <Tile key={i} {...tile} />)}
      </div>

      {/* ── Overall completion ── */}
      {totalBlocks > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>{t('stats.overallProgress')}</span>
            <span style={{ fontSize: '.72rem', color: 'var(--text-secondary)' }}>
              {t('stats.blocksOf', { done: formatNumber(doneBlocks), total: formatNumber(totalBlocks) })} · {donePct} %
            </span>
          </div>
          <div style={{ height: 10, background: 'var(--bg-card-hover)', borderRadius: 10, overflow: 'hidden' }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${donePct}%` }} transition={{ duration: .7, ease: 'easeOut' }}
              style={{ height: '100%', borderRadius: 10, background: 'linear-gradient(90deg, var(--accent), var(--xp-color))' }} />
          </div>
          <div style={{ fontSize: '.64rem', color: 'var(--text-muted)', marginTop: 5 }}>
            {t('stats.chaptersDone')} : {recap.chaptersDone}/{recap.chaptersTotal} ({chapterPct} %)
          </div>
        </div>
      )}

      {/* ── Subjects + exams ── */}
      {(recap.topSubjects.length > 0 || recap.exams.length > 0) && (
        <>
          <Divider />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {recap.topSubjects.length > 0 && (
              <div>
                <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>{t('recap.topSubjects')}</div>
                {recap.topSubjects.map(s => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '.78rem', padding: '3px 0',
                    color: 'var(--text-secondary)' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{dur(s.mins)}</strong>
                  </div>
                ))}
              </div>
            )}
            {recap.exams.length > 0 && (
              <div>
                <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>{t('recap.examsSoon')}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {recap.exams.slice(0, 4).map(e => (
                    <span key={e.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 99,
                      background: 'var(--bg-card-hover)', fontSize: '.72rem', color: 'var(--text-secondary)' }}>
                      <GraduationCap size={13} aria-hidden="true" color={e.color || 'var(--accent)'} />
                      <strong style={{ color: 'var(--text-primary)' }}>{e.name}</strong>
                      {e.daysLeft === 0 ? t('recap.today') : t('recap.inDays', { count: e.daysLeft })}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Footnotes ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: '.68rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        <Lightbulb size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1, color: 'var(--accent)' }} />
        <span>
          {t('stats.xpHint')}
          {recap.truncated ? ` ${t('recap.truncated')}` : ''}
        </span>
      </div>
    </section>
  );
}
