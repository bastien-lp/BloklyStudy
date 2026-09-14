import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HelpCircle } from 'lucide-react';
import { useTranslation } from '../i18n';
import { asset } from '../lib/assets';

// ── TOUTES LES ÉTAPES PAR PAGE ──
export const TOUR_STEPS = {

  planning: [
    {
      target: 'tour-planning-view',
      titleKey: 'tour.planning.s0.title',
      textKey: 'tour.planning.s0.text',
      position: 'bottom',
      mascot: asset('soso/Calendrier.png'),
    },
    {
      target: 'tour-planning-nav',
      titleKey: 'tour.planning.s1.title',
      textKey: 'tour.planning.s1.text',
      position: 'bottom',
      mascot: asset('soso/Calendrier.png'),
    },
    {
      target: 'tour-planning-tools',
      titleKey: 'tour.planning.s2.title',
      textKey: 'tour.planning.s2.text',
      position: 'bottom',
      mascot: asset('soso/ordi.png'),
    },
    {
      target: 'tour-planning-sidebar',
      titleKey: 'tour.planning.s3.title',
      textKey: 'tour.planning.s3.text',
      position: 'right',
      mascot: asset('soso/pointe.png'),
    },
    {
      target: 'tour-planning-grid',
      titleKey: 'tour.planning.s4.title',
      textKey: 'tour.planning.s4.text',
      position: 'left',
      mascot: asset('soso/ordi.png'),
    },
    {
      target: 'tour-planning-charge',
      titleKey: 'tour.planning.s5.title',
      textKey: 'tour.planning.s5.text',
      position: 'top',
      mascot: asset('soso/attention2.png'),
    },
  ],

  progress: [
    {
      target: 'tour-progress-score',
      titleKey: 'tour.progress.s0.title',
      textKey: 'tour.progress.s0.text',
      position: 'bottom',
      mascot: asset('soso/troph%C3%A9.png'),
    },
    {
      target: 'tour-progress-week',
      titleKey: 'tour.progress.s1.title',
      textKey: 'tour.progress.s1.text',
      position: 'bottom',
      mascot: asset('soso/Calendrier.png'),
    },
    {
      target: 'tour-progress-pie',
      titleKey: 'tour.progress.s2.title',
      textKey: 'tour.progress.s2.text',
      position: 'bottom',
      mascot: asset('soso/id%C3%A9e2.png'),
    },
    {
      target: 'tour-progress-agenda',
      titleKey: 'tour.progress.s3.title',
      textKey: 'tour.progress.s3.text',
      position: 'left',
      mascot: asset('soso/pointe.png'),
    },
  ],

  confidence: [
    {
      target: 'tour-confidence-filters',
      titleKey: 'tour.confidence.s0.title',
      textKey: 'tour.confidence.s0.text',
      position: 'bottom',
      mascot: asset('soso/pointe.png'),
    },
    {
      target: 'tour-confidence-card',
      titleKey: 'tour.confidence.s1.title',
      textKey: 'tour.confidence.s1.text',
      position: 'bottom',
      mascot: asset('soso/id%C3%A9e2.png'),
    },
    {
      target: 'tour-confidence-score',
      titleKey: 'tour.confidence.s2.title',
      textKey: 'tour.confidence.s2.text',
      position: 'top',
      mascot: asset('soso/troph%C3%A9.png'),
    },
  ],

  flashcards: [
    {
      target: 'tour-flash-tabs',
      titleKey: 'tour.flashcards.s0.title',
      textKey: 'tour.flashcards.s0.text',
      position: 'bottom',
      mascot: asset('soso/flash%20card.png'),
    },
    {
      target: 'tour-flash-subjects',
      titleKey: 'tour.flashcards.s1.title',
      textKey: 'tour.flashcards.s1.text',
      position: 'bottom',
      mascot: asset('soso/ordi.png'),
    },
    {
      target: 'tour-flash-decks',
      titleKey: 'tour.flashcards.s2.title',
      textKey: 'tour.flashcards.s2.text',
      position: 'top',
      mascot: asset('soso/id%C3%A9e2.png'),
    },
  ],


  repetition: [
    {
      target: 'tour-rep-due',
      titleKey: 'tour.repetition.s0.title',
      textKey: 'tour.repetition.s0.text',
      position: 'bottom',
      mascot: asset('soso/dors.png'),
    },
    {
      target: 'tour-rep-mark',
      titleKey: 'tour.repetition.s1.title',
      textKey: 'tour.repetition.s1.text',
      position: 'bottom',
      mascot: asset('soso/pointe.png'),
    },
    {
      target: 'tour-rep-list',
      titleKey: 'tour.repetition.s2.title',
      textKey: 'tour.repetition.s2.text',
      position: 'top',
      mascot: asset('soso/attention2.png'),
    },
  ],

  exams: [
    {
      target: 'tour-exams-cards',
      titleKey: 'tour.exams.s0.title',
      textKey: 'tour.exams.s0.text',
      position: 'bottom',
      mascot: asset('soso/attention2.png'),
    },
    {
      target: 'tour-exams-summary',
      titleKey: 'tour.exams.s1.title',
      textKey: 'tour.exams.s1.text',
      position: 'bottom',
      mascot: asset('soso/troph%C3%A9.png'),
    },
    {
      target: 'tour-exams-epreuves',
      titleKey: 'tour.exams.s2.title',
      textKey: 'tour.exams.s2.text',
      position: 'top',
      mascot: asset('soso/id%C3%A9e2.png'),
    },
  ],

  stats: [
    {
      target: 'tour-stats-xp',
      titleKey: 'tour.stats.s0.title',
      textKey: 'tour.stats.s0.text',
      position: 'bottom',
      mascot: asset('soso/troph%C3%A9.png'),
    },
    {
      target: 'tour-stats-badges',
      titleKey: 'tour.stats.s1.title',
      textKey: 'tour.stats.s1.text',
      position: 'bottom',
      mascot: asset('soso/pouce.png'),
    },
    {
      target: 'tour-stats-ranking',
      titleKey: 'tour.stats.s2.title',
      textKey: 'tour.stats.s2.text',
      position: 'top',
      mascot: asset('soso/ordi.png'),
    },
  ],

  journal: [
    {
      target: 'tour-journal-form',
      titleKey: 'tour.journal.s0.title',
      textKey: 'tour.journal.s0.text',
      position: 'bottom',
      mascot: asset('soso/pointe.png'),
    },
    {
      target: 'tour-journal-entries',
      titleKey: 'tour.journal.s1.title',
      textKey: 'tour.journal.s1.text',
      position: 'top',
      mascot: asset('soso/id%C3%A9e2.png'),
    },
  ],

  study: [
    {
      target: 'tour-study-selector',
      titleKey: 'tour.study.s0.title',
      textKey: 'tour.study.s0.text',
      position: 'bottom',
      mascot: asset('soso/ordi.png'),
    },
    {
      target: 'tour-study-timer',
      titleKey: 'tour.study.s1.title',
      textKey: 'tour.study.s1.text',
      position: 'bottom',
      mascot: asset('soso/dors.png'),
    },
    {
      target: 'tour-study-sounds',
      titleKey: 'tour.study.s2.title',
      textKey: 'tour.study.s2.text',
      position: 'top',
      mascot: asset('soso/id%C3%A9e2.png'),
    },
    {
      target: 'tour-study-ring',
      titleKey: 'tour.study.s3.title',
      textKey: 'tour.study.s3.text',
      position: 'bottom',
      mascot: asset('soso/pouce.png'),
    },
  ],

  whoarewe: [
    {
      target: 'tour-about-intro',
      titleKey: 'tour.whoarewe.s0.title',
      textKey: 'tour.whoarewe.s0.text',
      position: 'bottom',
      mascot: asset('soso/pouce.png'),
    },
    {
      target: 'tour-about-contact',
      titleKey: 'tour.whoarewe.s1.title',
      textKey: 'tour.whoarewe.s1.text',
      position: 'top',
      mascot: asset('soso/pointe.png'),
    },
  ],

  groups: [
    {
      target: 'tour-groups-join',
      titleKey: 'tour.groups.s0.title',
      textKey: 'tour.groups.s0.text',
      position: 'bottom',
      mascot: asset('soso/pointe.png'),
    },
    {
      target: 'tour-groups-create',
      titleKey: 'tour.groups.s1.title',
      textKey: 'tour.groups.s1.text',
      position: 'bottom',
      mascot: asset('soso/id%C3%A9e2.png'),
    },
    {
      target: 'tour-groups-list',
      titleKey: 'tour.groups.s2.title',
      textKey: 'tour.groups.s2.text',
      position: 'top',
      mascot: asset('soso/pouce.png'),
    },
  ],

  home: [
    {
      target: 'tour-home-coins',
      titleKey: 'tour.home.s0.title',
      textKey: 'tour.home.s0.text',
      position: 'bottom',
      mascot: asset('soso/troph%C3%A9.png'),
    },
    {
      target: 'tour-home-tabs',
      titleKey: 'tour.home.s1.title',
      textKey: 'tour.home.s1.text',
      position: 'bottom',
      mascot: asset('soso/pointe.png'),
    },
    {
      target: 'tour-home-garden',
      titleKey: 'tour.home.s2.title',
      textKey: 'tour.home.s2.text',
      position: 'top',
      mascot: asset('soso/id%C3%A9e2.png'),
    },
    {
      target: 'tour-home-diversity',
      titleKey: 'tour.home.s3.title',
      textKey: 'tour.home.s3.text',
      position: 'bottom',
      mascot: asset('soso/pouce.png'),
    },
  ],

  todo: [
    {
      target: 'tour-todo-stats',
      titleKey: 'tour.todo.s0.title',
      textKey: 'tour.todo.s0.text',
      position: 'bottom',
      mascot: asset('soso/troph%C3%A9.png'),
    },
    {
      target: 'tour-todo-filters',
      titleKey: 'tour.todo.s1.title',
      textKey: 'tour.todo.s1.text',
      position: 'bottom',
      mascot: asset('soso/ordi.png'),
    },
    {
      target: 'tour-todo-list',
      titleKey: 'tour.todo.s2.title',
      textKey: 'tour.todo.s2.text',
      position: 'top',
      mascot: asset('soso/pointe.png'),
    },
  ],

  syntheses: [
    {
      target: 'tour-synth-global',
      titleKey: 'tour.syntheses.s0.title',
      textKey: 'tour.syntheses.s0.text',
      position: 'bottom',
      mascot: asset('soso/troph%C3%A9.png'),
    },
    {
      target: 'tour-synth-filters',
      titleKey: 'tour.syntheses.s1.title',
      textKey: 'tour.syntheses.s1.text',
      position: 'bottom',
      mascot: asset('soso/ordi.png'),
    },
    {
      target: 'tour-synth-subjects',
      titleKey: 'tour.syntheses.s2.title',
      textKey: 'tour.syntheses.s2.text',
      position: 'top',
      mascot: asset('soso/pointe.png'),
    },
  ],
};

// ── HOOK ──
export function useGuidedTour(page) {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const steps = TOUR_STEPS[page] || [];

  const start = useCallback(() => { setStep(0); setActive(true); }, []);
  const stop  = useCallback(() => { setActive(false); setStep(0); }, []);
  const next  = useCallback(() => {
    if (step < steps.length - 1) setStep(s => s + 1);
    else stop();
  }, [step, steps.length, stop]);
  const prev  = useCallback(() => {
    if (step > 0) setStep(s => s - 1);
  }, [step]);

  return { active, step, steps, start, stop, next, prev };
}

// ── COMPOSANT ──
export function GuidedTour({ active, step, steps, onNext, onPrev, onStop }) {
  const { t } = useTranslation();
  const [targetRect, setTargetRect] = useState(null);

  const currentStep = steps[step];

  useEffect(() => {
    if (!active || !currentStep) return;

    function measure() {
      const el = document.querySelector(`[data-tour="${currentStep.target}"]`);
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      } else {
        setTargetRect(null);
      }
    }

    measure();
    const t = setTimeout(measure, 400);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [active, step, currentStep]);

  // Fermer avec Escape
  useEffect(() => {
    if (!active) return;
    function onKey(e) { if (e.key === 'Escape') onStop(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onStop]);

  if (!active || !currentStep) return null;

  const MARGIN = 16;
  const BUBBLE_W = Math.min(320, window.innerWidth - 32);

  const getBubbleStyle = () => {
    if (!targetRect) return {
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%,-50%)', width: BUBBLE_W, zIndex: 10001,
    };

    const pos = currentStep.position;
    const style = { position: 'fixed', width: BUBBLE_W, zIndex: 10001 };
    const centerX = targetRect.left + targetRect.width / 2;
    const centerY = targetRect.top + targetRect.height / 2;

    if (pos === 'bottom') {
      style.top = targetRect.bottom + MARGIN;
      style.left = Math.max(8, Math.min(centerX - BUBBLE_W / 2, window.innerWidth - BUBBLE_W - 8));
    } else if (pos === 'top') {
      style.top = Math.max(8, targetRect.top - 260 - MARGIN);
      style.left = Math.max(8, Math.min(centerX - BUBBLE_W / 2, window.innerWidth - BUBBLE_W - 8));
    } else if (pos === 'right') {
      style.left = Math.min(targetRect.right + MARGIN, window.innerWidth - BUBBLE_W - 8);
      style.top = Math.max(8, Math.min(centerY - 100, window.innerHeight - 260));
    } else if (pos === 'left') {
      style.left = Math.max(8, targetRect.left - BUBBLE_W - MARGIN);
      style.top = Math.max(8, Math.min(centerY - 100, window.innerHeight - 260));
    }

    // Safety fallback
    if (style.top !== undefined && style.top > window.innerHeight - 60) {
      style.top = window.innerHeight / 2 - 130;
    }
    return style;
  };

  const getArrowStyle = () => {
    if (!targetRect) return null;
    const pos = currentStep.position;
    const base = { position: 'absolute', width: 0, height: 0, borderStyle: 'solid' };
    if (pos === 'bottom') return { ...base, top: -10, left: '50%', transform: 'translateX(-50%)', borderWidth: '0 10px 10px', borderColor: 'transparent transparent var(--bg-modal)' };
    if (pos === 'top')    return { ...base, bottom: -10, left: '50%', transform: 'translateX(-50%)', borderWidth: '10px 10px 0', borderColor: 'var(--bg-modal) transparent transparent' };
    if (pos === 'right')  return { ...base, left: -10, top: 28, borderWidth: '10px 10px 10px 0', borderColor: 'transparent var(--bg-modal) transparent transparent' };
    if (pos === 'left')   return { ...base, right: -10, top: 28, borderWidth: '10px 0 10px 10px', borderColor: 'transparent transparent transparent var(--bg-modal)' };
    return null;
  };

  const PAD = 10;
  const sr = targetRect ? {
    x: targetRect.left - PAD,
    y: targetRect.top - PAD,
    w: targetRect.width + PAD * 2,
    h: targetRect.height + PAD * 2,
  } : null;

  return (
    <>
      {/* Overlay avec spotlight */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'all' }}
        onClick={onStop}>
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <mask id="gt-mask">
              <rect width="100%" height="100%" fill="white" />
              {sr && <rect x={sr.x} y={sr.y} width={sr.w} height={sr.h} rx={12} fill="black" />}
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.74)" mask="url(#gt-mask)" />
          {sr && (
            <rect x={sr.x} y={sr.y} width={sr.w} height={sr.h} rx={12}
              fill="none" stroke="var(--accent, #4A90D9)" strokeWidth="2"
              strokeDasharray="6 3"
              style={{ filter: 'drop-shadow(0 0 8px rgba(74,144,217,.9))' }} />
          )}
        </svg>
      </div>

      {/* Bulle flottante */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${step}-${currentStep.target}`}
          initial={{ opacity: 0, scale: .88, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: .88, y: -10 }}
          transition={{ duration: .2, ease: 'easeOut' }}
          onClick={e => e.stopPropagation()}
          style={{
            ...getBubbleStyle(),
            background: 'var(--bg-modal)',
            border: '1px solid var(--border-strong)',
            borderRadius: 18,
            padding: '14px 16px',
            boxShadow: '0 12px 48px rgba(0,0,0,.6), 0 0 0 1px rgba(74,144,217,.25)',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>

          {getArrowStyle() && <div style={getArrowStyle()} />}

          {/* En-tête : la mascotte et le titre de l'étape */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <motion.img
              key={currentStep.mascot + step}
              initial={{ scale: .55, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 9, stiffness: 200 }}
              src={currentStep.mascot}
              alt=""
              onError={e => { e.target.style.display = 'none'; }}
              style={{ width: 54, height: 54, objectFit: 'contain', flexShrink: 0 }}
            />
            <div>
              <div style={{ fontSize: '.58rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '.1em', color: 'var(--accent)', marginBottom: 2 }}>
                {t('common.guidedTour')}
              </div>
              <div style={{ fontSize: '.88rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                {t(currentStep.titleKey)}
              </div>
            </div>
          </div>

          {/* Texte */}
          <div style={{ fontSize: '.78rem', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
            {t(currentStep.textKey)}
          </div>

          {/* Barre de progression */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 3, flex: 1 }}>
              {steps.map((_, i) => (
                <motion.div key={i}
                  animate={{ background: i === step ? 'var(--accent)' : i < step ? 'rgba(74,144,217,.4)' : 'var(--border)' }}
                  style={{ height: 3, flex: 1, borderRadius: 4,
                    boxShadow: i === step ? '0 0 6px var(--accent)' : 'none' }} />
              ))}
            </div>
            <span style={{ fontSize: '.6rem', color: 'var(--text-muted)', flexShrink: 0 }}>
              {step + 1}/{steps.length}
            </span>
          </div>

          {/* Boutons */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onStop}
              style={{ padding: '7px 10px', borderRadius: 9, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-muted)', fontSize: '.72rem', cursor: 'pointer' }}>
              {t('tourUi.quit')}
            </button>
            {step > 0 && (
              <button onClick={onPrev}
                style={{ flex: 1, padding: '8px', borderRadius: 9, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--text-secondary)', fontSize: '.78rem', cursor: 'pointer' }}>
                {t('tourUi.prev')}
              </button>
            )}
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: .97 }}
              onClick={onNext}
              style={{ flex: 2, padding: '8px', borderRadius: 9, border: 'none',
                background: 'var(--accent)', color: '#fff',
                fontSize: '.82rem', fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 2px 12px var(--accent-glow)' }}>
              {step === steps.length - 1 ? t('tourUi.finish') : t('tourUi.next')}
            </motion.button>
          </div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}

export default GuidedTour;

/**
 * Discreet entry point for a page's guided tour.
 *
 * Reads as a quiet hint until hovered, so it never competes with the page's
 * own actions, but keeps an icon + a label so it stays self-explanatory.
 * Drop it anywhere on a page that calls `useGuidedTour`.
 */
export function TourButton({ onClick, label, align = 'flex-end' }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState(false);
  return (
    <div style={{ display: 'flex', justifyContent: align }}>
      <motion.button onClick={onClick}
        onHoverStart={() => setHover(true)} onHoverEnd={() => setHover(false)}
        whileTap={{ scale: .96 }}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px',
          borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: '.7rem', fontWeight: 600,
          transition: 'background .18s, color .18s',
          background: hover ? 'var(--accent-subtle)' : 'transparent',
          color: hover ? 'var(--accent)' : 'var(--text-muted)' }}>
        <HelpCircle size={13} strokeWidth={2.2} style={{ flexShrink: 0 }} />
        {label || t('common.guidedTour')}
      </motion.button>
    </div>
  );
}
