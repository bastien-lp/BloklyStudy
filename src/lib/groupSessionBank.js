/**
 * Banking my share of a live group session.
 * --------------------------------------------------------------------------
 * Called from two places — when the session ends (by the app-wide engine) and
 * when I leave it early (from the Groups page) — so both credit time the same
 * way and neither can double-credit.
 *
 * The XP is pro-rata: only the work time I was actually present for, run
 * through the ordinary `bankFocusSession` path so streak, level, leaves and
 * leaderboard all behave exactly as they do after a solo session.
 */

import { bankFocusSession, computeXP } from './focusBank';
import { leaveSession } from './groupSession';
import { setMembership, wasCredited, markCredited } from '../focus/groupFocus';
import { playChime } from './chime';
import { notify } from './notify';

/**
 * Credit and clear my membership. Safe to call more than once: the session id
 * is remembered, so a second call is a no-op.
 *
 * @param {string} uid
 * @param {object} membership  { groupId, sessionId, focusMs }
 * @param {object} [opts]      { chime = true }
 * @returns {Promise<number>}  the XP credited (0 if under a minute)
 */
export async function bankMyGroupSession(uid, membership, { chime = true } = {}) {
  if (!uid || !membership) return 0;
  if (wasCredited(membership.sessionId)) {
    setMembership(null);
    return 0;
  }
  markCredited(membership.sessionId);

  const secs = Math.floor((membership.focusMs || 0) / 1000);
  const xp = computeXP(secs);

  try {
    if (xp > 0) {
      await bankFocusSession(uid, secs, xp, { subjId: '', mode: 'group', context: 'Group session' });
      if (chime) playChime(0.6);
      notify('groups.sessionBanked', 'success');
    }
    await leaveSession(membership.groupId, uid).catch(() => {});
  } finally {
    setMembership(null);
  }
  return xp;
}
