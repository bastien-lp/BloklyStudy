/**
 * ShowcaseScreens — one faithful recreation of every Blokly Study page, for the
 * public landing page's <AppShowcase/> frame.
 *
 * These are not approximations: each screen mirrors the real page's markup and
 * styling (card radii, stat-tile sizes, ring strokes, button gradients), reads
 * its design tokens from `themes.js` through the CSS variables the frame sets,
 * and reuses the app's own i18n keys for every label. Only the sample *data*
 * (subject names, task titles, chat messages) is new, and it lives in the
 * `showcase` namespace.
 *
 * Everything is laid out at the fixed logical viewport the frame scales down as
 * one image, exactly like a screenshot — so real pixel values can be copied over
 * from the pages verbatim instead of being re-guessed at a smaller size.
 */

import { motion } from 'motion/react';
import { ACCOUNT, subjectsOf } from './showcaseData';
import { asset } from '../lib/assets';

/* ── Shared building blocks, copied from the pages' own styling ──────────── */

function Card({ children, style, pad = '1rem' }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 16, padding: pad, ...style }}>
      {children}
    </div>
  );
}

function H2({ children, style }) {
  return (
    <h2 style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text-primary)',
      margin: '0 0 14px', ...style }}>{children}</h2>
  );
}

/** Progress ring — same geometry the pages use (rotate -90, round cap, glow). */
function Ring({ pct, size, stroke, color, children, glow = true }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)', position: 'absolute', inset: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeLinecap="round"
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct / 100) }}
          transition={{ duration: 1, ease: 'easeOut' }}
          style={glow ? { filter: `drop-shadow(0 0 6px ${color})` } : undefined} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  );
}

/** Segmented control — the app's `bg-card` pill group. */
function Seg({ items, active, pad = '7px 16px', style }) {
  return (
    <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', padding: 4,
      borderRadius: 12, alignSelf: 'flex-start', ...style }}>
      {items.map((it, i) => (
        <span key={i} style={{ padding: pad, borderRadius: 9, fontSize: '.82rem', fontWeight: 700,
          background: i === active ? 'var(--accent-subtle)' : 'transparent',
          color: i === active ? 'var(--accent)' : 'var(--text-muted)' }}>
          {it}
        </span>
      ))}
    </div>
  );
}

/** Filter pill row — used by Todo, Synthèses, Répétition, Confiance. */
function Pills({ items, active }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {items.map((l, i) => (
        <span key={i} style={{ padding: '5px 12px', borderRadius: 20, fontSize: '.75rem',
          border: `1px solid ${i === active ? 'var(--accent)' : 'var(--border)'}`,
          background: i === active ? 'var(--accent-subtle)' : 'var(--bg-card)',
          color: i === active ? 'var(--accent)' : 'var(--text-muted)',
          fontWeight: i === active ? 600 : 400 }}>{l}</span>
      ))}
    </div>
  );
}

/** The 1.6rem / .62rem stat card from Todo. */
function StatCard({ v, l, c = 'var(--text-primary)', bg = 'var(--bg-card)', border = 'var(--border)', bar }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px 8px', background: bg,
      border: `1px solid ${border}`, borderRadius: 12 }}>
      <div style={{ fontSize: '1.6rem', fontWeight: 900, color: c, lineHeight: 1 }}>{v}</div>
      <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 3 }}>{l}</div>
      {bar != null && (
        <div style={{ marginTop: 6, height: 3, background: 'var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${bar}%`, background: c, borderRadius: 10 }} />
        </div>
      )}
    </div>
  );
}

/** Page shell: the `maxWidth … margin: 0 auto` wrapper every page opens with. */
function Page({ children, max = 960, gap = 20, style }) {
  return (
    <div style={{ maxWidth: max, margin: '0 auto', display: 'flex', flexDirection: 'column',
      gap, fontFamily: 'var(--font-family)', ...style }}>
      {children}
    </div>
  );
}

/* ── 1 · Planning ────────────────────────────────────────────────────────── */

const PX_H = 56;          // px per hour — the real grid constant
const PLAN_START = 8;
const PLAN_END = 17;
const PLAN_BLOCKS = [
  { day: 0, hour: 8.5, dur: 2, subj: 0 },
  { day: 0, hour: 13, dur: 2, subj: 1 },
  { day: 1, hour: 9, dur: 2, subj: 2 },
  { day: 1, hour: 14, dur: 3, subj: 3 },
  { day: 2, hour: 8, dur: 2, subj: 0, done: true },
  { day: 2, hour: 11, dur: 1.5, subj: 4 },
  { day: 2, hour: 14.5, dur: 2, subj: 2 },
  { day: 3, hour: 13.5, dur: 2.5, subj: 1 },
  { day: 4, hour: 9, dur: 3, subj: 2 },
  { day: 4, hour: 14, dur: 1.5, subj: 0 },
  { day: 5, hour: 10, dur: 3, subj: 3 },
  { day: 6, hour: 15, dur: 2, subj: 4 },
];
const PLAN_TODAY = 2;
const PLAN_NOW = 11.6;

function fmtH(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm ? `${hh}h${String(mm).padStart(2, '0')}` : `${hh}h`;
}

export function ScreenPlanning({ t }) {
  const subjects = subjectsOf(t);
  const days = t('showcase.days').split(',');
  const dates = t('showcase.dates').split(',');
  const totalH = PLAN_END - PLAN_START;

  return (
    <Page max="none" gap={12}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <div style={{ display: 'flex', background: 'var(--bg-card)', padding: 3, borderRadius: 10, border: '1px solid var(--border)' }}>
          {[t('planning.week'), t('planning.month')].map((l, i) => (
            <span key={l} style={{ padding: '6px 14px', borderRadius: 8, fontSize: '.78rem', fontWeight: 600,
              background: i === 0 ? 'rgba(74,144,217,.18)' : 'transparent',
              color: i === 0 ? '#93c5fd' : 'var(--text-secondary)',
              boxShadow: i === 0 ? 'inset 0 0 0 1px rgba(74,144,217,.35)' : 'none' }}>{l}</span>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={sqBtn}>←</span>
          <div style={{ padding: '5px 12px', borderRadius: 8, background: 'var(--bg-card)',
            border: '1px solid var(--border)', minWidth: 140, textAlign: 'center' }}>
            <span style={{ fontSize: '.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              {t('showcase.planWeekRange')}
            </span>
          </div>
          <span style={sqBtn}>→</span>
          <span style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(74,144,217,.5)',
            background: 'rgba(74,144,217,.15)', color: '#93c5fd', fontSize: '.72rem', fontWeight: 600 }}>📍</span>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {['↩', '↪', '📋', '🖨️', '⚙️'].map(g => <span key={g} style={{ ...sqBtn, fontSize: '.82rem' }}>{g}</span>)}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
            borderRadius: 20, border: '1px solid var(--accent)', color: 'var(--accent)',
            fontSize: '.7rem', fontWeight: 600, opacity: .8 }}>{t('planning.guidedTour')}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'start' }}>
        {/* Subject sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, width: 156,
          background: 'var(--bg-card)', border: '1px solid var(--border)', padding: 10, borderRadius: 12 }}>
          <div style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{t('planning.subjects')}</div>
          {subjects.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px',
              borderRadius: 9, background: `${s.color}22`, border: `1px solid ${s.color}60` }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: '.76rem', fontWeight: 600, color: 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{s.name}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px', borderRadius: 9,
            background: 'rgba(155,89,182,.2)', border: '1px dashed rgba(155,89,182,.55)' }}>
            <span style={{ fontSize: '.76rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              🎯 {t('planning.customBlock')}
            </span>
          </div>
          <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8,
            display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[['Ctrl+Z', t('planning.legUndo')], ['Ctrl+Y', t('planning.legRedo')],
              [t('planning.legDblClick'), t('planning.legDone')]].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <code style={{ fontSize: '.6rem', background: 'var(--bg-card-hover)', padding: '1px 5px',
                  borderRadius: 4, color: 'var(--text-secondary)' }}>{k}</code>
                <span style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Week grid */}
        <div style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border-strong)',
          borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '46px repeat(7,1fr)' }}>
            <div style={{ height: 46, borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--bg-nav)' }} />
            {days.map((d, i) => (
              <div key={i} style={{ height: 46, borderRight: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)', textAlign: 'center', padding: '6px 2px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: i === PLAN_TODAY ? 'var(--accent-subtle)' : 'var(--bg-nav)' }}>
                <div style={{ fontSize: '.74rem', fontWeight: i === PLAN_TODAY ? 800 : 600,
                  color: i === PLAN_TODAY ? 'var(--accent)' : 'var(--text-primary)' }}>{d}</div>
                <div style={{ fontSize: '.58rem', marginTop: 1,
                  color: i === PLAN_TODAY ? '#4A90D9' : 'rgba(255,255,255,.4)' }}>{dates[i]}</div>
              </div>
            ))}

            {/* Hour gutter */}
            <div style={{ position: 'relative', borderRight: '1px solid var(--border)', background: 'var(--bg-nav)' }}>
              {Array.from({ length: totalH }, (_, i) => (
                <div key={i} style={{ position: 'absolute', top: i * PX_H, right: 3, fontSize: '.58rem',
                  color: 'var(--text-muted)', lineHeight: 1, paddingTop: 2 }}>{PLAN_START + i}:00</div>
              ))}
              <div style={{ height: totalH * PX_H }} />
            </div>

            {/* Day columns */}
            {days.map((_, dayIdx) => (
              <div key={dayIdx} style={{ position: 'relative', height: totalH * PX_H,
                borderRight: '1px solid rgba(255,255,255,.07)',
                background: dayIdx === PLAN_TODAY ? 'rgba(74,144,217,.025)' : 'transparent' }}>
                {Array.from({ length: totalH }, (_, i) => (
                  <div key={i}>
                    <div style={{ position: 'absolute', top: i * PX_H, left: 0, right: 0,
                      borderTop: `1px solid ${i % 2 === 0 ? 'var(--border-strong)' : 'var(--border)'}` }} />
                    <div style={{ position: 'absolute', top: i * PX_H + PX_H / 2, left: 0, right: 0,
                      borderTop: '1px dashed var(--border)', opacity: .5 }} />
                  </div>
                ))}

                {PLAN_BLOCKS.filter(b => b.day === dayIdx).map((b, j) => {
                  const s = subjects[b.subj];
                  const h = b.dur * PX_H;
                  return (
                    <motion.div key={j}
                      initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: .1 + dayIdx * .04 + j * .05, duration: .3 }}
                      style={{ position: 'absolute', top: (b.hour - PLAN_START) * PX_H + 1, left: 2, right: 2,
                        height: h - 2, background: b.done ? `${s.color}28` : `${s.color}dd`, borderRadius: 8,
                        padding: '4px 7px', overflow: 'hidden',
                        border: `1px solid ${b.done ? `${s.color}50` : `${s.color}bb`}`,
                        boxShadow: b.done ? 'none' : `0 2px 8px ${s.color}30`, zIndex: 2 }}>
                      <div style={{ height: '100%', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                        <div style={{ fontSize: h > 40 ? '.82rem' : '.72rem', fontWeight: 800,
                          color: b.done ? `${s.color}80` : '#fff',
                          textDecoration: b.done ? 'line-through' : 'none', textAlign: 'center' }}>
                          {s.name}
                        </div>
                        {h > 42 && (
                          <div style={{ fontSize: '.6rem', fontWeight: 500,
                            color: b.done ? `${s.color}60` : 'rgba(255,255,255,.75)' }}>
                            {fmtH(b.hour)}–{fmtH(b.hour + b.dur)}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}

                {dayIdx === PLAN_TODAY && (
                  <div style={{ position: 'absolute', top: (PLAN_NOW - PLAN_START) * PX_H, left: 0, right: 0,
                    height: 2, background: '#E74C3C', zIndex: 20, boxShadow: '0 0 8px rgba(231,76,60,.5)' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#E74C3C',
                      position: 'absolute', left: -3, top: -2 }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Page>
  );
}

const sqBtn = {
  width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg-card)', color: 'var(--text-secondary)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '.85rem',
};

/* ── 2 · To-do ───────────────────────────────────────────────────────────── */

export function ScreenTodo({ t }) {
  const subjects = subjectsOf(t);
  const tasks = t('showcase.tasks').split('|').map((title, i) => ({ title, ...TASK_META[i] }));
  const prio = { high: { c: '#E74C3C', l: t('todo.prioHigh') }, medium: { c: '#F1C40F', l: t('todo.prioMedium') }, low: { c: '#27AE60', l: t('todo.prioLow') } };

  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-primary)', margin: 0, letterSpacing: '-.02em' }}>
            {t('todo.pageTitle')}
          </h1>
          <span style={{ padding: '3px 12px', borderRadius: 20, background: 'rgba(87,255,43,.12)',
            border: '1px solid rgba(87,255,43,.25)', fontSize: '.7rem', fontWeight: 700, color: '#57FF2B' }}>
            🔥 {t('todo.doneToday', { count: 4 })}
          </span>
        </div>
        <span style={{ padding: '9px 22px', borderRadius: 12, background: 'linear-gradient(135deg,#4A90D9,#6366f1)',
          color: '#fff', fontSize: '.85rem', fontWeight: 700, boxShadow: '0 4px 20px rgba(74,144,217,.35)' }}>
          + {t('todo.modalNew')}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        <StatCard v={7} l={t('todo.statTodo')} />
        <StatCard v={12} l={t('todo.statDone')} c="#52b788" bg="rgba(82,183,136,.08)" border="rgba(82,183,136,.2)" />
        <StatCard v={2} l={t('todo.statOverdue')} c="#ff4d6d" bg="rgba(255,77,109,.08)" border="rgba(255,77,109,.2)" />
        <StatCard v="63%" l={t('todo.statComplete')} c="#4A90D9" bg="rgba(74,144,217,.08)" border="rgba(74,144,217,.2)" bar={63} />
      </div>

      <Pills active={0} items={[t('todo.filterAll'), t('todo.statTodo'), t('todo.filterDone'),
        `🔴 ${t('todo.filterHigh')}`, `⚠️ ${t('todo.filterOverdue')}`]} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tasks.map((task, i) => {
          const s = subjects[task.subj];
          const p = prio[task.prio];
          return (
            <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: .08 + i * .06, duration: .3 }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
                borderLeft: `3px solid ${p.c}`, opacity: task.done ? .55 : 1 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                border: `2px solid ${task.done ? '#27AE60' : 'var(--border-strong)'}`,
                background: task.done ? '#27AE60' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: '.6rem' }}>{task.done ? '✓' : ''}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.86rem', fontWeight: 600, color: 'var(--text-primary)',
                  textDecoration: task.done ? 'line-through' : 'none' }}>{task.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.66rem', color: 'var(--text-muted)' }}>
                    <i style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
                    {s.name}
                  </span>
                  <span style={{ fontSize: '.66rem', color: task.late ? '#ff4d6d' : 'var(--text-muted)' }}>
                    {task.late ? `⚠️ ${t('todo.daysOverdue', { count: 2 })}` : t('todo.inDays', { count: task.due })}
                  </span>
                </div>
              </div>
              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '.64rem', fontWeight: 700,
                background: `${p.c}18`, border: `1px solid ${p.c}40`, color: p.c }}>{p.l}</span>
            </motion.div>
          );
        })}
      </div>
    </Page>
  );
}

const TASK_META = [
  { subj: 0, prio: 'high', due: 1, done: false },
  { subj: 3, prio: 'high', due: 0, done: false, late: true },
  { subj: 2, prio: 'medium', due: 3, done: false },
  { subj: 1, prio: 'low', due: 5, done: false },
  { subj: 4, prio: 'medium', due: 2, done: true },
];

/* ── 3 · Progression ─────────────────────────────────────────────────────── */

export function ScreenProgress({ t }) {
  const subjects = subjectsOf(t);
  const pcts = [78, 55, 92, 41, 66];
  const globalPct = 68;
  const color = '#F1C40F';

  return (
    <Page gap={14}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
          borderRadius: 20, border: '1px solid var(--accent)', color: 'var(--accent)',
          fontSize: '.7rem', fontWeight: 600, opacity: .8 }}>{t('progress.guidedTour')}</span>
      </div>

      <Card pad="1.4rem" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <Ring pct={globalPct} size={76} stroke={6} color={color}>
          <span style={{ fontSize: '1.1rem', fontWeight: 900, color, lineHeight: 1 }}>{globalPct}%</span>
          <span style={{ fontSize: '.42rem', color: 'var(--text-muted)' }}>{t('progress.completed')}</span>
        </Ring>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: '1rem' }}>💪</span>
            <span style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{t('progress.motiv3')}</span>
          </div>
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${globalPct}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              style={{ height: '100%', background: color, borderRadius: 8, boxShadow: `0 0 8px ${color}50` }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
            {[{ v: 34, l: t('progress.statsDone'), c: '#27AE60' },
              { v: 16, l: t('progress.statsRemaining'), c: 'var(--text-muted)' },
              { v: '9/12', l: t('progress.statsWeek'), c: 'var(--accent)' },
              { v: t('progress.daysLeft', { count: 4 }), l: t('progress.statsNext'), c: '#F1C40F' }].map((s, i) => (
              <div key={i} style={{ padding: '6px 8px', borderRadius: 8, background: 'var(--bg-card-hover)', textAlign: 'center' }}>
                <div style={{ fontSize: '.88rem', fontWeight: 900, color: s.c, lineHeight: 1.2 }}>{s.v}</div>
                <div style={{ fontSize: '.52rem', color: 'var(--text-muted)', marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Card>
          <H2 style={{ fontSize: '.82rem', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
            📅 {t('progress.thisWeek')}
            <span style={{ fontSize: '.65rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: 'auto' }}>
              9/12 {t('progress.blocks')}
            </span>
          </H2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6 }}>
            {t('showcase.days').split(',').map((d, i) => {
              const load = [2, 3, 4, 2, 3, 1, 0][i];
              return (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '.58rem', color: 'var(--text-muted)', marginBottom: 4 }}>{d}</div>
                  <div style={{ height: 54, background: 'var(--bg-card-hover)', borderRadius: 6,
                    display: 'flex', flexDirection: 'column-reverse', overflow: 'hidden' }}>
                    <motion.div initial={{ height: 0 }} animate={{ height: `${(load / 4) * 100}%` }}
                      transition={{ delay: .2 + i * .05, duration: .5 }}
                      style={{ background: load > 3 ? '#E74C3C' : load > 2 ? '#F1C40F' : '#27AE60', borderRadius: 6 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card>
          <H2 style={{ fontSize: '.82rem', margin: '0 0 12px' }}>🥧 {t('progress.distribution')}</H2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 76, height: 76, borderRadius: '50%', flexShrink: 0,
              background: 'conic-gradient(#4A90D9 0 32%, #9B59B6 32% 54%, #27AE60 54% 76%, #E74C3C 76% 90%, #F1C40F 90% 100%)',
              WebkitMask: 'radial-gradient(circle, transparent 46%, #000 47%)',
              mask: 'radial-gradient(circle, transparent 46%, #000 47%)' }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {subjects.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: 'inline-block' }} />
                  <span style={{ fontSize: '.66rem', color: 'var(--text-secondary)', flex: 1 }}>{s.name}</span>
                  <span style={{ fontSize: '.66rem', color: 'var(--text-muted)' }}>{[32, 22, 22, 14, 10][i]}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <H2 style={{ fontSize: '.82rem', margin: '0 0 12px' }}>📚 {t('progress.bySubject')}</H2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {subjects.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 110, fontSize: '.72rem', color: 'var(--text-secondary)' }}>{s.name}</span>
              <div style={{ flex: 1, height: 7, background: 'var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${pcts[i]}%` }}
                  transition={{ delay: .2 + i * .07, duration: .7, ease: 'easeOut' }}
                  style={{ height: '100%', background: s.color, borderRadius: 10, boxShadow: `0 0 8px ${s.color}50` }} />
              </div>
              <span style={{ width: 36, textAlign: 'right', fontSize: '.72rem', fontWeight: 700, color: s.color }}>{pcts[i]}%</span>
            </div>
          ))}
        </div>
      </Card>
    </Page>
  );
}

/* ── 4 · Confiance ───────────────────────────────────────────────────────── */

export function ScreenConfidence({ t }) {
  const subjects = subjectsOf(t);
  const stars = [4, 2, 5, 1, 3];
  const chapCounts = [9, 6, 7, 5, 6];
  const globalAvg = 3.0;
  const color = '#F1C40F';

  return (
    <Page max={980} gap={16}>
      <Card pad="12px 14px" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: '2.8rem', fontWeight: 900, color, lineHeight: 1, textShadow: `0 0 20px ${color}50` }}>
            {globalAvg.toFixed(1)}
          </div>
          <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 2 }}>/5 {t('confidence.global')}</div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t('confidence.globalConfidence')}</span>
            <span style={{ fontSize: '.75rem', color, fontWeight: 600 }}>{t('confidence.statusMid')}</span>
          </div>
          <div style={{ height: 7, background: 'var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${(globalAvg / 5) * 100}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              style={{ height: '100%', background: color, borderRadius: 8, boxShadow: `0 0 8px ${color}60` }} />
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            {[{ v: 2, l: t('confidence.masteredSubjects'), c: '#27AE60' },
              { v: 2, l: t('confidence.toWork'), c: '#E74C3C' },
              { v: 5, l: t('confidence.subjects'), c: 'var(--text-muted)' }].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 900, color: s.c }}>{s.v}</span>
                <span style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>{s.l}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Pills active={0} items={[t('confidence.filterAll'), t('confidence.mastered'),
        t('confidence.inProgress'), t('confidence.weakPlural')]} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {subjects.map((s, i) => (
          <motion.div key={s.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: .08 + i * .06, duration: .3 }}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
              padding: '12px 14px', borderLeft: `3px solid ${s.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: '.86rem', fontWeight: 700, color: 'var(--text-primary)' }}>{s.name}</span>
              <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>
                {t('showcase.confChapters', { count: chapCounts[i] })}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 3 }}>
                {[1, 2, 3, 4, 5].map(n => (
                  <span key={n} style={{ fontSize: '1rem',
                    filter: n <= stars[i] ? 'none' : 'grayscale(1) opacity(.25)' }}>⭐</span>
                ))}
              </div>
              <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${(stars[i] / 5) * 100}%` }}
                  transition={{ delay: .25 + i * .06, duration: .6 }}
                  style={{ height: '100%', background: s.color, borderRadius: 10 }} />
              </div>
              <span style={{ fontSize: '.72rem', fontWeight: 800, color: s.color }}>{stars[i]}/5</span>
            </div>
          </motion.div>
        ))}
      </div>
    </Page>
  );
}

/* ── 5 · Synthèses ───────────────────────────────────────────────────────── */

export function ScreenSyntheses({ t }) {
  const subjects = subjectsOf(t);
  const globalPct = 62;
  const chapters = t('showcase.chapters').split('|');
  const statuses = ['done', 'done', 'wip', 'todo', 'wip', 'todo', 'done', 'wip', 'todo'];
  const cfg = {
    done: { c: '#27AE60', l: `✅ ${t('syntheses.donePlural')}` },
    wip: { c: '#F1C40F', l: `📝 ${t('syntheses.statusWip')}` },
    todo: { c: 'rgba(255,255,255,.3)', l: `⭕ ${t('syntheses.statusTodo')}` },
  };

  return (
    <Page max={860} gap={16}>
      <Card pad="1.2rem" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'center' }}>
        <Ring pct={globalPct} size={80} stroke={7} color="#27AE60">
          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#27AE60', lineHeight: 1 }}>{globalPct}%</span>
          <span style={{ fontSize: '.45rem', color: 'var(--text-muted)' }}>{t('syntheses.global')}</span>
        </Ring>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${globalPct}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              style={{ height: '100%', background: 'linear-gradient(90deg,#27AE60,#1abc9c)', borderRadius: 10,
                boxShadow: '0 0 8px rgba(39,174,96,.5)' }} />
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            {[{ v: 29, l: t('syntheses.total'), c: 'rgba(255,255,255,.5)' },
              { v: 18, l: `✅ ${t('syntheses.donePlural')}`, c: '#27AE60' },
              { v: 6, l: `📝 ${t('syntheses.statusWip')}`, c: '#F1C40F' },
              { v: 5, l: `⭕ ${t('syntheses.statusTodo')}`, c: 'rgba(255,255,255,.3)' }].map((s, i) => (
              <div key={i}>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: s.c, lineHeight: 1 }}>{s.v}</div>
                <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Pills active={0} items={[t('syntheses.filterAll'), `⭕ ${t('syntheses.statusTodo')}`,
        `📝 ${t('syntheses.statusWip')}`, `✅ ${t('syntheses.donePlural')}`]} />

      <Card pad="10px">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 10px' }}>
          <i style={{ width: 9, height: 9, borderRadius: '50%', background: subjects[0].color, display: 'inline-block' }} />
          <span style={{ fontSize: '.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>{subjects[0].name}</span>
          <span style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>· 9 {t('syntheses.chapAbbr')}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {chapters.map((name, i) => (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ delay: .1 + i * .05 }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                background: 'var(--bg-card-hover)', borderRadius: 10 }}>
              <span style={{ fontSize: '.78rem', color: 'var(--text-primary)', fontWeight: 600, flex: 1 }}>{name}</span>
              {i < 3 && <span style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>📝 {t('syntheses.note')}</span>}
              <span style={{ fontSize: '.68rem', fontWeight: 700, color: cfg[statuses[i]].c }}>{cfg[statuses[i]].l}</span>
            </motion.div>
          ))}
        </div>
      </Card>
    </Page>
  );
}

/* ── 6 · Flashcards ──────────────────────────────────────────────────────── */

export function ScreenFlashcards({ t }) {
  const subjects = subjectsOf(t);
  const chapters = t('showcase.chapters').split('|');
  const counts = [24, 18, 31, 12, 0, 9, 16, 21, 7];
  const masteredPct = [88, 61, 74, 33, 0, 45, 69, 52, 80];
  const col = subjects[0].color;

  return (
    <Page gap={14}>
      <h1 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
        🃏 {t('flashcards.title')}
      </h1>
      <Seg active={0} items={[`📚 ${t('flashcards.myCards')}`, `🌍 ${t('flashcards.community')}`]} />

      <div style={{ display: 'flex', gap: 6 }}>
        {subjects.map((s, i) => (
          <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 14px',
            borderRadius: 20, border: `1px solid ${i === 0 ? s.color : 'rgba(255,255,255,.08)'}`,
            background: i === 0 ? `${s.color}18` : 'var(--bg-card)',
            color: i === 0 ? s.color : 'var(--text-muted)',
            fontSize: '.8rem', fontWeight: i === 0 ? 700 : 400 }}>
            <i style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
            {s.name}
          </span>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
        {chapters.map((name, i) => {
          const n = counts[i];
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: .08 + i * .05, duration: .3 }}
              style={{ padding: 14, borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 8,
                border: `1px solid ${n ? `${col}40` : 'var(--border)'}`,
                background: n ? `${col}0e` : 'var(--bg-card)', opacity: n ? 1 : .7, minHeight: 96 }}>
              <div style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
              <div style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>
                {n ? t('flashcards.deckCount', { count: n }) : `+ ${t('flashcards.addCards')}`}
              </div>
              {n > 0 && (
                <>
                  <div style={{ height: 5, borderRadius: 8, background: 'var(--border)', overflow: 'hidden', display: 'flex' }}>
                    <div style={{ width: `${masteredPct[i]}%`, background: '#27AE60' }} />
                    <div style={{ width: `${Math.round((100 - masteredPct[i]) / 3)}%`, background: '#E74C3C' }} />
                  </div>
                  <div style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>
                    {masteredPct[i]}% {t('flashcards.mastered').toLowerCase()}
                  </div>
                </>
              )}
            </motion.div>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 12,
        background: 'rgba(39,174,96,.08)', border: '1px solid rgba(39,174,96,.2)' }}>
        <span style={{ fontSize: '.82rem', fontWeight: 700, color: '#27AE60', display: 'flex', alignItems: 'center', gap: 6 }}>
          🎴 {t('flashcards.review')}
        </span>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <span style={{ padding: '7px 14px', borderRadius: 9, background: '#27AE60', color: '#fff',
            fontSize: '.78rem', fontWeight: 700 }}>{t('flashcards.allCards')} (138)</span>
          <span style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid #E67E22',
            background: 'rgba(230,126,34,.12)', color: '#E67E22', fontSize: '.78rem', fontWeight: 700 }}>
            {t('flashcards.toReview')} (17)
          </span>
        </div>
      </div>
    </Page>
  );
}

/* ── 7 · Révisions espacées ──────────────────────────────────────────────── */

export function ScreenRepetition({ t }) {
  const subjects = subjectsOf(t);
  const chapters = t('showcase.chapters').split('|');
  const rows = [
    { subj: 0, ch: 0, days: 0 }, { subj: 2, ch: 1, days: 0 },
    { subj: 1, ch: 2, days: 3 }, { subj: 3, ch: 0, days: 6 },
    { subj: 4, ch: 3, days: 14 }, { subj: 0, ch: 4, days: 21 },
  ];

  return (
    <Page max={800} gap={16}>
      <Card pad="1rem 1.2rem" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'center', borderRadius: 14 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--accent)' }}>57%</div>
          <div style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>{t('repetition.mastered')}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '.8rem', color: 'var(--text-secondary)' }}>{t('repetition.globalProgress')}</span>
            <span style={{ fontSize: '.75rem', color: '#4A90D9', fontWeight: 700 }}>17/30</span>
          </div>
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <motion.div initial={{ width: 0 }} animate={{ width: '57%' }} transition={{ duration: .8, ease: 'easeOut' }}
              style={{ height: '100%', background: 'linear-gradient(90deg,#4A90D9,#6366f1)', borderRadius: 10 }} />
          </div>
          <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('repetition.hintReview')}{' '}
            <strong style={{ color: '#4A90D9' }}>{t('repetition.dayPlus', { count: 1 })}</strong>,{' '}
            <strong style={{ color: '#4A90D9' }}>{t('repetition.dayPlus', { count: 7 })}</strong> {t('repetition.hintAnd')}{' '}
            <strong style={{ color: '#4A90D9' }}>{t('repetition.dayPlus', { count: 30 })}</strong>
          </div>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {[{ v: 2, l: t('repetition.statDue'), c: '#E74C3C', bg: 'rgba(231,76,60,.08)' },
          { v: 2, l: t('repetition.stat7days'), c: '#F1C40F', bg: 'rgba(241,196,15,.08)' },
          { v: 2, l: t('repetition.statLater'), c: '#27AE60', bg: 'rgba(39,174,96,.08)' }].map((s, i) => (
          <div key={i} style={{ textAlign: 'center', padding: '12px 8px', background: s.bg,
            border: `1px solid ${s.c}33`, borderRadius: 12 }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: s.c, lineHeight: 1 }}>{s.v}</div>
            <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 3 }}>{s.l}</div>
          </div>
        ))}
      </div>

      <Pills active={0} items={[t('repetition.filterAll', { count: 6 }),
        `🔴 ${t('repetition.filterDue', { count: 2 })}`, `🟡 ${t('repetition.filterSoon', { count: 4 })}`]} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((r, i) => {
          const s = subjects[r.subj];
          const due = r.days === 0;
          const c = due ? '#E74C3C' : r.days <= 7 ? '#F1C40F' : '#27AE60';
          return (
            <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: .08 + i * .05, duration: .3 }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                background: 'var(--bg-card)', border: `1px solid ${due ? 'rgba(231,76,60,.25)' : 'var(--border)'}`,
                borderRadius: 12 }}>
              <i style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{chapters[r.ch]}</div>
                <div style={{ fontSize: '.64rem', color: 'var(--text-muted)' }}>{s.name}</div>
              </div>
              <span style={{ fontSize: '.7rem', fontWeight: 700, color: c }}>
                {due ? t('repetition.today') : t('repetition.daysLeft', { count: r.days })}
              </span>
              {due && (
                <span style={{ padding: '5px 12px', borderRadius: 9, background: 'var(--accent)',
                  color: '#fff', fontSize: '.72rem', fontWeight: 700 }}>{t('repetition.validate')}</span>
              )}
            </motion.div>
          );
        })}
      </div>
    </Page>
  );
}

/* ── 8 · Examens ─────────────────────────────────────────────────────────── */

export function ScreenExams({ t }) {
  const subjects = subjectsOf(t);
  const exams = [
    { subj: 0, days: 4, ects: 5, prog: 78, date: '16/10/2026' },
    { subj: 3, days: 9, ects: 4, prog: 41, date: '21/10/2026' },
    { subj: 2, days: 16, ects: 6, prog: 92, date: '28/10/2026' },
    { subj: 1, days: 23, ects: 3, prog: 55, date: '04/11/2026' },
  ];
  const avg = 13.94;

  return (
    <Page gap={20}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {[t('exams.filterAll'), t('exams.filterUpcoming'), t('exams.filterPast')].map((l, i) => (
            <span key={l} style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border)',
              fontSize: '.72rem', background: i === 0 ? 'var(--bg-card-hover)' : 'transparent',
              color: i === 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{l}</span>
          ))}
        </div>
        <div style={{ height: 20, width: 1, background: 'var(--border)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{t('exams.sortBy')}</span>
          {[t('exams.sortDate'), t('exams.sortGrade')].map((l, i) => (
            <span key={l} style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border)',
              fontSize: '.72rem', background: i === 0 ? 'var(--bg-card-hover)' : 'transparent',
              color: i === 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{l}</span>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{t('exams.simulated')}</span>
          <span style={{ width: 34, height: 18, borderRadius: 10, background: 'var(--accent-subtle)',
            border: '1px solid var(--accent-glow)', display: 'inline-flex', alignItems: 'center', padding: 2 }}>
            <i style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--accent)', display: 'block' }} />
          </span>
        </div>
      </div>

      {/* Summary bar — three cells split by hairlines, like the page */}
      <div style={{ display: 'flex', background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ flex: 1, padding: '1.1rem', borderRight: '1px solid var(--border)', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: '#27AE60', lineHeight: 1 }}>{avg.toFixed(2)}</div>
          <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 3 }}>
            {t('exams.average')} {t('exams.simulated')} /20
          </div>
        </div>
        <div style={{ flex: 1, padding: '1.1rem', borderRight: '1px solid var(--border)', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: '#4A90D9', lineHeight: 1 }}>
            18<span style={{ fontSize: '1rem', color: 'rgba(255,255,255,.25)' }}>/24</span>
          </div>
          <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 3 }}>{t('exams.ectsEarned')}</div>
        </div>
        <div style={{ flex: 1, padding: '1.1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#27AE60' }}>{t('exams.targetReached')}</div>
          <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 3 }}>
            {t('exams.vsTarget', { target: 12 })}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ fontSize: '.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          📆 {t('exams.examsTitle')}
        </h2>
        <div style={{ height: 1, flex: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>{t('exams.dateCount', { count: 4 })}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12 }}>
        {exams.map((e, i) => {
          const s = subjects[e.subj];
          const dc = e.days <= 5 ? '#E74C3C' : e.days <= 10 ? '#F1C40F' : '#27AE60';
          const r = 24, circ = 2 * Math.PI * r;
          return (
            <motion.div key={i} initial={{ opacity: 0, scale: .92 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * .06, duration: .3 }}
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
                padding: '1rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: -20, right: -20, width: 70, height: 70, borderRadius: '50%',
                background: s.color, opacity: .08, filter: 'blur(18px)' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, boxShadow: `0 0 6px ${s.color}` }} />
                  <span style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{s.name}</span>
                </div>
                <span style={{ fontSize: '.58rem', padding: '1px 6px', borderRadius: 8,
                  background: 'rgba(74,144,217,.2)', color: '#93c5fd' }}>{e.ects} ECTS</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
                  <svg width="56" height="56" viewBox="0 0 56 56">
                    <circle cx="28" cy="28" r={r} fill="none" stroke="var(--border)" strokeWidth="4" />
                    <motion.circle cx="28" cy="28" r={r} fill="none" stroke={dc} strokeWidth="4"
                      strokeDasharray={circ} strokeLinecap="round"
                      initial={{ strokeDashoffset: circ }}
                      animate={{ strokeDashoffset: circ * Math.min(e.days / 30, 1) }}
                      transition={{ duration: 1, delay: i * .06 + .3, ease: 'easeOut' }}
                      style={{ transformOrigin: '28px 28px', transform: 'rotate(-90deg)' }} />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '.82rem', fontWeight: 800, color: dc, lineHeight: 1 }}>{e.days}</span>
                    <span style={{ fontSize: '.44rem', color: 'var(--text-muted)' }}>{t('exams.days')}</span>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', marginBottom: 5 }}>📅 {e.date}</div>
                  <div style={{ height: 4, background: 'var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 2 }}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${e.prog}%` }}
                      transition={{ duration: .8, delay: i * .06 + .5 }}
                      style={{ height: '100%', background: s.color, borderRadius: 10 }} />
                  </div>
                  <div style={{ fontSize: '.58rem', color: 'var(--text-muted)' }}>{e.prog}% {t('exams.ofBlocks')}</div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </Page>
  );
}

/* ── 9 · Stats ───────────────────────────────────────────────────────────── */

export function ScreenStats({ t, formatNumber }) {
  const pct = Math.round((ACCOUNT.xpIn / ACCOUNT.xpNeed) * 100);
  const badges = ['🎯', '📚', '🔥', '⚡', '🏆', '💎', '🌙', '🧠', '🎓', '🪴', '🥇', '🚀'];

  return (
    <Page gap={20}>
      <Card pad="1.5rem">
        <H2 style={{ margin: '0 0 16px' }}>🎮 {t('stats.levelTitle')}</H2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
          <Ring pct={pct} size={72} stroke={6} color="var(--xp-color)">
            <span style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--xp-color)', lineHeight: 1 }}>{ACCOUNT.level}</span>
            <span style={{ fontSize: '.42rem', color: 'rgba(87,255,43,.5)', textTransform: 'uppercase', letterSpacing: '.05em' }}>LVL</span>
          </Ring>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: '.88rem', fontWeight: 700, color: ACCOUNT.color }}>{ACCOUNT.title}</span>
              <span style={{ fontSize: '.78rem', color: 'var(--xp-color)', fontWeight: 700 }}>⚡ {formatNumber(ACCOUNT.xp)} XP</span>
            </div>
            <div style={{ height: 8, background: 'var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 4 }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: .8, ease: 'easeOut' }}
                style={{ height: '100%', background: 'linear-gradient(90deg,var(--xp-color),#27AE60)', borderRadius: 10,
                  boxShadow: '0 0 10px rgba(87,255,43,.4)' }} />
            </div>
            <div style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>
              {t('stats.nextLevel', { cur: formatNumber(ACCOUNT.xpIn), need: formatNumber(ACCOUNT.xpNeed), lvl: ACCOUNT.level + 1, label: ACCOUNT.nextTitle })}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
          {[{ v: 14, l: `🔥 ${t('stats.streak')}`, u: t('stats.unitDays'), c: '#F1C40F' },
            { v: 3, l: `⏱ ${t('stats.sessions')}`, u: t('stats.unitToday'), c: '#4A90D9' },
            { v: 135, l: `⏰ ${t('stats.focus')}`, u: t('stats.unitMinToday'), c: 'var(--xp-color)' },
            { v: 68.4, l: `📊 ${t('stats.total')}`, u: t('stats.unitHours'), c: '#9B59B6' }].map((s, i) => (
            <div key={i} style={{ textAlign: 'center', padding: 10, background: 'var(--bg-card-hover)',
              border: `1px solid ${s.c}22`, borderRadius: 12 }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: s.c }}>{s.v}</div>
              <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', marginTop: 2 }}>{s.l}</div>
              <div style={{ fontSize: '.55rem', color: 'var(--text-muted)' }}>{s.u}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 12px', background: 'var(--accent-subtle)', borderRadius: 8,
          fontSize: '.75rem', color: 'var(--accent)' }}>💡 {t('stats.xpHint')}</div>
      </Card>

      {/* The page stacks these three; side by side keeps them all in frame. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.8fr', gap: 20 }}>
        <Card pad="1.3rem">
          <H2>📊 {t('stats.recapTitle')}</H2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
            {[{ v: '34/50', l: t('stats.blocksDone'), c: '#4A90D9' },
              { v: '68%', l: t('stats.completion'), c: '#27AE60' },
              { v: '18/29', l: t('stats.chaptersDone'), c: '#9B59B6' },
              { v: 5, l: t('stats.subjects'), c: '#F1C40F' }].map((s, i) => (
              <div key={i} style={{ textAlign: 'center', padding: 12, background: 'var(--bg-card-hover)',
                border: `1px solid ${s.c}22`, borderRadius: 12 }}>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: s.c }}>{s.v}</div>
                <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card pad="1.3rem">
          <H2 style={{ margin: '0 0 6px' }}>🏆 {t('stats.badgesTitle')}</H2>
          <p style={{ fontSize: '.72rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>{t('stats.badgeHint')}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 7 }}>
            {badges.map((b, i) => (
              <motion.div key={i} initial={{ opacity: 0, scale: .8 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: .15 + i * .035, duration: .25 }}
                style={{ aspectRatio: '1', borderRadius: 12, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontSize: '1.05rem',
                  background: i < 7 ? 'var(--bg-card-hover)' : 'rgba(255,255,255,.02)',
                  border: `1px solid ${i < 7 ? 'var(--border-strong)' : 'var(--border)'}`,
                  filter: i < 7 ? 'none' : 'grayscale(1)', opacity: i < 7 ? 1 : .35 }}>
                {b}
              </motion.div>
            ))}
          </div>
        </Card>

        <Card pad="1.3rem">
          <H2 style={{ margin: '0 0 12px' }}>👥 {t('stats.presenceTitle')}</H2>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#27AE60', marginBottom: 4 }}>👥 24</div>
          <div style={{ fontSize: '.76rem', color: 'var(--text-secondary)', lineHeight: 1.45, marginBottom: 12 }}>
            {t('stats.onlineText', { count: 24 })}
          </div>
          <div style={{ display: 'flex' }}>
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} style={{ width: 30, height: 30, borderRadius: '50%',
                background: `hsl(${i * 60},60%,50%)`, border: '2px solid var(--bg-base)',
                marginLeft: i > 0 ? -8 : 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '.68rem', color: '#fff', fontWeight: 700 }}>{String.fromCharCode(65 + i)}</div>
            ))}
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--bg-card-hover)',
              border: '2px solid var(--bg-base)', marginLeft: -8, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '.58rem', color: 'var(--text-muted)' }}>+19</div>
          </div>
        </Card>
      </div>
    </Page>
  );
}

/* ── 10 · Réserve ────────────────────────────────────────────────────────── */

const ROOM_DECOR = [
  { src: asset('reserve/deco/bureau.png'), x: 28, y: 62, size: 20 },
  { src: asset('reserve/deco/lampe.png'), x: 33, y: 55.5, size: 9 },
  { src: asset('reserve/deco/chaise.png'), x: 44, y: 66, size: 12 },
  { src: asset('reserve/deco/livres.png'), x: 66, y: 71, size: 8 },
  { src: asset('reserve/deco/plante.png'), x: 75, y: 65, size: 13 },
];

export function ScreenReserve({ t }) {
  return (
    <Page max={860} gap={16}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          🎋 {t('app.tabReserve')}
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
          background: 'rgba(241,196,15,.12)', border: '1px solid rgba(241,196,15,.3)', borderRadius: 20 }}>
          <span style={{ fontSize: '1.1rem' }}>🪙</span>
          <span style={{ fontSize: '1rem', fontWeight: 800, color: '#F1C40F' }}>1240</span>
        </div>
      </div>

      <Seg active={2} pad="8px 18px" style={{ alignSelf: 'center' }}
        items={[`🌱 ${t('showcase.resGarden')}`, `🛒 ${t('showcase.resShop')}`, `🏠 ${t('showcase.resRoom')}`]} />

      <div style={{ position: 'relative', width: '100%', aspectRatio: '1024 / 768', maxWidth: 560,
        margin: '0 auto', borderRadius: 18, overflow: 'hidden', border: '1px solid var(--border)',
        backgroundImage: `url(${asset('reserve/rooms/piece.jpg')})`, backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }}>
        {ROOM_DECOR.map((d, i) => (
          <motion.img key={i} src={d.src} alt="" aria-hidden="true"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: .18 + i * .08, duration: .35 }}
            style={{ position: 'absolute', left: `${d.x}%`, top: `${d.y}%`, width: `${d.size}%`,
              aspectRatio: 1, objectFit: 'contain', filter: 'drop-shadow(0 5px 8px rgba(0,0,0,.25))' }} />
        ))}
      </div>

      <span style={{ alignSelf: 'center', padding: '9px 20px', borderRadius: 12,
        background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: '.82rem' }}>
        + {t('showcase.resAddItem')}
      </span>
    </Page>
  );
}

/* ── 11 · Groupes ────────────────────────────────────────────────────────── */

export function ScreenGroups({ t }) {
  const rows = t('showcase.groupRows').split('|').map((s, i) => {
    const [name, preview] = s.split('::');
    return { name, preview, ...GROUP_META[i] };
  });

  return (
    <Page max={860} gap={20}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          💬 {t('groups.title')}
        </h1>
        <span style={{ padding: '8px 18px', borderRadius: 10, background: 'linear-gradient(135deg,var(--accent),#6366f1)',
          color: '#fff', fontSize: '.82rem', fontWeight: 700, boxShadow: '0 4px 16px var(--accent-glow)' }}>
          {t('groups.createGroupBtn')}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', padding: 4, borderRadius: 12 }}>
        {[t('groups.tabAll'), t('groups.tabGroups'), t('groups.tabPrivate')].map((l, i) => (
          <span key={l} style={{ flex: 1, padding: 8, borderRadius: 8, fontSize: '.78rem', textAlign: 'center',
            background: i === 0 ? 'var(--accent-subtle)' : 'transparent',
            color: i === 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>{l}</span>
        ))}
      </div>

      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
          fontSize: '.85rem', color: 'var(--text-muted)' }}>🔍</span>
        <div style={{ padding: '9px 12px 9px 34px', borderRadius: 10, border: '1px solid var(--border-strong)',
          background: 'var(--bg-input)', color: 'var(--text-placeholder)', fontSize: '.83rem' }}>
          {t('groups.searchPlaceholder')}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-strong)',
          background: 'var(--bg-input)', color: 'var(--text-placeholder)', fontSize: '.83rem', letterSpacing: '.05em' }}>
          {t('groups.joinPlaceholder')}
        </div>
        <span style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid var(--accent)',
          background: 'var(--accent-subtle)', color: 'var(--accent)', fontSize: '.82rem', fontWeight: 600 }}>
          {t('groups.join')}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, background: 'var(--bg-card)',
        border: '1px solid var(--border)', borderRadius: 14, padding: 6 }}>
        {rows.map((g, i) => (
          <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .1 + i * .07 }}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 12,
              background: i === 0 ? 'var(--bg-card-hover)' : 'transparent' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, flexShrink: 0, position: 'relative',
              background: 'linear-gradient(135deg,var(--accent),#9B59B6)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
              {g.emoji}
              {g.unread > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, padding: '0 5px',
                  borderRadius: 9, background: '#E74C3C', color: '#fff', fontSize: '.62rem', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg-base)' }}>
                  {g.unread}
                </span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>{g.name}</span>
                <span style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>{g.time}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
                <span style={{ fontSize: '.74rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: g.unread ? 'var(--text-secondary)' : 'var(--text-muted)',
                  fontWeight: g.unread ? 600 : 400 }}>{g.preview}</span>
                <span style={{ fontSize: '.6rem', color: 'var(--text-muted)', flexShrink: 0 }}>{g.members} 👥</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </Page>
  );
}

const GROUP_META = [
  { emoji: '📐', unread: 3, members: 5, time: '14:32' },
  { emoji: '💻', unread: 0, members: 8, time: '11:04' },
  { emoji: '🎓', unread: 0, members: 12, time: 'Hier' },
  { emoji: '🧪', unread: 0, members: 4, time: 'Lun.' },
];

/* ── 12 · Journal ────────────────────────────────────────────────────────── */

const MOODS = [
  { emoji: '😴', key: 'journal.moodTired', color: '#6b7280', count: 3 },
  { emoji: '😐', key: 'journal.moodNeutral', color: '#F1C40F', count: 7 },
  { emoji: '🙂', key: 'journal.moodGood', color: '#4A90D9', count: 14 },
  { emoji: '🔥', key: 'journal.moodFire', color: '#E74C3C', count: 9 },
];

export function ScreenJournal({ t }) {
  const subjects = subjectsOf(t);
  const entries = t('showcase.journalEntries').split('|');

  return (
    <Page max={800}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8 }}>
        <div style={{ textAlign: 'center', padding: 10, background: 'var(--bg-card)',
          border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--accent)' }}>33</div>
          <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', marginTop: 2 }}>{t('journal.entries')}</div>
        </div>
        <div style={{ textAlign: 'center', padding: 10, background: 'var(--accent-subtle)',
          border: '1px solid var(--accent-glow)', borderRadius: 12 }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--xp-color)' }}>14</div>
          <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', marginTop: 2 }}>🔥 {t('journal.streakDays')}</div>
        </div>
        {MOODS.map(m => (
          <div key={m.emoji} style={{ textAlign: 'center', padding: 10, background: `${m.color}10`,
            border: `1px solid ${m.color}25`, borderRadius: 12 }}>
            <div style={{ fontSize: '1.1rem' }}>{m.emoji}</div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: m.color }}>{m.count}</div>
            <div style={{ fontSize: '.55rem', color: 'var(--text-muted)' }}>{t(m.key)}</div>
          </div>
        ))}
      </div>

      <Card pad="1.4rem">
        <H2 style={{ margin: '0 0 14px' }}>✏️ {t('journal.newEntry')}</H2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
          <div style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-strong)',
            background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.82rem' }}>
            {subjects[0].name}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {MOODS.map((m, i) => (
              <div key={m.emoji} style={{ width: 38, height: 38, borderRadius: 10,
                border: `2px solid ${i === 2 ? m.color : 'var(--border)'}`,
                background: i === 2 ? `${m.color}20` : 'transparent', fontSize: '1.1rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transform: i === 2 ? 'scale(1.15)' : 'none' }}>{m.emoji}</div>
            ))}
          </div>
        </div>
        <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-strong)',
          background: 'var(--bg-input)', color: 'var(--text-placeholder)', fontSize: '.85rem',
          lineHeight: 1.6, minHeight: 58 }}>
          {t('journal.textPlaceholder')}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <span style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>{t('journal.charCount', { count: 0 })}</span>
          <span style={{ padding: '8px 20px', borderRadius: 10, background: 'linear-gradient(135deg,#4A90D9,#6366f1)',
            color: '#fff', fontSize: '.82rem', fontWeight: 700 }}>{t('journal.saveBtn')}</span>
        </div>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map((text, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: .12 + i * .07, duration: .3 }}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
              padding: '11px 14px', borderLeft: `2px solid ${subjects[i % 5].color}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: '.64rem', color: 'var(--text-muted)' }}>
                {['12 oct.', '11 oct.', '10 oct.'][i]} · {subjects[i % 5].name}
              </span>
              <span style={{ fontSize: '.85rem' }}>{['🔥', '🙂', '😐'][i]}</span>
            </div>
            <p style={{ fontSize: '.76rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{text}</p>
          </motion.div>
        ))}
      </div>
    </Page>
  );
}

/* ── 13 · À propos ───────────────────────────────────────────────────────── */

const FEATURE_KEYS = [
  ['featPlanLabel', 'featPlanDesc'], ['featTodoLabel', 'featTodoDesc'],
  ['featProgLabel', 'featProgDesc'], ['featConfLabel', 'featConfDesc'],
  ['featSynthLabel', 'featSynthDesc'], ['featCardsLabel', 'featCardsDesc'],
  ['featSrLabel', 'featSrDesc'], ['featExamLabel', 'featExamDesc'],
  ['featStatsLabel', 'featStatsDesc'], ['featGroupsLabel', 'featGroupsDesc'],
  ['featJournalLabel', 'featJournalDesc'], ['featTimerLabel', 'featTimerDesc'],
];

export function ScreenWhoarewe({ t }) {
  return (
    <Page max={860}>
      <div style={{ textAlign: 'center', padding: '10px 0 0' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 8px',
          letterSpacing: '-.02em', lineHeight: 1.15 }}>
          {t('whoarewe.heroTitle1')}<br />
          <span style={{ color: 'var(--accent)' }}>{t('whoarewe.heroTitle2')}</span>
        </h1>
        <div style={{ fontSize: '1.02rem', color: 'var(--text-secondary)', maxWidth: 480,
          margin: '0 auto 18px', lineHeight: 1.6 }}>{t('whoarewe.heroSubtitle')}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-card)',
            border: '1px solid var(--border)', borderRadius: 20, padding: '7px 14px' }}>
            <div style={{ display: 'flex', gap: 2 }}>
              {[1, 2, 3, 4, 5].map(s => (
                <span key={s} style={{ fontSize: '.95rem', filter: s <= 5 ? 'none' : 'grayscale(1) opacity(.3)' }}>⭐</span>
              ))}
            </div>
            <span style={{ fontSize: '.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>4.8</span>
            <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>· {t('whoarewe.reviewCount', { count: 27 })}</span>
          </div>
        </div>
        <div style={{ fontSize: '.82rem', color: 'var(--accent)', fontStyle: 'italic', fontWeight: 600, marginTop: 18 }}>
          {t('whoarewe.quote')}
        </div>
      </div>

      <Card pad="1.4rem">
        <H2 style={{ margin: '0 0 4px' }}>✨ {t('whoarewe.featuresTitle')}</H2>
        <p style={{ fontSize: '.72rem', color: 'var(--text-muted)', margin: '0 0 14px' }}>{t('whoarewe.featuresSubtitle')}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {FEATURE_KEYS.map(([lk, dk], i) => (
            <motion.div key={lk} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: .08 + i * .04, duration: .28 }}
              style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-card-hover)',
                border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '.76rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t(`whoarewe.${lk}`)}</div>
              <div style={{ fontSize: '.64rem', color: 'var(--text-muted)', marginTop: 2 }}>{t(`whoarewe.${dk}`)}</div>
            </motion.div>
          ))}
        </div>
      </Card>
    </Page>
  );
}

/* ── 14 · Mode Étude ─────────────────────────────────────────────────────── */

const SOUNDS = [
  { emoji: '🔇', key: 'study.soundNone' }, { emoji: '🌧️', key: 'study.soundRain' },
  { emoji: '🌊', key: 'study.soundWaves' }, { emoji: '🔥', key: 'study.soundFire' },
  { emoji: '🌿', key: 'study.soundForest' }, { emoji: '🧠', key: 'study.soundAlpha' },
];

export function ScreenStudy({ t }) {
  const subjects = subjectsOf(t);
  const subj = subjects[0];
  const pct = 67;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', fontFamily: 'var(--font-family)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* Left — timer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 6, background: 'var(--bg-card)', padding: 4,
            borderRadius: 12, border: '1px solid var(--border)' }}>
            {[{ k: 'study.modeCustom', c: '#4A90D9' }, { k: 'study.modePomodoro', c: '#E74C3C' },
              { k: 'study.modePomodoro50', c: '#9B59B6' }].map((m, i) => (
              <span key={m.k} style={{ flex: 1, padding: '8px 4px', borderRadius: 8, textAlign: 'center',
                background: i === 0 ? `${m.c}20` : 'transparent',
                color: i === 0 ? m.c : 'var(--text-muted)',
                fontSize: '.68rem', fontWeight: i === 0 ? 700 : 400,
                boxShadow: i === 0 ? `0 0 10px ${m.c}25` : 'none' }}>{t(m.k)}</span>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {[25, 45, 60, 90, 120].map(d => (
              <span key={d} style={{ flex: 1, padding: '6px 0', borderRadius: 8, textAlign: 'center',
                border: `1px solid ${d === 45 ? 'var(--accent)' : 'var(--border)'}`,
                background: d === 45 ? 'var(--accent-subtle)' : 'var(--bg-card)',
                color: d === 45 ? 'var(--accent)' : 'var(--text-muted)', fontSize: '.75rem' }}>{d}m</span>
            ))}
            <span style={{ flex: 1, padding: '6px 0', borderRadius: 8, textAlign: 'center',
              border: '1px solid var(--border)', background: 'var(--bg-card)',
              color: 'var(--text-muted)', fontSize: '.75rem' }}>⚙️</span>
          </div>

          <div style={{ position: 'relative', background: 'var(--bg-card)',
            border: '1px solid rgba(74,144,217,.28)', borderRadius: 24, padding: '2rem',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
            boxShadow: '0 0 50px rgba(74,144,217,.06)' }}>
            <Ring pct={pct} size={200} stroke={10} color="var(--accent)" glow={false}>
              <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--text-primary)',
                fontFamily: '"Courier New",monospace', letterSpacing: 3, lineHeight: 1,
                textShadow: '0 0 20px var(--accent-glow)' }}>30:12</div>
            </Ring>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20,
              background: `${subj.color}10`, border: `1px solid ${subj.color}25` }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: subj.color,
                boxShadow: `0 0 6px ${subj.color}` }} />
              <span style={{ fontSize: '.8rem', fontWeight: 600, color: subj.color }}>{subj.name}</span>
            </div>

            <div style={{ display: 'flex', gap: 16 }}>
              {[{ l: t('study.xpPotential'), v: 450 }, { l: t('study.xpAccumulated'), v: 301 }].map(x => (
                <div key={x.l} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '.55rem', color: 'var(--text-muted)', textTransform: 'uppercase',
                    letterSpacing: '.1em', marginBottom: 2 }}>{x.l}</div>
                  <div style={{ fontSize: '.88rem', color: 'var(--text-primary)' }}>+{x.v} XP</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <span style={{ flex: 1, padding: 13, borderRadius: 14, textAlign: 'center',
                background: 'rgba(231,76,60,.7)', color: '#fff', fontSize: '.9rem', fontWeight: 800,
                boxShadow: '0 4px 20px rgba(231,76,60,.25)' }}>⏸ {t('study.pause')}</span>
              <span style={{ width: 46, height: 46, borderRadius: 14, border: '1px solid var(--border)',
                background: 'var(--bg-card-hover)', color: 'var(--text-muted)', fontSize: '1.1rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>↺</span>
            </div>

            <span style={{ width: '100%', padding: 9, borderRadius: 10, textAlign: 'center',
              border: '1px solid rgba(74,144,217,.2)', background: 'rgba(74,144,217,.02)',
              color: 'var(--accent)', opacity: .7, fontSize: '.78rem', letterSpacing: '.04em' }}>
              🎯 {t('study.focusMode')}
            </span>
          </div>
        </div>

        {/* Right — subject + ambience */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card>
            <div style={{ fontSize: '.6rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8,
              textTransform: 'uppercase', letterSpacing: '.12em' }}>{t('common.subject')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {subjects.map((s, i) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                  borderRadius: 8, borderLeft: `2px solid ${i === 0 ? s.color : 'var(--border)'}`,
                  background: i === 0 ? `${s.color}10` : 'transparent', opacity: i === 0 ? 1 : .6 }}>
                  <span style={{ fontSize: '.8rem', fontWeight: i === 0 ? 600 : 400, flex: 1,
                    color: i === 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{s.name}</span>
                  {i < 3 && (
                    <span style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>
                      {t('study.daysLeft', { count: [4, 9, 16][i] })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div style={{ fontSize: '.6rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8,
              textTransform: 'uppercase', letterSpacing: '.12em' }}>{t('study.ambiance')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5, marginBottom: 12 }}>
              {SOUNDS.map((s, i) => (
                <div key={s.key} style={{ padding: '9px 4px', borderRadius: 9,
                  border: `1px solid ${i === 4 ? 'var(--accent)' : 'var(--border)'}`,
                  background: i === 4 ? 'var(--accent-subtle)' : 'var(--bg-card-hover)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: '1.15rem', filter: i === 4 ? 'none' : 'grayscale(0.3) opacity(0.6)' }}>{s.emoji}</span>
                  <span style={{ fontSize: '.6rem', fontWeight: i === 4 ? 600 : 400,
                    color: i === 4 ? 'var(--accent)' : 'var(--text-muted)' }}>{t(s.key)}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '.7rem' }}>🔈</span>
              <div style={{ flex: 1, position: 'relative', height: 18, display: 'flex', alignItems: 'center' }}>
                <div style={{ position: 'absolute', left: 0, right: 0, height: 3, background: 'var(--border)', borderRadius: 4 }} />
                <div style={{ position: 'absolute', left: 0, height: 3, background: 'var(--accent)', borderRadius: 4,
                  width: '55%', boxShadow: '0 0 6px var(--accent-glow)' }} />
              </div>
              <span style={{ fontSize: '.62rem', color: 'var(--text-muted)', minWidth: 26 }}>55%</span>
            </div>
          </Card>

          <div style={{ background: 'rgba(74,144,217,.07)', border: '1px solid rgba(74,144,217,.18)',
            borderRadius: 14, padding: '1rem' }}>
            <div style={{ fontSize: '.6rem', fontWeight: 600, color: 'var(--accent)', opacity: .7,
              marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.1em' }}>{t('study.session')}</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-primary)', fontFamily: 'monospace' }}>14:48</div>
                <div style={{ fontSize: '.58rem', color: 'var(--text-muted)', marginTop: 2 }}>{t('study.focusedTime')}</div>
              </div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-primary)' }}>+148</div>
                <div style={{ fontSize: '.58rem', color: 'var(--text-muted)', marginTop: 2 }}>{t('study.sessionXp')}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
