/**
 * AppShowcase — the "product shots" section of the public landing page.
 *
 * The landing page used to show a WebGL carousel of random stock photos, which
 * told a visitor nothing about the product. This section replaces it with a shot
 * of every single feature, drawn inside a browser + app chrome frame.
 *
 * Fidelity approach: each screen (see ShowcaseScreens.jsx) is laid out at a fixed
 * logical viewport and the whole frame is then scaled down as one image, exactly
 * like a real screenshot. That lets the screens reuse the app's own pixel values,
 * design tokens and i18n strings rather than approximating them at a smaller
 * size — so the preview stays true to the app, crisp on any display, and
 * translated into every language the app supports.
 *
 * Each feature in the picker carries an (i) button whose tooltip explains what
 * the feature does.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useInView } from 'motion/react';
import {
  Info, Zap, Power, CalendarDays, Users, Play, LibraryBig, Palette,
} from 'lucide-react';
import { useTranslation } from '../i18n';
import { VIEWPORT, THEME_VARS, APP_TABS, ACCOUNT, SCREEN_META } from './showcaseData';
import {
  ScreenPlanning, ScreenStudy, ScreenTodo, ScreenProgress, ScreenConfidence,
  ScreenSyntheses, ScreenFlashcards, ScreenRepetition, ScreenExams, ScreenStats,
  ScreenReserve, ScreenGroups, ScreenJournal, ScreenWhoarewe,
} from './ShowcaseScreens';

/** Screen id → the component that draws it. */
const SCREEN_BY_ID = {
  planning: ScreenPlanning, study: ScreenStudy, todo: ScreenTodo,
  progress: ScreenProgress, confidence: ScreenConfidence, syntheses: ScreenSyntheses,
  flashcards: ScreenFlashcards, repetition: ScreenRepetition, exams: ScreenExams,
  stats: ScreenStats, reserve: ScreenReserve, groups: ScreenGroups,
  journal: ScreenJournal, whoarewe: ScreenWhoarewe,
};

const SCREENS = SCREEN_META.map(m => ({ ...m, Screen: SCREEN_BY_ID[m.id] }));

const SLIDE_MS = 9000;
/** Below this width the shot becomes swipeable instead of shrinking further. */
const NARROW_PX = 780;
const NARROW_SCALE = 0.62;

export default function AppShowcase() {
  const { t, formatNumber } = useTranslation();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [info, setInfo] = useState(null);      // id of the open tooltip
  const [scale, setScale] = useState(0.85);
  const [narrow, setNarrow] = useState(false);

  const rootRef = useRef(null);
  const frameRef = useRef(null);
  const inView = useInView(rootRef, { amount: 0.25 });

  const active = SCREENS[index];
  const Screen = active.Screen;

  // Scale the fixed-size viewport down to whatever width the frame gets.
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const isNarrow = w < NARROW_PX;
      setNarrow(isNarrow);
      setScale(isNarrow ? NARROW_SCALE : w / VIEWPORT.w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-advance, but only while the section is on screen and not interacted with.
  useEffect(() => {
    if (paused || !inView) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = setTimeout(() => setIndex(i => (i + 1) % SCREENS.length), SLIDE_MS);
    return () => clearTimeout(id);
  }, [index, paused, inView]);

  // A click anywhere else closes an open tooltip.
  useEffect(() => {
    if (!info) return;
    const close = () => setInfo(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [info]);

  function pickLabel(s) {
    return s.id === 'study' ? t('app.studyMode') : t(`app.tab${cap(s.id)}`);
  }

  return (
    <section ref={rootRef} className="showcase" id="showcase">
      <style>{SHOWCASE_CSS}</style>

      <motion.header className="showcase-head"
        initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }} transition={{ duration: 0.55 }}>
        <span className="showcase-eyebrow">{t('showcase.eyebrow')}</span>
        <h2>{t('showcase.title')}</h2>
        <p>{t('showcase.subtitle')}</p>
      </motion.header>

      {/* Feature picker — one entry per screen, each with an info tooltip */}
      <div className="showcase-picker" role="tablist" aria-label={t('showcase.title')}>
        {SCREENS.map((s, i) => {
          const on = i === index;
          const label = pickLabel(s);
          return (
            <div key={s.id} className={`showcase-pick${on ? ' showcase-pick--on' : ''}`} style={{ '--c': s.color }}>
              <button type="button" role="tab" aria-selected={on} className="showcase-pick-btn"
                onClick={() => { setIndex(i); setPaused(true); }}>
                <s.Icon size={14} strokeWidth={2} />
                {label}
              </button>
              <button type="button" className="showcase-info-btn"
                aria-label={`${label} — ${t('showcase.whatIsIt')}`}
                aria-expanded={info === s.id}
                onClick={e => { e.stopPropagation(); setInfo(v => (v === s.id ? null : s.id)); }}
                onMouseEnter={() => setInfo(s.id)}
                onMouseLeave={() => setInfo(v => (v === s.id ? null : v))}
                onFocus={() => setInfo(s.id)}
                onBlur={() => setInfo(v => (v === s.id ? null : v))}>
                <Info size={13} strokeWidth={2.2} />
              </button>
              <AnimatePresence>
                {info === s.id && (
                  <motion.span className="showcase-tip" role="tooltip"
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}>
                    <b>{label}</b>
                    {t(`showcase.info_${s.id}`)}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* The shot itself */}
      <motion.div className="showcase-frame"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        initial={{ opacity: 0, y: 34 }} whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, ease: 'easeOut' }}>
        <div className="showcase-glow"
          style={{ background: `radial-gradient(60% 60% at 50% 0%, ${active.color}55, transparent 70%)` }} />

        <div className="showcase-window" ref={frameRef}>
          {/* Browser chrome */}
          <div className="shot-browser">
            <span className="shot-dot" style={{ background: '#ff5f57' }} />
            <span className="shot-dot" style={{ background: '#febc2e' }} />
            <span className="shot-dot" style={{ background: '#28c840' }} />
            <span className="shot-url">blokly-study.app</span>
          </div>

          {/* Scaled screenshot area */}
          <div className={`shot-stage${narrow ? ' shot-stage--scroll' : ''}`}
            style={{ height: VIEWPORT.h * scale }}>
            <div className="shot-viewport"
              style={{ ...THEME_VARS, width: VIEWPORT.w, height: VIEWPORT.h, transform: `scale(${scale})` }}>
              {/* Aurora — the app paints one across the top 40% of the page */}
              <div className="shot-aurora" aria-hidden="true" />

              <TopBar t={t} formatNumber={formatNumber} />
              <TabBar t={t} activeTab={active.tab} />

              <div className="shot-main">
                <AnimatePresence mode="wait">
                  <motion.div key={active.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}>
                    <Screen t={t} formatNumber={formatNumber} />
                  </motion.div>
                </AnimatePresence>
              </div>

              <Dock activeTab={active.tab} />
            </div>
          </div>
        </div>
      </motion.div>

      {narrow && <p className="showcase-swipe">{t('showcase.swipeHint')}</p>}
    </section>
  );
}

/** 'planning' → 'Planning', so `app.tab*` keys can be built from a screen id. */
function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ── App chrome ──────────────────────────────────────────────────────────── */

/** Top bar — mirrors AppPage's sticky header, value for value. */
function TopBar({ t, formatNumber }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 0.8rem', minHeight: 56, background: 'var(--bg-nav)',
      borderBottom: '1px solid var(--border)', gap: 8, position: 'relative', zIndex: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <div style={{ width: 18, height: 4, borderRadius: 2, background: '#E74C3C' }} />
          <div style={{ width: 18, height: 4, borderRadius: 2, background: '#F1C40F', marginLeft: 2 }} />
          <div style={{ width: 18, height: 4, borderRadius: 2, background: '#27AE60', marginLeft: 4 }} />
        </div>
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 900, color: 'var(--text-primary)',
            letterSpacing: '-0.02em', lineHeight: 1 }}>Blokly</div>
          <div style={{ fontSize: '0.45rem', color: 'var(--text-muted)', letterSpacing: '0.2em',
            textTransform: 'uppercase', marginTop: 1 }}>Study</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', borderRadius: 12,
          background: 'rgba(39,174,96,.1)', border: '1px solid rgba(39,174,96,.15)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#27AE60' }} />
          <span style={{ fontSize: '0.6rem', color: 'rgba(39,174,96,.9)', fontWeight: 700 }}>
            24{t('app.onlineSuffix')}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 20,
          background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.65rem',
            color: 'var(--xp-color)', fontWeight: 800 }}>
            <Zap size={11} fill="var(--xp-color)" strokeWidth={0} />
            {formatNumber(ACCOUNT.xp)} <span style={{ fontSize: '0.55rem', fontWeight: 500, color: 'var(--text-muted)' }}>XP</span>
          </span>
          <div style={{ width: 35, height: 3, background: 'var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '47%', background: 'var(--xp-color)', borderRadius: 10 }} />
          </div>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 600,
            background: 'var(--bg-card)', padding: '2px 5px', borderRadius: 6 }}>
            {t('app.levelShort', { count: ACCOUNT.level })}
          </span>
        </div>
        <div style={{ width: 28, height: 28, borderRadius: '50%',
          background: 'linear-gradient(135deg,var(--accent),#9B59B6)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: '.75rem', fontWeight: 700,
          color: '#fff', border: '1px solid rgba(255,255,255,.15)' }}>B</div>
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)',
          padding: '4px 8px', display: 'flex', alignItems: 'center' }}>
          <Power size={14} strokeWidth={2} />
        </div>
      </div>
    </div>
  );
}

/** Tab bar — the accent highlight matches the default `tabColorMode: 'accent'`. */
function TabBar({ t, activeTab }) {
  return (
    <div style={{ background: 'var(--bg-nav)', borderBottom: '1px solid var(--border)',
      position: 'relative', zIndex: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 8px', justifyContent: 'center' }}>
        {APP_TABS.map(tab => {
          const on = tab.id === activeTab;
          return (
            <div key={tab.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px',
              borderRadius: 8, whiteSpace: 'nowrap', position: 'relative',
              background: on ? 'var(--accent-subtle)' : 'transparent',
              color: on ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: '.75rem', fontWeight: on ? 700 : 400,
              outline: on ? '1px solid var(--accent-glow)' : 'none' }}>
              <tab.Icon size={14} strokeWidth={on ? 2.2 : 1.8} />
              {t(tab.labelKey)}
              {tab.id === 'repetition' && (
                <span style={badgeStyle('#E74C3C')}>2</span>
              )}
              {tab.id === 'groups' && (
                <span style={badgeStyle('#27AE60')}>3</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function badgeStyle(bg) {
  return {
    position: 'absolute', top: 2, right: 2, minWidth: 14, height: 14, borderRadius: 7,
    background: bg, color: '#fff', fontSize: '.5rem', fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1,
  };
}

/** The floating dock the app pins to the bottom of every page. */
function Dock({ activeTab }) {
  const studyOn = activeTab === null;
  return (
    <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 8, zIndex: 20,
      background: 'var(--bg-nav)', border: '1px solid var(--border-strong)', borderRadius: 20,
      padding: '8px 16px', boxShadow: '0 8px 40px rgba(0,0,0,.4)' }}>
      {[{ Icon: CalendarDays, tab: 'planning', color: '#4A90D9' },
        { Icon: Users, tab: 'groups', color: '#9B59B6' }].map(it => {
        const on = activeTab === it.tab;
        return (
          <div key={it.tab} style={{ width: 40, height: 40, borderRadius: 12,
            background: on ? `${it.color}25` : 'var(--bg-card)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: on ? it.color : 'var(--text-muted)',
            boxShadow: on ? `0 0 12px ${it.color}40` : 'none' }}>
            <it.Icon size={18} strokeWidth={on ? 2.2 : 1.8} />
          </div>
        );
      })}
      <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
      <div style={{ width: 56, height: 56, borderRadius: '50%', position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: studyOn ? 'var(--accent)' : 'var(--accent-subtle)',
        boxShadow: studyOn ? '0 0 22px var(--accent-glow), 0 4px 16px rgba(0,0,0,.3)' : '0 2px 8px rgba(0,0,0,.2)' }}>
        {studyOn && (
          <motion.div animate={{ scale: [1, 1.25, 1], opacity: [.5, 0, .5] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: '2px solid var(--accent)' }} />
        )}
        <Play size={20} strokeWidth={0}
          style={{ color: studyOn ? '#fff' : 'var(--accent)', fill: studyOn ? '#fff' : 'var(--accent)', marginLeft: 2 }} />
      </div>
      <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
      {[LibraryBig, Palette].map((Icon, i) => (
        <div key={i} style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--bg-card)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          <Icon size={18} strokeWidth={1.8} />
        </div>
      ))}
    </div>
  );
}

const SHOWCASE_CSS = `
.showcase { position: relative; z-index: 1; width: 100%; max-width: 1180px;
  margin: 0 auto; padding: 4.5rem 1.25rem 1rem; }

.showcase-head { text-align: center; margin-bottom: 2rem; }
.showcase-eyebrow { display: inline-block; font-size: .68rem; font-weight: 700; letter-spacing: .22em;
  text-transform: uppercase; color: #8fb6e8; margin-bottom: .85rem; }
.showcase-head h2 { font-size: clamp(1.7rem,4vw,2.6rem); font-weight: 800; color: #fff;
  letter-spacing: -.025em; margin: 0 0 .7rem; }
.showcase-head p { color: rgba(255,255,255,.48); font-size: 1rem; line-height: 1.65;
  max-width: 580px; margin: 0 auto; }

/* Picker */
.showcase-picker { position: relative; z-index: 40; display: flex; flex-wrap: wrap;
  justify-content: center; gap: 8px; margin-bottom: 1.5rem; }
.showcase-pick { position: relative; display: inline-flex; align-items: center;
  border-radius: 999px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.035);
  transition: border-color .2s, background .2s, transform .2s; }
.showcase-pick:hover { border-color: rgba(255,255,255,.24); transform: translateY(-1px); }
.showcase-pick--on { border-color: color-mix(in srgb, var(--c) 55%, transparent);
  background: color-mix(in srgb, var(--c) 18%, transparent);
  box-shadow: 0 6px 20px color-mix(in srgb, var(--c) 25%, transparent); }
.showcase-pick-btn { display: inline-flex; align-items: center; gap: 7px;
  padding: 8px 4px 8px 15px; border: none; background: none; cursor: pointer;
  color: rgba(255,255,255,.62); font-size: .8rem; font-weight: 600; font-family: inherit;
  transition: color .2s; }
.showcase-pick:hover .showcase-pick-btn, .showcase-pick--on .showcase-pick-btn { color: #fff; }
.showcase-pick-btn svg { color: var(--c); }
.showcase-info-btn { display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; margin-right: 6px; border: none; border-radius: 50%;
  background: none; cursor: help; color: rgba(255,255,255,.32); padding: 0;
  transition: color .2s, background .2s; }
.showcase-info-btn:hover, .showcase-info-btn:focus-visible {
  color: #fff; background: rgba(255,255,255,.12); outline: none; }

.showcase-tip { position: absolute; top: calc(100% + 10px); left: 50%; transform: translateX(-50%);
  width: max-content; max-width: min(280px, 78vw); z-index: 30; pointer-events: none;
  padding: 10px 13px; border-radius: 12px; text-align: left;
  background: rgba(12,12,24,.97); border: 1px solid rgba(255,255,255,.14);
  box-shadow: 0 14px 40px rgba(0,0,0,.55);
  font-size: .76rem; line-height: 1.55; color: rgba(255,255,255,.72); white-space: normal; }
.showcase-tip b { display: block; color: #fff; font-size: .8rem; margin-bottom: 3px; }
.showcase-tip::before { content: ''; position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
  border: 6px solid transparent; border-bottom-color: rgba(255,255,255,.14); }

/* Frame */
.showcase-frame { position: relative; }
.showcase-glow { position: absolute; inset: -60px -30px 40%; filter: blur(50px); opacity: .55;
  pointer-events: none; transition: background .5s ease; }
.showcase-window { position: relative; border-radius: 16px; overflow: hidden;
  border: 1px solid rgba(255,255,255,.12); background: #0a0a18;
  box-shadow: 0 40px 90px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.03) inset; }

.shot-browser { display: flex; align-items: center; gap: 6px; padding: 9px 14px;
  background: rgba(255,255,255,.045); border-bottom: 1px solid rgba(255,255,255,.08); }
.shot-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.shot-url { margin-left: 12px; padding: 3px 14px; border-radius: 6px; background: rgba(0,0,0,.35);
  color: rgba(255,255,255,.4); font-size: .6rem; letter-spacing: .02em; }

/* The screenshot: a fixed-size viewport scaled down as one image */
.shot-stage { position: relative; overflow: hidden; background: #0a0a18; }
.shot-stage--scroll { overflow-x: auto; overflow-y: hidden; -webkit-overflow-scrolling: touch; }
.shot-viewport { transform-origin: top left; position: relative; overflow: hidden;
  background: var(--bg-base); color: var(--text-primary);
  font-family: var(--font-family); display: flex; flex-direction: column; }
.shot-aurora { position: absolute; top: 0; left: 0; right: 0; height: 40%; z-index: 0; opacity: .35;
  background:
    radial-gradient(60% 100% at 20% 0%, #5227FF 0%, transparent 60%),
    radial-gradient(55% 100% at 55% 0%, #9B59B6 0%, transparent 60%),
    radial-gradient(60% 100% at 85% 0%, #4A90D9 0%, transparent 60%);
  filter: blur(46px); pointer-events: none; }
.shot-main { position: relative; z-index: 1; flex: 1; min-height: 0; overflow: hidden;
  padding: 1.5rem 1.5rem 5rem; }

.showcase-swipe { text-align: center; margin: 1rem auto 0; font-size: .76rem;
  color: rgba(255,255,255,.4); }

@media (max-width: 780px) {
  .showcase { padding-left: .75rem; padding-right: .75rem; }
  .showcase-pick-btn { font-size: .74rem; padding-left: 12px; }
}

@media (prefers-reduced-motion: reduce) {
  .showcase-pick, .showcase-glow { transition: none; }
}
`;
