/**
 * useGroupSession — React view onto the joined group session.
 * --------------------------------------------------------------------------
 * Reads the shared store that `GroupSessionEngine` keeps filled, and ticks so
 * the countdown re-renders. The remaining time is recomputed from the session's
 * absolute timestamps on every tick rather than decremented, so it stays
 * correct across a tab that was throttled in the background — and identical to
 * what every other participant sees.
 */

import { useEffect, useState } from 'react';
import { getMembership, getSnapshot, subscribeGroupFocus } from './groupFocus';
import { phaseAt, subscribeSession } from '../lib/groupSession';
import { serverNow, startServerClock } from '../lib/serverClock';

/** Milliseconds → "MM:SS" (or "H:MM:SS" past the hour). */
export function fmtLeft(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * @returns {{
 *   membership: object|null, session: object|null, participants: object,
 *   phase: 'work'|'break'|'done', round: number, leftMs: number,
 *   phaseMs: number, remainingPct: number, paused: boolean, live: boolean,
 *   isHost: boolean, myFocusMs: number
 * }}
 */
export function useGroupSession(uid) {
  const [state, setState] = useState(() => ({
    membership: getMembership(),
    ...getSnapshot(),
  }));
  const [, setTick] = useState(0);

  useEffect(() => subscribeGroupFocus((membership, snapshot) =>
    setState({ membership, ...snapshot })), []);

  // Re-render twice a second: smooth enough for a countdown without burning
  // frames, and the displayed value is derived, never accumulated.
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(id);
  }, []);

  const { membership, session, participants } = state;
  const p = phaseAt(session, serverNow());
  const paused = !!session?.pausedAt;

  return {
    membership,
    session,
    participants: participants || {},
    phase: p.phase,
    round: p.round,
    leftMs: p.leftMs,
    phaseMs: p.phaseMs,
    // The ring empties as time runs out, so it wants the REMAINING share.
    remainingPct: p.phaseMs > 0 ? p.leftMs / p.phaseMs : 0,
    paused,
    live: !!membership && !!session && p.phase !== 'done',
    isHost: !!session && !!uid && session.hostUid === uid,
    myFocusMs: membership?.focusMs || 0,
  };
}

/**
 * Watch the live session of several groups at once — used by the conversation
 * list to mark which groups have something running.
 *
 * One listener per group. That is fine at this scale (a student belongs to a
 * handful of groups) and it is the only option: the security rules grant read
 * access per group, so there is no single node listing them all.
 *
 * @param {string[]} groupIds
 * @returns {Record<string, object>} groupId → session, live ones only
 */
export function useLiveGroupSessions(groupIds) {
  const [sessions, setSessions] = useState({});
  // Join the ids so the effect re-runs on a real membership change, not on
  // every render that rebuilds the array.
  const key = groupIds.join(',');

  useEffect(() => {
    if (!key) return;
    startServerClock();
    const ids = key.split(',');
    const offs = ids.map(gid => subscribeSession(gid, session =>
      setSessions(prev => {
        if (!session) {
          if (!prev[gid]) return prev;
          const next = { ...prev };
          delete next[gid];
          return next;
        }
        return { ...prev, [gid]: session };
      })
    ));
    return () => offs.forEach(off => off());
  }, [key]);

  // Filter on read rather than clearing on change: a group I just left cannot
  // leave a stale badge behind, and the effect never has to call setState.
  const watched = key ? key.split(',') : [];
  return Object.fromEntries(
    watched.filter(gid => sessions[gid]).map(gid => [gid, sessions[gid]])
  );
}
