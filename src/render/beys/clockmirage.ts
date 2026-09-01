import { clockEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * Clock Mirage — S80, the highest stamina figure in the game.
 *
 * Source: beyblade.fandom.com/wiki/Blade_-_ClockMirage. Stamina Type,
 * **A10 / D10 / S80**, 37.7 g — "a circular Stamina Type Blade with 60 edges
 * around its circumference."
 *
 * A10 AND D10 IS THE MOST LOPSIDED STATLINE IN THE CATALOGUE. Nothing else
 * gives up both other axes this completely. Through the mapping that is attack
 * 0.76 and defense 0.78 against a burst resistance of 1.34 and the widest
 * radius here at 0.1104 — a top that cannot hurt you and cannot take a hit, and
 * simply refuses to stop.
 *
 * SIXTY EDGES IS NOT DRAWABLE and this entry does not pretend otherwise. The
 * silhouette is built from `blades` lobes and sixty of them at this scale is a
 * circle with aliasing. Twelve is used, with a root of 0.95 and almost no cut,
 * so the contour reads as the near-perfect circle the count is describing. That
 * is an approximation of the SHAPE the source states, not an invented number —
 * the stats above are untouched.
 *
 * 0.30 spin absorption on "circular", the same grounds as HeavensRing and
 * GhostCircle.
 *
 * Gear Chip: "a pendulum clock representing Horologium, one of the 88
 * constellations in space" — and the blade itself is a reference to Basalt
 * Horogium 145WD from Metal Fight Beyblade, which is where the cold blue comes
 * from rather than from a colourway.
 */
export const entry: BeyEntry = {
  id: 'clockmirage',
  anime: {
    layerId: 'clockmirage',
    canonName: 'Clock Mirage',
    primary: 0x8f9bb3,
    secondary: 0x4a5b7a,
    accent: 0xc9d4e8,
    emblem: clockEmblem,
    letter: 'C',
    spinDir: 1,
    metal: true,
    chip: 'dark',
    underRing: 0x4a5b7a,
    surface: 'wave',
    blade: { root: 0.95, belly: 0.1, cut: 0.05, edge: 'wave' },
  },
  preset: {
    name: 'Clock Mirage 9-60B',
    // ClockMirage 9-65B is a real release; there is no 65 ratchet here, so 9-60
    // stands in. Ball is the real Bit, exactly.
    discId: 'r960',
    driverId: 'ball',
    spinDir: 1,
    skinId: 'frost',
  },
};
