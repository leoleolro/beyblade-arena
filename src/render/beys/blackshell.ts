import { shieldEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * BlackShell — transcribed from the wiki entry, not from the type conventions.
 *
 * Source: beyblade.fandom.com/wiki/BlackShell_4-60D. Defense Type, right-spin,
 * **40.7 g** — the heaviest blade in the roster's source data by some way — and
 * the blade is described as "an overall DIAMOND shape with EIGHT protrusions as
 * the main points of contact".
 *
 * That diamond is the detail worth having. Every other defence blade in the
 * research is round; this one is not, and it is still a defence blade, because
 * eight contact points around a compact outline damp an impact whatever the
 * outline's silhouette. So `root` is high like the other defenders but the cut
 * is deeper, giving corners rather than scallops.
 *
 * The Gear Chip carries the side profile of the Black Tortoise (Genbu), one of
 * the Four Auspicious Beasts — and the whole Team Pendragon line references the
 * original Bladebreakers, this one standing in for Draciel, whose identity was
 * always defence.
 */
export const entry: BeyEntry = {
  id: 'blackshell',
  anime: {
    layerId: 'blackshell',
    canonName: 'Black Shell',
    primary: 0x9aa2ab,
    secondary: 0x14181f,
    accent: 0x4fd1a5,
    emblem: shieldEmblem,
    letter: 'B',
    spinDir: 1,
    metal: true,
    underRing: 0x14181f,
    chip: 'dark',
    blade: { root: 0.86, belly: 0.22, cut: 0.26, edge: 'blade' },
  },
  preset: { name: 'Black Shell', discId: 'wall', driverId: 'bastion', spinDir: 1, skinId: 'void' },
};
