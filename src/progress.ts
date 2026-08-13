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
});

export class Progress {
  data: ProgressData;

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
      }
    } else {
      this.data.losses += 1;
      this.data.streak = 0;
    }
    this.save();
    return gained;
  }
}
