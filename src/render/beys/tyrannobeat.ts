import { drakeheadEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * TyrannoBeat — attack with real defence, and almost no stamina.
 *
 * Published: Attack, 37.0 g, **A65 / D30 / S5**. The five is the striking
 * number — the lowest stamina rating in the source data by a clear margin, and
 * it is paired with the *second* highest defence among attackers.
 *
 * That combination is a genuine archetype rather than a rounding: a top built
 * to win the exchange and end the round quickly, which cannot afford a long
 * one. It is the opposite trade to SharkEdge, which spends defence instead.
 */
export const entry: BeyEntry = {
  id: 'tyrannobeat',
  anime: {
    layerId: 'tyrannobeat',
    canonName: 'Tyranno Beat',
    primary: 0xb9bfc6,
    secondary: 0x166534,
    accent: 0xfacc15,
    emblem: drakeheadEmblem,
    letter: 'T',
    spinDir: 1,
    metal: true,
    underRing: 0x166534,
    chip: 'dark',
    blade: { root: 0.64, belly: 0.44, cut: 0.3, edge: 'hook' },
  },
  preset: { name: 'Tyranno Beat', discId: 'r460', driverId: 'accel', spinDir: 1, skinId: 'venom' },
};
