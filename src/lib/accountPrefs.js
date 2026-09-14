/**
 * Per-account preferences (theme, font, language, …).
 * --------------------------------------------------------------------------
 * The ACCOUNT is the source of truth, not the browser. Before this, prefs were
 * read from `localStorage` only, so:
 *   - signing into another account on the same browser inherited the previous
 *     account's theme;
 *   - a theme saved on one device was missing on every other device — it was
 *     written to Firestore by the theme editor, but never read back.
 *
 * Rules (as decided):
 *   1. An account with no saved prefs starts from DEFAULT_PREFERENCES.
 *   2. Any change is saved to the account, so it follows the user everywhere.
 *   3. Each account on a browser only ever sees its own prefs.
 *
 * Storage:
 *   - Firestore `users/{uid}/data/main.prefs` — authoritative. The field
 *     already existed (the theme editor wrote it); nothing about its shape
 *     changes.
 *   - localStorage `blokly-account-prefs-v1:<uid>` — a per-account cache, only
 *     there so a reload paints the right theme instantly instead of flashing
 *     the default while Firestore answers. Keyed by uid, which is what makes
 *     rule 3 hold. The visitor key `blokly-prefs-v3` is left untouched and
 *     keeps serving the logged-out landing page.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { DEFAULT_PREFERENCES } from '../themes/themes';
import { reportSaveError } from './notify';

const cacheKey = uid => `blokly-account-prefs-v1:${uid}`;

/** Fill any missing field from the defaults, so older saves stay valid. */
function complete(prefs) {
  return prefs && typeof prefs === 'object'
    ? { ...DEFAULT_PREFERENCES, ...prefs }
    : DEFAULT_PREFERENCES;
}

function readCache(uid) {
  try {
    const raw = localStorage.getItem(cacheKey(uid));
    return raw ? complete(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeCache(uid, prefs) {
  try { localStorage.setItem(cacheKey(uid), JSON.stringify(prefs)); } catch { /* ignore */ }
}

/**
 * Preferences of the signed-in account.
 *
 * @param {object|null} user  Firebase auth user (null when signed out)
 * @returns {[object, (next: object) => void]}  current prefs and a setter
 *          that saves to the account
 */
export function useAccountPrefs(user) {
  const uid = user?.uid || null;

  // Prefs loaded from Firestore or edited in this session, tagged with the uid
  // they belong to — so a value can never leak from one account to the next.
  const [state, setState] = useState({ uid: null, prefs: null, edited: false });

  // What to show right now for this uid until/unless we have fresher data:
  // its own cache, or the defaults for an account seen for the first time.
  const cached = useMemo(() => (uid ? readCache(uid) : null), [uid]);
  const prefs = state.uid === uid && state.prefs
    ? state.prefs
    : (cached || DEFAULT_PREFERENCES);

  // Load the account's saved prefs once per sign-in.
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    getDoc(doc(db, 'users', uid, 'data', 'main'))
      .then(snap => {
        if (!alive) return;
        const next = complete(snap.exists() ? snap.data().prefs : null);
        writeCache(uid, next);
        // A change made while the request was in flight wins: it is newer.
        setState(s => (s.uid === uid && s.edited) ? s : { uid, prefs: next, edited: false });
      })
      .catch(e => reportSaveError(e, 'Preferences — load'));
    return () => { alive = false; };
  }, [uid]);

  const update = useCallback(next => {
    if (!uid) return;
    const full = complete(next);
    setState({ uid, prefs: full, edited: true });
    writeCache(uid, full);
    // merge: the main document holds far more than prefs, and may not exist
    // yet for a brand-new account (updateDoc would fail on it).
    setDoc(doc(db, 'users', uid, 'data', 'main'), { prefs: full }, { merge: true })
      .catch(e => reportSaveError(e, 'Preferences — save'));
  }, [uid]);

  return [prefs, update];
}
