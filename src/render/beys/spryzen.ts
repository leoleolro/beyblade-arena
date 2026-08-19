import { twinfaceEmblem } from '../emblems';
import type { BeyEntry } from './registry';

export const entry: BeyEntry = {
  id: 'spryzen',
  anime: {
  layerId: 'spryzen',
  canonName: 'Storm Spryzen',
  primary: 0xc62828,
  secondary: 0x2c3f9f,
  accent: 0xd9a72e,
  emblem: twinfaceEmblem,
  letter: 'S',
  spinDir: 1,
  chip: 'sticker',
  // twin cut blades over the blue underside
  underRing: 0x2c3f9f,
  blade: { root: 0.62, belly: 0.95, cut: 0.9, edge: 'blade' },
},
  preset: { name: 'Storm Spryzen', discId: 'heavy', driverId: 'orbit', spinDir: 1, skinId: 'ember' },
};
