import { useEffect } from 'react';
import { applyTheme, GOOGLE_FONTS_URL } from './themes';

let fontsLoaded = false;

export default function ThemeProvider({ prefs, userXp, children }) {
  // Charger Google Fonts une seule fois
  useEffect(() => {
    if (fontsLoaded) return;
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = GOOGLE_FONTS_URL;
    document.head.appendChild(link);
    fontsLoaded = true;
  }, []);

  // Appliquer le thème à chaque changement
  useEffect(() => {
    if (!prefs) return;
    applyTheme(
      prefs.themeId  || 'nuit',
      prefs.fontId   || 'inter',
      prefs.radius   || 'normal',
      userXp || 0,
      prefs
    );
    // Force la police sur tous les éléments
    const style = document.getElementById('blokly-font-override') || document.createElement('style');
    style.id = 'blokly-font-override';
    style.textContent = `
      *:not(.font-preview):not(.font-preview *) { font-family: var(--font-family) !important; }
    `;
    if (!document.getElementById('blokly-font-override')) document.head.appendChild(style);
  }, [prefs, userXp]);

  return children;
}