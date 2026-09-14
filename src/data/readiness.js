/**
 * Subject "readiness" — a derived preparation score (0–100) per subject.
 *
 * This is a PRESENTATION metric, computed live from data the app already
 * stores. It writes NOTHING and defines no new persisted shape: it only reads
 * existing fields, so it is safe against the data contract (CLAUDE.md §2.2).
 *
 * It is deliberately kept OUT of `levels.js` / `badges.js`: it is not game
 * balance and grants no XP — it just summarises "how ready is this subject?"
 * by blending three signals the user already maintains across pages:
 *
 *   - completion : share of chapters marked done (wip counts half)
 *                  — source: PageSyntheses (`subject.chapters[].status`)
 *   - confidence : average self-rated confidence, normalised to 0–1
 *                  — source: PageConfidence (`subject.conf[]`, 0–5 per chapter)
 *   - reviews    : health of the spaced-repetition schedule for the subject
 *                  — source: PageRepetition (`srData["<id>_<idx>"]`)
 *
 * The weights favour concrete progress (chapters done) over self-assessment,
 * with review health as a smaller nudge. Tune WEIGHTS if the balance feels off.
 */

import { nextDueMs, isMastered } from './repetition';

const WEIGHTS = { completion: 0.45, confidence: 0.35, reviews: 0.20 };

/** Number of chapters for a subject, tolerant of legacy `chaps` count. */
function chapterCount(subject) {
  if (Array.isArray(subject.chapters)) return subject.chapters.length;
  return subject.chaps || 0;
}

/** 0–1 completion from chapter statuses (done = 1, wip = 0.5), legacy fallback. */
function completionRatio(subject) {
  const chapters = subject.chapters;
  if (Array.isArray(chapters) && chapters.length) {
    const score = chapters.reduce((sum, c) => {
      if (c.status === 'done') return sum + 1;
      if (c.status === 'wip') return sum + 0.5;
      return sum;
    }, 0);
    return score / chapters.length;
  }
  // Legacy subjects only expose counts.
  const total = subject.chaps || 0;
  return total ? Math.min(1, (subject.chapsDone || 0) / total) : 0;
}

/** 0–1 average confidence (self-rated 0–5 per chapter). */
function confidenceRatio(subject) {
  const conf = Array.isArray(subject.conf) ? subject.conf : [];
  const n = chapterCount(subject) || conf.length;
  if (!n) return 0;
  const sum = conf.reduce((a, v) => a + (Number(v) || 0), 0);
  return Math.min(1, sum / (5 * n));
}

/**
 * 0–1 spaced-repetition health for a subject:
 * among chapters that have been scheduled, the share that are either mastered
 * (3 reviews done) or not yet overdue. Returns null when nothing is scheduled,
 * so callers can leave that signal out rather than penalising the subject.
 */
function reviewHealth(subject, srData, now) {
  const n = chapterCount(subject);
  let scheduled = 0;
  let healthy = 0;
  for (let i = 0; i < n; i++) {
    const sr = srData[`${subject.id}_${i}`];
    if (!sr) continue;
    scheduled++;
    if (isMastered(sr)) { healthy++; continue; }
    if (nextDueMs(sr) > now) healthy++; // scheduled and not overdue
  }
  return scheduled ? healthy / scheduled : null;
}

/**
 * Compute a subject's readiness.
 * @param {object} subject  a subject from `users/{uid}/data/main`.
 * @param {object} srData   the `srData` map (may be empty/undefined).
 * @param {number} now      current time in ms (pass Date.now() from caller so
 *                          this stays pure and testable).
 * @returns {{ score:number, completion:number, confidence:number, reviews:(number|null) }}
 *          score is 0–100 (rounded); the three sub-signals are 0–1 (reviews may be null).
 */
export function subjectReadiness(subject, srData = {}, now = 0) {
  const completion = completionRatio(subject);
  const confidence = confidenceRatio(subject);
  const reviews = reviewHealth(subject, srData, now);

  // When no reviews are scheduled, redistribute that weight over the other two
  // signals so an unused feature never caps the score.
  let score;
  if (reviews == null) {
    const w = WEIGHTS.completion + WEIGHTS.confidence;
    score = (completion * WEIGHTS.completion + confidence * WEIGHTS.confidence) / w;
  } else {
    score = completion * WEIGHTS.completion
          + confidence * WEIGHTS.confidence
          + reviews * WEIGHTS.reviews;
  }

  return {
    score: Math.round(score * 100),
    completion,
    confidence,
    reviews,
  };
}

/** A short qualitative label + colour for a 0–100 readiness score. */
export function readinessBand(score) {
  if (score >= 80) return { key: 'ready',   color: '#27AE60' };
  if (score >= 55) return { key: 'onTrack', color: '#F1C40F' };
  if (score >= 30) return { key: 'behind',  color: '#E67E22' };
  return { key: 'atRisk', color: '#E74C3C' };
}
