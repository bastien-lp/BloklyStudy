/**
 * GroupSessionEngine — keeps the joined group session alive app-wide.
 * --------------------------------------------------------------------------
 * Renders nothing. Mounted once in AppPage, above the lazily-loaded tabs, for
 * one reason: the Groups tab unmounts as soon as the user switches away, and a
 * shared session must not stop counting because someone opened their planner.
 *
 * What it owns:
 *   - the subscription to the joined session and its participants,
 *   - the accrual of MY focused time (work phases only), which is what the
 *     pro-rata XP is computed from,
 *   - a heartbeat so the others see me as present and see my focus time,
 *   - the chime at every phase change,
 *   - banking the XP once, when the session ends.
 *
 * The countdown itself is never stored or received: it is derived from the
 * session's absolute timestamps against the shared server clock, so every
 * participant's screen shows the same second (see `lib/groupSession.js`).
 */

import { useEffect, useRef, useState } from 'react';
import {
  getMembership, addFocusMs, setSnapshot, subscribeGroupFocus,
} from '../focus/groupFocus';
import { subscribeSession, subscribeParticipants, phaseAt, heartbeat } from '../lib/groupSession';
import { startServerClock, serverNow } from '../lib/serverClock';
import { bankMyGroupSession } from '../lib/groupSessionBank';
import { playChime } from '../lib/chime';

/** How often I publish my focus time to the others. */
const HEARTBEAT_MS = 30000;

export function GroupSessionEngine({ user }) {
  // Which group I am joined to drives the subscriptions, so it has to be state
  // (a ref would never re-run the effect below). Everything the one-second tick
  // reads lives in refs, so the tick itself never depends on a re-render.
  const [groupId, setGroupId] = useState(() => getMembership()?.groupId || null);
  const membershipRef = useRef(getMembership());
  const sessionRef = useRef(null);
  const lastTickRef = useRef(serverNow());
  const lastPhaseRef = useRef(null);
  const lastBeatRef = useRef(0);
  const bankingRef = useRef(false);
  const sessionLoadedRef = useRef(false);

  useEffect(() => { startServerClock(); }, []);

  // Track membership changes (join / leave happen from the Groups page).
  useEffect(() => subscribeGroupFocus(m => {
    const changed = m?.sessionId !== membershipRef.current?.sessionId;
    membershipRef.current = m;
    if (changed) {
      // A fresh session: reset the per-session tick bookkeeping.
      lastTickRef.current = serverNow();
      lastPhaseRef.current = null;
      lastBeatRef.current = 0;
      if (!m) sessionRef.current = null;
      setGroupId(m?.groupId || null);
    }
  }), []);

  // Subscribe to the joined session + its participants. Re-runs whenever the
  // joined group changes; a membership of null tears the listeners down.
  useEffect(() => {
    if (!groupId) return;
    sessionLoadedRef.current = false;
    const offSession = subscribeSession(groupId, s => {
      // A null here is a real answer from the server ("no session"), not the
      // initial unknown — which is what lets the tick below tell the two apart.
      sessionLoadedRef.current = true;
      sessionRef.current = s;
      setSnapshot({ session: s });
    });
    const offParts = subscribeParticipants(groupId, p => setSnapshot({ participants: p }));
    return () => { offSession(); offParts(); };
  }, [groupId]);

  // The one-second heartbeat of the whole feature.
  useEffect(() => {
    const id = setInterval(() => {
      const now = serverNow();
      const delta = Math.max(0, now - lastTickRef.current);
      lastTickRef.current = now;

      const m = membershipRef.current;
      const session = sessionRef.current;
      if (!m || !user) return;

      if (!session) {
        // The host cancelled or cleared the session: bank whatever was earned
        // and let go of the membership, so it cannot linger in localStorage.
        if (sessionLoadedRef.current && !bankingRef.current) {
          bankingRef.current = true;
          bankMyGroupSession(user.uid, m).finally(() => { bankingRef.current = false; });
        }
        // Otherwise the record simply has not arrived yet: wait for it rather
        // than crediting time against a session we know nothing about.
        return;
      }

      const { phase, round } = phaseAt(session, now);
      const paused = !!session.pausedAt;

      // Accrue only real work time, and never more than the tick that elapsed —
      // a machine waking from sleep must not gift an hour of focus.
      if (phase === 'work' && !paused && !session.endedAt) {
        addFocusMs(Math.min(delta, 2000));
      }

      // Chime on every phase boundary (but not on the very first observation,
      // which would fire a chime just for opening the app).
      const phaseKey = `${phase}-${round}`;
      if (lastPhaseRef.current && lastPhaseRef.current !== phaseKey && phase !== 'done') {
        playChime(0.5);
      }
      lastPhaseRef.current = phaseKey;

      // Publish my presence + focus time periodically.
      if (now - lastBeatRef.current > HEARTBEAT_MS && phase !== 'done') {
        lastBeatRef.current = now;
        heartbeat(m.groupId, user.uid, m.focusMs || 0).catch(() => {});
      }

      // Finished (programme over, or the host ended it): credit my pro-rata
      // share exactly once, then drop the membership. `bankMyGroupSession`
      // guards against a double credit too; the ref stops a second call while
      // the first one is still in flight.
      if (phase === 'done' && !bankingRef.current) {
        bankingRef.current = true;
        bankMyGroupSession(user.uid, m).finally(() => { bankingRef.current = false; });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [user]);

  return null;
}
