/**
 * End-of-phase chime — the ascending three-note beep that closes a timer.
 * --------------------------------------------------------------------------
 * Shared by the solo study timer and live group sessions so every focus block
 * ends on the same sound. Built with the Web Audio API (no asset to load) and
 * fully guarded: a browser that blocks audio simply stays silent.
 */

/** End-of-timer chime (ascending three-note beep). */
export function playChime(volume = 0.6) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0, now + i * 0.18);
      gain.gain.linearRampToValueAtTime(volume, now + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.18 + 0.5);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now + i * 0.18); osc.stop(now + i * 0.18 + 0.5);
    });
    setTimeout(() => { try { ctx.close(); } catch { /* ignore */ } }, 1500);
  } catch { /* ignore */ }
}
