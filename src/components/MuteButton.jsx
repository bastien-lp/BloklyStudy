/**
 * MuteButton — mute / unmute a group or a person, from a chat header.
 * --------------------------------------------------------------------------
 * A muted conversation sends no push notification and makes no sound in the
 * app (an @mention still gets through). Shared state: lib/mutes.js.
 * Hidden when notifications are not available in this build.
 *
 * Props: { user, type: 'groups' | 'users', id }
 */

import { Bell, BellOff } from 'lucide-react';
import { useTranslation } from '../i18n';
import { useMutes, toggleMute } from '../lib/mutes';
import { pushSupport } from '../lib/notifications';

export default function MuteButton({ user, type, id }) {
  const { t, lang } = useTranslation();
  const mutes = useMutes();
  if (pushSupport() === 'unavailable' || !id) return null;
  const muted = mutes[type].has(id);
  const label = t(muted ? 'mute.unmute' : 'mute.mute');
  return (
    <button type="button" onClick={() => toggleMute(user, type, id, lang)}
      aria-pressed={muted} aria-label={label} title={label}
      style={{ width: 32, height: 32, borderRadius: 10, border: 'none', flexShrink: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: muted ? 'var(--accent-subtle)' : 'var(--bg-card-hover)',
        color: muted ? 'var(--accent)' : 'var(--text-secondary)' }}>
      {muted ? <BellOff size={16} /> : <Bell size={16} />}
    </button>
  );
}
