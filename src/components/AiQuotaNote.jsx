/**
 * AiQuotaNote — says whether an action uses the daily AI quota, and how much
 * of it is left.
 * --------------------------------------------------------------------------
 * Every AI generation (flashcards from notes or from a PDF, QCM from notes or
 * from flashcards) spends one generation of the same daily budget, and only
 * when it succeeds. Writing by hand and importing text never do.
 *
 *   <AiQuotaNote user={user} />                 an AI action: "uses 1 · X of Y left"
 *   <AiQuotaNote user={user} remaining={n} />   same, with the count the last generation returned
 *   <AiQuotaNote free />                        a non-AI action: "does not use the quota"
 *
 * The balance is read once from the worker (GET /ai/quota, free). If it
 * cannot be read, the note still says that the action uses the quota.
 */

import { useEffect, useState } from 'react';
import { Sparkles, Infinity as InfinityIcon } from 'lucide-react';
import { useTranslation } from '../i18n';
import { fetchAiQuota } from '../lib/aiFlashcards';

export default function AiQuotaNote({ user, remaining, free = false, style }) {
  const { t } = useTranslation();
  const [quota, setQuota] = useState(null); // { limit, remaining } from the worker

  useEffect(() => {
    if (free || !user) return undefined;
    let alive = true;
    fetchAiQuota(user).then(q => { if (alive) setQuota(q); });
    return () => { alive = false; };
  }, [user, free]);

  const base = { display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: '.68rem', lineHeight: 1.45, color: 'var(--text-muted)', ...style };

  if (free) {
    return (
      <div style={base}>
        <InfinityIcon size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
        <span>{t('aiQuota.free')}</span>
      </div>
    );
  }

  const left = remaining ?? quota?.remaining;
  const limit = quota?.limit;
  const empty = left === 0;
  return (
    <div style={{ ...base, color: empty ? 'var(--danger)' : base.color }} aria-live="polite">
      <Sparkles size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
      <span>
        {empty
          ? t('aiQuota.empty')
          : left === undefined
            ? t('aiQuota.uses')
            : limit
              ? t('aiQuota.usesLeftOf', { count: left, limit })
              : t('aiQuota.usesLeft', { count: left })}
      </span>
    </div>
  );
}
