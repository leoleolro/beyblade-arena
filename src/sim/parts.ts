import type {
  Archetype,
  BeyBuild,
  BeyStats,
  DiscPart,
  DriverPart,
  LayerPart,
} from './types';

/**
 * Part catalog.
 *
 * Design rule, learned the hard way from the balance sweep: stats multiply
 * across the three slots, so a part that is above average on *both*
 * survivability axes (spinRetention and burstResist) lets a build compound into
 * something unbeatable. Every part is therefore strong on at most two axes and
 * clearly weak on at least one.
 *
 * The intended triangle:
 *   attack  beats stamina — stamina tops are light and poorly defended
 *   stamina beats defense — defense can't finish anyone before its spin runs out
 *   defense beats attack  — attack burns itself out against a wall
 */

export const LAYERS: LayerPart[] = [
  // Attack: hits hard, folds fast.
  { id: 'valtryek',  name: 'Valtryek',  kind: 'layer', archetype: 'attack',  mass: 0.42, radius: 0.1066, attack: 1.42, defense: 0.80, burstResist: 0.88, spinSteal: 0.0, blades: 3, colour: 0x3b82f6 },
  { id: 'ragnaruk',  name: 'Ragnaruk',  kind: 'layer', archetype: 'attack',  mass: 0.50, radius: 0.1144, attack: 1.58, defense: 0.68, burstResist: 1.02, spinSteal: 0.0, blades: 2, colour: 0xf59e0b },
  // Balance: no strong edge, no glaring hole.
  { id: 'spryzen',   name: 'Spryzen',   kind: 'layer', archetype: 'balance', mass: 0.46, radius: 0.1027, attack: 1.10, defense: 0.98, burstResist: 0.95, spinSteal: 0.0, blades: 4, colour: 0xef4444 },
  { id: 'luinor',    name: 'Luinor',    kind: 'layer', archetype: 'balance', mass: 0.48, radius: 0.1053, attack: 1.18, defense: 0.94, burstResist: 0.96, spinSteal: 0.12, blades: 5, colour: 0x06b6d4 },
  // Stamina: outlasts everything, but light and soft — attackers eat it.
  { id: 'fafnir',    name: 'Fafnir',    kind: 'layer', archetype: 'stamina', mass: 0.40, radius: 0.0988, attack: 0.74, defense: 1.00, burstResist: 1.18, spinSteal: 0.62, blades: 6, colour: 0x22c55e },
  // Defense: a wall that cannot finish anyone.
  { id: 'aegis',     name: 'Aegis',     kind: 'layer', archetype: 'defense', mass: 0.54, radius: 0.1092, attack: 0.68, defense: 1.55, burstResist: 1.26, spinSteal: 0.0, blades: 8, colour: 0xa855f7 },

  // The player-designed line. Stats sit close to the archetype anchors above —
  // these exist for their looks (see beydex.ts), and giving them novel numbers
  // would reopen a balance question the anchors already answered. Deliberately
  // NOT in the AI's PRESETS pool: the ladder rivals keep their identities, and
  // the pacing/balance suites sweep PRESETS, so the sim's measured behaviour is
  // untouched by their existence.
  { id: 'crossx',    name: 'Cross X',   kind: 'layer', archetype: 'attack',  mass: 0.44, radius: 0.1080, attack: 1.45, defense: 0.79, burstResist: 0.90, spinSteal: 0.0, blades: 3, colour: 0x1d4fd8 },
  { id: 'phoenix',   name: 'Phoenix',   kind: 'layer', archetype: 'attack',  mass: 0.46, radius: 0.1060, attack: 1.32, defense: 0.86, burstResist: 0.98, spinSteal: 0.0, blades: 3, colour: 0xc01822 },
  { id: 'leon',      name: 'Leon',      kind: 'layer', archetype: 'defense', mass: 0.55, radius: 0.1080, attack: 0.82, defense: 1.46, burstResist: 1.24, spinSteal: 0.0, blades: 3, colour: 0xc7ccd2 },
  { id: 'drake',     name: 'Drake',     kind: 'layer', archetype: 'balance', mass: 0.47, radius: 0.1000, attack: 1.08, defense: 1.00, burstResist: 1.02, spinSteal: 0.0, blades: 3, colour: 0x2a3f9f },
];

export const DISCS: DiscPart[] = [
  { id: 'heavy',   name: 'Heavy',   kind: 'disc', mass: 0.62, stability: 1.25, spinRetention: 0.92, colour: 0x94a3b8 },
  { id: 'gravity', name: 'Gravity', kind: 'disc', mass: 0.55, stability: 1.08, spinRetention: 0.96, colour: 0xcbd5e1 },
  { id: 'spread',  name: 'Spread',  kind: 'disc', mass: 0.44, stability: 0.84, spinRetention: 1.18, colour: 0xfbbf24 },
  { id: 'blitz',   name: 'Blitz',   kind: 'disc', mass: 0.42, stability: 0.74, spinRetention: 0.95, colour: 0xf87171 },
  { id: 'wall',    name: 'Wall',    kind: 'disc', mass: 0.72, stability: 1.42, spinRetention: 0.90, colour: 0x64748b },
];

export const DRIVERS: DriverPart[] = [
  { id: 'xtreme',   name: 'Xtreme',   kind: 'driver', archetype: 'attack',  mass: 0.20, friction: 0.55, spinRetention: 0.85, wander: 1.55, burstResist: 0.92 },
  { id: 'volcanic', name: 'Volcanic', kind: 'driver', archetype: 'attack',  mass: 0.18, friction: 0.42, spinRetention: 0.95, wander: 1.85, burstResist: 0.85 },
  { id: 'atomic',   name: 'Atomic',   kind: 'driver', archetype: 'balance', mass: 0.24, friction: 0.82, spinRetention: 1.02, wander: 0.55, burstResist: 0.95 },
  { id: 'orbit',    name: 'Orbit',    kind: 'driver', archetype: 'stamina', mass: 0.22, friction: 0.70, spinRetention: 1.35, wander: 0.18, burstResist: 0.82 },
  { id: 'needle',   name: 'Needle',   kind: 'driver', archetype: 'stamina', mass: 0.19, friction: 0.50, spinRetention: 1.42, wander: 0.06, burstResist: 1.15 },
  { id: 'bastion',  name: 'Bastion',  kind: 'driver', archetype: 'defense', mass: 0.30, friction: 1.35, spinRetention: 0.95, wander: 0.10, burstResist: 1.30 },
];

const byId = <T extends { id: string }>(list: T[], id: string): T => {
  const found = list.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown part id: ${id}`);
  return found;
};

export const layer = (id: string): LayerPart => byId(LAYERS, id);
export const disc = (id: string): DiscPart => byId(DISCS, id);
export const driver = (id: string): DriverPart => byId(DRIVERS, id);

export function makeBuild(layerId: string, discId: string, driverId: string): BeyBuild {
  return { layer: layer(layerId), disc: disc(discId), driver: driver(driverId) };
}

/** Collapse a build into the flat numbers the physics step actually reads. */
export function deriveStats(build: BeyBuild): BeyStats {
  const { layer: l, disc: d, driver: dr } = build;
  return {
    mass: l.mass + d.mass + dr.mass,
    radius: l.radius,
    attack: l.attack,
    defense: l.defense * d.stability,
    burstResist: l.burstResist * dr.burstResist,
    spinSteal: l.spinSteal,
    friction: dr.friction,
    spinRetention: dr.spinRetention * d.spinRetention,
    stability: d.stability,
    wander: dr.wander,
  };
}

/**
 * Overall archetype of a build, used by the AI and the UI. The layer leads;
 * the driver breaks ties.
 */
export function buildArchetype(build: BeyBuild): Archetype {
  return build.layer.archetype === build.driver.archetype
    ? build.layer.archetype
    : 'balance';
}

/** A reasonable starting loadout. */
export const DEFAULT_BUILD = (): BeyBuild => makeBuild('valtryek', 'gravity', 'atomic');

/** Preset builds the AI picks from. */
export const PRESETS: { name: string; build: () => BeyBuild }[] = [
  { name: 'Blitz Striker', build: () => makeBuild('ragnaruk', 'blitz', 'volcanic') },
  { name: 'Iron Bastion', build: () => makeBuild('aegis', 'wall', 'bastion') },
  { name: 'Endless Coil', build: () => makeBuild('fafnir', 'spread', 'needle') },
  { name: 'Storm Breaker', build: () => makeBuild('valtryek', 'heavy', 'xtreme') },
  { name: 'Twin Fang', build: () => makeBuild('luinor', 'gravity', 'atomic') },
  { name: 'Crimson Edge', build: () => makeBuild('spryzen', 'heavy', 'orbit') },
];
