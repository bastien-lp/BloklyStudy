/**
 * NotificationPrompt — asks to turn notifications on, for messages and
 * friend requests.
 * --------------------------------------------------------------------------
 * A browser never lets a site switch notifications on by itself: the student
 * must accept once, after a tap. So, a few seconds after the app opens, this
 * card explains why and offers "Turn on"; the browser's own dialog follows.
 *
 * Shown only when it can work and has not been answered: push supported,
 * browser permission still "default" (never asked), and not postponed in the
 * last SNOOZE_DAYS, and "Don't ask again" not chosen on this browser (they
 * can still turn notifications on from the profile). When the permission is already granted, AppPage registers
 * the device silently instead (lib/notifications.js ensurePushSubscription).
 *
 * Props: { user }
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BellRing, X } from 'lucide-react';
import { useTranslation } from '../i18n';
import { pushSupport, notificationPermission, enablePushOnThisDevice, rememberDeviceChoice } from '../lib/notifications';
import { Button } from './ui';

const SNOOZE_KEY = 'blokly-notif-prompt-until';
const SNOOZE_DAYS = 3;
const DELAY_MS = 4000;

const NEVER_KEY = 'blokly-notif-prompt-never';

function shouldAsk() {
  if (pushSupport() !== 'supported' || notificationPermission() !== 'default') return false;
  try {
    if (localStorage.getItem(NEVER_KEY) === '1') return false;
    return Date.now() > Number(localStorage.getItem(SNOOZE_KEY) || 0);
  } catch { return true; }
}

function snooze(days) {
  try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + days * 86_400_000)); } catch { /* no storage */ }
}

export default function NotificationPrompt({ user }) {
  const { t, lang } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !shouldAsk()) return undefined;
    const id = setTimeout(() => setOpen(shouldAsk()), DELAY_MS);
    return () => clearTimeout(id);
  }, [user]);

  async function enable() {
    setBusy(true);
    try {
      const result = await enablePushOnThisDevice(user, lang);
      if (result === 'granted') rememberDeviceChoice(user, false);
      // Refused in the browser's dialog: it will not ask again anyway.
      if (result !== 'granted') snooze(SNOOZE_DAYS);
    } catch {
      snooze(1);
    }
    setBusy(false);
    setOpen(false);
  }

  function later() {
    snooze(SNOOZE_DAYS);
    setOpen(false);
  }

  /** Never show this card again on this browser (notifications stay available in the profile). */
  function never() {
    try { localStorage.setItem(NEVER_KEY, '1'); } catch { snooze(365); }
    setOpen(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <div key="notif-prompt" style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--dock-h, 72px) + 28px)', zIndex: 1200,
          display: 'flex', justifyContent: 'center', padding: '0 16px', pointerEvents: 'none' }}>
        <motion.div role="dialog" aria-labelledby="notif-prompt-title" aria-describedby="notif-prompt-text"
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }}
          transition={{ duration: .3, ease: 'easeOut' }}
          style={{ pointerEvents: 'auto',
            width: 400, maxWidth: '100%', padding: '16px 16px 14px', borderRadius: 20,
            background: 'var(--bg-modal)', boxShadow: '0 18px 50px -12px rgba(0,0,0,.55), inset 0 0 0 1px var(--border-strong)',
            display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
              <BellRing size={20} aria-hidden="true" />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div id="notif-prompt-title" style={{ fontSize: '.92rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('notifPrompt.title')}</div>
              <div id="notif-prompt-text" style={{ fontSize: '.76rem', lineHeight: 1.5, color: 'var(--text-secondary)', marginTop: 3 }}>{t('notifPrompt.text')}</div>
            </div>
            <button type="button" onClick={later} aria-label={t('common.close')}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 2 }}>
              <X size={16} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={never}
              style={{ marginRight: 'auto', background: 'transparent', border: 'none', padding: '4px 2px', cursor: 'pointer',
                fontSize: '.72rem', color: 'var(--text-muted)', textDecoration: 'underline', fontFamily: 'var(--font-family)' }}>
              {t('notifPrompt.never')}
            </button>
            <Button variant="ghost" onClick={later}>{t('notifPrompt.later')}</Button>
            <Button variant="primary" icon={BellRing} disabled={busy} onClick={enable}>{t('notifPrompt.enable')}</Button>
          </div>
        </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
