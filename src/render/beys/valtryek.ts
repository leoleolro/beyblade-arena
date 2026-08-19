import { valkyrieEmblem } from '../emblems';
import type { BeyEntry } from './registry';

export const entry: BeyEntry = {
  id: 'valtryek',
  anime: {
  layerId: 'valtryek',
  canonName: 'Victory Valtryek',
  primary: 0x1e56c8,
  secondary: 0xd43a2f,
  accent: 0xe6b532,
  emblem: valkyrieEmblem,
  letter: 'V',
  spinDir: 1,
  // Three broad swept wings, aggressive pinwheel.
  chip: 'sticker',
  // cut-metal wings over a lighter blue tier
  underRing: 0x2b6fd4,
  blade: { root: 0.6, belly: 1.0, cut: 1.0, edge: 'blade' },
},
  classic: {
  layerId: 'valtryek',
  name: 'Valtryek',
  // Anodised steel-blue over brushed grey, chrome hardware. The anime one is
  // toy blue with a red sticker; this one is a machined part.
  primary: 0x2b5f8f,
  secondary: 0x8a939c,
  accent: 0xd8dee6,
  // Harder than the anime cut: less belly (a machined edge does not swell),
  // deeper undercut, lower root — a three-tooth cutter rather than a wing.
  blade: { root: 0.52, belly: 0.82, cut: 1.3, edge: 'blade' },
},
  preset: { name: 'Victory Valtryek', discId: 'heavy', driverId: 'xtreme', spinDir: 1, skinId: 'frost' },
};
