/**
 * Blokly worker — server-side helpers the static front-end cannot do alone.
 * --------------------------------------------------------------------------
 * Every route requires `Authorization: Bearer <Firebase ID token>`; the uid is
 * always taken from the verified token, never from the request.
 *
 *   GET  /events         external .ics calendars → plain events (below)
 *   POST /ai/flashcards  course text → flashcards, via Workers AI (see ai.js)
 *   /docs…, /groups/:id/docs  shared synthesis documents, R2 + D1 (see docs.js)
 *   /library…, /docs/:id/library  public synthesis library (see library.js)
 *
 * ── GET /events ──
 *
 * 1. Verifies the Firebase ID token (RS256 signature against Google's public
 *    keys + audience / issuer / expiry checks). The uid is taken from the
 *    verified token only — never from the request.
 * 2. Reads `users/{uid}/data/calendars` through the Firestore REST API using
 *    that same ID token, so Firestore security rules still apply: the worker
 *    holds no admin credential and can only see what the user can see.
 * 3. Fetches each .ics feed server-side (no CORS issue in the browser), parses
 *    it with ical.js and expands recurring events within a time window.
 * 4. Responds with `{ calendars: [{ id, events: [{ title, start, end, allDay }], error?, stale? }] }`.
 *    Timed events use ISO UTC instants; all-day events use "YYYY-MM-DD" dates
 *    (exclusive end). Feed URLs (which embed private tokens) are never sent
 *    back to the client.
 *
 *
 * Last-known-good fallback: when KV is bound, each successfully parsed feed is
 * kept, keyed by a SHA-256 of its URL (never the URL itself). If the feed host
 * is down later, that copy is served with `stale: true` instead of an empty
 * calendar. Copies are refreshed at most every ICS_KEEP_REFRESH_MS, to stay
 * far below the free KV write quota, and expire after ICS_KEEP_TTL_SEC.
 *
 * Config (wrangler.toml): [vars] FIREBASE_PROJECT_ID, ALLOWED_ORIGINS,
 * AI_MODEL, AI_DAILY_LIMIT, DOCS_* · bindings AI (Workers AI), KV (Workers KV),
 * DOCS (R2), DB (D1).
 */

import ICAL from 'ical.js';
import { generateFlashcards } from './ai.js';
import { docRoutes } from './docs.js';
import { libraryRoutes } from './library.js';

// ── Limits ──
const MAX_CALENDARS       = 10;
const MAX_ICS_BYTES       = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS    = 10_000;
const MAX_EVENTS_PER_FEED = 5000;
const MAX_TITLE_LENGTH    = 200;
const WINDOW_PAST_DAYS    = 180;
const WINDOW_FUTURE_DAYS  = 365;
const DAY_MS              = 86_400_000;
const ICS_KEEP_REFRESH_MS = 6 * 3_600_000;
const ICS_KEEP_TTL_SEC    = 30 * 86_400;

const GOOGLE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const { pathname } = new URL(request.url);
    const match = matchRoute(request.method, pathname);
    if (!match) return json({ error: 'not_found' }, 404, cors);

    const idToken = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    let uid;
    try {
      uid = await verifyIdToken(idToken, env.FIREBASE_PROJECT_ID);
    } catch {
      return json({ error: 'unauthorized' }, 401, cors);
    }

    // Handlers return `{ body, status }` (sent as JSON) or a ready Response (files).
    let result;
    try {
      result = await match.handler({ request, env, uid, idToken, params: match.params });
    } catch {
      return json({ error: 'internal_error' }, 500, cors);
    }
    if (result instanceof Response) {
      for (const [k, v] of Object.entries(cors)) result.headers.set(k, v);
      return result;
    }
    return json(result.body, result.status, cors);
  },
};

// [method, path pattern, handler]. Capture groups become `params`.
const ROUTES = [
  ['GET', /^\/events$/, handleEvents],
  ['POST', /^\/ai\/flashcards$/, generateFlashcards],
  ...docRoutes,
  ...libraryRoutes,
];

function matchRoute(method, pathname) {
  for (const [m, pattern, handler] of ROUTES) {
    if (m !== method) continue;
    const found = pattern.exec(pathname);
    if (found) return { handler, params: found.slice(1) };
  }
  return null;
}

/** GET /events — see the file header. Returns `{ body, status }`. */
async function handleEvents({ env, uid, idToken }) {
  let calendars;
  try {
    calendars = await readUserCalendars(uid, idToken, env.FIREBASE_PROJECT_ID);
  } catch {
    return { body: { error: 'calendars_unavailable' }, status: 502 };
  }

  const now = Date.now();
  const range = { from: now - WINDOW_PAST_DAYS * DAY_MS, to: now + WINDOW_FUTURE_DAYS * DAY_MS };

  const results = await Promise.all(
    calendars.slice(0, MAX_CALENDARS).map(cal => loadCalendar(cal, range, env.KV))
  );
  return { body: { calendars: results }, status: 200 };
}

// ── HTTP helpers ──

function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin');
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(body, status, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...extraHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      // Responses contain a user's private data — never cache them anywhere.
      'Cache-Control': 'no-store',
    },
  });
}

// ── Firebase ID token verification ──
// Follows https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library

let jwksCache = { keys: new Map(), expiresAt: 0 };

async function getGoogleSigningKey(kid) {
  if (Date.now() >= jwksCache.expiresAt || !jwksCache.keys.has(kid)) {
    const res = await fetch(GOOGLE_JWKS_URL);
    if (!res.ok) throw new Error('jwks_fetch_failed');
    const { keys } = await res.json();
    const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('Cache-Control') || '')?.[1] || 3600);
    const imported = new Map();
    for (const jwk of keys) {
      imported.set(jwk.kid, await crypto.subtle.importKey(
        'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
      ));
    }
    jwksCache = { keys: imported, expiresAt: Date.now() + maxAge * 1000 };
  }
  const key = jwksCache.keys.get(kid);
  if (!key) throw new Error('unknown_kid');
  return key;
}

function base64UrlToBytes(input) {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

function decodeJwtPart(part) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
}

/** Returns the verified uid, or throws. */
async function verifyIdToken(token, projectId) {
  const parts = token.split('.');
  if (parts.length !== 3 || !projectId) throw new Error('malformed');

  const header = decodeJwtPart(parts[0]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('bad_header');

  const key = await getGoogleSigningKey(header.kid);
  const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64UrlToBytes(parts[2]), signedData);
  if (!valid) throw new Error('bad_signature');

  const claims = decodeJwtPart(parts[1]);
  const nowSec = Math.floor(Date.now() / 1000);
  const CLOCK_SKEW_SEC = 60;
  if (claims.aud !== projectId) throw new Error('bad_audience');
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) throw new Error('bad_issuer');
  if (typeof claims.exp !== 'number' || claims.exp <= nowSec) throw new Error('expired');
  if (typeof claims.iat !== 'number' || claims.iat > nowSec + CLOCK_SKEW_SEC) throw new Error('bad_iat');
  if (typeof claims.auth_time !== 'number' || claims.auth_time > nowSec + CLOCK_SKEW_SEC) throw new Error('bad_auth_time');
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128) throw new Error('bad_subject');
  return claims.sub;
}

// ── Firestore (REST, authenticated as the user) ──

/** Returns `[{ id, url }]` from `users/{uid}/data/calendars`; `[]` if the doc doesn't exist. */
async function readUserCalendars(uid, idToken, projectId) {
  const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}/data/calendars`;
  const res = await fetch(docUrl, { headers: { Authorization: `Bearer ${idToken}` } });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`firestore_${res.status}`);

  const docJson = await res.json();
  const entries = docJson.fields?.calendars?.arrayValue?.values || [];
  return entries
    .map(v => v.mapValue?.fields || {})
    .map(f => ({ id: f.id?.stringValue || '', url: f.url?.stringValue || '' }))
    .filter(c => c.id);
}

// ── .ics loading & parsing ──

async function loadCalendar({ id, url }, range, kv) {
  if (!isAllowedFeedUrl(url)) return { id, events: [], error: 'invalid_url' };

  const keepKey = kv ? `ics:${await sha256Hex(url)}` : null;

  let text;
  try {
    text = await fetchIcs(url);
  } catch (e) {
    const kept = keepKey ? await kv.get(keepKey).catch(() => null) : null;
    if (kept) {
      try {
        return { id, events: parseIcs(kept, range), stale: true };
      } catch { /* unreadable copy: report the fetch error below */ }
    }
    return { id, events: [], error: e.message === 'too_large' ? 'too_large' : 'fetch_failed' };
  }

  let events;
  try {
    events = parseIcs(text, range);
  } catch {
    return { id, events: [], error: 'parse_failed' };
  }
  if (keepKey) await keepFeedCopy(kv, keepKey, text);
  return { id, events };
}

/** Stores a feed that parsed fine as the fallback copy, at most once per ICS_KEEP_REFRESH_MS. */
async function keepFeedCopy(kv, key, text) {
  try {
    const { value, metadata } = await kv.getWithMetadata(key, { type: 'stream' });
    await value?.cancel();
    if (metadata?.storedAt && Date.now() - metadata.storedAt < ICS_KEEP_REFRESH_MS) return;
    await kv.put(key, text, { expirationTtl: ICS_KEEP_TTL_SEC, metadata: { storedAt: Date.now() } });
  } catch {
    // Best-effort: a KV hiccup must never break the live response.
  }
}

async function sha256Hex(input) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function isAllowedFeedUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
}

async function fetchIcs(url) {
  const res = await fetch(url, {
    headers: { Accept: 'text/calendar, */*;q=0.5' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error('http_error');
  if (Number(res.headers.get('Content-Length') || 0) > MAX_ICS_BYTES) throw new Error('too_large');
  const text = await res.text();
  if (text.length > MAX_ICS_BYTES) throw new Error('too_large');
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('not_ics');
  return text;
}

/** Parses an .ics string into `{ title, start, end, allDay }` events overlapping `range`. */
function parseIcs(text, range) {
  const root = new ICAL.Component(ICAL.parse(text));

  // Register embedded time zones so TZID-based dates resolve correctly.
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    ICAL.TimezoneService.register(tz);
  }

  // Masters first, then attach RECURRENCE-ID overrides to their recurring master.
  const vevents = root.getAllSubcomponents('vevent');
  const masters = new Map();
  const standalone = [];
  for (const comp of vevents) {
    if (comp.hasProperty('recurrence-id')) continue;
    const ev = new ICAL.Event(comp);
    if (ev.isRecurring()) masters.set(ev.uid, ev);
    else standalone.push(ev);
  }
  for (const comp of vevents) {
    if (!comp.hasProperty('recurrence-id')) continue;
    const ev = new ICAL.Event(comp);
    const master = masters.get(ev.uid);
    if (master) master.relateException(ev);
    else standalone.push(ev);
  }

  const events = [];
  const push = (summary, startTime, endTime) => {
    if (events.length >= MAX_EVENTS_PER_FEED || !startTime) return;
    const start = startTime.toJSDate();
    const end = (endTime || startTime).toJSDate();
    if (end.getTime() < range.from || start.getTime() > range.to) return;
    const allDay = startTime.isDate;
    events.push({
      title: String(summary || '').slice(0, MAX_TITLE_LENGTH),
      // All-day events carry no time zone: send plain "YYYY-MM-DD" dates (end is
      // exclusive, per RFC 5545) so the client places them on its own local day.
      start: allDay ? startTime.toString() : start.toISOString(),
      end: allDay ? (endTime || startTime).toString() : end.toISOString(),
      allDay,
    });
  };

  for (const ev of standalone) {
    if (isCancelled(ev)) continue;
    push(ev.summary, ev.startDate, ev.endDate);
  }

  for (const master of masters.values()) {
    if (isCancelled(master)) continue;
    const it = master.iterator();
    for (let i = 0, next; i < MAX_EVENTS_PER_FEED && (next = it.next()); i++) {
      if (next.toJSDate().getTime() > range.to) break;
      const occ = master.getOccurrenceDetails(next);
      if (isCancelled(occ.item)) continue;
      push(occ.item.summary, occ.startDate, occ.endDate);
    }
  }

  return events;
}

function isCancelled(ev) {
  return String(ev.component.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED';
}
