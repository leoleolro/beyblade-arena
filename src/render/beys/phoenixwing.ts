import { firebirdEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * PhoenixWing — the only blade in the source data whose contact points break
 * its own outline.
 *
 * Source: beyblade.fandom.com/wiki/Blade_-_PhoenixWing. Attack Type,
 * right-spin, three blades, **A60 / D25 / S15**, 38.0 g — the heaviest blade in
 * the line at release, with a second mold from October 2024 at 39.0 g.
 *
 * THE DETAIL THAT MAKES IT WORTH ADDING. "At the start of each of the three
 * blades is a protruding 'Launcher Hook' — unlike other Blades, PhoenixWing's
 * Launcher Hooks protrude past the perimeter of the Blade, creating contact
 * points." Every other blade in this roster has an outline you could draw with
 * one closed curve. This one has three small spurs sticking out past it, and
 * each blade additionally carries "two smaller bumps" along its length that hit
 * as well. It is a deliberately DIRTY silhouette, and it hits harder for it.
 *
 * `flame` is the grammar that says so: a long slow rise and a short sharp fall
 * per blade, so each lobe is asymmetric within itself rather than a mirrored
 * wing. Read anticlockwise it is the ramp; read the other way it is the spur.
 * A deep cut and a low root keep the three lobes distinct, because a
 * three-sided attack blade whose lobes touch reads as a circle.
 *
 * Colour: the base release is Metal Coat: Red, which the source describes as
 * red and yellow (BX-23 Starter / Hasbro F9324 Soar Phoenix) — so chrome-red
 * over a deep red body with a gold accent, rather than the flat scarlet the
 * player-designed Crimson Phoenix already owns.
 *
 * Designed to pair with 9-60: the ratchet's three larger protrusions line up
 * with the three Launcher Hooks to form "Attack Points", which is why the
 * preset below is that ratchet and not a better one.
 */
export const entry: BeyEntry = {
  id: 'phoenixwing',
  anime: {
    layerId: 'phoenixwing',
    canonName: 'Phoenix Wing',
    primary: 0xc9b6b4,
    secondary: 0xb91c1c,
    accent: 0xf5a524,
    emblem: firebirdEmblem,
    letter: 'P',
    spinDir: 1,
    // CHROME RIM, COLOURED BODY — the convention every produced Beyblade X
    // blade follows, and doubly literal here: this one's base release is
    // *named* Metal Coat: Red, so the blades really are plated.
    metal: true,
    chip: 'dark',
    underRing: 0xb91c1c,
    // Low root, big belly, deep cut: three lobes with real gaps between them,
    // and the belly is what carries the Launcher Hook past the perimeter.
    blade: { root: 0.62, belly: 0.52, cut: 0.31, edge: 'flame' },
  },
  preset: {
    name: 'Phoenix Wing 9-60GF',
    // The real pairing, and the only preset in the roster chosen for geometry
    // rather than for stats: 9-60's three large protrusions are documented as
    // existing to line up with this blade's three hooks.
    discId: 'r960',
    driverId: 'gearflat',
    spinDir: 1,
    skinId: 'ember',
  },
};
