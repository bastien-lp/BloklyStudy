/**
 * Shared focus-session store — lets the running Pomodoro/timer survive tab
 * switches and be shown as a floating chrono outside the study page.
 *
 * PageStudy is a lazily-loaded tab, so it unmounts when the user switches away
 * and its timer state would normally be lost. This tiny store keeps the live
 * session in memory (mirrored to localStorage so it also survives a reload),
 * and lets any component subscribe. Client-only — no Firestore schema.
 *
 * Draft shape (a running session, or null when idle):
 *   { subjId, mode, duration, customDur, pomoPhase, sound, volume,
 *     totalTime, elapsed, running, ts }
 *   - elapsed/ts : elapsed seconds captured at wall-clock time `ts`; the true
 *                  current elapsed is derived from the clock (see liveElapsed),
 *                  so the count stays correct even while PageStudy is unmounted.
 */

const KEY = 'blokly-study-draft';
const subs = new Set();

let current = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    // Drop a running session older than 6h — it's no longer worth resuming.
    if (d?.running && Date.now() - d.ts > 6 * 3600 * 1000) {
      localStorage.removeItem(KEY);
      return null;
    }
    return d;
  } catch {
    return null;
  }
}

/** Current draft (may be stale in elapsed — use liveElapsed for display). */
export function getDraft() {
  return current;
}

/** Replace the draft (null clears it) and notify subscribers. */
export function setDraft(d) {
  current = d;
  try {
    if (d) localStorage.setItem(KEY, JSON.stringify(d));
    else localStorage.removeItem(KEY);
  } catch { /* ignore */ }
  subs.forEach((cb) => cb(current));
}

/** Subscribe to draft changes; returns an unsubscribe function. */
export function subscribeDraft(cb) {
  subs.add(cb);
  return () => subs.delete(cb);
}

/**
 * Elapsed seconds implied by a draft right now, derived from the wall clock so
 * it keeps advancing while PageStudy is unmounted. `now` is injectable for
 * tests / to keep callers pure.
 */
export function liveElapsed(d, now = Date.now()) {
  if (!d) return 0;
  return d.elapsed + Math.max(0, Math.floor((now - d.ts) / 1000));
}
