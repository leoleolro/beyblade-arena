import { dayIndex } from './career';
import { makeRng } from './sim/math';
import { layer, makeBuild } from './sim/parts';
import type { Difficulty } from './ai';
import type { Rival } from './ladder';
import type { Archetype, BeyBuild } from './sim/types';

/**
 * The Cup: eight entrants, single elimination, three matches, one seed.
 *
 * WHY THIS EXISTS, next to a ladder, an endless run and a nemesis that all
 * already produce opponents. Every one of those is a LINE. `rivalAt` walks an
 * index up, `endlessRival` walks a counter up, and the nemesis is a running
 * score that also only goes up. Nothing in the game has ever been a thing you
 * can be KNOCKED OUT of, so nothing in the game has ever had a stake in a
 * single match. A bracket is the smallest structure that does: three wins
 * finishes it, one loss finishes it, and the difference between those two
 * outcomes is decided in about ten minutes.
 *
 * FOUR PROPERTIES, and each is a thing the three existing tracks do not have:
 *
 *  1. **It is a FIELD, not a queue.** Seven other bladers are in the draw and
 *     they fight each other whether or not you are watching. Who you meet in
 *     the final is decided by their half of the bracket, not by your rung.
 *  2. **It is seeded, so it is replayable.** The whole bracket — the draw, the
 *     seeding, every result in the half you are not in — is a pure function of
 *     one integer. Two players comparing "I lost the final to Sten" are talking
 *     about the same Sten.
 *  3. **It can be lost.** `recordCupMatch` has no path back. The endless run is
 *     the only other thing in the game that takes something away, and it takes
 *     a counter; this takes the run.
 *  4. **It is finished by the calendar, not by the player.** One cup per UTC
 *     day, stamped when the run ENDS so a half-played bracket is always
 *     resumable. Same clock as the daily objectives, same honest caveat: see
 *     `refreshChallenges`, which says out loud that the clock is the player's.
 *
 * THE ONE RULE THAT OVERRIDES EVERYTHING HERE, inherited word for word from
 * `career.ts`: nothing in this file may touch a stat. The prize is COINS and
 * TITLES — a number the shop already understands and a string. It is not a
 * part, either: `progress.test.ts` asserts the ladder distributes the entire
 * catalogue EXACTLY ONCE, so a cup that handed over a layer would duplicate a
 * ladder grant or break a test in a file that does not mention this one. That
 * is the same argument `endlessRival` and `nemesisRival` both make, and it is
 * the third time it has been the deciding one.
 */

/* ------------------------------------------------------------- the entrants */

export interface CupEntrant {
  id: string;
  /** The blader, not the bey. */
  name: string;
  /** One-line epithet, shown under the name on the bracket. */
  title: string;
  /** The bey, named the way the source names the product. */
  beyName: string;
  layerId: string;
  discId: string;
  driverId: string;
  skinId: string;
  /**
   * Skill, 1-3, mapping straight onto the three AI difficulties.
   *
   * SKILL, NOT STATS, and this is not a slogan — it is why the tier can be a
   * single number at all. The ladder's stated rule is that a harder opponent
   * reads your moves faster and never gets a bigger number, and the seeding
   * below is the only thing that turns tier into bracket position. If tier
   * meant "stronger bey" the top seed would be a stat boss with a rosette on.
   */
  tier: number;
  /** One line of flavour, shown before the match. */
  line: string;
}

/**
 * The pool the field is drawn from.
 *
 * EVERY BUILD IS A DOCUMENTED PRODUCT, or a documented product with the one
 * missing part named. The Blade/Ratchet/Bit combinations below were pulled as
 * raw wikitext through beyblade.fandom.com/api.php and cross-checked against
 * "List of Beyblade X products (Takara Tomy)"; the ten marked EXACT are real
 * SKUs whose three parts all exist in `sim/parts.ts`, and the four marked SUB
 * name the part the catalogue does not have and what stands in for it. Nothing
 * here is an invented loadout wearing a real blade's name.
 *
 * A FINDING THAT CHANGED THE DESIGN, worth writing down because it is
 * counter-intuitive and because the first draft of the draw was built on the
 * opposite assumption. `buildArchetype` names a build after its LAYER only when
 * the driver agrees, and calls everything else 'balance'. Real product
 * combinations disagree constantly — the source line happily sells a stamina
 * Blade on an attack Bit — so of the fourteen builds below, `buildArchetype`
 * reports five attack, one defense, one stamina and SEVEN balance. Drawing a
 * field with "one of each class" against that measure would have forced the
 * same three entrants into every single cup, which is the exact opposite of a
 * field. So the draw spans BLADE class (`layer().archetype`, what the source
 * itself calls the Blade), which is also what a player reads off the screen:
 * you can see it is a defence blade, you cannot see a derived tuple.
 *
 * Spin direction is deliberately not carried here even though CobaltDragoon is
 * the roster's left-spin transcription. `Game.makeBattle` gives the rival's
 * spin to `AiController.chooseSpinDir`, which already remembers and counters
 * the player — a cup entrant declaring its own direction would be a second
 * system fighting over one dial, which is the mistake `counterPreset` records
 * having avoided.
 */
export const CUP_FIELD: CupEntrant[] = [
  // ---- attack blades -------------------------------------------------------
  {
    id: 'bex',
    name: 'Bex',
    title: 'Sword Hand',
    // EXACT: DranSword 3-60F (BX-01), the line's first product.
    beyName: 'Dran Sword 3-60F',
    layerId: 'dransword',
    discId: 'r360',
    driverId: 'flat',
    skinId: 'ember',
    tier: 2,
    line: 'The first blade anyone was sold, and she has never needed a second.',
  },
  {
    id: 'rask',
    name: 'Rask',
    title: 'Buster',
    // EXACT: DranBuster 1-60A. One blade and the fewest ratchet protrusions in
    // the catalogue — the whole product is about concentrating one hit.
    beyName: 'Dran Buster 1-60A',
    layerId: 'dranbuster',
    discId: 'r160',
    driverId: 'accel',
    skinId: 'rose',
    tier: 1,
    line: 'One blade, all of it behind one hit. Do not be standing still.',
  },
  {
    id: 'nori',
    name: 'Nori',
    title: 'Keel',
    // EXACT: SharkEdge 5-60GF.
    beyName: 'Shark Edge 5-60GF',
    layerId: 'sharkedge',
    discId: 'r560',
    driverId: 'gearflat',
    skinId: 'frost',
    tier: 2,
    line: 'Two keel fins and a gear tip. It always comes back around.',
  },
  {
    id: 'sten',
    name: 'Sten',
    title: 'Hooked',
    // EXACT: PhoenixWing 9-60GF, and the pairing is the point — the source says
    // three of 9-60's nine protrusions exist to line up with PhoenixWing's
    // Launcher Hooks. The heaviest blade in the source line at release.
    beyName: 'Phoenix Wing 9-60GF',
    layerId: 'phoenixwing',
    discId: 'r960',
    driverId: 'gearflat',
    skinId: 'ember',
    tier: 3,
    line: 'Its contact points stick out past its own outline. There is no safe angle.',
  },
  {
    id: 'yara',
    name: 'Yara',
    title: 'Left Hand',
    // EXACT: CobaltDragoon 9-60F.
    beyName: 'Cobalt Dragoon 9-60F',
    layerId: 'cobaltdragoon',
    discId: 'r960',
    driverId: 'flat',
    skinId: 'void',
    tier: 3,
    line: 'Four blades raked the other way. Everything you practised is mirrored.',
  },

  // ---- defence blades ------------------------------------------------------
  {
    id: 'pell',
    name: 'Pell',
    title: 'Shellback',
    // EXACT: BlackShell 4-60D. The catalogue's heaviest blade on its flattest,
    // most planted tip — Dot is Defense 55, the highest of any Bit in the data.
    beyName: 'Black Shell 4-60D',
    layerId: 'blackshell',
    discId: 'r460',
    driverId: 'dot',
    skinId: 'void',
    tier: 3,
    line: 'Eight faces and the most planted tip in the box. Shoving it is feeding it.',
  },
  {
    id: 'quill',
    name: 'Quill',
    title: 'Shield Wall',
    // SUB: KnightShield 4-60LF. Low Flat is not in the catalogue; Flat is the
    // Bit it is a variation of, and the one this project actually transcribed.
    beyName: 'Knight Shield 4-60 Flat',
    layerId: 'knightshield',
    discId: 'r460',
    driverId: 'flat',
    skinId: 'frost',
    tier: 1,
    line: 'Six blades built to eat an impact. Bring patience, or bring a burst.',
  },
  {
    id: 'thea',
    name: 'Thea',
    title: 'Nine Points',
    // SUB: SphinxCowl 9-80GN. Gear Needle is not in the catalogue; Ball is.
    // The 9-80 half is kept because it is the documented pairing — SphinxCowl's
    // nine Barrage Blades are stated to align with 9-80's nine protrusions, and
    // `alignsWith` returns true for exactly this pair.
    beyName: 'Sphinx Cowl 9-80 Ball',
    layerId: 'sphinxcowl',
    discId: 'r980',
    driverId: 'ball',
    skinId: 'solar',
    tier: 2,
    line: 'Nine on the blade, nine on the ratchet. It was designed as one piece.',
  },

  // ---- stamina blades ------------------------------------------------------
  {
    id: 'umi',
    name: 'Umi',
    title: 'Long Game',
    // EXACT: ViperTail 5-60F.
    beyName: 'Viper Tail 5-60F',
    layerId: 'vipertail',
    discId: 'r560',
    driverId: 'flat',
    skinId: 'venom',
    tier: 2,
    line: 'A stamina blade that can actually hit you back. Most of them cannot.',
  },
  {
    id: 'varo',
    name: 'Varo',
    title: 'Rodsman',
    // EXACT: WizardRod 1-60R.
    beyName: 'Wizard Rod 1-60R',
    layerId: 'wizardrod',
    discId: 'r160',
    driverId: 'rush',
    skinId: 'venom',
    tier: 1,
    line: 'Wide, circular, and in no hurry whatsoever.',
  },
  {
    id: 'wynn',
    name: 'Wynn',
    title: 'Silver',
    // SUB: SilverWolf 9-70R. The 9-70 ratchet is not in the catalogue; 9-60 is
    // the same nine-protrusion rim one step shorter.
    beyName: 'Silver Wolf 9-60 Rush',
    layerId: 'silverwolf',
    discId: 'r960',
    driverId: 'rush',
    skinId: 'frost',
    tier: 3,
    line: 'It will still be turning. That is the entire plan and it usually works.',
  },
  {
    id: 'dax',
    name: 'Dax',
    title: 'Two Blades',
    // SUB: WizardArrow 4-80B. The 4-80 ratchet is not in the catalogue; 4-60 is
    // the same four-protrusion rim, and it is the ratchet WizardArrow's other
    // documented SKU (4-60N) ships on.
    beyName: 'Wizard Arrow 4-60 Ball',
    layerId: 'wizardarrow',
    discId: 'r460',
    driverId: 'ball',
    skinId: 'solar',
    tier: 1,
    line: 'Two blades, all of the weight thrown outward. Knock it and it comes back.',
  },

  // ---- balance blades ------------------------------------------------------
  {
    id: 'hale',
    name: 'Hale',
    title: 'Reaper',
    // SUB: HellsScythe 4-60T. Taper is not in the catalogue; Ball is the other
    // rounded stamina Bit and the one this project transcribed.
    beyName: 'Hells Scythe 4-60 Ball',
    layerId: 'hellsscythe',
    discId: 'r460',
    driverId: 'ball',
    skinId: 'rose',
    tier: 1,
    line: 'Four blades and a tip that will not fall over. It waits you out standing up.',
  },
  {
    id: 'zolt',
    name: 'Zolt',
    title: 'Even Odds',
    // SUB: LeonClaw 5-60P. Point is not in the catalogue; Dot is the defence Bit
    // and the closest planted tip to it.
    beyName: 'Leon Claw 5-60 Dot',
    layerId: 'leonclaw',
    discId: 'r560',
    driverId: 'dot',
    skinId: 'solar',
    tier: 2,
    line: 'Attack and defence published as the same number. That is not a compromise.',
  },
];

export const cupEntrantById = (id: string): CupEntrant | undefined =>
  CUP_FIELD.find((e) => e.id === id);

export const entrantBuild = (e: CupEntrant): BeyBuild =>
  makeBuild(e.layerId, e.discId, e.driverId);

/**
 * The class the SOURCE calls this entrant's Blade.
 *
 * Not `buildArchetype`. See the note on `CUP_FIELD` for the measurement that
 * forced this: real product combinations collapse to 'balance' seven times in
 * fourteen, so the derived tuple cannot span a field. The Blade's own class can,
 * and it is the one a player can see.
 */
export const entrantClass = (e: CupEntrant): Archetype => layer(e.layerId).archetype;

/** Tier maps straight onto AI skill. There is no fourth tier to map to. */
const TIER_DIFFICULTY: Difficulty[] = ['rookie', 'blader', 'champion'];

export const tierDifficulty = (tier: number): Difficulty =>
  TIER_DIFFICULTY[Math.max(0, Math.min(TIER_DIFFICULTY.length - 1, Math.floor(tier) - 1))];

/* ---------------------------------------------------------------- the shape */

/** Eight entrants: the player plus seven drawn. */
export const CUP_SIZE = 8;
/** Quarter-final, semi-final, final. */
export const CUP_ROUNDS = 3;
export const CUP_ROUND_NAMES = ['Quarter-final', 'Semi-final', 'Final'];

/** The player's slot marker inside a bracket. Not an entrant id. */
export const CUP_PLAYER = '@you';
/** A slot whose occupant is not decided yet. */
export const CUP_TBD = '';

/**
 * The cup opens after Vale.
 *
 * Rung 3 rather than rung 0 because of what the player OWNS. Vale's unlocks are
 * the third disc family and the accel driver; before that the garage holds two
 * discs and two drivers and a cup is the same build three times with different
 * names opposite it. Rung 3 is the first point at which "what do I bring to a
 * bracket" is a question with more than one answer.
 */
export const CUP_UNLOCK_RUNG = 3;

/**
 * Standard eight-seed placement: slot i holds seed SEED_SLOTS[i].
 *
 * This is the ordinary bracket every real tournament uses, and it is here for
 * the ordinary reason — it keeps the two strongest apart until the final, so
 * the last match of a cup is the best match in it. The alternative, pairing the
 * draw in the order it came out, produces a bracket whose final is a coin flip
 * about half the time.
 */
const SEED_SLOTS = [1, 8, 4, 5, 2, 7, 3, 6];

/**
 * THE PLAYER IS ALWAYS SEED 1, and that is a decision rather than an oversight.
 *
 * It fixes the player's path as 8 -> (4 or 5) -> (2, 3, 6 or 7): the opening
 * match is against the lowest-tiered blader in the draw and the difficulty
 * climbs from there, which is the shape a cup is supposed to have. The two
 * alternatives were both worse. Drawing the player a random seat makes the
 * quarter-final a coin flip between a rookie and the tournament favourite, so
 * a third of cups are over before they have a shape. Seeding the player by
 * ladder rung or best streak gives the easiest bracket to the player who needs
 * it least, which is a progression advantage wearing a tournament's clothes —
 * and the standing rule in `career.ts` is that this game hands out strings and
 * coins, not advantages.
 */
const PLAYER_SEED = 1;

/* ------------------------------------------------------------------- state */

export interface CupState {
  /** The bracket seed. Meaningless while `field` is empty. */
  seed: number;
  /**
   * The seven drawn entrants by id, in SEED ORDER: index 0 is seed 2, index 6
   * is seed 8. Empty means no cup has been drawn.
   */
  field: string[];
  /** Matches the player has won in this run, 0..CUP_ROUNDS. */
  wins: number;
  /** True once the player has lost a match in this run. */
  out: boolean;
  /** True once this run's purse has been credited. It cannot be paid twice. */
  paid: boolean;
  /**
   * The UTC day the last run FINISHED on, or -1 for never.
   *
   * Stamped at the end rather than at the start, which is the whole reason a
   * half-played bracket survives a reload without also being a way to get two
   * cups out of one day: an unfinished run is always resumable, and the day is
   * only spent once the run is actually over.
   */
  lastDay: number;
  /** Lifetime cups entered. */
  entered: number;
  /** Lifetime cups won. Feeds the titles, which are the cosmetic half. */
  won: number;
}

export const freshCup = (): CupState => ({
  seed: 0,
  field: [],
  wins: 0,
  out: false,
  paid: false,
  // -1 rather than 0, for the same reason `freshChallenges` uses -1: day 0 is a
  // real day and a save claiming it would be locked out until the clock moved.
  lastDay: -1,
  entered: 0,
  won: 0,
});

/**
 * Rebuild a `CupState` from whatever came out of the save.
 *
 * WHY THIS IS NOT FREE, given `Progress.load` already merges onto a fresh
 * object. That merge is a SHALLOW spread: `{ ...fresh(), ...parsed }` defaults
 * a missing top-level key and then hands a present one straight through,
 * whatever shape it is in. A `cup` written by a build that had six of these
 * eight fields comes back with two of them `undefined` and every read
 * downstream sees it — which is exactly the class of bug the comment above
 * `load` says the merge exists to prevent, one level deeper than the merge
 * reaches. So the nesting has to do its own defaulting, and this is it.
 *
 * The interesting case is not a missing field, it is a field that no longer
 * names real entrants — someone renames an id in `CUP_FIELD` and every save
 * mid-cup is now holding a bracket with a hole in it. A partial field is not a
 * bracket, so it is discarded whole and the player gets a fresh draw; the
 * lifetime counters survive, because those are the ones a title depends on.
 */
export function mergeCup(saved: unknown): CupState {
  const base = freshCup();
  if (!saved || typeof saved !== 'object') return base;
  const s = saved as Partial<Record<keyof CupState, unknown>>;
  const num = (v: unknown, d: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : d;
  const raw = Array.isArray(s.field) ? s.field : [];
  const field = raw.filter(
    (id): id is string => typeof id === 'string' && cupEntrantById(id) !== undefined,
  );
  const live = field.length === CUP_SIZE - 1 && new Set(field).size === field.length;
  return {
    seed: num(s.seed, 0) >>> 0,
    field: live ? field : [],
    wins: live ? Math.max(0, Math.min(CUP_ROUNDS, num(s.wins, 0))) : 0,
    out: live ? s.out === true : false,
    paid: live ? s.paid === true : false,
    lastDay: num(s.lastDay, -1),
    entered: Math.max(0, num(s.entered, 0)),
    won: Math.max(0, num(s.won, 0)),
  };
}

/** Is there a run to carry on with? */
export const cupInProgress = (c: CupState): boolean =>
  c.field.length === CUP_SIZE - 1 && !c.out && c.wins < CUP_ROUNDS;

/** Is the run over — knocked out, or the trophy already lifted? */
export const cupFinished = (c: CupState): boolean =>
  c.field.length === CUP_SIZE - 1 && (c.out || c.wins >= CUP_ROUNDS);

/**
 * Can the player enter or resume a cup right now?
 *
 * A run in progress is ALWAYS resumable, whatever the clock says. The day gate
 * exists to stop a cup being farmed, and refusing to let someone finish a
 * bracket they are two matches into does not stop farming — it just eats the
 * bracket at midnight.
 */
export function cupAvailable(c: CupState, rung: number, now: number): boolean {
  if (rung < CUP_UNLOCK_RUNG) return false;
  if (cupInProgress(c)) return true;
  return dayIndex(now) > c.lastDay;
}

/**
 * The seed for a given UTC day.
 *
 * Derived from the day rather than from `Math.random`, for the same reason
 * `dealChallenges` is: everyone playing on the same day is in the same draw, so
 * "who is in today's cup" is a question with an answer, and a test can name it.
 * The constants are the two `dealChallenges` already uses, so the two rolls
 * cannot accidentally be the same stream.
 */
export const cupSeedForDay = (day: number): number =>
  (Math.imul(day + 1, 2654435761) ^ Math.imul(day + 1, 40503) ^ 0x5ca1ab1e) >>> 0;

/* -------------------------------------------------------------- the draw */

const CLASS_ORDER: Archetype[] = ['attack', 'defense', 'stamina', 'balance'];

/**
 * Draw seven entrants and rank them, deterministically from `seed`.
 *
 * Returns ids in SEED ORDER — strongest first, so index 0 is seed 2 and index 6
 * is seed 8, which is the player's quarter-final opponent.
 *
 * The one constraint on the draw is that every blade class appears at least
 * once, so a cup is four different problems rather than seven variations on
 * whichever class the pool happens to hold most of (it holds five attack blades
 * out of fourteen, so an unconstrained draw deals an all-attack half more often
 * than it should). Ties in tier keep the order the draw produced — `sort` is
 * stable — so the same three tier-2 bladers are not always seeded in the same
 * order, and the bracket differs between two seeds that happen to draw alike.
 */
export function drawCup(seed: number): string[] {
  const rng = makeRng(seed >>> 0);
  const picked: CupEntrant[] = [];

  for (const a of CLASS_ORDER) {
    const pool = CUP_FIELD.filter((e) => entrantClass(e) === a && !picked.includes(e));
    if (pool.length === 0) continue;
    picked.push(pool[Math.floor(rng() * pool.length)]);
  }

  const rest = CUP_FIELD.filter((e) => !picked.includes(e));
  while (picked.length < CUP_SIZE - 1 && rest.length > 0) {
    picked.push(rest.splice(Math.floor(rng() * rest.length), 1)[0]);
  }

  picked.sort((a, b) => b.tier - a.tier);
  return picked.map((e) => e.id);
}

/** Begin a run. The lifetime counters carry; everything about the run resets. */
export function startCup(prev: CupState, seed: number): CupState {
  return {
    ...prev,
    seed: seed >>> 0,
    field: drawCup(seed),
    wins: 0,
    out: false,
    paid: false,
    entered: prev.entered + 1,
  };
}

/* ------------------------------------------------------------- the bracket */

export interface CupMatch {
  /** 0 quarter-final, 1 semi-final, 2 final. */
  round: number;
  /** Position within the round, top to bottom. */
  index: number;
  /** Entrant id, `CUP_PLAYER`, or `CUP_TBD` when the feeding match is undecided. */
  a: string;
  b: string;
  /** Who went through, or null while it has not been played or revealed. */
  winner: string | null;
  /** True when this is the player's own match. */
  player: boolean;
}

/**
 * Who wins a match the player is not in.
 *
 * A SEEDED WEIGHTED COIN FLIP, NOT A SIMULATED MATCH, and the reasons are worth
 * stating because "just run the sim" is the obvious objection.
 *
 *  - Cost. Resolving the other half honestly is four extra matches per cup, run
 *    at the moment the player advances. A headless match in this project costs
 *    roughly 20 ms (see difficulty.test.ts, which budgets ~50 a second), so the
 *    bracket screen would stall for the better part of a tenth of a second at
 *    every transition, on the main thread, for a result nobody watched.
 *  - Stability, which matters more. The bracket lives in the save. If ghost
 *    results came from the physics, then RETUNING THE PHYSICS would silently
 *    rewrite the far half of every bracket a player is halfway through — you
 *    would come back after an update to find you are playing someone else in
 *    the final. Deriving it from the seed alone means a save resumes into the
 *    same tournament it left.
 *
 * The weights model SKILL ONLY, which is defensible here for exactly one
 * reason: `cup.balance` in the test file measures every entrant build against
 * the six anchor presets and asserts none of them is an outlier, so build is
 * not the dominant term in this field. If that assertion ever has to be
 * loosened, this simplification stops being honest and should go with it.
 */
const TIER_WEIGHT = [1, 1.62, 2.6];

function ghostWinner(seed: number, round: number, index: number, a: string, b: string): string {
  const ea = cupEntrantById(a);
  const eb = cupEntrantById(b);
  if (!ea) return b;
  if (!eb) return a;
  // Mixed with the match's position so two matches in one bracket cannot draw
  // the same number, and so a round's results do not shift when an earlier
  // round is replayed from the same seed.
  const rng = makeRng((Math.imul(seed ^ 0x9e3779b9, 2246822519) + round * 131 + index * 7) >>> 0);
  const wa = TIER_WEIGHT[Math.max(0, Math.min(2, ea.tier - 1))];
  const wb = TIER_WEIGHT[Math.max(0, Math.min(2, eb.tier - 1))];
  return rng() < wa / (wa + wb) ? a : b;
}

/**
 * The whole bracket, as far as it is currently known.
 *
 * REVEALED PROGRESSIVELY, not resolved up front. A round the player has not yet
 * cleared has its other matches still shown as undecided, so finding out who is
 * waiting in the final is something that HAPPENS to you when you win the
 * semi-final. Resolving everything at draw time is the same function and one
 * fewer condition, and it turns the bracket screen into a spoiler.
 *
 * The exception is a finished run: once the player is out or has won it, the
 * rest resolves, so the final screen shows a completed tournament rather than a
 * bracket that stopped when you did.
 */
export function cupBracket(c: CupState): CupMatch[][] {
  const rounds: CupMatch[][] = [];
  if (c.field.length !== CUP_SIZE - 1) return rounds;

  // Seed 1 is the player; seeds 2..8 are `field` in order.
  let slots = SEED_SLOTS.map((s) => (s === PLAYER_SEED ? CUP_PLAYER : c.field[s - 2]));
  const revealed = cupFinished(c) ? CUP_ROUNDS : c.wins;

  for (let r = 0; r < CUP_ROUNDS; r++) {
    const matches: CupMatch[] = [];
    const next: string[] = [];
    for (let i = 0; i < slots.length; i += 2) {
      const a = slots[i];
      const b = slots[i + 1];
      const isPlayer = a === CUP_PLAYER || b === CUP_PLAYER;
      let winner: string | null = null;
      if (isPlayer) {
        // The player's own results are facts in the save, never rolled.
        if (c.wins > r) winner = CUP_PLAYER;
        else if (c.wins === r && c.out) winner = a === CUP_PLAYER ? b : a;
      } else if (a !== CUP_TBD && b !== CUP_TBD && r < revealed) {
        winner = ghostWinner(c.seed, r, i >> 1, a, b);
      }
      matches.push({ round: r, index: i >> 1, a, b, winner, player: isPlayer });
      next.push(winner ?? CUP_TBD);
    }
    rounds.push(matches);
    slots = next;
  }
  return rounds;
}

/**
 * The player's next match, or null when there is not one.
 *
 * Note what makes this work without any extra bookkeeping: the player is seed 1
 * in slot 0, and slot 0 feeds position 0 of every later round, so the player's
 * match is always `bracket[wins][0]`. The reveal rule above is tuned to exactly
 * this need — round r's ghost results become known the moment the player clears
 * round r-1, which is the moment their round-r opponent has to exist.
 */
export function cupOpponent(c: CupState): CupEntrant | null {
  if (!cupInProgress(c)) return null;
  const m = cupBracket(c)[c.wins]?.[0];
  if (!m) return null;
  const id = m.a === CUP_PLAYER ? m.b : m.a;
  return cupEntrantById(id) ?? null;
}

/**
 * The next cup match as a `Rival`, so `Game` can start it exactly the way it
 * starts a ladder rung or a nemesis meeting.
 *
 * `unlocks` is empty, and it is not a placeholder — see the standing rule at
 * the top of this file. Coins and a title are the entire prize.
 */
export function cupRival(c: CupState): (Rival & { entrant: CupEntrant; round: number }) | null {
  const e = cupOpponent(c);
  if (!e) return null;
  const round = c.wins;
  return {
    id: `cup-${e.id}-${round}`,
    name: e.name,
    title: `${CUP_ROUND_NAMES[round]} · ${e.title}`,
    beyName: e.beyName,
    build: () => entrantBuild(e),
    skinId: e.skinId,
    difficulty: tierDifficulty(e.tier),
    line: e.line,
    unlocks: {},
    entrant: e,
    round,
  };
}

/* -------------------------------------------------------------- the prize */

/**
 * Coins by how far the run got, indexed by matches won.
 *
 * PRICED AGAINST THE THREE NUMBERS ALREADY IN `economy.ts` rather than picked
 * to feel generous:
 *
 *   a match          75-135     (matchReward, and a cup match pays this too)
 *   a daily          150        (~4 matches of work)
 *   a weekly         400        (~8 matches)
 *   a Relic Crate    420        (the most expensive thing in the shop)
 *
 * So the trophy is 420 — exactly one Relic Crate, which is the most legible
 * reward the shop can express: win a cup, open the best crate. It sits just
 * above the weekly because a weekly cannot be lost and this can, and the three
 * matches of a clean run already paid 270 on their own.
 *
 * WHY IT CANNOT BE FARMED, structurally rather than by promise. One run per UTC
 * day, stamped in `recordCupMatch` and gated in `cupAvailable`. Working the
 * expectation through at a 65%-per-match player: the run clears 27% of the time
 * and averages 2.07 matches, so the purse is worth about 151 coins a day —
 * roughly a third of what the three dailies pay, on top of the match rewards
 * the same matches would have paid anyway. A cup is a good day's side income
 * and not a replacement for playing. The honest caveat is the same one
 * `refreshChallenges` writes down: the calendar comes from the player's own
 * clock, and this game has no server to check it against.
 *
 * Losing the quarter-final pays nothing. That is deliberate — the match reward
 * still lands, and a consolation prize for the first loss would make the
 * bracket's one real stake into a formality.
 */
export const CUP_PURSE = [0, 60, 160, 420];

export interface CupResult {
  /** Coins the purse paid. Zero unless this match ended the run. */
  coins: number;
  /** True when this match ended the run, either way. */
  finished: boolean;
  /** True when the player won the final. */
  champion: boolean;
}

/**
 * Apply one finished cup MATCH.
 *
 * Matches, not rounds — a bracket advances on the match, and `RoundRecord` is
 * the wrong grain for it. `Progress.recordRound` and `Progress.recordMatch`
 * already split on exactly this line for the same reason.
 *
 * Mutates `c` and returns what it earned, and `paid` is set HERE rather than by
 * the caller, for the reason `tickChallenges` gives: the only way to be sure a
 * reward is handed over exactly once is for the thing that decides it to also
 * record it.
 */
export function recordCupMatch(c: CupState, won: boolean, now: number): CupResult {
  const nothing: CupResult = { coins: 0, finished: false, champion: false };
  if (!cupInProgress(c)) return nothing;

  if (won) c.wins += 1;
  else c.out = true;

  if (!cupFinished(c)) return nothing;

  const champion = !c.out && c.wins >= CUP_ROUNDS;
  if (champion) c.won += 1;
  // The day is spent at the END of the run, so an unfinished bracket is always
  // resumable. See `CupState.lastDay`.
  c.lastDay = dayIndex(now);
  const coins = c.paid ? 0 : (CUP_PURSE[c.wins] ?? 0);
  c.paid = true;
  return { coins, finished: true, champion };
}
