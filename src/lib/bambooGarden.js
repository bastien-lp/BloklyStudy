/**
 * The bamboo garden — one grove fed by every focus session.
 * --------------------------------------------------------------------------
 * Pure: no Firestore, no clock, no React. The page and the focus bank both go
 * through these functions so the garden can never drift between the screen
 * that shows it and the code that feeds it.
 *
 * THE RULES (what a student sees):
 *   - every minute of the timer feeds the SAME grove, whatever the subject;
 *   - a bamboo is ripe after MINUTES_PER_BAMBOO minutes;
 *   - cutting pays COINS_PER_MINUTE coins per minute banked, plus a bonus of
 *     25 / 50 / 100 coins when 1 / 2 / 3 bamboos are cut ripe at once;
 *   - coins buy a 2nd and a 3rd bamboo, and more bamboos means more time can
 *     be banked before the grove is full (minutes over capacity are lost, so
 *     cutting regularly is the point).
 *
 * STORAGE (`users/{uid}/data/reserve`, additive — nothing was renamed):
 *   bamboo: { v: 2, pool: minutes banked, slots: 1..3, by: { subjId: minutes },
 *             plant: species id, owned: [species ids] }
 * The old per-subject fields (`studyTime`, `harvested`, `potLevels`,
 * `potProgress`, `diversity`) are LEFT UNTOUCHED: `readGarden` converts them
 * into the first pool once, and they stay in the document as history.
 */

import { cleanSpecies, cleanOwned, DEFAULT_SPECIES } from './plantSpecies';

/** Minutes of focus for one ripe bamboo. */
export const MINUTES_PER_BAMBOO = 60;
/** Coins paid per minute banked when the grove is cut. */
export const COINS_PER_MINUTE = 2;
/** How many bamboos a garden can hold at most. */
export const MAX_SLOTS = 3;
/** Bonus for cutting 1, 2 or 3 ripe bamboos in the same cut. */
export const FULL_BONUS = [0, 25, 50, 100];
/** Price of the 2nd and the 3rd bamboo (index = the slot being bought). */
export const SLOT_PRICES = [0, 0, 200, 500];

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/** Price of the next bamboo, or null when the garden is already full. */
export function nextSlotPrice(slots) {
  const next = clampSlots(slots) + 1;
  return next <= MAX_SLOTS ? SLOT_PRICES[next] : null;
}

function clampSlots(slots) {
  return Math.min(MAX_SLOTS, Math.max(1, Math.round(num(slots, 1))));
}

/**
 * Minutes still standing in the OLD per-subject garden: everything studied
 * minus everything already harvested. Used once, to plant the first pool.
 */
export function legacyPool(reserve = {}) {
  const studied = Object.values(reserve.studyTime || {}).reduce((n, v) => n + Math.max(0, num(v)), 0);
  const harvested = Object.values(reserve.harvested || {}).reduce((n, v) => n + Math.max(0, num(v)), 0);
  return Math.max(0, Math.round(studied - harvested));
}

/**
 * The garden held by a reserve document, migrating the old shape on the fly.
 * @returns {{ pool: number, slots: number, by: object, migrated: boolean }}
 *          `migrated` is true when the value comes from the old fields and
 *          should therefore be written back once.
 */
export function readGarden(reserve = {}) {
  const b = reserve.bamboo;
  if (b && num(b.v) >= 2) {
    return {
      pool: Math.max(0, Math.round(num(b.pool))),
      slots: clampSlots(b.slots),
      by: { ...(b.by || {}) },
      plant: cleanSpecies(b.plant),
      owned: cleanOwned(b.owned),
      migrated: false,
    };
  }
  return {
    pool: legacyPool(reserve), slots: 1, by: {},
    plant: DEFAULT_SPECIES, owned: cleanOwned([]), migrated: true,
  };
}

/** The value to store back, always complete and always valid. */
export function writeGarden({ pool, slots, by, plant, owned }) {
  return {
    v: 2,
    pool: Math.max(0, Math.round(num(pool))),
    slots: clampSlots(slots),
    by: by || {},
    plant: cleanSpecies(plant),
    owned: cleanOwned(owned),
  };
}

/**
 * What the garden looks like right now.
 * @returns {{ capacity, plants: {index, mins, pct, ripe}[], ripeCount, full, overflow }}
 *          `overflow` is the time banked beyond capacity — only ever there
 *          after the migration of a long-unharvested old garden.
 */
export function gardenState(pool, slots) {
  const s = clampSlots(slots);
  const banked = Math.max(0, Math.round(num(pool)));
  const capacity = s * MINUTES_PER_BAMBOO;
  const plants = Array.from({ length: s }, (_, i) => {
    const mins = Math.min(MINUTES_PER_BAMBOO, Math.max(0, banked - i * MINUTES_PER_BAMBOO));
    return { index: i, mins, pct: mins / MINUTES_PER_BAMBOO, ripe: mins >= MINUTES_PER_BAMBOO };
  });
  return {
    capacity,
    plants,
    ripeCount: plants.filter(p => p.ripe).length,
    full: banked >= capacity,
    overflow: Math.max(0, banked - capacity),
  };
}

/**
 * What cutting the whole grove pays.
 * @returns {{ base, bonus, coins, ripeCount }}
 */
export function cutValue(pool, slots) {
  const banked = Math.max(0, Math.round(num(pool)));
  const { ripeCount } = gardenState(banked, slots);
  const base = banked * COINS_PER_MINUTE;
  const bonus = FULL_BONUS[Math.min(ripeCount, MAX_SLOTS)] || 0;
  return { base, bonus, coins: base + bonus, ripeCount };
}

/**
 * Adds focused minutes to the grove, per subject, never past capacity.
 * @returns the new garden value (same shape as `readGarden`, minus `migrated`)
 */
export function addMinutes(garden, mins, subjId = '') {
  const slots = clampSlots(garden?.slots);
  const capacity = slots * MINUTES_PER_BAMBOO;
  const pool = Math.max(0, Math.round(num(garden?.pool)));
  const added = Math.max(0, Math.min(Math.round(num(mins)), Math.max(0, capacity - pool)));
  const by = { ...(garden?.by || {}) };
  if (added > 0 && subjId) by[subjId] = Math.max(0, num(by[subjId])) + added;
  return { ...garden, pool: pool + added, slots, by, added };
}

/** The grove after a cut: empty, same slots. */
export function afterCut(garden) {
  return { ...garden, pool: 0, slots: clampSlots(garden?.slots), by: {} };
}

/**
 * Which subjects fed the current grove, biggest share first.
 * @param {object} by        { subjId: minutes }
 * @param {Array}  subjects  the main document's subjects, for names and colours
 */
export function contributions(by = {}, subjects = []) {
  const total = Object.values(by).reduce((n, v) => n + Math.max(0, num(v)), 0);
  if (!total) return [];
  return Object.entries(by)
    .map(([id, mins]) => {
      const subject = subjects.find(s => String(s.id) === String(id));
      return {
        id,
        mins: Math.max(0, num(mins)),
        name: subject?.name || '',
        color: subject?.color || null,
        share: Math.max(0, num(mins)) / total,
      };
    })
    .filter(c => c.mins > 0)
    .sort((a, b) => b.mins - a.mins);
}
