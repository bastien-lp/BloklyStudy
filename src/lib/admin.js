/**
 * Who is an administrator.
 * --------------------------------------------------------------------------
 * The single source of truth on the client, kept in step with the Firestore
 * and Realtime Database rules — which are the ones that actually enforce it.
 * This list only decides what the UI offers: showing a button to someone the
 * rules will refuse is how you get writes that fail in silence.
 */

/** Accounts allowed into the developer panel and admin-only surfaces. */
export const ADMIN_UIDS = ['VgHygV4pt5Qq7hL6yYQfXA0yql02'];

/** True when this signed-in user is an administrator. */
export function isAdmin(user) {
  return !!user?.uid && ADMIN_UIDS.includes(user.uid);
}
