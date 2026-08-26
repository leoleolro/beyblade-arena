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
    primary: 0xcbbfae,
    secondary: 0xdc2626,
    accent: 0xffd76b,
    emblem: flameEmblem,
    letter: 'S',
    spinDir: 1,
    // CHROME RIM, COLOURED BODY — taken from product photographs of the real
    // tops rather than from the type tables. Every produced Beyblade X blade
    // puts BARE METAL on the outer blades and the identity colour underneath:
    // DranSword is chrome blades over a blue disc, ImpactDrake is chrome over
    // red accents over a violet disc. Colouring the blades themselves — which
    // is what this roster did — is the single thing that made our tops read as
    // moulded plastic toys instead of the real article.
    metal: true,
    chip: 'sticker',
    underRing: 0xdc2626,
    blade: { root: 0.78, belly: 0.33, cut: 0.22, edge: 'flame' },
  },
  preset: { name: 'Solaris Halo', discId: 'gravity', driverId: 'orbit', spinDir: 1, skinId: 'ember' },
};
