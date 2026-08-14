import { describe, expect, it } from 'vitest';
import { slipNorm, surfaceSlip } from './physics';
import { makeBuild, deriveStats } from './parts';
import type { BeyState } from './types';

/**
 * The grinding-spark physics, pinned.
 *
 * The renderer decides how many sparks to throw from `surfaceSlip`, and the
 * whole point of that quantity is a result that is easy to get backwards:
 * two touching tops are meshing gears, so their surfaces slip MOST when they
 * spin the SAME way and least when they counter-rotate. Anyone "fixing" this
 * to match the game's opposite-spin-is-violent intuition would invert the one
 * visual signature same-spin matchups have.
 */

function top(id: string, layerId: string, spin: number): BeyState {
  const build = makeBuild(layerId, 'gravity', 'atomic');
  return {
    id,
    name: id,
    build,
    stats: deriveStats(build),
    pos: { x: 0, y: 0 },
    vel: { x: 0, y: 0 },
    spin,
    spinAtLaunch: Math.abs(spin),
    burst: 0,
    meter: 0,
    tilt: 0,
    alive: true,
    hitFlash: 0,
    move: null,
    moveTime: 0,
    hitsLanded: 0,
    spinStolen: 0,
    railTime: 0,
  } as unknown as BeyState;
}

describe('surface slip', () => {
  it('slips hardest when both tops spin the SAME way', () => {
    // Meshing gears must counter-rotate to roll without slipping. Same-spin is
    // therefore the grinding case, which is the opposite of where the rest of
    // the game's drama sits — hence the test.
    const same = Math.abs(surfaceSlip(top('a', 'valtryek', 900), top('b', 'spryzen', 900)));
    const opposed = Math.abs(surfaceSlip(top('a', 'valtryek', 900), top('b', 'spryzen', -900)));
    console.log(`  same-spin slip ${same.toFixed(2)}   opposite-spin slip ${opposed.toFixed(2)}`);
    expect(same).toBeGreaterThan(opposed);
    // And not marginally: with near-equal radii the opposite case nearly
    // cancels, which is what makes the two matchups look different at all.
    expect(opposed).toBeLessThan(same * 0.2);
  });

  it('is signed, so the spark stream has a direction to follow', () => {
    const right = surfaceSlip(top('a', 'valtryek', 900), top('b', 'spryzen', 900));
    const left = surfaceSlip(top('a', 'valtryek', -900), top('b', 'spryzen', -900));
    expect(Math.sign(right)).toBe(-Math.sign(left));
    expect(Math.abs(right)).toBeCloseTo(Math.abs(left), 6);
  });

  it('falls to nothing as the tops run down', () => {
    // Two dying tops should not throw a shower — a real contact at that speed
    // polishes rather than sparks, and the renderer has a floor for it.
    //
    // The floor is 0.04 normalised, and where that lands is worth writing down
    // because the first version of this test guessed and was wrong: it is
    // spin ≈ 36 out of SPIN_REF 900, i.e. 4% spin. A same-spin pair at 4% is
    // still slipping slightly and still throws three or four sparks, which is
    // correct — it is a genuine, very light grind, not a bug. What the floor
    // exists to exclude is rolling contact, and the number that matters for
    // that is the opposite-spin case at 0.018.
    const fresh = Math.abs(surfaceSlip(top('a', 'valtryek', 900), top('b', 'spryzen', 900)));
    const spent = Math.abs(surfaceSlip(top('a', 'valtryek', 30), top('b', 'spryzen', 30)));
    expect(spent).toBeLessThan(fresh * 0.1);
    expect(slipNorm(top('a', 'valtryek', 30), top('b', 'spryzen', 30))).toBeLessThan(0.04);
  });

  it('normalises the hardest grind to about 1 and a clean head-on to nearly 0', () => {
    // These two numbers are what the renderer's spark counts are calibrated
    // against; the first attempt assumed a 0..5 range and pinned every contact
    // at the cap.
    const same = slipNorm(top('a', 'valtryek', 900), top('b', 'spryzen', 900));
    const opposed = slipNorm(top('a', 'valtryek', 900), top('b', 'spryzen', -900));
    console.log(`  slipNorm same ${same.toFixed(3)}   opposite ${opposed.toFixed(3)}`);
    expect(same).toBeGreaterThan(0.85);
    expect(opposed).toBeLessThan(0.04);
  });

  it('scales with contact radius, not just spin', () => {
    // A wider layer sweeps more surface per radian, so it grinds more at the
    // same angular velocity. Aegis (0.1092) against Fafnir (0.0988).
    const wide = Math.abs(surfaceSlip(top('a', 'aegis', 900), top('b', 'aegis', 900)));
    const narrow = Math.abs(surfaceSlip(top('a', 'fafnir', 900), top('b', 'fafnir', 900)));
    expect(wide).toBeGreaterThan(narrow);
  });
});
