/**
 * Blokly service worker — makes the app installable and usable offline.
 * --------------------------------------------------------------------------
 * What it caches:
 *   - the app shell (index.html), refreshed on every online visit;
 *   - the app's built files (/assets/*): they are content-hashed, so a cached
 *     copy is always valid. On install, and whenever a new version of the
 *     site is detected, the worker walks index.html and the JS chunks it
 *     references to cache the whole app (not only the pages already opened),
 *     then removes the files of older versions;
 *   - the app's public images and the Google Fonts used by the themes.
 * What it never caches: Firebase traffic and the Cloudflare worker API (user
 * data and documents). Offline data comes from Firestore's own offline cache.
 *
 * Strategies: pages → network first (3 s), cached shell as fallback;
 * built assets → cache first; images and fonts → cached copy, refreshed in
 * the background. Only GET requests are touched.
 *
 * Scope: the folder this file is served from (/BloklyStudy/ on GitHub Pages).
 */

const SHELL_CACHE = 'blokly-shell-v1';
const ASSET_CACHE = 'blokly-assets-v1';
const MEDIA_CACHE = 'blokly-media-v1';
const KNOWN_CACHES = [SHELL_CACHE, ASSET_CACHE, MEDIA_CACHE];

const BASE = new URL(self.registration.scope).pathname;   // e.g. "/BloklyStudy/"
const SHELL_URL = BASE;                                     // index.html
const NAV_TIMEOUT_MS = 3000;
const MAX_CRAWL = 400;
// PDF.js (≈1.6 MB) is only useful with documents, which need the network anyway.
const SKIP_PRECACHE = /\/assets\/pdf(\.worker\.min)?-/;
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(precacheApp().catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('blokly-') && !KNOWN_CACHES.includes(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

/** Every built file reachable from index.html (walking JS chunks for lazy imports). */
async function crawl(html) {
  const found = new Set();
  const queue = [];
  const collect = text => {
    for (const m of text.matchAll(/assets\/[A-Za-z0-9._-]+\.(?:js|mjs|css|woff2?|png|svg|jpg|webp)/g)) {
      const url = new URL(BASE + m[0], self.location.origin).href;
      if (!found.has(url) && found.size < MAX_CRAWL) { found.add(url); if (/\.m?js$/.test(url)) queue.push(url); }
    }
  };
  collect(html);
  while (queue.length) {
    const url = queue.shift();
    if (SKIP_PRECACHE.test(url)) continue;
    try {
      const cached = await caches.match(url);
      const res = cached || await fetch(url);
      if (res.ok) collect(await res.clone().text());
    } catch { /* offline or gone: skip */ }
  }
  return [...found].filter(u => !SKIP_PRECACHE.test(u));
}

/** Caches the current version of the app and drops files of older versions. */
async function precacheApp(freshShell) {
  const res = freshShell || await fetch(SHELL_URL, { cache: 'no-store' });
  if (!res.ok) return;
  const html = await res.clone().text();
  await (await caches.open(SHELL_CACHE)).put(SHELL_URL, res);

  const urls = await crawl(html);
  const cache = await caches.open(ASSET_CACHE);
  await Promise.all(urls.map(async u => {
    if (await cache.match(u)) return;
    try { await cache.add(u); } catch { /* retried at next visit */ }
  }));
  const keep = new Set(urls);
  for (const req of await cache.keys()) {
    if (!keep.has(req.url) && !SKIP_PRECACHE.test(req.url)) await cache.delete(req);
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: cached copy, refreshed in the background.
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req, MEDIA_CACHE));
    return;
  }
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;

  // Pages: network first, cached shell when offline (single-page app).
  if (req.mode === 'navigate') {
    event.respondWith(networkFirstShell(event));
    return;
  }
  // Content-hashed build files: cache first.
  if (url.pathname.startsWith(BASE + 'assets/')) {
    event.respondWith(cacheFirst(req, ASSET_CACHE));
    return;
  }
  // Public images, icons, manifest: cached copy, refreshed in the background.
  if (/\.(png|svg|jpg|jpeg|webp|gif|ico|webmanifest)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, MEDIA_CACHE));
  }
});

// ── Push notifications (see worker/src/notifications.js) ──
// Payload: { title, body, tab, tag } — already translated by the app / worker.

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Blokly', body: event.data?.text() || '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Blokly', {
    body: data.body || '',
    icon: BASE + 'icons/icon-192.png',
    badge: BASE + 'icons/icon-192.png',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    data: { tab: data.tab || '' },
  }));
});

// Tap: focus an open Blokly window on the right tab, or open one.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const tab = event.notification.data?.tab || '';
  const target = new URL(BASE + (tab ? `?tab=${encodeURIComponent(tab)}` : ''), self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find(w => new URL(w.url).pathname.startsWith(BASE));
    if (open) {
      if (tab) open.postMessage({ type: 'blokly:open-tab', tab });
      return open.focus();
    }
    return self.clients.openWindow(target);
  })());
});

async function networkFirstShell(event) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await Promise.race([
      fetch(event.request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NAV_TIMEOUT_MS)),
    ]);
    if (res.ok) {
      const previous = await cache.match(SHELL_URL);
      const [fresh, prevText] = await Promise.all([res.clone().text(), previous ? previous.text() : '']);
      if (fresh !== prevText) {
        // A new version of the site: cache it fully in the background.
        event.waitUntil(precacheApp(res.clone()).catch(() => {}));
      }
    }
    return res;
  } catch {
    return (await cache.match(SHELL_URL)) || Response.error();
  }
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone()).catch(() => {});
  return res;
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const refresh = fetch(req)
    .then(res => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()).catch(() => {}); return res; })
    .catch(() => hit);
  return hit || refresh;
}
