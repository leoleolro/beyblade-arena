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

  // Six more of the player-designed line, built from the real type conventions
  // researched in docs/PHYSICS.md rather than invented: attack clusters at 2-4
  // large blades and is the heaviest class; defence runs 5-9 small points with
  // CENTRAL weight (hence the smaller radius); stamina goes near-circular with
  // OUTWARD weight (hence the larger one, moment of inertia going as r^2);
  // balance is signalled by a heterogeneous rim rather than by average numbers.
  //
  // Stats still sit on the archetype anchors above. These exist for their
  // looks, and novel numbers would reopen a balance question the anchors have
  // already answered — same reasoning as the four entries above this comment.
  { id: 'tempest',   name: 'Tempest',   kind: 'layer', archetype: 'attack',  mass: 0.46, radius: 0.1085, attack: 1.48, defense: 0.74, burstResist: 0.88, spinSteal: 0.0, blades: 2, colour: 0x2563eb },
  { id: 'basilisk',  name: 'Basilisk',  kind: 'layer', archetype: 'stamina', mass: 0.50, radius: 0.1105, attack: 0.78, defense: 1.06, burstResist: 1.14, spinSteal: 0.0, blades: 5, colour: 0xf59e0b },
  { id: 'golem',     name: 'Golem',     kind: 'layer', archetype: 'defense', mass: 0.56, radius: 0.1035, attack: 0.74, defense: 1.58, burstResist: 1.30, spinSteal: 0.0, blades: 8, colour: 0x16a34a },
  { id: 'wyrm',      name: 'Wyrm',      kind: 'layer', archetype: 'attack',  mass: 0.45, radius: 0.1070, attack: 1.40, defense: 0.82, burstResist: 0.93, spinSteal: 0.0, blades: 4, colour: 0x9f1239 },
  { id: 'solaris',   name: 'Solaris',   kind: 'layer', archetype: 'balance', mass: 0.48, radius: 0.1045, attack: 1.10, defense: 1.02, burstResist: 1.04, spinSteal: 0.0, blades: 3, colour: 0xdc2626 },
  { id: 'chimera',   name: 'Chimera',   kind: 'layer', archetype: 'balance', mass: 0.49, radius: 0.1050, attack: 1.02, defense: 1.10, burstResist: 1.06, spinSteal: 0.0, blades: 6, colour: 0x7c3aed },

  // The imported line — Legendary. These carry real 3D models (see
  // topModelIndex.ts) and exist because a modelled top reads differently from
  // anything the procedural builder makes. Stats still sit on the archetype
  // anchors: an imported model must not be a stronger bey, only a different
  // looking one, or the class becomes a power tier by accident.
  { id: 'dransword', name: 'Dran Sword', kind: 'layer', archetype: 'attack',  mass: 0.46, radius: 0.1075, attack: 1.44, defense: 0.78, burstResist: 0.92, spinSteal: 0.0, blades: 3, colour: 0x1e3a8a },
  { id: 'valkyrie',  name: 'Valkyrie',   kind: 'layer', archetype: 'attack',  mass: 0.45, radius: 0.1065, attack: 1.38, defense: 0.84, burstResist: 0.96, spinSteal: 0.0, blades: 3, colour: 0x1d4ed8 },
  { id: 'magejab',   name: 'Mage Jab',   kind: 'layer', archetype: 'stamina', mass: 0.49, radius: 0.1090, attack: 0.80, defense: 1.08, burstResist: 1.12, spinSteal: 0.0, blades: 5, colour: 0x6d28d9 },
  { id: 'dsycther',  name: 'Dsycther',   kind: 'layer', archetype: 'balance', mass: 0.52, radius: 0.1040, attack: 1.06, defense: 1.14, burstResist: 1.08, spinSteal: 0.0, blades: 4, colour: 0x334155 },

  // The vampire. The one layer in the catalog with `sameSteal`: it absorbs in
  // *every* matchup, not only against an opposite-spin opponent, so there is no
  // launch that denies it its mechanic (see constants.ts, spin steal).
  //
  // Turning Fafnir's dial up cannot produce this, which is why the mechanic had
  // to widen rather than the number. Measured on this exact stat line with
  // sameSteal off, spinSteal 0.62 / 0.88 / 1.00 scores 39.6% / 39.8% / 39.4%
  // on spread/needle and 45.2% / 48.1% / 48.5% on wall/bastion — a flat dial,
  // because SPIN_STEAL_MITIGATION saturates at 45% and SPIN_STEAL_GAIN scales
  // off the absorber's own (deliberately low) attack. Opening the same-spin
  // matchup instead moves it four times as far: sameSteal 0 / 0.30 / 0.60 /
  // 1.00 gives 48.1% / 56.7% / 62.9% / 63.7% on wall/bastion. 0.30 is the
  // largest value that still lands under the catalog's existing peak.
  //
  // The price is burstResist 0.88, the softest in the catalog. Absorption is
  // spin-only — physics.ts adds burst charge *after* the steal maths and steal
  // never touches it — so the answer to a top whose spin keeps climbing is to
  // stop playing the spin game and burst it. That is measured, not asserted:
  // over 480 fights against the six anchors, nosferu/wall/bastion loses 70.2%
  // of its losses to burst against fafnir/wall/bastion's 38.3%. attack 0.80
  // keeps it from also being the thing that kills you: it wins by outlasting,
  // never by hitting.
  //
  // Out of PRESETS for the same reason as the line above: the rivals keep their
  // identities and the pacing/balance suites keep sweeping the six anchors, so
  // the sim's measured behaviour is unchanged by this layer existing. Swept
  // against all six anyway, every disc x driver, 80 seeds a pairing: best
  // nosferu/wall/bastion 56.7%, worst nosferu/blitz/xtreme 21.5%. That ceiling
  // is under the existing legal peak (fafnir/wall/bastion 59.2%) and the spread
  // is the tightest in the catalog — the same grid gives luinor 20.2–89.2%,
  // valtryek 19.6–90.4%, fafnir 16.9–69.4%, aegis 7.1–71.5%.
  //
  // Spin direction still decides the fight, which is the point of keeping the
  // same-spin rate at 0.30 rather than 1.0: same-spin it absorbs 9.9% of its
  // launch spin per fight and wins 39.4%; opposite-spin, 34.2% and 70.0%.
  { id: 'nosferu',   name: 'Nosferu',   kind: 'layer', archetype: 'stamina', mass: 0.40, radius: 0.1020, attack: 0.80, defense: 0.90, burstResist: 0.88, spinSteal: 0.88, sameSteal: 0.30, blades: 6, colour: 0x9b1c3c },
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
    sameSteal: l.sameSteal ?? 0,
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
