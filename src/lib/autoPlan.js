/**
 * Automatic revision plan — fills the planner from what Blokly already knows.
 * --------------------------------------------------------------------------
 * Pure: takes the subjects, the existing blocks and imported calendar events,
 * returns the blocks to add (the caller saves them). Nothing is random, so the
 * same inputs always give the same plan.
 *
 * Rules, in plain words:
 *   1. Every chapter not marked done gets one session. Chapters rated weak in
 *      Confidence (1–2★) get a second session, at least MIN_SPACING_DAYS later.
 *   2. Each chapter must fit before its subject's exam (the day before at the
 *      latest); subjects without an exam date only need to fit in the period.
 *      Earliest deadline first, weak chapters first among equals.
 *   3. A general-review session is placed the day before each exam.
 *   4. Sessions go into free time only: never over an existing block or a
 *      timed calendar event, within the chosen hours, with a short break
 *      between sessions, at most `dailyHours` per day, and subjects are
 *      alternated within a day whenever there is a choice.
 *   5. What cannot fit is reported (`unscheduled`), never silently dropped.
 *
 * Block format (identical to a block added by hand in PagePlanning):
 *   { type: 'rev', subj, label: '', color, day(0=Mon), hour, dur, task, notes: '',
 *     status: 'todo', chapters: [index], weekOffset, dateStr, auto: true }
 * `weekOffset` and `dateStr` follow the planner's own conventions: the week
 * offset relative to the current week, and toISOString() of the local midnight
 * of the day. `auto: true` (an extra optional field) lets the plan be removed
 * in one go; nothing else reads it.
 */

const DAY_MS = 86_400_000;
const SLOT = 0.25;              // planner granularity (quarter hour)
const BREAK_H = 0.25;           // pause between two generated sessions
const MIN_SPACING_DAYS = 2;     // between the two sessions of a weak chapter

const asArray = v => (Array.isArray(v) ? v : []);
const midnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Local Monday 00:00 of the week containing `d` (same as the planner's getWeekStart). */
function mondayOf(d) {
  const m = midnight(d);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

/** The planner's `dateStr` for a local day. */
export const plannerDateStr = day => midnight(day).toISOString().slice(0, 10);

/** "YYYY-MM-DD" exam date → local midnight (null if absent / malformed). */
function parseExamDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/**
 * Busy intervals of one day, in decimal hours [[from, to], …]: existing
 * planner blocks on that date plus timed external events.
 */
function busyHours(day, blocks, events, thisMonday) {
  const ds = plannerDateStr(day);
  const dayIdx = (day.getDay() + 6) % 7;
  const weekOff = Math.round((mondayOf(day) - thisMonday) / (7 * DAY_MS));
  const out = [];
  for (const b of blocks) {
    const onDay = b.dateStr ? b.dateStr === ds : (b.weekOffset || 0) === weekOff && b.day === dayIdx;
    if (onDay) out.push([Number(b.hour) || 0, (Number(b.hour) || 0) + (Number(b.dur) || 0)]);
  }
  const dayStart = day.getTime();
  const dayEnd = dayStart + DAY_MS;
  for (const e of events) {
    if (e.allDay) continue; // all-day entries (holidays, deadlines) do not block hours
    const s = e.start.getTime();
    const en = e.end.getTime();
    if (en <= dayStart || s >= dayEnd) continue;
    out.push([Math.max(0, (s - dayStart) / 3_600_000), Math.min(24, (en - dayStart) / 3_600_000)]);
  }
  return out;
}

/** Earliest quarter-hour in [from, to) where `dur` fits without touching `busy`. */
function firstFreeSlot(busy, from, to, dur) {
  for (let h = Math.ceil(from / SLOT) * SLOT; h + dur <= to + 1e-9; h += SLOT) {
    if (!busy.some(([a, b]) => h < b - 1e-9 && h + dur > a + 1e-9)) return h;
  }
  return null;
}

/**
 * @param {object}   input
 * @param {object[]} input.subjects   main.subjects
 * @param {object[]} input.blocks     main.blocks (existing)
 * @param {object[]} [input.events]   imported calendar events { start: Date, end: Date, allDay }
 * @param {object}   input.options    { weeks, days: boolean[7] (Mon..Sun), dailyHours, startHour,
 *                                      endHour, sessionHours, subjectIds: string[], finalReview }
 * @param {object}   input.labels     { finalReview, secondPass } display texts (i18n)
 * @param {Date}     [input.now]
 * @returns {{ blocks: object[], unscheduled: {subjectId, name, count}[], hours: number }}
 */
export function generateRevisionPlan({ subjects, blocks = [], events = [], options, labels, now = new Date() }) {
  const o = {
    weeks: 2, days: [true, true, true, true, true, false, false], dailyHours: 2,
    startHour: 9, endHour: 19, sessionHours: 1.5, finalReview: true, subjectIds: null, ...options,
  };
  const today = midnight(now);
  const horizonEnd = addDays(today, o.weeks * 7);           // exclusive
  const thisMonday = mondayOf(now);
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const wanted = o.subjectIds ? new Set(o.subjectIds.map(String)) : null;
  const chosen = asArray(subjects).filter(s => !wanted || wanted.has(String(s.id)));

  // ── 1. Work items ──
  const items = [];
  const finals = [];
  for (const s of chosen) {
    const exam = parseExamDate(s.date);
    const examInPeriod = exam && exam >= today && exam < horizonEnd;
    // Chapters must be done by the day before the exam (or by the end of the period).
    const deadline = examInPeriod ? addDays(exam, -1) : addDays(horizonEnd, -1);
    const chapters = asArray(s.chapters).length
      ? asArray(s.chapters)
      : Array.from({ length: Number(s.chaps) || 0 }, (_, i) => ({ name: '', status: i < (Number(s.chapsDone) || 0) ? 'done' : 'todo' }));
    chapters.forEach((c, i) => {
      if (c?.status === 'done') return;
      const conf = Number(asArray(s.conf)[i]) || 0;
      const weak = conf > 0 && conf <= 2;
      const base = { subject: s, chapter: i, name: c?.name || '', deadline, weak, conf };
      items.push({ ...base, pass: 1 });
      if (weak) items.push({ ...base, pass: 2 });
    });
    if (o.finalReview && examInPeriod) finals.push({ subject: s, exam });
  }
  // Earliest deadline first; weak chapters first; then chapter order.
  items.sort((a, b) => a.deadline - b.deadline || (b.weak - a.weak) || (a.conf - b.conf) || a.chapter - b.chapter || a.pass - b.pass);

  // ── 2. Day by day ──
  const planned = [];
  const firstPassDay = new Map(); // "subj_chapter" → day index of the first session
  const placeOn = (day, dayBusy, dur, start) => {
    const from = Math.max(o.startHour, start);
    return firstFreeSlot(dayBusy, from, o.endHour, dur);
  };
  const makeBlock = (day, hour, subject, chapterIdx, task) => ({
    type: 'rev', subj: subject.id, label: '', color: subject.color || '#4A90D9',
    day: (day.getDay() + 6) % 7, hour, dur: o.sessionHours, task, notes: '', status: 'todo',
    chapters: chapterIdx == null ? [] : [chapterIdx],
    weekOffset: Math.round((mondayOf(day) - thisMonday) / (7 * DAY_MS)),
    dateStr: plannerDateStr(day), auto: true,
  });

  for (let day = today, n = 0; day < horizonEnd; day = addDays(day, 1), n++) {
    if (!o.days[(day.getDay() + 6) % 7]) continue;
    const dayBusy = busyHours(day, [...blocks, ...planned], events, thisMonday);
    let used = 0;
    let cursor = n === 0 ? Math.max(o.startHour, Math.ceil((nowHour + 0.5) / SLOT) * SLOT) : o.startHour;
    let lastSubject = null;

    // The day before an exam ends with its general review: keep time for it.
    const finalsToday = finals.filter(f => addDays(f.exam, -1).getTime() === day.getTime());
    const reserved = Math.min(o.dailyHours, finalsToday.length * o.sessionHours);

    while (used + o.sessionHours <= o.dailyHours - reserved + 1e-9) {
      const eligible = items.filter(it => !it.placed && it.deadline >= day && (it.pass === 1 ||
        (firstPassDay.has(`${it.subject.id}_${it.chapter}`) && n - firstPassDay.get(`${it.subject.id}_${it.chapter}`) >= MIN_SPACING_DAYS)));
      if (!eligible.length) break;
      // Alternate subjects when possible (the list is already in priority order).
      const pick = eligible.find(it => String(it.subject.id) !== lastSubject) || eligible[0];
      const hour = placeOn(day, dayBusy, o.sessionHours, cursor);
      if (hour == null) break;
      const task = pick.pass === 2 ? `${pick.name || ''} · ${labels.secondPass}`.replace(/^ · /, '') : pick.name;
      planned.push(makeBlock(day, hour, pick.subject, pick.chapter, task));
      dayBusy.push([hour, hour + o.sessionHours]);
      used += o.sessionHours;
      cursor = hour + o.sessionHours + BREAK_H;
      lastSubject = String(pick.subject.id);
      pick.placed = true;
      if (pick.pass === 1) firstPassDay.set(`${pick.subject.id}_${pick.chapter}`, n);
    }

    for (const f of finalsToday) {
      if (used + o.sessionHours > o.dailyHours + 1e-9) break;
      const hour = placeOn(day, dayBusy, o.sessionHours, cursor);
      if (hour == null) break;
      planned.push(makeBlock(day, hour, f.subject, null, labels.finalReview));
      dayBusy.push([hour, hour + o.sessionHours]);
      used += o.sessionHours;
      cursor = hour + o.sessionHours + BREAK_H;
    }
  }

  // ── 3. What did not fit ──
  const missing = new Map();
  for (const it of items) {
    if (it.placed) continue;
    const key = String(it.subject.id);
    const m = missing.get(key) || { subjectId: it.subject.id, name: it.subject.name, count: 0 };
    m.count++;
    missing.set(key, m);
  }
  return {
    blocks: planned,
    unscheduled: [...missing.values()],
    hours: planned.reduce((h, b) => h + b.dur, 0),
  };
}

/** Future, not-yet-done blocks created by the automatic plan (what "remove the plan" deletes). */
export function pendingAutoBlocks(blocks, now = new Date()) {
  const todayStr = plannerDateStr(now);
  return asArray(blocks).filter(b => b?.auto && b.status !== 'done' && (!b.dateStr || b.dateStr >= todayStr));
}
