import * as C from './constants';
import { clamp, dist, dot, len, norm, perp, rotate, vec } from './math';
import type { Vec2 } from './math';
import type { BeyState } from './types';

/**
 * The physics model.
 *
 * A real spinning top in a dish does *not* simply roll to the lowest point. Its
 * angular momentum makes it precess: the contact force from the slope produces
 * a response perpendicular to that force, so the top tracks a circular orbit
 * around the dish. As spin bleeds away the precession weakens and the orbit
 * decays inward — which is exactly the arc of a real Beyblade match.
 *
 * We model that directly rather than through a general rigid-body solver:
 *   1. radial acceleration from the dish slope (toward the centre)
 *   2. a rotation applied to the velocity vector, proportional to spin
 *      (precession — energy preserving, so it can't run away)
 *   3. driver self-propulsion (aggressive tips push outward and hunt)
 *   4. drag, then integrate
 *
 * Every force is a closed-form function of state, so a step is deterministic
 * and cheap; with a handful of tops there is nothing for a WASM broadphase to
 * do that this doesn't already do faster.
 */

/** Height of the dish floor at radius r. Used by the renderer to place tops. */
export function bowlHeight(r: number): number {
  const parabola = C.BOWL_DEPTH * (r / C.STADIUM_RADIUS) ** 2;
  const d = (r - C.RIDGE_RADIUS) / C.RIDGE_WIDTH;
  const ridge = 0.035 * Math.exp(-d * d);
  return parabola + ridge;
}

/** Inward (negative = toward centre) radial acceleration from the dish slope. */
function slopeAccel(r: number): number {
  // Parabolic dish: pull grows linearly with radius.
  let a = -C.SLOPE_ACCEL * (r / C.STADIUM_RADIUS);
  // Tornado ridge: a bump that shoves tops back down into the outer orbit.
  const d = (r - C.RIDGE_RADIUS) / C.RIDGE_WIDTH;
  a -= C.RIDGE_STRENGTH * d * Math.exp(-d * d);
  return a;
}

/** The modifiers for a top's active move, or neutral values if it has none. */
export function moveProfile(b: BeyState): C.MoveProfile {
  return b.move ? C.MOVES[b.move] : NEUTRAL_MOVE;
}

const NEUTRAL_MOVE: C.MoveProfile = {
  duration: 0,
  cost: 0,
  wander: 1,
  friction: 1,
  attack: 1,
  defense: 1,
  burstResist: 1,
  knockback: 1,
  spinDrain: 0,
  speedKick: 0,
  spinRetention: 1,
  reflect: 0,
};

/**
 * How much collision damage a top can take yet, in [0, 1]. Ramps in over
 * SETTLE_TIME with a smoothstep so the transition isn't a hard edge.
 */
export function settleScale(b: BeyState): number {
  const t = clamp(b.age / C.SETTLE_TIME, 0, 1);
  return t * t * (3 - 2 * t);
}

/** Normalised remaining spin in [0, 1]. */
export const spinNorm = (b: BeyState): number =>
  clamp(Math.abs(b.spin) / C.SPIN_REF, 0, 1);

/** Advance one top by dt, ignoring collisions. */
function integrate(b: BeyState, dt: number): void {
  const r = len(b.pos);
  const outward = r < 1e-6 ? vec(1, 0) : vec(b.pos.x / r, b.pos.y / r);
  const sn = spinNorm(b);

  // 1. dish slope
  const accel = vec(outward.x * slopeAccel(r), outward.y * slopeAccel(r));

  // 3. driver self-propulsion: aggressive tips climb outward toward the ridge
  //    and lose that push as they run out of spin. The active move scales this,
  //    which is what makes a charging top visibly hunt and an blocking one sit.
  const mv = moveProfile(b);
  const drive = b.stats.wander * sn * sn * 2.6 * mv.wander;
  accel.x += outward.x * drive;
  accel.y += outward.y * drive;

  b.vel.x += accel.x * dt;
  b.vel.y += accel.y * dt;

  // 2. precession — rotate the velocity rather than adding force, so this
  //    steers the top without injecting energy.
  const precession = C.PRECESSION_RATE * Math.sign(b.spin) * sn;
  const rotated = rotate(b.vel, precession * dt);
  b.vel.x = rotated.x;
  b.vel.y = rotated.y;

  // 4. drag from the tip scrubbing the floor
  const drag = C.DRAG_BASE * b.stats.friction * mv.friction;
  const damp = Math.exp(-drag * dt);
  b.vel.x *= damp;
  b.vel.y *= damp;

  b.pos.x += b.vel.x * dt;
  b.pos.y += b.vel.y * dt;

  // spin decay: passive loss plus loss from moving across the floor
  const speed = len(b.vel);
  // Holding a move costs spin. Block's high cost is exactly why refusing the
  // engagement (Dodge) beats it: it bleeds itself dry waiting for contact.
  // The move's friction scales the scrubbing term as well as the drag. Missing
  // this made Dodge's free-running tip lose *more* spin than an blocking one,
  // which is backwards and broke the triangle.
  const loss =
    (C.SPIN_DECAY_BASE +
      C.SPIN_DECAY_MOTION * speed * b.stats.friction * mv.friction) /
      (b.stats.spinRetention * mv.spinRetention) +
    mv.spinDrain;
  const mag = Math.max(0, Math.abs(b.spin) - loss * dt);
  b.spin = mag * Math.sign(b.spin);

  // visual state
  b.angle += b.spin * dt * 0.05;
  b.tilt = clamp(speed * 0.06 + (1 - sn) * 0.22, 0, 0.42);
  b.burst = Math.max(0, b.burst - C.BURST_RECOVERY * dt);
  b.hitFlash = Math.max(0, b.hitFlash - dt * 3.5);
  b.age += dt;
  b.meter = clamp(b.meter + C.METER_GAIN_PER_SEC * dt, 0, 1);
  if (b.moveTime > 0) {
    b.moveTime = Math.max(0, b.moveTime - dt);
    if (b.moveTime === 0) b.move = null;
  }
}

/** True if this top blocked within the perfect-timing window. */
function isPerfectBlock(b: BeyState): boolean {
  if (b.move !== 'block') return false;
  const elapsed = C.MOVES.block.duration - b.moveTime;
  return elapsed <= C.PERFECT_BLOCK_WINDOW;
}

/** Angular centre of each exit pocket, radians. */
export const pocketAngles = (): number[] =>
  Array.from(
    { length: C.POCKET_COUNT },
    (_, i) => C.POCKET_OFFSET + (i * 2 * Math.PI) / C.POCKET_COUNT,
  );

/** Smallest absolute angular difference between two angles. */
function angleDelta(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

/** True if the given bearing lines up with one of the exit pockets. */
export function inPocket(angle: number): boolean {
  return pocketAngles().some((p) => angleDelta(angle, p) < C.POCKET_HALF_WIDTH);
}

/**
 * Handle the rim. A top that reaches the wall bounces off it — unless it is
 * lined up with an exit pocket and carrying enough outward speed, in which case
 * it sails through and gets ringed out.
 */
function resolveWall(b: BeyState): void {
  const r = len(b.pos);
  const limit = C.STADIUM_RADIUS - b.stats.radius;
  if (r <= limit) return;

  const n = norm(b.pos);
  const vn = dot(b.vel, n);
  const bearing = Math.atan2(b.pos.y, b.pos.x);

  if (inPocket(bearing) && vn > C.POCKET_ESCAPE_SPEED) {
    return; // let it fly out; the round logic sees it cross EXIT_RADIUS
  }

  // Only reflect if actually moving outward, so we can't trap it in the wall.
  if (vn > 0) {
    b.vel.x -= (1 + C.WALL_RESTITUTION) * vn * n.x;
    b.vel.y -= (1 + C.WALL_RESTITUTION) * vn * n.y;
    b.spin = Math.max(0, Math.abs(b.spin) - Math.abs(vn) * 5) * (Math.sign(b.spin) || 1);
    b.hitFlash = Math.max(b.hitFlash, Math.min(1, Math.abs(vn) * 0.4));
  }
  b.pos.x = n.x * limit;
  b.pos.y = n.y * limit;
}

export interface HitEvent {
  a: string;
  b: string;
  /** Contact point on the stadium plane. */
  at: Vec2;
  /** Normal impact speed — drives spark intensity and screen shake. */
  strength: number;
  /** True when the two tops spin in opposite directions. */
  opposite: boolean;
  /** A critical clash: amplified, and allowed past the normal per-hit cap. */
  crit: boolean;
  /** Someone blocked on the read and punished the attacker hard. */
  perfectBlock: boolean;
}

/**
 * Resolve a collision between two tops.
 *
 * Three things happen on contact, and the interplay between them is what makes
 * builds feel different:
 *   - an elastic impulse along the contact normal (who gets pushed)
 *   - a tangential "smash": the attacker's spin bites and flings the defender
 *     sideways, scaled by attack vs. mass — this is what causes ring-outs
 *   - spin drain and burst charge, scaled by attack vs. defense/burstResist
 */
function resolvePair(a: BeyState, b: BeyState, rng: () => number): HitEvent | null {
  const d = dist(a.pos, b.pos);
  const minDist = a.stats.radius + b.stats.radius;
  if (d >= minDist || d < 1e-9) return null;

  const n = vec((b.pos.x - a.pos.x) / d, (b.pos.y - a.pos.y) / d);
  const t = perp(n);

  // Separate so they don't stick together.
  const overlap = minDist - d;
  const totalMass = a.stats.mass + b.stats.mass;
  const pushA = overlap * (b.stats.mass / totalMass);
  const pushB = overlap * (a.stats.mass / totalMass);
  a.pos.x -= n.x * pushA;
  a.pos.y -= n.y * pushA;
  b.pos.x += n.x * pushB;
  b.pos.y += n.y * pushB;

  const rel = vec(b.vel.x - a.vel.x, b.vel.y - a.vel.y);
  const vn = dot(rel, n);
  if (vn > 0) return null; // already separating

  // Normal impulse.
  const invMassA = 1 / a.stats.mass;
  const invMassB = 1 / b.stats.mass;
  // Knockback resistance is per-move: an blocking top barely moves, which is
  // what lets it absorb a charge instead of being flung by it.
  const mvA = moveProfile(a);
  const mvB = moveProfile(b);
  const j = (-(1 + C.RESTITUTION) * vn) / (invMassA + invMassB);
  a.vel.x -= j * invMassA * n.x * mvA.knockback;
  a.vel.y -= j * invMassA * n.y * mvA.knockback;
  b.vel.x += j * invMassB * n.x * mvB.knockback;
  b.vel.y += j * invMassB * n.y * mvB.knockback;

  const impact = Math.abs(vn);
  const dirA = Math.sign(a.spin);
  const dirB = Math.sign(b.spin);

  // Glancing contact: we've already separated them and exchanged momentum, but
  // it doesn't count as a clash. Bailing here is what keeps two tops sharing an
  // orbit from grinding out hundreds of scoring hits per round.
  if (impact < C.MIN_IMPACT) return null;

  // Smash attack: spin biting at the contact point throws the other top
  // sideways. Each top pushes the other along the tangent, in the direction
  // its own spin is turning. This is what converts attack into ring-outs.
  // Neither top can be hurt until both have settled. Taking the minimum means
  // a top that has only just launched cannot be deleted by one that has been
  // circling for a while.
  const settle = Math.min(settleScale(a), settleScale(b));

  // Moves scale what each side deals and absorbs.
  const atkA = a.stats.attack * mvA.attack;
  const atkB = b.stats.attack * mvB.attack;
  const burstResA = a.stats.burstResist * mvA.burstResist;
  const burstResB = b.stats.burstResist * mvB.burstResist;

  const smashA =
    Math.min(C.SMASH_MAX, C.SMASH_COEFF * spinNorm(a) * atkA * impact * invMassB) *
    settle *
    mvB.knockback;
  const smashB =
    Math.min(C.SMASH_MAX, C.SMASH_COEFF * spinNorm(b) * atkB * impact * invMassA) *
    settle *
    mvA.knockback;
  b.vel.x += t.x * smashA * dirA;
  b.vel.y += t.y * smashA * dirA;
  a.vel.x -= t.x * smashB * dirB;
  a.vel.y -= t.y * smashB * dirB;

  // Spin drain and burst charge.
  const opposite = dirA !== dirB && dirA !== 0 && dirB !== 0;
  const oppMul = opposite ? C.OPPOSITE_SPIN_DRAIN : 1;

  // Who was charging whom? A clash where both tops are punished equally tends
  // to kill both at once; real clashes have an aggressor. The top carrying more
  // speed *into* the contact deals more and takes less, which is what makes a
  // high-wander attack build worth playing.
  const closingA = dot(a.vel, n); // a moving toward b
  const closingB = -dot(b.vel, n); // b moving toward a
  const closingTotal = closingA + closingB;
  const shareA =
    closingTotal > 1e-6 ? clamp(closingA / closingTotal, 0, 1) : 0.5;
  const shareB = 1 - shareA;
  // Full aggressor deals 1.5x and receives 0.5x.
  const aggrA = 0.5 + shareA;
  const aggrB = 0.5 + shareB;

  // Raw drain uses the *build's* defense only. The move's defensive multiplier
  // is applied after the per-hit cap below — applied before it, a big hit blew
  // past the ceiling anyway and a full-meter Block bought a 9% reduction.
  const drainOnB =
    ((impact * C.HIT_SPIN_LOSS * atkA * aggrA) / b.stats.defense) * oppMul;
  const drainOnA =
    ((impact * C.HIT_SPIN_LOSS * atkB * aggrB) / a.stats.defense) * oppMul;
  const recoilA = impact * C.HIT_SPIN_RECOIL * shareA * oppMul;
  const recoilB = impact * C.HIT_SPIN_RECOIL * shareB * oppMul;

  // No single clash may erase a top — otherwise a violent head-on takes both
  // below the finish threshold on the same step and the round is a draw.
  // A critical amplifies the exchange *and* lifts the per-hit ceiling. Without
  // lifting the ceiling the normal cap clamps a critical straight back down to
  // an ordinary hit and the player never sees it.
  const crit = rng() < C.CRIT_CHANCE;
  const critMult = crit ? C.CRIT_MULT : 1;
  const capFrac = crit ? C.CRIT_SPIN_CAP : C.MAX_SPIN_LOSS_PER_HIT;
  const critCapA = a.spinAtLaunch * capFrac;
  const critCapB = b.spinAtLaunch * capFrac;

  // Cap the raw exchange, then let the defensive move mitigate what's left.
  const rawA = Math.min(critCapA, (drainOnA + recoilA) * critMult) * settle;
  const rawB = Math.min(critCapB, (drainOnB + recoilB) * critMult) * settle;
  const lossA = rawA / mvA.defense;
  const lossB = rawB / mvB.defense;

  // Anchored tops return part of the hit to whoever threw it — but only in
  // proportion to how much that top was actually charging in. Applying it flat
  // punished a disengaging top for being bumped, which is what stopped Dodge
  // from ever beating Block.
  // Reflect scales off the hit the *blocker absorbed*, not off the damage the
  // attacker happened to take — an blocking top deals almost nothing, so
  // measuring it the other way round made the punish vanish. Scaled by the
  // attacker's own aggression, so only a top that charged in gets stung.
  // Blocking on the read — contact landing just after the block starts — turns
  // a survivable exchange into a punish that can end a round outright.
  const perfectA = isPerfectBlock(a);
  const perfectB = isPerfectBlock(b);
  const reflectToA = rawB * mvB.reflect * shareA * (perfectB ? C.PERFECT_BLOCK_REFLECT_MULT : 1);
  const reflectToB = rawA * mvA.reflect * shareB * (perfectA ? C.PERFECT_BLOCK_REFLECT_MULT : 1);

  a.spin = Math.max(0, Math.abs(a.spin) - lossA - reflectToA) * (dirA || 1);
  b.spin = Math.max(0, Math.abs(b.spin) - lossB - reflectToB) * (dirB || 1);

  a.burst += ((impact * C.BURST_PER_HIT * atkB * aggrB) / burstResA) * settle;
  b.burst += ((impact * C.BURST_PER_HIT * atkA * aggrA) / burstResB) * settle;

  // Landing a clash banks meter for both sides, weighted to the aggressor.
  a.meter = clamp(a.meter + C.METER_GAIN_PER_HIT * shareA, 0, 1);
  b.meter = clamp(b.meter + C.METER_GAIN_PER_HIT * shareB, 0, 1);

  // Round-breakdown bookkeeping: the aggressor is credited with the hit, and
  // each side is credited with the spin it actually removed.
  a.spinDealt += lossB;
  b.spinDealt += lossA;
  if (shareA >= 0.5) a.hitsLanded += 1;
  else b.hitsLanded += 1;
  a.biggestHit = Math.max(a.biggestHit, impact);
  b.biggestHit = Math.max(b.biggestHit, impact);

  a.hitFlash = 1;
  b.hitFlash = 1;

  return {
    a: a.id,
    b: b.id,
    at: vec((a.pos.x + b.pos.x) / 2, (a.pos.y + b.pos.y) / 2),
    strength: impact,
    opposite,
    crit,
    perfectBlock: perfectA || perfectB,
  };
}

/**
 * Advance the whole field by one fixed step. Returns collision events for the
 * renderer to turn into sparks and shake.
 */
export function step(
  beys: BeyState[],
  dt: number,
  rng: () => number = Math.random,
): HitEvent[] {
  const hits: HitEvent[] = [];

  for (const b of beys) {
    if (!b.alive) continue;
    integrate(b, dt);
  }

  // Pairwise — with 2-8 tops this is trivially cheap and exact.
  for (let i = 0; i < beys.length; i++) {
    for (let k = i + 1; k < beys.length; k++) {
      const a = beys[i];
      const b = beys[k];
      if (!a.alive || !b.alive) continue;
      const hit = resolvePair(a, b, rng);
      if (hit) hits.push(hit);
    }
  }

  for (const b of beys) {
    if (!b.alive) continue;
    resolveWall(b);
  }

  return hits;
}
