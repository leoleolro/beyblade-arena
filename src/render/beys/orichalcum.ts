import { shieldEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * Orichalcum O3 Outer Octa — the first WHOLE beyblade transcribed here.
 *
 * Source: beyblade.fandom.com/wiki/Orichalcum_O3_Outer_Octa. Stamina Type,
 * right-spin, Hasbro, Burst System and SwitchStrike System, product code E5953,
 * released January 2019 as part of Beyblade Burst Evolution.
 *
 * WHY THIS ONE MATTERS MORE THAN ANOTHER SIX LAYERS. Every other transcription
 * in this roster took the Layer and left the Disc and Driver generic. This bey
 * exists in the parts list end to end — layer `orichalcum`, disc `outer`,
 * driver `octa` — because its page documents all three, including the reasons
 * each one performs as it does and, for the driver, the reasons it fails. See
 * sim/parts.ts for those, quoted at the entries.
 *
 * The combination is the point. `Outer` is described as the best stamina disc
 * in the game; `Octa` has "poor stamina" and is called "useless for tournament
 * play". So the canonical build pairs the strongest possible disc with a driver
 * that undoes it, which is a far more interesting thing to have in a parts
 * catalogue than another balanced option — and it is what the real product is.
 *
 * Palette from the product render: gold Layer over a silver-white core, with
 * two teal weight balls at the rim. `chip: 'sticker'` because the Burst-era
 * centre is a printed disc rather than X's recessed Gear Chip.
 */
export const entry: BeyEntry = {
  id: 'orichalcum',
  anime: {
    layerId: 'orichalcum',
    canonName: 'Orichalcum O3',
    // Gold outer, not chrome: this is a Burst layer, and the metal-blade
    // convention that governs the Beyblade X entries does not apply to it.
    primary: 0xc9a227,
    secondary: 0xd9dde2,
    accent: 0x2fb8ae,
    emblem: shieldEmblem,
    letter: 'O',
    spinDir: 1,
    metal: true,
    underRing: 0x8a6a12,
    chip: 'sticker',
    surface: 'wave',
    // Stamina: near-circular with shallow lobes. The source calls Outer "almost
    // perfectly circular" and the Layer follows the same logic.
    blade: { root: 0.91, belly: 0.18, cut: 0.14, edge: 'wave' },
  },
  preset: {
    name: 'Orichalcum O3 Outer Octa',
    discId: 'outer',
    driverId: 'octa',
    spinDir: 1,
    skinId: 'solar',
  },
};
