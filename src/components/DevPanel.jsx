/**
 * DevPanel — administration console (administrators only).
 * --------------------------------------------------------------------------
 * Opened from the logo (triple-click + code) and gated on an admin uid, which
 * is what the Firestore rules actually enforce: showing these controls to
 * anyone else would only produce writes the server refuses.
 *
 * What it does:
 *   - Stats   : live figures derived from the public `leaderboard` collection
 *   - Users   : inspect and adjust a player's XP / level / streak
 *   - Groups  : inspect groups, and delete one with its messages
 *   - Themes  : unlock every theme for the current session (local only)
 *   - Config  : the announcement banner and the maintenance switch
 *
 * Two deliberate choices:
 *   - Text stays in French and is NOT routed through i18n. This console is
 *     seen by administrators only, never by a student, so translating it into
 *     four locales would be upkeep with no reader.
 *   - Surfaces use the theme tokens so the console follows the app's theme,
 *     but the chrome keeps a fixed orange: this is a destructive surface and
 *     it should never blend into the ordinary UI.
 *
 * Every write reports its failure (`reportSaveError`) instead of being
 * swallowed — a silent no-op is the worst possible outcome for an admin tool.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  collection, getDocs, getCountFromServer, doc, updateDoc, deleteDoc,
  getDoc, setDoc, writeBatch, query, limit as qLimit,
} from 'firebase/firestore';
import {
  BarChart3, Users as UsersIcon, MessageSquare, Palette, Settings,
  RefreshCw, Search, Copy, Trash2, Save, X, AlertTriangle, Megaphone, Wrench,
} from 'lucide-react';
import { db } from '../firebase/config';
import { THEMES, FONTS } from '../themes/themes';
import { BADGES } from '../data/badges';
import { levelFromXp } from '../data/levels';
import { reportSaveError } from '../lib/notify';
import { useTranslation } from '../i18n';

/** Console chrome colour — intentionally outside the theme palette. */
const DEV = '#ff6400';

const fmt = n => (Number(n) || 0).toLocaleString('fr-FR');

/** ISO day key for a Firestore ISO string, or '' when absent. */
const dayOf = iso => (typeof iso === 'string' ? iso.slice(0, 10) : '');

/**
 * How many members a group has. `members` is a MAP (uid → info) and
 * `memberIds` the array — reading `.length` off the map, as this panel used
 * to, always yielded 0.
 */
function memberCount(g) {
  if (Array.isArray(g?.memberIds)) return g.memberIds.length;
  if (g?.members && typeof g.members === 'object') return Object.keys(g.members).length;
  return 0;
}

// ── Shared bits ─────────────────────────────────────────────────────────────

const inputStyle = {
  padding: '7px 10px', borderRadius: 8, outline: 'none', boxSizing: 'border-box',
  border: '1px solid var(--border-strong)', background: 'var(--bg-input)',
  color: 'var(--text-primary)', fontSize: '.82rem', fontFamily: 'inherit',
};

function StatCard({ label, value, color = 'var(--accent)', sub }) {
  return (
    <div style={{
      padding: 14, borderRadius: 12, textAlign: 'center',
      background: 'var(--bg-card)', border: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: '1.5rem', fontWeight: 900, color, lineHeight: 1.1, wordBreak: 'break-word' }}>
        {value}
      </div>
      <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginTop: 5 }}>{label}</div>
      {sub && <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', opacity: .7, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Chip({ children, color = 'var(--accent)' }) {
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 20, fontSize: '.62rem', fontWeight: 700,
      background: 'var(--accent-subtle)', color, border: '1px solid var(--border)',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function Spinner({ label = 'Chargement…' }) {
  return (
    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2.5rem', fontSize: '.82rem' }}>
      {label}
    </div>
  );
}

function Empty({ children }) {
  return (
    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2.5rem', fontSize: '.82rem' }}>
      {children}
    </div>
  );
}

/** Small icon+label button used across the console. */
function ToolButton({ icon: Icon, children, onClick, disabled, tone }) {
  return (
    <motion.button
      whileHover={disabled ? {} : { scale: 1.03 }} whileTap={disabled ? {} : { scale: .97 }}
      onClick={onClick} disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
        borderRadius: 9, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .5 : 1,
        border: `1px solid ${tone || 'var(--border-strong)'}`, background: 'var(--bg-card)',
        color: tone || 'var(--text-secondary)', fontSize: '.74rem', fontWeight: 700,
      }}>
      {Icon && <Icon size={13} strokeWidth={2.2} />}
      {children}
    </motion.button>
  );
}

/**
 * Irreversible action guard. The operator must type the exact confirmation
 * word before the button arms — a single mis-click cannot destroy anything.
 */
function DangerZone({ title, description, confirmWord, actionLabel, onConfirm, busy }) {
  const [typed, setTyped] = useState('');
  const armed = typed.trim() === confirmWord;

  return (
    <div style={{
      marginTop: 'auto', padding: 12, borderRadius: 12,
      background: 'var(--bg-card)', border: '1px solid var(--danger)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <AlertTriangle size={13} strokeWidth={2.4} style={{ color: 'var(--danger)' }} />
        <span style={{ fontSize: '.7rem', fontWeight: 800, color: 'var(--danger)' }}>{title}</span>
      </div>
      <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 8 }}>
        {description}
      </div>
      <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', marginBottom: 5 }}>
        Tape <b style={{ color: 'var(--danger)' }}>{confirmWord}</b> pour confirmer.
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={typed} onChange={e => setTyped(e.target.value)}
          placeholder={confirmWord} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
        <ToolButton icon={Trash2} tone="var(--danger)" disabled={!armed || busy}
          onClick={() => { onConfirm(); setTyped(''); }}>
          {busy ? '…' : actionLabel}
        </ToolButton>
      </div>
    </div>
  );
}

// ── Data loading ────────────────────────────────────────────────────────────

/**
 * Fetch once on mount, plus a manual refresh.
 *
 * The fetchers are plain async functions declared at module level, and the
 * effect's synchronous path performs NO setState — every state change happens
 * in a promise callback. That is what keeps mounting from triggering the
 * cascading re-render React warns about.
 */
function useLoader(fetcher, context) {
  const [state, setState] = useState({ data: null, loading: true, error: false });

  const run = useCallback(() => fetcher()
    .then(data => setState({ data, loading: false, error: false }))
    .catch(e => {
      reportSaveError(e, context);
      setState({ data: null, loading: false, error: true });
    }), [fetcher, context]);

  useEffect(() => { run(); }, [run]);

  // From an event handler, so a synchronous setState is fine here.
  const refresh = useCallback(() => {
    setState(s => ({ ...s, loading: true }));
    run();
  }, [run]);

  /** Patch the loaded data locally (after a delete, say) without refetching. */
  const patch = useCallback(fn => setState(s => ({ ...s, data: fn(s.data) })), []);

  return { ...state, refresh, patch };
}

/** All leaderboard documents, richest first. */
async function fetchLeaderboard() {
  const snap = await getDocs(collection(db, 'leaderboard'));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => (b.xp || 0) - (a.xp || 0));
  return list;
}

/**
 * Console figures. Computed here rather than during render because it reads
 * the clock — a render must stay pure.
 */
async function fetchStats() {
  const users = await fetchLeaderboard();
  const today = new Date().toISOString().slice(0, 10);
  const now = Date.now();

  const totalXp = users.reduce((s, u) => s + (Number(u.xp) || 0), 0);
  // `updatedAt` is stamped by every leaderboard sync, i.e. by every finished
  // focus session — the closest thing to an activity signal this doc carries.
  const activeToday = users.filter(u => dayOf(u.updatedAt) === today).length;
  const activeWeek = users.filter(u => {
    const d = dayOf(u.updatedAt);
    return d ? (now - new Date(d).getTime()) < 7 * 86400e3 : false;
  }).length;
  // xpToday only means anything while its stored day key is still today.
  const xpToday = users.reduce(
    (s, u) => s + (u.todayKey === today ? (Number(u.xpToday) || 0) : 0), 0);

  return {
    total: users.length,
    totalXp,
    activeToday,
    activeWeek,
    xpToday,
    avgXp: users.length ? Math.round(totalXp / users.length) : 0,
    top: users.slice(0, 5),
  };
}

/** All group documents, biggest first. Messages are NOT read (see TabGroups). */
async function fetchGroups() {
  const snap = await getDocs(collection(db, 'groups'));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => memberCount(b) - memberCount(a));
  return list;
}

/** The app-wide config document, with safe defaults when it does not exist. */
async function fetchConfig() {
  const snap = await getDoc(doc(db, 'config', 'app'));
  const d = snap.exists() ? snap.data() : {};
  return {
    systemMessage: typeof d.systemMessage === 'string' ? d.systemMessage : '',
    maintenance: d.maintenance === true,
  };
}

/** Two-column master/detail layout shared by the Users and Groups tabs. */
function MasterDetail({ list, detail }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
      gap: 12, height: '100%', minHeight: 0,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', minHeight: 0 }}>
        {list}
      </div>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', minHeight: 0,
        padding: 14, borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)',
      }}>
        {detail}
      </div>
    </div>
  );
}

// ── Tab: Stats ──────────────────────────────────────────────────────────────

/**
 * Figures derived from `leaderboard`, the only collection an admin can read in
 * bulk. Every metric below maps to a field that document really carries —
 * the previous version counted `lastSeen` and a `theme` that are never
 * written, so "active today" and "popular theme" were permanently wrong.
 */
function TabStats() {
  const { data: stats, loading, error, refresh } = useLoader(fetchStats, 'DevPanel — stats');

  if (loading) return <Spinner />;
  if (error || !stats) return <Empty>Lecture impossible. Vérifie tes droits et ta connexion.</Empty>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <ToolButton icon={RefreshCw} onClick={refresh}>Rafraîchir</ToolButton>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
        <StatCard label="Comptes classés" value={fmt(stats.total)} />
        <StatCard label="XP total généré" value={fmt(stats.totalXp)} color="var(--xp-color)" />
        <StatCard label="Actifs aujourd'hui" value={fmt(stats.activeToday)} color="#27AE60"
          sub="session terminée aujourd'hui" />
        <StatCard label="Actifs sur 7 jours" value={fmt(stats.activeWeek)} color="#27AE60" />
        <StatCard label="XP gagné aujourd'hui" value={fmt(stats.xpToday)} color="var(--xp-color)" />
        <StatCard label="XP moyen par compte" value={fmt(stats.avgXp)} color="#9B59B6" />
      </div>

      <div>
        <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
          Top 5
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {stats.top.length === 0 && <Empty>Aucun compte classé.</Empty>}
          {stats.top.map((u, i) => (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '7px 11px',
              borderRadius: 9, background: 'var(--bg-card)', border: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: '.7rem', fontWeight: 800, color: 'var(--text-muted)', width: 18 }}>
                {i + 1}
              </span>
              <span style={{
                flex: 1, minWidth: 0, fontSize: '.8rem', fontWeight: 600, color: 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {u.pseudo || '—'}
              </span>
              {u.hidden && <Chip color="var(--text-muted)">masqué</Chip>}
              <span style={{ fontSize: '.74rem', fontWeight: 800, color: 'var(--xp-color)' }}>
                {fmt(u.xp)} XP
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Users ──────────────────────────────────────────────────────────────

function TabUsers() {
  const { data, loading, refresh, patch } = useLoader(fetchLeaderboard, 'DevPanel — users');
  const users = data || [];
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [form, setForm] = useState({ xp: 0, level: 1, streak: 0 });
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  async function openUser(uid) {
    setDetailLoading(true);
    setSelected({ uid });
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'data', 'main'));
      const d = snap.exists() ? snap.data() : {};
      setSelected({ uid, exists: snap.exists(), ...d });
      setForm({ xp: d.xp || 0, level: d.level || 1, streak: d.streak || 0 });
    } catch (e) {
      reportSaveError(e, 'DevPanel — user detail');
      setSelected({ uid, exists: false });
    }
    setDetailLoading(false);
  }

  /**
   * Write the adjusted values back. The level is DERIVED from the XP with the
   * same function the app uses, so an admin edit can no longer leave a player
   * on a level their XP does not support.
   */
  async function saveUser() {
    if (!selected?.uid) return;
    setSaving(true);
    const xp = Math.max(0, parseInt(form.xp, 10) || 0);
    const streak = Math.max(0, parseInt(form.streak, 10) || 0);
    const level = levelFromXp(xp).level;
    try {
      await updateDoc(doc(db, 'users', selected.uid, 'data', 'main'), { xp, level, streak });
      // Keep the public standing in step; it carries xp only.
      await setDoc(doc(db, 'leaderboard', selected.uid), { xp }, { merge: true });
      patch(list => (list || []).map(u => u.id === selected.uid ? { ...u, xp } : u));
      setSelected(s => ({ ...s, xp, level, streak }));
      setForm(f => ({ ...f, level }));
    } catch (e) { reportSaveError(e, 'DevPanel — save user'); }
    setSaving(false);
  }

  async function removeFromLeaderboard(uid) {
    setBusy(true);
    try {
      await deleteDoc(doc(db, 'leaderboard', uid));
      patch(list => (list || []).filter(u => u.id !== uid));
      if (selected?.uid === uid) setSelected(null);
    } catch (e) { reportSaveError(e, 'DevPanel — remove from leaderboard'); }
    setBusy(false);
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? users.filter(u => (u.pseudo || '').toLowerCase().includes(q) || u.id.toLowerCase().includes(q))
    : users;

  const badgeName = id => BADGES.find(b => b.id === id)?.ico || '•';

  return (
    <MasterDetail
      list={
        <>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <Search size={13} style={{
                position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-muted)', pointerEvents: 'none',
              }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Pseudo ou uid…"
                style={{ ...inputStyle, width: '100%', paddingLeft: 28 }} />
            </div>
            <ToolButton icon={RefreshCw} onClick={refresh} />
          </div>

          {loading ? <Spinner /> : filtered.length === 0 ? (
            <Empty>Aucun compte ne correspond.</Empty>
          ) : filtered.map(u => {
            const active = selected?.uid === u.id;
            return (
              <motion.div key={u.id} whileHover={{ x: 2 }} onClick={() => openUser(u.id)}
                style={{
                  padding: '9px 11px', borderRadius: 10, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: active ? 'var(--accent-subtle)' : 'var(--bg-card)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: `hsl(${(u.id.charCodeAt(0) * 47) % 360},60%,50%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '.75rem', fontWeight: 700, color: '#fff',
                }}>
                  {(u.pseudo || '?')[0].toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '.8rem', fontWeight: 600, color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {u.pseudo || '—'}
                  </div>
                  <div style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>
                    {fmt(u.xp)} XP{u.updatedAt ? ` · vu ${dayOf(u.updatedAt)}` : ''}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </>
      }
      detail={
        !selected ? (
          <Empty>Sélectionne un compte.</Empty>
        ) : detailLoading ? (
          <Spinner />
        ) : (
          <>
            <div>
              <div style={{ fontSize: '.9rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {users.find(u => u.id === selected.uid)?.pseudo || '—'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <code style={{
                  fontSize: '.62rem', color: 'var(--text-muted)', wordBreak: 'break-all',
                  flex: 1, minWidth: 0,
                }}>
                  {selected.uid}
                </code>
                <ToolButton icon={Copy}
                  onClick={() => navigator.clipboard?.writeText(selected.uid).catch(() => {})} />
              </div>
            </div>

            {selected.exists === false && (
              <div style={{
                padding: 10, borderRadius: 9, fontSize: '.7rem', lineHeight: 1.5,
                background: 'var(--bg-input)', border: '1px solid var(--danger)', color: 'var(--danger)',
              }}>
                Ce compte est classé mais n'a pas de document <code>data/main</code> —
                rien à modifier ici.
              </div>
            )}

            {selected.exists !== false && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { k: 'xp', label: 'XP', color: 'var(--xp-color)' },
                  { k: 'streak', label: 'Série (jours)', color: '#E67E22' },
                ].map(({ k, label, color }) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '.7rem', color: 'var(--text-muted)', width: 90, flexShrink: 0 }}>
                      {label}
                    </span>
                    <input type="number" value={form[k]}
                      onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                      style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                    <span style={{ fontSize: '.66rem', color, fontWeight: 700, width: 70, textAlign: 'right' }}>
                      {fmt(selected[k] || 0)}
                    </span>
                  </div>
                ))}

                <div style={{ fontSize: '.66rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Niveau calculé depuis l'XP : <b style={{ color: 'var(--accent)' }}>
                    {levelFromXp(Math.max(0, parseInt(form.xp, 10) || 0)).level}
                  </b> (actuel : {selected.level || 1}). Il est réécrit à l'enregistrement,
                  pour qu'XP et niveau ne puissent pas diverger.
                </div>

                <ToolButton icon={Save} onClick={saveUser} disabled={saving} tone="var(--accent)">
                  {saving ? 'Enregistrement…' : 'Appliquer'}
                </ToolButton>
              </div>
            )}

            {selected.earnedBadges?.length > 0 && (
              <div>
                <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                  {selected.earnedBadges.length} badge(s)
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {selected.earnedBadges.map(b => (
                    <Chip key={b}>{badgeName(b)} {b}</Chip>
                  ))}
                </div>
              </div>
            )}

            {selected.subjects?.length > 0 && (
              <div>
                <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                  {selected.subjects.length} matière(s)
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {selected.subjects.map((s, i) => <Chip key={i} color={s.color}>{s.name}</Chip>)}
                </div>
              </div>
            )}

            <DangerZone
              title="Retirer du classement"
              description="Supprime uniquement le document leaderboard. Les données du compte (planning, flashcards, XP) ne sont pas touchées ; elles reviendront au classement à la prochaine session terminée."
              confirmWord="RETIRER"
              actionLabel="Retirer"
              busy={busy}
              onConfirm={() => removeFromLeaderboard(selected.uid)}
            />
          </>
        )
      }
    />
  );
}

// ── Tab: Groups ─────────────────────────────────────────────────────────────

function TabGroups() {
  // Only the group documents are read. The previous version downloaded EVERY
  // message of EVERY group just to show a count — on a live app that is a very
  // expensive page load. Counting is now on demand and aggregated server-side
  // (see `countMessages`).
  const { data, loading, refresh, patch } = useLoader(fetchGroups, 'DevPanel — groups');
  const groups = data || [];
  const [selected, setSelected] = useState(null);
  const [counting, setCounting] = useState(false);
  const [msgCount, setMsgCount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  function openGroup(g) {
    setSelected(g);
    setMsgCount(null);
  }

  /** Server-side count: one aggregate query, no documents transferred. */
  async function countMessages(gid) {
    setCounting(true);
    try {
      const snap = await getCountFromServer(collection(db, 'groups', gid, 'messages'));
      setMsgCount(snap.data().count);
    } catch (e) { reportSaveError(e, 'DevPanel — count messages'); }
    setCounting(false);
  }

  /**
   * Delete a group AND its messages. Deleting only the parent document (what
   * this panel used to do) leaves the whole conversation stranded in the
   * database, invisible and unbillable-to-nobody but still stored.
   */
  async function deleteGroup(gid) {
    setBusy(true);
    try {
      // Firestore has no recursive delete from the client: page through the
      // subcollection in batches until it is empty.
      for (;;) {
        const snap = await getDocs(query(collection(db, 'groups', gid, 'messages'), qLimit(300)));
        if (snap.empty) break;
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        if (snap.size < 300) break;
      }
      await deleteDoc(doc(db, 'groups', gid));
      patch(list => (list || []).filter(g => g.id !== gid));
      setSelected(null);
      setMsgCount(null);
    } catch (e) { reportSaveError(e, 'DevPanel — delete group'); }
    setBusy(false);
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? groups.filter(g => (g.name || '').toLowerCase().includes(q) || (g.code || '').toLowerCase().includes(q))
    : groups;

  return (
    <MasterDetail
      list={
        <>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <Search size={13} style={{
                position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-muted)', pointerEvents: 'none',
              }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Nom ou code…"
                style={{ ...inputStyle, width: '100%', paddingLeft: 28 }} />
            </div>
            <ToolButton icon={RefreshCw} onClick={refresh} />
          </div>

          {loading ? <Spinner /> : filtered.length === 0 ? (
            <Empty>Aucun groupe.</Empty>
          ) : filtered.map(g => {
            const active = selected?.id === g.id;
            return (
              <motion.div key={g.id} whileHover={{ x: 2 }} onClick={() => openGroup(g)}
                style={{
                  padding: '9px 11px', borderRadius: 10, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: active ? 'var(--accent-subtle)' : 'var(--bg-card)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                }}>
                <div style={{ fontSize: '1.3rem', flexShrink: 0 }}>{g.emoji || '👥'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '.82rem', fontWeight: 600, color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {g.name || 'Sans nom'}
                  </div>
                  <div style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>
                    {memberCount(g)} membre(s)
                    {g.createdAt && ` · ${dayOf(g.createdAt) || new Date(g.createdAt).toLocaleDateString('fr-FR')}`}
                  </div>
                </div>
                {g.private && <Chip color="var(--danger)">privé</Chip>}
              </motion.div>
            );
          })}
        </>
      }
      detail={
        !selected ? (
          <Empty>Sélectionne un groupe.</Empty>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: '1.8rem' }}>{selected.emoji || '👥'}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '.9rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {selected.name || 'Sans nom'}
                </div>
                <div style={{ fontSize: '.64rem', color: 'var(--text-muted)' }}>
                  code {selected.code || '—'}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <StatCard label="Membres" value={memberCount(selected)} />
              <StatCard label="Messages"
                value={msgCount === null ? '—' : fmt(msgCount)}
                color="#9B59B6"
                sub={msgCount === null ? 'non compté' : undefined} />
            </div>

            <ToolButton icon={MessageSquare} onClick={() => countMessages(selected.id)} disabled={counting}>
              {counting ? 'Comptage…' : 'Compter les messages'}
            </ToolButton>

            {selected.members && typeof selected.members === 'object' && (
              <div>
                <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                  Membres
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {Object.entries(selected.members).map(([uid, m]) => (
                    <Chip key={uid} color={uid === selected.createdBy ? 'var(--accent)' : 'var(--text-secondary)'}>
                      {m?.pseudo || uid.slice(0, 6)}{uid === selected.createdBy ? ' · hôte' : ''}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            <DangerZone
              title="Supprimer le groupe"
              description="Supprime le groupe ET tous ses messages, définitivement. Les membres perdront la conversation."
              confirmWord="SUPPRIMER"
              actionLabel="Supprimer"
              busy={busy}
              onConfirm={() => deleteGroup(selected.id)}
            />
          </>
        )
      }
    />
  );
}

// ── Tab: Themes ─────────────────────────────────────────────────────────────

function TabThemes({ onUnlockAll, allUnlocked }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
          {THEMES.length} thèmes · {FONTS.length} polices
        </div>
        <ToolButton icon={Palette} onClick={onUnlockAll} tone={allUnlocked ? '#27AE60' : 'var(--accent)'}>
          {allUnlocked ? 'Débloqué pour la session' : 'Tout débloquer (session)'}
        </ToolButton>
      </div>
      <div style={{ fontSize: '.66rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        Local à cet onglet : rien n'est écrit en base, et le déblocage disparaît au rechargement.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 8 }}>
        {THEMES.map(th => (
          <div key={th.id} style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div style={{ background: th.vars['--bg-base'], padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', gap: 3 }}>
                {[th.vars['--accent'], '#27AE60', '#F1C40F'].map((c, i) => (
                  <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: c }} />
                ))}
              </div>
              <div style={{ fontSize: '.68rem', fontWeight: 700, color: th.vars['--text-primary'] || '#fff' }}>
                {th.emoji} {th.name}
              </div>
              <div style={{ fontSize: '.58rem', color: th.vars['--text-muted'] || 'rgba(255,255,255,.4)' }}>
                {th.minLevel ? `niveau ${th.minLevel}` : 'libre'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Config ─────────────────────────────────────────────────────────────

/**
 * Announcement banner + maintenance switch. These now genuinely drive the app
 * (see `lib/appConfig` and `App.jsx`); until this pass the document was
 * written and never read, so both controls did nothing at all.
 */
function TabConfig() {
  const { data, loading } = useLoader(fetchConfig, 'DevPanel — read config');
  // Edits live in a draft that starts empty, so the loaded values can be shown
  // without copying them into state from an effect.
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const current = draft || data || { systemMessage: '', maintenance: false };
  const msg = current.systemMessage;
  const maintenance = current.maintenance;
  const setMsg = v => setDraft({ ...current, systemMessage: v });
  const setMaintenance = fn =>
    setDraft({ ...current, maintenance: typeof fn === 'function' ? fn(maintenance) : fn });

  async function save() {
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'app'),
        { systemMessage: msg, maintenance }, { merge: true });
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch (e) { reportSaveError(e, 'DevPanel — save config'); }
    setSaving(false);
  }

  if (loading) return <Spinner />;

  const card = {
    borderRadius: 12, padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: 10,
    background: 'var(--bg-card)', border: '1px solid var(--border)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 520 }}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Megaphone size={14} strokeWidth={2.2} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Message système
          </span>
        </div>
        <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          S'affiche en bandeau en haut de l'app, pour tout le monde. Chacun peut le masquer ;
          il réapparaît dès que tu modifies le texte. Laisse vide pour ne rien afficher.
        </div>
        <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={3}
          placeholder="ex : maintenance prévue ce soir à 22 h"
          style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
      </div>

      <div style={{ ...card, border: `1px solid ${maintenance ? 'var(--danger)' : 'var(--border)'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Wrench size={14} strokeWidth={2.2} style={{ color: maintenance ? 'var(--danger)' : 'var(--text-muted)' }} />
              <span style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Mode maintenance
              </span>
            </div>
            <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
              Ferme l'app à tous les comptes non administrateurs. Toi, tu continues d'entrer
              et un bandeau rouge te rappelle qu'elle est fermée.
            </div>
          </div>
          <motion.button whileTap={{ scale: .9 }} onClick={() => setMaintenance(m => !m)}
            aria-pressed={maintenance} aria-label="Mode maintenance"
            style={{
              width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
              position: 'relative', flexShrink: 0,
              background: maintenance ? 'var(--danger)' : 'var(--bg-input)',
              transition: 'background .2s',
            }}>
            <motion.div animate={{ x: maintenance ? 22 : 2 }}
              style={{ position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%', background: '#fff' }} />
          </motion.button>
        </div>

        {maintenance && (
          <div style={{
            padding: 9, borderRadius: 8, fontSize: '.68rem', lineHeight: 1.5,
            background: 'var(--bg-input)', color: 'var(--danger)',
          }}>
            Une fois enregistré, tes utilisateurs ne pourront plus ouvrir l'app.
            Pense à écrire un message système pour leur dire quand revenir.
          </div>
        )}
      </div>

      <ToolButton icon={Save} onClick={save} disabled={saving}
        tone={saved ? '#27AE60' : 'var(--accent)'}>
        {saving ? 'Enregistrement…' : saved ? 'Enregistré' : 'Appliquer'}
      </ToolButton>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

const TABS = [
  { v: 'stats',  l: 'Stats',        Icon: BarChart3 },
  { v: 'users',  l: 'Utilisateurs', Icon: UsersIcon },
  { v: 'groups', l: 'Groupes',      Icon: MessageSquare },
  { v: 'themes', l: 'Thèmes',       Icon: Palette },
  { v: 'config', l: 'Config',       Icon: Settings },
];

export default function DevPanel({ onClose, userXp, onUnlockAll }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('stats');
  const [allUnlocked, setAllUnlocked] = useState(false);

  // Escape closes the console, like every other modal in the app.
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, padding: '1rem',
        background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      <motion.div initial={{ scale: .95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: .96, y: 16 }}
        style={{
          width: 940, maxWidth: '100%', height: '86vh', borderRadius: 20,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: 'var(--bg-modal)', border: `1px solid ${DEV}55`,
          boxShadow: `0 32px 80px ${DEV}22`,
        }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          padding: '0.9rem 1.3rem', borderBottom: `1px solid ${DEV}33`,
          background: `${DEV}0d`,
        }}>
          <Wrench size={18} strokeWidth={2.2} style={{ color: DEV, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '.95rem', fontWeight: 800, color: DEV }}>Console d'administration</div>
            <div style={{ fontSize: '.64rem', color: 'var(--text-muted)' }}>
              Accès administrateur · les écritures sont réelles et immédiates
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: '.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {fmt(userXp)} XP
            </span>
            <button onClick={onClose} aria-label={t('common.close')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent', border: `1px solid ${DEV}55`, borderRadius: 8,
                color: DEV, cursor: 'pointer', padding: '5px 8px',
              }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', flexShrink: 0, overflowX: 'auto',
          borderBottom: '1px solid var(--border)', background: 'var(--bg-card)',
        }}>
          {TABS.map(({ v, l, Icon }) => (
            <button key={v} onClick={() => setTab(v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                padding: '10px 16px', border: 'none', cursor: 'pointer', background: 'transparent',
                fontSize: '.76rem', fontWeight: 700,
                color: tab === v ? DEV : 'var(--text-muted)',
                borderBottom: `2px solid ${tab === v ? DEV : 'transparent'}`,
              }}>
              <Icon size={13} strokeWidth={2.2} />
              {l}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '1.1rem 1.3rem' }}>
          {tab === 'stats' && <TabStats />}
          {tab === 'users' && <TabUsers />}
          {tab === 'groups' && <TabGroups />}
          {tab === 'themes' && (
            <TabThemes allUnlocked={allUnlocked}
              onUnlockAll={() => { setAllUnlocked(true); onUnlockAll(); }} />
          )}
          {tab === 'config' && <TabConfig />}
        </div>
      </motion.div>
    </motion.div>
  );
}
