import { shieldEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * RhinoHorn — defence, and the lightest defender in the data.
 *
 * Published: Defense, 32.7 g, **A20 / D50 / S30**. Notable because it is a
 * defender that is NOT heavy — most of the defence roster sits at 34-40 g and
 * this one is under 33. It buys its defence from shape and central weight
 * rather than from mass, which is exactly the distinction the sources draw
 * between defence (central weight distribution) and stamina (outward).
 */
export const entry: BeyEntry = {
  id: 'rhinohorn',
  anime: {
    layerId: 'rhinohorn',
    canonName: 'Rhino Horn',
    primary: 0xa8b0b8,
    secondary: 0x374151,
    accent: 0x93c5fd,
    emblem: shieldEmblem,
    letter: 'R',
    spinDir: 1,
    metal: true,
    underRing: 0x374151,
    chip: 'dark',
    surface: 'wave',
    blade: { root: 0.88, belly: 0.23, cut: 0.16, edge: 'wave' },
  },
  preset: { name: 'Rhino Horn', discId: 'r460', driverId: 'needle', spinDir: 1, skinId: 'void' },
};
