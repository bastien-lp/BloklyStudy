/**
 * PageProfile — Profile, privacy, friends and friend requests
 * --------------------------------------------------------------------------
 * Tabs: profile (info + privacy + public preview), friends (search/list),
 * notifs (incoming friend requests).
 *
 * Firestore touchpoints:
 *   users/{uid}/data/main          : xp/level/streak/profile/photoURL (own)
 *   leaderboard/{uid}              : pseudo (own)
 *   friendRequests/{toUid}/requests/{myUid}  : send/accept/decline
 *   friends/{uid}/list, friends/{otherUid}/list : add/remove (both sides)
 *
 * NOTE: several writes target OTHER users' subcollections (friend requests and
 * the reciprocal friends entry). These rely on Firestore security rules to be
 * permitted; the logic is intentionally left unchanged.
 *
 * Props: { user, onOpenConv }
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  doc, getDocs, setDoc, deleteDoc, updateDoc,
  collection, onSnapshot,
} from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { db, rtdb, auth } from '../firebase/config';
import { ref as dbRef, onValue } from 'firebase/database';
import UserProfileModal from '../components/UserProfileModal';
import { useTranslation } from '../i18n';
import { reportSaveError, reportError } from '../lib/notify';

// Study-year options. `value` is the stored (stable) string — kept in French so
// existing saved profiles keep matching; the label is localized for display.
const YEARS = [
  { value: '1ère',     labelKey: 'profile.year1' },
  { value: '2ème',     labelKey: 'profile.year2' },
  { value: '3ème',     labelKey: 'profile.year3' },
  { value: 'Master 1', labelKey: 'profile.master1' },
  { value: 'Master 2', labelKey: 'profile.master2' },
  { value: 'Doctorat', labelKey: 'profile.phd' },
  { value: 'Autre',    labelKey: 'profile.otherYear' },
];

const DEFAULT_PRIVACY = { public: true, stats: true, badges: true, leaderboard: true, online: true };

function Avatar({ name, size = 48, color = '#4A90D9', level, online = false }) {
  const { t } = useTranslation();
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{ width: size, height: size, borderRadius: '50%',
        background: `linear-gradient(135deg, ${color}, #9B59B6)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * .38 + 'px', fontWeight: 700, color: '#fff',
        boxShadow: `0 0 16px ${color}40` }}>
        {(name || '?')[0].toUpperCase()}
      </div>
      {online && (
        <div style={{ position: 'absolute', bottom: 2, right: 2, width: size * .22, height: size * .22,
          borderRadius: '50%', background: '#27AE60', border: `${size * .05}px solid var(--bg-base)` }} />
      )}
      {level && (
        <div style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-modal)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '1px 6px', fontSize: size * .18 + 'px', fontWeight: 700,
          color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {t('profile.lvlShort', { count: level })}
        </div>
      )}
    </div>
  );
}

export default function PageProfile({ user, onOpenConv }) {
  const { t, formatDate, formatNumber } = useTranslation();
  const [tab, setTab]         = useState('profile');
  const [pseudo, setPseudo]   = useState('');
  const [school, setSchool]   = useState('');
  const [studies, setStudies] = useState('');
  const [year, setYear]       = useState('');
  const [bio, setBio]         = useState('');
  const [privacy, setPrivacy] = useState(DEFAULT_PRIVACY);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  const [searchQuery, setSearchQuery]   = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searching, setSearching]       = useState(false);

  const [friends, setFriends]           = useState([]);
  const [friendsOnline, setFriendOnline] = useState({});
  const [requests, setRequests]         = useState([]);
  const [viewFriend, setViewFriend]     = useState(null);
  const [previewSelf, setPreviewSelf]   = useState(false);

  const [xp, setXp]       = useState(0);
  const [level, setLevel] = useState(1);
  const [streak, setStreak] = useState(0);
  const [hours, setHours]   = useState(0);
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [photoURL, setPhotoURL] = useState(user?.photoURL || null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const userColor = `hsl(${(user?.uid?.charCodeAt(0) * 47 || 0) % 360},60%,50%)`;

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) { alert(t('profile.imageTooLarge')); return; }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target.result;
      try {
        await updateProfile(auth.currentUser, { photoURL: base64 });
        await updateDoc(doc(db, 'users', user.uid, 'data', 'main'), { photoURL: base64 });
        setPhotoURL(base64);
      } catch (e) { reportSaveError(e, 'Profile — photo upload'); }
      setUploading(false);
    };
    reader.readAsDataURL(file);
  }

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid, 'data', 'main'), snap => {
      if (snap.exists()) {
        const d = snap.data();
        setXp(d.xp || 0); setLevel(d.level || 1); setStreak(d.streak || 0);
        setHours(Math.round((d.totalFocusHours || 0) * 10) / 10);
        setBadges(d.earnedBadges || []);
        if (d.profile) {
          setSchool(d.profile.school || '');
          setStudies(d.profile.studies || '');
          setYear(d.profile.year || '');
          setBio(d.profile.bio || '');
          setPrivacy(d.profile.privacy || DEFAULT_PRIVACY);
        }
      }
      setLoading(false);
    });
    setPseudo(user.displayName || user.email?.split('@')[0] || '');
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'friends', user.uid, 'list'), snap => {
      setFriends(snap.docs.map(d => d.data()));
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    const unsub = onValue(dbRef(rtdb, 'presence'), snap => {
      setFriendOnline(snap.val() || {});
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(collection(db, 'friendRequests', user.uid, 'requests'), snap => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, [user]);

  async function saveProfile() {
    if (!pseudo.trim()) return;
    setSaving(true);
    try {
      await updateProfile(auth.currentUser, { displayName: pseudo.trim() });
      await updateDoc(doc(db, 'users', user.uid, 'data', 'main'), {
        profile: { school, studies, year, bio, privacy },
      });
      await updateDoc(doc(db, 'leaderboard', user.uid), { pseudo: pseudo.trim(), hidden: privacy.leaderboard === false }).catch(() => {});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { reportSaveError(e, 'Profile — save'); }
    setSaving(false);
  }

  async function searchFriend() {
    if (!searchQuery.trim()) return;
    setSearching(true); setSearchResult(null);
    try {
      // Full-collection scan: case-insensitive exact-pseudo match. Acceptable at
      // the current scale; an indexed lowercase field would scale better.
      const snap = await getDocs(collection(db, 'leaderboard'));
      let found = null;
      snap.forEach(d => {
        const r = d.data();
        if (r.pseudo?.toLowerCase() === searchQuery.trim().toLowerCase() && r.uid !== user.uid) found = r;
      });
      setSearchResult(found || 'notfound');
    } catch (e) { reportError(e, 'Profile — friend search', "La recherche a échoué. Réessaie."); }
    setSearching(false);
  }

  async function sendRequest(toUid, toPseudo) {
    const myPseudo = user.displayName || user.email?.split('@')[0] || 'Anonyme';
    try {
      await setDoc(doc(db, 'friendRequests', toUid, 'requests', user.uid), {
        from: user.uid, fromPseudo: myPseudo, to: toUid, toPseudo,
        sentAt: new Date().toISOString(), status: 'pending',
      });
      setSearchResult(null); setSearchQuery('');
    } catch (e) { reportSaveError(e, 'Profile — send request'); }
  }

  async function acceptRequest(req) {
    const myPseudo = user.displayName || user.email?.split('@')[0] || 'Anonyme';
    try {
      await setDoc(doc(db, 'friends', user.uid, 'list', req.from), { uid: req.from, pseudo: req.fromPseudo, addedAt: new Date().toISOString() });
      await setDoc(doc(db, 'friends', req.from, 'list', user.uid), { uid: user.uid, pseudo: myPseudo, addedAt: new Date().toISOString() });
      await deleteDoc(doc(db, 'friendRequests', user.uid, 'requests', req.id));
    } catch (e) { reportSaveError(e, 'Profile — accept request'); }
  }

  async function declineRequest(reqId) {
    try { await deleteDoc(doc(db, 'friendRequests', user.uid, 'requests', reqId)); }
    catch (e) { reportSaveError(e, 'Profile — decline request'); }
  }

  async function removeFriend(friendUid) {
    try {
      await deleteDoc(doc(db, 'friends', user.uid, 'list', friendUid));
      await deleteDoc(doc(db, 'friends', friendUid, 'list', user.uid));
    } catch (e) { reportSaveError(e, 'Profile — remove friend'); }
  }

  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8,
    border: '1px solid var(--border-strong)', background: 'var(--bg-input)',
    color: 'var(--text-primary)', fontSize: '.83rem',
    fontFamily: 'var(--font-family)', boxSizing: 'border-box' };
  const lbl = { fontSize: '.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const privacyOptions = [
    { k: 'public',      l: t('profile.pubProfile'),    d: t('profile.pubProfileDesc') },
    { k: 'stats',       l: t('profile.statsVisible'),  d: t('profile.statsVisibleDesc') },
    { k: 'badges',      l: t('profile.badgesVisible'), d: t('profile.badgesVisibleDesc') },
    { k: 'leaderboard', l: t('profile.inLeaderboard'), d: t('profile.inLeaderboardDesc') },
    { k: 'online',      l: t('profile.onlineStatus'),  d: t('profile.onlineStatusDesc') },
  ];

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
      <motion.div animate={{ opacity: [.3, 1, .3] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</motion.div>
    </div>
  );

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '1.4rem',
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16 }}>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {photoURL ? (
            <img src={photoURL} alt="avatar"
              style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover',
                border: `2px solid ${userColor}`, boxShadow: `0 0 16px ${userColor}40` }} />
          ) : (
            <Avatar name={pseudo} size={64} color={userColor} level={level} />
          )}
          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: .95 }}
            onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: '50%',
              border: '2px solid var(--bg-base)', background: 'var(--accent)', color: '#fff',
              fontSize: '.65rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {uploading ? '…' : '📷'}
          </motion.button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 2 }}>{pseudo}</div>
          <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginBottom: 8 }}>{user?.email}</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { v: formatNumber(xp), l: 'XP', c: 'var(--xp-color)' },
              { v: streak,           l: `🔥 ${t('profile.streak')}`, c: '#F1C40F' },
              { v: hours,            l: t('profile.hFocus'), c: 'var(--accent)' },
              { v: badges.length,    l: t('profile.badges'), c: '#9B59B6' },
            ].map((s, i) => (
              <div key={i}>
                <span style={{ fontSize: '.95rem', fontWeight: 900, color: s.c }}>{s.v}</span>
                <span style={{ fontSize: '.6rem', color: 'var(--text-muted)', marginLeft: 3 }}>{s.l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', padding: 4, borderRadius: 12 }}>
        {[
          { v: 'profile', l: `👤 ${t('profile.tabProfile')}` },
          { v: 'friends', l: `👥 ${t('profile.tabFriends')} (${friends.length})` },
          { v: 'notifs',  l: `🔔 ${t('profile.tabNotifs')}${pendingCount > 0 ? ` (${pendingCount})` : ''}`, badge: pendingCount > 0 },
        ].map(tt => (
          <button key={tt.v} onClick={() => setTab(tt.v)}
            style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontSize: '.78rem', fontWeight: 500, position: 'relative',
              background: tab === tt.v ? 'var(--accent-subtle)' : 'transparent',
              color: tab === tt.v ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            {tt.l}
            {tt.badge && (
              <span style={{ position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: '50%',
                background: '#E74C3C', boxShadow: '0 0 6px #E74C3C' }} />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* ── Profile tab ── */}
        {tab === 'profile' && (
          <motion.div key="profile" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h3 style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>✏️ {t('profile.infoTitle')}</h3>
              <div>
                <label style={lbl}>{t('profile.pseudo')} *</label>
                <input value={pseudo} onChange={e => setPseudo(e.target.value)} style={inp} placeholder={t('profile.pseudoPlaceholder')} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={lbl}>{t('profile.school')}</label>
                  <input value={school} onChange={e => setSchool(e.target.value)} style={inp} placeholder={t('profile.schoolPlaceholder')} />
                </div>
                <div>
                  <label style={lbl}>{t('profile.studies')}</label>
                  <input value={studies} onChange={e => setStudies(e.target.value)} style={inp} placeholder={t('profile.studiesPlaceholder')} />
                </div>
              </div>
              <div>
                <label style={lbl}>{t('profile.year')}</label>
                <select value={year} onChange={e => setYear(e.target.value)} style={inp}>
                  <option value="" style={{ background: 'var(--bg-modal)' }}>{t('profile.selectYear')}</option>
                  {YEARS.map(y => <option key={y.value} value={y.value} style={{ background: 'var(--bg-modal)' }}>{t(y.labelKey)}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>{t('profile.bio')}</label>
                <textarea value={bio} onChange={e => setBio(e.target.value)} rows={2}
                  style={{ ...inp, resize: 'vertical' }} placeholder={t('profile.bioPlaceholder')} />
              </div>
            </div>

            {/* Privacy */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h3 style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>🔒 {t('profile.privacyTitle')}</h3>
              {privacyOptions.map(p => (
                <div key={p.k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: '.82rem', color: 'var(--text-primary)', fontWeight: 500 }}>{p.l}</div>
                    <div style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>{p.d}</div>
                  </div>
                  <motion.button whileTap={{ scale: .9 }} onClick={() => setPrivacy(pr => ({ ...pr, [p.k]: !pr[p.k] }))}
                    style={{ width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0,
                      background: privacy[p.k] ? 'var(--accent)' : 'var(--border)', transition: 'background .2s' }}>
                    <motion.div animate={{ x: privacy[p.k] ? 18 : 2 }}
                      style={{ position: 'absolute', top: 2, width: 18, height: 18, borderRadius: '50%', background: '#fff' }} />
                  </motion.button>
                </div>
              ))}
            </div>

            {/* Public-profile preview — opens the shared modal */}
            <button onClick={() => setPreviewSelf(true)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '12px', borderRadius: 12, cursor: 'pointer',
                background: 'var(--bg-card)', border: '1px dashed var(--border-strong)',
                color: 'var(--text-secondary)', fontSize: '.82rem', fontWeight: 600 }}>
              👁 {t('profile.viewPublic')}
            </button>
            <div style={{ fontSize: '.66rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: -6 }}>
              {t('profile.previewNote')}
            </div>

            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: .98 }} onClick={saveProfile} disabled={saving}
              style={{ padding: '12px', borderRadius: 12, border: 'none',
                background: saved ? 'linear-gradient(135deg,#27AE60,#1abc9c)' : 'linear-gradient(135deg,var(--accent),#6366f1)',
                color: '#fff', fontWeight: 700, fontSize: '.88rem', cursor: 'pointer',
                boxShadow: saved ? '0 4px 20px rgba(39,174,96,.3)' : '0 4px 20px var(--accent-glow)',
                transition: 'background .3s, box-shadow .3s' }}>
              {saving ? t('profile.saving') : saved ? t('profile.saved') : `💾 ${t('profile.save')}`}
            </motion.button>
          </motion.div>
        )}

        {/* ── Friends tab ── */}
        {tab === 'friends' && (
          <motion.div key="friends" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h3 style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>🔍 {t('profile.searchFriend')}</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchFriend()}
                  placeholder={t('profile.exactPseudo')} style={{ ...inp, flex: 1 }} />
                <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: .97 }} onClick={searchFriend} disabled={searching}
                  style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: '.82rem', cursor: 'pointer', flexShrink: 0 }}>
                  {searching ? '…' : t('profile.searchBtn')}
                </motion.button>
              </div>

              <AnimatePresence>
                {searchResult && searchResult !== 'notfound' && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                      background: 'var(--accent-subtle)', border: '1px solid var(--accent)', borderRadius: 10 }}>
                    <Avatar name={searchResult.pseudo} size={36} color={`hsl(${(searchResult.uid?.charCodeAt(0) * 47 || 0) % 360},60%,50%)`} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{searchResult.pseudo}</div>
                      <div style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>{t('profile.lvl')} {searchResult.level} · ⚡{formatNumber(searchResult.xp || 0)} XP</div>
                    </div>
                    {friends.some(f => f.uid === searchResult.uid) ? (
                      <span style={{ fontSize: '.72rem', color: '#27AE60', fontWeight: 600 }}>{t('profile.friend')}</span>
                    ) : (
                      <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }}
                        onClick={() => sendRequest(searchResult.uid, searchResult.pseudo)}
                        style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '.75rem', fontWeight: 700, cursor: 'pointer' }}>
                        + {t('profile.add')}
                      </motion.button>
                    )}
                  </motion.div>
                )}
                {searchResult === 'notfound' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{ textAlign: 'center', padding: '8px', color: 'var(--text-muted)', fontSize: '.78rem' }}>
                    {t('profile.notFound')}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h3 style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>👥 {t('profile.myFriends')} ({friends.length})</h3>
              {friends.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '.82rem' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>👥</div>
                  {t('profile.noFriends')}
                </div>
              ) : friends.map(f => {
                const online = !!friendsOnline[f.uid];
                const fColor = `hsl(${(f.uid?.charCodeAt(0) * 47 || 0) % 360},60%,50%)`;
                return (
                  <motion.div key={f.uid} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      background: 'var(--bg-card-hover)', border: `1px solid ${online ? 'rgba(39,174,96,.3)' : 'var(--border)'}`,
                      borderRadius: 10, transition: 'border-color .3s' }}>
                    <Avatar name={f.pseudo} size={38} color={fColor} online={online} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>{f.pseudo}</div>
                      <div style={{ fontSize: '.62rem', color: online ? '#27AE60' : 'var(--text-muted)' }}>
                        {online ? `🟢 ${t('profile.online')}` : `⚫ ${t('profile.offline')}`}
                      </div>
                    </div>
                    {onOpenConv && (
                      <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }}
                        onClick={() => onOpenConv({ uid: f.uid, pseudo: f.pseudo, photoURL: f.photoURL || null })}
                        style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--accent)',
                          background: 'var(--accent-subtle)', color: 'var(--accent)', fontSize: '.8rem', cursor: 'pointer' }}
                        title={t('profile.writeTo', { name: f.pseudo })}>
                        💬
                      </motion.button>
                    )}
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }}
                      onClick={() => setViewFriend({ ...f, online })}
                      style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--accent)',
                        background: 'var(--accent-subtle)', color: 'var(--accent)', fontSize: '.72rem', cursor: 'pointer' }}>
                      {t('profile.profileBtn')}
                    </motion.button>
                    <button onClick={() => removeFriend(f.uid)}
                      style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(231,76,60,.2)',
                        background: 'rgba(231,76,60,.06)', color: '#E74C3C', fontSize: '.7rem', cursor: 'pointer' }}>
                      ✕
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ── Notifications tab ── */}
        {tab === 'notifs' && (
          <motion.div key="notifs" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h3 style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                🔔 {t('profile.friendRequests')}
                {pendingCount > 0 && (
                  <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 10,
                    background: 'rgba(231,76,60,.15)', color: '#E74C3C', fontSize: '.7rem', fontWeight: 700 }}>
                    {t('profile.pending', { count: pendingCount })}
                  </span>
                )}
              </h3>

              {requests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '.82rem' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔔</div>
                  {t('profile.noRequests')}
                </div>
              ) : requests.map(req => {
                const rColor = `hsl(${(req.from?.charCodeAt(0) * 47 || 0) % 360},60%,50%)`;
                return (
                  <motion.div key={req.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      background: 'var(--accent-subtle)', border: '1px solid var(--accent)', borderRadius: 10 }}>
                    <Avatar name={req.fromPseudo} size={38} color={rColor} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>{req.fromPseudo}</div>
                      <div style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>
                        {formatDate(req.sentAt, { day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: .95 }} onClick={() => acceptRequest(req)}
                        style={{ padding: '5px 12px', borderRadius: 8, border: 'none',
                          background: 'rgba(39,174,96,.2)', color: '#27AE60', fontSize: '.72rem', fontWeight: 700, cursor: 'pointer' }}>
                        ✓ {t('profile.accept')}
                      </motion.button>
                      <button onClick={() => declineRequest(req.id)}
                        style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(231,76,60,.2)',
                          background: 'transparent', color: '#E74C3C', fontSize: '.72rem', cursor: 'pointer' }}>
                        ✕
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

      </AnimatePresence>

      <AnimatePresence>
        {viewFriend && (
          <UserProfileModal targetUid={viewFriend.uid} targetPseudo={viewFriend.pseudo}
            user={user} online={!!friendsOnline[viewFriend.uid]}
            onOpenConv={onOpenConv} onClose={() => setViewFriend(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {previewSelf && (
          <UserProfileModal targetUid={user.uid} targetPseudo={pseudo}
            user={user} online={true}
            onClose={() => setPreviewSelf(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}