import { describe, expect, it } from 'vitest';
import { Battle } from './sim/battle';
import type { Fighter } from './sim/battle';
import { AiController } from './ai';
import { LAYERS, buildArchetype, makeBuild } from './sim/parts';
import { arenaById } from './sim/arena';
import { makeRng } from './sim/math';
import { registryPresets } from './render/beys/registry';

/**
 * Spin direction is the biggest decision in the game, and it was being made
 * backwards.
 *
 * `chooseSpinDir` used to send attack into opposite spin 85% of the time and
 * stamina into it 15%, reasoning that "aggressive builds want the exchanges;
 * stamina builds want the quiet attrition race they win by default". Measured
 * across the whole roster with the direction FORCED rather than chosen — so the
 * policy could not generate its own evidence — the truth is the reverse:
 *
 *     attack    same 63.8%   opposite 40.2%    -23.6
 *     balance   same 37.6%   opposite 45.9%     +8.3
 *     defense   same 31.8%   opposite 56.8%    +25.0
 *     stamina   same 12.2%   opposite 35.9%    +23.8
 *
 * That is a ±24 point swing on a choice made before the round starts, which
 * makes it worth more than any in-round decision the game offers.
 *
 * WHY: `spinSteal` only pays in opposite spin — `resolvePair` gates it exactly
 * that way — and per stamina build the gain tracks the stat almost perfectly:
 *
 *     Drain Fafnir       steal 0.62   12.5% -> 57.8%   +45.3
 *     Sanguine Nosferu   steal 0.88   10.9% -> 64.1%   +53.1
 *     Wizard Arrow       steal 0.00   12.5% -> 23.4%   +10.9
 *     Silver Wolf        steal 0.00   10.9% -> 12.5%    +1.6
 *
 * The two stealers go from worst-in-game to best-in-game on the launch decision
 * alone. The old policy denied them that matchup six times out of seven.
 *
 * Measured on the real game path afterwards — the AI choosing its own spin
 * against a fixed player spin, 1868 rounds per tier:
 *
 *     champion  52.6% -> 62.0%     blader  44.5% -> 49.8%     rookie  39.5% -> 41.9%
 *
 * The rookie's `spinRead` is 0, so it now flips a coin — and gains 2.4 points
 * doing it. The old policy was worse than random.
 */

const SEEDS = 4;

interface Cell {
  w: number;
  n: number;
}

const rate = (c: Cell): number => (c.n ? c.w / c.n : NaN);

function forcedSweep(): {
  byArch: Record<string, { same: Cell; opp: Cell }>;
  byBuild: Record<string, { steal: number; same: Cell; opp: Cell }>;
} {
  const builds = registryPresets()
    .filter((p) => LAYERS.some((l) => l.id === p.layerId))
    .map((p) => ({ name: p.name, build: makeBuild(p.layerId, p.discId, p.driverId) }));
  const arch = builds.map((b) => buildArchetype(b.build));

  const byArch: Record<string, { same: Cell; opp: Cell }> = {};
  const byBuild: Record<string, { steal: number; same: Cell; opp: Cell }> = {};

  for (let i = 0; i < builds.length; i++) {
    for (let k = 0; k < builds.length; k++) {
      if (i === k || arch[i] === arch[k]) continue;
      for (let s = 0; s < SEEDS; s++) {
        const opp = s % 2 === 0;
        const seed = s * 8191 + i * 131 + k;
        const aiA = new AiController('a', 'champion', makeRng(seed * 3 + 1));
        const aiB = new AiController('b', 'champion', makeRng(seed * 7 + 2));
        const rng = makeRng(seed);
        const fighters: Fighter[] = [
          { id: 'a', name: 'A', build: builds[i].build, spinDir: 1 },
          { id: 'b', name: 'B', build: builds[k].build, spinDir: opp ? -1 : 1 },
        ];
        const b = new Battle(fighters, { seed, arena: arenaById('standard'), pointsToWin: 999 });
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
        const won = !b.beys.find((x) => x.id === 'a')!.defeat;
        const key = opp ? 'opp' : 'same';
        const a = (byArch[arch[i]] ??= { same: { w: 0, n: 0 }, opp: { w: 0, n: 0 } });
        const p = (byBuild[builds[i].name] ??= {
          steal: builds[i].build.layer.spinSteal,
          same: { w: 0, n: 0 },
          opp: { w: 0, n: 0 },
        });
        a[key].n++;
        p[key].n++;
        if (won) {
          a[key].w++;
          p[key].w++;
        }
      }
    }
  }
  return { byArch, byBuild };
}

describe('spin direction', () => {
  it('the matchup preferences are what the policy claims they are', () => {
    const { byArch, byBuild } = forcedSweep();
    for (const [a, c] of Object.entries(byArch)) {
      console.log(
        `  ${a.padEnd(9)} same ${(rate(c.same) * 100).toFixed(1)}%  opp ${(rate(c.opp) * 100).toFixed(1)}%`,
      );
    }

    // Attack wants SAME spin. This is the half of the old policy that was most
    // confidently wrong, so it is asserted first.
    expect(rate(byArch.attack.same), 'attack prefers same spin').toBeGreaterThan(
      rate(byArch.attack.opp),
    );
    // Stamina and defense want OPPOSITE.
    expect(rate(byArch.stamina.opp), 'stamina prefers opposite spin').toBeGreaterThan(
      rate(byArch.stamina.same),
    );
    expect(rate(byArch.defense.opp), 'defense prefers opposite spin').toBeGreaterThan(
      rate(byArch.defense.same),
    );

    // And the reason: a stealer gains far more from opposite spin than a
    // non-stealer does. This is what ties the preference to the mechanic rather
    // than to an archetype label.
    const gains = Object.values(byBuild).map((p) => ({
      steal: p.steal,
      gain: rate(p.opp) - rate(p.same),
    }));
    const stealers = gains.filter((g) => g.steal > 0.3);
    const rest = gains.filter((g) => g.steal === 0);
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    const stealGain = mean(stealers.map((g) => g.gain));
    const restGain = mean(rest.map((g) => g.gain));
    console.log(
      `  opposite-spin gain: stealers +${(stealGain * 100).toFixed(1)}  non-stealers +${(restGain * 100).toFixed(1)}`,
    );
    expect(stealers.length, 'roster has spin stealers').toBeGreaterThan(0);
    expect(stealGain, 'stealers gain more from opposite spin').toBeGreaterThan(restGain + 0.15);
  });

  it('the policy sends stealers to opposite spin and attackers to same', () => {
    // Guards the inversion specifically. A champion knows the matchup; a rookie
    // does not and must sit near a coin flip.
    const pick = (layerId: string, discId: string, driverId: string, tier: 'champion' | 'rookie'): number => {
      const build = makeBuild(layerId, discId, driverId);
      let opp = 0;
      for (let s = 0; s < 400; s++) {
        const ai = new AiController('b', tier, makeRng(s * 977 + 5));
        if (ai.chooseSpinDir(build, 1) === -1) opp++;
      }
      return opp / 400;
    };

    const fafnir = pick('fafnir', 'spread', 'needle', 'champion');
    const valtryek = pick('valtryek', 'heavy', 'xtreme', 'champion');
    const rookieFafnir = pick('fafnir', 'spread', 'needle', 'rookie');
    console.log(
      `  champion opposite-spin rate: stealer ${(fafnir * 100).toFixed(0)}%  attacker ${(valtryek * 100).toFixed(0)}%  rookie stealer ${(rookieFafnir * 100).toFixed(0)}%`,
    );

    expect(fafnir, 'champion sends a stealer to opposite spin').toBeGreaterThan(0.8);
    expect(valtryek, 'champion keeps an attacker in same spin').toBeLessThan(0.3);
    // Tier gating: the rookie does not know this matchup exists.
    expect(Math.abs(rookieFafnir - 0.5), 'rookie is near a coin flip').toBeLessThan(0.12);
  });
});
