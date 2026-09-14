/**
 * URLs for files served from `public/`.
 * --------------------------------------------------------------------------
 * The app is published on a GitHub Pages PROJECT site, under a sub-path:
 *   https://bastien-lp.github.io/BloklyStudy/
 *
 * Vite rewrites asset URLs it can see (imports, index.html), but not plain
 * strings in JavaScript. A literal '/soso/pouce.png' would be requested from
 * the domain root — https://bastien-lp.github.io/soso/pouce.png — and 404.
 * Every public file referenced from code must go through `asset()`, which
 * prefixes the base configured in vite.config.js (`import.meta.env.BASE_URL`).
 *
 *   asset('soso/pouce.png')  →  '/BloklyStudy/soso/pouce.png'
 */

/** Resolve a path inside `public/` against the deployment base. */
export function asset(path) {
  return `${import.meta.env.BASE_URL}${String(path).replace(/^\/+/, '')}`;
}
