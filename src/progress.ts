import { LADDER, STARTING_UNLOCKS } from './ladder';
import { matchReward } from './economy';
import type { Unlocks } from './ladder';

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
