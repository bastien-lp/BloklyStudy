/**
 * InstallPrompt — a discreet "install Blokly on your device" card.
 * --------------------------------------------------------------------------
 * Shown when the browser allows installing (Chrome / Edge / Android: one tap)
 * or on iPhone / iPad Safari (step-by-step "Share → Add to Home Screen").
 * Never shown inside the installed app. "Later" hides it for 30 days
 * (remembered in this browser only).
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, Share, X, SquarePlus } from 'lucide-react';
import { useTranslation } from '../i18n';
import { canPromptInstall, promptInstall, isStandalone, isIos, onInstallAvailabilityChange } from '../lib/pwa';
import { asset } from '../lib/assets';

const DISMISS_KEY = 'blokly-install-dismissed';
const DISMISS_MS = 30 * 86_400_000;

function recentlyDismissed() {
  try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < DISMISS_MS; } catch { return false; }
}

export default function InstallPrompt() {
  const { t } = useTranslation();
  const [available, setAvailable] = useState(canPromptInstall());
  const [hidden, setHidden] = useState(() => isStandalone() || recentlyDismissed());
  const ios = isIos();

  useEffect(() => onInstallAvailabilityChange(() => setAvailable(canPromptInstall())), []);

  const show = !hidden && (available || ios);

  function later() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode: hide for this visit */ }
    setHidden(true);
  }

  async function install() {
    const accepted = await promptInstall();
    if (accepted) setHidden(true);
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.aside initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
          transition={{ duration: .35, ease: 'easeOut', delay: .8 }} aria-label={t('install.title')}
          style={{ position: 'fixed', left: 12, right: 12, bottom: 'calc(12px + env(safe-area-inset-bottom))', zIndex: 900,
            maxWidth: 420, margin: '0 auto', display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px',
            borderRadius: 18, background: 'var(--bg-modal)', boxShadow: '0 16px 40px -14px rgba(0,0,0,.6)' }}>
          <img src={asset('icons/icon-192.png')} alt="" width={44} height={44} style={{ borderRadius: 11, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.86rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('install.title')}</div>
            {available ? (
              <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 2 }}>{t('install.text')}</div>
            ) : (
              <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 2 }}>
                {t('install.iosStep1')} <Share size={13} aria-label={t('install.shareIcon')} style={{ verticalAlign: '-2px' }} />{' '}
                {t('install.iosStep2')} <SquarePlus size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} />{' '}
                <strong>{t('install.iosAction')}</strong>.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              {available && (
                <button type="button" onClick={install}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 99, border: 'none', cursor: 'pointer',
                    background: 'var(--accent)', color: 'var(--on-accent, #fff)', fontSize: '.76rem', fontWeight: 800 }}>
                  <Download size={14} aria-hidden="true" />{t('install.install')}
                </button>
              )}
              <button type="button" onClick={later}
                style={{ padding: '7px 12px', borderRadius: 99, border: 'none', cursor: 'pointer', background: 'transparent',
                  color: 'var(--text-muted)', fontSize: '.74rem', fontWeight: 600 }}>
                {t('install.later')}
              </button>
            </div>
          </div>
          <button type="button" onClick={later} aria-label={t('install.later')}
            style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 2 }}>
            <X size={16} />
          </button>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
