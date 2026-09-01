import { describe, expect, it } from 'vitest';
import { Battle } from './battle';
import type { Fighter } from './battle';
import { LAYERS, deriveStats, makeBuild } from './parts';
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

/**
 * The tests above pin the MECHANIC on one layer. These pin the SET.
 *
 * `spinSteal` stopped being two hand-placed numbers when the catalogue was
 * checked against beyblade.fandom.com/wiki/Spin_Absorption — roundness
 * qualifies, rubber amplifies, opposite spin gates. Nine layers now carry a
 * non-zero value where two used to, which turns a stat that was effectively
 * one bey's gimmick into something the sim runs across a third of the roster.
 *
 * Two things have to hold for that to be safe, and neither was previously
 * tested because neither could previously fail:
 *
 *   1. Every absorber really absorbs. A row can be edited to 0.30 and still be
 *      dead — the value only reaches physics through `deriveStats`, and a build
 *      that never trades spin never spends it. This is measured per layer, not
 *      asserted from the table.
 *   2. The opposite-spin gate holds for ALL of them. It used to be checkable by
 *      eye on one row; now it is a property of a set, and one row with a stray
 *      `sameSteal` would delete the spin-direction decision that spin.test.ts
 *      and `chooseSpinDir` are both built on.
 */
describe('the absorber set', () => {
  /** Every layer the catalogue says can absorb, in table order. */
  const absorbers = LAYERS.filter((l) => l.spinSteal > 0);

  it('has more than the two layers it started with', () => {
    // Guards the direction of travel. If this ever drops back to two, the
    // transcription block above LAYERS was reverted rather than argued with.
    expect(absorbers.length).toBeGreaterThan(2);
  });

  it('gives every absorber real absorption in opposite spin', () => {
    // Measured, not read off the table. A value that is present in the data and
    // absent in the fight is the failure mode this whole suite exists for, and
    // it is exactly what happened on the four-seed roster sweep, where Hells
    // Scythe moved by 0.0 and looked disconnected. It was not: it absorbs 9.7%
    // of its launch spin here. The sweep just could not resolve it.
    const rows: string[] = [];
    for (const l of absorbers) {
      let stolen = 0;
      let frac = 0;
      for (let seed = 0; seed < 12; seed++) {
        const r = run(true, seed * 313 + 11, l.id);
        stolen += r.stolen;
        frac += r.stolen / (r.stolen + 1e-9);
      }
      const avg = stolen / 12;
      rows.push(`${l.id.padEnd(13)} steal ${l.spinSteal.toFixed(2)}  absorbed ${avg.toFixed(1)}`);
      expect(avg, `${l.id} absorbs nothing despite spinSteal ${l.spinSteal}`).toBeGreaterThan(0);
      expect(frac).toBeGreaterThan(0);
    }
    console.log(`\n  ${rows.join('\n  ')}`);
  });

  it('keeps the opposite-spin gate absolute for every absorber but the vampire', () => {
    // The catalogue-wide version of "absorbs nothing from a same-spin
    // opponent". Widening the set is what makes this worth pinning: a single
    // extra `sameSteal` anywhere in the table and the launch decision the whole
    // spin suite measures stops being a decision.
    for (const l of absorbers) {
      if (l.id === VAMPIRE) continue;
      expect(run(false, 5, l.id).stolen, `${l.id} in a same-spin matchup`).toBe(0);
    }
  });

  it('leaves every non-absorber on exactly zero', () => {
    // The other half of the set, and the one that keeps this a transcription:
    // absorption is worth roughly ten points of win rate to a stamina build, so
    // the pressure is always toward one more row. `deriveStats` is the thing
    // asserted on rather than the table, because a driver or disc that started
    // contributing steal would pass a table check and fail this.
    for (const l of LAYERS) {
      if (l.spinSteal > 0) continue;
      const stats = deriveStats(makeBuild(l.id, 'spread', 'needle'));
      expect(stats.spinSteal, `${l.id} leaked steal through deriveStats`).toBe(0);
      expect(stats.sameSteal, `${l.id} leaked sameSteal`).toBe(0);
    }
  });

  it('still ranks the rubber layer above everything sourced on shape alone', () => {
    // The measured version of the ordering partsCatalogue.test.ts pins in the
    // data. Fafnir's rubber is the source's amplifier, so it must out-absorb
    // the round blades in the fight and not merely on paper.
    const absorbed = (id: string): number => {
      let t = 0;
      for (let seed = 0; seed < 12; seed++) t += run(true, seed * 313 + 11, id).stolen;
      return t / 12;
    };
    const fafnir = absorbed('fafnir');
    for (const id of ['wizardrod', 'wizardarrow', 'silverwolf', 'knightshield']) {
      expect(fafnir, `fafnir vs ${id}`).toBeGreaterThan(absorbed(id));
    }
  });
});
