import { dragonEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * Wyrm Fang — Attack, left spin.
 *
 * The left-spin attacker is a documented franchise trope rather than a random
 * choice: every generation fields one as the protagonist's rival, always with a
 * dragon motif — Ryuga, Lui Shirosagi, Khrome Ryugu. The roster had no
 * left-spin attacker at all, which left opposite-spin matchups reachable only
 * by taking an absorber.
 *
 * That matters mechanically here and not only thematically. `resolvePair`
 * measures a factor of ~54 difference in surface slip between same- and
 * opposite-spin contact, so a left-spin attacker is a genuinely different fight
 * from a right-spin one with identical stats.
 *
 * `hook` grammar: four blades that bulge and curl back into claws, which reads
 * organic and predatory next to Tempest's cut-metal keels.
 */
export const entry: BeyEntry = {
  id: 'wyrm',
  anime: {
    layerId: 'wyrm',
    canonName: 'Wyrm Fang',
    primary: 0x9f1239,
    secondary: 0x2b0713,
    accent: 0xffc9d8,
    emblem: dragonEmblem,
    letter: 'W',
    spinDir: -1,
    chip: 'dark',
    underRing: 0x2b0713,
    blade: { root: 0.68, belly: 0.4, cut: 0.3, edge: 'hook' },
  },
  preset: { name: 'Wyrm Fang', discId: 'heavy', driverId: 'volcanic', spinDir: -1, skinId: 'rose' },
};
