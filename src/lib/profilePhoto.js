/**
 * Profile photos — upload, removal and propagation.
 * --------------------------------------------------------------------------
 * WHAT WAS BROKEN:
 *   1. The raw file (up to 500 KB, as base64) was passed to Firebase Auth's
 *      `updateProfile({ photoURL })`. Auth rejects URLs that long, so the call
 *      threw and the Firestore write after it never ran: uploads failed for
 *      almost every real photo.
 *   2. The profile page and the top bar read `user.photoURL` (Auth), never the
 *      Firestore copy, so even a saved photo vanished on reload.
 *   3. Groups copied `user.photoURL` into the member entry at join time, and
 *      friend entries never got a photo, so other people never saw it.
 *
 * NOW: the image is center-cropped and downscaled in the browser to a
 * 192 px JPEG (~10 KB) and stored as a data URL in the existing field
 * `users/{uid}/data/main.photoURL` — same field, same type (string), just
 * small. Auth is no longer touched. The new value is then copied, best
 * effort, into the places other people read it from: my entry in each of my
 * groups (`groups/{id}.members.{uid}.photoURL`, an existing field) and my
 * entry in each friend's list (`friends/{friendUid}/list/{uid}.photoURL`,
 * which the friends UI already reads).
 */

import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { resizeImage, blobToDataURL } from './imageResize';

const AVATAR_SIZE = 192;
/** Input limit: the file is shrunk anyway, this only rejects absurd files. */
export const MAX_PHOTO_INPUT_BYTES = 15 * 1024 * 1024;
/** Safety net on the stored value (a 192 px JPEG is normally ~10 KB). */
const MAX_STORED_CHARS = 80_000;

/**
 * The photo to show for the signed-in user.
 * A photo they uploaded wins; otherwise the account picture from Auth (a
 * Google avatar, typically) is used. Removing an uploaded photo therefore
 * falls back to the Google one rather than to initials — which is what someone
 * signed in with Google expects to see.
 */
export function resolveOwnPhoto(mainData, user) {
  return mainData?.photoURL || user?.photoURL || null;
}

/**
 * Copies the Google account picture into the account the first time it is
 * seen, so OTHER people get it too: the profile card, the groups and the
 * friends list all read the stored field, never Auth.
 *
 * Does nothing when a photo is already stored, and never throws — it runs on
 * sign-in, where a failure must stay invisible.
 *
 * @returns the photo now stored, or null when there was nothing to copy
 */
export async function adoptAccountPhoto(uid, mainData, user) {
  const stored = mainData?.photoURL;
  const fromAuth = user?.photoURL;
  if (!uid || stored || !fromAuth) return null;
  if (String(fromAuth).length > MAX_STORED_CHARS) return null;   // a URL, never a data blob
  try {
    await saveProfilePhoto(uid, fromAuth);
    return fromAuth;
  } catch {
    return null;                                                  // offline, rules, whatever
  }
}

/** Error with a `code`: 'not_image' | 'too_large' | 'unreadable'. */
function photoError(code) {
  return Object.assign(new Error(code), { code });
}

/** Turns a picked file into a small JPEG data URL. */
export async function fileToAvatarDataURL(file) {
  if (!file.type.startsWith('image/')) throw photoError('not_image');
  if (file.size > MAX_PHOTO_INPUT_BYTES) throw photoError('too_large');

  let dataURL;
  try {
    dataURL = await blobToDataURL(await resizeImage(file, { maxSize: AVATAR_SIZE, square: true, quality: 0.85 }));
    if (dataURL.length > MAX_STORED_CHARS) {
      dataURL = await blobToDataURL(await resizeImage(file, { maxSize: AVATAR_SIZE, square: true, quality: 0.6 }));
    }
  } catch {
    throw photoError('unreadable');
  }
  if (dataURL.length > MAX_STORED_CHARS) throw photoError('too_large');
  return dataURL;
}

/**
 * Saves `photoURL` (a data URL, or null to remove it) on my account, then
 * copies it to my group memberships and friend entries. The account write
 * must succeed; the copies are best effort and never throw.
 */
export async function saveProfilePhoto(uid, photoURL) {
  await updateDoc(doc(db, 'users', uid, 'data', 'main'), { photoURL });
  await propagatePhoto(uid, photoURL);
}

async function propagatePhoto(uid, photoURL) {
  const writes = [];
  try {
    const groups = await getDocs(query(collection(db, 'groups'), where('memberIds', 'array-contains', uid)));
    groups.forEach(g => {
      if (g.data().members?.[uid]) {
        writes.push(updateDoc(g.ref, { [`members.${uid}.photoURL`]: photoURL }));
      }
    });
  } catch { /* groups unreadable: skip */ }
  try {
    const friends = await getDocs(collection(db, 'friends', uid, 'list'));
    friends.forEach(f => {
      writes.push(updateDoc(doc(db, 'friends', f.id, 'list', uid), { photoURL }));
    });
  } catch { /* friends unreadable: skip */ }
  await Promise.allSettled(writes);
}
