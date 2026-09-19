/**
 * WeeklyRecap — "your week at a glance" card (Stats page).
 * --------------------------------------------------------------------------
 * Focus time with the change against the previous week, a 7-day bar chart,
 * planning blocks done, streak, reviews due, overall chapter progress, the
 * most studied subjects and the exams coming up. Figures come from
 * lib/weeklyRecap.js (pure, from the main document).
 *
 * On Mondays it opens on LAST week (the new one is still empty); a toggle
 * switches between the two.
 *
 * Chart: a single series (minutes per day), so one hue — the theme accent —
 * and no legend; thin bars with 4 px rounded tops on a shared baseline, each
 * with a hover / focus / tap tooltip. Values stay in text colours.
 *
 * Props: { data }  — the users/{uid}/data/main document
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { CalendarCheck, Flame, RotateCcw, BookOpenCheck, TrendingUp, TrendingDown, Minus, GraduationCap } from 'lucide-react';
import { useTranslation } from '../i18n';
import { weeklyRecap, startOfWeek } from '../lib/weeklyRecap';
import { formatDuration } from '../lib/duration';

const DAY_MS = 86_400_000;
const CHART_H = 76;

function Tile({ icon: Icon, value, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, background: 'var(--bg-card-hover)' }}>
      <span style={{ width: 30, height: 30, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
        <Icon size={15} aria-hidden="true" />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: '.64rem', color: 'var(--text-muted)' }}>{label}</div>
      </div>
    </div>
  );
}

export default function WeeklyRecap({ data }) {
  const { t, lang, formatDate } = useTranslation();
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
  const progress = recap.chaptersTotal ? Math.round((recap.chaptersDone / recap.chaptersTotal) * 100) : 0;
  const dur = mins => formatDuration(mins / 60, lang);

  return (
    <section aria-labelledby="recap-title"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.3rem 1.4rem', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header + week toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 id="recap-title" style={{ margin: 0, fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('recap.title')}</h2>
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

      {/* Hero number + daily bars */}
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

      {/* Tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        <Tile icon={CalendarCheck} value={`${recap.blocksDone}/${recap.blocksPlanned}`} label={t('recap.blocksDone')} />
        <Tile icon={Flame} value={recap.streak} label={t('recap.streak', { count: recap.streak })} />
        <Tile icon={RotateCcw} value={recap.reviewsDue} label={t('recap.reviewsDue', { count: recap.reviewsDue })} />
        <Tile icon={BookOpenCheck} value={`${progress} %`} label={t('recap.chapters', { done: recap.chaptersDone, total: recap.chaptersTotal })} />
      </div>

      {/* Subjects + exams */}
      {(recap.topSubjects.length > 0 || recap.exams.length > 0) && (
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
      )}

      {recap.truncated && (
        <div style={{ fontSize: '.64rem', color: 'var(--text-muted)' }}>{t('recap.truncated')}</div>
      )}
    </section>
  );
}
