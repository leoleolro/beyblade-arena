import type { Vec2 } from './math';

/** The three slots that make up a top. */
export type PartKind = 'layer' | 'disc' | 'driver';

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
  friction: number;
  spinRetention: number;
  stability: number;
  wander: number;
}

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
  /** Boost charge in [0, 1]. At 1 the player may spend it. */
  meter: number;
  /** Seconds of boost remaining. Above 0 the top hunts and hits harder. */
  boost: number;
}

/** How a round ended. */
export interface RoundResult {
  winnerId: string | null;
  loserId: string | null;
  /** 'draw' means every top went out on the same step; 'timeout' is the clock. */
  reason: Defeat | 'timeout' | 'draw';
  points: number;
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
}
