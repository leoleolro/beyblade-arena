import { flameEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * HellsScythe — balance, four blades, and a family that proves the naming rule.
 *
 * The [Beast][Weapon] convention is not decoration: one beast family spawns
 * several blades that differ only in armament, and the weapon word is what
 * drives the silhouette. Hells alone gives HellsScythe (4 blades, Balance),
 * HellsChain (5 blades and chains, Balance) and HellsHammer (3 "Smash Blades",
 * Balance) — same beast, three different shapes, all balance.
 *
 * Scythe is the curved one, so `hook`: each blade bulges then curls back into a
 * point, which reads as a blade that would catch rather than deflect.
 */
export const entry: BeyEntry = {
  id: 'hellsscythe',
  anime: {
    layerId: 'hellsscythe',
    canonName: 'Hells Scythe',
    primary: 0xb0aab2,
    secondary: 0x7f1d1d,
    accent: 0xfca5a5,
    emblem: flameEmblem,
    letter: 'H',
    spinDir: -1,
    metal: true,
    underRing: 0x7f1d1d,
    chip: 'dark',
    blade: { root: 0.79, belly: 0.31, cut: 0.23, edge: 'hook' },
  },
  preset: { name: 'Hells Scythe', discId: 'heavy', driverId: 'orbit', spinDir: -1, skinId: 'ember' },
};
