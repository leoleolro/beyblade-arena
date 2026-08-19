import { coilEmblem } from '../emblems';
import type { BeyEntry } from './registry';

export const entry: BeyEntry = {
  id: 'fafnir',
  anime: {
  layerId: 'fafnir',
  canonName: 'Drain Fafnir',
  primary: 0xc9a227,
  secondary: 0x20337a,
  accent: 0x2ec4b6,
  emblem: coilEmblem,
  letter: 'F',
  spinDir: -1,
  // Nearly round spin-steal shield: tiny nubs, no wings.
  chip: 'sticker',
  // smooth spin-steal scallops over teal
  underRing: 0x2ec4b6,
  surface: 'wave',
  blade: { root: 0.86, belly: 0.35, cut: 0.25, edge: 'wave' },
},
  classic: {
  layerId: 'fafnir',
  name: 'Fafnir',
  // Keeps the gold-and-teal identity, in aged brass rather than toy gold.
  primary: 0xb08d2f,
  secondary: 0x2f333a,
  accent: 0x2ec4b6,
  // The single biggest divergence in the set, and the one that most earns the
  // file. The anime Fafnir is a smooth scalloped spin-steal shield — no
  // corners anywhere by construction. Classic cuts the same near-round mass
  // as a gear: high root, shallow belly, `blade` grammar, so the profile is a
  // ring of six flat-topped teeth.
  blade: { root: 0.84, belly: 0.42, cut: 0.34, edge: 'blade' },
  layerScale: 0.9,
},
  preset: { name: 'Drain Fafnir', discId: 'spread', driverId: 'needle', spinDir: -1, skinId: 'solar' },
};
