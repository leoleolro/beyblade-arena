import type { Vec2 } from './math';


/** Archetype, used for AI behaviour hints and UI colour coding. */
export type Archetype = 'attack' | 'defense' | 'stamina' | 'balance';

export interface LayerPart {
  id: string;
  name: string;
  kind: 'layer';
  archetype: Archetype;
  /** Contribution to total mass. */
  mass: number;
  /** Collision radius of the whole top. */
  radius: number;
  /** Scales spin damage dealt on contact. */
  attack: number;
  /** Divides spin damage received on contact. */
  defense: number;
  /** Divides burst charge accumulated on contact. */
  burstResist: number;
  /**
   * Spin absorption, 0–1. A rubber-bladed layer bites into an opponent turning
   * the *other* way and converts part of that contact back into its own
   * rotation, so it can visibly recover spin over a long exchange.
   *
   * Only works in opposite-spin matchups — against a same-spin opponent the
   * blades are travelling the same way at the contact point and there is
   * nothing to grab. That restriction is what stops it being a free stat and
   * makes the spin-direction choice matter.
   */
  spinSteal: number;
  /**
   * Fraction of `spinSteal` that still works in a *same*-spin matchup, 0–1.
   * Omitted (the catalog-wide default) means the opposite-spin gate above is
   * absolute, which is the rule for every layer but the vampire — see the
   * spin-steal block in constants.ts for why exactly one exception exists.
   */
  sameSteal?: number;
  /** Number of contact blades — purely visual. */
  blades: number;
  colour: number;
}

export interface DiscPart {
  id: string;
  name: string;
  kind: 'disc';
  mass: number;
  /** Resistance to being knocked off a stable orbit. Damps velocity changes. */
  stability: number;
  /** Heavier outer weight sustains spin. Multiplies spin retention. */
  spinRetention: number;
  colour: number;
  /**
   * Protrusion count and height in millimetres, for the ones transcribed from
   * real Ratchets. The naming system encodes both: `4-60` is four protrusions
   * at 6.0 mm.
   *
   * WHY THE COUNT IS DATA AND NOT DECORATION. Real blades are designed so the
   * blade's protrusion count MATCHES the ratchet's, producing one coherent
   * stacked silhouette rather than two unrelated rims — SphinxCowl's nine
   * "Barrage Blade" protrusions are stated to be "intended to align with the 9
   * protrusions of the 9-80 Ratchet". Carrying the number here is what makes
   * that rule expressible; `alignsWith` reads it.
   */
  protrusions?: number;
  heightMm?: number;
}

export interface DriverPart {
  id: string;
  name: string;
  kind: 'driver';
  archetype: Archetype;
  mass: number;
  /** Tip friction. High = grippy and slow, low = free-moving and fast. */
  friction: number;
  /** Divides passive spin decay. Sharp tips retain spin best. */
  spinRetention: number;
  /**
   * Self-propulsion the tip generates. Aggressive flat tips wander outward and
   * chase; stamina tips sit still in the centre. Positive = seeks the rim.
   */
  wander: number;
  /** Divides burst charge accumulated on contact. */
  burstResist: number;
  /**
   * How well this tip bites the X-Celerator rail. 0 = never engages, 1 = full.
   *
   * THE REAL GAME PUBLISHES THIS AS A STAT. Beyblade X Bits carry a five-axis
   * block — Attack / Defense / Stamina / **Dash** / Burst Resistance — and Dash
   * is exactly this: how well the tip's gear teeth mesh with the stadium rail.
   * The catalogue splits cleanly, which is the point of having the axis at all:
   *
   *     Gear Flat  dash 40      Accel  dash 40      Flat   dash 35
   *     Rush       dash 30      Point  dash 25      Taper  dash 25
   *     Ball       dash 10      Orb    dash 10      Needle dash 10
   *
   * Attack tips are FOUR TIMES the stamina tips. That is the decision the
   * X-Rail arena was missing — before this, which bottom you chose changed how
   * you moved but not whether you could use the arena's headline mechanic.
   *
   * Optional so every existing driver keeps working; `railGripOf` supplies a
   * sane default from the archetype for the ones authored before this existed.
   */
  railGrip?: number;
}

export type Part = LayerPart | DiscPart | DriverPart;

/** A full top configuration: one part per slot. */
export interface BeyBuild {
  layer: LayerPart;
  disc: DiscPart;
  driver: DriverPart;
}

/** Stats derived from a build, computed once at battle start. */
export interface BeyStats {
  mass: number;
  radius: number;
  attack: number;
  defense: number;
  burstResist: number;
  spinSteal: number;
  sameSteal: number;
  friction: number;
  spinRetention: number;
  stability: number;
  wander: number;
  /** Rail engagement, 0..1. See DriverPart.railGrip. */
  railGrip: number;
}

/** The three battle moves. See MOVES in constants.ts for the triangle. */
export type MoveKind = 'charge' | 'block' | 'dodge';

/** How a top left the round. */
export type Defeat = 'knockout' | 'burst' | 'spin-finish';

/** Live per-top simulation state. */
export interface BeyState {
  id: string;
  name: string;
  build: BeyBuild;
  stats: BeyStats;
  /** Position on the stadium plane. */
  pos: Vec2;
  vel: Vec2;
  /** Signed angular velocity: magnitude is spin left, sign is spin direction. */
  spin: number;
  /** Spin at launch, for HUD percentages. */
  spinAtLaunch: number;
  /** Burst charge in [0, 1]. Reaching 1 bursts the top. */
  burst: number;
  /** Accumulated visual rotation of the mesh, radians. */
  angle: number;
  /** Current lean, driven by speed and remaining spin. Radians. */
  tilt: number;
  alive: boolean;
  defeat: Defeat | null;
  /** Set on the frame a collision happens, for spark effects. Decays to 0. */
  hitFlash: number;
  /**
   * Set to 1 on the frame this top absorbed spin, decaying like `hitFlash`, so
   * the renderer can draw the drain without re-deriving it from a spin delta —
   * a delta cannot tell absorption apart from a clash the top happened to win.
   *
   * Optional because a top that never absorbs never has one: the field is
   * written by the collision step, not seeded at launch. Read it as
   * `stealPulse ?? 0`.
   */
  stealPulse?: number;
  /** Move charge in [0, 1]. Each move costs a different slice of it. */
  meter: number;
  /** The move currently active, or null. */
  move: MoveKind | null;
  /** Seconds of the active move remaining. */
  moveTime: number;
  /** Seconds since this top was launched. Drives the settle ramp. */
  age: number;
  /** Seconds left locked into the X-Rail, if the arena has one. */
  railTime: number;
  /** Seconds before this top may engage the rail again. */
  railCooldown: number;
  /** Rail engagements this round — shown in the breakdown. */
  railRides: number;
  /**
   * Consecutive rides in the current burst, and seconds since the last one.
   *
   * Separate from `railRides`, which is a per-round total for the HUD and the
   * balance suite. This pair is what makes a dash ESCALATE: the real gimmick
   * has no cap on engagements and each one leaves the top faster, so a bey that
   * holds the outer orbit gets "small bumps then big bumps". A top that leaves
   * the band long enough for `railIdle` to pass the spec's window drops back to
   * a small bump, which is what stops the escalation being permanent.
   */
  railStreak: number;
  railIdle: number;
  /** Unbroken seconds spent inside the Spike Pit, if the arena has one. */
  pitTime: number;
  /** Total spin the pit has taken off this top — shown in the breakdown. */
  pitDrained: number;
  /** Whether this top's launch landed in the perfect band. */
  perfectLaunch: boolean;
  /** Clashes this top was the aggressor in — shown in the round breakdown. */
  hitsLanded: number;
  /** Total spin this top has drained from opponents. */
  spinDealt: number;
  /** Total spin this top has absorbed back from opponents. */
  spinStolen: number;
  /** Hardest impact this top was involved in. */
  biggestHit: number;
  /** Moves spent this round. */
  movesUsed: number;
}

/** How a round ended. */
export interface RoundResult {
  winnerId: string | null;
  loserId: string | null;
  /** 'draw' means every top went out on the same step; 'timeout' is the clock. */
  reason: Defeat | 'timeout' | 'draw';
  points: number;
  /**
   * Whether the knockout went through the arena's graded pocket.
   *
   * Carried separately from `points` because the UI needs to NAME it — a
   * player who is handed 3 points instead of 2 and told nothing has learned
   * that the arena is random, which is the opposite of what a contested
   * location is for.
   */
  xtremeFinish?: boolean;
}

export type Phase = 'launch' | 'battle' | 'round-over' | 'match-over';

/** Launch parameters chosen by a player (or the AI) before a round. */
export interface LaunchParams {
  /** Launch strength in [0, 1]. Maps to starting spin and speed. */
  power: number;
  /** Angle around the stadium rim to drop in at, radians. */
  entryAngle: number;
  /** How far in from the rim to drop, in [0, 1]. 0 = rim, 1 = centre. */
  entryDepth: number;
  /**
   * Launcher tilt, in [-1, 1]. The radial component of the launch.
   *
   * 0 launches purely tangentially, which — at orbital velocity — is by
   * definition a CIRCULAR orbit. That was the only launch this sim could
   * produce, and it is why every top settled into the same orbital band and
   * stayed there: two tops at the same radius and similar speed orbit adjacent
   * to each other for the whole round without resolving.
   *
   * Negative dives inward, positive throws outward. Either way the bowl's slope
   * pulls it back, so the top oscillates between two radii instead of holding
   * one — repeated excursions from centre to rim and back. That is the real
   * game's **flower pattern**, and it is not scripted here: it falls out of an
   * off-circular launch meeting the restoring slope that `bowlHeight` and
   * `slopeAccel` already provide.
   *
   * Optional so every existing caller keeps the old behaviour exactly.
   */
  tilt?: number;
}
