import { coilEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * WizardRod — the stamina ceiling in the source data.
 *
 * Five blades, 35.3 g, **A15 / D25 / S60**, described as "a wide circular
 * shape" with a larger diameter than its siblings. Its stablemate WizardArrow
 * carries the explicit rationale: "Two large blades create an outward center of
 * gravity, which generates strong centrifugal force."
 *
 * That is outward weight distribution stated as product copy, and it is why
 * this one is the widest blade in the roster: moment of inertia goes as r², so
 * a stamina blade buys spin time by pushing the same mass further out.
 */
export const entry: BeyEntry = {
  id: 'wizardrod',
  anime: {
    layerId: 'wizardrod',
    canonName: 'Wizard Rod',
    primary: 0xc2bcd0,
    secondary: 0x3b2f7a,
    accent: 0xc4b5fd,
    emblem: coilEmblem,
    letter: 'W',
    spinDir: 1,
    metal: true,
    underRing: 0x3b2f7a,
    chip: 'sticker',
    surface: 'wave',
    blade: { root: 0.92, belly: 0.17, cut: 0.13, edge: 'wave' },
  },
  preset: { name: 'Wizard Rod', discId: 'spread', driverId: 'atomic', spinDir: 1, skinId: 'rose' },
};
