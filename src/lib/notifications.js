/**
 * Notifications — device subscription, preferences, and the reminder schedule.
 * --------------------------------------------------------------------------
 * The Cloudflare worker sends the pushes but never reads study data. So the
 * APP computes the reminders of the next SCHEDULE_DAYS days — translated, in
 * the student's own time zone — and replaces the worker's schedule with them
 * whenever the data changes (lib is pure; syncing is done by AppPage). For
 * example, the evening "save your streak" reminder disappears as soon as a
 * focus session is banked that day.
 *
 * Preferences live in the worker (D1) so every device of the student shares
 * them. Group activity (live quiz, shared document, @mention) is sent by the
 * acting member's app through `notifyGroup`.
 *
 * Requirements: a service worker (production build), the Push API, the
 * worker URL and the VAPID public key. iPhone / iPad: only in the installed
 * app (Add to Home Screen), iOS 16.4+.
 */

import { nextDueMs } from '../data/repetition';
import { dayKey } from './dayKeys';

const WORKER_URL = (import.meta.env.VITE_CALENDAR_WORKER_URL || '').replace(/\/+$/, '');
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';
const SCHEDULE_DAYS = 7;
const MAX_ITEMS = 110;
const DAY_MS = 86_400_000;

export const DEFAULT_NOTIFICATION_PREFS = {
  enabled: false,
  daily:  { on: true, time: '18:00', days: [true, true, true, true, true, true, true] }, // Mon … Sun
  streak: { on: true, time: '20:30' },
  exams:  { on: true, time: '09:00', days: [7, 3, 1] },
  weekly: { on: true, day: 6, time: '19:00' },                                          // 6 = Sunday
  group:  { quiz: true, doc: true, mention: true },
};

/** Stored prefs merged over the defaults (so new options get a value). */
export function withDefaults(prefs) {
  const p = prefs || {};
  const d = DEFAULT_NOTIFICATION_PREFS;
  return {
    enabled: Boolean(p.enabled),
    daily: { ...d.daily, ...p.daily },
    streak: { ...d.streak, ...p.streak },
    exams: { ...d.exams, ...p.exams },
    weekly: { ...d.weekly, ...p.weekly },
    group: { ...d.group, ...p.group },
  };
}

// ── Support ──

export function pushSupport() {
  if (!WORKER_URL || !VAPID_PUBLIC_KEY) return 'unavailable';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    return ios ? 'ios-install' : 'unsupported';
  }
  return 'supported';
}

export const notificationPermission = () => (typeof Notification === 'undefined' ? 'default' : Notification.permission);

// ── Worker API ──

async function api(user, method, path, body) {
  const idToken = await user.getIdToken();
  const res = await fetch(`${WORKER_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${idToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'failed'), { code: data.error || 'failed' });
  return data;
}

export async function loadNotificationPrefs(user) {
  const data = await api(user, 'GET', '/notifications/prefs');
  return { prefs: withDefaults(data.prefs), devices: data.devices || 0 };
}

export const saveNotificationPrefs = (user, prefs, lang) => api(user, 'PUT', '/notifications/prefs', { prefs, lang });
export const sendTestNotification = (user, title, body) => api(user, 'POST', '/notifications/test', { title, body });

/** Fire-and-forget: tell the other members of a group about an action (they opted in or not). */
export function notifyGroup(user, { groupId, kind, name, detail, mentions }) {
  if (!WORKER_URL || !VAPID_PUBLIC_KEY || !user) return;
  api(user, 'POST', '/notify/group', { groupId, kind, name, detail, mentions }).catch(() => {});
}

// ── This device ──

function keyToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

/** This device's current push subscription, or null. */
export async function currentSubscription() {
  if (pushSupport() !== 'supported') return null;
  const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Asks permission, subscribes this device and registers it. Resolves to 'granted' | 'denied' | 'default'. */
export async function enablePushOnThisDevice(user, lang) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY) });
  await api(user, 'POST', '/push/subscribe', { subscription: sub.toJSON(), lang });
  return 'granted';
}

export async function disablePushOnThisDevice(user) {
  const sub = await currentSubscription();
  if (!sub) return;
  await api(user, 'DELETE', '/push/subscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

// ── Schedule (pure) ──

const at = (day, hhmm) => {
  const [h, m] = String(hhmm || '18:00').split(':').map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0).getTime();
};
const midnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const plannerDateStr = day => midnight(day).toISOString().slice(0, 10); // same convention as the planner
const weekday = d => (d.getDay() + 6) % 7;                                  // 0 = Monday

/**
 * Reminders for the next SCHEDULE_DAYS days: [{ sendAt, kind, title, body, tab, tag }].
 * `t` is the i18n function (texts are sent already translated).
 */
export function computeSchedule(main, prefsIn, t, now = new Date()) {
  const prefs = withDefaults(prefsIn);
  if (!prefs.enabled) return [];
  const items = [];
  const push = item => { if (item.sendAt > now.getTime()) items.push(item); };
  const subjects = Array.isArray(main?.subjects) ? main.subjects : [];
  const blocks = Array.isArray(main?.blocks) ? main.blocks : [];
  const srData = main?.srData || {};
  const today = midnight(now);
  const studiedToday = main?.lastStudyDay === dayKey(now);

  for (let i = 0; i < SCHEDULE_DAYS; i++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const endOfDay = day.getTime() + DAY_MS;

    // Daily study reminder, with what is planned that day.
    if (prefs.daily.on && prefs.daily.days[weekday(day)]) {
      const ds = plannerDateStr(day);
      const planned = blocks.filter(b => b?.dateStr === ds && b.status !== 'done').length;
      let reviews = 0;
      for (const s of subjects) {
        const n = Array.isArray(s.chapters) && s.chapters.length ? s.chapters.length : Number(s.chaps) || 0;
        for (let c = 0; c < n; c++) {
          const due = srData[`${s.id}_${c}`] ? nextDueMs(srData[`${s.id}_${c}`]) : null;
          if (due != null && due < endOfDay) reviews++;
        }
      }
      const parts = [];
      if (planned) parts.push(t('notify.partBlocks', { count: planned }));
      if (reviews) parts.push(t('notify.partReviews', { count: reviews }));
      push({
        sendAt: at(day, prefs.daily.time), kind: 'daily', tag: 'daily',
        title: t('notify.dailyTitle'),
        body: parts.length ? parts.join(' · ') : t('notify.dailyGeneric'),
        tab: planned ? 'planning' : reviews ? 'repetition' : 'study',
      });
    }

    // Evening streak saver (not today if already studied; re-synced after each session).
    if (prefs.streak.on && !(i === 0 && studiedToday)) {
      const streak = Number(main?.streak) || 0;
      push({
        sendAt: at(day, prefs.streak.time), kind: 'streak', tag: 'streak',
        title: t('notify.streakTitle'),
        body: i === 0 && streak > 0 ? t('notify.streakBodyCount', { count: streak }) : t('notify.streakBody'),
        tab: 'study',
      });
    }

    // Weekly recap.
    if (prefs.weekly.on && weekday(day) === prefs.weekly.day) {
      push({ sendAt: at(day, prefs.weekly.time), kind: 'weekly', tag: 'weekly', title: t('notify.weeklyTitle'), body: t('notify.weeklyBody'), tab: 'stats' });
    }
  }

  // Exam countdown (7 / 3 / 1 days before, as chosen).
  if (prefs.exams.on) {
    for (const s of subjects) {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s.date || ''));
      if (!m) continue;
      const exam = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      for (const d of prefs.exams.days) {
        const day = new Date(exam.getFullYear(), exam.getMonth(), exam.getDate() - d);
        if (day - today >= SCHEDULE_DAYS * DAY_MS || day < today) continue;
        push({
          sendAt: at(day, prefs.exams.time), kind: 'exam', tag: `exam-${s.id}`,
          title: t('notify.examTitle', { name: s.name }), body: t('notify.examBody', { count: d }), tab: 'exams',
        });
      }
    }
  }

  return items.sort((a, b) => a.sendAt - b.sendAt).slice(0, MAX_ITEMS);
}

/**
 * Replaces the worker's schedule with `items`, unless it already holds exactly
 * these (a hash is remembered per account in this browser).
 */
export async function syncSchedule(user, items) {
  const hash = JSON.stringify(items);
  const key = `blokly-notif-schedule-${user.uid}`;
  try { if (localStorage.getItem(key) === hash) return; } catch { /* no storage: always sync */ }
  await api(user, 'PUT', '/notifications/schedule', { items });
  try { localStorage.setItem(key, hash); } catch { /* ignore */ }
}
