/**
 * GardenScene — the drawn parts of the bamboo garden.
 * --------------------------------------------------------------------------
 * Pure presentation: every piece takes what it shows as props and holds no
 * state of its own, so the garden's rules live in lib/bambooGarden.js and
 * PageReserve only has to place these on screen.
 *
 * The garden is an ILLUSTRATION, not a themed surface: its colours are fixed
 * (misty morning, warm wood, forest greens) and deliberately do not follow the
 * app theme — exactly like a picture hung on a wall. Only the tints of the
 * leaves follow the subjects that fed the grove.
 *
 * Growth is drawn as one continuous stalk revealed by a clip rectangle rather
 * than a stack of discrete blocks: a bamboo that is 3/5 grown looks like a
 * young bamboo, not like a broken one.
 */

import { useId } from 'react';
import { motion } from 'motion/react';
import { SCENE } from '../lib/gardenPalette';

/* ── Coin ────────────────────────────────────────────────────────────────── */

/** Bamboo coin — the garden's currency. */
export function CoinIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" fill="#E9B44C" />
      <circle cx="12" cy="12" r="10" fill="none" stroke="#B07E28" strokeWidth="1.4" />
      <ellipse cx="9.5" cy="8" rx="4.5" ry="3" fill="#fff" opacity=".28" />
      <path d="M12 6.4v11.2" stroke="#8A5E18" strokeWidth="1.6" strokeLinecap="round" opacity=".75" />
      <path d="M9.4 9.2h5.2M9.4 14.8h5.2" stroke="#8A5E18" strokeWidth="1.3" strokeLinecap="round" opacity=".5" />
    </svg>
  );
}

/* ── Backdrop ────────────────────────────────────────────────────────────── */

/** Distant bamboo, drawn once per column and faded into the morning mist. */
function DistantStalk({ x, top, width, tone }) {
  return (
    <g opacity=".5">
      <rect x={x} y={top} width={width} height={100 - top} fill={tone} rx={width / 2} />
      {[0, 1, 2, 3].map(i => {
        const y = top + 9 + i * 13;
        return y < 96 ? <rect key={i} x={x - 0.3} y={y} width={width + 0.6} height="0.5" fill="#FFFFFF" opacity=".5" /> : null;
      })}
    </g>
  );
}

/**
 * Sun, haze and layers of distant bamboo. Nothing here reacts to the data: it
 * is the sky the grove stands in.
 */
export function GardenBackdrop() {
  const id = useId().replace(/:/g, '');
  const far = [4, 11, 19, 27, 36, 47, 56, 64, 72, 81, 88, 95];
  const mid = [8, 23, 41, 59, 77, 91];
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      <defs>
        <radialGradient id={`sun${id}`} cx="80%" cy="4%" r="60%">
          <stop offset="0%" stopColor="#FFF0C4" stopOpacity=".95" />
          <stop offset="55%" stopColor="#FFE9B0" stopOpacity=".35" />
          <stop offset="100%" stopColor="#FFE9B0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`mist${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FBF6EA" stopOpacity="0" />
          <stop offset="70%" stopColor="#FBF6EA" stopOpacity=".75" />
          <stop offset="100%" stopColor="#FBF6EA" stopOpacity=".95" />
        </linearGradient>
        <linearGradient id={`ray${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFF4D2" stopOpacity=".5" />
          <stop offset="100%" stopColor="#FFF4D2" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="100" height="100" fill={`url(#sun${id})`} />
      {/* light falling from the top right */}
      <path d="M62 0 L100 0 L100 34 Z" fill={`url(#ray${id})`} />
      <path d="M78 0 L100 0 L100 62 Z" fill={`url(#ray${id})`} opacity=".5" />

      {far.map((x, i) => (
        <DistantStalk key={`f${x}`} x={x} top={i % 3 ? 2 : 9} width={i % 2 ? 0.8 : 1.2} tone="#B9CDA6" />
      ))}
      {mid.map((x, i) => (
        <DistantStalk key={`m${x}`} x={x} top={i % 2 ? 6 : 14} width={2} tone="#8FAE77" />
      ))}

      {/* the mist that makes those stalks feel far away */}
      <rect width="100" height="100" fill={`url(#mist${id})`} />
    </svg>
  );
}

/* ── One bamboo ──────────────────────────────────────────────────────────── */

const VIEW_W = 130;
const VIEW_H = 210;
const SOIL_Y = 186;      // where the stalks meet the ground
const STALK_TOP = 22;    // how high a fully grown stalk reaches

/** A single leaf, drawn from its attachment point outwards. */
function Leaf({ x, y, dir, len, tilt, fill, opacity = 1 }) {
  const tipX = x + dir * len;
  const tipY = y - tilt;
  return (
    <path opacity={opacity} fill={fill}
      d={`M${x} ${y}
          Q${x + dir * len * 0.45} ${y - tilt - len * 0.34} ${tipX} ${tipY}
          Q${x + dir * len * 0.5} ${y - tilt + len * 0.2} ${x} ${y + 2.4} Z`} />
  );
}

/**
 * One stalk. `height` is its drawn length in viewBox units; the clip of the
 * parent decides how much of it is visible, so growth stays continuous.
 */
function Stalk({ baseX, lean, height, width, fill, edge, light, leafFill, leafCount, seed }) {
  const top = SOIL_Y - height;
  const nodes = Math.max(2, Math.round(height / 26));
  const xAt = t => baseX + lean * t * t;                    // slight curve, not a tilt
  const wAt = t => width * (1 - 0.34 * t);

  const segments = Array.from({ length: nodes }, (_, i) => {
    const t0 = i / nodes;
    const t1 = (i + 1) / nodes;
    return { y0: SOIL_Y - height * t0, y1: SOIL_Y - height * t1, x0: xAt(t0), x1: xAt(t1), w0: wAt(t0), w1: wAt(t1) };
  });

  return (
    <g>
      {segments.map((s, i) => (
        <g key={i}>
          <path fill={fill}
            d={`M${s.x0 - s.w0} ${s.y0} L${s.x1 - s.w1} ${s.y1 + 1.6} L${s.x1 + s.w1} ${s.y1 + 1.6} L${s.x0 + s.w0} ${s.y0} Z`} />
          {/* rim light on the left flank, shadow on the right: gives the tube its volume */}
          <path fill={light} opacity=".5"
            d={`M${s.x0 - s.w0} ${s.y0} L${s.x1 - s.w1} ${s.y1 + 1.6} L${s.x1 - s.w1 * 0.3} ${s.y1 + 1.6} L${s.x0 - s.w0 * 0.3} ${s.y0} Z`} />
          <path fill={edge} opacity=".28"
            d={`M${s.x0 + s.w0 * 0.45} ${s.y0} L${s.x1 + s.w1 * 0.45} ${s.y1 + 1.6} L${s.x1 + s.w1} ${s.y1 + 1.6} L${s.x0 + s.w0} ${s.y0} Z`} />
          {/* the node ring */}
          <path d={`M${s.x1 - s.w1 - 0.8} ${s.y1 + 1.4} q${s.w1 + 0.8} 1.7 ${(s.w1 + 0.8) * 2} 0`}
            stroke={edge} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </g>
      ))}

      {/* leaves, fanned out from the upper nodes */}
      {Array.from({ length: leafCount }, (_, i) => {
        const t = 0.52 + (i / Math.max(1, leafCount - 1)) * 0.46;
        const y = SOIL_Y - height * t;
        const dir = (i + seed) % 2 ? 1 : -1;
        const len = 15 + ((i * 7 + seed * 5) % 9);
        return (
          <g key={i}>
            <Leaf x={xAt(t)} y={y} dir={dir} len={len} tilt={5 + (i % 3) * 3} fill={leafFill} />
            <Leaf x={xAt(t)} y={y + 3} dir={dir} len={len * 0.66} tilt={-2} fill={leafFill} opacity=".72" />
          </g>
        );
      })}
      {/* the growing tip */}
      <path d={`M${xAt(1) - wAt(1)} ${top + 3} Q${xAt(1)} ${top - 7} ${xAt(1) + wAt(1)} ${top + 3} Z`} fill={leafFill} />
    </g>
  );
}

/**
 * A bamboo clump growing straight out of the ground.
 *
 * @param pct    0 → 1, how grown it is
 * @param ripe   true when it can be cut (draws the warm halo and the fireflies)
 * @param tints  colours of the subjects that fed the grove; the leaves borrow
 *               the first of them, so the plant keeps the colours of what is studied
 * @param idle   false stops every animation (used for the locked plots)
 */
export function BambooPlant({ pct = 0, ripe = false, tints = [], idle = true }) {
  const id = useId().replace(/:/g, '');
  const grown = Math.max(0.06, Math.min(1, pct));
  const revealH = (SOIL_Y - STALK_TOP) * grown + 6;
  const leafFill = tints[0] || SCENE.leaf;

  // Three stalks: one tall in the middle, two shorter around it.
  const stalks = [
    { baseX: 52, lean: -7, height: (SOIL_Y - STALK_TOP) * 0.82, width: 5.2, leafCount: 3, seed: 1, depth: 1 },
    { baseX: 78, lean: 6, height: (SOIL_Y - STALK_TOP) * 0.74, width: 4.6, leafCount: 3, seed: 2, depth: 1 },
    { baseX: 65, lean: 1, height: SOIL_Y - STALK_TOP, width: 6, leafCount: 4, seed: 0, depth: 0 },
  ];

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {ripe && (
        <motion.div aria-hidden="true"
          initial={{ opacity: 0 }} animate={{ opacity: [.55, .9, .55] }}
          transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute', inset: '2% -10% 12%', borderRadius: '50%', pointerEvents: 'none',
            background: 'radial-gradient(circle at 50% 58%, rgba(255,214,130,.45) 0%, rgba(255,214,130,.18) 42%, transparent 72%)',
          }} />
      )}

      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} style={{ width: '100%', display: 'block', overflow: 'visible' }}>
        <defs>
          <clipPath id={`grow${id}`}>
            <motion.rect x="-30" width={VIEW_W + 60}
              initial={false}
              animate={{ y: SOIL_Y - revealH, height: revealH }}
              transition={{ duration: .9, ease: [.22, 1, .36, 1] }} />
          </clipPath>
          <radialGradient id={`shade${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={SCENE.soilDark} stopOpacity=".35" />
            <stop offset="100%" stopColor={SCENE.soilDark} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ground shadow */}
        <ellipse cx="65" cy={SOIL_Y + 6} rx="46" ry="12" fill={`url(#shade${id})`} />

        <motion.g
          animate={idle ? { rotate: ripe ? [0, 1.2, 0, -1.2, 0] : [0, .6, 0, -.6, 0] } : {}}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          style={{ originX: '65px', originY: `${SOIL_Y}px` }}>
          <g clipPath={`url(#grow${id})`}>
            {stalks.map((s, i) => (
              <g key={i} opacity={s.depth ? .62 : 1}>
                <Stalk {...s}
                  fill={s.depth ? '#7FA06A' : SCENE.leaf}
                  edge={s.depth ? '#5C7A4C' : SCENE.leafDeep}
                  light="#FFFFFF"
                  leafFill={s.depth ? '#89AE6F' : leafFill} />
              </g>
            ))}
          </g>
        </motion.g>

        {/* soil mound and grass, drawn over the feet of the stalks */}
        <path d={`M30 ${SOIL_Y} Q65 ${SOIL_Y - 11} 100 ${SOIL_Y} Q65 ${SOIL_Y + 13} 30 ${SOIL_Y} Z`} fill={SCENE.soil} />
        <path d={`M30 ${SOIL_Y} Q65 ${SOIL_Y - 11} 100 ${SOIL_Y} Q65 ${SOIL_Y - 4} 30 ${SOIL_Y} Z`} fill={SCENE.soilDark} opacity=".4" />
        <g stroke={SCENE.leafDeep} strokeWidth="1.7" strokeLinecap="round" fill="none" opacity=".62">
          <path d={`M38 ${SOIL_Y} q-5 -7 -1 -12`} />
          <path d={`M45 ${SOIL_Y + 1} q3 -8 9 -10`} />
          <path d={`M88 ${SOIL_Y} q6 -7 2 -12`} />
          <path d={`M94 ${SOIL_Y + 1} q-4 -7 -9 -9`} />
        </g>
        {/* a couple of pebbles, so the ground is not a flat blob */}
        <ellipse cx="36" cy={SOIL_Y + 5} rx="5" ry="2.4" fill={SCENE.soilDark} opacity=".3" />
        <ellipse cx="96" cy={SOIL_Y + 7} rx="4" ry="2" fill={SCENE.soilDark} opacity=".22" />

        {/* fireflies rising from a ripe plant */}
        {ripe && idle && [0, 1, 2, 3].map(i => (
          <motion.circle key={i} cx={42 + i * 15} r={i % 2 ? 1.5 : 2.1} fill="#FFDC8C"
            initial={{ cy: SOIL_Y - 24, opacity: 0 }}
            animate={{ cy: [SOIL_Y - 24, 40], opacity: [0, .95, 0] }}
            transition={{ duration: 3.8 + i * .4, repeat: Infinity, delay: i * .9, ease: 'easeOut' }} />
        ))}
      </svg>
    </div>
  );
}

/* ── Empty plot ──────────────────────────────────────────────────────────── */

/** A plot with no bamboo yet: turned soil, a dotted outline and a shoot. */
export function EmptyPlot() {
  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden="true"
      style={{ width: '100%', display: 'block', overflow: 'visible' }}>
      <ellipse cx="65" cy={SOIL_Y + 4} rx="40" ry="11" fill={SCENE.soil} opacity=".28" />
      <ellipse cx="65" cy={SOIL_Y + 4} rx="40" ry="11" fill="none" stroke={SCENE.soilDark}
        strokeWidth="1.6" strokeDasharray="5 6" opacity=".55" />
      {/* a young shoot waiting for a place */}
      <g opacity=".5">
        <path d={`M65 ${SOIL_Y} q-1 -14 1 -22`} stroke={SCENE.leaf} strokeWidth="4" fill="none" strokeLinecap="round" />
        <Leaf x={66} y={SOIL_Y - 18} dir={1} len={13} tilt={6} fill={SCENE.leafLight} />
        <Leaf x={65} y={SOIL_Y - 12} dir={-1} len={11} tilt={4} fill={SCENE.leaf} />
      </g>
    </svg>
  );
}

/* ── The mascot ──────────────────────────────────────────────────────────── */

/**
 * The red panda of the garden — the app's identity anchor, sitting in the
 * grass and breathing. Drawn small: it is a companion, not a character screen.
 */
export function RedPanda({ width = 92, asleep = false }) {
  const id = useId().replace(/:/g, '');
  return (
    <motion.svg width={width} viewBox="0 0 120 110" aria-hidden="true"
      animate={{ y: [0, -1.5, 0] }} transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
      style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={`fur${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D2684A" />
          <stop offset="100%" stopColor={SCENE.panda} />
        </linearGradient>
      </defs>

      <ellipse cx="60" cy="101" rx="34" ry="7" fill={SCENE.soilDark} opacity=".22" />

      {/* tail, swaying */}
      <motion.g style={{ originX: '86px', originY: '86px' }}
        animate={{ rotate: [0, -7, 0, 7, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}>
        <path d="M84 88 q24 6 30 -12 q4 -14 -6 -18 q-8 -3 -12 6 q-4 10 -14 12 Z" fill={SCENE.pandaDark} />
        <path d="M96 84 q14 2 18 -10" stroke={SCENE.cream} strokeWidth="6" fill="none" strokeLinecap="round" opacity=".85" />
        <path d="M104 70 q8 -2 8 -10" stroke={SCENE.cream} strokeWidth="5" fill="none" strokeLinecap="round" opacity=".7" />
      </motion.g>

      {/* body */}
      <motion.ellipse cx="58" cy="82" rx="30" ry="22" fill={`url(#fur${id})`}
        animate={{ ry: [22, 22.9, 22] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }} />
      <ellipse cx="58" cy="88" rx="18" ry="13" fill={SCENE.cream} opacity=".9" />
      {/* front paws */}
      <ellipse cx="46" cy="97" rx="8" ry="5" fill={SCENE.pandaDark} />
      <ellipse cx="70" cy="97" rx="8" ry="5" fill={SCENE.pandaDark} />

      {/* head */}
      <g>
        {/* ears */}
        <path d="M30 44 q-4 -16 10 -16 q6 2 6 12 Z" fill={SCENE.panda} />
        <path d="M34 42 q-2 -9 6 -10 q3 1 3 7 Z" fill={SCENE.cream} />
        <path d="M86 44 q4 -16 -10 -16 q-6 2 -6 12 Z" fill={SCENE.panda} />
        <path d="M82 42 q2 -9 -6 -10 q-3 1 -3 7 Z" fill={SCENE.cream} />

        <ellipse cx="58" cy="50" rx="30" ry="25" fill={`url(#fur${id})`} />
        {/* cream mask */}
        <path d="M58 34 q-16 0 -20 14 q-3 12 8 18 q12 6 24 0 q11 -6 8 -18 q-4 -14 -20 -14 Z" fill={SCENE.cream} />
        <ellipse cx="42" cy="56" rx="7" ry="5" fill="#F2D2B8" opacity=".75" />
        <ellipse cx="74" cy="56" rx="7" ry="5" fill="#F2D2B8" opacity=".75" />

        {/* eyes, with a blink every few seconds */}
        <motion.g animate={asleep ? {} : { scaleY: [1, 1, .1, 1] }}
          transition={{ duration: 4.6, repeat: Infinity, times: [0, .86, .9, .94], ease: 'easeInOut' }}
          style={{ originY: '48px' }}>
          {asleep ? (
            <>
              <path d="M44 48 q4 4 8 0" stroke={SCENE.ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />
              <path d="M64 48 q4 4 8 0" stroke={SCENE.ink} strokeWidth="2.4" fill="none" strokeLinecap="round" />
            </>
          ) : (
            <>
              <ellipse cx="48" cy="48" rx="4.2" ry="4.6" fill={SCENE.ink} />
              <ellipse cx="68" cy="48" rx="4.2" ry="4.6" fill={SCENE.ink} />
              <circle cx="49.4" cy="46.4" r="1.5" fill="#fff" opacity=".9" />
              <circle cx="69.4" cy="46.4" r="1.5" fill="#fff" opacity=".9" />
            </>
          )}
        </motion.g>

        {/* muzzle */}
        <path d="M58 56 q-5 0 -5 3.5 q0 3.5 5 3.5 q5 0 5 -3.5 q0 -3.5 -5 -3.5 Z" fill={SCENE.ink} />
        <path d="M58 63 q-4 5 -9 2" stroke={SCENE.ink} strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <path d="M58 63 q4 5 9 2" stroke={SCENE.ink} strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </g>
    </motion.svg>
  );
}
