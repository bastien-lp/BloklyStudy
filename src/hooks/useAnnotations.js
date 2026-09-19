/**
 * useAnnotations — my highlights and notes on one PDF (worker /annotations).
 * --------------------------------------------------------------------------
 * Loads them when the document is a PDF, and creates / updates / deletes them
 * optimistically (the list updates at once; a failure puts it back). State is
 * keyed by document id, so moving to the next document in the viewer never
 * shows the previous one's highlights.
 *
 * Chapter link: new annotations are linked to `link` — by default the
 * document's own chapter when it is mine; for a group or library document
 * the reader picks one in the notes panel (`setLink`).
 *
 * Returns { list, error, link, setLink, create, update, remove, activeId, setActiveId }.
 */

import { useEffect, useState } from 'react';
import { listAnnotations, createAnnotation, updateAnnotation, deleteAnnotation } from '../lib/docs';

const defaultLink = doc => (doc?.mine && doc.subjectId != null
  ? { subjectId: String(doc.subjectId), chapterIdx: doc.chapterIdx ?? null }
  : { subjectId: null, chapterIdx: null });

export function useAnnotations(user, doc) {
  const docId = doc?.id;
  const enabled = doc?.kind === 'pdf';
  const [byDoc, setByDoc] = useState({});     // docId → annotations[]
  const [links, setLinks] = useState({});     // docId → { subjectId, chapterIdx }
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState(null);

  const list = (enabled && byDoc[docId]) || [];
  const link = links[docId] || defaultLink(doc);
  const setList = fn => setByDoc(m => ({ ...m, [docId]: fn(m[docId] || []) }));
  const setLink = v => setLinks(m => ({ ...m, [docId]: typeof v === 'function' ? v(m[docId] || defaultLink(doc)) : v }));

  useEffect(() => {
    if (!enabled || !user || !docId) return undefined;
    let alive = true;
    listAnnotations(user, docId)
      .then(data => { if (alive) setByDoc(m => ({ ...m, [docId]: data.annotations })); })
      .catch(e => { if (alive) setError(e.code || 'failed'); });
    return () => { alive = false; };
  }, [enabled, user, docId]);

  /** From a text selection (PdfPages). Resolves to the saved annotation (or null). */
  async function create(selection, { color = 'yellow', note = '' } = {}) {
    const tempId = `tmp-${Date.now()}`;
    const draft = {
      id: tempId, page: selection.page, rects: selection.rects, quote: selection.quote, color, note,
      subjectId: link.subjectId, chapterIdx: link.chapterIdx, createdAt: Date.now(),
    };
    setList(l => [...l, draft]);
    try {
      const { annotation } = await createAnnotation(user, docId, {
        page: draft.page, rects: draft.rects, quote: draft.quote, color, note,
        subjectId: link.subjectId, chapterIdx: link.chapterIdx,
      });
      setList(l => l.map(a => (a.id === tempId ? annotation : a)));
      return annotation;
    } catch (e) {
      setList(l => l.filter(a => a.id !== tempId));
      setError(e.code || 'failed');
      return null;
    }
  }

  async function update(id, changes) {
    const before = list.find(a => a.id === id);
    setList(l => l.map(a => (a.id === id ? { ...a, ...changes } : a)));
    try {
      await updateAnnotation(user, id, changes);
    } catch (e) {
      if (before) setList(l => l.map(a => (a.id === id ? before : a)));
      setError(e.code || 'failed');
    }
  }

  async function remove(id) {
    const before = list;
    setList(l => l.filter(a => a.id !== id));
    if (activeId === id) setActiveId(null);
    try {
      await deleteAnnotation(user, id);
    } catch (e) {
      setList(() => before);
      setError(e.code || 'failed');
    }
  }

  return { list, error, link, setLink, create, update, remove, activeId, setActiveId };
}
