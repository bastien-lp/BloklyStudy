/**
 * GardenTab — the bamboo grove screen.
 * --------------------------------------------------------------------------
 * Presentation only: it receives the grove and two callbacks, and never talks
 * to Firestore. The rules it shows come from lib/bambooGarden.js, the drawing
 * from components/GardenScene.jsx.
 *
 * What a student reads here, in order: how much time is banked in the grove,
 * the grove itself (one plot per bamboo owned, the free plots dotted), what
 * cutting pays right now, and which subjects fed it.
 *
 * Props:
 *   garden    { pool, slots, by }
 *   species   what to draw, from the preferences (personalisation panel)
 *   subjects  the main document's subjects (names and colours of the tints)
 *   coins     current balance, to know whether a plot can be bought
 *   onCut()   cut the whole grove
 *   onBuyPlot() buy the next bamboo
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scissors, Sprout, Plus, Lock } from 'lucide-react';
import { useTranslation } from '../i18n';
import {
  MINUTES_PER_BAMBOO, MAX_SLOTS, COINS_PER_MINUTE, FULL_BONUS,
  gardenState, cutValue, contributions, nextSlotPrice,
} from '../lib/bambooGarden';
import { SCENE } from '../lib/gardenPalette';
import { CoinIcon, GardenBackdrop, GardenPlant, EmptyPlot } from './GardenScene';

/** The wooden sign under each plot. */
function PlotSign({ children, tone = SCENE.cream }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 9,
      background: `linear-gradient(180deg, ${SCENE.barkLight}, ${SCENE.bark})`,
      boxShadow: '0 2px 6px rgba(62,42,26,.28), inset 0 1px 0 rgba(255,236,205,.28)',
      color: tone, fontSize: '.72rem', fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {children}
    </div>
  );
}

export default function GardenTab({ garden, subjects = [], coins = 0, species = 'bamboo', onCut, onBuyPlot }) {
  const { t } = useTranslation();
  const [fx, setFx] = useState(null);           // the coins that fly off after a cut

  const state = gardenState(garden.pool, garden.slots);
  const value = cutValue(garden.pool, garden.slots);
  const fed = contributions(garden.by, subjects);
  const tints = fed.map(c => c.color).filter(Boolean);
  const price = nextSlotPrice(garden.slots);
  const canBuy = price != null && coins >= price;
  const freePlots = MAX_SLOTS - state.plants.length;

  function cut() {
    if (garden.pool <= 0) return;
    setFx({ coins: value.coins, bonus: value.bonus, ripe: value.ripeCount });
    setTimeout(() => setFx(null), 1700);
    onCut();
  }

  return (
    <motion.div key="garden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── How the grove works, and how to make it bigger ── */}
      <div data-tour="tour-home-slots" style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '11px 14px', borderRadius: 14, background: 'var(--bg-card)',
      }}>
        <Sprout size={18} strokeWidth={2} color={SCENE.leaf} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {t('garden.plots', { count: garden.slots })}
          </div>
          <div style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>
            {t('garden.howTo', { minutes: MINUTES_PER_BAMBOO, coins: COINS_PER_MINUTE })}
          </div>
        </div>
        {price != null ? (
          <motion.button type="button" whileHover={canBuy ? { scale: 1.03 } : {}} whileTap={canBuy ? { scale: .96 } : {}}
            onClick={() => canBuy && onBuyPlot()} disabled={!canBuy}
            title={canBuy ? t('garden.buyPlot') : t('garden.needCoins', { count: price - coins })}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 20,
              border: 'none', cursor: canBuy ? 'pointer' : 'not-allowed', opacity: canBuy ? 1 : .55,
              background: SCENE.leafDeep, color: SCENE.cream, fontSize: '.75rem', fontWeight: 700,
            }}>
            <Plus size={14} strokeWidth={2.4} />
            {t('garden.buyPlot')}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, opacity: .92 }}>
              · {price} <CoinIcon size={13} />
            </span>
          </motion.button>
        ) : (
          <span style={{ fontSize: '.72rem', fontWeight: 700, color: SCENE.leaf }}>{t('garden.plotsMax')}</span>
        )}
      </div>

      {/* ── The grove ── */}
      <div data-tour="tour-home-garden" style={{
        position: 'relative', overflow: 'hidden', borderRadius: 22, padding: '22px 16px 12px',
        background: `linear-gradient(180deg, ${SCENE.skyTop} 0%, ${SCENE.skyMid} 56%, ${SCENE.skyLow} 100%)`,
        boxShadow: 'inset 0 -40px 60px -40px rgba(126,88,51,.5)',
      }}>
        <GardenBackdrop />

        {/* coins flying off after a cut */}
        <AnimatePresence>
          {fx && (
            <motion.div initial={{ opacity: 0, y: 20, scale: .7 }} animate={{ opacity: 1, y: -18, scale: 1.05 }}
              exit={{ opacity: 0, y: -60 }} transition={{ duration: .5, ease: 'easeOut' }}
              style={{
                position: 'absolute', top: '38%', left: 0, right: 0, zIndex: 5, pointerEvents: 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
              }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 22,
                background: SCENE.cream, color: '#8A5E18', fontWeight: 900, fontSize: '1rem',
                boxShadow: '0 6px 18px rgba(126,88,51,.35)',
              }}>
                +{fx.coins} <CoinIcon size={17} />
              </span>
              {fx.bonus > 0 && (
                <span style={{ fontSize: '.68rem', fontWeight: 800, color: SCENE.leafDeep }}>
                  {t('garden.bonusEarned', { count: fx.ripe, coins: fx.bonus })}
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* the plots, side by side on the same ground */}
        <div style={{
          position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          gap: 4, flexWrap: 'wrap',
        }}>
          {state.plants.map(plant => (
            <div key={plant.index} style={{ width: 168, maxWidth: '33%', minWidth: 104, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <GardenPlant species={species} pct={plant.pct} ripe={plant.ripe} tints={tints} />
              <PlotSign tone={plant.ripe ? '#FFE6A8' : SCENE.cream}>
                {plant.ripe ? t('garden.ripe') : t('garden.minutesOf', { mins: plant.mins, total: MINUTES_PER_BAMBOO })}
              </PlotSign>
            </div>
          ))}

          {Array.from({ length: freePlots }, (_, i) => {
            const isNext = i === 0 && price != null;
            return (
              <div key={`free${i}`} style={{ width: 168, maxWidth: '33%', minWidth: 104, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: isNext ? .95 : .6 }}>
                <button type="button" onClick={() => isNext && canBuy && onBuyPlot()} disabled={!isNext || !canBuy}
                  aria-label={t('garden.buyPlot')}
                  style={{ all: 'unset', width: '100%', cursor: isNext && canBuy ? 'pointer' : 'default' }}>
                  <EmptyPlot />
                </button>
                <PlotSign tone="rgba(251,244,231,.85)">
                  {isNext ? (
                    <>
                      <Plus size={12} strokeWidth={2.6} />
                      {price} <CoinIcon size={12} />
                    </>
                  ) : (
                    <><Lock size={11} strokeWidth={2.4} /> {t('garden.plotFree')}</>
                  )}
                </PlotSign>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Cutting ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '12px 14px', borderRadius: 14, background: 'var(--bg-card)' }}>
        <div style={{ flex: 1, minWidth: 190 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
            <span style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {t('garden.banked', { mins: garden.pool, total: state.capacity })}
            </span>
            <span style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>
              {t('garden.ripeCount', { count: state.ripeCount })}
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 10, overflow: 'hidden', background: 'rgba(126,88,51,.18)' }}>
            <motion.div animate={{ width: `${Math.min(100, (garden.pool / state.capacity) * 100)}%` }}
              transition={{ duration: .6, ease: 'easeOut' }}
              style={{ height: '100%', borderRadius: 10, background: `linear-gradient(90deg, ${SCENE.leafLight}, ${SCENE.leafDeep})` }} />
          </div>
          <div style={{ fontSize: '.66rem', color: 'var(--text-muted)', marginTop: 6 }}>
            {state.full
              ? t('garden.grovefull')
              : t('garden.bonusLadder', { one: FULL_BONUS[1], two: FULL_BONUS[2], three: FULL_BONUS[3] })}
            {state.overflow > 0 && ` · ${t('garden.overflow', { mins: state.overflow })}`}
          </div>
        </div>

        <motion.button type="button" whileHover={garden.pool > 0 ? { scale: 1.03 } : {}} whileTap={garden.pool > 0 ? { scale: .96 } : {}}
          onClick={cut} disabled={garden.pool <= 0}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 24,
            border: 'none', cursor: garden.pool > 0 ? 'pointer' : 'not-allowed', opacity: garden.pool > 0 ? 1 : .5,
            background: SCENE.leafDeep, color: SCENE.cream, fontSize: '.82rem', fontWeight: 800,
            boxShadow: garden.pool > 0 ? '0 6px 16px -6px rgba(47,82,35,.6)' : 'none',
          }}>
          <Scissors size={16} strokeWidth={2.2} />
          {garden.pool > 0 ? t('garden.cut') : t('garden.nothingToCut')}
          {garden.pool > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, opacity: .92 }}>
              · {value.coins} <CoinIcon size={14} />
            </span>
          )}
        </motion.button>
      </div>

      {/* ── Who fed the grove ── */}
      {fed.length > 0 && (
        <div style={{ padding: '11px 14px', borderRadius: 14, background: 'var(--bg-card)' }}>
          <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>{t('garden.fedBy')}</div>
          <div style={{ display: 'flex', height: 8, borderRadius: 10, overflow: 'hidden', background: 'rgba(126,88,51,.14)' }}>
            {fed.map(c => (
              <motion.span key={c.id} initial={{ width: 0 }} animate={{ width: `${c.share * 100}%` }}
                transition={{ duration: .5, ease: 'easeOut' }}
                style={{ height: '100%', background: c.color || SCENE.leaf }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
            {fed.map(c => (
              <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.7rem', color: 'var(--text-secondary)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color || SCENE.leaf }} />
                {c.name || t('garden.otherSubject')}
                <strong style={{ color: 'var(--text-primary)' }}>{c.mins} min</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── First time here ── */}
      {garden.pool === 0 && fed.length === 0 && (
        <div style={{ textAlign: 'center', fontSize: '.76rem', color: 'var(--text-muted)', lineHeight: 1.6, padding: '0 10px' }}>
          {t('garden.emptyText')}
        </div>
      )}
    </motion.div>
  );
}
