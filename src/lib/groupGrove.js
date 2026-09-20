/**
 * The group grove — one shared plant per study group, per week.
 * --------------------------------------------------------------------------
 * A LIVE GROUP SESSION is what waters it: minutes worked together, never
 * minutes worked alone. When the group reaches its weekly goal, each member
 * who did their share collects COINS_PER_SHARED_MINUTE per minute they brought
 * plus GOAL_BONUS. The grove then starts again on Monday.
 *
 * That is deliberately worth more than the solo garden: the same minute of a
 * shared session also grows the personal garden (2 coins a minute there), so
 * studying together pays about two and a half times as much as studying alone.
 * It is the one place in the app where the reward is for showing up together.
 *
 * WHY IT IS BUILT THIS WAY (this feature must never break anything else):
 *
 *   - NO SHARED MUTABLE STATE. Each member owns exactly one node,
 *     `groupGroves/{groupId}/{uid}`, and writes only that one. The group total
 *     is the SUM of those nodes, computed when reading. Two members finishing
 *     a session at the same second can therefore never overwrite each other,
 *     and no lock or fan-out write is needed.
 *
 *   - THE REWARD IS PERSONAL. Claiming writes only to the claimer's own
 *     `users/{uid}/data/reserve` document, inside a Firestore transaction, so
 *     a double click or two open tabs cannot pay twice. Nothing about the
 *     group document is ever touched by this feature.
 *
 *   - IT IS ALWAYS OPTIONAL. Every read and every write is wrapped by its
 *     caller: if the Realtime Database rules for `groupGroves` are not
 *     published, reads return nothing and writes fail silently. Banking a
 *     focus session, the chat and the group itself keep working exactly as
 *     before.
 *
 *   - THE GOAL SCALES WITH THE GROUP (GOAL_PER_MEMBER × members), so a big
 *     group is not an easy way to farm coins, and a member must have put in
 *     MIN_SHARE minutes themselves to collect.
 *
 * Stored shape — `groupGroves/{groupId}/{uid}`:
 *   { week: "YYYY-Www", mins: number, pseudo: string, at: ms }
 * A member writing in a new week replaces their own node, so nothing piles up.
 */

import { ref as dbRef, onValue, runTransaction as rtdbTransaction } from 'firebase/database';
import { doc, runTransaction } from 'firebase/firestore';
import { db, rtdb } from '../firebase/config';
import { weekKey } from './dayKeys';

/** Minutes of focus each member is expected to bring in a week. */
export const GOAL_PER_MEMBER = 120;
/** Minutes a member must have contributed themselves to collect the reward. */
export const MIN_SHARE = 30;
/** Coins per minute of SHARED focus, paid when the weekly goal is reached. */
export const COINS_PER_SHARED_MINUTE = 3;
/** Flat bonus on top, for reaching the goal at all. */
export const GOAL_BONUS = 100;
/** Minutes that can be paid for in one week — a cap, never a target. */
const MAX_PAID_MINS = 20 * 60;
/** Sanity cap on one write, so a bad value can never dominate a total. */
const MAX_MINS = 7 * 24 * 60;

const groveRef = groupId => dbRef(rtdb, `groupGroves/${groupId}`);
const myGroveRef = (groupId, uid) => dbRef(rtdb, `groupGroves/${groupId}/${uid}`);

/** The week a grove belongs to — the same ISO week the rest of the app uses. */
export const groveWeek = (now = new Date()) => weekKey(now);

/** The key one reward is remembered under, in the member's own document. */
export const claimKey = (groupId, week) => `${groupId}:${week}`;

/**
 * Live view of a group's grove.
 * @returns an unsubscribe function; `cb` receives the raw entries, or null
 *          when the node cannot be read (rules not published, offline…).
 */
export function subscribeGrove(groupId, cb) {
  if (!groupId) return () => {};
  return onValue(groveRef(groupId), snap => cb(snap.val() || {}), () => cb(null));
}

/**
 * Adds focused minutes to my node of one group's grove.
 * A transaction on my own node makes two devices finishing at the same moment
 * add up instead of overwriting each other, and a node from a past week is
 * replaced rather than added to.
 */
export async function addGroveMinutes(groupId, uid, mins, pseudo = '', now = new Date()) {
  const added = Math.max(0, Math.min(MAX_MINS, Math.round(Number(mins) || 0)));
  if (!groupId || !uid || added === 0) return;
  const week = groveWeek(now);
  await rtdbTransaction(myGroveRef(groupId, uid), current => {
    const sameWeek = current && current.week === week;
    const base = sameWeek ? Math.max(0, Math.min(MAX_MINS, Number(current.mins) || 0)) : 0;
    return {
      week,
      mins: Math.min(MAX_MINS, base + added),
      pseudo: String(pseudo || (sameWeek ? current.pseudo : '') || '').slice(0, 40),
      at: Date.now(),
    };
  });
}

/**
 * What the grove looks like for one group this week. Pure.
 *
 * @param entries    the raw node ({ uid: { week, mins, pseudo } }), or null
 * @param memberIds  the group's CURRENT members: someone who left no longer
 *                   counts, for the goal or for the total
 * @param uid        the reader, to know their own share
 * @param now
 */
export function groveState(entries, memberIds = [], uid = '', now = new Date()) {
  const week = groveWeek(now);
  const members = Array.isArray(memberIds) && memberIds.length ? memberIds : (uid ? [uid] : []);
  const rows = Object.entries(entries || {})
    .filter(([id, e]) => e && e.week === week && members.includes(id))
    .map(([id, e]) => ({
      uid: id,
      mins: Math.max(0, Math.min(MAX_MINS, Number(e.mins) || 0)),
      pseudo: typeof e.pseudo === 'string' ? e.pseudo : '',
    }))
    .filter(r => r.mins > 0)
    .sort((a, b) => b.mins - a.mins);

  const total = rows.reduce((n, r) => n + r.mins, 0);
  const goal = Math.max(GOAL_PER_MEMBER, members.length * GOAL_PER_MEMBER);
  const myMins = rows.find(r => r.uid === uid)?.mins || 0;

  return {
    week,
    total,
    goal,
    pct: goal ? Math.min(100, Math.round((total / goal) * 100)) : 0,
    reached: total >= goal,
    contributors: rows,
    myMins,
    myShare: MIN_SHARE,
    memberCount: members.length,
    /** How far this member still is from their own share. */
    missingForMe: Math.max(0, MIN_SHARE - myMins),
  };
}

/**
 * What collecting would pay this member. Pure.
 * @returns {{ mins, perMinute, bonus, coins }}
 */
export function groveReward(myMins) {
  const mins = Math.max(0, Math.min(MAX_PAID_MINS, Math.round(Number(myMins) || 0)));
  return {
    mins,
    perMinute: COINS_PER_SHARED_MINUTE,
    bonus: GOAL_BONUS,
    coins: mins * COINS_PER_SHARED_MINUTE + GOAL_BONUS,
  };
}

/** Whether this member may collect this week's reward. Pure. */
export function canClaimGrove(state, claims = {}, groupId = '') {
  if (!state?.reached) return false;
  if (state.myMins < MIN_SHARE) return false;
  return !claims[claimKey(groupId, state.week)];
}

/** Claims older than the previous week are dropped: the map cannot grow forever. */
function pruneClaims(claims = {}, week, previousWeek) {
  const kept = {};
  for (const [key, value] of Object.entries(claims)) {
    if (key.endsWith(`:${week}`) || key.endsWith(`:${previousWeek}`)) kept[key] = value;
  }
  return kept;
}

/**
 * Pays this week's reward into the member's own reserve document.
 * The transaction re-reads the document, so the reward is paid AT MOST ONCE
 * per group and per week, whatever happens on the screen.
 *
 * The grove being reached is checked on the screen, not here: coins are a
 * cosmetic currency of the garden, exactly like the XP the app already trusts
 * the client for. What this function does guarantee is that the reward is
 * never paid twice.
 *
 * @param myMins the member's own minutes this week, from the grove
 * @returns the coins actually paid (0 when it was already collected)
 */
export async function claimGroveReward(uid, groupId, myMins = 0, now = new Date()) {
  if (!uid || !groupId) return 0;
  const week = groveWeek(now);
  const previous = groveWeek(new Date(now.getTime() - 7 * 86_400_000));
  const key = claimKey(groupId, week);
  const ref = doc(db, 'users', uid, 'data', 'reserve');
  let paid = 0;

  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : {};
    const claims = data.groveClaims || {};
    if (claims[key]) { paid = 0; return; }
    paid = groveReward(myMins).coins;
    tx.set(ref, {
      coins: (Number(data.coins) || 0) + paid,
      groveClaims: { ...pruneClaims(claims, week, previous), [key]: true },
    }, { merge: true });
  });

  return paid;
}
