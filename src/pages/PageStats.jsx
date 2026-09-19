/**
 * PageStats — Personal stats, badges, presence and leaderboard
 * --------------------------------------------------------------------------
 * Reads `users/{uid}/data/main` for the player's XP/level/streak/focus and
 * subject counters, the realtime `presence` node for who's online, and the
 * `leaderboard` collection for rankings.
 *
 * SCALABILITY NOTE: the leaderboard and the total-users count read the whole
 * `leaderboard` collection client-side. That's fine at the current scale; at
 * large scale this should move to an `orderBy(...).limit(20)` query (plus a
 * maintained counter for the total). To keep behavior identical we still read
 * everything, but we now fetch it ONCE and derive the three tabs in memory
 * instead of refetching on every tab switch.
 *
 * Props: { user, onOpenConv }
 */

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, getDoc, onSnapshot, collection, getDocs, getCountFromServer, query, orderBy, limit, where } from 'firebase/firestore';
import { db, rtdb } from '../firebase/config';
import { ref as dbRef, onValue } from 'firebase/database';
import UserProfileModal from '../components/UserProfileModal';
import { BADGES } from '../data/badges';
import { XP_LEVELS } from '../data/levels';
import { useTranslation } from '../i18n';
import { Zap, Crown, Medal } from 'lucide-react';
import { GuidedTour, useGuidedTour, TourButton } from '../components/GuidedTour';
import { dayKey, weekKey } from '../lib/dayKeys';
import { reportSaveError } from '../lib/notify';
import { resolveOwnPhoto } from '../lib/profilePhoto';




// Podium metals. Small tinted accents rather than full backgrounds, so they
// stay readable whatever theme the player picked.
const PODIUM = [
  { metal: '#E3B341', height: 118 },  // 1st
  { metal: '#AEB7C2', height: 92 },   // 2nd
  { metal: '#C98A5B', height: 74 },   // 3rd
];

/** Deterministic avatar colour — same formula as before, so nobody's colour moves. */
const avatarHue = uid => (uid?.charCodeAt(0) * 47 || 0) % 360;

/**
 * A player's round avatar, with an accent ring when it's the current user.
 * `photoURL` is only known for the current user (read from their own main
 * document); `leaderboard/{uid}` docs carry no photo, so others get initials.
 */
function PlayerAvatar({ uid, pseudo, size, isMe, ring, photoURL }) {
  const hue = avatarHue(uid);
  const shadow = isMe
    ? '0 0 0 2px var(--accent), 0 0 12px var(--accent-glow)'
    : ring ? `0 0 0 2px ${ring}` : 'none';
  if (photoURL) {
    return (
      <img src={photoURL} alt="" style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0,
        objectFit: 'cover', display: 'block', boxShadow: shadow }} />
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.42, fontWeight: 700, color: '#fff',
      background: `linear-gradient(150deg, hsl(${hue},62%,58%), hsl(${hue},58%,42%))`,
      boxShadow: shadow }}>
      {(pseudo || '?')[0].toUpperCase()}
    </div>
  );
}

/** The small "You" pill next to the current user's name. */
function YouPill({ label }) {
  return (
    <span style={{ flexShrink: 0, padding: '1px 7px', borderRadius: 99, fontSize: '.58rem', fontWeight: 800,
      letterSpacing: '.02em', background: 'var(--accent)', color: 'var(--on-accent, #fff)' }}>
      {label}
    </span>
  );
}

/**
 * The current user's row: the one line of the ranking that must be found at a
 * glance. Used in place inside the list, and pinned below it when the user is
 * outside the top 20.
 */
function MyRankRow({ rank, uid, pseudo, photoURL, xp, format, youLabel, caption }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3, ease: 'easeOut' }}
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0',
        padding: '11px 14px 11px 12px', borderRadius: 14,
        background: 'linear-gradient(90deg, var(--accent-subtle), var(--bg-card-hover) 90%)',
        boxShadow: 'inset 0 0 0 1.5px var(--accent), 0 10px 24px -14px var(--accent-glow)' }}>
      <span style={{ minWidth: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '.74rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', padding: '0 4px', boxSizing: 'border-box',
        background: 'var(--accent)', color: 'var(--on-accent, #fff)' }}>{rank}</span>
      <PlayerAvatar uid={uid} pseudo={pseudo} size={36} isMe photoURL={photoURL} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: '.86rem', fontWeight: 800, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pseudo}</span>
          <YouPill label={youLabel} />
        </div>
        {caption && <div style={{ fontSize: '.64rem', color: 'var(--text-muted)' }}>{caption}</div>}
      </div>
      <XpValue value={xp} size=".82rem" format={format} />
    </motion.div>
  );
}

/** The lightning bolt that stands in for XP everywhere in the ranking. */
function XpValue({ value, size = '.75rem', format }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: size, fontWeight: 700, color: 'var(--xp-color)' }}>
      <Zap size={12} strokeWidth={2.6} fill="currentColor" style={{ flexShrink: 0 }} />
      {format(value || 0)}
    </span>
  );
}

// ── Leaderboard ──────────────────────────────────────────────────────────────
function Leaderboard({ user, myPhoto, myPseudo, onOpenConv }) {
  const { t, formatNumber } = useTranslation();
  const [tab, setTab]         = useState('alltime');
  const [allRows, setAllRows] = useState(null); // null = not loaded yet
  const [viewUid, setViewUid] = useState(null); // { uid, pseudo }
  const [mine, setMine]       = useState(null); // my own leaderboard doc + all-time rank, for the pinned row

  // Field ranked per tab.
  const KEY_BY_TAB = { today: 'xpToday', week: 'xpThisWeek', alltime: 'xp' };

  // Fetch only the top rows for the active tab, server-side. `orderBy(field)`
  // + `limit()` on a single field uses Firestore's automatic index (no manual
  // composite index needed), so this reads a page of docs instead of the whole
  // collection. Re-fetches when the tab changes.
  //
  // The windowed tabs over-fetch more than the others: a player whose last
  // session was yesterday still carries yesterday's `xpToday`, so they sort
  // high and are then dropped below. Reading 60 leaves enough survivors.
  useEffect(() => {
    let alive = true;
    const key = KEY_BY_TAB[tab] || 'xp';
    const size = tab === 'alltime' ? 25 : 60;
    getDocs(query(collection(db, 'leaderboard'), orderBy(key, 'desc'), limit(size)))
      .then(snap => { if (alive) { const all = []; snap.forEach(d => all.push(d.data())); setAllRows(all); } })
      .catch(e => { reportSaveError(e, 'Leaderboard — load'); if (alive) setAllRows([]); });
    return () => { alive = false; };
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    if (!allRows) return [];
    const key = KEY_BY_TAB[tab] || 'xp';
    let all = allRows.filter(r => !r.hidden);

    // A stored `xpToday` only counts if it was stamped with the current day —
    // otherwise it is last session's figure, whenever that was. Same for the
    // week. Comparing the stamp is what makes these tabs actually refresh.
    if (tab === 'today') {
      const today = dayKey();
      all = all.filter(r => r.todayKey === today && (r.xpToday || 0) > 0);
    } else if (tab === 'week') {
      const week = weekKey();
      all = all.filter(r => r.weekKey === week && (r.xpThisWeek || 0) > 0);
    }

    all.sort((a, b) => (b[key] || 0) - (a[key] || 0));
    return all.slice(0, 20);
  }, [allRows, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // My own standing, for when I'm outside the top 20. The all-time rank is one
  // server-side count ("how many have more XP than me"); the windowed tabs
  // hold stale values from past days, so there the pinned row just says 20+.
  useEffect(() => {
    if (!user?.uid) return undefined;
    let alive = true;
    getDoc(doc(db, 'leaderboard', user.uid))
      .then(async snap => {
        const d = snap.exists() ? snap.data() : {};
        const above = await getCountFromServer(query(collection(db, 'leaderboard'), where('xp', '>', d.xp || 0)))
          .then(c => c.data().count).catch(() => null);
        if (alive) setMine({ ...d, rank: above === null ? null : above + 1 });
      })
      .catch(() => { if (alive) setMine({}); });
    return () => { alive = false; };
  }, [user?.uid]);

  const loading = allRows === null;
  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);
  const meInList = rows.some(r => r.uid === user?.uid);
  const myWindowXp = !mine ? 0
    : tab === 'today' ? (mine.todayKey === dayKey() ? mine.xpToday || 0 : 0)
    : tab === 'week' ? (mine.weekKey === weekKey() ? mine.xpThisWeek || 0 : 0)
    : mine.xp || 0;
  const myPinnedRank = tab === 'alltime' && mine?.rank ? mine.rank : `${rows.length}+`;
  const xpOf = r => (tab === 'today' ? r?.xpToday : tab === 'week' ? r?.xpThisWeek : r?.xp) || 0;
  const openProfile = r => setViewUid({ uid: r.uid, pseudo: r.pseudo || t('stats.anon') });

  const tabs = [
    { v: 'alltime', l: t('stats.tabAllTime') },
    { v: 'week',    l: t('stats.tabWeek') },
    { v: 'today',   l: t('stats.tabToday') },
  ];

  return (
    <div>
      {/* Période classée */}
      <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 20,
        background: 'var(--bg-card-hover)', marginBottom: 16 }}>
        {tabs.map(tt => {
          const active = tab === tt.v;
          return (
            <button key={tt.v} onClick={() => setTab(tt.v)}
              style={{ position: 'relative', padding: '6px 14px', borderRadius: 16, border: 'none',
                background: 'transparent', cursor: 'pointer', fontSize: '.72rem',
                fontWeight: active ? 700 : 500, transition: 'color .2s',
                color: active ? '#fff' : 'var(--text-muted)' }}>
              {active && (
                <motion.span layoutId="lbTabPill" transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  style={{ position: 'absolute', inset: 0, borderRadius: 16, background: 'var(--accent)' }} />
              )}
              <span style={{ position: 'relative' }}>{tt.l}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '.82rem' }}>{t('common.loading')}</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '.82rem' }}>{t('stats.noPlayers')}</div>
      ) : (
        <>
          {/* Podium — 2e, 1er, 3e, les marches poussent depuis le sol */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 6,
            padding: '8px 0 20px' }}>
            {[top3[1], top3[0], top3[2]].map((r, i) => {
              const rank = i === 1 ? 0 : i === 0 ? 1 : 2;
              const { metal, height } = PODIUM[rank];
              const isMe = r?.uid === user?.uid;
              const isWinner = rank === 0;
              if (!r) return null;
              return (
                <motion.div key={r.uid}
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: rank * .08, duration: .4, ease: 'easeOut' }}
                  onClick={() => !isMe && openProfile(r)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
                    width: 92, cursor: isMe ? 'default' : 'pointer' }}>

                  {/* Couronne du vainqueur */}
                  <div style={{ height: 18, display: 'flex', alignItems: 'flex-end' }}>
                    {isWinner && (
                      <motion.span
                        animate={{ y: [0, -2.5, 0] }}
                        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                        style={{ color: metal, display: 'flex' }}>
                        <Crown size={18} strokeWidth={2.2} fill="currentColor" />
                      </motion.span>
                    )}
                  </div>

                  <div style={{ position: 'relative' }}>
                    {/* halo doré derrière le premier */}
                    {isWinner && (
                      <span aria-hidden="true" style={{ position: 'absolute', inset: -12, borderRadius: '50%',
                        background: `radial-gradient(circle, ${metal}40 0%, transparent 70%)` }} />
                    )}
                    <div style={{ position: 'relative' }}>
                      <PlayerAvatar uid={r.uid} pseudo={r.pseudo} size={isWinner ? 48 : 40}
                        isMe={isMe} ring={isMe ? null : metal} photoURL={isMe ? myPhoto : null} />
                    </div>
                  </div>

                  <span style={{ fontSize: '.68rem', maxWidth: 88, textAlign: 'center',
                    fontWeight: isMe ? 800 : 600, color: isMe ? 'var(--accent)' : 'var(--text-secondary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.pseudo || t('stats.anon')}
                  </span>
                  {isMe && <YouPill label={t('stats.youBadge')} />}
                  <XpValue value={xpOf(r)} size=".7rem" format={formatNumber} />

                  {/* La marche : chiffre gravé, teinte du métal */}
                  <motion.div
                    initial={{ height: 0 }} animate={{ height }}
                    transition={{ delay: .12 + rank * .08, duration: .5, ease: [.22, 1, .36, 1] }}
                    style={{ width: '100%', borderRadius: '10px 10px 0 0', overflow: 'hidden',
                      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 10,
                      background: `linear-gradient(180deg, ${metal}33 0%, ${metal}0d 100%)`,
                      boxShadow: `inset 0 3px 0 ${metal}` }}>
                    <span style={{ fontSize: '1.5rem', fontWeight: 900, lineHeight: 1, color: metal, opacity: .85 }}>
                      {rank + 1}
                    </span>
                  </motion.div>
                </motion.div>
              );
            })}
          </div>

          {/* Le reste du classement — lignes alternées, sans cadre par ligne */}
          <div style={{ borderRadius: 12, overflow: 'hidden' }}>
            {rest.map((r, i) => {
              const isMe = r.uid === user?.uid;
              if (isMe) {
                return (
                  <MyRankRow key={r.uid} rank={i + 4} uid={r.uid} pseudo={r.pseudo || t('stats.anon')} photoURL={myPhoto}
                    xp={xpOf(r)} format={formatNumber} youLabel={t('stats.youBadge')} />
                );
              }
              return (
                <motion.div key={r.uid}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 8) * .03 }}
                  onClick={() => !isMe && openProfile(r)}
                  style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', cursor: isMe ? 'default' : 'pointer',
                    background: isMe ? 'var(--accent-subtle)'
                      : i % 2 ? 'transparent' : 'var(--bg-card-hover)' }}>
                  {/* liseré d'accent sur sa propre ligne, plutôt qu'un cadre complet */}
                  {isMe && (
                    <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 6, bottom: 6,
                      width: 3, borderRadius: 3, background: 'var(--accent)' }} />
                  )}
                  <span style={{ minWidth: 26, textAlign: 'center', fontSize: '.72rem', fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    color: isMe ? 'var(--accent)' : 'var(--text-muted)' }}>{i + 4}</span>
                  <PlayerAvatar uid={r.uid} pseudo={r.pseudo} size={28} isMe={false} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: '.8rem',
                    fontWeight: isMe ? 700 : 500,
                    color: isMe ? 'var(--accent)' : 'var(--text-secondary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.pseudo || t('stats.anon')} {isMe ? t('stats.me') : ''}
                  </span>
                  <XpValue value={xpOf(r)} format={formatNumber} />
                </motion.div>
              );
            })}
          </div>

          {/* Outside the top 20: my own row stays visible, pinned under the list. */}
          {!meInList && mine && !mine.hidden && (
            <>
              <div aria-hidden="true" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '.8rem',
                letterSpacing: '.3em', padding: '4px 0 0' }}>···</div>
              <MyRankRow rank={myPinnedRank} uid={user?.uid} pseudo={mine.pseudo || myPseudo || t('stats.anon')} photoURL={myPhoto}
                xp={myWindowXp} format={formatNumber} youLabel={t('stats.youBadge')} caption={t('stats.yourPosition')} />
            </>
          )}
        </>
      )}

      <AnimatePresence>
        {viewUid && (
          <UserProfileModal targetUid={viewUid.uid} targetPseudo={viewUid.pseudo}
            user={user} onOpenConv={onOpenConv} onClose={() => setViewUid(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Badges ───────────────────────────────────────────────────────────────────
// NOTE: badge names/descriptions come from ../data/badges (currently French).
// They are intentionally left as-is here; localizing that data file is a
// separate task.
function BadgesSection({ earnedBadges = [] }) {
  const { t } = useTranslation();
  const [active, setActive]   = useState(null);
  const [showAll, setShowAll] = useState(false);
  const earnedSet   = new Set(earnedBadges);
  const earnedCount = earnedBadges.length;
  const activeBadge = BADGES.find(b => b.id === active);
  const earned = BADGES.filter(b => earnedSet.has(b.id));
  const locked = BADGES.filter(b => !earnedSet.has(b.id));
  const displayed = showAll ? BADGES : earned.length > 0 ? earned : BADGES.slice(0, 8);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
        padding: '8px 12px', borderRadius: 10, background: 'var(--bg-card-hover)' }}>
        <span style={{ fontSize: '.85rem', fontWeight: 900, color: 'var(--xp-color)' }}>{earnedCount}</span>
        <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{t('stats.badgesUnlocked', { count: BADGES.length })}</span>
        <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 10, overflow: 'hidden', marginLeft: 4 }}>
          <div style={{ height: '100%', width: `${Math.round(earnedCount / BADGES.length * 100)}%`,
            background: 'linear-gradient(90deg,var(--xp-color),#27AE60)', borderRadius: 10 }} />
        </div>
        <span style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>
          {Math.round(earnedCount / BADGES.length * 100)}%
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(80px,1fr))', gap: 8 }}>
        {displayed.map(b => {
          const isEarned = earnedSet.has(b.id);
          return (
            <motion.div key={b.id} layoutId={`badge-${b.id}`}
              onClick={() => setActive(b.id)}
              whileHover={{ scale: 1.06, y: -2 }}
              whileTap={{ scale: .97 }}
              style={{ textAlign: 'center', padding: '10px 6px', borderRadius: 12, cursor: 'pointer',
                background: isEarned ? 'rgba(87,255,43,.06)' : 'var(--bg-card)',
                border: isEarned ? '1px solid rgba(87,255,43,.2)' : '1px solid var(--border)',
                opacity: isEarned ? 1 : .45 }}>
              <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>{isEarned ? b.ico : '🔒'}</div>
              <div style={{ fontSize: '.58rem', color: isEarned ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: isEarned ? 600 : 400, lineHeight: 1.2 }}>{t('badges.' + b.id + '_name')}</div>
              {b.xp && isEarned && <div style={{ fontSize: '.52rem', color: 'var(--xp-color)', marginTop: 2 }}>+{b.xp} XP</div>}
            </motion.div>
          );
        })}
      </div>

      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: .98 }}
        onClick={() => setShowAll(s => !s)}
        style={{ width: '100%', marginTop: 12, padding: '10px', borderRadius: 12,
          border: '1px solid var(--border)', background: 'var(--bg-card)',
          color: 'var(--text-secondary)', fontSize: '.78rem', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {showAll ? `▲ ${t('stats.collapse')}` : `▼ ${t('stats.showAll', { count: locked.length })}`}
      </motion.button>

      <AnimatePresence>
        {active && activeBadge && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setActive(null)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(10px)', zIndex: 499 }} />
            <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, pointerEvents: 'none' }}>
              <motion.div layoutId={`badge-${active}`}
                style={{ background: 'var(--bg-modal)', border: `1px solid ${earnedSet.has(active) ? 'rgba(87,255,43,.3)' : 'var(--border-strong)'}`,
                  borderRadius: 24, padding: '2.5rem', width: 280, maxWidth: '90vw', textAlign: 'center', pointerEvents: 'auto',
                  boxShadow: earnedSet.has(active) ? '0 0 40px var(--accent-glow)' : 'var(--card-shadow)' }}>
                <div style={{ fontSize: '3.5rem', marginBottom: 12 }}>{earnedSet.has(active) ? activeBadge.ico : '🔒'}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>{t('badges.' + activeBadge.id + '_name')}</div>
                <div style={{ fontSize: '.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 12 }}>{t('badges.' + activeBadge.id + '_desc')}</div>
                {activeBadge.xp && earnedSet.has(active) && (
                  <div style={{ padding: '6px 16px', borderRadius: 10, background: 'var(--accent-subtle)',
                    border: '1px solid var(--accent)', display: 'inline-block',
                    color: 'var(--xp-color)', fontWeight: 700, fontSize: '.82rem' }}>
                    +{activeBadge.xp} XP
                  </div>
                )}
                {!earnedSet.has(active) && (
                  <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{t('stats.badgeLocked')}</div>
                )}
                <button onClick={() => setActive(null)}
                  style={{ marginTop: 16, padding: '8px 20px', borderRadius: 10,
                    border: '1px solid var(--border)', background: 'var(--bg-card)',
                    color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '.78rem', display: 'block', width: '100%' }}>
                  {t('common.close')}
                </button>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function PageStats({ user, onOpenConv }) {
  const { t, formatNumber } = useTranslation();
  const tour = useGuidedTour('stats');
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [online, setOnline]       = useState(0);
  const [othersOnline, setOthersOnline] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'data', 'main'), snap => {
      if (snap.exists()) setData(snap.data());
      setLoading(false);
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    const unsub = onValue(dbRef(rtdb, 'presence'), snap => {
      // Everyone online, me included; "others" decides between the two messages.
      const uids = Object.keys(snap.val() || {});
      setOnline(uids.length);
      setOthersOnline(uids.filter(uid => uid !== user?.uid).length);
    }, () => {});
    // Server-side aggregation: one billed read instead of one per player.
    // (The previous version downloaded the whole collection just to count it.)
    getCountFromServer(collection(db, 'leaderboard'))
      .then(snap => setTotalUsers(snap.data().count))
      .catch(() => {});
    return () => unsub();
  }, [user?.uid]);

  if (loading || !data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
      <motion.div animate={{ opacity: [.3, 1, .3] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</motion.div>
    </div>
  );

  const { xp = 0, streak = 0, todaySess = 0, todayMins = 0,
    totalFocusHours = 0, earnedBadges = [], subjects = [] } = data;

  // Level lookup that tolerates the 12 → 15 gap:
  //  - current = highest defined level <= player's level
  //  - next    = first defined level strictly greater (undefined when maxed)
  const curDef  = [...XP_LEVELS].reverse().find(l => xp >= l.xpNeeded) || XP_LEVELS[0];
  const nextDef = XP_LEVELS.find(l => l.xpNeeded > xp);
  const xpInLvl = nextDef ? xp - curDef.xpNeeded : xp;
  const xpNeeded = nextDef ? nextDef.xpNeeded - curDef.xpNeeded : 0;
  const pct = nextDef ? Math.round(xpInLvl / xpNeeded * 100) : 100;

  const totalBlocks = subjects.reduce((a, s) => a + (s.totalBlocks || 0), 0);
  const doneBlocks  = subjects.reduce((a, s) => a + (s.doneBlocks || 0), 0);
  const totalChaps  = subjects.reduce((a, s) => a + (s.chaps || 0), 0);
  const doneChaps   = subjects.reduce((a, s) => a + (s.chapsDone || 0), 0);

  const levelStats = [
    { v: streak,    l: `🔥 ${t('stats.streak')}`,   u: t('stats.unitDays'),     c: '#F1C40F' },
    { v: todaySess, l: `⏱ ${t('stats.sessions')}`,  u: t('stats.unitToday'),    c: '#4A90D9' },
    { v: todayMins, l: `⏰ ${t('stats.focus')}`,     u: t('stats.unitMinToday'), c: 'var(--xp-color)' },
    { v: Math.round(totalFocusHours * 10) / 10, l: `📊 ${t('stats.total')}`, u: t('stats.unitHours'), c: '#9B59B6' },
  ];
  const recapStats = [
    { v: `${doneBlocks}/${totalBlocks}`, l: t('stats.blocksDone'), c: '#4A90D9' },
    { v: `${totalBlocks > 0 ? Math.round(doneBlocks / totalBlocks * 100) : 0}%`, l: t('stats.completion'), c: '#27AE60' },
    { v: `${doneChaps}/${totalChaps}`, l: t('stats.chaptersDone'), c: '#9B59B6' },
    { v: subjects.length, l: t('stats.subjects'), c: '#F1C40F' },
  ];

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

      <TourButton onClick={tour.start} label={t('common.guidedTour')} />

      {/* ── XP & Level ── */}
      <section data-tour="tour-stats-xp" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
        <h2 style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>🎮 {t('stats.levelTitle')}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
          <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
            <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: 'rotate(-90deg)', position: 'absolute', inset: 0 }}>
              <circle cx="36" cy="36" r="30" fill="none" stroke="var(--border)" strokeWidth="6" />
              <motion.circle cx="36" cy="36" r="30" fill="none" stroke="var(--xp-color)" strokeWidth="6"
                strokeDasharray={2 * Math.PI * 30}
                animate={{ strokeDashoffset: 2 * Math.PI * 30 * (1 - pct / 100) }}
                transition={{ duration: .8, ease: 'easeOut' }} strokeLinecap="round"
                style={{ filter: 'drop-shadow(0 0 6px var(--xp-color))' }} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--xp-color)', lineHeight: 1 }}>{curDef.level}</span>
              <span style={{ fontSize: '.42rem', color: 'rgba(87,255,43,.5)', textTransform: 'uppercase', letterSpacing: '.05em' }}>LVL</span>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: '.88rem', fontWeight: 700, color: curDef.color }}>{curDef.title}</span>
              <span style={{ fontSize: '.78rem', color: 'var(--xp-color)', fontWeight: 700 }}>⚡ {formatNumber(xp)} XP</span>
            </div>
            <div style={{ height: 8, background: 'var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 4 }}>
              <motion.div animate={{ width: `${pct}%` }} transition={{ duration: .8, ease: 'easeOut' }}
                style={{ height: '100%', background: 'linear-gradient(90deg,var(--xp-color),#27AE60)', borderRadius: 10,
                  boxShadow: '0 0 10px rgba(87,255,43,.4)' }} />
            </div>
            <div style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>
              {nextDef
                ? t('stats.nextLevel', { cur: formatNumber(xpInLvl), need: formatNumber(xpNeeded), lvl: nextDef.level, label: nextDef.title })
                : `🏆 ${t('stats.maxLevel')}`}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(100px,1fr))', gap: 8, marginBottom: 14 }}>
          {levelStats.map((s, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '10px', background: 'var(--bg-card-hover)', border: `1px solid ${s.c}22`, borderRadius: 12 }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: s.c }}>{s.v}</div>
              <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', marginTop: 2 }}>{s.l}</div>
              <div style={{ fontSize: '.55rem', color: 'var(--text-muted)' }}>{s.u}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 12px', background: 'var(--accent-subtle)', borderRadius: 8, fontSize: '.75rem', color: 'var(--accent)' }}>
          💡 {t('stats.xpHint')}
        </div>
      </section>

      {/* ── Global summary ── */}
      <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
        <h2 style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' }}>📊 {t('stats.recapTitle')}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10 }}>
          {recapStats.map((s, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-card-hover)', border: `1px solid ${s.c}22`, borderRadius: 12 }}>
              <div style={{ fontSize: '1.3rem', fontWeight: 900, color: s.c }}>{s.v}</div>
              <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', marginTop: 2 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Presence ── */}
      <section style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
        <h2 style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>👥 {t('stats.presenceTitle')}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            {othersOnline > 0 ? (
              <>
                <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#27AE60', marginBottom: 4 }}>👥 {online}</div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-secondary)' }}>{t('stats.onlineText', { count: online })}</div>
              </>
            ) : (
              <div style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>👤 {t('stats.aloneNow')}</div>
            )}
            {totalUsers > 0 && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 6 }}>🎓 {t('stats.totalUsers', { count: totalUsers })}</div>}
          </div>
          {othersOnline > 0 && (
            <div style={{ display: 'flex' }}>
              {Array.from({ length: Math.min(online, 6) }).map((_, i) => (
                <motion.div key={i} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * .08 }}
                  style={{ width: 32, height: 32, borderRadius: '50%',
                    background: `hsl(${i * 60},60%,50%)`,
                    border: '2px solid var(--bg-base)',
                    marginLeft: i > 0 ? -8 : 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.7rem', color: '#fff', fontWeight: 700 }}>
                  {String.fromCharCode(65 + i)}
                </motion.div>
              ))}
              {online > 6 && <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-card-hover)', border: '2px solid var(--bg-base)', marginLeft: -8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.6rem', color: 'var(--text-muted)' }}>+{online - 6}</div>}
            </div>
          )}
        </div>
      </section>

      {/* ── Badges ── */}
      <section data-tour="tour-stats-badges" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
        <h2 style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>🏆 {t('stats.badgesTitle')}</h2>
        <p style={{ fontSize: '.72rem', color: 'var(--text-muted)', margin: '0 0 14px' }}>{t('stats.badgeHint')}</p>
        <BadgesSection earnedBadges={earnedBadges} />
      </section>

      {/* ── Leaderboard ── */}
      <section data-tour="tour-stats-ranking" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
        <h2 style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 14px' }}>
          <Medal size={17} strokeWidth={2.2} color='var(--accent)' />
          {t('stats.rankingTitle')}
        </h2>
        <Leaderboard user={user} onOpenConv={onOpenConv} myPhoto={resolveOwnPhoto(data, user)}
          myPseudo={data.profile?.pseudo || user?.displayName} />
      </section>

      <GuidedTour active={tour.active} step={tour.step} steps={tour.steps}
        onNext={tour.next} onPrev={tour.prev} onStop={tour.stop} />
    </div>
  );
}