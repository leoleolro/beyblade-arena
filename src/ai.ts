import { Battle } from './sim/battle';
import { AIM_LEAD_LIMIT, MOVES, PERFECT_LAUNCH_MAX, PERFECT_LAUNCH_MIN } from './sim/constants';
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
    /**
     * How reliably this tier shaves its launch power into the perfect band.
     *
     * 0 = does not know the band exists. 1 = takes it whenever it is nearly
     * free. See `chooseLaunch` — this was the single biggest thing separating
     * the tiers that nothing was actually doing.
     */
    launchSkill: number;
    /**
     * Chance it declines a counter it *can* see, and plays something else.
     *
     * This is not a handicap — it is what stops the AI from being solvable.
     * Countering a read every single time is a pure strategy, and a pure
     * strategy in a rock-paper-scissors triangle has an exploit: commit a
     * cheap move, watch the guaranteed counter come out, and you know what
     * the next few seconds hold. Mixing removes the certainty without
     * removing the skill, so a good read still pays more often than not.
     *
     * Note this rises with difficulty while `misread` falls. They look
     * similar and are opposites: a misread is the AI being wrong, a mix is
     * the AI being unpredictable on purpose.
     */
    mix: number;
    /**
     * Chance it spends meter on a cheap move purely to draw a reaction, when
     * it holds a meter lead it can afford to burn.
     */
    bait: number;
    /**
     * Half-width, in radians, of the error added to an aimed Charge.
     *
     * WHY THE AI AIMS AT ALL. It did not, and that left the game backwards:
     * the AI's charge homed, so it could never miss, while the player's aimed
     * charge could. The side with the harder control was the side being
     * punished for using it.
     *
     * Read against `AIM_ASSIST_CONE` (0.44), which is the whole point of the
     * numbers chosen. A champion's error is comfortably inside the cone, so
     * its strikes are helped onto the intercept and it plays roughly as well
     * as the old perfect homing. A rookie's is wider than the cone, so its
     * charges genuinely go past the target and Block and Dodge become worth
     * something against it. The tier ladder finally has an axis that is about
     * AIM rather than about reaction time.
     */
    aimError: number;
    /**
     * How well this tier reads the spin-direction matchup, 0 to 1.
     *
     * 0 flips a coin; 1 plays the measured best answer for its build. It is a
     * separate axis from `aimError` because it is a different KIND of knowing —
     * aim is execution, this is preparation, and it is decided before the round
     * starts rather than during it.
     */
    spinRead: number;
    /**
     * How much of the target's motion this tier accounts for, 0 to 1.
     *
     * Separate from `aimError` because they are different mistakes. Error is
     * imprecision — a shaky hand. This is not knowing that a moving target has
     * to be led at all, which is the single thing that most separates someone
     * who has played a lot from someone who has not. A rookie aims where the
     * opponent IS and arrives behind them every time.
     */
    lead: number;
  }
> = {
  rookie: {
    counterPick: 0,
    launchNoise: 0.32,
    engageRange: 1.2,
    reactionTime: 0.85,
    misread: 0.45,
    launchSkill: 0,
    // A rookie is already unpredictable by accident; mixing on purpose on top
    // of a 45% misread would just be noise, and baiting is a plan it does not
    // have yet.
    mix: 0,
    bait: 0,
    // Wider than the assist cone, deliberately: a rookie's charges miss.
    aimError: 0.55,
    lead: 0,
    spinRead: 0,
  },
  blader: {
    counterPick: 0.5,
    launchNoise: 0.14,
    engageRange: 0.6,
    reactionTime: 0.35,
    misread: 0.18,
    launchSkill: 0.55,
    mix: 0.15,
    bait: 0.12,
    aimError: 0.3,
    lead: 0.5,
    spinRead: 0.5,
  },
  champion: {
    counterPick: 1,
    launchNoise: 0.04,
    engageRange: 0.45,
    reactionTime: 0.12,
    misread: 0.03,
    launchSkill: 1,
    // The champion is the one that most needs this. Its 3% misread made it a
    // near-perfect counter machine, which sounds hard but plays as
    // predictable: bait it once and the rest of the round is scripted.
    mix: 0.28,
    bait: 0.3,
    aimError: 0.12,
    lead: 1,
    spinRead: 1,
  },
};

/**
 * How far a tier will shave its launch power to reach the perfect band.
 *
 * 0.09 lets attack (base 0.95) reach 0.90 and balance (0.70) reach 0.72, while
 * leaving stamina (0.45) alone — its distance to the band is 0.27, and giving
 * that up would trade a deliberate soft entry for a spin bonus.
 */
const LAUNCH_REACH = 0.09;

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
   * THIS WAS BACKWARDS, for both archetypes it named. The old policy sent
   * attack into opposite spin 85% of the time and stamina into it 15% of the
   * time, on the reasoning that "aggressive builds want the exchanges; stamina
   * builds want the quiet attrition race they win by default". Measured across
   * the whole roster with the spin direction FORCED rather than chosen — so the
   * policy could not generate its own evidence — the truth is the exact
   * opposite:
   *
   *     attack    same 63.8%   opposite 40.2%    -23.6
   *     balance   same 37.6%   opposite 45.9%     +8.3
   *     defense   same 31.8%   opposite 56.8%    +25.0
   *     stamina   same 12.2%   opposite 35.9%    +23.8
   *
   * The stamina half of the old rationale rested on an attrition race that does
   * not exist: builds spin out in 57-75s and the median round lasts 7.5s, so
   * nobody is ever outlasted. What stamina actually wants is the matchup where
   * its signature mechanic works.
   *
   * AND THE MECHANIC IS THE WHOLE STORY. `spinSteal` only pays in opposite
   * spin — `resolvePair` gates it exactly that way — and per stamina build the
   * gain tracks it almost perfectly:
   *
   *     Drain Fafnir       steal 0.62   12.5% -> 57.8%   +45.3
   *     Sanguine Nosferu   steal 0.88   10.9% -> 64.1%   +53.1
   *     Wizard Arrow       steal 0.00   12.5% -> 23.4%   +10.9
   *     Viper Tail         steal 0.00   14.1% -> 21.9%    +7.8
   *     Silver Wolf        steal 0.00   10.9% -> 12.5%    +1.6
   *
   * The two stealers go from worst-in-game to best-in-game on the launch
   * decision alone. So the preference is read off the BUILD — its archetype
   * plus how much it can actually steal — rather than off a label.
   */
  chooseSpinDir(build: BeyBuild, playerSpinDir: 1 | -1): 1 | -1 {
    const p = PROFILE[this.difficulty];
    const archetype = buildArchetype(build);
    const base =
      archetype === 'attack'
        ? 0.15
        : archetype === 'defense'
          ? 0.85
          : archetype === 'stamina'
            ? 0.75
            : 0.55;
    // A stealer wants the opposite-spin matchup almost regardless of what else
    // it is, because that is the only place its stat exists.
    const want = Math.min(0.95, base + Math.min(0.2, build.layer.spinSteal * 0.3));
    // Tier-gated: a rookie does not know this matchup exists, so its preference
    // is blended back to a coin flip. See `spinRead`.
    const wantOpposite = 0.5 + (want - 0.5) * p.spinRead;
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
    let power = clamp01(base + (this.rng() - 0.5) * 2 * p.launchNoise);

    // AIM FOR THE GREEN BAND — the fix for an inverted incentive.
    //
    // The perfect-launch band is 0.72..0.90 and grants +14% spin. The archetype
    // bases are 0.95 (attack), 0.70 (balance) and 0.45 (stamina): two of the
    // three sit OUTSIDE the band. So `launchNoise` — the stat that is supposed
    // to make higher tiers more precise — was making them precisely miss the
    // bonus. A rookie's sloppy 0.32 spread on an attack build wanders into the
    // band sometimes; a champion's 0.04 never does. Precision was a penalty.
    //
    // Measured before this: champion beat rookie in a mirror only 53% of the
    // time, and LOST to blader at 48.8%. The difficulty ladder was flat.
    //
    // The nudge is deliberately small and conditional. A skilled blader shaves
    // a little power to catch a bonus that is nearly free; it does not abandon
    // its archetype's plan to chase it. Stamina's 0.45 is a real strategic
    // choice — a soft entry that settles to the centre — and the band is far
    // enough away that no tier is allowed to sacrifice it.
    const nearest = clamp01(
      Math.min(Math.max(power, PERFECT_LAUNCH_MIN), PERFECT_LAUNCH_MAX),
    );
    const reach = Math.abs(nearest - power);
    //
    // A PROBABILITY, not a partial nudge. Lerping partway toward the band was
    // the first attempt and it made the middle tier WORSE — measured, blader
    // beat rookie 58% before and 52% after, because a half-commitment spends
    // power moving toward the band without arriving in it, losing the spin the
    // power would have given and gaining no bonus. Landing outside the band is
    // equally unrewarded at 0.91 or at 0.89, so the only sane options are to
    // take it or leave it.
    if (reach <= LAUNCH_REACH && this.rng() < p.launchSkill) {
      power = nearest;
    }
    // NO TILT FROM THE AI, and this is a measurement rather than an oversight.
    //
    // Giving the AI an archetype-chosen tilt looked obviously right — the
    // player has the control, so the opponent should too. Measured across all
    // seven arenas it made the game worse:
    //
    //                      close      round     close     round
    //                      (no tilt)            (tilt 0.7)
    //     standard         50.4%      9.9 s     47.9%     11.5 s
    //     xrail            35.4%      6.6 s     42.5%     10.4 s
    //
    // Rounds got 25-60% longer and hits per second fell across the board, and
    // the X-Rail — the arena tilt was supposed to help by throwing attackers at
    // the wall — got notably WORSE. Halving the tilt did not rescue it.
    //
    // The reason is a genuine tension worth keeping: riding the rail wants a
    // STABLE RIM ORBIT, and tilt makes a top oscillate THROUGH the rail band
    // rather than sit in it. Tilt buys orbit variety at the cost of rail
    // access. That is a real strategic trade-off, and it belongs to the player
    // as a choice rather than to the AI as a default.
    //
    // So the AI launches flat until there is a tilt policy that measures
    // better, which would have to be arena-aware — bank on a plain dish, flat
    // on a rail floor. Recorded rather than shipped on the assumption.

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
    battle.activateMove(this.id, choice, choice === 'charge' ? this.aimAt(me, foe, p) : undefined);
  }

  /**
   * Where this tier thinks it should send a charge.
   *
   * Leads the target by its own `lead`, then adds an error of up to
   * `aimError`. Both are read against `AIM_ASSIST_CONE` — see the profile
   * fields for why those particular widths, and why a rookie's charges are
   * supposed to miss.
   *
   * The flight-time estimate deliberately mirrors `intercept` in physics.ts
   * rather than importing it: the sim's version is the TRUTH the assist
   * corrects toward, and the AI is a player making a guess at it. Sharing one
   * function would quietly make every tier a perfect predictor and delete the
   * `lead` axis entirely.
   */
  private aimAt(
    me: BeyState,
    foe: BeyState,
    p: (typeof PROFILE)[Difficulty],
  ): { x: number; y: number } {
    const dx = foe.pos.x - me.pos.x;
    const dy = foe.pos.y - me.pos.y;
    const speed = Math.hypot(me.vel.x, me.vel.y);
    const flight = speed < 0.2 ? 0 : Math.min(Math.hypot(dx, dy) / speed, AIM_LEAD_LIMIT);
    const theta = Math.atan2(
      dy + foe.vel.y * flight * p.lead,
      dx + foe.vel.x * flight * p.lead,
    );
    // Uniform rather than gaussian, because the property that matters is the
    // WORST aim a tier can produce, and a gaussian's tail would let a rookie
    // occasionally out-aim a champion.
    const err = (this.rng() * 2 - 1) * p.aimError;
    return { x: Math.cos(theta + err), y: Math.sin(theta + err) };
  }

  /**
   * Counter what the opponent is doing, falling back to a read of the board.
   * Charge beats Dodge, Block beats Charge, Dodge beats Block.
   */
  private pickMove(
    me: BeyState,
    foe: BeyState,
    distance: number,
    p: (typeof PROFILE)[Difficulty],
  ): MoveKind | null {
    const afford = (k: MoveKind): boolean => me.meter >= MOVES[k].cost;

    // Direct counter to a committed opponent — but not every time. Declining
    // the read is what keeps the AI from being solvable; see `mix`.
    if (foe.moveTime > 0.25 && foe.move) {
      const counter = MOVE_COUNTERS[foe.move];
      if (afford(counter) && this.rng() >= p.mix) return counter;
      // Having declined, fall through and play the board instead of the read.
    }

    // Nothing to counter. Close and aggressive, or hurt and looking for space.
    const losing = Math.abs(me.spin) < Math.abs(foe.spin) * 0.75;
    const nearlyBurst = me.burst > 0.6;

    if ((losing || nearlyBurst) && afford('dodge')) return 'dodge';
    if (distance < p.engageRange && afford('charge') && this.worthIt(me, foe)) {
      return 'charge';
    }

    // The bait. Spend a cheap move with nothing to counter and no opening, so
    // the opponent burns a counter on it — which is only a good trade with a
    // meter lead big enough that the exchange still leaves a charge in hand.
    //
    // Gated on the opponent being close enough to react: a feint nobody is
    // near enough to see is just wasted meter.
    const meterLead = me.meter - foe.meter;
    if (
      meterLead > 0.3 &&
      me.meter >= MOVES.charge.cost + MOVES.dodge.cost &&
      distance < p.engageRange * 1.6 &&
      this.rng() < p.bait
    ) {
      return 'dodge';
    }

    // Bank the meter rather than spend it badly.
    return null;
  }

  private randomMove(): MoveKind {
    const all: MoveKind[] = ['charge', 'block', 'dodge'];
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
  charge: 'block',
  block: 'dodge',
  dodge: 'charge',
};

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
