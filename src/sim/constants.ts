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
export const OPPOSITE_SPIN_DRAIN = 1.6;
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
export const SMASH_COEFF = 0.7;
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

// ------------------------------------------------------------------ boost ---

/**
 * The launch is the only decision in a real Beyblade match, which makes for a
 * poor game. The boost meter gives the player something to do while the round
 * plays out: bank charge, then spend it to drive your top at the opponent.
 */
export const METER_GAIN_PER_SEC = 0.145;
/** Landing a clash banks extra charge, rewarding aggression. */
export const METER_GAIN_PER_HIT = 0.11;
/** Seconds a boost lasts once spent. */
export const BOOST_DURATION = 2.2;
export const BOOST_WANDER_MUL = 2.4;
export const BOOST_ATTACK_MUL = 1.4;
