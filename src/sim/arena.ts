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

export interface ArenaSpec {
  id: string;
  name: string;
  blurb: string;
  /** Which visual theme suits it. The player can still override. */
  suggestedTheme: string;
  rail: RailSpec | null;
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
  suggestedTheme: 'beam',
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
};

export const ARENAS: ArenaSpec[] = [STANDARD, XRAIL];

export const arenaById = (id: string): ArenaSpec =>
  ARENAS.find((a) => a.id === id) ?? STANDARD;
