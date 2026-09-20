/**
 * DevLive — "En ligne", the live tab of the administration console.
 * --------------------------------------------------------------------------
 * Answers two questions an admin actually has:
 *   1. WHO is on the app right now — the Realtime Database `presence` node,
 *      live, with how long each session has been running, the name from the
 *      public `leaderboard` document and the XP earned today;
 *   2. WHAT do they use — click an account to see its usage read from its main
 *      document (subjects, planning, flashcards, reviews, journal, to-do…) and
 *      its latest focus sessions; or scan every account at once to get the
 *      adoption table at the bottom.
 *
 * Costs, because this console reads real data:
 *   - presence and group sessions are realtime listeners (tiny nodes);
 *   - the leaderboard is one collection read, refreshed on demand;
 *   - a selected account is ONE document read;
 *   - the adoption scan reads one document per account, so it is behind a
 *     button that says how many that is, never automatic.
 *
 * What it cannot see (stated in the UI, so nothing is read as "unused"):
 *   documents, PDF annotations and notification settings live in the worker,
 *   and the Réserve lives in another document — see lib/adminUsage.js.
 *
 * French only, administrators only, like the rest of the console.
 */

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ref as dbRef, onValue } from 'firebase/database';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { Activity, RefreshCw, Radio, Copy, Search, ScanSearch, Users as UsersIcon } from 'lucide-react';
import { db, rtdb } from '../firebase/config';
import { reportSaveError } from '../lib/notify';
import { fmt, inputStyle } from '../lib/devConsole';
import { StatCard, Chip, Spinner, Empty, ToolButton } from './devUI';
import { usageProfile, featureAdoption, spreadOf, sinceLabel, forLabel } from '../lib/adminUsage';

/** How often the "depuis X min" labels are refreshed. */
const TICK_MS = 30_000;
/** Safety net on the adoption scan: one document read per account. */
const SCAN_LIMIT = 300;
/** Accounts read at the same time during a scan. */
const SCAN_CHUNK = 8;

const DAY_MS = 86_400_000;
const dayOf = iso => (typeof iso === 'string' ? iso.slice(0, 10) : '');

/** Deterministic avatar colour — the same formula the app uses everywhere. */
const avatarHue = uid => (uid?.charCodeAt(0) * 47 || 0) % 360;

function Avatar({ uid, pseudo, photo, size = 28 }) {
  if (photo) {
    return <img src={photo} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `hsl(${avatarHue(uid)},60%,50%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.42, fontWeight: 700, color: '#fff',
    }}>
      {(pseudo || '?')[0].toUpperCase()}
    </div>
  );
}

/** One row of the left column. */
function AccountRow({ uid, pseudo, photo, caption, live, active, onClick }) {
  return (
    <motion.div whileHover={{ x: 2 }} onClick={onClick}
      style={{
        padding: '8px 11px', borderRadius: 10, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 10,
        background: active ? 'var(--accent-subtle)' : 'var(--bg-card)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
      }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Avatar uid={uid} pseudo={pseudo} photo={photo} />
        {live && (
          <span aria-hidden="true" style={{
            position: 'absolute', right: -1, bottom: -1, width: 9, height: 9, borderRadius: '50%',
            background: '#27AE60', border: '2px solid var(--bg-modal)',
          }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '.8rem', fontWeight: 600, color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {pseudo || '—'}
        </div>
        <div style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>{caption}</div>
      </div>
    </motion.div>
  );
}

/** A labelled figure of the per-account panel. */
function Metric({ label, value, muted }) {
  return (
    <div style={{ padding: '7px 9px', borderRadius: 9, background: 'var(--bg-card-hover)' }}>
      <div style={{ fontSize: '.86rem', fontWeight: 800, color: muted ? 'var(--text-muted)' : 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: '.58rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>{label}</div>
    </div>
  );
}

/** One line of the adoption table. */
function AdoptionBar({ label, count, pct, total }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 170, flexShrink: 0, fontSize: '.72rem', color: 'var(--text-secondary)' }}>{label}</span>
      <div style={{ flex: 1, height: 9, borderRadius: 9, background: 'var(--bg-card-hover)', overflow: 'hidden' }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: .5, ease: 'easeOut' }}
          style={{ height: '100%', borderRadius: 9, background: pct >= 50 ? '#27AE60' : pct >= 20 ? 'var(--accent)' : 'var(--danger)' }} />
      </div>
      <span style={{ width: 92, flexShrink: 0, textAlign: 'right', fontSize: '.68rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
        {count}/{total} · {pct} %
      </span>
    </div>
  );
}

export default function DevLive() {
  const [presence, setPresence] = useState({});      // uid → startedAt
  const [groupLive, setGroupLive] = useState(null);  // { sessions, participants } | null
  const [accounts, setAccounts] = useState(null);    // leaderboard documents
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [search, setSearch] = useState('');

  const [selected, setSelected] = useState(null);    // { uid, main, usage } | { uid, missing }
  const [detailLoading, setDetailLoading] = useState(false);

  const [scan, setScan] = useState(null);            // { done, total, profiles } | null

  // ── Who is online, live ──
  useEffect(() => {
    const unsub = onValue(dbRef(rtdb, 'presence'), snap => {
      const map = {};
      for (const entry of Object.values(snap.val() || {})) {
        if (entry?.uid) map[entry.uid] = Number(entry.startedAt) || 0;
      }
      setPresence(map);
    }, () => setPresence({}));
    return () => unsub();
  }, []);

  // ── Group focus sessions, live (silently skipped if the rules refuse) ──
  useEffect(() => {
    const unsub = onValue(dbRef(rtdb, 'groupSessions'), snap => {
      const groups = Object.values(snap.val() || {});
      const running = groups.filter(g => g?.current && !g.current.endedAt);
      setGroupLive({
        sessions: running.length,
        participants: running.reduce((n, g) => n + Object.keys(g.participants || {}).length, 0),
      });
    }, () => setGroupLive(null));
    return () => unsub();
  }, []);

  // ── Names, XP and last-seen, from the public leaderboard ──
  // The effect's synchronous path sets no state: everything happens in a
  // promise callback, which is what keeps mounting from cascading renders.
  const loadAccounts = useCallback(() => {
    getDocs(collection(db, 'leaderboard'))
      .then(snap => {
        setAccounts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      })
      .catch(e => {
        reportSaveError(e, 'DevPanel — comptes');
        setAccounts([]);
        setLoading(false);
      });
  }, []);
  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  // From a click, so a synchronous setState is fine here.
  const refreshAccounts = () => { setLoading(true); loadAccounts(); };

  // ── A clock for the "depuis X" labels ──
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // ── One account's usage ──
  function openAccount(uid) {
    setDetailLoading(true);
    setSelected({ uid });
    getDoc(doc(db, 'users', uid, 'data', 'main'))
      .then(snap => {
        const main = snap.exists() ? snap.data() : null;
        setSelected({ uid, main, usage: main ? usageProfile(main) : null });
        setDetailLoading(false);
      })
      .catch(e => {
        reportSaveError(e, 'DevPanel — compte');
        setSelected({ uid, main: null, usage: null });
        setDetailLoading(false);
      });
  }

  // ── Every account's usage, on demand ──
  async function runScan() {
    const uids = (accounts || []).map(a => a.id).slice(0, SCAN_LIMIT);
    setScan({ done: 0, total: uids.length, profiles: [] });
    const profiles = [];
    for (let i = 0; i < uids.length; i += SCAN_CHUNK) {
      const chunk = uids.slice(i, i + SCAN_CHUNK);
      const results = await Promise.allSettled(chunk.map(uid => getDoc(doc(db, 'users', uid, 'data', 'main'))));
      for (const res of results) {
        if (res.status === 'fulfilled' && res.value.exists()) profiles.push(usageProfile(res.value.data()));
      }
      setScan({ done: Math.min(i + SCAN_CHUNK, uids.length), total: uids.length, profiles: [...profiles] });
    }
  }

  if (loading && !accounts) return <Spinner />;

  const list = accounts || [];
  const byUid = new Map(list.map(a => [a.id, a]));
  const today = new Date().toISOString().slice(0, 10);

  const onlineUids = Object.keys(presence).sort((a, b) => (presence[a] || 0) - (presence[b] || 0));
  const activeToday = list.filter(a => dayOf(a.updatedAt) === today).length;
  const activeWeek = list.filter(a => {
    const d = dayOf(a.updatedAt);
    return d ? now - new Date(d).getTime() < 7 * DAY_MS : false;
  }).length;

  const q = search.trim().toLowerCase();
  const matches = a => !q || (a.pseudo || '').toLowerCase().includes(q) || a.id.toLowerCase().includes(q);

  // Last seen first; accounts that never finished a session go last.
  const recent = list
    .filter(a => !presence[a.id] && matches(a))
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .slice(0, 25);

  const scanDone = scan && scan.done >= scan.total && scan.total > 0;
  const adoption = scanDone ? featureAdoption(scan.profiles) : [];
  const themes = scanDone ? spreadOf(scan.profiles, 'theme').slice(0, 5) : [];
  const langs = scanDone ? spreadOf(scan.profiles, 'lang') : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Live figures ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Radio size={14} strokeWidth={2.4} style={{ color: '#27AE60' }} />
        <span style={{ fontSize: '.74rem', fontWeight: 800, color: 'var(--text-primary)' }}>En direct</span>
        <span style={{ fontSize: '.66rem', color: 'var(--text-muted)' }}>
          la présence se met à jour toute seule · le reste à la demande
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <ToolButton icon={RefreshCw} onClick={refreshAccounts}>Rafraîchir</ToolButton>
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
        <StatCard label="En ligne maintenant" value={fmt(onlineUids.length)} color="#27AE60" />
        <StatCard label="Actifs aujourd'hui" value={fmt(activeToday)} color="#27AE60" sub="session terminée aujourd'hui" />
        <StatCard label="Actifs sur 7 jours" value={fmt(activeWeek)} />
        <StatCard label="Comptes classés" value={fmt(list.length)} />
        {groupLive && (
          <StatCard label="Sessions de groupe" value={fmt(groupLive.sessions)} color="var(--accent)"
            sub={`${fmt(groupLive.participants)} participant(s)`} />
        )}
      </div>

      {/* ── Who, and what they use ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.15fr)', gap: 12, alignItems: 'start' }}>

        {/* Left: online now, then last seen */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 460, overflowY: 'auto' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pseudo ou uid…"
              style={{ ...inputStyle, width: '100%', paddingLeft: 28 }} />
          </div>

          <div style={{ fontSize: '.66rem', fontWeight: 800, color: '#27AE60', marginTop: 2 }}>
            EN LIGNE ({onlineUids.length})
          </div>
          {onlineUids.length === 0 && (
            <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', padding: '6px 2px' }}>
              Personne sur l'app en ce moment.
            </div>
          )}
          {onlineUids.filter(uid => matches(byUid.get(uid) || { id: uid })).map(uid => {
            const acc = byUid.get(uid);
            const xpToday = acc && acc.todayKey === today ? Number(acc.xpToday) || 0 : 0;
            return (
              <AccountRow key={uid} uid={uid} pseudo={acc?.pseudo} live active={selected?.uid === uid}
                caption={`${forLabel(presence[uid], now)}${xpToday ? ` · +${fmt(xpToday)} XP aujourd'hui` : ''}`}
                onClick={() => openAccount(uid)} />
            );
          })}

          <div style={{ fontSize: '.66rem', fontWeight: 800, color: 'var(--text-muted)', marginTop: 8 }}>
            VUS RÉCEMMENT
          </div>
          {recent.length === 0 && <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', padding: '6px 2px' }}>Aucun compte.</div>}
          {recent.map(a => (
            <AccountRow key={a.id} uid={a.id} pseudo={a.pseudo} active={selected?.uid === a.id}
              caption={a.updatedAt ? `${sinceLabel(new Date(dayOf(a.updatedAt)).getTime(), now)} · ${fmt(a.xp)} XP` : `${fmt(a.xp)} XP`}
              onClick={() => openAccount(a.id)} />
          ))}
        </div>

        {/* Right: the selected account */}
        <div style={{ padding: 14, borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', minHeight: 240 }}>
          {!selected ? (
            <Empty>Choisis un compte pour voir ce qu'il utilise.</Empty>
          ) : detailLoading ? (
            <Spinner label="Lecture du compte…" />
          ) : !selected.usage ? (
            <Empty>Ce compte n'a pas de document de données.</Empty>
          ) : (
            <AccountDetail uid={selected.uid} main={selected.main} usage={selected.usage}
              online={!!presence[selected.uid]} startedAt={presence[selected.uid]} now={now}
              account={byUid.get(selected.uid)} />
          )}
        </div>
      </div>

      {/* ── Feature adoption ── */}
      <div style={{ padding: 14, borderRadius: 12, background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Activity size={14} strokeWidth={2.2} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: '.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>Ce qu'ils utilisent</span>
          <span style={{ marginLeft: 'auto' }}>
            <ToolButton icon={ScanSearch} onClick={runScan} disabled={!!scan && !scanDone}
              tone={scanDone ? undefined : 'var(--accent)'}>
              {scan && !scanDone ? `Analyse… ${scan.done}/${scan.total}` : `Analyser ${Math.min(list.length, SCAN_LIMIT)} comptes`}
            </ToolButton>
          </span>
        </div>
        <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Lit un document par compte (une seule fois, à la demande). Les documents importés, les
          annotations PDF, les notifications et la Réserve sont stockés ailleurs : ils ne comptent
          pas ici et leur absence ne veut pas dire qu'ils ne servent pas.
        </div>

        {!scan ? (
          <Empty>Lance l'analyse pour voir quelles fonctionnalités servent vraiment.</Empty>
        ) : !scanDone ? (
          <Spinner label={`Lecture des comptes… ${scan.done}/${scan.total}`} />
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {adoption.map(f => (
                <AdoptionBar key={f.id} label={f.label} count={f.count} pct={f.pct} total={scan.profiles.length} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', paddingTop: 4 }}>
              <div>
                <div style={{ fontSize: '.66rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: 5 }}>THÈMES</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {themes.map(x => <Chip key={x.value}>{x.value} · {x.count}</Chip>)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '.66rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: 5 }}>LANGUES</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {langs.map(x => <Chip key={x.value}>{x.value} · {x.count}</Chip>)}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The right-hand panel: one account, its usage and its latest sessions. */
function AccountDetail({ uid, main, usage, online, startedAt, now, account }) {
  const subjects = Array.isArray(main?.subjects) ? main.subjects : [];
  const nameOf = id => subjects.find(s => String(s.id) === String(id))?.name || '—';
  const sessions = (Array.isArray(main?.sessions) ? main.sessions : [])
    .filter(s => s && s.at)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 8);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Avatar uid={uid} pseudo={usage.pseudo || account?.pseudo} photo={main?.photoURL} size={38} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: '.9rem', fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {usage.pseudo || account?.pseudo || '—'}
            </span>
            {online
              ? <Chip color="#27AE60">en ligne · {forLabel(startedAt, now)}</Chip>
              : <Chip color="var(--text-muted)">hors ligne</Chip>}
          </div>
          <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{uid}</div>
        </div>
        <ToolButton icon={Copy} onClick={() => navigator.clipboard?.writeText(uid)}>uid</ToolButton>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(88px,1fr))', gap: 6 }}>
        <Metric label="XP" value={fmt(usage.xp)} />
        <Metric label="Série" value={usage.streak} muted={!usage.streak} />
        <Metric label="Heures focus" value={Math.round(usage.totalFocusHours * 10) / 10} muted={!usage.totalFocusHours} />
        <Metric label="Badges" value={usage.badges} muted={!usage.badges} />
        <Metric label="Matières" value={usage.subjects} muted={!usage.subjects} />
        <Metric label="Chapitres faits" value={`${usage.chaptersDone}/${usage.chapters}`} muted={!usage.chapters} />
        <Metric label="Blocs planning" value={`${usage.blocksDone}/${usage.blocks}`} muted={!usage.blocks} />
        <Metric label="Plan auto" value={usage.autoBlocks} muted={!usage.autoBlocks} />
        <Metric label="Flashcards" value={usage.cards} muted={!usage.cards} />
        <Metric label="Cartes suivies" value={usage.srCards} muted={!usage.srCards} />
        <Metric label="Journal" value={usage.journal} muted={!usage.journal} />
        <Metric label="To-do" value={`${usage.todosDone}/${usage.todos}`} muted={!usage.todos} />
        <Metric label="Examens datés" value={usage.exams} muted={!usage.exams} />
        <Metric label="Thème" value={usage.theme} />
        <Metric label="Langue" value={usage.lang} />
        <Metric label="Photo" value={usage.photo ? 'oui' : 'non'} muted={!usage.photo} />
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.68rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: 6 }}>
          <UsersIcon size={12} strokeWidth={2.4} />
          DERNIÈRES SESSIONS DE FOCUS
        </div>
        {sessions.length === 0 ? (
          <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Aucune session enregistrée.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {sessions.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.72rem', color: 'var(--text-secondary)' }}>
                <span style={{ width: 92, flexShrink: 0, color: 'var(--text-muted)' }}>{sinceLabel(Date.parse(s.at), now)}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.subjId ? nameOf(s.subjId) : 'sans matière'}
                </span>
                <strong style={{ color: 'var(--text-primary)' }}>{Number(s.mins) || 0} min</strong>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: '.6rem', color: 'var(--text-muted)', marginTop: 6 }}>
          Seules les 30 dernières sessions sont conservées par compte.
        </div>
      </div>
    </div>
  );
}
