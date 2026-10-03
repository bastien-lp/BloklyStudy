/**
 * FriendRequestAlert — an in-app alert for each new friend request.
 * --------------------------------------------------------------------------
 * Appears at the top of the screen for a request the student has not seen
 * yet (one at a time, newest first), whether it arrives while the app is
 * open or was waiting when it opened. Accept right there, or "See" to open
 * the Groups page where all the requests are listed. Dismissing marks it as
 * seen on this browser; the request itself stays pending until answered.
 *
 * Props: { user, requests, onOpen() }
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserPlus, Check, X } from 'lucide-react';
import { useTranslation } from '../i18n';
import { acceptFriendRequest } from '../lib/friends';
import { reportSaveError } from '../lib/notify';
import { Button } from './ui';

const seenKey = uid => `blokly-friendreq-seen-${uid}`;

function readSeen(uid) {
  try { return new Set(JSON.parse(localStorage.getItem(seenKey(uid)) || '[]')); } catch { return new Set(); }
}

export default function FriendRequestAlert({ user, requests, onOpen }) {
  const { t } = useTranslation();
  const [seen, setSeen] = useState(() => readSeen(user.uid));
  const [busy, setBusy] = useState(false);
  const req = requests.find(r => !seen.has(`${r.id}:${r.sentAt}`));

  function markSeen(r) {
    const next = new Set(seen).add(`${r.id}:${r.sentAt}`);
    setSeen(next);
    // Only ids still pending are worth remembering.
    const pending = new Set(requests.map(x => `${x.id}:${x.sentAt}`));
    try { localStorage.setItem(seenKey(user.uid), JSON.stringify([...next].filter(k => pending.has(k)))); } catch { /* no storage */ }
  }

  async function accept() {
    setBusy(true);
    try { await acceptFriendRequest(user, req); markSeen(req); }
    catch (e) { reportSaveError(e, 'Friend request alert — accept'); }
    setBusy(false);
  }

  return (
    <div style={{ position: 'fixed', top: 70, left: 0, right: 0, zIndex: 1150, display: 'flex', justifyContent: 'center',
      padding: '0 16px', pointerEvents: 'none' }}>
      <AnimatePresence>
        {req && (
          <motion.div key={req.id} role="status" aria-live="polite"
            initial={{ opacity: 0, y: -16, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12 }}
            transition={{ duration: .25, ease: 'easeOut' }}
            style={{ pointerEvents: 'auto', width: 420, maxWidth: '100%', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              padding: '10px 12px', borderRadius: 16, background: 'var(--bg-modal)',
              boxShadow: '0 14px 40px -12px rgba(0,0,0,.5), inset 0 0 0 1.5px var(--accent)' }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
              <UserPlus size={17} aria-hidden="true" />
            </span>
            <div style={{ flex: 1, minWidth: 150, fontSize: '.8rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
              <strong>{req.fromPseudo || '?'}</strong> {t('friendReq.wantsToAdd')}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Button size="sm" variant="primary" icon={Check} disabled={busy} onClick={accept}>{t('profile.accept')}</Button>
              <Button size="sm" variant="secondary" onClick={() => { markSeen(req); onOpen(); }}>{t('friendReq.see')}</Button>
              <button type="button" onClick={() => markSeen(req)} aria-label={t('common.close')}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 2 }}>
                <X size={15} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
