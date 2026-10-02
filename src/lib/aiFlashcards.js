/**
 * AI flashcard generation — client for the worker's `POST /ai/flashcards`.
 * --------------------------------------------------------------------------
 * The student pastes course notes; the Cloudflare worker (the same one as the
 * external calendars, `VITE_CALENDAR_WORKER_URL`) runs them through Workers AI
 * and returns `{ q, a }` pairs. Nothing is saved here: the caller reviews the
 * cards and stores them through the ordinary flashcard save path, as
 * `{ q, a, ok: null }` — the exact shape of a manually added card.
 *
 * The feature is hidden when no worker URL is configured, so builds without a
 * deployed worker look exactly as before.
 */

const WORKER_URL = (import.meta.env.VITE_CALENDAR_WORKER_URL || '').replace(/\/+$/, '');

/** Limits mirrored from worker/src/ai.js (the worker enforces them). */
export const AI_MIN_TEXT_CHARS = 150;
export const AI_MAX_TEXT_CHARS = 8000;
export const AI_CARD_COUNTS = [5, 8, 12, 15];

export const isAiFlashcardsAvailable = () => Boolean(WORKER_URL);

/**
 * Today's AI budget, shared by every AI generation (flashcards, QCM, PDF):
 * resolves to `{ limit, remaining }`, or null when it cannot be read (no
 * worker, offline, older worker). Reading it does not use the quota.
 */
export async function fetchAiQuota(user) {
  if (!WORKER_URL || !user) return null;
  try {
    const idToken = await user.getIdToken();
    const res = await fetch(`${WORKER_URL}/ai/quota`, { headers: { Authorization: `Bearer ${idToken}` } });
    if (!res.ok) return null;
    const body = await res.json();
    return Number.isFinite(body.limit) && Number.isFinite(body.remaining) ? body : null;
  } catch {
    return null;
  }
}

/**
 * Resolves to `{ cards: [{ q, a, ok: null }], remaining }`.
 * Rejects with an Error whose `code` is one of the worker's error codes
 * (daily_limit, text_too_short, ai_busy, …) or `network`.
 */
export async function generateAiFlashcards(user, { text, count, lang }) {
  let res;
  try {
    const idToken = await user.getIdToken();
    res = await fetch(`${WORKER_URL}/ai/flashcards`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, count, lang }),
    });
  } catch {
    throw Object.assign(new Error('network'), { code: 'network' });
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(body.error || 'ai_failed'), { code: body.error || 'ai_failed' });
  }
  return {
    cards: (body.cards || []).map(c => ({ q: c.q, a: c.a, ok: null })),
    remaining: body.remaining,
  };
}
