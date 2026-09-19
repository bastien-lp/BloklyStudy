/**
 * AutoPlanModal — settings and live preview of the automatic revision plan.
 * --------------------------------------------------------------------------
 * The student sets the period, the days and hours available, the daily study
 * time, the session length and the subjects; the plan (lib/autoPlan.js) is
 * recomputed live and previewed day by day, with a clear warning for what
 * does not fit. Nothing is written until "Add to my planner".
 *
 * An existing automatic plan (future, unfinished blocks marked `auto`) can be
 * replaced by the new one, or removed on its own.
 *
 * Props: { subjects, blocks, events, onApply(blocks, replace), onRemove(), onClose }
 */

import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Wand2, X, AlertTriangle, Trash2, CalendarPlus } from 'lucide-react';
import { useTranslation } from '../i18n';
import { generateRevisionPlan, pendingAutoBlocks } from '../lib/autoPlan';
import { formatDuration } from '../lib/duration';
import { Button } from './ui';

const WEEK_OPTIONS = [1, 2, 3, 4, 6, 8];
const SESSION_OPTIONS = [0.75, 1, 1.5, 2];
const HOURS = Array.from({ length: 19 }, (_, i) => i + 6); // 6h … 24h

function clock(h, lang) {
  const hh = Math.floor(h);
  const mm = String(Math.round((h % 1) * 60)).padStart(2, '0');
  return lang === 'fr' ? `${hh}h${mm === '00' ? '' : mm}` : `${String(hh).padStart(2, '0')}:${mm}`;
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
    startHour: 9,
    endHour: 19,
    sessionHours: 1.5,
    finalReview: true,
    subjectIds: candidates.map(s => String(s.id)),
  });
  const [replace, setReplace] = useState(true);
  const set = (k, v) => setOpts(o => ({ ...o, [k]: v }));

  const plan = useMemo(() => {
    const pendingSet = new Set(pending);
    const base = replace ? blocks.filter(b => !pendingSet.has(b)) : blocks;
    return generateRevisionPlan({
      subjects, blocks: base, events, now, options: opts,
      labels: { finalReview: t('autoPlan.finalReview'), secondPass: t('autoPlan.secondPass') },
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
                <label style={label} htmlFor="ap-from">{t('autoPlan.between')}</label>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <select id="ap-from" aria-label={t('autoPlan.startHour')} style={field} value={opts.startHour}
                    onChange={e => { const v = Number(e.target.value); setOpts(o => ({ ...o, startHour: v, endHour: Math.max(o.endHour, v + 1) })); }}>
                    {HOURS.slice(0, -1).map(h => <option key={h} value={h}>{clock(h, lang)}</option>)}
                  </select>
                  <select aria-label={t('autoPlan.endHour')} style={field} value={opts.endHour}
                    onChange={e => { const v = Number(e.target.value); setOpts(o => ({ ...o, endHour: v, startHour: Math.min(o.startHour, v - 1) })); }}>
                    {HOURS.slice(1).map(h => <option key={h} value={h}>{clock(h, lang)}</option>)}
                  </select>
                </div>
              </div>
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
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {candidates.map(s => {
                  const on = opts.subjectIds.includes(String(s.id));
                  return (
                    <button key={s.id} type="button" aria-pressed={on} style={chip(on)}
                      onClick={() => set('subjectIds', on ? opts.subjectIds.filter(x => x !== String(s.id)) : [...opts.subjectIds, String(s.id)])}>
                      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: s.color || 'var(--accent)' }} />
                      {s.name}
                      {s.date && <span style={{ opacity: .7, fontSize: '.64rem' }}>{formatDate(new Date(`${s.date}T12:00:00`), { day: 'numeric', month: 'short' })}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.76rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={opts.finalReview} onChange={e => set('finalReview', e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
              {t('autoPlan.finalReviewOption')}
            </label>

            {pending.length > 0 && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.76rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                {t('autoPlan.replaceExisting', { count: pending.length })}
              </label>
            )}

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
