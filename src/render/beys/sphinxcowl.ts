import { shieldEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * SphinxCowl — nine contact points, and the alignment rule they come from.
 *
 * 32.7 g, **A35 / D55 / S10**, and its main feature is nine "Barrage Blade"
 * protrusions "arranged in a circle, allowing it to repel attacks from multiple
 * directions".
 *
 * The reusable rule is in the next sentence of the source: those nine are
 * "intended to align with the 9 protrusions of the 9-80 Ratchet". Real blades
 * are designed so the blade's protrusion count matches the ratchet's, producing
 * one coherent stacked silhouette instead of two unrelated rims. Our discs do
 * not carry protrusion counts yet — see PLAN.md — so this is the blade half of
 * a rule the parts system cannot express, recorded here so it is a known gap
 * rather than a forgotten one.
 */
export const entry: BeyEntry = {
  id: 'sphinxcowl',
  anime: {
    layerId: 'sphinxcowl',
    canonName: 'Sphinx Cowl',
    primary: 0xbfae92,
    secondary: 0x8a6a2f,
    accent: 0xfcd34d,
    emblem: shieldEmblem,
    letter: 'X',
    spinDir: 1,
    metal: true,
    underRing: 0x8a6a2f,
    chip: 'sticker',
    surface: 'wave',
    blade: { root: 0.9, belly: 0.19, cut: 0.12, edge: 'wave' },
  },
  preset: { name: 'Sphinx Cowl', discId: 'wall', driverId: 'bastion', spinDir: 1, skinId: 'solar' },
};
