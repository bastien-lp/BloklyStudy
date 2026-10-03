/**
 * Muted groups and people — one shared copy for the whole app.
 * --------------------------------------------------------------------------
 * The lists live in the worker with the notification prefs (shared by every
 * device). This module keeps the loaded copy so the chat headers, the
 * conversation list, the settings and AppPage's message sound all agree,
 * and updates it optimistically when the student taps "mute".
 *
 * A muted group or person sends no push notification and no in-app sound;
 * unread counts are unchanged. An @mention still gets through.
 *
 *   const { groups, users, available } = useMutes();
 *   toggleMute(user, 'groups', groupId, lang);
 */

import { useSyncExternalStore } from 'react';
import { loadNotificationPrefs, setMutedRemote, pushSupport } from './notifications';

let state = { groups: new Set(), users: new Set(), available: false, loadedFor: null };
const listeners = new Set();

function emit(next) {
  state = next;
  listeners.forEach(l => l());
}

const subscribe = l => { listeners.add(l); return () => listeners.delete(l); };
const snapshot = () => state;

/** Loads the lists once per account (later calls are free). */
export function loadMutes(user) {
  if (!user || state.loadedFor === user.uid || pushSupport() === 'unavailable') return;
  state = { ...state, loadedFor: user.uid };
  loadNotificationPrefs(user)
    .then(({ muted }) => emit({ ...state, groups: muted.groups, users: muted.users, available: true }))
    .catch(() => emit({ ...state, available: true }));
}

/** Mutes or unmutes; the UI changes at once and rolls back if the save fails. */
export async function toggleMute(user, type, id, lang) {
  const before = state;
  const list = new Set(state[type]);
  const muted = !list.has(id);
  if (muted) list.add(id); else list.delete(id);
  emit({ ...state, [type]: list });
  try {
    const saved = await setMutedRemote(user, type, id, muted, lang);
    emit({ ...state, groups: saved.groups, users: saved.users });
  } catch {
    emit(before);
  }
  return muted;
}

/** The current lists, re-rendering when they change. */
export function useMutes() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
