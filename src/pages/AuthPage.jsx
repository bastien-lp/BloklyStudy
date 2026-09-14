/**
 * AuthPage — Email/password + Google sign-in, with sign-up and password reset.
 * Rendered pre-login from LandingPage (inside the LanguageProvider, so the
 * language follows the persisted preference).
 *
 * Props: { onBack, defaultTab }  // defaultTab: 'login' | 'signup'
 */

import { useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../firebase/config';
import { useTranslation } from '../i18n';

// Firebase error code → i18n key.
const ERR_KEYS = {
  'auth/invalid-email': 'auth.errInvalidEmail',
  'auth/user-not-found': 'auth.errUserNotFound',
  'auth/wrong-password': 'auth.errWrongPassword',
  'auth/email-already-in-use': 'auth.errEmailInUse',
  'auth/weak-password': 'auth.errWeakPassword',
  'auth/too-many-requests': 'auth.errTooManyRequests',
  'auth/popup-closed-by-user': 'auth.errPopupClosed',
};

export default function AuthPage({ onBack, defaultTab = 'login' }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState(defaultTab);
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [pseudo, setPseudo] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  function firebaseErr(code) {
    return t(ERR_KEYS[code] || 'auth.errGeneric');
  }

  async function doLogin() {
    setErr(''); setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (e) { setErr(firebaseErr(e.code)); }
    setLoading(false);
  }

  async function doSignup() {
    setErr('');
    if (!pseudo.trim()) return setErr(t('auth.errNoPseudo'));
    if (pass !== pass2) return setErr(t('auth.errPassMismatch'));
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await updateProfile(cred.user, { displayName: pseudo.trim() });
    } catch (e) { setErr(firebaseErr(e.code)); }
    setLoading(false);
  }

  async function doGoogle() {
    setErr(''); setLoading(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) { setErr(firebaseErr(e.code)); }
    setLoading(false);
  }

  async function doForgot() {
    if (!email) return setErr(t('auth.errNoEmail'));
    try {
      await sendPasswordResetEmail(auth, email);
      setErr(t('auth.resetSent'));
    } catch (e) { setErr(firebaseErr(e.code)); }
  }

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: '.9rem', marginBottom: 10, fontFamily: 'inherit' };

  const googleSvg = <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.7 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.5 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-8 20-20 0-1.3-.1-2.7-.4-4z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.2 6.5 29.4 4 24 4 16.3 4 9.7 8.4 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 10-1.9 13.6-5l-6.3-5.1C29.6 35.6 26.9 36 24 36c-5.2 0-9.6-2.9-11.3-7L6 33.8C9.5 39.7 16.3 44 24 44z" /><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.2-2.3 4-4.2 5.3l6.3 5.1C41.2 35.3 44 30 44 24c0-1.3-.1-2.7-.4-4z" /></svg>;

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0f0f1a 0%,#1a1a2e 50%,#0f2040 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, fontFamily: 'sans-serif' }}>
      <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,.4)', fontSize: '.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>← {t('auth.backHome')}</button>
      <div style={{ background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 16, padding: '2.5rem', width: 400, maxWidth: '95vw', backdropFilter: 'blur(20px)' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: '2rem', justifyContent: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ width: 32, height: 8, borderRadius: 3, background: '#E74C3C' }} />
            <div style={{ width: 32, height: 8, borderRadius: 3, background: '#F1C40F', marginLeft: 5 }} />
            <div style={{ width: 32, height: 8, borderRadius: 3, background: '#27AE60', marginLeft: 10 }} />
          </div>
          <div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#fff' }}>Blokly</div>
            <div style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.5)', letterSpacing: '.3em', textTransform: 'uppercase' }}>Study</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: '1.5rem', background: 'rgba(255,255,255,.05)', padding: 4, borderRadius: 8 }}>
          {['login', 'signup'].map(tb => (
            <button key={tb} onClick={() => { setTab(tb); setErr(''); }}
              style={{ flex: 1, padding: 8, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: '.85rem', fontWeight: 500, background: tab === tb ? '#4A90D9' : 'transparent', color: tab === tb ? '#fff' : 'rgba(255,255,255,.5)', transition: 'all .2s' }}>
              {tb === 'login' ? t('auth.tabLogin') : t('auth.tabSignup')}
            </button>
          ))}
        </div>

        {/* Inputs */}
        {tab === 'signup' && (
          <input value={pseudo} onChange={e => setPseudo(e.target.value)} placeholder={t('auth.pseudoPlaceholder')} style={inputStyle} />
        )}
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder={t('auth.email')} style={inputStyle} />
        <input value={pass} onChange={e => setPass(e.target.value)} type="password" placeholder={t('auth.password')} style={inputStyle} />
        {tab === 'signup' && (
          <input value={pass2} onChange={e => setPass2(e.target.value)} type="password" placeholder={t('auth.confirmPassword')} style={inputStyle} />
        )}
        {tab === 'login' && (
          <div style={{ textAlign: 'right', marginBottom: 8 }}>
            <button onClick={doForgot} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', fontSize: '.75rem', cursor: 'pointer' }}>{t('auth.forgot')}</button>
          </div>
        )}

        <button onClick={tab === 'login' ? doLogin : doSignup} disabled={loading}
          style={{ width: '100%', padding: 11, border: 'none', borderRadius: 8, background: '#4A90D9', color: '#fff', fontSize: '.9rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? .5 : 1 }}>
          {loading ? t('common.loading') : tab === 'login' ? t('auth.login') : t('auth.createAccount')}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0', color: 'rgba(255,255,255,.3)', fontSize: '.78rem' }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.1)' }} />
          {t('auth.or')}
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.1)' }} />
        </div>

        <button onClick={doGoogle} disabled={loading}
          style={{ width: '100%', padding: 11, border: '1px solid rgba(255,255,255,.2)', borderRadius: 8, background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: '.9rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          {googleSvg} {t('auth.google')}
        </button>

        {err && <div style={{ fontSize: '.8rem', textAlign: 'center', marginTop: 8, color: err.startsWith('✓') ? '#86efac' : '#fca5a5' }}>{err}</div>}
      </div>
    </div>
  );
}