/**
 * Documents inside a study group.
 * --------------------------------------------------------------------------
 *   <DocBubble>         the chat card for a `type: 'doc'` message
 *   <GroupDocsPanel>    the group's shared library (everything shared here)
 *   <GroupDocPicker>    share into the group: one of my documents, or a new upload
 *
 * Access is always decided by the worker (membership is re-checked on every
 * file read), so a bubble whose document was deleted or un-shared simply
 * shows "no longer available" when opened.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CloudUpload, FolderOpen, Share2, Trash2, X, Check } from 'lucide-react';
import { useTranslation } from '../../i18n';
import {
  listGroupDocs, listMyDocs, uploadDocument, unshareDocFromGroup, formatBytes, DOC_ACCEPT,
} from '../../lib/docs';
import { Button, EmptyState } from '../ui';
import DocCover from './DocCover';
import DocViewer from './DocViewer';
import { visualFor, byteUnits } from './docVisuals';
import { docErrorKey } from './docErrors';

/** Shared modal shell (backdrop + sheet). */
function Sheet({ label, onClose, width = 560, children }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      role="dialog" aria-modal="true" aria-label={label}
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <motion.div initial={{ y: 16, scale: .97 }} animate={{ y: 0, scale: 1 }} transition={{ duration: .22, ease: 'easeOut' }}
        style={{ width, maxWidth: '100%', maxHeight: '86vh', display: 'flex', flexDirection: 'column', gap: 14,
          background: 'var(--bg-modal)', borderRadius: 22, padding: '1.3rem', boxShadow: 'var(--card-shadow)' }}>
        {children}
      </motion.div>
    </motion.div>
  );
}

function SheetHeader({ icon: Icon, title, subtitle, onClose }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
        <Icon size={18} aria-hidden="true" />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{subtitle}</div>}
      </div>
      <button onClick={onClose} aria-label={t('docs.close')}
        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
        <X size={18} />
      </button>
    </div>
  );
}

/** Small tile used by both the panel and the picker. */
function DocTile({ user, doc, onClick, footer, dimmed = false }) {
  const { t, formatNumber } = useTranslation();
  const { tint } = visualFor(doc.kind);
  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: dimmed ? .5 : 1, y: 0 }} exit={{ opacity: 0 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 6, borderRadius: 16, background: 'var(--bg-card)' }}>
      <button onClick={onClick} disabled={!onClick} aria-label={doc.name}
        style={{ all: 'unset', cursor: onClick ? 'pointer' : 'default', borderRadius: 12, display: 'block' }}>
        <motion.div whileHover={onClick ? { scale: 1.03 } : {}}><DocCover user={user} doc={doc} height={88} /></motion.div>
      </button>
      <div style={{ padding: '0 3px', minWidth: 0 }}>
        <div title={doc.name} style={{ fontSize: '.74rem', fontWeight: 700, color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
        <div style={{ fontSize: '.62rem', color: 'var(--text-muted)', display: 'flex', gap: 5, alignItems: 'center' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: tint, flexShrink: 0 }} aria-hidden="true" />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {formatBytes(doc.size, formatNumber, byteUnits(t))}{doc.sharedBy ? ` · ${doc.sharedBy}` : ''}
          </span>
        </div>
        {footer}
      </div>
    </motion.div>
  );
}

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))', gap: 10, overflowY: 'auto', padding: 2 };

// ── Chat bubble ──────────────────────────────────────────────────────────────
export function DocBubble({ user, msg, onOpen }) {
  const { t, formatNumber } = useTranslation();
  const d = msg.doc || {};
  const { icon: KindIcon, tint } = visualFor(d.kind);
  return (
    <button onClick={() => onOpen?.(msg)} disabled={!onOpen} aria-label={t('docs.openNamed', { name: d.name })}
      style={{ all: 'unset', cursor: onOpen ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: 8, width: 220, maxWidth: '100%' }}>
      <div style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
        <FolderOpen size={12} aria-hidden="true" />{t('docs.bubbleShared')}
      </div>
      {user && d.id && <DocCover user={user} doc={d} height={96} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <KindIcon size={15} color={tint} aria-hidden="true" style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '.8rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
          <div style={{ fontSize: '.62rem', color: 'var(--text-muted)' }}>
            {formatBytes(d.size || 0, formatNumber, byteUnits(t))} · <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{t('docs.open')}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Group library ────────────────────────────────────────────────────────────
export function GroupDocsPanel({ user, group, onClose, onShareNew }) {
  const { t } = useTranslation();
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [viewer, setViewer] = useState(null);

  useEffect(() => {
    let alive = true;
    listGroupDocs(user, group.id)
      .then(data => { if (alive) setDocs(data.docs); })
      .catch(e => { if (alive) { setDocs([]); setError(docErrorKey(e.code)); } });
    return () => { alive = false; };
  }, [user, group.id]);

  async function unshare(doc) {
    try {
      await unshareDocFromGroup(user, doc.id, group.id);
      setDocs(list => list.filter(d => d.id !== doc.id));
    } catch (e) { setError(docErrorKey(e.code)); }
  }

  return (
    <>
      <Sheet label={t('docs.groupDocsTitle')} onClose={onClose}>
        <SheetHeader icon={FolderOpen} title={t('docs.groupDocsTitle')} subtitle={group.name} onClose={onClose} />
        {docs === null ? (
          <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', padding: 12 }}>{t('common.loading')}</div>
        ) : docs.length === 0 ? (
          <EmptyState icon={FolderOpen} title={t('docs.groupDocsEmpty')} description={t('docs.groupDocsEmptyText')}
            action={<Button variant="primary" icon={Share2} onClick={onShareNew}>{t('docs.pickerTitle')}</Button>} />
        ) : (
          <>
            <div style={grid}>
              <AnimatePresence>
                {docs.map((d, i) => (
                  <DocTile key={d.id} user={user} doc={d} onClick={() => setViewer(i)}
                    footer={(d.sharedByMe || d.mine) && (
                      <button onClick={() => unshare(d)}
                        style={{ marginTop: 4, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
                          fontSize: '.62rem', display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0 }}>
                        <Trash2 size={11} aria-hidden="true" />{t('docs.unshare')}
                      </button>
                    )} />
                ))}
              </AnimatePresence>
            </div>
            <Button variant="secondary" icon={Share2} onClick={onShareNew} style={{ alignSelf: 'flex-start' }}>{t('docs.pickerTitle')}</Button>
          </>
        )}
        {error && <div role="alert" style={{ fontSize: '.74rem', color: 'var(--danger)' }}>{t(error)}</div>}
      </Sheet>
      <AnimatePresence>
        {viewer !== null && docs?.[viewer] && (
          <DocViewer user={user} docs={docs} index={viewer} onIndexChange={setViewer} onClose={() => setViewer(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

// ── Picker: share into the group ─────────────────────────────────────────────
export function GroupDocPicker({ user, groupId, onPick, onClose }) {
  const { t, formatNumber } = useTranslation();
  const [docs, setDocs] = useState(null);
  const [usage, setUsage] = useState(null);
  const [upload, setUpload] = useState(null); // { name, progress } while sending
  const [busy, setBusy] = useState(null);     // doc id being shared
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    let alive = true;
    listMyDocs(user)
      .then(data => { if (alive) { setDocs(data.docs); setUsage(data.usage); } })
      .catch(e => { if (alive) { setDocs([]); setError(docErrorKey(e.code)); } });
    return () => { alive = false; };
  }, [user]);

  async function pick(doc) {
    setBusy(doc.id);
    setError('');
    try { await onPick(doc); onClose(); }
    catch (e) { setError(docErrorKey(e.code)); setBusy(null); }
  }

  async function uploadAndPick(file) {
    if (!file) return;
    setError('');
    setUpload({ name: file.name, progress: 0 });
    try {
      const { doc } = await uploadDocument(user, file, {}, p => setUpload({ name: file.name, progress: p }));
      setUpload(null);
      await pick(doc);
    } catch (e) {
      setUpload(null);
      setError(docErrorKey(e.code));
    }
  }

  const maxLabel = formatBytes(usage?.maxFileBytes || 0, formatNumber, byteUnits(t));

  return (
    <Sheet label={t('docs.pickerTitle')} onClose={onClose}>
      <SheetHeader icon={Share2} title={t('docs.pickerTitle')} subtitle={t('docs.pickerHint')} onClose={onClose} />

      {/* New upload */}
      {upload ? (
        <div style={{ padding: '10px 12px', borderRadius: 14, background: 'var(--bg-card)' }} aria-live="polite">
          <div style={{ fontSize: '.74rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{upload.name}</div>
          <div style={{ height: 5, borderRadius: 99, background: 'var(--border)', marginTop: 6, overflow: 'hidden' }}>
            <motion.div animate={{ width: `${Math.round(upload.progress * 100)}%` }} style={{ height: '100%', background: 'var(--accent)', borderRadius: 99 }} />
          </div>
        </div>
      ) : !usage?.storageFull && (
        <button onClick={() => inputRef.current?.click()}
          style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
            borderRadius: 14, outline: '2px dashed var(--border-strong)', outlineOffset: -2 }}>
          <CloudUpload size={20} color="var(--accent)" aria-hidden="true" />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t('docs.pickerUpload')}</span>
            <span style={{ fontSize: '.66rem', color: 'var(--text-muted)' }}>{t('docs.dropHint', { max: maxLabel })}</span>
          </span>
        </button>
      )}
      <input ref={inputRef} type="file" accept={DOC_ACCEPT} hidden
        onChange={e => { uploadAndPick(e.target.files?.[0]); e.target.value = ''; }} />

      {/* My library */}
      <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>{t('docs.pickerMine')}</div>
      {docs === null ? (
        <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{t('common.loading')}</div>
      ) : docs.length === 0 ? (
        <div style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>{t('docs.pickerEmpty')}</div>
      ) : (
        <div style={grid}>
          {docs.map(d => {
            const already = d.sharedGroups?.includes(groupId);
            return (
              <DocTile key={d.id} user={user} doc={d} dimmed={busy && busy !== d.id}
                onClick={already || busy ? undefined : () => pick(d)}
                footer={already && (
                  <div style={{ marginTop: 3, fontSize: '.6rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Check size={11} aria-hidden="true" />{t('docs.alreadyHere')}
                  </div>
                )} />
            );
          })}
        </div>
      )}
      {error && <div role="alert" style={{ fontSize: '.74rem', color: 'var(--danger)' }}>{t(error, { max: maxLabel })}</div>}
    </Sheet>
  );
}
