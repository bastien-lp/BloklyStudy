/**
 * Spaced-repetition scheduling — the single source of truth for when a chapter
 * review is due. Previously the "next due" formula was copy-pasted in
 * PageRepetition, AppPage (the due badge) and readiness.js, so they could drift
 * apart. They now all import from here.
 *
 * srData entry shape (users/{uid}/data/main.srData["<subjectId>_<chapterIndex>"]):
 *   { firstStudy: number, reviews: number[], ease?: number }
 *   - firstStudy : ms timestamp of the initial study
 *   - reviews    : ms timestamps of each completed review
 *   - ease       : OPTIONAL difficulty multiplier on the interval (default 1).
 *                  Absent on legacy entries → treated as 1, so existing users'
 *                  schedules are unchanged until they use the easy/hard buttons.
 */

// Base review intervals in days: review 1 day after study, then 7, then 30.
export const SR_INTERVALS = [1, 7, 30];

const DAY_MS = 86400000;
const EASE_MIN = 0.5;
const EASE_MAX = 2.5;
const EASE_DEFAULT = 1;

/** Whether a chapter has completed all its scheduled reviews. */
export function isMastered(sr) {
  return (sr?.reviews?.length || 0) >= SR_INTERVALS.length;
}

/**
 * Next-due timestamp (ms) for an srData entry, or null if mastered.
 * The interval is the base step scaled by the entry's ease factor, so a chapter
 * marked "hard" comes back sooner and one marked "easy" is spaced further out.
 */
export function nextDueMs(sr) {
  if (!sr || isMastered(sr)) return null;
  const reviews = sr.reviews || [];
  const ni = reviews.length;
  const last = reviews.length ? reviews[reviews.length - 1] : sr.firstStudy;
  const ease = typeof sr.ease === 'number' ? sr.ease : EASE_DEFAULT;
  return last + SR_INTERVALS[ni] * ease * DAY_MS;
}

/** Whole days until the next review (negative if overdue), or null if mastered. */
export function daysUntilDue(sr, now) {
  const due = nextDueMs(sr);
  if (due == null) return null;
  return Math.ceil((due - now) / DAY_MS);
}

/** True when the chapter is scheduled and its review is due now (or overdue). */
export function isDue(sr, now) {
  const due = nextDueMs(sr);
  return due != null && due <= now;
}

/**
 * New ease value after a review, from the felt difficulty:
 *   - 'hard'   → shorter next interval
 *   - 'normal' → unchanged
 *   - 'easy'   → longer next interval
 * Clamped to a sane range.
 */
export function nextEase(ease = EASE_DEFAULT, difficulty = 'normal') {
  const base = typeof ease === 'number' ? ease : EASE_DEFAULT;
  let next = base;
  if (difficulty === 'hard') next = base * 0.7;
  else if (difficulty === 'easy') next = base * 1.35;
  return Math.min(EASE_MAX, Math.max(EASE_MIN, next));
}
