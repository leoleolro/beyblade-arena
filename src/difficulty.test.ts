import { describe, expect, it } from 'vitest';
import { Battle } from './sim/battle';
import type { Fighter } from './sim/battle';
import { AiController } from './ai';
import type { Difficulty } from './ai';
import { PRESETS } from './sim/parts';
import { arenaById } from './sim/arena';
import { makeRng } from './sim/math';

/**
 * Does difficulty actually mean anything?
 *
 * It did not. Measured across all six anchor builds in mirror matches, with
 * seats alternated so seat bias could not masquerade as skill:
 *
 *   champion vs rookie  53.0%   — a coin flip
 *   champion vs blader  48.8%   — the top tier LOSING to the middle one
 *   blader   vs rookie  58.3%
 *
 * The cause was an inverted incentive in `chooseLaunch`. The perfect-launch
 * band is 0.72..0.90 and grants +14% spin; the archetype bases are 0.95, 0.70
 * and 0.45, two of which sit outside it. `launchNoise` — the stat meant to make
 * better tiers more precise — therefore made them precisely MISS the bonus. A
 * rookie's sloppy spread wandered into the band sometimes; a champion's never
 * did. Precision was a penalty.
 *
 * This test is what stops that returning. It asserts the ORDER holds and not a
 * specific rate, because the AI is stochastic.
 *
 * HOW MANY MATCHES, AND WHY IT IS NOT 40. It was 40 seeds per build — 240
 * matches per pairing — and that is not enough to resolve the effect it is
 * asserting. Measured at 1440 matches per pairing, the true rates are 57.4%,
 * 67.2% and 59.2%; the 240-match sample reported 49.2% for the first of those
 * and FAILED, on a change that had just moved the real number UP. A test that
 * fails on an improvement is worse than no test, because the natural response
 * is to tune the game until the sample agrees.
 *
 * At 100 seeds — 600 matches per pairing — the standard error on a rate near
 * 50% is about 2 points, so a genuine 57% clears the 50% bar by three and a
 * half sigma and a genuine inversion cannot hide. That costs about 12 seconds,
 * which is the price of the assertion meaning what it says.
 *
 * Note the seeds are deterministic, so this is not "unlucky sampling" that a
 * re-run would shake off: seeds 0..39 are simply unrepresentative for the
 * champion/blader pairing, permanently. More of them is the only fix.
 */

/**
 * Seeds per anchor build, per pairing. See the power note above before
 * lowering this — the previous value of 40 produced a confident false failure.
 */
const SEEDS = 100;

function match(
  build: () => ReturnType<(typeof PRESETS)[0]['build']>,
  dA: Difficulty,
  dB: Difficulty,
  seed: number,
): 'a' | 'b' | null {
  // SEEDED. AiController defaults its rng to Math.random, and without this the
  // whole measurement is non-deterministic — an earlier version of this test
  // reported 61.3% and 48.8% for the same pairing on consecutive runs, which is
  // not a flaky assertion but a flaky experiment.
  const aiA = new AiController('a', dA, makeRng(seed * 3 + 1));
  const aiB = new AiController('b', dB, makeRng(seed * 7 + 2));
  const rng = makeRng(seed);
  const fighters: Fighter[] = [
    { id: 'a', name: 'A', build: build(), spinDir: 1 },
    { id: 'b', name: 'B', build: build(), spinDir: rng() < 0.5 ? 1 : -1 },
  ];
  const b = new Battle(fighters, { seed, arena: arenaById('standard') });
  for (let round = 0; round < 24 && !b.matchWinnerId; round++) {
    const ang = rng() * Math.PI * 2;
    b.startRound({
      a: aiA.chooseLaunch(fighters[0].build, ang),
      b: aiB.chooseLaunch(fighters[1].build, ang),
    });
    let guard = 0;
    while (b.phase === 'battle' && guard++ < 60 * 90) {
      aiA.update(b, 1 / 60);
      aiB.update(b, 1 / 60);
      b.update(1 / 60);
    }
  }
  return b.matchWinnerId === 'a' ? 'a' : b.matchWinnerId === 'b' ? 'b' : null;
}

/** Win rate of `hi` against `lo`, seats alternated, across every anchor build. */
function ladderRate(hi: Difficulty, lo: Difficulty): number {
  let wins = 0;
  let played = 0;
  for (const preset of PRESETS) {
    for (let s = 0; s < SEEDS; s++) {
      // Alternating seats is the whole reason this measurement is trustworthy:
      // an earlier attempt at this bug chased a seat-bias confound instead.
      const swap = s % 2 === 1;
      const r = match(preset.build, swap ? lo : hi, swap ? hi : lo, s * 8191 + 3);
      if (!r) continue;
      played++;
      if (r === (swap ? 'b' : 'a')) wins++;
    }
  }
  return played ? wins / played : NaN;
}

describe('the difficulty ladder', () => {
  it('a higher tier beats a lower one', () => {
    const cvr = ladderRate('champion', 'rookie');
    const cvb = ladderRate('champion', 'blader');
    const bvr = ladderRate('blader', 'rookie');
    console.log(
      `  champion vs rookie ${(cvr * 100).toFixed(1)}%  ` +
        `champion vs blader ${(cvb * 100).toFixed(1)}%  ` +
        `blader vs rookie ${(bvr * 100).toFixed(1)}%`,
    );
    // Every tier must beat the one below it. The bar is "wins more than it
    // loses", not a target rate — but the champion losing to the blader, which
    // is what this shipped as, fails.
    expect(cvr, 'champion vs rookie').toBeGreaterThan(0.5);
    expect(cvb, 'champion vs blader').toBeGreaterThan(0.5);
    expect(bvr, 'blader vs rookie').toBeGreaterThan(0.5);
    // And the top of the ladder must be the biggest gap, or "champion" is a
    // label rather than a tier.
    expect(cvr, 'champion vs rookie should be the widest gap').toBeGreaterThan(cvb);
  });
});
