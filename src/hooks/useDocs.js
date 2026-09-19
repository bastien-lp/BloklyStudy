/**
 * useDocs — the signed-in user's document library (R2 via the worker).
 * --------------------------------------------------------------------------
 * Holds the list, the storage usage and the upload queue, so the Syntheses
 * page can show chapter badges and the library from the same state. Does
 * nothing (and loads nothing) when the worker is not configured.
 *
 * Returns { available, docs, usage, loading, error, queue,
 *           upload(files, dest), dismiss(queueId), rename, move, remove,
 *           markShared(docId, groupId, shared), patchDoc(docId, fields), reload }.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  isDocsAvailable, listMyDocs, uploadDocument, updateDocMeta, deleteDocument, forgetDocUrls,
} from '../lib/docs';

let queueSeq = 0;

export function useDocs(user) {
  const available = isDocsAvailable();
  const [docs, setDocs] = useState([]);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(available);
  const [error, setError] = useState('');
  const [queue, setQueue] = useState([]); // [{ qid, name, progress, status: 'uploading'|'done'|'error', error? }]
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!available || !user) return undefined;
    let alive = true;
    listMyDocs(user)
      .then(data => {
        if (!alive) return;
        setDocs(data.docs);
        setUsage(data.usage);
        setError('');
      })
      .catch(e => { if (alive) setError(e.code || 'failed'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [available, user, reloadTick]);

  const reload = useCallback(() => { setLoading(true); setReloadTick(n => n + 1); }, []);

  const patchQueue = (qid, changes) =>
    setQueue(q => q.map(item => (item.qid === qid ? { ...item, ...changes } : item)));

  /** Uploads files one after the other (keeps the progress readable, spares the worker). */
  const upload = useCallback(async (files, dest = {}) => {
    const items = [...files].map(file => ({ qid: ++queueSeq, file, name: file.name, progress: 0, status: 'uploading' }));
    setQueue(q => [...q, ...items.map(({ qid, name, progress, status }) => ({ qid, name, progress, status }))]);
    for (const item of items) {
      try {
        const { doc, usage: nextUsage } = await uploadDocument(user, item.file, dest,
          p => patchQueue(item.qid, { progress: p }));
        setDocs(d => [doc, ...d]);
        setUsage(nextUsage);
        patchQueue(item.qid, { status: 'done', progress: 1 });
        // Finished rows fade out on their own.
        setTimeout(() => setQueue(q => q.filter(i => i.qid !== item.qid)), 2500);
      } catch (e) {
        if (e.usage) setUsage(e.usage);
        patchQueue(item.qid, { status: 'error', error: e.code || 'failed' });
      }
    }
  }, [user]);

  const dismiss = qid => setQueue(q => q.filter(i => i.qid !== qid));

  const applyEdit = async (id, changes) => {
    const { doc } = await updateDocMeta(user, id, changes);
    setDocs(d => d.map(x => (x.id === id ? { ...x, ...doc, sharedGroups: x.sharedGroups } : x)));
  };

  const rename = (id, name) => applyEdit(id, { name });
  const move = (id, subjectId, chapterIdx) => applyEdit(id, { subjectId, chapterIdx });

  const remove = async id => {
    const { usage: nextUsage } = await deleteDocument(user, id);
    forgetDocUrls(id);
    setDocs(d => d.filter(x => x.id !== id));
    setUsage(nextUsage);
  };

  /** Merges fields into one document (e.g. `library` after publishing; null removes it). */
  const patchDoc = (id, patch) => setDocs(d => d.map(x => (x.id === id ? { ...x, ...patch } : x)));

  /** Keeps `sharedGroups` in step after a share / unshare done elsewhere. */
  const markShared = (id, groupId, shared) => setDocs(d => d.map(x => {
    if (x.id !== id) return x;
    const groups = new Set(x.sharedGroups || []);
    if (shared) groups.add(groupId); else groups.delete(groupId);
    return { ...x, sharedGroups: [...groups] };
  }));

  return { available, docs, usage, loading, error, queue, upload, dismiss, rename, move, remove, markShared, patchDoc, reload };
}
