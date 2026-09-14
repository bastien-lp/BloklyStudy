/**
 * LandingPage — Public marketing page shown to logged-out visitors.
 * Toggles to <AuthPage/> when the visitor chooses to log in or sign up.
 *
 * Visual direction: "Refined Dark" — the same dark atmosphere as before, but
 * with real depth (layered aurora glows, a hairline grid, a vignette), tighter
 * typography, a sticky glass nav, and subtle hover/scroll interactions. All the
 * decorative styling lives in a scoped <style> block keyed on `.landing-root`
 * so the heavy inline-style file stays readable and :hover / keyframes work.
 *
 * Right below the hero sits <AppShowcase/>: real product shots of the planner,
 * focus timer, flashcards, stats, groups and Réserve. It replaces the former
 * CircularGallery, which showed unrelated stock photos.
 *
 * NOTE: the sub-components (StatsBar, TestimonialsSection, FreeForeverBanner)
 * keep their own French text for now and will be localized when those
 * components are refactored.
 */

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import AuthPage from './AuthPage';
import LightRays from '../components/LightRays';
import AppShowcase from '../components/AppShowcase';
import { BlurFade, WordRotate } from '../components/AnimatedText';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { StatsBar, TestimonialsSection, FreeForeverBanner } from '../components/SocialProof';
import { useTranslation } from '../i18n';

export default function LandingPage({ lang, onLangChange }) {
  const { t } = useTranslation();
  const [showAuth, setShowAuth] = useState(false);
  const [authTab, setAuthTab] = useState('login');

  function openAuth(tab) {
    setAuthTab(tab);
    setShowAuth(true);
  }

  if (showAuth) return <AuthPage onBack={() => setShowAuth(false)} defaultTab={authTab} />;

  const rotateWords = t('landing.rotateWords').split(',');
  // Richer three-stop gradient — same blue→violet family, more refined.
  const gradientText = {
    background: 'linear-gradient(100deg,#5aa2ec,#6366f1,#a06bd6)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
  };

  return (
    <div className="landing-root" style={{ minHeight: '100vh', background: '#08080f', display: 'flex', flexDirection: 'column', fontFamily: "'Inter',system-ui,sans-serif", position: 'relative', overflowX: 'hidden' }}>
      <style>{LANDING_CSS}</style>

      {/* Layered depth: drifting aurora glows + hairline grid + edge vignette */}
      <div className="landing-bg" aria-hidden="true">
        <div className="aurora aurora-a" />
        <div className="aurora aurora-b" />
        <div className="aurora aurora-c" />
        <div className="grid-overlay" />
        <div className="vignette" />
      </div>
      <LightRays />

      {/* Nav — sticky glass */}
      <nav className="landing-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="brand-mark">
            <span style={{ background: '#E74C3C' }} />
            <span style={{ background: '#F1C40F', marginLeft: 4 }} />
            <span style={{ background: '#27AE60', marginLeft: 8 }} />
          </div>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fff', letterSpacing: '-.02em' }}>Blokly</div>
            <div style={{ fontSize: '.56rem', color: 'rgba(255,255,255,.42)', letterSpacing: '.32em', textTransform: 'uppercase' }}>Study</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LanguageSwitcher lang={lang} onChange={onLangChange} variant="landing" />
          <button onClick={() => openAuth('login')} className="btn-ghost">{t('landing.login')}</button>
          <button onClick={() => openAuth('signup')} className="btn-primary btn-primary--sm">{t('landing.startFree')}</button>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '5rem 1.5rem 3.5rem', position: 'relative', zIndex: 1 }}>
        <BlurFade delay={0.1}>
          <div className="hero-badge">
            <span className="badge-dot" />
            {t('landing.badge')}
          </div>
        </BlurFade>
        <BlurFade delay={0.2}>
          <h1 style={{ fontSize: 'clamp(2.1rem,5.4vw,3.9rem)', fontWeight: 800, color: '#fff', lineHeight: 1.1, margin: '0 0 1.1rem', letterSpacing: '-.025em', maxWidth: 820 }}>
            {t('landing.heroPrefix')}<WordRotate words={rotateWords} style={gradientText} /><br />
            {t('landing.heroMid')}<span style={gradientText}>{t('landing.heroHighlight')}</span>
          </h1>
        </BlurFade>
        <BlurFade delay={0.3}>
          <p style={{ fontSize: 'clamp(1rem,2.2vw,1.12rem)', color: 'rgba(255,255,255,.6)', maxWidth: 580, lineHeight: 1.7, margin: '0 0 2.4rem' }}>
            {t('landing.subtitle')}
          </p>
        </BlurFade>
        <BlurFade delay={0.4}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginBottom: '1.1rem' }}>
            <button onClick={() => openAuth('signup')} className="btn-primary">
              {t('landing.createAccount')}
              <ArrowRight size={18} strokeWidth={2.4} className="btn-arrow" />
            </button>
            <button onClick={() => openAuth('login')} className="btn-glass">{t('landing.loginAlt')}</button>
          </div>
        </BlurFade>
        <BlurFade delay={0.5}>
          <p style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.32)', letterSpacing: '.01em' }}>{t('landing.tagline')}</p>
        </BlurFade>
        <BlurFade delay={0.6}>
          <StatsBar />
        </BlurFade>
      </section>

      {/* Product shots — the app itself, screen by screen */}
      <AppShowcase />

      <TestimonialsSection />
      <FreeForeverBanner />

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '2rem', color: 'rgba(255,255,255,.28)', fontSize: '.75rem', borderTop: '1px solid rgba(255,255,255,.06)', position: 'relative', zIndex: 1 }}>
        {t('landing.footer')}
      </footer>
    </div>
  );
}

// Scoped landing styles: depth layers, sticky glass nav, buttons with real
// hover feedback, and the slow aurora drift. Everything is namespaced under
// `.landing-root` so it never leaks into the authenticated app.
const LANDING_CSS = `
.landing-root { --ink: #08080f; }

.landing-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
.landing-bg .aurora { position: absolute; border-radius: 50%; filter: blur(90px); opacity: .5; will-change: transform; }
.aurora-a { width: 620px; height: 620px; top: -180px; left: -120px; background: radial-gradient(circle, rgba(74,144,217,.55), transparent 70%); animation: drift-a 22s ease-in-out infinite; }
.aurora-b { width: 560px; height: 560px; top: 4%; right: -160px; background: radial-gradient(circle, rgba(155,89,182,.5), transparent 70%); animation: drift-b 26s ease-in-out infinite; }
.aurora-c { width: 720px; height: 720px; bottom: -280px; left: 30%; background: radial-gradient(circle, rgba(99,102,241,.4), transparent 70%); animation: drift-c 30s ease-in-out infinite; }
.grid-overlay { position: absolute; inset: 0;
  background-image: linear-gradient(rgba(255,255,255,.028) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.028) 1px, transparent 1px);
  background-size: 54px 54px; mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, #000 40%, transparent 100%); }
.vignette { position: absolute; inset: 0; background: radial-gradient(ellipse 120% 90% at 50% -10%, transparent 45%, rgba(4,4,10,.55) 100%); }

@keyframes drift-a { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(60px,50px) scale(1.08); } }
@keyframes drift-b { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-50px,40px) scale(1.1); } }
@keyframes drift-c { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(40px,-40px) scale(1.06); } }

.landing-nav { display: flex; align-items: center; justify-content: space-between;
  padding: 1rem 2rem; position: sticky; top: 0; z-index: 20;
  background: rgba(8,8,15,.6); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(255,255,255,.07); }

.brand-mark { display: flex; flex-direction: column; gap: 3px; }
.brand-mark span { display: block; width: 26px; height: 6px; border-radius: 3px; transition: transform .3s ease; }
.landing-nav:hover .brand-mark span:nth-child(1) { transform: translateX(2px); }
.landing-nav:hover .brand-mark span:nth-child(3) { transform: translateX(-4px); }

.btn-ghost { padding: 8px 18px; border: 1px solid rgba(255,255,255,.16); border-radius: 9px;
  background: transparent; color: rgba(255,255,255,.82); font-size: .85rem; font-weight: 500; cursor: pointer;
  transition: border-color .2s, background .2s, color .2s; }
.btn-ghost:hover { border-color: rgba(255,255,255,.32); background: rgba(255,255,255,.05); color: #fff; }

.btn-primary { display: inline-flex; align-items: center; gap: 9px; padding: 13px 30px; border: none; border-radius: 11px;
  background: linear-gradient(135deg,#4A90D9,#6366f1); color: #fff; font-size: 1rem; font-weight: 700; cursor: pointer;
  box-shadow: 0 6px 24px rgba(74,144,217,.38); transition: transform .22s cubic-bezier(.2,.7,.3,1), box-shadow .22s; }
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 12px 34px rgba(99,102,241,.5); }
.btn-primary .btn-arrow { transition: transform .22s; }
.btn-primary:hover .btn-arrow { transform: translateX(4px); }
.btn-primary--sm { padding: 8px 18px; font-size: .85rem; font-weight: 600; border-radius: 9px; box-shadow: 0 4px 16px rgba(74,144,217,.32); }

.btn-glass { padding: 13px 26px; border: 1px solid rgba(255,255,255,.16); border-radius: 11px;
  background: rgba(255,255,255,.05); color: rgba(255,255,255,.88); font-size: 1rem; font-weight: 500; cursor: pointer;
  backdrop-filter: blur(8px); transition: border-color .2s, background .2s; }
.btn-glass:hover { border-color: rgba(255,255,255,.34); background: rgba(255,255,255,.09); }

.hero-badge { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 1.6rem;
  background: rgba(74,144,217,.12); border: 1px solid rgba(74,144,217,.28); border-radius: 999px;
  padding: 6px 15px; font-size: .74rem; color: #9ec5f5; font-weight: 600; backdrop-filter: blur(6px); }
.badge-dot { width: 7px; height: 7px; border-radius: 50%; background: #5aa2ec; box-shadow: 0 0 0 0 rgba(90,162,236,.7); animation: badge-pulse 2.4s ease-out infinite; }
@keyframes badge-pulse { 0% { box-shadow: 0 0 0 0 rgba(90,162,236,.55); } 70% { box-shadow: 0 0 0 7px rgba(90,162,236,0); } 100% { box-shadow: 0 0 0 0 rgba(90,162,236,0); } }

@media (prefers-reduced-motion: reduce) {
  .landing-bg .aurora, .badge-dot { animation: none; }
  .btn-primary, .btn-glass, .btn-ghost, .btn-arrow { transition: none; }
}
`;
