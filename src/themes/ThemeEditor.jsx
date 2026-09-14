import { useState } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from '../i18n';
import {
  THEMES, FONTS, RADIUS_STYLES,
  RING_STYLES, DEFAULT_PREFERENCES, getTheme, isUnlocked, unlockLevelOf, unlockXpOf,
  THEME_EDITABLE_VARS, resolveThemeVars
} from './themes';


// Coerce any CSS colour (hex, #rgb, rgb()/rgba()) to a 7-char hex string, so it
// can seed an <input type="color"> (which only accepts hex). Falls back to grey.
function toHex(c) {
  if (!c) return '#888888';
  const s = String(c).trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s;
  if (/^#[0-9a-f]{3}$/i.test(s)) return '#' + s.slice(1).split('').map(x => x + x).join('');
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const [r, g, b] = m[1].split(',').map(n => Math.max(0, Math.min(255, parseInt(n, 10))));
    return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('');
  }
  return '#888888';
}

// Live preview "fake app page". It scopes the resolved theme variables onto its
// own wrapper as inline CSS custom properties, so every child rendered with
// var(--…) shows the DRAFT colours — without ever touching :root (the real app
// stays unchanged until the user clicks "Appliquer").
function ThemePreview({ vars }) {
  const { t } = useTranslation();
  return (
    <div style={{ ...vars, background:'var(--bg-base)', borderRadius:14,
      border:'1px solid var(--border)', padding:12, overflow:'hidden' }}>

      {/* Fake top bar */}
      <div style={{ display:'flex',alignItems:'center',gap:8, background:'var(--bg-nav)',
        border:'1px solid var(--border)', borderRadius:10, padding:'7px 10px', marginBottom:10 }}>
        <div style={{ display:'flex',gap:3 }}>
          <span style={{ width:7,height:7,borderRadius:'50%',background:'var(--danger)' }}/>
          <span style={{ width:7,height:7,borderRadius:'50%',background:'var(--warning)' }}/>
          <span style={{ width:7,height:7,borderRadius:'50%',background:'var(--success)' }}/>
        </div>
        <span style={{ fontSize:'.74rem',fontWeight:800,color:'var(--text-primary)' }}>Blokly</span>
        <span style={{ marginLeft:'auto', padding:'2px 8px', borderRadius:12,
          background:'var(--bg-card)', border:'1px solid var(--border)',
          fontSize:'.58rem',fontWeight:800,color:'var(--xp-color)' }}>⚡ 1 250 XP</span>
        <span style={{ width:18,height:18,borderRadius:'50%', background:'var(--accent)' }}/>
      </div>

      {/* Fake cards */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
        {[0,1].map(i => (
          <div key={i} style={{ background:'var(--bg-card)', border:'1px solid var(--border)',
            borderRadius:10, padding:'8px 10px' }}>
            <div style={{ fontSize:'.66rem',fontWeight:700,color:'var(--text-primary)' }}>{t('themeEditor.previewCardTitle')}</div>
            <div style={{ fontSize:'.58rem',color:'var(--text-secondary)',marginTop:2 }}>{t('themeEditor.previewSecondary')}</div>
            <div style={{ fontSize:'.54rem',color:'var(--text-muted)',marginTop:1 }}>{t('themeEditor.previewMuted')}</div>
            <div style={{ marginTop:6, height:4, borderRadius:10, background:'var(--border)', overflow:'hidden' }}>
              <div style={{ width: i ? '38%' : '72%', height:'100%', background:'var(--xp-color)' }}/>
            </div>
          </div>
        ))}
      </div>

      {/* Buttons + status chips */}
      <div style={{ display:'flex',gap:6,flexWrap:'wrap',alignItems:'center',marginBottom:10 }}>
        <span style={{ padding:'5px 12px',borderRadius:8,background:'var(--accent)',color:'#fff',fontSize:'.62rem',fontWeight:700 }}>{t('themeEditor.previewButton')}</span>
        <span style={{ padding:'5px 12px',borderRadius:8,background:'var(--accent-subtle)',color:'var(--accent)',border:'1px solid var(--accent)',fontSize:'.62rem',fontWeight:700 }}>{t('themeEditor.previewActive')}</span>
        <span style={{ padding:'3px 8px',borderRadius:6,background:'var(--success)',color:'#fff',fontSize:'.56rem',fontWeight:700 }}>{t('themeEditor.previewSuccess')}</span>
        <span style={{ padding:'3px 8px',borderRadius:6,background:'var(--danger)',color:'#fff',fontSize:'.56rem',fontWeight:700 }}>{t('themeEditor.previewError')}</span>
        <span style={{ padding:'3px 8px',borderRadius:6,background:'var(--warning)',color:'#000',fontSize:'.56rem',fontWeight:700 }}>{t('themeEditor.previewWarning')}</span>
      </div>

      {/* Input + modal sample */}
      <div style={{ display:'flex',gap:8 }}>
        <div style={{ flex:1, background:'var(--bg-input)', border:'1px solid var(--border-strong)',
          borderRadius:8, padding:'7px 10px', fontSize:'.6rem', color:'var(--text-placeholder)' }}>
          {t('themeEditor.previewInput')}
        </div>
        <div style={{ background:'var(--bg-modal)', border:'1px solid var(--border-strong)',
          borderRadius:8, padding:'7px 10px', fontSize:'.6rem', color:'var(--text-primary)' }}>
          {t('themeEditor.previewWindow')}
        </div>
      </div>
    </div>
  );
}

// One colour row in the custom panel: a swatch (the colour input), the variable
// label + name, and a reset button shown only when the user overrode it.
function ColorVarRow({ item, overridden, value, onPick, onReset }) {
  const { t } = useTranslation();
  return (
    <div style={{ display:'flex',alignItems:'center',gap:9,padding:'7px 9px',borderRadius:10,
      background:'var(--bg-card)',
      border:`1px solid ${overridden ? 'var(--accent)' : 'var(--border)'}` }}>
      <label style={{ position:'relative', width:30, height:30, flexShrink:0, cursor:'pointer' }}>
        <span style={{ display:'block', width:30, height:30, borderRadius:8,
          background:value, border:'2px solid var(--border-strong)', boxSizing:'border-box' }} />
        <input type="color" value={toHex(value)} onChange={e => onPick(e.target.value)}
          style={{ position:'absolute', inset:0, opacity:0, width:'100%', height:'100%', cursor:'pointer' }} />
      </label>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:'.68rem',color:'var(--text-primary)',fontWeight:500,
          overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{item.label}</div>
        <div style={{ fontSize:'.54rem',color:'var(--text-muted)',fontFamily:'monospace' }}>{item.key}</div>
      </div>
      {overridden && (
        <button onClick={onReset} title={t('themeEditor.resetToTheme')}
          style={{ width:22,height:22,borderRadius:6,border:'1px solid var(--border)',
            background:'transparent',color:'var(--text-muted)',cursor:'pointer',
            fontSize:'.7rem',flexShrink:0 }}>×</button>
      )}
    </div>
  );
}

function ThemeCard({ theme, selected, userXp, onClick }) {
  const { t } = useTranslation();
  const locked  = !isUnlocked(theme, userXp);
  const active  = selected === theme.id;
  const vars    = theme.vars;

  return (
    <motion.button
      whileHover={!locked ? {scale:1.04, y:-2} : {}}
      whileTap={!locked ? {scale:.97} : {}}
      onClick={() => !locked && onClick(theme.id)}
      title={locked ? `🔒 ${t('themeEditor.unlockAtLevel', { level: unlockLevelOf(theme) })}` : theme.desc}
      style={{
        padding:0, borderRadius:12, border:'none', cursor:locked?'not-allowed':'pointer',
        outline: active ? '2px solid #4A90D9' : '1px solid rgba(255,255,255,.1)',
        outlineOffset: active ? 2 : 0,
        opacity: locked ? .5 : 1,
        overflow:'hidden', position:'relative',
        transition:'all .2s',
      }}>

      {/* Mini preview */}
      <div style={{ background:vars['--bg-base'], padding:'8px 8px 6px' }}>
        {/* Fake topbar */}
        <div style={{ background:vars['--bg-nav'], borderRadius:6, padding:'3px 6px',
          marginBottom:5, display:'flex', alignItems:'center', gap:4,
          border:`1px solid ${vars['--border']}` }}>
          <div style={{ width:8,height:2,borderRadius:2,background:'#E74C3C' }}/>
          <div style={{ width:8,height:2,borderRadius:2,background:'#F1C40F' }}/>
          <div style={{ width:8,height:2,borderRadius:2,background:'#27AE60' }}/>
          <div style={{ marginLeft:'auto', width:8,height:8,borderRadius:'50%',
            background:vars['--accent'] }}/>
        </div>
        {/* Fake cards */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:3 }}>
          {[vars['--accent'],'#27AE60','#F1C40F','#E74C3C'].map((c,i)=>(
            <div key={i} style={{ height:16, borderRadius:4,
              background:vars['--bg-card'], border:`1px solid ${vars['--border']}`,
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              <div style={{ width:10,height:2,borderRadius:2,background:c }}/>
            </div>
          ))}
        </div>
        {/* Fake XP bar */}
        <div style={{ marginTop:4, height:3, borderRadius:10,
          background:vars['--border'], overflow:'hidden' }}>
          <div style={{ width:'60%', height:'100%', borderRadius:10,
            background:vars['--xp-color'] }}/>
        </div>
      </div>

      {/* Label */}
      <div style={{ background:vars['--bg-nav'], padding:'5px 6px',
        borderTop:`1px solid ${vars['--border']}`,
        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:'.58rem', fontWeight:700,
          color:vars['--text-primary'], overflow:'hidden', textOverflow:'ellipsis',
          whiteSpace:'nowrap', maxWidth:60 }}>
          {theme.emoji} {theme.name}
        </span>
        {locked && (
          <span style={{ fontSize:'.5rem', color:vars['--text-muted'] }}>
            🔒 {t('themeEditor.lockedAt', { level: unlockLevelOf(theme) })}
          </span>
        )}
      </div>

      {active && (
        <div style={{ position:'absolute', top:4, right:4, width:14, height:14,
          borderRadius:'50%', background:'#4A90D9', border:'2px solid #fff',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:'.5rem', color:'#fff', fontWeight:700 }}>✓</div>
      )}
    </motion.button>
  );
}

function FontCard({ font, selected, userXp, onClick }) {
  const { t } = useTranslation();
  const locked = !isUnlocked(font, userXp);
  const active = selected === font.id;

  return (
    <motion.button
      whileHover={!locked?{scale:1.03}:{}}
      whileTap={!locked?{scale:.97}:{}}
      onClick={() => !locked && onClick(font.id)}
      className="font-preview"
      style={{
        padding:'10px 8px', borderRadius:10, border:'none', cursor:locked?'not-allowed':'pointer',
        background: active?'var(--accent-subtle)':'var(--bg-card)',
        outline: active?'2px solid var(--accent)':'1px solid var(--border)',
        opacity: locked?.45:1, transition:'all .2s',
        display:'flex', flexDirection:'column', alignItems:'center', gap:4,
        fontFamily: font.family,
      }}>
      <span style={{ fontFamily:font.family, fontSize:'1.4rem', color:'var(--text-primary)', fontWeight:700, lineHeight:1 }}>Aa</span>
      <span style={{ fontFamily:font.family, fontSize:'.65rem', color:active?'var(--accent)':'var(--text-muted)',
        fontWeight:active?700:400, textAlign:'center', lineHeight:1.3,
        fontStyle: font.family.includes('cursive') ? 'italic' : 'normal' }}>
        {font.name}
      </span>
      {locked && (
        <span style={{ fontSize:'.5rem', color:'var(--text-muted)' }}>
          🔒 {t('themeEditor.lockedAt', { level: unlockLevelOf(font) })}
        </span>
      )}
    </motion.button>
  );
}

function RadiusPreview({ radiusId }) {
  const r = { sharp: '2px', normal: '10px', bubbly: '22px' }[radiusId] || '10px';
  return (
    <div style={{ display:'flex', gap:3, alignItems:'center', justifyContent:'center', margin:'4px 0' }}>
      {[1,2,3].map(i => (
        <div key={i} style={{ width: i===2?22:14, height:i===2?14:10, borderRadius:r,
          background: 'rgba(74,144,217,.5)', border:'1px solid rgba(74,144,217,.3)' }} />
      ))}
    </div>
  );
}

function DensityPreview({ densityId }) {
  const gaps = { compact:2, normal:5, airy:9 };
  const pads = { compact:2, normal:5, airy:9 };
  const g = gaps[densityId] || 5;
  const p = pads[densityId] || 5;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:g, padding:p,
      background:'rgba(255,255,255,.05)', borderRadius:6, margin:'4px 0', width:'100%' }}>
      {[28,20,24].map((w,i) => (
        <div key={i} style={{ height:5, borderRadius:3, width:`${w+20}px`,
          background:'rgba(74,144,217,.4)' }} />
      ))}
    </div>
  );
}

function AnimPreview({ animId }) {
  const configs = {
    vivid:  { dur:'0.15s', scale:'scale(1.08)', color:'rgba(255,200,0,.8)' },
    smooth: { dur:'0.3s',  scale:'scale(1.02)', color:'rgba(74,144,217,.8)' },
    none:   { dur:'0s',    scale:'scale(1)',    color:'rgba(150,150,150,.6)' },
  };
  const c = configs[animId] || configs.smooth;
  return (
    <div style={{ display:'flex', justifyContent:'center', gap:5, margin:'4px 0' }}>
      {[1,2,3].map(i => (
        <div key={i} style={{
          width:10, height:10, borderRadius:'50%', background:c.color,
          transition:`transform ${c.dur} ease`,
          transform: animId==='none' ? 'scale(1)' : i===2 ? c.scale : 'scale(1)',
        }} />
      ))}
    </div>
  );
}

function OptionChip({ item, selected, onClick, previewType }) {
  const active = selected === item.id;
  return (
    <motion.button
      whileHover={{scale:1.03}} whileTap={{scale:.97}}
      onClick={() => onClick(item.id)}
      style={{
        flex:1, padding:'10px 6px', borderRadius:10, border:'none', cursor:'pointer',
        background: active?'var(--accent-subtle)':'var(--bg-card)',
        outline: active?'2px solid var(--accent)':'1px solid var(--border)',
        display:'flex', flexDirection:'column', alignItems:'center', gap:3,
        transition:'all .2s', minWidth:80,
      }}>
      {previewType==='radius'  && <RadiusPreview  radiusId={item.id} />}
      {previewType==='density' && <DensityPreview densityId={item.id} />}
      {previewType==='anim'    && <AnimPreview    animId={item.id} />}
      {!previewType && <span style={{ fontSize:'1.1rem' }}>{item.emoji}</span>}
      <span style={{ fontSize:'.65rem', color:active?'var(--accent)':'var(--text-muted)',
        fontWeight:active?700:400 }}>{item.name}</span>
      {item.desc && (
        <span style={{ fontSize:'.52rem', color:'var(--text-muted)', textAlign:'center',
          lineHeight:1.2 }}>{item.desc}</span>
      )}
    </motion.button>
  );
}

function Slider({ label, emoji, value, min, max, step=1, onChange, unit='' }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
      <span style={{ fontSize:'.85rem', flexShrink:0 }}>{emoji}</span>
      <span style={{ fontSize:'.75rem', color:'var(--text-secondary)', flex:1 }}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e=>onChange(parseFloat(e.target.value))}
        style={{ width:90, accentColor:'var(--accent)', cursor:'pointer' }} />
      <span style={{ fontSize:'.72rem', color:'var(--accent)', fontWeight:700, minWidth:32, textAlign:'right' }}>
        {value}{unit}
      </span>
    </div>
  );
}

// Section heading reused inside the custom panel.
function SectionLabel({ children }) {
  return (
    <div style={{ fontSize:'.72rem',fontWeight:700,color:'var(--text-muted)',
      textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8 }}>{children}</div>
  );
}

export default function ThemeEditor({ prefs, userXp=0, onSave, onClose, customAllowed=false }) {
  const { t, formatNumber } = useTranslation();
  const [draft, setDraft] = useState({...DEFAULT_PREFERENCES, ...prefs});
  const [tab, setTab]     = useState('themes');
  const [saving, setSaving] = useState(false);
  const [styleFilter, setStyleFilter] = useState('all');

  function update(key, val) { setDraft(d=>({...d,[key]:val})); }

  // Set one custom colour override.
  function setCustomVar(key, value) {
    setDraft(d => ({ ...d, customVars: { ...(d.customVars || {}), [key]: value } }));
  }

  // Remove one custom override (clears the whole map if it becomes empty).
  function resetCustomVar(key) {
    setDraft(d => {
      const next = { ...(d.customVars || {}) };
      delete next[key];
      return { ...d, customVars: Object.keys(next).length ? next : null };
    });
  }

  // Quand on change de thème, reset les sliders aurora/blocs/cartes selon le style
  function updateTheme(themeId) {
    const t = THEMES.find(th => th.id === themeId);
    const light = t?.style === 'light' || t?.style === 'pastel';
    setDraft(d => ({
      ...d,
      themeId,
      auroraIntensity: light ? 0   : 35,
      blockOpacity:    light ? 1.0 : 0.87,
      cardOpacity:     light ? 0   : 0.5,
    }));
  }

  async function handleSave() {
    setSaving(true);
    await onSave(draft);
    setSaving(false);
    onClose();
  }

  const filteredThemes = styleFilter==='all'
    ? THEMES
    : THEMES.filter(t=>t.style===styleFilter);

  // Fonts are shown in unlock order: everything already available first, then
  // the next thing to earn. Ties keep the catalogue's own order.
  const sortedFonts = [...FONTS].sort((a,b)=>unlockXpOf(a)-unlockXpOf(b));

  const tabs = [
    { v:'themes', l:t('themeEditor.tabThemes') },
    { v:'fonts',  l:t('themeEditor.tabFonts') },
    { v:'layout', l:t('themeEditor.tabLayout') },
    // "Custom" tab is reserved for authorized accounts (see customAllowed prop).
    ...(customAllowed ? [{ v:'custom', l:t('themeEditor.tabCustom') }] : []),
  ];

  // Custom panel: resolved draft colours (for the preview + swatch seeds) and
  // the editable variables grouped into readable sections.
  const resolvedVars = resolveThemeVars(draft);
  const customGroups = [
    { title:t('themeEditor.groupBackgrounds'), test: k => k.startsWith('--bg') },
    { title:t('themeEditor.groupText'),        test: k => k.startsWith('--text') },
    { title:t('themeEditor.groupAccent'),      test: k => k.startsWith('--accent') },
    { title:t('themeEditor.groupBorders'),     test: k => k.startsWith('--border') || ['--xp-color','--success','--danger','--warning'].includes(k) },
  ];

  // Next unlock
  const allUnlockable = [...THEMES, ...FONTS].filter(i=>!isUnlocked(i,userXp)&&unlockLevelOf(i)>1);
  const nextUnlock = allUnlockable.sort((a,b)=>unlockXpOf(a)-unlockXpOf(b))[0];

  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.85)',
        backdropFilter:'blur(18px)',zIndex:500,
        display:'flex',alignItems:'center',justifyContent:'center',padding:'1rem' }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <style>{`
        @media (max-width:600px) {
          .te-modal { border-radius:16px !important; max-height:95vh !important; }
          .te-tabs button { padding:6px 8px !important; font-size:.7rem !important; }
          .te-body { padding:.8rem !important; }
          .te-footer { padding:.7rem .8rem !important; }
        }
      `}</style>
      <motion.div initial={{scale:.94,y:20}} animate={{scale:1,y:0}} exit={{scale:.94,y:20}}
        className="te-modal"
        style={{ background:'var(--bg-modal)',border:'1px solid var(--border-strong)',borderRadius:22,
          width:760,maxWidth:'100%',maxHeight:'90vh',display:'flex',flexDirection:'column',
          overflow:'hidden',boxShadow:'0 32px 80px rgba(0,0,0,.6)' }}>

        {/* Header */}
        <div style={{ padding:'1.2rem 1.5rem',borderBottom:'1px solid var(--border)',
          display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0 }}>
          <div>
            <div style={{ fontSize:'1rem',fontWeight:800,color:'var(--text-primary)' }}>🎨 {t('themeEditor.title')}</div>
            <div style={{ fontSize:'.68rem',color:'var(--text-muted)',marginTop:2 }}>
              ⚡ {t('themeEditor.xpHint', { xp: formatNumber(userXp) })}
            </div>
          </div>
          {nextUnlock && (
            <div style={{ padding:'6px 12px',borderRadius:10,
              background:'var(--accent-subtle)',border:'1px solid var(--accent-border, rgba(74,144,217,.2))',
              fontSize:'.68rem',color:'var(--accent)',textAlign:'right' }}>
              {t('themeEditor.nextUnlock')} : {nextUnlock.name || nextUnlock.emoji}<br/>
              <span style={{ color:'var(--text-muted)' }}>
                {t('themeEditor.atLevel', { level: unlockLevelOf(nextUnlock) })}
              </span>
            </div>
          )}
          <button onClick={onClose}
            style={{ background:'transparent',border:'none',color:'var(--text-muted)',
              fontSize:'1.3rem',cursor:'pointer',marginLeft:8 }}>×</button>
        </div>

        {/* Tabs */}
        <div className="te-tabs" style={{ display:'flex',gap:4,padding:'10px 1.5rem 0',flexShrink:0,borderBottom:'1px solid var(--border)',overflowX:'auto' }}>
          {tabs.map(t=>(
            <button key={t.v} onClick={()=>setTab(t.v)}
              style={{ padding:'8px 16px',borderRadius:'8px 8px 0 0',border:'none',cursor:'pointer',
                fontSize:'.78rem',fontWeight:500,whiteSpace:'nowrap',
                background:tab===t.v?'var(--bg-card)':'transparent',
                color:tab===t.v?'var(--text-primary)':'var(--text-muted)',
                borderBottom:tab===t.v?'2px solid var(--accent)':'2px solid transparent',
                transition:'all .15s' }}>
              {t.l}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="te-body" style={{ flex:1,overflowY:'auto',padding:'1.2rem 1.5rem',
          display:'flex',flexDirection:'column',gap:20,background:'var(--bg-base)' }}>

          {/* ── THÈMES ── */}
          {tab==='themes' && (
            <>
              {/* Style filter */}
              <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
                {[{v:'all',l:t('themeEditor.filterAll')},
                  {v:'dark',l:t('themeEditor.filterDark')},
                  {v:'light',l:t('themeEditor.filterLight')},
                  {v:'fluo',l:t('themeEditor.filterNeon')},
                  {v:'pastel',l:t('themeEditor.filterPastel')}
                ].map(f=>(
                  <button key={f.v} onClick={()=>setStyleFilter(f.v)}
                    style={{ padding:'5px 14px',borderRadius:20,border:'none',cursor:'pointer',
                      fontSize:'.75rem',fontWeight:styleFilter===f.v?700:400,
                      background:styleFilter===f.v?'var(--accent-subtle)':'var(--bg-card)',
                      color:styleFilter===f.v?'var(--accent)':'var(--text-muted)',
                      outline:styleFilter===f.v?'1px solid var(--accent)':'1px solid var(--border)',
                      transition:'all .15s' }}>
                    {f.l}
                  </button>
                ))}
              </div>

              <div style={{ display:'grid',
                gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))',gap:8 }}>
                {filteredThemes.slice().sort((a,b)=>unlockLevelOf(a)-unlockLevelOf(b)).map(theme=>(
                  <ThemeCard key={theme.id} theme={theme}
                    selected={draft.themeId} userXp={userXp}
                    onClick={updateTheme} />
                ))}
              </div>
            </>
          )}

          {/* ── POLICES ── */}
          {tab==='fonts' && (
            <div style={{ display:'grid',
              gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:8 }}>
              {sortedFonts.map(font=>(
                <FontCard key={font.id} font={font}
                  selected={draft.fontId} userXp={userXp}
                  onClick={v=>update('fontId',v)} />
              ))}
            </div>
          )}

          {/* ── INTERFACE ── */}
          {tab==='layout' && (
            <>
              <div>
                <div style={{ fontSize:'.75rem',fontWeight:700,color:'var(--text-muted)',
                  textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10 }}>
                  {t('themeEditor.corners')}
                </div>
                <div style={{ display:'flex',gap:8 }}>
                  {RADIUS_STYLES.map(r=><OptionChip key={r.id} item={r} previewType="radius"
                    selected={draft.radius} onClick={v=>update('radius',v)} />)}
                </div>
              </div>
              <div>
                <div style={{ fontSize:'.75rem',fontWeight:700,color:'var(--text-muted)',
                  textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10 }}>
                  {t('themeEditor.ringStyle')}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                  {RING_STYLES.map(rs => {
                    const active = (draft.ringStyle||'default') === rs.id;
                    return (
                      <motion.button key={rs.id}
                        whileHover={{scale:1.03}} whileTap={{scale:.97}}
                        onClick={()=>update('ringStyle',rs.id)}
                        style={{ padding:'10px 6px', borderRadius:10, border:'none', cursor:'pointer',
                          background: active?'var(--accent-subtle)':'var(--bg-card)',
                          outline: active?'2px solid var(--accent)':'1px solid var(--border)',
                          display:'flex', flexDirection:'column', alignItems:'center', gap:4,
                          transition:'all .2s' }}>
                        {/* Mini preview SVG */}
                        <svg width={40} height={40} viewBox="0 0 40 40" style={{transform:'rotate(-90deg)'}}>
                          <circle cx={20} cy={20} r={15} fill="none" stroke="var(--border)" strokeWidth={rs.id==='thick'?5:rs.id==='thin'?1.5:3}
                            strokeDasharray={rs.id==='dashes'?'4 3':rs.id==='dots'?'1 4':undefined}
                            strokeLinecap="round" />
                          <circle cx={20} cy={20} r={15} fill="none" stroke="var(--accent)"
                            strokeWidth={rs.id==='thick'?5:rs.id==='thin'?1.5:3}
                            strokeDasharray={2*Math.PI*15}
                            strokeDashoffset={2*Math.PI*15*0.3}
                            strokeLinecap="round"
                            style={{filter: rs.id==='glow'?'drop-shadow(0 0 4px var(--accent))':'none'}} />
                        </svg>
                        <span style={{ fontSize:'.62rem', color:active?'var(--accent)':'var(--text-muted)',
                          fontWeight:active?700:400, textAlign:'center' }}>{rs.name}</span>
                        <span style={{ fontSize:'.5rem', color:'var(--text-muted)', textAlign:'center' }}>{rs.desc}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div style={{ fontSize:'.75rem',fontWeight:700,color:'var(--text-muted)',
                  textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10 }}>
                  {t('themeEditor.fineTuning')}
                </div>
                <div style={{ display:'flex',flexDirection:'column',gap:12,
                  padding:'12px',borderRadius:12,background:'var(--bg-card)',
                  border:'1px solid var(--border)' }}>
                  <Slider emoji="🌌" label={t('themeEditor.auroraIntensity')} unit="%" value={draft.auroraIntensity}
                    min={0} max={100} onChange={v=>update('auroraIntensity',v)} />
                  <Slider emoji="📅" label={t('themeEditor.blockOpacity')} unit="%" value={Math.round(draft.blockOpacity*100)}
                    min={40} max={100} onChange={v=>update('blockOpacity',v/100)} />
                </div>
              </div>

              <div>
                <div style={{ fontSize:'.75rem',fontWeight:700,color:'var(--text-muted)',
                  textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10 }}>
                  {t('themeEditor.cardTransparency')}
                </div>
                <div style={{ display:'flex',flexDirection:'column',gap:8,padding:'12px',
                  borderRadius:12,background:'var(--bg-card)',
                  border:'1px solid var(--border)' }}>
                  <Slider emoji="🪟" label={t('themeEditor.cardOpacity')} unit=""
                    value={Math.round((draft.cardOpacity??0.5)*100)}
                    min={0} max={100}
                    onChange={v=>update('cardOpacity',v/100)} />
                  <div style={{ display:'flex',justifyContent:'space-between',
                    fontSize:'.62rem',color:'var(--text-muted)' }}>
                    <span>{t('themeEditor.fullyOpaque')}</span>
                    <span>{t('themeEditor.fullyGlass')}</span>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize:'.75rem',fontWeight:700,color:'var(--text-muted)',
                  textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10 }}>
                  {t('themeEditor.textColor')}
                </div>
                <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',
                  gap:10,flexWrap:'wrap',padding:'12px',borderRadius:12,
                  background:'var(--bg-card)',border:'1px solid var(--border)' }}>
                  <div style={{ fontSize:'.7rem',color:'var(--text-muted)' }}>
                    {t('themeEditor.autoFollowsTheme')}
                  </div>
                  <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                    <button onClick={()=>update('textColor','auto')}
                      style={{ padding:'6px 14px',borderRadius:8,border:'none',cursor:'pointer',
                        fontSize:'.72rem',fontWeight:600,
                        background:(!draft.textColor||draft.textColor==='auto')?'var(--accent-subtle)':'var(--bg-card-hover)',
                        color:(!draft.textColor||draft.textColor==='auto')?'var(--accent)':'var(--text-muted)' }}>
                      {t('themeEditor.auto')}
                    </button>
                    <input type="color" aria-label={t('themeEditor.textColor')}
                      value={draft.textColor&&draft.textColor!=='auto'?draft.textColor:'#ffffff'}
                      onChange={e=>update('textColor',e.target.value)}
                      style={{ width:34,height:34,borderRadius:9,border:'2px solid var(--border)',
                        cursor:'pointer',background:'transparent',padding:2 }} />
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize:'.75rem',fontWeight:700,color:'var(--text-muted)',
                  textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10 }}>
                  {t('themeEditor.borderColor')}
                </div>
                <div style={{ display:'flex',gap:8,alignItems:'center',flexWrap:'wrap' }}>
                  {[
                    {v:'neutral', l:t('themeEditor.neutral'), c:'var(--border-strong)'},
                    {v:'accent',  l:t('themeEditor.accent'),  c:'var(--accent)'},
                  ].map(opt=>(
                    <motion.button key={opt.v}
                      whileHover={{scale:1.03}} whileTap={{scale:.97}}
                      onClick={()=>update('cardBorderColor',opt.v)}
                      style={{ padding:'8px 16px',borderRadius:10,border:'none',cursor:'pointer',
                        fontSize:'.75rem',fontWeight:500,
                        background:(draft.cardBorderColor||'neutral')===opt.v?'var(--accent-subtle)':'var(--bg-card)',
                        color:(draft.cardBorderColor||'neutral')===opt.v?'var(--accent)':'var(--text-muted)',
                        outline:(draft.cardBorderColor||'neutral')===opt.v?'2px solid var(--accent)':'1px solid var(--border)' }}>
                      <div style={{ width:12,height:12,borderRadius:3,
                        background:opt.c,margin:'0 auto 4px',
                        border:'1px solid var(--border)' }}/>
                      {opt.l}
                    </motion.button>
                  ))}
                  <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                    <input type="color"
                      value={draft.cardBorderColor?.startsWith('#')?draft.cardBorderColor:'#4A90D9'}
                      onChange={e=>update('cardBorderColor',e.target.value)}
                      style={{ width:34,height:34,borderRadius:9,border:'2px solid var(--border)',
                        cursor:'pointer',background:'transparent',padding:2 }} />
                    <span style={{ fontSize:'.68rem',color:'var(--text-muted)' }}>{t('themeEditor.freeColor')}</span>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize:'.75rem',fontWeight:700,color:'var(--text-muted)',
                  textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10 }}>
                  {t('themeEditor.borderWidth')}
                </div>
                <div style={{ display:'flex',flexDirection:'column',gap:8,padding:'12px',
                  borderRadius:12,background:'rgba(255,255,255,.03)',
                  border:'1px solid rgba(255,255,255,.07)' }}>
                  <Slider emoji="▭" label={t('themeEditor.thickness')} unit="px"
                    value={draft.borderWidth ?? 1}
                    min={0} max={3} step={0.5}
                    onChange={v=>update('borderWidth',v)} />
                  <div style={{ display:'flex',justifyContent:'space-between',
                    fontSize:'.62rem',color:'var(--text-muted)' }}>
                    <span>{t('themeEditor.invisible')}</span>
                    <span>{t('themeEditor.thick')}</span>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize:'.75rem',fontWeight:700,color:'var(--text-muted)',
                  textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10 }}>
                  {t('themeEditor.tabColor')}
                </div>
                <div style={{ display:'flex',gap:8,flexWrap:'wrap',alignItems:'center' }}>
                  {[
                    {v:'individual', l:t('themeEditor.tabIndividual'), desc:t('themeEditor.tabIndividualDesc')},
                    {v:'accent',     l:t('themeEditor.tabAccent'),     desc:t('themeEditor.tabAccentDesc')},
                    {v:'uniform',    l:t('themeEditor.tabUniform'),    desc:t('themeEditor.tabUniformDesc')},
                  ].map(opt=>(
                    <motion.button key={opt.v}
                      whileHover={{scale:1.03}} whileTap={{scale:.97}}
                      onClick={()=>update('tabColorMode',opt.v)}
                      style={{ padding:'8px 12px',borderRadius:10,border:'none',cursor:'pointer',
                        fontSize:'.72rem',fontWeight:500,textAlign:'center',
                        background:(draft.tabColorMode||'individual')===opt.v?'var(--accent-subtle)':'var(--bg-card)',
                        color:(draft.tabColorMode||'individual')===opt.v?'var(--accent)':'var(--text-muted)',
                        outline:(draft.tabColorMode||'individual')===opt.v?'2px solid var(--accent)':'1px solid var(--border)' }}>
                      <div style={{ fontSize:'.6rem',color:'var(--text-muted)',marginTop:2 }}>{opt.desc}</div>
                      {opt.l}
                    </motion.button>
                  ))}
                  {(draft.tabColorMode||'individual')==='uniform' && (
                    <input type="color"
                      value={draft.tabUniformColor||'#4A90D9'}
                      onChange={e=>update('tabUniformColor',e.target.value)}
                      style={{ width:34,height:34,borderRadius:9,border:'2px solid var(--border)',
                        cursor:'pointer',background:'transparent',padding:2 }} />
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── CUSTOM THEME (authorized accounts only) ── */}
          {tab==='custom' && customAllowed && (
            <div style={{ display:'flex',flexDirection:'column',gap:18 }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,flexWrap:'wrap' }}>
                <div>
                  <div style={{ fontSize:'.82rem',fontWeight:700,color:'var(--text-primary)' }}>{t('themeEditor.customTitle')}</div>
                  <div style={{ fontSize:'.64rem',color:'var(--text-muted)',marginTop:2 }}>
                    {t('themeEditor.customHint')}
                  </div>
                </div>
                <button onClick={()=>update('customVars',null)}
                  style={{ padding:'6px 12px',borderRadius:8,border:'1px solid var(--border)',
                    background:'transparent',color:'var(--text-muted)',cursor:'pointer',fontSize:'.72rem' }}>
                  {t('themeEditor.resetAll')}
                </button>
              </div>

              {/* Live preview (fake page) — sticky so it stays visible while scrolling pickers */}
              <div style={{ position:'sticky', top:-4, zIndex:2,
                background:'var(--bg-base)', paddingBottom:4 }}>
                <SectionLabel>{t('themeEditor.livePreview')}</SectionLabel>
                <ThemePreview vars={resolvedVars} />
              </div>

              {/* Grouped colour pickers */}
              {customGroups.map(group => {
                const items = THEME_EDITABLE_VARS.filter(v => group.test(v.key));
                if (!items.length) return null;
                return (
                  <div key={group.title}>
                    <SectionLabel>{group.title}</SectionLabel>
                    <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(165px,1fr))',gap:8 }}>
                      {items.map(item => {
                        const overridden = draft.customVars?.[item.key] != null;
                        const value = overridden ? draft.customVars[item.key] : resolvedVars[item.key];
                        return (
                          <ColorVarRow key={item.key} item={item}
                            overridden={overridden} value={value}
                            onPick={v => setCustomVar(item.key, v)}
                            onReset={() => resetCustomVar(item.key)} />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── CONFORT ── */}
        </div>

        {/* Footer */}
        <div className="te-footer" style={{ padding:'1rem 1.5rem',borderTop:'1px solid var(--border)',
          display:'flex',gap:8,alignItems:'center',flexShrink:0,flexWrap:'wrap' }}>
          <button onClick={()=>setDraft({...DEFAULT_PREFERENCES})}
            style={{ padding:'9px 14px',borderRadius:10,border:'1px solid var(--border)',
              background:'transparent',color:'var(--text-muted)',cursor:'pointer',
              fontSize:'.78rem' }}>
            {t('themeEditor.reset')}
          </button>
          <div style={{ flex:1,fontSize:'.68rem',color:'var(--text-muted)',minWidth:60 }}>
            {getTheme(draft.themeId).emoji} {getTheme(draft.themeId).name}
            {' · '}{FONTS.find(f=>f.id===draft.fontId)?.name||'Inter'}
          </div>
          <button onClick={onClose}
            style={{ padding:'9px 18px',borderRadius:10,border:'1px solid var(--border)',
              background:'transparent',color:'var(--text-secondary)',cursor:'pointer',
              fontSize:'.82rem' }}>
            {t('common.cancel')}
          </button>
          <motion.button whileHover={{scale:1.02}} whileTap={{scale:.98}}
            onClick={handleSave} disabled={saving}
            style={{ padding:'9px 24px',borderRadius:10,border:'none',
              background:'linear-gradient(135deg,#4A90D9,#6366f1)',
              color:'#fff',fontWeight:700,cursor:'pointer',fontSize:'.85rem',
              boxShadow:'0 4px 20px rgba(74,144,217,.3)' }}>
            {saving?'…':t('themeEditor.apply')}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}