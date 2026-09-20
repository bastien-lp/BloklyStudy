/**
 * Features that can be switched off from the developer console.
 * --------------------------------------------------------------------------
 * A flag lives in the existing `config/app` document, under `features`:
 *
 *   config/app : { systemMessage, maintenance, features: { quiz: false, … } }
 *
 * ON BY DEFAULT, ALWAYS. A feature is only hidden when an explicit `false`
 * was actually received. Loading, a missing document, a refused read or being
 * offline all mean "everything is available" — a network hiccup must never
 * take a tab away from a student mid-revision.
 *
 * Switching one off HIDES it; it never deletes anything. The data stays where
 * it is and comes back untouched when the flag is turned on again, which is
 * what makes this safe to use on a live app: close a feature that misbehaves,
 * fix it, open it again.
 *
 * Administrators keep seeing a closed feature (marked as closed), so the thing
 * being fixed can still be reached.
 */

/**
 * What can be closed, and what it covers. `tab` ties a flag to a tab of the
 * app; the others gate a tool inside a page.
 */
export const FEATURES = [
  // ── Pages ──
  { id: 'planning', tab: 'planning', group: 'pages' },
  { id: 'todo', tab: 'todo', group: 'pages' },
  { id: 'progress', tab: 'progress', group: 'pages' },
  { id: 'confidence', tab: 'confidence', group: 'pages' },
  { id: 'syntheses', tab: 'syntheses', group: 'pages' },
  { id: 'flashcards', tab: 'flashcards', group: 'pages' },
  { id: 'repetition', tab: 'repetition', group: 'pages' },
  { id: 'exams', tab: 'exams', group: 'pages' },
  { id: 'stats', tab: 'stats', group: 'pages' },
  { id: 'reserve', tab: 'reserve', group: 'pages' },
  { id: 'groups', tab: 'groups', group: 'pages' },
  { id: 'journal', tab: 'journal', group: 'pages' },
  { id: 'whoarewe', tab: 'whoarewe', group: 'pages' },

  // ── Tools inside the pages ──
  { id: 'autoPlan', group: 'tools' },        // the automatic revision plan
  { id: 'calendarImport', group: 'tools' },  // subscribing to an external calendar
  { id: 'documents', group: 'tools' },       // uploading and sharing documents
  { id: 'library', group: 'tools' },         // the public synthesis library
  { id: 'pdfFlashcards', group: 'tools' },   // making flashcards out of a PDF
  { id: 'quiz', group: 'tools' },            // the live group quiz
  { id: 'groupSessions', group: 'tools' },   // live shared focus sessions
  { id: 'groupGrove', group: 'tools' },      // the group's weekly grove
  { id: 'dailyQuests', group: 'tools' },     // the three quests of the day
  { id: 'notifications', group: 'tools' },   // push reminders
  { id: 'publicDecks', group: 'tools' },     // the shared flashcard decks
];

export const FEATURE_IDS = FEATURES.map(f => f.id);

/** The flags a config document carries, cleaned: only known ids, only `false`. */
export function readFeatures(data) {
  const raw = data?.features;
  const out = {};
  if (raw && typeof raw === 'object') {
    for (const id of FEATURE_IDS) if (raw[id] === false) out[id] = false;
  }
  return out;
}

/**
 * Whether a feature is open.
 * @param {object} features  the cleaned map
 * @param {string} id
 */
export function isEnabled(features, id) {
  return features?.[id] !== false;
}

/**
 * What a page or a tool should do about it.
 * @returns {{ open: boolean, closed: boolean, preview: boolean }}
 *          `preview` is true when it is closed but shown anyway because the
 *          viewer is an administrator.
 */
export function featureState(features, id, admin = false) {
  const open = isEnabled(features, id);
  return { open: open || admin, closed: !open, preview: !open && admin };
}

/** The tabs left once the closed ones are taken out (administrators keep all). */
export function visibleTabs(tabs, features, admin = false) {
  if (admin) return tabs;
  const closedTabs = new Set(FEATURES.filter(f => f.tab && !isEnabled(features, f.id)).map(f => f.tab));
  return tabs.filter(tab => !closedTabs.has(tab.id));
}

/** The flag that governs a tab, if any. */
export function featureOfTab(tabId) {
  return FEATURES.find(f => f.tab === tabId)?.id || null;
}
