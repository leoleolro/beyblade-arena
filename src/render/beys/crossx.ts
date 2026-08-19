import { xswordEmblem } from '../emblems';
import type { BeyEntry } from './registry';

export const entry: BeyEntry = {
  id: 'crossx',
  anime: {
  layerId: 'crossx',
  canonName: 'Cross X',
  // Cobalt core under translucent crimson wing blades, massive gold X-and-
  // sword armor raised over the face, teal-driver colourway.
  primary: 0x1d4fd8,
  secondary: 0xd0202a,
  accent: 0xe8b83a,
  emblem: xswordEmblem,
  letter: 'X',
  spinDir: 1,
  chip: 'dark',
  underRing: 0x4d78e8,
  crest: 'xsword',
  blade: { root: 0.56, belly: 1.1, cut: 1.15, edge: 'blade' },
},
  preset: { name: 'Cross X', discId: 'gravity', driverId: 'xtreme', spinDir: 1, skinId: 'frost' },
};
