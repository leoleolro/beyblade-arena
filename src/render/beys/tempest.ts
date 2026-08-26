import { xswordEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * Tempest Lance — Attack, two blades.
 *
 * Built from the real design language rather than invented (docs/PHYSICS.md,
 * bey-design section): Beyblade X attack blades cluster at 2-4 large contact
 * points, and the extreme of that axis is SharkEdge with **two**. Fewer, larger
 * blades mean more recoil per hit and less rim to damp with — maximum smash,
 * minimum stamina — where a defence blade spreads 5-9 small points into a
 * near-continuous damping ring.
 *
 * So this is the only two-blade top in the roster and it should read that way
 * instantly: a huge sweep of empty rim between two keels.
 *
 * Blue, because the type colours flipped in the Burst/X generations — attack
 * moved from red to blue — and the roster follows the modern convention.
 */
export const entry: BeyEntry = {
  id: 'tempest',
  anime: {
    layerId: 'tempest',
    canonName: 'Tempest Lance',
    primary: 0x2563eb,
    secondary: 0x0f2a6b,
    accent: 0xdbe7ff,
    emblem: xswordEmblem,
    letter: 'T',
    spinDir: 1,
    chip: 'dark',
    underRing: 0x0f2a6b,
    // Low root so the two keels stand a long way out of the body, a deep cut
    // behind each so the gap between them reads as deliberately empty.
    blade: { root: 0.58, belly: 0.46, cut: 0.34, edge: 'blade' },
  },
  preset: { name: 'Tempest Lance', discId: 'blitz', driverId: 'xtreme', spinDir: 1, skinId: 'frost' },
};
