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
 *                                     { groupId, kind: 'message', messageId }
 *   POST   /notify/user              { kind: 'dm', toUid, messageId } | { kind: 'friendRequest', toUid }
 *   PUT    /notifications/mute       { type: 'groups'|'users', id, muted, lang }  → { muted }
 *
 * SOCIAL notifications (every group message, every private message, every
 * friend request) are ON BY DEFAULT: a member with a registered device gets
 * them even if they never opened the settings, unless they switched that kind
 * off (`prefs.social`) or muted the group / the person (`prefs.muted`). They
 * do not depend on the reminders' master switch (`prefs.enabled`).
 * Anti-spoofing: the worker never trusts the text it is given — it reads the
 * message (or the request) back from Firestore with the caller's own token,
 * checks that the caller wrote it and that it is recent, and builds the
 * notification from that. Each event is announced once (table notify_sent).
 * An @mention in a group message reaches the mentioned member even when the
 * group is muted.
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
const MAX_PREFS_JSON = 8000;
const MAX_MUTED = 100;             // per list (groups, users)
const MAX_GROUP_FANOUT = 100;      // members notified for one group message
const EVENT_FRESH_MS = 10 * 60_000; // a message older than this is not announced
const NOTIFY_SENT_KEEP_MS = 2 * 86_400_000;
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
  ['POST', /^\/notify\/user$/, notifyUser],
  ['PUT', /^\/notifications\/mute$/, putMute],
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

/** A user's stored prefs object ({} when none). */
async function readPrefs(env, uid) {
  const row = await env.DB.prepare('SELECT prefs FROM notification_prefs WHERE uid = ?').bind(uid).first();
  try { return (row && JSON.parse(row.prefs)) || {}; } catch { return {}; }
}

async function putPrefs({ request, env, uid }) {
  if (!env.DB) return fail('push_unavailable', 503);
  const data = await readJson(request);
  if (!data?.prefs || typeof data.prefs !== 'object') return fail('bad_request', 400);
  // The mute lists are only changed through PUT /notifications/mute, so a
  // settings screen holding an older copy can never wipe them.
  const existing = await readPrefs(env, uid);
  const prefs = { ...data.prefs, muted: existing.muted || { groups: [], users: [] } };
  const json = JSON.stringify(prefs);
  if (json.length > MAX_PREFS_JSON) return fail('bad_request', 400);
  await env.DB.prepare(
    `INSERT INTO notification_prefs (uid, prefs, lang, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (uid) DO UPDATE SET prefs = excluded.prefs, lang = excluded.lang, updated_at = excluded.updated_at`
  ).bind(uid, json, cleanLang(data.lang), Date.now()).run();
  await env.DB.prepare('UPDATE push_subscriptions SET lang = ? WHERE uid = ?').bind(cleanLang(data.lang), uid).run();
  return ok({ saved: true });
}

/** Mutes or unmutes one group or one person. Works without any device registered. */
async function putMute({ request, env, uid }) {
  if (!env.DB) return fail('push_unavailable', 503);
  const data = await readJson(request);
  const type = data?.type === 'groups' || data?.type === 'users' ? data.type : null;
  const id = String(data?.id || '');
  if (!type || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return fail('bad_request', 400);

  const prefs = await readPrefs(env, uid);
  const muted = { groups: [], users: [], ...(prefs.muted || {}) };
  const list = new Set(Array.isArray(muted[type]) ? muted[type] : []);
  if (data.muted) list.add(id); else list.delete(id);
  muted[type] = [...list].slice(-MAX_MUTED);
  prefs.muted = muted;

  await env.DB.prepare(
    `INSERT INTO notification_prefs (uid, prefs, lang, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (uid) DO UPDATE SET prefs = excluded.prefs, updated_at = excluded.updated_at`
  ).bind(uid, JSON.stringify(prefs), cleanLang(data.lang), Date.now()).run();
  return ok({ muted });
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

/** Texts of the social notifications, per language. {name} = sender, {detail} = message. */
const SOCIAL_TEXT = {
  fr: { attachment: 'a partagé quelque chose', mention: '{name} t’a mentionné', requestTitle: 'Nouvelle demande d’ami', requestBody: '{name} veut t’ajouter en ami' },
  en: { attachment: 'shared something', mention: '{name} mentioned you', requestTitle: 'New friend request', requestBody: '{name} wants to add you as a friend' },
  es: { attachment: 'ha compartido algo', mention: '{name} te ha mencionado', requestTitle: 'Nueva solicitud de amistad', requestBody: '{name} quiere añadirte como amigo' },
  de: { attachment: 'hat etwas geteilt', mention: '{name} hat dich erwähnt', requestTitle: 'Neue Freundschaftsanfrage', requestBody: '{name} möchte dich als Freund hinzufügen' },
};
const socialText = lang => SOCIAL_TEXT[cleanLang(lang)] || SOCIAL_TEXT.fr;

/** Reads one Firestore document with the caller's token: its plain fields, or null. */
async function readDoc(env, idToken, path) {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
    if (!res.ok) return null;
    const fields = (await res.json()).fields || {};
    const plain = v => (v?.stringValue ?? v?.integerValue ?? v?.booleanValue
      ?? (v?.arrayValue ? (v.arrayValue.values || []).map(plain) : null));
    return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, plain(v)]));
  } catch {
    return null;
  }
}

/** True when an ISO date is close to now (the event really just happened). */
function isFresh(iso) {
  const at = Date.parse(iso || '');
  return Number.isFinite(at) && Math.abs(Date.now() - at) < EVENT_FRESH_MS;
}

/** Records an event as announced. False if it already was (nothing must be sent). */
async function claimEvent(env, key) {
  const res = await env.DB.prepare('INSERT OR IGNORE INTO notify_sent (key, at) VALUES (?, ?)').bind(key.slice(0, 300), Date.now()).run();
  return (res.meta?.changes ?? 0) > 0;
}

/**
 * The people among `uids` who can receive a push (a registered device), with
 * their prefs ({} = never saved = defaults) and language.
 */
async function reachable(env, uids) {
  if (!uids.length) return [];
  const placeholders = uids.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT s.uid AS uid, MAX(s.lang) AS slang, p.prefs AS prefs, p.lang AS plang
       FROM push_subscriptions s LEFT JOIN notification_prefs p ON p.uid = s.uid
      WHERE s.uid IN (${placeholders}) GROUP BY s.uid`
  ).bind(...uids).all();
  return results.map(r => {
    let prefs = {};
    try { prefs = r.prefs ? JSON.parse(r.prefs) || {} : {}; } catch { /* defaults */ }
    return { uid: r.uid, prefs, lang: r.plang || r.slang || 'fr' };
  });
}

const socialOn = (prefs, kind) => prefs?.social?.[kind] !== false;
const isMuted = (prefs, type, id) => Array.isArray(prefs?.muted?.[type]) && prefs.muted[type].includes(id);

/** Every message of a group → the other members (muted groups skipped, @mentions always). */
async function notifyGroupMessage(env, idToken, uid, groupId, data) {
  const messageId = String(data?.messageId || '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(messageId)) return fail('bad_request', 400);

  const group = await readGroup(env, idToken, groupId, uid);
  if (!group) return fail('not_a_member', 403);
  const msg = await readDoc(env, idToken, `groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}`);
  if (!msg || msg.uid !== uid || !isFresh(msg.sentAt)) return fail('not_found', 404);
  if (!(await claimEvent(env, `g:${groupId}:${messageId}`))) return ok({ notified: 0, duplicate: true });

  const mentioned = new Set(Array.isArray(msg.mentions) ? msg.mentions : []);
  const targets = group.memberIds.filter(m => m !== uid).slice(0, MAX_GROUP_FANOUT);
  const name = text(msg.pseudo, 40) || '?';
  let notified = 0;
  for (const r of await reachable(env, targets)) {
    const tx = socialText(r.lang);
    const isMention = mentioned.has(r.uid) && r.prefs?.group?.mention !== false;
    if (!isMention && (!socialOn(r.prefs, 'groupMessages') || isMuted(r.prefs, 'groups', groupId))) continue;
    const content = text(msg.text, 160) || tx.attachment;
    const body = isMention ? `${tx.mention.replace('{name}', name)} : ${content}` : `${name} : ${content}`;
    notified += await pushToUser(env, r.uid,
      { title: group.name || 'Blokly', body, tab: 'groups', tag: `msg-g-${groupId}`, kind: 'message' },
      { ttl: 86_400, urgency: isMention ? 'high' : 'normal' });
  }
  return ok({ notified });
}

/** A private message or a friend request → its one recipient. */
async function notifyUser({ request, env, uid, idToken }) {
  if (!available(env)) return fail('push_unavailable', 503);
  const data = await readJson(request);
  const toUid = String(data?.toUid || '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(toUid) || toUid === uid) return fail('bad_request', 400);

  let payload;
  let prefKind;
  let mutedBy = null; // the recipient's mute list entry that silences this
  if (data?.kind === 'dm') {
    const messageId = String(data.messageId || '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(messageId)) return fail('bad_request', 400);
    const convId = [uid, toUid].sort().join('_');
    const msg = await readDoc(env, idToken, `privateMessages/${convId}/messages/${encodeURIComponent(messageId)}`);
    if (!msg || msg.uid !== uid || !isFresh(msg.sentAt)) return fail('not_found', 404);
    if (!(await claimEvent(env, `dm:${convId}:${messageId}`))) return ok({ notified: 0, duplicate: true });
    prefKind = 'dms';
    mutedBy = uid;
    payload = lang => ({
      title: text(msg.pseudo, 40) || 'Blokly', body: text(msg.text, 200) || socialText(lang).attachment,
      tab: 'groups', tag: `msg-dm-${uid}`, kind: 'dm',
    });
  } else if (data?.kind === 'friendRequest') {
    const req = await readDoc(env, idToken, `friendRequests/${toUid}/requests/${uid}`);
    if (!req || req.from !== uid || !isFresh(req.sentAt)) return fail('not_found', 404);
    if (!(await claimEvent(env, `fr:${toUid}:${uid}:${req.sentAt}`))) return ok({ notified: 0, duplicate: true });
    prefKind = 'friendRequests';
    payload = lang => {
      const tx = socialText(lang);
      return { title: tx.requestTitle, body: tx.requestBody.replace('{name}', text(req.fromPseudo, 40) || '?'),
        tab: 'groups', tag: 'friend-request', kind: 'friendRequest' };
    };
  } else {
    return fail('bad_request', 400);
  }

  const [r] = await reachable(env, [toUid]);
  if (!r || !socialOn(r.prefs, prefKind) || (mutedBy && isMuted(r.prefs, 'users', mutedBy))) return ok({ notified: 0 });
  const notified = await pushToUser(env, toUid, payload(r.lang), { ttl: 86_400, urgency: 'high' });
  return ok({ notified });
}

async function notifyGroup({ request, env, uid, idToken }) {
  if (!available(env)) return fail('push_unavailable', 503);
  const data = await readJson(request);
  const groupId = String(data?.groupId || '');
  if (data?.kind === 'message') {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(groupId)) return fail('bad_request', 400);
    return notifyGroupMessage(env, idToken, uid, groupId, data);
  }
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
  // Forget announced social events once they are too old to be re-announced anyway.
  await env.DB.prepare('DELETE FROM notify_sent WHERE at < ?').bind(now - NOTIFY_SENT_KEEP_MS).run().catch(() => {});

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
