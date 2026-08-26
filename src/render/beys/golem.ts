import { shieldEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * Golem Bastion — Defence, eight small contact points.
 *
 * The documented defence convention is "heavy, with round and thick contact
 * points" and a high protrusion count: KnightShield's own product copy says its
 * six blades "create an impact dampening structure", and SphinxCowl's nine are
 * "arranged in a circle, allowing it to repel attacks from multiple
 * directions". Many small points behave as a continuous rim; a hit lands on a
 * curve rather than a corner and slides.
 *
 * Defence also uses **central** weight distribution rather than outward, which
 * is the one place it inverts stamina — mass near the axis resists being pushed
 * off the sweet spot. Modelled here as a smaller collision radius than
 * Basilisk's while carrying more mass.
 *
 * Green is the modern defence colour.
 */
export const entry: BeyEntry = {
  id: 'golem',
  anime: {
    layerId: 'golem',
    canonName: 'Golem Bastion',
    primary: 0xaebbb2,
    secondary: 0x15803d,
    accent: 0x86efac,
    emblem: shieldEmblem,
    letter: 'G',
    spinDir: 1,
    // CHROME RIM, COLOURED BODY — taken from product photographs of the real
    // tops rather than from the type tables. Every produced Beyblade X blade
    // puts BARE METAL on the outer blades and the identity colour underneath:
    // DranSword is chrome blades over a blue disc, ImpactDrake is chrome over
    // red accents over a violet disc. Colouring the blades themselves — which
    // is what this roster did — is the single thing that made our tops read as
    // moulded plastic toys instead of the real article.
    metal: true,
    chip: 'dark',
    underRing: 0x15803d,
    surface: 'wave',
    blade: { root: 0.9, belly: 0.2, cut: 0.14, edge: 'wave' },
  },
  preset: { name: 'Golem Bastion', discId: 'wall', driverId: 'bastion', spinDir: 1, skinId: 'void' },
};
