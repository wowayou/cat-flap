/*
 * Sound effects synthesised with Web Audio: no files to download, nothing to
 * fail to load. Each recipe takes any BaseAudioContext, so the exact same
 * code can be rendered offline and measured (see e2e/audio.spec.ts).
 */

export type SfxName = 'flap' | 'glide' | 'fizzle' | 'fish' | 'score' | 'bonk' | 'hit' | 'meow' | 'tick' | 'go';

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function noise(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 2147483647) * 2 - 1;
    }
    noiseCache.set(ctx, buf);
  }
  return buf;
}

/** Gain envelope: quick attack to `peak`, exponential decay to silence by `t + dur`. */
function envelope(ctx: BaseAudioContext, out: AudioNode, t: number, peak: number, attack: number, dur: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(out);
  return g;
}

function tone(
  ctx: BaseAudioContext, out: AudioNode, t: number, type: OscillatorType,
  from: number, to: number, peak: number, dur: number, attack = 0.005,
): void {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.9);
  o.connect(envelope(ctx, out, t, peak, attack, dur));
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noiseBurst(
  ctx: BaseAudioContext, out: AudioNode, t: number, filter: BiquadFilterType,
  from: number, to: number, q: number, peak: number, dur: number,
): void {
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const f = ctx.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  src.connect(f);
  f.connect(envelope(ctx, out, t, peak, 0.006, dur));
  src.start(t, Math.random() * 0.3);
  src.stop(t + dur + 0.02);
}

/** Cape "fwip": a short rising swish. Frequent, so soft and slightly varied. */
function flap(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  const v = 0.9 + Math.random() * 0.2;
  noiseBurst(ctx, out, t, 'bandpass', 900 * v, 2600 * v, 1.4, 0.55, 0.09);
  tone(ctx, out, t, 'sine', 260 * v, 420 * v, 0.07, 0.06);
}

/** The cape catching the air: a soft, longer, rising whoosh. */
function glide(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  noiseBurst(ctx, out, t, 'bandpass', 700, 2200, 1.1, 0.68, 0.26);
  tone(ctx, out, t, 'sine', 420, 640, 0.07, 0.22, 0.03);
}

/** The cape running out of puff: a falling "pfff". */
function fizzle(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  noiseBurst(ctx, out, t, 'bandpass', 1900, 600, 1.6, 0.45, 0.24);
  tone(ctx, out, t, 'triangle', 620, 300, 0.08, 0.2);
}

/** A fish snack: a quick crunchy "nom-nom". */
function fish(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  noiseBurst(ctx, out, t, 'bandpass', 3200, 2400, 2, 0.35, 0.04);
  tone(ctx, out, t, 'triangle', 1320, 990, 0.2, 0.06);
  noiseBurst(ctx, out, t + 0.08, 'bandpass', 3000, 2200, 2, 0.3, 0.04);
  tone(ctx, out, t + 0.08, 'triangle', 1560, 1170, 0.2, 0.08);
}

/** Bright two-note chime. */
function score(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  tone(ctx, out, t, 'triangle', 988, 988, 0.24, 0.09);
  tone(ctx, out, t + 0.075, 'triangle', 1480, 1480, 0.26, 0.22);
  tone(ctx, out, t + 0.075, 'sine', 2960, 2960, 0.05, 0.16);
}

/** Head against the ceiling: a little wooden "tok". */
function bonk(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  tone(ctx, out, t, 'sine', 720, 300, 0.2, 0.07);
}

/**
 * Crash: a cartoon "thwack". The body of the sound is a mid-range slap and
 * knock, because phone speakers reproduce almost nothing below ~500 Hz;
 * the low thump underneath only adds weight on headphones.
 */
function hit(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  noiseBurst(ctx, out, t, 'bandpass', 1700, 650, 0.9, 0.9, 0.11);
  tone(ctx, out, t, 'triangle', 900, 260, 0.32, 0.13, 0.002);
  tone(ctx, out, t, 'sine', 170, 55, 0.3, 0.2, 0.003);
}

/**
 * An indignant "mrrow": a buzzy source through two moving formant filters
 * (roughly "ee" → "ah" → "oo") with a rise-then-fall pitch and slight vibrato.
 */
function meow(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  const dur = 0.62;
  const src = ctx.createOscillator();
  src.type = 'sawtooth';
  src.frequency.setValueAtTime(520, t);
  src.frequency.linearRampToValueAtTime(780, t + 0.13);
  src.frequency.exponentialRampToValueAtTime(390, t + dur);

  const vib = ctx.createOscillator();
  vib.frequency.value = 7;
  const vibDepth = ctx.createGain();
  vibDepth.gain.value = 9;
  vib.connect(vibDepth);
  vibDepth.connect(src.frequency);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(0.32, t + 0.04);
  env.gain.setValueAtTime(0.32, t + dur * 0.55);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  env.connect(out);

  const formant = (f0: number, f1: number, f2: number, q: number, level: number) => {
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.linearRampToValueAtTime(f1, t + 0.16);
    f.frequency.linearRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain();
    g.gain.value = level;
    src.connect(f);
    f.connect(g);
    g.connect(env);
  };
  formant(650, 1050, 520, 6, 1.6);
  formant(2000, 1500, 900, 8, 0.9);

  src.start(t);
  vib.start(t);
  src.stop(t + dur + 0.02);
  vib.stop(t + dur + 0.02);
}

/** Resume countdown beats. */
function tick(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  tone(ctx, out, t, 'triangle', 660, 660, 0.14, 0.08);
}

function go(ctx: BaseAudioContext, out: AudioNode, t: number): void {
  tone(ctx, out, t, 'triangle', 990, 990, 0.16, 0.16);
}

export const SFX: Record<SfxName, (ctx: BaseAudioContext, out: AudioNode, t: number) => void> = {
  flap, glide, fizzle, fish, score, bonk, hit, meow, tick, go,
};
