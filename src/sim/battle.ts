import * as C from './constants';
import { clamp, len, makeRng, vec } from './math';
import { deriveStats } from './parts';
import { step } from './physics';
import type { HitEvent } from './physics';
import type {
  BeyBuild,
  BeyState,
  Defeat,
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
  const spin = C.SPIN_REF * (0.55 + 0.45 * power);

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
    boost: 0,
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

  phase: Phase = 'launch';
  beys: BeyState[] = [];
  scores: Record<string, number> = {};
  roundNumber = 0;
  roundTime = 0;
  lastRound: RoundResult | null = null;
  matchWinnerId: string | null = null;

  /** Collision events produced by the most recent update, for effects. */
  hits: HitEvent[] = [];

  private accumulator = 0;
  private rng: () => number;

  constructor(fighters: Fighter[], opts: BattleOptions = {}) {
    if (fighters.length < 2) throw new Error('A battle needs at least two fighters');
    this.fighters = fighters;
    this.pointsToWin = opts.pointsToWin ?? C.POINTS_TO_WIN;
    this.rng = makeRng(opts.seed ?? 0x5eed);
    for (const f of fighters) this.scores[f.id] = 0;
  }

  /** Begin a round with the given launches, keyed by fighter id. */
  startRound(launches: Record<string, LaunchParams>): void {
    this.roundNumber += 1;
    this.roundTime = 0;
    this.accumulator = 0;
    this.hits = [];
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
    if (this.phase !== 'battle') return;

    this.accumulator += Math.min(deltaSeconds, 0.25);
    this.hits = [];

    let steps = 0;
    while (this.accumulator >= C.FIXED_DT && steps < C.MAX_SUBSTEPS) {
      const hits = step(this.beys, C.FIXED_DT);
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
   * Spend a full meter to boost a top. Returns false if the meter wasn't full,
   * so the UI can play a rejection cue rather than silently eating the input.
   */
  activateBoost(id: string): boolean {
    const bey = this.beys.find((b) => b.id === id);
    if (!bey || !bey.alive || bey.meter < 1 || bey.boost > 0) return false;
    bey.meter = 0;
    bey.boost = C.BOOST_DURATION;
    return true;
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
      const strictlyBetter =
        SEVERITY[best.reason] < SEVERITY[next.reason] ||
        Math.abs(best.bey.spin) > Math.abs(next.bey.spin);
      // A top that physically left the stadium can never be the survivor.
      if (best.reason !== 'knockout' && strictlyBetter) falling.shift();
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
      this.endRound(alive[0].id, reason, falling[0]?.bey.id ?? null);
    } else {
      // Every top went out on the same step and none could be separated.
      this.endRound(null, 'draw');
    }
  }

  private endRound(
    winnerId: string | null,
    reason: RoundResult['reason'],
    loserId: string | null = null,
  ): void {
    const points =
      reason === 'knockout'
        ? C.POINTS_KNOCKOUT
        : reason === 'burst'
          ? C.POINTS_BURST
          : reason === 'spin-finish'
            ? C.POINTS_SPIN_FINISH
            : 0;

    if (winnerId) this.scores[winnerId] += points;
    this.lastRound = { winnerId, loserId, reason, points };

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
