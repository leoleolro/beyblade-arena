import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildSpinBlur } from './spinBlur';
import { BEYDEX } from './beydex';
import { setOutline, toonMaterial } from './toon';

/**
 * The layer's ink must not depend on how much spin is left.
 *
 * This is the regression test for the bug the owner reported twice: "in a
 * battle, after each contact, the black outlines get thicker and thicker. even
 * though at launch they all appear normal and fine."
 *
 * The cause was a ramp in `update()` — `base * (1 - (1 - 0.45) * k)`, where `k`
 * is blur dominance and blur dominance is a pure function of remaining spin. A
 * top launched at full spin drew its outline at 0.45x and grew to 1.0x as the
 * spin drained: a 2.2x change in line weight over a round, keyed to the one
 * quantity that only ever falls.
 *
 * It is tested by driving the real thing rather than a copy of the formula,
 * because a copy would have agreed with the bug. `update()` is called at both
 * ends of the spin range and the thickness actually written to
 * `userData.outlineParameters` is read back.
 */

/**
 * A no-op 2D canvas, because `bandTexture` paints one and the suite runs in
 * node with no DOM.
 *
 * A stub rather than jsdom: the pixels are irrelevant here — this test is about
 * a number written into `userData`, and pulling in a DOM implementation to
 * reach it would cost seconds per run for no extra coverage. Everything the
 * canvas API is asked for returns something chainable so the painting code runs
 * to completion untouched.
 */
function stubCanvas(): void {
  if (typeof document !== 'undefined') return;
  const ctx: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_t, key) => {
        if (key === 'canvas') return { width: 256, height: 256 };
        // One return shape covers every caller: gradients want addColorStop,
        // getImageData wants a writable `data` buffer.
        return () => ({
          addColorStop: () => undefined,
          data: new Uint8ClampedArray(256 * 256 * 4),
          width: 256,
          height: 256,
        });
      },
      set: () => true,
    },
  );
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => canvas,
  };
}

stubCanvas();

/** A layer stand-in carrying one inked material, like a real one does. */
function inkedLayer(thickness: number): { group: THREE.Group; read: () => number } {
  const mat = toonMaterial(0x44aa66, 0);
  setOutline(mat, { thickness });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.1), mat);
  const group = new THREE.Group();
  group.add(mesh);
  return {
    group,
    read: () => (mat.userData.outlineParameters as { thickness: number }).thickness,
  };
}

describe('layer ink through a round', () => {
  it('is the same at full spin and at almost none', () => {
    const layer = inkedLayer(0.02);
    const blur = buildSpinBlur(BEYDEX[0], 0.11, layer.group, 3);

    blur.update(1, 1 / 60);
    const atLaunch = layer.read();

    blur.update(0.02, 1 / 60);
    const atRoundEnd = layer.read();

    expect(atRoundEnd).toBeCloseTo(atLaunch, 6);
  });

  it('does not drift across a whole drain, hit by hit', () => {
    // The report was cumulative — "thicker and thicker" — so the shape of the
    // whole curve matters, not just its two ends.
    const layer = inkedLayer(0.02);
    const blur = buildSpinBlur(BEYDEX[0], 0.11, layer.group, 3);

    const seen = new Set<number>();
    for (let spin = 1; spin >= 0; spin -= 0.05) {
      blur.update(Math.max(0, spin), 1 / 60);
      seen.add(Number(layer.read().toFixed(9)));
    }
    expect(seen.size).toBe(1);
  });

  it('still thins the authored line, so a dense blur is not a fence', () => {
    // The thinning itself was never the bug and must survive: at full weight
    // the individual blade walls read as separate lines through the blur.
    const layer = inkedLayer(0.02);
    const blur = buildSpinBlur(BEYDEX[0], 0.11, layer.group, 3);
    blur.update(1, 1 / 60);
    expect(layer.read()).toBeLessThan(0.02);
    // And not so thin it disappears against a near-white dish.
    expect(layer.read()).toBeGreaterThan(0.005);
  });
});
