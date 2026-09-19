/**
 * Shared synthesis documents — client for the worker's /docs routes.
 * --------------------------------------------------------------------------
 * Files live in Cloudflare R2 and their metadata in D1, both behind the
 * worker (`VITE_CALENDAR_WORKER_URL`, see worker/src/docs.js). Nothing about
 * documents is stored in Firestore except the chat message announcing a share.
 *
 * Every request carries the user's Firebase ID token, so files are fetched
 * with `fetch` and shown through object URLs (a plain <img src> or <iframe
 * src> could not send the token). Object URLs are cached per session.
 *
 * Errors are thrown as `Error` with a `code` (the worker's error code, or
 * 'network') so the UI can map them to i18n keys.
 */

import { resizeImage } from './imageResize';

const WORKER_URL = (import.meta.env.VITE_CALENDAR_WORKER_URL || '').replace(/\/+$/, '');

export const isDocsAvailable = () => Boolean(WORKER_URL);

/** `accept` attribute for file inputs — mirrors the worker's accepted types. */
export const DOC_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.docx,.pptx,.xlsx,.odt,.odp,.ods,.txt,.md,application/pdf,image/png,image/jpeg,image/webp';

/** Photos above this are downscaled before upload (saves quota and R2 space). */
const IMAGE_MAX_SIDE = 2400;
const IMAGE_RECOMPRESS_ABOVE = 1.5 * 1024 * 1024;
const THUMB_SIDE = 360;

function docError(code, extra = {}) {
  return Object.assign(new Error(code), { code, ...extra });
}

async function api(user, method, path, body) {
  let res;
  try {
    const idToken = await user.getIdToken();
    res = await fetch(`${WORKER_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${idToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw docError('network');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw docError(data.error || 'failed', { status: res.status, usage: data.usage });
  return data;
}

export const listMyDocs = user => api(user, 'GET', '/docs');
export const getDocsUsage = user => api(user, 'GET', '/docs/usage');
export const updateDocMeta = (user, id, changes) => api(user, 'PATCH', `/docs/${id}`, changes);
export const deleteDocument = (user, id) => api(user, 'DELETE', `/docs/${id}`);
export const listGroupDocs = (user, groupId) => api(user, 'GET', `/groups/${encodeURIComponent(groupId)}/docs`);
export const shareDocToGroup = (user, id, groupId, pseudo) =>
  api(user, 'POST', `/docs/${id}/shares`, { groupId, pseudo });
export const unshareDocFromGroup = (user, id, groupId) =>
  api(user, 'DELETE', `/docs/${id}/shares/${encodeURIComponent(groupId)}`);

// ── Public library (see worker/src/library.js) ──

/** Publishes (or updates) a document in the public library. Resolves to `{ doc }`. */
export const publishToLibrary = (user, id, meta) => api(user, 'PUT', `/docs/${id}/library`, meta);
export const unpublishFromLibrary = (user, id) => api(user, 'DELETE', `/docs/${id}/library`);

/**
 * Searches the library. `params` = { q, school, subject, level, language,
 * sort: 'recent'|'popular', saved, moderation, offset }. Empty values are dropped.
 * Resolves to `{ docs, hasMore, nextOffset }`.
 */
export function searchLibrary(user, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) qs.set(k, v === true ? '1' : String(v));
  }
  return api(user, 'GET', `/library?${qs}`);
}

/** Top schools / subjects with counts; each list narrowed by the other filter. */
export function getLibraryFacets(user, { school, subject } = {}) {
  const qs = new URLSearchParams();
  if (school) qs.set('school', school);
  if (subject) qs.set('subject', subject);
  return api(user, 'GET', `/library/facets?${qs}`);
}

export const likeLibraryDoc = (user, id, liked) => api(user, 'POST', `/library/${id}/like`, { liked });
export const saveLibraryDoc = (user, id, saved) => api(user, 'POST', `/library/${id}/save`, { saved });
export const reportLibraryDoc = (user, id, reason) => api(user, 'POST', `/library/${id}/report`, { reason });
export const moderateLibraryDoc = (user, id, action) => api(user, 'POST', `/library/${id}/moderate`, { action });

const isRasterImage = file => /^image\/(jpeg|png|webp)$/.test(file.type);

/**
 * Downscales big photos and builds a small thumbnail for images.
 * Resolves to `{ file, thumb }` (thumb may be null). Never throws: if the
 * browser cannot decode the image, the original is sent as is.
 */
async function prepareUpload(file) {
  if (!isRasterImage(file)) return { file, thumb: null };
  try {
    let upload = file;
    if (file.size > IMAGE_RECOMPRESS_ABOVE) {
      const blob = await resizeImage(file, { maxSize: IMAGE_MAX_SIDE, quality: 0.85 });
      if (blob.size < file.size) {
        upload = new File([blob], file.name.replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg', { type: 'image/jpeg' });
      }
    }
    const thumb = await resizeImage(file, { maxSize: THUMB_SIDE, quality: 0.75 });
    return { file: upload, thumb };
  } catch {
    return { file, thumb: null };
  }
}

/**
 * Uploads one file. `dest` = { subjectId?, chapterIdx? }.
 * `onProgress(fraction)` is called while bytes go out (XHR — fetch has no
 * upload progress). Resolves to `{ doc, usage }`.
 */
export async function uploadDocument(user, file, dest = {}, onProgress = () => {}) {
  const prepared = await prepareUpload(file);
  const form = new FormData();
  form.append('file', prepared.file, prepared.file.name);
  if (prepared.thumb) form.append('thumb', prepared.thumb, 'thumb.jpg');
  form.append('name', prepared.file.name);
  if (dest.subjectId != null) form.append('subjectId', String(dest.subjectId));
  if (dest.chapterIdx != null) form.append('chapterIdx', String(dest.chapterIdx));

  const idToken = await user.getIdToken();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${WORKER_URL}/docs`);
    xhr.setRequestHeader('Authorization', `Bearer ${idToken}`);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onerror = () => reject(docError('network'));
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* keep {} */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(docError(data.error || 'failed', { status: xhr.status, usage: data.usage }));
    };
    xhr.send(form);
  });
}

// ── Reading files (object URLs, cached) ──

const MAX_CACHED_URLS = 40;
const urlCache = new Map(); // `${id}:${which}` → Promise<objectURL>

/**
 * Object URL for a document's file (`which = 'file'`) or thumbnail ('thumb').
 * Cached for the session; the oldest entries are released past MAX_CACHED_URLS.
 */
export function getDocObjectUrl(user, id, which = 'file') {
  const key = `${id}:${which}`;
  if (urlCache.has(key)) return urlCache.get(key);

  const promise = (async () => {
    let res;
    try {
      const idToken = await user.getIdToken();
      res = await fetch(`${WORKER_URL}/docs/${id}/${which}`, { headers: { Authorization: `Bearer ${idToken}` } });
    } catch {
      throw docError('network');
    }
    if (!res.ok) throw docError(res.status === 404 ? 'not_found' : 'failed', { status: res.status });
    return URL.createObjectURL(await res.blob());
  })();

  urlCache.set(key, promise);
  promise.catch(() => urlCache.delete(key)); // let a later attempt retry
  if (urlCache.size > MAX_CACHED_URLS) {
    const [oldestKey, oldest] = urlCache.entries().next().value;
    urlCache.delete(oldestKey);
    oldest.then(url => URL.revokeObjectURL(url)).catch(() => {});
  }
  return promise;
}

/** Forgets a document's cached URLs (after deletion). */
export function forgetDocUrls(id) {
  for (const which of ['file', 'thumb']) {
    const key = `${id}:${which}`;
    urlCache.get(key)?.then(url => URL.revokeObjectURL(url)).catch(() => {});
    urlCache.delete(key);
  }
}

/** Human-readable size with the app's number formatting ("1,2 Mo" / "1.2 MB"). */
export function formatBytes(bytes, formatNumber, units) {
  const [b, kb, mb] = units; // localized unit labels
  if (bytes < 1024) return `${formatNumber(bytes)} ${b}`;
  if (bytes < 1024 * 1024) return `${formatNumber(Math.round(bytes / 1024))} ${kb}`;
  return `${formatNumber(bytes / (1024 * 1024), { maximumFractionDigits: 1 })} ${mb}`;
}
