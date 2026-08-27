import { seiryuEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * CobaltDragoon — the roster's first LEFT-SPIN transcription.
 *
 * Source: beyblade.fandom.com/wiki/Blade_-_CobaltDragoon. Attack Type,
 * **left-spin**, four blades, **A60 / D15 / S25**, 37.8 g, single mold.
 * Described as "a left-spin four-sided Attack Type Blade with four upward
 * slanting blades acting as the main contact points", with Takara Tomy's own
 * copy reading "it produces left-spin Upper Attack with four heavy blades".
 *
 * WHY THE SPIN DIRECTION IS THE POINT AND NOT A FOOTNOTE. Every blade
 * transcribed into this roster so far spins right, so every ramp rakes the same
 * way and the whole set shares one handedness. This one is the mirror: the same
 * four upward slants, cut the other way round. `spinDir: -1` is what the mesh
 * and the preset read to get that, and it also decides the matchup — an
 * opposite-spin opponent is the only kind a spin-steal layer can drain, so
 * adding a left-spin attacker changes what Fafnir and Nosferu are *for*.
 *
 * Gear Chip: the side profile of Seiryu, the Blue Dragon and one of the Four
 * Auspicious Beasts, alongside the Bakuten Shoot Beyblade logo — the Team
 * Pendragon marking, referencing Dragoon of the original Bladebreakers, the
 * same nod BlackShell makes to Draciel. `seiryuEmblem` draws an eastern dragon
 * rather than the western skull `drakeheadEmblem` already carries.
 *
 * Colour: cobalt, and the source is explicit about it — "cobalt being the shade
 * of blue used for the Blade". 0x0047ab is that pigment rather than a generic
 * UI blue, which is why it is darker and greener than DranSword's navy.
 */
export const entry: BeyEntry = {
  id: 'cobaltdragoon',
  anime: {
    layerId: 'cobaltdragoon',
    canonName: 'Cobalt Dragoon',
    primary: 0xb8c4d2,
    secondary: 0x0047ab,
    accent: 0x67c7f5,
    emblem: seiryuEmblem,
    letter: 'C',
    spinDir: -1,
    // CHROME RIM, COLOURED BODY — the convention every produced Beyblade X
    // blade follows; the variants are Metal Coat: Black and Metal Coat: White,
    // so plating over the cobalt body is the base look rather than a special.
    metal: true,
    chip: 'dark',
    underRing: 0x0047ab,
    // `blade`, not `flame`: cut metal with a hard point and a deep undercut.
    // Four lobes at a middling root — heavier and blunter than DranSword's
    // three, which is what "four heavy blades" against three swords means.
    blade: { root: 0.64, belly: 0.44, cut: 0.32, edge: 'blade' },
  },
  preset: {
    name: 'Cobalt Dragoon 4-60A',
    // Four blades on the four-protrusion ratchet, so `alignsWith` is true and
    // the two rims stack into one silhouette — the design rule SphinxCowl's
    // entry states outright. The release combo is not named in the research, so
    // this pairing is ours and is chosen on that rule rather than claimed as
    // the product's.
    discId: 'r460',
    driverId: 'accel',
    spinDir: -1,
    skinId: 'frost',
  },
};
