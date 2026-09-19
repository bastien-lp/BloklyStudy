/**
 * "Who's online" — publishing my presence to the Realtime Database.
 * --------------------------------------------------------------------------
 * THE BUG THIS FIXES: the stats page, the friends lists, the group list and
 * the landing page all READ `presence` (and count its keys), but since the
 * move from the old static site to React nothing WROTE it anymore. The node
 * stayed empty, so every student was told they were studying alone and every
 * friend looked offline.
 *
 * Shape (unchanged from the original site, so existing RTDB rules still fit):
 *   presence/{uid} : { uid, startedAt }   — removed on disconnect
 *
 * Behaviour:
 *   - published while the app is open and the tab is visible;
 *   - re-published after every reconnection (`.info/connected`), because a
 *     network drop fires the server-side onDisconnect removal;
 *   - withdrawn after HIDDEN_GRACE_MS on a hidden tab, so a forgotten tab does
 *     not count as someone studying;
 *   - never published when the user turned off "show me online"
 *     (`profile.privacy.online === false`) — the caller simply doesn't start it.
 */

import { ref as dbRef, onValue, onDisconnect, set, remove } from 'firebase/database';
import { rtdb } from '../firebase/config';

const HIDDEN_GRACE_MS = 5 * 60 * 1000;

const presenceRef = uid => dbRef(rtdb, `presence/${uid}`);

/** Starts publishing my presence. Returns a stop function (which also withdraws it). */
export function startPresence(uid) {
  const myRef = presenceRef(uid);
  let connected = false;
  let visible = document.visibilityState !== 'hidden';
  let hideTimer = null;

  function publish() {
    if (!connected) return;
    if (visible) {
      // Arm the server-side cleanup first, so a crash right after the write
      // can never leave a ghost entry behind.
      onDisconnect(myRef).remove()
        .then(() => set(myRef, { uid, startedAt: Date.now() }))
        .catch(() => {});
    } else {
      remove(myRef).catch(() => {});
    }
  }

  const stopConnected = onValue(dbRef(rtdb, '.info/connected'), snap => {
    connected = snap.val() === true;
    publish();
  });

  function onVisibility() {
    clearTimeout(hideTimer);
    if (document.visibilityState === 'hidden') {
      hideTimer = setTimeout(() => { visible = false; publish(); }, HIDDEN_GRACE_MS);
    } else if (!visible) {
      visible = true;
      publish();
    }
  }
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    stopConnected();
    document.removeEventListener('visibilitychange', onVisibility);
    clearTimeout(hideTimer);
    onDisconnect(myRef).cancel().catch(() => {});
    remove(myRef).catch(() => {});
  };
}

/** Withdraws my presence right away (call BEFORE signing out, while still authorised). */
export function clearPresence(uid) {
  return remove(presenceRef(uid)).catch(() => {});
}
