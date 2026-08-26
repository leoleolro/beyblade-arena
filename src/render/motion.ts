import type { BeyState } from '../sim/types';

/**
 * Turning simulated motion into something you can see.
 *
 * THE PROBLEM THIS EXISTS FOR, stated as the owner reported it: "there should
 * be an increase in speed when the beyblade gets speed up, the blades shouldn't
 * be travelling at the same speed throughout the game."
 *
 * The first move was to check whether the sim was actually holding speed flat,
 * because that is what the report describes. It is not, and it is not close.
 * Sampled every frame across ten AI-played rounds:
 *
 *   p10 0.63   p50 1.64   p90 2.99   peak 4.34
 *   within a SINGLE round, one top's own p90/p10 ratio averages 4.32x
 *
 * A top genuinely accelerates and decelerates by more than four times inside a
 * round. The physics was never the problem.
 *
 * The problem was that the renderer read velocity in exactly one place — the
 * full-screen speed lines — and that consumer only starts above 2.0, which is
 * past the median. So for most of every round a top drifting at 0.8 and a top
 * charging at 1.9 were drawn identically, and the speed the sim was carefully
 * computing reached the player through nothing at all.
 *
 * This module is where speed becomes presentation. It is deliberately separate
 * from arena.ts and free of three.js: the mapping is the part that can be
 * wrong, and keeping it pure is what lets it be tested against the measured
 * numbers instead of eyeballed in a browser.
 */

/**
 * The speed band the cues ramp across.
 *
 * MEASURED, not chosen, and the distinction matters. The obvious move is to
 * pick round numbers — 0 to 5 looks reasonable and is wrong, because the
 * measured median is 1.64, so an 0–5 ramp would put every ordinary moment of
 * the game below a third of its range and make every cue look broken rather
 * than subtle. 0.5 to 3.2 brackets the real p10–p90 with a little headroom, and
 * lands the median near 0.42 where a curve has somewhere to go in both
 * directions.
 */
export const SPEED_LO = 0.5;
export const SPEED_HI = 3.2;

const clampUnit = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** How fast this top is going, 0..1, against the band a round actually uses. */
export function speedK(b: Pick<BeyState, 'vel'>): number {
  return clampUnit((Math.hypot(b.vel.x, b.vel.y) - SPEED_LO) / (SPEED_HI - SPEED_LO));
}

/**
 * Trail opacity for a given speed, as a fraction of the theme's own setting.
 *
 * FLOORED AT 0.3 rather than fading to nothing. The trail is also the thing
 * that tells you which top is yours — it carries the skin colour — so a top
 * that has slowed almost to a stop still needs a visible one. The cue is the
 * CHANGE between 0.3 and 1.0, not the presence of a streak.
 */
export function trailScale(b: Pick<BeyState, 'vel'>): number {
  return 0.3 + 0.7 * speedK(b);
}

/* ------------------------------------------------------------ spin, drawn */

/**
 * Fraction of one blade-step a top may turn per frame before the eye stops
 * seeing rotation.
 *
 * Sampling theory, not taste. A shape with `n` identical blades repeats every
 * `2π/n`, so a rotation of more than HALF a blade step per frame is
 * indistinguishable from a smaller rotation the other way — the Nyquist limit,
 * and the reason a wagon wheel goes backwards on film. 0.32 sits comfortably
 * below 0.5, far enough that the direction is unambiguous and the motion looks
 * continuous rather than stepped.
 */
const SAFE_STEP_FRACTION = 0.32;

/** The frame rate the safe rate is computed against. */
const ASSUMED_FPS = 60;

/**
 * How fast to actually TURN a top on screen, in rad/s.
 *
 * WHY THE DRAWN RATE IS NOT THE SIMULATED ONE. The sim advances `angle` at
 * `spin · dt · 0.05`, which at SPIN_REF 900 is 0.75 rad per 60fps frame — 43°.
 * Against a layer's blade step that is:
 *
 *   3 blades (step 120°)   0.36 of a step   under Nyquist, but visibly stepped
 *   6 blades (step 60°)    0.71 of a step   ALIASES — turns the wrong way
 *   8 blades (step 45°)    0.955 of a step  aliases to a near-stationary crawl
 *
 * spinBlur.ts worked this out and solved it for the cel theme by covering the
 * blades with a drawn smear. The other two themes never got a solution, so a
 * top spinning at full speed in Arena or Overdrive renders as a rock sitting on
 * the dish — which is exactly how it looks, and a large part of why the game
 * reads as static however fast the physics says things are moving.
 *
 * The honest fix for a 3D theme is to draw a rate the eye can integrate. A
 * beyblade's real spin is unrepresentable at 60fps no matter what we do; the
 * choice is between a rate that reads as "fast" and a rate that reads as
 * "stopped", and only one of those is informative. So the rate is capped per
 * blade count, and scaled by remaining spin so a dying top still visibly winds
 * down — which is the one thing the spin number needs to communicate.
 *
 * `blades` is the layer's declared count. For an imported model that is an
 * approximation of a symmetry nobody has measured, and it is the right kind of
 * wrong: over-declaring blades just turns the top more slowly than it could.
 */
export function drawnSpinRate(spinNorm: number, blades: number): number {
  const step = (Math.PI * 2) / Math.max(1, blades);
  const maxRate = step * SAFE_STEP_FRACTION * ASSUMED_FPS;
  // Floored at a quarter so a top on its last legs is still turning. Zero would
  // read as already dead, several seconds before it is.
  const k = 0.25 + 0.75 * (spinNorm < 0 ? 0 : spinNorm > 1 ? 1 : spinNorm);
  return maxRate * k;
}

/* ------------------------------------------------------- the clash pool */

/**
 * The two curves that make the white pool under a clash a FLASH and not a WAVE.
 *
 * They live here rather than in clashPool.ts for the reason this whole module
 * exists: everything in this file is pure and imports nothing from three, so it
 * can be tested. The distinction these encode is a design decision that was got
 * wrong once already — the effect shipped as a thin expanding ring and was
 * reported as "just a small wave like a water drop" — and a silent regression
 * back toward ring behaviour would look like a tuning drift rather than a bug.
 */

/** How much of its life the pool spends reaching full brightness. */
const POOL_ATTACK = 0.12;

/**
 * Size over life, as a fraction of final width.
 *
 * BORN NEARLY FULL SIZE. A front that expands a long way reads as something
 * LEAVING; a flash already at full size when you notice it reads as something
 * HAPPENING. `Shockwave` deliberately does the opposite — it is born at 22% of
 * its travel — and that difference is the whole distinction between the two.
 */
export function poolScale(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  const eased = 1 - (1 - c) * (1 - c);
  return 0.82 + 0.18 * eased;
}

/**
 * Brightness over life: hard attack, long decay.
 *
 * NOT the ring's `sin(pi*t)`. That curve is symmetric, so it spends as long
 * arriving as it does leaving — right for a wave passing through, wrong for an
 * impact, which is instantaneous and then fades. At 60fps and a 0.26s life this
 * peaks on frame two and is still half-lit eight frames later.
 */
export function poolBrightness(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  if (c < POOL_ATTACK) return c / POOL_ATTACK;
  return Math.pow(1 - (c - POOL_ATTACK) / (1 - POOL_ATTACK), 1.7);
}

/* ------------------------------------------------- imported model uprighting */

/**
 * Which way up an imported beyblade arrived, from its bounding box alone.
 *
 * THE BUG THIS EXISTS FOR, reported as: "victory valkyrie and mage jab is
 * spinning on the wrong axis, and the beyblades are placed vertically rather
 * than horizontally."
 *
 * Both were exported Z-up. Blender's default is Z-up and glTF's is Y-up, and an
 * export that skips the conversion arrives standing on its edge. Measured:
 *
 *     valkyrie   x 47.98   y 47.46   z 32.49    <- z is shortest: Z-up
 *     magejab    x 49.79   y 49.91   z 38.31    <- z is shortest: Z-up
 *     dsycther   x 44.22   y 24.60   z 45.12    <- y is shortest: correct
 *     dransword  x  0.47   y  0.36   z  0.48    <- y is shortest: correct
 *
 * THE RULE. A beyblade is a flat disc — much wider than it is tall, always,
 * across every generation and every type. So the SHORTEST bounding-box axis is
 * the spin axis, and that axis has to end up as Y. This needs no per-model
 * configuration and works for the next import as well as these four, which is
 * the whole reason to derive it rather than hand-flag each file.
 *
 * WHERE IT FAILS, so nobody trusts it further than it goes: a model that is not
 * disc-shaped. A near-spherical or cubic export has no meaningful shortest axis
 * and this will pick one arbitrarily. `dominance` reports how confident the
 * reading is so a caller can refuse rather than guess — see `uprightAxis`.
 */
export type UpAxis = 'x' | 'y' | 'z';

export interface Upright {
  /** Which authored axis is the spin axis. */
  axis: UpAxis;
  /** Radians to rotate about X to bring that axis to Y. 0 when already Y-up. */
  rotateX: number;
  /**
   * How much flatter the shortest axis is than the mean of the other two.
   * 1 = perfectly flat disc, 0 = no flatter at all. Below ~0.15 the model is
   * not disc-shaped and the reading should not be trusted.
   */
  dominance: number;
}

export function uprightAxis(sx: number, sy: number, sz: number): Upright {
  const dims: Array<[UpAxis, number]> = [
    ['x', Math.abs(sx)],
    ['y', Math.abs(sy)],
    ['z', Math.abs(sz)],
  ];
  dims.sort((a, b) => a[1] - b[1]);
  const [axis, shortest] = dims[0];
  const others = (dims[1][1] + dims[2][1]) / 2;
  const dominance = others > 1e-9 ? Math.max(0, 1 - shortest / others) : 0;

  // Rotating about X maps +Z onto +Y (and +Y onto -Z), which is exactly the
  // Z-up to Y-up conversion. An X-up model is a case nobody has produced; it is
  // handled rather than thrown for, because refusing to draw a bey is worse
  // than drawing it on its side, and `dominance` is how a caller knows.
  const rotateX = axis === 'z' ? -Math.PI / 2 : axis === 'x' ? 0 : 0;
  return { axis, rotateX, dominance };
}

/** True when a bounding box is flat enough for `uprightAxis` to be trusted. */
export const isDiscLike = (u: Upright): boolean => u.dominance >= 0.15;
