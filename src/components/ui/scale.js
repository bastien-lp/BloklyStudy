/**
 * The app's spacing and radius ramps.
 *
 * Kept apart from the components so the primitives file only exports
 * components (React Fast Refresh requires that split).
 */

/** One spacing ramp for the whole app, so vertical rhythm stops being reinvented. */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/**
 * The width of a page's content column. One value for every page, so Stats,
 * To-do and Journal stop each having their own idea of how wide the app is.
 * An inner column that is deliberately narrower (a chat thread, a room card)
 * sets its own width on top of it.
 */
export const PAGE_MAX_W = 960;

/** One radius ramp. `pill` is for anything fully rounded. */
export const RADIUS = { sm: 10, md: 14, lg: 18, xl: 22, pill: 999 };
