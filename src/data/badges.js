/**
 * Single source of badge definitions (used by PageStats and UserProfileModal).
 *
 * Each badge is { id, ico, xp? }:
 *   - id  : stable identifier, matched against the user's `earnedBadges` array.
 *   - ico : emoji shown when the badge is unlocked (🔒 otherwise).
 *   - xp  : optional bonus XP granted when the badge unlocks.
 *
 * Names and descriptions are NOT stored here: they live in the i18n `badges`
 * namespace, keyed `<id>_name` and `<id>_desc`, so they are translated at
 * render time (see PageStats / UserProfileModal which call `t(...)`).
 *
 * ⚠️ Unlocking logic is server-side (Cloud Function). Adding an id here only
 * DISPLAYS the badge — the new id must also be wired into the awarding logic
 * for it to actually unlock.
 */
export const BADGES = [
  // ── Onboarding ──
  { id: 'welcome',        ico: '👋', xp: 50 },

  // ── Planning / blocks ──
  { id: 'first_bloc',     ico: '🎯' },
  { id: 'three_subjects', ico: '🗓' },
  { id: 'six_subjects',   ico: '🗂️', xp: 300 },
  { id: 'planif_pro',     ico: '🗓️', xp: 400 },
  { id: 'planif_master',  ico: '📆', xp: 1000 },
  { id: 'template_creator', ico: '📋', xp: 300 },
  { id: 'exporter',       ico: '🖨️', xp: 200 },
  { id: 'challenge_week', ico: '🗡️', xp: 800 },
  { id: 'all_done',       ico: '🏆', xp: 2000 },

  // ── Focus / Pomodoro ──
  { id: 'pomodoro',       ico: '🍅' },
  { id: 'no_ghost',       ico: '👻', xp: 500 },
  { id: 'five_sessions',  ico: '⏰' },
  { id: 'ten_sessions',   ico: '🔟', xp: 600 },
  { id: 'speed_reader',   ico: '📖', xp: 500 },
  { id: '120min',         ico: '⌛' },
  { id: 'focus_240day',   ico: '⏳', xp: 800 },
  { id: 'marathonien',    ico: '🏅', xp: 800 },
  { id: 'ultra_marathon', ico: '🏃', xp: 1500 },
  { id: 'sans_faille',    ico: '🛡️', xp: 600 },
  { id: 'centurion',      ico: '💯', xp: 2000 },
  { id: 'focus_250',      ico: '🔥', xp: 5000 },
  { id: 'focus_500',      ico: '🌋', xp: 10000 },
  { id: 'night_owl',      ico: '🦉', xp: 300 },
  { id: 'early_bird',     ico: '🌅', xp: 300 },
  { id: 'nuit_blanche',   ico: '🌙', xp: 500 },
  { id: 'matinal',        ico: '☀️', xp: 500 },

  // ── Streaks ──
  { id: 'streak3',        ico: '🔥' },
  { id: 'iron_regular',   ico: '🧲', xp: 500 },
  { id: 'streak7',        ico: '⚡', xp: 500 },
  { id: 'streak14',       ico: '💎', xp: 1000 },
  { id: 'en_feu',         ico: '🔥', xp: 1500 },
  { id: 'diamant',        ico: '💎', xp: 3000 },
  { id: 'streak60',       ico: '❄️', xp: 6000 },
  { id: 'streak100',      ico: '🏔️', xp: 12000 },

  // ── Progress / chapters / confidence ──
  { id: 'synth100',       ico: '📚', xp: 500 },
  { id: 'perfectionniste', ico: '🌟', xp: 800 },
  { id: 'pret',           ico: '🎓', xp: 1000 },
  { id: 'synth_totale',   ico: '📖', xp: 2000 },
  { id: 'conf4',          ico: '⭐' },
  { id: 'confiant',       ico: '⭐', xp: 600 },

  // ── Flashcards ──
  { id: 'ten_cards',      ico: '🃏' },
  { id: 'encyclopedie',   ico: '📚', xp: 500 },
  { id: 'cards_100',      ico: '🎴', xp: 1000 },
  { id: 'cards_250',      ico: '🗃️', xp: 2500 },
  { id: 'maitre_cartes',  ico: '🃏', xp: 400 },
  { id: 'polyglotte',     ico: '🌍', xp: 300 },

  // ── Spaced repetition (Rév. J) ──
  { id: 'first_sr',       ico: '🔁' },
  { id: 'memoriste',      ico: '🧠', xp: 500 },
  { id: 'sr_50',          ico: '🧠', xp: 1500 },
  { id: 'sr_100',         ico: '🐘', xp: 3000 },

  // ── Journal ──
  { id: 'journal_first',  ico: '📔' },
  { id: 'journal_10',     ico: '📓', xp: 300 },
  { id: 'journal_30',     ico: '📜', xp: 800 },

  // ── To-do ──
  { id: 'todo_first',     ico: '☑️' },
  { id: 'todo_zero',      ico: '🧹', xp: 400 },

  // ── Exams / calendar ──
  { id: 'first_exam',     ico: '📅' },
  { id: 'exam_ready',     ico: '🎓', xp: 800 },
  { id: 'exam_sprint',    ico: '⚔️', xp: 500 },

  // ── Levels / themes ──
  { id: 'level5',         ico: '🎮' },
  { id: 'level10',        ico: '🌊' },
  { id: 'level18',        ico: '🤖' },
  { id: 'theme_foret',    ico: '🌲' },
  { id: 'theme_cyber',    ico: '🤖' },
  { id: 'theme_abyssal',  ico: '👁️' },

  // ── Social (groups + DMs + sharing) ──
  { id: 'groupe_actif',   ico: '👥', xp: 300 },
  { id: 'group_legend',   ico: '💬', xp: 800 },
  { id: 'sondeur',        ico: '📊', xp: 200 },
  { id: 'pollster_pro',   ico: '📈', xp: 400 },
  { id: 'first_dm',       ico: '✉️' },
  { id: 'social_butterfly', ico: '🦋', xp: 400 },
  { id: 'blokly_fan',     ico: '💙' },
  { id: 'ambassadeur',    ico: '📣', xp: 500 },

  // ── Support ──
  { id: 'soutien',        ico: '🐼', xp: 1000 },
  { id: 'grand_mecene',   ico: '👑', xp: 3000 },

  // ── XP milestones ──
  { id: 'xp_1000',        ico: '⚡', xp: 0 },
  { id: 'xp_5000',        ico: '💫', xp: 0 },
  { id: 'xp_10000',       ico: '🌟', xp: 0 },
  { id: 'xp_50000',       ico: '🏆', xp: 0 },
  { id: 'xp_100000',      ico: '👑', xp: 0 },
];

export const BADGE_ICONS = Object.fromEntries(BADGES.map(b => [b.id, b.ico]));