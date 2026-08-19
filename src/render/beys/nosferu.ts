import { batwingEmblem } from '../emblems';
import type { BeyEntry } from './registry';

export const entry: BeyEntry = {
  id: 'nosferu',
  anime: {
  layerId: 'nosferu',
  canonName: 'Sanguine Nosferu',
  primary: 0x9b1c3c,
  secondary: 0x2a1020,
  accent: 0xd4a017,
  emblem: batwingEmblem,
  letter: 'N',
  spinDir: -1,
  chip: 'dark',
  underRing: 0x5e1030,
  surface: 'wave',
  blade: { root: 0.82, belly: 0.42, cut: 0.3, edge: 'wave' },
},
  preset: { name: 'Sanguine Nosferu', discId: 'spread', driverId: 'needle', spinDir: -1, skinId: 'void' },
};
