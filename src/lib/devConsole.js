/**
 * Shared constants of the administration console.
 * --------------------------------------------------------------------------
 * Kept out of the component files so those export components only (the
 * fast-refresh rule) and so every console surface formats numbers the same.
 */

/** Console chrome colour — intentionally outside the theme palette. */
export const DEV = '#ff6400';

/** Thousands-separated integer, the console's only number format. */
export const fmt = n => (Number(n) || 0).toLocaleString('fr-FR');

/** Text input style shared by every console field. */
export const inputStyle = {
  padding: '7px 10px', borderRadius: 8, outline: 'none', boxSizing: 'border-box',
  border: '1px solid var(--border-strong)', background: 'var(--bg-input)',
  color: 'var(--text-primary)', fontSize: '.82rem', fontFamily: 'inherit',
};
