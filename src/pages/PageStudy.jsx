/**
 * PageStudy — Focus timer (free duration + Pomodoro)
 * --------------------------------------------------------------------------
 * A study timer that awards XP and feeds the gamified "reserve". Three modes:
 * free duration, Pomodoro 25/5, Pomodoro 50/10. Ambient sounds and an
 * immersive full-screen focus mode are available.
 *
 * A running session is mirrored to the shared `src/focus/focusSession` store
 * every second, so it survives leaving the (lazily-loaded) study tab: on return
 * the timer reconstructs from the wall clock and keeps counting, and AppPage
 * shows a floating chrono meanwhile. A session that finished while the user was
 * away is banked on the next mount.
 *
 * Firestore writes on a completed/paused session (>= 1 min):
 *   users/{uid}/data/main     : xp, todayMins, todaySess, totalFocusHours, leaves
 *   users/{uid}/data/reserve  : studyTime[subjId], streak, energy, lastStudyDay
 *
 * XP rule: 10 XP per full minute focused.
 *
 * Props: { user, prefs }
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useTranslation } from '../i18n';
import { getDraft, setDraft, liveElapsed } from '../focus/focusSession';
import { GuidedTour, useGuidedTour, TourButton } from '../components/GuidedTour';
import { reportSaveError } from '../lib/notify';
import { bankFocusSession, computeXP } from '../lib/focusBank';
import { playChime } from '../lib/chime';
import { Ring } from '../components/Ring';
import { AMBIENCES, NEEDS_HEADPHONES, createAmbience } from '../lib/ambience';
import {
  VolumeX, CloudRain, Waves, Flame, Trees, Droplets, Moon, Coffee, Brain, Headphones,
} from 'lucide-react';

/** Maps an ambience's `icon` name to its lucide component. */
const AMBIENCE_ICONS = { VolumeX, CloudRain, Waves, Flame, Trees, Droplets, Moon, Coffee, Brain };

// ── Pure helpers ────────────────────────────────────────────────────────────

/** Seconds → "MM:SS". */
function hms(s) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/**
 * Reconstruct a running session from the shared store (if any), advancing its
 * elapsed by the wall-clock time since the last mirror so the timer resumes
 * where it truly is — even after the study tab was unmounted. Returns the
 * resumed engine values, or null when there is nothing to resume.
 * `timeLeft <= 0` means the session finished while the user was away.
 */
function computeResumed() {
  const d = getDraft();
  if (!d || !d.running) return null;
  const elapsed = liveElapsed(d);
  return { ...d, elapsed, timeLeft: d.totalTime - elapsed };
}

/**
 * Ring diameter for the immersive focus overlay, sized to always fit the
 * viewport (leaving room for the subject label + buttons below), so it never
 * overflows on small phones — especially in landscape, where height is scarce.
 */
function computeFocusSize() {
  if (typeof window === 'undefined') return 300;
  const byHeight = window.innerHeight - 170; // reserve for label, controls, gaps
  const byWidth  = window.innerWidth - 40;   // side padding
  return Math.round(Math.max(140, Math.min(300, byHeight, byWidth)));
}

/** Decimal hour (e.g. 9.5) → "9h30". */
function fmtHour(h) {
  const hh = Math.floor(h);
  const mm = h % 1 === 0.5 ? '30' : '00';
  return `${hh}h${mm !== '00' ? mm : ''}`;
}

/** A planning block's ISO date (mirrors PageProgress' blockDateStr). */
function blockDateStr(b) {
  if (b.dateStr) return b.dateStr;
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay() + 1 + (b.weekOffset || 0) * 7 + (b.day || 0));
  return d.toISOString().slice(0, 10);
}

/**
 * Planning blocks that are still to-do, of type "rev", tied to `subjId` and
 * scheduled for today — the candidates to offer marking as done after a focus
 * session on that subject.
 */
function pendingBlocksForToday(blocks, subjId, todayStr) {
  if (!subjId) return [];
  return blocks.filter(b =>
    b.type === 'rev' &&
    b.status !== 'done' &&
    String(b.subj) === String(subjId) &&
    blockDateStr(b) === todayStr
  );
}

// Mode and option definitions. Labels are i18n keys, resolved at render time.
const MODES = [
  { id: 'custom',      labelKey: 'study.modeCustom',     color: '#4A90D9' },
  { id: 'pomodoro',    labelKey: 'study.modePomodoro',   color: '#E74C3C' },
  { id: 'pomodoro50',  labelKey: 'study.modePomodoro50', color: '#9B59B6' },
];
const DURATIONS = [25, 45, 60, 90, 120];
// ── Animated number (counts up to its target) ────────────────────────────────
function Ticker({ value, color = 'var(--xp-color)' }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef(null);
  useEffect(() => {
    if (value === prevRef.current) return;
    const start = prevRef.current, end = value;
    const startTime = performance.now();
    const duration = 600;
    function step(now) {
      const t = Math.min((now - startTime) / duration, 1);
      setDisplay(Math.round(start + (end - start) * t));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else prevRef.current = end;
    }
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);
  return <span style={{ color, fontWeight: 800 }}>{display}</span>;
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function PageStudy({ user, prefs }) {
  const { t, formatDate } = useTranslation();
  const tour = useGuidedTour('study');

  // A session recovered from the shared store, computed once at mount. When it
  // has time left it is resumed live; when time is up it finished while away
  // and is banked on mount (see the resume effect below).
  const [resumed] = useState(computeResumed);
  const liveResume = resumed && resumed.timeLeft > 0 ? resumed : null;

  const [subjects, setSubjects]   = useState([]);
  const [blocks, setBlocks]       = useState([]);       // read-only: planning blocks, to offer marking one done
  const [sessionBlockIds, setSessionBlockIds] = useState([]); // block ids proposed after a session
  const [sessions, setSessions]   = useState([]);       // recent focus-session history
  const [subjId, setSubjId]       = useState(liveResume?.subjId ?? '');
  const [mode, setMode]           = useState(liveResume?.mode ?? 'custom');
  const [duration, setDuration]   = useState(liveResume?.duration ?? 45);
  const [customDur, setCustomDur] = useState(liveResume?.customDur ?? 45);
  const [timeLeft, setTimeLeft]   = useState(liveResume?.timeLeft ?? 45 * 60);
  const [totalTime, setTotalTime] = useState(liveResume?.totalTime ?? 45 * 60);
  const [running, setRunning]     = useState(!!liveResume);
  const [elapsed, setElapsed]     = useState(liveResume?.elapsed ?? 0);
  const [pomoPhase, setPomoPhase] = useState(liveResume?.pomoPhase ?? 'work');
  const [pomoCycle, setPomoCycle] = useState(0);
  const [sound, setSound]         = useState(liveResume?.sound ?? 'none');
  const [volume, setVolume]       = useState(liveResume?.volume ?? 0.5);
  const [xpEarned, setXpEarned]   = useState(0);
  const [showXP, setShowXP]       = useState(false);
  const [loading, setLoading]     = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  // Reactive narrow-screen flag (replaces a non-reactive window.innerWidth read).
  const [isNarrow, setIsNarrow]   = useState(() => typeof window !== 'undefined' && window.innerWidth < 600);
  const [focusSize, setFocusSize] = useState(computeFocusSize); // immersive-mode ring diameter

  const intervalRef = useRef(null);
  const soundRef    = useRef(null);
  const elapsedRef  = useRef(liveResume?.elapsed ?? 0);
  const wakeLockRef = useRef(null);

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch { /* ignore */ }
  }
  function releaseWakeLock() {
    try {
      if (wakeLockRef.current) { wakeLockRef.current.release(); wakeLockRef.current = null; }
    } catch { /* ignore */ }
  }

  // Keep the ring size in sync with viewport width/height (and orientation).
  useEffect(() => {
    function onResize() { setIsNarrow(window.innerWidth < 600); setFocusSize(computeFocusSize()); }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('orientationchange', onResize); };
  }, []);

  // On unmount: stop the ticking interval and release the wake lock so a
  // running timer never leaks when the user navigates away.
  useEffect(() => () => {
    clearInterval(intervalRef.current);
    releaseWakeLock();
  }, []);

  // Subscribe to the user's subjects.
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'data', 'main'), snap => {
      if (snap.exists()) {
        const d = snap.data();
        setSubjects(d.subjects || []);
        setBlocks(d.blocks || []);
        setSessions(Array.isArray(d.sessions) ? d.sessions : []);
        if (!subjId && d.subjects?.length) setSubjId(String(d.subjects[0].id));
      }
      setLoading(false);
    });
    return unsub;
  }, [user]);

  // Recompute the timer length when the mode/duration changes (while stopped).
  useEffect(() => {
    if (running) return;
    let total;
    if (mode === 'pomodoro') total = 25 * 60;
    else if (mode === 'pomodoro50') total = 50 * 60;
    else total = (duration === 'custom' ? customDur : duration) * 60;
    setTotalTime(total); setTimeLeft(total); setElapsed(0); elapsedRef.current = 0;
  }, [mode, duration, customDur]);

  // Start/stop the ambient sound with the timer.
  useEffect(() => {
    if (soundRef.current) { soundRef.current.stop(); soundRef.current = null; }
    if (sound !== 'none' && running) soundRef.current = createAmbience(sound, volume);
    return () => { if (soundRef.current) { soundRef.current.stop(); soundRef.current = null; } };
  }, [sound, running]);

  // Live-update the ambient volume while it plays.
  useEffect(() => {
    soundRef.current?.setVolume(volume);
  }, [volume]);

  function getTotal() {
    if (mode === 'pomodoro') return pomoPhase === 'work' ? 25 * 60 : 5 * 60;
    if (mode === 'pomodoro50') return pomoPhase === 'work' ? 50 * 60 : 10 * 60;
    return (duration === 'custom' ? customDur : duration) * 60;
  }

  function flashXP(xp) {
    setXpEarned(xp);
    setShowXP(true);
    setTimeout(() => setShowXP(false), 3000);
  }

  // Set up the ticking interval, wake lock and ambient sound for the CURRENT
  // config. Does NOT touch `running` — the caller owns that (so it can be used
  // both from toggle() and from the mount-resume effect without a redundant,
  // lint-flagged setState in an effect).
  function beginInterval() {
    requestWakeLock();
    if (sound !== 'none') soundRef.current = createAmbience(sound, volume);
    intervalRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
      // Mirror the live session to the shared store every second so a tab switch
      // (or reload) can resume it, and so the floating chrono stays accurate.
      setDraft({ subjId, mode, duration, customDur, pomoPhase, sound, volume,
        totalTime, elapsed: elapsedRef.current, running: true, ts: Date.now() });
      setTimeLeft(tl => {
        if (tl <= 1) {
          // Timer reached zero: stop, chime, bank XP, flip Pomodoro phase.
          clearInterval(intervalRef.current); setRunning(false);
          if (soundRef.current) { soundRef.current.stop(); soundRef.current = null; }
          releaseWakeLock();
          playChime(volume > 0 ? Math.max(volume, 0.4) : 0.6);
          const xp = computeXP(elapsedRef.current);
          if (xp > 0) { flashXP(xp); saveSession(elapsedRef.current, xp); offerBlocks(); }
          setDraft(null);
          if (mode === 'pomodoro' || mode === 'pomodoro50') { setPomoPhase(ph => ph === 'work' ? 'break' : 'work'); setPomoCycle(c => c + 1); }
          return 0;
        }
        return tl - 1;
      });
    }, 1000);
  }

  function toggle() {
    if (running) {
      // Pause: stop ticking and bank the session if >= 1 min. A pause ends the
      // session (unlike a tab switch, which keeps it running via the store).
      clearInterval(intervalRef.current); setRunning(false);
      if (soundRef.current) { soundRef.current.stop(); soundRef.current = null; }
      releaseWakeLock();
      const xp = computeXP(elapsedRef.current);
      if (xp > 0) { flashXP(xp); saveSession(elapsedRef.current, xp); offerBlocks(); elapsedRef.current = 0; setElapsed(0); }
      setDraft(null);
    } else {
      setRunning(true);
      beginInterval();
    }
  }

  function reset() {
    clearInterval(intervalRef.current); setRunning(false);
    if (soundRef.current) { soundRef.current.stop(); soundRef.current = null; }
    releaseWakeLock();
    const total = getTotal();
    setTotalTime(total); setTimeLeft(total); setElapsed(0); elapsedRef.current = 0; setPomoPhase('work');
    setDraft(null);
  }

  // Bank a finished session. The actual writes live in `lib/focusBank` so the
  // solo timer and live group sessions credit time through the same path.
  async function saveSession(secs, xp, sessSubj = subjId) {
    if (!user) return;
    await bankFocusSession(user.uid, secs, xp, { subjId: sessSubj, mode, context: 'Study' });
  }

  // After a session on a subject, surface that subject's still-pending planning
  // blocks scheduled for today so the user can tick them off in one tap.
  function offerBlocks() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const pending = pendingBlocksForToday(blocks, subjId, todayStr);
    if (pending.length) setSessionBlockIds(pending.map(b => b.id));
  }

  // Mark one planning block done. Same write PagePlanning/PageProgress use:
  // flip the block's status and recompute the subject's `doneBlocks` counter.
  async function markBlockDone(id) {
    const updatedBlocks = blocks.map(b => b.id === id ? { ...b, status: 'done' } : b);
    const updatedSubjects = subjects.map(s => ({
      ...s,
      doneBlocks: updatedBlocks.filter(b => b.subj === s.id && b.type === 'rev' && b.status === 'done').length,
    }));
    setBlocks(updatedBlocks);
    setSubjects(updatedSubjects);
    setSessionBlockIds(ids => ids.filter(x => x !== id));
    try {
      await updateDoc(doc(db, 'users', user.uid, 'data', 'main'), { blocks: updatedBlocks, subjects: updatedSubjects });
    } catch (e) { reportSaveError(e, 'Study — mark block done'); }
  }

  // Resume a session recovered from the store at mount: keep it ticking where
  // it left off, or bank it if it finished while the user was on another tab.
  // Declared after the engine functions it calls so it references them safely.
  useEffect(() => {
    if (resumed && resumed.timeLeft <= 0) {
      const xp = computeXP(resumed.totalTime);
      if (xp > 0) saveSession(resumed.totalTime, xp, resumed.subjId);
      setDraft(null);
    } else if (liveResume) {
      beginInterval();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived values ──
  const subj = subjects.find(s => String(s.id) === subjId);
  const sessionBlocks = blocks.filter(b => sessionBlockIds.includes(b.id));
  const pct = totalTime > 0 ? timeLeft / totalTime : 1;
  const modeConfig = MODES.find(m => m.id === mode) || MODES[0];
  const xpPotential = computeXP(totalTime);
  const ringSize = isNarrow ? 160 : 210;

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <motion.div animate={{ opacity: [.3, 1, .3] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</motion.div>
    </div>
  );

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', fontFamily: 'var(--font-family)' }}>

      {/* XP toast */}
      <AnimatePresence>
        {showXP && (
          <motion.div initial={{ opacity: 0, y: -30, scale: .8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20 }}
            style={{ position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
              padding: '12px 28px', borderRadius: 20,
              background: 'linear-gradient(135deg,var(--xp-color),#27AE60)',
              color: 'var(--bg-base)', fontSize: '1.1rem', fontWeight: 900,
              boxShadow: '0 8px 40px var(--accent-glow)' }}>
            ⚡ {t('study.xpGained', { count: xpEarned })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Post-session prompt: tick off today's planned block(s) ── */}
      <AnimatePresence>
        {sessionBlocks.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 14,
              background: 'var(--accent-subtle)', border: '1px solid var(--accent-glow)',
              display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {t('study.blockPromptTitle', { subject: subj?.name || '' })}
              </div>
              <div style={{ fontSize: '.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                {t('study.blockPromptText')}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {sessionBlocks.map(b => (
                <motion.button key={b.id} whileHover={{ scale: 1.03 }} whileTap={{ scale: .97 }}
                  onClick={() => markBlockDone(b.id)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 10,
                    border: 'none', background: 'var(--success)', color: '#fff', fontSize: '.74rem', fontWeight: 700, cursor: 'pointer' }}>
                  ✓ {fmtHour(b.hour)} · {t('study.blockMarkDone')}
                </motion.button>
              ))}
              <button onClick={() => setSessionBlockIds([])}
                style={{ padding: '6px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--text-muted)', fontSize: '.74rem', cursor: 'pointer' }}>
                {t('study.blockLater')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Focus mode ── */}
      <AnimatePresence>
        {focusMode && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .4 }}
            style={{ position: 'fixed', inset: 0, background: 'var(--bg-base)', zIndex: 500,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 'clamp(12px, 3vh, 24px)', padding: 16, overflowY: 'auto' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: focusSize, height: focusSize, flexShrink: 0 }}>
              <Ring pct={pct} size={focusSize} stroke={Math.max(7, Math.round(focusSize * 0.043))} color={running ? 'var(--accent)' : 'var(--border)'} running={running} ringStyle={prefs?.ringStyle || 'default'}>
                <div style={{ width: focusSize * 0.55, textAlign: 'center',
                  fontSize: Math.max(24, Math.round(focusSize * 0.16)), fontWeight: 900, color: 'var(--text-primary)',
                  fontFamily: '"Courier New",monospace', letterSpacing: 4, lineHeight: 1,
                  textShadow: running ? '0 0 30px var(--accent-glow)' : 'none' }}>
                  {hms(timeLeft)}
                </div>
              </Ring>
            </div>

            {subj && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: subj.color, boxShadow: `0 0 10px ${subj.color}` }} />
                <span style={{ fontSize: '.95rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{subj.name}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: .96 }} onClick={toggle}
                style={{ padding: '13px 36px', borderRadius: 14,
                  border: `1px solid ${running ? 'var(--border)' : `${modeConfig.color}50`}`,
                  background: running ? 'var(--bg-card)' : `${modeConfig.color}18`,
                  color: running ? 'var(--text-secondary)' : modeConfig.color,
                  fontSize: '.95rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '.03em' }}>
                {running ? `⏸ ${t('study.pause')}` : `▶ ${t('study.resume')}`}
              </motion.button>
              <button onClick={() => setFocusMode(false)}
                style={{ padding: '13px 20px', borderRadius: 14, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--text-muted)', fontSize: '.88rem', cursor: 'pointer' }}>
                {t('study.exit')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @media (max-width: 600px) {
          .study-layout { grid-template-columns: 1fr !important; gap: 12px !important; }
          .study-ring-wrap { width: 160px !important; height: 160px !important; }
          .study-timer { font-size: 2rem !important; }
          .study-timer-card { padding: 1.2rem !important; }
          .study-mode-btn { font-size: .62rem !important; padding: 6px 2px !important; }
        }
      `}</style>
      <div style={{ marginBottom: 10 }}>
        <TourButton onClick={tour.start} label={t('common.guidedTour')} />
      </div>

      <div className="study-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>

        {/* ── Left: timer ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Mode selector */}
          <div data-tour="tour-study-selector" style={{ display: 'flex', gap: 6, background: 'var(--bg-card)', padding: 4, borderRadius: 12, border: '1px solid var(--border)' }}>
            {MODES.map(m => (
              <button key={m.id} onClick={() => { if (!running) setMode(m.id); }}
                className="study-mode-btn"
                style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: 'none',
                  background: mode === m.id ? `${m.color}20` : 'transparent',
                  color: mode === m.id ? m.color : 'var(--text-muted)',
                  fontSize: '.68rem', fontWeight: mode === m.id ? 700 : 400,
                  cursor: running ? 'default' : 'pointer', transition: 'all .2s',
                  boxShadow: mode === m.id ? `0 0 10px ${m.color}25` : 'none' }}>
                {t(m.labelKey)}
              </button>
            ))}
          </div>

          {/* Duration pills */}
          {mode === 'custom' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DURATIONS.map(d => (
                <button key={d} onClick={() => { if (!running) setDuration(d); }}
                  style={{ flex: 1, minWidth: 40, padding: '6px 0', borderRadius: 8,
                    border: `1px solid ${duration === d ? 'var(--accent)' : 'var(--border)'}`,
                    background: duration === d ? 'var(--accent-subtle)' : 'var(--bg-card)',
                    color: duration === d ? 'var(--accent)' : 'var(--text-muted)',
                    fontSize: '.75rem', cursor: running ? 'default' : 'pointer', transition: 'all .15s' }}>
                  {d}m
                </button>
              ))}
              <button onClick={() => { if (!running) setDuration('custom'); }}
                style={{ flex: 1, padding: '6px 0', borderRadius: 8,
                  border: `1px solid ${duration === 'custom' ? 'var(--accent)' : 'var(--border)'}`,
                  background: duration === 'custom' ? 'var(--accent-subtle)' : 'var(--bg-card)',
                  color: duration === 'custom' ? 'var(--accent)' : 'var(--text-muted)', fontSize: '.75rem', cursor: running ? 'default' : 'pointer' }}>
                ⚙️
              </button>
            </div>
          )}
          {mode === 'custom' && duration === 'custom' && (
            <input type="number" min="1" max="600" value={customDur}
              onChange={e => !running && setCustomDur(parseInt(e.target.value) || 45)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-strong)',
                background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.85rem' }} />
          )}

          {(mode === 'pomodoro' || mode === 'pomodoro50') && (
            <div style={{ padding: '7px 12px', borderRadius: 8,
              background: pomoPhase === 'work' ? 'rgba(231,76,60,.08)' : 'rgba(39,174,96,.08)',
              border: `1px solid ${pomoPhase === 'work' ? 'rgba(231,76,60,.2)' : 'rgba(39,174,96,.2)'}`,
              fontSize: '.75rem', color: pomoPhase === 'work' ? '#E74C3C' : '#27AE60',
              fontWeight: 600, textAlign: 'center' }}>
              {pomoPhase === 'work' ? `🎯 ${t('study.phaseWork')}` : `☕ ${t('study.phaseBreak')}`} · {t('study.cycle', { count: pomoCycle + 1 })}
            </div>
          )}

          {/* Timer card */}
          <div data-tour="tour-study-timer" className="study-timer-card" style={{ position: 'relative', background: 'var(--bg-card)',
            border: `1px solid ${running ? modeConfig.color + '28' : 'var(--border)'}`,
            borderRadius: 24, padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
            transition: 'border-color .4s',
            boxShadow: running ? `0 0 50px ${modeConfig.color}10` : 'var(--card-shadow)' }}>

            <div data-tour="tour-study-ring" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: ringSize, height: ringSize }}>
              <Ring pct={pct} size={ringSize} stroke={10} color={running ? 'var(--accent)' : 'var(--border)'} running={running} ringStyle={prefs?.ringStyle || 'default'}>
                <div style={{ fontSize: ringSize < 180 ? '1.9rem' : '2.5rem', fontWeight: 900, color: 'var(--text-primary)', fontFamily: '"Courier New",monospace', letterSpacing: 3, lineHeight: 1,
                  textShadow: running ? '0 0 20px var(--accent-glow)' : 'none', minWidth: ringSize < 180 ? 90 : 110, textAlign: 'center' }}>
                  {hms(timeLeft)}
                </div>
              </Ring>
            </div>

            {subj && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20,
                background: `${subj.color}10`, border: `1px solid ${subj.color}25` }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: subj.color, flexShrink: 0, boxShadow: `0 0 6px ${subj.color}` }} />
                <span style={{ fontSize: '.8rem', fontWeight: 600, color: subj.color }}>{subj.name}</span>
              </div>
            )}

            {/* XP */}
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '.55rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 2 }}>{t('study.xpPotential')}</div>
                <div style={{ fontSize: '.88rem', color: 'var(--text-primary)' }}>+<Ticker value={xpPotential} /> XP</div>
              </div>
              {elapsed > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '.55rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 2 }}>{t('study.xpAccumulated')}</div>
                  <div style={{ fontSize: '.88rem', color: 'var(--text-primary)' }}>+<Ticker value={computeXP(elapsed)} /> XP</div>
                </div>
              )}
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: .97 }} onClick={toggle}
                style={{ flex: 1, padding: '13px', borderRadius: 14, border: 'none',
                  background: running ? 'rgba(231,76,60,.7)' : `linear-gradient(135deg,${modeConfig.color},${modeConfig.color}aa)`,
                  color: '#fff', fontSize: '.9rem', fontWeight: 800, cursor: 'pointer',
                  boxShadow: running ? '0 4px 20px rgba(231,76,60,.25)' : `0 4px 20px ${modeConfig.color}35` }}>
                {running ? `⏸ ${t('study.pause')}` : timeLeft === totalTime ? `▶ ${t('study.start')}` : `▶ ${t('study.resume')}`}
              </motion.button>
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }} onClick={reset}
                style={{ width: 46, height: 46, borderRadius: 14, border: '1px solid var(--border)',
                  background: 'var(--bg-card-hover)', color: 'var(--text-muted)', fontSize: '1.1rem', cursor: 'pointer' }}>
                ↺
              </motion.button>
            </div>

            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: .98 }} onClick={() => setFocusMode(true)}
              style={{ width: '100%', padding: '9px', borderRadius: 10,
                border: `1px solid ${modeConfig.color}20`, background: `${modeConfig.color}06`,
                color: `${modeConfig.color}`, opacity: .7, fontSize: '.78rem', cursor: 'pointer', letterSpacing: '.04em' }}>
              🎯 {t('study.focusMode')}
            </motion.button>
          </div>
        </div>

        {/* ── Right ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Subjects */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1rem' }}>
            <div style={{ fontSize: '.6rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.12em' }}>
              {t('common.subject')}
            </div>
            {subjects.length === 0 ? (
              <p style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{t('study.noSubject')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {subjects.map(s => {
                  const active = String(s.id) === subjId;
                  const dl = s.date ? Math.ceil((new Date(s.date) - new Date()) / 86400000) : null;
                  return (
                    <button key={s.id} onClick={() => setSubjId(String(s.id))}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8,
                        borderTop: 'none', borderRight: 'none', borderBottom: 'none',
                        borderLeft: `2px solid ${active ? s.color : 'var(--border)'}`,
                        background: active ? `${s.color}10` : 'transparent',
                        cursor: 'pointer', textAlign: 'left', transition: 'all .15s',
                        opacity: active ? 1 : 0.6 }}>
                      <span style={{ fontSize: '.8rem', fontWeight: active ? 600 : 400,
                        color: active ? 'var(--text-primary)' : 'var(--text-secondary)', flex: 1 }}>
                        {s.name}
                      </span>
                      {dl !== null && dl >= 0 && dl <= 7 && (
                        <span style={{ fontSize: '.58rem', padding: '1px 6px', borderRadius: 8,
                          background: 'rgba(231,76,60,.12)', color: '#ff6b6b', fontWeight: 700 }}>
                          {t('study.daysLeft', { count: dl })}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sounds */}
          <div data-tour="tour-study-sounds" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1rem' }}>
            <div style={{ fontSize: '.6rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.12em' }}>
              {t('study.ambiance')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5, marginBottom: 12 }}>
              {AMBIENCES.map(s => {
                const active = sound === s.id;
                const Icon = AMBIENCE_ICONS[s.icon];
                return (
                  <motion.button key={s.id} onClick={() => setSound(s.id)}
                    whileHover={{ scale: 1.03 }} whileTap={{ scale: .97 }}
                    title={NEEDS_HEADPHONES.includes(s.id) ? t('study.soundHeadphones') : undefined}
                    style={{ padding: '9px 4px', borderRadius: 9,
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                      background: active ? 'var(--accent-subtle)' : 'var(--bg-card-hover)',
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transition: 'all .15s' }}>
                    {Icon && <Icon size={16} strokeWidth={1.9}
                      style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }} />}
                    <span style={{ fontSize: '.6rem', color: active ? 'var(--accent)' : 'var(--text-muted)', fontWeight: active ? 600 : 400 }}>
                      {t(s.labelKey)}
                    </span>
                  </motion.button>
                );
              })}
            </div>
            {/* Binaural beats only work when each ear hears its own tone. */}
            {NEEDS_HEADPHONES.includes(sound) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10,
                fontSize: '.62rem', color: 'var(--text-muted)' }}>
                <Headphones size={11} strokeWidth={2} />
                {t('study.soundHeadphones')}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '.7rem' }}>🔈</span>
              <div style={{ flex: 1, position: 'relative', height: 18, display: 'flex', alignItems: 'center' }}>
                <div style={{ position: 'absolute', left: 0, right: 0, height: 3, background: 'var(--border)', borderRadius: 4 }} />
                <div style={{ position: 'absolute', left: 0, height: 3, background: 'var(--accent)', borderRadius: 4,
                  width: `${volume * 100}%`, boxShadow: '0 0 6px var(--accent-glow)', transition: 'width .05s' }} />
                <input type="range" min="0" max="1" step="0.05" value={volume}
                  onChange={e => setVolume(parseFloat(e.target.value))}
                  style={{ position: 'absolute', width: '100%', opacity: 0, cursor: 'pointer', height: '100%', margin: 0 }} />
              </div>
              <span style={{ fontSize: '.62rem', color: 'var(--text-muted)', minWidth: 26 }}>{Math.round(volume * 100)}%</span>
            </div>
          </div>

          {/* Session stats */}
          {elapsed > 0 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              style={{ background: `${modeConfig.color}07`, border: `1px solid ${modeConfig.color}18`, borderRadius: 14, padding: '1rem' }}>
              <div style={{ fontSize: '.6rem', fontWeight: 600, color: `${modeConfig.color}`, opacity: .7, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.1em' }}>
                {t('study.session')}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{hms(elapsed)}</div>
                  <div style={{ fontSize: '.58rem', color: 'var(--text-muted)', marginTop: 2 }}>{t('study.focusedTime')}</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-primary)' }}>+<Ticker value={computeXP(elapsed)} /></div>
                  <div style={{ fontSize: '.58rem', color: 'var(--text-muted)', marginTop: 2 }}>{t('study.sessionXp')}</div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Recent sessions history ── */}
      {!focusMode && (
        <div style={{ marginTop: 18, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 'clamp(.9rem,3vw,1.3rem)' }}>
          <div style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>{t('study.historyTitle')}</div>
          {sessions.length === 0 ? (
            <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{t('study.historyEmpty')}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...sessions].reverse().slice(0, 6).map((sess, i) => {
                const sSubj = subjects.find(s => String(s.id) === String(sess.subjId));
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 10, background: 'var(--bg-card-hover)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: sSubj?.color || 'var(--text-muted)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: '.76rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sSubj?.name || t('study.noSubject')}
                    </span>
                    <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{formatDate(sess.at, { day: 'numeric', month: 'short' })}</span>
                    <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-primary)' }}>{sess.mins} min</span>
                    <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--xp-color)' }}>+{sess.xp}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <GuidedTour active={tour.active} step={tour.step} steps={tour.steps}
        onNext={tour.next} onPrev={tour.prev} onStop={tour.stop} />
    </div>
  );
}