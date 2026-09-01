import { ghostEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * Ghost Circle — the lightest blade in the game.
 *
 * Source: beyblade.fandom.com/wiki/Blade_-_GhostCircle. Stamina Type,
 * **A5 / D40 / S55**, 26.7 g — "a Stamina Type Blade with a near perfectly
 * circular shape."
 *
 * 26.7 g IS FIVE GRAMS UNDER THE MASS FORMULA'S REFERENCE WEIGHT, and the
 * mapping puts it at 0.366 where WizardArrow's 31.8 g reads 0.44. That is the
 * lowest mass in the catalogue by a wide margin and it is correct rather than
 * out of range — the source says so directly: "on its release GhostCircle was
 * the lightest Blade released". It gets thrown further than anything else here,
 * which is the trade its own page describes.
 *
 * A5 is the lowest attack figure in the game. Combined with the lowest mass,
 * this is a blade with no offence and no inertia that survives on shape alone.
 *
 * 0.30 spin absorption on "near perfectly circular" — the plainest roundness
 * claim of the three that earn it.
 *
 * ITS UNIQUE LINE GIMMICK IS NOT MODELLED, same as MummyCurse: resin launcher
 * hooks shifting weight outward has no representation in a sim with one mass
 * per part. It shows up in the 26.7 g and nowhere else.
 *
 * Gear Chip: "a stylized ghost" — the source's own word, so the mark is a sheet
 * silhouette rather than an attempt at a face.
 */
export const entry: BeyEntry = {
  id: 'ghostcircle',
  anime: {
    layerId: 'ghostcircle',
    canonName: 'Ghost Circle',
    primary: 0xbcc6d6,
    secondary: 0x6c7a90,
    accent: 0xe6edf6,
    emblem: ghostEmblem,
    letter: 'G',
    spinDir: 1,
    // Unique Line: RESIN launcher hooks, not metal. Same reason MummyCurse is
    // not chrome-rimmed.
    metal: false,
    chip: 'sticker',
    underRing: 0x6c7a90,
    surface: 'wave',
    blade: { root: 0.94, belly: 0.12, cut: 0.06, edge: 'wave' },
  },
  preset: {
    name: 'Ghost Circle 9-80B',
    // Release is GhostCircle 0-80GB. No 0 ratchet or GB bit here; 9-80 and Ball
    // are the nearest and the name says so rather than borrowing the code.
    discId: 'r980',
    driverId: 'ball',
    spinDir: 1,
    skinId: 'frost',
  },
};
