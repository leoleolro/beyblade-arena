import { triceratopsEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * Tricera Press — the roster's most planted blade.
 *
 * Source: beyblade.fandom.com/wiki/Blade_-_TriceraPress. Defense Type,
 * **A20 / D65 / S15**, 36.5 g — "a Defense Type Blade designed with an inner
 * center of gravity and 5 main contact points. The launcher hooks are larger
 * than standard, to increase the amount of Central Weight Distribution (CWD)."
 *
 * D65 IS THE HIGHEST DEFENCE FIGURE IN THE CATALOGUE, and the shape says why:
 * an inner centre of gravity is the opposite of every stamina blade here, which
 * push their weight outward for centrifugal hold. So this is the one blade that
 * wants to sit still and be hit.
 *
 * FIVE POINTS, WHICH NOTHING ELSE RUNS. The roster has three, four, six, eight
 * and two; five is a genuinely new silhouette, and an odd count reads
 * differently from an even one because no contact point has an opposite number.
 * Low belly and a shallow cut keep them as blunt pads rather than blades —
 * "contact points" is the source's word, and it is not "blades".
 *
 * Gear Chip: "the side profile of a green triceratops", which is where the
 * green comes from rather than from a colourway.
 */
export const entry: BeyEntry = {
  id: 'tricerapress',
  anime: {
    layerId: 'tricerapress',
    canonName: 'Tricera Press',
    primary: 0xa8b0ae,
    secondary: 0x2f7d52,
    accent: 0x7ac496,
    emblem: triceratopsEmblem,
    letter: 'T',
    spinDir: 1,
    metal: true,
    chip: 'dark',
    underRing: 0x2f7d52,
    // High root, almost no belly, shallow cut: five blunt pads on a compact
    // circle. A defence blade that bellies is a defence blade with corners to
    // catch on.
    blade: { root: 0.9, belly: 0.14, cut: 0.2, edge: 'blade' },
  },
  preset: {
    name: 'Tricera Press 5-60B',
    // The release is TriceraPress M-85BS. This catalogue has no M ratchet and
    // no BS bit, so the defence-leaning 5-60 and Bastion stand in, and the name
    // says what it is rather than borrowing the product code.
    discId: 'r560',
    driverId: 'bastion',
    spinDir: 1,
    skinId: 'void',
  },
};
