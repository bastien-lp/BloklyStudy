/**
 * Daily quests — three small goals a day, paid in garden coins.
 * --------------------------------------------------------------------------
 * Pure: reads the main document, writes nothing, takes its clock as an
 * argument. The page only has to draw the result and write the claim.
 *
 * DESIGN
 *   - No new tracking. Every quest is measured from data the app already
 *     stores (today's focus counters, today's finished tasks, today's journal
 *     entry, today's reviews, the planner blocks of the day), so a quest can
 *     never disagree with the rest of the app.
 *   - The three quests of the day are DRAWN FROM THE UID AND THE DATE, so they
 *     are stable for the whole day, the same on every device, and different
 *     from one student to the next. Nothing has to be stored to remember them.
 *   - One quest always comes from the focus group: the timer is the heart of
 *     the app, and a day should never be spent without an invitation to use it.
 *   - Claiming is what pays; reaching the goal only unlocks the button. The
 *     claim is stored per day in `reserve.quests` = { day, claimed: [ids] }.
 */

import { focusForDay } from './focusDay';

const DAY_MS = 86_400_000;

/** Local YYYY-MM-DD, the key every "today" test uses. */
export function questDayKey(now = new Date()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The planner writes `dateStr` as the ISO form of LOCAL midnight, which east
 * of UTC is the previous calendar date. Blocks are matched with the very same
 * computation rather than by parsing, exactly like lib/weeklyRecap.js.
 */
function plannerDayStr(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().slice(0, 10);
}

const asArray = v => (Array.isArray(v) ? v : []);
const isToday = (iso, dayKey) => typeof iso === 'string' && iso.slice(0, 10) === dayKey;

/**
 * Today's focus, through the shared reader (lib/focusDay) so a quest can never
 * disagree with the Stats page about what "today" holds.
 */
function todayCounters(main, dayKey) {
  const { mins, sessions } = focusForDay(main, new Date(`${dayKey}T12:00:00`));
  return { mins, sessions };
}

/** Chapter reviews completed today, counted from the spaced-repetition data. */
function reviewsToday(main, now) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = start + DAY_MS;
  let n = 0;
  for (const sr of Object.values(main?.srData || {})) {
    for (const at of asArray(sr?.reviews)) {
      if (at >= start && at < end) n++;
    }
  }
  return n;
}

/**
 * The catalogue. `group` is only used to guarantee one focus quest a day;
 * `measure` returns how far the student is, `goal` how far they must go.
 */
export const QUESTS = [
  { id: 'focus25', group: 'focus', goal: 25, coins: 20, measure: (m, d) => todayCounters(m, d).mins },
  { id: 'focus60', group: 'focus', goal: 60, coins: 40, measure: (m, d) => todayCounters(m, d).mins },
  { id: 'sessions2', group: 'focus', goal: 2, coins: 20, measure: (m, d) => todayCounters(m, d).sessions },
  { id: 'review3', group: 'study', goal: 3, coins: 25, measure: (m, d, now) => reviewsToday(m, now) },
  { id: 'todo3', group: 'study', goal: 3, coins: 20, measure: (m, d) => asArray(m?.todos).filter(t => t?.done && isToday(t.doneAt, d)).length },
  { id: 'journal1', group: 'study', goal: 1, coins: 15, measure: (m, d) => asArray(m?.journalEntries).filter(e => isToday(e?.dateISO, d)).length },
  { id: 'block1', group: 'study', goal: 1, coins: 20, measure: (m, d, now) => {
    const today = plannerDayStr(now);
    return asArray(m?.blocks).filter(b => b?.dateStr === today && b?.status === 'done').length;
  } },
];

const questById = id => QUESTS.find(q => q.id === id);

/** Small deterministic hash: the same uid and day always give the same number. */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The three quests of the day: one from the focus group, two from the rest,
 * drawn from the uid and the date so they never move during the day.
 */
export function pickQuests(uid = '', dayKey = questDayKey()) {
  const seed = hash(`${uid}|${dayKey}`);
  const focus = QUESTS.filter(q => q.group === 'focus');
  const others = QUESTS.filter(q => q.group !== 'focus');

  const chosen = [focus[seed % focus.length]];
  // Walk the rest with a non-zero stride, so the two picks can never land on
  // the same quest.
  const stride = 1 + (seed % (others.length - 1));
  let index = (seed >>> 8) % others.length;
  for (let n = 0; n < 2; n++) {
    chosen.push(others[index]);
    index = (index + stride) % others.length;
  }
  return chosen;
}

/**
 * Today's quests with their progress and their claim state.
 *
 * @param {object} main     the main document
 * @param {object} reserve  the reserve document (for `quests`)
 * @param {string} uid
 * @param {Date}   now
 * @returns {{ dayKey, quests: {id, goal, coins, current, done, claimed, claimable}[],
 *             claimable: number, allDone: boolean }}
 */
export function questState(main = {}, reserve = {}, uid = '', now = new Date()) {
  const dayKey = questDayKey(now);
  const stored = reserve?.quests;
  const claimedList = stored?.day === dayKey ? asArray(stored.claimed) : [];

  const quests = pickQuests(uid, dayKey).map(q => {
    const current = Math.max(0, Number(q.measure(main, dayKey, now)) || 0);
    const done = current >= q.goal;
    const claimed = claimedList.includes(q.id);
    return { id: q.id, goal: q.goal, coins: q.coins, current: Math.min(current, q.goal), done, claimed, claimable: done && !claimed };
  });

  return {
    dayKey,
    quests,
    claimable: quests.filter(q => q.claimable).reduce((n, q) => n + q.coins, 0),
    allDone: quests.every(q => q.done),
  };
}

/**
 * The value to store after claiming one quest, or null when the claim is not
 * legitimate (unknown quest, goal not reached, already claimed today). The
 * caller pays `coins` and writes `quests` — both come from here, so a claim
 * can never pay for something that was not earned.
 */
export function claimQuest(main = {}, reserve = {}, uid = '', questId = '', now = new Date()) {
  const state = questState(main, reserve, uid, now);
  const quest = state.quests.find(q => q.id === questId);
  if (!quest || !quest.claimable) return null;
  const def = questById(questId);
  return {
    coins: def.coins,
    quests: { day: state.dayKey, claimed: [...state.quests.filter(q => q.claimed).map(q => q.id), questId] },
  };
}
