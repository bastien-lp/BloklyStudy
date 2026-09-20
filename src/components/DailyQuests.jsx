/**
 * DailyQuests — the three goals of the day, above the garden.
 * --------------------------------------------------------------------------
 * Presentation only: the list, the progress and what can be claimed all come
 * from lib/dailyQuests.js, and the claim itself is the page's job.
 *
 * A quest that is done but not claimed is the loud one: that is the whole
 * point of the card, and the coins are collected on purpose rather than
 * trickling in unnoticed.
 *
 * Props: { state, onClaim(id), busyId }
 */

import { motion, AnimatePresence } from 'motion/react';
import { Check, ListChecks } from 'lucide-react';
import { useTranslation } from '../i18n';
import { SCENE } from '../lib/gardenPalette';
import { CoinIcon } from './GardenScene';

export default function DailyQuests({ state, onClaim, busyId }) {
  const { t } = useTranslation();
  const done = state.quests.filter(q => q.done).length;

  return (
    <div style={{ padding: '12px 14px', borderRadius: 14, background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <ListChecks size={18} strokeWidth={2} color={SCENE.leaf} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t('quests.title')}</div>
          <div style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>
            {state.allDone ? t('quests.allDone') : t('quests.progress', { done, total: state.quests.length })}
          </div>
        </div>
        {state.claimable > 0 && (
          <motion.span initial={{ scale: .8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 11px', borderRadius: 20,
              background: 'rgba(233,180,76,.18)', color: '#8A5E18', fontSize: '.72rem', fontWeight: 800 }}>
            +{state.claimable} <CoinIcon size={13} />
          </motion.span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {state.quests.map(quest => {
          const pct = Math.min(100, (quest.current / quest.goal) * 100);
          return (
            <div key={quest.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span aria-hidden="true" style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: quest.done ? SCENE.leafDeep : 'var(--bg-card-hover)',
                color: SCENE.cream,
              }}>
                {quest.done && <Check size={12} strokeWidth={3} />}
              </span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: '.74rem', fontWeight: 600, color: quest.claimed ? 'var(--text-muted)' : 'var(--text-primary)',
                    textDecoration: quest.claimed ? 'line-through' : 'none' }}>
                    {t(`quests.q_${quest.id}`, { goal: quest.goal })}
                  </span>
                  <span style={{ fontSize: '.66rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {quest.current}/{quest.goal}
                  </span>
                </div>
                <div style={{ height: 5, borderRadius: 6, marginTop: 4, overflow: 'hidden', background: 'rgba(126,88,51,.16)' }}>
                  <motion.div animate={{ width: `${pct}%` }} transition={{ duration: .5, ease: 'easeOut' }}
                    style={{ height: '100%', borderRadius: 6, background: quest.done ? SCENE.leafDeep : SCENE.leafLight }} />
                </div>
              </div>

              <div style={{ width: 92, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
                <AnimatePresence mode="wait" initial={false}>
                  {quest.claimed ? (
                    <motion.span key="claimed" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      style={{ fontSize: '.66rem', fontWeight: 700, color: SCENE.leaf }}>
                      {t('quests.claimed')}
                    </motion.span>
                  ) : quest.claimable ? (
                    <motion.button key="claim" type="button" onClick={() => onClaim(quest.id)} disabled={busyId === quest.id}
                      initial={{ opacity: 0, scale: .9 }} animate={{ opacity: 1, scale: 1 }}
                      whileHover={{ scale: 1.04 }} whileTap={{ scale: .95 }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 18,
                        border: 'none', cursor: 'pointer', background: SCENE.leafDeep, color: SCENE.cream,
                        fontSize: '.7rem', fontWeight: 800, opacity: busyId === quest.id ? .6 : 1 }}>
                      +{quest.coins} <CoinIcon size={12} />
                    </motion.button>
                  ) : (
                    <motion.span key="reward" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.66rem', color: 'var(--text-muted)' }}>
                      +{quest.coins} <CoinIcon size={11} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
