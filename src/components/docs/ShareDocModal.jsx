/**
 * ShareDocModal — share one of my documents with any of my groups.
 * --------------------------------------------------------------------------
 * Each group row toggles: sharing registers the share with the worker (which
 * checks I am a member) and posts a 'doc' message in the group chat;
 * un-sharing removes access. The chat message stays but its bubble then shows
 * "no longer available" — the worker is the only gatekeeper.
 *
 * Props: { user, doc, pseudo, onClose, onChange(groupId, shared) }
 */

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Check, Users, X } from 'lucide-react';
import { db } from '../../firebase/config';
import { useTranslation } from '../../i18n';
import { shareDocToGroup, unshareDocFromGroup } from '../../lib/docs';
import { postDocMessage } from '../../lib/groupDocMessage';
import { Button, EmptyState } from '../ui';
import DocCover from './DocCover';
import { docErrorKey } from './docErrors';

export default function ShareDocModal({ user, doc, pseudo, onClose, onChange }) {
  const { t } = useTranslation();
  const [groups, setGroups] = useState(null);
  const [busy, setBusy] = useState(null);   // groupId being updated
  const [error, setError] = useState('');
  const shared = new Set(doc.sharedGroups || []);

  useEffect(() => {
    let alive = true;
    getDocs(query(collection(db, 'groups'), where('memberIds', 'array-contains', user.uid)))
      .then(snap => {
        if (!alive) return;
        setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      })
      .catch(() => { if (alive) setGroups([]); });
    return () => { alive = false; };
  }, [user.uid]);

  async function toggle(group) {
    setBusy(group.id);
    setError('');
    try {
      if (shared.has(group.id)) {
        await unshareDocFromGroup(user, doc.id, group.id);
        onChange(group.id, false);
      } else {
        await shareDocToGroup(user, doc.id, group.id, pseudo);
        await postDocMessage(group.id, user, pseudo, doc);
        onChange(group.id, true);
      }
    } catch (e) {
      setError(docErrorKey(e.code));
    }
    setBusy(null);
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      role="dialog" aria-modal="true" aria-label={t('docs.shareTitle', { name: doc.name })}
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <motion.div initial={{ y: 16, scale: .97 }} animate={{ y: 0, scale: 1 }} transition={{ duration: .22, ease: 'easeOut' }}
        style={{ width: 420, maxWidth: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: 14,
          background: 'var(--bg-modal)', borderRadius: 22, padding: '1.3rem', boxShadow: 'var(--card-shadow)' }}>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 64 }}><DocCover user={user} doc={doc} height={52} radius={10} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('docs.shareHeading')}</div>
            <div style={{ fontSize: '.74rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
          </div>
          <button onClick={onClose} aria-label={t('docs.close')}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <p style={{ margin: 0, fontSize: '.74rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>{t('docs.shareHint')}</p>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 60 }}>
          {groups === null ? (
            <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', padding: 12 }}>{t('common.loading')}</div>
          ) : groups.length === 0 ? (
            <EmptyState icon={Users} title={t('docs.shareNoGroups')} style={{ padding: '1.5rem' }} />
          ) : groups.map(g => {
            const isShared = shared.has(g.id);
            return (
              <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 14,
                background: isShared ? 'var(--accent-subtle)' : 'var(--bg-card)', transition: 'background .2s' }}>
                <span style={{ width: 34, height: 34, borderRadius: 11, background: 'var(--bg-card-hover)', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }} aria-hidden="true">
                  {g.emoji || <Users size={16} />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                  <div style={{ fontSize: '.64rem', color: 'var(--text-muted)' }}>{t('groups.membersCount', { count: g.memberIds?.length || 1 })}</div>
                </div>
                <Button size="sm" variant={isShared ? 'ghost' : 'primary'} icon={isShared ? Check : undefined}
                  disabled={busy === g.id} onClick={() => toggle(g)}>
                  {busy === g.id ? '…' : isShared ? t('docs.shared') : t('docs.shareBtn')}
                </Button>
              </div>
            );
          })}
        </div>

        {error && <div role="alert" style={{ fontSize: '.74rem', color: 'var(--danger)' }}>{t(error)}</div>}
        {shared.size > 0 && (
          <div style={{ fontSize: '.66rem', color: 'var(--text-muted)' }}>{t('docs.unshareHint')}</div>
        )}
      </motion.div>
    </motion.div>
  );
}
