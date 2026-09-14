/**
 * Keeping `leaderboard/{uid}` in step with the player's real progress.
 * --------------------------------------------------------------------------
 * THE BUG THIS FIXES: the ranking screen orders by `xpToday` / `xpThisWeek`,
 * but nothing in the app ever wrote those fields. Firestore's `orderBy` skips
 * documents missing the field, so the daily and weekly tabs were ordering over
 * an empty (or long-stale) set — they never refreshed.
 *
 * Design note — every value written here is ABSOLUTE, recomputed from the
 * session history the app already keeps in `users/{uid}/data/main.sessions`.
 * Nothing is incremented. That makes the write idempotent and self-healing:
 * replaying it can't double-count, and a stale `xpToday` left over from
 * yesterday is corrected on the next session rather than accumulating.
 *
 * `todayKey` / `weekKey` are stored alongside the totals so the reader can
 * tell a genuine "0 today" from "this figure is from last Tuesday".
 *
 * Field names match what the ranking already reads; no new shape is invented.
 */

import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { dayKey, weekKey } from './dayKeys';
import { reportSaveError } from './notify';

/**
 * Sum the XP of sessions falling inside the current day and ISO week.
 * @param {Array<{at: string, xp: number}>} sessions
 */
export function windowedXp(sessions = []) {
  const today = dayKey();
  const week = weekKey();
  let xpToday = 0;
  let xpThisWeek = 0;

  for (const s of sessions) {
    if (!s?.at) continue;
    const at = new Date(s.at);
    if (Number.isNaN(at.getTime())) continue;
    const gained = Number(s.xp) || 0;
    if (dayKey(at) === today) xpToday += gained;
    if (weekKey(at) === week) xpThisWeek += gained;
  }
  return { xpToday, xpThisWeek, todayKey: today, weekKey: week };
}

/**
 * Push the player's current standing to their public leaderboard document.
 *
 * @param {string} uid
 * @param {number} totalXp   all-time XP, from `main.xp`
 * @param {Array}  sessions  `main.sessions` (the app keeps the last 30)
 */
export async function syncLeaderboard(uid, totalXp, sessions) {
  if (!uid) return;
  const { xpToday, xpThisWeek, todayKey, weekKey: wk } = windowedXp(sessions);
  try {
    // merge: the document also carries `pseudo` and `hidden`, owned elsewhere.
    await setDoc(doc(db, 'leaderboard', uid), {
      xp: Number(totalXp) || 0,
      xpToday,
      xpThisWeek,
      todayKey,
      weekKey: wk,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (e) {
    reportSaveError(e, 'leaderboard sync');
  }
}
