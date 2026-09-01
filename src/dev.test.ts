import { beforeEach, describe, expect, it } from 'vitest';
import { Progress } from './progress';
import { LADDER } from './ladder';
import { CUP_PURSE, CUP_ROUNDS, CUP_UNLOCK_RUNG } from './tournament';
import { grantCoins, resetCup, rungOptions, setRung, summonNemesis, winCup } from './dev';

/**
 * The developer actions.
 *
 * WHY THESE ARE TESTED AT ALL, when they are a testing tool themselves: each
 * one is a small mutation across two or three systems with an ordering trap,
 * and a broken dev action is worse than a missing one — it puts you in a state
 * that looks like the game and is not, and then you debug the game.
 *
 * The two traps below are the ones actually written into `dev.ts`, so these
 * exist to keep the comments true.
 */

function installStorage(): void {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

const NOW = 1_700_000_000_000;

describe('developer actions', () => {
  beforeEach(installStorage);

  it('jumping the ladder also grants everything the skipped rungs unlock', () => {
    // THE TRAP. Arriving at a late rung with a starter roster is not the state
    // that rung describes — the ladder IS the unlock schedule, so a jump
    // without the grants tests a game that cannot happen.
    const p = new Progress();
    const before = p.data.layers.length;
    setRung(p, LADDER.length);

    expect(p.data.rung).toBe(LADDER.length);
    expect(p.data.layers.length, 'no parts were granted').toBeGreaterThan(before);
    for (const rival of LADDER) {
      for (const id of rival.unlocks.layers ?? []) {
        expect(p.data.layers, `${id} was never granted`).toContain(id);
      }
    }
  });

  it('clamps the rung to the ladder rather than running off the end', () => {
    const p = new Progress();
    setRung(p, 9999);
    expect(p.data.rung).toBe(LADDER.length);
    setRung(p, -5);
    expect(p.data.rung).toBe(0);
  });

  it('offers one option per rung plus the cleared state', () => {
    expect(rungOptions().length).toBe(LADDER.length + 1);
  });

  it('resetting the cup clears the DAY, not just the bracket', () => {
    // THE OTHER TRAP. `lastDay` is the gate: clearing the field alone leaves
    // the day still spent and the panel still refusing to deal a new one.
    const p = new Progress();
    p.data.rung = CUP_UNLOCK_RUNG;
    p.enterCup(NOW);
    for (let i = 0; i < CUP_ROUNDS; i++) p.recordCup(true, NOW);
    expect(p.canEnterCup(NOW), 'the day should be spent').toBe(false);

    resetCup(p);
    expect(p.canEnterCup(NOW), 'the day was not released').toBe(true);
    expect(p.data.cup.field).toEqual([]);
  });

  it('winning the cup pays the real purse, through the real path', () => {
    const p = new Progress();
    p.data.rung = CUP_UNLOCK_RUNG;
    const before = p.data.coins;
    p.enterCup(NOW);
    winCup(p);
    expect(p.data.coins - before).toBe(CUP_PURSE[CUP_ROUNDS]);
    expect(p.data.cup.won).toBe(1);
  });

  it('summoning the nemesis actually makes them due', () => {
    const p = new Progress();
    expect(p.nemesisIsDue()).toBe(false);
    summonNemesis(p);
    expect(p.nemesisIsDue(), 'the nemesis did not become due').toBe(true);
  });

  it('grants coins without ever going negative', () => {
    const p = new Progress();
    grantCoins(p, 1000);
    const high = p.data.coins;
    expect(high).toBeGreaterThan(1000);
    grantCoins(p, -999_999);
    expect(p.data.coins, 'coins went negative').toBe(0);
  });
});
