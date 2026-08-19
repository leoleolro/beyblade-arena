import { lionEmblem } from '../emblems';
import type { BeyEntry } from './registry';

export const entry: BeyEntry = {
  id: 'leon',
  anime: {
  layerId: 'leon',
  canonName: 'Steel Leon',
  // Bare brushed-metal armor lobes over a black under-layer; gold lion face
  // on the black chip, blue eye accent carried in `secondary`.
  primary: 0xc7ccd2,
  secondary: 0x3a7bd5,
  accent: 0xd4a017,
  emblem: lionEmblem,
  letter: 'L',
  spinDir: 1,
  chip: 'dark',
  underRing: 0x23262b,
  metal: true,
  // The strongest read of the three: bare steel already, so the moulded
  // crests get the banded highlight on the walls as well as the face.
  surface: 'wave',
  blade: { root: 0.7, belly: 0.8, cut: 0.6, edge: 'wave' },
},
  preset: { name: 'Steel Leon', discId: 'wall', driverId: 'xtreme', spinDir: 1, skinId: 'solar' },
};
