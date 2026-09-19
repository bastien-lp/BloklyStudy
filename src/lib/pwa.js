/**
 * Installable app (PWA) — service worker registration and install prompt.
 * --------------------------------------------------------------------------
 * Imported once at start-up (main.jsx) so the browser's `beforeinstallprompt`
 * event, which fires early, is never missed. The event is kept and replayed
 * when the student taps "Install" (Chrome, Edge, Android). Safari on iPhone
 * has no such event: the app explains "Share → Add to Home Screen" instead.
 *
 * The service worker (public/sw.js) is registered in production builds only,
 * under the site's base path, so local development is never served stale
 * cached files.
 */

let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach(cb => cb());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();          // show our own, calmer suggestion instead
    deferredPrompt = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const base = import.meta.env.BASE_URL;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {});
  });
}

/** True when the browser offered to install the app and we can show the prompt. */
export const canPromptInstall = () => Boolean(deferredPrompt);

/** Shows the browser's install dialog. Resolves to true if the student accepted. */
export async function promptInstall() {
  if (!deferredPrompt) return false;
  const prompt = deferredPrompt;
  deferredPrompt = null;
  prompt.prompt();
  const { outcome } = await prompt.userChoice;
  notify();
  return outcome === 'accepted';
}

/** Already running as an installed app? */
export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

/** iPhone / iPad (including iPadOS reporting itself as a Mac). */
export function isIos() {
  const ua = navigator.userAgent || '';
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Subscribe to "install became (un)available". Returns the unsubscribe function. */
export function onInstallAvailabilityChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
