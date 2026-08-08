import { Battle } from './sim/battle';
import { buildArchetype, PRESETS } from './sim/parts';
import type { Archetype, BeyBuild, BeyState, LaunchParams } from './sim/types';

export type Difficulty = 'rookie' | 'blader' | 'champion';

/** What each difficulty is allowed to do well. */
const PROFILE: Record<
  Difficulty,
  {
    /** Chance per opportunity that it counter-picks rather than picking blind. */
    counterPick: number;
    /** Random noise added to its launch power. */
    launchNoise: number;
    /** How close the opponent must be before it spends boost. Lower = smarter. */
    boostRange: number;
    /** Chance it wastes the boost at a bad moment anyway. */
    boostSlop: number;
  }
> = {
  rookie: { counterPick: 0, launchNoise: 0.32, boostRange: 2.0, boostSlop: 0.5 },
  blader: { counterPick: 0.5, launchNoise: 0.14, boostRange: 0.55, boostSlop: 0.18 },
  champion: { counterPick: 1, launchNoise: 0.04, boostRange: 0.36, boostSlop: 0.02 },
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

  /** Called every frame during battle; spends the boost when it's worth it. */
  update(battle: Battle): void {
    const me = battle.beys.find((b) => b.id === this.id);
    if (!me || !me.alive || me.meter < 1) return;

    const foe = battle.beys.find((b) => b.id !== this.id && b.alive);
    if (!foe) return;

    const p = PROFILE[this.difficulty];
    const d = Math.hypot(me.pos.x - foe.pos.x, me.pos.y - foe.pos.y);

    // Fire when the opponent is in range, or blunder occasionally.
    const inRange = d < p.boostRange;
    const blunder = this.rng() < p.boostSlop * 0.02;
    if (!inRange && !blunder) return;

    // A champion also checks the matchup is worth it: don't charge a top that
    // is about to win the exchange anyway.
    if (this.difficulty === 'champion' && !this.worthIt(me, foe)) return;

    battle.activateBoost(this.id);
  }

  /** Boosting into a much stronger defender just feeds it burst charge. */
  private worthIt(me: BeyState, foe: BeyState): boolean {
    const spinEdge = Math.abs(me.spin) / Math.max(1, Math.abs(foe.spin));
    const canWin = me.stats.attack * 1.4 > foe.stats.defense * 0.75;
    return canWin || spinEdge < 0.8; // desperate tops swing anyway
  }
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
