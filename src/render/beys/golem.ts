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
    primary: 0x16a34a,
    secondary: 0x14532d,
    accent: 0xd6f5df,
    emblem: shieldEmblem,
    letter: 'G',
    spinDir: 1,
    chip: 'dark',
    underRing: 0x14532d,
    surface: 'wave',
    blade: { root: 0.9, belly: 0.2, cut: 0.14, edge: 'wave' },
  },
  preset: { name: 'Golem Bastion', discId: 'wall', driverId: 'bastion', spinDir: 1, skinId: 'void' },
};
