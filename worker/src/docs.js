/**
 * Shared synthesis documents — files in R2, metadata and accounting in D1.
 * --------------------------------------------------------------------------
 * Routes (all behind the Firebase ID token check done by the router):
 *   GET    /docs                        my documents (+ the groups each is shared with)
 *   GET    /docs/usage                  my storage usage and the limits
 *   POST   /docs                        upload (multipart: file, thumb?, name?, subjectId?, chapterIdx?)
 *   PATCH  /docs/:id                    rename / move to another subject or chapter (owner)
 *   DELETE /docs/:id                    delete file, thumbnail and shares (owner)
 *   GET    /docs/:id/file               the file (owner, or a member of a group it is shared with)
 *   GET    /docs/:id/thumb              its thumbnail (same rule)
 *   POST   /docs/:id/shares             share with a group I belong to (owner)
 *   DELETE /docs/:id/shares/:groupId    unshare (owner or whoever shared it)
 *   GET    /groups/:groupId/docs        the group's library (members only)
 *
 * ── Why the bucket can never reach 10 GB ──
 * The worker is the only thing that writes to the bucket, and every byte it
 * writes is first reserved in D1 by ONE conditional INSERT:
 *
 *   INSERT … SELECT … WHERE total_bytes + new <= DOCS_GLOBAL_CAP_MB
 *                       AND my_bytes    + new <= DOCS_USER_QUOTA_MB
 *                       AND my_files        <  DOCS_MAX_FILES_PER_USER
 *
 * A single SQL statement is atomic and D1 runs writes one at a time, so two
 * uploads racing each other cannot both squeeze past the cap. The row is
 * written BEFORE the R2 put (and removed if the put fails), so D1 can only
 * ever over-count what R2 holds, never under-count it. The global cap
 * defaults to 8 GB: 2 GB of margin under the free 10 GB.
 * Other limits: DOCS_MAX_FILE_MB per file, DOCS_MAX_UPLOADS_PER_DAY per user
 * (KV counter, protects the free R2 write-operation quota).
 *
 * ── Access ──
 * A document is private to its owner until shared with a group or published
 * in the public library (see library.js; readable by any signed-in user
 * unless hidden by moderation). Group
 * membership is checked live against Firestore (`groups/{id}.memberIds`),
 * read with the caller's own ID token, so leaving a group removes access.
 * The file type is decided from the file's bytes, never from the client.
 */

const MB = 1024 * 1024;
const MAX_THUMB_BYTES = 150 * 1024;
const MAX_NAME_LENGTH = 120;
const MAX_PSEUDO_LENGTH = 40;
const UPLOAD_COUNTER_TTL_SEC = 2 * 86_400;
const MAX_GROUP_LIST = 200;
const DOC_ID = '([A-Za-z0-9_-]{22})';
const GROUP_ID = '([A-Za-z0-9_-]{1,128})';

export const docRoutes = [
  ['GET', new RegExp('^/docs$'), listMyDocs],
  ['GET', new RegExp('^/docs/usage$'), getUsage],
  ['POST', new RegExp('^/docs$'), uploadDoc],
  ['PATCH', new RegExp(`^/docs/${DOC_ID}$`), editDoc],
  ['DELETE', new RegExp(`^/docs/${DOC_ID}$`), deleteDoc],
  ['GET', new RegExp(`^/docs/${DOC_ID}/file$`), serveFile],
  ['GET', new RegExp(`^/docs/${DOC_ID}/thumb$`), serveThumb],
  ['POST', new RegExp(`^/docs/${DOC_ID}/shares$`), shareDoc],
  ['DELETE', new RegExp(`^/docs/${DOC_ID}/shares/${GROUP_ID}$`), unshareDoc],
  ['GET', new RegExp(`^/groups/${GROUP_ID}/docs$`), listGroupDocs],
];

// ── Limits & helpers ──

function limits(env) {
  const num = (v, fallback) => (Number(v) > 0 ? Number(v) : fallback);
  return {
    globalCap: num(env.DOCS_GLOBAL_CAP_MB, 8192) * MB,
    userQuota: num(env.DOCS_USER_QUOTA_MB, 50) * MB,
    maxFile: num(env.DOCS_MAX_FILE_MB, 10) * MB,
    maxFiles: num(env.DOCS_MAX_FILES_PER_USER, 200),
    maxUploadsPerDay: num(env.DOCS_MAX_UPLOADS_PER_DAY, 40),
  };
}

export function fail(error, status, extra = {}) {
  return { body: { error, ...extra }, status };
}

export const ok = (body, status = 200) => ({ body, status });

/** Moderators: `ADMIN_UIDS` in wrangler.toml (comma-separated, same list as src/lib/admin.js). */
export const isAdmin = (env, uid) => String(env.ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean).includes(uid);
export const available = env => Boolean(env.DB && env.DOCS);
const fileKey = (owner, id) => `docs/${owner}/${id}`;
const thumbKey = (owner, id) => `thumbs/${owner}/${id}`;

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Columns that describe a document's public-library entry, for a LEFT JOIN on
 * `library_entries l`. toClient() turns them into `doc.library`.
 */
export const LIBRARY_COLUMNS = `l.published_at AS lib_published_at, l.title AS lib_title, l.subject AS lib_subject,
  l.school AS lib_school, l.level AS lib_level, l.language AS lib_language, l.description AS lib_description,
  l.author_pseudo AS lib_author, l.likes AS lib_likes, l.views AS lib_views, l.hidden AS lib_hidden`;

/** The shape sent to the browser. Never includes the owner's uid. */
export function toClient(row, uid) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    mime: row.mime,
    size: row.file_size,
    hasThumb: Boolean(row.has_thumb),
    subjectId: row.subject_id,
    chapterIdx: row.chapter_idx,
    createdAt: row.created_at,
    mine: row.owner_uid === uid,
    ...(row.shared_groups !== undefined
      ? { sharedGroups: row.shared_groups ? row.shared_groups.split(',') : [] }
      : {}),
    ...(row.shared_by_pseudo !== undefined
      ? { sharedBy: row.shared_by_pseudo, sharedByMe: row.shared_by === uid, sharedAt: row.shared_at }
      : {}),
    ...(row.lib_published_at != null
      ? {
        library: {
          title: row.lib_title, subject: row.lib_subject, school: row.lib_school, level: row.lib_level,
          language: row.lib_language, description: row.lib_description, author: row.lib_author,
          publishedAt: row.lib_published_at, likes: row.lib_likes, views: row.lib_views, hidden: Boolean(row.lib_hidden),
        },
      }
      : {}),
  };
}

async function readUsage(env, uid) {
  const L = limits(env);
  const [mine, all] = await env.DB.batch([
    env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS bytes, COUNT(*) AS files FROM documents WHERE owner_uid = ?').bind(uid),
    env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS bytes FROM documents'),
  ]);
  const used = mine.results[0].bytes;
  const globalUsed = all.results[0].bytes;
  return {
    used,
    quota: L.userQuota,
    files: mine.results[0].files,
    maxFiles: L.maxFiles,
    maxFileBytes: L.maxFile,
    // True when not even one more max-size file would fit under the global cap.
    storageFull: globalUsed + L.maxFile > L.globalCap,
  };
}

export async function findDoc(env, id) {
  return env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(id).first();
}

/** Statements removing a document from the public library (search index included). */
export function unpublishStatements(env, id) {
  return [
    env.DB.prepare('DELETE FROM library_fts WHERE doc_id = ?').bind(id),
    env.DB.prepare('DELETE FROM library_likes WHERE doc_id = ?').bind(id),
    env.DB.prepare('DELETE FROM library_saves WHERE doc_id = ?').bind(id),
    env.DB.prepare('DELETE FROM library_reports WHERE doc_id = ?').bind(id),
    env.DB.prepare('DELETE FROM library_entries WHERE doc_id = ?').bind(id),
  ];
}

// ── File type detection (from the bytes) ──

const OFFICE_MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  odt: 'application/vnd.oasis.opendocument.text',
  odp: 'application/vnd.oasis.opendocument.presentation',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
};
const TEXT_EXT = new Set(['txt', 'md']);

function startsWith(bytes, signature, offset = 0) {
  return signature.every((b, i) => bytes[offset + i] === b);
}

function detectImage(bytes) {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return { mime: 'image/png', ext: 'png' };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', ext: 'jpg' };
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

function isPlainText(bytes) {
  const sample = bytes.subarray(0, 64 * 1024);
  if (sample.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/** Returns `{ kind, mime, ext }` or null when the file type is not accepted. */
export function detectType(bytes, filename) {
  const ext = String(filename || '').toLowerCase().split('.').pop();
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { kind: 'pdf', mime: 'application/pdf', ext: 'pdf' };
  const image = detectImage(bytes);
  if (image) return { kind: 'image', ...image };
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && OFFICE_MIME[ext]) {
    return { kind: 'office', mime: OFFICE_MIME[ext], ext };
  }
  if (TEXT_EXT.has(ext) && isPlainText(bytes)) return { kind: 'text', mime: 'text/plain; charset=utf-8', ext };
  return null;
}

/** The extension matching a stored document's real type (used on rename). */
function extensionOf(row) {
  if (row.kind === 'pdf') return 'pdf';
  if (row.mime === 'image/png') return 'png';
  if (row.mime === 'image/jpeg') return 'jpg';
  if (row.mime === 'image/webp') return 'webp';
  const office = Object.keys(OFFICE_MIME).find(ext => OFFICE_MIME[ext] === row.mime);
  if (office) return office;
  return row.name.toLowerCase().endsWith('.md') ? 'md' : 'txt';
}

/** Display name: no control characters, bounded, ends with the real extension. */
export function cleanName(raw, ext) {
  // Control characters and path separators become spaces.
  const isUnsafe = c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || c === '/' || c.charCodeAt(0) === 92;
  let name = [...String(raw || '')].map(c => (isUnsafe(c) ? ' ' : c)).join('').replace(/\s+/g, ' ').trim();
  if (!name) name = 'document';
  const hasExt = name.toLowerCase().endsWith(`.${ext}`) || (ext === 'jpg' && /\.jpe?g$/i.test(name));
  const suffix = hasExt ? '' : `.${ext}`;
  return name.slice(0, MAX_NAME_LENGTH - suffix.length) + suffix;
}

function cleanSubjectId(raw) {
  const s = raw == null ? '' : String(raw).trim();
  return s && s.length <= 64 ? s : null;
}

function cleanChapterIdx(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n < 1000 ? n : null;
}

// ── Group membership (Firestore REST, as the caller) ──

async function isGroupMember(env, idToken, groupId, uid) {
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/groups/${encodeURIComponent(groupId)}?mask.fieldPaths=memberIds`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
    if (!res.ok) return false;
    const data = await res.json();
    const ids = data.fields?.memberIds?.arrayValue?.values || [];
    return ids.some(v => v.stringValue === uid);
  } catch {
    return false;
  }
}

/** Owner, or member of at least one group the document is shared with. */
async function canRead(env, idToken, row, uid) {
  if (row.owner_uid === uid) return true;
  // Published in the public library: readable unless hidden by moderation
  // (admins can still open hidden ones to review them).
  const pub = await env.DB.prepare('SELECT hidden FROM library_entries WHERE doc_id = ?').bind(row.id).first();
  if (pub && (!pub.hidden || isAdmin(env, uid))) return true;
  const { results } = await env.DB.prepare('SELECT group_id FROM group_shares WHERE doc_id = ?').bind(row.id).all();
  for (const { group_id } of results) {
    if (await isGroupMember(env, idToken, group_id, uid)) return true;
  }
  return false;
}

// ── Handlers ──

async function listMyDocs({ env, uid }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const { results } = await env.DB.prepare(
    `SELECT d.*, (SELECT group_concat(group_id) FROM group_shares s WHERE s.doc_id = d.id) AS shared_groups,
            ${LIBRARY_COLUMNS}
       FROM documents d LEFT JOIN library_entries l ON l.doc_id = d.id
      WHERE d.owner_uid = ? ORDER BY d.created_at DESC`
  ).bind(uid).all();
  return ok({ docs: results.map(r => toClient(r, uid)), usage: await readUsage(env, uid) });
}

async function getUsage({ env, uid }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  return ok({ usage: await readUsage(env, uid) });
}

async function uploadDoc({ request, env, uid }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const L = limits(env);

  // Reject oversized bodies before reading them.
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > L.maxFile + MAX_THUMB_BYTES + 64 * 1024) {
    return fail('file_too_large', 413, { maxFileBytes: L.maxFile });
  }

  const dayKey = `docs:uploads:${uid}:${new Date().toISOString().slice(0, 10)}`;
  const uploadsToday = env.KV ? Number(await env.KV.get(dayKey)) || 0 : 0;
  if (uploadsToday >= L.maxUploadsPerDay) return fail('daily_limit', 429, { limit: L.maxUploadsPerDay });

  let form;
  try {
    form = await request.formData();
  } catch {
    return fail('bad_request', 400);
  }
  const file = form.get('file');
  if (!file || typeof file === 'string' || !file.size) return fail('bad_request', 400);
  if (file.size > L.maxFile) return fail('file_too_large', 413, { maxFileBytes: L.maxFile });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectType(bytes, file.name);
  if (!type) return fail('unsupported_type', 415);

  // Optional thumbnail made by the browser: only small, genuine images.
  let thumb = null;
  const thumbFile = form.get('thumb');
  if (thumbFile && typeof thumbFile !== 'string' && thumbFile.size <= MAX_THUMB_BYTES) {
    const thumbBytes = new Uint8Array(await thumbFile.arrayBuffer());
    const thumbType = detectImage(thumbBytes);
    if (thumbType) thumb = { bytes: thumbBytes, mime: thumbType.mime };
  }

  const id = randomId();
  const size = bytes.length + (thumb?.bytes.length || 0);
  const row = {
    id,
    owner_uid: uid,
    name: cleanName(form.get('name') || file.name, type.ext),
    kind: type.kind,
    mime: type.mime,
    file_size: bytes.length,
    size,
    has_thumb: thumb ? 1 : 0,
    subject_id: cleanSubjectId(form.get('subjectId')),
    chapter_idx: cleanChapterIdx(form.get('chapterIdx')),
    created_at: Date.now(),
  };

  // Atomic reservation: see the file header.
  const reserved = await env.DB.prepare(
    `INSERT INTO documents (id, owner_uid, name, kind, mime, file_size, size, has_thumb, subject_id, chapter_idx, created_at)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11
      WHERE (SELECT COALESCE(SUM(size), 0) FROM documents) + ?7 <= ?12
        AND (SELECT COALESCE(SUM(size), 0) FROM documents WHERE owner_uid = ?2) + ?7 <= ?13
        AND (SELECT COUNT(*) FROM documents WHERE owner_uid = ?2) < ?14`
  ).bind(
    row.id, row.owner_uid, row.name, row.kind, row.mime, row.file_size, row.size, row.has_thumb,
    row.subject_id, row.chapter_idx, row.created_at, L.globalCap, L.userQuota, L.maxFiles
  ).run();

  if (!reserved.meta.changes) {
    const usage = await readUsage(env, uid);
    const reason = usage.files >= usage.maxFiles ? 'too_many_files'
      : usage.used + size > usage.quota ? 'quota_exceeded'
      : 'storage_full';
    return fail(reason, 507, { usage });
  }

  try {
    await env.DOCS.put(fileKey(uid, id), bytes, { httpMetadata: { contentType: type.mime } });
    if (thumb) await env.DOCS.put(thumbKey(uid, id), thumb.bytes, { httpMetadata: { contentType: thumb.mime } });
  } catch {
    await env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(id).run();
    await env.DOCS.delete([fileKey(uid, id), thumbKey(uid, id)]).catch(() => {});
    return fail('storage_failed', 502);
  }

  if (env.KV) {
    await env.KV.put(dayKey, String(uploadsToday + 1), { expirationTtl: UPLOAD_COUNTER_TTL_SEC }).catch(() => {});
  }
  return ok({ doc: toClient({ ...row, shared_groups: '' }, uid), usage: await readUsage(env, uid) }, 201);
}

async function editDoc({ request, env, uid, params: [id] }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const row = await findDoc(env, id);
  if (!row || row.owner_uid !== uid) return fail('not_found', 404);

  let data;
  try {
    data = await request.json();
  } catch {
    return fail('bad_request', 400);
  }

  const next = { ...row };
  if (typeof data.name === 'string') next.name = cleanName(data.name, extensionOf(row));
  if ('subjectId' in data) next.subject_id = cleanSubjectId(data.subjectId);
  if ('chapterIdx' in data) next.chapter_idx = cleanChapterIdx(data.chapterIdx);

  await env.DB.prepare('UPDATE documents SET name = ?, subject_id = ?, chapter_idx = ? WHERE id = ? AND owner_uid = ?')
    .bind(next.name, next.subject_id, next.chapter_idx, id, uid).run();
  return ok({ doc: toClient(next, uid) });
}

async function deleteDoc({ env, uid, params: [id] }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const row = await findDoc(env, id);
  if (!row || row.owner_uid !== uid) return fail('not_found', 404);

  // Object first: if it fails, the row stays and still counts toward quotas.
  await env.DOCS.delete([fileKey(uid, id), thumbKey(uid, id)]);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM group_shares WHERE doc_id = ?').bind(id),
    ...unpublishStatements(env, id),
    env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(id),
  ]);
  return ok({ deleted: id, usage: await readUsage(env, uid) });
}

async function serveObject({ env, uid, idToken, params: [id] }, which) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const row = await findDoc(env, id);
  if (!row || !(await canRead(env, idToken, row, uid))) return fail('not_found', 404);
  if (which === 'thumb' && !row.has_thumb) return fail('not_found', 404);

  const object = await env.DOCS.get(which === 'thumb' ? thumbKey(row.owner_uid, id) : fileKey(row.owner_uid, id));
  if (!object) return fail('not_found', 404);

  // Library view counter: someone else opened the file (browsers cache it,
  // so this is roughly one view per reader and session).
  if (which === 'file' && row.owner_uid !== uid) {
    await env.DB.prepare('UPDATE library_entries SET views = views + 1 WHERE doc_id = ?').bind(id).run().catch(() => {});
  }

  const inline = row.kind === 'pdf' || row.kind === 'image' || row.kind === 'text' || which === 'thumb';
  return new Response(object.body, {
    headers: {
      'Content-Type': which === 'thumb' ? object.httpMetadata?.contentType || 'image/webp' : row.mime,
      'Content-Length': String(object.size),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      // Files never change under a given id; the browser may keep them privately.
      'Cache-Control': 'private, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

// Function declarations (hoisted): the route table above references them.
function serveFile(ctx) { return serveObject(ctx, 'file'); }
function serveThumb(ctx) { return serveObject(ctx, 'thumb'); }

async function shareDoc({ request, env, uid, idToken, params: [id] }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const row = await findDoc(env, id);
  if (!row || row.owner_uid !== uid) return fail('not_found', 404);

  let data;
  try {
    data = await request.json();
  } catch {
    return fail('bad_request', 400);
  }
  const groupId = String(data.groupId || '');
  if (!new RegExp(`^${GROUP_ID}$`).test(groupId)) return fail('bad_request', 400);
  if (!(await isGroupMember(env, idToken, groupId, uid))) return fail('not_a_member', 403);

  const pseudo = String(data.pseudo || '').trim().slice(0, MAX_PSEUDO_LENGTH) || '?';
  await env.DB.prepare(
    'INSERT OR IGNORE INTO group_shares (group_id, doc_id, shared_by, shared_by_pseudo, shared_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(groupId, id, uid, pseudo, Date.now()).run();
  return ok({ shared: { groupId, docId: id } }, 201);
}

async function unshareDoc({ env, uid, params: [id, groupId] }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const row = await findDoc(env, id);
  if (!row) return fail('not_found', 404);
  const result = await env.DB.prepare(
    'DELETE FROM group_shares WHERE doc_id = ? AND group_id = ? AND (shared_by = ? OR ? = ?)'
  ).bind(id, groupId, uid, row.owner_uid, uid).run();
  if (!result.meta.changes) return fail('not_found', 404);
  return ok({ unshared: { groupId, docId: id } });
}

async function listGroupDocs({ env, uid, idToken, params: [groupId] }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  if (!(await isGroupMember(env, idToken, groupId, uid))) return fail('not_a_member', 403);
  const { results } = await env.DB.prepare(
    `SELECT d.*, s.shared_by, s.shared_by_pseudo, s.shared_at
       FROM group_shares s JOIN documents d ON d.id = s.doc_id
      WHERE s.group_id = ? ORDER BY s.shared_at DESC LIMIT ${MAX_GROUP_LIST}`
  ).bind(groupId).all();
  return ok({ docs: results.map(r => toClient(r, uid)) });
}
