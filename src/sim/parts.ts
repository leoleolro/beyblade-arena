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

  // TRANSCRIBED FROM THE WIKI, not from the type conventions — these six carry
  // their source beyblade's own documented numbers rather than sitting on the
  // archetype anchors like the invented line above.
  //
  // The mapping, stated so it is reproducible rather than magic. Each source
  // entry publishes a stat spread out of 100 (A/D/S) and a weight in grams:
  //
  //     attack       0.60 + A/100 * 1.60
  //     defense      0.60 + D/100 * 1.80
  //     burstResist  0.86 + S/100 * 0.60
  //     mass         0.44 + (grams - 31.8) / (40.7 - 31.8) * 0.13
  //     radius       0.1000 + S/100 * 0.0130, less 0.0020 for defence
  //
  // The last two encode the two weight-distribution rules the sources state
  // outright: stamina blades use OUTWARD weight distribution ("two large blades
  // create an outward center of gravity, which generates strong centrifugal
  // force"), so a high-stamina blade is WIDER; defence blades use CENTRAL
  // distribution, so they are narrower for the same mass.
  //
  // Sources: BlackShell 4-60D (Defense, 40.7 g, "overall diamond shape with
  // eight protrusions"), SharkEdge (A60/D25/S15, 34.5 g, two keel fins),
  // KnightShield (A20/D55/S25, 32.4 g, "six defensive blades create an impact
  // dampening structure"), WizardRod (A15/D25/S60, 35.3 g, "wide circular
  // shape"), HellsScythe (Balance, 4 blades), SphinxCowl (A35/D55/S10, 32.7 g,
  // nine "Barrage Blade" protrusions).
  { id: 'blackshell', name: 'Black Shell',    kind: 'layer', archetype: 'defense', mass: 0.57, radius: 0.0999, attack: 1.0, defense: 1.68, burstResist: 0.95, spinSteal: 0.0, blades: 8, colour: 0x14181f },
  { id: 'sharkedge',  name: 'Shark Edge',     kind: 'layer', archetype: 'attack', mass: 0.479, radius: 0.1019, attack: 1.56, defense: 1.05, burstResist: 0.95, spinSteal: 0.0, blades: 2, colour: 0x5b21b6 },
  { id: 'knightshield',name: 'Knight Shield',  kind: 'layer', archetype: 'defense', mass: 0.449, radius: 0.1013, attack: 0.92, defense: 1.59, burstResist: 1.01, spinSteal: 0.0, blades: 6, colour: 0x046c4a },
  { id: 'wizardrod',  name: 'Wizard Rod',     kind: 'layer', archetype: 'stamina', mass: 0.491, radius: 0.1078, attack: 0.84, defense: 1.05, burstResist: 1.22, spinSteal: 0.0, blades: 5, colour: 0x3b2f7a },
  { id: 'hellsscythe',name: 'Hells Scythe',   kind: 'layer', archetype: 'balance', mass: 0.487, radius: 0.1033, attack: 1.24, defense: 1.23, burstResist: 1.01, spinSteal: 0.0, blades: 4, colour: 0x7f1d1d },
  { id: 'sphinxcowl', name: 'Sphinx Cowl',    kind: 'layer', archetype: 'defense', mass: 0.453, radius: 0.0993, attack: 1.16, defense: 1.59, burstResist: 0.92, spinSteal: 0.0, blades: 9, colour: 0x8a6a2f },

  // ORICHALCUM O3 — Stamina, and the layer half of the first WHOLE bey
  // transcribed here: Layer, Disc and Driver all from one documented product.
  // Burst-era rather than Beyblade X, which is why its parts are a Disc and a
  // Driver rather than a Ratchet and a Bit.
  { id: 'orichalcum', name: 'Orichalcum', kind: 'layer', archetype: 'stamina', mass: 0.475, radius: 0.1118, attack: 0.84, defense: 1.14, burstResist: 1.28, spinSteal: 0.0, blades: 3, colour: 0xc9a227 },

  // Four more transcriptions, chosen to push the archetype range rather than
  // fill it in. DranBuster is the attack ceiling at A70 and the roster's only
  // ONE-blade top; SilverWolf is the stamina ceiling at S65; RhinoHorn is a
  // defender that buys its defence from shape rather than mass at 32.7 g;
  // LeonClaw states balance numerically with attack and defence exactly equal.
  // Same mapping as the block above.
  { id: 'dranbuster', name: 'Dran Buster',    kind: 'layer', archetype: 'attack', mass: 0.509, radius: 0.1013, attack: 1.72, defense: 0.96, burstResist: 0.92, spinSteal: 0.0, blades: 1, colour: 0x1e40af },
  { id: 'rhinohorn',  name: 'Rhino Horn',     kind: 'layer', archetype: 'defense', mass: 0.453, radius: 0.1019, attack: 0.92, defense: 1.5, burstResist: 1.04, spinSteal: 0.0, blades: 5, colour: 0x374151 },
  { id: 'silverwolf', name: 'Silver Wolf',    kind: 'layer', archetype: 'stamina', mass: 0.513, radius: 0.1085, attack: 0.84, defense: 1.14, burstResist: 1.25, spinSteal: 0.0, blades: 3, colour: 0x475569 },
  { id: 'leonclaw',   name: 'Leon Claw',      kind: 'layer', archetype: 'balance', mass: 0.434, radius: 0.1026, attack: 1.24, defense: 1.32, burstResist: 0.98, spinSteal: 0.0, blades: 4, colour: 0x9a3412 },

  // Two more, both chosen for a shape the roster lacked. TyrannoBeat is attack
  // with real defence and almost no stamina (S5, the lowest in the data);
  // ViperTail is stamina that can actually hit (A30, twice the other stamina
  // blades) — the archetype's most playable shape in this sim, and one the
  // source supplies rather than one invented to patch the measured gap.
  { id: 'tyrannobeat',name: 'Tyranno Beat',   kind: 'layer', archetype: 'attack', mass: 0.516, radius: 0.1007, attack: 1.64, defense: 1.14, burstResist: 0.89, spinSteal: 0.0, blades: 4, colour: 0x166534 },
  { id: 'vipertail',  name: 'Viper Tail',     kind: 'layer', archetype: 'stamina', mass: 0.482, radius: 0.1065, attack: 1.08, defense: 0.96, burstResist: 1.16, spinSteal: 0.0, blades: 3, colour: 0x3f6212 },
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

  // OUTER — the first disc transcribed from a real part rather than invented.
  //
  // Source: beyblade.fandom.com/wiki/Orichalcum_O3_Outer_Octa. "Outer features
  // a wide, almost perfectly circular shape with large gaps separating the
  // center from the edge, these gaps are meant to increase Outward Weight
  // Distribution (OWD) to increase Stamina while the circular perimeter
  // increases Life-After-Death. Outer boasts the highest Stamina and
  // Life-After-Death in the game... while not presenting the same Burst risk
  // as [Cross/Glaive combinations] due to its weight."
  //
  // Every number below is that paragraph:
  //   spinRetention 1.32  "highest Stamina in the game" — beats Spread's 1.18,
  //                       which was the previous ceiling
  //   mass 0.66           heavy, which is what the source credits for its LOW
  //                       burst risk; it is not a light stamina disc
  //   stability 1.15      the circular perimeter, which is what Life-After-Death
  //                       actually describes: staying upright once spin is gone
  //
  // The interesting part is that these do not point the same way. It is the
  // best stamina disc AND a heavy one, which in this sim's terms is a genuinely
  // strong combination rather than a trade-off — matching the source, which
  // calls it outclassing.
  { id: 'outer',   name: 'Outer',   kind: 'disc', mass: 0.66, stability: 1.15, spinRetention: 1.32, colour: 0xb0b6bd },

  // THE BEYBLADE X RATCHET CATALOGUE, transcribed with published stat blocks.
  //
  // The naming system is the data: `4-60` is four protrusions at 6.0 mm. Both
  // numbers are carried on the part, because the blade/ratchet alignment rule
  // needs the count — see DiscPart.protrusions.
  //
  // Published stats (Attack / Defense / Stamina) and grams:
  //
  //     1-60   6.0 g   17 /  9 /  4     fewest protrusions, most attack
  //     3-60   6.4 g   15 /  9 /  6
  //     4-60   6.3 g   11 / 13 /  6     the defence peak
  //     5-60   6.6 g   12 /  9 /  9     the stamina peak
  //     9-80   6.9 g   13 / 10 /  7     tallest, most protrusions
  //
  // The pattern is legible and worth stating: FEWER protrusions concentrate
  // contact and score attack; MORE spread it and score stamina; four is the
  // defence sweet spot. Taller ratchets weigh more and trade defence for
  // stamina, because height moves mass away from the floor.
  //
  // Mapping onto this sim:
  //     mass           0.40 + (grams - 6.0) / 1.1 * 0.34
  //     stability      0.70 + defense / 13 * 0.75
  //     spinRetention  0.88 + stamina /  9 * 0.32
  { id: 'r160', name: '1-60', kind: 'disc', mass: 0.40, stability: 0.92, spinRetention: 1.02, colour: 0xd6dbe2, protrusions: 1, heightMm: 6.0 },
  { id: 'r360', name: '3-60', kind: 'disc', mass: 0.52, stability: 0.92, spinRetention: 1.09, colour: 0xc7ced7, protrusions: 3, heightMm: 6.0 },
  { id: 'r460', name: '4-60', kind: 'disc', mass: 0.49, stability: 1.45, spinRetention: 1.09, colour: 0xb8c1cc, protrusions: 4, heightMm: 6.0 },
  { id: 'r560', name: '5-60', kind: 'disc', mass: 0.59, stability: 0.92, spinRetention: 1.20, colour: 0xaab5c2, protrusions: 5, heightMm: 6.0 },
  { id: 'r980', name: '9-80', kind: 'disc', mass: 0.68, stability: 1.28, spinRetention: 1.13, colour: 0x9ba7b6, protrusions: 9, heightMm: 8.0 },
];

/**
 * True when a blade's contact-point count matches a ratchet's protrusion count.
 *
 * The real design rule, stated on SphinxCowl: its nine "Barrage Blade"
 * protrusions are "intended to align with the 9 protrusions of the 9-80
 * Ratchet". A matched pair stacks into one coherent silhouette; a mismatched
 * one reads as two unrelated rims.
 *
 * Purely cosmetic advice — it returns a fact, and nothing in the sim consumes
 * it. Kept deliberately inert: making alignment grant a stat would invent a
 * mechanic the source does not describe, and the roster's stats are supposed to
 * come from published numbers rather than from rules invented here.
 */
export function alignsWith(layer: LayerPart, disc: DiscPart): boolean {
  return disc.protrusions !== undefined && disc.protrusions === layer.blades;
}

export const DRIVERS: DriverPart[] = [
  { id: 'xtreme',   name: 'Xtreme',   kind: 'driver', archetype: 'attack',  mass: 0.20, friction: 0.55, spinRetention: 0.85, wander: 1.55, burstResist: 0.92, railGrip: 0.80 },
  { id: 'volcanic', name: 'Volcanic', kind: 'driver', archetype: 'attack',  mass: 0.18, friction: 0.42, spinRetention: 0.95, wander: 1.85, burstResist: 0.85, railGrip: 0.85 },
  { id: 'atomic',   name: 'Atomic',   kind: 'driver', archetype: 'balance', mass: 0.24, friction: 0.82, spinRetention: 1.02, wander: 0.55, burstResist: 0.95, railGrip: 0.55 },
  { id: 'orbit',    name: 'Orbit',    kind: 'driver', archetype: 'stamina', mass: 0.22, friction: 0.70, spinRetention: 1.35, wander: 0.18, burstResist: 0.82, railGrip: 0.25 },
  { id: 'needle',   name: 'Needle',   kind: 'driver', archetype: 'stamina', mass: 0.19, friction: 0.50, spinRetention: 1.42, wander: 0.06, burstResist: 1.15, railGrip: 0.25 },
  { id: 'bastion',  name: 'Bastion',  kind: 'driver', archetype: 'defense', mass: 0.30, friction: 1.35, spinRetention: 0.95, wander: 0.10, burstResist: 1.30, railGrip: 0.25 },

  // OCTA — a documented TRAP, transcribed rather than balanced.
  //
  // Source: the same page. "Octa is a driver with an octagonal metal piece and
  // 4 holes and an octagonal shaped pattern that it expands into a dome. The
  // metal piece will make it one of the heaviest drivers implying Knock-Out
  // Resistance. Near Octa's spring lock, there are bumps, which increase
  // friction on the burst locks causing Burst Resistance."
  //
  // And then, in the same entry, three drawbacks: "the heavy weight decreases
  // Octa's Burst Resistance as a trade-off"; it "lacks behind Atomic for
  // Life-After-Death due to the octagonal design which nullifies
  // Life-After-Death"; and "due to segments on Octa, the tip has poor stamina".
  // The source's verdict: "Despite being a rare item, Octa is useless for
  // tournament play."
  //
  // So it ships as the heaviest driver in the game with the WORST spin
  // retention, and that is deliberate. A parts list where every option is
  // viable is a parts list with no decisions in it; a real catalogue contains
  // items that look impressive and lose, and the reason this one loses is
  // written down and checkable rather than a stealth nerf.
  //
  //   mass 0.34            heaviest, above Bastion — the metal piece
  //   friction 1.10        the dome, high but under Bastion's flat 1.35
  //   spinRetention 0.74   worst in the catalogue — "the tip has poor stamina"
  //   wander 0.12          octagonal segments do not chase
  //   burstResist 1.08     bumps help, weight hurts; the source says both
  { id: 'octa',     name: 'Octa',     kind: 'driver', archetype: 'defense', mass: 0.34, friction: 1.10, spinRetention: 0.74, wander: 0.12, burstResist: 1.08, railGrip: 0.25 },

  // THE BEYBLADE X BIT CATALOGUE, transcribed with its published stat blocks.
  //
  // The wiki gives every Bit five axes — Attack / Defense / Stamina / Dash /
  // Burst Resistance — out of 100 each. The mapping onto this sim, written down
  // so it is reproducible:
  //
  //     mass           0.16 + (grams - 2.0) / 0.6 * 0.14
  //     wander         0.06 + (attack / 50)^2 * 1.80  aggressive tips roam
  //     friction       0.40 + defense / 100 * 2.00    grippy tips hold position
  //     spinRetention  0.75 + stamina / 100 * 1.40
  //     burstResist    0.75 + burst / 100 * 0.70
  //     railGrip       dash / 40                      1.0 at the catalogue's max
  //
  // WANDER IS SQUARED, and that was a bug worth recording. The first mapping
  // was linear in attack, which gave Ball — a STAMINA bit, attack 15 — a wander
  // of 0.60, three times our own stamina drivers at 0.06-0.18. A stamina tip
  // that roams goes to the rim and gets knocked out, and Silver Wolf on Ball
  // measured a 12.2% win rate against the AI preset pool. Squaring the term
  // keeps the attack tips aggressive while collapsing the low end to where
  // stamina tips actually sit.
  //
  // The burst axis is the one worth pausing on, because it inverts what you
  // would guess: attack Bits score 80 and stamina Bits 30. A flat tip's wide
  // contact grips the burst locks; a sharp stamina tip does not. Transcribed
  // rather than "corrected", because the source is consistent about it across
  // every entry.
  { id: 'gearflat', name: 'Gear Flat', kind: 'driver', archetype: 'attack',  mass: 0.23, friction: 0.50, spinRetention: 0.82, wander: 1.86, burstResist: 1.31, railGrip: 1.00 },
  { id: 'accel',    name: 'Accel',    kind: 'driver', archetype: 'attack',  mass: 0.30, friction: 0.60, spinRetention: 0.89, wander: 1.21, burstResist: 1.31, railGrip: 1.00 },
  { id: 'rush',     name: 'Rush',     kind: 'driver', archetype: 'attack',  mass: 0.18, friction: 0.60, spinRetention: 1.03, wander: 1.21, burstResist: 1.31, railGrip: 0.75 },
  { id: 'ball',     name: 'Ball',     kind: 'driver', archetype: 'stamina', mass: 0.18, friction: 0.90, spinRetention: 1.45, wander: 0.22, burstResist: 0.96, railGrip: 0.25 },
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
    // The Dash stat. Defaults from the archetype for drivers authored before
    // the axis existed, so nothing silently gets zero grip and quietly loses
    // access to the rail.
    railGrip: dr.railGrip ?? (dr.archetype === 'attack' ? 0.8 : 0.3),
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
