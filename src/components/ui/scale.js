/**
 * The app's spacing and radius ramps.
 *
 * Kept apart from the components so the primitives file only exports
 * components (React Fast Refresh requires that split).
 */

/** One spacing ramp for the whole app, so vertical rhythm stops being reinvented. */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/** One radius ramp. `pill` is for anything fully rounded. */
export const RADIUS = { sm: 10, md: 14, lg: 18, xl: 22, pill: 999 };
