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
    primary: 0xb0949c,
    secondary: 0x9f1239,
    accent: 0xfda4af,
    emblem: dragonEmblem,
    letter: 'W',
    spinDir: -1,
    // CHROME RIM, COLOURED BODY — taken from product photographs of the real
    // tops rather than from the type tables. Every produced Beyblade X blade
    // puts BARE METAL on the outer blades and the identity colour underneath:
    // DranSword is chrome blades over a blue disc, ImpactDrake is chrome over
    // red accents over a violet disc. Colouring the blades themselves — which
    // is what this roster did — is the single thing that made our tops read as
    // moulded plastic toys instead of the real article.
    metal: true,
    chip: 'dark',
    underRing: 0x9f1239,
    blade: { root: 0.68, belly: 0.4, cut: 0.3, edge: 'hook' },
  },
  preset: { name: 'Wyrm Fang', discId: 'heavy', driverId: 'volcanic', spinDir: -1, skinId: 'rose' },
};
