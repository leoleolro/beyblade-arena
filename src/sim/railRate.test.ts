import { describe, expect, it } from 'vitest';
import { Battle } from './battle';
import type { Fighter } from './battle';
import { arenaById } from './arena';
import { AiController } from '../ai';
import { PRESETS } from './parts';
import { makeRng } from './math';

/**
 * How often the X-Rail actually fires.
 *
 * Written while researching the real Beyblade X rail (docs/PHYSICS.md) and kept
 * because the number turned out to be the whole story. The rail is the arena's
 * headline mechanic; whether it is a *rhythm* or a *rare event* is decided
 * entirely by `duration` and `cooldown` in the arena spec, and nothing else in
 * the suite would notice if a tuning pass turned it into either extreme.
 *
 * Measured across 120 AI-played rounds, all preset pairings:
 *
 *     rides per round (both tops)   1.98
 *     rides per top per round       0.99
 *     most rides by one top         3
 *     mean round length             5.73 s
 *     rides per second per top      0.17
 *     median gap between one
 *       top's consecutive rides     3.93 s
 *
 * For contrast, the real toy the rail is modelled on: the owner counted five
 * dashes in under three seconds — roughly 1.7 per second, an order of magnitude
 * more often than this. That gap is a design question, not a bug, and it is
 * argued out in docs/PHYSICS.md. These bounds are deliberately wide: they exist
 * to catch a rail that has silently stopped firing or started firing
 * constantly, not to freeze a number that the physics work will deliberately
 * move.
 */
function play(arenaId: string, rounds = 120): {
  rounds: number;
  rides: number;
  seconds: number;
} {
  let played = 0;
  let rides = 0;
  let seconds = 0;

  for (let seed = 0; seed < rounds; seed++) {
    const rng = makeRng(seed + 1);
    const aiA = new AiController('a', 'champion', makeRng(seed * 3 + 1));
    const aiB = new AiController('b', 'champion', makeRng(seed * 7 + 2));
    const fighters: Fighter[] = [
      { id: 'a', name: 'A', build: PRESETS[seed % PRESETS.length].build(), spinDir: 1 },
      {
        id: 'b',
        name: 'B',
        build: PRESETS[(seed + 3) % PRESETS.length].build(),
        spinDir: seed % 2 ? -1 : 1,
      },
    ];
    const battle = new Battle(fighters, {
      seed,
      arena: arenaById(arenaId),
      // One round per seed — a ride is a property of a round, and stopping at a
      // match win would sample the short ones more often.
      pointsToWin: 999,
    });
    const ang = rng() * Math.PI * 2;
    battle.startRound({
      a: aiA.chooseLaunch(fighters[0].build, ang),
      b: aiB.chooseLaunch(fighters[1].build, ang),
    });

    let frames = 0;
    while (battle.phase === 'battle' && frames++ < 60 * 60) {
      aiA.update(battle, 1 / 60);
      aiB.update(battle, 1 / 60);
      battle.update(1 / 60);
    }

    played++;
    seconds += frames / 60;
    for (const b of battle.beys) rides += b.railRides;
  }
  return { rounds: played, rides, seconds };
}

describe('the X-Rail fires often enough to be a mechanic', () => {
  it('rides land about once per top per round', () => {
    const { rounds, rides } = play('xrail');
    const perTop = rides / (rounds * 2);
    // Measured 0.99. A rail nobody ever catches is decoration; a rail every top
    // is permanently glued to is the only thing in the arena.
    expect(perTop).toBeGreaterThan(0.4);
    expect(perTop).toBeLessThan(3);
  });

  it('is bounded by its own cooldown, not by luck', () => {
    // duration 0.55 + cooldown 1.6 puts a hard floor of 2.15 s on one top's
    // ride-to-ride cycle. This asserts the consequence: within a round of the
    // measured ~5.7 s, no top can ride more than a handful of times. It is the
    // arithmetic that makes the real toy's "five dashes in three seconds"
    // unreachable without changing those constants — see docs/PHYSICS.md.
    const rail = arenaById('xrail').rail;
    expect(rail).not.toBeNull();
    const cycle = (rail?.duration ?? 0) + (rail?.cooldown ?? 0);
    const { rounds, rides, seconds } = play('xrail');
    const perTopPerSecond = rides / (rounds * 2) / (seconds / rounds);
    expect(perTopPerSecond).toBeLessThanOrEqual(1 / cycle);
  });

  it('never fires in an arena with no rail', () => {
    // Not a stochastic claim: zero, always.
    const { rides } = play('standard', 40);
    expect(rides).toBe(0);
  });
});
