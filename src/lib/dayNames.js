/**
 * Weekday labels, Monday first.
 * --------------------------------------------------------------------------
 * The planner capitalised its own and dropped the trailing dot ("Lun") while
 * the Progress agenda printed what Intl returns ("lun."), so the same day was
 * spelled two ways one page apart. Both now come from here.
 *
 * `formatDate` is passed in rather than imported so this stays a pure helper
 * (it is the locale-aware formatter from src/i18n).
 */

/** Upper-cases the first letter, leaving the rest as the locale wrote it. */
function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** 2024-01-01 was a Monday, so index 0 lands on Monday. */
function dayOfWeek(index) {
  return new Date(2024, 0, 1 + index);
}

/** Short weekday, capitalised and without the trailing dot: "Lun", "Mon". */
export function shortDayName(formatDate, index) {
  return cap(formatDate(dayOfWeek(index), { weekday: 'short' }).replace(/\.$/, ''));
}

/** Full weekday, capitalised: "Lundi", "Monday". */
export function fullDayName(formatDate, index) {
  return cap(formatDate(dayOfWeek(index), { weekday: 'long' }));
}
