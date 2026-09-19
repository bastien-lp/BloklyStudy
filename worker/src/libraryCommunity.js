/**
 * Library community — comments, star ratings, followed schools.
 * --------------------------------------------------------------------------
 * Routes (behind the Firebase ID token check done by the router):
 *   GET    /library/:id/comments                  visible comments (+ `mine`, `canDelete`)
 *   POST   /library/:id/comments                  { body, pseudo }
 *   DELETE /library/:id/comments/:cid             author, document owner or admin
 *   POST   /library/:id/comments/:cid/report      one per user; hidden at LIBRARY_HIDE_AFTER_REPORTS
 *   PUT    /library/:id/rating                    { stars: 1..5 } (0 removes it; not on one's own document)
 *   GET    /library/follows                       schools I follow
 *   PUT    /library/follows                       { school, follow: boolean }
 *
 * Counters on library_entries (comment_count, rating_sum, rating_count) are
 * recomputed from the rows in the same batch as every change, so they can
 * never drift. Comments are plain text (the app never renders them as HTML).
 * Limits: COMMENT_MAX_LENGTH characters, COMMENTS_PER_DAY per user (KV), and
 * MAX_FOLLOWS schools per user.
 */

import { fail, ok, available, isAdmin } from './docs.js';
import { normalizeKey } from './library.js';

const DOC_ID = '([A-Za-z0-9_-]{22})';
const COMMENT_ID = '([A-Za-z0-9_-]{16})';
const COMMENT_MIN_LENGTH = 2;
const COMMENT_MAX_LENGTH = 600;
const COMMENTS_PER_DAY = 30;
const COMMENT_PAGE = 100;
const MAX_FOLLOWS = 30;
const COUNTER_TTL_SEC = 2 * 86_400;

export const communityRoutes = [
  ['GET', new RegExp('^/library/follows$'), listFollows],
  ['PUT', new RegExp('^/library/follows$'), setFollow],
  ['GET', new RegExp(`^/library/${DOC_ID}/comments$`), listComments],
  ['POST', new RegExp(`^/library/${DOC_ID}/comments$`), addComment],
  ['DELETE', new RegExp(`^/library/${DOC_ID}/comments/${COMMENT_ID}$`), deleteComment],
  ['POST', new RegExp(`^/library/${DOC_ID}/comments/${COMMENT_ID}/report$`), reportComment],
  ['PUT', new RegExp(`^/library/${DOC_ID}/rating$`), rate],
];

const hideThreshold = env => (Number(env.LIBRARY_HIDE_AFTER_REPORTS) > 0 ? Number(env.LIBRARY_HIDE_AFTER_REPORTS) : 3);

function shortId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

/** Plain text: control characters removed (line breaks kept), bounded. */
function cleanBody(value) {
  return [...String(value || '')]
    .map(c => { const n = c.charCodeAt(0); return n === 10 || n >= 32 ? c : ' '; })
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, COMMENT_MAX_LENGTH);
}

/** A visible (not hidden) library entry, or null. */
async function visibleEntry(env, id) {
  return env.DB.prepare('SELECT doc_id, owner_uid FROM library_entries WHERE doc_id = ? AND hidden = 0').bind(id).first();
}

const recountComments = (env, id) => env.DB.prepare(
  'UPDATE library_entries SET comment_count = (SELECT COUNT(*) FROM library_comments WHERE doc_id = ?1 AND hidden = 0) WHERE doc_id = ?1'
).bind(id);

// ── Comments ──

async function listComments({ env, uid, params: [id] }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const entry = await visibleEntry(env, id);
  if (!entry) return fail('not_found', 404);
  const admin = isAdmin(env, uid);
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.uid, c.pseudo, c.body, c.created_at,
            EXISTS (SELECT 1 FROM library_comment_reports r WHERE r.comment_id = c.id AND r.uid = ?) AS reported
       FROM library_comments c WHERE c.doc_id = ? AND c.hidden = 0
      ORDER BY c.created_at ASC LIMIT ${COMMENT_PAGE}`
  ).bind(uid, id).all();
  return ok({
    comments: results.map(c => ({
      id: c.id, pseudo: c.pseudo, body: c.body, createdAt: c.created_at,
      mine: c.uid === uid,
      canDelete: c.uid === uid || entry.owner_uid === uid || admin,
      reported: Boolean(c.reported),
    })),
  });
}

async function addComment({ request, env, uid, params: [id] }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const entry = await visibleEntry(env, id);
  if (!entry) return fail('not_found', 404);

  const data = await readJson(request);
  const body = cleanBody(data?.body);
  if (body.length < COMMENT_MIN_LENGTH) return fail('comment_too_short', 400);
  const pseudo = [...String(data?.pseudo || '')].filter(c => c.charCodeAt(0) >= 32).join('').trim().slice(0, 40) || '?';

  const dayKey = `library:comments:${uid}:${new Date().toISOString().slice(0, 10)}`;
  const today = env.KV ? Number(await env.KV.get(dayKey)) || 0 : 0;
  if (today >= COMMENTS_PER_DAY) return fail('daily_limit', 429);

  const comment = { id: shortId(), pseudo, body, createdAt: Date.now() };
  await env.DB.batch([
    env.DB.prepare('INSERT INTO library_comments (id, doc_id, uid, pseudo, body, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(comment.id, id, uid, pseudo, body, comment.createdAt),
    recountComments(env, id),
  ]);
  if (env.KV) await env.KV.put(dayKey, String(today + 1), { expirationTtl: COUNTER_TTL_SEC }).catch(() => {});
  return ok({ comment: { ...comment, mine: true, canDelete: true, reported: false } }, 201);
}

async function deleteComment({ env, uid, params: [id, cid] }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const row = await env.DB.prepare(
    `SELECT c.uid, l.owner_uid FROM library_comments c JOIN library_entries l ON l.doc_id = c.doc_id
      WHERE c.id = ? AND c.doc_id = ?`
  ).bind(cid, id).first();
  if (!row) return fail('not_found', 404);
  if (row.uid !== uid && row.owner_uid !== uid && !isAdmin(env, uid)) return fail('forbidden', 403);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM library_comment_reports WHERE comment_id = ?').bind(cid),
    env.DB.prepare('DELETE FROM library_comments WHERE id = ?').bind(cid),
    recountComments(env, id),
  ]);
  return ok({ deleted: cid });
}

async function reportComment({ env, uid, params: [id, cid] }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const row = await env.DB.prepare('SELECT uid FROM library_comments WHERE id = ? AND doc_id = ?').bind(cid, id).first();
  if (!row) return fail('not_found', 404);
  if (row.uid === uid) return fail('own_comment', 403);
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO library_comment_reports (comment_id, uid, created_at) VALUES (?, ?, ?)').bind(cid, uid, Date.now()),
    env.DB.prepare(
      `UPDATE library_comments
          SET reports = (SELECT COUNT(*) FROM library_comment_reports WHERE comment_id = ?1),
              hidden  = CASE WHEN (SELECT COUNT(*) FROM library_comment_reports WHERE comment_id = ?1) >= ?2 THEN 1 ELSE hidden END
        WHERE id = ?1`
    ).bind(cid, hideThreshold(env)),
    recountComments(env, id),
  ]);
  return ok({ reported: true });
}

// ── Ratings ──

async function rate({ request, env, uid, params: [id] }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const entry = await visibleEntry(env, id);
  if (!entry) return fail('not_found', 404);
  if (entry.owner_uid === uid) return fail('own_document', 403);
  const stars = Math.round(Number((await readJson(request))?.stars));
  if (!(stars >= 0 && stars <= 5)) return fail('bad_request', 400);

  const [, , after] = await env.DB.batch([
    stars === 0
      ? env.DB.prepare('DELETE FROM library_ratings WHERE doc_id = ? AND uid = ?').bind(id, uid)
      : env.DB.prepare(
        `INSERT INTO library_ratings (doc_id, uid, stars, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (doc_id, uid) DO UPDATE SET stars = excluded.stars`
      ).bind(id, uid, stars, Date.now()),
    env.DB.prepare(
      `UPDATE library_entries
          SET rating_sum   = (SELECT COALESCE(SUM(stars), 0) FROM library_ratings WHERE doc_id = ?1),
              rating_count = (SELECT COUNT(*) FROM library_ratings WHERE doc_id = ?1)
        WHERE doc_id = ?1`
    ).bind(id),
    env.DB.prepare('SELECT rating_sum, rating_count FROM library_entries WHERE doc_id = ?').bind(id),
  ]);
  const { rating_sum: sum, rating_count: count } = after.results[0];
  return ok({ myRating: stars, rating: count ? Math.round((sum / count) * 10) / 10 : null, ratingCount: count });
}

// ── Followed schools ──

async function listFollows({ env, uid }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const { results } = await env.DB.prepare(
    `SELECT f.school_key AS key, f.school_label AS label,
            (SELECT COUNT(*) FROM library_entries l WHERE l.school_key = f.school_key AND l.hidden = 0) AS count
       FROM school_follows f WHERE f.uid = ? ORDER BY f.created_at ASC`
  ).bind(uid).all();
  return ok({ follows: results });
}

async function setFollow({ request, env, uid }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const data = await readJson(request);
  const label = [...String(data?.school || '')].filter(c => c.charCodeAt(0) >= 32).join('').replace(/\s+/g, ' ').trim().slice(0, 100);
  const key = normalizeKey(label);
  if (!key) return fail('bad_request', 400);

  if (data.follow === false) {
    await env.DB.prepare('DELETE FROM school_follows WHERE uid = ? AND school_key = ?').bind(uid, key).run();
  } else {
    const { count } = await env.DB.prepare('SELECT COUNT(*) AS count FROM school_follows WHERE uid = ?').bind(uid).first();
    if (count >= MAX_FOLLOWS) return fail('too_many_follows', 409);
    await env.DB.prepare('INSERT OR IGNORE INTO school_follows (uid, school_key, school_label, created_at) VALUES (?, ?, ?, ?)')
      .bind(uid, key, label, Date.now()).run();
  }
  return listFollows({ env, uid });
}
