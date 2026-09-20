/**
 * AutoPlanModal — settings and live preview of the automatic revision plan.
 * --------------------------------------------------------------------------
 * The student sets the period, the days and hours available, the daily study
 * time, the session length and the subjects; the plan (lib/autoPlan.js) is
 * recomputed live and previewed day by day. Nothing is written until "Add to
 * my planner".
 *
 * The plan used to be a black box: a list of blocks appeared and nothing said
 * where they came from. Three things now make it readable:
 *   - the RULES, in four short lines, at the top;
 *   - what it COUNTED for these settings (chapters, weak chapters, exams) and
 *     what it worked around (existing blocks, calendar events);
 *   - the time AVAILABLE against the time NEEDED, as one bar, with the three
 *     settings to change when it does not fit.
 *
 * An existing automatic plan (future, unfinished blocks marked `auto`) can be
 * replaced by the new one, or removed on its own.
 *
 * Props: { subjects, blocks, events, onApply(blocks, replace), onRemove(), onClose }
 */

import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Wand2, X, AlertTriangle, Trash2, CalendarPlus, BookOpen, HeartCrack, GraduationCap,
  CalendarX, Info, Plus, Minus, ChevronDown, ChevronRight, RotateCcw,
} from 'lucide-react';
import { useTranslation } from '../i18n';
import { generateRevisionPlan, pendingAutoBlocks } from '../lib/autoPlan';
import { formatDuration } from '../lib/duration';
import { Button } from './ui';

const WEEK_OPTIONS = [1, 2, 3, 4, 6, 8];
/** A new window is added here when there is room after the last one. */
const NEW_WINDOW = { from: 14, to: 18 };
const SESSION_OPTIONS = [0.75, 1, 1.5, 2];
const HOURS = Array.from({ length: 19 }, (_, i) => i + 6); // 6h … 24h

/** Local YYYY-MM-DD, what a date input reads and writes. */
function dayValue(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function clock(h, lang) {
  const hh = Math.floor(h);
  const mm = String(Math.round((h % 1) * 60)).padStart(2, '0');
  return lang === 'fr' ? `${hh}h${mm === '00' ? '' : mm}` : `${String(hh).padStart(2, '0')}:${mm}`;
}

/** One "here is what I found" figure. Never a control: it only reports. */
function Fact({ icon: Icon, value, label, tone }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 12, background: 'var(--bg-card-hover)' }}>
      <Icon size={15} aria-hidden="true" style={{ flexShrink: 0, color: tone || 'var(--accent)' }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '.82rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', lineHeight: 1.25 }}>{label}</div>
      </div>
    </div>
  );
}

/** One rule of the plan, written the way a student would say it. */
function Rule({ children }) {
  return (
    <li style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: '.73rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
      <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 7 }} />
      <span>{children}</span>
    </li>
  );
}

export default function AutoPlanModal({ subjects, blocks, events, onApply, onRemove, onClose }) {
  const { t, lang, formatDate } = useTranslation();
  const [now] = useState(() => new Date());
  const pending = useMemo(() => pendingAutoBlocks(blocks, now), [blocks, now]);
  const candidates = subjects.filter(s => (s.chapters || []).some(c => c?.status !== 'done') || (!s.chapters?.length && s.chaps));

  const [opts, setOpts] = useState({
    weeks: 2,
    days: [true, true, true, true, true, false, false],
    dailyHours: 2,
    windows: [{ from: 9, to: 12 }, { from: 14, to: 19 }],
    sessionHours: 1.5,
    finalReview: true,
    weakExtra: true,
    includeDone: false,
    startDate: dayValue(now),
    subjectIds: candidates.map(s => String(s.id)),
    // null for a subject = every chapter of it; an array = the chosen ones.
    chapters: {},
  });
  // Which subject has its chapter list open.
  const [openSubject, setOpenSubject] = useState(null);
  const [replace, setReplace] = useState(true);
  const [showRules, setShowRules] = useState(true);
  const set = (k, v) => setOpts(o => ({ ...o, [k]: v }));

  /** The chapters of a subject, in the shape the picker needs. */
  function chaptersOf(subject) {
    const list = Array.isArray(subject.chapters) && subject.chapters.length
      ? subject.chapters
      : Array.from({ length: Number(subject.chaps) || 0 }, (_, i) => ({ name: '', status: i < (Number(subject.chapsDone) || 0) ? 'done' : 'todo' }));
    return list.map((c, i) => ({ index: i, name: c?.name || '', done: c?.status === 'done', conf: Number(subject.conf?.[i]) || 0 }));
  }

  /** Chapters of a subject currently in the plan (null = all of them). */
  const pickedOf = id => opts.chapters[String(id)] ?? null;

  function toggleChapter(subject, index) {
    const all = chaptersOf(subject).map(c => c.index);
    const current = pickedOf(subject.id) ?? all;
    const next = current.includes(index) ? current.filter(i => i !== index) : [...current, index].sort((a, b) => a - b);
    setOpts(o => ({
      ...o,
      chapters: { ...o.chapters, [String(subject.id)]: next.length === all.length ? null : next },
    }));
  }

  function setAllChapters(subject, on) {
    setOpts(o => ({ ...o, chapters: { ...o.chapters, [String(subject.id)]: on ? null : [] } }));
  }

  function setWindow(i, key, value) {
    setOpts(o => ({
      ...o,
      windows: o.windows.map((w, j) => {
        if (j !== i) return w;
        const next = { ...w, [key]: value };
        // Keep the pair valid without arguing with the student about it.
        if (key === 'from') next.to = Math.max(next.to, value + 1);
        else next.from = Math.min(next.from, value - 1);
        return next;
      }),
    }));
  }

  const plan = useMemo(() => {
    const pendingSet = new Set(pending);
    const base = replace ? blocks.filter(b => !pendingSet.has(b)) : blocks;
    return generateRevisionPlan({
      subjects, blocks: base, events, now, options: opts,
      labels: {
        finalReview: t('autoPlan.finalReview'),
        secondPass: t('autoPlan.secondPass'),
        refresher: t('autoPlan.refresher'),
        chapter: t('autoPlan.chapterShort', { n: '{n}' }),
      },
    });
  }, [subjects, blocks, events, now, opts, replace, pending, t]);

  // Preview grouped by day.
  const byDay = useMemo(() => {
    const map = new Map();
    for (const b of plan.blocks) {
      const list = map.get(b.dateStr) || [];
      list.push(b);
      map.set(b.dateStr, list);
    }
    return [...map.entries()];
  }, [plan]);

  // What the plan reports about itself, and how full the period would be.
  const x = plan.explain;
  const fillPct = x.capacityHours > 0 ? Math.min(100, Math.round((x.neededHours / x.capacityHours) * 100)) : 100;

  const dayNames = Array.from({ length: 7 }, (_, i) => formatDate(new Date(2024, 0, 1 + i), { weekday: 'short' }).replace(/\.$/, ''));
  const subjectOf = id => subjects.find(s => String(s.id) === String(id));
  // dateStr is toISOString() of the local midnight: the real day is found from weekOffset + day.
  const realDay = b => {
    const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    return new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + b.weekOffset * 7 + b.day);
  };

  const field = {
    padding: '7px 9px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-input)',
    color: 'var(--text-primary)', fontSize: '.78rem', fontFamily: 'var(--font-family)', width: '100%', boxSizing: 'border-box',
  };
  const label = { display: 'block', fontSize: '.68rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 };
  const chip = active => ({
    padding: '5px 10px', borderRadius: 99, border: 'none', cursor: 'pointer', fontSize: '.72rem', fontWeight: active ? 700 : 500,
    background: active ? 'var(--accent-subtle)' : 'var(--bg-card)', color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    display: 'inline-flex', alignItems: 'center', gap: 6,
  });

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      role="dialog" aria-modal="true" aria-label={t('autoPlan.title')}
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <motion.div initial={{ y: 16, scale: .97 }} animate={{ y: 0, scale: 1 }} transition={{ duration: .22, ease: 'easeOut' }}
        style={{ width: 640, maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16,
          background: 'var(--bg-modal)', borderRadius: 22, padding: '1.3rem', boxShadow: 'var(--card-shadow)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
            <Wand2 size={18} aria-hidden="true" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.98rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('autoPlan.title')}</div>
            <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>{t('autoPlan.hint')}</div>
          </div>
          <button type="button" onClick={onClose} aria-label={t('docs.close')}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignSelf: 'flex-start' }}>
            <X size={18} />
          </button>
        </div>

        {candidates.length === 0 ? (
          <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{t('autoPlan.nothingToPlan')}</div>
        ) : (
          <>
            {/* Settings */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
              <div>
                <label style={label} htmlFor="ap-weeks">{t('autoPlan.period')}</label>
                <select id="ap-weeks" style={field} value={opts.weeks} onChange={e => set('weeks', Number(e.target.value))}>
                  {WEEK_OPTIONS.map(w => <option key={w} value={w}>{t('autoPlan.weeks', { count: w })}</option>)}
                </select>
              </div>
              <div>
                <label style={label} htmlFor="ap-daily">{t('autoPlan.dailyTime')}</label>
                <select id="ap-daily" style={field} value={opts.dailyHours} onChange={e => set('dailyHours', Number(e.target.value))}>
                  {[1, 1.5, 2, 2.5, 3, 4, 5, 6, 8].map(h => <option key={h} value={h}>{formatDuration(h, lang)}</option>)}
                </select>
              </div>
              <div>
                <label style={label} htmlFor="ap-session">{t('autoPlan.session')}</label>
                <select id="ap-session" style={field} value={opts.sessionHours} onChange={e => set('sessionHours', Number(e.target.value))}>
                  {SESSION_OPTIONS.map(h => <option key={h} value={h}>{formatDuration(h, lang)}</option>)}
                </select>
              </div>
              <div>
                <label style={label} htmlFor="ap-start">{t('autoPlan.startDate')}</label>
                <input id="ap-start" type="date" style={field} value={opts.startDate}
                  min={dayValue(now)}
                  onChange={e => set('startDate', e.target.value || dayValue(now))} />
              </div>
            </div>

            {/* Time windows */}
            <div>
              <div style={label}>{t('autoPlan.windows')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {opts.windows.map((w, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select aria-label={t('autoPlan.startHour')} style={{ ...field, width: 'auto', flex: 1 }} value={w.from}
                      onChange={e => setWindow(i, 'from', Number(e.target.value))}>
                      {HOURS.slice(0, -1).map(h => <option key={h} value={h}>{clock(h, lang)}</option>)}
                    </select>
                    <span aria-hidden="true" style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>–</span>
                    <select aria-label={t('autoPlan.endHour')} style={{ ...field, width: 'auto', flex: 1 }} value={w.to}
                      onChange={e => setWindow(i, 'to', Number(e.target.value))}>
                      {HOURS.slice(1).map(h => <option key={h} value={h}>{clock(h, lang)}</option>)}
                    </select>
                    <button type="button" aria-label={t('autoPlan.removeWindow')} title={t('autoPlan.removeWindow')}
                      disabled={opts.windows.length < 2}
                      onClick={() => set('windows', opts.windows.filter((_, j) => j !== i))}
                      style={{ display: 'flex', padding: 7, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-card)',
                        color: 'var(--text-muted)', cursor: opts.windows.length < 2 ? 'not-allowed' : 'pointer', opacity: opts.windows.length < 2 ? .4 : 1 }}>
                      <Minus size={13} />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => set('windows', [...opts.windows, NEW_WINDOW])}
                  style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 99,
                    border: '1px dashed var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)',
                    fontSize: '.72rem', fontWeight: 600, cursor: 'pointer' }}>
                  <Plus size={13} /> {t('autoPlan.addWindow')}
                </button>
              </div>
              <div style={{ fontSize: '.66rem', color: 'var(--text-muted)', marginTop: 5 }}>{t('autoPlan.windowsHint')}</div>
            </div>

            <div>
              <div style={label}>{t('autoPlan.days')}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {dayNames.map((d, i) => (
                  <button key={i} type="button" aria-pressed={opts.days[i]} style={chip(opts.days[i])}
                    onClick={() => set('days', opts.days.map((v, j) => (j === i ? !v : v)))}>{d}</button>
                ))}
              </div>
            </div>

            <div>
              <div style={label}>{t('autoPlan.subjects')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {candidates.map(s => {
                  const on = opts.subjectIds.includes(String(s.id));
                  const open = openSubject === String(s.id);
                  const chapters = chaptersOf(s);
                  const picked = pickedOf(s.id);
                  const inPlan = chapters.filter(c => (!picked || picked.includes(c.index)) && (!c.done || opts.includeDone)).length;
                  return (
                    <div key={s.id} style={{ borderRadius: 12, background: on ? 'var(--bg-card)' : 'transparent',
                      border: `1px solid ${on ? 'var(--border)' : 'transparent'}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px' }}>
                        <button type="button" aria-pressed={on} style={{ ...chip(on), flex: 1, justifyContent: 'flex-start', minWidth: 0 }}
                          onClick={() => set('subjectIds', on ? opts.subjectIds.filter(x => x !== String(s.id)) : [...opts.subjectIds, String(s.id)])}>
                          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: s.color || 'var(--accent)' }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                          {s.date && <span style={{ opacity: .7, fontSize: '.64rem', flexShrink: 0 }}>{formatDate(new Date(`${s.date}T12:00:00`), { day: 'numeric', month: 'short' })}</span>}
                        </button>
                        {on && chapters.length > 0 && (
                          <button type="button" onClick={() => setOpenSubject(open ? null : String(s.id))}
                            aria-expanded={open}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 99,
                              border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: '.68rem', fontWeight: 600, cursor: 'pointer' }}>
                            {t('autoPlan.chaptersCount', { count: inPlan, total: chapters.length })}
                            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          </button>
                        )}
                      </div>

                      {on && open && (
                        <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" onClick={() => setAllChapters(s, true)}
                              style={{ ...chip(false), fontSize: '.66rem' }}>{t('autoPlan.selectAll')}</button>
                            <button type="button" onClick={() => setAllChapters(s, false)}
                              style={{ ...chip(false), fontSize: '.66rem' }}>{t('autoPlan.selectNone')}</button>
                          </div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            {chapters.map(c => {
                              const active = !picked || picked.includes(c.index);
                              const ignored = c.done && !opts.includeDone;
                              return (
                                <button key={c.index} type="button" aria-pressed={active}
                                  onClick={() => toggleChapter(s, c.index)}
                                  title={c.name || undefined}
                                  style={{ ...chip(active), opacity: ignored ? .45 : 1, maxWidth: 190 }}>
                                  {c.done && <RotateCcw size={11} aria-hidden="true" style={{ flexShrink: 0 }} />}
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {t('autoPlan.chapterShort', { n: c.index + 1 })}{c.name ? ` · ${c.name}` : ''}
                                  </span>
                                  {c.conf > 0 && c.conf <= 2 && !c.done && (
                                    <HeartCrack size={11} aria-hidden="true" style={{ flexShrink: 0, color: 'var(--warning)' }} />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '.76rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={opts.weakExtra} onChange={e => set('weakExtra', e.target.checked)}
                  style={{ accentColor: 'var(--accent)', marginTop: 2 }} />
                <span>
                  {t('autoPlan.weakExtraOption')}
                  <span style={{ display: 'block', fontSize: '.66rem', color: 'var(--text-muted)' }}>{t('autoPlan.weakExtraHint')}</span>
                </span>
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '.76rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={opts.includeDone} onChange={e => set('includeDone', e.target.checked)}
                  style={{ accentColor: 'var(--accent)', marginTop: 2 }} />
                <span>
                  {t('autoPlan.includeDoneOption')}
                  <span style={{ display: 'block', fontSize: '.66rem', color: 'var(--text-muted)' }}>{t('autoPlan.includeDoneHint')}</span>
                </span>
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.76rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={opts.finalReview} onChange={e => set('finalReview', e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                {t('autoPlan.finalReviewOption')}
              </label>
            </div>

            {pending.length > 0 && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.76rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                {t('autoPlan.replaceExisting', { count: pending.length })}
              </label>
            )}

            {/* What the plan counted, and whether it fits */}
            <div style={{ borderRadius: 16, background: 'var(--bg-card)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 11 }}>
              <button type="button" onClick={() => setShowRules(r => !r)} aria-expanded={showRules}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: 0, border: 'none', background: 'transparent',
                  cursor: 'pointer', fontSize: '.78rem', fontWeight: 800, color: 'var(--text-primary)', textAlign: 'left' }}>
                <Info size={15} aria-hidden="true" style={{ color: 'var(--accent)' }} />
                {t('autoPlan.howTitle')}
                <span style={{ marginLeft: 'auto', fontSize: '.66rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {showRules ? t('autoPlan.hide') : t('autoPlan.show')}
                </span>
              </button>
              {showRules && (
                <ul style={{ display: 'flex', flexDirection: 'column', gap: 5, margin: 0, padding: 0, listStyle: 'none' }}>
                  <Rule>{t('autoPlan.rule1')}</Rule>
                  <Rule>{t('autoPlan.rule2')}</Rule>
                  <Rule>{t('autoPlan.rule3')}</Rule>
                  <Rule>{t('autoPlan.rule4')}</Rule>
                </ul>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 7 }}>
                <Fact icon={BookOpen} value={x.chapters} label={t('autoPlan.factChapters', { count: x.chapters })} />
                {x.revisited > 0 && (
                  <Fact icon={RotateCcw} value={x.revisited} label={t('autoPlan.factRevisited', { count: x.revisited })} tone="var(--success, #27AE60)" />
                )}
                <Fact icon={HeartCrack} value={x.weakChapters} label={t('autoPlan.factWeak', { count: x.weakChapters })} tone="var(--warning)" />
                <Fact icon={GraduationCap} value={x.exams.length} label={t('autoPlan.factExams', { count: x.exams.length })} />
                <Fact icon={CalendarX} value={x.busyBlocks + x.busyEvents} label={t('autoPlan.factBusy', { count: x.busyBlocks + x.busyEvents })} tone="var(--text-muted)" />
              </div>

              {/* Time available against time needed */}
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
                  <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>{t('autoPlan.timeTitle')}</span>
                  <span style={{ fontSize: '.72rem', color: 'var(--text-secondary)' }}>
                    {t('autoPlan.timeValue', { needed: formatDuration(x.neededHours, lang), available: formatDuration(x.capacityHours, lang) })}
                  </span>
                </div>
                <div style={{ position: 'relative', height: 9, borderRadius: 9, overflow: 'hidden', background: 'var(--bg-card-hover)' }}>
                  <div style={{ height: '100%', borderRadius: 9, width: `${fillPct}%`,
                    background: x.enoughTime ? 'var(--success, #27AE60)' : 'var(--warning)' }} />
                </div>
                <div style={{ fontSize: '.66rem', color: 'var(--text-muted)', marginTop: 5, lineHeight: 1.5 }}>
                  {t('autoPlan.timeHint', { days: x.daysAvailable, daily: formatDuration(opts.dailyHours, lang) })}
                </div>
              </div>
            </div>

            {/* Preview */}
            <div style={{ borderRadius: 16, background: 'var(--bg-card)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: '.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {t('autoPlan.summary', { count: plan.blocks.length, hours: formatDuration(plan.hours, lang) })}
              </div>
              {plan.unscheduled.length > 0 && (
                <div role="status" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '.74rem', color: 'var(--warning)', lineHeight: 1.45 }}>
                  <AlertTriangle size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    {t('autoPlan.notEnoughTime', {
                      list: plan.unscheduled.map(u => t('autoPlan.missingItem', { count: u.count, name: u.name })).join(', '),
                    })}
                    <br />
                    {t('autoPlan.howToFix')}
                  </span>
                </div>
              )}
              <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {byDay.map(([ds, list]) => (
                  <div key={ds}>
                    <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                      {formatDate(realDay(list[0]), { weekday: 'long', day: 'numeric', month: 'long' })}
                    </div>
                    {list.map((b, i) => {
                      const s = subjectOf(b.subj);
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.74rem', padding: '3px 0', color: 'var(--text-secondary)' }}>
                          <span style={{ width: 88, flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>
                            {clock(b.hour, lang)}–{clock(b.hour + b.dur, lang)}
                          </span>
                          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: s?.color || 'var(--accent)' }} />
                          <strong style={{ color: 'var(--text-primary)', flexShrink: 0 }}>{s?.name}</strong>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.task}</span>
                        </div>
                      );
                    })}
                  </div>
                ))}
                {plan.blocks.length === 0 && (
                  <div style={{ fontSize: '.74rem', color: 'var(--text-muted)' }}>{t('autoPlan.empty')}</div>
                )}
              </div>

              {/* Subject by subject: how much was planned out of what is needed */}
              {x.perSubject.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 9, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {x.perSubject.map(row => (
                    <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.72rem', color: 'var(--text-secondary)' }}>
                      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: row.color || 'var(--accent)' }} />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)', fontWeight: 600 }}>
                        {row.name}
                      </span>
                      {row.exam && (
                        <span style={{ flexShrink: 0, fontSize: '.64rem', color: 'var(--warning)' }}>
                          {t('autoPlan.examOn', { date: formatDate(row.exam, { day: 'numeric', month: 'short' }) })}
                        </span>
                      )}
                      <span style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: row.placed < row.sessions ? 'var(--warning)' : 'var(--text-muted)' }}>
                        {t('autoPlan.rowSessions', { placed: row.placed, total: row.sessions })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {pending.length > 0 && (
            <Button type="button" variant="ghost" danger icon={Trash2} style={{ marginRight: 'auto' }}
              onClick={() => { onRemove(); onClose(); }}>
              {t('autoPlan.remove', { count: pending.length })}
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="button" variant="primary" icon={CalendarPlus} disabled={!plan.blocks.length}
            onClick={() => { onApply(plan.blocks, replace && pending.length > 0); onClose(); }}>
            {t('autoPlan.apply')}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
