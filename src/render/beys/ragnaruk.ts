import { flameEmblem } from '../emblems';
import type { BeyEntry } from './registry';

export const entry: BeyEntry = {
  id: 'ragnaruk',
  anime: {
  layerId: 'ragnaruk',
  canonName: 'Rising Ragnaruk',
  primary: 0x3daf4e,
  secondary: 0xf2cf2a,
  accent: 0xe0622a,
  emblem: flameEmblem,
  letter: 'R',
  spinDir: 1,
  // Two undulating flame wings — wide, smooth arcs with the mass at the ends.
  chip: 'sticker',
  // fire licks over a yellow flame tier
  underRing: 0xf2cf2a,
  blade: { root: 0.68, belly: 1.15, cut: 0.7, edge: 'flame' },
},
  classic: {
  layerId: 'ragnaruk',
  name: 'Ragnaruk',
  // Burnt copper on cast iron with brass hardware.
  primary: 0xa35a24,
  secondary: 0x3a3f45,
  accent: 0xe0a355,
  // The anime Ragnaruk is a pair of flame licks. Classic reads it as what a
  // two-blade attacker is mechanically: a counterweighted bar with two hard
  // points. Same blade count, opposite grammar.
  blade: { root: 0.5, belly: 0.9, cut: 1.15, edge: 'blade' },
},
  preset: { name: 'Rising Ragnaruk', discId: 'blitz', driverId: 'volcanic', spinDir: 1, skinId: 'venom' },
};
