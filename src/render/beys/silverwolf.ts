import { coilEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * SilverWolf — the stamina ceiling.
 *
 * Published: Stamina, 36.8 g, **A15 / D30 / S65** — the highest stamina rating
 * in the source data, ten points above WizardArrow's 55 and beating every other
 * blade found.
 *
 * Heavy for a stamina blade, which is the interesting part: it holds spin by
 * carrying real mass out at the rim rather than by being light. Moment of
 * inertia goes as r squared, so mass at the edge is worth far more than mass
 * saved, and this is the entry that demonstrates it — the widest and among the
 * heaviest in the roster.
 */
export const entry: BeyEntry = {
  id: 'silverwolf',
  anime: {
    layerId: 'silverwolf',
    canonName: 'Silver Wolf',
    primary: 0xc8ccd2,
    secondary: 0x475569,
    accent: 0xe2e8f0,
    emblem: coilEmblem,
    letter: 'S',
    spinDir: 1,
    metal: true,
    underRing: 0x475569,
    chip: 'sticker',
    surface: 'wave',
    blade: { root: 0.93, belly: 0.15, cut: 0.11, edge: 'wave' },
  },
  preset: { name: 'Silver Wolf', discId: 'r560', driverId: 'ball', spinDir: 1, skinId: 'frost' },
};
