/**
 * The quiz's backing track — generated, never downloaded.
 * --------------------------------------------------------------------------
 * A short upbeat loop for the live group quiz: a four-chord progression with
 * a bouncing arpeggio, a soft kick on the beat and a hat on the offbeat. Built
 * with the Web Audio API like the end-of-timer chime (lib/chime.js), so it
 * costs no asset, no bandwidth and nothing to cache.
 *
 * How it stays in time: notes are scheduled AHEAD on the audio clock, a slice
 * at a time, from a timer that only decides what comes next. A `setInterval`
 * firing late (a busy tab, a slow phone) therefore cannot make the music
 * stutter — the audio hardware already knows what to play.
 *
 * Every entry point is guarded: a browser that blocks audio, an autoplay
 * policy or a missing AudioContext simply leaves the quiz silent.
 *
 * Volume is deliberately low: this plays under a question someone is reading.
 */

const BPM = 112;
const BEAT = 60 / BPM;              // seconds per beat
const STEP = BEAT / 2;              // the loop is written in eighth notes
const LOOKAHEAD_MS = 25;            // how often we look at the queue
const SCHEDULE_AHEAD = 0.25;        // how far ahead we commit notes, in seconds

/** Four bars, one chord each: vi – IV – I – V in A minor / C major. */
const CHORDS = [
  [220.00, 261.63, 329.63],         // A  C  E
  [174.61, 220.00, 261.63],         // F  A  C
  [261.63, 329.63, 392.00],         // C  E  G
  [196.00, 246.94, 293.66],         // G  B  D
];
/** Which note of the chord the arpeggio plays, eighth note by eighth note. */
const ARP = [0, 1, 2, 1, 0, 2, 1, 2];

/**
 * Creates a player. Nothing is heard until `start()` is called from a user
 * gesture — browsers require that, and the quiz always has one (join, start).
 *
 * @returns {{ start: Function, stop: Function, playing: Function }}
 */
export function createQuizMusic({ volume = 0.1 } = {}) {
  let ctx = null;
  let master = null;
  let timer = null;
  let step = 0;                     // eighth note since the start
  let nextTime = 0;                 // when that step should sound

  function tone({ freq, at, dur, type = 'triangle', gain = 1, glideTo = null }) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, at + dur);
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(gain, at + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(env);
    env.connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  /** A hat: a very short burst of noise through a high-pass. */
  function hat(at) {
    const frames = Math.floor(ctx.sampleRate * 0.04);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    const env = ctx.createGain();
    env.gain.value = 0.25;
    src.connect(hp); hp.connect(env); env.connect(master);
    src.start(at);
  }

  /** One eighth note of the loop. */
  function scheduleStep(n, at) {
    const bar = Math.floor(n / 8) % CHORDS.length;
    const chord = CHORDS[bar];
    const inBar = n % 8;

    // Bass: the root, on the first and the fifth eighth note.
    if (inBar === 0 || inBar === 4) {
      tone({ freq: chord[0] / 2, at, dur: BEAT * 0.9, type: 'sine', gain: 0.5 });
    }
    // Kick: every beat, a short drop.
    if (inBar % 2 === 0) {
      tone({ freq: 140, glideTo: 55, at, dur: 0.16, type: 'sine', gain: 0.65 });
    }
    // Hat: the offbeats, so the loop moves.
    if (inBar % 2 === 1) hat(at);
    // Arpeggio: the melody on top, an octave up on the last bar for a lift.
    const lift = bar === CHORDS.length - 1 ? 2 : 1;
    tone({ freq: chord[ARP[inBar]] * lift, at, dur: STEP * 0.85, type: 'triangle', gain: 0.22 });
  }

  function pump() {
    if (!ctx) return;
    while (nextTime < ctx.currentTime + SCHEDULE_AHEAD) {
      scheduleStep(step, nextTime);
      step++;
      nextTime += STEP;
    }
  }

  function start() {
    if (ctx) return true;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      // Fade in, so the quiz does not slam into the music.
      master.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.8);
      ctx.resume?.().catch(() => {});
      step = 0;
      nextTime = ctx.currentTime + 0.1;
      pump();
      timer = setInterval(pump, LOOKAHEAD_MS);
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    const dying = ctx;
    const gain = master;
    ctx = null;
    master = null;
    if (!dying) return;
    try {
      // Fade out before closing: a hard stop clicks.
      gain.gain.cancelScheduledValues(dying.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, dying.currentTime);
      gain.gain.linearRampToValueAtTime(0.0001, dying.currentTime + 0.25);
    } catch { /* already gone */ }
    setTimeout(() => { try { dying.close(); } catch { /* ignore */ } }, 400);
  }

  return { start, stop, playing: () => !!ctx };
}
