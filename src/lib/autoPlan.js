/**
 * Automatic revision plan — fills the planner from what Blokly already knows.
 * --------------------------------------------------------------------------
 * Pure: takes the subjects, the existing blocks and imported calendar events,
 * returns the blocks to add (the caller saves them). Nothing is random, so the
 * same inputs always give the same plan.
 *
 * Rules, in plain words:
 *   1. Every chapter the student left in the plan gets one session. Chapters
 *      rated weak in Confidence (1–2★) get a second session, at least
 *      MIN_SPACING_DAYS later, unless `weakExtra` is off. Chapters already
 *      marked done are left out unless `includeDone` asks for them — mastered
 *      is not the same as not worth seeing again — and they then come last.
 *   2. Each chapter must fit before its subject's exam (the day before at the
 *      latest); subjects without an exam date only need to fit in the period.
 *      Earliest deadline first, weak chapters first among equals.
 *   3. A general-review session is placed before each exam, on the last day
 *      available before it (the eve when that day was picked).
 *   4. Sessions go into free time only: never over an existing block or a
 *      timed calendar event, inside one of the chosen time windows, with a
 *      short break between sessions, at most `dailyHours` per day, and
 *      subjects are alternated within a day whenever there is a choice.
 *   4b. Nothing is placed before `startDate` (today by default).
 *   5. What cannot fit is reported (`unscheduled`), never silently dropped.
 *
 * The result also carries `explain`: how many chapters were counted, how many
 * of them are weak, how many exams fall in the period, how many existing
 * blocks and calendar events were worked around, and how the time available
 * compares with the time needed. The modal shows it, so the plan is never a
 * black box.
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
    startHour: 9, endHour: 19, windows: null, sessionHours: 1.5, finalReview: true,
    subjectIds: null, chapters: null, startDate: null, weakExtra: true, includeDone: false,
    ...options,
  };

  // Time windows. A single start/end pair is still accepted (that is what the
  // first version took), and becomes the one window.
  const windows = (Array.isArray(o.windows) && o.windows.length ? o.windows : [{ from: o.startHour, to: o.endHour }])
    .map(w => ({ from: Math.max(0, Number(w.from) || 0), to: Math.min(24, Number(w.to) || 0) }))
    .filter(w => w.to > w.from)
    .sort((a, b) => a.from - b.from);
  const dayOpen = windows.length ? windows[0].from : 0;

  const today = midnight(now);
  // Nothing before the chosen start date, and never before today.
  const startDay = (() => {
    const picked = o.startDate instanceof Date ? midnight(o.startDate) : parseExamDate(o.startDate);
    return picked && picked > today ? picked : today;
  })();
  const horizonEnd = addDays(startDay, o.weeks * 7);        // exclusive
  const thisMonday = mondayOf(now);
  const nowHour = now.getHours() + now.getMinutes() / 60;
  const startsToday = startDay.getTime() === today.getTime();
  const wanted = o.subjectIds ? new Set(o.subjectIds.map(String)) : null;
  const chosen = asArray(subjects).filter(s => !wanted || wanted.has(String(s.id)));

  // ── 1. Work items ──
  const items = [];
  const finals = [];
  // Per subject, what the plan found — shown to the student, never used to decide.
  const perSubject = [];
  for (const s of chosen) {
    const exam = parseExamDate(s.date);
    const examInPeriod = exam && exam >= startDay && exam < horizonEnd;
    // Chapters must be done by the day before the exam (or by the end of the period).
    const deadline = examInPeriod ? addDays(exam, -1) : addDays(horizonEnd, -1);
    // Which chapters of this subject the student left in the plan (null = all).
    const picked = o.chapters?.[String(s.id)] ?? o.chapters?.[s.id] ?? null;
    const chapters = asArray(s.chapters).length
      ? asArray(s.chapters)
      : Array.from({ length: Number(s.chaps) || 0 }, (_, i) => ({ name: '', status: i < (Number(s.chapsDone) || 0) ? 'done' : 'todo' }));
    chapters.forEach((c, i) => {
      if (Array.isArray(picked) && !picked.includes(i)) return;
      const done = c?.status === 'done';
      if (done && !o.includeDone) return;
      const conf = Number(asArray(s.conf)[i]) || 0;
      const weak = conf > 0 && conf <= 2;
      const base = { subject: s, chapter: i, name: c?.name || '', deadline, weak, conf, done };
      items.push({ ...base, pass: 1 });
      // A second pass is for a shaky chapter still being learned, never for a
      // chapter brought back just to keep it fresh.
      if (weak && o.weakExtra && !done) items.push({ ...base, pass: 2 });
    });
    if (o.finalReview && examInPeriod) finals.push({ subject: s, exam });

    const mine = items.filter(it => String(it.subject.id) === String(s.id));
    perSubject.push({
      id: s.id,
      name: s.name,
      color: s.color || null,
      chapters: new Set(mine.map(it => it.chapter)).size,
      weak: new Set(mine.filter(it => it.weak && !it.done).map(it => it.chapter)).size,
      revisited: new Set(mine.filter(it => it.done).map(it => it.chapter)).size,
      sessions: mine.length,
      placed: 0,
      exam: examInPeriod ? exam : null,
      deadline,
    });
  }
  // Earliest deadline first; chapters still to learn before refreshers; weak
  // chapters first; then chapter order.
  items.sort((a, b) => a.deadline - b.deadline || (a.done - b.done) || (b.weak - a.weak)
    || (a.conf - b.conf) || a.chapter - b.chapter || a.pass - b.pass);

  /** What the block says it is about: the chapter, and why it is there. */
  const chapterTask = (item, l) => {
    const head = l.chapter ? l.chapter.replace('{n}', item.chapter + 1) : `Ch. ${item.chapter + 1}`;
    const parts = [item.name ? `${head} · ${item.name}` : head];
    if (item.pass === 2) parts.push(l.secondPass);
    else if (item.done) parts.push(l.refresher || l.secondPass);
    return parts.join(' · ');
  };

  // ── 2. Day by day ──
  // Where each general review goes: the eve of the exam when that day is one
  // of the chosen ones, otherwise the closest available day before it.
  const finalsByDay = new Map();
  for (const f of finals) {
    let d = addDays(f.exam, -1);
    while (d >= startDay && !o.days[(d.getDay() + 6) % 7]) d = addDays(d, -1);
    if (d < startDay) continue;                    // no day left: reported below
    finalsByDay.set(d.getTime(), [...(finalsByDay.get(d.getTime()) || []), f]);
  }

  const planned = [];
  let daysAvailable = 0;
  let busyBlocks = 0;
  let busyEvents = 0;
  const firstPassDay = new Map(); // "subj_chapter" → day index of the first session
  /** Earliest free slot of the day, looking through each window in turn. */
  const placeOn = (day, dayBusy, dur, cursor) => {
    for (const w of windows) {
      const from = Math.max(w.from, cursor);
      if (from + dur > w.to + 1e-9) continue;
      const hour = firstFreeSlot(dayBusy, from, w.to, dur);
      if (hour != null) return hour;
    }
    return null;
  };
  const makeBlock = (day, hour, subject, chapterIdx, task) => ({
    type: 'rev', subj: subject.id, label: '', color: subject.color || '#4A90D9',
    day: (day.getDay() + 6) % 7, hour, dur: o.sessionHours, task, notes: '', status: 'todo',
    chapters: chapterIdx == null ? [] : [chapterIdx],
    weekOffset: Math.round((mondayOf(day) - thisMonday) / (7 * DAY_MS)),
    dateStr: plannerDateStr(day), auto: true,
  });

  for (let day = startDay, n = 0; day < horizonEnd; day = addDays(day, 1), n++) {
    if (!o.days[(day.getDay() + 6) % 7]) continue;
    daysAvailable++;
    busyBlocks += busyHours(day, blocks, [], thisMonday).length;
    busyEvents += busyHours(day, [], events, thisMonday).length;
    const dayBusy = busyHours(day, [...blocks, ...planned], events, thisMonday);
    let used = 0;
    // Today, nothing starts in the next half hour; a later start day opens at
    // the first window.
    let cursor = (n === 0 && startsToday) ? Math.max(dayOpen, Math.ceil((nowHour + 0.5) / SLOT) * SLOT) : dayOpen;
    let lastSubject = null;

    // A day carrying a general review keeps the time for it.
    const finalsToday = finalsByDay.get(day.getTime()) || [];
    const reserved = Math.min(o.dailyHours, finalsToday.length * o.sessionHours);

    while (used + o.sessionHours <= o.dailyHours - reserved + 1e-9) {
      const eligible = items.filter(it => !it.placed && it.deadline >= day && (it.pass === 1 ||
        (firstPassDay.has(`${it.subject.id}_${it.chapter}`) && n - firstPassDay.get(`${it.subject.id}_${it.chapter}`) >= MIN_SPACING_DAYS)));
      if (!eligible.length) break;
      // Alternate subjects when possible (the list is already in priority order).
      const pick = eligible.find(it => String(it.subject.id) !== lastSubject) || eligible[0];
      const hour = placeOn(day, dayBusy, o.sessionHours, cursor);
      if (hour == null) break;
      const task = chapterTask(pick, labels);
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
      f.placed = true;
      dayBusy.push([hour, hour + o.sessionHours]);
      used += o.sessionHours;
      cursor = hour + o.sessionHours + BREAK_H;
    }
  }

  // ── 3. What did not fit ──
  const missing = new Map();
  const addMissing = subject => {
    const key = String(subject.id);
    const m = missing.get(key) || { subjectId: subject.id, name: subject.name, count: 0 };
    m.count++;
    missing.set(key, m);
  };
  for (const it of items) if (!it.placed) addMissing(it.subject);
  for (const f of finals) if (!f.placed) addMissing(f.subject);
  for (const b of planned) {
    const row = perSubject.find(p => String(p.id) === String(b.subj));
    if (row) row.placed++;
  }

  const finalsPlanned = planned.filter(b => !b.chapters.length).length;
  const sessionsNeeded = items.length + finals.length;
  const neededHours = sessionsNeeded * o.sessionHours;
  const capacityHours = daysAvailable * o.dailyHours;

  return {
    blocks: planned,
    unscheduled: [...missing.values()],
    hours: planned.reduce((h, b) => h + b.dur, 0),
    explain: {
      // what was counted
      chapters: items.filter(it => it.pass === 1 && !it.done).length,
      weakChapters: items.filter(it => it.pass === 2).length,
      revisited: items.filter(it => it.pass === 1 && it.done).length,
      startDay,
      windows,
      sessionsNeeded,
      sessionsPlaced: planned.length,
      finalReviews: finals.length,
      finalReviewsPlaced: finalsPlanned,
      // A real Date:  is the planner's own key (the ISO form of
      // LOCAL midnight, one day earlier east of UTC) and must never be shown.
      exams: finals.map(f => ({ id: f.subject.id, name: f.subject.name, date: f.exam })),
      // what it worked around
      busyBlocks,
      busyEvents,
      // whether it can fit
      daysAvailable,
      capacityHours,
      neededHours,
      enoughTime: neededHours <= capacityHours,
      perSubject,
    },
  };
}

/** Future, not-yet-done blocks created by the automatic plan (what "remove the plan" deletes). */
export function pendingAutoBlocks(blocks, now = new Date()) {
  const todayStr = plannerDateStr(now);
  return asArray(blocks).filter(b => b?.auto && b.status !== 'done' && (!b.dateStr || b.dateStr >= todayStr));
}
