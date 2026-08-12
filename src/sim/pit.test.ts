import { describe, expect, it } from 'vitest';
import { Battle } from './battle';
import type { Fighter } from './battle';
import { SPIKE_PIT, STANDARD } from './arena';
import { makeRng } from './math';
import { PRESETS } from './parts';
import type { LaunchParams } from './types';

/**
 * The Spike Pit exists to fix a measured hole, so it is judged on whether the
 * measurement moved — not on whether the mechanic fires.
 *
 * The hole: on the plain dish the archetype win rates ran 33%–63%, because the
 * centre of a parabolic bowl is the calmest place on the board and low, deep
 * launches were being paid to sit in it. The pit charges rent on that square.
 * These tests assert the spread narrows, that the pit is escapable rather than
 * a stat check, and that it hasn't wrecked pacing.
 */

/** Every preset against every other, both spin pairings. Returns win rates. */
function sweep(arena: typeof STANDARD): {
  rates: { name: string; rate: number }[];
  spread: number;
  p50: number;
  under2: number;
} {
  const wins = new Array(PRESETS.length).fill(0);
  const games = new Array(PRESETS.length).fill(0);
  const lengths: number[] = [];

  for (let i = 0; i < PRESETS.length; i++) {
    for (let k = 0; k < PRESETS.length; k++) {
      if (i === k) continue;
      for (const opposite of [true, false]) {
        for (let s = 0; s < 6; s++) {
          const seed = s * 733 + i * 97 + k * 13 + (opposite ? 1 : 0);
          const rng = makeRng(seed);
          const fighters: Fighter[] = [
            { id: 'a', name: 'A', build: PRESETS[i].build(), spinDir: 1 },
            {
              id: 'b',
              name: 'B',
              build: PRESETS[k].build(),
              spinDir: opposite ? -1 : 1,
            },
          ];
          const battle = new Battle(fighters, { seed, pointsToWin: 999, arena });
          const mk = (): LaunchParams => ({
            power: 0.7 + rng() * 0.3,
            entryAngle: rng() * Math.PI * 2,
            entryDepth: rng() * 0.3,
          });
          battle.startRound({ a: mk(), b: mk() });
          while (battle.phase === 'battle') battle.update(1 / 60);
          lengths.push(battle.roundTime);

          const winner = battle.lastRound?.winnerId;
          games[i]++;
          games[k]++;
          if (winner === 'a') wins[i]++;
          else if (winner === 'b') wins[k]++;
        }
      }
    }
  }

  const rates = PRESETS.map((p, i) => ({
    name: p.name,
    rate: games[i] ? wins[i] / games[i] : 0,
  })).sort((x, y) => y.rate - x.rate);

  lengths.sort((a, b) => a - b);
  return {
    rates,
    spread: rates[0].rate - rates[rates.length - 1].rate,
    p50: lengths[Math.floor(lengths.length / 2)],
    under2: lengths.filter((x) => x < 2).length / lengths.length,
  };
}

describe('spike pit', () => {
  it('narrows the archetype win-rate spread', () => {
    const plain = sweep(STANDARD);
    const pit = sweep(SPIKE_PIT);

    const show = (s: typeof plain): string =>
      s.rates.map((r) => `${r.name} ${(r.rate * 100).toFixed(1)}%`).join('  ');
    console.log(`\n  plain dish  spread ${(plain.spread * 100).toFixed(1)}pts`);
    console.log(`    ${show(plain)}`);
    console.log(`  spike pit   spread ${(pit.spread * 100).toFixed(1)}pts`);
    console.log(`    ${show(pit)}`);

    // The whole justification for the arena. If this ever fails the pit has
    // stopped earning its place and should be retuned or removed, not have
    // the assertion relaxed.
    expect(pit.spread).toBeLessThan(plain.spread);
  });

  it('does not wreck pacing', () => {
    const pit = sweep(SPIKE_PIT);
    console.log(
      `  spike pit pacing — p50 ${pit.p50.toFixed(1)}s / under2 ${(pit.under2 * 100).toFixed(1)}%`,
    );
    // Same bounds the plain dish is held to: the pit should redistribute wins,
    // not turn every round into a race to drain.
    expect(pit.p50).toBeGreaterThan(4);
    expect(pit.under2).toBeLessThan(0.25);
  });

  it('never drains a top that stays out of the middle', () => {
    // Escapable by playing, not a stat check: a top orbiting outside the pit
    // radius must pay nothing at all.
    const rng = makeRng(4242);
    const fighters: Fighter[] = [
      { id: 'a', name: 'A', build: PRESETS[0].build(), spinDir: 1 },
      { id: 'b', name: 'B', build: PRESETS[1].build(), spinDir: -1 },
    ];
    const battle = new Battle(fighters, {
      seed: 4242,
      pointsToWin: 999,
      arena: SPIKE_PIT,
    });
    const mk = (): LaunchParams => ({
      power: 0.95,
      entryAngle: rng() * Math.PI * 2,
      entryDepth: 0,
    });
    battle.startRound({ a: mk(), b: mk() });

    let everOutside = false;
    while (battle.phase === 'battle') {
      battle.update(1 / 60);
      for (const b of battle.beys) {
        if (!b.alive) continue;
        const r = Math.hypot(b.pos.x, b.pos.y);
        if (r > SPIKE_PIT.pit!.radius) everOutside = true;
        // Outside the radius the dwell clock must be pinned at zero.
        if (r > SPIKE_PIT.pit!.radius) expect(b.pitTime).toBe(0);
      }
    }
    expect(everOutside).toBe(true);
  });

  it('leaves the plain dish untouched', () => {
    // The pit is opt-in geography. STANDARD must be bit-identical to before.
    const rng = makeRng(99);
    const mkBattle = (): Battle => {
      const fighters: Fighter[] = [
        { id: 'a', name: 'A', build: PRESETS[3].build(), spinDir: 1 },
        { id: 'b', name: 'B', build: PRESETS[4].build(), spinDir: -1 },
      ];
      return new Battle(fighters, { seed: 99, pointsToWin: 999, arena: STANDARD });
    };
    const battle = mkBattle();
    const base = rng() * Math.PI * 2;
    battle.startRound({
      a: { power: 0.8, entryAngle: base, entryDepth: 0.2 },
      b: { power: 0.8, entryAngle: base + Math.PI, entryDepth: 0.2 },
    });
    while (battle.phase === 'battle') battle.update(1 / 60);
    for (const b of battle.beys) {
      expect(b.pitDrained).toBe(0);
      expect(b.pitTime).toBe(0);
    }
  });
});
