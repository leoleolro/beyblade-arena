import { phoenixEmblem } from '../emblems';
import type { BeyEntry } from './registry';

export const entry: BeyEntry = {
  id: 'phoenix',
  anime: {
  layerId: 'phoenix',
  canonName: 'Crimson Phoenix',
  // Metallic crimson feather-wings over a translucent amber under-ring;
  // black chip with the firebird in red-orange, gold bezel.
  primary: 0xc01822,
  secondary: 0x8e0f18,
  accent: 0xf0a020,
  emblem: phoenixEmblem,
  letter: 'P',
  spinDir: 1,
  chip: 'dark',
  underRing: 0xf0c020,
  blade: { root: 0.64, belly: 1.2, cut: 0.85, edge: 'flame' },
},
  preset: { name: 'Crimson Phoenix', discId: 'spread', driverId: 'volcanic', spinDir: 1, skinId: 'ember' },
};
