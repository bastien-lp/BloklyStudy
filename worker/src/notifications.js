/**
 * Push notifications — subscriptions, preferences, schedule, group activity.
 * --------------------------------------------------------------------------
 * Routes (behind the Firebase ID token check done by the router):
 *   POST   /push/subscribe           { subscription: { endpoint, keys: { p256dh, auth } }, lang }
 *   DELETE /push/subscribe           { endpoint }
 *   GET    /notifications/prefs      → { prefs }            (shared by all my devices)
 *   PUT    /notifications/prefs      { prefs, lang }
 *   PUT    /notifications/schedule   { items: [{ sendAt, kind, title, body, tab, tag }] }
 *   POST   /notifications/test       sends a test notification to my devices
 *   POST   /notify/group             { groupId, kind: 'quiz'|'doc'|'mention', detail, mentions?: [uid] }
 *
 * The worker never reads study data. The APP computes the upcoming reminders
 * (translated, in the student's time zone) and replaces its schedule here;
 * the cron trigger (`runScheduled`, every 15 min) sends what is due.
 * Group activity is the exception: the acting member's app asks the worker
 * to notify the others. Membership and the member list are read from
 * Firestore with the caller's own token; only members who opted in to that
 * kind of activity are notified, in their own language.
 *
 * Limits: MAX_SUBSCRIPTIONS per user, MAX_SCHEDULED items within
 * SCHEDULE_HORIZON_DAYS, GROUP_NOTIFY_PER_DAY group notifications sent per user.
 */

import { fail, ok } from './docs.js';
import { sendPush } from './webpush.js';

const MAX_SUBSCRIPTIONS = 10;
const MAX_SCHEDULED = 120;
const SCHEDULE_HORIZON_DAYS = 31;
const GROUP_NOTIFY_PER_DAY = 60;
const CRON_BATCH = 400;
const LANGS = new Set(['fr', 'en', 'es', 'de']);
const TABS = new Set(['planning', 'study', 'syntheses', 'repetition', 'flashcards', 'stats', 'groups', 'exams', 'todo', 'journal', 'profile']);

export const notificationRoutes = [
  ['POST', /^\/push\/subscribe$/, subscribe],
  ['DELETE', /^\/push\/subscribe$/, unsubscribe],
  ['GET', /^\/notifications\/prefs$/, getPrefs],
  ['PUT', /^\/notifications\/prefs$/, putPrefs],
  ['PUT', /^\/notifications\/schedule$/, putSchedule],
  ['POST', /^\/notifications\/test$/, sendTest],
  ['POST', /^\/notify\/group$/, notifyGroup],
];

// ── Helpers ──

const available = env => Boolean(env.DB && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
const vapidOf = env => ({ publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || 'https://bastien-lp.github.io/BloklyStudy/' });

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

function text(value, max) {
  return [...String(value ?? '')].map(c => (c.charCodeAt(0) < 32 ? ' ' : c)).join('').replace(/\s+/g, ' ').trim().slice(0, max);
}

const cleanLang = l => (LANGS.has(l) ? l : 'fr');
const cleanTab = t => (TABS.has(t) ? t : '');

/** Sends one payload to every device of `uid`; removes subscriptions the push service rejects. */
async function pushToUser(env, uid, payload, opts) {
  const { results } = await env.DB.prepare('SELECT * FROM push_subscriptions WHERE uid = ?').bind(uid).all();
  let delivered = 0;
  for (const sub of results) {
    try {
      const status = await sendPush(sub, payload, vapidOf(env), opts);
      if (status === 404 || status === 410) {
        await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(sub.endpoint).run();
      } else if (status >= 200 && status < 300) {
        delivered++;
        await env.DB.prepare('UPDATE push_subscriptions SET last_ok_at = ? WHERE endpoint = ?').bind(Date.now(), sub.endpoint).run();
      }
    } catch {
      // Network hiccup to the push service: the next reminder will try again.
    }
  }
  return delivered;
}

// ── Subscriptions ──

async function subscribe({ request, env, uid }) {
  if (!available(env)) return fail('push_unavailable', 503);
  const data = await readJson(request);
  const s = data?.subscription;
  const endpoint = String(s?.endpoint || '');
  const p256dh = String(s?.keys?.p256dh || '');
  const auth = String(s?.keys?.auth || '');
  if (!/^https:\/\/[^\s]{10,2000}$/.test(endpoint) || p256dh.length < 80 || auth.length < 16) return fail('bad_request', 400);

  const { count } = await env.DB.prepare('SELECT COUNT(*) AS count FROM push_subscriptions WHERE uid = ? AND endpoint != ?').bind(uid, endpoint).first();
  if (count >= MAX_SUBSCRIPTIONS) {
    // Too many devices: forget the oldest one rather than refusing the new one.
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = (SELECT endpoint FROM push_subscriptions WHERE uid = ? ORDER BY created_at ASC LIMIT 1)').bind(uid).run();
  }
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (endpoint, uid, p256dh, auth, lang, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET uid = excluded.uid, p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang`
  ).bind(endpoint, uid, p256dh, auth, cleanLang(data.lang), Date.now()).run();
  return ok({ subscribed: true }, 201);
}

async function unsubscribe({ request, env, uid }) {
  if (!env.DB) return fail('push_unavailable', 503);
  const endpoint = String((await readJson(request))?.endpoint || '');
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND uid = ?').bind(endpoint, uid).run();
  return ok({ unsubscribed: true });
}

// ── Preferences ──

async function getPrefs({ env, uid }) {
  if (!env.DB) return fail('push_unavailable', 503);
  const row = await env.DB.prepare('SELECT prefs FROM notification_prefs WHERE uid = ?').bind(uid).first();
  const devices = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE uid = ?').bind(uid).first();
  let prefs = null;
  try { prefs = row ? JSON.parse(row.prefs) : null; } catch { prefs = null; }
  return ok({ prefs, devices: devices.n });
}

async function putPrefs({ request, env, uid }) {
  if (!env.DB) return fail('push_unavailable', 503);
  const data = await readJson(request);
  const json = JSON.stringify(data?.prefs ?? null);
  if (!data?.prefs || typeof data.prefs !== 'object' || json.length > 4000) return fail('bad_request', 400);
  await env.DB.prepare(
    `INSERT INTO notification_prefs (uid, prefs, lang, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (uid) DO UPDATE SET prefs = excluded.prefs, lang = excluded.lang, updated_at = excluded.updated_at`
  ).bind(uid, json, cleanLang(data.lang), Date.now()).run();
  await env.DB.prepare('UPDATE push_subscriptions SET lang = ? WHERE uid = ?').bind(cleanLang(data.lang), uid).run();
  return ok({ saved: true });
}

// ── Schedule (computed by the app) ──

async function putSchedule({ request, env, uid }) {
  if (!env.DB) return fail('push_unavailable', 503);
  const data = await readJson(request);
  if (!Array.isArray(data?.items)) return fail('bad_request', 400);
  const now = Date.now();
  const horizon = now + SCHEDULE_HORIZON_DAYS * 86_400_000;
  const items = data.items
    .map(it => ({
      sendAt: Math.round(Number(it?.sendAt)),
      kind: text(it?.kind, 20) || 'reminder',
      title: text(it?.title, 80),
      body: text(it?.body, 240),
      tab: cleanTab(it?.tab),
      tag: text(it?.tag, 64),
    }))
    .filter(it => it.sendAt > now && it.sendAt < horizon && it.title)
    .slice(0, MAX_SCHEDULED);

  // Replace everything not sent yet, atomically.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM scheduled_notifications WHERE uid = ?').bind(uid),
    ...items.map(it => env.DB.prepare(
      'INSERT INTO scheduled_notifications (uid, send_at, kind, title, body, url, tag) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(uid, it.sendAt, it.kind, it.title, it.body, it.tab, it.tag)),
  ]);
  return ok({ scheduled: items.length });
}

async function sendTest({ request, env, uid }) {
  if (!available(env)) return fail('push_unavailable', 503);
  const data = await readJson(request);
  const delivered = await pushToUser(env, uid, {
    title: text(data?.title, 80) || 'Blokly', body: text(data?.body, 240), tab: 'profile', tag: 'test',
  }, { ttl: 300, urgency: 'high' });
  return delivered ? ok({ delivered }) : fail('no_device', 404);
}

// ── Group activity ──

const GROUP_TEXT = {
  fr: { quiz: '{name} lance un quiz en direct : {detail}', doc: '{name} a partagé « {detail} »', mention: '{name} t’a mentionné : {detail}' },
  en: { quiz: '{name} started a live quiz: {detail}', doc: '{name} shared “{detail}”', mention: '{name} mentioned you: {detail}' },
  es: { quiz: '{name} ha lanzado un quiz en directo: {detail}', doc: '{name} ha compartido «{detail}»', mention: '{name} te ha mencionado: {detail}' },
  de: { quiz: '{name} startet ein Live-Quiz: {detail}', doc: '{name} hat „{detail}“ geteilt', mention: '{name} hat dich erwähnt: {detail}' },
};

/** The group's name and member ids, read with the caller's token (null if not a member). */
async function readGroup(env, idToken, groupId, uid) {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/groups/${encodeURIComponent(groupId)}?mask.fieldPaths=memberIds&mask.fieldPaths=name`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
    if (!res.ok) return null;
    const d = await res.json();
    const memberIds = (d.fields?.memberIds?.arrayValue?.values || []).map(v => v.stringValue).filter(Boolean);
    if (!memberIds.includes(uid)) return null;
    return { name: d.fields?.name?.stringValue || '', memberIds };
  } catch {
    return null;
  }
}

async function notifyGroup({ request, env, uid, idToken }) {
  if (!available(env)) return fail('push_unavailable', 503);
  const data = await readJson(request);
  const groupId = String(data?.groupId || '');
  const kind = ['quiz', 'doc', 'mention'].includes(data?.kind) ? data.kind : null;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(groupId) || !kind) return fail('bad_request', 400);

  const dayKey = `notify:group:${uid}:${new Date().toISOString().slice(0, 10)}`;
  const sentToday = env.KV ? Number(await env.KV.get(dayKey)) || 0 : 0;
  if (sentToday >= GROUP_NOTIFY_PER_DAY) return fail('daily_limit', 429);

  const group = await readGroup(env, idToken, groupId, uid);
  if (!group) return fail('not_a_member', 403);

  let targets = group.memberIds.filter(m => m !== uid);
  if (kind === 'mention') {
    const mentioned = new Set((Array.isArray(data.mentions) ? data.mentions : []).map(String));
    targets = targets.filter(m => mentioned.has(m));
  }
  if (!targets.length) return ok({ notified: 0 });

  const placeholders = targets.map(() => '?').join(',');
  const { results } = await env.DB.prepare(`SELECT uid, prefs, lang FROM notification_prefs WHERE uid IN (${placeholders})`).bind(...targets).all();
  const name = text(data.name, 40) || '?';
  const detail = text(data.detail, 120);
  let notified = 0;
  for (const row of results) {
    let prefs = {};
    try { prefs = JSON.parse(row.prefs); } catch { /* defaults */ }
    if (!prefs?.enabled || !prefs?.group?.[kind]) continue;
    const tpl = (GROUP_TEXT[cleanLang(row.lang)] || GROUP_TEXT.fr)[kind];
    const body = tpl.replace('{name}', name).replace('{detail}', detail);
    notified += await pushToUser(env, row.uid, { title: group.name || 'Blokly', body, tab: 'groups', tag: `group-${groupId}-${kind}` },
      { ttl: kind === 'quiz' ? 900 : 86_400, urgency: kind === 'quiz' ? 'high' : 'normal' });
  }
  if (env.KV) await env.KV.put(dayKey, String(sentToday + 1), { expirationTtl: 2 * 86_400 }).catch(() => {});
  return ok({ notified });
}

// ── Cron trigger ──

/** Sends every scheduled reminder that is due (called by the `scheduled` handler). */
export async function runScheduled(env) {
  if (!available(env)) return { sent: 0 };
  const now = Date.now();
  const { results } = await env.DB.prepare(
    `SELECT * FROM scheduled_notifications WHERE send_at <= ? ORDER BY send_at ASC LIMIT ${CRON_BATCH}`
  ).bind(now).all();
  if (!results.length) return { sent: 0 };

  // Remove them first: a reminder is sent at most once, even if a push fails.
  await env.DB.batch(results.map(r => env.DB.prepare('DELETE FROM scheduled_notifications WHERE id = ?').bind(r.id)));
  let sent = 0;
  for (const r of results) {
    // Too late to be useful (e.g. the worker was down for hours): skip.
    if (now - r.send_at > 6 * 3_600_000) continue;
    sent += await pushToUser(env, r.uid, { title: r.title, body: r.body, tab: r.url, tag: r.tag || r.kind }, { ttl: 6 * 3600 });
  }
  return { sent };
}
