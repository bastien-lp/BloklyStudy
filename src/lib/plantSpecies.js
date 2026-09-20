/**
 * What grows in the garden.
 * --------------------------------------------------------------------------
 * The species are cosmetic: whatever is planted, the rules of the grove are
 * the same (see lib/bambooGarden.js) — one plant ripens after
 * MINUTES_PER_BAMBOO minutes and pays the same coins. Only the drawing and
 * the name change.
 *
 * A species is a PREFERENCE, chosen in the personalisation panel next to the
 * themes and the fonts, and unlocked by level exactly like those (the levels
 * live with them, in themes.js). It is not bought with coins: the garden pays
 * for the house, the levels pay for the look.
 *
 * `swatch` is the colour of the dot in the picker; it only describes the
 * species and never drives the drawing (components/GardenScene.jsx owns that).
 */

/** Ordered as the picker shows them: the one everyone starts with first. */
export const PLANT_SPECIES = [
  { id: 'bamboo', swatch: '#4F7A38' },
  { id: 'sakura', swatch: '#E68CA8' },
  { id: 'maple', swatch: '#C4553A' },
  { id: 'sunflower', swatch: '#E8B33C' },
  { id: 'pine', swatch: '#2F5223' },
];

/** The species everyone starts with, and the fallback for any unknown value. */
export const DEFAULT_SPECIES = 'bamboo';

export const speciesById = id => PLANT_SPECIES.find(s => s.id === id) || PLANT_SPECIES[0];

/** A species id that is safe to draw, whatever came out of the preferences. */
export function cleanSpecies(id) {
  return PLANT_SPECIES.some(s => s.id === id) ? id : DEFAULT_SPECIES;
}
