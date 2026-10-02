/**
 * Multiple-choice questions ("QCM") — the second quiz type, next to flashcards.
 * --------------------------------------------------------------------------
 * A flashcard quiz takes its wrong choices from the other answers of the deck,
 * so they are often unrelated to the question and easy to rule out. A QCM item
 * carries its OWN wrong answers, chosen to be plausible: same kind of answer
 * (a date for a date, a person for a person), same topic, typical confusions.
 * They are written by the student or proposed by the AI (lib/aiQuiz.js) and
 * always reviewed before being saved.
 *
 * Firestore (new document — touches no existing data):
 *   users/{uid}/data/mcq : { sets: { "<subjectId>_<chapterIndex>": [McqItem] } }
 *   McqItem = { q, a, wrong: [w1, w2, w3], ok: true | false | null }
 *   - the set key is the same as the flashcards key of that chapter;
 *   - ok has the same meaning as on a flashcard (mastered / to review / new).
 *
 * Played questions have the shape of the live group quiz (lib/groupQuiz.js):
 *   { q, choices: [4 strings], correct: index }
 * so a QCM set can feed the group quiz without any change to its RTDB record.
 */

import { doc, onSnapshot, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

/** Wrong answers per question (4 choices in total, like the group quiz). */
export const MCQ_WRONG = 3;
export const MCQ_MAX_Q = 300;
export const MCQ_MAX_A = 160;

const norm = s => String(s || '').trim().toLowerCase();
const clip = (s, max) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);

function shuffle(list, rnd) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Items (pure) ────────────────────────────────────────────────────────────

/**
 * A clean item, or null when it cannot make a fair question: it needs a
 * question, an answer and MCQ_WRONG distinct wrong answers that all differ
 * from the right one.
 */
export function sanitizeMcqItem(item) {
  const q = clip(item?.q, MCQ_MAX_Q);
  const a = clip(item?.a, MCQ_MAX_A);
  if (!q || !a) return null;
  const seen = new Set([norm(a)]);
  const wrong = [];
  for (const w of Array.isArray(item?.wrong) ? item.wrong : []) {
    const text = clip(w, MCQ_MAX_A);
    if (!text || seen.has(norm(text))) continue;
    seen.add(norm(text));
    wrong.push(text);
    if (wrong.length === MCQ_WRONG) break;
  }
  if (wrong.length < MCQ_WRONG) return null;
  return { q, a, wrong, ok: item?.ok === true || item?.ok === false ? item.ok : null };
}

/** One playable question, choices shuffled: { q, choices, correct }. */
export function mcqToQuestion(item, rnd = Math.random) {
  const choices = shuffle([item.a, ...item.wrong.slice(0, MCQ_WRONG)], rnd);
  return { q: item.q, choices, correct: choices.indexOf(item.a) };
}

/** Up to `count` questions from a set, in random order. Invalid items are skipped. */
export function buildMcqQuestions(items, count, rnd = Math.random) {
  const valid = (items || []).map(sanitizeMcqItem).filter(Boolean);
  return shuffle(valid, rnd).slice(0, count).map(item => mcqToQuestion(item, rnd));
}

// ── Firestore ───────────────────────────────────────────────────────────────

const mcqRef = uid => doc(db, 'users', uid, 'data', 'mcq');

/** Live `{ [setKey]: McqItem[] }` of a user; `{}` when there is none yet. */
export function subscribeMcqSets(uid, cb) {
  return onSnapshot(mcqRef(uid), snap => cb(snap.exists() ? (snap.data().sets || {}) : {}), () => cb({}));
}

/** One-off read of every set (the group quiz setup). */
export async function loadMcqSets(uid) {
  const snap = await getDoc(mcqRef(uid));
  return snap.exists() ? (snap.data().sets || {}) : {};
}

/** Replaces one chapter's set; the other chapters are left as they are. */
export function saveMcqSet(uid, setKey, items) {
  const clean = (items || []).map(sanitizeMcqItem).filter(Boolean);
  return setDoc(mcqRef(uid), { sets: { [setKey]: clean } }, { merge: true });
}
