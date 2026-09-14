/**
 * UI primitives — the shared vocabulary the pages were missing.
 * --------------------------------------------------------------------------
 * Phase A of the design-system work described in CLAUDE.md. Until now every
 * page hand-rolled its own card padding, radius and shadow with inline styles
 * (~2 700 `style={{}}` across the app), which is why the UI reads as "frames
 * inside frames" and why hard-coded colours keep slipping past the themes.
 *
 * These components consume the CSS variables from `src/themes/themes.js` only,
 * so anything built with them follows the 63 themes for free.
 *
 * MIGRATION: pages are moved over one at a time (phase B). Nothing here changes
 * an existing page until that page is explicitly migrated — importing this file
 * has no side effects.
 *
 * Every component forwards `style` so a page can still make a one-off
 * adjustment without abandoning the primitive.
 */

import { motion } from 'motion/react';
import { SPACE, RADIUS } from './scale';

/* ── Card ─────────────────────────────────────────────────────────────────
   A single surface. `flat` drops the shadow for cards that sit inside another
   surface — that is the escape hatch instead of nesting bordered boxes. */
export function Card({ children, padding = 'lg', flat = false, interactive = false, style, ...rest }) {
  const Tag = interactive ? motion.div : 'div';
  return (
    <Tag
      {...(interactive ? { whileHover: { y: -2 }, transition: { duration: .2, ease: 'easeOut' } } : {})}
      style={{
        background: 'var(--bg-card)',
        borderRadius: RADIUS.lg,
        padding: SPACE[padding] ?? padding,
        boxShadow: flat ? 'none' : 'var(--card-shadow)',
        cursor: interactive ? 'pointer' : undefined,
        ...style,
      }}
      {...rest}>
      {children}
    </Tag>
  );
}

/* ── Section ──────────────────────────────────────────────────────────────
   A titled region. Hierarchy comes from the heading and the spacing, never
   from another border. `aside` is the muted counter/hint on the right. */
export function Section({ title, icon: Icon, aside, children, style, ...rest }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: SPACE.md, ...style }} {...rest}>
      {(title || aside) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm }}>
          {Icon && <Icon size={16} strokeWidth={2.2} color="var(--accent)" style={{ flexShrink: 0 }} />}
          {title && (
            <h2 style={{ margin: 0, fontSize: '.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {title}
            </h2>
          )}
          {aside && (
            <span style={{ marginLeft: 'auto', fontSize: '.68rem', color: 'var(--text-muted)' }}>
              {aside}
            </span>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

/* ── Button ───────────────────────────────────────────────────────────────
   Three weights: `primary` for the one action that matters, `secondary` for
   the rest, `ghost` for anything that should stay quiet. `danger` recolours
   whichever weight it is applied to. */
const BUTTON_SIZES = {
  sm: { padding: '6px 12px', fontSize: '.72rem', gap: 5, icon: 13 },
  md: { padding: '9px 18px', fontSize: '.8rem',  gap: 6, icon: 15 },
  lg: { padding: '12px 24px', fontSize: '.88rem', gap: 7, icon: 17 },
};

export function Button({
  children, onClick, variant = 'secondary', size = 'md', icon: Icon,
  danger = false, disabled = false, full = false, style, ...rest
}) {
  const s = BUTTON_SIZES[size] || BUTTON_SIZES.md;
  const accent = danger ? 'var(--danger)' : 'var(--accent)';

  const skins = {
    primary:   { background: accent, color: '#fff', boxShadow: `0 4px 14px -8px ${danger ? 'rgba(231,76,60,.9)' : 'var(--accent-glow)'}` },
    secondary: { background: 'var(--bg-card-hover)', color: danger ? accent : 'var(--text-secondary)' },
    ghost:     { background: 'transparent', color: danger ? accent : 'var(--text-muted)' },
  };

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? {} : { scale: 1.03 }}
      whileTap={disabled ? {} : { scale: .97 }}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        gap: s.gap, padding: s.padding, fontSize: s.fontSize, fontWeight: 700,
        border: 'none', borderRadius: RADIUS.pill, cursor: disabled ? 'not-allowed' : 'pointer',
        width: full ? '100%' : undefined,
        opacity: disabled ? .45 : 1,
        transition: 'background .15s, color .15s',
        ...(skins[variant] || skins.secondary),
        ...style,
      }}
      {...rest}>
      {Icon && <Icon size={s.icon} strokeWidth={2.2} style={{ flexShrink: 0 }} />}
      {children}
    </motion.button>
  );
}

/* ── EmptyState ───────────────────────────────────────────────────────────
   Replaces the dashed-border boxes with an emoji that pages repeat today.
   Pass a lucide icon (or any component taking `size`), not a glyph. */
export function EmptyState({ icon: Icon, title, description, action, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
      textAlign: 'center', gap: SPACE.sm, padding: '3rem 1.5rem', ...style }}>
      {Icon && (
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 44, height: 44, borderRadius: '50%', marginBottom: SPACE.xs,
          background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
          <Icon size={21} strokeWidth={2} />
        </span>
      )}
      {title && (
        <div style={{ fontSize: '.9rem', fontWeight: 800, color: 'var(--text-primary)' }}>{title}</div>
      )}
      {description && (
        <div style={{ fontSize: '.78rem', lineHeight: 1.6, color: 'var(--text-muted)', maxWidth: 320 }}>
          {description}
        </div>
      )}
      {action && <div style={{ marginTop: SPACE.xs }}>{action}</div>}
    </div>
  );
}
