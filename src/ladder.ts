import type { Difficulty } from './ai';
import { makeBuild, PRESETS } from './sim/parts';
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
    // Flat rides with Nyx's all-attack theme: it is the plain Attack Bit the
    // Xtreme Line was designed around, and the one the rest of the attack Bits
    // are variations on, so it belongs on the rung that teaches attack.
    unlocks: { layers: ['luinor', 'tempest', 'dransword', 'blackshell', 'dranbuster'], drivers: ['volcanic', 'rush', 'flat'] },
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
    unlocks: { layers: ['basilisk', 'valkyrie', 'sharkedge', 'rhinohorn'], discs: ['spread', 'r160'], drivers: ['needle', 'ball'], skins: ['venom'] },
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
    unlocks: { layers: ['fafnir', 'golem', 'magejab', 'knightshield', 'silverwolf'], discs: ['blitz', 'r360', 'r960'], drivers: ['accel'] },
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
    // Dot is the Iron Wall's own Bit — Defense 55, the highest of any Bit in
    // the source data, and the most planted tip in the catalogue. WizardArrow
    // ships on this rung rather than an earlier one because 5-60 does too, and
    // its preset wants both at once.
    unlocks: { layers: ['aegis', 'wyrm', 'dsycther', 'wizardrod', 'leonclaw', 'wizardarrow'], discs: ['r560'], drivers: ['bastion', 'gearflat', 'dot'], skins: ['void'] },
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
    unlocks: { layers: ['ragnaruk', 'solaris', 'hellsscythe', 'orichalcum', 'tyrannobeat', 'phoenixwing'], discs: ['wall', 'outer', 'r460'], drivers: ['octa'], skins: ['solar'] },
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
    // The final rung was the thinnest reward on the ladder — a driver and a
    // skin, and the only rival granting no layer. Nosferu is the right thing to
    // put here: it is the one layer whose mechanic changes how you launch, so
    // clearing the ladder hands over a new question rather than a spare part.
    // CobaltDragoon joins Nosferu here for the same reason Nosferu is here: it
    // is the roster's only LEFT-SPIN transcribed attacker, so clearing the
    // ladder hands over a new question — every spin-steal layer in the catalog
    // only works against an opposite-spin opponent — rather than a spare part.
    unlocks: { layers: ['nosferu', 'chimera', 'sphinxcowl', 'vipertail', 'cobaltdragoon'], discs: ['r980'], drivers: ['orbit'], skins: ['rose'] },
  },
];

/** What the player starts with — enough to build something real, not everything. */
export const STARTING_UNLOCKS: Required<Unlocks> = {
  // The crossx/phoenix/leon/drake line is the player's own designs — locking
  // someone out of their own beys would be absurd, so they start owned.
  layers: ['valtryek', 'spryzen', 'crossx', 'phoenix', 'leon', 'drake'],
  discs: ['gravity', 'heavy'],
  drivers: ['atomic', 'xtreme'],
  skins: ['frost', 'ember'],
};

export const rivalAt = (index: number): Rival =>
  LADDER[Math.min(index, LADDER.length - 1)];

/* --------------------------------------------------------------- endless */

/**
 * Names for the endless run, cycled with a rank suffix.
 *
 * Deliberately a small pool rather than a generator: a rival is meant to be a
 * specific person you can remember losing to, and procedurally-assembled
 * syllables read as filler. Eight names cycling with a rising rank keeps the
 * "someone is next" feeling without pretending to infinite authorship.
 */
const ENDLESS_NAMES = ['Kade', 'Sable', 'Iri', 'Tor', 'Wren', 'Ash', 'Juno', 'Vex'];

const ENDLESS_LINES = [
  'No introductions. You know what this is by now.',
  'Everyone who got this far made the same mistake next.',
  'Beaten the ladder? Good. That was the tutorial.',
  'I have watched every one of your matches.',
  'Nothing new here. Just better.',
];

/**
 * The rival for endless round `n` (1-based), after the ladder is cleared.
 *
 * WHY THIS EXISTS. The ladder is six rivals and then `rivalAt` clamped forever
 * to Zeph — roughly twenty minutes of content, after which the game had no
 * reason to be opened again. Everything needed for more was already here: the
 * sim is deterministic and seeded, the AI escalates in skill, and there are six
 * balanced anchor builds. This is the loop that uses them.
 *
 * TWO RULES, both inherited from the ladder above and both load-bearing:
 *
 *  1. **No unlocks, ever.** By the time this runs the catalog is complete, and
 *     `progress.test.ts` asserts the ladder distributes it exactly once. An
 *     endless rival handing out parts would either break that or duplicate a
 *     grant. Coins still accrue, so a run is still worth playing.
 *  2. **Escalation is skill and matchup, never stats.** Every build here is one
 *     of the six PRESETS the balance suite already sweeps, so an endless rival
 *     is provably beatable — it is not a stat-inflated boss. What rises is the
 *     difficulty tier and, past the early rounds, that it counter-picks.
 *
 * Deterministic in `n`: the same round always produces the same opponent, so a
 * run is a fair sequence rather than a slot machine, and two players comparing
 * "I got to 12" are comparing the same twelve fights.
 */
export function endlessRival(n: number): Rival {
  const i = Math.max(1, Math.floor(n));
  const preset = PRESETS[(i - 1) % PRESETS.length];
  const name = ENDLESS_NAMES[(i - 1) % ENDLESS_NAMES.length];
  // Rank climbs one every full pass through the name pool, so "Kade II" is
  // genuinely a later, harder fight than "Kade".
  const rank = Math.floor((i - 1) / ENDLESS_NAMES.length);
  const suffix = rank > 0 ? ` ${'I'.repeat(Math.min(rank + 1, 3))}${rank >= 3 ? `+${rank - 2}` : ''}` : '';
  // The first two endless rounds stay at blader so clearing the ladder does not
  // slam straight into a wall; everything after is champion.
  const difficulty: Difficulty = i <= 2 ? 'blader' : 'champion';
  const skins = ['void', 'ember', 'venom', 'solar', 'rose', 'frost'];

  return {
    id: `endless-${i}`,
    name: `${name}${suffix}`,
    title: `Endless · Round ${i}`,
    beyName: preset.name,
    build: preset.build,
    skinId: skins[(i - 1) % skins.length],
    difficulty,
    line: ENDLESS_LINES[(i - 1) % ENDLESS_LINES.length],
    unlocks: {},
  };
}
