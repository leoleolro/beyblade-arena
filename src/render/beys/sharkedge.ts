import { xswordEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * SharkEdge — the extreme of the attack axis, from the wiki's own numbers.
 *
 * Two blades, 34.5 g, stat spread **A60 / D25 / S15** — the highest attack and
 * the lowest stamina in the source data. The blade is two huge upward-sloped
 * keel-like fins, and the product photograph shows what that means: a large
 * asymmetric gap of empty rim between them, not a balanced pinwheel.
 *
 * Fewer, larger blades create recoil; more, smaller blades damp it. This is the
 * "fewer" end taken as far as the real line takes it.
 */
export const entry: BeyEntry = {
  id: 'sharkedge',
  anime: {
    layerId: 'sharkedge',
    canonName: 'Shark Edge',
    primary: 0xb6bec8,
    secondary: 0x5b21b6,
    accent: 0x22d3ee,
    emblem: xswordEmblem,
    letter: 'S',
    spinDir: 1,
    metal: true,
    underRing: 0x5b21b6,
    chip: 'dark',
    blade: { root: 0.56, belly: 0.5, cut: 0.36, edge: 'blade' },
  },
  preset: { name: 'Shark Edge', discId: 'blitz', driverId: 'xtreme', spinDir: 1, skinId: 'frost' },
};
