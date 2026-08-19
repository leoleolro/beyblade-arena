import { dragonEmblem } from '../emblems';
import type { BeyEntry } from './registry';

export const entry: BeyEntry = {
  id: 'luinor',
  anime: {
  layerId: 'luinor',
  canonName: 'Lost Luinor',
  primary: 0xeef1f5,
  secondary: 0x3a7bd5,
  accent: 0xb9c2cc,
  emblem: dragonEmblem,
  letter: 'L',
  spinDir: -1,
  // Jagged high-recoil silhouette: deep cuts, hard bellies.
  chip: 'sticker',
  // clawed dragon wings over an azure tier
  underRing: 0x3a7bd5,
  blade: { root: 0.58, belly: 1.1, cut: 1.2, edge: 'hook' },
},
  classic: {
  layerId: 'luinor',
  name: 'Luinor',
  // Titanium white with a cyan indicator accent — the cold end of the set.
  primary: 0xdfe4ea,
  secondary: 0x4a5560,
  accent: 0x6fcfe4,
  // Still a claw, but a milled one: the barb keeps its curl, the belly comes
  // in and the undercut goes deeper so the recoil reads as ratchet teeth.
  blade: { root: 0.54, belly: 0.95, cut: 1.3, edge: 'hook' },
},
  preset: { name: 'Lost Luinor', discId: 'gravity', driverId: 'atomic', spinDir: -1, skinId: 'frost' },
};
