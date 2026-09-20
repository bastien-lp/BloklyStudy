/**
 * devUI — the small building blocks of the administration console.
 * --------------------------------------------------------------------------
 * Pulled out of DevPanel.jsx so its tabs can live in their own files without
 * importing each other in a circle. Same look, same behaviour: surfaces use
 * the theme tokens, the console chrome keeps its fixed orange, and the text
 * stays in French (administrators only — see the header of DevPanel.jsx).
 */

import { motion } from 'motion/react';

export function StatCard({ label, value, color = 'var(--accent)', sub }) {
  return (
    <div style={{
      padding: 14, borderRadius: 12, textAlign: 'center',
      background: 'var(--bg-card)', border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 900, color, lineHeight: 1.1, wordBreak: 'break-word' }}>
        {value}
      </div>
      <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginTop: 5 }}>{label}</div>
      {sub && <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', opacity: .7, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function Chip({ children, color = 'var(--accent)' }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 20, fontSize: '.62rem', fontWeight: 700,
      background: 'var(--accent-subtle)', color, border: '1px solid var(--border)',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

export function Spinner({ label = 'Chargement…' }) {
  return (
    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2.5rem', fontSize: '.82rem' }}>
      {label}
    </div>
  );
}

export function Empty({ children }) {
  return (
    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2.5rem', fontSize: '.82rem' }}>
      {children}
    </div>
  );
}

/** Small icon+label button used across the console. */
export function ToolButton({ icon: Icon, children, onClick, disabled, tone }) {
  return (
    <motion.button
      whileHover={disabled ? {} : { scale: 1.03 }} whileTap={disabled ? {} : { scale: .97 }}
      onClick={onClick} disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
        borderRadius: 9, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .5 : 1,
        border: `1px solid ${tone || 'var(--border-strong)'}`, background: 'var(--bg-card)',
        color: tone || 'var(--text-secondary)', fontSize: '.74rem', fontWeight: 700,
      }}>
      {Icon && <Icon size={13} strokeWidth={2.2} />}
      {children}
    </motion.button>
  );
}
