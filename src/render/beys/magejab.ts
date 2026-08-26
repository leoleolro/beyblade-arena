import { coilEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * Mage Jab — a Beyblade X CX-generation top.
 *
 * CX ("Custom X") splits the blade itself into swappable parts, so these read
 * busier than the Basic Line: more seams, more colour breaks, less of one
 * continuous chrome sweep. The transcription leans on that with a higher root
 * and a shallower cut — a rim that is articulated rather than bladed.
 */
export const entry: BeyEntry = {
  id: 'magejab',
  anime: {
    layerId: 'magejab',
    canonName: 'Mage Jab',
    primary: 0xbfc4cc,
    secondary: 0x6d28d9,
    accent: 0xa78bfa,
    emblem: coilEmblem,
    letter: 'M',
    spinDir: 1,
    metal: true,
    underRing: 0x6d28d9,
    chip: 'sticker',
    blade: { root: 0.84, belly: 0.24, cut: 0.16, edge: 'wave' },
  },
  preset: { name: 'Mage Jab', discId: 'spread', driverId: 'atomic', spinDir: 1, skinId: 'void' },
};
