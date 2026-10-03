/**
 * Friend requests — send, accept, decline, and watch the incoming ones.
 * --------------------------------------------------------------------------
 * Lifted out of PageProfile so the profile, a user's profile card, the Groups
 * page and the app-wide alert all do exactly the same writes. The shapes are
 * unchanged:
 *   friendRequests/{toUid}/requests/{fromUid} : { from, fromPseudo, to, toPseudo, sentAt, status: 'pending' }
 *   friends/{uid}/list/{otherUid}             : { uid, pseudo, addedAt }   (both sides)
 *
 * Sending also asks the worker to notify the recipient (lib/notifications.js);
 * that part is best-effort and never blocks the request itself.
 */

import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { notifyUser } from './notifications';

const myPseudoOf = user => user.displayName || user.email?.split('@')[0] || 'Anonyme';

export async function sendFriendRequest(user, toUid, toPseudo) {
  await setDoc(doc(db, 'friendRequests', toUid, 'requests', user.uid), {
    from: user.uid, fromPseudo: myPseudoOf(user), to: toUid, toPseudo,
    sentAt: new Date().toISOString(), status: 'pending',
  });
  notifyUser(user, { kind: 'friendRequest', toUid });
}

export async function acceptFriendRequest(user, req) {
  const addedAt = new Date().toISOString();
  await setDoc(doc(db, 'friends', user.uid, 'list', req.from), { uid: req.from, pseudo: req.fromPseudo, addedAt });
  await setDoc(doc(db, 'friends', req.from, 'list', user.uid), { uid: user.uid, pseudo: myPseudoOf(user), addedAt });
  await deleteDoc(doc(db, 'friendRequests', user.uid, 'requests', req.id));
}

export function declineFriendRequest(user, reqId) {
  return deleteDoc(doc(db, 'friendRequests', user.uid, 'requests', reqId));
}

/** Live list of my incoming requests, newest first: [{ id, from, fromPseudo, sentAt, … }]. */
export function subscribeFriendRequests(user, cb) {
  return onSnapshot(collection(db, 'friendRequests', user.uid, 'requests'),
    snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)))),
    () => cb([]));
}
