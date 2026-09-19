/**
 * Adding flashcards to a chapter from outside the Flashcards page.
 * --------------------------------------------------------------------------
 * Cards live at `users/{uid}/data/main.flashcards["<subjectId>_<chapterIndex>"]`
 * as `[{ q, a, ok }]` — unchanged. This helper appends with `arrayUnion` on
 * that one bucket (a FieldPath, since the key starts with a digit), so it
 * never rewrites the rest of the deck and cannot clobber a change made at the
 * same moment elsewhere. Cards already in the bucket (same question + answer,
 * see `cardKey`) are skipped.
 */

import { arrayUnion, doc, FieldPath, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { cardKey } from './flashcardDeck';

/** Resolves to the number of cards actually added. */
export async function appendFlashcards(uid, subjectId, chapterIdx, cards) {
  const ref = doc(db, 'users', uid, 'data', 'main');
  const bucket = `${subjectId}_${chapterIdx}`;
  const snap = await getDoc(ref);
  const existing = new Set((snap.data()?.flashcards?.[bucket] || []).map(cardKey));
  const fresh = cards
    .map(c => ({ q: String(c.q || '').trim(), a: String(c.a || '').trim(), ok: null }))
    .filter(c => c.q && c.a && !existing.has(cardKey(c)));
  if (!fresh.length) return 0;
  await updateDoc(ref, new FieldPath('flashcards', bucket), arrayUnion(...fresh));
  return fresh.length;
}
