/**
 * NotificationSettings — "Reminders & notifications" card (Profile page).
 * --------------------------------------------------------------------------
 * 1. This device: enable / disable push, with a clear explanation when it is
 *    not possible (unsupported browser, iPhone without the installed app,
 *    notifications blocked in the browser settings), and a test button.
 * 2. What to receive (shared by all devices, saved in the worker): daily
 *    reminder (time + days), streak saver, exam countdown (7 / 3 / 1 days),
 *    weekly recap (day + time), group activity (quiz, document, @mention).
 * 3. Messages & friends (on by default, independent of the reminders' master
 *    switch): every group message, every private message, friend requests,
 *    and the list of muted groups / people with a way to unmute them.
 *
 * Every change is saved at once and broadcast to AppPage (window event
 * `blokly:notif-prefs`) so the reminder schedule is recomputed right away.
 */

import { useEffect, useState } from 'react';
import { Bell, BellOff, Send, Smartphone, Share } from 'lucide-react';
import { collection, getDocs, query, where, documentId } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useTranslation } from '../i18n';
import {
  pushSupport, notificationPermission, loadNotificationPrefs, saveNotificationPrefs, sendTestNotification,
  enablePushOnThisDevice, disablePushOnThisDevice, currentSubscription, withDefaults, DEFAULT_NOTIFICATION_PREFS,
  rememberDeviceChoice,
} from '../lib/notifications';
import { loadMutes, useMutes, toggleMute } from '../lib/mutes';
import { Button } from './ui';

/**
 * Names for the muted ids: groups from `groups/{id}`, people from the public
 * leaderboard. Read in batches of 10 (Firestore "in" limit); unknown ids keep
 * a generic label.
 */
function useMutedNames(mutes) {
  const [names, setNames] = useState({});
  const ids = [...mutes.groups, ...mutes.users].join(',');
  useEffect(() => {
    let alive = true;
    const read = async (coll, list, field) => {
      const out = {};
      for (let i = 0; i < list.length; i += 10) {
        const snap = await getDocs(query(collection(db, coll), where(documentId(), 'in', list.slice(i, i + 10)))).catch(() => null);
        snap?.forEach(d => { out[d.id] = d.data()[field] || ''; });
      }
      return out;
    };
    Promise.all([read('groups', [...mutes.groups], 'name'), read('leaderboard', [...mutes.users], 'pseudo')])
      .then(([g, u]) => { if (alive) setNames({ ...g, ...u }); });
    return () => { alive = false; };
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps -- re-read only when the lists change
  return names;
}

function Toggle({ checked, onChange, label, description, disabled }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? .5 : 1 }}>
      <span style={{ position: 'relative', width: 36, height: 20, flexShrink: 0, marginTop: 1 }}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)}
          style={{ position: 'absolute', inset: 0, opacity: 0, margin: 0, cursor: 'inherit' }} />
        <span aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 99, transition: 'background .2s',
          background: checked ? 'var(--accent)' : 'var(--border-strong)' }} />
        <span aria-hidden="true" style={{ position: 'absolute', top: 2, left: checked ? 18 : 2, width: 16, height: 16, borderRadius: '50%',
          background: '#fff', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{label}</span>
        {description && <span style={{ display: 'block', fontSize: '.7rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>{description}</span>}
      </span>
    </label>
  );
}

export default function NotificationSettings({ user }) {
  const { t, lang, formatDate } = useTranslation();
  const support = pushSupport();
  const [prefs, setPrefs] = useState(null);
  const [devices, setDevices] = useState(0);
  const [onThisDevice, setOnThisDevice] = useState(false);
  const [permission, setPermission] = useState(notificationPermission());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const mutes = useMutes();
  const mutedNames = useMutedNames(mutes);
  useEffect(() => { loadMutes(user); }, [user]);

  useEffect(() => {
    if (support === 'unavailable') return undefined;
    let alive = true;
    loadNotificationPrefs(user)
      .then(({ prefs: p, devices: n }) => { if (alive) { setPrefs(p); setDevices(n); } })
      .catch(() => { if (alive) setPrefs(withDefaults(DEFAULT_NOTIFICATION_PREFS)); });
    currentSubscription().then(sub => { if (alive) setOnThisDevice(Boolean(sub)); }).catch(() => {});
    return () => { alive = false; };
  }, [user, support]);

  if (support === 'unavailable') return null;

  async function save(next) {
    setPrefs(next);
    window.dispatchEvent(new CustomEvent('blokly:notif-prefs', { detail: next }));
    try { await saveNotificationPrefs(user, next, lang); } catch { setMessage('notifSettings.errSave'); }
  }
  const set = (section, key, value) => save({ ...prefs, [section]: { ...prefs[section], [key]: value } });

  async function enable() {
    setBusy(true);
    setMessage('');
    try {
      const result = await enablePushOnThisDevice(user, lang);
      setPermission(notificationPermission());
      if (result === 'granted') {
        rememberDeviceChoice(user, false);
        setOnThisDevice(true);
        setDevices(n => n + 1);
        await save({ ...prefs, enabled: true });
      } else if (result === 'denied') {
        setMessage('notifSettings.blocked');
      }
    } catch {
      setMessage('notifSettings.errEnable');
    }
    setBusy(false);
  }

  async function disable() {
    setBusy(true);
    await disablePushOnThisDevice(user);
    // Stay off: the app must not re-register this device silently next time.
    rememberDeviceChoice(user, true);
    setOnThisDevice(false);
    setDevices(n => Math.max(0, n - 1));
    setBusy(false);
  }

  async function test() {
    setMessage('');
    try {
      await sendTestNotification(user, t('notifSettings.testTitle'), t('notifSettings.testBody'));
      setMessage('notifSettings.testSent');
    } catch {
      setMessage('notifSettings.errTest');
    }
  }

  const dayNames = Array.from({ length: 7 }, (_, i) => formatDate(new Date(2024, 0, 1 + i), { weekday: 'short' }).replace(/\.$/, ''));
  const time = (value, onChange, label) => (
    <input type="time" value={value} onChange={e => onChange(e.target.value)} aria-label={label}
      style={{ padding: '5px 8px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-input)',
        color: 'var(--text-primary)', fontSize: '.76rem', fontFamily: 'var(--font-family)' }} />
  );
  const chip = active => ({
    padding: '4px 9px', borderRadius: 99, border: 'none', cursor: 'pointer', fontSize: '.7rem', fontWeight: active ? 700 : 500,
    background: active ? 'var(--accent-subtle)' : 'var(--bg-card-hover)', color: active ? 'var(--text-primary)' : 'var(--text-muted)',
  });
  const row = { display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0', borderTop: '1px solid var(--border)' };
  const sub = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingLeft: 46 };
  const master = prefs?.enabled;

  return (
    <section aria-labelledby="notif-title"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.2rem 1.3rem', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Bell size={18} color="var(--accent)" aria-hidden="true" />
        <h2 id="notif-title" style={{ margin: 0, fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('notifSettings.title')}</h2>
      </div>

      {/* This device */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 14, background: 'var(--bg-card-hover)' }}>
        <Smartphone size={18} color="var(--text-muted)" aria-hidden="true" />
        <div style={{ flex: 1, minWidth: 180, fontSize: '.76rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {support === 'ios-install' ? (
            <>{t('notifSettings.iosInstall')} <Share size={12} aria-hidden="true" style={{ verticalAlign: '-1px' }} /></>
          ) : support === 'unsupported' ? t('notifSettings.unsupported')
            : permission === 'denied' ? t('notifSettings.blocked')
            : onThisDevice ? t('notifSettings.onThisDevice', { count: devices })
            : t('notifSettings.offThisDevice')}
        </div>
        {support === 'supported' && permission !== 'denied' && (
          onThisDevice ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <Button size="sm" variant="secondary" icon={Send} onClick={test}>{t('notifSettings.test')}</Button>
              <Button size="sm" variant="ghost" icon={BellOff} disabled={busy} onClick={disable}>{t('notifSettings.disable')}</Button>
            </div>
          ) : (
            <Button size="sm" variant="primary" icon={Bell} disabled={busy || !prefs} onClick={enable}>{t('notifSettings.enable')}</Button>
          )
        )}
      </div>
      {message && <div role="status" style={{ fontSize: '.72rem', color: message.startsWith('notifSettings.err') ? 'var(--danger)' : 'var(--text-muted)' }}>{t(message)}</div>}

      {prefs && (
        <div>
          {/* Messages & friends — on by default, not tied to the reminders switch */}
          <div style={{ ...row, borderTop: 'none', paddingTop: 4 }}>
            <div style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t('notifSettings.social')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Toggle checked={prefs.social.groupMessages} onChange={v => set('social', 'groupMessages', v)}
                label={t('notifSettings.socialGroups')} description={t('notifSettings.socialGroupsHint')} />
              <Toggle checked={prefs.group.mention} onChange={v => set('group', 'mention', v)}
                label={t('notifSettings.groupMention')} description={t('notifSettings.mentionHint')} />
              <Toggle checked={prefs.social.dms} onChange={v => set('social', 'dms', v)} label={t('notifSettings.socialDms')} />
              <Toggle checked={prefs.social.friendRequests} onChange={v => set('social', 'friendRequests', v)} label={t('notifSettings.socialFriends')} />
            </div>
            {(mutes.groups.size > 0 || mutes.users.size > 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>{t('mute.listTitle')}</div>
                {[...[...mutes.groups].map(id => ['groups', id]), ...[...mutes.users].map(id => ['users', id])].map(([type, id]) => (
                  <div key={type + id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BellOff size={13} color="var(--text-muted)" aria-hidden="true" />
                    <span style={{ flex: 1, minWidth: 0, fontSize: '.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {mutedNames[id] || t(type === 'groups' ? 'mute.unknownGroup' : 'mute.unknownUser')}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => toggleMute(user, type, id, lang)}>{t('mute.unmute')}</Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ padding: '14px 0 10px', borderTop: '1px solid var(--border)' }}>
            <Toggle checked={master} onChange={v => save({ ...prefs, enabled: v })} label={t('notifSettings.master')} description={t('notifSettings.masterHint')} />
          </div>

          <div style={row}>
            <Toggle disabled={!master} checked={prefs.daily.on} onChange={v => set('daily', 'on', v)} label={t('notifSettings.daily')} description={t('notifSettings.dailyHint')} />
            {master && prefs.daily.on && (
              <div style={sub}>
                {time(prefs.daily.time, v => set('daily', 'time', v), t('notifSettings.time'))}
                {dayNames.map((d, i) => (
                  <button key={i} type="button" aria-pressed={prefs.daily.days[i]} style={chip(prefs.daily.days[i])}
                    onClick={() => set('daily', 'days', prefs.daily.days.map((x, j) => (j === i ? !x : x)))}>{d}</button>
                ))}
              </div>
            )}
          </div>

          <div style={row}>
            <Toggle disabled={!master} checked={prefs.streak.on} onChange={v => set('streak', 'on', v)} label={t('notifSettings.streak')} description={t('notifSettings.streakHint')} />
            {master && prefs.streak.on && <div style={sub}>{time(prefs.streak.time, v => set('streak', 'time', v), t('notifSettings.time'))}</div>}
          </div>

          <div style={row}>
            <Toggle disabled={!master} checked={prefs.exams.on} onChange={v => set('exams', 'on', v)} label={t('notifSettings.exams')} description={t('notifSettings.examsHint')} />
            {master && prefs.exams.on && (
              <div style={sub}>
                {time(prefs.exams.time, v => set('exams', 'time', v), t('notifSettings.time'))}
                {[14, 7, 3, 1].map(d => {
                  const on = prefs.exams.days.includes(d);
                  return (
                    <button key={d} type="button" aria-pressed={on} style={chip(on)}
                      onClick={() => set('exams', 'days', on ? prefs.exams.days.filter(x => x !== d) : [...prefs.exams.days, d].sort((a, b) => b - a))}>
                      {t('notifSettings.daysBefore', { count: d })}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={row}>
            <Toggle disabled={!master} checked={prefs.weekly.on} onChange={v => set('weekly', 'on', v)} label={t('notifSettings.weekly')} description={t('notifSettings.weeklyHint')} />
            {master && prefs.weekly.on && (
              <div style={sub}>
                <select value={prefs.weekly.day} onChange={e => set('weekly', 'day', Number(e.target.value))} aria-label={t('notifSettings.day')}
                  style={{ padding: '5px 8px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.76rem' }}>
                  {dayNames.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
                {time(prefs.weekly.time, v => set('weekly', 'time', v), t('notifSettings.time'))}
              </div>
            )}
          </div>

          <div style={row}>
            <div style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t('notifSettings.group')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Toggle disabled={!master} checked={prefs.group.quiz} onChange={v => set('group', 'quiz', v)} label={t('notifSettings.groupQuiz')} />
              <Toggle disabled={!master} checked={prefs.group.doc} onChange={v => set('group', 'doc', v)} label={t('notifSettings.groupDoc')} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
