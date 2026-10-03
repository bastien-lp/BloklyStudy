/**
 * FriendRequestsCard — the pending friend requests, where friends live.
 * --------------------------------------------------------------------------
 * Requests used to wait in a tab of the Profile page that nobody knew about.
 * This card sits at the top of the Groups page as soon as one arrives, with
 * Accept / Decline right there, and disappears when there is none.
 * Writes go through lib/friends.js (same documents as before).
 *
 * Props: { user, requests? }  — pass the list if the parent already watches it.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserPlus, Check, X } from 'lucide-react';
import { useTranslation } from '../i18n';
import { subscribeFriendRequests, acceptFriendRequest, declineFriendRequest } from '../lib/friends';
import { reportSaveError } from '../lib/notify';
import { Button } from './ui';

export default function FriendRequestsCard({ user }) {
  const { t, formatDate } = useTranslation();
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState(null); // id of the request being handled

  useEffect(() => (user ? subscribeFriendRequests(user, setRequests) : undefined), [user]);

  async function handle(req, accept) {
    setBusy(req.id);
    try {
      if (accept) await acceptFriendRequest(user, req);
      else await declineFriendRequest(user, req.id);
    } catch (e) {
      reportSaveError(e, accept ? 'Groups — accept request' : 'Groups — decline request');
    }
    setBusy(null);
  }

  return (
    <AnimatePresence>
      {requests.length > 0 && (
        <motion.section initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          aria-labelledby="friend-requests-title"
          style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 16,
            background: 'var(--accent-subtle)', boxShadow: 'inset 0 0 0 1.5px var(--accent)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserPlus size={17} color="var(--accent)" aria-hidden="true" />
            <h2 id="friend-requests-title" style={{ margin: 0, fontSize: '.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {t('friendReq.title', { count: requests.length })}
            </h2>
          </div>
          {requests.map(req => {
            const color = `hsl(${(req.from?.charCodeAt(0) * 47 || 0) % 360},60%,50%)`;
            return (
              <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                padding: '8px 10px', borderRadius: 12, background: 'var(--bg-card)' }}>
                <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', background: color, color: '#fff', fontWeight: 800, fontSize: '.9rem' }}>
                  {(req.fromPseudo || '?')[0].toUpperCase()}
                </span>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>{req.fromPseudo || '?'}</div>
                  <div style={{ fontSize: '.66rem', color: 'var(--text-muted)' }}>
                    {t('friendReq.wantsToAdd')}{req.sentAt ? ` · ${formatDate(req.sentAt, { day: 'numeric', month: 'short' })}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button size="sm" variant="primary" icon={Check} disabled={busy === req.id} onClick={() => handle(req, true)}>
                    {t('profile.accept')}
                  </Button>
                  <Button size="sm" variant="ghost" icon={X} disabled={busy === req.id} onClick={() => handle(req, false)}
                    aria-label={t('friendReq.decline')}>
                    {t('friendReq.decline')}
                  </Button>
                </div>
              </div>
            );
          })}
        </motion.section>
      )}
    </AnimatePresence>
  );
}
