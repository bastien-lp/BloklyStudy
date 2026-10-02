/**
 * GardenScene — the drawn parts of the garden.
 * --------------------------------------------------------------------------
 * Pure presentation: every piece takes what it shows as props and holds no
 * state of its own, so the garden's rules live in lib/bambooGarden.js and the
 * pages only have to place these on screen.
 *
 * The garden is an ILLUSTRATION, not a themed surface: its colours are fixed
 * (misty morning, warm wood, forest greens) and deliberately do not follow the
 * app theme — exactly like a picture hung on a wall.
 *
 * FIVE SPECIES, one set of rules. A species only changes the drawing and how
 * growth reads on it:
 *   - bamboo grows by HEIGHT (a clip reveals the stalks from the ground up),
 *     which is what bamboo actually does;
 *   - the tree and flower species grow in two stages: a SEEDLING while the
 *     plot is under SPROUT_UNTIL (a stem with its first pair of leaves, and a
 *     hint of what it will become), then the adult form growing by SIZE. A
 *     shrunken full-grown tree read as a blob; a sprout reads as a beginning.
 * Everything else — ground, mist, ripe halo, fireflies — is shared, so the
 * plots stay part of the same garden whatever is planted in them.
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
 * is the sky the garden stands in.
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
      <path d="M62 0 L100 0 L100 34 Z" fill={`url(#ray${id})`} />
      <path d="M78 0 L100 0 L100 62 Z" fill={`url(#ray${id})`} opacity=".5" />

      {far.map((x, i) => (
        <DistantStalk key={`f${x}`} x={x} top={i % 3 ? 2 : 9} width={i % 2 ? 0.8 : 1.2} tone="#B9CDA6" />
      ))}
      {mid.map((x, i) => (
        <DistantStalk key={`m${x}`} x={x} top={i % 2 ? 6 : 14} width={2} tone="#8FAE77" />
      ))}

      <rect width="100" height="100" fill={`url(#mist${id})`} />
    </svg>
  );
}

/* ── The shared plot ─────────────────────────────────────────────────────── */

const VIEW_W = 130;
const VIEW_H = 210;
const SOIL_Y = 186;      // where a plant meets the ground
const PLANT_TOP = 22;    // how high a fully grown plant reaches
const CENTER = 65;
const FULL_H = SOIL_Y - PLANT_TOP;

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

/** A trunk that tapers as it rises, with a hint of bark on its shaded side. */
function Trunk({ from = SOIL_Y, to, lean = 0, width, dark = '#5E4632', light = '#8C6440' }) {
  const topX = CENTER + lean;
  const wTop = width * 0.45;
  const span = from - to;
  return (
    <g>
      <path fill={light}
        d={`M${CENTER - width} ${from}
            C${CENTER - width * 0.8} ${from - span * 0.5} ${topX - wTop * 1.4} ${to + span * 0.25} ${topX - wTop} ${to}
            L${topX + wTop} ${to}
            C${topX + wTop * 1.4} ${to + span * 0.25} ${CENTER + width * 0.8} ${from - span * 0.5} ${CENTER + width} ${from} Z`} />
      <path fill={dark} opacity=".5"
        d={`M${CENTER + width * 0.15} ${from}
            C${CENTER + width * 0.3} ${from - span * 0.5} ${topX + wTop * 0.2} ${to + span * 0.25} ${topX + wTop * 0.3} ${to}
            L${topX + wTop} ${to}
            C${topX + wTop * 1.4} ${to + span * 0.25} ${CENTER + width * 0.8} ${from - span * 0.5} ${CENTER + width} ${from} Z`} />
    </g>
  );
}

/** A branch: one stroke from the trunk to where a canopy sits. */
function Branch({ x1, y1, x2, y2, width = 4, color = '#6B4A2F' }) {
  const mx = (x1 + x2) / 2 + (x2 - x1) * 0.1;
  const my = (y1 + y2) / 2 - 8;
  return <path d={`M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`} stroke={color} strokeWidth={width} fill="none" strokeLinecap="round" />;
}

/* ── Species: bamboo ─────────────────────────────────────────────────────── */

/** One bamboo stalk: stacked internodes, node rings and fanned leaves. */
function BambooStalk({ baseX, lean, height, width, fill, edge, leafFill, leafCount, seed }) {
  const top = SOIL_Y - height;
  const nodes = Math.max(2, Math.round(height / 26));
  const xAt = t => baseX + lean * t * t;
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
          <path fill="#FFFFFF" opacity=".5"
            d={`M${s.x0 - s.w0} ${s.y0} L${s.x1 - s.w1} ${s.y1 + 1.6} L${s.x1 - s.w1 * 0.3} ${s.y1 + 1.6} L${s.x0 - s.w0 * 0.3} ${s.y0} Z`} />
          <path fill={edge} opacity=".28"
            d={`M${s.x0 + s.w0 * 0.45} ${s.y0} L${s.x1 + s.w1 * 0.45} ${s.y1 + 1.6} L${s.x1 + s.w1} ${s.y1 + 1.6} L${s.x0 + s.w0} ${s.y0} Z`} />
          <path d={`M${s.x1 - s.w1 - 0.8} ${s.y1 + 1.4} q${s.w1 + 0.8} 1.7 ${(s.w1 + 0.8) * 2} 0`}
            stroke={edge} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </g>
      ))}

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
      <path d={`M${xAt(1) - wAt(1)} ${top + 3} Q${xAt(1)} ${top - 7} ${xAt(1) + wAt(1)} ${top + 3} Z`} fill={leafFill} />
    </g>
  );
}

function BambooBody({ tint }) {
  const leafFill = tint || SCENE.leaf;
  return (
    <>
      <g opacity=".62">
        <BambooStalk baseX={52} lean={-7} height={FULL_H * 0.82} width={5.2} leafCount={3} seed={1}
          fill="#7FA06A" edge="#5C7A4C" leafFill="#89AE6F" />
        <BambooStalk baseX={78} lean={6} height={FULL_H * 0.74} width={4.6} leafCount={3} seed={2}
          fill="#7FA06A" edge="#5C7A4C" leafFill="#89AE6F" />
      </g>
      <BambooStalk baseX={65} lean={1} height={FULL_H} width={6} leafCount={4} seed={0}
        fill={SCENE.leaf} edge={SCENE.leafDeep} leafFill={leafFill} />
    </>
  );
}

/* ── Species: cherry blossom ─────────────────────────────────────────────── */

const SAKURA_CLUSTERS = [
  { cx: 65, cy: 62, r: 26 }, { cx: 40, cy: 80, r: 20 }, { cx: 91, cy: 82, r: 19 },
  { cx: 52, cy: 50, r: 16 }, { cx: 80, cy: 52, r: 15 }, { cx: 65, cy: 92, r: 15 },
];
const SAKURA_BLOOMS = [[50, 46], [78, 44], [34, 74], [97, 78], [65, 36], [60, 100]];

function SakuraBody() {
  return (
    <>
      <Trunk to={118} width={9} lean={-2} dark="#5A4030" light="#83614A" />
      <Branch x1={64} y1={130} x2={42} y2={96} width={5} color="#6E5140" />
      <Branch x1={65} y1={138} x2={92} y2={100} width={5} color="#6E5140" />
      <Branch x1={63} y1={120} x2={55} y2={78} width={4} color="#6E5140" />
      <Branch x1={64} y1={118} x2={79} y2={74} width={4} color="#6E5140" />

      {/* blossom masses, darkest first so the light ones sit on top */}
      {SAKURA_CLUSTERS.map((c, i) => (
        <circle key={`d${i}`} cx={c.cx + 3} cy={c.cy + 4} r={c.r} fill="#E68CA8" opacity=".85" />
      ))}
      {SAKURA_CLUSTERS.map((c, i) => (
        <circle key={`m${i}`} cx={c.cx} cy={c.cy} r={c.r * 0.92} fill="#F3B3C8" />
      ))}
      {SAKURA_CLUSTERS.map((c, i) => (
        <circle key={`l${i}`} cx={c.cx - 4} cy={c.cy - 5} r={c.r * 0.6} fill="#FBDCE6" opacity=".9" />
      ))}

      {/* single blossoms catching the light */}
      {SAKURA_BLOOMS.map(([x, y], i) => (
        <g key={i}>
          {[0, 1, 2, 3, 4].map(p => {
            const a = (p / 5) * Math.PI * 2;
            return <ellipse key={p} cx={x + Math.cos(a) * 3.4} cy={y + Math.sin(a) * 3.4} rx="2.6" ry="2.2" fill="#FFF3F7" />;
          })}
          <circle cx={x} cy={y} r="1.5" fill="#E8A33C" />
        </g>
      ))}
    </>
  );
}

/* ── Species: maple ──────────────────────────────────────────────────────── */

/** A five-lobed maple leaf, small enough to read at this size. */
function MapleLeaf({ x, y, size, fill, rotate = 0 }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${size / 10})`}>
      <path fill={fill} d="M0 6 L-1.6 2.6 L-6 3.6 L-4.2 0.4 L-9 -1.4 L-4.6 -2.6 L-6.4 -6.6 L-2.2 -4.8 L0 -9.4
        L2.2 -4.8 L6.4 -6.6 L4.6 -2.6 L9 -1.4 L4.2 0.4 L6 3.6 L1.6 2.6 Z" />
      <path d="M0 6 V-6" stroke="#7A3B24" strokeWidth=".7" opacity=".45" />
    </g>
  );
}

const MAPLE_LEAVES = [
  { x: 65, y: 54, size: 30, rot: 0, tone: 0 }, { x: 44, y: 70, size: 26, rot: -25, tone: 1 },
  { x: 88, y: 70, size: 26, rot: 25, tone: 1 }, { x: 52, y: 44, size: 22, rot: -14, tone: 2 },
  { x: 80, y: 44, size: 22, rot: 16, tone: 2 }, { x: 33, y: 92, size: 20, rot: -38, tone: 0 },
  { x: 98, y: 92, size: 20, rot: 38, tone: 2 }, { x: 65, y: 86, size: 24, rot: 8, tone: 1 },
  { x: 47, y: 104, size: 18, rot: -18, tone: 2 }, { x: 84, y: 106, size: 18, rot: 22, tone: 0 },
];
const MAPLE_TONES = ['#C4553A', '#D9773A', '#E0A03C'];

function MapleBody() {
  return (
    <>
      <Trunk to={112} width={10} lean={1} dark="#553A26" light="#7E5A3C" />
      <Branch x1={64} y1={132} x2={44} y2={100} width={5.5} color="#6B4A2F" />
      <Branch x1={66} y1={136} x2={88} y2={102} width={5.5} color="#6B4A2F" />
      <Branch x1={64} y1={116} x2={52} y2={86} width={4} color="#6B4A2F" />
      <Branch x1={65} y1={114} x2={80} y2={84} width={4} color="#6B4A2F" />

      {/* soft canopy behind the leaves, so the crown reads as one mass */}
      <ellipse cx="65" cy="72" rx="42" ry="34" fill="#C4553A" opacity=".22" />
      <ellipse cx="55" cy="62" rx="26" ry="22" fill="#E0A03C" opacity=".16" />

      {MAPLE_LEAVES.map((l, i) => (
        <MapleLeaf key={i} x={l.x} y={l.y} size={l.size} rotate={l.rot} fill={MAPLE_TONES[l.tone]} />
      ))}
    </>
  );
}

/* ── Species: sunflower ──────────────────────────────────────────────────── */

const HEAD = { x: 65, y: 62, r: 20 };

function SunflowerBody({ id }) {
  return (
    <>
      <path d={`M65 ${SOIL_Y} C62 150 68 110 65 ${HEAD.y + HEAD.r - 4}`}
        stroke="#4F7A38" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d={`M65 ${SOIL_Y} C63 150 67 110 65 ${HEAD.y + HEAD.r - 4}`}
        stroke="#6E9B4E" strokeWidth="2.6" fill="none" strokeLinecap="round" opacity=".8" />

      <Leaf x={64} y={150} dir={-1} len={34} tilt={12} fill="#4F7A38" />
      <Leaf x={66} y={132} dir={1} len={30} tilt={14} fill="#5E8C42" />
      <Leaf x={64} y={112} dir={-1} len={24} tilt={10} fill="#6E9B4E" />

      {/* petals: two offset rings, so the head has depth */}
      {Array.from({ length: 13 }, (_, i) => {
        const a = (i / 13) * Math.PI * 2;
        return (
          <ellipse key={`o${i}`} rx="7" ry="15" fill="#E8B33C"
            transform={`translate(${HEAD.x + Math.cos(a) * 16} ${HEAD.y + Math.sin(a) * 16}) rotate(${(a * 180) / Math.PI + 90})`} />
        );
      })}
      {Array.from({ length: 13 }, (_, i) => {
        const a = ((i + 0.5) / 13) * Math.PI * 2;
        return (
          <ellipse key={`i${i}`} rx="6" ry="13" fill={`url(#petal${id})`}
            transform={`translate(${HEAD.x + Math.cos(a) * 13} ${HEAD.y + Math.sin(a) * 13}) rotate(${(a * 180) / Math.PI + 90})`} />
        );
      })}

      <circle cx={HEAD.x} cy={HEAD.y} r={HEAD.r * 0.62} fill="#6B4A2F" />
      <circle cx={HEAD.x} cy={HEAD.y} r={HEAD.r * 0.62} fill={`url(#seeds${id})`} />
      {/* seeds laid out on the golden angle, like a real head */}
      {Array.from({ length: 18 }, (_, i) => {
        const a = i * 2.39996;
        const rr = 1.6 + Math.sqrt(i) * 2.3;
        return <circle key={i} cx={HEAD.x + Math.cos(a) * rr} cy={HEAD.y + Math.sin(a) * rr} r="1.1" fill="#4B3220" opacity=".6" />;
      })}
    </>
  );
}

/* ── Species: pine ───────────────────────────────────────────────────────── */

const PINE_TIERS = [
  { y: 168, half: 44, h: 46 },
  { y: 136, half: 38, h: 44 },
  { y: 104, half: 30, h: 40 },
  { y: 74, half: 21, h: 36 },
];

function PineBody() {
  return (
    <>
      <Trunk to={150} width={7} dark="#4E3724" light="#75543A" />
      {PINE_TIERS.map((tier, i) => {
        const top = tier.y - tier.h;
        // a jagged skirt instead of a flat triangle: reads as needles
        const steps = 6;
        const points = Array.from({ length: steps + 1 }, (_, s) => {
          const x = CENTER - tier.half + (s / steps) * tier.half * 2;
          return `${x} ${tier.y + (s % 2 ? 0 : -6)}`;
        });
        return (
          <g key={i}>
            <path fill={i % 2 ? '#3E6B2E' : SCENE.leafDeep} d={`M${CENTER} ${top} L${points.join(' L')} Z`} />
            <path fill="#FFFFFF" opacity=".12"
              d={`M${CENTER} ${top} L${CENTER - tier.half} ${tier.y} L${CENTER - tier.half * 0.35} ${tier.y} Z`} />
          </g>
        );
      })}
      {/* two cones hanging in the branches, and the leader at the top */}
      <ellipse cx="48" cy="120" rx="4" ry="6" fill="#8C6440" transform="rotate(-18 48 120)" />
      <ellipse cx="84" cy="152" rx="4.5" ry="6.5" fill="#7A5634" transform="rotate(14 84 152)" />
      <path d={`M${CENTER} 34 l-4.5 11 l9 0 Z`} fill="#3E6B2E" />
    </>
  );
}

/* ── Seedlings ───────────────────────────────────────────────────────────── */

/** Below this much growth, a scaling species is still a sprout. */
const SPROUT_UNTIL = 0.34;

/**
 * The soil mound is a lens drawn OVER the foot of the plant, with its control
 * point this far above the soil line. A quadratic curve reaches half of its
 * control offset, so the dirt actually crests at MOUND_TOP.
 */
const MOUND_CTRL = 11;
const MOUND_TOP = MOUND_CTRL / 2;

/**
 * How deep a sprout's foot sits INSIDE the mound.
 *
 * Every plant is painted before the mound, so the dirt covers its foot and it
 * reads as planted rather than placed. A full-grown plant starts at the soil
 * line and is buried the whole MOUND_TOP; a sprout is only ~28 units tall at
 * its smallest, and that much dirt swallowed its seed leaves. Standing it on
 * the crest instead fixed the leaves but left it perched on top of the mound —
 * balanced on the one highest point of a curved lens, visibly outside the
 * ground. This is the middle: foot hidden, leaves clear.
 */
const SPROUT_BURY = 3;
/** How tall the sprout stands, fully "sprouted", in viewBox units. */
const SPROUT_H = 62;

/**
 * A young plant: a curved stem, two cotyledons, and one detail that says which
 * species it will become — a pink bud, a pair of russet leaves, a yellow bud,
 * a tuft of needles. Drawn at full size; the caller scales it with growth.
 */
function Seedling({ species }) {
  const top = SOIL_Y - SPROUT_H;
  const stem = `M${CENTER} ${SOIL_Y} C${CENTER - 3} ${SOIL_Y - SPROUT_H * 0.45} ${CENTER + 3} ${SOIL_Y - SPROUT_H * 0.7} ${CENTER} ${top}`;

  // Species-specific tones and crown, on the same young stem.
  const look = {
    sakura: { stem: '#6E8B57', leaf: '#6E9B4E' },
    maple: { stem: '#7A6A4A', leaf: '#C4553A' },
    sunflower: { stem: '#4F7A38', leaf: '#5E8C42' },
    pine: { stem: '#4E6B3A', leaf: '#3E6B2E' },
  }[species] || { stem: SCENE.leaf, leaf: SCENE.leafLight };

  return (
    <g>
      {/* two seed leaves at the base, still close to the ground */}
      <Leaf x={CENTER - 1} y={SOIL_Y - SPROUT_H * 0.3} dir={-1} len={17} tilt={7} fill={look.leaf} />
      <Leaf x={CENTER + 1} y={SOIL_Y - SPROUT_H * 0.42} dir={1} len={15} tilt={9} fill={look.leaf} opacity=".9" />
      <path d={stem} stroke={look.stem} strokeWidth="4.2" fill="none" strokeLinecap="round" />

      {species === 'sakura' && (
        <g>
          <circle cx={CENTER} cy={top - 3} r="7" fill="#F3B3C8" />
          <circle cx={CENTER - 2.5} cy={top - 5} r="4" fill="#FBDCE6" />
          <circle cx={CENTER + 4} cy={top + 2} r="3.4" fill="#E68CA8" />
        </g>
      )}

      {species === 'maple' && (
        <g>
          <MapleLeaf x={CENTER - 1} y={top - 2} size={19} rotate={-12} fill="#C4553A" />
          <MapleLeaf x={CENTER + 9} y={top + 7} size={14} rotate={26} fill="#E0A03C" />
        </g>
      )}

      {species === 'sunflower' && (
        <g>
          {/* a bud, still closed, already turned to the light */}
          <ellipse cx={CENTER} cy={top - 1} rx="7.5" ry="9" fill="#E8B33C" />
          <ellipse cx={CENTER - 2} cy={top - 2} rx="4.5" ry="6" fill="#F7DC8A" />
          <path d={`M${CENTER - 7} ${top + 5} q7 6 14 0`} stroke="#4F7A38" strokeWidth="3" fill="none" strokeLinecap="round" />
        </g>
      )}

      {species === 'pine' && (
        <g stroke="#3E6B2E" strokeWidth="2.6" strokeLinecap="round" fill="none">
          <path d={`M${CENTER} ${top + 10} l-11 -9`} />
          <path d={`M${CENTER} ${top + 10} l11 -9`} />
          <path d={`M${CENTER} ${top + 4} l-8 -8`} />
          <path d={`M${CENTER} ${top + 4} l8 -8`} />
          <path d={`M${CENTER} ${top + 2} l0 -9`} />
        </g>
      )}

      {/* the seed husk the sprout just pushed through */}
      <ellipse cx={CENTER + 6} cy={SOIL_Y - 4} rx="4" ry="2.6" fill={SCENE.bark} opacity=".5" transform={`rotate(-18 ${CENTER + 6} ${SOIL_Y - 4})`} />
    </g>
  );
}

/* ── The plant ───────────────────────────────────────────────────────────── */

const BODIES = {
  bamboo: { Body: BambooBody, growth: 'clip' },
  sakura: { Body: SakuraBody, growth: 'scale' },
  maple: { Body: MapleBody, growth: 'scale' },
  sunflower: { Body: SunflowerBody, growth: 'scale' },
  pine: { Body: PineBody, growth: 'scale' },
};

/**
 * One plant growing out of the ground, whatever the species.
 *
 * @param species one of BODIES (falls back to bamboo)
 * @param pct     0 → 1, how grown it is
 * @param ripe    true when it can be cut (warm halo and fireflies)
 * @param tints   colours of the subjects that fed the garden (bamboo leaves)
 * @param idle    false stops every animation
 */
export function GardenPlant({ species = 'bamboo', pct = 0, ripe = false, tints = [], idle = true }) {
  const id = useId().replace(/:/g, '');
  const kind = BODIES[species] || BODIES.bamboo;
  const grown = Math.max(0.06, Math.min(1, pct));
  const revealH = FULL_H * grown + 6;
  // A scaling species is a sprout at first, then the adult form. The adult
  // starts at 0.42 — the height the sprout had reached — so the switch does
  // not jump.
  const sprouting = kind.growth === 'scale' && grown < SPROUT_UNTIL;
  // Where the plant meets the ground: the soil line for a grown plant, and a
  // little way into the mound for a sprout (see SPROUT_BURY). Scaling happens
  // about this point, so the plant cannot drift off the ground as it grows.
  const baseY = sprouting ? SOIL_Y - MOUND_TOP + SPROUT_BURY : SOIL_Y;
  const scale = kind.growth !== 'scale' ? 1
    : sprouting ? 0.45 + 0.55 * (grown / SPROUT_UNTIL)
      : 0.42 + 0.58 * ((grown - SPROUT_UNTIL) / (1 - SPROUT_UNTIL));
  const Body = kind.Body;

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
            <motion.rect x="-40" width={VIEW_W + 80}
              initial={false}
              animate={{ y: SOIL_Y - revealH, height: revealH }}
              transition={{ duration: .9, ease: [.22, 1, .36, 1] }} />
          </clipPath>
          <radialGradient id={`shade${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={SCENE.soilDark} stopOpacity=".35" />
            <stop offset="100%" stopColor={SCENE.soilDark} stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`petal${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F7DC8A" />
            <stop offset="100%" stopColor="#E8B33C" />
          </linearGradient>
          <radialGradient id={`seeds${id}`} cx="38%" cy="34%" r="70%">
            <stop offset="0%" stopColor="#8A6238" stopOpacity=".9" />
            <stop offset="100%" stopColor="#4B3220" stopOpacity=".9" />
          </radialGradient>
        </defs>

        <ellipse cx={CENTER} cy={SOIL_Y + 6} rx="46" ry="12" fill={`url(#shade${id})`} />

        <motion.g
          animate={idle ? { rotate: ripe ? [0, 1.2, 0, -1.2, 0] : [0, .6, 0, -.6, 0] } : {}}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
          style={{ originX: `${CENTER}px`, originY: `${SOIL_Y}px` }}>
          <motion.g
            initial={false} animate={{ scale }} transition={{ duration: .9, ease: [.22, 1, .36, 1] }}
            style={{ originX: `${CENTER}px`, originY: `${baseY}px` }}>
            <g clipPath={kind.growth === 'clip' ? `url(#grow${id})` : undefined}>
              {sprouting
                ? <g transform={`translate(0 ${baseY - SOIL_Y})`}><Seedling species={species} /></g>
                : <Body tint={tints[0]} id={id} />}
            </g>
          </motion.g>
        </motion.g>

        {/* soil mound and grass, drawn over the foot of the plant */}
        <path d={`M30 ${SOIL_Y} Q${CENTER} ${SOIL_Y - MOUND_CTRL} 100 ${SOIL_Y} Q${CENTER} ${SOIL_Y + 13} 30 ${SOIL_Y} Z`} fill={SCENE.soil} />
        <path d={`M30 ${SOIL_Y} Q${CENTER} ${SOIL_Y - MOUND_CTRL} 100 ${SOIL_Y} Q${CENTER} ${SOIL_Y - 4} 30 ${SOIL_Y} Z`} fill={SCENE.soilDark} opacity=".4" />
        <g stroke={SCENE.leafDeep} strokeWidth="1.7" strokeLinecap="round" fill="none" opacity=".62">
          <path d={`M38 ${SOIL_Y} q-5 -7 -1 -12`} />
          <path d={`M45 ${SOIL_Y + 1} q3 -8 9 -10`} />
          <path d={`M88 ${SOIL_Y} q6 -7 2 -12`} />
          <path d={`M94 ${SOIL_Y + 1} q-4 -7 -9 -9`} />
        </g>
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

/** A plot with nothing in it yet: turned soil, a dotted outline and a shoot. */
export function EmptyPlot() {
  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden="true"
      style={{ width: '100%', display: 'block', overflow: 'visible' }}>
      <ellipse cx={CENTER} cy={SOIL_Y + 4} rx="40" ry="11" fill={SCENE.soil} opacity=".28" />
      <ellipse cx={CENTER} cy={SOIL_Y + 4} rx="40" ry="11" fill="none" stroke={SCENE.soilDark}
        strokeWidth="1.6" strokeDasharray="5 6" opacity=".55" />
      <g opacity=".5">
        <path d={`M65 ${SOIL_Y} q-1 -14 1 -22`} stroke={SCENE.leaf} strokeWidth="4" fill="none" strokeLinecap="round" />
        <Leaf x={66} y={SOIL_Y - 18} dir={1} len={13} tilt={6} fill={SCENE.leafLight} />
        <Leaf x={65} y={SOIL_Y - 12} dir={-1} len={11} tilt={4} fill={SCENE.leaf} />
      </g>
    </svg>
  );
}
