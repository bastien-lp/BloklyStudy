/**
 * Server clock — a shared "now" that every participant agrees on.
 * --------------------------------------------------------------------------
 * A live group session is driven by an absolute end timestamp rather than by a
 * broadcast counter, so each client derives its own countdown locally. That
 * only works if every client agrees on what time it is — and a student's
 * machine clock can easily be minutes off.
 *
 * The Realtime Database publishes the difference between the local clock and
 * its own at `/.info/serverTimeOffset`. Adding it to `Date.now()` gives a
 * timestamp that is consistent across devices, which is what makes two phones
 * show the same second of the same countdown.
 *
 * Client-only, no schema: `/.info/*` is a virtual node, not stored data.
 */

import { ref as dbRef, onValue } from 'firebase/database';
import { rtdb } from '../firebase/config';

let offset = 0;
let started = false;

/** Start listening for the offset (idempotent — safe to call from anywhere). */
export function startServerClock() {
  if (started) return;
  started = true;
  try {
    onValue(dbRef(rtdb, '.info/serverTimeOffset'), snap => {
      const v = snap.val();
      if (typeof v === 'number' && Number.isFinite(v)) offset = v;
    });
  } catch {
    // Offline or blocked: fall back to the local clock (offset stays 0).
  }
}

/** Milliseconds to add to `Date.now()` to land on server time. */
export function clockOffset() {
  return offset;
}

/** Current time in the shared (server) reference frame. */
export function serverNow() {
  return Date.now() + offset;
}
