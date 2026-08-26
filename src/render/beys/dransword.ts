import { dragonEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * Dran Sword — the archetypal attacker, and the reference every other attack
 * design in this project is measured against.
 *
 * Three upward-slanting sword blades, chrome over a deep blue disc. It is the
 * bey the design research kept returning to: 3 blades, 34.6 g, A55/D25/S20, and
 * the shape that defines what "attack silhouette" means in Beyblade X.
 *
 * The anime block below is the fallback the game draws before the imported
 * model lands and in any theme that does not use it. It is deliberately a close
 * transcription rather than a different design — a bey that looks like two
 * different tops depending on load order is worse than one that looks slightly
 * plainer for a frame.
 */
export const entry: BeyEntry = {
  id: 'dransword',
  anime: {
    layerId: 'dransword',
    canonName: 'Dran Sword',
    primary: 0xc3ccd6,
    secondary: 0x1e3a8a,
    accent: 0x60a5fa,
    emblem: dragonEmblem,
    letter: 'D',
    spinDir: 1,
    metal: true,
    underRing: 0x1e3a8a,
    chip: 'dark',
    blade: { root: 0.66, belly: 0.42, cut: 0.3, edge: 'blade' },
  },
  preset: { name: 'Dran Sword', discId: 'gravity', driverId: 'xtreme', spinDir: 1, skinId: 'frost' },
};
