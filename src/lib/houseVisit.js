/**
 * Visiting someone else's house.
 * --------------------------------------------------------------------------
 * A house is decorated in the Réserve and stored in `users/{uid}/data/reserve`
 * (`rooms` and `unlockedRooms`). Visiting only ever READS that document: a
 * visitor can look, never move anything.
 *
 * WHO MAY LOOK is the owner's call, kept with their other privacy settings in
 * `main.profile.privacy.house`:
 *   'all'     — anyone signed in
 *   'friends' — only the people in their friends list (the default, because a
 *               room someone decorated is personal and a new setting should
 *               not open it wider than the student expects)
 *   'none'    — nobody
 *
 * The check below is what the screen uses; the Firestore rules are what
 * actually enforce it. Both have to agree, which is why the decision lives in
 * one function rather than inline in a component.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

/** The three answers, in the order the picker shows them. */
export const HOUSE_VISIBILITY = ['all', 'friends', 'none'];
export const DEFAULT_HOUSE_VISIBILITY = 'friends';

/** The setting an account carries, whatever shape the document is in. */
export function houseVisibility(mainData) {
  const value = mainData?.profile?.privacy?.house;
  return HOUSE_VISIBILITY.includes(value) ? value : DEFAULT_HOUSE_VISIBILITY;
}

/**
 * Whether this visitor may open that house.
 * @param {object} p  { visibility, isFriend, isSelf }
 */
export function canVisitHouse({ visibility, isFriend = false, isSelf = false } = {}) {
  if (isSelf) return true;                       // your own house is always yours
  const setting = HOUSE_VISIBILITY.includes(visibility) ? visibility : DEFAULT_HOUSE_VISIBILITY;
  if (setting === 'all') return true;
  if (setting === 'friends') return !!isFriend;
  return false;
}

/** Why a house cannot be opened, for the message to show. */
export function visitDenialReason({ visibility, isFriend = false, isSelf = false } = {}) {
  if (canVisitHouse({ visibility, isFriend, isSelf })) return null;
  const setting = HOUSE_VISIBILITY.includes(visibility) ? visibility : DEFAULT_HOUSE_VISIBILITY;
  return setting === 'friends' ? 'friendsOnly' : 'closed';
}

const asObject = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/**
 * One account's house, cleaned up for display.
 * @returns {{ rooms: object, unlocked: string[] }}
 * @throws  when the document cannot be read (rules, offline) — the caller
 *          shows that as "not available", never as an empty house, so a
 *          missing permission is never mistaken for an empty room.
 */
export async function loadHouse(uid) {
  const snap = await getDoc(doc(db, 'users', uid, 'data', 'reserve'));
  const data = snap.exists() ? snap.data() : {};
  const rooms = asObject(data.rooms);
  const unlocked = Array.isArray(data.unlockedRooms) && data.unlockedRooms.length
    ? data.unlockedRooms.filter(id => typeof id === 'string')
    : ['piece'];
  return {
    rooms: Object.fromEntries(Object.entries(rooms).map(([id, room]) => [
      id,
      { placedItems: Array.isArray(room?.placedItems) ? room.placedItems.filter(p => p && p.itemId) : [] },
    ])),
    unlocked,
  };
}

/** How many pieces of furniture a house holds, all rooms together. */
export function houseSize(house) {
  return Object.values(house?.rooms || {}).reduce((n, room) => n + (room.placedItems?.length || 0), 0);
}
