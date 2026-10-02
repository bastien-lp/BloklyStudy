/**
 * AI multiple-choice questions — client for the worker's `POST /ai/quiz`.
 * --------------------------------------------------------------------------
 * Two sources: pasted course notes, or a chapter's flashcards (the card is
 * kept and three plausible wrong answers are added). Nothing is saved here:
 * the student reviews the items, then the caller stores them with
 * lib/mcq.js's saveMcqSet. Shares the daily AI quota of the flashcards.
 *
 * Available only when the worker URL is configured (same as aiFlashcards.js).
 */

import { isAiFlashcardsAvailable } from './aiFlashcards';

const WORKER_URL = (import.meta.env.VITE_CALENDAR_WORKER_URL || '').replace(/\/+$/, '');

/** Most flashcards sent in one request (mirrors MAX_ITEMS in worker/src/aiQuiz.js). */
export const AI_QUIZ_MAX_CARDS = 15;

export const isAiQuizAvailable = isAiFlashcardsAvailable;

/**
 * @param {object} source  `{ text, count }` (notes) or `{ cards: [{ q, a }] }`
 * @returns {Promise<{ items: [{ q, a, wrong, ok: null }], remaining: number }>}
 * Rejects with an Error whose `code` is a worker error code or `network`.
 */
export async function generateAiQuiz(user, source, lang) {
  const payload = source.cards
    ? { cards: source.cards.slice(0, AI_QUIZ_MAX_CARDS).map(c => ({ q: c.q, a: c.a })), lang }
    : { text: source.text, count: source.count, lang };

  let res;
  try {
    const idToken = await user.getIdToken();
    res = await fetch(`${WORKER_URL}/ai/quiz`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw Object.assign(new Error('network'), { code: 'network' });
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(body.error || 'ai_failed'), { code: body.error || 'ai_failed' });
  }
  return {
    items: (body.items || []).map(i => ({ q: i.q, a: i.a, wrong: i.wrong || [], ok: null })),
    remaining: body.remaining,
  };
}
