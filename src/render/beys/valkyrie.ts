import { valkyrieEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * Victory Valkyrie — the Burst-era protagonist bey.
 *
 * Three wings, each carrying a large contact point and a smaller kite-shaped
 * one, around a centre that depicts an armoured face. Where Dran Sword is cut
 * metal, Valkyrie is sculpted: the creature's anatomy IS the contact geometry,
 * which is the Burst generation's answer to the same problem.
 *
 * `hook` grammar rather than `blade` for exactly that reason — the wings bulge
 * and curl rather than running straight into a point.
 */
export const entry: BeyEntry = {
  id: 'valkyrie',
  anime: {
    layerId: 'valkyrie',
    canonName: 'Victory Valkyrie',
    primary: 0xccd3da,
    secondary: 0x1d4ed8,
    accent: 0xfbbf24,
    emblem: valkyrieEmblem,
    letter: 'V',
    spinDir: 1,
    metal: true,
    underRing: 0x1d4ed8,
    chip: 'dark',
    blade: { root: 0.7, belly: 0.38, cut: 0.26, edge: 'hook' },
  },
  preset: { name: 'Victory Valkyrie', discId: 'heavy', driverId: 'volcanic', spinDir: 1, skinId: 'ember' },
};
