/**
 * Tuning constants for the battle simulation.
 *
 * Units are "arena units": the stadium rim sits at radius 1.0. Values are tuned
 * for feel rather than derived from a real stadium, but the *relationships*
 * follow real spinning-top behaviour (see physics.ts).
 */

/** Simulation runs at a fixed step so results are reproducible from a seed. */
export const FIXED_DT = 1 / 120;
/** Cap on catch-up steps per frame, so a stalled tab can't spiral. */
export const MAX_SUBSTEPS = 8;

// ---------------------------------------------------------------- stadium ---

/** Radius of the stadium rim. */
export const STADIUM_RADIUS = 1.0;
/** Past this radius a top has left the stadium and is ringed out. */
export const EXIT_RADIUS = 1.04;
/** Height of the rim above the centre of the dish (visual + slope profile). */
export const BOWL_DEPTH = 0.2;

/**
 * Radial acceleration at the rim. The dish is parabolic, so the inward pull is
 * proportional to radius — this is the constant of proportionality.
 */
export const SLOPE_ACCEL = 12.0;

/**
 * Exit pockets: gaps in the rim a top can be flung through. Without these the
 * wall would bounce tops back forever and knockouts could never happen.
 */
export const POCKET_COUNT = 4;
/** Angular half-width of each pocket, radians. */
export const POCKET_HALF_WIDTH = 0.26;
/** Angular offset of the first pocket. */
export const POCKET_OFFSET = Math.PI / 4;
/** A top needs at least this much outward speed to escape through a pocket. */
export const POCKET_ESCAPE_SPEED = 0.7;

/** The "tornado ridge": a raised band that holds tops in an outer orbit. */
export const RIDGE_RADIUS = 0.82;
export const RIDGE_WIDTH = 0.11;
export const RIDGE_STRENGTH = 5.0;

// ------------------------------------------------------------------- spin ---

/** Spin used to normalise spin-dependent effects. A full-power launch is ~this. */
export const SPIN_REF = 900;
/** Below this spin magnitude a top has stopped: spin finish. */
export const SPIN_MIN = 45;
/** Baseline spin lost per second, before driver spin-retention is applied. */
export const SPIN_DECAY_BASE = 13.0;
/** Extra spin lost per second per unit of linear speed (scrubbing the floor). */
export const SPIN_DECAY_MOTION = 6.0;

/**
 * How fast a top's velocity vector rotates, per unit of normalised spin.
 * This is the gyroscopic precession term and it is what makes tops *circle*
 * the dish instead of rolling straight to the middle. See physics.ts.
 */
export const PRECESSION_RATE = 4.4;

// --------------------------------------------------------------- friction ---

/** Linear drag, scaled by the driver's friction stat. */
export const DRAG_BASE = 0.42;

// ------------------------------------------------------------- collisions ---

/** Bounciness of a top-on-top hit. */
export const RESTITUTION = 0.74;
/** Bounciness of a top-on-wall hit. */
export const WALL_RESTITUTION = 0.55;

/**
 * Contacts softer than this are separated but do not drain spin, charge burst,
 * or emit a hit event. Without it two tops sharing an orbit sit in permanent
 * contact and register hundreds of "hits" a round, which turns every match into
 * a war of attrition that only stamina builds can win.
 */
export const MIN_IMPACT = 0.32;

/** Spin knocked off the *defender* per unit of normal impact speed. */
export const HIT_SPIN_LOSS = 26.0;
/** Spin the *attacker* loses per unit of normal impact speed (recoil). */
export const HIT_SPIN_RECOIL = 5.5;
/**
 * Multiplier applied to spin loss when the two tops spin in opposite
 * directions. Opposite-spin clashes are violently draining in the real game.
 */
export const OPPOSITE_SPIN_DRAIN = 2.2;
/**
 * Ceiling on the spin a single clash can remove, as a fraction of launch spin.
 * Uncapped, one violent head-on in an opposite-spin matchup drains both tops
 * below the finish threshold at once and the round is a draw before it started.
 */
export const MAX_SPIN_LOSS_PER_HIT = 0.2;
/**
 * Fraction of the attacker's spin converted into tangential launch force —
 * this is the "smash attack" that flings a defender across the stadium.
 */
export const SMASH_COEFF = 1.1;
/**
 * Hard cap on the sideways velocity a single smash can impart. The smash scales
 * with impact speed, and without a ceiling one big head-on hit applies a
 * several-metres-per-second kick in a single step and ends the round instantly.
 */
export const SMASH_MAX = 2.2;

/** Burst charge accumulated per unit of normal impact speed. */
export const BURST_PER_HIT = 0.085;
/** Burst charge bled off per second while not being hit. */
export const BURST_RECOVERY = 0.055;

// ------------------------------------------------------------------ match ---

export const POINTS_KNOCKOUT = 2;
export const POINTS_BURST = 2;
export const POINTS_SPIN_FINISH = 1;
/** First to this many points wins the match. */
export const POINTS_TO_WIN = 4;
/** A round is declared a draw after this many seconds. */
export const ROUND_TIME_LIMIT = 75;

// ------------------------------------------------------------------ moves ---

/**
 * The battle move set.
 *
 * The launch used to be the only decision in a round, which made the battle
 * something you watched rather than played. These three moves give the player a
 * real-time layer, and they beat each other in a triangle:
 *
 *   Charge beats Dodge   — a dodging top can't outrun a seeking one, and its
 *                         raised knockback means it gets flung toward a pocket
 *   Block beats Charge — the charger is committed and takes the recoil, while
 *                         the block barely moves and shrugs off burst charge
 *   Dodge   beats Block — an block can't catch anything and bleeds spin fast,
 *                         so refusing the engagement wins by denial
 *
 * Nothing here special-cases a matchup. The triangle is a *consequence* of the
 * modifiers below, which means it also holds against builds and situations we
 * never explicitly considered.
 */
export interface MoveProfile {
  /** Seconds the move stays active. */
  duration: number;
  /** Meter spent, out of a full 1.0. */
  cost: number;
  /** Multiplier on the driver's self-propulsion — how hard it seeks. */
  wander: number;
  /** Multiplier on tip friction. */
  friction: number;
  /** Multiplier on damage dealt. */
  attack: number;
  /** Multiplier on defense, so higher means less damage taken. */
  defense: number;
  /** Multiplier on burst resistance. */
  burstResist: number;
  /** Multiplier on the collision impulse received. */
  knockback: number;
  /** Extra spin lost per second while active — the cost of holding the move. */
  spinDrain: number;
  /** One-off speed added the instant the move fires. */
  speedKick: number;
  /**
   * Which way that one-off kick points.
   *
   * 'escape' aims away from the opponent (Dodge), 'pursue' aims straight at
   * them (Charge). Charge originally had no kick at all, so pressing it
   * produced no visible response — the button felt dead.
   */
  kickMode: 'none' | 'escape' | 'pursue';
  /**
   * Acceleration toward the nearest opponent while active.
   *
   * Charge used to work by multiplying the driver's `wander`, but wander pushes
   * a top *radially outward from the centre* — it never points at anyone. So
   * "hunt & smash" did not hunt: it nudged you toward the rim, by an amount
   * scaled by a stat that is 0.06 on some drivers. This is the actual homing.
   */
  seek: number;
  /**
   * Multiplier on spin retention while the move is active.
   *
   * A free-running tip genuinely scrubs the floor less and holds its spin
   * longer. Without this, fleeing always cost more spin than sitting still, so
   * Dodge could never win an attrition race against Block by denial.
   */
  spinRetention: number;
  /**
   * Fraction of incoming spin damage returned to the attacker.
   *
   * Without this, blocking costs the blocker everything and the attacker
   * nothing, so Block could never beat Charge and the triangle collapsed into
   * a strict ordering. A rigid, low-knockback target genuinely does return more
   * energy to whatever hits it.
   */
  reflect: number;
}

export const MOVES: Record<'charge' | 'block' | 'dodge', MoveProfile> = {
  charge: {
    duration: 2.2,
    cost: 1.0,
    // Neutral, not boosted. Cranking `wander` was the old, broken proxy for
    // hunting — it pushes radially OUTWARD, so on a high-wander driver it
    // fought the new inward seek and the two cancelled to zero movement.
    wander: 1.0,
    friction: 1.0,
    attack: 1.45,
    defense: 0.8,
    burstResist: 0.8,
    knockback: 1.0,
    spinDrain: 4,
    speedKick: 1.15,
    kickMode: 'pursue',
    seek: 8.5,
    spinRetention: 0.95,
    reflect: 0,
  },
  block: {
    duration: 2.0,
    cost: 0.65,
    wander: 0.08,
    friction: 2.2,
    attack: 0.35,
    defense: 2.4,
    burstResist: 2.2,
    knockback: 0.35,
    spinDrain: 19,
    speedKick: 0,
    kickMode: 'none',
    seek: 0,
    spinRetention: 1.0,
    reflect: 1.35,
  },
  dodge: {
    duration: 1.6,
    cost: 0.45,
    wander: 0.5,
    friction: 0.45,
    attack: 0.4,
    defense: 2.0,
    burstResist: 1.3,
    knockback: 1.1,
    spinDrain: 0,
    speedKick: 1.6,
    kickMode: 'escape',
    seek: 0,
    spinRetention: 2.0,
    reflect: 0,
  },
};

/** Meter gained per second of the round. */
export const METER_GAIN_PER_SEC = 0.145;
/** Landing a clash banks extra charge, rewarding aggression. */
export const METER_GAIN_PER_HIT = 0.11;

/**
 * Ceiling on speed immediately after Dodge's kick, and how much of that kick is
 * aimed at the stadium centre rather than straight ahead.
 *
 * Measured without these, a repeatedly-dodging top accelerated until it either
 * hammered the wall or flew out a pocket — a third of all Dodge losses were
 * self-inflicted knockouts. Disengaging should mean retreating to safety, not
 * rocketing forward.
 */
export const DODGE_MAX_SPEED = 3.6;
export const DODGE_INWARD_BIAS = 0.55;
/** How much of the escape aims directly away from the opponent. */
export const DODGE_AWAY_BIAS = 0.6;
/** Past this radius the escape is redirected inward instead of outward. */
export const DODGE_SAFE_RADIUS = 0.72;

/** Impact strength above which the presentation layer freezes for hitstop. */
export const HITSTOP_THRESHOLD = 1.6;

/**
 * Impact strength that earns a full-screen manga frame.
 *
 * Deliberately well above HITSTOP_THRESHOLD. Hitstop marks "that hurt" and is
 * common; the frame marks "that mattered" and must not be. Measured over the
 * balance sweep, hits clear 1.6 several times per exchange but 2.6 only on a
 * genuine heavy connect, which is the beat worth cutting on.
 */
export const IMPACT_FRAME_THRESHOLD = 2.6;

/**
 * Refractory period between manga frames, seconds.
 *
 * An opposite-spin exchange lands a burst of hits inside about a second; one
 * frame should represent that exchange, not four stacked on top of each other.
 */
export const IMPACT_FRAME_COOLDOWN = 1.2;
/** Seconds of freeze on a heavy clash. */
export const HITSTOP_DURATION = 0.09;

// ----------------------------------------------------------------- settle ---

/**
 * Seconds over which a freshly launched top ramps from taking no collision
 * damage to taking full damage.
 *
 * Opposite-spin tops orbit in opposite directions, so they meet head-on within
 * half an orbit at maximum closing speed. Measured without this ramp, the median
 * round was 1.2s and 57% of rounds ended inside two seconds — the round was over
 * before the player had read the board. The ramp lets both tops establish their
 * orbits first; the first real clash still lands at full strength.
 */
export const SETTLE_TIME = 1.25;

/**
 * The finish. When a round is decided the result panel used to appear on the
 * same frame, covering the stadium before the player saw the blow that ended
 * it. Hold on the arena first, with the renderer stepped slowly.
 */
export const FINISH_HOLD_TIME = 1.15;
export const FINISH_RENDER_SCALE = 0.35;

// ------------------------------------------------------------------ drama ---

/**
 * Variance, deliberately reintroduced.
 *
 * Fixing the pacing defect removed the coin-flip rounds, but it also flattened
 * the emotional range: every round became a steady grind and nothing ever went
 * spectacularly right or wrong. A game with no tail on the distribution has no
 * moments worth retelling.
 *
 * The design constraint is that the spikes must be *earned or survivable*, not
 * arbitrary. Two of the three below are pure skill (launch timing, block
 * timing); only the critical clash is chance, and even that is capped so it
 * swings a round rather than instantly deciding one from full spin.
 */

/** Probability that a clash lands as a critical. */
export const CRIT_CHANCE = 0.07;
/** Damage and smash multiplier on a critical. */
export const CRIT_MULT = 1.9;
/**
 * A critical raises the per-hit spin cap from MAX_SPIN_LOSS_PER_HIT to this.
 * Without lifting the cap a critical is invisible — the normal ceiling clamps
 * it back down to an ordinary hit.
 */
export const CRIT_SPIN_CAP = 0.38;

/**
 * Block counts as "perfect" if contact happens within this many seconds of it
 * being activated. Blocking early is safe but ordinary; blocking on the read,
 * just as the charge lands, is what earns the big punish.
 */
export const PERFECT_BLOCK_WINDOW = 0.3;
export const PERFECT_BLOCK_REFLECT_MULT = 2.2;

/** Launch power inside this band is a perfect launch. Matches the UI's band. */
export const PERFECT_LAUNCH_MIN = 0.72;
export const PERFECT_LAUNCH_MAX = 0.9;
/** Extra spin and speed granted for nailing it. */
export const PERFECT_LAUNCH_SPIN_BONUS = 0.14;

// ------------------------------------------------------------- spin steal ---

/**
 * Spin absorption, the rubber-blade mechanic.
 *
 * A layer with `spinSteal` bites into an opponent turning the *other* way and
 * converts part of that contact back into its own rotation — the top looks like
 * it is dying, then climbs back with every further clash. It only works in
 * opposite-spin matchups, which is what stops it being a free stat and gives
 * the spin-direction choice real weight.
 */

/** Fraction of the damage dealt that the absorber converts into its own spin. */
export const SPIN_STEAL_GAIN = 0.85;
/** How much of the absorber's *own* loss is negated while absorbing. */
export const SPIN_STEAL_MITIGATION = 0.55;
/**
 * Ceiling on stolen spin, as a fraction of launch spin. Without it a long
 * absorbing exchange ratchets upward without limit and the round never ends.
 */
export const SPIN_STEAL_CAP = 1.0;
