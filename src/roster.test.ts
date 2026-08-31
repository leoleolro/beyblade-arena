import { describe, expect, it } from 'vitest';
import { Battle } from './sim/battle';
import type { Fighter } from './sim/battle';
import { AiController } from './ai';
import { LAYERS, buildArchetype, makeBuild } from './sim/parts';
import { arenaById } from './sim/arena';
import { makeRng } from './sim/math';
import { registryPresets } from './render/beys/registry';

/**
 * Balance across the ROSTER THE PLAYER ACTUALLY HAS.
 *
 * WHY THIS EXISTS. Every balance measurement in this project — `played.test.ts`,
 * `fairness.test.ts`, `tuning.test.ts`, the archetype investigations, all of it —
 * sweeps `PRESETS`, which is SIX anchor builds. The game ships thirty-seven.
 * So the entire balance record described 16% of the roster, and the one stamina
 * anchor in that six stood in for five real builds that play differently from it
 * and from each other.
 *
 * That gap produced a concrete false confidence: "stamina wins 30.8%" was really
 * "Endless Coil wins 30.8%", a single fafnir/spread/needle build which is itself
 * a spin-stealer and therefore the least representative stamina bey in the game.
 *
 * Measured here across every shipped build, both seats, cross-archetype pairings
 * only, one round each (a round is where archetype identity lives; a match just
 * repeats it):
 *
 *     attack   50.8%      defense  45.5%
 *     balance  41.7%      stamina  26.6%
 *
 * The conclusion survives the wider sample and gets stronger — stamina really is
 * the outlier, by 24 points, and two of its five builds are in the worst five of
 * the whole roster. See docs/PHYSICS.md section 6 for the four attempts to close
 * that gap and why each was reverted.
 *
 * WHY IT LIVES IN `src/` AND NOT `src/sim/`. It needs the registry, which is
 * render-side, because that is where whole-bey presets are declared. The
 * boundary rule is that `src/sim/` SOURCE must not import from `src/render/`;
 * a test above both, like `registry.test.ts`, may see both halves.
 *
 * WHAT IT ASSERTS. Bands wide enough that today's numbers pass, because a test
 * that fails on arrival gets skipped rather than fixed — but tight enough that
 * the next regression trips it. These are ratchets: when the spread closes, pull
 * them in.
 */

/** Seeds per ordered pairing. 4 gives ~3700 rounds in a couple of seconds. */
const SEEDS = 4;

interface Row {
  name: string;
  arch: string;
  wins: number;
  played: number;
}

function sweep(): { byArch: Record<string, Row>; byBuild: Row[] } {
  const builds = registryPresets()
    .filter((p) => LAYERS.some((l) => l.id === p.layerId))
    .map((p) => ({ name: p.name, build: makeBuild(p.layerId, p.discId, p.driverId) }));

  const arch = builds.map((b) => buildArchetype(b.build));
  const byArch: Record<string, Row> = {};
  const byBuild: Row[] = builds.map((b, i) => ({
    name: b.name,
    arch: arch[i],
    wins: 0,
    played: 0,
  }));

  for (let i = 0; i < builds.length; i++) {
    for (let k = 0; k < builds.length; k++) {
      // Cross-archetype only. A stamina mirror tells you nothing about whether
      // stamina is viable, and including mirrors drags every archetype toward
      // 50% by construction.
      if (i === k || arch[i] === arch[k]) continue;
      for (let s = 0; s < SEEDS; s++) {
        const seed = s * 8191 + i * 131 + k;
        const aiA = new AiController('a', 'champion', makeRng(seed * 3 + 1));
        const aiB = new AiController('b', 'champion', makeRng(seed * 7 + 2));
        const rng = makeRng(seed);
        const fighters: Fighter[] = [
          { id: 'a', name: 'A', build: builds[i].build, spinDir: 1 },
          { id: 'b', name: 'B', build: builds[k].build, spinDir: rng() < 0.5 ? 1 : -1 },
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
        const row = (byArch[arch[i]] ??= { name: arch[i], arch: arch[i], wins: 0, played: 0 });
        row.played++;
        byBuild[i].played++;
        if (won) {
          row.wins++;
          byBuild[i].wins++;
        }
      }
    }
  }
  return { byArch, byBuild };
}

const rate = (r: Row): number => (r.played ? r.wins / r.played : NaN);

describe('roster balance', () => {
  it('no archetype is unplayable, and no build is a must-pick', () => {
    const { byArch, byBuild } = sweep();

    const lines = Object.values(byArch)
      .sort((a, b) => rate(b) - rate(a))
      .map((r) => `${r.arch} ${(rate(r) * 100).toFixed(1)}% of ${r.played}`);
    console.log(`  ${lines.join('   ')}`);

    const ranked = byBuild.filter((r) => r.played > 0).sort((a, b) => rate(b) - rate(a));
    const show = (r: Row): string => `${r.name} (${r.arch}) ${(rate(r) * 100).toFixed(0)}%`;
    console.log(`  best  ${ranked.slice(0, 3).map(show).join(' | ')}`);
    console.log(`  worst ${ranked.slice(-3).map(show).join(' | ')}`);

    // Every archetype must be worth picking. Stamina sits at ~27, so this is a
    // ratchet at 20 rather than a target — tighten it when the gap closes.
    for (const r of Object.values(byArch)) {
      expect(rate(r), `${r.arch} archetype win rate`).toBeGreaterThan(0.2);
      expect(rate(r), `${r.arch} archetype win rate`).toBeLessThan(0.7);
    }

    // And no single build may dominate the roster. The best today is ~73%,
    // which is already high enough to be worth watching.
    const top = ranked[0];
    expect(rate(top), `${top.name} is a must-pick`).toBeLessThan(0.82);
    const bottom = ranked[ranked.length - 1];
    expect(rate(bottom), `${bottom.name} is unplayable`).toBeGreaterThan(0.1);
  });

  it('every shipped preset is actually buildable', () => {
    // The registry and the parts catalogue are two halves joined by id. This
    // catches a preset naming a disc or driver that does not exist, which would
    // otherwise only surface when a player picked that bey.
    for (const p of registryPresets()) {
      expect(() => makeBuild(p.layerId, p.discId, p.driverId), p.name).not.toThrow();
    }
  });
});
