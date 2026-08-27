import { ROUND_TIME_LIMIT } from '../sim/constants';
import { clampUnit, fade, hash01 } from './design';

/**
 * The music, as data and pure functions.
 *
 * Same split as design.ts: this file decides WHAT is played and `music.ts`
 * decides how to make a browser play it. Nothing here touches an AudioContext,
 * so the chord walk, the layer selection and the intensity mapping are all
 * testable in Node — and those are the three things that can actually be wrong.
 *
 * The design is stems, not a track. Four layers plus a tension layer share one
 * harmonic bed and fade against a single 0..1 intensity the game already knows.
 * Because every layer is built from the same chord at the same bar, any
 * combination of them is consonant, which is what lets layers arrive and leave
 * with no transition to write.
 */

/**
 * Tempo.
 *
 * 128 is not a taste choice, it is an arithmetic one: at 128 BPM a 4/4 bar is
 * exactly 1.875 s, and ROUND_TIME_LIMIT (75 s) is exactly 40 bars. The round
 * clock and the bar grid therefore never drift apart, so a cue tied to the
 * clock — the tension layer, a final-ten-seconds lift — lands on a bar line
 * without anyone having to nudge it.
 */
export const BPM = 128;
export const BEATS_PER_BAR = 4;
export const BAR_SECONDS = (60 / BPM) * BEATS_PER_BAR;
/** Sixteenths. The finest grid anything here is quantised to. */
export const STEPS_PER_BAR = 16;
export const STEP_SECONDS = BAR_SECONDS / STEPS_PER_BAR;

/** Bars in a full round, by construction. Asserted in the tests. */
export const BARS_PER_ROUND = ROUND_TIME_LIMIT / BAR_SECONDS;

/**
 * The key: A natural minor, tonic A3 (MIDI 57).
 *
 * Fixed for the whole game, menus included. A fixed key is what makes "add a
 * layer" a free operation — there is never a moment where a new stem has to be
 * transposed into whatever is currently playing, and the round-result stings
 * and the countdown pips (see design.ts) can be written in the same key and
 * dropped over the top of a running bed.
 */
export const TONIC_MIDI = 57;

export interface Chord {
  name: string;
  /** Bass root, semitones from the tonic. */
  bass: number;
  /** Pad/arp voicing, semitones from the tonic. */
  notes: readonly number[];
}

/**
 * Five chords, all diatonic to A minor, rotated rather than sequenced.
 *
 * FIVE because it is prime, and because coprime cycle lengths are most of the
 * defence against a loop the player can hear looping: the chord walk (5), the
 * arp figure (7) and the percussion pattern (3) do not line back up for 105
 * bars, which at 1.875 s a bar is over three minutes — longer than any round.
 *
 * They are a SET, not a progression. Stepping through them with a seeded
 * generator means the music never announces a bar-one, and there is no
 * four-bar hook to get sick of.
 */
export const CHORDS: readonly Chord[] = [
  { name: 'Am', bass: -12, notes: [0, 3, 7, 12] },
  { name: 'F', bass: -16, notes: [-4, 0, 3, 8] },
  { name: 'C', bass: -9, notes: [3, 7, 10, 15] },
  { name: 'G', bass: -14, notes: [-2, 2, 5, 10] },
  { name: 'Dm', bass: -19, notes: [-7, -4, 0, 5] },
];

/**
 * Step to the next chord, given a roll in [0, 1).
 *
 * Advances by a stride of 1..N-1 rather than picking an index outright. That
 * makes an immediate repeat STRUCTURALLY impossible instead of something to
 * detect and retry — a rejection loop is one bad PRNG away from spinning
 * forever inside an audio scheduler, which is the worst place in the program
 * for that to happen.
 */
export function nextChordIndex(prev: number, roll: number): number {
  const n = CHORDS.length;
  const stride = 1 + Math.min(n - 2, Math.floor(clampUnit(roll) * (n - 1)));
  return (((prev + stride) % n) + n) % n;
}

/**
 * The arp figure: seven steps, over a sixteen-step bar.
 *
 * Seven against sixteen is the cheapest trick in the file. The figure does not
 * fit the bar, so it enters on a different sixteenth every bar and takes seven
 * bars to come back round — motion that costs one modulo and sounds composed.
 */
export const ARP_STEPS = 7;
/** Indices into the chord's voicing. Up, down, and a leap, which is a shape. */
const ARP_SHAPE: readonly number[] = [0, 1, 2, 3, 2, 1, 3];
/**
 * Two octaves above the tonic.
 *
 * Deliberately ABOVE the impact band (roughly 200 Hz - 3 kHz): the arp's lowest
 * note lands near 880 Hz and it mostly lives higher, so it shares as little
 * spectrum as possible with the clashes it has to lose to. Keeping music out of
 * the way is cheaper done with frequency than with gain.
 */
export const ARP_OCTAVE_OFFSET = 24;

export function arpMidi(step: number, chord: Chord): number {
  const shape = ARP_SHAPE[((step % ARP_STEPS) + ARP_STEPS) % ARP_STEPS];
  return TONIC_MIDI + ARP_OCTAVE_OFFSET + chord.notes[shape % chord.notes.length];
}

export type PercHit = 'kick' | 'hat' | null;

/**
 * Three bars of percussion, one character per sixteenth.
 *
 * K = kick, h = hat, . = nothing. Three bars, prime against the five-chord walk
 * and the seven-step arp. Written as strings because the pattern is the kind of
 * thing that gets edited by eye, and a grid you can see is a grid you can edit.
 */
export const PERC_CYCLE = 3;
const PERC_PATTERN: readonly string[] = [
  'K..h..K.h..K..h.',
  'K..h.K..h..K.h.h',
  'K.h..K..h.K..h.K',
];

export function percAt(bar: number, step: number): PercHit {
  const row = PERC_PATTERN[(((bar % PERC_CYCLE) + PERC_CYCLE) % PERC_CYCLE)];
  const c = row[(((step % STEPS_PER_BAR) + STEPS_PER_BAR) % STEPS_PER_BAR)];
  return c === 'K' ? 'kick' : c === 'h' ? 'hat' : null;
}

/** Kick sits under the impact band; hat sits above it. Neither competes. */
export const KICK_HZ = 55;
export const KICK_TO_HZ = 34;
export const HAT_HIGHPASS_HZ = 6200;

/** Humanisation bounds: cents of detune and seconds of timing wander. */
export const HUMANISE_CENTS = 10;
export const HUMANISE_SECONDS = 0.015;

export interface Humanise {
  cents: number;
  /** Signed. The scheduler runs two bars ahead, so a negative is always safe. */
  delaySeconds: number;
}

/**
 * Per-note detune and timing wander.
 *
 * The single highest ratio of "sounds alive" to lines of code in the file.
 * Every note landing on the exact sample and the exact frequency is what makes
 * generated music sound generated; ten cents and fifteen milliseconds is under
 * the threshold at which anyone can name what changed, and over the one at
 * which they notice it did.
 */
export function humanise(seed: number, index: number): Humanise {
  return {
    cents: (hash01(seed, index * 2) * 2 - 1) * HUMANISE_CENTS,
    delaySeconds: (hash01(seed, index * 2 + 1) * 2 - 1) * HUMANISE_SECONDS,
  };
}

// --------------------------------------------------------------- intensity ---

/** Everything the music needs to know about the round. Plain data, no sim types. */
export interface RoundMood {
  /** Remaining spin of each top still in the round, normalised 0..1. */
  spins: readonly number[];
  /** Seconds elapsed in the round. */
  roundTime: number;
  /** Either fighter is one round away from taking the match. */
  matchPoint: boolean;
}

/** Where the music sits when no round is running. Pad, and a hint of bass. */
export const MENU_INTENSITY = 0.12;

/**
 * Intensity, from what is actually happening rather than from a timer.
 *
 * Driven by the WEAKEST top, not the average and not the player's. A round
 * where one top is nearly out is tense regardless of which one it is, and
 * averaging the two would let a healthy top cancel out a dying one — turning
 * the most dramatic state in the game into a middling number.
 *
 * The clock and match-point terms are small on purpose. They are context, and
 * context should colour the mix rather than drive it; a round that is genuinely
 * still calm at 60 seconds should still sound calm.
 */
export function musicIntensity(mood: RoundMood): number {
  if (mood.spins.length === 0) return MENU_INTENSITY;
  let weakest = 1;
  for (const s of mood.spins) {
    const c = clampUnit(s);
    if (c < weakest) weakest = c;
  }
  // Superlinear, so the last quarter of a top's life is where most of the
  // build happens. A linear term spends its range on the healthy majority of
  // the round, where there is nothing to say.
  const danger = (1 - weakest) ** 1.4;
  const clock = clampUnit(mood.roundTime / ROUND_TIME_LIMIT);
  return clampUnit(
    // A launched round is never at menu level: something is happening.
    0.18 + danger * 0.62 + clock * 0.22 + (mood.matchPoint ? 0.14 : 0),
  );
}

export interface LayerGains {
  pad: number;
  bass: number;
  arp: number;
  perc: number;
  tension: number;
}

/**
 * Which stems are audible at this intensity.
 *
 * Every one is a smooth ramp, never a gate. A layer that switches on is a layer
 * the player hears switch on, and once they have heard the seam they hear it
 * every time; a stem that arrives over a fifth of the intensity range simply
 * turns out to be there.
 *
 * The midpoints are the ones the layering plan calls for — bass 0.15, arp 0.45,
 * perc 0.70 — with a ±0.10 window around each.
 */
export function layerGains(intensity: number, finalRound: boolean): LayerGains {
  const i = clampUnit(intensity);
  return {
    // The pad never leaves. It is what establishes the key and, more usefully,
    // what hides the seam where every other layer's loop restarts.
    pad: 0.75 + 0.25 * i,
    bass: fade(i, 0.05, 0.25),
    arp: fade(i, 0.35, 0.55),
    perc: fade(i, 0.6, 0.8),
    // The final-round layer is gated on the ROUND, not on the action, which is
    // the point of it: it should be there from the first second of a match
    // point, before anything has happened, so the player knows what this round
    // is before they launch. It still fades with intensity so it does not sit
    // flat for 75 seconds.
    tension: finalRound ? fade(i, 0.15, 0.4) : 0,
  };
}

/**
 * Time constants for moving a stem's gain, seconds.
 *
 * Asymmetric, and the asymmetry is the whole trick. Tension should ARRIVE — a
 * rise of about 200 ms (three time constants of 0.07) quantised to the next
 * beat reads as intentional. Tension should DRAIN — a fall of two to three
 * seconds, unquantised, reads as relief. Swap them and the music sounds either
 * glitched or mushy.
 */
export const STEM_RISE_TAU = 0.07;
export const STEM_FALL_TAU = 0.9;

/** Don't rewrite a stem's gain for a change smaller than this. */
export const STEM_GAIN_EPS = 0.01;
