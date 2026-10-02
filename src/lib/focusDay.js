/**
 * "How much focus on THIS day" — the single answer every screen must use.
 * --------------------------------------------------------------------------
 * Pure: reads the `users/{uid}/data/main` document, writes nothing, takes its
 * clock as an argument.
 *
 * WHY THIS EXISTS
 * Stats used to read `todayMins` / `todaySess` straight from the document while
 * the daily quests and the garden guarded them with `statsDay`. Those counters
 * are a ROLLING pair: they keep whatever value they had on the day they were
 * last written, and the next session resets them. So after a Thursday session,
 * Stats still announced "53 min today" on the following Sunday, while the
 * quests correctly said 0/60. Two screens, two answers, same document.
 *
 * TWO SOURCES, ONE RULE
 *   - `sessions` is a log of the last 30 sessions, each with an `at` timestamp:
 *     accurate for any day, but it forgets the oldest entries.
 *   - `todayMins` / `todaySess` only describe the day named by `statsDay`, and
 *     they survive the 30-entry cap.
 * So: count the log for the day asked for, and when `statsDay` names that same
 * day, take whichever is larger. A day that is not `statsDay` never reads those
 * counters, which is exactly the bug that was showing.
 *
 * EVERY COMPARISON IS LOCAL. `session.at` is stored as a UTC ISO string, so
 * slicing its first ten characters buckets a 23:30 session into the next day
 * for a European student. `dayKey()` reads the local calendar instead.
 */

import { dayKey, daysBetween } from './dayKeys';

const asArray = v => (Array.isArray(v) ? v : []);

/** Local day key of a stored session entry, or null when unusable. */
function sessionDay(entry) {
  if (!entry?.at) return null;
  const d = new Date(entry.at);
  return Number.isNaN(d.getTime()) ? null : dayKey(d);
}

/**
 * Focus of one calendar day.
 *
 * @param {object} main  the main document
 * @param {Date}   date  any moment inside the day to measure
 * @returns {{ mins:number, sessions:number }}
 */
export function focusForDay(main, date = new Date()) {
  const key = dayKey(date);
  let mins = 0;
  let sessions = 0;

  for (const entry of asArray(main?.sessions)) {
    if (sessionDay(entry) !== key) continue;
    mins += Number(entry.mins) || 0;
    sessions++;
  }

  // The rolling counters describe one day only — the one `statsDay` names.
  if (main?.statsDay === key) {
    mins = Math.max(mins, Number(main.todayMins) || 0);
    sessions = Math.max(sessions, Number(main.todaySess) || 0);
  }

  return { mins, sessions };
}

/** Minutes focused on `date`. */
export function focusMinutesForDay(main, date = new Date()) {
  return focusForDay(main, date).mins;
}

/** Sessions finished on `date`. */
export function focusSessionsForDay(main, date = new Date()) {
  return focusForDay(main, date).sessions;
}

/**
 * The seven days of a week, by the same rule, so a chart can never disagree
 * with the tile beside it.
 *
 * @param {object} main       the main document
 * @param {Date}   weekStart  local Monday 00:00
 * @returns {{ mins:number[], sessions:number[], keys:string[] }} index 0 = Monday
 */
export function focusPerDayOfWeek(main, weekStart) {
  const keys = Array.from({ length: 7 }, (_, i) =>
    dayKey(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)));
  const index = new Map(keys.map((k, i) => [k, i]));
  const mins = Array(7).fill(0);
  const sessions = Array(7).fill(0);

  for (const entry of asArray(main?.sessions)) {
    const i = index.get(sessionDay(entry));
    if (i == null) continue;
    mins[i] += Number(entry.mins) || 0;
    sessions[i] += 1;
  }

  const stored = index.get(main?.statsDay);
  if (stored != null) {
    mins[stored] = Math.max(mins[stored], Number(main.todayMins) || 0);
    sessions[stored] = Math.max(sessions[stored], Number(main.todaySess) || 0);
  }

  return { mins, sessions, keys };
}

/**
 * The streak as it stands RIGHT NOW, rather than as it was last written.
 *
 * `main.streak` is only updated when a session is banked, so a broken streak
 * keeps showing its old value until the student studies again — three days
 * after the fact, Stats was still displaying a "3 day" streak. A streak is
 * alive while the last study day is today (already continued) or yesterday
 * (still continuable); anything older is over.
 *
 * DISPLAY ONLY. Badge unlocks keep reading the stored field, because thresholds
 * and unlock conditions are game balance and are not this function's business.
 *
 * @returns {number} days, 0 when the streak is broken
 */
export function currentStreak(main, now = new Date()) {
  const stored = Number(main?.streak) || 0;
  const last = main?.lastStudyDay;
  if (!stored || !last) return 0;

  const gap = daysBetween(last, dayKey(now));
  if (Number.isNaN(gap) || gap < 0) return stored; // clock skew: trust the store
  return gap <= 1 ? stored : 0;
}
