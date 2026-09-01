import { mummyEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * Mummy Curse — a defence blade that hits back.
 *
 * Source: beyblade.fandom.com/wiki/Blade_-_MummyCurse. Defense Type,
 * **A30 / D60 / S20**, 37.5 g — "a Defense Type Blade with a four-sided shape
 * consisting of thick contact points."
 *
 * A30 IS THE HIGHEST ATTACK OF ANY DEFENCE BLADE HERE, and that is the whole
 * character: the other four defenders sit between 10 and 25. It is also the
 * heaviest of them at 37.5 g. A heavy, four-sided defender with real attack is
 * a blade that answers rather than absorbs.
 *
 * NO SPIN ABSORPTION, deliberately. Its source sentence describes thick contact
 * points and a four-sided shape and never says round — and roundness is the
 * only thing this catalogue accepts as grounds for `spinSteal`. HellsScythe is
 * "a round four-sided Balance Type Blade" and gets 0.15; this is four-sided
 * without the adjective and gets nothing.
 *
 * ITS GIMMICK IS NOT MODELLED. The source describes a Unique Line "Counter
 * Blade" that moves outward under centripetal force at high spin velocity.
 * There is nothing in this sim that changes a layer's geometry mid-round, so
 * that is left out rather than approximated by a stat nudge nobody could
 * connect back to it.
 *
 * Gear Chip: "a mummy" — drawn as wrapping rather than a face, since bandaging
 * is what reads at chip size.
 */
export const entry: BeyEntry = {
  id: 'mummycurse',
  anime: {
    layerId: 'mummycurse',
    canonName: 'Mummy Curse',
    primary: 0xd8cbb0,
    secondary: 0x6d5a3c,
    accent: 0xb59a63,
    emblem: mummyEmblem,
    letter: 'M',
    spinDir: 1,
    // Unique Line: PLASTIC launcher hooks, not metal. So this is the rare
    // Beyblade X blade that is not chrome-rimmed, and the source's own reason
    // for it — outward weight distribution — is the opposite of TriceraPress's.
    metal: false,
    chip: 'sticker',
    underRing: 0x6d5a3c,
    blade: { root: 0.78, belly: 0.34, cut: 0.28, edge: 'blade' },
  },
  preset: {
    name: 'Mummy Curse 4-60D',
    discId: 'r460',
    driverId: 'dot',
    spinDir: 1,
    skinId: 'ember',
  },
};
