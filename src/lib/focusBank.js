/**
 * Banking a finished focus session — the single place XP is credited.
 * --------------------------------------------------------------------------
 * Extracted from PageStudy so the solo timer and live group sessions credit
 * time through exactly the same path: same XP rule, same streak handling, same
 * daily rollover, same leaderboard publication. Duplicating this logic would
 * be the fastest way to let the two drift apart.
 *
 * Firestore writes (unchanged from the solo timer):
 *   users/{uid}/data/main    : xp, level, todayMins, todaySess, statsDay,
 *                              streak, lastStudyDay, totalFocusHours, leaves,
 *                              sessions (last 30)
 *   groupGroves/{groupId}/{uid}  : the group grove, in the Realtime Database,
 *                              for a live group session only
 *   users/{uid}/data/reserve : bamboo (the garden), studyTime[subjId],
 *                              energy, lastStudyDay
 *
 * XP rule: 10 XP per FULL minute focused (a 59-second session earns nothing).
 */

import { doc, getDoc, updateDoc, setDoc, increment } from 'firebase/firestore';
import { db } from '../firebase/config';
import { levelFromXp } from '../data/levels';
import { dayKey, daysBetween } from './dayKeys';
import { syncLeaderboard } from './leaderboard';
import { reportSaveError } from './notify';
import { readGarden, writeGarden, addMinutes } from './bambooGarden';
import { addGroveMinutes } from './groupGrove';

/** XP earned for a number of focused seconds (10 XP per full minute). */
export function computeXP(secs) {
  const mins = Math.floor(secs / 60);
  if (mins < 1) return 0;
  return mins * 10;
}

/**
 * Credit a completed focus session to the user's account.
 *
 * @param {string} uid    the signed-in user's id
 * @param {number} secs   seconds actually focused
 * @param {number} xp     XP to award (see computeXP)
 * @param {object} opts   { subjId, mode, groupId, context } — `groupId` is set
 *                        only by a live group session, and is what waters that
 *                        group's grove; `context` labels error reports, so
 *                        failures are traceable per caller.
 */
export async function bankFocusSession(uid, secs, xp, { subjId = '', mode = 'free', groupId = '', context = 'Focus' } = {}) {
  if (!uid) return;
  const mins = Math.floor(secs / 60);
  const today = dayKey();
  const mainRef = doc(db, 'users', uid, 'data', 'main');
  // Read from the main document and used further down, for the group groves.
  let myPseudo = '';

  try {
    // Read first: the daily counters and the streak both depend on which day
    // the previous session fell on, so they can't be blind increments.
    const snap = await getDoc(mainRef);
    const d = snap.exists() ? snap.data() : {};
    myPseudo = d.profile?.pseudo || '';

    // Daily tiles roll over whenever the stored day is not today.
    const sameDay = d.statsDay === today;
    const todaySess = (sameDay ? (d.todaySess || 0) : 0) + 1;
    const todayMins = (sameDay ? (d.todayMins || 0) : 0) + mins;

    // Streak lives in `main` next to its readers (mirrored into `reserve` below).
    const lastDay = d.lastStudyDay || '';
    const gap = lastDay ? daysBetween(lastDay, today) : null;
    let streak = d.streak || 0;
    if (lastDay !== today) streak = gap === 1 ? streak + 1 : 1;

    const entry = { at: new Date().toISOString(), mins, xp, subjId: subjId || '', mode };
    const sessions = [...(Array.isArray(d.sessions) ? d.sessions : []), entry].slice(-30);
    const newXp = (d.xp || 0) + xp;

    await updateDoc(mainRef, {
      // Lifetime counters stay as increments: concurrency-safe, no rollover.
      xp: increment(xp),
      totalFocusHours: increment(secs / 3600),
      leaves: increment(Math.floor(xp / 100)),
      // Windowed counters are absolute, because they have to be able to drop.
      todaySess, todayMins, statsDay: today,
      streak, lastStudyDay: today,
      level: levelFromXp(newXp).level,
      sessions,
    });

    // Publish the new standing so the daily/weekly rankings actually move.
    await syncLeaderboard(uid, newXp, sessions, d.photoURL || '');
  } catch (e) { reportSaveError(e, `${context} — main session save`); }

  // Reserve doc: the bamboo grove, plus energy and the per-subject totals.
  //
  // The grove is fed by EVERY session, subject or not — one grove for the
  // whole account, capped by how many bamboos are planted (lib/bambooGarden).
  // `studyTime` keeps being written next to it: it is the history the old
  // per-subject garden was built on, and nothing reads it as a live value any
  // more, so it stays as a record rather than being dropped.
  if (mins > 0) {
    try {
      const ref = doc(db, 'users', uid, 'data', 'reserve');
      const snap = await getDoc(ref);
      const d = snap.exists() ? snap.data() : {};
      const energy = Math.min(100, (d.energy ?? 50) + Math.ceil(mins / 3));
      const grove = writeGarden(addMinutes(readGarden(d), mins, subjId));
      const patch = { bamboo: grove, energy, lastStudyDay: today };
      if (subjId) patch.studyTime = { ...(d.studyTime || {}), [subjId]: (d.studyTime?.[subjId] || 0) + mins };
      await setDoc(ref, patch, { merge: true });
    } catch (e) { reportSaveError(e, `${context} — reserve save`); }
  }

  // Finally, the grove of the group this session belongs to — a live shared
  // session, never a solo one (lib/groupGrove.js). Last on purpose and
  // deliberately SILENT: the session is already saved, so a grove that cannot
  // be written (rules not published, offline) costs nothing and warns nobody.
  if (mins > 0 && groupId) {
    try { await addGroveMinutes(groupId, uid, mins, myPseudo); } catch { /* optional feature */ }
  }
}
