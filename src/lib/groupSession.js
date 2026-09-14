/**
 * Live group focus sessions — schedule math + Realtime Database access.
 * --------------------------------------------------------------------------
 * A group session is a Pomodoro-style programme (work / break / rounds) that a
 * host starts and every member can join, with the same countdown ticking down
 * on everybody's screen.
 *
 * Design: the stored record never holds a counter. It holds the moment the
 * session started plus its programme, and each client derives the current
 * phase and remaining time from the shared server clock (see `serverClock.js`).
 * That means:
 *   - zero writes while the timer runs (a 4-round session costs ~10 writes),
 *   - a late joiner is instantly in sync,
 *   - the session survives the host closing their tab — nobody has to be
 *     "the one driving the clock".
 * The host only writes when the programme itself changes: pause, resume, skip
 * a phase, end early.
 *
 * RTDB shape (new path — touches no existing data):
 *   groupSessions/{groupId}/current             : the session record
 *   groupSessions/{groupId}/participants/{uid}  : { pseudo, joinedAt, focusMs, lastSeen }
 *
 * One session at a time per group: `current` is a single node, so starting a
 * session while one runs is a conflict the UI resolves by offering to join.
 */

import { ref as dbRef, onValue, set, update, remove, get, onDisconnect } from 'firebase/database';
import { rtdb } from '../firebase/config';
import { serverNow } from './serverClock';

/** Hard limits, so a typo can't create a 40-hour session. */
export const SESSION_LIMITS = {
  workMin:  { min: 5, max: 120, default: 25 },
  breakMin: { min: 0, max: 30,  default: 5 },
  rounds:   { min: 1, max: 8,   default: 4 },
};

const clamp = (v, { min, max, default: def }) =>
  Number.isFinite(+v) ? Math.min(max, Math.max(min, Math.round(+v))) : def;

/** Normalize a user-entered programme into safe bounds. */
export function normalizeProgramme({ workMin, breakMin, rounds }) {
  return {
    workMin:  clamp(workMin,  SESSION_LIMITS.workMin),
    breakMin: clamp(breakMin, SESSION_LIMITS.breakMin),
    rounds:   clamp(rounds,   SESSION_LIMITS.rounds),
  };
}

/** Total programme length in ms (breaks sit between rounds, never after the last). */
export function totalMs({ workMin, breakMin, rounds }) {
  return (rounds * workMin + Math.max(0, rounds - 1) * breakMin) * 60000;
}

// ── Schedule math (pure) ────────────────────────────────────────────────────

/**
 * Milliseconds of programme consumed so far. Paused time is excluded, and a
 * skipped phase is added on top as if it had been lived through — which is why
 * "skip" costs a single number instead of a rewritten schedule.
 */
export function elapsedMs(session, now = serverNow()) {
  if (!session || !Number.isFinite(session.startedAt)) return 0;
  const upTo = session.pausedAt || now;
  return Math.max(0, upTo - session.startedAt - (session.pauseAccumMs || 0) + (session.skipMs || 0));
}

/**
 * Where the session stands right now.
 * Returns { phase: 'lobby' | 'work' | 'break' | 'done', round, leftMs, phaseMs,
 * elapsedPct }, where `elapsedPct` is the share of the CURRENT phase already
 * consumed. The ring wants the REMAINING share instead — pass `leftMs / phaseMs`.
 *
 * 'lobby' is a created session whose host has not pressed start yet: people can
 * gather and join, but no clock is running and no focus time accrues.
 */
export function phaseAt(session, now = serverNow()) {
  const done = { phase: 'done', round: session?.rounds || 0, leftMs: 0, phaseMs: 0, elapsedPct: 1 };
  if (!session) return done;
  if (session.endedAt) return done;
  if (!Number.isFinite(session.startedAt)) {
    // Created but not started. Only a session that was never started sits here;
    // a malformed record has no `createdAt` either and falls through to `done`.
    if (!Number.isFinite(session.createdAt)) return done;
    return { phase: 'lobby', round: 0, leftMs: totalMs(session), phaseMs: totalMs(session), elapsedPct: 0 };
  }

  const work = session.workMin * 60000;
  const brk  = (session.breakMin || 0) * 60000;
  let t = elapsedMs(session, now);

  for (let round = 1; round <= session.rounds; round++) {
    if (t < work) return { phase: 'work', round, leftMs: work - t, phaseMs: work, elapsedPct: t / work };
    t -= work;
    if (round === session.rounds || brk === 0) continue;
    if (t < brk) return { phase: 'break', round, leftMs: brk - t, phaseMs: brk, elapsedPct: t / brk };
    t -= brk;
  }
  return done;
}

/**
 * When the session finished (or will finish). Used to stop showing a finished
 * session's bar forever when nobody closes it. A paused session has no known
 * end, so it reports a time in the future — which is exactly right: it is not
 * over, it is waiting.
 */
export function sessionEndMs(session) {
  if (!session) return 0;
  if (session.endedAt) return session.endedAt;
  // Not started yet: it ends whenever it ends. Report a time in the future so
  // callers treat it as pending rather than long finished.
  if (!Number.isFinite(session.startedAt)) {
    return Number.isFinite(session.createdAt) ? session.createdAt + totalMs(session) : 0;
  }
  return session.startedAt + (session.pauseAccumMs || 0) - (session.skipMs || 0) + totalMs(session);
}

/** True while the session is running and not finished. */
export function isLive(session, now = serverNow()) {
  if (!session || session.endedAt) return false;
  return phaseAt(session, now).phase !== 'done';
}

// ── Paths ───────────────────────────────────────────────────────────────────

const currentRef      = groupId => dbRef(rtdb, `groupSessions/${groupId}/current`);
const participantsRef = groupId => dbRef(rtdb, `groupSessions/${groupId}/participants`);
const meRef           = (groupId, uid) => dbRef(rtdb, `groupSessions/${groupId}/participants/${uid}`);

// ── Subscriptions ───────────────────────────────────────────────────────────

/** Watch a group's current session (null when there is none). */
export function subscribeSession(groupId, cb) {
  return onValue(currentRef(groupId), snap => cb(snap.val() || null));
}

/** Watch the live participant list ({ uid: { pseudo, focusMs, ... } }). */
export function subscribeParticipants(groupId, cb) {
  return onValue(participantsRef(groupId), snap => cb(snap.val() || {}));
}

// ── Host actions ────────────────────────────────────────────────────────────

/**
 * Start a session for a group. Refuses if one is already live, returning
 * `{ ok: false, existing }` so the caller can offer to join it instead.
 */
export async function createSession(groupId, { uid, pseudo, title, subject, workMin, breakMin, rounds }) {
  const snap = await get(currentRef(groupId));
  const existing = snap.val();
  if (existing && isLive(existing)) return { ok: false, existing };

  const programme = normalizeProgramme({ workMin, breakMin, rounds });
  const session = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    hostUid: uid,
    hostPseudo: pseudo,
    title: (title || '').trim().slice(0, 60),
    subject: (subject || '').trim().slice(0, 40),
    ...programme,
    // Created, not started: the host presses start once people have gathered.
    createdAt: serverNow(),
    startedAt: null,
    pauseAccumMs: 0,
    pausedAt: null,
    skipMs: 0,
    endedAt: null,
  };
  await remove(participantsRef(groupId)); // clear the previous session's roster
  await set(currentRef(groupId), session);
  return { ok: true, session };
}

/** Start the countdown (host only) — this is what actually launches the timer. */
export async function startSession(groupId) {
  await update(currentRef(groupId), { startedAt: serverNow() });
}

/** Pause (host only) — freezes the countdown for everyone. */
export async function pauseSession(groupId) {
  await update(currentRef(groupId), { pausedAt: serverNow() });
}

/** Resume (host only) — banks the paused stretch so the programme shifts, not skips. */
export async function resumeSession(groupId, session) {
  if (!session?.pausedAt) return;
  await update(currentRef(groupId), {
    pauseAccumMs: (session.pauseAccumMs || 0) + Math.max(0, serverNow() - session.pausedAt),
    pausedAt: null,
  });
}

/** Skip the current phase (host only) — jump straight to the next work/break. */
export async function skipPhase(groupId, session) {
  const { leftMs, phase } = phaseAt(session);
  if (phase === 'done') return;
  await update(currentRef(groupId), { skipMs: (session.skipMs || 0) + leftMs });
}

/** End the session for everyone (host only). Participants still bank their time. */
export async function endSession(groupId) {
  await update(currentRef(groupId), { endedAt: serverNow() });
}

/** Remove a finished session's record, so the group is ready for the next one. */
export async function clearSession(groupId) {
  await remove(participantsRef(groupId));
  await remove(currentRef(groupId));
}

// ── Participant actions ─────────────────────────────────────────────────────

/**
 * Join the session. Registers an `onDisconnect` cleanup so closing the tab
 * takes the participant off the live list, exactly like group presence does.
 */
export async function joinSession(groupId, uid, pseudo) {
  const ref = meRef(groupId, uid);
  await set(ref, { pseudo, joinedAt: serverNow(), focusMs: 0, lastSeen: serverNow() });
  onDisconnect(ref).remove();
}

/** Publish how much focused time I have banked so far (heartbeat). */
export async function heartbeat(groupId, uid, focusMs) {
  await update(meRef(groupId, uid), { focusMs, lastSeen: serverNow() });
}

/** Leave the live list. */
export async function leaveSession(groupId, uid) {
  await remove(meRef(groupId, uid));
}
