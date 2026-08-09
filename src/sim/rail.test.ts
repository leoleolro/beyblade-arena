import { describe, expect, it } from 'vitest';
import { Battle } from './battle';
import type { Fighter } from './battle';
import { STANDARD, XRAIL } from './arena';
import * as C from './constants';
import { makeRng } from './math';
import { PRESETS, makeBuild } from './parts';
import type { LaunchParams } from './types';

/**
 * The rail is the one arena feature that changes physics, so it needs the same
 * treatment as the move triangle: prove it does what it claims, and prove it
 * hasn't broken the pacing and safety invariants everything else depends on.
 */

function fight(arenaSpec: typeof STANDARD, seed: number, opposite = true) {
  const rng = makeRng(seed);
  const fighters: Fighter[] = [
    { id: 'a', name: 'A', build: makeBuild('valtryek', 'heavy', 'xtreme'), spinDir: 1 },
    {
      id: 'b',
      name: 'B',
      build: makeBuild('spryzen', 'gravity', 'atomic'),
      spinDir: opposite ? -1 : 1,
    },
  ];
  const battle = new Battle(fighters, { seed, pointsToWin: 999, arena: arenaSpec });
  const base = rng() * Math.PI * 2;
  const mk = (angle: number): LaunchParams => ({
    power: 0.8 + rng() * 0.2,
    entryAngle: angle,
    entryDepth: rng() * 0.15,
  });
  battle.startRound({ a: mk(base), b: mk(base + Math.PI) });

  let maxSpeed = 0;
  let maxRadius = 0;
  while (battle.phase === 'battle') {
    battle.update(1 / 60);
    for (const bey of battle.beys) {
      if (!bey.alive) continue;
      maxSpeed = Math.max(maxSpeed, Math.hypot(bey.vel.x, bey.vel.y));
      maxRadius = Math.max(maxRadius, Math.hypot(bey.pos.x, bey.pos.y));
    }
  }
  const rides = battle.beys.reduce((n, b) => n + b.railRides, 0);
  return { battle, rides, maxSpeed, maxRadius, time: battle.roundTime };
}

describe('x-rail', () => {
  it('never engages in an arena without a rail', () => {
    for (let s = 0; s < 20; s++) {
      expect(fight(STANDARD, s * 97 + 3).rides).toBe(0);
    }
  });

  it('engages regularly in the rail arena', () => {
    let total = 0;
    for (let s = 0; s < 20; s++) total += fight(XRAIL, s * 97 + 3).rides;
    expect(total).toBeGreaterThan(0);
    console.log(`\n  rail engagements across 20 rounds: ${total}`);
  });

  it('respects its own speed ceiling', () => {
    // The rail drives speed up; without the cap it would fling tops out of the
    // stadium on the first ride and the arena would be unplayable.
    for (let s = 0; s < 30; s++) {
      const r = fight(XRAIL, s * 313 + 11);
      expect(r.maxSpeed).toBeLessThanOrEqual(C.SMASH_MAX + XRAIL.rail!.maxSpeed + 0.5);
    }
  });

  it('keeps tops inside the stadium', () => {
    // Holding a top on the band must not let it tunnel through the rim.
    for (let s = 0; s < 30; s++) {
      const r = fight(XRAIL, s * 313 + 11);
      expect(r.maxRadius).toBeLessThan(C.EXIT_RADIUS + 0.4);
    }
  });

  it('does not wreck pacing', () => {
    // Measured against the SAME pairings on the plain dish. Comparing the rail
    // arena's numbers to the global pacing report would be comparing different
    // matchup sets and would attribute the difference to the wrong cause.
    const sample = (arena: typeof STANDARD): { p50: number; under2: number } => {
      const lengths: number[] = [];
      for (let i = 0; i < PRESETS.length; i++) {
        for (let s = 0; s < 12; s++) {
          const rng = makeRng(s * 733 + i * 97);
          const fighters: Fighter[] = [
            { id: 'a', name: 'A', build: PRESETS[i].build(), spinDir: 1 },
            {
              id: 'b',
              name: 'B',
              build: PRESETS[(i + 1) % PRESETS.length].build(),
              spinDir: -1,
            },
          ];
          const battle = new Battle(fighters, { seed: s, pointsToWin: 999, arena });
          const base = rng() * Math.PI * 2;
          const mk = (a: number): LaunchParams => ({
            power: 0.7 + rng() * 0.3,
            entryAngle: a,
            entryDepth: rng() * 0.2,
          });
          battle.startRound({ a: mk(base), b: mk(base + Math.PI) });
          while (battle.phase === 'battle') battle.update(1 / 60);
          lengths.push(battle.roundTime);
        }
      }
      lengths.sort((x, y) => x - y);
      return {
        p50: lengths[Math.floor(lengths.length / 2)],
        under2: lengths.filter((x) => x < 2).length / lengths.length,
      };
    };

    const plain = sample(STANDARD);
    const rail = sample(XRAIL);
    console.log(
      `  pacing on these pairings — plain p50 ${plain.p50.toFixed(1)}s / under2 ${(plain.under2 * 100).toFixed(1)}%` +
        `  |  x-rail p50 ${rail.p50.toFixed(1)}s / under2 ${(rail.under2 * 100).toFixed(1)}%`,
    );

    // The rail arena is DELIBERATELY more violent than the plain dish: its
    // whole purpose is to manufacture decisive moments, and decisive moments
    // end rounds. Measured, it roughly doubles fast finishes (~8% -> ~22%).
    // Tuning that away means tuning the mechanic away — at the speeds where
    // fast finishes matched the plain dish, the rail stopped slinging tops and
    // just held them in a circle. So this asserts the rail arena's own sensible
    // bounds rather than pretending it should behave like a different arena.
    expect(rail.p50).toBeGreaterThan(5);
    expect(rail.under2).toBeLessThan(0.32);
    // It must still be recognisably a Beyblade match, not a coin flip.
    expect(rail.under2).toBeLessThan(0.5);
  });
});
