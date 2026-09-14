/**
 * Toaster — the single place where background failures become visible.
 * --------------------------------------------------------------------------
 * Mounted once near the root of the app. Listens to `src/lib/notify` and shows
 * a stack of short-lived messages at the bottom of the screen.
 *
 * It also watches the browser's online/offline events, because the most common
 * reason a save fails is a phone that walked into a tunnel.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, WifiOff, X, Gamepad2 } from 'lucide-react';
import { subscribeToNotifications } from '../lib/notify';
import { useTranslation } from '../i18n';
import OfflineGame from './OfflineGame';

const DISMISS_MS = 6000;
const MAX_VISIBLE = 3;

const TONES = {
  error:   { Icon: AlertTriangle, color: 'var(--danger)' },
  success: { Icon: CheckCircle2,  color: 'var(--success)' },
  info:    { Icon: Info,          color: 'var(--accent)' },
  offline: { Icon: WifiOff,       color: 'var(--warning)' },
};

export default function Toaster() {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState([]);
  const [gameOpen, setGameOpen] = useState(false);
  const [backOnline, setBackOnline] = useState(false);
  const timers = useRef(new Map());

  const dismiss = useCallback(id => {
    setToasts(list => list.filter(t => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const push = useCallback(({ key, tone, action }) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts(list => {
      // Same message already on screen? Keep the first instead of stacking.
      if (list.some(item => item.key === key)) return list;
      return [...list, { id, key, tone, action }].slice(-MAX_VISIBLE);
    });
    // A toast offering an action stays until the user deals with it.
    if (!action) timers.current.set(id, setTimeout(() => dismiss(id), DISMISS_MS));
  }, [dismiss]);

  useEffect(() => subscribeToNotifications(push), [push]);

  // Losing the connection is worth saying once, as is getting it back.
  useEffect(() => {
    const onOffline = () => {
      setBackOnline(false);
      push({
        key: 'system.connectionLost',
        tone: 'offline',
        action: { labelKey: 'system.play', icon: Gamepad2, run: () => setGameOpen(true) },
      });
    };
    const onOnline = () => {
      setBackOnline(true);
      push({ key: 'system.connectionBack', tone: 'success' });
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [push]);

  // Clear pending timers if the app unmounts mid-flight.
  useEffect(() => {
    const pending = timers.current;
    return () => { pending.forEach(clearTimeout); pending.clear(); };
  }, []);

  return (
    <>
    <div aria-live="polite" aria-atomic="false"
      style={{ position: 'fixed', left: '50%', bottom: 'max(18px, env(safe-area-inset-bottom))',
        transform: 'translateX(-50%)', zIndex: 20000, display: 'flex', flexDirection: 'column',
        gap: 8, width: 'min(420px, calc(100vw - 24px))', pointerEvents: 'none' }}>
      <AnimatePresence initial={false}>
        {toasts.map(toast => {
          const { Icon, color } = TONES[toast.tone] || TONES.info;
          return (
            <motion.div key={toast.id} layout
              initial={{ opacity: 0, y: 16, scale: .96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: .96 }}
              transition={{ duration: .22, ease: 'easeOut' }}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 12px',
                borderRadius: 14, pointerEvents: 'auto',
                background: 'var(--bg-modal)', color: 'var(--text-primary)',
                boxShadow: `0 0 0 1px ${color}55, 0 12px 32px -12px rgba(0,0,0,.7)` }}>
              <Icon size={17} strokeWidth={2.2} color={color} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: '.79rem', lineHeight: 1.45 }}>{t(toast.key)}</span>
                {toast.action && (
                  <button onClick={() => { toast.action.run(); dismiss(toast.id); }}
                    style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
                      background: 'var(--accent-subtle)', color: 'var(--accent)',
                      fontSize: '.72rem', fontWeight: 700 }}>
                    {toast.action.icon && <toast.action.icon size={13} strokeWidth={2.3} />}
                    {t(toast.action.labelKey)}
                  </button>
                )}
              </div>
              <button onClick={() => dismiss(toast.id)} aria-label={t('system.dismissToast')}
                style={{ display: 'flex', border: 'none', background: 'transparent', padding: 2,
                  color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}>
                <X size={14} strokeWidth={2.4} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>

    <OfflineGame open={gameOpen} onClose={() => setGameOpen(false)} backOnline={backOnline} />
    </>
  );
}
