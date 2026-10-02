/**
 * Private conversations — the id rule and the one way to post a message.
 * --------------------------------------------------------------------------
 * DMs live in `privateMessages/{convId}/messages`, where convId is the two
 * participants' uids sorted and joined with an underscore. Nothing about that
 * shape changes here; it is only lifted out of PageGroups so the admin tool
 * writes into exactly the same place, with exactly the same fields, as the
 * chat window. Two implementations of `convIdFor` that disagreed by a sort
 * would silently file messages in a conversation nobody reads.
 *
 * Firestore rules are what actually decide who may write where; this module
 * only builds the request.
 */

import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Deterministic convId: always the same for a pair of users, whichever of the
 * two is asking. Firestore rules expect the format uidA_uidB.
 */
export function convIdFor(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
}

/**
 * Post one message into a private conversation.
 *
 * The document shape is the one PrivateChat writes and reads — uid, pseudo,
 * text, sentAt, reactions — so a message sent from anywhere is an ordinary
 * message of that conversation, with nothing marking it apart.
 *
 * @param {object} p
 * @param {string} p.fromUid     author's uid
 * @param {string} p.fromPseudo  author's display name, as stored on the message
 * @param {string} p.toUid       recipient's uid
 * @param {string} p.text        body; trimmed, and an empty body is refused
 * @returns {Promise<string>} the conversation id the message landed in
 * @throws when a participant is missing, the body is empty, or the write is
 *         refused — callers are expected to surface that, never swallow it.
 */
export async function sendPrivateMessage({ fromUid, fromPseudo, toUid, text }) {
  const body = (text || '').trim();
  if (!fromUid || !toUid) throw new Error('sendPrivateMessage: both participants are required');
  if (fromUid === toUid) throw new Error('sendPrivateMessage: cannot message yourself');
  if (!body) throw new Error('sendPrivateMessage: empty message');

  const convId = convIdFor(fromUid, toUid);
  await addDoc(collection(db, 'privateMessages', convId, 'messages'), {
    uid: fromUid,
    pseudo: fromPseudo || '',
    text: body,
    sentAt: new Date().toISOString(),
    reactions: {},
  });
  return convId;
}
