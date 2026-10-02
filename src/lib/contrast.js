/**
 * Readable ink on an arbitrary background colour.
 * --------------------------------------------------------------------------
 * Subject colours are picked by the student, so anything painted on top of one
 * cannot assume white text. A pale subject (yellow, mint, cream) left white
 * labels unreadable on their own block, and a hardcoded '#fff' cannot know
 * that. This decides per colour instead.
 *
 * Theme surfaces are NOT this module's job: text on a card or a page belongs in
 * the `--text-*` tokens, which already follow the active theme. Use this only
 * where the background is a colour the theme does not control.
 */

/** Dark ink used on pale backgrounds — warm, to match the app's palette. */
const DARK_INK = '#17130e';
const LIGHT_INK = '#ffffff';

/** `#abc`, `#aabbcc`, `rgb(...)` or `rgba(...)` → [r, g, b], or null. */
function parseColor(color) {
  if (typeof color !== 'string') return null;
  const c = color.trim();

  if (c.startsWith('#')) {
    const hex = c.slice(1);
    if (hex.length === 3) {
      return [0, 1, 2].map(i => parseInt(hex[i] + hex[i], 16));
    }
    if (hex.length === 6 || hex.length === 8) {
      return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
    }
    return null;
  }

  const nums = c.match(/[\d.]+/g);
  if (c.startsWith('rgb') && nums && nums.length >= 3) {
    return nums.slice(0, 3).map(Number);
  }
  return null;
}

/**
 * Relative luminance (0 = black, 1 = white), per WCAG 2.1.
 * @returns {number|null} null when the colour cannot be parsed.
 */
export function relativeLuminance(color) {
  const rgb = parseColor(color);
  if (!rgb || rgb.some(Number.isNaN)) return null;
  const [r, g, b] = rgb.map(v => {
    const channel = v / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Ink that stays legible on `background`.
 *
 * @param {string} background  any CSS hex / rgb() colour
 * @param {object} [inks]      override the two inks
 * @returns {string} a colour to use as `color`
 */
export function inkOn(background, { light = LIGHT_INK, dark = DARK_INK } = {}) {
  const lum = relativeLuminance(background);
  // Unparseable (a CSS variable, a gradient): keep the light ink, which is what
  // the app used before this helper existed.
  if (lum == null) return light;
  // 0.45 rather than 0.5: white text gives up sooner than dark text does.
  return lum > 0.45 ? dark : light;
}
