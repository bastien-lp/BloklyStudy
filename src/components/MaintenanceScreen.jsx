/**
 * MaintenanceScreen — what non-admins see while `config/app.maintenance` is on.
 * --------------------------------------------------------------------------
 * Deliberately reassuring: a student who opens the app mid-revision and finds
 * it closed needs to know their work is safe and roughly when to come back.
 * The administrator's own announcement is shown when there is one.
 */

import { motion } from 'motion/react';
import { Wrench, RefreshCw, Home } from 'lucide-react';
import { useTranslation } from '../i18n';

/**
 * @param {object}   props
 * @param {string}   props.message  the administrator's announcement, if any
 * @param {Function} [props.onHome] show the public home page instead — the way
 *                                  out for someone who cannot get past this
 *                                  screen. Omitted, the button is not rendered.
 */
export function MaintenanceScreen({ message, onHome }) {
  const { t } = useTranslation();

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, background: 'var(--bg-base)', color: 'var(--text-primary)',
    }}>
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        style={{
          width: '100%', maxWidth: 420, textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 56, height: 56, borderRadius: '50%',
          background: 'var(--accent-subtle)', color: 'var(--accent)',
        }}>
          <Wrench size={26} strokeWidth={2} />
        </span>

        <h1 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
          {t('system.maintenanceTitle')}
        </h1>
        <p style={{ fontSize: '.85rem', lineHeight: 1.6, color: 'var(--text-muted)', margin: 0 }}>
          {t('system.maintenanceBody')}
        </p>

        {/* The administrator's own words, when they left any. */}
        {message && (
          <div style={{
            width: '100%', padding: '11px 14px', borderRadius: 12, textAlign: 'left',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            fontSize: '.8rem', lineHeight: 1.55, color: 'var(--text-secondary)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {message}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
          <motion.button
            whileHover={{ scale: 1.03 }} whileTap={{ scale: .97 }}
            onClick={() => window.location.reload()}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '9px 20px', borderRadius: 20, border: 'none', cursor: 'pointer',
              background: 'var(--accent)', color: '#fff', fontSize: '.82rem', fontWeight: 700,
            }}>
            <RefreshCw size={14} strokeWidth={2.4} />
            {t('system.maintenanceRetry')}
          </motion.button>

          {onHome && (
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: .97 }}
              onClick={onHome}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '9px 20px', borderRadius: 20, cursor: 'pointer',
                border: '1px solid var(--border-strong)', background: 'var(--bg-card)',
                color: 'var(--text-secondary)', fontSize: '.82rem', fontWeight: 700,
              }}>
              <Home size={14} strokeWidth={2.4} />
              {t('system.maintenanceHome')}
            </motion.button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

export default MaintenanceScreen;
