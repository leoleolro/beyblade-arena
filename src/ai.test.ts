import { describe, expect, it } from 'vitest';
import { AiController } from './ai';
import { Battle } from './sim/battle';
import type { Fighter } from './sim/battle';
import { MOVES } from './sim/constants';
import { makeRng } from './sim/math';
import { makeBuild } from './sim/parts';
import type { LaunchParams, MoveKind } from './sim/types';

/**
 * The AI's job here is to be *unsolvable*, not to be strong.
 *
 * Before this, `pickMove` countered a committed opponent with probability 1.
 * That is a pure strategy in a rock-paper-scissors triangle, and a pure
 * strategy has an exploit: show a cheap move, watch the guaranteed counter,
 * and the next few seconds are scripted. These tests pin the fix — the
 * champion must answer the same provocation more than one way — while
 * checking the mixing didn't cost it its edge.
 */

/** Repeatedly show the AI one move and record what it answers with. */
function provoke(
  difficulty: 'rookie' | 'blader' | 'champion',
  shown: MoveKind,
  trials: number,
): Map<MoveKind | 'none', number> {
  const answers = new Map<MoveKind | 'none', number>();

  for (let t = 0; t < trials; t++) {
    const seed = t * 61 + 7;
    const rng = makeRng(seed);
    const fighters: Fighter[] = [
      { id: 'p', name: 'P', build: makeBuild('valtryek', 'heavy', 'xtreme'), spinDir: 1 },
      { id: 'ai', name: 'AI', build: makeBuild('spryzen', 'heavy', 'orbit'), spinDir: -1 },
    ];
    const battle = new Battle(fighters, { seed, pointsToWin: 999 });
    const ai = new AiController('ai', difficulty, makeRng(seed * 17 + 3));
    const mk = (a: number): LaunchParams => ({
      power: 0.85,
      entryAngle: a,
      entryDepth: 0.1,
    });
    battle.startRound({ p: mk(0), ai: mk(Math.PI) });

    // Past the settle ramp but well short of a decision. Measured: with no
    // AI driving either side these pairings are already over by ~4s, so the
    // first attempt at this harness settled for longer than the round lasted
    // and silently sampled one trial out of sixty.
    for (let i = 0; i < 90; i++) battle.update(1 / 60);
    const me = battle.beys.find((b) => b.id === 'ai')!;
    const foe = battle.beys.find((b) => b.id === 'p')!;
    if (battle.phase !== 'battle' || !me.alive || !foe.alive) continue;
    me.meter = 1;
    foe.meter = 1;
    battle.activateMove('p', shown);

    // Give the AI long enough to notice and answer.
    let answered: MoveKind | 'none' = 'none';
    for (let i = 0; i < 40 && answered === 'none'; i++) {
      ai.update(battle, 1 / 60);
      battle.update(1 / 60);
      if (me.move && me.moveTime > 0) answered = me.move;
    }
    answers.set(answered, (answers.get(answered) ?? 0) + 1);
    void rng;
  }
  return answers;
}

describe('ai is not solvable', () => {
  it('champion answers the same provocation more than one way', () => {
    // Charge is the provocation with the clearest "correct" answer (Block),
    // so it is the one a pure strategy would give away hardest.
    const answers = provoke('champion', 'charge', 60);
    const summary = [...answers.entries()]
      .map(([k, n]) => `${k} ${n}`)
      .join('  ');
    console.log(`\n  champion vs repeated Charge: ${summary}`);

    const distinct = [...answers.keys()].length;
    expect(distinct).toBeGreaterThan(1);

    // Still a competent counter-puncher: Block should remain the single most
    // common answer. Unpredictable is the goal, random is not.
    const block = answers.get('block') ?? 0;
    const total = [...answers.values()].reduce((a, b) => a + b, 0);
    expect(block / total).toBeGreaterThan(0.4);
    expect(block / total).toBeLessThan(0.95);
  });

  it('rookie stays scattered', () => {
    // The rookie's unpredictability comes from misreading, not from mixing.
    // It should still be visibly worse at finding the counter than a champion.
    const rookie = provoke('rookie', 'charge', 60);
    const champ = provoke('champion', 'charge', 60);
    const rate = (m: Map<MoveKind | 'none', number>): number => {
      const total = [...m.values()].reduce((a, b) => a + b, 0);
      return total ? (m.get('block') ?? 0) / total : 0;
    };
    console.log(
      `  block rate — rookie ${(rate(rookie) * 100).toFixed(0)}%  champion ${(rate(champ) * 100).toFixed(0)}%`,
    );
    expect(rate(rookie)).toBeLessThan(rate(champ));
  });

  it('never spends meter it does not have', () => {
    // Mixing and baiting both add new spend paths; neither may put the AI
    // into an illegal activation.
    for (const difficulty of ['rookie', 'blader', 'champion'] as const) {
      for (let t = 0; t < 12; t++) {
        const seed = t * 313 + 11;
        const fighters: Fighter[] = [
          { id: 'p', name: 'P', build: makeBuild('valtryek', 'heavy', 'xtreme'), spinDir: 1 },
          { id: 'ai', name: 'AI', build: makeBuild('luinor', 'gravity', 'atomic'), spinDir: -1 },
        ];
        const battle = new Battle(fighters, { seed, pointsToWin: 999 });
        const ai = new AiController('ai', difficulty, makeRng(seed));
        const mk = (a: number): LaunchParams => ({
          power: 0.8,
          entryAngle: a,
          entryDepth: 0.15,
        });
        battle.startRound({ p: mk(0), ai: mk(Math.PI) });
        const me = battle.beys.find((b) => b.id === 'ai')!;
        while (battle.phase === 'battle') {
          const before = me.move;
          ai.update(battle, 1 / 60);
          if (me.move && me.move !== before && me.moveTime > 0) {
            // Meter is debited on activation, so the post-spend balance must
            // never have gone negative.
            expect(me.meter).toBeGreaterThanOrEqual(-1e-9);
          }
          battle.update(1 / 60);
        }
      }
    }
  });

  it('mixing has not blunted the champion where it should be strong', () => {
    // Seat-swapped, and that is load-bearing rather than tidiness.
    //
    // The first version of this test sat the champion on one side only and
    // reported it losing 35% of mirror matches, which looked like damning
    // evidence that mixing had crippled it. It had not: instrumenting the
    // rounds showed *neither* AI activating a single move, so their policies
    // could not have been the cause. The seat was. Measured with no
    // controller running at all, side A wins ~88% of an opposite-spin mirror
    // (and 48% of a same-spin one) — an emergent bias in how opposite-spin
    // tops meet, not an AI property.
    //
    // Averaging both seatings cancels it, so this measures the thing it
    // claims to. See the README's known gaps for the underlying bias.
    //
    // The mirror used is an ATTACK build, deliberately. In stamina and
    // defence mirrors the champion loses to the rookie — measured at 35% and
    // 15% — and that is a pre-existing property, identical with mixing
    // switched on and off, so it is not what this test is for. It is recorded
    // as a known gap rather than smuggled in here.
    const play = (champSeat: 'a' | 'b'): { wins: number; games: number } => {
      let wins = 0;
      let games = 0;
      for (let t = 0; t < 40; t++) {
        const seed = t * 97 + 5;
        const fighters: Fighter[] = [
          { id: 'a', name: 'A', build: makeBuild('valtryek', 'heavy', 'xtreme'), spinDir: 1 },
          { id: 'b', name: 'B', build: makeBuild('valtryek', 'heavy', 'xtreme'), spinDir: -1 },
        ];
        const rookSeat = champSeat === 'a' ? 'b' : 'a';
        const battle = new Battle(fighters, { seed, pointsToWin: 999 });
        const champ = new AiController(champSeat, 'champion', makeRng(seed * 5 + 2));
        const rookie = new AiController(rookSeat, 'rookie', makeRng(seed * 3 + 1));
        const mk = (x: number): LaunchParams => ({
          power: 0.8,
          entryAngle: x,
          entryDepth: 0.15,
        });
        battle.startRound({ a: mk(0), b: mk(Math.PI) });
        while (battle.phase === 'battle') {
          champ.update(battle, 1 / 60);
          rookie.update(battle, 1 / 60);
          battle.update(1 / 60);
        }
        const w = battle.lastRound?.winnerId;
        if (w) {
          games++;
          if (w === champSeat) wins++;
        }
      }
      return { wins, games };
    };

    const left = play('a');
    const right = play('b');
    const games = left.games + right.games;
    const rate = games ? (left.wins + right.wins) / games : 0;
    console.log(
      `  champion vs rookie, seat-averaged: ${(rate * 100).toFixed(0)}%` +
        `  (seat A ${((left.wins / Math.max(1, left.games)) * 100).toFixed(0)}%,` +
        ` seat B ${((right.wins / Math.max(1, right.games)) * 100).toFixed(0)}%)`,
    );
    expect(rate).toBeGreaterThan(0.5);
  });
});

void MOVES;
