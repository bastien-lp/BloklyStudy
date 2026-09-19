/**
 * Announcing a shared document in a group chat.
 * --------------------------------------------------------------------------
 * Used when a document is shared from outside the chat (Syntheses page).
 * The message has the same base fields as every other chat message written by
 * PageGroups' `send()` — `uid, pseudo, text, sentAt, reactions` — plus
 * `type: 'doc'` and a `doc` summary. The summary is display-only: opening the
 * file always goes through the worker, which re-checks group membership.
 *
 *   groups/{groupId}/messages/{auto} : { …base, type: 'doc',
 *                                        doc: { id, name, kind, size, hasThumb } }
 */

import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

/** The `doc` field of a chat message, from a document returned by the worker. */
export function docMessageSummary(d) {
  return { id: d.id, name: d.name, kind: d.kind, size: d.size, hasThumb: !!d.hasThumb };
}

export async function postDocMessage(groupId, user, pseudo, d) {
  const sentAt = new Date().toISOString();
  await addDoc(collection(db, 'groups', groupId, 'messages'), {
    uid: user.uid, pseudo, text: d.name, sentAt, reactions: {},
    type: 'doc', doc: docMessageSummary(d),
  });
  // Group list preview, as PageGroups' send() does. Best effort.
  updateDoc(doc(db, 'groups', groupId), {
    lastMessage: { uid: user.uid, pseudo, text: d.name, type: 'doc', sentAt },
  }).catch(() => {});
}
