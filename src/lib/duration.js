/**
 * Human durations for the planner: 3.75 h → "3h45", never "3.75h".
 * --------------------------------------------------------------------------
 * Block durations are stored as decimal hours (quarter-hour steps), which read
 * badly as-is. Rounded to the minute:
 *   fr / es / de / …   3.75 → "3h45"    3 → "3h"    0.75 → "45 min"
 *   en                  3.75 → "3h 45m"  3 → "3h"    0.75 → "45 min"
 */
export function formatDuration(hours, lang) {
  const total = Math.max(0, Math.round((Number(hours) || 0) * 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0 && m > 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return lang === 'en' ? `${h}h ${m}m` : `${h}h${String(m).padStart(2, '0')}`;
}
