import { Battle } from './sim/battle';
import { MOVES } from './sim/constants';
import { buildArchetype, PRESETS } from './sim/parts';
import type {
  Archetype,
  BeyBuild,
  BeyState,
  LaunchParams,
  MoveKind,
} from './sim/types';

export type Difficulty = 'rookie' | 'blader' | 'champion';

/** What each difficulty is allowed to do well. */
const PROFILE: Record<
  Difficulty,
  {
    /** Chance per opportunity that it counter-picks rather than picking blind. */
    counterPick: number;
    /** Random noise added to its launch power. */
    launchNoise: number;
    /** How close the opponent must be before it commits to a charge. */
    engageRange: number;
    /**
     * Seconds between decisions. This, not raw stats, is what difficulty should
     * scale — a slow reader feels beatable, a buffed one just feels unfair.
     */
    reactionTime: number;
    /** Chance it counters with the wrong move entirely. */
    misread: number;
  }
> = {
  rookie: {
    counterPick: 0,
    launchNoise: 0.32,
    engageRange: 1.2,
    reactionTime: 0.85,
    misread: 0.45,
  },
  blader: {
    counterPick: 0.5,
    launchNoise: 0.14,
    engageRange: 0.6,
    reactionTime: 0.35,
    misread: 0.18,
  },
  champion: {
    counterPick: 1,
    launchNoise: 0.04,
    engageRange: 0.45,
    reactionTime: 0.12,
    misread: 0.03,
  },
};

/** Rock-paper-scissors: what beats what, mirroring the part catalog's design. */
const COUNTERS: Record<Archetype, Archetype> = {
  stamina: 'attack', // attack beats stamina
  defense: 'stamina', // stamina beats defense
  attack: 'defense', // defense beats attack
  balance: 'balance',
};

export class AiController {
  readonly id: string;
  private difficulty: Difficulty;
  private rng: () => number;
  /** Counts down to the next decision; see reactionTime. */
  private reactionTimer = 0;

  constructor(id: string, difficulty: Difficulty, rng: () => number = Math.random) {
    this.id = id;
    this.difficulty = difficulty;
    this.rng = rng;
  }

  setDifficulty(d: Difficulty): void {
    this.difficulty = d;
  }

  /** Choose a build, optionally countering what the player brought. */
  chooseBuild(playerBuild: BeyBuild | null): { name: string; build: BeyBuild } {
    const p = PROFILE[this.difficulty];
    if (playerBuild && this.rng() < p.counterPick) {
      const want = COUNTERS[buildArchetype(playerBuild)];
      const options = PRESETS.filter((x) => buildArchetype(x.build()) === want);
      if (options.length) {
        const pick = options[Math.floor(this.rng() * options.length)];
        return { name: pick.name, build: pick.build() };
      }
    }
    const pick = PRESETS[Math.floor(this.rng() * PRESETS.length)];
    return { name: pick.name, build: pick.build() };
  }

  /**
   * Choose which way to spin.
   *
   * Measured, the two pairings play completely differently: same-spin runs
   * ~8s and is decided by stamina, opposite-spin runs ~14s of repeated violent
   * exchanges. Aggressive builds want the exchanges; stamina builds want the
   * quiet attrition race they win by default.
   */
  chooseSpinDir(build: BeyBuild, playerSpinDir: 1 | -1): 1 | -1 {
    const archetype = buildArchetype(build);
    const wantOpposite =
      archetype === 'attack' ? 0.85 : archetype === 'stamina' ? 0.15 : 0.5;
    const opposite = this.rng() < wantOpposite;
    return (opposite ? -playerSpinDir : playerSpinDir) as 1 | -1;
  }

  /**
   * Choose a launch. Aggressive builds want power above 1.0x orbital so they
   * ride the ridge; stamina builds want a slow launch that settles into the
   * safe centre.
   */
  chooseLaunch(build: BeyBuild, playerAngle: number): LaunchParams {
    const p = PROFILE[this.difficulty];
    const archetype = buildArchetype(build);
    const base =
      archetype === 'attack' ? 0.95 : archetype === 'stamina' ? 0.45 : 0.7;
    const power = clamp01(base + (this.rng() - 0.5) * 2 * p.launchNoise);
    return {
      power,
      // Launch opposite the player so the round doesn't open on a collision.
      entryAngle: playerAngle + Math.PI + (this.rng() - 0.5) * 0.5,
      entryDepth: archetype === 'stamina' ? 0.35 : 0.05,
    };
  }

  /**
   * Called every frame during battle. Reads the opponent and picks a move.
   *
   * Reaction time matters more than the choice itself: a rookie sees the
   * opponent's move late and often picks the wrong counter, a champion reads it
   * immediately. That is what difficulty should scale — not raw stats, which
   * would just feel unfair.
   */
  update(battle: Battle, dt = 1 / 60): void {
    const me = battle.beys.find((b) => b.id === this.id);
    const foe = battle.beys.find((b) => b.id !== this.id && b.alive);
    if (!me || !me.alive || !foe) return;

    const p = PROFILE[this.difficulty];

    // The AI only acts on what it has had time to notice.
    this.reactionTimer -= dt;
    if (this.reactionTimer > 0) return;
    this.reactionTimer = p.reactionTime;

    if (me.moveTime > 0) return; // already committed

    const d = Math.hypot(me.pos.x - foe.pos.x, me.pos.y - foe.pos.y);
    const want = this.pickMove(me, foe, d, p);
    if (!want) return;

    // Misread: pick something else entirely, weighted by difficulty.
    const choice = this.rng() < p.misread ? this.randomMove() : want;
    battle.activateMove(this.id, choice);
  }

  /**
   * Counter what the opponent is doing, falling back to a read of the board.
   * Charge beats Slip, Anchor beats Charge, Slip beats Anchor.
   */
  private pickMove(
    me: BeyState,
    foe: BeyState,
    distance: number,
    p: (typeof PROFILE)[Difficulty],
  ): MoveKind | null {
    const afford = (k: MoveKind): boolean => me.meter >= MOVES[k].cost;

    // Direct counter to a committed opponent.
    if (foe.moveTime > 0.25 && foe.move) {
      const counter = MOVE_COUNTERS[foe.move];
      if (afford(counter)) return counter;
    }

    // Nothing to counter. Close and aggressive, or hurt and looking for space.
    const losing = Math.abs(me.spin) < Math.abs(foe.spin) * 0.75;
    const nearlyBurst = me.burst > 0.6;

    if ((losing || nearlyBurst) && afford('slip')) return 'slip';
    if (distance < p.engageRange && afford('charge') && this.worthIt(me, foe)) {
      return 'charge';
    }
    // Bank the meter rather than spend it badly.
    return null;
  }

  private randomMove(): MoveKind {
    const all: MoveKind[] = ['charge', 'anchor', 'slip'];
    return all[Math.floor(this.rng() * all.length)];
  }

  /** Charging a much stronger defender just feeds it burst charge. */
  private worthIt(me: BeyState, foe: BeyState): boolean {
    const spinEdge = Math.abs(me.spin) / Math.max(1, Math.abs(foe.spin));
    const canWin = me.stats.attack * 1.45 > foe.stats.defense * 0.75;
    return canWin || spinEdge < 0.8; // desperate tops swing anyway
  }
}

/** What beats what. Mirrors the triangle documented on MOVES in constants.ts. */
const MOVE_COUNTERS: Record<MoveKind, MoveKind> = {
  charge: 'anchor',
  anchor: 'slip',
  slip: 'charge',
};

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
