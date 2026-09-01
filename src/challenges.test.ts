import { describe, expect, it } from 'vitest';
import { Battle } from './sim/battle';
import type { Fighter } from './sim/battle';
import { AiController } from './ai';
import { CHALLENGE_POOL } from './career';
import type { RoundRecord } from './career';
import { LAYERS, buildArchetype, makeBuild } from './sim/parts';
import { arenaById } from './sim/arena';
import { makeRng } from './sim/math';
import { registryPresets } from './render/beys/registry';

/**
 * Is every objective actually reachable?
 *
 * WHY THIS EXISTS, AND THE MISTAKE THAT PROMPTED IT. Fifteen played rounds
 * failed to tick `brawl12` once, so I measured its trigger across the roster
 * and got 7.9% against a comment claiming 19.1% — apparently a two-fold error
 * that would make a DAILY take eleven matches.
 *
 * That conclusion was wrong, and the way it was wrong is the reason this file
 * exists. THE DENOMINATOR IS A DESIGN DECISION. Sampling every bey equally
 * measures a player who picks at random; nobody does that. A player chases an
 * objective by equipping something that suits it, and archetype and spin
 * direction are exactly the two fields they control. Measured that way,
 * brawl12 fires at 25.0% and needs 3.5 matches, which is a perfectly good
 * daily, and the original comment's 19.1% sits between the two readings rather
 * than being a mistake at all.
 *
 * `class-stamina` is the case that makes the point unarguable: it looks like 78
 * rounds on a flat sample, because only 5 of 37 roster builds are stamina — and
 * it is 11 rounds for the player who equips one, which every player chasing it
 * will. A flat average would have failed a perfectly healthy objective.
 *
 * So the useful thing is not a hand-checked percentage, which goes stale the
 * moment the sim moves — and the charge, spin and absorber work this session
 * all moved it. It is this: play real rounds, build real `RoundRecord`s, run
 * every objective's own `counts` predicate over them, and take each rate over
 * the best (archetype, spin) bucket the player could deliberately choose.
 *
 * WHAT IT ASSERTS. Rounds-to-complete for each objective, against generous
 * bands: nothing may need more than 60 rounds (about seventeen matches, which
 * is not a day), and nothing may complete in under 2, which would make it free.
 * Wide on purpose — this is a reachability check, not a pacing target, and a
 * tight assertion on a stochastic sim is how you get a suite people ignore.
 */

/** Rounds sampled. Each produces two records, one per side. */
const SAMPLE_PAIRINGS = 6;

/** Measured elsewhere in this project: rounds that fit in one match. */
const ROUNDS_PER_MATCH = 3.43;

/** Longest a DAILY may take, in rounds. ~17 matches. */
const MAX_ROUNDS = 60;

function sampleRounds(): RoundRecord[] {
  const builds = registryPresets()
    .filter((p) => LAYERS.some((l) => l.id === p.layerId))
    .map((p) => ({
      layerId: p.layerId,
      discId: p.discId,
      driverId: p.driverId,
      build: makeBuild(p.layerId, p.discId, p.driverId),
    }));

  const out: RoundRecord[] = [];
  for (let i = 0; i < builds.length; i++) {
    for (let s = 0; s < SAMPLE_PAIRINGS; s++) {
      const k = (i * 7 + s * 3 + 1) % builds.length;
      const seed = s * 8191 + i * 131;
      const aiA = new AiController('a', 'champion', makeRng(seed * 3 + 1));
      const aiB = new AiController('b', 'champion', makeRng(seed * 7 + 2));
      const rng = makeRng(seed);
      const bSpin: 1 | -1 = rng() < 0.5 ? 1 : -1;
      const fighters: Fighter[] = [
        { id: 'a', name: 'A', build: builds[i].build, spinDir: 1 },
        { id: 'b', name: 'B', build: builds[k].build, spinDir: bSpin },
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
      const reason = b.lastRound?.reason ?? 'timeout';
      for (const [side, meta, spin] of [
        [0, builds[i], 1],
        [1, builds[k], bSpin],
      ] as const) {
        const bey = b.beys[side];
        out.push({
          won: !bey.defeat,
          reason,
          decidedMatch: true,
          layerId: meta.layerId,
          discId: meta.discId,
          driverId: meta.driverId,
          archetype: buildArchetype(meta.build),
          spinDir: spin,
          hitsLanded: bey.hitsLanded,
          spinStolen: bey.spinStolen,
          spinLeft: bey.spinAtLaunch > 0 ? Math.abs(bey.spin) / bey.spinAtLaunch : 0,
          seconds: b.roundTime,
          opponent: 'ladder',
        });
      }
    }
  }
  return out;
}

describe('objectives', () => {
  it('every one is reachable, and none is free', () => {
    const rounds = sampleRounds();
    expect(rounds.length, 'sampled enough rounds to measure a rate').toBeGreaterThan(300);

    // THE PLAYER PICKS THEIR BUILD, so an objective must be measured against a
    // player who is TRYING to finish it, not against the roster's average.
    // `class-stamina` looks unreachable at 78 rounds if you sample every bey
    // equally — but only 5 of 37 roster builds are stamina, and a player who
    // wants that objective simply equips one and it fires every round. Rate is
    // therefore taken over the best (archetype, spin) bucket the player could
    // choose, since those two fields are exactly what they control. Everything
    // else — hits, burst, spin left — stays down to how the round goes.
    const buckets = new Map<string, RoundRecord[]>();
    for (const r of rounds) {
      const k = `${r.archetype}:${r.spinDir}`;
      const list = buckets.get(k) ?? [];
      list.push(r);
      buckets.set(k, list);
    }
    const viable = [...buckets.values()].filter((rs) => rs.length >= 20);

    const failures: string[] = [];
    const report: string[] = [];
    for (const c of CHALLENGE_POOL) {
      let best = rounds;
      let rate = rounds.filter((r) => c.counts(r)).length / rounds.length;
      for (const rs of viable) {
        const r2 = rs.filter((r) => c.counts(r)).length / rs.length;
        if (r2 > rate) {
          rate = r2;
          best = rs;
        }
      }
      void best;

      // A set objective needs DISTINCT keys, so its cost is coupon-collecting
      // over the keys that actually occur — not `target / rate`. Approximated
      // by the rarest key it needs, which is the term that dominates.
      let need: number;
      if (c.key) {
        // A set objective needs distinct keys, so measure it over the WHOLE
        // sample: picking one build cannot help you collect three different
        // finishes, and bucketing would hide keys the player still has to find.
        const keys = new Map<string, number>();
        for (const r of rounds.filter((x) => c.counts(x))) {
          keys.set(c.key(r), (keys.get(c.key(r)) ?? 0) + 1);
        }
        if (keys.size < c.target) {
          failures.push(`${c.id}: only ${keys.size} distinct keys occur, needs ${c.target}`);
        }
        const rarest = Math.min(...[...keys.values()].map((n) => n / rounds.length));
        need = 1 / Math.max(rarest, 1e-6);
      } else {
        need = c.target / Math.max(rate, 1e-6);
      }

      report.push(
        `${c.id} (${c.scope}) fires ${(rate * 100).toFixed(1)}% → ~${need.toFixed(0)} rounds` +
          ` / ${(need / ROUNDS_PER_MATCH).toFixed(1)} matches`,
      );

      if (rate <= 0) failures.push(`${c.id}: never fires at all`);
      else if (need >= MAX_ROUNDS) {
        failures.push(`${c.id}: ~${need.toFixed(0)} rounds — not finishable as a ${c.scope}`);
      } else if (need <= 2) failures.push(`${c.id}: ~${need.toFixed(0)} rounds — free`);
    }
    // Logged BEFORE the assertion, so a failure shows the whole table rather
    // than only the first row that tripped.
    console.log('  ' + report.join('\n  '));
    expect(failures, failures.join('; ')).toEqual([]);
  });
});
