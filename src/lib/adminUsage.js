/**
 * What one account actually uses — derived from its main document.
 * --------------------------------------------------------------------------
 * Pure: reads `users/{uid}/data/main`, writes nothing, touches no clock of its
 * own (pass `now` in). It powers the console's "En ligne" tab: the per-account
 * panel and the feature-adoption table that answers "which parts of the app do
 * my students really open?".
 *
 * Every figure maps to a field the document really carries (same shapes the
 * app itself reads — see lib/weeklyRecap.js and lib/flashcardStore.js). The
 * parts stored elsewhere are NOT counted here and must stay out of any
 * "unused feature" conclusion:
 *   - documents and PDF annotations live in the worker (R2 + D1),
 *   - notification preferences live in the worker's D1,
 *   - the Réserve / collection lives in `users/{uid}/data/reserve`,
 *   - group membership lives in the `groups` collection.
 */

import { DEFAULT_PREFERENCES } from '../themes/themes';

const asArray = v => (Array.isArray(v) ? v : []);
const asObject = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** Milliseconds of an ISO string, or 0 when it cannot be read. */
function msOf(iso) {
  const t = Date.parse(String(iso || ''));
  return Number.isNaN(t) ? 0 : t;
}

/**
 * One account's usage snapshot.
 * @param {object} main  the main document (an empty object is fine)
 * @returns {object} counters — never null, every field a number/string/boolean
 */
export function usageProfile(main = {}) {
  const doc = asObject(main);
  const subjects = asArray(doc.subjects);

  let chapters = 0;
  let chaptersDone = 0;
  let exams = 0;
  for (const s of subjects) {
    const list = asArray(s?.chapters);
    const count = list.length || Number(s?.chaps) || 0;
    chapters += count;
    chaptersDone += list.filter(c => c?.status === 'done').length;
    if (s?.date) exams++;
  }

  const blocks = asArray(doc.blocks);
  const blocksDone = blocks.filter(b => b?.status === 'done').length;
  const autoBlocks = blocks.filter(b => b?.auto === true).length;

  const decks = Object.entries(asObject(doc.flashcards))
    .map(([id, cards]) => ({ id, count: asArray(cards).length }))
    .filter(d => d.count > 0);
  const cards = decks.reduce((n, d) => n + d.count, 0);

  const sessions = asArray(doc.sessions).filter(s => s && s.at);
  const lastSessionAt = sessions.reduce((m, s) => Math.max(m, msOf(s.at)), 0) || null;
  const recentFocusMin = sessions.reduce((n, s) => n + (Number(s.mins) || 0), 0);

  const todos = asArray(doc.todos);
  const prefs = asObject(doc.prefs);

  return {
    pseudo: asObject(doc.profile).pseudo || '',
    photo: !!doc.photoURL,
    xp: Number(doc.xp) || 0,
    streak: Number(doc.streak) || 0,
    totalFocusHours: Number(doc.totalFocusHours) || 0,
    badges: asArray(doc.earnedBadges).length,

    subjects: subjects.length,
    chapters,
    chaptersDone,
    exams,
    blocks: blocks.length,
    blocksDone,
    autoBlocks,
    decks: decks.length,
    cards,
    srCards: Object.keys(asObject(doc.srData)).length,
    journal: asArray(doc.journalEntries).length,
    todos: todos.length,
    todosDone: todos.filter(x => x?.done).length,
    likedDecks: asArray(doc.likedDecks).length,

    sessions: sessions.length,
    recentFocusMin,
    lastSessionAt,

    theme: prefs.themeId || DEFAULT_PREFERENCES.themeId,
    lang: prefs.lang || DEFAULT_PREFERENCES.lang || 'fr',
  };
}

/**
 * The feature checklist of the adoption table. `has` answers "has this account
 * ever used it", never "how much" — that is what makes the percentages
 * readable at a glance.
 */
export const FEATURES = [
  { id: 'subjects', label: 'Matières créées', has: u => u.subjects > 0 },
  { id: 'chapters', label: 'Synthèses (chapitres)', has: u => u.chapters > 0 },
  { id: 'focus', label: 'Chrono focus', has: u => u.sessions > 0 || u.totalFocusHours > 0 },
  { id: 'planning', label: 'Planning', has: u => u.blocks > 0 },
  { id: 'autoPlan', label: 'Plan de révision auto', has: u => u.autoBlocks > 0 },
  { id: 'flashcards', label: 'Flashcards', has: u => u.cards > 0 },
  { id: 'repetition', label: 'Répétition espacée', has: u => u.srCards > 0 },
  { id: 'exams', label: "Dates d'examen", has: u => u.exams > 0 },
  { id: 'journal', label: 'Journal', has: u => u.journal > 0 },
  { id: 'todo', label: 'To-do', has: u => u.todos > 0 },
  { id: 'badges', label: 'Au moins un badge', has: u => u.badges > 0 },
  { id: 'photo', label: 'Photo de profil', has: u => u.photo },
  { id: 'theme', label: 'Thème changé', has: u => u.theme !== DEFAULT_PREFERENCES.themeId },
];

/**
 * Adoption across a set of usage profiles.
 * @returns {{ id, label, count, pct }[]} most adopted first
 */
export function featureAdoption(profiles) {
  const total = profiles.length;
  return FEATURES
    .map(f => {
      const count = profiles.filter(f.has).length;
      return { id: f.id, label: f.label, count, pct: total ? Math.round((count / total) * 100) : 0 };
    })
    .sort((a, b) => b.count - a.count);
}

/** How the theme / language choices are spread, biggest group first. */
export function spreadOf(profiles, key) {
  const counts = new Map();
  for (const p of profiles) counts.set(p[key], (counts.get(p[key]) || 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

/** "il y a 4 min" / "il y a 3 h" / "il y a 2 j" — console-only, French. */
export function sinceLabel(ms, now = Date.now()) {
  if (!ms) return 'jamais';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return "à l'instant";
  const min = Math.round(s / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

/** "depuis 12 min" — how long a live session has been running. */
export function forLabel(startedAt, now = Date.now()) {
  if (!startedAt) return '';
  const min = Math.max(0, Math.round((now - startedAt) / 60000));
  if (min < 1) return "depuis moins d'une minute";
  if (min < 60) return `depuis ${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `depuis ${h} h ${String(rest).padStart(2, '0')}` : `depuis ${h} h`;
}
