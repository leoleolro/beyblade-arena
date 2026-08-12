import { describe, expect, it } from 'vitest';
import { Battle } from './battle';
import type { Fighter } from './battle';
import { makeBuild } from './parts';
import type { LaunchParams } from './types';

/**
 * A mirror match must be a coin flip.
 *
 * Same build both sides, launched at opposite angles with opposite spin, is
 * symmetric under reflection about the y-axis: it maps each top exactly onto
 * the other. Neither seat can deserve to win.
 *
 * It used to. The top launched at angle 0 took 88% of these, and up to 100% at
 * some launch angles — with no AI running at all. The cause was not the
 * physics, which preserves the mirror to ~1e-16 for a whole round; it was the
 * simultaneous-defeat tiebreak comparing spins with a strict `>`. Both tops
 * reached defeat on the same step separated only by floating-point dust
 * (ultimately from `sin(pi)` being 1.22e-16 rather than 0 at launch), and that
 * dust decided the round — always in the same direction.
 *
 * This is the regression guard. It also guards the *shape* of the fix: ties
 * are broken on the seeded RNG rather than restoring the old 29% draw rate.
 */

function mirrorMatch(
  build: string,
  base: number,
  trials: number,
): { aWins: number; games: number; draws: number } {
  const [layer, disc, driver] = build.split('/');
  let aWins = 0;
  let games = 0;
  let draws = 0;

  for (let t = 0; t < trials; t++) {
    const seed = t * 97 + 5;
    const fighters: Fighter[] = [
      { id: 'a', name: 'A', build: makeBuild(layer, disc, driver), spinDir: 1 },
      { id: 'b', name: 'B', build: makeBuild(layer, disc, driver), spinDir: -1 },
    ];
    const battle = new Battle(fighters, { seed, pointsToWin: 999 });
    const mk = (x: number): LaunchParams => ({
      power: 0.8,
      entryAngle: x,
      entryDepth: 0.15,
    });
    battle.startRound({ a: mk(base), b: mk(base + Math.PI) });
    while (battle.phase === 'battle') battle.update(1 / 60);

    const w = battle.lastRound?.winnerId;
    if (w) {
      games++;
      if (w === 'a') aWins++;
    } else {
      draws++;
    }
  }
  return { aWins, games, draws };
}

describe('seat fairness', () => {
  it('neither seat wins a mirror match', () => {
    // Several launch angles, because the bias varied with the absolute angle
    // (88% at 0, 100% at pi/2, 21% at pi/4) — averaging over angles would have
    // hidden it. Each is checked on its own.
    for (const [label, base] of [
      ['0', 0],
      ['pi/4', Math.PI / 4],
      ['pi/2', Math.PI / 2],
      ['3pi/4', (3 * Math.PI) / 4],
    ] as const) {
      const r = mirrorMatch('aegis/wall/bastion', base, 200);
      const rate = r.aWins / Math.max(1, r.games);
      console.log(
        `  aegis base ${label.padEnd(5)} A ${(rate * 100).toFixed(0)}% (n=${r.games}, draws=${r.draws})`,
      );
      expect(rate).toBeGreaterThan(0.4);
      expect(rate).toBeLessThan(0.6);
    }
  });

  it('holds across archetypes', () => {
    for (const build of [
      'valtryek/heavy/xtreme',
      'spryzen/heavy/orbit',
      'fafnir/spread/needle',
      'luinor/gravity/atomic',
    ]) {
      const r = mirrorMatch(build, 0, 200);
      const rate = r.aWins / Math.max(1, r.games);
      console.log(`  ${build.padEnd(24)} A ${(rate * 100).toFixed(0)}%`);
      expect(rate).toBeGreaterThan(0.4);
      expect(rate).toBeLessThan(0.6);
    }
  });

  it('does not resurrect the draw rate', () => {
    // The tiebreak exists because dead heats were ending a quarter of rounds
    // in a meaningless draw. Breaking exact ties on the seeded RNG keeps that
    // win while removing the bias.
    const r = mirrorMatch('aegis/wall/bastion', 0, 200);
    const drawRate = r.draws / 200;
    console.log(`  draw rate in mirror matches: ${(drawRate * 100).toFixed(1)}%`);
    expect(drawRate).toBeLessThan(0.1);
  });

  it('stays deterministic for a given seed', () => {
    // The tiebreak now consumes the battle RNG, so replays must still agree.
    const a = mirrorMatch('aegis/wall/bastion', 0, 40);
    const b = mirrorMatch('aegis/wall/bastion', 0, 40);
    expect(a.aWins).toBe(b.aWins);
    expect(a.draws).toBe(b.draws);
  });
});
