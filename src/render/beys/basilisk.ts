import { coilEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * Basilisk Coil — Stamina, near-circular.
 *
 * Stamina blades are "circular with smooth contact points" and carry **outward
 * weight distribution** — mass at the rim, because moment of inertia goes as
 * r^2, so pushing the same mass outward buys spin time. Two of the real ones
 * (WizardArrow, WizardRod) are described in exactly those terms.
 *
 * The silhouette job is therefore the opposite of Tempest's: as little to catch
 * on as possible. Almost no belly, a shallow cut, and the `wave` grammar, which
 * has no corners anywhere.
 *
 * Orange is the modern stamina colour.
 */
export const entry: BeyEntry = {
  id: 'basilisk',
  anime: {
    layerId: 'basilisk',
    canonName: 'Basilisk Coil',
    primary: 0xc9c2ad,
    secondary: 0xb45309,
    accent: 0xffd98a,
    emblem: coilEmblem,
    letter: 'B',
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
    underRing: 0xb45309,
    surface: 'wave',
    // The roundest top in the roster. Root very high, belly almost nothing —
    // five lobes that are barely lobes.
    blade: { root: 0.93, belly: 0.16, cut: 0.12, edge: 'wave' },
  },
  preset: { name: 'Basilisk Coil', discId: 'spread', driverId: 'atomic', spinDir: 1, skinId: 'solar' },
};
