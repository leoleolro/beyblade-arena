/**
 * Diagnostics, not assertions. Run with `npx vitest run tuning` to see how the
 * current constants play out; used to hand-tune the model.
 */
import { describe, it } from 'vitest';
import { Battle } from './battle';
import type { Fighter } from './battle';
import { makeRng } from './math';
import { PRESETS } from './parts';
import type { LaunchParams, RoundResult } from './types';

function run(
  a: () => ReturnType<(typeof PRESETS)[number]['build']>,
  b: () => ReturnType<(typeof PRESETS)[number]['build']>,
  seed: number,
  opposite: boolean,
): Battle {
  const rng = makeRng(seed);
  const fighters: Fighter[] = [
    { id: 'a', name: 'A', build: a(), spinDir: 1 },
    { id: 'b', name: 'B', build: b(), spinDir: opposite ? -1 : 1 },
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

describe('tuning report', () => {
  it('reports finish types, round length and hit counts', () => {
    const reasons: Record<string, number> = {};
    const durations: number[] = [];
    const fastRounds: string[] = [];
    let totalHits = 0;
    let games = 0;

    const wins = new Map(PRESETS.map((p) => [p.name, 0]));
    const played = new Map(PRESETS.map((p) => [p.name, 0]));

    for (let i = 0; i < PRESETS.length; i++) {
      for (let k = i + 1; k < PRESETS.length; k++) {
        for (let s = 0; s < 80; s++) {
          const battle = run(PRESETS[i].build, PRESETS[k].build, s * 977 + 3, s % 2 === 1);
          const res = battle.lastRound as RoundResult;
          reasons[res.reason] = (reasons[res.reason] ?? 0) + 1;
          durations.push(battle.roundTime);
          if (battle.roundTime < 2) fastRounds.push(res.reason);
          games += 1;
          played.set(PRESETS[i].name, played.get(PRESETS[i].name)! + 1);
          played.set(PRESETS[k].name, played.get(PRESETS[k].name)! + 1);
          if (res.winnerId === 'a') wins.set(PRESETS[i].name, wins.get(PRESETS[i].name)! + 1);
          if (res.winnerId === 'b') wins.set(PRESETS[k].name, wins.get(PRESETS[k].name)! + 1);
        }
      }
    }

    // A second pass just to count hits, which we don't accumulate above.
    for (let s = 0; s < 40; s++) {
      const rng = makeRng(s + 1);
      const fighters: Fighter[] = [
        { id: 'a', name: 'A', build: PRESETS[0].build(), spinDir: 1 },
        { id: 'b', name: 'B', build: PRESETS[1].build(), spinDir: 1 },
      ];
      const battle = new Battle(fighters, { seed: s, pointsToWin: 999 });
      const mk = (): LaunchParams => ({
        power: 0.7 + rng() * 0.3,
        entryAngle: rng() * Math.PI * 2,
        entryDepth: rng() * 0.3,
      });
      battle.startRound({ a: mk(), b: mk() });
      while (battle.phase === 'battle') {
        battle.update(1 / 60);
        totalHits += battle.hits.length;
      }
    }

    console.log('\n=== rounds that ended under 2s ===');
    const fastReasons: Record<string, number> = {};
    let fast = 0;
    for (const d of fastRounds) {
      fastReasons[d] = (fastReasons[d] ?? 0) + 1;
      fast += 1;
    }
    console.log(`  ${((fast / games) * 100).toFixed(1)}% of all rounds`);
    for (const [r, n] of Object.entries(fastReasons)) console.log(`    ${r}: ${n}`);

    // The sweep above launches at fully random bearings, which frequently drops
    // two tops next to the same exit pocket. Real matches launch from opposite
    // sides, so measure that separately to see which effect we're looking at.
    let opposedFast = 0;
    let opposedGames = 0;
    for (let i = 0; i < PRESETS.length; i++) {
      for (let k = i + 1; k < PRESETS.length; k++) {
        for (let s = 0; s < 40; s++) {
          const rng = makeRng(s * 31 + 7);
          const fighters: Fighter[] = [
            { id: 'a', name: 'A', build: PRESETS[i].build(), spinDir: 1 },
            { id: 'b', name: 'B', build: PRESETS[k].build(), spinDir: s % 2 ? -1 : 1 },
          ];
          const battle = new Battle(fighters, { seed: s, pointsToWin: 999 });
          const base = rng() * Math.PI * 2;
          battle.startRound({
            a: { power: 0.7 + rng() * 0.3, entryAngle: base, entryDepth: rng() * 0.2 },
            b: {
              power: 0.7 + rng() * 0.3,
              entryAngle: base + Math.PI,
              entryDepth: rng() * 0.2,
            },
          });
          while (battle.phase === 'battle') battle.update(1 / 60);
          opposedGames += 1;
          if (battle.roundTime < 2) opposedFast += 1;
        }
      }
    }
    console.log(
      `=== opposed launches, under 2s: ${((opposedFast / opposedGames) * 100).toFixed(1)}%`,
    );

    durations.sort((x, y) => x - y);
    console.log('\n=== finish types (share of %d games) ===', games);
    for (const [r, n] of Object.entries(reasons)) {
      console.log(`  ${r.padEnd(14)} ${((n / games) * 100).toFixed(1)}%`);
    }
    console.log('=== round length (s) ===');
    console.log(`  p10 ${durations[Math.floor(games * 0.1)].toFixed(1)}`);
    console.log(`  p50 ${durations[Math.floor(games * 0.5)].toFixed(1)}`);
    console.log(`  p90 ${durations[Math.floor(games * 0.9)].toFixed(1)}`);
    console.log(`=== avg hits per round: ${(totalHits / 40).toFixed(1)}`);
    console.log('=== win rates ===');
    for (const [name, w] of [...wins].sort((x, y) => y[1] / played.get(y[0])! - x[1] / played.get(x[0])!)) {
      console.log(`  ${name.padEnd(15)} ${((w / played.get(name)!) * 100).toFixed(1)}%`);
    }
  });
});
