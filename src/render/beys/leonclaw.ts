import { lionEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * LeonClaw — the balance archetype stated numerically.
 *
 * Published: Balance, 31.4 g, **A40 / D40 / S20**. Attack and defence exactly
 * equal, which is the cleanest statement of "balance" in the source data and a
 * useful anchor: every other balance blade here is heterogeneous in silhouette,
 * and this one is heterogeneous in the numbers.
 *
 * The lightest blade in the roster at 31.4 g, so it wins nothing by mass and
 * everything by not being bad at anything.
 */
export const entry: BeyEntry = {
  id: 'leonclaw',
  anime: {
    layerId: 'leonclaw',
    canonName: 'Leon Claw',
    primary: 0xbfae92,
    secondary: 0x9a3412,
    accent: 0xfdba74,
    emblem: lionEmblem,
    letter: 'L',
    spinDir: 1,
    metal: true,
    underRing: 0x9a3412,
    chip: 'dark',
    blade: { root: 0.8, belly: 0.29, cut: 0.21, edge: 'hook' },
  },
  preset: { name: 'Leon Claw', discId: 'r360', driverId: 'rush', spinDir: 1, skinId: 'solar' },
};
