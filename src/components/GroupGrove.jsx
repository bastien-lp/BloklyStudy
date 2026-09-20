/**
 * GroupGrove — the group's shared plant of the week.
 * --------------------------------------------------------------------------
 * Opened from the group tools. Shows how much time the group has spent in LIVE
 * SESSIONS together this week, who brought it, and lets a member who did their
 * share collect the reward once the goal is reached.
 *
 * The panel states the rate, because that is the point of the feature: a
 * minute of shared focus grows the personal garden AND the grove, so it pays
 * about two and a half times what the same minute alone pays.
 *
 * It only ever READS the Realtime node and WRITES the member's own reserve
 * document (see lib/groupGrove.js). If the node cannot be read — rules not
 * published yet, offline — the panel says so plainly and nothing else in the
 * group is affected.
 *
 * Props: { user, group, onClose }
 */

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { doc, getDoc } from 'firebase/firestore';
import { Trees, X, Users, CloudOff, Sparkles } from 'lucide-react';
import { db } from '../firebase/config';
import { useTranslation } from '../i18n';
import { formatDuration } from '../lib/duration';
import { SCENE } from '../lib/gardenPalette';
import { CoinIcon, GardenBackdrop, GardenPlant } from './GardenScene';
import {
  subscribeGrove, groveState, canClaimGrove, claimGroveReward, claimKey, groveReward,
  COINS_PER_SHARED_MINUTE, GOAL_BONUS, MIN_SHARE, GOAL_PER_MEMBER,
} from '../lib/groupGrove';

export default function GroupGrove({ user, group, onClose }) {
  const { t, lang } = useTranslation();
  // `undefined` = still loading, `null` = unreadable, object = the grove.
  const [entries, setEntries] = useState(undefined);
  const [claims, setClaims] = useState({});
  const [busy, setBusy] = useState(false);
  const [justPaid, setJustPaid] = useState(0);

  useEffect(() => subscribeGrove(group.id, setEntries), [group.id]);

  // My claims live in my own reserve document; read once, then kept in step
  // locally by the claim itself.
  useEffect(() => {
    let alive = true;
    getDoc(doc(db, 'users', user.uid, 'data', 'reserve'))
      .then(snap => { if (alive) setClaims(snap.exists() ? snap.data().groveClaims || {} : {}); })
      .catch(() => {});
    return () => { alive = false; };
  }, [user.uid]);

  const memberIds = Array.isArray(group.memberIds) ? group.memberIds : Object.keys(group.members || {});
  const state = groveState(entries || {}, memberIds, user.uid);
  const claimable = entries && canClaimGrove(state, claims, group.id);
  const reward = groveReward(state.myMins);
  const alreadyClaimed = !!claims[claimKey(group.id, state.week)];
  const dur = mins => formatDuration(mins / 60, lang);

  /** Names come from the grove entry, falling back to the group's member list. */
  const nameOf = row => row.pseudo || group.members?.[row.uid]?.pseudo || t('grove.someone');

  async function collect() {
    if (busy || !claimable) return;
    setBusy(true);
    try {
      const paid = await claimGroveReward(user.uid, group.id, state.myMins);
      setClaims(c => ({ ...c, [claimKey(group.id, state.week)]: true }));
      if (paid > 0) setJustPaid(paid);
    } catch { /* the transaction failed: nothing was paid, nothing to undo */ }
    setBusy(false);
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      role="dialog" aria-modal="true" aria-label={t('grove.title')}
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <motion.div initial={{ y: 16, scale: .97 }} animate={{ y: 0, scale: 1 }} transition={{ duration: .22, ease: 'easeOut' }}
        style={{ width: 460, maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14,
          background: 'var(--bg-modal)', borderRadius: 22, padding: '1.2rem', boxShadow: 'var(--card-shadow)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 36, height: 36, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--accent-subtle)', color: SCENE.leaf }}>
            <Trees size={18} aria-hidden="true" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>{t('grove.title')}</div>
            <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {group.name}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {entries === null ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '14px', borderRadius: 14, background: 'var(--bg-card)' }}>
            <CloudOff size={16} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
            <div style={{ fontSize: '.76rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{t('grove.unavailable')}</div>
          </div>
        ) : (
          <>
            {/* The plant itself */}
            <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18, padding: '14px 10px 4px',
              background: `linear-gradient(180deg, ${SCENE.skyTop} 0%, ${SCENE.skyMid} 58%, ${SCENE.skyLow} 100%)` }}>
              <GardenBackdrop />
              <div style={{ position: 'relative', width: 150, margin: '0 auto' }}>
                <GardenPlant species="bamboo" pct={state.goal ? state.total / state.goal : 0} ripe={state.reached} />
              </div>
            </div>

            {/* Progress */}
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: '.82rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {dur(state.total)} <span style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>/ {dur(state.goal)}</span>
                </span>
                <span style={{ fontSize: '.72rem', fontWeight: 700, color: state.reached ? SCENE.leaf : 'var(--text-muted)' }}>{state.pct} %</span>
              </div>
              <div style={{ height: 10, borderRadius: 10, overflow: 'hidden', background: 'var(--bg-card-hover)' }}>
                <motion.div animate={{ width: `${state.pct}%` }} transition={{ duration: .6, ease: 'easeOut' }}
                  style={{ height: '100%', borderRadius: 10, background: `linear-gradient(90deg, ${SCENE.leafLight}, ${SCENE.leafDeep})` }} />
              </div>
              <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginTop: 7, lineHeight: 1.6 }}>
                {t('grove.rule', { each: GOAL_PER_MEMBER, members: state.memberCount, share: MIN_SHARE })}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginTop: 8, padding: '9px 11px', borderRadius: 12,
                background: 'var(--accent-subtle)' }}>
                <Sparkles size={14} aria-hidden="true" style={{ color: SCENE.leaf, flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: '.7rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  {t('grove.advantage', { rate: COINS_PER_SHARED_MINUTE, bonus: GOAL_BONUS })}
                </span>
              </div>
            </div>

            {/* Where I stand, and the reward */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '11px 13px', borderRadius: 14, background: 'var(--bg-card)' }}>
              <div style={{ flex: 1, minWidth: 150 }}>
                <div style={{ fontSize: '.76rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {t('grove.myShare', { mins: state.myMins, need: MIN_SHARE })}
                </div>
                <div style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>
                  {justPaid > 0 || alreadyClaimed ? t('grove.collected')
                    : state.reached
                      ? (state.missingForMe > 0
                        ? t('grove.needShare', { count: state.missingForMe })
                        : t('grove.readyDetail', { mins: reward.mins, rate: reward.perMinute, bonus: reward.bonus }))
                      : t('grove.keepGoing', { time: dur(Math.max(0, state.goal - state.total)) })}
                </div>
              </div>
              <motion.button type="button" whileHover={claimable ? { scale: 1.03 } : {}} whileTap={claimable ? { scale: .96 } : {}}
                onClick={collect} disabled={!claimable || busy}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 22, border: 'none',
                  cursor: claimable && !busy ? 'pointer' : 'not-allowed', opacity: claimable ? 1 : .5,
                  background: SCENE.leafDeep, color: SCENE.cream, fontSize: '.76rem', fontWeight: 800 }}>
                {alreadyClaimed || justPaid > 0
                  ? t('grove.collected')
                  : <>{t('grove.collect')} +{reward.coins} <CoinIcon size={13} /></>}
              </motion.button>
            </div>

            {/* Who brought the water */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
                <Users size={13} aria-hidden="true" />
                {t('grove.contributors')}
              </div>
              {state.contributors.length === 0 ? (
                <div style={{ fontSize: '.74rem', color: 'var(--text-muted)' }}>{t('grove.nobodyYet')}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {state.contributors.map(row => (
                    <div key={row.uid} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: '.76rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontWeight: row.uid === user.uid ? 800 : 500,
                        color: row.uid === user.uid ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        {nameOf(row)}{row.uid === user.uid ? ` ${t('grove.you')}` : ''}
                      </span>
                      <div style={{ width: 96, height: 6, borderRadius: 6, overflow: 'hidden', background: 'var(--bg-card-hover)', flexShrink: 0 }}>
                        <span style={{ display: 'block', height: '100%', borderRadius: 6, background: SCENE.leaf,
                          width: `${state.total ? Math.round((row.mins / state.total) * 100) : 0}%` }} />
                      </div>
                      <span style={{ width: 58, textAlign: 'right', fontSize: '.7rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {dur(row.mins)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ fontSize: '.66rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
              {t('grove.resets')}
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
