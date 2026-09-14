/**
 * SystemBanner — the announcement the administrator writes in the dev panel.
 * --------------------------------------------------------------------------
 * Sits above the app when `config/app.systemMessage` is non-empty. A reader
 * can dismiss it; the dismissal is remembered per message text, so editing the
 * announcement makes it reappear while re-reading the same one does not.
 *
 * When maintenance is on, administrators keep working and see this banner say
 * so — otherwise it is very easy to forget the app is closed to everyone else.
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { Megaphone, Wrench, X } from 'lucide-react';
import { useTranslation } from '../i18n';

const KEY = 'blokly-dismissed-announce-v1';

/** A short stable fingerprint of the message, so an edit re-shows the banner. */
function fingerprint(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return String(h);
}

export function SystemBanner({ message, maintenance = false }) {
  const { t } = useTranslation();
  const id = message ? fingerprint(message) : '';
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(KEY) === id && !!id; } catch { return false; }
  });

  // The maintenance warning is never dismissible: an admin must not lose track
  // of the fact that everyone else is locked out.
  if (!message && !maintenance) return null;
  if (!maintenance && dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  }

  const tone = maintenance ? 'var(--danger)' : 'var(--accent)';

  /*
   * The maintenance notice gets a SOLID surface of its own. It used to sit on
   * `--bg-card`, which is a 2.5–5 % translucent white: on the darkest themes
   * that is indistinguishable from the page, so the banner had no surface at
   * all, and the theme red read at 3.97:1 on `abyssal` (below WCAG AA).
   *
   * Both colours are mixed from the theme's own tokens, so every theme gets a
   * banner that matches it. `--bg-base` is opaque in every theme, which makes
   * the mix predictable. Measured across all 27 themes, worst case: title
   * 7.97:1, message 12.11:1 (both AAA), border 3.51:1 against the surface.
   */
  const surface = maintenance
    ? {
        background: 'color-mix(in srgb, var(--danger) 16%, var(--bg-base))',
        borderBottom: '2px solid var(--danger)',
        color: 'var(--text-primary)',
      }
    : {
        background: 'var(--bg-card)',
        borderBottom: `1px solid ${tone}`,
        color: 'var(--text-secondary)',
      };
  // A red pulled towards the theme's text colour: light pink on dark themes,
  // deep red on light ones — legible on the tinted surface either way.
  const accentText = maintenance
    ? 'color-mix(in srgb, var(--danger) 40%, var(--text-primary))'
    : tone;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      role="status"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '9px 14px',
        ...surface,
      }}>
      <span style={{ color: accentText, flexShrink: 0, display: 'flex', paddingTop: 1 }}>
        {maintenance ? <Wrench size={14} strokeWidth={2.4} /> : <Megaphone size={14} strokeWidth={2.4} />}
      </span>

      <div style={{ flex: 1, minWidth: 0, fontSize: '.76rem', lineHeight: 1.5 }}>
        {maintenance && (
          <div style={{ fontWeight: 800, color: accentText, marginBottom: message ? 3 : 0 }}>
            {t('system.maintenanceAdmin')}
          </div>
        )}
        {message && (
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message}</div>
        )}
      </div>

      {!maintenance && (
        <button onClick={dismiss} aria-label={t('system.announceDismiss')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2,
            color: 'var(--text-muted)', flexShrink: 0, display: 'flex' }}>
          <X size={14} />
        </button>
      )}
    </motion.div>
  );
}

export default SystemBanner;
