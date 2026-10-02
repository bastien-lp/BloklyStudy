/**
 * Revision counters — how many times the student says they revised something.
 *
 * This is a MANUAL tally, on purpose. Nothing here is derived from the planner,
 * the focus timer or the spaced-repetition schedule: a revision done on paper,
 * in the bus or on a friend's notes counts exactly as much as one the app
 * happened to witness, and only the student knows. Every number moves because
 * someone tapped + or −.
 *
 * Two independent levels, because they answer different questions:
 *   - one counter per SUBJECT  — "how many times have I been through Maths?"
 *   - one counter per CHAPTER  — "how many times have I redone this chapter?"
 * The subject counter is NOT the sum of its chapters. Going through everything
 * once and drilling one hard chapter five times are different facts, and adding
 * them up would hide both.
 *
 * The one assisted path is opt-in: finishing a spaced review in PageRepetition
 * can add +1 to that chapter, governed by `main.revAskAfterReview`
 * ('ask' | 'always' | 'never', see ASK_MODES). Even then, the write goes through
 * the same bump helpers below — there is no second way for a counter to move.
 *
 * THE STORED FIELD (additive — absent means zero, nothing to migrate)
 * ------------------------------------------------------------------
 *   users/{uid}/data/main.revCounts = {
 *     "<subjectId>": { n: 3, chapters: { "<chapterIndex>": 2 } }
 *   }
 *
 * Subject ids are numbers (see AppPage.addSubject) and chapter indices are
 * integers, but Firestore map keys are strings, so every lookup and write goes
 * through String(...). An entry back at zero everywhere is deleted rather than
 * kept as noise.
 */

/** Allowed values of `main.revAskAfterReview`; the first one is the default. */
export const ASK_MODES = ['ask', 'always', 'never'];

/** The stored mode, falling back to 'ask' for an account that never set it. */
export function askMode(stored) {
  return ASK_MODES.includes(stored) ? stored : ASK_MODES[0];
}

/** Number of chapters for a subject, tolerant of the legacy `chaps` count. */
function chapterCount(subject) {
  if (Array.isArray(subject.chapters)) return subject.chapters.length;
  return subject.chaps || 0;
}

/** One subject's entry, normalised so callers never branch on absence. */
function entryFor(revCounts, subjectId) {
  const e = revCounts?.[String(subjectId)];
  return {
    n: Math.max(0, Number(e?.n) || 0),
    chapters: e?.chapters && typeof e.chapters === 'object' ? e.chapters : {},
  };
}

/** A single chapter's count. */
export function chapterCountFor(revCounts, subjectId, index) {
  const { chapters } = entryFor(revCounts, subjectId);
  return Math.max(0, Number(chapters[String(index)]) || 0);
}

/**
 * Read model for one subject's row in the tracker.
 *
 * @param {object}   subject       a subject from `users/{uid}/data/main`
 * @param {object}   revCounts     the `revCounts` map
 * @param {Function} chapterLabel  (index) => fallback name for an unnamed chapter
 * @returns {{ n:number, chapters:{index:number,name:string,count:number}[],
 *             chaptersTotal:number, chaptersTouched:number }}
 */
export function subjectCounts(subject, revCounts = {}, chapterLabel = i => `${i + 1}`) {
  const { n, chapters } = entryFor(revCounts, subject.id);
  const rows = [];
  for (let i = 0; i < chapterCount(subject); i++) {
    rows.push({
      index: i,
      name: subject.chapters?.[i]?.name || chapterLabel(i),
      count: Math.max(0, Number(chapters[String(i)]) || 0),
    });
  }
  return {
    n,
    chapters: rows,
    chaptersTotal: rows.reduce((a, c) => a + c.count, 0),
    chaptersTouched: rows.filter(c => c.count > 0).length,
  };
}

/**
 * Drop an entry that is back to all zeros, so the document does not accumulate
 * empty objects as students try the buttons out.
 */
function withEntry(revCounts, key, entry) {
  const chapters = Object.fromEntries(Object.entries(entry.chapters).filter(([, v]) => v > 0));
  const next = { ...revCounts };
  if (entry.n <= 0 && Object.keys(chapters).length === 0) delete next[key];
  else next[key] = { n: entry.n, chapters };
  return next;
}

/**
 * Move a subject's counter by `delta` (+1 / −1), never below zero.
 *
 * @returns {object|null} the new map, or null when nothing would change —
 *          callers use that to skip the write entirely.
 */
export function bumpSubject(revCounts = {}, subjectId, delta) {
  const key = String(subjectId);
  const entry = entryFor(revCounts, key);
  const n = Math.max(0, entry.n + delta);
  if (n === entry.n) return null;
  return withEntry(revCounts, key, { ...entry, n });
}

/**
 * Move one chapter's counter by `delta` (+1 / −1), never below zero.
 *
 * @returns {object|null} the new map, or null when nothing would change.
 */
export function bumpChapter(revCounts = {}, subjectId, index, delta) {
  const key = String(subjectId);
  const ci = String(index);
  const entry = entryFor(revCounts, key);
  const current = Math.max(0, Number(entry.chapters[ci]) || 0);
  const count = Math.max(0, current + delta);
  if (count === current) return null;
  return withEntry(revCounts, key, { ...entry, chapters: { ...entry.chapters, [ci]: count } });
}
