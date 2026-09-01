import { LADDER, STARTING_UNLOCKS, nemesisById, nemesisRival, pickNemesis } from './ladder';
import {
  cupAvailable,
  cupFinished,
  cupInProgress,
  cupRival,
  cupSeedForDay,
  freshCup,
  mergeCup,
  recordCupMatch,
  startCup,
} from './tournament';
import type { CupResult, CupState } from './tournament';
import { CHALLENGE_REWARD, matchReward } from './economy';
import {
  earnedTitles,
  favouriteClass,
  freshChallenges,
  freshNemesis,
  masteryTier,
  nemesisDue,
  refreshChallenges as rollChallengePeriod,
  tickChallenges,
} from './career';
import { dayIndex } from './career';
import { LAYERS } from './sim/parts';
import type { NemesisSpec, Rival, Unlocks } from './ladder';
import type { Challenge, ChallengeState, RoundRecord, Title } from './career';
import type { NemesisState } from './career';
import type { Archetype } from './sim/types';

/**
 * Career progress, persisted to localStorage.
 *
 * Storage is treated as unreliable on purpose: private browsing, a full quota
 * and disabled site data all throw, and a save failure should cost the player
 * their history rather than the session they're in the middle of. Every access
 * is wrapped, and the game runs identically with storage unavailable — it just
 * forgets between reloads.
 */

const KEY = 'beyblade-arena.progress.v1';

export interface ProgressData {
  /** Index of the next rival on the ladder. Equals LADDER.length when cleared. */
  rung: number;
  layers: string[];
  discs: string[];
  drivers: string[];
  skins: string[];
  wins: number;
  losses: number;
  /** Best consecutive match wins. */
  bestStreak: number;
  streak: number;
  /** Spendable currency. Earned only — there is no purchase path. */
  coins: number;
  /**
   * The current shop offer, stored as bare references rather than resolved
   * slots. Prices and rarities are re-derived on read, so a save written before
   * a part was retuned shows the new price instead of an outdated one.
   */
  offer: { kind: keyof Unlocks; id: string }[];
  /**
   * How many endless rivals have been beaten in the CURRENT run. Reset to 0 by
   * a loss — that reset is what makes an endless run a run rather than a
   * counter that only ever goes up.
   */
  endless: number;
  /** Deepest endless run ever reached. The number worth bragging about. */
  bestEndless: number;

  /* ------------------------------------------------------------- career */
  /*
   * Everything below was added after the save format shipped, and every one of
   * them is optional-by-construction rather than optional-by-type: `load`
   * merges onto a fresh object, so a save written before this block existed
   * comes back with these at their defaults and nothing downstream sees an
   * `undefined`. There is deliberately no `.v2` key — bumping it would orphan
   * every existing career to add a feature that cannot break one.
   */

  /**
   * Rounds played with each layer id.
   *
   * Usage only. It grants titles and nothing else — see the standing rule at
   * the top of `career.ts` about why a progression stat bonus is the one thing
   * this game cannot add.
   */
  mastery: Record<string, number>;
  /**
   * Rounds played in each build class. Two consumers: the class objectives and
   * the nemesis's counter-pick, which is the only thing in the game that reads
   * the player's habits back to them.
   */
  classRounds: Record<Archetype, number>;
  /** The equipped title's id, or '' for none. Re-validated on every read. */
  title: string;
  /** Lifetime objectives completed. Feeds the milestone titles. */
  challengesDone: number;
  /** Today's and this week's objectives, and how far along they are. */
  challenges: ChallengeState;
  /** The recurring rival: who, how often, and the head-to-head. */
  nemesis: NemesisState;
  /** The daily cup: the bracket, how far in, and the lifetime record. */
  cup: CupState;
}

/** What one recorded round did, for the result screen to announce. */
export interface RoundOutcome {
  /** Objectives finished by this round. Each is paid exactly once. */
  completed: Challenge[];
  /** Coins those objectives paid. */
  coins: number;
  /**
   * The mastery tier this round crossed, 1-based, or 0 for none. Carried
   * separately from the title list because the moment is what matters: a title
   * quietly appearing in a picker is not a reward anyone notices.
   */
  masteryTier: number;
  /** The layer that tier belongs to, when one was crossed. */
  masteryLayerId: string;
}

const fresh = (): ProgressData => ({
  rung: 0,
  layers: [...STARTING_UNLOCKS.layers],
  discs: [...STARTING_UNLOCKS.discs],
  drivers: [...STARTING_UNLOCKS.drivers],
  skins: [...STARTING_UNLOCKS.skins],
  wins: 0,
  losses: 0,
  bestStreak: 0,
  streak: 0,
  // Enough for one Scrap Crate on a fresh save, so the mechanic is discovered
  // by using it rather than by reading about it.
  coins: 60,
  // Empty, not pre-rolled: the roll needs to know what the player owns, and
  // Game fills it on first read.
  offer: [],
  endless: 0,
  bestEndless: 0,

  // Career defaults. `load` merges a save onto this object, so a career
  // written before any of these existed comes back with them filled in and
  // nothing downstream ever sees an `undefined`. That is the whole reason
  // there is no save-version bump for this feature.
  mastery: {},
  classRounds: { attack: 0, defense: 0, stamina: 0, balance: 0 },
  title: '',
  challengesDone: 0,
  challenges: freshChallenges(),
  nemesis: freshNemesis(),
  cup: freshCup(),
});

export class Progress {
  data: ProgressData;

  /**
   * Suppress every write, for the session-only dev unlock.
   *
   * It lives here rather than at the call site because "just don't call save()"
   * is not something the caller can promise. Granting everything and skipping
   * the save looked airtight and was not: the shop rolls its offer lazily on
   * first read and saves it, so simply opening the garage wrote the granted
   * roster to disk, and reloading without the flag showed a career with all
   * eleven layers and the ladder cleared. Verified by doing exactly that.
   *
   * One flag on the object that owns the storage is the only version of this
   * that cannot be defeated by a save path nobody remembered.
   */
  ephemeral = false;

  constructor() {
    this.data = Progress.load();
  }

  private static load(): ProgressData {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return fresh();
      const parsed = JSON.parse(raw) as Partial<ProgressData>;
      // Merge onto a fresh object so a save written by an older build — or a
      // hand-edited one — can't leave a field undefined and crash the garage.
      // Unlock lists are UNIONED with the starting set rather than replaced:
      // when a new build grows the starting roster (the player-designed layer
      // line, for instance), an old save must gain it too — the old behaviour
      // kept whatever list was saved and silently locked players out of parts
      // the game now says everyone starts with.
      const base = fresh();
      const union = (a: string[], b?: string[]): string[] => [
        ...new Set([...a, ...(b ?? [])]),
      ];
      return {
        ...base,
        ...parsed,
        layers: union(base.layers, parsed.layers),
        discs: union(base.discs, parsed.discs),
        drivers: union(base.drivers, parsed.drivers),
        skins: union(base.skins, parsed.skins),
        // A spread cannot repair a cup: a save from before the cup existed has
        // no `cup` at all, and one written mid-run can hold a bracket whose
        // entrants no longer exist in the catalogue. `mergeCup` is the only
        // thing that decides whether a saved run is still playable, so it runs
        // on the raw value rather than trusting the spread.
        cup: mergeCup((parsed as { cup?: unknown }).cup),
      };
    } catch {
      return fresh();
    }
  }

  save(): void {
    if (this.ephemeral) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // Storage unavailable. The session continues; only history is lost.
    }
  }

  reset(): void {
    this.data = fresh();
    this.save();
  }

  has(kind: keyof Unlocks, id: string): boolean {
    return (this.data[kind] as string[]).includes(id);
  }

  /** Spend, if affordable. Returns false and changes nothing otherwise. */
  spend(amount: number): boolean {
    if (this.data.coins < amount) return false;
    this.data.coins -= amount;
    this.save();
    return true;
  }

  credit(amount: number): void {
    this.data.coins += amount;
    this.save();
  }

  setOffer(slots: { kind: keyof Unlocks; id: string }[]): void {
    this.data.offer = slots;
    this.save();
  }

  /** Grant an unlock. Returns false when it was already owned. */
  grant(kind: keyof Unlocks, id: string): boolean {
    const list = this.data[kind] as string[];
    if (list.includes(id)) return false;
    list.push(id);
    this.save();
    return true;
  }

  get cleared(): boolean {
    return this.data.rung >= LADDER.length;
  }

  /**
   * Record a finished match. Returns what was newly unlocked, so the result
   * screen can show it — an unlock the player doesn't notice may as well not
   * have happened.
   */
  /**
   * Record one finished round, and report what it earned.
   *
   * ROUNDS, NOT MATCHES, and that split is deliberate. Objectives and mastery
   * are about what the player DID — the builds they brought, how they won —
   * and a match is too coarse to see any of it. `recordMatch` still owns coins,
   * unlocks and the ladder; this owns everything that reads the play itself.
   *
   * Everything it touches is usage. Nothing here returns a stat: see the
   * standing rule at the top of `career.ts` about why a progression bonus is
   * the one thing this game cannot add, given that every balance number in the
   * repo is measured against a fixed catalogue.
   */
  recordRound(r: RoundRecord, now: number): RoundOutcome {
    const d = this.data;

    // A new day or week deals fresh objectives before the round is counted, so
    // a round played across midnight pays into the day it belongs to rather
    // than into a set that is about to be discarded.
    d.challenges = rollChallengePeriod(d.challenges, now, (kind, id) =>
      this.owns(kind, id),
    );

    const before = masteryTier(d.mastery[r.layerId] ?? 0);
    d.mastery[r.layerId] = (d.mastery[r.layerId] ?? 0) + 1;
    d.classRounds[r.archetype] = (d.classRounds[r.archetype] ?? 0) + 1;
    const after = masteryTier(d.mastery[r.layerId]);

    const completed = tickChallenges(d.challenges, r);
    d.challengesDone += completed.length;
    // Paid per objective at its own scope's rate — a weekly is worth more than
    // a daily, and summing here rather than multiplying keeps that true if the
    // two rates ever diverge further.
    const coins = completed.reduce((sum, c) => sum + CHALLENGE_REWARD[c.scope], 0);
    d.coins += coins;

    if (r.opponent === 'nemesis' && r.decidedMatch) {
      d.nemesis.met += 1;
      d.nemesis.lastSeenAt = d.wins + d.losses;
      if (r.won) d.nemesis.playerWins += 1;
      else d.nemesis.rivalWins += 1;
    }

    this.save();
    return {
      completed,
      coins,
      masteryTier: after > before ? after : 0,
      masteryLayerId: after > before ? r.layerId : '',
    };
  }

  /** Does the career own this part? Used to keep objectives achievable. */
  private owns(kind: 'layers', id: string): boolean {
    return this.data[kind].includes(id);
  }

  /**
   * Every title this career has earned, derived rather than stored.
   *
   * See `earnedTitles` for why deriving is the point: a stored list is a second
   * copy of facts the save already holds, and the two drift the first time a
   * threshold moves.
   */
  titles(): Title[] {
    return earnedTitles({
      mastery: this.data.mastery,
      bestStreak: this.data.bestStreak,
      bestEndless: this.data.bestEndless,
      challengesDone: this.data.challengesDone,
      nemesisWins: this.data.nemesis.playerWins,
      layerName: (id) => LAYERS.find((l) => l.id === id)?.name ?? id,
    });
  }

  /**
   * Equip a title, or '' for none.
   *
   * Silently declines a title that is not earned rather than throwing: the
   * thresholds can move, and a save that equipped something now unearned should
   * quietly fall back rather than break the garage.
   */
  equipTitle(id: string): void {
    if (id !== '' && !this.titles().some((t) => t.id === id)) return;
    this.data.title = id;
    this.save();
  }

  /** The equipped title, re-validated on read. */
  equippedTitle(): Title | null {
    return this.titles().find((t) => t.id === this.data.title) ?? null;
  }

  /* -------------------------------------------------------------- the cup */

  /** Can a cup be entered right now? One run a day, past the unlock rung. */
  canEnterCup(now: number): boolean {
    return cupAvailable(this.data.cup, this.data.rung, now);
  }

  /** True while a bracket is part-played and waiting to be resumed. */
  get cupRunning(): boolean {
    return cupInProgress(this.data.cup);
  }

  /** True once this run is over, won or knocked out. */
  get cupOver(): boolean {
    return cupFinished(this.data.cup);
  }

  /**
   * Draw a bracket and enter it.
   *
   * The seed comes from the DAY rather than from the clock, so everyone
   * playing on the same date meets the same field — which is what makes a
   * daily cup a thing players can compare, and what stops a reload rerolling a
   * bad draw.
   */
  enterCup(now: number): void {
    // REFUSED MID-RUN, and this guard is load-bearing. `cupAvailable` answers
    // "is the cup playable", which is deliberately TRUE while a bracket is
    // half-played so a run can be resumed — but `startCup` redraws
    // unconditionally, so gating a new draw on that predicate would silently
    // eat a player's live bracket and count it as a second entry.
    if (this.cupRunning || !this.canEnterCup(now)) return;
    this.data.cup = startCup(this.data.cup, cupSeedForDay(dayIndex(now)));
    this.save();
  }

  /** The cup opponent to fight next, or null when no run is live. */
  cupOpponent(): ReturnType<typeof cupRival> {
    return cupRival(this.data.cup);
  }

  /** Record a finished cup match and bank whatever the run has now earned. */
  recordCup(won: boolean, now: number): CupResult {
    // `recordCupMatch` MUTATES the state and marks the purse paid itself —
    // deliberately, for the reason `tickChallenges` gives: the only way to be
    // certain a reward is handed over exactly once is for the thing that
    // decides it to also record it. So there is nothing to assign back here.
    const out = recordCupMatch(this.data.cup, won, now);
    this.data.coins += out.coins;
    this.save();
    return out;
  }

  /** Is the recurring rival due to show up instead of the ladder opponent? */
  nemesisIsDue(): boolean {
    return nemesisDue({
      rung: this.data.rung,
      wins: this.data.wins,
      losses: this.data.losses,
      nemesis: this.data.nemesis,
    });
  }

  /**
   * The recurring rival, choosing one on first meeting.
   *
   * The pick is made from the class the player brings MOST, which is the only
   * thing in the game that reads a habit back to them — the same idea as the
   * spin-direction read in `ai.ts`, one layer up.
   */
  nemesis(): Rival & { spec: NemesisSpec } {
    const played = this.data.wins + this.data.losses;
    if (!this.data.nemesis.id) {
      // Fixed at the first meeting and stored, because a nemesis who changes
      // identity is a stranger with the same name.
      this.data.nemesis.id = pickNemesis(played).id;
      this.save();
    }
    const spec = nemesisById(this.data.nemesis.id) ?? pickNemesis(played);
    // The counter-pick reads the class the player brings MOST — the only place
    // besides the spin read in `ai.ts` where the game plays a habit back.
    const favourite = favouriteClass(this.data.classRounds);
    return { ...nemesisRival(spec, this.data.nemesis, favourite), spec };
  }

  recordMatch(won: boolean): Unlocks {
    const gained: Unlocks = {};
    // The offer refreshes free on every finished match, win or lose. That is
    // the TFT rhythm: the shop is something you look at between rounds, not a
    // thing you pay to look at. Rerolling is for impatience, not for access.
    this.data.offer = [];
    // Paid before the streak is mutated below, so a win is rewarded for the
    // streak it *extended* rather than the one it started.
    this.data.coins += matchReward(won, this.data.streak);
    if (won) {
      this.data.wins += 1;
      this.data.streak += 1;
      this.data.bestStreak = Math.max(this.data.bestStreak, this.data.streak);

      // Only advancing the ladder grants parts. Replaying a beaten rival is
      // still worth doing for practice, but it can't farm the catalog.
      if (!this.cleared) {
        const rival = LADDER[this.data.rung];
        for (const kind of ['layers', 'discs', 'drivers', 'skins'] as const) {
          for (const id of rival.unlocks[kind] ?? []) {
            if (!this.data[kind].includes(id)) {
              this.data[kind].push(id);
              (gained[kind] ??= []).push(id);
            }
          }
        }
        this.data.rung += 1;
      } else {
        // Past the ladder, a win pushes the endless run one deeper. No unlocks
        // here by design — the catalog is already complete, and handing out a
        // part would duplicate a ladder grant.
        this.data.endless += 1;
        this.data.bestEndless = Math.max(this.data.bestEndless, this.data.endless);
      }
    } else {
      this.data.losses += 1;
      this.data.streak = 0;
      // A loss ENDS the run. This is the one place the game takes something
      // back, and it is what gives an endless ladder stakes: without it the
      // depth counter only ever rises and "how far can you get" has no answer.
      // Nothing else is lost — parts, coins and the cleared ladder all stay.
      this.data.endless = 0;
    }
    this.save();
    return gained;
  }
}
