/**
 * PageConfidence — Self-rated confidence per chapter (1–5 stars)
 * --------------------------------------------------------------------------
 * For every subject, the user rates each chapter from 1 to 5 stars (0 = unrated).
 * Ratings are stored in `users/{uid}/data/main` under each subject's `conf`
 * array (one number per chapter, indexed like `chapters` / `chaps`).
 *
 * Props: { user }
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useTranslation } from '../i18n';
import { GuidedTour, useGuidedTour, TourButton } from '../components/GuidedTour';
import { reportSaveError } from '../lib/notify';

// ── Small helpers ────────────────────────────────────────────────────────────

/** Average of a numeric array (0 when empty). */
function average(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

/** Whether the active theme is light (read once from the --bg-base CSS var). */
function isLightTheme() {
  try {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim();
    if (bg.startsWith('#')) return parseInt(bg.slice(1, 3), 16) > 200;
    if (bg.includes('rgb')) { const nums = bg.match(/\d+/g); return nums && parseInt(nums[0]) > 200; }
  } catch { /* ignore */ }
  return false;
}

// ── Star row (1–5) ───────────────────────────────────────────────────────────
// `isLight` is passed in (computed once by the parent) so we never read the
// computed style on every render / hover.
function StarRow({ value, color, onChange, size = 18, isLight = false }) {
  const [hovered, setHovered] = useState(0);

  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <motion.button key={n}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(n === value ? 0 : n)}
          whileTap={{ scale: .8 }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1, lineHeight: 1 }}>
          <svg width={size} height={size} viewBox="0 0 24 24">
            <motion.path
              d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              animate={{
                fill: n <= (hovered || value) ? color : 'var(--border-strong)',
                filter: n <= (hovered || value) && !isLight
                  ? `drop-shadow(0 0 3px ${color})`
                  : 'none',
              }}
              transition={{ duration: .12 }}
            />
          </svg>
        </motion.button>
      ))}
    </div>
  );
}

// ── Mini ring (average score) ────────────────────────────────────────────────
function MiniRing({ avg, color, size = 52 }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const pct = avg / 5;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)', position: 'absolute', inset: 0 }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={4} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - pct) }}
          transition={{ duration: .7, ease: 'easeOut' }}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${color}80)` }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '.7rem', fontWeight: 800, color }}>{avg.toFixed(1)}</span>
      </div>
    </div>
  );
}

// ── Subject row (list) ───────────────────────────────────────────────────────
function SubjectRow({ subject, index, selected, onSelect, wideScreen }) {
  const { t } = useTranslation();
  const conf = subject.conf || Array(subject.chaps || 0).fill(0);
  const avg = average(conf);
  const color = subject.color || '#4A90D9';
  const avgColor = avg < 2 ? '#E74C3C' : avg < 3.5 ? '#F1C40F' : '#27AE60';
  const weak = conf.filter(v => v > 0 && v < 3).length;
  const isSelected = selected === subject.id;

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * .04 }}
      onClick={() => onSelect(isSelected ? null : subject.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '11px 14px', borderRadius: 12, cursor: 'pointer',
        background: isSelected ? `${color}10` : 'var(--bg-card)',
        border: `1px solid ${isSelected ? color + '40' : 'var(--border)'}`,
        transition: 'all .2s',
      }}
      whileHover={{ y: -1 }}>

      {/* Color dot */}
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color,
        boxShadow: `0 0 6px ${color}`, flexShrink: 0 }} />

      {/* Name */}
      <span style={{ flex: 1, fontSize: '.85rem', fontWeight: 600,
        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {subject.name}
      </span>

      {/* Progress bar */}
      <div style={{ width: 'clamp(40px, 10vw, 80px)', height: 4, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
        <motion.div
          animate={{ width: `${(avg / 5) * 100}%` }}
          transition={{ duration: .6, ease: 'easeOut' }}
          style={{ height: '100%', background: avgColor, borderRadius: 4 }} />
      </div>

      {/* Weak-chapters chip (hidden on very narrow screens) */}
      {weak > 0 && wideScreen && (
        <span style={{ fontSize: '.58rem', padding: '2px 6px', borderRadius: 8,
          background: 'rgba(231,76,60,.12)', color: '#E74C3C', fontWeight: 700, flexShrink: 0 }}>
          {t('confidence.weakCount', { count: weak })}
        </span>
      )}

      {/* Ring */}
      <MiniRing avg={avg} color={avgColor} size={44} />

      {/* Chevron */}
      <motion.span animate={{ rotate: isSelected ? 90 : 0 }} transition={{ duration: .2 }}
        style={{ color: 'var(--text-muted)', fontSize: '.65rem', flexShrink: 0 }}>▶</motion.span>
    </motion.div>
  );
}

// ── Chapter panel (detail of a subject) ──────────────────────────────────────
function ChapterPanel({ subject, onSetConf }) {
  const { t } = useTranslation();
  const conf = subject.conf || Array(subject.chaps || 0).fill(0);
  const chaps = subject.chapters || Array.from({ length: subject.chaps || 0 }, (_, i) => ({ name: t('confidence.chapterFull', { count: i + 1 }) }));
  const color = subject.color || '#4A90D9';
  const avg = average(conf);
  const avgColor = avg < 2 ? '#E74C3C' : avg < 3.5 ? '#F1C40F' : '#27AE60';
  const isLight = isLightTheme(); // computed once per panel render, shared by all stars

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: .22 }}
      style={{
        background: 'var(--bg-card)', border: `1px solid ${color}30`,
        borderRadius: 16, overflow: 'hidden', height: 'fit-content',
        position: 'sticky', top: 80,
      }}>

      {/* Panel header */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color,
          boxShadow: `0 0 8px ${color}` }} />
        <span style={{ flex: 1, fontSize: '.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {subject.name}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 10px', borderRadius: 20,
          background: `${avgColor}15`, border: `1px solid ${avgColor}30` }}>
          <span style={{ fontSize: '.85rem', fontWeight: 800, color: avgColor }}>{avg.toFixed(1)}</span>
          <span style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>/5</span>
        </div>
      </div>

      {/* Chapters */}
      <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 500, overflowY: 'auto' }}>
        {chaps.map((chap, i) => {
          const val = conf[i] || 0;
          const chapColor = val === 0 ? 'var(--text-muted)' : val < 3 ? '#E74C3C' : val < 4 ? '#F1C40F' : '#27AE60';
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 9,
              background: val > 0 ? `${chapColor}08` : 'transparent',
              border: `1px solid ${val > 0 ? chapColor + '20' : 'transparent'}`,
              transition: 'all .2s',
            }}>
              <span style={{ fontSize: '.62rem', color: 'var(--text-muted)',
                minWidth: 22, flexShrink: 0, fontWeight: 600 }}>{i + 1}</span>
              <span style={{ flex: 1, fontSize: '.78rem', color: 'var(--text-secondary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {chap.name || t('confidence.chapterFull', { count: i + 1 })}
              </span>
              <StarRow value={val} color={color}
                onChange={v => onSetConf(subject.id, i, v)} size={15} isLight={isLight} />
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)',
        display: 'flex', gap: 12 }}>
        {[
          { label: t('confidence.mastered'),   val: conf.filter(v => v >= 4).length, color: '#27AE60' },
          { label: t('confidence.inProgress'), val: conf.filter(v => v >= 2 && v < 4).length, color: '#F1C40F' },
          { label: t('confidence.weakPlural'), val: conf.filter(v => v > 0 && v < 2).length, color: '#E74C3C' },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: '.58rem', color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function PageConfidence({ user }) {
  const { t } = useTranslation();
  const tour = useGuidedTour('confidence');
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter]     = useState('all'); // all | weak | strong
  // Reactive flag for the "weak" chip (hidden below 400px).
  const [wideScreen, setWideScreen] = useState(() => typeof window !== 'undefined' && window.innerWidth > 400);

  useEffect(() => {
    function onResize() { setWideScreen(window.innerWidth > 400); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'data', 'main'), snap => {
      if (snap.exists()) setSubjects(snap.data().subjects || []);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  async function handleSetConf(subjId, chapIdx, value) {
    const updated = subjects.map(s => {
      if (s.id !== subjId) return s;
      const conf = [...(s.conf || Array(s.chaps || 0).fill(0))];
      conf[chapIdx] = value;
      return { ...s, conf };
    });
    setSubjects(updated);
    try { await updateDoc(doc(db, 'users', user.uid, 'data', 'main'), { subjects: updated }); }
    catch (e) { reportSaveError(e, 'Confidence — save'); }
  }

  const globalAvg = subjects.length > 0
    ? subjects.reduce((a, s) => a + average(s.conf || []), 0) / subjects.length
    : 0;
  const globalColor = globalAvg < 2 ? '#E74C3C' : globalAvg < 3.5 ? '#F1C40F' : '#27AE60';

  const filteredSubjects = subjects.filter(s => {
    const avg = average(s.conf || []);
    if (filter === 'weak')   return avg < 3;
    if (filter === 'strong') return avg >= 3;
    return true;
  });

  const selectedSubject = subjects.find(s => s.id === selected);

  // Header stats / filter counts.
  const masteredCount = subjects.filter(s => { const a = s.conf || []; return a.length && average(a) >= 4; }).length;
  const toWorkCount   = subjects.filter(s => (s.conf || []).some(c => c > 0 && c < 3)).length;
  const weakFilterCount   = subjects.filter(s => { const a = s.conf || []; return a.length && average(a) < 3; }).length;
  const strongFilterCount = subjects.filter(s => { const a = s.conf || []; return a.length && average(a) >= 3; }).length;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
      <motion.div animate={{ opacity: [.3, 1, .3] }} transition={{ duration: 1.5, repeat: Infinity }}
        style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</motion.div>
    </div>
  );

  if (subjects.length === 0) return (
    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: '2rem', marginBottom: 12 }}>⭐</div>
      <div style={{ fontSize: '.9rem' }}>{t('confidence.noSubjects')}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

      <TourButton onClick={tour.start} label={t('common.guidedTour')} />

      {/* ── Global header ── */}
      <div data-tour="tour-confidence-score" style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '12px 14px',
        flexWrap: 'wrap',
      }}>
        {/* Big number */}
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 12 }}
            style={{ fontSize: 'clamp(1.8rem, 6vw, 2.8rem)', fontWeight: 900, color: globalColor,
              lineHeight: 1, textShadow: `0 0 20px ${globalColor}50` }}>
            {globalAvg.toFixed(1)}
          </motion.div>
          <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 2 }}>/5 {t('confidence.global')}</div>
        </div>

        {/* Bar + stats */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {t('confidence.globalConfidence')}
            </span>
            <span style={{ fontSize: '.75rem', color: globalColor, fontWeight: 600 }}>
              {globalAvg < 2 ? t('confidence.statusLow') : globalAvg < 3.5 ? t('confidence.statusMid') : t('confidence.statusHigh')}
            </span>
          </div>
          <div style={{ height: 7, background: 'var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <motion.div
              animate={{ width: `${(globalAvg / 5) * 100}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              style={{ height: '100%', background: globalColor, borderRadius: 8,
                boxShadow: `0 0 8px ${globalColor}60` }} />
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            {[
              { v: masteredCount, l: t('confidence.masteredSubjects'), c: '#27AE60' },
              { v: toWorkCount,   l: t('confidence.toWork'), c: '#E74C3C' },
              { v: subjects.length, l: t('confidence.subjects'), c: 'var(--text-muted)' },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 900, color: s.c }}>{s.v}</span>
                <span style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>{s.l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Desktop layout: 2 columns when a panel is open ── */}
      <style>{`
        @media (min-width: 640px) {
          .conf-layout { display: grid !important; grid-template-columns: 1fr; gap: 14px; }
          .conf-layout.has-panel { grid-template-columns: 1fr 280px !important; }
        }
      `}</style>

      {/* ── Filters ── */}
      <div data-tour="tour-confidence-filters" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
        {[
          { v: 'all',    l: t('confidence.filterAll'),         count: subjects.length },
          { v: 'weak',   l: `⚠ ${t('confidence.weakPlural')}`,  count: weakFilterCount },
          { v: 'strong', l: `✓ ${t('confidence.masteredSubjects')}`, count: strongFilterCount },
        ].map(f => (
          <motion.button key={f.v} whileTap={{ scale: .96 }}
            onClick={() => setFilter(f.v)}
            style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: '.75rem', fontWeight: filter === f.v ? 700 : 400, flexShrink: 0,
              background: filter === f.v ? 'var(--accent-subtle)' : 'var(--bg-card)',
              color: filter === f.v ? 'var(--accent)' : 'var(--text-muted)',
              outline: filter === f.v ? '1px solid var(--accent-glow)' : '1px solid var(--border)',
              transition: 'all .15s',
            }}>
            {f.l}
            <span style={{ marginLeft: 6, fontSize: '.65rem', opacity: .7 }}>{f.count}</span>
          </motion.button>
        ))}
      </div>

      {/* ── Desktop layout ── */}
      <div className={`conf-layout${selectedSubject ? ' has-panel' : ''}`}
        style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'start' }}>

      {/* ── Subject list ── */}
      <div data-tour="tour-confidence-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filteredSubjects.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)',
            background: 'var(--bg-card)', border: '1px dashed var(--border)', borderRadius: 12 }}>
            {t('confidence.emptyFiltered')}
          </div>
        )}
        {filteredSubjects.map((s, i) => (
          <SubjectRow key={s.id} subject={s} index={i} selected={selected} onSelect={setSelected} wideScreen={wideScreen} />
        ))}
      </div>

      {/* ── Desktop panel (inside the grid) ── */}
      <AnimatePresence>
        {selectedSubject && (
          <div className="chapter-panel-desktop">
            <ChapterPanel subject={selectedSubject} onSetConf={handleSetConf} />
          </div>
        )}
      </AnimatePresence>

      </div>{/* end conf-layout */}

      {/* ── Mobile drawer only ── */}
      <AnimatePresence>
        {selectedSubject && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
                zIndex: 300 }}
              className="mobile-overlay"
            />
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              style={{
                position: 'fixed', bottom: 0, left: 0, right: 0,
                zIndex: 301, borderRadius: '20px 20px 0 0',
                background: 'var(--bg-modal)',
                border: '1px solid var(--border)',
                maxHeight: '80vh', overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
              }}
              className="chapter-panel-mobile">
              <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
                <div style={{ width: 36, height: 4, borderRadius: 4, background: 'var(--border-strong)' }} />
              </div>
              <button onClick={() => setSelected(null)}
                style={{ position: 'absolute', top: 12, right: 16, background: 'transparent',
                  border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>
                ×
              </button>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <ChapterPanel subject={selectedSubject} onSetConf={handleSetConf} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <style>{`
        /* Desktop: panel in the grid, drawer hidden */
        @media (min-width: 640px) {
          .chapter-panel-desktop { display: block !important; }
          .chapter-panel-mobile  { display: none !important; }
          .mobile-overlay        { display: none !important; }
        }
        /* Mobile: drawer visible, desktop panel hidden */
        @media (max-width: 639px) {
          .chapter-panel-desktop { display: none !important; }
          .chapter-panel-mobile  { display: flex !important; }
          .mobile-overlay        { display: block !important; }
        }
      `}</style>

      <GuidedTour active={tour.active} step={tour.step} steps={tour.steps}
        onNext={tour.next} onPrev={tour.prev} onStop={tour.stop} />
    </div>
  );
}