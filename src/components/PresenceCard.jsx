/**
 * PresenceCard — "Blokly right now" (Stats page).
 * --------------------------------------------------------------------------
 * Who is studying at this very moment, read live from the Realtime Database
 * `presence` node (see lib/presence.js). Only students who left "show me
 * online" on are in there, so being listed is always a choice.
 *
 * The avatars used to be coloured circles with A, B, C in them — placeholders
 * that told you nothing. They now show the real profile photos, read from
 * `users/{uid}/data/main.photoURL`, the same field the profile modal reads.
 * To keep that cheap:
 *   - at most AVATAR_LIMIT photos are ever fetched (the rest become a "…"),
 *   - each account is fetched once per session (module-level cache),
 *   - an account without a photo keeps the initial-on-colour avatar.
 *
 * Clicking someone opens their profile, like in the leaderboard.
 *
 * Props: { user, onOpenConv }
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ref as dbRef, onValue } from 'firebase/database';
import { collection, doc, getDoc, getCountFromServer } from 'firebase/firestore';
import { Users, UserRound, GraduationCap } from 'lucide-react';
import { db, rtdb } from '../firebase/config';
import { useTranslation } from '../i18n';
import UserProfileModal from './UserProfileModal';

/** How many faces are shown before the row ends with a "…". */
const AVATAR_LIMIT = 10;
const AVATAR_SIZE = 38;

/** uid → { pseudo, photoURL }, kept for the whole session: profiles barely move. */
const profileCache = new Map();

/** Deterministic avatar colour — the same formula the rest of the app uses. */
const avatarHue = uid => (uid?.charCodeAt(0) * 47 || 0) % 360;

function Avatar({ uid, profile, isMe, index, label, onClick }) {
  const photo = profile?.photoURL;
  const hue = avatarHue(uid);
  const common = {
    width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: '50%', flexShrink: 0,
    marginLeft: index > 0 ? -10 : 0,
    boxShadow: isMe
      ? '0 0 0 2px var(--bg-card), 0 0 0 4px var(--accent)'
      : '0 0 0 2px var(--bg-card)',
  };
  return (
    <motion.button type="button" onClick={onClick} title={label} aria-label={label}
      initial={{ opacity: 0, scale: .6 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: Math.min(index, 9) * .05, duration: .25, ease: 'easeOut' }}
      whileHover={{ y: -3, zIndex: 2 }} whileTap={{ scale: .94 }}
      style={{ border: 'none', padding: 0, background: 'transparent', cursor: 'pointer',
        position: 'relative', zIndex: 1, display: 'block' }}>
      {photo ? (
        <img src={photo} alt="" style={{ ...common, objectFit: 'cover', display: 'block' }} />
      ) : (
        <span style={{ ...common, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: AVATAR_SIZE * 0.4, fontWeight: 700, color: '#fff',
          background: `linear-gradient(150deg, hsl(${hue},62%,58%), hsl(${hue},58%,42%))` }}>
          {(profile?.pseudo || '?')[0].toUpperCase()}
        </span>
      )}
    </motion.button>
  );
}

export default function PresenceCard({ user, onOpenConv }) {
  const { t } = useTranslation();
  const [uids, setUids] = useState([]);
  // uid → { pseudo, photoURL }; seeded from the session cache on mount.
  const [profiles, setProfiles] = useState(() => Object.fromEntries(profileCache));
  const [totalUsers, setTotalUsers] = useState(0);
  const [viewUid, setViewUid] = useState(null);

  // ── Who is online ──
  useEffect(() => {
    const unsub = onValue(dbRef(rtdb, 'presence'), snap => {
      const entries = Object.values(snap.val() || {}).filter(e => e && e.uid);
      // Longest-running session first; me always in front of the row.
      entries.sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
      const list = entries.map(e => e.uid);
      const mine = list.filter(uid => uid === user?.uid);
      setUids([...mine, ...list.filter(uid => uid !== user?.uid)]);
    }, () => {});
    return () => unsub();
  }, [user?.uid]);

  // ── How many accounts exist (one billed read, not the whole collection) ──
  useEffect(() => {
    getCountFromServer(collection(db, 'leaderboard'))
      .then(snap => setTotalUsers(snap.data().count))
      .catch(() => {});
  }, []);

  // ── Their photos, for the faces actually shown ──
  useEffect(() => {
    const wanted = uids.slice(0, AVATAR_LIMIT).filter(uid => !profileCache.has(uid));
    if (wanted.length === 0) return undefined;
    let alive = true;
    Promise.allSettled(wanted.map(uid => getDoc(doc(db, 'users', uid, 'data', 'main'))))
      .then(results => {
        const fetched = {};
        results.forEach((res, i) => {
          const uid = wanted[i];
          const d = res.status === 'fulfilled' && res.value.exists() ? res.value.data() : {};
          const entry = { pseudo: d.profile?.pseudo || '', photoURL: d.photoURL || null };
          profileCache.set(uid, entry);
          fetched[uid] = entry;
        });
        if (alive) setProfiles(p => ({ ...p, ...fetched }));
      });
    return () => { alive = false; };
  }, [uids]);

  const online = uids.length;
  const others = uids.filter(uid => uid !== user?.uid).length;
  const shown = uids.slice(0, AVATAR_LIMIT);
  const hidden = online - shown.length;

  return (
    <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.3rem 1.4rem' }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 14px' }}>
        <Users size={16} strokeWidth={2.2} aria-hidden="true" style={{ color: 'var(--accent)' }} />
        {t('stats.presenceTitle')}
      </h2>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          {others > 0 ? (
            <>
              <div style={{ fontSize: '1.9rem', fontWeight: 900, color: 'var(--success, #27AE60)', lineHeight: 1 }}>{online}</div>
              <div style={{ fontSize: '.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>{t('stats.onlineText', { count: online })}</div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '.82rem', color: 'var(--text-muted)' }}>
              <UserRound size={15} aria-hidden="true" />
              {t('stats.aloneNow')}
            </div>
          )}
          {totalUsers > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 8 }}>
              <GraduationCap size={13} aria-hidden="true" />
              {t('stats.totalUsers', { count: totalUsers })}
            </div>
          )}
        </div>

        {others > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
            {shown.map((uid, i) => {
              const profile = profiles[uid] || profileCache.get(uid);
              const isMe = uid === user?.uid;
              const name = isMe ? t('stats.youBadge') : (profile?.pseudo || t('stats.anon'));
              return (
                <Avatar key={uid} uid={uid} profile={profile} isMe={isMe} index={i} label={name}
                  onClick={() => !isMe && setViewUid({ uid, pseudo: profile?.pseudo || t('stats.anon') })} />
              );
            })}
            {hidden > 0 && (
              <span title={t('stats.onlineMore', { count: hidden })} aria-label={t('stats.onlineMore', { count: hidden })}
                style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: '50%', marginLeft: -10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--bg-card-hover)', boxShadow: '0 0 0 2px var(--bg-card)',
                  color: 'var(--text-muted)', fontSize: '1rem', fontWeight: 800, letterSpacing: '.05em' }}>
                …
              </span>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {viewUid && (
          <UserProfileModal targetUid={viewUid.uid} targetPseudo={viewUid.pseudo} online
            user={user} onOpenConv={onOpenConv} onClose={() => setViewUid(null)} />
        )}
      </AnimatePresence>
    </section>
  );
}
