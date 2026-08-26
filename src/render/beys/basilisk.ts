import { coilEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * Basilisk Coil — Stamina, near-circular.
 *
 * Stamina blades are "circular with smooth contact points" and carry **outward
 * weight distribution** — mass at the rim, because moment of inertia goes as
 * r^2, so pushing the same mass outward buys spin time. Two of the real ones
 * (WizardArrow, WizardRod) are described in exactly those terms.
 *
 * The silhouette job is therefore the opposite of Tempest's: as little to catch
 * on as possible. Almost no belly, a shallow cut, and the `wave` grammar, which
 * has no corners anywhere.
 *
 * Orange is the modern stamina colour.
 */
export const entry: BeyEntry = {
  id: 'basilisk',
  anime: {
    layerId: 'basilisk',
    canonName: 'Basilisk Coil',
    primary: 0xf59e0b,
    secondary: 0x7c4a03,
    accent: 0xffe9b8,
    emblem: coilEmblem,
    letter: 'B',
    spinDir: 1,
    chip: 'sticker',
    underRing: 0x7c4a03,
    surface: 'wave',
    // The roundest top in the roster. Root very high, belly almost nothing —
    // five lobes that are barely lobes.
    blade: { root: 0.93, belly: 0.16, cut: 0.12, edge: 'wave' },
  },
  preset: { name: 'Basilisk Coil', discId: 'spread', driverId: 'atomic', spinDir: 1, skinId: 'solar' },
};
