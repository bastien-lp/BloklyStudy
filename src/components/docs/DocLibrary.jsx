/**
 * DocLibrary — the "Documents" view of the Syntheses page.
 * --------------------------------------------------------------------------
 * Upload (drop anywhere on the library, or browse), see how much space is
 * left, filter by subject / search, and act on each document: open, rename,
 * file it under another subject or chapter, share with groups, delete.
 * Cards can be dragged onto a subject chip to file them there; files dropped
 * on a chip are uploaded straight into that subject.
 *
 * State lives in useDocs() (owned by the page) so the chapter list can show
 * attachment counts from the same data.
 *
 * "Publish to the library" opens PublishModal; published cards carry a
 * "Public" badge (or "Hidden" when moderation took them down).
 *
 * Props: { user, subjects, pseudo, profile, lib, focus, onFocusChange }
 *   focus = { subjectId, chapterIdx } | null — narrows the view to a chapter
 */

import { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CloudUpload, Search, X, Pencil, FolderInput, Share2, Trash2, Users, Check,
  Ellipsis, Inbox, HardDrive, AlertTriangle, Globe, EyeOff,
} from 'lucide-react';
import { useTranslation } from '../../i18n';
import { DOC_ACCEPT, formatBytes } from '../../lib/docs';
import { Button, EmptyState, Section } from '../ui';
import DocCover from './DocCover';
import DocViewer from './DocViewer';
import ShareDocModal from './ShareDocModal';
import PublishModal from './PublishModal';
import { visualFor, byteUnits } from './docVisuals';
import { docErrorKey } from './docErrors';

const DRAG_TYPE = 'application/x-blokly-doc';
const UNFILED = '__unfiled';

const subjectKey = doc => (doc.subjectId == null ? UNFILED : String(doc.subjectId));
const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');

// ── Storage meter ────────────────────────────────────────────────────────────
function StorageMeter({ usage }) {
  const { t, formatNumber } = useTranslation();
  if (!usage) return null;
  const pct = Math.min(100, (usage.used / usage.quota) * 100);
  const color = pct >= 95 ? 'var(--danger)' : pct >= 80 ? 'var(--warning)' : 'var(--success)';
  const units = byteUnits(t);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <HardDrive size={18} color="var(--text-muted)" aria-hidden="true" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '.7rem', color: 'var(--text-muted)', marginBottom: 5 }}>
          <span>
            <strong style={{ color: 'var(--text-primary)' }}>{formatBytes(usage.used, formatNumber, units)}</strong>
            {' '}{t('docs.storageOf', { quota: formatBytes(usage.quota, formatNumber, units) })}
          </span>
          <span>{t('docs.storageFiles', { count: usage.files })}</span>
        </div>
        <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={t('docs.storageLabel')}
          style={{ height: 7, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
          <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: .7, ease: 'easeOut' }}
            style={{ height: '100%', borderRadius: 99, background: color }} />
        </div>
      </div>
    </div>
  );
}

// ── Upload queue ─────────────────────────────────────────────────────────────
function UploadQueue({ queue, onDismiss, maxFileBytes }) {
  const { t, formatNumber } = useTranslation();
  if (!queue.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} aria-live="polite">
      <AnimatePresence initial={false}>
        {queue.map(item => (
          <motion.div key={item.qid} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 12, background: 'var(--bg-card)' }}>
            <span style={{ flexShrink: 0, display: 'flex', color: item.status === 'error' ? 'var(--danger)' : item.status === 'done' ? 'var(--success)' : 'var(--accent)' }}>
              {item.status === 'error' ? <AlertTriangle size={15} /> : item.status === 'done' ? <Check size={15} /> : <CloudUpload size={15} />}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '.76rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
              {item.status === 'error' ? (
                <div style={{ fontSize: '.66rem', color: 'var(--danger)' }}>
                  {t(docErrorKey(item.error), { max: formatBytes(maxFileBytes || 0, formatNumber, byteUnits(t)) })}
                </div>
              ) : (
                <div style={{ height: 4, borderRadius: 99, background: 'var(--border)', marginTop: 5, overflow: 'hidden' }}>
                  <motion.div animate={{ width: `${Math.round(item.progress * 100)}%` }} transition={{ ease: 'easeOut', duration: .3 }}
                    style={{ height: '100%', background: item.status === 'done' ? 'var(--success)' : 'var(--accent)', borderRadius: 99 }} />
                </div>
              )}
            </div>
            {item.status === 'error' && (
              <button onClick={() => onDismiss(item.qid)} aria-label={t('docs.close')}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
                <X size={14} />
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ── Subject + chapter picker (upload destination, "move to") ────────────────
function DestinationPicker({ subjects, value, onChange, compact = false }) {
  const { t } = useTranslation();
  const subject = subjects.find(s => String(s.id) === String(value.subjectId));
  const chapters = subject?.chapters || [];
  const sel = {
    padding: compact ? '6px 8px' : '7px 10px', borderRadius: 10, border: '1px solid var(--border)', minWidth: 0,
    background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.74rem', fontFamily: 'var(--font-family)',
  };
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
      <select aria-label={t('common.subject')} style={{ ...sel, flex: '1 1 120px' }} value={value.subjectId ?? ''}
        onChange={e => onChange({ subjectId: e.target.value || null, chapterIdx: null })}>
        <option value="">{t('docs.unfiled')}</option>
        {subjects.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
      </select>
      {chapters.length > 0 && (
        <select aria-label={t('common.chapter')} style={{ ...sel, flex: '1 1 120px' }} value={value.chapterIdx ?? ''}
          onChange={e => onChange({ ...value, chapterIdx: e.target.value === '' ? null : Number(e.target.value) })}>
          <option value="">{t('docs.wholeSubject')}</option>
          {chapters.map((c, i) => <option key={i} value={i}>{c.name || t('docs.chapterShort', { count: i + 1 })}</option>)}
        </select>
      )}
    </div>
  );
}

// ── One document card ────────────────────────────────────────────────────────
function DocCard({ user, doc, subjects, onOpen, onShare, onPublish, lib, index }) {
  const { t, formatNumber } = useTranslation();
  const [mode, setMode] = useState(null); // null | 'menu' | 'rename' | 'move' | 'delete'
  const [name, setName] = useState('');
  const [dest, setDest] = useState({ subjectId: doc.subjectId, chapterIdx: doc.chapterIdx });
  const [error, setError] = useState('');
  const { icon: KindIcon, tint } = visualFor(doc.kind);

  const subject = subjects.find(s => String(s.id) === String(doc.subjectId));
  const chapterName = subject && doc.chapterIdx != null
    ? subject.chapters?.[doc.chapterIdx]?.name || t('docs.chapterShort', { count: doc.chapterIdx + 1 })
    : null;
  const sharedCount = doc.sharedGroups?.length || 0;

  async function run(action) {
    setError('');
    try { await action(); setMode(null); }
    catch (e) { setError(t(docErrorKey(e.code))); }
  }

  const menuItems = [
    { icon: Pencil, label: t('docs.rename'), onClick: () => { setName(doc.name.replace(/\.[^.]+$/, '')); setMode('rename'); } },
    { icon: FolderInput, label: t('docs.move'), onClick: () => { setDest({ subjectId: doc.subjectId, chapterIdx: doc.chapterIdx }); setMode('move'); } },
    { icon: Share2, label: t('docs.share'), onClick: () => { setMode(null); onShare(doc); } },
    { icon: Globe, label: doc.library ? t('library.editPublication') : t('library.publishAction'), onClick: () => { setMode(null); onPublish(doc); } },
    { icon: Trash2, label: t('docs.delete'), danger: true, onClick: () => setMode('delete') },
  ];

  return (
    <motion.article layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .96 }}
      transition={{ duration: .25, delay: Math.min(index, 12) * .025, ease: 'easeOut' }}
      draggable={!mode}
      onDragStart={e => { e.dataTransfer.setData(DRAG_TYPE, doc.id); e.dataTransfer.effectAllowed = 'move'; }}
      style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 8, padding: 8, borderRadius: 18,
        background: 'var(--bg-card)', boxShadow: 'var(--card-shadow)', cursor: mode ? 'default' : 'grab' }}>

      <button onClick={() => onOpen(doc)} aria-label={t('docs.openNamed', { name: doc.name })}
        style={{ all: 'unset', cursor: 'pointer', display: 'block', borderRadius: 12 }}>
        <motion.div whileHover={{ scale: 1.02 }} transition={{ duration: .2 }}>
          <DocCover user={user} doc={doc} height={112} />
        </motion.div>
      </button>

      <div style={{ padding: '0 4px 2px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        {mode === 'rename' ? (
          <form onSubmit={e => { e.preventDefault(); if (name.trim()) run(() => lib.rename(doc.id, name.trim())); }}
            style={{ display: 'flex', gap: 4 }}>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={110} aria-label={t('docs.rename')}
              onKeyDown={e => e.key === 'Escape' && setMode(null)}
              style={{ flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--accent)',
                background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.76rem', fontFamily: 'var(--font-family)' }} />
            <button type="submit" aria-label={t('common.save')}
              style={{ border: 'none', borderRadius: 8, background: 'var(--accent)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 8px' }}>
              <Check size={14} />
            </button>
          </form>
        ) : (
          <div title={doc.name} style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>
            {doc.name}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.64rem', color: 'var(--text-muted)' }}>
          <KindIcon size={12} color={tint} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span>{formatBytes(doc.size, formatNumber, byteUnits(t))}</span>
          {doc.library && (
            <span title={doc.library.hidden ? t('library.hiddenBadgeHint') : t('library.publicBadgeHint')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 700,
                color: doc.library.hidden ? 'var(--warning)' : 'var(--success)' }}>
              {doc.library.hidden ? <EyeOff size={11} aria-hidden="true" /> : <Globe size={11} aria-hidden="true" />}
              {doc.library.hidden ? t('library.hiddenBadge') : t('library.publicBadge')}
            </span>
          )}
          {sharedCount > 0 && (
            <span title={t('docs.sharedWith', { count: sharedCount })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--accent)', fontWeight: 700 }}>
              <Users size={11} aria-hidden="true" />{sharedCount}
            </span>
          )}
          <button onClick={() => setMode(m => (m === 'menu' ? null : 'menu'))} aria-label={t('docs.actions')} aria-expanded={mode === 'menu'}
            style={{ marginLeft: 'auto', border: 'none', background: mode === 'menu' ? 'var(--bg-card-hover)' : 'transparent',
              color: 'var(--text-muted)', cursor: 'pointer', borderRadius: 8, padding: '2px 4px', display: 'flex' }}>
            <Ellipsis size={16} />
          </button>
        </div>
        {chapterName && (
          <div style={{ fontSize: '.62rem', color: subject?.color || 'var(--text-muted)', fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chapterName}</div>
        )}

        {mode === 'move' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
            <DestinationPicker subjects={subjects} value={dest} onChange={setDest} compact />
            <div style={{ display: 'flex', gap: 6 }}>
              <Button size="sm" variant="ghost" onClick={() => setMode(null)}>{t('common.cancel')}</Button>
              <Button size="sm" variant="primary" onClick={() => run(() => lib.move(doc.id, dest.subjectId, dest.chapterIdx))}>{t('docs.moveHere')}</Button>
            </div>
          </div>
        )}
        {mode === 'delete' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
            <div style={{ fontSize: '.68rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
              {sharedCount > 0 ? t('docs.confirmDeleteShared') : t('docs.confirmDelete')}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button size="sm" variant="ghost" onClick={() => setMode(null)}>{t('common.cancel')}</Button>
              <Button size="sm" variant="primary" danger icon={Trash2} onClick={() => run(() => lib.remove(doc.id))}>{t('docs.delete')}</Button>
            </div>
          </div>
        )}
        {error && <div role="alert" style={{ fontSize: '.64rem', color: 'var(--danger)' }}>{error}</div>}
      </div>

      <AnimatePresence>
        {mode === 'menu' && (
          <motion.div role="menu" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: .15 }}
            style={{ position: 'absolute', right: 8, bottom: 42, zIndex: 5, minWidth: 170, padding: 5, borderRadius: 14,
              background: 'var(--bg-modal)', boxShadow: '0 14px 40px -12px rgba(0,0,0,.55)', display: 'flex', flexDirection: 'column' }}>
            {menuItems.map(item => (
              <button key={item.label} role="menuitem" onClick={item.onClick}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 10, border: 'none',
                  background: 'transparent', cursor: 'pointer', fontSize: '.76rem', textAlign: 'left',
                  color: item.danger ? 'var(--danger)' : 'var(--text-secondary)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-card-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                <item.icon size={14} aria-hidden="true" />{item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

// ── Library ─────────────────────────────────────────────────────────────────
export default function DocLibrary({ user, subjects, pseudo, profile, lib, focus, onFocusChange }) {
  const { t, formatNumber } = useTranslation();
  const [filter, setFilter] = useState('all');      // 'all' | subject key | UNFILED
  const [search, setSearch] = useState('');
  const [dest, setDest] = useState({ subjectId: null, chapterIdx: null });
  const [dragOver, setDragOver] = useState(false);  // files over the library
  const [chipOver, setChipOver] = useState(null);   // chip key under a drag
  const [viewer, setViewer] = useState(null);       // index in `visible`
  const [sharing, setSharing] = useState(null);     // doc id
  const [publishing, setPublishing] = useState(null); // doc id
  const inputRef = useRef(null);
  const dragDepth = useRef(0);

  const { docs, usage, queue } = lib;
  const uploadsBlocked = usage?.storageFull;

  // Upload destination: the focused chapter when there is one.
  const target = focus ? { subjectId: focus.subjectId, chapterIdx: focus.chapterIdx } : dest;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter(d => {
      if (focus) return String(d.subjectId) === String(focus.subjectId) && d.chapterIdx === focus.chapterIdx;
      if (filter !== 'all' && subjectKey(d) !== filter) return false;
      return !q || d.name.toLowerCase().includes(q);
    });
  }, [docs, filter, search, focus]);

  const countBySubject = useMemo(() => {
    const counts = {};
    docs.forEach(d => { counts[subjectKey(d)] = (counts[subjectKey(d)] || 0) + 1; });
    return counts;
  }, [docs]);

  const focusSubject = focus && subjects.find(s => String(s.id) === String(focus.subjectId));
  const focusLabel = focusSubject
    ? `${focusSubject.name} · ${focusSubject.chapters?.[focus.chapterIdx]?.name || t('docs.chapterShort', { count: focus.chapterIdx + 1 })}`
    : null;

  function startUpload(files, where = target) {
    if (!files?.length || uploadsBlocked) return;
    lib.upload(files, where);
  }

  // Drop anywhere on the library = upload to the current destination.
  const dropHandlers = {
    onDragEnter: e => { if (!hasFiles(e)) return; e.preventDefault(); dragDepth.current++; setDragOver(true); },
    onDragOver: e => { if (hasFiles(e)) e.preventDefault(); },
    onDragLeave: e => { if (!hasFiles(e)) return; dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragOver(false); },
    onDrop: e => {
      if (!hasFiles(e)) return;
      e.preventDefault(); dragDepth.current = 0; setDragOver(false);
      startUpload(e.dataTransfer.files);
    },
  };

  // Subject chips accept both dragged cards (move) and dropped files (upload there).
  function chipDropProps(key) {
    if (key === 'all') return {};
    const subjectId = key === UNFILED ? null : key;
    return {
      onDragOver: e => { e.preventDefault(); e.stopPropagation(); setChipOver(key); },
      onDragLeave: () => setChipOver(c => (c === key ? null : c)),
      onDrop: e => {
        e.preventDefault(); e.stopPropagation(); setChipOver(null); dragDepth.current = 0; setDragOver(false);
        const docId = e.dataTransfer.getData(DRAG_TYPE);
        if (docId) lib.move(docId, subjectId, null).catch(() => {});
        else if (hasFiles(e)) startUpload(e.dataTransfer.files, { subjectId, chapterIdx: null });
      },
    };
  }

  const chips = [
    { key: 'all', label: t('docs.allSubjects'), count: docs.length },
    ...subjects.map(s => ({ key: String(s.id), label: s.name, color: s.color, count: countBySubject[String(s.id)] || 0 })),
    ...(countBySubject[UNFILED] ? [{ key: UNFILED, label: t('docs.unfiled'), count: countBySubject[UNFILED] }] : []),
  ];

  const openDoc = doc => setViewer(visible.findIndex(d => d.id === doc.id));
  const sharingDoc = sharing && docs.find(d => d.id === sharing);
  const publishingDoc = publishing && docs.find(d => d.id === publishing);
  const maxLabel = formatBytes(usage?.maxFileBytes || 0, formatNumber, byteUnits(t));

  if (lib.loading) {
    return (
      <motion.div animate={{ opacity: [.35, 1, .35] }} transition={{ duration: 1.4, repeat: Infinity }}
        style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: '.85rem' }}>{t('common.loading')}</motion.div>
    );
  }
  if (lib.error && !docs.length) {
    return <EmptyState icon={AlertTriangle} title={t(docErrorKey(lib.error))}
      action={<Button size="sm" onClick={lib.reload}>{t('docs.retry')}</Button>} />;
  }

  return (
    <div {...dropHandlers} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Upload area */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '1.1rem 1.2rem', borderRadius: 22,
        background: 'var(--bg-card)', boxShadow: 'var(--card-shadow)' }}>
        <StorageMeter usage={usage} />

        {uploadsBlocked ? (
          <div role="status" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.76rem', color: 'var(--warning)' }}>
            <AlertTriangle size={15} aria-hidden="true" />{t('docs.storageFullGlobal')}
          </div>
        ) : (
          <motion.button type="button" onClick={() => inputRef.current?.click()}
            animate={{ scale: dragOver ? 1.015 : 1 }} transition={{ duration: .2 }}
            style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14,
              padding: '14px 16px', borderRadius: 16, transition: 'background .2s, outline-color .2s',
              outline: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border-strong)'}`, outlineOffset: -2,
              background: dragOver ? 'var(--accent-subtle)' : 'transparent' }}>
            <motion.span animate={{ y: dragOver ? -3 : 0 }}
              style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
              <CloudUpload size={22} aria-hidden="true" />
            </motion.span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <span style={{ fontSize: '.86rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {dragOver ? t('docs.dropActive') : t('docs.dropTitle')}
              </span>
              <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{t('docs.dropHint', { max: maxLabel })}</span>
            </span>
          </motion.button>
        )}
        <input ref={inputRef} type="file" multiple accept={DOC_ACCEPT} hidden
          onChange={e => { startUpload(e.target.files); e.target.value = ''; }} />

        {!focus && !uploadsBlocked && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{t('docs.destination')}</span>
            <DestinationPicker subjects={subjects} value={dest} onChange={setDest} />
          </div>
        )}
        <UploadQueue queue={queue} onDismiss={lib.dismiss} maxFileBytes={usage?.maxFileBytes} />
      </div>

      {/* Focus banner or filters */}
      {focus ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '.74rem', color: 'var(--text-muted)' }}>{t('docs.focusLabel')}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 6px 5px 12px', borderRadius: 99,
            background: 'var(--accent-subtle)', color: 'var(--text-primary)', fontSize: '.76rem', fontWeight: 700 }}>
            {focusLabel || t('docs.unfiled')}
            <button onClick={() => onFocusChange(null)} aria-label={t('docs.clearFocus')}
              style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 2 }}>
              <X size={14} />
            </button>
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} color="var(--text-muted)" aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('docs.searchPlaceholder')} aria-label={t('docs.searchPlaceholder')}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px 9px 34px', borderRadius: 99, border: '1px solid var(--border)',
                background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '.8rem', fontFamily: 'var(--font-family)' }} />
          </div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }} role="tablist" aria-label={t('docs.filterLabel')}>
            {chips.map(c => {
              const active = filter === c.key;
              const over = chipOver === c.key;
              return (
                <button key={c.key} role="tab" aria-selected={active} onClick={() => setFilter(c.key)} {...chipDropProps(c.key)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 99, flexShrink: 0,
                    border: 'none', cursor: 'pointer', fontSize: '.74rem', fontWeight: active ? 700 : 500, transition: 'all .15s',
                    background: over ? 'var(--accent)' : active ? 'var(--accent-subtle)' : 'var(--bg-card)',
                    color: over ? '#fff' : active ? 'var(--text-primary)' : 'var(--text-muted)',
                    transform: over ? 'scale(1.06)' : 'none' }}>
                  {c.color && <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.color }} aria-hidden="true" />}
                  {c.label}
                  <span style={{ fontSize: '.64rem', opacity: .7 }}>{c.count}</span>
                </button>
              );
            })}
          </div>
          {docs.length > 1 && <div style={{ fontSize: '.66rem', color: 'var(--text-muted)' }}>{t('docs.dragHint')}</div>}
        </div>
      )}

      {/* Grid */}
      {visible.length === 0 ? (
        <EmptyState icon={Inbox}
          title={docs.length === 0 || focus ? t('docs.emptyTitle') : t('docs.emptyFiltered')}
          description={docs.length === 0 || focus ? t('docs.emptyText') : undefined}
          action={!uploadsBlocked && (docs.length === 0 || focus)
            ? <Button variant="primary" icon={CloudUpload} onClick={() => inputRef.current?.click()}>{t('docs.browse')}</Button>
            : undefined} />
      ) : (
        <Section title={focus ? undefined : filter === 'all' ? t('docs.allDocs') : chips.find(c => c.key === filter)?.label}
          aside={t('docs.storageFiles', { count: visible.length })}>
          <motion.div layout style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(156px, 1fr))', gap: 12 }}>
            <AnimatePresence>
              {visible.map((d, i) => (
                <DocCard key={d.id} user={user} doc={d} subjects={subjects} lib={lib} index={i}
                  onOpen={openDoc} onShare={doc => setSharing(doc.id)} onPublish={doc => setPublishing(doc.id)} />
              ))}
            </AnimatePresence>
          </motion.div>
        </Section>
      )}

      <AnimatePresence>
        {viewer !== null && visible[viewer] && (
          <DocViewer user={user} docs={visible} index={viewer} onIndexChange={setViewer} onClose={() => setViewer(null)}
            actions={doc => (
              <Button size="sm" variant="secondary" icon={Share2} onClick={() => setSharing(doc.id)}>{t('docs.share')}</Button>
            )} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {sharingDoc && (
          <ShareDocModal user={user} doc={sharingDoc} pseudo={pseudo} onClose={() => setSharing(null)}
            onChange={(groupId, shared) => lib.markShared(sharingDoc.id, groupId, shared)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {publishingDoc && (
          <PublishModal user={user} doc={publishingDoc} subjects={subjects} profile={profile} pseudo={pseudo}
            onClose={() => setPublishing(null)}
            onChange={library => lib.patchDoc(publishingDoc.id, { library: library || undefined })} />
        )}
      </AnimatePresence>
    </div>
  );
}
