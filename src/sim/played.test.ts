import { describe, expect, it } from 'vitest';
import { Battle } from './battle';
import type { Fighter } from './battle';
import { AiController } from '../ai';
import { PRESETS } from './parts';
import { arenaById } from './arena';
import { makeRng } from './math';
import * as C from './constants';

/**
 * Pacing AS THE GAME IS ACTUALLY PLAYED.
 *
 * Every other measurement in this project — `pacing.test.ts`, `tuning.test.ts`,
 * `sim.test.ts`, and the three separate pacing investigations built on them —
 * constructs `LaunchParams` directly and **never activates a single move**.
 * Verified by grep: no test in the suite drives an `AiController` or calls
 * `activateMove`. So the entire pacing record describes a game in which nobody
 * uses the move triangle, which is the game's central mechanic.
 *
 * That gap is not academic. The no-moves harness reports hits per round pinned
 * near 5 "across the whole test-safe region", and a long search for a lever to
 * raise it concluded that only SMASH_MAX moves the number and that SMASH_MAX
 * cannot be moved without deleting ring-outs. With moves driven, the same
 * builds produce 8 hits per round. The lever that search was looking for may
 * simply not have been missing.
 *
 * So this file measures the played game: both sides driven by the AI at
 * champion, seeded so it is reproducible, reporting the numbers the other
 * harness cannot see. It asserts only the properties that would represent a
 * genuine regression — the rest is instrumentation, deliberately, because a
 * tight assertion on a stochastic AI is how you get a suite people ignore.
 */

interface Played {
  hits: number;
  moves: number;
  seconds: number;
  heavy: number;
}

function playRound(ai: number, bi: number, seed: number): Played {
  const rng = makeRng(seed);
  const aiA = new AiController('a', 'champion', makeRng(seed * 3 + 1));
  const aiB = new AiController('b', 'champion', makeRng(seed * 7 + 2));
  const fighters: Fighter[] = [
    { id: 'a', name: 'A', build: PRESETS[ai].build(), spinDir: 1 },
    { id: 'b', name: 'B', build: PRESETS[bi].build(), spinDir: seed % 2 ? -1 : 1 },
  ];
  const b = new Battle(fighters, {
    seed,
    arena: arenaById('standard'),
    // One round, not a match: pacing is a property of a round.
    pointsToWin: 999,
  });
  const ang = rng() * Math.PI * 2;
  b.startRound({
    a: aiA.chooseLaunch(fighters[0].build, ang),
    b: aiB.chooseLaunch(fighters[1].build, ang),
  });

  let hits = 0;
  let heavy = 0;
  let t = 0;
  let guard = 0;
  while (b.phase === 'battle' && guard++ < 60 * 90) {
    aiA.update(b, 1 / 60);
    aiB.update(b, 1 / 60);
    b.update(1 / 60);
    t += 1 / 60;
    for (const h of b.hits) {
      hits++;
      if (h.strength >= C.HITSTOP_THRESHOLD) heavy++;
    }
  }
  return {
    hits,
    heavy,
    seconds: t,
    moves: b.beys.reduce((acc, x) => acc + x.movesUsed, 0),
  };
}

function sweep(): Played[] {
  const out: Played[] = [];
  for (let i = 0; i < PRESETS.length; i++) {
    for (let k = 0; k < PRESETS.length; k++) {
      if (i === k) continue;
      for (let s = 0; s < 8; s++) out.push(playRound(i, k, s * 7919 + i * 31 + k));
    }
  }
  return out;
}

const q = (xs: number[], p: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
};

describe('pacing as played', () => {
  it('reports the round the player actually gets', () => {
    const rs = sweep();
    const secs = rs.map((r) => r.seconds);
    const hits = rs.map((r) => r.hits);
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

    console.log(
      `  ${rs.length} rounds, both sides played by the AI\n` +
        `  seconds  p10 ${q(secs, 0.1).toFixed(1)}  p50 ${q(secs, 0.5).toFixed(1)}  p90 ${q(secs, 0.9).toFixed(1)}\n` +
        `  hits     p10 ${q(hits, 0.1)}  p50 ${q(hits, 0.5)}  p90 ${q(hits, 0.9)}   mean ${mean(hits).toFixed(1)}\n` +
        `  heavy hits per round ${mean(rs.map((r) => r.heavy)).toFixed(2)}\n` +
        `  moves per top per round ${(mean(rs.map((r) => r.moves)) / 2).toFixed(2)}\n` +
        `  under 2s ${((secs.filter((s) => s < 2).length / secs.length) * 100).toFixed(1)}%`,
    );

    // A round must contain a fight. If the median round ever drops to a couple
    // of contacts, something has broken the engagement loop — which is the
    // failure the whole pacing thread has been chasing.
    expect(q(hits, 0.5), 'median hits per round').toBeGreaterThanOrEqual(4);
    // And it must not become a blur of taps, which is the failure MIN_IMPACT
    // exists to prevent.
    expect(q(hits, 0.5), 'median hits per round').toBeLessThan(40);
    // Coin-flip rounds are the regression SETTLE_TIME was introduced to fix.
    expect(secs.filter((s) => s < 2).length / secs.length, 'under-2s share').toBeLessThan(0.2);
  });

  it('the move triangle is actually reachable during a round', () => {
    // The champion's whole advantage is reaction time and misread rate, and
    // both act only through moves. If a top can afford fewer than about two a
    // round, difficulty collapses toward a coin flip — which is exactly what it
    // had done before METER_GAIN_PER_SEC was raised.
    const rs = sweep();
    const perTop = rs.reduce((a, r) => a + r.moves, 0) / rs.length / 2;
    expect(perTop, 'moves per top per round').toBeGreaterThan(1.5);
  });
});
