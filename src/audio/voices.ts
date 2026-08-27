import type { ImpactVoice, SweepVoice } from './design';

/**
 * Node-graph plumbing.
 *
 * The dull half of the audio layer, and deliberately so: everything here takes
 * a descriptor that design.ts already decided on and wires the oscillators to
 * produce it. There are no game concepts in this file and no numbers that mean
 * anything — if a sound is wrong, it is wrong in design.ts.
 *
 * Nothing in here is unit-tested, because there is nothing here to be right or
 * wrong about that a test in Node could observe. What it IS is small, so that
 * the part that cannot be tested is also the part that barely does anything.
 */

/** Floor for exponential ramps. WebAudio throws on a target of exactly zero. */
const EPS = 1e-4;
/** Floor for frequency ramps, for the same reason. Below hearing either way. */
const HZ_EPS = 20;

/**
 * A block of white noise, generated once and looped by every noise voice.
 *
 * 1.2 seconds because that comfortably outlasts the longest single noise voice
 * (a rail ride) so nothing ever hears the loop point, and because at 48 kHz it
 * is only ~230 kB — cheaper than any of the audio files it replaces.
 */
export function makeNoiseBuffer(ctx: BaseAudioContext, seconds = 1.2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export interface SweepOptions {
  /** Seconds after `when` before this starts. */
  delay?: number;
  /** Bandpass by default; 'highpass' for hats and grit. */
  filter?: BiquadFilterType;
  /** Fraction of the duration spent on the attack. */
  attack?: number;
}

/** A band-passed burst of noise sweeping between two frequencies. */
export function playSweep(
  ctx: BaseAudioContext,
  dest: AudioNode,
  noise: AudioBuffer,
  v: SweepVoice,
  when: number,
  opts: SweepOptions = {},
): void {
  const t = when + (opts.delay ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  // Start somewhere different every time. Without this, every burst in the game
  // is literally the same waveform, and identical noise is recognisable in a
  // way people describe as "samey" without being able to say why.
  const offset = Math.random() * Math.max(0.001, noise.duration - v.duration - 0.05);

  const filter = ctx.createBiquadFilter();
  filter.type = opts.filter ?? 'bandpass';
  filter.Q.value = v.q;
  filter.frequency.setValueAtTime(Math.max(HZ_EPS, v.fromHz), t);
  filter.frequency.exponentialRampToValueAtTime(
    Math.max(HZ_EPS, v.toHz),
    t + v.duration,
  );

  const gain = ctx.createGain();
  const attack = Math.min(0.02, v.duration * (opts.attack ?? 0.06));
  gain.gain.setValueAtTime(EPS, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(EPS, v.gain), t + attack);
  gain.gain.exponentialRampToValueAtTime(EPS, t + v.duration);

  src.connect(filter).connect(gain).connect(dest);
  src.start(t, offset);
  src.stop(t + v.duration + 0.02);
}

export interface ToneOptions {
  type?: OscillatorType;
  delay?: number;
  /** Detune in cents. Used by the music's humanisation. */
  detune?: number;
  attack?: number;
}

/** A short tone that may glide between two pitches. */
export function playTone(
  ctx: BaseAudioContext,
  dest: AudioNode,
  spec: { hz: number; toHz?: number; duration: number; gain: number },
  when: number,
  opts: ToneOptions = {},
): void {
  const t = when + (opts.delay ?? 0);
  const osc = ctx.createOscillator();
  osc.type = opts.type ?? 'triangle';
  if (opts.detune) osc.detune.value = opts.detune;
  osc.frequency.setValueAtTime(Math.max(HZ_EPS, spec.hz), t);
  if (spec.toHz !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(HZ_EPS, spec.toHz),
      t + spec.duration,
    );
  }

  const gain = ctx.createGain();
  const attack = Math.min(0.03, spec.duration * (opts.attack ?? 0.12));
  gain.gain.setValueAtTime(EPS, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(EPS, spec.gain), t + attack);
  gain.gain.exponentialRampToValueAtTime(EPS, t + spec.duration);

  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + spec.duration + 0.02);
}

/**
 * Build a clash from its descriptor.
 *
 * Up to five layers, and which of them exist is entirely design.ts's decision —
 * a graze is two of them, a critical opposite-spin manga-frame hit is all five.
 * They all start on the same sample so the transient is one event rather than a
 * pile-up.
 */
export function playImpact(
  ctx: BaseAudioContext,
  dest: AudioNode,
  noise: AudioBuffer,
  v: ImpactVoice,
  when: number,
): void {
  const crackFrom = v.reflect ? v.crackToHz : v.crackHz;
  const crackTo = v.reflect ? v.crackHz : v.crackToHz;
  playSweep(
    ctx,
    dest,
    noise,
    {
      fromHz: crackFrom,
      toHz: crackTo,
      q: v.crackQ,
      duration: v.duration,
      gain: v.gain,
    },
    when,
  );

  playTone(
    ctx,
    dest,
    {
      hz: v.bodyHz,
      toHz: v.bodyToHz,
      duration: Math.min(v.duration, 0.16),
      gain: v.gain * 0.5,
    },
    when,
    { type: 'square' },
  );

  if (v.gritGain > 0) {
    playSweep(
      ctx,
      dest,
      noise,
      { fromHz: v.gritHz, toHz: v.gritHz * 0.8, q: 5, duration: 0.16, gain: v.gritGain },
      when,
    );
  }

  if (v.subGain > 0) {
    // 52 Hz down to 30: felt more than heard, which is the point of reserving
    // it for the hits that earn a manga frame.
    playTone(
      ctx,
      dest,
      { hz: 52, toHz: 30, duration: 0.26, gain: v.subGain },
      when,
      { type: 'sine', attack: 0.02 },
    );
  }

  if (v.ringGain > 0) {
    playTone(
      ctx,
      dest,
      { hz: 3100, toHz: 2600, duration: 0.3, gain: v.ringGain },
      when,
      { type: 'sine', delay: 0.012 },
    );
  }
}
