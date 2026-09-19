/**
 * Weekly recap — what a student did in one week, computed from stored data.
 * --------------------------------------------------------------------------
 * Pure: reads the `users/{uid}/data/main` document, writes nothing.
 *
 * Sources and their limits (stated so the UI can be honest about them):
 *   - focus time  : `sessions` — only the LAST 30 focus sessions are kept, so a
 *                   very busy week can be undercounted (`truncated` says so);
 *   - planning    : `blocks` with a `dateStr` (YYYY-MM-DD) inside the week;
 *   - exams       : `subjects[].date`, upcoming within EXAM_HORIZON_DAYS;
 *   - reviews due : `srData` through the shared `isDue` rule;
 *   - progress    : chapters marked done in Syntheses (no dates stored, so
 *                   this is the overall figure, not "done this week").
 */

import { isDue } from '../data/repetition';

const DAY_MS = 86_400_000;
const EXAM_HORIZON_DAYS = 30;

/** Local Monday 00:00 of the week containing `d`. */
export function startOfWeek(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const shift = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - shift);
  return x;
}

/** "YYYY-MM-DD" → local midnight Date (null if malformed). */
function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

const asArray = v => (Array.isArray(v) ? v : []);

/**
 * @param {object} main       the main document
 * @param {Date}   weekStart  local Monday 00:00 of the week to summarise
 * @param {Date}   [now]
 */
export function weeklyRecap(main = {}, weekStart = startOfWeek(), now = new Date()) {
  const start = weekStart.getTime();
  const end = start + 7 * DAY_MS;
  const prevStart = start - 7 * DAY_MS;
  const subjects = asArray(main.subjects);
  const subjectName = id => subjects.find(s => String(s.id) === String(id))?.name || '';

  // ── Focus sessions ──
  const sessions = asArray(main.sessions).filter(s => s && s.at);
  const perDay = Array(7).fill(0);
  const perSubject = {};
  let focusMin = 0;
  let prevFocusMin = 0;
  let count = 0;
  for (const s of sessions) {
    const t = new Date(s.at).getTime();
    const mins = Number(s.mins) || 0;
    if (t >= start && t < end) {
      focusMin += mins;
      count++;
      perDay[Math.floor((t - start) / DAY_MS)] += mins;
      if (s.subjId) perSubject[s.subjId] = (perSubject[s.subjId] || 0) + mins;
    } else if (t >= prevStart && t < start) {
      prevFocusMin += mins;
    }
  }
  const oldest = sessions.length ? Math.min(...sessions.map(s => new Date(s.at).getTime())) : Infinity;
  const truncated = sessions.length >= 30 && oldest > prevStart;

  const topSubjects = Object.entries(perSubject)
    .map(([id, mins]) => ({ id, name: subjectName(id), mins }))
    .filter(s => s.name)
    .sort((a, b) => b.mins - a.mins)
    .slice(0, 3);

  // ── Planning blocks of that week ──
  // The planner writes `dateStr` as toISOString() of the LOCAL midnight of the
  // block's day (east of UTC that is the previous calendar date). Match it
  // with the very same computation instead of parsing it as a real date.
  const weekDateStrs = new Set(Array.from({ length: 7 }, (_, i) =>
    new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i).toISOString().slice(0, 10)));
  let blocksPlanned = 0;
  let blocksDone = 0;
  let hoursPlanned = 0;
  let hoursDone = 0;
  for (const b of asArray(main.blocks)) {
    if (!b?.dateStr || !weekDateStrs.has(b.dateStr)) continue;
    const dur = Number(b.dur) || 0;
    blocksPlanned++;
    hoursPlanned += dur;
    if (b.status === 'done') { blocksDone++; hoursDone += dur; }
  }

  // ── Upcoming exams ──
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const exams = subjects
    .map(s => ({ id: s.id, name: s.name, color: s.color, day: parseDay(s.date) }))
    .filter(e => e.day && e.day.getTime() >= today && e.day.getTime() - today <= EXAM_HORIZON_DAYS * DAY_MS)
    .map(e => ({ ...e, daysLeft: Math.round((e.day.getTime() - today) / DAY_MS) }))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  // ── Reviews due + overall chapter progress ──
  const srData = main.srData || {};
  let reviewsDue = 0;
  let chaptersTotal = 0;
  let chaptersDone = 0;
  for (const s of subjects) {
    const chaps = asArray(s.chapters).length ? asArray(s.chapters) : Array.from({ length: Number(s.chaps) || 0 });
    chaps.forEach((c, i) => {
      chaptersTotal++;
      if (c?.status === 'done') chaptersDone++;
      const sr = srData[`${s.id}_${i}`];
      if (sr && isDue(sr, now.getTime())) reviewsDue++;
    });
  }

  return {
    weekStart,
    focusMin, prevFocusMin, sessions: count, perDay, topSubjects, truncated,
    blocksPlanned, blocksDone, hoursPlanned, hoursDone,
    exams, reviewsDue,
    chaptersTotal, chaptersDone,
    streak: Number(main.streak) || 0,
  };
}
