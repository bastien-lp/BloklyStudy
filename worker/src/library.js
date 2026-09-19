/**
 * Public synthesis library — documents their owners chose to publish.
 * --------------------------------------------------------------------------
 * Routes (all behind the Firebase ID token check done by the router):
 *   PUT    /docs/:id/library        publish, or update the description (owner)
 *   DELETE /docs/:id/library        unpublish (owner)
 *   GET    /library                 search: ?q= &school= &subject= &level= &language=
 *                                    &sort=recent|popular &saved=1 &offset=
 *   GET    /library/facets          top schools / subjects (with counts) for the filters
 *   POST   /library/:id/like        { liked: boolean }
 *   POST   /library/:id/save        { saved: boolean }   (personal favourites)
 *   POST   /library/:id/report      { reason }           (one per user and document)
 *   POST   /library/:id/moderate    { action: hide|unhide|remove }  (ADMIN_UIDS only)
 *
 * Publishing never copies the file, so it costs no storage: it only makes an
 * existing document readable by every signed-in user (see canRead in docs.js).
 * Search uses an FTS5 index (accent-insensitive, prefix matching) kept in
 * sync here. Filters use normalized keys, so "Université de Liège",
 * "universite de liege" and "UNIVERSITÉ DE LIÈGE" are the same school.
 *
 * Moderation: a document reported by LIBRARY_HIDE_AFTER_REPORTS different
 * users is hidden automatically until an admin reviews it.
 */

import { fail, ok, available, isAdmin, findDoc, toClient, LIBRARY_COLUMNS, unpublishStatements } from './docs.js';

const DOC_ID = '([A-Za-z0-9_-]{22})';
const PAGE_SIZE = 24;
const MAX_OFFSET = 2000;
const FACET_LIMIT = 40;
const MAX_QUERY_TOKENS = 8;

const LEVELS = new Set(['secondary', 'y1', 'y2', 'y3', 'master', 'phd', 'other']);
const LANGUAGES = new Set(['fr', 'en', 'es', 'de', 'nl', 'it', 'other']);
const REPORT_REASONS = new Set(['inappropriate', 'copyright', 'spam', 'wrong', 'other']);

export const libraryRoutes = [
  ['PUT', new RegExp(`^/docs/${DOC_ID}/library$`), publish],
  ['DELETE', new RegExp(`^/docs/${DOC_ID}/library$`), unpublish],
  ['GET', new RegExp('^/library$'), search],
  ['GET', new RegExp('^/library/facets$'), facets],
  ['POST', new RegExp(`^/library/${DOC_ID}/like$`), like],
  ['POST', new RegExp(`^/library/${DOC_ID}/save$`), save],
  ['POST', new RegExp(`^/library/${DOC_ID}/report$`), report],
  ['POST', new RegExp(`^/library/${DOC_ID}/moderate$`), moderate],
];

// ── Helpers ──

/** Lowercase, no accents, single spaces: the key used by filters and facets. */
export function normalizeKey(s) {
  return String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Plain one-line text, bounded. */
function cleanText(value, max) {
  return [...String(value || '')].map(c => (c.charCodeAt(0) < 32 ? ' ' : c)).join('')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Multi-line text (description): keeps line breaks, collapses the rest. */
function cleanMultiline(value, max) {
  return String(value || '').split(/\r?\n/).map(line => cleanText(line, max)).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

/** User query → FTS5 expression: every word must match, as a prefix. */
export function ftsQuery(q) {
  const tokens = normalizeKey(q).split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, MAX_QUERY_TOKENS);
  return tokens.map(tok => `"${tok}"*`).join(' ');
}

const hideThreshold = env => Number(env.LIBRARY_HIDE_AFTER_REPORTS) > 0 ? Number(env.LIBRARY_HIDE_AFTER_REPORTS) : 3;

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function findEntry(env, id) {
  return env.DB.prepare('SELECT * FROM library_entries WHERE doc_id = ?').bind(id).first();
}

// ── Publish / unpublish ──

async function publish({ request, env, uid, params: [id] }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const row = await findDoc(env, id);
  if (!row || row.owner_uid !== uid) return fail('not_found', 404);

  const data = await readJson(request);
  if (!data) return fail('bad_request', 400);
  if (data.consent !== true) return fail('consent_required', 400);

  const entry = {
    title: cleanText(data.title, 120) || row.name,
    subject: cleanText(data.subject, 60),
    school: cleanText(data.school, 100),
    level: LEVELS.has(data.level) ? data.level : '',
    language: LANGUAGES.has(data.language) ? data.language : '',
    description: cleanMultiline(data.description, 400),
    pseudo: cleanText(data.pseudo, 40) || '?',
  };
  if (entry.subject.length < 2) return fail('subject_required', 400);

  const now = Date.now();
  const existing = await findEntry(env, id);
  const upsert = existing
    ? env.DB.prepare(
      `UPDATE library_entries SET author_pseudo = ?, title = ?, subject = ?, subject_key = ?, school = ?, school_key = ?,
              level = ?, language = ?, description = ?, updated_at = ? WHERE doc_id = ?`
    ).bind(entry.pseudo, entry.title, entry.subject, normalizeKey(entry.subject), entry.school, normalizeKey(entry.school),
      entry.level, entry.language, entry.description, now, id)
    : env.DB.prepare(
      `INSERT INTO library_entries (doc_id, owner_uid, author_pseudo, title, subject, subject_key, school, school_key,
                                    level, language, description, published_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, uid, entry.pseudo, entry.title, entry.subject, normalizeKey(entry.subject), entry.school,
      normalizeKey(entry.school), entry.level, entry.language, entry.description, now, now);

  await env.DB.batch([
    upsert,
    env.DB.prepare('DELETE FROM library_fts WHERE doc_id = ?').bind(id),
    env.DB.prepare('INSERT INTO library_fts (doc_id, title, subject, school, description) VALUES (?, ?, ?, ?, ?)')
      .bind(id, entry.title, entry.subject, entry.school, entry.description),
  ]);

  const fresh = await env.DB.prepare(
    `SELECT d.*, ${LIBRARY_COLUMNS} FROM documents d JOIN library_entries l ON l.doc_id = d.id WHERE d.id = ?`
  ).bind(id).first();
  return ok({ doc: toClient(fresh, uid) }, existing ? 200 : 201);
}

async function unpublish({ env, uid, params: [id] }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const row = await findDoc(env, id);
  if (!row || row.owner_uid !== uid) return fail('not_found', 404);
  await env.DB.batch(unpublishStatements(env, id));
  return ok({ unpublished: id });
}

// ── Search & facets ──

async function search({ request, env, uid }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const p = new URL(request.url).searchParams;
  const moderation = p.get('moderation') === '1' && isAdmin(env, uid);

  const where = [moderation ? 'l.hidden = 1' : 'l.hidden = 0'];
  const binds = [uid, uid];
  let join = '';

  if (p.get('saved') === '1') {
    join = 'JOIN library_saves sv ON sv.doc_id = l.doc_id AND sv.uid = ?';
    binds.push(uid);
  }
  const match = ftsQuery(p.get('q'));
  if (match) {
    where.push('l.doc_id IN (SELECT doc_id FROM library_fts WHERE library_fts MATCH ?)');
    binds.push(match);
  }
  for (const [param, column] of [['school', 'school_key'], ['subject', 'subject_key']]) {
    const key = normalizeKey(p.get(param));
    if (key) { where.push(`l.${column} = ?`); binds.push(key); }
  }
  if (LEVELS.has(p.get('level'))) { where.push('l.level = ?'); binds.push(p.get('level')); }
  if (LANGUAGES.has(p.get('language'))) { where.push('l.language = ?'); binds.push(p.get('language')); }

  const order = p.get('sort') === 'popular'
    ? 'l.likes DESC, l.views DESC, l.published_at DESC'
    : 'l.published_at DESC';
  const offset = Math.min(MAX_OFFSET, Math.max(0, Math.floor(Number(p.get('offset')) || 0)));

  // `binds` was built in placement order: the two EXISTS (uid, uid), the join, then WHERE.
  const { results } = await env.DB.prepare(
    `SELECT d.*, ${LIBRARY_COLUMNS}, l.reports AS reports,
            EXISTS (SELECT 1 FROM library_likes k WHERE k.doc_id = l.doc_id AND k.uid = ?) AS liked,
            EXISTS (SELECT 1 FROM library_saves v WHERE v.doc_id = l.doc_id AND v.uid = ?) AS saved
       FROM library_entries l JOIN documents d ON d.id = l.doc_id ${join}
      WHERE ${where.join(' AND ')}
      ORDER BY ${order}
      LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}`
  ).bind(...binds).all();

  const docs = results.slice(0, PAGE_SIZE).map(r => ({
    ...toClient(r, uid), liked: Boolean(r.liked), saved: Boolean(r.saved),
    ...(moderation ? { reports: r.reports } : {}),
  }));
  return ok({ docs, hasMore: results.length > PAGE_SIZE, nextOffset: offset + docs.length });
}

async function facets({ request, env }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const p = new URL(request.url).searchParams;
  const schoolKey = normalizeKey(p.get('school'));
  const subjectKey = normalizeKey(p.get('subject'));

  // Each list is narrowed by the OTHER active filter ("subjects taught at this school").
  // The label is the most used spelling of the key (ties: the first published).
  const facet = (column, labelColumn, otherColumn, otherKey) => env.DB.prepare(
    `SELECT g.key, g.count,
            (SELECT e.${labelColumn} FROM library_entries e WHERE e.${column} = g.key AND e.hidden = 0
              GROUP BY e.${labelColumn} ORDER BY COUNT(*) DESC, MIN(e.published_at) ASC LIMIT 1) AS label
       FROM (SELECT ${column} AS key, COUNT(*) AS count
               FROM library_entries
              WHERE hidden = 0 AND ${column} != '' ${otherKey ? `AND ${otherColumn} = ?` : ''}
              GROUP BY ${column}) g
      ORDER BY g.count DESC, g.key ASC LIMIT ${FACET_LIMIT}`
  ).bind(...(otherKey ? [otherKey] : []));

  const [schools, subjects, total] = await env.DB.batch([
    facet('school_key', 'school', 'subject_key', subjectKey),
    facet('subject_key', 'subject', 'school_key', schoolKey),
    env.DB.prepare('SELECT COUNT(*) AS count FROM library_entries WHERE hidden = 0'),
  ]);
  return ok({ schools: schools.results, subjects: subjects.results, total: total.results[0].count });
}

// ── Reactions ──

async function toggleRow(env, table, id, uid, on) {
  return on
    ? env.DB.prepare(`INSERT OR IGNORE INTO ${table} (doc_id, uid, created_at) VALUES (?, ?, ?)`).bind(id, uid, Date.now())
    : env.DB.prepare(`DELETE FROM ${table} WHERE doc_id = ? AND uid = ?`).bind(id, uid);
}

async function like({ request, env, uid, params: [id] }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const entry = await findEntry(env, id);
  if (!entry || entry.hidden) return fail('not_found', 404);
  if (entry.owner_uid === uid) return fail('own_document', 403);
  const data = await readJson(request);
  const liked = data?.liked === true;

  // The counter is recomputed from the rows, so it can never drift.
  const [, , count] = await env.DB.batch([
    await toggleRow(env, 'library_likes', id, uid, liked),
    env.DB.prepare('UPDATE library_entries SET likes = (SELECT COUNT(*) FROM library_likes WHERE doc_id = ?) WHERE doc_id = ?').bind(id, id),
    env.DB.prepare('SELECT likes FROM library_entries WHERE doc_id = ?').bind(id),
  ]);
  return ok({ liked, likes: count.results[0].likes });
}

async function save({ request, env, uid, params: [id] }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const entry = await findEntry(env, id);
  if (!entry || entry.hidden) return fail('not_found', 404);
  const data = await readJson(request);
  const saved = data?.saved === true;
  await (await toggleRow(env, 'library_saves', id, uid, saved)).run();
  return ok({ saved });
}

async function report({ request, env, uid, params: [id] }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const entry = await findEntry(env, id);
  if (!entry) return fail('not_found', 404);
  if (entry.owner_uid === uid) return fail('own_document', 403);
  const data = await readJson(request);
  const reason = REPORT_REASONS.has(data?.reason) ? data.reason : 'other';

  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO library_reports (doc_id, uid, reason, created_at) VALUES (?, ?, ?, ?)')
      .bind(id, uid, reason, Date.now()),
    env.DB.prepare(
      `UPDATE library_entries
          SET reports = (SELECT COUNT(*) FROM library_reports WHERE doc_id = ?1),
              hidden  = CASE WHEN (SELECT COUNT(*) FROM library_reports WHERE doc_id = ?1) >= ?2 THEN 1 ELSE hidden END
        WHERE doc_id = ?1`
    ).bind(id, hideThreshold(env)),
  ]);
  return ok({ reported: true });
}

async function moderate({ request, env, uid, params: [id] }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  if (!isAdmin(env, uid)) return fail('forbidden', 403);
  const entry = await findEntry(env, id);
  if (!entry) return fail('not_found', 404);
  const action = (await readJson(request))?.action;

  if (action === 'hide') {
    await env.DB.prepare('UPDATE library_entries SET hidden = 1 WHERE doc_id = ?').bind(id).run();
  } else if (action === 'unhide') {
    // Restored after review: past reports are cleared so they cannot re-hide it at once.
    await env.DB.batch([
      env.DB.prepare('DELETE FROM library_reports WHERE doc_id = ?').bind(id),
      env.DB.prepare('UPDATE library_entries SET hidden = 0, reports = 0 WHERE doc_id = ?').bind(id),
    ]);
  } else if (action === 'remove') {
    await env.DB.batch(unpublishStatements(env, id));
  } else {
    return fail('bad_request', 400);
  }
  return ok({ moderated: action });
}
