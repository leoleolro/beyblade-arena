import { describe, expect, it } from 'vitest';
import * as C from './constants';
import { len, makeRng } from './math';
import { Battle } from './battle';
import type { Fighter } from './battle';
import { PRESETS, makeBuild } from './parts';
import type { LaunchParams } from './types';

const launch = (angle: number, power = 0.85): LaunchParams => ({
  power,
  entryAngle: angle,
  entryDepth: 0.05,
});

function fight(
  aBuild: ReturnType<typeof makeBuild>,
  bBuild: ReturnType<typeof makeBuild>,
  seed: number,
  oppositeSpin = false,
): Battle {
  const fighters: Fighter[] = [
    { id: 'a', name: 'A', build: aBuild, spinDir: 1 },
    { id: 'b', name: 'B', build: bBuild, spinDir: oppositeSpin ? -1 : 1 },
  ];
  const battle = new Battle(fighters, { seed, pointsToWin: 999 });
  battle.startRound({ a: launch(0), b: launch(Math.PI) });
  while (battle.phase === 'battle') battle.update(1 / 60);
  return battle;
}

/**
 * Same as `fight`, but varies the launch itself with the seed. Fixed launches
 * make every "seed" replay the identical fight, so a balance sweep built on
 * them measures nothing.
 */
function fightVaried(
  aBuild: ReturnType<typeof makeBuild>,
  bBuild: ReturnType<typeof makeBuild>,
  seed: number,
  oppositeSpin: boolean,
): Battle {
  const rng = makeRng(seed);
  const fighters: Fighter[] = [
    { id: 'a', name: 'A', build: aBuild, spinDir: 1 },
    { id: 'b', name: 'B', build: bBuild, spinDir: oppositeSpin ? -1 : 1 },
  ];
  const battle = new Battle(fighters, { seed, pointsToWin: 999 });
  const mk = (): LaunchParams => ({
    power: 0.7 + rng() * 0.3,
    entryAngle: rng() * Math.PI * 2,
    entryDepth: rng() * 0.3,
  });
  battle.startRound({ a: mk(), b: mk() });
  while (battle.phase === 'battle') battle.update(1 / 60);
  return battle;
}

describe('single top', () => {
  it('orbits inside the stadium and eventually spins down', () => {
    const fighters: Fighter[] = [
      { id: 'a', name: 'A', build: makeBuild('spryzen', 'gravity', 'atomic'), spinDir: 1 },
      { id: 'b', name: 'B', build: makeBuild('spryzen', 'gravity', 'atomic'), spinDir: 1 },
    ];
    const battle = new Battle(fighters, { seed: 1, pointsToWin: 999 });
    battle.startRound({ a: launch(0), b: launch(Math.PI) });

    let maxRadius = 0;
    while (battle.phase === 'battle') {
      battle.update(1 / 60);
      for (const bey of battle.beys) {
        if (bey.alive) maxRadius = Math.max(maxRadius, len(bey.pos));
      }
    }

    // Never escapes except through a pocket, so it can't leave by tunnelling.
    expect(maxRadius).toBeLessThan(C.EXIT_RADIUS + 0.35);
    // A round resolves in a believable amount of time, not instantly or never.
    expect(battle.roundTime).toBeGreaterThan(3);
    expect(battle.roundTime).toBeLessThanOrEqual(C.ROUND_TIME_LIMIT);
  });
});

describe('determinism', () => {
  it('produces identical results for the same seed', () => {
    const a = makeBuild('valtryek', 'heavy', 'xtreme');
    const b = makeBuild('aegis', 'wall', 'bastion');
    const r1 = fight(a, b, 42);
    const r2 = fight(a, b, 42);
    expect(r1.lastRound).toEqual(r2.lastRound);
    expect(r1.roundTime).toBeCloseTo(r2.roundTime, 9);
    expect(r1.beys[0].pos).toEqual(r2.beys[0].pos);
  });
});

describe('collisions', () => {
  it('registers hits and drains spin', () => {
    const a = makeBuild('ragnaruk', 'blitz', 'volcanic');
    const b = makeBuild('aegis', 'wall', 'bastion');

    const fighters: Fighter[] = [
      { id: 'a', name: 'A', build: a, spinDir: 1 },
      { id: 'b', name: 'B', build: b, spinDir: 1 },
    ];
    const battle = new Battle(fighters, { seed: 7, pointsToWin: 999 });
    battle.startRound({ a: launch(0), b: launch(Math.PI) });

    let totalHits = 0;
    while (battle.phase === 'battle') {
      battle.update(1 / 60);
      totalHits += battle.hits.length;
    }

    expect(totalHits).toBeGreaterThan(0);
    for (const bey of battle.beys) {
      expect(Math.abs(bey.spin)).toBeLessThan(bey.spinAtLaunch);
    }
  });

  it('drains far harder in opposite-spin matchups', () => {
    const a = makeBuild('spryzen', 'gravity', 'atomic');
    const same = fight(a, a, 11, false);
    const opposite = fight(a, a, 11, true);
    expect(opposite.roundTime).toBeLessThan(same.roundTime);
  });
});

describe('balance', () => {
  it('has no build that beats every other build', () => {
    const wins = new Map<string, number>();
    const games = new Map<string, number>();

    for (const p of PRESETS) {
      wins.set(p.name, 0);
      games.set(p.name, 0);
    }

    for (let i = 0; i < PRESETS.length; i++) {
      for (let k = i + 1; k < PRESETS.length; k++) {
        const pa = PRESETS[i];
        const pb = PRESETS[k];
        for (let seed = 0; seed < 80; seed++) {
          const battle = fightVaried(
            pa.build(),
            pb.build(),
            seed * 977 + 3,
            seed % 2 === 1,
          );
          games.set(pa.name, games.get(pa.name)! + 1);
          games.set(pb.name, games.get(pb.name)! + 1);
          const w = battle.lastRound?.winnerId;
          if (w === 'a') wins.set(pa.name, wins.get(pa.name)! + 1);
          if (w === 'b') wins.set(pb.name, wins.get(pb.name)! + 1);
        }
      }
    }

    const rates = [...wins].map(([name, w]) => ({
      name,
      rate: w / games.get(name)!,
    }));
    rates.sort((x, y) => y.rate - x.rate);
    // Surfaced in test output so the numbers can be tuned by hand.
    console.table(rates.map((r) => ({ build: r.name, winRate: r.rate.toFixed(3) })));

    expect(rates[0].rate).toBeLessThan(0.72);
    expect(rates[rates.length - 1].rate).toBeGreaterThan(0.25);
  });
});
