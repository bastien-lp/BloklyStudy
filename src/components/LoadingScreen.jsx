export default function LoadingScreen() {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'linear-gradient(135deg,#0f0f1a 0%,#1a1a2e 50%,#0f2040 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ width: 32, height: 8, borderRadius: 3, background: '#E74C3C', animation: 'pulse 1.2s ease-in-out infinite' }} />
          <div style={{ width: 32, height: 8, borderRadius: 3, background: '#F1C40F', animation: 'pulse 1.2s ease-in-out infinite', animationDelay: '0.2s' }} />
          <div style={{ width: 32, height: 8, borderRadius: 3, background: '#27AE60', animation: 'pulse 1.2s ease-in-out infinite', animationDelay: '0.4s' }} />
        </div>
        <div>
          <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#fff', fontFamily: 'sans-serif' }}>Blokly</div>
          <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.3em', textTransform: 'uppercase', fontFamily: 'sans-serif' }}>Study</div>
        </div>
      </div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', fontFamily: 'sans-serif' }}>Chargement…</div>
      <style>{`
        @keyframes pulse {
          0%,100% { opacity: 0.4; transform: scaleX(1); }
          50% { opacity: 1; transform: scaleX(1.08); }
        }
      `}</style>
    </div>
  );
}