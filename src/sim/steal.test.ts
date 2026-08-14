import { describe, expect, it } from 'vitest';
import { Battle } from './battle';
import type { Fighter } from './battle';
import { LAYERS, makeBuild } from './parts';
import type { LaunchParams } from './types';

/**
 * Spin absorption is the one mechanic in the game that can make a top's spin go
 * *up*, so it needs its invariants pinned: it must actually work, it must only
 * work against an opposite-spin opponent, and it must never exceed launch spin.
 *
 * The opposite-spin rule has exactly one exception — the vampire layer's
 * `sameSteal` — so these also pin the shape of the exception: it is strictly
 * weaker than its own opposite-spin case, and it belongs to exactly one layer.
 * A stat that quietly spread across the catalog would delete the spin-direction
 * decision the rest of the file exists to protect.
 */

/** The one layer allowed to absorb in a same-spin matchup. */
const VAMPIRE = 'nosferu';

const launch = (angle: number): LaunchParams => ({
  power: 0.85,
  entryAngle: angle,
  entryDepth: 0.05,
});

/** Runs an absorber against an attacker and reports what the absorber did. */
function run(opposite: boolean, seed = 5, absorberLayer = 'fafnir') {
  const absorber = makeBuild(absorberLayer, 'spread', 'needle');
  const attacker = makeBuild('ragnaruk', 'blitz', 'volcanic');
  const fighters: Fighter[] = [
    { id: 'absorber', name: 'A', build: absorber, spinDir: 1 },
    { id: 'attacker', name: 'B', build: attacker, spinDir: opposite ? -1 : 1 },
  ];
  const battle = new Battle(fighters, { seed, pointsToWin: 999 });
  battle.startRound({ absorber: launch(0), attacker: launch(Math.PI) });

  const a = battle.beys[0];
  let peakOverLaunch = 0;
  while (battle.phase === 'battle') {
    battle.update(1 / 60);
    peakOverLaunch = Math.max(peakOverLaunch, Math.abs(a.spin) / a.spinAtLaunch);
  }
  return { stolen: a.spinStolen, peakOverLaunch, time: battle.roundTime };
}

describe('spin absorption', () => {
  it('absorbs spin from an opposite-spin opponent', () => {
    const opp = run(true);
    expect(opp.stolen).toBeGreaterThan(0);
  });

  it('absorbs nothing from a same-spin opponent', () => {
    // The blades travel together at the contact point, so there is nothing to
    // bite into. This restriction is what keeps it from being a free stat.
    const same = run(false);
    expect(same.stolen).toBe(0);
  });

  it('lets the vampire absorb same-spin, but strictly less than opposite-spin', () => {
    // The named exception. It has to be worth something — a vampire whose
    // mechanic can be switched off by matching its spin direction is just an
    // ordinary absorber — and it has to stay clearly worse than the matchup it
    // is built for, or the launch choice stops mattering against it.
    let same = 0;
    let opp = 0;
    for (let seed = 0; seed < 20; seed++) {
      same += run(false, seed * 313 + 11, VAMPIRE).stolen;
      opp += run(true, seed * 313 + 11, VAMPIRE).stolen;
    }
    console.log(
      `\n  ${VAMPIRE} absorbed — same ${(same / 20).toFixed(1)} vs opposite ${(opp / 20).toFixed(1)}`,
    );
    expect(same).toBeGreaterThan(0);
    expect(same).toBeLessThan(opp);
  });

  it('gives no other layer a same-spin exception', () => {
    // Left unpinned, `sameSteal` is the kind of stat that gets sprinkled onto
    // the next absorber "for flavour", and the second one to have it is the
    // point where choosing a spin direction stops being a decision.
    const withSame = LAYERS.filter((l) => (l.sameSteal ?? 0) > 0).map((l) => l.id);
    expect(withSame).toEqual([VAMPIRE]);
  });

  it('never lets a top exceed its launch spin', () => {
    // Uncapped, a long absorbing exchange ratchets upward and the round never
    // ends — the cap is what keeps absorption dramatic rather than degenerate.
    for (let seed = 0; seed < 25; seed++) {
      const r = run(true, seed * 131 + 7);
      expect(r.peakOverLaunch).toBeLessThanOrEqual(1.0001);
    }
  });

  it('gives a non-absorbing layer no absorption at all', () => {
    const fighters: Fighter[] = [
      { id: 'a', name: 'A', build: makeBuild('aegis', 'wall', 'bastion'), spinDir: 1 },
      { id: 'b', name: 'B', build: makeBuild('ragnaruk', 'blitz', 'volcanic'), spinDir: -1 },
    ];
    const battle = new Battle(fighters, { seed: 9, pointsToWin: 999 });
    battle.startRound({ a: launch(0), b: launch(Math.PI) });
    while (battle.phase === 'battle') battle.update(1 / 60);
    expect(battle.beys[0].spinStolen).toBe(0);
  });

  it('makes opposite-spin the absorber’s preferred matchup', () => {
    // The whole point: an absorber should *want* the pairing that would drain
    // anything else. If it doesn't survive longer, the mechanic is cosmetic.
    let oppTime = 0;
    let sameTime = 0;
    for (let seed = 0; seed < 20; seed++) {
      oppTime += run(true, seed * 313 + 11).time;
      sameTime += run(false, seed * 313 + 11).time;
    }
    console.log(
      `\n  absorber survival — opposite ${(oppTime / 20).toFixed(1)}s vs same ${(sameTime / 20).toFixed(1)}s`,
    );
    expect(oppTime).toBeGreaterThan(sameTime);
  });
});
