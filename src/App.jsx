import { useState, lazy, Suspense } from 'react';
import { MotionConfig } from 'motion/react';
import { useAuth } from './hooks/useAuth';
import LoadingScreen from './components/LoadingScreen';
import ErrorBoundary from './components/ErrorBoundary';
import Toaster from './components/Toaster';
import ThemeProvider from './themes/ThemeProvider';
import { LanguageProvider } from './i18n';
import { DEFAULT_PREFERENCES } from './themes/themes';
import { useAppConfig } from './lib/appConfig';
import { isAdmin } from './lib/admin';
import { useAccountPrefs } from './lib/accountPrefs';
import MaintenanceScreen from './components/MaintenanceScreen';
import SystemBanner from './components/SystemBanner';

// Split the two top-level surfaces into separate chunks: a logged-out visitor
// loads only the marketing page (with its heavy 3D/GL background), and never
// downloads the authenticated app tree — and vice-versa. LoadingScreen stays a
// static import so the Suspense fallback shows instantly.
const LandingPage = lazy(() => import('./pages/LandingPage'));
const AppPage     = lazy(() => import('./pages/AppPage'));

/**
 * Visitor preferences — the logged-out landing page only (in practice, its
 * language). Accounts never read these: they have their own, see accountPrefs.
 */
function loadVisitorPrefs() {
  try { return JSON.parse(localStorage.getItem('blokly-prefs-v3')) || DEFAULT_PREFERENCES; }
  catch { return DEFAULT_PREFERENCES; }
}

export default function App() {
  const { user, loading } = useAuth();
  const [visitorPrefs, setVisitorPrefs] = useState(loadVisitorPrefs);
  // Signed in, the account's own prefs take over: saved to the account, the
  // same on every browser, never shared with another account on this one.
  const [accountPrefs, setAccountPrefs] = useAccountPrefs(user);
  const [userXp, setUserXp] = useState(0);
  const [devUnlocked, setDevUnlocked] = useState(false);
  const config = useAppConfig();
  const admin = isAdmin(user);
  // Someone locked out by maintenance can step back to the public home page
  // rather than being stuck on a dead end. They stay signed in, so lifting
  // maintenance drops them straight back into the app.
  const [homeFromMaintenance, setHomeFromMaintenance] = useState(false);
  // Administrators always get through — the switch must never be able to lock
  // the person who has to turn it back off. Anything other than an explicit
  // `maintenance: true` we actually received also gets through (see appConfig).
  const blocked = config.maintenance && !admin;

  function handleVisitorPrefs(p) {
    setVisitorPrefs(p);
    try { localStorage.setItem('blokly-prefs-v3', JSON.stringify(p)); } catch { /* ignore */ }
  }

  if (loading) return <LoadingScreen />;

  if (!user) return (
    <MotionConfig reducedMotion="user">
    <ThemeProvider prefs={visitorPrefs} userXp={0}>
      <LanguageProvider lang={visitorPrefs.lang}>
        <ErrorBoundary>
          <Suspense fallback={<LoadingScreen />}>
            <LandingPage lang={visitorPrefs.lang} onLangChange={lang => handleVisitorPrefs({ ...visitorPrefs, lang })} />
          </Suspense>
        </ErrorBoundary>
        <Toaster />
      </LanguageProvider>
    </ThemeProvider>
    </MotionConfig>
  );

  const prefs = accountPrefs;

  return (
    <MotionConfig reducedMotion="user">
    <ThemeProvider prefs={prefs} userXp={devUnlocked ? 999999 : userXp}>
      <LanguageProvider lang={prefs.lang}>
        {blocked ? (
          homeFromMaintenance ? (
            <Suspense fallback={<LoadingScreen />}>
              <LandingPage lang={prefs.lang} onLangChange={lang => setAccountPrefs({ ...prefs, lang })} />
            </Suspense>
          ) : (
            <MaintenanceScreen
              message={config.systemMessage}
              onHome={() => setHomeFromMaintenance(true)} />
          )
        ) : (
          <ErrorBoundary>
            {/* Announcement / "maintenance is on" notice, above everything. */}
            <SystemBanner message={config.systemMessage} maintenance={config.maintenance && admin} />
            <Suspense fallback={<LoadingScreen />}>
              <AppPage user={user} prefs={prefs} setPrefs={setAccountPrefs} setUserXp={setUserXp} devUnlocked={devUnlocked} setDevUnlocked={setDevUnlocked} />
            </Suspense>
          </ErrorBoundary>
        )}
        <Toaster />
      </LanguageProvider>
    </ThemeProvider>
    </MotionConfig>
  );
}