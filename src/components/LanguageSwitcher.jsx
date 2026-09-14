/**
 * LanguageSwitcher — picks the interface language.
 *
 * The app already shipped four locales but had no way to change language from
 * the UI; the choice lived only in the persisted `lang` preference. This drops
 * the same control into the landing-page nav and the authenticated top bar.
 *
 * `variant` only swaps the palette: "app" reads the theme's CSS variables,
 * "landing" uses the marketing page's fixed dark glass.
 */

import { useEffect, useRef, useState } from 'react';
import { Globe, Check } from 'lucide-react';
import { LANGUAGES, useTranslation } from '../i18n';

export default function LanguageSwitcher({ lang, onChange, variant = 'app' }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const current = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];
  const landing = variant === 'landing';

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onPointer(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const border = landing ? 'rgba(255,255,255,.16)' : 'var(--border)';
  const bg = landing ? 'rgba(255,255,255,.05)' : 'var(--bg-card)';
  const text = landing ? 'rgba(255,255,255,.82)' : 'var(--text-secondary)';
  const menuBg = landing ? 'rgba(14,14,26,.97)' : 'var(--bg-modal)';

  return (
    <div ref={rootRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t('common.language')} — ${current.label}`}
        title={t('common.language')}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: landing ? '7px 12px' : '4px 8px',
          borderRadius: landing ? 9 : 8,
          border: `1px solid ${border}`, background: bg, color: text,
          fontSize: landing ? '.82rem' : '.7rem', fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1,
          transition: 'border-color .2s, color .2s',
        }}>
        <Globe size={landing ? 15 : 13} strokeWidth={1.9} />
        {current.code.toUpperCase()}
      </button>

      {open && (
        <ul role="listbox" aria-label={t('common.language')}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300,
            listStyle: 'none', margin: 0, padding: 4, minWidth: 152,
            borderRadius: 12, background: menuBg,
            border: `1px solid ${landing ? 'rgba(255,255,255,.14)' : 'var(--border-strong)'}`,
            boxShadow: '0 14px 40px rgba(0,0,0,.5)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          }}>
          {LANGUAGES.map(l => {
            const active = l.code === lang;
            return (
              <li key={l.code} role="option" aria-selected={active}>
                <button type="button"
                  onClick={() => { onChange(l.code); setOpen(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                    padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: active
                      ? (landing ? 'rgba(74,144,217,.18)' : 'var(--accent-subtle)')
                      : 'transparent',
                    color: active
                      ? (landing ? '#9ec5f5' : 'var(--accent)')
                      : (landing ? 'rgba(255,255,255,.72)' : 'var(--text-secondary)'),
                    fontSize: '.8rem', fontWeight: active ? 700 : 500,
                    fontFamily: 'inherit', textAlign: 'left',
                  }}>
                  <span style={{ fontSize: '1rem', lineHeight: 1 }}>{l.flag}</span>
                  <span style={{ flex: 1 }}>{l.label}</span>
                  {active && <Check size={13} strokeWidth={2.6} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
