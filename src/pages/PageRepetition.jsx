/**
 * PageRepetition — Spaced repetition (J+1 / J+7 / J+30)
 * --------------------------------------------------------------------------
 * Each chapter the user "schedules" enters a spaced-repetition cycle: review
 * 1 day, then 7 days, then 30 days after the previous step. After three
 * reviews the chapter is mastered.
 *
 * State lives in the Firestore document `users/{uid}/data/main` under `srData`:
 *   srData = { "<subjectId>_<chapterIndex>": { firstStudy, reviews: number[] } }
 *   - firstStudy : timestamp (ms) of the initial study
 *   - reviews    : timestamps (ms) of each completed review
 *
 * Props: { user }
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useTranslation } from '../i18n';
import { SR_INTERVALS, nextDueMs, isMastered, nextEase } from '../data/repetition';
import { GuidedTour, useGuidedTour, TourButton } from '../components/GuidedTour';
import { EmptyState } from '../components/ui';
import { PartyPopper } from 'lucide-react';
import { reportSaveError } from '../lib/notify';

// ── Mini countdown ring ──────────────────────────────────────────────────────
function MiniRing({ daysLeft, maxDays = 30, color }) {
  const pct = Math.max(0, Math.min(1, 1 - daysLeft / maxDays));
  const r = 16, stroke = 3;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: 38, height: 38, flexShrink: 0 }}>
      <svg width="38" height="38" viewBox="0 0 38 38" style={{ transform: 'rotate(-90deg)', position: 'absolute', inset: 0 }}>
        <circle cx="19" cy="19" r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <motion.circle cx="19" cy="19" r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ}
          animate={{ strokeDashoffset: circ * (1 - pct) }}
          transition={{ duration: .6, ease: 'easeOut' }}
          strokeLinecap="round" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '.52rem', fontWeight: 800, color }}>
        {daysLeft <= 0 ? '!' : daysLeft}
      </div>
    </div>
  );
}

// ── Spaced-repetition card ───────────────────────────────────────────────────
function SRCard({ item, onValidate, onDelete }) {
  const { t } = useTranslation();
  const { s, chapName, key, ni, daysLeft } = item;
  const color = s.color || '#4A90D9';
  const isDue = daysLeft <= 0;
  const isSoon = daysLeft > 0 && daysLeft <= 3;
  const statusColor = isDue ? '#E74C3C' : isSoon ? '#F1C40F' : '#27AE60';
  const [validating, setValidating] = useState(false);

  const nextInterval = SR_INTERVALS[ni + 1];
  const nextLabel = nextInterval != null
    ? `→ ${t('repetition.dayPlus', { count: nextInterval })}`
    : `→ ${t('repetition.finished')}`;
  const stepLabel = ni === 0 ? t('repetition.rep1') : ni === 1 ? t('repetition.rep2') : t('repetition.repFinal');

  async function handleValidate(difficulty) {
    setValidating(true);
    await onValidate(key, difficulty);
    setValidating(false);
  }

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20, scale: .95 }}
      style={{
        display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px',
        background: isDue ? 'rgba(231,76,60,.06)' : 'var(--bg-card)',
        border: `1px solid ${isDue ? 'rgba(231,76,60,.2)' : 'var(--border)'}`,
        borderLeft: `3px solid ${color}`, borderRadius: 12,
        boxShadow: isDue ? `0 0 20px rgba(231,76,60,.08)` : 'none',
        transition: 'box-shadow .3s',
      }}>

      {/* Row 1: ring + name + delete */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <MiniRing daysLeft={Math.max(0, daysLeft)} maxDays={SR_INTERVALS[ni] || 30} color={statusColor} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)',
            display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{s.name}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '.72rem', fontWeight: 400,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chapName}</span>
          </div>
          <div style={{ fontSize: '.75rem', fontWeight: 800, color: statusColor, marginTop: 2 }}>
            {isDue ? t('repetition.today') : t('repetition.daysLeft', { count: daysLeft })}
            <span style={{ fontSize: '.58rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>
              {nextLabel}
            </span>
          </div>
        </div>
        <button onClick={() => onDelete(key)}
          style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid rgba(231,76,60,.2)',
            background: 'rgba(231,76,60,.06)', color: '#E74C3C', fontSize: '.7rem',
            cursor: 'pointer', flexShrink: 0 }}>
          🗑
        </button>
      </div>

      {/* Row 2: interval badges + validate button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {SR_INTERVALS.map((interval, i) => (
          <div key={i} style={{ padding: '2px 7px', borderRadius: 8, fontSize: '.58rem', fontWeight: 700,
            background: i < ni ? `${color}25` : i === ni ? `${statusColor}20` : 'var(--bg-card-hover)',
            color: i < ni ? color : i === ni ? statusColor : 'var(--text-muted)',
            border: `1px solid ${i === ni ? `${statusColor}40` : 'transparent'}` }}>
            {i < ni ? '✓' : ''}{t('repetition.dayPlus', { count: interval })}
          </div>
        ))}
        <span style={{ fontSize: '.58rem', color: 'var(--text-muted)' }}>
          {stepLabel}
        </span>
        {isDue && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 5 }}>
            {[
              { d: 'hard',   label: t('repetition.hard'),   c: '#E74C3C', bg: 'rgba(231,76,60,.12)' },
              { d: 'normal', label: t('repetition.normal'), c: '#F1C40F', bg: 'rgba(241,196,15,.12)' },
              { d: 'easy',   label: t('repetition.easy'),   c: '#27AE60', bg: 'rgba(39,174,96,.12)' },
            ].map(opt => (
              <motion.button key={opt.d} whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }}
                onClick={() => handleValidate(opt.d)} disabled={validating}
                title={t('repetition.validate')}
                style={{ padding: '5px 10px', borderRadius: 9, border: `1px solid ${opt.c}55`,
                  background: opt.bg, color: opt.c, fontSize: '.68rem', fontWeight: 700, cursor: 'pointer' }}>
                {validating ? '…' : opt.label}
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Chapter grid (schedule a first study) ────────────────────────────────────
function ChapterGrid({ subjects, srData, onMark }) {
  const { t } = useTranslation();
  const [selSubj, setSelSubj] = useState(subjects[0]?.id ? String(subjects[0].id) : '');
  const subj = subjects.find(s => String(s.id) === selSubj);
  const chaps = subj?.chapters || Array.from({ length: subj?.chaps || 0 }, (_, i) => ({ name: t('repetition.chapterFull', { count: i + 1 }) }));

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>📌 {t('repetition.planTitle')}</h3>

      {/* Subject pills */}
      <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
        {subjects.map(s => {
          const active = String(s.id) === selSubj;
          return (
            <motion.button key={s.id} onClick={() => setSelSubj(String(s.id))}
              whileHover={{ scale: 1.04 }} whileTap={{ scale: .97 }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 16, flexShrink: 0,
                border: `1px solid ${active ? s.color : 'var(--border)'}`,
                background: active ? `${s.color}15` : 'var(--bg-card-hover)',
                color: active ? s.color : 'var(--text-muted)', fontSize: '.75rem', fontWeight: active ? 700 : 400,
                cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.color }} />
              {s.name}
            </motion.button>
          );
        })}
      </div>

      {/* Chapter grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 6 }}>
        {chaps.map((c, i) => {
          const key = `${selSubj}_${i}`;
          const sr = srData[key];
          const done = sr?.firstStudy;
          const reviews = sr?.reviews?.length || 0;
          const finished = reviews >= SR_INTERVALS.length;
          const color = subj?.color || '#4A90D9';

          return (
            <motion.button key={i} whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: .97 }}
              onClick={() => !done && onMark(parseInt(selSubj, 10), i)}
              style={{ padding: '10px 8px', borderRadius: 10, border: `1px solid ${
                finished ? `${color}50` : done ? `${color}30` : 'rgba(255,255,255,.07)'}`,
                background: finished ? `${color}15` : done ? `${color}08` : 'var(--bg-card-hover)',
                cursor: done ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div style={{ fontSize: '.7rem', fontWeight: 600, color: finished ? color : done ? `${color}80` : 'var(--text-secondary)',
                textAlign: 'center', lineHeight: 1.3 }}>
                {c.name || t('repetition.chapterShort', { count: i + 1 })}
              </div>
              <div style={{ fontSize: '.6rem', fontWeight: 700,
                color: finished ? color : done ? '#F1C40F' : 'rgba(255,255,255,.25)' }}>
                {finished ? `✓ ${t('repetition.finished')}` : done ? t('repetition.dayPlus', { count: SR_INTERVALS[reviews] }) : `+ ${t('repetition.plan')}`}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function PageRepetition({ user }) {
  const { t } = useTranslation();
  const tour = useGuidedTour('repetition');
  const [subjects, setSubjects] = useState([]);
  const [srData, setSrData]     = useState({});
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('all'); // 'all' | 'due' | 'soon'

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'data', 'main'), snap => {
      if (snap.exists()) {
        const d = snap.data();
        setSubjects(d.subjects || []);
        setSrData(d.srData || {});
      }
      setLoading(false);
    });
    return unsub;
  }, [user]);

  async function save(newSr) {
    try { await updateDoc(doc(db, 'users', user.uid, 'data', 'main'), { srData: newSr }); }
    catch (e) { reportSaveError(e, 'Repetition — save'); }
  }

  function markFirst(sid, ci) {
    const key = `${sid}_${ci}`;
    if (srData[key]?.firstStudy) return;
    const updated = { ...srData, [key]: { firstStudy: Date.now(), reviews: [] } };
    setSrData(updated); save(updated);
  }

  function validate(key, difficulty = 'normal') {
    const sr = srData[key];
    if (!sr) return;
    const updated = { ...srData, [key]: {
      ...sr,
      reviews: [...(sr.reviews || []), Date.now()],
      ease: nextEase(sr.ease, difficulty),
    } };
    setSrData(updated); save(updated);
  }

  function deleteEntry(key) {
    const updated = { ...srData };
    delete updated[key];
    setSrData(updated); save(updated);
  }

  // Build the list of pending reviews.
  const now = Date.now();
  const items = [];
  subjects.forEach(s => {
    const chaps = s.chapters || Array.from({ length: s.chaps }, (_, i) => ({ name: t('repetition.chapterFull', { count: i + 1 }) }));
    chaps.forEach((c, i) => {
      const key = `${s.id}_${i}`;
      const sr = srData[key];
      if (!sr) return;
      const ni = (sr.reviews || []).length;
      if (isMastered(sr)) return;
      const dl = Math.ceil((nextDueMs(sr) - now) / 86400000);
      items.push({ s, ci: i, chapName: c.name || t('repetition.chapterFull', { count: i + 1 }), key, ni, daysLeft: dl });
    });
  });
  items.sort((a, b) => a.daysLeft - b.daysLeft);

  const due   = items.filter(i => i.daysLeft <= 0);
  const soon  = items.filter(i => i.daysLeft > 0 && i.daysLeft <= 7);
  const later = items.filter(i => i.daysLeft > 7);

  const displayed = filter === 'due' ? due : filter === 'soon' ? [...due, ...soon] : items;

  // Global progress.
  const totalPlanned  = Object.keys(srData).length;
  const totalFinished = Object.values(srData).filter(isMastered).length;
  const globalPct     = totalPlanned > 0 ? Math.round(totalFinished / totalPlanned * 100) : 0;

  const stats = [
    { v: due.length,   l: t('repetition.statDue'),    c: '#E74C3C', bg: 'rgba(231,76,60,.08)'  },
    { v: soon.length,  l: t('repetition.stat7days'),  c: '#F1C40F', bg: 'rgba(241,196,15,.08)' },
    { v: later.length, l: t('repetition.statLater'),  c: '#27AE60', bg: 'rgba(39,174,96,.08)'  },
  ];
  const filters = [
    { v: 'all',  l: t('repetition.filterAll',  { count: items.length }) },
    { v: 'due',  l: `🔴 ${t('repetition.filterDue',  { count: due.length })}` },
    { v: 'soon', l: `🟡 ${t('repetition.filterSoon', { count: due.length + soon.length })}` },
  ];

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
      <motion.div animate={{ opacity: [.3, 1, .3] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</motion.div>
    </div>
  );

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

      <TourButton onClick={tour.start} label={t('common.guidedTour')} />

      {/* Header + progress */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 16, alignItems: 'center',
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '1rem 1.2rem' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--accent)' }}>{globalPct}%</div>
          <div style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>{t('repetition.mastered')}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '.8rem', color: 'var(--text-secondary)' }}>{t('repetition.globalProgress')}</span>
            <span style={{ fontSize: '.75rem', color: '#4A90D9', fontWeight: 700 }}>{totalFinished}/{totalPlanned}</span>
          </div>
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${globalPct}%` }} transition={{ duration: .8, ease: 'easeOut' }}
              style={{ height: '100%', background: 'linear-gradient(90deg,#4A90D9,#6366f1)', borderRadius: 10 }} />
          </div>
          <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t('repetition.hintReview')}{' '}
            <strong style={{ color: '#4A90D9' }}>{t('repetition.dayPlus', { count: 1 })}</strong>,{' '}
            <strong style={{ color: '#4A90D9' }}>{t('repetition.dayPlus', { count: 7 })}</strong> {t('repetition.hintAnd')}{' '}
            <strong style={{ color: '#4A90D9' }}>{t('repetition.dayPlus', { count: 30 })}</strong>{' '}
            {t('repetition.hintAnchor')}
          </div>
        </div>
      </div>

      {/* Due-reviews reminder banner */}
      {due.length > 0 && (
        <div data-tour="tour-rep-due">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
            background: 'linear-gradient(135deg,rgba(231,76,60,.12),rgba(231,76,60,.06))',
            border: '1px solid rgba(231,76,60,.3)', borderRadius: 12 }}>
          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
            style={{ fontSize: '1.4rem', flexShrink: 0 }}>🔔</motion.div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.85rem', fontWeight: 700, color: '#E74C3C', marginBottom: 2 }}>
              {t('repetition.dueBanner', { count: due.length })}
            </div>
            <div style={{ fontSize: '.7rem', color: 'var(--text-secondary)' }}>
              {due.map(d => `${d.s.name} · ${d.chapName}`).slice(0, 3).join(' — ')}
              {due.length > 3 ? ` ${t('repetition.andMore', { count: due.length - 3 })}` : ''}
            </div>
          </div>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: .97 }}
            onClick={() => setFilter('due')}
            style={{ padding: '6px 14px', borderRadius: 9, border: 'none',
              background: 'rgba(231,76,60,.3)', color: '#fff',
              fontSize: '.75rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
            {t('repetition.see')} →
          </motion.button>
        </motion.div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        {stats.map((s, i) => (
          <motion.div key={i} whileHover={{ scale: 1.02 }}
            style={{ textAlign: 'center', padding: '12px', background: s.bg, border: `1px solid ${s.c}20`, borderRadius: 12, cursor: 'pointer' }}
            onClick={() => setFilter(i === 0 ? 'due' : i === 1 ? 'soon' : 'all')}>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: s.c, lineHeight: 1 }}>{s.v}</div>
            <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 3 }}>{s.l}</div>
          </motion.div>
        ))}
      </div>

      {/* Chapter grid */}
      {subjects.length > 0 && (
        <div data-tour="tour-rep-mark">
          <ChapterGrid subjects={subjects} srData={srData} onMark={markFirst} />
        </div>
      )}

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 6 }}>
        {filters.map(f => (
          <button key={f.v} onClick={() => setFilter(f.v)}
            style={{ padding: '5px 14px', borderRadius: 20,
              border: `1px solid ${filter === f.v ? 'var(--accent)' : 'var(--border)'}`,
              background: filter === f.v ? 'var(--accent-subtle)' : 'transparent',
              color: filter === f.v ? 'var(--accent)' : 'var(--text-muted)', fontSize: '.75rem', cursor: 'pointer' }}>
            {f.l}
          </button>
        ))}
      </div>

      {/* SR list */}
      <div data-tour="tour-rep-list">
      {displayed.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <EmptyState
            icon={PartyPopper}
            description={items.length === 0 ? t('repetition.emptyAll') : t('repetition.emptyFiltered')}
          />
        </motion.div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filter === 'all' && due.length > 0 && (
            <div style={{ fontSize: '.65rem', fontWeight: 700, color: '#E74C3C', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              🔴 {t('repetition.dueToday')}
            </div>
          )}
          <AnimatePresence>
            {displayed.map(item => (
              <SRCard key={item.key} item={item} onValidate={validate} onDelete={deleteEntry} />
            ))}
          </AnimatePresence>
        </div>
      )}
      </div>

      <GuidedTour active={tour.active} step={tour.step} steps={tour.steps}
        onNext={tour.next} onPrev={tour.prev} onStop={tour.stop} />
    </div>
  );
}