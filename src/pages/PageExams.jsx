/**
 * PageExams — Exam countdowns + grade simulator (per subject)
 * --------------------------------------------------------------------------
 * Each subject can hold an exam `date`, a weight (`ects` or `coeff`), and a
 * list of `epreuves` (tests): { name, note, sim, pct, max }.
 *   - note : real grade   | sim : simulated grade   (toggled by `simMode`)
 *   - pct  : weight of the test within the subject (%)   | max : grade scale
 * The subject grade is a weighted average; the global average weighs subjects
 * by ECTS (or coeff). Reaching the target triggers confetti.
 *
 * Reads/writes `users/{uid}/data/main` → `subjects`.
 *
 * Props: { user }
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useTranslation } from '../i18n';
import { GuidedTour, useGuidedTour, TourButton } from '../components/GuidedTour';
import { reportSaveError, reportError } from '../lib/notify';

// ── Pure helpers ─────────────────────────────────────────────────────────────
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr) - today) / 86400000);
}

/** Weighted subject grade (out of 20) from its tests, or null if none scored. */
function calcNote(epreuves = [], simMode = false) {
  const valid = epreuves.filter(e => {
    const v = simMode && e.sim != null && e.sim !== '' ? e.sim : e.note;
    return v != null && v !== '' && !isNaN(parseFloat(v));
  });
  if (!valid.length) return null;
  const totalPct = valid.reduce((a, e) => a + (parseFloat(e.pct) || 100), 0);
  if (totalPct <= 0) return null;
  return valid.reduce((a, e) => {
    const v = simMode && e.sim != null && e.sim !== '' ? e.sim : e.note;
    return a + (parseFloat(v) / (parseFloat(e.max) || 20) * 20) * (parseFloat(e.pct) || 100);
  }, 0) / totalPct;
}

// ── Confetti ─────────────────────────────────────────────────────────────────
function Confetti({ active }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!active || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const particles = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width, y: -20,
      r: Math.random() * 6 + 3,
      color: ['#4A90D9', '#9B59B6', '#27AE60', '#F1C40F', '#E74C3C', '#57FF2B'][Math.floor(Math.random() * 6)],
      speed: Math.random() * 3 + 2, angle: Math.random() * Math.PI * 2, spin: (Math.random() - .5) * .15,
    }));
    let raf;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.y += p.speed; p.x += Math.sin(p.angle) * 2; p.angle += p.spin;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
        ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, 1 - p.y / canvas.height);
        ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r);
        ctx.restore();
      });
      if (particles.some(p => p.y < canvas.height)) raf = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return active ? <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none' }} /> : null;
}

// ── Radar chart (subjects with a grade) ──────────────────────────────────────
function RadarChart({ subjects, simMode }) {
  if (!subjects.length) return null;
  const size = 220, cx = size / 2, cy = size / 2, r = 80;
  const filtered = subjects.filter(s => calcNote(s.epreuves, simMode) !== null);
  if (filtered.length < 3) return null;
  const n = filtered.length;
  const points = filtered.map((s, i) => {
    const note = calcNote(s.epreuves, simMode) || 0;
    const pct = note / 20;
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(angle) * r * pct, y: cy + Math.sin(angle) * r * pct, lx: cx + Math.cos(angle) * (r + 22), ly: cy + Math.sin(angle) * (r + 22), note, name: s.name, color: s.color || '#4A90D9' };
  });
  const gridPoints = (pct) => filtered.map((_, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return `${cx + Math.cos(angle) * r * pct},${cy + Math.sin(angle) * r * pct}`;
  }).join(' ');
  const polygon = points.map(p => `${p.x},${p.y}`).join(' ');
  const axisLines = filtered.map((_, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    return `M ${cx} ${cy} L ${cx + Math.cos(angle) * r} ${cy + Math.sin(angle) * r}`;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {[.25, .5, .75, 1].map(pct => (
          <polygon key={pct} points={gridPoints(pct)} fill="none" stroke="var(--border)" strokeWidth="1" />
        ))}
        {axisLines.map((d, i) => <path key={i} d={d} stroke="var(--border)" strokeWidth="1" />)}
        <polygon points={polygon} fill="rgba(74,144,217,.2)" stroke="#4A90D9" strokeWidth="1.5" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill={p.color} stroke="rgba(0,0,0,.3)" strokeWidth="1" />
        ))}
        {points.map((p, i) => (
          <text key={i} x={p.lx} y={p.ly} textAnchor="middle" dominantBaseline="middle"
            fontSize="8" fill="var(--text-secondary)" style={{ fontFamily: 'sans-serif' }}>
            {p.name.length > 8 ? p.name.slice(0, 7) + '…' : p.name}
          </text>
        ))}
        {[5, 10, 15, 20].map(v => (
          <text key={v} x={cx + 4} y={cy - r * (v / 20) + 4} fontSize="7" fill="var(--text-muted)" style={{ fontFamily: 'sans-serif' }}>{v}</text>
        ))}
      </svg>
    </div>
  );
}

// ── Exam countdown card ──────────────────────────────────────────────────────
function ExamCountdownCard({ subject, index }) {
  const { t, formatDate } = useTranslation();
  const days = daysUntil(subject.date);
  const color = subject.color || '#4A90D9';
  const total = subject.totalBlocks || 0;
  const progPct = total > 0 ? Math.round((subject.doneBlocks || 0) / total * 100) : 0;
  const urgency = days === null ? 'none' : days < 0 ? 'past' : days === 0 ? 'today' : days <= 7 ? 'urgent' : days <= 14 ? 'soon' : 'ok';
  const urgConfig = {
    past: { badge: '#6b7280' }, today: { badge: '#E74C3C' },
    urgent: { badge: '#E74C3C' }, soon: { badge: '#F1C40F' },
    ok: { badge: '#27AE60' }, none: { badge: '#6b7280' },
  }[urgency];
  const r = 24, circ = 2 * Math.PI * r;
  const pct = days === null || days < 0 ? 0 : Math.min(days / 30, 1);

  return (
    <motion.div initial={{ opacity: 0, scale: .92 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * .06 }} whileHover={{ y: -4 }}
      style={{ background: 'var(--bg-card)', border: `1px solid var(--border)`,
        borderRadius: 14, padding: '1rem', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -20, right: -20, width: 70, height: 70, borderRadius: '50%', background: color, opacity: .08, filter: 'blur(18px)', pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
          <span style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{subject.name}</span>
        </div>
        {subject.ects && <span style={{ fontSize: '.58rem', padding: '1px 6px', borderRadius: 8, background: 'rgba(74,144,217,.2)', color: '#93c5fd' }}>{subject.ects} ECTS</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
          <svg width="56" height="56" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r={r} fill="none" stroke="var(--border)" strokeWidth="4" />
            <motion.circle cx="28" cy="28" r={r} fill="none" stroke={urgConfig.badge} strokeWidth="4"
              strokeDasharray={circ} strokeLinecap="round"
              initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: circ * pct }}
              transition={{ duration: 1, delay: index * .06 + .3, ease: 'easeOut' }}
              style={{ transformOrigin: '28px 28px', transform: 'rotate(-90deg)' }} />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: urgency === 'past' || urgency === 'today' ? '1rem' : '.82rem', fontWeight: 800, color: urgConfig.badge, lineHeight: 1 }}>
              {urgency === 'past' ? '✓' : urgency === 'today' ? '!' : days ?? '—'}
            </span>
            {days !== null && days > 0 && <span style={{ fontSize: '.44rem', color: 'var(--text-muted)' }}>{t('exams.days')}</span>}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          {subject.date && <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', marginBottom: 5 }}>📅 {formatDate(subject.date, { day: '2-digit', month: '2-digit', year: 'numeric' })}</div>}
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 2 }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${progPct}%` }} transition={{ duration: .8, delay: index * .06 + .5 }}
              style={{ height: '100%', background: color, borderRadius: 10 }} />
          </div>
          <div style={{ fontSize: '.58rem', color: 'var(--text-muted)' }}>{progPct}% {t('exams.ofBlocks')}</div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Grade row (subject + its tests) ──────────────────────────────────────────
function GradeRow({ subject, onUpdate, onSave, index, simMode }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  // New-test form state (replaces the old getElementById hacks).
  const [newName, setNewName] = useState('');
  const [newPct, setNewPct]   = useState(100);
  const [newMax, setNewMax]   = useState(20);

  const note = calcNote(subject.epreuves, simMode);
  const noteColor = note === null ? 'rgba(255,255,255,.25)' : note >= 14 ? '#27AE60' : note >= 10 ? '#F1C40F' : '#E74C3C';
  const noteBg = note === null ? 'transparent' : note >= 14 ? 'rgba(39,174,96,.15)' : note >= 10 ? 'rgba(241,196,15,.12)' : 'rgba(231,76,60,.15)';
  const color = subject.color || '#4A90D9';
  const weightLabel = subject.ects ? `${subject.ects} ECTS` : subject.coeff ? `×${subject.coeff}` : '';

  function resetAddForm() { setNewName(''); setNewPct(100); setNewMax(20); setShowAdd(false); }

  function addEpreuve() {
    if (!newName.trim()) return;
    const updated = [...(subject.epreuves || []), { name: newName.trim(), note: '', sim: '', pct: parseFloat(newPct) || 100, max: parseFloat(newMax) || 20 }];
    onUpdate(subject.id, updated);
    onSave(subject.id, updated);
    resetAddForm();
  }

  function removeEpreuve(i) {
    const updated = (subject.epreuves || []).filter((_, j) => j !== i);
    onUpdate(subject.id, updated);
    onSave(subject.id, updated);
  }

  function updateEpreuve(i, field, value) {
    const updated = [...(subject.epreuves || [])];
    updated[i] = { ...updated[i], [field]: value };
    onUpdate(subject.id, updated);
  }

  function saveEpreuve(i, field, value) {
    const updated = [...(subject.epreuves || [])];
    updated[i] = { ...updated[i], [field]: value };
    onSave(subject.id, updated);
  }

  return (
    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * .04 }}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div onClick={() => setExpanded(e => !e)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', cursor: 'pointer' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.03)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        <div style={{ width: 3, height: 26, borderRadius: 3, background: color, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: '.87rem', fontWeight: 600, color: 'var(--text-primary)' }}>{subject.name}</span>
        {weightLabel && <span style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>{weightLabel}</span>}
        {note !== null
          ? <div style={{ padding: '3px 10px', borderRadius: 20, background: noteBg, border: `1px solid ${noteColor}44` }}>
              <span style={{ fontSize: '.9rem', fontWeight: 800, color: noteColor }}>{note.toFixed(1)}</span>
              <span style={{ fontSize: '.58rem', color: 'rgba(255,255,255,.3)', marginLeft: 2 }}>/20</span>
            </div>
          : <span style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>—</span>}
        <motion.span animate={{ rotate: expanded ? 180 : 0 }} style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>▼</motion.span>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .22 }}
            style={{ overflow: 'hidden' }}>
            <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>

              {/* Tests */}
              {(subject.epreuves || []).length === 0
                ? <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '6px 0' }}>{t('exams.noTests')}</p>
                : (subject.epreuves || []).map((e, i) => {
                  const val = simMode && e.sim != null && e.sim !== '' ? e.sim : e.note;
                  const valNum = parseFloat(val);
                  const maxNum = parseFloat(e.max) || 20;
                  const vColor = !val || isNaN(valNum) ? 'rgba(255,255,255,.3)' : valNum / maxNum >= .7 ? '#27AE60' : valNum / maxNum >= .5 ? '#F1C40F' : '#E74C3C';
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                      <input value={e.name || ''} onChange={ev => updateEpreuve(i, 'name', ev.target.value)}
                        onBlur={ev => saveEpreuve(i, 'name', ev.target.value)}
                        style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '.75rem', outline: 'none', minWidth: 60 }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input type="number" min="0" max="100" placeholder="100"
                          defaultValue={e.pct || 100}
                          onBlur={ev => saveEpreuve(i, 'pct', parseFloat(ev.target.value) || 100)}
                          style={{ width: 36, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-secondary)', fontSize: '.65rem', textAlign: 'center' }} />
                        <span style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>%</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input type="number" min="0" max={e.max || 20} step="0.5"
                          placeholder="—"
                          defaultValue={simMode ? (e.sim != null && e.sim !== '' ? e.sim : '') : (e.note != null && e.note !== '' ? e.note : '')}
                          onBlur={ev => saveEpreuve(i, simMode ? 'sim' : 'note', ev.target.value)}
                          style={{ width: 46, padding: '3px 5px', borderRadius: 6, border: `1px solid ${vColor}55`, background: 'rgba(255,255,255,.07)', color: vColor, fontSize: '.8rem', textAlign: 'center', fontWeight: 700 }} />
                        <span style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>/{e.max || 20}</span>
                      </div>
                      <button onClick={() => removeEpreuve(i)}
                        style={{ width: 20, height: 20, borderRadius: '50%', border: 'none', background: 'rgba(231,76,60,.2)', color: '#E74C3C', fontSize: '.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
                    </div>
                  );
                })}

              {/* Add test form */}
              <AnimatePresence>
                {showAdd && (
                  <motion.div initial={{ opacity: 0, y: -6, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: .98 }} transition={{ duration: .18 }}
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border-strong)', borderRadius: 10, padding: '12px', display: 'flex', flexDirection: 'column', gap: 10 }}>

                    <div>
                      <label style={{ fontSize: '.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>{t('exams.testName')}</label>
                      <input value={newName} onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addEpreuve()}
                        placeholder={t('exams.testNamePlaceholder')} autoFocus
                        style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border-strong)', background: 'var(--bg-modal)', color: 'var(--text-primary)', fontSize: '.8rem', boxSizing: 'border-box', outline: 'none' }} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ fontSize: '.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>{t('exams.weight')}</label>
                        <input type="number" min="1" max="100" value={newPct} onChange={e => setNewPct(e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-modal)', color: 'var(--text-primary)', fontSize: '.8rem', boxSizing: 'border-box', textAlign: 'center' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '.62rem', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>{t('exams.gradeOutOf')}</label>
                        <input type="number" min="1" max="100" value={newMax} onChange={e => setNewMax(e.target.value)}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-modal)', color: 'var(--text-primary)', fontSize: '.8rem', boxSizing: 'border-box', textAlign: 'center' }} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={resetAddForm}
                        style={{ flex: 1, padding: '7px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '.75rem', cursor: 'pointer' }}>
                        {t('common.cancel')}
                      </button>
                      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: .97 }} onClick={addEpreuve}
                        style={{ flex: 2, padding: '7px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '.78rem', fontWeight: 700, cursor: 'pointer' }}>
                        + {t('exams.addTestBtn')}
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {!showAdd && (
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: .97 }} onClick={() => setShowAdd(true)}
                  style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8,
                    border: '1px dashed var(--accent)', background: 'var(--accent-subtle)', color: 'var(--accent)', fontSize: '.75rem', fontWeight: 600, cursor: 'pointer' }}>
                  + {t('exams.addTest')}
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function PageExams({ user }) {
  const { t } = useTranslation();
  const tour = useGuidedTour('exams');
  const [subjects, setSubjects] = useState([]);
  const [target, setTarget]     = useState(12);
  const [loading, setLoading]   = useState(true);
  const [simMode]   = useState(true);
  const [filter, setFilter]     = useState('all');      // 'all' | 'upcoming' | 'past' — default: show all, sorted by date
  const [sortBy, setSortBy]     = useState('date');     // 'date' | 'note'
  const [confetti, setConfetti] = useState(false);
  const [countdownOpen, setCountdownOpen] = useState(true);
  const prevAvg = useRef(null);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'data', 'main'), snap => {
      if (snap.exists()) setSubjects(snap.data().subjects || []);
      setLoading(false);
    });
    return unsub;
  }, [user]);

  async function saveEpreuves(subjectId, newEpreuves) {
    if (!user) return;
    const updated = subjects.map(s => s.id === subjectId ? { ...s, epreuves: newEpreuves } : s);
    try { await updateDoc(doc(db, 'users', user.uid, 'data', 'main'), { subjects: updated }); }
    catch (e) { reportSaveError(e, 'Exams — save'); }
  }

  function handleUpdate(subjectId, newEpreuves) {
    setSubjects(prev => prev.map(s => s.id === subjectId ? { ...s, epreuves: newEpreuves } : s));
  }

  // Global average (weighted by ECTS/coeff) + ECTS earned.
  let totalW = 0, totalScore = 0, totalEcts = 0, earnedEcts = 0;
  subjects.forEach(s => {
    const note = calcNote(s.epreuves, simMode); const w = s.ects || s.coeff || 1;
    if (note !== null) { totalScore += note * w; totalW += w; }
    if (s.ects) { totalEcts += s.ects; if (note !== null && note >= 10) earnedEcts += s.ects; }
  });
  const avg = totalW > 0 ? totalScore / totalW : null;
  const avgColor = avg === null ? 'rgba(255,255,255,.4)' : avg >= target ? '#27AE60' : avg >= 10 ? '#F1C40F' : '#E74C3C';

  // Confetti when the target is first reached.
  useEffect(() => {
    if (avg !== null && target && avg >= target && (prevAvg.current === null || prevAvg.current < target)) {
      setConfetti(true);
      setTimeout(() => setConfetti(false), 3500);
    }
    prevAvg.current = avg;
  }, [avg, target]);

  // Filter + sort.
  let displayed = [...subjects];
  if (filter === 'upcoming') displayed = displayed.filter(s => { const d = daysUntil(s.date); return d === null || d >= 0; });
  if (filter === 'past')     displayed = displayed.filter(s => { const d = daysUntil(s.date); return d !== null && d < 0; });
  if (sortBy === 'date') displayed.sort((a, b) => { if (!a.date) return 1; if (!b.date) return -1; return new Date(a.date) - new Date(b.date); });
  if (sortBy === 'note') displayed.sort((a, b) => {
    const na = calcNote(a.epreuves, simMode), nb = calcNote(b.epreuves, simMode);
    if (na === null && nb === null) return 0; if (na === null) return 1; if (nb === null) return -1; return nb - na;
  });

  const withDate = displayed.filter(s => s.date);

  async function copyRecap() {
    let text = `${t('exams.recapTitle2', { mode: simMode ? t('exams.recapSim') : t('exams.recapReal') })}\n${t('exams.recapTarget', { target })}\n${t('exams.recapAvg', { avg: avg !== null ? avg.toFixed(2) : '—' })}\n`;
    if (totalEcts > 0) text += `${t('exams.recapEcts', { earned: earnedEcts, total: totalEcts })}\n`;
    text += '\n';
    subjects.forEach(s => {
      const n = calcNote(s.epreuves, simMode);
      const w = s.ects ? `${s.ects} ECTS` : s.coeff ? `×${s.coeff}` : '';
      text += `• ${s.name}${w ? ' (' + w + ')' : ''} : ${n !== null ? n.toFixed(1) : '—'}/20\n`;
    });
    try { await navigator.clipboard.writeText(text); } catch (e) { reportError(e, 'Exams — copy', "Copie impossible."); }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
      <motion.div animate={{ opacity: [.3, 1, .3] }} transition={{ duration: 1.5, repeat: Infinity }}
        style={{ color: 'var(--text-muted)', fontSize: '.9rem' }}>{t('common.loading')}</motion.div>
    </div>
  );

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 }}>
      <Confetti active={confetti} />

      <TourButton onClick={tour.start} label={t('common.guidedTour')} />

      {/* ── Controls bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>

        {/* Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {[{ v: 'all', l: t('exams.filterAll') }, { v: 'upcoming', l: t('exams.filterUpcoming') }, { v: 'past', l: t('exams.filterPast') }].map(opt => (
            <button key={opt.v} onClick={() => setFilter(opt.v)}
              style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border)', cursor: 'pointer', fontSize: '.72rem',
                background: filter === opt.v ? 'var(--bg-card-hover)' : 'transparent',
                color: filter === opt.v ? 'var(--text-primary)' : 'var(--text-muted)', transition: 'all .15s' }}>
              {opt.l}
            </button>
          ))}
        </div>

        <div style={{ height: 20, width: 1, background: 'var(--border)' }} />

        {/* Sort */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{t('exams.sortBy')}</span>
          {[{ v: 'date', l: t('exams.sortDate') }, { v: 'note', l: t('exams.sortGrade') }].map(opt => (
            <button key={opt.v} onClick={() => setSortBy(opt.v)}
              style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid var(--border)', cursor: 'pointer', fontSize: '.72rem',
                background: sortBy === opt.v ? 'var(--bg-card-hover)' : 'transparent',
                color: sortBy === opt.v ? 'var(--text-primary)' : 'var(--text-muted)', transition: 'all .15s' }}>
              {opt.l}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Target */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{t('exams.target')}</span>
          <input type="number" min="0" max="20" step="0.5" value={target}
            onChange={e => setTarget(parseFloat(e.target.value) || 12)}
            style={{ width: 46, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border-strong)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.82rem', textAlign: 'center', fontWeight: 700 }} />
          <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>/20</span>
        </div>
      </div>

      {/* ── Summary bar ── */}
      <motion.div data-tour="tour-exams-summary" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{ display: 'flex', gap: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ flex: 1, padding: '1.1rem', borderRight: '1px solid var(--border)', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', fontWeight: 900, color: avgColor, lineHeight: 1 }}>
            {avg !== null ? avg.toFixed(2) : '—'}
          </div>
          <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 3 }}>
            {t('exams.average')} {simMode ? t('exams.simulated') : t('exams.real')} /20
          </div>
        </div>
        {totalEcts > 0 && (
          <div style={{ flex: 1, padding: '1.1rem', borderRight: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#4A90D9', lineHeight: 1 }}>
              {earnedEcts}<span style={{ fontSize: '1rem', color: 'rgba(255,255,255,.25)' }}>/{totalEcts}</span>
            </div>
            <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 3 }}>{t('exams.ectsEarned')}</div>
          </div>
        )}
        <div style={{ flex: 1, padding: '1.1rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: avg === null ? 'rgba(255,255,255,.3)' : avg >= target ? '#27AE60' : '#E74C3C' }}>
            {avg === null ? '—' : avg >= target ? t('exams.targetReached') : avg >= target - 2 ? t('exams.almost', { pts: (target - avg).toFixed(2) }) : t('exams.ptsMissing', { pts: (target - avg).toFixed(2) })}
          </div>
          <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 3 }}>{t('exams.vsTarget', { target })}</div>
        </div>
      </motion.div>

      {/* ── Countdown cards ── */}
      <section data-tour="tour-exams-cards">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <h2 style={{ fontSize: '.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>📆 {t('exams.examsTitle')}</h2>
          <div style={{ height: 1, flex: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginRight: 4 }}>{t('exams.dateCount', { count: withDate.length })}</span>
          <motion.button onClick={() => setCountdownOpen(o => !o)} whileTap={{ scale: .92 }}
            style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-card)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexShrink: 0 }}>
            <span style={{ fontSize: '.6rem', display: 'block', transform: countdownOpen ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform .2s' }}>▲</span>
          </motion.button>
        </div>
        <AnimatePresence initial={false}>
          {countdownOpen && (
            <motion.div key={filter}
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: .25 }}
              style={{ overflow: 'hidden' }}>
              {withDate.length === 0
                ? <div style={{ textAlign: 'center', padding: '2.5rem', color: 'rgba(255,255,255,.25)', fontSize: '.82rem', background: 'rgba(255,255,255,.02)', border: '1px dashed rgba(255,255,255,.07)', borderRadius: 14 }}>
                    📭 {t('exams.noExams')}
                  </div>
                : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(185px,1fr))', gap: 10 }}>
                    {withDate.map((s, i) => <ExamCountdownCard key={s.id} subject={s} index={i} />)}
                  </div>}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ── Radar ── */}
      {subjects.filter(s => calcNote(s.epreuves, simMode) !== null).length >= 3 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h3 style={{ fontSize: '.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>🕸️ {t('exams.radarTitle')}</h3>
          <RadarChart subjects={subjects} simMode={simMode} />
        </div>
      )}

      {/* ── Grade calculator ── */}
      <section data-tour="tour-exams-epreuves">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <h2 style={{ fontSize: '.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>🎯 {t('exams.gradesTitle')}</h2>
          <div style={{ height: 1, flex: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>{t('exams.clickHint')}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {displayed.length === 0
            ? <p style={{ color: 'var(--text-muted)', fontSize: '.82rem', textAlign: 'center', padding: '2rem', background: 'var(--bg-card)', border: '1px dashed var(--border)', borderRadius: 12 }}>{t('exams.noSubjects')}</p>
            : displayed.map((s, i) => (
                <GradeRow key={s.id} subject={s} onUpdate={handleUpdate} onSave={saveEpreuves} index={i} simMode={simMode} />
              ))}
        </div>
        <button onClick={copyRecap}
          style={{ width: '100%', padding: '9px', border: '1px dashed var(--border)', borderRadius: 10, background: 'transparent', color: 'var(--text-muted)', fontSize: '.78rem', cursor: 'pointer', transition: 'all .2s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-subtle)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}>
          📋 {t('exams.copyRecap')}
        </button>
      </section>

      <GuidedTour active={tour.active} step={tour.step} steps={tour.steps}
        onNext={tour.next} onPrev={tour.prev} onStop={tour.stop} />
    </div>
  );
}