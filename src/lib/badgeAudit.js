/**
 * Retroactive badge unlocking.
 * --------------------------------------------------------------------------
 * Badges are normally awarded by a Cloud Function when the event that earns
 * them happens. A badge added to the catalogue AFTER a player already passed
 * its threshold therefore stayed locked forever: nothing ever re-checks it.
 * Someone sitting at 6000 XP never "reaches 1000 XP" again.
 *
 * This pass closes that gap from the client: on sign-in it recomputes the
 * badges whose condition can be read straight off the stored data, and adds
 * the missing ones.
 *
 * DELIBERATE LIMITS:
 *   - Only conditions that are DERIVABLE from `users/{uid}/data/main` are
 *     handled. Event badges (exported a PDF, studied after 22 h, scored 100 %
 *     on a quiz) leave no counter behind and are left to the Cloud Function —
 *     guessing at them would unlock badges that were never earned.
 *   - No bonus XP is granted. Catching up a dozen badges at once would
 *     otherwise inflate the total and shift the leaderboard.
 *   - Streak badges use the CURRENT streak, the only one stored. A past streak
 *     that has since been broken cannot be recovered.
 *
 * The write uses `arrayUnion`, so it can never drop a badge the Cloud Function
 * granted in the meantime.
 *
 * LIVE BADGES: rules marked `live` belong to badges that exist only here (no
 * Cloud Function awards them, no bonus XP). They are re-checked on every
 * snapshot of the main document (`auditBadges(uid, d, { liveOnly: true })`),
 * so they unlock the moment their threshold is crossed. The older rules keep
 * their once-per-session timing, so they never race the Cloud Function that
 * grants those badges their XP bonus.
 */

import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase/config';
import { levelFromXp } from '../data/levels';
import { reportSaveError } from './notify';

/** Total number of flashcards across every subject/chapter bucket. */
function countCards(flashcards) {
  return Object.values(flashcards || {})
    .reduce((n, bucket) => n + (Array.isArray(bucket) ? bucket.length : 0), 0);
}

/** Flashcards marked as known (`ok: true`) across every bucket. */
function countMastered(flashcards) {
  return Object.values(flashcards || {})
    .reduce((n, bucket) => n + (Array.isArray(bucket) ? bucket.filter(c => c?.ok === true).length : 0), 0);
}

const asArray = v => (Array.isArray(v) ? v : []);

/** How many distinct subjects have at least one flashcard. */
function subjectsWithCards(flashcards) {
  const subjects = new Set();
  for (const [key, bucket] of Object.entries(flashcards || {})) {
    // Buckets are keyed `<subjectId>_<chapterIndex>`.
    if (Array.isArray(bucket) && bucket.length) subjects.add(key.split('_')[0]);
  }
  return subjects.size;
}

/**
 * Badges whose condition is a threshold over stored data, with the predicate
 * that decides them. Each mirrors the wording of its i18n description.
 */
const DERIVABLE = [
  // XP thresholds
  { id: 'xp_1000',      test: d => d.xp >= 1000 },
  { id: 'xp_5000',      test: d => d.xp >= 5000 },
  { id: 'xp_10000',     test: d => d.xp >= 10000 },
  { id: 'xp_50000',     test: d => d.xp >= 50000 },
  { id: 'xp_100000',    test: d => d.xp >= 100000 },

  // Levels — recomputed from XP rather than trusting a stale stored level.
  { id: 'level5',       test: d => d.level >= 5 },
  { id: 'level10',      test: d => d.level >= 10 },
  { id: 'level18',      test: d => d.level >= 18 },

  // Streaks (current streak only)
  { id: 'streak3',      test: d => d.streak >= 3 },
  { id: 'iron_regular', test: d => d.streak >= 5 },
  { id: 'streak7',      test: d => d.streak >= 7 },
  { id: 'streak14',     test: d => d.streak >= 14 },
  { id: 'en_feu',       test: d => d.streak >= 14 },
  { id: 'diamant',      test: d => d.streak >= 30 },
  { id: 'streak60',     test: d => d.streak >= 60 },
  { id: 'streak100',    test: d => d.streak >= 100 },

  // Total focus time
  { id: 'centurion',    test: d => d.focusHours >= 100 },
  { id: 'focus_250',    test: d => d.focusHours >= 250 },
  { id: 'focus_500',    test: d => d.focusHours >= 500 },

  // Subjects
  { id: 'three_subjects', test: d => d.subjects >= 3 },
  { id: 'six_subjects',   test: d => d.subjects >= 6 },

  // Flashcards created
  { id: 'ten_cards',    test: d => d.cards >= 10 },
  { id: 'encyclopedie', test: d => d.cards >= 50 },
  { id: 'cards_100',    test: d => d.cards >= 100 },
  { id: 'cards_250',    test: d => d.cards >= 250 },
  { id: 'polyglotte',   test: d => d.cardSubjects >= 3 },

  // ── Client-audited badges (live, no bonus XP) ──
  { id: 'focus_10h',        live: true, test: d => d.focusHours >= 10 },
  { id: 'focus_25h',        live: true, test: d => d.focusHours >= 25 },
  { id: 'focus_50h',        live: true, test: d => d.focusHours >= 50 },
  { id: 'streak21',         live: true, test: d => d.streak >= 21 },
  { id: 'xp_25000',         live: true, test: d => d.xp >= 25000 },
  { id: 'level25',          live: true, test: d => d.level >= 25 },
  { id: 'level40',          live: true, test: d => d.level >= 40 },
  { id: 'level70',          live: true, test: d => d.level >= 70 },
  { id: 'blocks_done_25',   live: true, test: d => d.blocksDone >= 25 },
  { id: 'blocks_done_100',  live: true, test: d => d.blocksDone >= 100 },
  { id: 'chapters_done_10', live: true, test: d => d.chaptersDone >= 10 },
  { id: 'chapters_done_50', live: true, test: d => d.chaptersDone >= 50 },
  { id: 'mastered_50',      live: true, test: d => d.mastered >= 50 },
  { id: 'mastered_200',     live: true, test: d => d.mastered >= 200 },
  { id: 'journal_50',       live: true, test: d => d.journal >= 50 },
  { id: 'conf_stars_10',    live: true, test: d => d.fiveStarChapters >= 10 },
  { id: 'exams_3',          live: true, test: d => d.datedExams >= 3 },
  { id: 'grades_10',        live: true, test: d => d.grades >= 10 },
  { id: 'subjects_10',      live: true, test: d => d.subjects >= 10 },
  { id: 'all_rounder',      live: true, test: d => d.sessionSubjects >= 4 },
];

/** Flatten the stored document into the few numbers the predicates need. */
export function badgeFacts(main = {}) {
  const xp = Number(main.xp) || 0;
  return {
    xp,
    level: Number(main.level) || levelFromXp(xp).level,
    streak: Number(main.streak) || 0,
    focusHours: Number(main.totalFocusHours) || 0,
    subjects: Array.isArray(main.subjects) ? main.subjects.length : 0,
    cards: countCards(main.flashcards),
    cardSubjects: subjectsWithCards(main.flashcards),
    mastered: countMastered(main.flashcards),
    blocksDone: asArray(main.blocks).filter(b => b?.status === 'done').length,
    chaptersDone: asArray(main.subjects)
      .reduce((n, s) => n + asArray(s?.chapters).filter(c => c?.status === 'done').length, 0),
    fiveStarChapters: asArray(main.subjects).reduce((n, s) => n + asArray(s?.conf).filter(v => v === 5).length, 0),
    datedExams: asArray(main.subjects).filter(s => s?.date).length,
    // Real grades only (`note`), not the simulator's `sim` values.
    grades: asArray(main.subjects).reduce((n, s) => n + asArray(s?.epreuves)
      .filter(e => e && e.note !== undefined && e.note !== null && e.note !== '').length, 0),
    journal: asArray(main.journalEntries).length,
    // Distinct subjects among the last 30 focus sessions (all the history kept).
    sessionSubjects: new Set(asArray(main.sessions).map(x => x?.subjId).filter(Boolean)).size,
  };
}

/**
 * Badges the player has clearly earned but does not hold.
 * Pure — the caller decides whether to write them.
 *
 * @param {object} main  the `users/{uid}/data/main` document
 * @param {{ liveOnly?: boolean }} [options]  only the live (client-audited) rules
 * @returns {string[]}   badge ids to add (empty when there is nothing to do)
 */
export function missingBadges(main = {}, { liveOnly = false } = {}) {
  const held = new Set(Array.isArray(main.earnedBadges) ? main.earnedBadges : []);
  const facts = badgeFacts(main);
  return DERIVABLE
    .filter(b => (!liveOnly || b.live) && !held.has(b.id) && b.test(facts))
    .map(b => b.id);
}

/**
 * Grant the badges that were already earned. Does nothing when there is
 * nothing to catch up, which is the normal case after the first run.
 *
 * @returns {Promise<string[]>} the badge ids actually granted
 */
export async function auditBadges(uid, main, options) {
  if (!uid || !main) return [];
  const live = Boolean(options?.liveOnly);
  if (live && liveAuditOff) return [];
  const missing = missingBadges(main, options);
  if (!missing.length) return [];
  try {
    await updateDoc(doc(db, 'users', uid, 'data', 'main'), {
      earnedBadges: arrayUnion(...missing),
    });
    return missing;
  } catch (e) {
    // The live pass runs on every snapshot: after one refusal, stop for this
    // session instead of repeating the write (and the error toast) each time.
    if (live) liveAuditOff = true;
    else reportSaveError(e, 'Badges — retroactive unlock');
    return [];
  }
}

/** Set once a live write was refused, so it is not retried every snapshot. */
let liveAuditOff = false;
