/**
 * External (.ics) calendars shown read-only in the Planning page.
 * --------------------------------------------------------------------------
 * Storage: Firestore `users/{uid}/data/calendars` = `{ calendars: [{ id, name, url, color }] }`.
 * This is its own document on purpose: `users/{uid}/data/main` is readable by
 * other users (public profile), and feed URLs embed private access tokens.
 * Firestore rules must restrict this document to its owner.
 *
 * Events are never stored. On every Planning open, the client calls the
 * Cloudflare calendar worker (`VITE_CALENDAR_WORKER_URL`) with the user's
 * Firebase ID token; the worker reads the feed URLs server-side, fetches and
 * parses the .ics files, and returns only `{ title, start, end, allDay }`.
 */

import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export const MAX_CALENDARS = 10;

/**
 * False in builds without a worker URL (e.g. production before the worker is
 * deployed). The Planning page then hides the feature entirely, so nobody can
 * save a private feed URL that nothing would ever read.
 */
export const isCalendarWorkerAvailable = () => Boolean(import.meta.env.VITE_CALENDAR_WORKER_URL);
export const DEFAULT_CALENDAR_COLOR = '#2E8B57';

const WORKER_URL = (import.meta.env.VITE_CALENDAR_WORKER_URL || '').replace(/\/+$/, '');

const calendarsRef = uid => doc(db, 'users', uid, 'data', 'calendars');

/** Live list of the user's calendars. Returns the unsubscribe function. */
export function subscribeCalendars(uid, onChange) {
  return onSnapshot(
    calendarsRef(uid),
    snap => onChange(snap.exists() ? (snap.data().calendars || []) : []),
    () => onChange([])
  );
}

/** Overwrites the whole calendars list (the document holds nothing else). */
export function saveCalendars(uid, calendars) {
  return setDoc(calendarsRef(uid), { calendars });
}

/**
 * Normalizes a pasted feed link: trims it and turns `webcal://` (the scheme
 * many calendar apps hand out) into `https://`. Returns null if unusable.
 */
export function normalizeIcsUrl(raw) {
  const trimmed = (raw || '').trim().replace(/^webcals?:\/\//i, 'https://');
  try {
    const u = new URL(trimmed);
    return u.protocol === 'https:' && trimmed.length <= 2000 ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Short random id for a new calendar entry. */
export function newCalendarId() {
  return Math.random().toString(36).slice(2, 10);
}

/** "YYYY-MM-DD" → local midnight Date. */
function parseLocalDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Fetches events for all of the user's calendars through the worker.
 * Resolves to `{ events: [{ key, calId, title, start: Date, end: Date, allDay }], errors: { [calId]: code } }`.
 * Throws if the worker is unreachable or not configured.
 */
export async function fetchExternalEvents(user) {
  if (!WORKER_URL) throw new Error('calendar_worker_not_configured');
  const idToken = await user.getIdToken();
  const res = await fetch(`${WORKER_URL}/events`, { headers: { Authorization: `Bearer ${idToken}` } });
  if (!res.ok) throw new Error(`calendar_worker_${res.status}`);
  const body = await res.json();

  const events = [];
  const errors = {};
  for (const cal of body.calendars || []) {
    if (cal.error) errors[cal.id] = cal.error;
    (cal.events || []).forEach((e, i) => {
      events.push({
        key: `${cal.id}:${i}`,
        calId: cal.id,
        title: e.title,
        start: e.allDay ? parseLocalDate(e.start) : new Date(e.start),
        end: e.allDay ? parseLocalDate(e.end) : new Date(e.end),
        allDay: !!e.allDay,
      });
    });
  }
  return { events, errors };
}

/** Hour-of-day as a decimal (e.g. 8.5 for 08:30), in local time. */
function hourOf(date) {
  return date.getHours() + date.getMinutes() / 60;
}

/**
 * Events touching the local day `day` (any time on that date).
 * Timed events get `fromH` / `toH` (decimal hours, clipped to the day) and a
 * lane layout (`lane`, `lanes`) so overlapping events sit side by side.
 * Returns `{ timed, allDay }`.
 */
export function eventsForDay(events, day) {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const dayEnd = new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1);

  const allDay = events.filter(e => e.allDay && e.start < dayEnd && e.end > dayStart);
  const timed = events
    .filter(e => !e.allDay && e.start < dayEnd && e.end > dayStart)
    .map(e => {
      const fromH = e.start <= dayStart ? 0 : hourOf(e.start);
      const toH = e.end >= dayEnd ? 24 : hourOf(e.end);
      // Keep zero-length events visible as a thin 15-minute slot.
      return { ...e, fromH, toH: Math.max(toH, Math.min(fromH + 0.25, 24)) };
    })
    .sort((a, b) => a.fromH - b.fromH || b.toH - a.toH);

  return { timed: assignLanes(timed), allDay };
}

/**
 * Greedy lane assignment: events that overlap share their cluster's width.
 * Mutates nothing; returns new objects with `lane` and `lanes`.
 */
function assignLanes(sorted) {
  const out = [];
  let cluster = [];
  let laneEnds = [];
  let clusterEnd = -1;

  const flush = () => {
    cluster.forEach(e => out.push({ ...e, lanes: laneEnds.length }));
    cluster = [];
    laneEnds = [];
  };

  for (const e of sorted) {
    if (e.fromH >= clusterEnd) flush();
    let lane = laneEnds.findIndex(end => end <= e.fromH);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(e.toH); }
    else laneEnds[lane] = e.toH;
    cluster.push({ ...e, lane });
    clusterEnd = Math.max(clusterEnd, e.toH);
  }
  flush();
  return out;
}

/** Local "HH:MM" for an event boundary. */
export function formatEventTime(date, lang) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return lang === 'fr' ? `${hh}h${mm}` : `${hh}:${mm}`;
}
