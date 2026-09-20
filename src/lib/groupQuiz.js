/**
 * Live group quiz ("Kahoot-style") — questions, timeline, scores, RTDB access.
 * --------------------------------------------------------------------------
 * Built like live focus sessions (groupSession.js): the stored record holds
 * the questions and the moment the quiz started; every client derives the
 * current question, the time left and the reveal from the shared server
 * clock (serverClock.js). Consequences:
 *   - no writes while the quiz runs except each player's own answers;
 *   - the quiz keeps going if the host closes their tab;
 *   - a late joiner is instantly on the right question.
 *
 * Scores are never stored: they are recomputed from the answers and the
 * correct choices, so nobody can simply write themselves a high score.
 * Fast correct answers earn more: 1000 points at once, 500 at the buzzer.
 *
 * RTDB shape (new path — touches no existing data):
 *   groupQuiz/{groupId}/current : { id, hostUid, hostPseudo, title, secondsPerQ, revealSec,
 *                                   questions: [{ q, choices[4], correct }], totalMs,
 *                                   createdAt, startedAt?, endedAt? }
 *   groupQuiz/{groupId}/players/{uid} : { pseudo, joinedAt, answers: { [qIndex]: { c, ms } } }
 */

import { ref as dbRef, onValue, set, update, remove } from 'firebase/database';
import { rtdb } from '../firebase/config';
import { serverNow } from './serverClock';

export const QUIZ_COUNTS = [5, 8, 10, 12, 15, 20, 25, 30];
export const QUIZ_SECONDS = [5, 10, 15, 20, 30, 45, 60];
/** How long the right answer stays on screen, and the default. */
export const QUIZ_REVEALS = [3, 5, 8, 12];
export const REVEAL_SEC = 5;
export const MIN_CARDS = 4;
const STALE_MS = 2 * 3_600_000;

// ── Questions (pure) ────────────────────────────────────────────────────────

const norm = s => String(s || '').trim().toLowerCase();

/** Deterministic PRNG so tests (and replays) are reproducible. */
export function seededRandom(seed = Date.now()) {
  let x = seed % 2147483647;
  if (x <= 0) x += 2147483646;
  return () => (x = (x * 16807) % 2147483647) / 2147483647;
}

function shuffle(list, rnd) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Multiple-choice questions from flashcards: the right answer plus three wrong
 * ones taken from the other cards of the deck. Needs at least MIN_CARDS cards
 * with different answers; returns [] otherwise.
 */
export function buildQuestions(cards, count, rnd = Math.random) {
  const clean = [];
  const seen = new Set();
  for (const c of cards || []) {
    const q = String(c?.q || '').trim();
    const a = String(c?.a || '').trim();
    if (!q || !a || seen.has(norm(q))) continue;
    seen.add(norm(q));
    clean.push({ q: q.slice(0, 300), a: a.slice(0, 160) });
  }
  const answers = [...new Map(clean.map(c => [norm(c.a), c.a])).values()];
  if (clean.length < MIN_CARDS || answers.length < MIN_CARDS) return [];

  return shuffle(clean, rnd).slice(0, count).map(card => {
    const wrong = shuffle(answers.filter(a => norm(a) !== norm(card.a)), rnd).slice(0, 3);
    const choices = shuffle([card.a, ...wrong], rnd);
    return { q: card.q, choices, correct: choices.indexOf(card.a) };
  });
}

// ── Timeline (pure) ─────────────────────────────────────────────────────────

/**
 * Where the quiz is at `now`:
 *   { phase: 'lobby' | 'question' | 'reveal' | 'done', index, remainingMs }
 * Each question lasts secondsPerQ, followed by revealSec of answer + scores.
 */
export function quizPhase(quiz, now = serverNow()) {
  if (!quiz) return { phase: 'none', index: -1, remainingMs: 0 };
  if (quiz.endedAt) return { phase: 'done', index: (quiz.questions?.length || 1) - 1, remainingMs: 0 };
  if (!quiz.startedAt) return { phase: 'lobby', index: -1, remainingMs: 0 };
  const qMs = quiz.secondsPerQ * 1000;
  const slot = qMs + (quiz.revealSec ?? REVEAL_SEC) * 1000;
  const elapsed = Math.max(0, now - quiz.startedAt);
  const index = Math.floor(elapsed / slot);
  const n = quiz.questions?.length || 0;
  if (index >= n) return { phase: 'done', index: n - 1, remainingMs: 0 };
  const into = elapsed - index * slot;
  return into < qMs
    ? { phase: 'question', index, remainingMs: qMs - into }
    : { phase: 'reveal', index, remainingMs: slot - into };
}

/** Points for one answer: 1000 immediately, down to 500 at the buzzer; 0 if wrong or late. */
export function pointsFor(question, answer, secondsPerQ) {
  if (!answer || answer.c !== question.correct) return 0;
  const limit = secondsPerQ * 1000;
  if (!(answer.ms >= 0) || answer.ms > limit) return 0;
  return Math.round(1000 - 500 * (answer.ms / limit));
}

/**
 * Standings up to (and including) question `upTo`: [{ uid, pseudo, score, correct }]
 * sorted best first. Recomputed from the answers, never read from storage.
 */
export function standings(quiz, players, upTo = Infinity) {
  const qs = quiz?.questions || [];
  return Object.entries(players || {})
    .map(([uid, p]) => {
      let score = 0;
      let correct = 0;
      qs.forEach((q, i) => {
        if (i > upTo) return;
        const pts = pointsFor(q, p.answers?.[i], quiz.secondsPerQ);
        score += pts;
        if (pts > 0) correct++;
      });
      return { uid, pseudo: p.pseudo || '?', score, correct };
    })
    .sort((a, b) => b.score - a.score || a.pseudo.localeCompare(b.pseudo));
}

/** A quiz that is over or abandoned can be replaced. */
export function isQuizStale(quiz, now = serverNow()) {
  if (!quiz) return true;
  if (quiz.endedAt) return true;
  if (now - (quiz.createdAt || 0) > STALE_MS) return true;
  return quizPhase(quiz, now).phase === 'done';
}

// ── RTDB ────────────────────────────────────────────────────────────────────

const quizRef = groupId => dbRef(rtdb, `groupQuiz/${groupId}/current`);
const playersRef = groupId => dbRef(rtdb, `groupQuiz/${groupId}/players`);
const playerRef = (groupId, uid) => dbRef(rtdb, `groupQuiz/${groupId}/players/${uid}`);

export const subscribeQuiz = (groupId, cb) => onValue(quizRef(groupId), s => cb(s.val()), () => cb(null));
export const subscribePlayers = (groupId, cb) => onValue(playersRef(groupId), s => cb(s.val() || {}), () => cb({}));

/** Creates a quiz in the lobby (clears the previous players). Resolves to its id. */
export async function createQuiz(groupId, { uid, pseudo, title, questions, secondsPerQ, revealSec = REVEAL_SEC }) {
  const id = `${uid.slice(0, 6)}${Date.now().toString(36)}`;
  const record = {
    id, hostUid: uid, hostPseudo: pseudo, title: String(title || '').slice(0, 80),
    secondsPerQ, revealSec, questions,
    totalMs: questions.length * (secondsPerQ + revealSec) * 1000,
    createdAt: serverNow(),
  };
  await set(quizRef(groupId), record);
  await remove(playersRef(groupId)).catch(() => {});
  await joinQuiz(groupId, uid, pseudo);
  return id;
}

export const startQuiz = groupId => update(quizRef(groupId), { startedAt: serverNow() + 3000 }); // 3 s "get ready"
export const endQuiz = groupId => update(quizRef(groupId), { endedAt: serverNow() });
export const clearQuiz = groupId => remove(quizRef(groupId));

export function joinQuiz(groupId, uid, pseudo) {
  return update(playerRef(groupId, uid), { pseudo: String(pseudo || '?').slice(0, 40), joinedAt: serverNow() });
}

/** Records my answer to question `index` (first answer only — the UI locks after it). */
export function answerQuiz(groupId, uid, index, choice, ms) {
  return set(dbRef(rtdb, `groupQuiz/${groupId}/players/${uid}/answers/${index}`), { c: choice, ms: Math.max(0, Math.round(ms)) });
}

export const leaveQuiz = (groupId, uid) => remove(playerRef(groupId, uid));
