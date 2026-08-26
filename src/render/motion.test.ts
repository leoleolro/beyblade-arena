import { describe, expect, it } from 'vitest';
import {
  drawnSpinRate,
  isDiscLike,
  uprightAxis,
  poolBrightness,
  poolScale,
  SPEED_HI,
  SPEED_LO,
  speedK,
  trailScale,
} from './motion';

/**
 * These numbers are a claim about the GAME, not about arithmetic.
 *
 * The band exists to make a visual cue track the speeds a round actually
 * reaches, so the test that matters is: fed the measured distribution, does the
 * cue land somewhere useful? A ramp that is technically correct but sits at
 * 0.05 for every ordinary moment is a broken cue, and only a test written
 * against real percentiles catches that.
 *
 * Measured over ten AI-played rounds, sampling every frame (the probe lived in
 * src/sim and was deleted after; `played.test.ts` is the durable harness):
 *
 *   p10 0.63   p50 1.64   p90 2.99   peak 4.34
 */
const MEASURED = { p10: 0.63, p50: 1.64, p90: 2.99, peak: 4.34 };

const at = (speed: number): { vel: { x: number; y: number } } => ({
  vel: { x: speed, y: 0 },
});

describe('speedK', () => {
  it('spans most of its range across the measured p10..p90', () => {
    const lo = speedK(at(MEASURED.p10));
    const hi = speedK(at(MEASURED.p90));
    // The whole point: ordinary play must move the cue a lot. If p10 and p90
    // mapped to 0.30 and 0.45 the effect would be invisible in practice even
    // though every individual number was "right".
    expect(hi - lo).toBeGreaterThan(0.6);
  });

  it('puts the median in the middle, where a curve can move both ways', () => {
    const mid = speedK(at(MEASURED.p50));
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.6);
  });

  it('clamps rather than overshooting at the peak the sim can reach', () => {
    expect(speedK(at(MEASURED.peak))).toBe(1);
    expect(speedK(at(0))).toBe(0);
    // A stationary top and a slow one must not read as the same thing purely
    // because the clamp swallowed them.
    expect(speedK(at(SPEED_LO + (SPEED_HI - SPEED_LO) * 0.5))).toBeCloseTo(0.5, 5);
  });

  it('reads the vector, not one axis', () => {
    // 3-4-5: a top moving diagonally is moving at 5, not 3.
    expect(speedK({ vel: { x: 3, y: 4 } })).toBe(speedK(at(5)));
  });
});

describe('trailScale', () => {
  it('never fades the trail out entirely', () => {
    // The trail carries the skin colour and is how you tell whose top is
    // whose, so a stopped top still needs one.
    expect(trailScale(at(0))).toBeCloseTo(0.3, 5);
  });

  it('reaches full strength at the top of the band', () => {
    expect(trailScale(at(SPEED_HI))).toBeCloseTo(1, 5);
  });

  it('changes by more than 2x across ordinary play', () => {
    const slow = trailScale(at(MEASURED.p10));
    const fast = trailScale(at(MEASURED.p90));
    expect(fast / slow).toBeGreaterThan(2);
  });
});

describe('drawnSpinRate', () => {
  // The catalogue's real blade counts, which is what has to survive this.
  const BLADE_COUNTS = [3, 4, 5, 6, 8];

  it('never turns a layer more than half a blade step per frame', () => {
    // The Nyquist limit. Above it the rotation is indistinguishable from a
    // slower one in the opposite direction, which is precisely the "spinning
    // top looks like a stationary rock" bug this exists to kill.
    for (const blades of BLADE_COUNTS) {
      const step = (Math.PI * 2) / blades;
      const perFrame = drawnSpinRate(1, blades) / 60;
      expect(perFrame / step, `${blades} blades aliases`).toBeLessThan(0.5);
    }
  });

  it('improves on the simulated rate exactly where the sim aliases', () => {
    // What the sim itself advances per frame at SPIN_REF 900: 900 * (1/60) *
    // 0.05. Six and eight blades are the counts that break under it.
    const simPerFrame = 900 * (1 / 60) * 0.05;
    for (const blades of [6, 8]) {
      const step = (Math.PI * 2) / blades;
      expect(simPerFrame / step, `${blades} blades should be broken today`).toBeGreaterThan(0.5);
      expect(drawnSpinRate(1, blades) / 60 / step).toBeLessThan(0.5);
    }
  });

  it('turns a busier layer more slowly, because its step is shorter', () => {
    expect(drawnSpinRate(1, 8)).toBeLessThan(drawnSpinRate(1, 3));
  });

  it('winds down with remaining spin but never stops early', () => {
    const full = drawnSpinRate(1, 4);
    const dying = drawnSpinRate(0, 4);
    expect(dying).toBeLessThan(full);
    // A top still in play must still look like it is turning; 0 would read as
    // dead several seconds before it is.
    expect(dying).toBeGreaterThan(0);
    expect(dying / full).toBeCloseTo(0.25, 5);
  });

  it('is monotonic in spin', () => {
    let prev = -1;
    for (const sn of [0, 0.25, 0.5, 0.75, 1]) {
      const r = drawnSpinRate(sn, 6);
      expect(r).toBeGreaterThan(prev);
      prev = r;
    }
  });
});

/**
 * The clash pool's curves.
 *
 * Pinned because the effect has already been wrong once in exactly the way
 * these prevent. It shipped as a thin ring born small and expanding far, and
 * was reported as "not just a small wave like a water drop" — the complaint was
 * about SHAPE OVER TIME, not size or brightness, and neither of those is
 * visible in a diff or caught by anything else in this suite.
 */
describe('the clash pool reads as a flash, not a wave', () => {
  it('is born nearly full size', () => {
    // The one property that separates it from `Shockwave`, which is born at 22%
    // of its travel on purpose. A pool that grows like a ring is a ring.
    expect(poolScale(0)).toBeGreaterThan(0.8);
    expect(poolScale(1)).toBeCloseTo(1, 5);
  });

  it('never shrinks over its life', () => {
    let prev = -Infinity;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const s = poolScale(t);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it('peaks in the first fifth of its life and then only falls', () => {
    // Asymmetry is the point. `sin(pi*t)` — the ring's curve — peaks dead
    // centre, which reads as a wave passing through rather than an impact.
    let peakAt = 0;
    let peak = -Infinity;
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const b = poolBrightness(t);
      if (b > peak) {
        peak = b;
        peakAt = t;
      }
    }
    expect(peak).toBeCloseTo(1, 3);
    expect(peakAt).toBeLessThan(0.2);

    // Monotone decay after the peak — no second flare.
    let prev = Infinity;
    for (let t = 0.2; t <= 1.0001; t += 0.05) {
      const b = poolBrightness(t);
      expect(b).toBeLessThanOrEqual(prev + 1e-9);
      prev = b;
    }
  });

  it('starts and ends dark', () => {
    // Zero at birth, so a pool is never caught at full brightness on the frame
    // it appears; zero at death, so it fades rather than being cut.
    expect(poolBrightness(0)).toBeCloseTo(0, 6);
    expect(poolBrightness(1)).toBeCloseTo(0, 6);
  });

  it('is still clearly lit a third of the way through', () => {
    // The long decay is what makes it readable at 60fps. A curve that dropped
    // to nothing by t=0.3 would be a two-frame blink.
    expect(poolBrightness(0.33)).toBeGreaterThan(0.5);
  });

  it('clamps outside its life rather than going negative or exploding', () => {
    for (const t of [-1, -0.01, 1.01, 5]) {
      const b = poolBrightness(t);
      const s = poolScale(t);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
      expect(s).toBeGreaterThanOrEqual(0.8);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

/**
 * Imported models arriving on their side.
 *
 * The regression test for a bug that shipped and was reported by the owner:
 * "victory valkyrie and mage jab is spinning on the wrong axis, and the
 * beyblades are placed vertically rather than horizontally."
 *
 * Both were exported Z-up — Blender's default, against glTF's Y-up — and
 * nothing in the pipeline noticed. The real failure was not the models; it was
 * that four models were imported and only ONE was looked at, in one viewer, at
 * one angle. These are the measured boxes from the four files as they shipped.
 */
describe('uprighting an imported model', () => {
  const REAL = {
    valkyrie: [47.979, 47.463, 32.488],
    magejab: [49.79, 49.913, 38.313],
    dsycther: [44.225, 24.597, 45.123],
    dransword: [0.466, 0.362, 0.479],
  } as const;

  it('spots the two Z-up models and leaves the two Y-up ones alone', () => {
    expect(uprightAxis(...REAL.valkyrie).axis).toBe('z');
    expect(uprightAxis(...REAL.magejab).axis).toBe('z');
    expect(uprightAxis(...REAL.dsycther).axis).toBe('y');
    expect(uprightAxis(...REAL.dransword).axis).toBe('y');
  });

  it('rotates only the ones that need it', () => {
    expect(uprightAxis(...REAL.valkyrie).rotateX).toBeCloseTo(-Math.PI / 2, 6);
    expect(uprightAxis(...REAL.magejab).rotateX).toBeCloseTo(-Math.PI / 2, 6);
    expect(uprightAxis(...REAL.dsycther).rotateX).toBe(0);
    expect(uprightAxis(...REAL.dransword).rotateX).toBe(0);
  });

  it('trusts all four, because a beyblade is a disc', () => {
    for (const [name, dims] of Object.entries(REAL)) {
      expect(isDiscLike(uprightAxis(...(dims as unknown as [number, number, number]))), name).toBe(
        true,
      );
    }
  });

  it('refuses to guess at a shape that is not a disc', () => {
    // A cube has no meaningful shortest axis. Silently rotating something the
    // rule did not understand is worse than leaving it as the modeller left it,
    // so the caller is told rather than served a coin toss.
    expect(isDiscLike(uprightAxis(10, 10, 10))).toBe(false);
    expect(isDiscLike(uprightAxis(10, 9.5, 10))).toBe(false);
  });

  it('after uprighting, the spin axis is always the shortest', () => {
    // The property the whole thing exists for, stated directly: whatever comes
    // in, the axis it ends up spinning about is the flat one.
    const cases: Array<[number, number, number]> = [
      [40, 40, 20],
      [40, 20, 40],
      [20, 40, 40],
      [1, 0.3, 1],
    ];
    for (const [x, y, z] of cases) {
      const up = uprightAxis(x, y, z);
      const dims = { x, y, z };
      const shortest = Math.min(x, y, z);
      expect(dims[up.axis]).toBeCloseTo(shortest, 6);
    }
  });

  it('is stable under uniform scale', () => {
    // Models arrive at wildly different scales — 0.47 units and 48 units among
    // these four — so the reading must not depend on absolute size.
    const a = uprightAxis(47.979, 47.463, 32.488);
    const b = uprightAxis(0.47979, 0.47463, 0.32488);
    expect(b.axis).toBe(a.axis);
    expect(b.dominance).toBeCloseTo(a.dominance, 6);
  });
});
