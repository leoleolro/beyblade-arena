import { describe, expect, it } from 'vitest';
import { Battle } from './battle';
import type { Fighter } from './battle';
import { makeBuild } from './parts';
import { arenaById } from './arena';

/**
 * The grind, measured.
 *
 * Three independent investigations of "the fight feels dead" all landed on the
 * same thing, and it was not what anyone assumed. The tops are NOT failing to
 * meet. They are in contact for roughly a fifth of the round — and late in a
 * round, nearly all of it — and the overwhelming majority of those contacts are
 * refused by the MIN_IMPACT gate because the relative normal speed is a tenth
 * of the threshold.
 *
 * The gate is right. Scoring those would grind out hundreds of hits a round,
 * which is the exact failure it was added to prevent. The defect was that
 * "does not score" had been silently implemented as "does not exist": nothing
 * was drawn, nothing was played, nothing was reported, so a fifth of every
 * round rendered as two tops doing nothing while they were in fact leaning on
 * each other.
 *
 * These tests pin the shape of that finding, because the numbers are the whole
 * argument for the renderer's grind stream — and because a future tuning pass
 * that accidentally eliminates sub-threshold contact would silently delete an
 * effect without touching a line of renderer code.
 */

function round(seed: number, sameSpin: boolean): { hits: number; contacts: number } {
  const fighters: Fighter[] = [
    { id: 'p', name: 'P', build: makeBuild('valtryek', 'gravity', 'atomic'), spinDir: 1 },
    {
      id: 'a',
      name: 'A',
      build: makeBuild('spryzen', 'heavy', 'atomic'),
      spinDir: sameSpin ? 1 : -1,
    },
  ];
  const b = new Battle(fighters, { seed, arena: arenaById('standard') });
  const ang = (seed % 360) * (Math.PI / 180);
  b.startRound({
    p: { power: 0.8, entryAngle: ang, entryDepth: 0.12 },
    a: { power: 0.8, entryAngle: ang + Math.PI, entryDepth: 0.12 },
  });

  let hits = 0;
  let contacts = 0;
  let t = 0;
  while (t < 45 && b.beys.every((x) => x.alive)) {
    b.update(1 / 60);
    t += 1 / 60;
    hits += b.hits.length;
    contacts += b.contacts.length;
  }
  return { hits, contacts };
}

describe('sub-threshold contact', () => {
  it('happens far more often than scoring hits', () => {
    let hits = 0;
    let contacts = 0;
    const N = 60;
    for (let s = 0; s < N; s++) {
      for (const same of [true, false]) {
        const r = round(s * 613 + 7, same);
        hits += r.hits;
        contacts += r.contacts;
      }
    }
    const ratio = contacts / Math.max(1, hits);
    console.log(
      `  ${N * 2} rounds: ${hits} scoring hits, ${contacts} sub-threshold contacts (${ratio.toFixed(1)}x)`,
    );
    // The renderer's whole grind stream is justified by this ratio. If it ever
    // collapses toward 1, the tops have stopped leaning on each other and the
    // grind effect has quietly become dead code.
    expect(contacts).toBeGreaterThan(hits);
  });

  it('reports a slip the renderer can aim a spark stream along', () => {
    // Aggregated over seeds rather than run once: a single round can genuinely
    // finish without ever producing a sub-threshold contact — an early ring-out
    // ends it before the tops settle into the lean — and a test that happens to
    // pick one of those rounds fails for a reason that is not a defect.
    let seen = 0;
    let maxSlip = 0;
    let maxGrind = 0;
    for (let s = 0; s < 20 && seen < 50; s++) {
      // OPPOSITE spin, and that is the measured, counter-intuitive part.
      //
      // Same-spin tops launch antipodally into isochronous swings and stay
      // antipodal — only 0.8% of frames in contact. Opposite-spin tops get
      // stripped by OPPOSITE_SPIN_DRAIN into a slow shared puddle near the
      // centre and then lean on each other for the rest of the round. So the
      // pairing that GRINDS the most has the LEAST slip per contact, because
      // counter-rotating surfaces roll rather than scrape. Both halves of that
      // are physically right and they pull against each other.
      const fighters: Fighter[] = [
        { id: 'p', name: 'P', build: makeBuild('valtryek', 'gravity', 'atomic'), spinDir: 1 },
        { id: 'a', name: 'A', build: makeBuild('spryzen', 'heavy', 'atomic'), spinDir: -1 },
      ];
      const b = new Battle(fighters, { seed: s * 977 + 13, arena: arenaById('standard') });
      const ang = s * 0.31;
      b.startRound({
        p: { power: 0.8, entryAngle: ang, entryDepth: 0.12 },
        a: { power: 0.8, entryAngle: ang + Math.PI, entryDepth: 0.12 },
      });

      let t = 0;
      while (t < 30 && b.beys.every((x) => x.alive)) {
        b.update(1 / 60);
        t += 1 / 60;
        for (const c of b.contacts) {
          seen++;
          // Below the gate by construction — that is what makes it a contact
          // and not a hit.
          expect(c.impact).toBeLessThan(0.32);
          expect(Number.isFinite(c.slip)).toBe(true);
          maxSlip = Math.max(maxSlip, Math.abs(c.slip));
          maxGrind = Math.max(maxGrind, c.grind);
        }
      }
    }
    console.log(
      `  ${seen} contacts sampled, peak slip ${maxSlip.toFixed(1)}, peak grind ${maxGrind.toFixed(2)}`,
    );
    expect(seen).toBeGreaterThan(0);
    // The renderer draws nothing below 0.12. slipNorm alone peaks at 0.018 on
    // these — which is why `abrasion` exists and why the grind is driven by it.
    expect(maxGrind).toBeGreaterThan(0.12);
    // No magnitude assertion. Counter-rotating surfaces roll rather than
    // scrape, so these carry only the difference in the two layers' radii —
    // a faint shimmer, correctly, not a shower. The renderer's slip floor
    // decides what is worth drawing; the sim's job here is only to report it.
  });
});
