/**
 * Ambient soundscapes for the focus timer — Web Audio, no audio files.
 * --------------------------------------------------------------------------
 * Everything is synthesised at runtime: nothing to download, nothing to cache,
 * and the loops never repeat audibly because the random events (crackles,
 * birds, crickets) are scheduled, not baked into a buffer.
 *
 * What was wrong before this module existed:
 *   - "Waves" and "Forest" were the SAME sound — raw white noise, twice.
 *   - "Fire" was three constant sawtooth drones, i.e. a buzz, not a fire.
 *   - "Alpha" was a single 10 Hz sine. Human hearing stops around 20 Hz, so it
 *     played essentially nothing. Alpha entrainment needs a BINAURAL beat:
 *     two audible tones a few Hz apart, one in each ear.
 *   - Sounds started and stopped at full gain, so every start/stop clicked.
 *
 * Each ambience is built from a noise bed (white / pink / brown), shaped by
 * filters and slow LFOs, plus optional scheduled one-shot events.
 *
 * `createAmbience()` returns { setVolume, stop } — both safe to call at any
 * time, and `stop()` fades out before closing the context so it never clicks.
 */

/** Ambience catalogue. `icon` names map to lucide components in the UI. */
export const AMBIENCES = [
  { id: 'none',   labelKey: 'study.soundNone',   icon: 'VolumeX' },
  { id: 'rain',   labelKey: 'study.soundRain',   icon: 'CloudRain' },
  { id: 'waves',  labelKey: 'study.soundWaves',  icon: 'Waves' },
  { id: 'fire',   labelKey: 'study.soundFire',   icon: 'Flame' },
  { id: 'forest', labelKey: 'study.soundForest', icon: 'Trees' },
  { id: 'stream', labelKey: 'study.soundStream', icon: 'Droplets' },
  { id: 'night',  labelKey: 'study.soundNight',  icon: 'Moon' },
  { id: 'cafe',   labelKey: 'study.soundCafe',   icon: 'Coffee' },
  { id: 'alpha',  labelKey: 'study.soundAlpha',  icon: 'Brain' },
];

/** Ambiences that only work properly on headphones. */
export const NEEDS_HEADPHONES = ['alpha'];

const FADE = 0.6; // seconds of fade in / out

// ── Building blocks ─────────────────────────────────────────────────────────

/**
 * A looping noise bed.
 * - white : flat, hissy. Good for water detail.
 * - pink  : -3 dB/octave, the "natural" noise — rain, leaves.
 * - brown : -6 dB/octave, deep and rumbling — surf, fire, room murmur.
 *
 * The buffer is 6 seconds so the loop point is hard to pick out by ear.
 */
function noiseBuffer(ctx, kind = 'pink', seconds = 6) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  if (kind === 'white') {
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
  } else if (kind === 'brown') {
    let last = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
  } else {
    // Pink — Paul Kellet's economical filter bank. `b6` carries over to the
    // next sample, which is why it is summed before being reassigned.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }

  return buffer;
}

/** A looping source over a freshly generated noise bed. */
function noiseSource(ctx, kind = 'pink') {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, kind);
  src.loop = true;
  return src;
}

/**
 * A one-shot source over an ALREADY generated buffer.
 * One-shots fire several times a second (fire crackle), so regenerating a
 * six-second buffer each time would burn the CPU for nothing.
 */
function burstSource(ctx, buffer) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  // Start somewhere random in the buffer so repeated bursts are not identical.
  src.loop = true;
  return src;
}

/** A filter node, shortened. */
function filter(ctx, type, freq, q = 1) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/**
 * A slow oscillator that modulates `param` around `center` by `depth`.
 * This is what turns a flat noise bed into something that breathes.
 */
function lfo(ctx, param, { rate, depth, center }) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = rate;
  const gain = ctx.createGain();
  gain.gain.value = depth;
  param.value = center;
  osc.connect(gain).connect(param);
  osc.start();
  return osc;
}

/** Gain node with an initial value. */
function gainOf(ctx, value) {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

/**
 * Re-schedule `fn` forever, reusing ONE timer handle.
 *
 * The obvious version — pushing each new setTimeout into an array — leaks: a
 * fire crackling every 200 ms for two hours would pile up tens of thousands of
 * dead handles. `fn` returns the delay until its next run.
 */
function repeater(fn, firstDelay) {
  const holder = { id: null };
  const tick = () => { holder.id = setTimeout(tick, fn()); };
  holder.id = setTimeout(tick, firstDelay);
  return holder;
}

// ── Ambience recipes ────────────────────────────────────────────────────────
// Each returns { nodes, timers } where `nodes` are things to stop() and
// `timers` are scheduled-event handles to clear.

/** Steady rain: pink noise, most of the body cut, gently breathing. */
function buildRain(ctx, out) {
  const src = noiseSource(ctx, 'pink');
  const hp = filter(ctx, 'highpass', 500);
  const lp = filter(ctx, 'lowpass', 7000);
  const g = gainOf(ctx, 0.5);
  src.connect(hp).connect(lp).connect(g).connect(out);
  // Very slow swell, as if the shower comes and goes.
  const mod = lfo(ctx, g.gain, { rate: 0.05, depth: 0.12, center: 0.5 });
  src.start();
  return { nodes: [src, mod], timers: [] };
}

/** Surf: brown noise whose cut-off and level swell on a ~14 s cycle. */
function buildWaves(ctx, out) {
  const src = noiseSource(ctx, 'brown');
  const lp = filter(ctx, 'lowpass', 500);
  const g = gainOf(ctx, 0.5);
  src.connect(lp).connect(g).connect(out);
  // The two LFOs run at slightly different rates so the swell never feels
  // metronomic — one opens the filter, the other lifts the level.
  const modF = lfo(ctx, lp.frequency, { rate: 0.07, depth: 320, center: 520 });
  const modG = lfo(ctx, g.gain, { rate: 0.062, depth: 0.32, center: 0.45 });
  src.start();
  return { nodes: [src, modF, modG], timers: [] };
}

/**
 * Fire: a low brown-noise bed for the roar, plus short filtered bursts for
 * the crackle. The bursts are what actually makes it read as a fire.
 */
function buildFire(ctx, out) {
  const src = noiseSource(ctx, 'brown');
  const lp = filter(ctx, 'lowpass', 700);
  const g = gainOf(ctx, 0.55);
  src.connect(lp).connect(g).connect(out);
  const mod = lfo(ctx, g.gain, { rate: 0.11, depth: 0.14, center: 0.5 });
  src.start();

  // Generated once and reused by every crackle.
  const sparkBed = noiseBuffer(ctx, 'white', 0.5);

  function crackle() {
    const now = ctx.currentTime;
    const burst = burstSource(ctx, sparkBed);
    const bp = filter(ctx, 'bandpass', 1200 + Math.random() * 2600, 1.2);
    const bg = gainOf(ctx, 0);
    burst.connect(bp).connect(bg).connect(out);
    const peak = 0.12 + Math.random() * 0.22;
    const life = 0.04 + Math.random() * 0.09;
    bg.gain.setValueAtTime(0, now);
    bg.gain.linearRampToValueAtTime(peak, now + 0.004);
    bg.gain.exponentialRampToValueAtTime(0.0001, now + life);
    burst.start(now);
    burst.stop(now + life + 0.05);
    return 60 + Math.random() * 380;
  }

  return { nodes: [src, mod], timers: [repeater(crackle, 200)] };
}

/** Forest: wind through leaves, with birds every few seconds. */
function buildForest(ctx, out) {
  const src = noiseSource(ctx, 'pink');
  const bp = filter(ctx, 'bandpass', 900, 0.6);
  const g = gainOf(ctx, 0.32);
  src.connect(bp).connect(g).connect(out);
  // Gusts: the band sweeps slowly, the way wind moves through a canopy.
  const modF = lfo(ctx, bp.frequency, { rate: 0.045, depth: 420, center: 950 });
  const modG = lfo(ctx, g.gain, { rate: 0.06, depth: 0.14, center: 0.3 });
  src.start();

  /** A short two-or-three note chirp, swept in pitch. */
  function bird() {
    const now = ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 2);
    const base = 2200 + Math.random() * 1800;
    for (let n = 0; n < notes; n++) {
      const at = now + n * (0.07 + Math.random() * 0.06);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const bg = gainOf(ctx, 0);
      osc.connect(bg).connect(out);
      const f0 = base * (0.9 + Math.random() * 0.3);
      osc.frequency.setValueAtTime(f0, at);
      osc.frequency.exponentialRampToValueAtTime(f0 * (1.1 + Math.random() * 0.4), at + 0.06);
      bg.gain.setValueAtTime(0, at);
      bg.gain.linearRampToValueAtTime(0.07, at + 0.012);
      bg.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      osc.start(at);
      osc.stop(at + 0.12);
    }
    return 2500 + Math.random() * 7000;
  }

  return { nodes: [src, modF, modG], timers: [repeater(bird, 1500)] };
}

/** A stream: bright, busy water with constant small variations. */
function buildStream(ctx, out) {
  const src = noiseSource(ctx, 'white');
  const bp = filter(ctx, 'bandpass', 1500, 0.7);
  const hp = filter(ctx, 'highpass', 600);
  const g = gainOf(ctx, 0.3);
  src.connect(hp).connect(bp).connect(g).connect(out);
  // Two detuned modulations give the burbling motion of moving water.
  const modA = lfo(ctx, bp.frequency, { rate: 0.33, depth: 500, center: 1600 });
  const modB = lfo(ctx, g.gain, { rate: 0.21, depth: 0.08, center: 0.28 });
  src.start();
  return { nodes: [src, modA, modB], timers: [] };
}

/** Summer night: a deep bed plus rhythmic cricket trills. */
function buildNight(ctx, out) {
  const src = noiseSource(ctx, 'brown');
  const lp = filter(ctx, 'lowpass', 300);
  const g = gainOf(ctx, 0.35);
  src.connect(lp).connect(g).connect(out);
  src.start();

  /** A cricket is a ~4 kHz tone chopped into a fast rhythmic trill. */
  function cricket() {
    const now = ctx.currentTime;
    const pulses = 3 + Math.floor(Math.random() * 4);
    const freq = 3800 + Math.random() * 900;
    for (let p = 0; p < pulses; p++) {
      const at = now + p * 0.085;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const cg = gainOf(ctx, 0);
      osc.connect(cg).connect(out);
      cg.gain.setValueAtTime(0, at);
      cg.gain.linearRampToValueAtTime(0.05, at + 0.008);
      cg.gain.exponentialRampToValueAtTime(0.0001, at + 0.055);
      osc.start(at);
      osc.stop(at + 0.07);
    }
    return 900 + Math.random() * 2600;
  }

  return { nodes: [src], timers: [repeater(cricket, 600)] };
}

/** Café: a low murmur of a room, with the occasional cup or spoon. */
function buildCafe(ctx, out) {
  const src = noiseSource(ctx, 'brown');
  const lp = filter(ctx, 'lowpass', 800);
  const g = gainOf(ctx, 0.45);
  src.connect(lp).connect(g).connect(out);
  // The murmur rises and falls like a room of conversations.
  const mod = lfo(ctx, g.gain, { rate: 0.09, depth: 0.13, center: 0.42 });
  src.start();

  /** A cup or a spoon: a bright, very short, fast-decaying ping. */
  function clink() {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 1800 + Math.random() * 2200;
    const cg = gainOf(ctx, 0);
    osc.connect(cg).connect(out);
    cg.gain.setValueAtTime(0, now);
    cg.gain.linearRampToValueAtTime(0.05, now + 0.004);
    cg.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    osc.start(now);
    osc.stop(now + 0.3);
    return 3000 + Math.random() * 9000;
  }

  return { nodes: [src, mod], timers: [repeater(clink, 2500)] };
}

/**
 * Alpha binaural beat: 200 Hz in one ear, 210 Hz in the other. The brain
 * perceives the 10 Hz difference — which is the actual effect being aimed at,
 * and which a single 10 Hz tone (the previous implementation) cannot produce
 * because it is below the hearing threshold. Headphones required.
 */
function buildAlpha(ctx, out) {
  const nodes = [];
  const soft = filter(ctx, 'lowpass', 900);
  soft.connect(out);

  [[200, -1], [210, 1]].forEach(([freq, pan]) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = gainOf(ctx, 0.22);
    // StereoPanner is not universal; without it both tones land centred and
    // the beat is still audible as a tremolo, which is an acceptable fallback.
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      osc.connect(g).connect(p).connect(soft);
    } else {
      osc.connect(g).connect(soft);
    }
    osc.start();
    nodes.push(osc);
  });

  return { nodes, timers: [] };
}

const RECIPES = {
  rain: buildRain,
  waves: buildWaves,
  // Legacy id: waves used to be stored as 'white'. A session saved in
  // localStorage before the rename must still make a sound when it resumes.
  white: buildWaves,
  fire: buildFire,
  forest: buildForest,
  stream: buildStream,
  night: buildNight,
  cafe: buildCafe,
  alpha: buildAlpha,
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Start an ambience.
 *
 * @param {string} type    an id from AMBIENCES (anything unknown → null)
 * @param {number} volume  0 → 1
 * @returns {{ setVolume: (v:number)=>void, stop: ()=>void } | null}
 */
export function createAmbience(type, volume = 0.5) {
  const recipe = RECIPES[type];
  if (!recipe) return null;

  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const { nodes, timers } = recipe(ctx, master);

    // Fade in, so starting a session never begins with a click.
    const now = ctx.currentTime;
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, volume)), now + FADE);

    // Some browsers hand back a suspended context until a user gesture.
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    let stopped = false;

    return {
      /** Ramp to a new level rather than jumping — a jump is an audible step. */
      setVolume(v) {
        if (stopped) return;
        const target = Math.max(0, Math.min(1, v));
        try {
          master.gain.cancelScheduledValues(ctx.currentTime);
          master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
          master.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.15);
        } catch { /* ignore */ }
      },

      /** Fade out, then tear everything down. */
      stop() {
        if (stopped) return;
        stopped = true;
        timers.forEach(h => clearTimeout(h.id));
        try {
          const t = ctx.currentTime;
          master.gain.cancelScheduledValues(t);
          master.gain.setValueAtTime(master.gain.value, t);
          master.gain.linearRampToValueAtTime(0, t + FADE * 0.5);
        } catch { /* ignore */ }
        // Close after the fade has actually played.
        setTimeout(() => {
          nodes.forEach(n => { try { n.stop(); } catch { /* already stopped */ } });
          try { ctx.close(); } catch { /* ignore */ }
        }, FADE * 500 + 60);
      },
    };
  } catch {
    return null;
  }
}
