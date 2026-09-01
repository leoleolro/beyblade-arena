import { makeRng } from './sim/math';
import { PRESETS } from './sim/parts';
import type { Archetype, BeyBuild, Defeat } from './sim/types';

/**
 * The career layer that sits on top of the ladder: what the player did, what
 * they are being asked to do today, and who has started taking it personally.
 *
 * WHY THIS EXISTS. The macro loop was climb six rungs, then an endless counter
 * that only goes up. Everything in it is one number moving in one direction,
 * which is why a session has no shape: nothing is ever *finished*, only
 * extended. This file adds three things that finish, on three different
 * clocks — an objective that resets tomorrow, a per-bey tally that takes a
 * hundred matches, and an opponent who remembers the last time.
 *
 * THE ONE RULE THAT OVERRIDES EVERYTHING HERE. Nothing in this file may touch
 * a stat. Not a bonus, not a multiplier, not a "mastery grants +2% attack".
 * The balance surface is measured — `partsCatalogue.test.ts`, `played.test.ts`
 * and the sweep comments in `parts.ts` are all statements about a specific set
 * of numbers — and a progression bonus would silently invalidate every one of
 * them while looking like a feature. Mastery pays out in TITLES, which are
 * strings. Challenges pay out in coins, which buy parts the ladder already
 * gives. The nemesis escalates by CHOOSING A DIFFERENT PRESET, which is the
 * same escalate-in-skill-not-stats rule the ladder states.
 *
 * Every rate quoted in this file was measured with the real sim: both sides
 * driven by `AiController` at champion on the standard arena, 1,648 rounds
 * across 480 matches over the full preset grid. That is a PESSIMISTIC floor
 * for a human, who meets rookie and blader rivals on the way up — read every
 * "≈ N matches" below as an upper bound.
 */

/* ------------------------------------------------------------ what a round was */

/** Which track a match belonged to. */
export type Opponent = 'ladder' | 'endless' | 'nemesis';

/**
 * One finished round, as the game sees it.
 *
 * Deliberately flat and primitive-only: it is a value the UI layer assembles
 * from `RoundResult` plus the player's own `BeyState` at the final frame, and
 * every field here already exists in the sim. Nothing in this file may reach
 * back into the sim for more — an objective that needed a new sim field would
 * be an objective that changes the thing it is measuring.
 */
export interface RoundRecord {
  won: boolean;
  /** Straight off `RoundResult.reason`. */
  reason: Defeat | 'timeout' | 'draw';
  /** True when this round ended the match. */
  decidedMatch: boolean;
  /** The player's build, by part id. */
  layerId: string;
  discId: string;
  driverId: string;
  /** `buildArchetype` of the player's build. */
  archetype: Archetype;
  /** +1 right, -1 left. */
  spinDir: 1 | -1;
  /** Player's counters at the final frame. */
  hitsLanded: number;
  spinStolen: number;
  /** Player's spin remaining over spin at launch, 0..1. */
  spinLeft: number;
  /** How long the round lasted, seconds. */
  seconds: number;
  opponent: Opponent;
}

/* ------------------------------------------------------------------- the clock */

export const DAY_MS = 86_400_000;

/**
 * Day and week indices, in UTC.
 *
 * UTC rather than local time for one reason that matters more than the
 * inconvenience: a local boundary makes every test in this file depend on the
 * machine's timezone, and a suite that passes in London and fails in Auckland
 * is a suite people stop trusting. The cost is a reset that lands mid-afternoon
 * for some players, which is what every game with a single global daily reset
 * already does.
 *
 * Weeks are day/7 rather than a calendar week, so the boundary is derived from
 * the same number and the two can never disagree about what day it is.
 */
export const dayIndex = (now: number): number => Math.floor(now / DAY_MS);
export const weekIndex = (now: number): number => Math.floor(dayIndex(now) / 7);

/* --------------------------------------------------------------- objectives */

export type ChallengeScope = 'daily' | 'weekly';

export interface Challenge {
  id: string;
  /** Imperative, second person, no punctuation. Shown as-is. */
  text: string;
  scope: ChallengeScope;
  /** Counter objectives: how many ticks. Set objectives: how many distinct keys. */
  target: number;
  /** Does this round tick the objective? */
  counts: (r: RoundRecord) => boolean;
  /**
   * Set objectives: what this round contributes. Distinct values only count
   * once, which is what expresses "one of each" without a second mechanism.
   */
  key?: (r: RoundRecord) => string;
  /**
   * Objectives that share a group never appear together. Without it the roll
   * happily deals three build-class objectives and the day reads as one task.
   */
  group?: string;
  /**
   * Some objectives need a part the player may not own yet. Checked once, at
   * roll time — an objective must not become impossible, or possible, halfway
   * through the day it was dealt on.
   */
  needs?: (owns: (kind: 'layers', id: string) => boolean) => boolean;
}

const isWinBy = (reason: Defeat) => (r: RoundRecord): boolean => r.won && r.reason === reason;

/**
 * The daily pool.
 *
 * Every target is sized off a measured per-round rate so no objective is a
 * wall and none is free. The comment on each line is the measurement: the
 * share of rounds that tick it, and what the target works out to in matches at
 * 3.43 rounds per match. Sizing was the whole design problem — the first draft
 * asked for three burst finishes, which measures out at 8.4 matches and is a
 * week's play dressed up as a day's.
 *
 * TWO THINGS ARE DELIBERATELY ABSENT, and both were cut by measurement rather
 * than taste:
 *
 *  - **Rail and Xtreme Finish objectives.** Measured on the standard arena:
 *    0.0% of rounds involve a rail ride and 0.0% end in an Xtreme Finish,
 *    because the standard dish has neither feature. On `xrail` the same sweep
 *    gives 86.4% and 9.3%. So an objective naming either is not hard, it is
 *    *impossible* for a player who has not changed arenas, and an objective
 *    that cannot be completed on the floor you are standing on reads as a bug.
 *  - **Perfect-launch objectives.** 83.5% of rounds already contain one. An
 *    objective that completes itself while you ignore it is decoration.
 */
const DAILY: Challenge[] = [
  {
    // 10.4% of rounds. x2 ≈ 5.6 matches — the longest daily, on purpose: one
    // of the three should still be sitting there when the other two are done.
    id: 'burst2',
    text: 'Burst your rival twice',
    scope: 'daily',
    target: 2,
    group: 'finish',
    counts: isWinBy('burst'),
  },
  {
    // 12.4% of rounds. x2 ≈ 4.7 matches.
    id: 'ko2',
    text: 'Knock your rival out of the ring twice',
    scope: 'daily',
    target: 2,
    group: 'finish',
    counts: isWinBy('knockout'),
  },
  {
    // 18.9% of rounds. x3 ≈ 4.6 matches.
    id: 'outlast3',
    text: 'Win three rounds by outlasting your rival',
    scope: 'daily',
    target: 3,
    group: 'finish',
    counts: isWinBy('spin-finish'),
  },
  {
    // 14.0% of rounds. x2 ≈ 4.2 matches. The median winning round finishes with
    // 34% spin left, so "over half" is genuinely a dominant win and not a
    // rename of "win".
    id: 'dominant2',
    text: 'Win two rounds with over half your spin left',
    scope: 'daily',
    target: 2,
    group: 'margin',
    counts: (r) => r.won && r.spinLeft > 0.5,
  },
  {
    // 14.2% of rounds. x2 ≈ 4.1 matches. Five seconds is the 25th percentile of
    // winning rounds (p25 4.3s), so it asks for a fast win rather than a
    // typical one — the median winning round takes 9.2s.
    id: 'quick2',
    text: 'Win two rounds inside five seconds',
    scope: 'daily',
    target: 2,
    group: 'margin',
    counts: (r) => r.won && r.seconds < 5,
  },
  {
    // 40.5% of rounds. x4 ≈ 2.9 matches — the shortest daily, and the only one
    // that ticks on a round you lost. Something has to be achievable on a bad
    // night or the set is a punishment for losing.
    id: 'brawl4',
    text: 'Land eight clean hits in a round, four times',
    scope: 'daily',
    target: 4,
    group: 'aggression',
    counts: (r) => r.hitsLanded >= 8,
  },
  {
    // 19.1% of rounds. x3 ≈ 4.6 matches.
    id: 'brawl12',
    text: 'Land twelve clean hits in a single round, three times',
    scope: 'daily',
    target: 3,
    group: 'aggression',
    counts: (r) => r.hitsLanded >= 12,
  },
  {
    // 17.7% of rounds across the preset grid — but that average hides the
    // mechanic: absorption only works against an opposite-spin opponent (see
    // LayerPart.spinSteal), so this is an objective about reading the rival's
    // spin, not about equipping a part. Gated on owning a layer that can do it
    // at all, because otherwise it is a blank square for the first three rungs.
    id: 'steal2',
    text: 'Absorb spin from your rival in two rounds',
    scope: 'daily',
    target: 2,
    group: 'tech',
    counts: (r) => r.spinStolen > 0,
    needs: (owns) => owns('layers', 'fafnir') || owns('layers', 'nosferu'),
  },
  {
    // 41.7% of rounds are player wins, so x4 ≈ 2.8 matches IF the player
    // commits to left spin — which is the point. Spin direction is a free
    // choice with a real consequence and most players never touch it.
    id: 'lefty4',
    text: 'Win four rounds spinning left',
    scope: 'daily',
    target: 4,
    group: 'tech',
    counts: (r) => r.won && r.spinDir === -1,
  },
  // The four class objectives share a group so the roll can never deal two of
  // them; each is x3 ≈ 2.1 matches once you have a build of that class, and
  // together they are the only thing in the game that asks you to open the
  // garage for a reason other than a new part.
  ...(['attack', 'defense', 'stamina', 'balance'] as const).map(
    (a): Challenge => ({
      id: `class-${a}`,
      text: `Win three rounds with a ${a} build`,
      scope: 'daily',
      target: 3,
      group: 'class',
      counts: (r) => r.won && r.archetype === a,
    }),
  ),
];

/**
 * The weekly pool. One is dealt at a time and it is meant to still be there on
 * day four — every entry measures out at five to nine matches.
 */
const WEEKLY: Challenge[] = [
  {
    // 41.7% of rounds. x12 ≈ 8.4 matches.
    id: 'week-rounds12',
    text: 'Win twelve rounds',
    scope: 'weekly',
    target: 12,
    counts: (r) => r.won,
  },
  {
    // A set, not a counter: three distinct finishes. Coupon-collecting on
    // 10.4% / 12.4% / 18.9% lands around 20 rounds ≈ 6 matches, and it is the
    // only objective in the game that teaches all three win conditions exist.
    id: 'week-allfinishes',
    text: 'Win a round by burst, by ring-out and by outlasting',
    scope: 'weekly',
    target: 3,
    counts: (r) => r.won && r.reason !== 'timeout' && r.reason !== 'draw',
    key: (r) => r.reason,
  },
  {
    // Four distinct build classes. Cheap in rounds and expensive in garage
    // trips, which is the intended shape — it is a collection objective
    // wearing a combat objective's clothes.
    id: 'week-allclasses',
    text: 'Win a round with an attack, defense, stamina and balance build',
    scope: 'weekly',
    target: 4,
    counts: (r) => r.won,
    key: (r) => r.archetype,
  },
  {
    // 40.5% of rounds. x12 ≈ 8.6 matches.
    id: 'week-brawl12',
    text: 'Land eight clean hits in a round, twelve times',
    scope: 'weekly',
    target: 12,
    counts: (r) => r.hitsLanded >= 8,
  },
];

export const CHALLENGE_POOL: Challenge[] = [...DAILY, ...WEEKLY];

export const challengeById = (id: string): Challenge | undefined =>
  CHALLENGE_POOL.find((c) => c.id === id);

/** How many of each scope are live at once. */
export const DAILY_COUNT = 3;
export const WEEKLY_COUNT = 1;

export interface ChallengeProgress {
  id: string;
  /** Counter objectives. */
  n: number;
  /** Set objectives: the distinct keys seen so far. */
  keys: string[];
  /** True once the coins have been handed over, so they cannot be paid twice. */
  paid: boolean;
}

export interface ChallengeState {
  /** The UTC day the dailies were dealt for. */
  day: number;
  /** The UTC week the weekly was dealt for. */
  week: number;
  daily: ChallengeProgress[];
  weekly: ChallengeProgress[];
}

export const freshChallenges = (): ChallengeState => ({
  // -1 rather than 0 so the very first refresh always deals a set. Day 0 is a
  // real day (1 Jan 1970) and a save that claimed it would go undealt until
  // the clock ticked over.
  day: -1,
  week: -1,
  daily: [],
  weekly: [],
});

const rollSeed = (period: number, salt: number): number =>
  (Math.imul(period + 1, 2654435761) ^ Math.imul(salt + 1, 40503)) >>> 0;

/**
 * Deal `count` objectives for a period.
 *
 * Seeded off the period so everyone playing on the same day gets the same set
 * and a test can name it. The alternative — `Math.random` at deal time — makes
 * "what is today's challenge" unanswerable and makes this function untestable
 * in the same stroke.
 */
export function dealChallenges(
  pool: Challenge[],
  period: number,
  count: number,
  owns: (kind: 'layers', id: string) => boolean,
): ChallengeProgress[] {
  const rng = makeRng(rollSeed(period, pool.length));
  const left = pool.filter((c) => !c.needs || c.needs(owns));
  const out: ChallengeProgress[] = [];
  const usedGroups = new Set<string>();
  while (out.length < count && left.length > 0) {
    const i = Math.floor(rng() * left.length);
    const pick = left.splice(i, 1)[0];
    if (pick.group && usedGroups.has(pick.group)) continue;
    if (pick.group) usedGroups.add(pick.group);
    out.push({ id: pick.id, n: 0, keys: [], paid: false });
  }
  return out;
}

/** Has this objective been finished? */
export function isComplete(p: ChallengeProgress): boolean {
  const c = challengeById(p.id);
  if (!c) return false;
  return (c.key ? p.keys.length : p.n) >= c.target;
}

/**
 * Bring the dealt objectives up to date for `now`, dealing a fresh set when the
 * period has turned over.
 *
 * THE CLOCK IS NOT TRUSTED, and this is the honest version of that statement
 * rather than a claim to have solved it. `Date.now()` is the player's system
 * clock, so winding it forward deals a new set. What the `>` comparisons below
 * stop is the cheap, repeatable exploit — bounce the clock back a day and
 * forward again to re-deal the same day's objectives over and over — because a
 * period that has already been played can never be re-entered. A player
 * determined to farm can still march the clock forward, and could equally open
 * devtools and edit the save directly; pretending otherwise would mean adding a
 * server, which this game does not have and does not want.
 *
 * Returns a new state; the caller decides whether to persist it.
 */
export function refreshChallenges(
  state: ChallengeState,
  now: number,
  owns: (kind: 'layers', id: string) => boolean,
): ChallengeState {
  const day = dayIndex(now);
  const week = weekIndex(now);
  const next: ChallengeState = { ...state, daily: state.daily, weekly: state.weekly };
  if (day > state.day) {
    next.day = day;
    next.daily = dealChallenges(DAILY, day, DAILY_COUNT, owns);
  }
  if (week > state.week) {
    next.week = week;
    next.weekly = dealChallenges(WEEKLY, week, WEEKLY_COUNT, owns);
  }
  // A save written by an older build can carry an id this build no longer
  // defines. Dropping it and topping up is the only option that neither
  // crashes on the missing definition nor leaves a permanently unfinishable
  // square on the screen.
  const prune = (list: ChallengeProgress[], pool: Challenge[], period: number, count: number): ChallengeProgress[] => {
    const kept = list.filter((p) => challengeById(p.id) !== undefined);
    if (kept.length >= count) return kept.length === list.length ? list : kept;
    const have = new Set(kept.map((p) => p.id));
    for (const p of dealChallenges(pool, period, count, owns)) {
      if (kept.length >= count) break;
      if (!have.has(p.id)) {
        kept.push(p);
        have.add(p.id);
      }
    }
    return kept;
  };
  next.daily = prune(next.daily, DAILY, next.day, DAILY_COUNT);
  next.weekly = prune(next.weekly, WEEKLY, next.week, WEEKLY_COUNT);
  return next;
}

/**
 * Apply one finished round to the live objectives.
 *
 * Mutates `state` and returns the objectives that were completed BY THIS ROUND
 * — not the ones that are complete, which would pay out again on every
 * subsequent round. `paid` is set here rather than by the caller for the same
 * reason: the only way to be sure a reward is handed over exactly once is for
 * the thing that decides it to also record it.
 */
export function tickChallenges(state: ChallengeState, r: RoundRecord): Challenge[] {
  const done: Challenge[] = [];
  for (const p of [...state.daily, ...state.weekly]) {
    const c = challengeById(p.id);
    if (!c || p.paid || !c.counts(r)) continue;
    if (c.key) {
      const k = c.key(r);
      if (!p.keys.includes(k)) p.keys.push(k);
    } else {
      p.n += 1;
    }
    if (isComplete(p)) {
      p.paid = true;
      done.push(c);
    }
  }
  return done;
}

/* ----------------------------------------------------------------- mastery */

/**
 * Rounds played with one layer, and what each threshold is called.
 *
 * Rounds rather than matches because a round is the unit the player actually
 * feels, and because 3.43 rounds fit in a match — counting matches would make
 * the first tier arrive at what looks like an arbitrary moment mid-session.
 *
 * The tiers are 6 / 17 / 44 / 102 matches at the measured rate. The last one is
 * deliberately out past a hundred matches: this is the only reward in the game
 * with no ceiling in sight, and a collection game needs exactly one of those.
 * It costs nothing to leave unreached, because it is a string.
 */
export const MASTERY_TIERS = [20, 60, 150, 350];
export const MASTERY_NAMES = ['Bonded', 'Adept', 'Master', 'Legend'];

/** Highest tier reached, 0 for none. */
export function masteryTier(rounds: number): number {
  let t = 0;
  for (const need of MASTERY_TIERS) if (rounds >= need) t += 1;
  return t;
}

/** Rounds still to go before the next tier, or 0 at the top. */
export function masteryToNext(rounds: number): number {
  const t = masteryTier(rounds);
  return t >= MASTERY_TIERS.length ? 0 : MASTERY_TIERS[t] - rounds;
}

/* ------------------------------------------------------------------ titles */

export interface Title {
  id: string;
  /** What the player is called. */
  text: string;
  /** One line naming what earned it, for the picker. */
  how: string;
}

/**
 * Everything a career can be called, derived from the save rather than stored.
 *
 * DERIVED ON PURPOSE. A stored list of earned titles is a second copy of facts
 * the save already holds, and the two drift the first time a threshold moves:
 * lower a tier and existing players do not get the title they now qualify for;
 * raise one and they keep a title they no longer do. Deriving means the rule is
 * the only thing that exists.
 *
 * Only the EQUIPPED title is stored, and `progress.ts` re-validates it against
 * this list on read, so a title from a build that no longer grants it falls off
 * rather than persisting as a ghost.
 */
export interface TitleSource {
  mastery: Record<string, number>;
  bestStreak: number;
  bestEndless: number;
  challengesDone: number;
  nemesisWins: number;
  /** Display names for layer ids, so this file does not import the catalog. */
  layerName: (id: string) => string;
}

const MILESTONE_TITLES: {
  id: string;
  text: string;
  how: string;
  at: (s: TitleSource) => boolean;
}[] = [
  { id: 'streak5', text: 'Unbeaten', how: 'Five match wins in a row', at: (s) => s.bestStreak >= 5 },
  { id: 'streak12', text: 'Untouchable', how: 'Twelve match wins in a row', at: (s) => s.bestStreak >= 12 },
  { id: 'endless5', text: 'Survivor', how: 'Five deep in an endless run', at: (s) => s.bestEndless >= 5 },
  { id: 'endless15', text: 'Gauntlet Runner', how: 'Fifteen deep in an endless run', at: (s) => s.bestEndless >= 15 },
  { id: 'endless30', text: 'Immovable', how: 'Thirty deep in an endless run', at: (s) => s.bestEndless >= 30 },
  { id: 'chal10', text: 'Diligent', how: 'Ten objectives completed', at: (s) => s.challengesDone >= 10 },
  { id: 'chal50', text: 'Relentless', how: 'Fifty objectives completed', at: (s) => s.challengesDone >= 50 },
  { id: 'chal200', text: 'Devoted', how: 'Two hundred objectives completed', at: (s) => s.challengesDone >= 200 },
  { id: 'nem1', text: 'Grudge Holder', how: 'Beat your nemesis', at: (s) => s.nemesisWins >= 1 },
  { id: 'nem5', text: 'Nemesis Breaker', how: 'Beat your nemesis five times', at: (s) => s.nemesisWins >= 5 },
  { id: 'nem15', text: 'The One They Fear', how: 'Beat your nemesis fifteen times', at: (s) => s.nemesisWins >= 15 },
];

export function earnedTitles(s: TitleSource): Title[] {
  const out: Title[] = [];
  for (const [id, rounds] of Object.entries(s.mastery)) {
    const t = masteryTier(rounds);
    for (let i = 0; i < t; i++) {
      out.push({
        id: `mastery:${id}:${i}`,
        text: `${s.layerName(id)} ${MASTERY_NAMES[i]}`,
        how: `${MASTERY_TIERS[i]} rounds with ${s.layerName(id)}`,
      });
    }
  }
  for (const m of MILESTONE_TITLES) {
    if (m.at(s)) out.push({ id: m.id, text: m.text, how: m.how });
  }
  return out;
}

/* ----------------------------------------------------------------- nemesis */

export interface NemesisState {
  /** Which named rival, or '' before the first meeting. */
  id: string;
  /** Matches fought. */
  met: number;
  /** Head to head. */
  playerWins: number;
  rivalWins: number;
  /** Total matches played when they were last fought, for the cadence. */
  lastSeenAt: number;
}

export const freshNemesis = (): NemesisState => ({
  id: '',
  met: 0,
  playerWins: 0,
  rivalWins: 0,
  lastSeenAt: 0,
});

/**
 * The nemesis stays away until the ladder has a shape to interrupt. Rung 2 is
 * after Orin, which is the first point at which the player has met two
 * different problems and could plausibly have a habit worth reading.
 */
export const NEMESIS_UNLOCK_RUNG = 2;

/**
 * Matches between appearances.
 *
 * Four is close enough that the grudge is a thread rather than a curiosity, and
 * far enough that the ladder is still the main sequence. It is a spacing, not a
 * schedule: the counter is total matches played, so a player who grinds endless
 * meets them just as often as one climbing.
 */
export const NEMESIS_INTERVAL = 4;

export function nemesisDue(d: {
  rung: number;
  wins: number;
  losses: number;
  nemesis: NemesisState;
}): boolean {
  if (d.rung < NEMESIS_UNLOCK_RUNG) return false;
  return d.wins + d.losses - d.nemesis.lastSeenAt >= NEMESIS_INTERVAL;
}

/**
 * How personal it has got. Rises with the player's wins, not the rival's.
 *
 * That direction is the whole design. A nemesis that gets harder because it is
 * BEATING you is a difficulty spiral aimed at the player least able to take it;
 * one that gets harder because you keep beating it is a rival with a grudge,
 * and by construction it only escalates against a player who is winning.
 */
export const nemesisGrudge = (n: NemesisState): number => Math.min(3, n.playerWins);

/**
 * What the nemesis brings, given the class the player brings most.
 *
 * MEASURED, NOT GUESSED. Both sides driven at champion on the standard arena,
 * five real player builds per class drawn from across the catalog, 40 matches
 * per cell with the sides swapped so the harness's own bias cancels. The rival
 * preset's match win rate against that class:
 *
 *     player attack   Twin Fang 36.5  Storm Breaker 28.5  Blitz 28.5  Iron 28.0
 *     player defense  Twin Fang 52.5  Storm Breaker 52.0  Endless 43.5  Blitz 41.5
 *     player stamina  Crimson 92.0    Twin Fang 90.0      Storm 81.0   Blitz 73.0
 *     player balance  Twin Fang 56.0  Blitz 53.0          Storm 49.5   Endless 32.0
 *
 * against a cycling opponent (the mean of all six, which is what `endlessRival`
 * does today) of 27.9 / 43.1 / 75.5 / 40.8 respectively.
 *
 * TWO OF THESE ARE NOT THE ARGMAX, deliberately. At 200 matches a cell the
 * standard error is 3.5 points, so Twin Fang 52.5 vs Storm Breaker 52.0 and
 * Twin Fang 56.0 vs Blitz 53.0 are both inside the noise — picking the nominal
 * winner in each would have made Twin Fang the answer to three classes out of
 * four, and a nemesis that always brings the same bey is not counter-picking,
 * it is a preset. The substitutions cost nothing measurable and buy a rival the
 * player can actually read.
 *
 * Note what this does NOT do: it does not choose spin direction. `AiController`
 * already remembers the player's spin and counters it (`observePlayerSpin`), so
 * doing it again here would be two systems fighting over one dial.
 */
const COUNTER_BY_CLASS: Record<Archetype, string> = {
  attack: 'Twin Fang',
  defense: 'Storm Breaker',
  stamina: 'Crimson Edge',
  balance: 'Blitz Striker',
};

export function counterPreset(against: Archetype): { name: string; build: () => BeyBuild } {
  const want = COUNTER_BY_CLASS[against];
  return PRESETS.find((p) => p.name === want) ?? PRESETS[0];
}

/** The class the player has brought most often. Ties go to attack, then order. */
export function favouriteClass(rounds: Record<Archetype, number>): Archetype {
  const order: Archetype[] = ['attack', 'defense', 'stamina', 'balance'];
  let best = order[0];
  for (const a of order) if ((rounds[a] ?? 0) > (rounds[best] ?? 0)) best = a;
  return best;
}
