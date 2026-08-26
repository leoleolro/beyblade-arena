import { coilEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * ViperTail — stamina that can actually hit.
 *
 * Published: Stamina, 34.7 g, **A30 / D20 / S50**. Twice the attack of the
 * other stamina blades in the data (WizardArrow and SilverWolf both sit at 15),
 * paid for with the lowest defence of any of them.
 *
 * Worth having precisely because the roster's stamina problem is that stamina
 * cannot hurt anything — measured, every pure stamina build wins 11-17% against
 * the AI preset pool while attack sits at 35%. A stamina blade with real attack
 * is the archetype's most playable shape in this sim, and it is a shape the
 * source already supplies rather than one invented to patch a balance hole.
 */
export const entry: BeyEntry = {
  id: 'vipertail',
  anime: {
    layerId: 'vipertail',
    canonName: 'Viper Tail',
    primary: 0xb4bcae,
    secondary: 0x3f6212,
    accent: 0xbef264,
    emblem: coilEmblem,
    letter: 'V',
    spinDir: 1,
    metal: true,
    underRing: 0x3f6212,
    chip: 'sticker',
    surface: 'wave',
    blade: { root: 0.87, belly: 0.24, cut: 0.17, edge: 'wave' },
  },
  preset: { name: 'Viper Tail', discId: 'r560', driverId: 'ball', spinDir: 1, skinId: 'solar' },
};
