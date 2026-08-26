import { flameEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * Solaris Halo — Balance, asymmetric rim.
 *
 * The research finding that shaped this: balance types are signalled by
 * **heterogeneity**, not by being a bland average of the other three. WeissTiger
 * carries three separately-named blade families on one rim — Upper Blades,
 * Damper Blades, and a stamina section — and reads as balance precisely because
 * the rim is not uniform.
 *
 * Our `flame` grammar is the closest thing the silhouette vocabulary has to
 * that: a long slow rise and a short sharp fall per blade, so the profile is
 * asymmetric within each lobe rather than between lobes. It reads as being
 * blown backwards, which is the look wanted here.
 *
 * Red, the modern balance colour — and the one that flipped furthest, having
 * been attack's colour in the older lines.
 */
export const entry: BeyEntry = {
  id: 'solaris',
  anime: {
    layerId: 'solaris',
    canonName: 'Solaris Halo',
    primary: 0xdc2626,
    secondary: 0x611010,
    accent: 0xffd76b,
    emblem: flameEmblem,
    letter: 'S',
    spinDir: 1,
    chip: 'sticker',
    underRing: 0x611010,
    blade: { root: 0.78, belly: 0.33, cut: 0.22, edge: 'flame' },
  },
  preset: { name: 'Solaris Halo', discId: 'gravity', driverId: 'orbit', spinDir: 1, skinId: 'ember' },
};
