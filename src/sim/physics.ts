import * as C from './constants';
import { clamp, dist, dot, len, norm, perp, rotate, vec } from './math';
import type { Vec2 } from './math';
import type { BeyState } from './types';
import type { ArenaSpec, PitSpec, RailSpec } from './arena';
import { STANDARD } from './arena';

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
  kickMode: 'none',
  seek: 0,
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

/**
 * Relative surface speed of two touching tops at their contact point.
 *
 * This is the quantity that decides whether a contact GRINDS. Friction sparks
 * are not thrown by force, they are thrown by slip: the two surfaces moving
 * past each other tear microscopic chips off, and the work that tears them
 * loose heats them past ignition. A hard head-on with no relative surface
 * motion polishes; a light contact with a lot of slip throws a shower.
 *
 * With `n` the unit normal from a to b, each top's surface velocity at the
 * contact is its angular velocity crossed with its own contact radius:
 *
 *     va = ωa · ra · perp(n)      (a's contact radius points along +n)
 *     vb = −ωb · rb · perp(n)     (b's points along −n)
 *     slip = va − vb = (ωa·ra + ωb·rb) · perp(n)
 *
 * Note the SUM, and that it is signed. Two touching tops are meshing gears,
 * and meshing gears have to counter-rotate to roll without slipping — so the
 * terms CANCEL in an opposite-spin matchup and ADD in a same-spin one. That is
 * the reverse of where the rest of this game's drama lives, and it is useful:
 * opposite-spin already owns the big normal impacts, the crits and the spin
 * steal, while same-spin is sold in the garage as "a quieter attrition race"
 * and had no signature of its own.
 *
 * Returned signed, along perp(n) = (−n.y, n.x). Pure, and used only by the
 * renderer today — but it is physics, not presentation, so it lives here where
 * it can be tested without a GL context.
 */
export const surfaceSlip = (a: BeyState, b: BeyState): number =>
  a.spin * a.stats.radius + b.spin * b.stats.radius;

/**
 * `surfaceSlip` mapped to 0..1 against the hardest grind the game can produce:
 * two full-spin tops of typical layer radius turning the same way.
 *
 * Worth having as its own function because the raw number is in units nobody
 * has intuition for. Measured across the catalog at full spin: a same-spin
 * pairing slips about 188, an opposite-spin one about 3.5 — a factor of 54,
 * because the opposite case nearly cancels and only the difference in the two
 * layers' radii survives. The first cut of the renderer's spark scaling was
 * written against an assumed range of 0..5 and consequently pinned every
 * contact at the maximum, which is exactly the "every hit looks identical"
 * failure the strength-scaled sparks were meant to fix.
 */
export const slipNorm = (a: BeyState, b: BeyState): number =>
  clamp(Math.abs(surfaceSlip(a, b)) / (2 * C.SPIN_REF * 0.106), 0, 1);

/**
 * How hard two touching tops abrade each other, 0..1.
 *
 * `slipNorm` alone is not the whole story, and taking it as the whole story
 * makes the effect vanish exactly where it should be strongest. That formula
 * treats each layer as a smooth disc, so counter-rotating tops come out as
 * meshing gears in pure rolling contact — slip near zero, no grinding. Measured
 * on real leaning contacts in an opposite-spin round: peak slip 3.4 out of a
 * possible 190.
 *
 * But a Beyblade layer is not a smooth disc. It is three to eight BLADES. Two
 * bladed tops leaning together do not roll; each blade edge arrives at the
 * other surface, catches, and is dragged across it at that top's own surface
 * speed, whichever way the other one happens to be turning. The net slip
 * governs how smoothly the two surfaces mesh; the absolute blade speed governs
 * how violently the edges hack at each other, and for a bladed top that second
 * term never goes to zero while either top is still spinning.
 *
 * So: a floor from absolute surface speed, and the rest from true slip. An
 * opposite-spin lean abrades steadily (edges catching), a same-spin scrape
 * abrades about three times harder (edges catching AND the surfaces genuinely
 * running past each other). Both pairings get a grind; they get different ones.
 */
export const abrasion = (a: BeyState, b: BeyState): number => {
  const edge =
    (Math.abs(a.spin) * a.stats.radius + Math.abs(b.spin) * b.stats.radius) /
    (2 * C.SPIN_REF * 0.106);
  return clamp(edge * (0.34 + 0.66 * slipNorm(a, b)), 0, 1);
};

/**
 * The X-Rail.
 *
 * Three phases, all driven off state already on the top:
 *
 *  1. **Engage** — inside the band, moving tangentially fast enough, off
 *     cooldown. A top that merely drifts across the rail is not carrying enough
 *     speed for the teeth to bite, which is what makes riding it a choice.
 *  2. **Hold** — radial velocity is cancelled so it tracks the band, and
 *     tangential speed is driven up to the ceiling.
 *  3. **Release** — the exit velocity is rotated toward the centre. The
 *     slingshot is the point; the speed is just how hard it arrives.
 */
/**
 * The Spike Pit: rent on the safe square.
 *
 * The drain is the product of two ramps, and both matter:
 *
 *  - **Depth.** Zero at the pit's edge, full at the centre. A cliff would only
 *    relocate the camp to just outside the rim; a gradient means there is no
 *    radius that is quietly optimal.
 *  - **Dwell.** Zero until `grace` seconds of *unbroken* occupancy. Crossing
 *    the middle to reach an opponent has to stay free, or the pit would punish
 *    the aggression it exists to reward. Leaving resets the clock, so the pit
 *    is escapable by playing — not by winning a stat check.
 *
 * Applied as spin loss rather than a force: pushing tops out physically would
 * fight the precession model and make the orbit unreadable.
 */
function updatePit(b: BeyState, pit: PitSpec, dt: number): void {
  const r = len(b.pos);
  if (r >= pit.radius) {
    b.pitTime = 0;
    return;
  }

  b.pitTime += dt;
  const depth = 1 - r / pit.radius;
  const dwell = pit.grace <= 0 ? 1 : clamp(b.pitTime / pit.grace, 0, 1);
  const loss = pit.drain * depth * dwell * dt;

  const before = Math.abs(b.spin);
  const after = Math.max(0, before - loss);
  b.spin = after * Math.sign(b.spin);
  b.pitDrained += before - after;
}

function updateRail(b: BeyState, rail: RailSpec, dt: number): void {
  b.railCooldown = Math.max(0, b.railCooldown - dt);
  b.railIdle += dt;

  // The Dash stat, read once. See the note at the engage check below for why
  // it scales the dash rather than gating it.
  const grip = Math.max(0.2, b.stats.railGrip);

  const r = len(b.pos);
  if (r < 1e-6) return;

  const outX = b.pos.x / r;
  const outY = b.pos.y / r;
  // Tangential direction, matching the way this top is already going round.
  const spinSign = Math.sign(b.spin) || 1;
  const tanX = -outY * spinSign;
  const tanY = outX * spinSign;
  const tangential = b.vel.x * tanX + b.vel.y * tanY;

  if (b.railTime > 0) {
    b.railTime = Math.max(0, b.railTime - dt);

    // Cancel radial drift so the top tracks the band instead of spiralling off.
    const radial = b.vel.x * outX + b.vel.y * outY;
    b.vel.x -= outX * radial;
    b.vel.y -= outY * radial;

    // Drive it along the rail, up to the ceiling — which RISES with the streak.
    //
    // This is the "small bumps then big bumps" half of the mechanic. The first
    // ride of a burst tops out at the spec's `maxSpeed`; each consecutive one
    // adds `escalation` until `escalationMax`. Without this every ride was
    // identical and the rail was a rare special event rather than a rhythm that
    // builds — see docs/PHYSICS.md.
    // Grip scales BOTH the drive and the ceiling, so a low-Dash tip gets a
    // gentler dash rather than none.
    //
    // FLOORED AT 0.85, and the floor is load-bearing. The first version used
    // 0.55, which gave a 45% spread across the catalogue and looked like a
    // healthier decision — but measured, it weakened the rail for the two
    // thirds of the roster that are not attack bottoms, and the rail's drive is
    // what DESYNCHRONISES the two tops. X-Rail adjacency went from 35.4% to
    // 45.6%, undoing the one thing that arena does better than every other
    // floor (see docs/PLAN.md, the chase investigation).
    //
    // At 0.85 the rail is restored (36.3%) and Dash still separates cleanly
    // into the three tiers the source publishes — peak dash speed 3.42 for the
    // dash-40 tips, 3.30 for Rush at dash 30, 3.15 for the dash-10 tips. A
    // smaller spread that preserves the arena beats a larger one that guts it.
    const gripK = 0.85 + 0.15 * grip;
    const ceiling = railCeiling(b, rail) * gripK;
    const speed = Math.hypot(b.vel.x, b.vel.y);
    if (speed < ceiling) {
      b.vel.x += tanX * rail.accel * gripK * dt;
      b.vel.y += tanY * rail.accel * gripK * dt;
    }

    // Hold it on the band itself.
    b.pos.x = outX * rail.radius;
    b.pos.y = outY * rail.radius;

    if (b.railTime === 0) {
      // Release: rotate the exit velocity inward. This is the slingshot.
      const sp = Math.hypot(b.vel.x, b.vel.y);
      const k = rail.releaseInward;
      let dx = tanX * (1 - k) + -outX * k;
      let dy = tanY * (1 - k) + -outY * k;
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl;
      dy /= dl;
      b.vel.x = dx * sp;
      b.vel.y = dy * sp;
      // FEWER TEETH, MORE DASHES. The other half of the documented trade-off:
      // Rush's ten-tooth gear "reduces the speed of Xtreme Dashes, but also
      // increases their FREQUENCY", where Accel's sixteen buy speed at a cost.
      // So grip lengthens the wait as well as strengthening the push — a
      // high-Dash tip hits harder and less often, a low-Dash tip nags.
      //
      // CURRENTLY MASKED, and worth saying so rather than implying a trade-off
      // that is not live. Measured, rides per round are identical across every
      // Bit (1.0-1.05) whatever the cooldown, because tops only reach the rail
      // about once a round anyway — engagement is limited by getting to the
      // wall, not by how soon you are allowed back. Same bottleneck that keeps
      // our rail at 0.16 engagements per second against the real toy's ~1.7,
      // documented in docs/PHYSICS.md.
      //
      // Kept because it is what the source describes and it becomes real the
      // moment engagement improves. The speed half of the stat IS live: 3.42
      // peak dash for Gear Flat and Accel against 3.15 for the rest.
      b.railCooldown = rail.cooldown * (0.62 + 0.55 * grip);
    }
    return;
  }

  // THE DASH STAT SCALES THE DASH, NOT THE ENGAGEMENT.
  //
  // I had this backwards first, and the source is explicit. Rush's official
  // description: "Features a ten tooth gear that reduces the SPEED of Xtreme
  // Dashes, but also increases their FREQUENCY." Fewer teeth is a slower dash
  // and MORE of them; Accel's sixteen teeth buy a faster dash at a stamina
  // cost. So Dash rates how hard the tip is driven once meshed — it is not a
  // gate on meshing at all.
  //
  // Gating engagement on it measured as a 62% collapse in rail use (0.99 rides
  // per top per round down to 0.375) because most bottoms are not attack
  // bottoms, which made the arena's headline mechanic unreachable for two
  // thirds of the roster. That is not the trade-off the real part describes.
  //
  // So grip multiplies the drive and the ceiling. A stamina tip still catches
  // the rail; it just gets a gentle push where an Accel gets flung.
  const inBand = Math.abs(r - rail.radius) <= rail.halfWidth;
  if (inBand && b.railCooldown === 0 && tangential >= rail.engageSpeed) {
    b.railTime = rail.duration;
    b.railRides += 1;
    // A streak only continues if the top came back promptly. Being knocked off
    // the wall — or choosing to leave it — costs the accumulated speed, which
    // is what keeps the escalation a reward for holding the orbit rather than a
    // ratchet that only ever goes up.
    if (b.railIdle > (rail.streakWindow ?? 1.2)) b.railStreak = 0;
    b.railStreak += 1;
    b.railIdle = 0;
  }
}

/**
 * The speed ceiling for this ride, given how many consecutive rides precede it.
 *
 * Exported so the renderer can size the dash effect to the bump rather than
 * flashing identically every time — a visual that does not escalate alongside
 * a mechanic that does would flatten the thing being built here.
 */
export function railCeiling(b: BeyState, rail: RailSpec): number {
  const step = rail.escalation ?? 0;
  if (step <= 0) return rail.maxSpeed;
  const extra = step * Math.max(0, b.railStreak - 1);
  return Math.min(rail.maxSpeed + extra, rail.escalationMax ?? rail.maxSpeed + step * 3);
}

/** Advance one top by dt, ignoring collisions. */
function integrate(b: BeyState, dt: number, arena: ArenaSpec): void {
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
  b.stealPulse = Math.max(0, (b.stealPulse ?? 0) - dt * 3.5);
  b.age += dt;
  b.meter = clamp(b.meter + C.METER_GAIN_PER_SEC * dt, 0, 1);

  if (arena.rail) updateRail(b, arena.rail, dt);
  if (arena.pit) updatePit(b, arena.pit, dt);
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

/**
 * Steer charging tops at their opponent.
 *
 * This lives in `step` rather than `integrate` because it is the one force that
 * depends on another top's position. Scaled by remaining spin, so a nearly-dead
 * top can't suddenly sprint across the dish.
 */
function applySeek(beys: BeyState[], dt: number): void {
  for (const b of beys) {
    if (!b.alive) continue;
    const mv = moveProfile(b);
    if (mv.seek <= 0) continue;

    const foe = nearestFoe(beys, b);
    if (!foe) continue;

    const dx = foe.pos.x - b.pos.x;
    const dy = foe.pos.y - b.pos.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) continue;

    const sn = spinNorm(b);

    // Steer, don't just push.
    //
    // Adding acceleration toward the opponent is not enough on a low-drag
    // driver: it carries so much orbital velocity, and precession rotates that
    // velocity a full turn every ~1.4s, that the added component is smeared
    // away before it closes any distance. Measured, Volcanic closed 5% of the
    // gap where Atomic closed 74%. Rotating the velocity toward the target
    // works regardless of how fast the top is already going — which is what a
    // homing move should do.
    const speed = Math.hypot(b.vel.x, b.vel.y);
    if (speed > 1e-6) {
      const current = Math.atan2(b.vel.y, b.vel.x);
      const wanted = Math.atan2(dy, dx);
      let diff = (wanted - current) % (Math.PI * 2);
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;

      const maxTurn = mv.seek * 0.8 * sn * dt;
      const turn = clamp(diff, -maxTurn, maxTurn);
      const turned = rotate(b.vel, turn);
      b.vel.x = turned.x;
      b.vel.y = turned.y;
    }

    // A smaller direct push on top, so a charge also closes rather than merely
    // orbiting at the same radius pointed inward.
    const push = mv.seek * 0.45 * sn * dt;
    b.vel.x += (dx / d) * push;
    b.vel.y += (dy / d) * push;
  }
}

/** Nearest living opponent, or null. */
export function nearestFoe(beys: BeyState[], self: BeyState): BeyState | null {
  let best: BeyState | null = null;
  let bestD = Infinity;
  for (const o of beys) {
    if (o === self || !o.alive) continue;
    const d = dist(self.pos, o.pos);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return best;
}

/**
 * Angular centre of each exit pocket, radians.
 *
 * Takes the arena so a stadium can cluster its exits — the real ones do, and
 * ours could not. Called with nothing it returns the default evenly spaced
 * four, which is what every arena without a `pockets` list gets and what the
 * geometry tests assert.
 */
export const pocketAngles = (arena?: ArenaSpec): number[] =>
  arena?.pockets ??
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
export function inPocket(angle: number, arena?: ArenaSpec): boolean {
  return pocketAngles(arena).some((p) => angleDelta(angle, p) < C.POCKET_HALF_WIDTH);
}

/**
 * Which pocket this bearing left through, or -1 if it did not line up with one.
 *
 * A top can cross EXIT_RADIUS slightly off a pocket centre — the wall only
 * bounces it back when it is OUTSIDE the pocket arc, and the arc is
 * POCKET_HALF_WIDTH wide — so this answers with the nearest pocket within that
 * arc rather than the nearest pocket full stop. Returning the nearest
 * regardless would score an Xtreme Finish for a top that left through the
 * opposite side of the dish.
 */
export function pocketIndexAt(angle: number, arena?: ArenaSpec): number {
  const angles = pocketAngles(arena);
  let best = -1;
  let bestDelta = C.POCKET_HALF_WIDTH;
  for (let i = 0; i < angles.length; i++) {
    const d = angleDelta(angle, angles[i]);
    if (d < bestDelta) {
      bestDelta = d;
      best = i;
    }
  }
  return best;
}

/**
 * Handle the rim. A top that reaches the wall bounces off it — unless it is
 * lined up with an exit pocket and carrying enough outward speed, in which case
 * it sails through and gets ringed out.
 */
function resolveWall(b: BeyState, arena: ArenaSpec): void {
  const r = len(b.pos);
  const limit = C.STADIUM_RADIUS - b.stats.radius;
  if (r <= limit) return;

  const n = norm(b.pos);
  const vn = dot(b.vel, n);
  const bearing = Math.atan2(b.pos.y, b.pos.x);

  if (inPocket(bearing, arena) && vn > C.POCKET_ESCAPE_SPEED) {
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

/**
 * A contact that did NOT score.
 *
 * Measured across 240 opposite-spin rounds: the two tops are within contact
 * distance for 22.5% of all frames, and **84% of those frames are rejected**
 * by the MIN_IMPACT gate below — late in a round it reaches 96% of frames in
 * contact and 100% rejected. The gate is right to refuse them: they are not
 * clashes, and scoring them would grind out hundreds of hits a round, which is
 * the exact failure MIN_IMPACT was added to prevent.
 *
 * But "does not score" was silently turned into "does not exist". For most of
 * a round the two tops are leaning on each other, and the game rendered
 * nothing, played nothing, and reported nothing — which is what "the fight
 * feels dead" actually was on the wire. They were touching the whole time.
 *
 * So the gate still refuses to SCORE these, and now reports them instead. This
 * type carries no forces and changes no state; it is a read-only observation
 * emitted alongside the hits, and the sim's behaviour is bit-identical with it
 * present or absent.
 */
export interface ContactEvent {
  a: string;
  b: string;
  /** Contact point on the stadium plane. */
  at: Vec2;
  /** Normal approach speed. Below MIN_IMPACT by construction. */
  impact: number;
  /**
   * Relative surface speed at the contact, signed along perp(n).
   *
   * Sign gives the spark stream its direction — see `surfaceSlip`.
   */
  slip: number;
  /** How hard the blades are abrading, 0..1. See `abrasion`. */
  grind: number;
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
function resolvePair(
  a: BeyState,
  b: BeyState,
  rng: () => number,
  contacts?: ContactEvent[],
): HitEvent | null {
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
  //
  // It is still reported — see ContactEvent. Refusing to score it and refusing
  // to admit it happened are different things, and conflating them is what made
  // most of a round render as two tops doing nothing while they were in fact
  // grinding against each other.
  if (impact < C.MIN_IMPACT) {
    contacts?.push({
      a: a.id,
      b: b.id,
      at: vec((a.pos.x + b.pos.x) / 2, (a.pos.y + b.pos.y) / 2),
      impact,
      slip: surfaceSlip(a, b),
      grind: abrasion(a, b),
    });
    return null;
  }

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
  // Spin retention protects against hit drain too, not just passive decay.
  // See RETENTION_VS_HITS — stamina's stat previously governed only a third of
  // the spin economy, which is why the archetype could not win the endurance
  // race it exists for.
  const holdA = 1 + (a.stats.spinRetention - 1) * C.RETENTION_VS_HITS;
  const holdB = 1 + (b.stats.spinRetention - 1) * C.RETENTION_VS_HITS;
  const drainOnB =
    ((impact * C.HIT_SPIN_LOSS * atkA * aggrA) / (b.stats.defense * Math.max(0.5, holdB))) *
    oppMul;
  const drainOnA =
    ((impact * C.HIT_SPIN_LOSS * atkB * aggrB) / (a.stats.defense * Math.max(0.5, holdA))) *
    oppMul;
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

  // Spin absorption. Against an opponent turning the other way the blades meet
  // head-on and the absorber bites in at full rate. In a same-spin clash the
  // blades travel together at the contact point, so only a layer that declares
  // `sameSteal` gets anything at all — and only that fraction of its rate.
  // With sameSteal 0 (every layer but the vampire) this is exactly the old
  // opposite-only gate, bit for bit.
  const stealA = opposite ? a.stats.spinSteal : a.stats.spinSteal * a.stats.sameSteal;
  const stealB = opposite ? b.stats.spinSteal : b.stats.spinSteal * b.stats.sameSteal;

  // The absorber both takes less and converts part of what it dealt into its
  // own rotation — the signature "it was nearly dead and it's climbing back".
  const netLossA = (lossA + reflectToA) * (1 - stealA * C.SPIN_STEAL_MITIGATION);
  const netLossB = (lossB + reflectToB) * (1 - stealB * C.SPIN_STEAL_MITIGATION);
  const gainA = lossB * stealA * C.SPIN_STEAL_GAIN;
  const gainB = lossA * stealB * C.SPIN_STEAL_GAIN;

  // Capped at launch spin: a top can recover, but never end up faster than it
  // was launched, or a long absorbing exchange ratchets upward forever.
  const stealCapA = a.spinAtLaunch * C.SPIN_STEAL_CAP;
  const stealCapB = b.spinAtLaunch * C.SPIN_STEAL_CAP;

  a.spin =
    Math.min(stealCapA, Math.max(0, Math.abs(a.spin) - netLossA + gainA)) * (dirA || 1);
  b.spin =
    Math.min(stealCapB, Math.max(0, Math.abs(b.spin) - netLossB + gainB)) * (dirB || 1);

  // Surfaced so the round breakdown can show absorption happening. The pulse is
  // the same signal for the frame the renderer draws the drain on — set to 1
  // only when spin actually moved, so a 0-steal layer never flickers.
  a.spinStolen += gainA;
  b.spinStolen += gainB;
  if (gainA > 0) a.stealPulse = 1;
  if (gainB > 0) b.stealPulse = 1;

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
  arena: ArenaSpec = STANDARD,
  // Optional out-parameter rather than a changed return type: every existing
  // caller — the whole balance suite included — keeps working untouched, and a
  // caller that does not care pays nothing.
  contacts?: ContactEvent[],
): HitEvent[] {
  const hits: HitEvent[] = [];

  for (const b of beys) {
    if (!b.alive) continue;
    integrate(b, dt, arena);
  }

  applySeek(beys, dt);

  // Pairwise — with 2-8 tops this is trivially cheap and exact.
  for (let i = 0; i < beys.length; i++) {
    for (let k = i + 1; k < beys.length; k++) {
      const a = beys[i];
      const b = beys[k];
      if (!a.alive || !b.alive) continue;
      const hit = resolvePair(a, b, rng, contacts);
      if (hit) hits.push(hit);
    }
  }

  for (const b of beys) {
    if (!b.alive) continue;
    resolveWall(b, arena);
  }

  return hits;
}
