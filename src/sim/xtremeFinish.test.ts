import { describe, expect, it } from 'vitest';
import { pocketAngles, pocketIndexAt } from './physics';
import * as C from './constants';
import { arenaById, STANDARD, XRAIL } from './arena';
import { Battle } from './battle';
import type { Fighter } from './battle';
import { AiController } from '../ai';
import { PRESETS } from './parts';
import { makeRng } from './math';

/**
 * The graded exit pocket — the "Xtreme Finish".
 *
 * Scoring rules are the part of a sim that is cheapest to get subtly wrong and
 * most expensive to notice: a knockout that scores 2 instead of 3 looks exactly
 * like a knockout. So the geometry that decides it is pinned here rather than
 * trusted, and the arena data is asserted as data.
 *
 * See docs/ARENA-IDEAS.md for where the rule comes from.
 */

describe('pocketIndexAt', () => {
  it('identifies each pocket by its own centre bearing', () => {
    const angles = pocketAngles();
    expect(angles).toHaveLength(C.POCKET_COUNT);
    angles.forEach((a, i) => {
      expect(pocketIndexAt(a)).toBe(i);
    });
  });

  it('still identifies a pocket from just inside its arc', () => {
    // A top does not leave through the exact centre of a pocket. The wall only
    // lets it through while it is inside POCKET_HALF_WIDTH, so anything within
    // that arc has to resolve to the pocket it actually went through.
    const angles = pocketAngles();
    const nudge = C.POCKET_HALF_WIDTH * 0.9;
    angles.forEach((a, i) => {
      expect(pocketIndexAt(a + nudge)).toBe(i);
      expect(pocketIndexAt(a - nudge)).toBe(i);
    });
  });

  it('returns -1 between pockets rather than the nearest one', () => {
    // The important negative case. Answering "nearest pocket" regardless of
    // distance would score an Xtreme Finish for a top that left through the
    // far side of the dish, and nothing in the game would report that as odd.
    const angles = pocketAngles();
    const midway = (angles[0] + angles[1]) / 2;
    expect(pocketIndexAt(midway)).toBe(-1);
  });

  it('is indifferent to how the bearing was wound', () => {
    // `atan2` returns -pi..pi and the pocket angles are built from 0..2pi, so a
    // pocket past pi is compared against a negative bearing every time it is
    // used. If that ever stopped working, only the pockets on one side of the
    // dish would score.
    const angles = pocketAngles();
    angles.forEach((a, i) => {
      expect(pocketIndexAt(a - Math.PI * 2)).toBe(i);
      expect(pocketIndexAt(a + Math.PI * 2)).toBe(i);
    });
  });
});

describe('arena data', () => {
  it('gives the rail stadium a graded pocket and the plain bowl none', () => {
    expect(XRAIL.finishPocket).toBe(0);
    expect(STANDARD.finishPocket ?? null).toBeNull();
  });

  it('points a graded pocket at one that exists', () => {
    // An index past the end would be a scoring rule that can never fire, and
    // it would fail silently — every knockout would simply score 2 forever.
    for (const arena of [STANDARD, XRAIL]) {
      const want = arena.finishPocket;
      if (want === undefined || want === null) continue;
      expect(want).toBeGreaterThanOrEqual(0);
      expect(want).toBeLessThan(C.POCKET_COUNT);
    }
  });

  it('makes the graded finish worth more than an ordinary knockout', () => {
    expect(C.POINTS_XTREME_FINISH).toBeGreaterThan(C.POINTS_KNOCKOUT);
  });

  it('cannot win a match outright from nothing', () => {
    // First to POINTS_TO_WIN. A single exit worth the whole match would make
    // the graded pocket the only thing in the game worth playing for.
    expect(C.POINTS_XTREME_FINISH).toBeLessThan(C.POINTS_TO_WIN);
  });
});

/**
 * How often the rule actually fires, which is the only thing that decides
 * whether it is a mechanic or a decoration.
 *
 * A scoring rule can be perfectly implemented and still be pointless. At 1% of
 * rounds nobody would ever notice the graded pocket existed; at 60% it would be
 * the only thing worth playing for and every other route to a point would be
 * noise. Neither failure shows up in a unit test of the geometry, and neither
 * would make anything go red.
 *
 * Measured across 220 AI-played rounds per arena, all preset pairings:
 *
 *   xrail     49.1% of rounds end in a knockout, 33.3% of those through the
 *             graded pocket — 16.4% of all rounds, about one in six
 *   standard  0%, as it must be: no graded pocket
 *
 * The 33.3% is worth a note. Four evenly spaced pockets would give 25% by
 * chance; the rail biases exits toward this one because it slings on a bearing
 * the rider does not fully choose. That is the mechanic working, not noise.
 */
describe('how often it fires', () => {
  const play = (arenaId: string): { rounds: number; knockouts: number; xtreme: number } => {
    let rounds = 0;
    let knockouts = 0;
    let xtreme = 0;

    for (let seed = 0; seed < 220; seed++) {
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
        // One round per seed: the rule is a property of a round, and stopping
        // at a match win would sample the fast ones more often.
        pointsToWin: 999,
      });
      const ang = rng() * Math.PI * 2;
      battle.startRound({
        a: aiA.chooseLaunch(fighters[0].build, ang),
        b: aiB.chooseLaunch(fighters[1].build, ang),
      });

      let guard = 0;
      while (battle.phase === 'battle' && guard++ < 60 * 60) {
        aiA.update(battle, 1 / 60);
        aiB.update(battle, 1 / 60);
        battle.update(1 / 60);
      }

      const r = battle.lastRound;
      if (!r) continue;
      rounds++;
      if (r.reason === 'knockout') knockouts++;
      if (r.xtremeFinish) xtreme++;
    }
    return { rounds, knockouts, xtreme };
  };

  it('fires often enough to be a mechanic and rarely enough to be a bonus', () => {
    const { knockouts, xtreme } = play('xrail');
    expect(knockouts).toBeGreaterThan(20);
    const share = xtreme / knockouts;
    // Wide bounds on purpose. This is a stochastic measurement and the point is
    // to catch a rule that has silently stopped firing or started firing on
    // everything, not to freeze a number that honest tuning will move.
    expect(share).toBeGreaterThan(0.1);
    expect(share).toBeLessThan(0.6);
  });

  it('never fires in an arena without a graded pocket', () => {
    // Not a stochastic claim: zero, always. If this ever trips, the rule is
    // reading something other than the arena's own field.
    const { knockouts, xtreme } = play('standard');
    expect(knockouts).toBeGreaterThan(10);
    expect(xtreme).toBe(0);
  });
});
