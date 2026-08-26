/**
 * Arenas.
 *
 * An arena is a *gameplay* setting, not a cosmetic one — it changes the physics,
 * so it belongs to the match rules rather than to skins and themes. That
 * distinction matters: everything cosmetic in this game is provably inert, and
 * an arena is the one slot that isn't.
 *
 * The X-Rail is the signature mechanic of the current Beyblade generation: a
 * toothed rail around the outer edge that catches a top moving fast enough,
 * accelerates it, then slingshots it back across the dish.
 *
 * What makes it good design rather than a speed boost is that it creates a
 * *contested location*. The rail is where damage comes from, so both players
 * want it — but a top riding the rail is moving predictably along a known arc
 * and sits one clean hit away from an exit pocket. That gives the dish a
 * geography players can reason about, which a uniform bowl never had.
 */

export interface RailSpec {
  /** Radius of the rail band's centre line. */
  radius: number;
  /** Half-thickness of the band a top must be inside to engage. */
  halfWidth: number;
  /** Tangential speed needed to bite into the teeth rather than slide past. */
  engageSpeed: number;
  /** Tangential acceleration applied while locked in. */
  accel: number;
  /** Speed ceiling while railed, so it can't run away. */
  maxSpeed: number;
  /** Maximum seconds locked in before it releases. */
  duration: number;
  /** Seconds before the same top can engage again. */
  cooldown: number;
  /**
   * Fraction of the exit velocity redirected toward the centre. This is the
   * slingshot: the point of the rail is where it throws you, not the speed.
   */
  releaseInward: number;
}

/**
 * A hazard occupying the middle of the dish.
 *
 * This exists to fix a *measured* balance hole rather than to add a feature.
 * Sweeping every preset against every other on the plain dish, win rates ran
 * from 33% (pure attack) to 63% (balance), and the reason is geography: the
 * bowl is a parabola, so its centre is the calmest place on the board. A low,
 * deep launch parks there, takes fewer contacts, and outlasts. Attack builds
 * carry high wander that pushes them out to the ridge where the damage is, so
 * the game was quietly paying tops to do nothing.
 *
 * The pit charges rent on the safe square. It drains spin the longer a top
 * stays inside, scaled by depth, so the centre becomes a place you pass
 * through rather than a place you live. Crucially it is a *gradient*, not a
 * wall — a hard edge would just move the camping spot to its perimeter.
 */
export interface PitSpec {
  /** Radius of the hazard zone. */
  radius: number;
  /** Spin drained per second at the very centre. */
  drain: number;
  /**
   * Seconds of grace before the drain reaches full strength, reset by leaving.
   * Passing through must stay free — otherwise the pit punishes the attacker
   * crossing the dish to engage, which is the opposite of the intent.
   */
  grace: number;
}

export interface ArenaSpec {
  id: string;
  name: string;
  blurb: string;
  /** Which visual theme suits it. The player can still override. */
  suggestedTheme: string;
  rail: RailSpec | null;
  pit?: PitSpec | null;
  /**
   * Index of the pocket that scores an Xtreme Finish, or null for none.
   *
   * Indexes `pocketAngles()`, so 0 is the pocket at POCKET_OFFSET and the rest
   * run anticlockwise from it. An index rather than an angle because the two
   * must not be able to drift apart: a bearing written here that fell between
   * two pockets would be a scoring rule that can never fire, and nothing would
   * report it.
   *
   * This is the one piece of geography the dish did not have. `sim/arena.ts`
   * argues that the rail is good design because it creates a contested
   * location; four identical exits are the opposite, an entire ring of places
   * where the outcome is the same. See docs/ARENA-IDEAS.md.
   */
  finishPocket?: number | null;
}

export const STANDARD: ArenaSpec = {
  id: 'standard',
  name: 'Standard Dish',
  blurb: 'the plain bowl — no archetype favoured',
  suggestedTheme: 'arena',
  rail: null,
};

export const XRAIL: ArenaSpec = {
  id: 'xrail',
  name: 'X-Rail Stadium',
  blurb: 'outer rail slingshots fast tops — faster, deadlier rounds',
  suggestedTheme: 'anime',
  rail: {
    // Just outside the tornado ridge, so riding the rail is a deliberate
    // commitment to the outer orbit rather than something that happens to you.
    radius: 0.9,
    halfWidth: 0.08,
    engageSpeed: 1.9,
    accel: 3.0,
    maxSpeed: 3.4,
    duration: 0.55,
    cooldown: 1.6,
    releaseInward: 0.85,
  },
  // The rail already throws tops across the dish on a bearing the rider does
  // not fully choose, so a graded exit gives that slingshot something to aim
  // at. Pocket 0 sits at POCKET_OFFSET = 45 degrees.
  finishPocket: 0,
};

export const SPIKE_PIT: ArenaSpec = {
  id: 'spikepit',
  name: 'Spike Pit',
  blurb: 'the centre bites — camping the middle bleeds spin',
  suggestedTheme: 'anime',
  rail: null,
  pit: {
    // Comfortably inside the tornado ridge (0.82): the pit owns the calm
    // middle without touching the orbit where contacts actually happen.
    radius: 0.42,
    // Searched, not guessed, and the response is NOT monotonic — the first
    // attempt used 34 on the assumption that a harsher tax means a flatter
    // meta, and it made the spread worse than the plain dish (26.7 -> 30.0).
    //
    // Sweeping drain against the full preset matrix:
    //     6  floor 36.7  ceiling 64.2  spread 27.5   (too weak to bite)
    //    12  floor 41.7  ceiling 61.7  spread 20.0   <- here
    //    20  floor 38.3  ceiling 63.3  spread 25.0
    //    34  floor 33.3  ceiling 66.7  spread 33.3   (rewards the mobile)
    //
    // The mechanism behind the curve: the pit taxes whoever sits in it, so
    // past a certain strength it stops being a nerf to camping and becomes a
    // *subsidy* to whichever build already never goes near the middle. The
    // useful setting raises the floor (32.5 -> 41.7) while barely touching
    // the ceiling — a flatter meta, not a different tyrant.
    drain: 12,
    grace: 1.8,
  },
};

/**
 * The Gauntlet — a rail AND a pit, which nothing else combines.
 *
 * `ArenaSpec` has always allowed both and no arena has ever set both, so the
 * one floor where the outer orbit is rewarded and the middle is taxed did not
 * exist. That combination is the sharpest positional statement the current
 * physics can make: there is nowhere neutral to stand. Stamina builds cannot
 * park in the calm centre and outlast, and attackers riding the rail are
 * committed to a bearing they do not fully choose.
 *
 * Both hazards are softened from their solo versions on purpose. The Spike
 * Pit's drain was tuned against a floor whose only other feature was the bowl,
 * and stacking a full-strength pit under a full-strength rail taxes the same
 * top twice for one decision. The rail is also given a slightly wider band so
 * the escape from the pit has somewhere to land.
 *
 * NOT balance-swept yet. The Spike Pit's own history is the warning — a harsher
 * drain made the archetype spread WORSE, not flatter, and the response was not
 * monotonic. Treat these numbers as a starting point, not a result.
 */
export const GAUNTLET: ArenaSpec = {
  id: 'gauntlet',
  name: 'The Gauntlet',
  blurb: 'rail outside, spikes inside — nowhere neutral to stand',
  suggestedTheme: 'anime',
  rail: {
    radius: 0.9,
    // Wider than XRAIL's 0.08: a top fleeing the pit arrives at the wall on a
    // steeper bearing and would otherwise cross the band without biting.
    halfWidth: 0.11,
    engageSpeed: 1.9,
    accel: 2.6,
    maxSpeed: 3.1,
    duration: 0.5,
    cooldown: 1.7,
    releaseInward: 0.8,
  },
  pit: {
    radius: 0.38,
    // 8, against the Spike Pit's tuned 12. The rail already punishes the middle
    // indirectly by rewarding the rim, so a full-strength drain would charge
    // twice for one positional mistake.
    drain: 8,
    grace: 0.55,
  },
  finishPocket: 2,
};

/**
 * Sudden Death — a plain bowl with one graded pocket.
 *
 * The Xtreme Finish currently exists only on the X-Rail, which confounds two
 * things: the graded pocket is always measured alongside a mechanic that biases
 * exits toward it. Measured on the rail, 33.3% of knockouts go through the
 * graded pocket against 25% by chance, and that surplus is the rail's doing.
 *
 * This is the control. Same bowl as STANDARD, one pocket worth 3 instead of 2,
 * nothing else. It answers "is a graded exit interesting on its own" — and it
 * gives a floor where positioning matters to players who find the rail's
 * variance unpleasant, which is a real competitive preference and the reason
 * plain stadiums stay popular in the real game.
 */
export const SUDDEN_DEATH: ArenaSpec = {
  id: 'sudden',
  name: 'Sudden Death',
  blurb: 'the plain bowl, but one exit is worth more',
  suggestedTheme: 'arena',
  rail: null,
  finishPocket: 1,
};

/**
 * Tight Dish — the same bowl with the fight pushed outward.
 *
 * From the real product: the Hasbro Xtreme Beystadium is smaller than the
 * Takara Tomy one and is described as producing more dashes and quicker, more
 * violent battles for exactly that reason. Less floor means less room to
 * disengage.
 *
 * The sim's `STADIUM_RADIUS` is a global constant and the whole physics is
 * radial against it, so shrinking the floor for one arena is not a parameter —
 * see docs/ARENA-IDEAS.md E3, which reaches the same conclusion about a square
 * floor. What IS reachable is the same effect by a different route: a wide,
 * gentle pit that covers most of the middle and makes the usable floor an
 * annulus. The tops end up fighting in a ring rather than a disc.
 *
 * Deliberately a much weaker drain over a much larger radius than the Spike
 * Pit. The Pit is a hazard you avoid; this is a slope you are always slightly
 * on, and at 4/second it costs a fraction of what a single heavy hit does.
 */
export const TIGHT_DISH: ArenaSpec = {
  id: 'tight',
  name: 'Tight Dish',
  blurb: 'the middle is dead ground — fight happens in the ring',
  suggestedTheme: 'arena',
  rail: null,
  pit: {
    radius: 0.66,
    drain: 4,
    grace: 0.8,
  },
};

export const ARENAS: ArenaSpec[] = [STANDARD, XRAIL, SPIKE_PIT, GAUNTLET, SUDDEN_DEATH, TIGHT_DISH];

export const arenaById = (id: string): ArenaSpec =>
  ARENAS.find((a) => a.id === id) ?? STANDARD;
