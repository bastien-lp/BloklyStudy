/**
 * What grows in the garden.
 * --------------------------------------------------------------------------
 * The species are cosmetic: whatever is planted, the rules of the grove are
 * the same (see lib/bambooGarden.js) — one plant ripens after
 * MINUTES_PER_BAMBOO minutes and pays the same coins. Only the drawing and
 * the name change, which is exactly why a species can be sold without
 * touching the balance of the game.
 *
 * `swatch` is the colour of the dot shown in the picker, `accent` the tone the
 * card uses; both only describe the species, they never drive the drawing
 * (components/GardenScene.jsx owns that).
 */

/** Ordered as the picker shows them: the free one first. */
export const PLANT_SPECIES = [
  { id: 'bamboo', price: 0, swatch: '#4F7A38', accent: '#7FA85C' },
  { id: 'sakura', price: 200, swatch: '#E68CA8', accent: '#F6C6D5' },
  { id: 'maple', price: 300, swatch: '#C4553A', accent: '#E0A03C' },
  { id: 'sunflower', price: 400, swatch: '#E8B33C', accent: '#F4D06A' },
  { id: 'pine', price: 600, swatch: '#2F5223', accent: '#5C8449' },
];

/** The species everyone starts with, and the one any unknown value falls back to. */
export const DEFAULT_SPECIES = 'bamboo';

export const speciesById = id => PLANT_SPECIES.find(s => s.id === id) || PLANT_SPECIES[0];

/** A species id that is safe to draw, whatever came out of the document. */
export function cleanSpecies(id) {
  return PLANT_SPECIES.some(s => s.id === id) ? id : DEFAULT_SPECIES;
}

/** The list of owned species, always including the free one, never duplicated. */
export function cleanOwned(list) {
  const owned = Array.isArray(list) ? list.filter(id => PLANT_SPECIES.some(s => s.id === id)) : [];
  return [...new Set([DEFAULT_SPECIES, ...owned])];
}

/** What a species costs, or 0 when it is already owned (and for the free one). */
export function speciesPrice(id, owned = []) {
  if (cleanOwned(owned).includes(id)) return 0;
  return speciesById(id).price;
}
