/**
 * Shared rules for decks of flashcards exchanged in group chats.
 * --------------------------------------------------------------------------
 * Kept out of the component file so both the UI and the page import the same
 * definitions (and so the component file only exports components).
 */

/**
 * A conversation message is one Firestore document, capped at 1 MiB, and a
 * hundred-card wall of text helps nobody read the chat either.
 */
export const MAX_DECK_CARDS = 60;

/**
 * Identity of a card for duplicate detection: question + answer, with case
 * and surrounding spacing ignored, so a re-typed card still counts as the
 * same one.
 */
export function cardKey(card) {
  return `${(card?.q || '').trim().toLowerCase()}|${(card?.a || '').trim().toLowerCase()}`;
}
