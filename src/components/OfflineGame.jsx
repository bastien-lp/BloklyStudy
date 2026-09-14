/**
 * OfflineGame — something to do while the connection comes back.
 * --------------------------------------------------------------------------
 * A one-button runner: the red panda sprints through a bamboo grove and jumps
 * the shoots in its way. Everything is drawn procedurally on a canvas — no
 * sprite sheets to download, which matters given the whole point is that the
 * network is down.
 *
 * Deliberately opt-in: losing the connection does not interrupt what the
 * student was doing. The offline toast offers the game, and only a click opens
 * it. Work keeps running underneath.
 *
 * Props: { open, onClose, backOnline }
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Wifi, RotateCcw } from 'lucide-react';
import { useTranslation } from '../i18n';

/* ── World constants (in logical canvas units) ──────────────────────────── */
const W = 640;              // logical canvas width
const H = 200;              // logical canvas height
const GROUND_Y = 160;       // where the panda's feet land
const GRAVITY = 0.62;
const JUMP_V = -11.2;
const START_SPEED = 4.2;
const MAX_SPEED = 10.5;
const SPEED_RAMP = 0.0016;  // added per frame
const HIGHSCORE_KEY = 'blokly-offline-best';

/* ── Palette: the app's forest identity, independent of the active theme ── */
const C = {
  sky: '#EAF2E2', skyLow: '#F6EFE2',
  soil: '#A87C4F', soilDark: '#7E5833',
  leaf: '#4F7A38', leafDeep: '#2F5223', leafPale: '#9FBE86',
  fur: '#C1663A', furDark: '#9A4E2B', cream: '#F7EAD8',
  ink: '#3B3226', inkSoft: '#83705A',
};

/** Best score survives reloads; a blocked/again-empty store is not an error. */
function loadBest() {
  try { return Number(localStorage.getItem(HIGHSCORE_KEY)) || 0; } catch { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem(HIGHSCORE_KEY, String(v)); } catch { /* private mode: skip */ }
}

/* ── Drawing ────────────────────────────────────────────────────────────── */

/** The panda, drawn from primitives. `runPhase` drives the leg cycle. */
function drawPanda(g, x, y, runPhase, airborne) {
  g.save();
  g.translate(x, y);

  // Tail: banded russet/cream, swinging with the stride.
  const swing = airborne ? -0.35 : Math.sin(runPhase) * 0.22;
  g.save();
  g.translate(-16, -14);
  g.rotate(swing);
  for (let i = 4; i >= 0; i -= 1) {
    g.fillStyle = i % 2 ? C.cream : C.furDark;
    g.beginPath();
    g.ellipse(-i * 5.4, -i * 1.3, 5.2 - i * 0.35, 4.4 - i * 0.3, -0.25, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();

  // Legs: two pairs, opposite phase. Tucked up while airborne.
  const stride = airborne ? 0 : Math.sin(runPhase) * 5;
  g.strokeStyle = C.furDark;
  g.lineWidth = 4.4;
  g.lineCap = 'round';
  for (const [lx, dir] of [[-7, 1], [7, -1]]) {
    g.beginPath();
    g.moveTo(lx, -6);
    g.lineTo(lx + stride * dir, airborne ? -3 : 2);
    g.stroke();
  }

  // Body.
  g.fillStyle = C.fur;
  g.beginPath();
  g.ellipse(0, -14, 15, 11.5, 0, 0, Math.PI * 2);
  g.fill();

  // Head.
  g.beginPath();
  g.ellipse(13, -24, 10.5, 9.5, 0, 0, Math.PI * 2);
  g.fill();

  // Ears.
  g.fillStyle = C.furDark;
  g.beginPath(); g.ellipse(7, -32, 4.2, 4.2, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(18, -32, 4.2, 4.2, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = C.cream;
  g.beginPath(); g.ellipse(7, -32, 2.1, 2.1, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(18, -32, 2.1, 2.1, 0, 0, Math.PI * 2); g.fill();

  // Muzzle and the pale brow markings that make a red panda read as one.
  g.fillStyle = C.cream;
  g.beginPath(); g.ellipse(18, -21, 6.5, 5.5, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(9, -28, 3.6, 2.6, -0.3, 0, Math.PI * 2); g.fill();

  // Eye and nose.
  g.fillStyle = C.ink;
  g.beginPath(); g.ellipse(16, -26, 1.9, airborne ? 1.1 : 2, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(23, -21.5, 1.7, 1.4, 0, 0, Math.PI * 2); g.fill();

  g.restore();
}

/** A bamboo shoot the panda has to clear. */
function drawShoot(g, x, h, width) {
  const segs = Math.max(2, Math.round(h / 16));
  for (let i = 0; i < segs; i += 1) {
    const yB = GROUND_Y - i * (h / segs);
    const yT = yB - h / segs + 2;
    g.fillStyle = C.leaf;
    g.fillRect(x - width / 2, yT, width, yB - yT);
    g.fillStyle = 'rgba(255,255,255,.2)';
    g.fillRect(x - width / 2, yT, width * 0.32, yB - yT);
    g.strokeStyle = C.leafDeep;
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x - width / 2 - 1, yT); g.lineTo(x + width / 2 + 1, yT); g.stroke();
  }
  // A leaf near the top so the silhouette isn't a plain bar.
  g.fillStyle = C.leaf;
  g.beginPath();
  g.moveTo(x + width / 2, GROUND_Y - h + 6);
  g.quadraticCurveTo(x + width / 2 + 14, GROUND_Y - h - 3, x + width / 2 + 9, GROUND_Y - h + 10);
  g.fill();
}

/** A fresh world, ready to run. Pure, so it can seed the ref directly. */
function makeWorld() {
  return {
    y: GROUND_Y, vy: 0, airborne: false,
    speed: START_SPEED, distance: 0, runPhase: 0,
    shoots: [],
    grasses: Array.from({ length: 22 }, () => ({ x: Math.random() * W, h: 3 + Math.random() * 5 })),
    far: Array.from({ length: 9 }, (_, i) => ({ x: i * 78 + Math.random() * 40, h: 46 + Math.random() * 44 })),
    nextGap: 70,
    dead: false,
  };
}

/**
 * The panel itself. Mounted only while the game is open, so its initial state
 * is already the correct "ready" state — nothing to reset after the fact.
 */
function GamePanel({ onClose, backOnline }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const stateRef = useRef(makeWorld());
  const [phase, setPhase] = useState('ready');   // ready | playing | over
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(loadBest);

  const start = useCallback(() => { stateRef.current = makeWorld(); setScore(0); setPhase('playing'); }, []);

  /** One button for everything: start, jump, retry. */
  const press = useCallback(() => {
    if (phase === 'ready' || phase === 'over') { start(); return; }
    const s = stateRef.current;
    if (s && !s.airborne) { s.vy = JUMP_V; s.airborne = true; }
  }, [phase, start]);

  // Keyboard: space / arrow up / enter. Escape closes.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { onClose(); return; }
      if ([' ', 'Spacebar', 'ArrowUp', 'Enter'].includes(e.key)) {
        e.preventDefault();
        press();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, onClose]);

  // The loop. Runs the whole time the panel is up, so the idle screen breathes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    let raf = 0;
    let idle = 0;

    // Match the backing store to the device pixel ratio so it isn't blurry.
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    function frame() {
      const s = stateRef.current;
      const running = phase === 'playing' && s && !s.dead;
      idle += 1;

      /* ── update ── */
      if (running) {
        s.speed = Math.min(MAX_SPEED, s.speed + SPEED_RAMP);
        s.distance += s.speed;
        s.runPhase += 0.28;

        s.vy += GRAVITY;
        s.y += s.vy;
        if (s.y >= GROUND_Y) { s.y = GROUND_Y; s.vy = 0; s.airborne = false; }

        // Spawn shoots with a gap that stays clearable at the current speed.
        s.nextGap -= s.speed;
        if (s.nextGap <= 0) {
          const tall = Math.random() < 0.32;
          s.shoots.push({ x: W + 20, h: tall ? 46 + Math.random() * 16 : 26 + Math.random() * 14, w: tall ? 9 : 12 });
          s.nextGap = 150 + Math.random() * 130 + s.speed * 9;
        }
        s.shoots = s.shoots.filter(o => { o.x -= s.speed; return o.x > -40; });

        // Collision: rectangles, forgiving by a couple of pixels on purpose.
        const px = 60, pr = 13, pTop = s.y - 34, pBot = s.y - 2;
        for (const o of s.shoots) {
          const oLeft = o.x - o.w / 2 - 2, oRight = o.x + o.w / 2 + 2;
          const oTop = GROUND_Y - o.h;
          if (px + pr > oLeft && px - pr < oRight && pBot > oTop && pTop < GROUND_Y) {
            s.dead = true;
            const final = Math.floor(s.distance / 12);
            setScore(final);
            setBest(b => { const nb = Math.max(b, final); if (nb > b) saveBest(nb); return nb; });
            setPhase('over');
            break;
          }
        }

        if (!s.dead) {
          s.grasses = s.grasses.map(t => ({ ...t, x: t.x - s.speed * 1.15 < -6 ? W + Math.random() * 30 : t.x - s.speed * 1.15 }));
          s.far = s.far.map(t => ({ ...t, x: t.x - s.speed * 0.22 < -14 ? W + Math.random() * 40 : t.x - s.speed * 0.22 }));
          setScore(Math.floor(s.distance / 12));
        }
      }

      /* ── draw ── */
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, C.sky);
      sky.addColorStop(1, C.skyLow);
      g.fillStyle = sky;
      g.fillRect(0, 0, W, H);

      // Sun haze.
      const sun = g.createRadialGradient(W - 90, 20, 4, W - 90, 20, 110);
      sun.addColorStop(0, 'rgba(255,233,176,.85)');
      sun.addColorStop(1, 'rgba(255,233,176,0)');
      g.fillStyle = sun;
      g.fillRect(W - 220, -60, 260, 200);

      // Distant grove.
      for (const t of s?.far || []) {
        g.fillStyle = C.leafPale;
        g.globalAlpha = 0.4;
        g.fillRect(t.x, GROUND_Y - t.h, 2.4, t.h);
        g.globalAlpha = 1;
      }

      // Ground.
      g.fillStyle = C.soil;
      g.fillRect(0, GROUND_Y, W, H - GROUND_Y);
      g.fillStyle = C.soilDark;
      g.fillRect(0, GROUND_Y, W, 3);

      // Grass tufts scrolling by, so speed is readable.
      g.strokeStyle = C.leafDeep;
      g.lineWidth = 1.6;
      g.globalAlpha = .55;
      for (const t of s?.grasses || []) {
        g.beginPath();
        g.moveTo(t.x, GROUND_Y + 6);
        g.lineTo(t.x + 2, GROUND_Y + 6 - t.h);
        g.stroke();
      }
      g.globalAlpha = 1;

      for (const o of s?.shoots || []) drawShoot(g, o.x, o.h, o.w);

      // The panda bobs gently on the idle screen.
      const idleY = phase === 'playing' ? s.y : GROUND_Y + Math.sin(idle / 26) * 1.6;
      const idlePhase = phase === 'playing' ? s.runPhase : idle / 7;
      drawPanda(g, 60, idleY, idlePhase, phase === 'playing' ? s.airborne : false);

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // Space scrolls the page by default, and the panel covers it anyway:
  // freeze the document while the game is up, and restore on close.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  // Leaving the tab mid-run would mean returning to a pile-up: pause instead.
  useEffect(() => {
    function onHide() { if (document.hidden && phase === 'playing') setPhase('over'); }
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [phase]);

  return (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={e => e.target === e.currentTarget && onClose()}
          style={{ position: 'fixed', inset: 0, zIndex: 20001, display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: '1rem',
            pointerEvents: 'auto',
            background: 'rgba(10,8,5,.72)', backdropFilter: 'blur(8px)' }}>

          <motion.div
            initial={{ scale: .94, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: .96, y: 10 }}
            transition={{ duration: .22, ease: 'easeOut' }}
            style={{ width: 'min(680px, 100%)', background: 'var(--bg-modal)', borderRadius: 22,
              overflow: 'hidden', boxShadow: '0 24px 60px -20px rgba(0,0,0,.8)' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.86rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {t('game.title')}
                </div>
                <div style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>
                  {t('game.hint')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: '.72rem', fontWeight: 700, flexShrink: 0 }}>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {t('game.score')} <span style={{ color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{score}</span>
                </span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {t('game.best')} <span style={{ fontVariantNumeric: 'tabular-nums' }}>{best}</span>
                </span>
              </div>
              <button onClick={onClose} aria-label={t('game.close')}
                style={{ display: 'flex', border: 'none', background: 'var(--bg-card-hover)', borderRadius: '50%',
                  width: 30, height: 30, alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}>
                <X size={15} strokeWidth={2.4} />
              </button>
            </div>

            {/* Playfield */}
            <div style={{ position: 'relative', lineHeight: 0 }}>
              <canvas
                ref={canvasRef}
                onPointerDown={press}
                role="img"
                aria-label={t('game.canvasLabel')}
                style={{ width: '100%', height: 'auto', display: 'block',
                  cursor: 'pointer', touchAction: 'manipulation' }} />

              {/* Idle / game-over overlay */}
              {phase !== 'playing' && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 8, pointerEvents: 'none' }}>
                  <div style={{ padding: '10px 18px', borderRadius: 16, textAlign: 'center',
                    background: 'rgba(251,244,231,.92)', boxShadow: '0 6px 20px -8px rgba(38,25,14,.5)' }}>
                    <div style={{ fontSize: '.84rem', fontWeight: 800, color: C.ink }}>
                      {phase === 'over' ? t('game.gameOver', { distance: score }) : t('game.ready')}
                    </div>
                    <div style={{ fontSize: '.68rem', color: C.inkSoft, marginTop: 2 }}>
                      {phase === 'over' ? t('game.pressToRetry') : t('game.pressToStart')}
                    </div>
                  </div>
                  {phase === 'over' && (
                    <RotateCcw size={15} strokeWidth={2.4} color={C.inkSoft} />
                  )}
                </div>
              )}
            </div>

            {/* Connection came back — say so, but don't yank them out of a run. */}
            <AnimatePresence>
              {backOnline && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  style={{ overflow: 'hidden', background: 'rgba(79,122,56,.16)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px' }}>
                    <Wifi size={15} strokeWidth={2.2} color="var(--success)" style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: '.75rem', color: 'var(--text-secondary)' }}>
                      {t('game.backOnline')}
                    </span>
                    <button onClick={onClose}
                      style={{ padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                        background: 'var(--accent)', color: '#fff', fontSize: '.72rem', fontWeight: 700 }}>
                      {t('game.backToApp')}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
  );
}

/**
 * Presence wrapper: mounts a brand-new <GamePanel /> every time it opens.
 *
 * Rendered through a portal into <body> on purpose. The Toaster that owns this
 * component sits in a container with `transform: translateX(-50%)`, and a
 * transformed ancestor becomes the containing block for `position: fixed`
 * descendants — without the portal the panel is pinned inside the narrow toast
 * strip and inherits its `pointer-events: none`.
 */
export default function OfflineGame({ open, onClose, backOnline }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && <GamePanel onClose={onClose} backOnline={backOnline} />}
    </AnimatePresence>,
    document.body,
  );
}
