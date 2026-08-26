import * as C from './constants';
import { clamp, len, makeRng, vec } from './math';
import { deriveStats } from './parts';
import { pocketIndexAt, step } from './physics';
import type { ContactEvent, HitEvent } from './physics';
import { STANDARD } from './arena';
import type { ArenaSpec } from './arena';
import type {
  BeyBuild,
  BeyState,
  Defeat,
  MoveKind,
  LaunchParams,
  Phase,
  RoundResult,
} from './types';

export interface Fighter {
  id: string;
  name: string;
  build: BeyBuild;
  /** +1 = right spin, -1 = left spin. Opposite-spin matchups drain hard. */
  spinDir: 1 | -1;
}

export interface BattleOptions {
  seed?: number;
  pointsToWin?: number;
  /** Gameplay arena. Changes the physics, unlike skins and themes. */
  arena?: ArenaSpec;
}

/** Everything the renderer and HUD need to draw a frame. */
export interface BattleSnapshot {
  phase: Phase;
  beys: BeyState[];
  scores: Record<string, number>;
  roundNumber: number;
  roundTime: number;
  lastRound: RoundResult | null;
  matchWinnerId: string | null;
}

function makeBey(f: Fighter, launch: LaunchParams): BeyState {
  const stats = deriveStats(f.build);
  const rimRadius = C.STADIUM_RADIUS - stats.radius - 0.01;
  const r = rimRadius * (1 - 0.62 * clamp(launch.entryDepth, 0, 1));
  const a = launch.entryAngle;

  const power = clamp(launch.power, 0, 1);
  // The launch meter's green band was previously decoration. Landing in it now
  // actually grants spin, so the launch minigame has stakes.
  const perfect =
    power >= C.PERFECT_LAUNCH_MIN && power <= C.PERFECT_LAUNCH_MAX;
  const spin =
    C.SPIN_REF * (0.55 + 0.45 * power) * (perfect ? 1 + C.PERFECT_LAUNCH_SPIN_BONUS : 1);

  // Launch tangentially, in the direction the top will precess, at a speed
  // derived from the actual circular-orbit velocity for this radius. Guessing a
  // flat speed here silently put every top below orbital velocity, so they all
  // dived straight to the centre and collided within a second.
  //
  // Power therefore controls orbit *shape*: under 1.0 spirals inward toward a
  // safe centre game, over 1.0 rides out against the ridge for an aggressive
  // one. That makes launch power a real decision rather than "more is better".
  const orbital = r * Math.sqrt(C.SLOPE_ACCEL / C.STADIUM_RADIUS);
  const speed = orbital * (0.78 + 0.34 * power);
  const tangent = vec(-Math.sin(a), Math.cos(a));

  return {
    id: f.id,
    name: f.name,
    build: f.build,
    stats,
    pos: vec(Math.cos(a) * r, Math.sin(a) * r),
    vel: vec(tangent.x * speed * f.spinDir, tangent.y * speed * f.spinDir),
    spin: spin * f.spinDir,
    spinAtLaunch: spin,
    burst: 0,
    angle: 0,
    tilt: 0,
    alive: true,
    defeat: null,
    hitFlash: 0,
    meter: 0,
    move: null,
    moveTime: 0,
    age: 0,
    railTime: 0,
    railCooldown: 0,
    railRides: 0,
    railStreak: 0,
    railIdle: 99,
    pitTime: 0,
    pitDrained: 0,
    perfectLaunch: perfect,
    hitsLanded: 0,
    spinDealt: 0,
    spinStolen: 0,
    biggestHit: 0,
    movesUsed: 0,
  };
}

/**
 * A match: a series of rounds, first to `pointsToWin`.
 *
 * The sim is advanced with a fixed-step accumulator so a slow or throttled
 * frame produces the same result as a fast one, and a given seed always
 * replays identically.
 */
export class Battle {
  readonly fighters: Fighter[];
  readonly pointsToWin: number;
  readonly arena: ArenaSpec;

  phase: Phase = 'launch';
  beys: BeyState[] = [];
  scores: Record<string, number> = {};
  roundNumber = 0;
  roundTime = 0;
  lastRound: RoundResult | null = null;
  matchWinnerId: string | null = null;

  /** Collision events produced by the most recent update, for effects. */
  hits: HitEvent[] = [];
  /**
   * Contacts that touched but did not score, this frame.
   *
   * Kept beside `hits` rather than merged into it because they are a different
   * kind of thing: a hit changes the game, a contact only changes the picture.
   * The renderer grinds sparks off these; nothing in the sim reads them.
   */
  contacts: ContactEvent[] = [];

  private accumulator = 0;
  private rng: () => number;

  constructor(fighters: Fighter[], opts: BattleOptions = {}) {
    if (fighters.length < 2) throw new Error('A battle needs at least two fighters');
    this.fighters = fighters;
    this.pointsToWin = opts.pointsToWin ?? C.POINTS_TO_WIN;
    this.arena = opts.arena ?? STANDARD;
    this.rng = makeRng(opts.seed ?? 0x5eed);
    for (const f of fighters) this.scores[f.id] = 0;
  }

  /** Begin a round with the given launches, keyed by fighter id. */
  startRound(launches: Record<string, LaunchParams>): void {
    this.roundNumber += 1;
    this.roundTime = 0;
    this.accumulator = 0;
    this.hits = [];
    this.contacts = [];
    this.beys = this.fighters.map((f) => {
      const l = launches[f.id] ?? {
        power: 0.75,
        entryAngle: this.rng() * Math.PI * 2,
        entryDepth: 0.1,
      };
      return makeBey(f, l);
    });
    this.separateSpawns();
    this.phase = 'battle';
  }

  /**
   * Nudge apart any tops that launched on top of each other. Overlapping spawns
   * produce an enormous separation impulse on the first step and fling someone
   * straight out of the stadium, ending the round in a fraction of a second.
   */
  private separateSpawns(): void {
    const maxRadius = C.STADIUM_RADIUS - 0.02;
    for (let iter = 0; iter < 12; iter++) {
      let moved = false;
      for (let i = 0; i < this.beys.length; i++) {
        for (let k = i + 1; k < this.beys.length; k++) {
          const a = this.beys[i];
          const b = this.beys[k];
          const dx = b.pos.x - a.pos.x;
          const dy = b.pos.y - a.pos.y;
          const d = Math.hypot(dx, dy);
          // Launch with a generous gap, not just barely clear of contact.
          const min = (a.stats.radius + b.stats.radius) * 2.4;
          if (d >= min) continue;

          // Degenerate case: identical positions. Pick an arbitrary axis.
          const nx = d < 1e-6 ? 1 : dx / d;
          const ny = d < 1e-6 ? 0 : dy / d;
          const push = (min - d) / 2;
          a.pos.x -= nx * push;
          a.pos.y -= ny * push;
          b.pos.x += nx * push;
          b.pos.y += ny * push;
          moved = true;
        }
      }
      // Keep everyone inside the rim after pushing.
      for (const bey of this.beys) {
        const r = len(bey.pos);
        const lim = maxRadius - bey.stats.radius;
        if (r > lim) {
          bey.pos.x = (bey.pos.x / r) * lim;
          bey.pos.y = (bey.pos.y / r) * lim;
        }
      }
      if (!moved) break;
    }
  }

  /**
   * Advance by a wall-clock delta. Internally this runs zero or more fixed
   * steps; leftover time carries to the next call.
   */
  update(deltaSeconds: number): void {
    // Clear before the early return, not after it. Leaving stale events in
    // `hits` meant the renderer kept re-spawning sparks and re-adding camera
    // shake from the round's final clash on every frame of the result screen,
    // the garage and the home screen, until the next launch reset it.
    this.hits = [];
    this.contacts = [];
    if (this.phase !== 'battle') return;

    this.accumulator += Math.min(deltaSeconds, 0.25);

    let steps = 0;
    while (this.accumulator >= C.FIXED_DT && steps < C.MAX_SUBSTEPS) {
      const hits = step(this.beys, C.FIXED_DT, this.rng, this.arena, this.contacts);
      if (hits.length) this.hits.push(...hits);
      this.accumulator -= C.FIXED_DT;
      this.roundTime += C.FIXED_DT;
      steps += 1;
      this.checkDefeats();
      if (this.phase !== 'battle') return;
    }

    // If we blew the substep budget, drop the backlog rather than spiral.
    if (steps >= C.MAX_SUBSTEPS) this.accumulator = 0;

    if (this.roundTime >= C.ROUND_TIME_LIMIT) this.endRound(null, 'timeout');
  }

  /**
   * Spend meter on a move. Returns false when it can't be afforded or another
   * move is already running, so the UI can play a rejection cue rather than
   * silently eating the input.
   */
  activateMove(id: string, kind: MoveKind): boolean {
    const bey = this.beys.find((b) => b.id === id);
    if (!bey || !bey.alive || bey.moveTime > 0) return false;

    const profile = C.MOVES[kind];
    if (bey.meter < profile.cost) return false;

    bey.meter -= profile.cost;
    bey.move = kind;
    bey.moveTime = profile.duration;
    bey.movesUsed += 1;

    if (profile.speedKick > 0) this.applyKick(bey, profile);
    return true;
  }

  /**
   * Dodge's disengage. The kick is aimed away from the nearest opponent, not
   * simply forward and not toward the centre — an blocking top *sits* in the
   * centre, so biasing inward drove the escaping top straight back into it.
   *
   * Near the rim the direction is blended inward instead, because an uncapped
   * outward escape rang the top out on its own kick.
   */
  private applyKick(bey: BeyState, profile: C.MoveProfile): void {
    const kick = profile.speedKick;
    const speed = Math.hypot(bey.vel.x, bey.vel.y);
    let dx = speed > 1e-6 ? bey.vel.x / speed : 1;
    let dy = speed > 1e-6 ? bey.vel.y / speed : 0;

    const foe = this.beys.find((o) => o !== bey && o.alive);
    if (foe) {
      // 'pursue' aims the kick straight at the opponent so a Charge press
      // produces immediate, legible movement toward them. 'escape' aims away.
      const sign = profile.kickMode === 'pursue' ? -1 : 1;
      const ax = (bey.pos.x - foe.pos.x) * sign;
      const ay = (bey.pos.y - foe.pos.y) * sign;
      const alen = Math.hypot(ax, ay);
      if (alen > 1e-6) {
        // A pursuit kick commits harder than an escape: the whole point is to
        // close distance now, not to drift vaguely toward them.
        const k = profile.kickMode === 'pursue' ? 0.9 : C.DODGE_AWAY_BIAS;
        dx = dx * (1 - k) + (ax / alen) * k;
        dy = dy * (1 - k) + (ay / alen) * k;
      }
    }

    // Don't escape into a pocket. A pursuit kick is aimed at an opponent who is
    // inside the dish by definition, so it needs no such guard.
    const r = Math.hypot(bey.pos.x, bey.pos.y);
    if (profile.kickMode === 'escape' && r > C.DODGE_SAFE_RADIUS) {
      const k = C.DODGE_INWARD_BIAS;
      dx = dx * (1 - k) + (-bey.pos.x / r) * k;
      dy = dy * (1 - k) + (-bey.pos.y / r) * k;
    }

    const dlen = Math.hypot(dx, dy) || 1;
    bey.vel.x += (dx / dlen) * kick;
    bey.vel.y += (dy / dlen) * kick;

    const after = Math.hypot(bey.vel.x, bey.vel.y);
    if (profile.kickMode === 'escape' && after > C.DODGE_MAX_SPEED) {
      bey.vel.x = (bey.vel.x / after) * C.DODGE_MAX_SPEED;
      bey.vel.y = (bey.vel.y / after) * C.DODGE_MAX_SPEED;
    }
  }

  /** Retire any top that has been knocked out, burst, or run out of spin. */
  private checkDefeats(): void {
    const standing = this.beys.filter((b) => b.alive);
    const falling: { bey: BeyState; reason: Defeat }[] = [];

    for (const b of standing) {
      const reason = defeatReason(b);
      if (reason) falling.push({ bey: b, reason });
    }
    if (falling.length === 0) return;

    // If every remaining top would fall on this same step, the least badly
    // beaten one is judged to have survived it. Without this tiebreak a violent
    // head-on ends a quarter of all rounds in a meaningless draw.
    if (falling.length === standing.length && standing.length > 1) {
      falling.sort(
        (x, y) =>
          SEVERITY[x.reason] - SEVERITY[y.reason] ||
          Math.abs(y.bey.spin) - Math.abs(x.bey.spin),
      );
      const best = falling[0];
      const next = falling[1];
      // Compared with a tolerance, and that tolerance is load-bearing rather
      // than defensive.
      //
      // A perfectly mirrored round — same build both sides, launched at
      // opposite angles with opposite spin — stays mirrored to about 1e-16
      // through the whole match, because the physics preserves the symmetry
      // exactly. Both tops then reach defeat on the *same step* with spins
      // separated only by floating-point dust, which traces back to sin(pi)
      // being 1.22e-16 rather than 0 at launch.
      //
      // A strict `>` treated that dust as a real result, so a coin-flip
      // finish was decided by IEEE754 rounding — and always in the same
      // direction. Measured, the top launched at angle 0 won 88% of mirror
      // matches, and up to 100% at some launch angles. The physics was never
      // at fault; the comparison was.
      const spinGap = Math.abs(best.bey.spin) - Math.abs(next.bey.spin);
      const scale = Math.max(Math.abs(best.bey.spin), Math.abs(next.bey.spin), 1);
      const decisive = spinGap > scale * 1e-9;
      const strictlyBetter =
        SEVERITY[best.reason] < SEVERITY[next.reason] || decisive;
      // A top that physically left the stadium can never be the survivor.
      if (best.reason !== 'knockout' && strictlyBetter) {
        falling.shift();
      } else if (best.reason !== 'knockout' && SEVERITY[best.reason] === SEVERITY[next.reason]) {
        // A genuine dead heat. Rather than restoring the old 29% draw rate,
        // break it on the seeded RNG: deterministic for replays, and fair in
        // aggregate instead of fair-looking and biased.
        falling.splice(this.rng() < 0.5 ? 0 : 1, 1);
      }
    }

    for (const f of falling) {
      f.bey.alive = false;
      f.bey.defeat = f.reason;
    }

    const alive = this.beys.filter((b) => b.alive);
    if (alive.length > 1) return;

    if (alive.length === 1) {
      // Last top standing. When several fell at once the most decisive finish
      // is the one that gets scored.
      const reason = pickReason(falling.map((f) => f.reason));
      // An Xtreme Finish is a KNOCKOUT through this arena's graded pocket, so
      // it is decided by where the loser left rather than by the reason alone.
      // Read off the top that actually went out with that reason — with two
      // simultaneous defeats, `falling[0]` is not necessarily the knocked-out
      // one.
      const out = falling.find((f) => f.reason === reason)?.bey ?? falling[0]?.bey ?? null;
      const xtreme =
        reason === 'knockout' && out !== null && isFinishPocket(this.arena, out);
      this.endRound(alive[0].id, reason, out?.id ?? null, xtreme);
    } else {
      // Every top went out on the same step and none could be separated.
      this.endRound(null, 'draw');
    }
  }

  private endRound(
    winnerId: string | null,
    reason: RoundResult['reason'],
    loserId: string | null = null,
    xtremeFinish = false,
  ): void {
    const points =
      reason === 'knockout'
        ? xtremeFinish
          ? C.POINTS_XTREME_FINISH
          : C.POINTS_KNOCKOUT
        : reason === 'burst'
          ? C.POINTS_BURST
          : reason === 'spin-finish'
            ? C.POINTS_SPIN_FINISH
            : 0;

    if (winnerId) this.scores[winnerId] += points;
    this.lastRound = { winnerId, loserId, reason, points, xtremeFinish };

    const leader = Object.entries(this.scores).find(
      ([, s]) => s >= this.pointsToWin,
    );
    if (leader) {
      this.matchWinnerId = leader[0];
      this.phase = 'match-over';
    } else {
      this.phase = 'round-over';
    }
  }

  snapshot(): BattleSnapshot {
    return {
      phase: this.phase,
      beys: this.beys,
      scores: { ...this.scores },
      roundNumber: this.roundNumber,
      roundTime: this.roundTime,
      lastRound: this.lastRound,
      matchWinnerId: this.matchWinnerId,
    };
  }
}

/** How badly a top lost. Higher is worse; used to break simultaneous defeats. */
const SEVERITY: Record<Defeat, number> = {
  knockout: 3,
  burst: 2,
  'spin-finish': 1,
};

/**
 * Whether this top left through the arena's graded pocket.
 *
 * Bearing is taken from the top's FINAL position, which is already past
 * EXIT_RADIUS — the exit bearing and the position bearing are the same thing
 * once it is outside, and reading it here avoids threading an exit record
 * through the physics for one arena's scoring rule.
 */
function isFinishPocket(arena: ArenaSpec, b: BeyState): boolean {
  const want = arena.finishPocket;
  if (want === undefined || want === null) return false;
  return pocketIndexAt(Math.atan2(b.pos.y, b.pos.x)) === want;
}

/** Why this top is out, or null if it is still in the game. */
function defeatReason(b: BeyState): Defeat | null {
  if (len(b.pos) > C.EXIT_RADIUS) return 'knockout';
  if (b.burst >= 1) return 'burst';
  if (Math.abs(b.spin) <= C.SPIN_MIN) return 'spin-finish';
  return null;
}

/** Knockout beats burst beats spin finish when several land on the same step. */
function pickReason(reasons: RoundResult['reason'][]): RoundResult['reason'] {
  if (reasons.includes('knockout')) return 'knockout';
  if (reasons.includes('burst')) return 'burst';
  if (reasons.includes('spin-finish')) return 'spin-finish';
  return 'timeout';
}
