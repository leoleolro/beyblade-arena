import {
  HITSTOP_DURATION,
  HITSTOP_THRESHOLD,
  IMPACT_FRAME_THRESHOLD,
  MIN_IMPACT,
} from '../sim/constants';

/**
 * Sound DESIGN, with no AudioContext anywhere in it.
 *
 * The split is the same one src/render/motion.ts makes and for the same reason:
 * the part that can be *wrong* is the mapping from a game quantity onto an
 * audio parameter, and the part that is merely fiddly is the node graph. Keep
 * them apart and the mapping can be tested against the sim's real numbers
 * instead of eyeballed — or, worse, ear-balled — in a browser.
 *
 * Every function here takes plain numbers and returns a plain descriptor.
 * `voices.ts` turns a descriptor into oscillators. Nothing in this file knows
 * that WebAudio exists, which is also why the whole file runs under vitest in
 * Node, where WebAudio does not.
 *
 * The thresholds are imported from the sim rather than re-typed. That is the
 * whole point of importing them: "impact audio and hitstop have to agree" is a
 * claim that decays the moment there are two copies of 1.6 in the tree.
 */

/** Clamp to 0..1. The single most-used helper in the file. */
export const clampUnit = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Smooth 0..1 ramp between `lo` and `hi`. No corners, so nothing clicks. */
export function fade(x: number, lo: number, hi: number): number {
  const t = clampUnit((x - lo) / (hi - lo));
  return t * t * (3 - 2 * t);
}

/** Equal-tempered MIDI note to frequency. A4 (69) = 440 Hz. */
export const midiHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

// ------------------------------------------------------------- the spin bed ---

/**
 * The bottom of the spin bed's pitch range, Hz.
 *
 * Chosen to sit UNDER the impact band rather than for its own sake. Clashes
 * live at roughly 200 Hz to 3 kHz (see `impactVoice` below), and a continuous
 * voice sharing that band is a continuous voice that masks the one sound in the
 * game carrying real information. Both ends of the spin range stay below 250 Hz
 * so a clash always has clear air above it.
 */
export const SPIN_HZ_DEAD = 58;
/** The top of the range: a freshly launched top. Still below the impact band. */
export const SPIN_HZ_FULL = 232;

/**
 * Exponent on the pitch curve. Below 1, which STRETCHES THE BOTTOM.
 *
 * This is the whole reason the spin loop earns its place. A linear map spends
 * its pitch range evenly, so the first half of a round — where nothing is
 * decided — gets as much audible change as the last 10%, where everything is.
 * At 0.55 the bottom decile of spin (0 to 0.1) spans about 10.6 semitones while
 * the top decile (0.9 to 1.0) spans about 0.75: a top on its last legs slides
 * an audible tenth downward while a healthy one barely moves.
 *
 * That is what lets the audio call a death before the HUD bar visibly moves —
 * the bar is linear and 8% of a bar is nothing, but 8% of spin at the bottom of
 * this curve is most of an octave.
 */
export const SPIN_HZ_CURVE = 0.55;

/** Lowpass cutoff at zero spin, Hz. Dull enough to read as "nearly out". */
export const SPIN_CUTOFF_DEAD = 210;
/** Lowpass cutoff at full spin, Hz. Bright, alive, plenty of bearing hiss. */
export const SPIN_CUTOFF_FULL = 1450;
/**
 * Exponent on the brightness curve. ABOVE 1, the opposite of the pitch curve.
 *
 * Deliberately opposite: brightness collapses early and pitch collapses late, so
 * the two cues arrive at different points in a top's decline instead of being
 * the same cue twice. A top at half spin is already noticeably duller (619 Hz
 * of 1450) while still sounding roughly in tune; by the time the pitch has
 * dropped it is a low, muffled rumble.
 */
export const SPIN_CUTOFF_CURVE = 1.6;

/**
 * Wobble rate at full spin and at rest, Hz.
 *
 * Precession speeds UP as spin bleeds off — for a real top the precession rate
 * goes as 1/ω, which is why a dying top's wobble visibly accelerates into the
 * final stagger. physics.ts carries the same relationship as PRECESSION_RATE.
 * Modelling it as a tremolo is cheap (one LFO) and it is the single most
 * legible "this one is going" cue in the mix, because a rate change is audible
 * even when the pitch and the level are not.
 */
export const SPIN_WOBBLE_HZ_FULL = 2.6;
export const SPIN_WOBBLE_HZ_DEAD = 10.0;

/**
 * Gain of one spin voice at rest and at full spin.
 *
 * Two tops sum, so the real ceiling is double the top of this range. Kept
 * around 25 dB under the peak of a heavy clash: this is a bed, and a bed that
 * competes with the impacts has stopped being a bed. Deliberately nearly FLAT
 * with spin — a dying top must not also get quieter, or the cue disappears
 * exactly when it matters.
 */
export const SPIN_GAIN_DEAD = 0.013;
export const SPIN_GAIN_FULL = 0.024;

/** Everything one spinning top contributes to the bed. */
export interface SpinVoice {
  /** Fundamental of the body tone, Hz. */
  hz: number;
  /** Lowpass cutoff over the whole voice, Hz. */
  cutoffHz: number;
  /** Output gain, before the channel bus. */
  gain: number;
  /** Tremolo rate, Hz. Rises as the top slows. */
  wobbleHz: number;
  /** Tremolo depth, 0..1. Rises as the top slows. */
  wobbleDepth: number;
}

/**
 * The continuous voice for one top, from its remaining spin.
 *
 * `spinNorm` is `abs(bey.spin) / SPIN_REF` — the same 0..1 the HUD bar uses, so
 * the two cannot disagree about how alive a top is.
 */
export function spinVoice(spinNorm: number): SpinVoice {
  const s = clampUnit(spinNorm);
  const dying = (1 - s) * (1 - s);
  return {
    hz: SPIN_HZ_DEAD + (SPIN_HZ_FULL - SPIN_HZ_DEAD) * s ** SPIN_HZ_CURVE,
    cutoffHz:
      SPIN_CUTOFF_DEAD + (SPIN_CUTOFF_FULL - SPIN_CUTOFF_DEAD) * s ** SPIN_CUTOFF_CURVE,
    gain: SPIN_GAIN_DEAD + (SPIN_GAIN_FULL - SPIN_GAIN_DEAD) * s,
    wobbleHz: SPIN_WOBBLE_HZ_FULL + (SPIN_WOBBLE_HZ_DEAD - SPIN_WOBBLE_HZ_FULL) * dying,
    // 0.05 at full spin is a barely-there breathing; 0.47 at rest is a lurch
    // you cannot miss. Never 1.0 — a voice that gates itself to silence twice a
    // second reads as a fault, not as a wobble.
    wobbleDepth: 0.05 + 0.42 * dying,
  };
}

/**
 * Minimum change in normalised spin worth rewriting the voice's params for.
 *
 * Not a sound-design number, a cost number, and it is worth a comment because
 * the naive version is genuinely wasteful. Called from the frame loop it would
 * push 5 AudioParam events per top per frame — 600/s with two tops live — for a
 * quantity that changes by about 0.014 per second (SPIN_DECAY_BASE over
 * SPIN_REF). At 0.005 the voice is rewritten under three times a second per
 * top, and since every write lands through `setTargetAtTime` with a 0.1 s time
 * constant, the result is indistinguishable from updating every frame.
 */
export const SPIN_UPDATE_EPS = 0.005;

// ---------------------------------------------------------------- impacts ---

/**
 * The impact strength that counts as "as hard as it gets", for normalising.
 *
 * Not invented here: game.ts already normalises the impact flash with
 * `Math.min(1, h.strength / 4)`. Reusing 4.0 is what makes the flash and the
 * sound the SAME SIZE for the same hit, which is the entire point of driving
 * both from the sim's own number.
 */
export const IMPACT_FULL = 4.0;

/**
 * How hard the hit was, 0..1, over the range the sim can actually produce.
 *
 * Zero is MIN_IMPACT rather than zero because a hit softer than MIN_IMPACT is
 * not a hit — the sim refuses to score it and emits a ContactEvent instead. A
 * 0-based ramp would waste its bottom 6% on strengths that never arrive, which
 * is the mistake motion.ts documents at length about speed bands.
 */
export function impactK(strength: number): number {
  return clampUnit((strength - MIN_IMPACT) / (IMPACT_FULL - MIN_IMPACT));
}

/**
 * Three bands, matching the three the presentation layer already has.
 *
 * `graze` is everything the sim scores but the screen does not react to.
 * `clash` is a hit that freezes the game — HITSTOP_THRESHOLD.
 * `heavy` is a hit that earns a manga frame — IMPACT_FRAME_THRESHOLD.
 *
 * Sharing the sim's thresholds rather than picking audio ones is what stops the
 * sound and the picture disagreeing about which hits mattered, which is the
 * failure the game-feel notes call out as "everything looks the same".
 */
export type ImpactTier = 'graze' | 'clash' | 'heavy';

export function impactTier(strength: number): ImpactTier {
  if (strength >= IMPACT_FRAME_THRESHOLD) return 'heavy';
  if (strength >= HITSTOP_THRESHOLD) return 'clash';
  return 'graze';
}

/**
 * Minimum length of any sound that fires on a hit the game FREEZES for.
 *
 * The rule the whole impact design hangs off: hitstop stops the sim for
 * HITSTOP_DURATION while the renderer keeps drawing, and if the sound is
 * shorter than the freeze the player gets a frozen screen in silence — which
 * reads as a dropped frame, the exact opposite of weight. Twice the freeze, so
 * the tail rings out on BOTH sides of it and the unfreeze is a continuation
 * rather than a restart.
 */
export const IMPACT_MIN_FREEZE_SOUND = HITSTOP_DURATION * 2;

/** The parameters of one clash. `voices.ts` builds the graph from this. */
export interface ImpactVoice {
  tier: ImpactTier;
  /** Bandpassed noise: the metal crack. Brighter with strength. */
  crackHz: number;
  crackToHz: number;
  crackQ: number;
  /** Sine body: the thud. Goes DOWN in pitch as strength goes up. */
  bodyHz: number;
  bodyToHz: number;
  /** Total length. Never shorter than the freeze it accompanies. */
  duration: number;
  gain: number;
  /** Narrow high band for opposite-spin bite. 0 in a same-spin matchup. */
  gritHz: number;
  gritGain: number;
  /** Sub-bass drop. Heavy tier only; 0 otherwise. */
  subGain: number;
  /** Bright ring on a critical clash. 0 otherwise. */
  ringGain: number;
  /**
   * A perfect block sent it back, so the crack sweeps UP instead of down.
   * A reversed envelope is the cheapest way to make one event unmistakably not
   * another, and this one is worth spending it on — perfect block is the only
   * pure-skill spike in the sim.
   */
  reflect: boolean;
}

/** Structural shape of a sim HitEvent. Kept structural so nothing is imported. */
export interface HitLike {
  strength: number;
  opposite: boolean;
  crit?: boolean;
  perfectBlock?: boolean;
}

/**
 * Metal on metal, scaled by the sim's own impact strength.
 *
 * The crack goes UP with strength and the body goes DOWN, at the same time.
 * That combination is not a compromise between the two schools of thought — it
 * is what a bigger collision actually does. More energy means a sharper, more
 * broadband transient AND a larger, lower-pitched resonance behind it. A hit
 * that only got brighter would read as smaller and tinnier; one that only got
 * lower would read as slower.
 */
export function impactVoice(hit: HitLike): ImpactVoice {
  const k = impactK(hit.strength);
  const tier = impactTier(hit.strength);
  const heavy = tier === 'heavy';

  // A graze is deliberately far quieter than its strength alone suggests. Most
  // frames of most rounds have the two tops in contact; the ones that score are
  // still common, and letting them all through at their "fair" level is how a
  // fight turns into a rattle.
  const level = Math.min(0.62, 0.1 + k * 0.58) * (tier === 'graze' ? 0.45 : 1);

  return {
    tier,
    crackHz: 1250 + k * 1750,
    // Sweeping the band down over the burst is what makes it a *hit* rather
    // than a tick: the spectrum collapsing is the sound of energy leaving.
    crackToHz: 260 + k * 150,
    // Low Q for the main crack — broadband is "smash", narrow is "ping".
    crackQ: 0.85,
    bodyHz: 196 - k * 100,
    bodyToHz: 62 - k * 20,
    duration:
      tier === 'graze'
        ? 0.042 + k * 0.06
        : Math.max(IMPACT_MIN_FREEZE_SOUND, 0.1 + k * 0.34),
    gain: level,
    gritHz: 2500 + k * 1400,
    // Opposite-spin clashes drain far more (OPPOSITE_SPIN_DRAIN) and need to
    // sound like it. A narrow high band on top is "blades biting the wrong
    // way"; it rides over the crack rather than replacing it.
    gritGain: hit.opposite ? level * 0.55 : 0,
    // The sub only ever fires on a manga-frame hit. It is the single loudest
    // low-frequency event in the game and it must stay rare, or the biggest
    // sound available stops meaning anything — the same argument
    // IMPACT_FRAME_THRESHOLD makes for the picture.
    subGain: heavy ? Math.min(0.4, 0.16 + (k - 0.63) * 0.55) : 0,
    ringGain: hit.crit ? 0.1 + k * 0.14 : 0,
    reflect: hit.perfectBlock === true,
  };
}

// ------------------------------------------------------------ grind / contact ---

/** Structural shape of a sim ContactEvent. */
export interface ContactLike {
  /** How hard the blades are abrading, 0..1. */
  grind: number;
  /** Relative surface speed at the contact, signed. */
  slip: number;
}

/**
 * Ceiling on the grind voice.
 *
 * Low, because of how OFTEN this is on. physics.ts measured the two tops inside
 * contact distance for 22.5% of all frames, reaching 96% late in a round. A
 * continuous voice with that duty cycle is not punctuation, it is weather, and
 * weather has to sit far enough back that the player stops hearing it as an
 * event. It exists so the long grinding stretches — most of a round — are not
 * silent, not so they are dramatic.
 */
export const GRIND_CEILING = 0.14;
/** Rise time constant: fast, so a fresh lean is felt immediately. */
export const GRIND_ATTACK = 0.045;
/**
 * Fall time constant: slow enough to bridge the gaps.
 *
 * Contacts arrive per fixed step, not per frame, and a leaning pair drops out
 * of contact for a step or two constantly. A release under about 0.1 s turns
 * that into a stutter — a machine-gun of one-shots, which is exactly the
 * failure a continuous voice was chosen to avoid.
 */
export const GRIND_RELEASE = 0.16;

/**
 * Follow the frame's contacts with one continuous level.
 *
 * Contacts are a STATE, not an event — the tops are leaning on each other for
 * most of a round — so they get a level that tracks them rather than a sound
 * per occurrence. Hits are the events. Keeping the two apart is what stops the
 * game sounding like a bag of spanners for 20 seconds at a time.
 *
 * Exponential rather than linear so a large `dt` (a stalled tab, a hitstop
 * frame) can never overshoot: the step factor is bounded below 1 by
 * construction.
 */
export function grindLevel(
  prev: number,
  contacts: readonly ContactLike[],
  dt: number,
): number {
  let peak = 0;
  for (const c of contacts) if (c.grind > peak) peak = c.grind;
  const target = clampUnit(peak) * GRIND_CEILING;
  if (dt <= 0) return prev;
  const tau = target > prev ? GRIND_ATTACK : GRIND_RELEASE;
  const step = 1 - Math.exp(-dt / tau);
  const next = prev + (target - prev) * step;
  // Snap the tail to silence. An exponential never arrives, and a noise source
  // held at 1e-9 forever still costs a filter's worth of work every quantum.
  return next < 1e-4 ? 0 : next;
}

/**
 * Peak surface slip the sim actually reaches, for normalising brightness.
 *
 * MEASURED, and physics.ts is where: "peak slip 3.4 out of a" real leaning
 * contact in an opposite-spin round. Picking 10 because it is a round number
 * would park every grind in the bottom third of the range and make the cue look
 * broken rather than subtle.
 */
export const SLIP_FULL = 3.4;

/** Centre frequency of the grind band for a given signed surface slip. */
export function grindHz(slip: number): number {
  // 900 Hz keeps it clear of the spin bed below and leaves the 2-3 kHz region
  // for it to climb into, where the ear is most sensitive — which is why it is
  // capped low rather than allowed to run to 6 kHz.
  return 900 + clampUnit(Math.abs(slip) / SLIP_FULL) * 2600;
}

// ----------------------------------------------------------------- ducking ---

/**
 * What a given event does to the music bus.
 *
 * Effects carry information and music carries mood; when they collide,
 * information wins. Rather than mixing the music quietly enough to survive the
 * worst case — which makes it inaudible for the other 95% of the time — it gets
 * out of the way for exactly as long as something is happening.
 */
export type DuckKind = 'clash' | 'heavy' | 'launch' | 'finish' | 'silence';

export interface Duck {
  /** Multiplier applied to the music bus, 0..1. */
  gain: number;
  /** Seconds to fall. */
  attack: number;
  /** Seconds to hold at the bottom before releasing. */
  hold: number;
  /** Seconds to come back. */
  release: number;
}

export function duckFor(kind: DuckKind): Duck {
  switch (kind) {
    // ~4 dB, the standard broadcast duck. Enough to open a hole, small enough
    // that the player never notices the music moving.
    case 'clash':
      return { gain: 0.63, attack: 0.03, hold: 0.05, release: 0.4 };
    // ~6 dB and a longer recovery, so the manga-frame hits get room to ring.
    case 'heavy':
      return { gain: 0.5, attack: 0.03, hold: 0.12, release: 0.55 };
    case 'launch':
      return { gain: 0.55, attack: 0.05, hold: 0.3, release: 0.6 };
    // A finish is a beat, not a bump. Near-silence for the length of the finish
    // hold, then back: silence is the loudest transition available and it costs
    // nothing to implement.
    case 'finish':
      return { gain: 0.06, attack: 0.02, hold: 0.9, release: 1.2 };
    case 'silence':
      return { gain: 0.0, attack: 0.15, hold: 0.0, release: 1.6 };
  }
}

/** The duck a hit of this tier deserves, or null when it deserves none. */
export function duckForImpact(tier: ImpactTier): Duck | null {
  // A graze ducks nothing. There are hundreds of them and a music bus being
  // pumped hundreds of times a round is a compressor pedal, not a mix.
  if (tier === 'graze') return null;
  return duckFor(tier === 'heavy' ? 'heavy' : 'clash');
}

// -------------------------------------------------------- one-shot voices ---

/** A filtered-noise sweep: the shape behind launches, rail rides and ring-outs. */
export interface SweepVoice {
  fromHz: number;
  toHz: number;
  q: number;
  duration: number;
  gain: number;
}

export interface LaunchVoice {
  /** The ripcord: noise sweeping up as the top spools. */
  rip: SweepVoice;
  /** The shove: a low tone under it, so the launch has a body. */
  shoveHz: number;
  shoveToHz: number;
  shoveGain: number;
  shoveDuration: number;
}

/** The rip. `power` is the launch meter, 0..1. */
export function launchVoice(power: number): LaunchVoice {
  const p = clampUnit(power);
  return {
    rip: {
      fromHz: 300,
      // A harder rip spools higher AND is the thing the player is being scored
      // on, so it gets the widest parameter swing of any sound in the game.
      toHz: 2200 + p * 1800,
      q: 1.05,
      // Matched to the launch animation rather than chosen: the top is in the
      // air for about half a second before it settles into the dish.
      duration: 0.5 + p * 0.1,
      gain: 0.26 + p * 0.14,
    },
    shoveHz: 86,
    shoveToHz: 240 + p * 90,
    shoveGain: 0.17,
    shoveDuration: 0.4,
  };
}

/** The two notes laid over a perfect launch. Semitones above the tonic. */
export const PERFECT_LAUNCH_SEMITONES: readonly number[] = [12, 19];

export interface RailVoice {
  /** The teeth biting: a short mechanical clatter at engage. */
  bite: SweepVoice;
  /** The ride: pitch climbing for exactly as long as the top is locked in. */
  ride: SweepVoice;
  /** Air over the ride. */
  air: SweepVoice;
}

/**
 * The X-Rail dash.
 *
 * A one-shot that lasts the ride rather than a loop that gets faded out. A ride
 * is about half a second; a transient that rises for exactly that long carries
 * the same information as a loop at none of the cost, and it cannot outlive the
 * thing it is describing — which a loop, sooner or later, always does.
 *
 * `grip` is the top's `stats.railGrip`, 0..1. The sim publishes it as a stat
 * (real Beyblade X calls the axis "Dash") and attack tips have four times the
 * value of stamina tips, so it deserves to be audible: a Gear Flat's ride
 * should not sound like a Ball's.
 */
export function railVoice(duration: number, grip: number): RailVoice {
  const g = clampUnit(grip);
  const d = Math.max(0.08, duration);
  return {
    bite: { fromHz: 780 + g * 520, toHz: 2200, q: 3.5, duration: 0.085, gain: 0.3 },
    ride: { fromHz: 165 + g * 60, toHz: 780 + g * 420, q: 1, duration: d, gain: 0.22 },
    air: { fromHz: 560, toHz: 2900 + g * 900, q: 1.6, duration: d, gain: 0.16 },
  };
}

/** The slingshot letting go: everything the ride climbed, falling at once. */
export function railReleaseVoice(): SweepVoice {
  return { fromHz: 2600, toHz: 260, q: 1.1, duration: 0.28, gain: 0.3 };
}

export interface BurstShard {
  hz: number;
  /** Seconds after the crack. */
  delay: number;
  gain: number;
  duration: number;
}

export interface BurstVoice {
  /** The crack: the layer letting go. */
  crack: SweepVoice;
  /** Parts hitting the dish afterwards. */
  shards: readonly BurstShard[];
}

/**
 * A burst finish.
 *
 * Shaped to be unmistakable against a ring-out, which is worth spending effort
 * on: they are worth the same 2 points and a player who cannot tell which rule
 * just paid out cannot learn the rules. A burst is ONE crack and then debris —
 * energy scattering outward. A ring-out is a single continuous descent. Two
 * different envelope shapes, not two pitches of the same shape.
 *
 * `seed` scatters the debris so the third burst of a session is not a replay of
 * the first, while staying deterministic enough to test.
 */
export function burstVoice(seed: number): BurstVoice {
  const shards: BurstShard[] = [];
  for (let i = 0; i < BURST_SHARDS; i++) {
    const r = hash01(seed, i);
    shards.push({
      // Spread across the mid band so the debris reads as several objects of
      // different sizes rather than one object repeated.
      hz: 700 + r * 2400 + i * 130,
      // Strictly increasing so it scatters outward in time. The +r jitter is
      // small enough that it cannot reorder them.
      delay: 0.05 + i * 0.048 + r * 0.02,
      gain: 0.2 * (1 - i / BURST_SHARDS),
      duration: 0.09 + r * 0.07,
    });
  }
  return {
    crack: { fromHz: 1800, toHz: 180, q: 0.7, duration: 0.26, gain: 0.6 },
    shards,
  };
}

/** Five is enough to read as "it came apart" and few enough to stay a moment. */
export const BURST_SHARDS = 5;

export interface RingOutVoice {
  /** The departure: a single continuous fall as it leaves the dish. */
  fall: SweepVoice;
  /** The landing, outside the stadium. */
  landHz: number;
  landDelay: number;
  landGain: number;
  /** An Xtreme Finish went through the graded pocket and gets a bell on top. */
  bellSemitones: readonly number[];
}

export function ringOutVoice(xtreme: boolean): RingOutVoice {
  return {
    fall: { fromHz: 1400, toHz: 180, q: 1.2, duration: 0.5, gain: 0.42 },
    landHz: 140,
    landDelay: 0.44,
    landGain: 0.3,
    // The card is the only place the Xtreme rule is ever explained, so the
    // sound has to flag that something different happened or the extra point
    // reads as the arena being arbitrary. A rising in-key triad, over the fall.
    bellSemitones: xtreme ? [19, 24, 28] : [],
  };
}

/** Rejected input: short, dull, low. A mis-press that is silent reads as lost. */
export function rejectVoice(): SweepVoice {
  return { fromHz: 150, toHz: 90, q: 1, duration: 0.09, gain: 0.14 };
}

// ---------------------------------------------------------------- countdown ---

/**
 * The pre-round pips, as MIDI notes: three, two, one, GO.
 *
 * In the music's key (A minor) and spelling out its tonic triad, so a countdown
 * that lands over a running music bed is consonant with it. GO is exactly an
 * octave above the first pip, which is the interval the ear reads as "arrived"
 * without needing to have heard the first three.
 */
export const COUNTDOWN_MIDI: readonly number[] = [69, 72, 76, 81];

/**
 * Frequency for countdown `step`, where 3, 2, 1 are the pips and 0 is GO.
 * Out-of-range steps clamp rather than throw — a countdown is not worth a crash.
 */
export function countdownHz(step: number): number {
  const i = step <= 0 ? 3 : step >= 3 ? 0 : 3 - Math.round(step);
  return midiHz(COUNTDOWN_MIDI[i]);
}

/** GO is longer and louder than a pip; the pips are meant to be ignorable. */
export function countdownVoice(step: number): { hz: number; duration: number; gain: number } {
  const go = step <= 0;
  return {
    hz: countdownHz(step),
    duration: go ? 0.34 : 0.11,
    gain: go ? 0.32 : 0.18,
  };
}

// ------------------------------------------------------------------ stings ---

/**
 * The round-result motif, in semitones from the tonic.
 *
 * Both are in key so they can play over the music bed without a transition —
 * which matters because the finish duck brings the music back UNDER the sting's
 * tail, and an out-of-key sting would collide with whatever chord is running.
 *
 * A win rises to the octave and resolves; a loss falls and does not.
 */
export function stingSemitones(won: boolean): readonly number[] {
  return won ? [0, 7, 12] : [0, -3, -8];
}

/** Seconds between the notes of a sting. */
export const STING_STEP = 0.13;
/** The sting's tonic. A3, an octave under the countdown, so it sits under it. */
export const STING_ROOT_MIDI = 57;

// -------------------------------------------------------------------- hash ---

/**
 * A deterministic 0..1 from two integers.
 *
 * Local rather than reusing sim/math's `makeRng` on purpose: that one is
 * stateful and seeds a stream, and everything here wants "the same answer for
 * the same inputs, asked in any order" — the audio scheduler runs ahead of the
 * audible edge and asks for things out of sequence.
 */
export function hash01(seed: number, index: number): number {
  let h = (seed ^ (index * 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 4294967296;
}
