/**
 * GardenStyleTab — "Personnalisation": what grows in the garden.
 * --------------------------------------------------------------------------
 * Presentation only. Each species is shown as it will actually look, fully
 * grown, so the choice is made on the drawing and not on a name. Picking one
 * that is already owned plants it at once; picking one that is not offers it
 * at its price. The rules of the garden never change with the species — the
 * card says so, because a cosmetic purchase must never look like a shortcut.
 *
 * Props:
 *   garden   { plant, owned, ... }
 *   coins    current balance
 *   onSelect(id)  plant a species already owned
 *   onBuy(id)     buy it, then plant it
 */

import { motion } from 'motion/react';
import { Check, Lock, Palette } from 'lucide-react';
import { useTranslation } from '../i18n';
import { PLANT_SPECIES, speciesPrice } from '../lib/plantSpecies';
import { SCENE } from '../lib/gardenPalette';
import { CoinIcon, GardenPlant, GardenBackdrop } from './GardenScene';

export default function GardenStyleTab({ garden, coins = 0, onSelect, onBuy }) {
  const { t } = useTranslation();
  const owned = garden.owned || ['bamboo'];

  return (
    <motion.div key="style" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 14, background: 'var(--bg-card)' }}>
        <Palette size={18} strokeWidth={2} color={SCENE.leaf} style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t('garden.styleTitle')}</div>
          <div style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>{t('garden.styleHint')}</div>
        </div>
      </div>

      <div className="garden-style-grid" style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12,
      }}>
        {PLANT_SPECIES.map(species => {
          const isOwned = owned.includes(species.id);
          const active = garden.plant === species.id;
          const price = speciesPrice(species.id, owned);
          const affordable = coins >= price;
          const disabled = !isOwned && !affordable;

          return (
            <motion.button key={species.id} type="button"
              whileHover={disabled ? {} : { y: -3 }} whileTap={disabled ? {} : { scale: .98 }}
              onClick={() => { if (isOwned) onSelect(species.id); else if (affordable) onBuy(species.id); }}
              disabled={disabled}
              aria-pressed={active}
              style={{
                position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                padding: '10px 10px 12px', borderRadius: 18, overflow: 'hidden', cursor: disabled ? 'not-allowed' : 'pointer',
                border: `2px solid ${active ? SCENE.leafDeep : 'transparent'}`,
                background: `linear-gradient(180deg, ${SCENE.skyTop} 0%, ${SCENE.skyMid} 60%, ${SCENE.skyLow} 100%)`,
                opacity: disabled ? .62 : 1,
                boxShadow: active ? '0 8px 20px -12px rgba(47,82,35,.8)' : '0 2px 10px -8px rgba(62,42,26,.6)',
              }}>
              <GardenBackdrop />

              {active && (
                <span style={{
                  position: 'absolute', top: 8, right: 8, zIndex: 2, width: 22, height: 22, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: SCENE.leafDeep, color: SCENE.cream,
                }}>
                  <Check size={13} strokeWidth={3} />
                </span>
              )}

              <div style={{ position: 'relative', width: '76%', pointerEvents: 'none' }}>
                {/* shown fully grown and still: this is a portrait, not a plot */}
                <GardenPlant species={species.id} pct={1} idle={false} />
              </div>

              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 9,
                background: `linear-gradient(180deg, ${SCENE.barkLight}, ${SCENE.bark})`,
                boxShadow: '0 2px 6px rgba(62,42,26,.28), inset 0 1px 0 rgba(255,236,205,.28)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: species.swatch, flexShrink: 0,
                  boxShadow: '0 0 0 2px rgba(255,244,231,.35)' }} />
                <span style={{ fontSize: '.76rem', fontWeight: 700, color: SCENE.cream, whiteSpace: 'nowrap' }}>
                  {t(`garden.species_${species.id}`)}
                </span>
              </div>

              <span style={{ position: 'relative', fontSize: '.7rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5,
                color: active ? SCENE.leafDeep : isOwned ? SCENE.inkSoft : affordable ? '#8A5E18' : SCENE.inkSoft }}>
                {active ? t('garden.planted')
                  : isOwned ? t('garden.plantThis')
                    : affordable ? <>{t('garden.buyFor')} {price} <CoinIcon size={13} /></>
                      : <><Lock size={11} strokeWidth={2.4} /> {price} <CoinIcon size={13} /></>}
              </span>
            </motion.button>
          );
        })}
      </div>

      <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6, padding: '0 10px' }}>
        {t('garden.styleFooter')}
      </div>
    </motion.div>
  );
}
