import { shieldEmblem } from '../emblems';
import type { BeyEntry } from './registry';

export const entry: BeyEntry = {
  id: 'aegis',
  anime: {
  layerId: 'aegis',
  canonName: 'Orb Aegis',
  primary: 0xe9ecec,
  secondary: 0x57c4a8,
  accent: 0xc0c7cd,
  emblem: shieldEmblem,
  letter: 'A',
  spinDir: 1,
  // A defensive wall: near-circular with shallow scallops.
  chip: 'sticker',
  // shield scallops over a mint tier
  underRing: 0x57c4a8,
  surface: 'wave',
  blade: { root: 0.9, belly: 0.3, cut: 0.2, edge: 'wave' },
},
  classic: {
  layerId: 'aegis',
  name: 'Aegis',
  // Gunmetal plate over slate, with a mint indicator — the only cool accent
  // that survives from the anime entry.
  primary: 0x8d959d,
  secondary: 0x3d4650,
  accent: 0x5fd0b0,
  // Eight bolted armour facets instead of eight scallops. Same defensive
  // near-circle, faceted rather than moulded.
  blade: { root: 0.88, belly: 0.36, cut: 0.26, edge: 'blade' },
  layerScale: 0.9,
},
  preset: { name: 'Orb Aegis', discId: 'wall', driverId: 'bastion', spinDir: 1, skinId: 'venom' },
};
