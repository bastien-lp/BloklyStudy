/**
 * Shared store for the group session the user has joined.
 * --------------------------------------------------------------------------
 * Sibling of `focusSession.js` (the solo timer store), for the same reason:
 * the Groups tab is lazily loaded and unmounts when the user switches away, so
 * the joined session has to live outside it. Keeping it here lets the floating
 * chrono in the top bar keep counting anywhere in the app, and lets the focus
 * time keep accruing while the user is on another tab.
 *
 * Two things are stored:
 *   - membership : which session I joined (survives a reload via localStorage)
 *   - snapshot   : the last session record + participants seen on the wire
 *
 * Only the membership is persisted. The snapshot is refreshed from the
 * Realtime Database on mount, and the countdown itself is always derived from
 * the session's absolute timestamps — never from a stored counter.
 *
 * Client-only — no Firestore schema, and a key of its own
 * (`blokly-group-session-v1`, distinct from the preferences key).
 */

const KEY = 'blokly-group-session-v1';
const subs = new Set();

/**
 * Membership shape:
 *   { groupId, groupName, sessionId, joinedAt, focusMs }
 *   - focusMs : milliseconds I have actually spent in a WORK phase while
 *               joined. It is the basis for the pro-rata XP credited at the
 *               end, so it is persisted — a reload must not reset it.
 */
let membership = load();
let snapshot = { session: null, participants: {} };

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const m = JSON.parse(raw);
    // Drop a membership older than 12h — its session is long gone.
    if (!m?.joinedAt || Date.now() - m.joinedAt > 12 * 3600 * 1000) {
      localStorage.removeItem(KEY);
      return null;
    }
    return m;
  } catch {
    return null;
  }
}

function persist() {
  try {
    if (membership) localStorage.setItem(KEY, JSON.stringify(membership));
    else localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

function emit() {
  subs.forEach(cb => cb(membership, snapshot));
}

/** The session I have joined, or null. */
export function getMembership() {
  return membership;
}

/** The last session record + participants seen for that session. */
export function getSnapshot() {
  return snapshot;
}

/** Record that I joined a session (replaces any previous membership). */
export function setMembership(m) {
  membership = m ? { focusMs: 0, joinedAt: Date.now(), ...m } : null;
  if (!membership) snapshot = { session: null, participants: {} };
  persist();
  emit();
}

/** Add focused milliseconds to my running total. */
export function addFocusMs(ms) {
  if (!membership || !(ms > 0)) return;
  membership = { ...membership, focusMs: (membership.focusMs || 0) + ms };
  persist();
  emit();
}

/** Push the latest wire state (session record and/or participants). */
export function setSnapshot(next) {
  snapshot = { ...snapshot, ...next };
  emit();
}

/** Subscribe to membership/snapshot changes; returns an unsubscribe function. */
export function subscribeGroupFocus(cb) {
  subs.add(cb);
  return () => subs.delete(cb);
}

// ── Credit bookkeeping ──────────────────────────────────────────────────────
// A finished session must bank its XP exactly once, even if the user reloads
// on the finish screen or has the app open in two tabs. The banked session ids
// are kept in their own small localStorage list.

const CREDITED_KEY = 'blokly-group-session-credited-v1';

/** Has this session already been banked on this device? */
export function wasCredited(sessionId) {
  if (!sessionId) return true;
  try {
    const list = JSON.parse(localStorage.getItem(CREDITED_KEY) || '[]');
    return Array.isArray(list) && list.includes(sessionId);
  } catch {
    return false;
  }
}

/** Mark this session as banked (keeps only the last 20 ids). */
export function markCredited(sessionId) {
  if (!sessionId) return;
  try {
    const list = JSON.parse(localStorage.getItem(CREDITED_KEY) || '[]');
    const next = [...(Array.isArray(list) ? list : []), sessionId].slice(-20);
    localStorage.setItem(CREDITED_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}
