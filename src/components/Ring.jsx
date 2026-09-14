/**
 * Ring — the circular countdown used by the focus timers.
 * --------------------------------------------------------------------------
 * Extracted from PageStudy so the solo timer and live group sessions draw the
 * exact same dial, including the user's `ringStyle` preference (default /
 * dashes / dots / thick / thin / glow).
 *
 * `pct` is the share of time REMAINING (1 → 0), so the arc empties as the
 * countdown runs out. Children are centred inside the ring.
 */

import { motion } from 'motion/react';

// ── Progress ring (SVG) ──────────────────────────────────────────────────────
export function Ring({ pct, size = 220, stroke = 11, color = '#4A90D9', children, running, ringStyle = 'default' }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  const trackOpacity = running ? 0.12 : 0.18;

  const dashArray = ringStyle === 'dashes'
    ? `${circ / 24} ${circ / 36}`
    : ringStyle === 'dots'
    ? `2 ${circ / 28}`
    : undefined;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)', position: 'absolute', inset: 0, overflow: 'visible' }}>
        {/* Background track — faint, tinted with the accent color */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke}
          opacity={trackOpacity}
          strokeDasharray={dashArray}
          strokeLinecap={ringStyle === 'dashes' || ringStyle === 'dots' ? 'round' : 'butt'} />
        {/* Progress arc */}
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={ringStyle === 'thick' ? stroke * 1.6 : ringStyle === 'thin' ? stroke * 0.55 : stroke}
          strokeDasharray={circ}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: .5, ease: 'easeOut' }}
          strokeLinecap="round"
          style={{
            filter: running
              ? `drop-shadow(0 0 ${ringStyle === 'glow' ? '12px' : '5px'} ${color}) ${ringStyle === 'glow' ? `drop-shadow(0 0 24px ${color})` : ''}`
              : 'none',
            transition: 'filter .4s',
          }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </div>
    </div>
  );
}
