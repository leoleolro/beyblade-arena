import { twinfaceEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * Reaper Dsycther — Metal Masters era, and the odd one out on purpose.
 *
 * The Metal Fight generations built tops from a metal Fusion Wheel over a clear
 * plastic Energy Ring, which is a completely different construction from both
 * the Burst layer and the X blade. Keeping one in the roster is worth it for
 * the silhouette alone: heavier, lower, and far more asymmetric than anything
 * the three-part systems produce.
 *
 * Left spin, as the reaper motif asks for.
 */
export const entry: BeyEntry = {
  id: 'dsycther',
  anime: {
    layerId: 'dsycther',
    canonName: 'Reaper Dsycther',
    primary: 0xa8adb5,
    secondary: 0x334155,
    accent: 0x94a3b8,
    emblem: twinfaceEmblem,
    letter: 'R',
    spinDir: -1,
    metal: true,
    underRing: 0x334155,
    chip: 'dark',
    blade: { root: 0.76, belly: 0.3, cut: 0.24, edge: 'flame' },
  },
  preset: { name: 'Reaper Dsycther', discId: 'wall', driverId: 'orbit', spinDir: -1, skinId: 'rose' },
};
