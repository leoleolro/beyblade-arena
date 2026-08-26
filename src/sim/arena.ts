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
   * How much `maxSpeed` rises per consecutive ride, and the ceiling on that.
   *
   * The escalation is the point of the whole mechanic. Measured against the
   * real toy, our rail fired about a tenth as often AND every ride was
   * identical — the owner's description of the real one is "5 times under 3
   * seconds, small bumps then big bumps", and the second half was entirely
   * missing. `escalation` 0 reproduces the old flat behaviour exactly, so an
   * arena can opt out.
   */
  escalation?: number;
  escalationMax?: number;
  /**
   * Seconds off the band before a streak resets.
   *
   * Long enough to survive the cooldown plus a lap, short enough that being
   * knocked off the wall genuinely costs the built-up speed.
   */
  streakWindow?: number;
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
  /**
   * Where the pit sits, as a fraction of stadium radius from the centre.
   * Omitted or 0 puts it dead centre, which is what every pit did before.
   *
   * WHY OFF-CENTRE IS INTERESTING. Measured across all seven arenas, the two
   * tops spend around half of every round within 2.2x contact radius — the
   * "cat chase mouse" the owner reported — and **only the arenas with a rail
   * break it** (35-39% against 48-51%). Pits did nothing, pocket layout did
   * nothing, launch tilt did nothing.
   *
   * The reason the rail works is that it grabs ONE top and changes its speed
   * and bearing independently of the other. Everything else in this sim is
   * radially symmetric, so both tops experience identical forces at the same
   * radius and stay phase-locked however their orbits are shaped.
   *
   * An off-centre hazard is the cheapest way to break that symmetry without
   * leaving the radial coordinate system (which is what a square floor would
   * require — see ARENA-IDEAS.md E3). Two tops at the same radius but
   * different bearings now meet different floors, so they drift apart in phase.
   */
  offset?: number;
  /** Bearing of that offset in radians. Ignored when `offset` is 0. */
  offsetAngle?: number;
  /**
   * Outward acceleration applied to a top inside the zone, in units/s^2.
   *
   * A DRAIN CANNOT DESYNCHRONISE TWO TOPS, and that is the measurement that
   * produced this field. An off-centre pit was built on the theory that
   * breaking the dish's radial symmetry would stop the two tops phase-locking
   * into a chase. Measured, it changed nothing: 48.8% adjacency against the
   * 47-49% of every other rail-less floor.
   *
   * The reason is that a pit drains SPIN and spin is not a trajectory. Two tops
   * on identical orbits stay on identical orbits however much spin one of them
   * loses. The rail desynchronises because it changes VELOCITY — it grabs one
   * top and throws it on a new bearing at a new speed.
   *
   * So a floor feature that wants to break the lock has to change velocity.
   * This applies a TANGENTIAL acceleration — a current that swirls a top around
   * the zone rather than shoving it out of it.
   *
   * The direction matters and was measured. An OUTWARD push made the chase
   * WORSE (48.8% to 54.3%), because it moves both tops outward together and
   * keeps them paired. A tangential one changes each top's BEARING, which is
   * what the rail does and the only thing found that helps.
   */
  push?: number;
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
  /**
   * Exit pocket bearings in radians, or omitted for the default four at 90°.
   *
   * THE REAL STADIUMS DO NOT SPACE THEM EVENLY. Takara Tomy's own regulation
   * for the Xtreme Stadium: "The Over Zone refers to the two pockets located at
   * the front left and right... The Xtreme Zone refers to the hole located at
   * the center front." All three exits are on ONE wall — three of the four
   * walls are solid. BX-32 Wide moves them and inverts which is worth 3; the
   * Infinity Stadium runs six in a 4+2 arrangement down two long sides.
   *
   * Ours were four identical exits at 45°, 135°, 225°, 315°, which means no
   * part of the floor is safer than any other and there is never a reason to
   * prefer one direction to shove someone. Clustering is the single biggest
   * change to how a floor plays that needs no new physics — see
   * docs/ARENA-IDEAS.md E2, written before the regulation confirmed it.
   */
  pockets?: number[];
  /**
   * This floor's own colours, overriding the theme's.
   *
   * WHY THIS EXISTS. Reported as "every arena looks like the anime arena...
   * that shouldn't be the case", and correct: every stadium colour came from
   * the THEME, and the roster mode has exactly one theme, so seven stadiums
   * rendered identically apart from whether a rail or a pit was switched on.
   * The floor is the biggest object on screen and it was the same object every
   * time.
   *
   * The separation this restores: a **theme** is a rendering STYLE — cel or 3D,
   * bloom, ink, impact frames — and applies to everything in the scene. An
   * **arena** is a place, and places have their own colours. Overriding here
   * rather than adding themes keeps one look per mode while giving every floor
   * an identity, and an arena that sets nothing still inherits the theme
   * exactly as before.
   *
   * Deliberately NOT the full theme surface. Metalness, roughness, bloom and
   * opacity stay with the theme, because those are what make Anime look like
   * Anime; letting an arena reach them would let one floor quietly leave the
   * mode's visual language.
   */
  look?: ArenaLook;
}

export interface ArenaLook {
  /** The bowl. */
  dish?: number;
  /** The rim wall. */
  wall?: number;
  /** The tornado ridge line. */
  ridge?: number;
  /** The concentric guide rings on the floor. */
  guide?: number;
  /** The exit posts. */
  post?: number;
}

export const STANDARD: ArenaSpec = {
  id: 'standard',
  look: { dish: 0xdfe7f2, wall: 0xf2f5fa, ridge: 0x8fb4e8, guide: 0xb9c9e4, post: 0xe2544a },
  name: 'Standard Dish',
  blurb: 'the plain bowl — no archetype favoured',
  suggestedTheme: 'arena',
  rail: null,
};

export const XRAIL: ArenaSpec = {
  id: 'xrail',
  look: { dish: 0xd8e6f6, wall: 0xeef3fa, ridge: 0xe0b23c, guide: 0xc3d4ea, post: 0xe2544a },
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
    // A RHYTHM, NOT A RARE EVENT — and the lever was the COOLDOWN alone.
    //
    // Measured, the old duration 0.55 + cooldown 1.6 put a 2.15 s floor on one
    // top's ride-to-ride cycle, and the median gap between a top's consecutive
    // rides was 3.93 s against the real toy's ~0.6. The first attempt at this
    // cut BOTH numbers, on the theory that short rides would come thick and
    // fast. That was wrong and the sweep said so: shortening the ride also
    // shortens the drive, so tops left the band slower, returned less often,
    // and mean round length went from 5.73 s to 10.4 s — an 80% slower game for
    // no gain in engagement.
    //
    // Cooldown alone, with the ride left long:
    //     dur 0.30 cd 0.35   gap 0.70   round 10.4 s   ko  --
    //     dur 0.45 cd 0.35   gap 0.88   round  6.9 s   ko 46.7%
    //     dur 0.50 cd 0.35   gap 1.00   round  6.3 s   ko 51.7%   <- here
    //     dur 0.55 cd 1.60   gap 3.93   round  5.7 s   ko 49.1%   (before)
    //
    // Round length and knockout rate land within a whisker of where they were,
    // and the gap between a top's rides drops fourfold.
    maxSpeed: 3.4,
    duration: 0.5,
    cooldown: 0.35,
    // Each consecutive ride raises the ceiling: 3.4, 3.75, 4.1, capped at 4.45.
    // Measured streaks reach 3, so the top of the ramp is reachable in play
    // rather than theoretical. This is the "small bumps then big bumps" half —
    // before it, every ride was identical no matter how well the orbit was held.
    escalation: 0.35,
    escalationMax: 4.45,
    streakWindow: 1.2,
    releaseInward: 0.85,
  },
  // The rail already throws tops across the dish on a bearing the rider does
  // not fully choose, so a graded exit gives that slingshot something to aim
  // at. Pocket 0 sits at POCKET_OFFSET = 45 degrees.
  finishPocket: 0,
};

export const SPIKE_PIT: ArenaSpec = {
  id: 'spikepit',
  look: { dish: 0xf0dcd6, wall: 0xf7ece8, ridge: 0xd4644e, guide: 0xdcb6a8, post: 0xb8342a },
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
  look: { dish: 0xd9d3e8, wall: 0xe9e4f4, ridge: 0x8b6fd0, guide: 0xbdb2da, post: 0x6d3fc4 },
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
    duration: 0.3,
    cooldown: 0.5,
    // Shallower escalation than the X-Rail's: the Gauntlet already taxes the
    // middle, so a top driven to the wall by the pit should not also be handed
    // the steepest ramp in the game for going there.
    escalation: 0.22,
    escalationMax: 3.6,
    streakWindow: 1.1,
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
  look: { dish: 0xd6e8dd, wall: 0xeaf4ee, ridge: 0x3fa06a, guide: 0xb2d4c0, post: 0x2f8f5c },
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
  look: { dish: 0xe8e4d8, wall: 0xf5f2e9, ridge: 0xb99a4a, guide: 0xd2c9ae, post: 0x9a7a2c },
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

/**
 * Three Sides Safe — every exit on one wall, straight from BX-10.
 *
 * Two "Over Zone" pockets flanking a central "Xtreme Zone" worth more, all
 * within a 90° arc, and solid wall everywhere else. The rest of the dish
 * becomes genuinely safe ground, so position stops being a consequence and
 * starts being a decision: there is a direction you want your opponent facing
 * and three quarters of the floor where a shove achieves nothing.
 *
 * The graded pocket is index 1 — the middle of the three, as on the real
 * stadium, so the best exit is also the hardest to line up.
 *
 * NOT balance-swept. Clustering exits is a large change to knockout rates and
 * this ships as a floor to play rather than a tuned one; ARENA-IDEAS.md E2
 * flagged it as needing the full preset sweep and that is still true.
 */
export const THREE_SIDES: ArenaSpec = {
  id: 'threesides',
  look: { dish: 0xdcdfe6, wall: 0xf0f2f6, ridge: 0x4a5570, guide: 0xbcc3d2, post: 0x3d4863 },
  name: 'Three Sides Safe',
  blurb: 'every exit on one wall — the rest of the floor is safe',
  suggestedTheme: 'anime',
  rail: null,
  // 60°, 90°, 120° — a 60° spread, tight enough that the safe arc dominates.
  pockets: [Math.PI / 3, Math.PI / 2, (2 * Math.PI) / 3],
  finishPocket: 1,
};

/**
 * Crater — the only floor in the game that is not radially symmetric.
 *
 * Built from a measurement rather than an idea. Across all seven other arenas
 * the two tops spend roughly half of every round adjacent without resolving,
 * and only the ones with a rail break it. The rail works because it acts on ONE
 * top at a time; everything else here is radially symmetric, so both tops meet
 * identical forces at the same radius and stay phase-locked.
 *
 * So: put the hazard somewhere other than the middle. Two tops at the same
 * radius but different bearings now sit on different floors — one over the
 * crater, one over clean dish — and drift apart in phase without a rail.
 *
 * The pit is wide and shallow rather than the Spike Pit's narrow bite. A
 * deep off-centre well would just be a second exit; a broad soft one is a
 * region of the floor you would rather your opponent were in, which is the
 * geography this dish has never had.
 */
/**
 * Crater — an off-centre current, and the only floor here that is not radially
 * symmetric.
 *
 * Built from a measurement. Across every other arena the two tops spend roughly
 * half of each round adjacent without resolving, and only the ones with a rail
 * break it. The rail works because it acts on ONE top at a time; everything
 * else here is radially symmetric, so both tops meet identical forces at the
 * same radius and stay phase-locked.
 *
 * The build took three attempts and the first two failed, which is worth
 * carrying because it narrows what "geography" can do in this sim:
 *
 *     off-centre spin drain      48.8%   no change — a drain is not a trajectory
 *     off-centre outward push    54.3%   WORSE — moves both tops out together
 *     off-centre tangential      44.7%   the best rail-less floor measured
 *
 * Against a plain dish's 48.9% and the X-Rail's 35.8%. So the current helps and
 * does not solve: it is worth four points of adjacency and costs about three
 * tenths of a second of round length. Both honest, neither tuned away.
 *
 * A drain cannot desynchronise two tops because spin is not a trajectory: two
 * tops on identical orbits stay on identical orbits however much spin one
 * loses. An outward shove fails for the opposite reason — it acts on both of
 * them the same way. Only changing a top's BEARING works, which is precisely
 * what the rail does when it drives tangentially and releases inward.
 *
 * So this is a swirling current in an off-centre well: a top that crosses it
 * comes out pointed somewhere else.
 */
export const CRATER: ArenaSpec = {
  id: 'crater',
  name: 'Crater',
  blurb: 'an off-centre current — cross it and you come out pointed elsewhere',
  suggestedTheme: 'anime',
  rail: null,
  pit: {
    radius: 0.34,
    // Light, because the current is the mechanic here and the drain is
    // flavour. The Spike Pit bites at 12; this taxes at half that.
    drain: 6,
    grace: 0.6,
    // A QUARTER OUT, not halfway. The first version sat at 0.42 with a 0.46
    // radius, which put its far edge where the bowl climbs steeply — and the
    // hazard is a flat disc displaced to follow the floor, so at that radius it
    // warped into a swooping ribbon instead of reading as a circular zone.
    // Inboard, where the bowl is shallow, it stays a crater.
    offset: 0.26,
    offsetAngle: Math.PI * 0.25,
    push: 6.0,
  },
  look: { dish: 0xe3dbd2, wall: 0xf4efe9, ridge: 0x9a6b4a, guide: 0xcdbcae, post: 0x8a4b2a },
};

export const ARENAS: ArenaSpec[] = [
  STANDARD,
  XRAIL,
  SPIKE_PIT,
  GAUNTLET,
  SUDDEN_DEATH,
  TIGHT_DISH,
  THREE_SIDES,
  CRATER,
];

export const arenaById = (id: string): ArenaSpec =>
  ARENAS.find((a) => a.id === id) ?? STANDARD;
