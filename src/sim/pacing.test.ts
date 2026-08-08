/**
 * Diagnostics for match *pacing* — how long a player actually sits in a match,
 * as opposed to how long a single round lasts. Run with:
 *   npx vitest run pacing --silent=false --disable-console-intercept
 */
import { describe, it } from 'vitest';
import { Battle } from './battle';
import type { Fighter } from './battle';
import { makeRng } from './math';
import { PRESETS } from './parts';
import type { LaunchParams } from './types';

/** Median round length for a given spin pairing, across every preset matchup. */
function medianRound(opposite: boolean): { p50: number; under2: number } {
  const lengths: number[] = [];
  for (let i = 0; i < PRESETS.length; i++) {
    for (let k = 0; k < PRESETS.length; k++) {
      if (i === k) continue;
      for (let s = 0; s < 14; s++) {
        const rng = makeRng(s * 733 + i * 97 + k * 13);
        const fighters: Fighter[] = [
          { id: 'a', name: 'A', build: PRESETS[i].build(), spinDir: 1 },
          { id: 'b', name: 'B', build: PRESETS[k].build(), spinDir: opposite ? -1 : 1 },
        ];
        const battle = new Battle(fighters, { seed: s * 31 + 5, pointsToWin: 999 });
        const base = rng() * Math.PI * 2;
        const mk = (angle: number): LaunchParams => ({
          power: 0.6 + rng() * 0.4,
          entryAngle: angle,
          entryDepth: rng() * 0.25,
        });
        battle.startRound({ a: mk(base), b: mk(base + Math.PI) });
        while (battle.phase === 'battle') battle.update(1 / 60);
        lengths.push(battle.roundTime);
      }
    }
  }
  lengths.sort((x, y) => x - y);
  return {
    p50: lengths[Math.floor(lengths.length / 2)],
    under2: lengths.filter((x) => x < 2).length / lengths.length,
  };
}

describe('spin direction', () => {
  it('shows how much opposite-spin shortens a round', () => {
    const same = medianRound(false);
    const opp = medianRound(true);
    console.log('\n=== spin pairing vs round length ===');
    console.log(
      `  same-spin:     p50 ${same.p50.toFixed(1)}s   under 2s: ${(same.under2 * 100).toFixed(1)}%`,
    );
    console.log(
      `  opposite-spin: p50 ${opp.p50.toFixed(1)}s   under 2s: ${(opp.under2 * 100).toFixed(1)}%`,
    );
  });
});

describe('pacing report', () => {
  it('reports match length in rounds and seconds', () => {
    const roundLengths: number[] = [];
    const matchLengths: number[] = [];
    const matchRounds: number[] = [];
    const firstBlood: number[] = [];
    let matches = 0;

    for (let i = 0; i < PRESETS.length; i++) {
      for (let k = 0; k < PRESETS.length; k++) {
        if (i === k) continue;
        for (let s = 0; s < 14; s++) {
          const rng = makeRng(s * 733 + i * 97 + k * 13);
          const fighters: Fighter[] = [
            { id: 'a', name: 'A', build: PRESETS[i].build(), spinDir: 1 },
            { id: 'b', name: 'B', build: PRESETS[k].build(), spinDir: -1 },
          ];
          const battle = new Battle(fighters, { seed: s * 31 + 5 });
          let matchTime = 0;
          let rounds = 0;
          let guard = 0;

          while (battle.phase !== 'match-over' && guard++ < 40) {
            const base = rng() * Math.PI * 2;
            const mk = (angle: number): LaunchParams => ({
              power: 0.6 + rng() * 0.4,
              entryAngle: angle,
              entryDepth: rng() * 0.25,
            });
            battle.startRound({ a: mk(base), b: mk(base + Math.PI) });
            while (battle.phase === 'battle') battle.update(1 / 60);
            roundLengths.push(battle.roundTime);
            if (rounds === 0) firstBlood.push(battle.roundTime);
            matchTime += battle.roundTime;
            rounds += 1;
            // Checking the winner rather than the phase: TypeScript narrows
            // `phase` from the loop condition and rejects the comparison.
            if (battle.matchWinnerId) break;
          }
          matchLengths.push(matchTime);
          matchRounds.push(rounds);
          matches += 1;
        }
      }
    }

    const p = (arr: number[], q: number): number => {
      const a = [...arr].sort((x, y) => x - y);
      return a[Math.min(a.length - 1, Math.floor(a.length * q))];
    };
    const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;

    console.log(`\n=== ${matches} matches, ${roundLengths.length} rounds ===`);
    console.log('ROUND seconds:');
    console.log(
      `  p10 ${p(roundLengths, 0.1).toFixed(1)}  p25 ${p(roundLengths, 0.25).toFixed(1)}  p50 ${p(roundLengths, 0.5).toFixed(1)}  p90 ${p(roundLengths, 0.9).toFixed(1)}`,
    );
    const under2 = roundLengths.filter((x) => x < 2).length / roundLengths.length;
    const under5 = roundLengths.filter((x) => x < 5).length / roundLengths.length;
    console.log(
      `  under 2s: ${(under2 * 100).toFixed(1)}%   under 5s: ${(under5 * 100).toFixed(1)}%`,
    );
    console.log('ROUNDS per match:');
    console.log(
      `  mean ${mean(matchRounds).toFixed(2)}  p10 ${p(matchRounds, 0.1)}  p50 ${p(matchRounds, 0.5)}  p90 ${p(matchRounds, 0.9)}`,
    );
    const twoRound = matchRounds.filter((x) => x <= 2).length / matchRounds.length;
    console.log(`  matches decided in <=2 rounds: ${(twoRound * 100).toFixed(1)}%`);
    console.log('MATCH seconds (battle time only, excludes menus):');
    console.log(
      `  mean ${mean(matchLengths).toFixed(1)}  p10 ${p(matchLengths, 0.1).toFixed(1)}  p50 ${p(matchLengths, 0.5).toFixed(1)}  p90 ${p(matchLengths, 0.9).toFixed(1)}`,
    );
    console.log(`FIRST round of a match: p50 ${p(firstBlood, 0.5).toFixed(1)}s`);
  });
});
