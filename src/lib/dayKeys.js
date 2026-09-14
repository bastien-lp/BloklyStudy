/**
 * Day and ISO-week keys, in the user's local timezone.
 * --------------------------------------------------------------------------
 * Everything that resets "today" or "this week" has to agree on where the
 * boundary is. Using `toISOString().slice(0,10)` would put the rollover at
 * UTC midnight, which is an hour or two off for European students and shifts
 * a late-evening session into the wrong day.
 */

/** Local calendar day, as `YYYY-MM-DD`. */
export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * ISO-8601 week, as `YYYY-Www`. Weeks start on Monday and the first week of a
 * year is the one containing its first Thursday — so a session on Sunday still
 * belongs to the week that began the previous Monday.
 */
export function weekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayOfWeek = date.getUTCDay() || 7;              // Sunday = 7, not 0
  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek);   // jump to this week's Thursday
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Whole days between two `YYYY-MM-DD` keys (b - a). */
export function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);
}
