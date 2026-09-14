/**
 * ErrorBoundary — turns a white screen into something the student can act on.
 * --------------------------------------------------------------------------
 * A render-time exception anywhere below this component unmounts the whole
 * React tree. Without a boundary the user is left with a blank page and no way
 * back, which is a bad place to be the night before an exam.
 *
 * Kept as a class because `componentDidCatch` has no hook equivalent.
 *
 * Props:
 *   children  — the tree to protect
 *   t         — translate function, passed in because hooks are unavailable here
 *   onReset   — optional; called when the user asks to go back, before the
 *               boundary clears its error state
 */

import { Component } from 'react';
import { useTranslation } from '../i18n';

class ErrorBoundaryView extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // No remote error reporting is wired up yet; the console is what we have.
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  handleRetry = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    // A class component cannot use hooks, so the parent hands us `t`.
    // Falling back to the key keeps the screen readable if it is ever omitted.
    const t = this.props.t || (k => k);

    return (
      <div role="alert" style={{ minHeight: '70vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '2rem', fontFamily: 'var(--font-family, system-ui)' }}>
        <div style={{ maxWidth: 420, textAlign: 'center', display: 'flex',
          flexDirection: 'column', alignItems: 'center', gap: 14 }}>

          {/* A broken branch: something snapped, nothing is lost. */}
          <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
            <path d="M20 54 L28 30" stroke="var(--text-muted)" strokeWidth="4" strokeLinecap="round" fill="none" />
            <path d="M36 30 L44 12" stroke="var(--text-muted)" strokeWidth="4" strokeLinecap="round"
              fill="none" opacity=".45" />
            <path d="M28 30 q6 -5 12 -2" stroke="var(--text-muted)" strokeWidth="3" strokeLinecap="round"
              fill="none" opacity=".3" strokeDasharray="2 5" />
            <circle cx="46" cy="26" r="4" fill="var(--accent)" opacity=".6" />
          </svg>

          <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            {t('system.crashTitle')}
          </h1>
          <p style={{ margin: 0, fontSize: '.82rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            {t('system.crashBody')}
          </p>

          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button onClick={this.handleRetry}
              style={{ padding: '9px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: 'var(--accent)', color: '#fff', fontSize: '.82rem', fontWeight: 700 }}>
              {t('system.crashRetry')}
            </button>
            <button onClick={() => window.location.reload()}
              style={{ padding: '9px 20px', borderRadius: 12, cursor: 'pointer',
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--text-secondary)', fontSize: '.82rem', fontWeight: 600 }}>
              {t('system.crashReload')}
            </button>
          </div>

          {import.meta.env.DEV && (
            <pre style={{ marginTop: 10, maxWidth: '100%', overflowX: 'auto', textAlign: 'left',
              fontSize: '.66rem', lineHeight: 1.5, color: 'var(--text-muted)',
              background: 'var(--bg-card)', borderRadius: 10, padding: 10 }}>
              {String(this.state.error?.stack || this.state.error)}
            </pre>
          )}
        </div>
      </div>
    );
  }
}

/**
 * Hooks are unavailable inside a class, so this thin wrapper reads the active
 * language and hands the class its translate function. Rendered inside
 * <LanguageProvider>, like every other translated component.
 */
export default function ErrorBoundary(props) {
  const { t } = useTranslation();
  return <ErrorBoundaryView {...props} t={t} />;
}
