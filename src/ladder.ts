import type { Difficulty } from './ai';
import { makeBuild } from './sim/parts';
import type { BeyBuild } from './sim/types';

/**
 * The career ladder.
 *
 * The game had no macro loop at all: you could play a perfect match and nothing
 * about the next one differed. A ladder of fixed, named opponents gives the
 * session a shape — each rival is a specific problem with a specific answer, and
 * beating one hands you parts that open new answers for the next.
 *
 * Two rules keep this from wrecking the balance work:
 *
 *  1. **Unlocks are sidegrades, never upgrades.** Every part in the catalog sits
 *     on the same trade-off surface and the win-rate spread is asserted in
 *     tests. Handing out strictly better parts would flatten that triangle and
 *     make the collection a power ladder instead of a toolbox.
 *  2. **Rivals escalate in skill, not in stats.** A harder opponent reads your
 *     moves faster; it never gets a bigger number. A rival that cheats reads as
 *     unfair rather than skilled.
 */

export interface Unlocks {
  layers?: string[];
  discs?: string[];
  drivers?: string[];
  skins?: string[];
}

export interface Rival {
  id: string;
  /** The blader, not the bey. */
  name: string;
  title: string;
  beyName: string;
  build: () => BeyBuild;
  skinId: string;
  difficulty: Difficulty;
  /** One line of flavour, shown before the match. */
  line: string;
  /** What beating them hands over. */
  unlocks: Unlocks;
}

export const LADDER: Rival[] = [
  {
    id: 'nyx',
    name: 'Nyx',
    title: 'Street Blader',
    beyName: 'Blitz Striker',
    build: () => makeBuild('ragnaruk', 'blitz', 'volcanic'),
    skinId: 'ember',
    difficulty: 'rookie',
    line: 'All attack, no patience. Survive the opening and it burns itself out.',
    unlocks: { layers: ['luinor'], drivers: ['volcanic'] },
  },
  {
    id: 'orin',
    name: 'Orin',
    title: 'Dojo Regular',
    beyName: 'Endless Coil',
    build: () => makeBuild('fafnir', 'spread', 'needle'),
    skinId: 'venom',
    difficulty: 'rookie',
    line: "Won't chase you and won't die. You have to go and take it.",
    unlocks: { discs: ['spread'], drivers: ['needle'], skins: ['venom'] },
  },
  {
    id: 'vale',
    name: 'Vale',
    title: 'Circuit Climber',
    beyName: 'Twin Fang',
    build: () => makeBuild('luinor', 'gravity', 'atomic'),
    skinId: 'solar',
    difficulty: 'blader',
    line: 'No weakness worth naming. Out-read it or lose slowly.',
    unlocks: { layers: ['fafnir'], discs: ['blitz'] },
  },
  {
    id: 'kes',
    name: 'Kes',
    title: 'Iron Wall',
    beyName: 'Iron Bastion',
    build: () => makeBuild('aegis', 'wall', 'bastion'),
    skinId: 'void',
    difficulty: 'blader',
    line: 'Charging this is feeding it. Outlast it instead.',
    unlocks: { layers: ['aegis'], drivers: ['bastion'], skins: ['void'] },
  },
  {
    id: 'rhea',
    name: 'Rhea',
    title: 'Storm Caller',
    beyName: 'Storm Breaker',
    build: () => makeBuild('valtryek', 'heavy', 'xtreme'),
    skinId: 'rose',
    difficulty: 'champion',
    line: 'Reads your move before you commit to it. Blocks are not free here.',
    unlocks: { layers: ['ragnaruk'], discs: ['wall'], skins: ['solar'] },
  },
  {
    id: 'zeph',
    name: 'Zeph',
    title: 'Arena Champion',
    beyName: 'Crimson Edge',
    build: () => makeBuild('spryzen', 'heavy', 'orbit'),
    skinId: 'frost',
    difficulty: 'champion',
    line: 'The complete blader. Every mistake you make, it will already be punishing.',
    unlocks: { drivers: ['orbit'], skins: ['rose'] },
  },
];

/** What the player starts with — enough to build something real, not everything. */
export const STARTING_UNLOCKS: Required<Unlocks> = {
  layers: ['valtryek', 'spryzen'],
  discs: ['gravity', 'heavy'],
  drivers: ['atomic', 'xtreme'],
  skins: ['frost', 'ember'],
};

export const rivalAt = (index: number): Rival =>
  LADDER[Math.min(index, LADDER.length - 1)];
