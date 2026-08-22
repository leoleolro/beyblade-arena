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
