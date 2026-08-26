import { xswordEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * DranBuster — the attack ceiling, and the roster's only ONE-blade top.
 *
 * Published: Attack, 36.5 g, **A70 / D20 / S10** — the highest attack rating in
 * the source data by ten points. The blade is described as effectively a single
 * large broadsword protrusion on the underside rather than a set of wings.
 *
 * One contact point is the logical end of the rule the whole roster is built
 * on: fewer, larger blades concentrate recoil, more and smaller damp it.
 * SharkEdge takes it to two. This takes it to one, and pays with the lowest
 * stamina of any attacker.
 */
export const entry: BeyEntry = {
  id: 'dranbuster',
  anime: {
    layerId: 'dranbuster',
    canonName: 'Dran Buster',
    primary: 0xc0c8d2,
    secondary: 0x1e40af,
    accent: 0xfbbf24,
    emblem: xswordEmblem,
    letter: 'D',
    spinDir: 1,
    metal: true,
    underRing: 0x1e40af,
    chip: 'dark',
    // One blade: almost the entire rim is empty, and the single sweep is huge.
    blade: { root: 0.5, belly: 0.54, cut: 0.4, edge: 'blade' },
  },
  preset: { name: 'Dran Buster', discId: 'r160', driverId: 'gearflat', spinDir: 1, skinId: 'frost' },
};
