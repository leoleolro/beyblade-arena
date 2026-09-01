import { haloEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * Heavens Ring — a circular defender, which the roster had none of.
 *
 * Source: beyblade.fandom.com/wiki/Blade_-_HeavensRing. Defense Type,
 * **A10 / D60 / S30**, 37.4 g — "a Defense Type Expand Blade with a circular
 * shape."
 *
 * CIRCULAR AND A DEFENDER, which is the combination that earns its 0.30
 * `spinSteal`. The catalogue's rule is that only a round perimeter justifies
 * absorption, because a round smooth layer stays in contact and transfers
 * momentum where an angular one deflects — and this is the plainest statement
 * of roundness on any defence page. KnightShield gets the same value for "a
 * round Defense Type Blade with six main contact points".
 *
 * A10 is the lowest attack in the entire catalogue. It does not hit; it stands
 * there and takes your spin off you.
 *
 * THE EXPAND GIMMICK IS NOT MODELLED. The source describes metal extending
 * beyond the launcher hooks as its Expand feature. This sim has one collision
 * radius per build and no way to extend it mid-round, so the metal shows up in
 * the 37.4 g and nowhere else.
 *
 * BLADE COUNT IS INFERRED, and says so. The page gives no number of contact
 * points — it just says circular. Eight is chosen so the contour reads as a
 * ring rather than a polygon, and it is the one figure in this entry that is
 * not transcribed.
 *
 * Gear Chip: "an angel halo and wings, along with a ring in the background".
 */
export const entry: BeyEntry = {
  id: 'heavensring',
  anime: {
    layerId: 'heavensring',
    canonName: 'Heavens Ring',
    primary: 0xe8e2d4,
    secondary: 0xa9b4c4,
    accent: 0xf2d98b,
    emblem: haloEmblem,
    letter: 'H',
    spinDir: 1,
    metal: true,
    chip: 'sticker',
    underRing: 0xa9b4c4,
    // Very high root, almost no cut: the outline barely leaves its own circle,
    // which is what "circular shape" has to mean in a contour built from lobes.
    surface: 'wave',
    blade: { root: 0.93, belly: 0.15, cut: 0.08, edge: 'wave' },
  },
  preset: {
    name: 'Heavens Ring 9-80B',
    // Release is HeavensRing 0-80DS; there is no 0 ratchet or DS bit here, so
    // the 9-80 and Bastion stand in and the name says so.
    discId: 'r980',
    driverId: 'bastion',
    spinDir: 1,
    skinId: 'solar',
  },
};
