import { drakeheadEmblem } from '../emblems';
import type { BeyEntry } from './registry';

export const entry: BeyEntry = {
  id: 'drake',
  anime: {
  layerId: 'drake',
  canonName: 'Cobalt Drake',
  // Compact matte-silver tri-blade hugging a deep translucent cobalt
  // under-layer; blue dragon head over split flames on the black chip.
  primary: 0xb9bec6,
  secondary: 0x2a3f9f,
  accent: 0x3f8fe8,
  emblem: drakeheadEmblem,
  letter: 'D',
  spinDir: 1,
  chip: 'dark',
  underRing: 0x1a2f8f,
  metal: true,
  blade: { root: 0.74, belly: 0.9, cut: 0.8, edge: 'hook' },
},
  preset: { name: 'Cobalt Drake', discId: 'heavy', driverId: 'orbit', spinDir: 1, skinId: 'frost' },
};
