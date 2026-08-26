import { twinfaceEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * Chimera Maw — Balance, six blades.
 *
 * The second balance design, and deliberately the opposite reading of the same
 * brief. Solaris is asymmetric *within* each blade; Chimera is heterogeneous
 * *around* the rim — six hooks at a middling root, so it has the protrusion
 * count of a defence blade and the curl of an attacker.
 *
 * Named for the beast whose whole identity is being made of parts of other
 * animals, which is the same joke the silhouette is making. `twinfaceEmblem`
 * carries it: two profiles sharing one chip.
 *
 * Stats deliberately sit on the balance anchor rather than being novel. The
 * player-designed line exists for its looks, and giving these entries new
 * numbers would reopen a balance question the archetype anchors already
 * answered — see the note in sim/parts.ts.
 */
export const entry: BeyEntry = {
  id: 'chimera',
  anime: {
    layerId: 'chimera',
    canonName: 'Chimera Maw',
    primary: 0x7c3aed,
    secondary: 0x2e1065,
    accent: 0xe9d5ff,
    emblem: twinfaceEmblem,
    letter: 'C',
    spinDir: -1,
    chip: 'dark',
    underRing: 0x2e1065,
    blade: { root: 0.82, belly: 0.26, cut: 0.18, edge: 'hook' },
  },
  preset: { name: 'Chimera Maw', discId: 'spread', driverId: 'needle', spinDir: -1, skinId: 'venom' },
};
