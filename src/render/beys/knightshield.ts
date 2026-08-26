import { shieldEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * KnightShield — six blades, and the reason they are six is documented.
 *
 * 32.4 g, **A20 / D55 / S25**. Takara Tomy's own copy: "Its six defensive
 * blades create an impact dampening structure, easily absorbing attacks."
 *
 * That sentence is the whole defence archetype in one line, and it is why this
 * roster's defenders use the `wave` grammar: many small rounded points behave
 * as a near-continuous rim, so a hit lands on a curve and slides instead of
 * catching a corner and transferring everything.
 *
 * Emerald translucent plastic under faceted chrome in the product photo, which
 * the flat cel palette cannot do directly — the jewel tone is pushed deep
 * instead, with a light accent to stand in for the glass edge.
 */
export const entry: BeyEntry = {
  id: 'knightshield',
  anime: {
    layerId: 'knightshield',
    canonName: 'Knight Shield',
    primary: 0xa9b4ae,
    secondary: 0x046c4a,
    accent: 0x6ee7b7,
    emblem: shieldEmblem,
    letter: 'K',
    spinDir: 1,
    metal: true,
    underRing: 0x046c4a,
    chip: 'dark',
    surface: 'wave',
    blade: { root: 0.89, belly: 0.21, cut: 0.15, edge: 'wave' },
  },
  preset: { name: 'Knight Shield', discId: 'wall', driverId: 'needle', spinDir: 1, skinId: 'venom' },
};
