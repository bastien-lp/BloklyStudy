/**
 * Highlights and notes on PDF documents — private to each reader.
 * --------------------------------------------------------------------------
 * Routes (behind the Firebase ID token check done by the router):
 *   GET    /docs/:id/annotations           my annotations on a document I can read
 *   POST   /docs/:id/annotations           { page, rects, quote, color, note?, subjectId?, chapterIdx? }
 *   PATCH  /annotations/:aid               { note?, color?, subjectId?, chapterIdx? }   (mine)
 *   DELETE /annotations/:aid               (mine)
 *   GET    /annotations?subjectId=&chapterIdx=   mine for one chapter, with the document's name
 *   GET    /annotations/summary            { counts: [{ subjectId, chapterIdx, count }] } for the chapter badges
 *
 * Positions (`rects`) are fractions of the page's width / height, so a
 * highlight stays in place at any zoom. Reading access to the document is
 * re-checked when annotating (owner, group member, or public library).
 * Limits: MAX_PER_DOC annotations per reader and document, bounded texts.
 */

import { fail, ok, available, findDoc, canRead, cleanSubjectId, cleanChapterIdx } from './docs.js';

const DOC_ID = '([A-Za-z0-9_-]{22})';
const ANN_ID = '([A-Za-z0-9_-]{16})';
const COLORS = new Set(['yellow', 'green', 'pink', 'blue']);
const MAX_PER_DOC = 500;
const MAX_RECTS = 60;
const MAX_QUOTE = 1000;
const MAX_NOTE = 2000;

export const annotationRoutes = [
  ['GET', new RegExp(`^/docs/${DOC_ID}/annotations$`), listForDoc],
  ['POST', new RegExp(`^/docs/${DOC_ID}/annotations$`), create],
  ['GET', new RegExp('^/annotations/summary$'), summary],
  ['GET', new RegExp('^/annotations$'), listForChapter],
  ['PATCH', new RegExp(`^/annotations/${ANN_ID}$`), update],
  ['DELETE', new RegExp(`^/annotations/${ANN_ID}$`), remove],
];

function shortId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

/** Plain text, control characters removed (line breaks kept), bounded. */
function cleanText(value, max) {
  return [...String(value ?? '')]
    .map(c => { const n = c.charCodeAt(0); return n === 10 || n >= 32 ? c : ' '; })
    .join('').replace(/[ \t]+/g, ' ').trim().slice(0, max);
}

/** Validated rectangles, or null. Each is [x, y, w, h] in page fractions. */
function cleanRects(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_RECTS) return null;
  const out = [];
  for (const r of raw) {
    if (!Array.isArray(r) || r.length !== 4) return null;
    const [x, y, w, h] = r.map(Number);
    if (![x, y, w, h].every(Number.isFinite)) return null;
    if (x < -0.05 || y < -0.05 || w <= 0 || h <= 0 || x + w > 1.05 || y + h > 1.05) return null;
    out.push([x, y, w, h].map(v => Math.round(v * 10000) / 10000));
  }
  return out;
}

function toClient(row) {
  return {
    id: row.id,
    docId: row.doc_id,
    page: row.page,
    rects: JSON.parse(row.rects),
    quote: row.quote,
    color: row.color,
    note: row.note,
    subjectId: row.subject_id,
    chapterIdx: row.chapter_idx,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.doc_name !== undefined
      ? { doc: { id: row.doc_id, name: row.doc_name, kind: row.doc_kind, size: row.doc_size, hasThumb: Boolean(row.doc_has_thumb) } }
      : {}),
  };
}

async function readableDoc(env, idToken, id, uid) {
  const row = await findDoc(env, id);
  return row && (await canRead(env, idToken, row, uid)) ? row : null;
}

async function listForDoc({ env, uid, idToken, params: [id] }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  if (!(await readableDoc(env, idToken, id, uid))) return fail('not_found', 404);
  const { results } = await env.DB.prepare(
    'SELECT * FROM doc_annotations WHERE uid = ? AND doc_id = ? ORDER BY page ASC, created_at ASC'
  ).bind(uid, id).all();
  return ok({ annotations: results.map(toClient) });
}

async function create({ request, env, uid, idToken, params: [id] }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const docRow = await readableDoc(env, idToken, id, uid);
  if (!docRow) return fail('not_found', 404);
  if (docRow.kind !== 'pdf') return fail('bad_request', 400);

  const data = await readJson(request);
  const page = Math.round(Number(data?.page));
  const rects = cleanRects(data?.rects);
  const color = COLORS.has(data?.color) ? data.color : 'yellow';
  if (!(page >= 1 && page <= 5000) || !rects) return fail('bad_request', 400);

  const { count } = await env.DB.prepare('SELECT COUNT(*) AS count FROM doc_annotations WHERE uid = ? AND doc_id = ?').bind(uid, id).first();
  if (count >= MAX_PER_DOC) return fail('too_many_annotations', 409);

  const now = Date.now();
  const row = {
    id: shortId(), doc_id: id, uid, page, rects: JSON.stringify(rects),
    quote: cleanText(data.quote, MAX_QUOTE), color, note: cleanText(data.note, MAX_NOTE),
    subject_id: cleanSubjectId(data.subjectId), chapter_idx: cleanChapterIdx(data.chapterIdx),
    created_at: now, updated_at: now,
  };
  await env.DB.prepare(
    `INSERT INTO doc_annotations (id, doc_id, uid, page, rects, quote, color, note, subject_id, chapter_idx, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(row.id, row.doc_id, uid, row.page, row.rects, row.quote, row.color, row.note, row.subject_id, row.chapter_idx, now, now).run();
  return ok({ annotation: toClient(row) }, 201);
}

async function update({ request, env, uid, params: [aid] }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const row = await env.DB.prepare('SELECT * FROM doc_annotations WHERE id = ? AND uid = ?').bind(aid, uid).first();
  if (!row) return fail('not_found', 404);
  const data = await readJson(request);
  if (!data) return fail('bad_request', 400);

  const next = { ...row };
  if ('note' in data) next.note = cleanText(data.note, MAX_NOTE);
  if ('color' in data && COLORS.has(data.color)) next.color = data.color;
  if ('subjectId' in data) next.subject_id = cleanSubjectId(data.subjectId);
  if ('chapterIdx' in data) next.chapter_idx = cleanChapterIdx(data.chapterIdx);
  next.updated_at = Date.now();
  await env.DB.prepare(
    'UPDATE doc_annotations SET note = ?, color = ?, subject_id = ?, chapter_idx = ?, updated_at = ? WHERE id = ? AND uid = ?'
  ).bind(next.note, next.color, next.subject_id, next.chapter_idx, next.updated_at, aid, uid).run();
  return ok({ annotation: toClient(next) });
}

async function remove({ env, uid, params: [aid] }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const res = await env.DB.prepare('DELETE FROM doc_annotations WHERE id = ? AND uid = ?').bind(aid, uid).run();
  if (!res.meta.changes) return fail('not_found', 404);
  return ok({ deleted: aid });
}

async function listForChapter({ request, env, uid }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const p = new URL(request.url).searchParams;
  const subjectId = cleanSubjectId(p.get('subjectId'));
  const chapterIdx = cleanChapterIdx(p.get('chapterIdx'));
  if (subjectId == null || chapterIdx == null) return fail('bad_request', 400);
  const { results } = await env.DB.prepare(
    `SELECT a.*, d.name AS doc_name, d.kind AS doc_kind, d.file_size AS doc_size, d.has_thumb AS doc_has_thumb
       FROM doc_annotations a JOIN documents d ON d.id = a.doc_id
      WHERE a.uid = ? AND a.subject_id = ? AND a.chapter_idx = ?
      ORDER BY d.name ASC, a.page ASC, a.created_at ASC LIMIT 500`
  ).bind(uid, subjectId, chapterIdx).all();
  return ok({ annotations: results.map(toClient) });
}

async function summary({ env, uid }) {
  if (!available(env)) return fail('docs_unavailable', 503);
  const { results } = await env.DB.prepare(
    `SELECT subject_id AS subjectId, chapter_idx AS chapterIdx, COUNT(*) AS count
       FROM doc_annotations WHERE uid = ? AND subject_id IS NOT NULL AND chapter_idx IS NOT NULL
      GROUP BY subject_id, chapter_idx`
  ).bind(uid).all();
  return ok({ counts: results });
}
