import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '../i18n';
import { asset } from '../lib/assets';

/**
 * Which pages have a tutorial, and what each one is made of.
 *
 * Only the illustration and the shape live here — every sentence is in
 * `src/i18n` under the `tuto` namespace, keyed `tuto.<page>.<field>`.
 */
const TUTO_DATA = {
  planning: { img: asset('soso/Calendrier.png'), steps: 5, tip: true, success: true },
  progress: { img: asset('soso/troph%C3%A9.png'), steps: 4, tip: true, success: false },
  confidence: { img: asset('soso/id%C3%A9e2.png'), steps: 3, tip: true, success: false },
  syntheses: { img: asset('soso/flash%20card.png'), steps: 3, tip: false, success: true },
  flashcards: { img: asset('soso/flash%20card.png'), steps: 4, tip: true, success: false },
  repetition: { img: asset('soso/dors.png'), steps: 3, tip: true, success: true },
  exams: { img: asset('soso/attention2.png'), steps: 3, tip: true, success: false },
  stats: { img: asset('soso/troph%C3%A9.png'), steps: 3, tip: true, success: false },
  groups: { img: asset('soso/pouce.png'), steps: 4, tip: true, success: false },
  journal: { img: asset('soso/pointe.png'), steps: 3, tip: true, success: false },
  study: { img: asset('soso/ordi.png'), steps: 4, tip: true, success: true },
  whoarewe: { img: asset('soso/pouce.png'), steps: 3, tip: false, success: true },
};

export function TutoModal({ page, onClose }) {
  const { t } = useTranslation();
  const data = page ? TUTO_DATA[page] : null;
  // Every sentence is looked up under `tuto.<page>.…`.
  const tx = suffix => t(`tuto.${page}.${suffix}`);

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={e => e.target === e.currentTarget && onClose()}
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,.75)', backdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1rem',
          }}>
          <motion.div
            initial={{ scale: .92, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: .92, y: 20 }}
            style={{
              background: 'var(--bg-modal)', border: '1px solid var(--border-strong)',
              borderRadius: 20, padding: '1.5rem',
              width: 540, maxWidth: '100%', maxHeight: '88vh', overflowY: 'auto',
              display: 'flex', flexDirection: 'column', gap: 14,
              boxShadow: 'var(--card-shadow)',
            }}>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              paddingBottom: '1rem', borderBottom: '1px solid var(--border)',
            }}>
              <img
                src={data.img}
                alt=""
                onError={e => { e.target.style.display = 'none'; }}
                style={{
                  width: 80, height: 80, objectFit: 'contain',
                  flexShrink: 0, borderRadius: 12,
                  filter: 'drop-shadow(0 4px 12px rgba(0,0,0,.3))',
                }}
              />
              <div>
                <div style={{
                  fontSize: '.62rem', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '.1em', color: 'var(--accent)', marginBottom: 3,
                }}>
                  {t('tuto.label')}
                </div>
                <div style={{ fontSize: '.98rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {tx('title')}
                </div>
                <div style={{ fontSize: '.78rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {tx('intro')}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{
                fontSize: '.62rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '.08em', color: 'var(--text-muted)', marginBottom: 2,
              }}>
                {t('tuto.howItWorks')}
              </div>
              {Array.from({ length: data.steps }, (_, i) => i).map(i => (
                <div key={i} style={{
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  background: 'var(--bg-card)', borderRadius: 10,
                  padding: '10px 12px', borderLeft: '3px solid var(--accent)',
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: 'var(--accent)', color: '#fff',
                    fontSize: '.7rem', fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, marginTop: 1,
                  }}>
                    {i + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>
                      {tx(`s${i}.title`)}
                    </div>
                    <div style={{ fontSize: '.76rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                      {tx(`s${i}.text`)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {data.tip && (
              <div style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                background: 'rgba(241,196,15,.1)', border: '1px solid rgba(241,196,15,.2)',
                borderRadius: 10, padding: '10px 12px',
                fontSize: '.76rem', color: 'var(--text-secondary)', lineHeight: 1.6,
              }}>
                <span style={{ fontSize: '1rem', flexShrink: 0 }}>💡</span>
                <span>{tx('tip')}</span>
              </div>
            )}

            {data.success && (
              <div style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                background: 'rgba(39,174,96,.1)', border: '1px solid rgba(39,174,96,.2)',
                borderRadius: 10, padding: '10px 12px',
                fontSize: '.76rem', color: 'var(--text-secondary)', lineHeight: 1.6,
              }}>
                <span style={{ fontSize: '1rem', flexShrink: 0 }}>✅</span>
                <span>{tx('success')}</span>
              </div>
            )}

            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: .98 }}
              onClick={onClose}
              style={{
                padding: '11px', borderRadius: 12, border: 'none',
                background: 'var(--accent)', color: '#fff',
                fontSize: '.85rem', fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 4px 16px var(--accent-glow)',
              }}>
              {t('tuto.gotIt')}
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function TutoButton({ page, onClick }) {
  const { t } = useTranslation();
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: .95 }}
      onClick={() => onClick(page)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 10px', borderRadius: 20,
        border: '1px solid var(--accent)', background: 'transparent',
        color: 'var(--accent)', fontSize: '.7rem', fontWeight: 600,
        cursor: 'pointer', opacity: .8,
      }}>
      {t('tuto.label')}
    </motion.button>
  );
}

export default TutoModal;