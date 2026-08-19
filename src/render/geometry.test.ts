import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { bladeSilhouette, CLASSIC } from './beyMesh';
import { BEY_REGISTRY } from './beys/registry';
import { LAYERS } from '../sim/parts';

/**
 * The first automated test of anything under `src/render/`.
 *
 * That directory is about 59% of the codebase and had no tests at all, because
 * "rendering needs a GL context" was taken to mean none of it was testable.
 * Most of it is not — but the GEOMETRY is pure maths, and geometry is where the
 * expensive bugs have actually been:
 *
 *  - the classic layer silently grew 37% in plan area and nobody noticed for
 *    several sessions until it was reported by eye;
 *  - the bevel pushed the widest ring past the sim's collision radius, so tops
 *    visibly overlapped before touching;
 *  - the outline artifact survived two fixes because nothing measured it.
 *
 * Every one of those is a number this file can check without a canvas.
 *
 * It also matters for what comes next. Phase 2 imports 3D models and scales
 * them so their visual radius matches the sim's collision radius; these tests
 * are the contract that scaling has to satisfy, written before the models
 * arrive rather than after.
 */

/** Farthest point of a Shape from the origin, sampled densely. */
function maxRadius(shape: THREE.Shape, samples = 2048): number {
  let max = 0;
  for (const p of shape.getPoints(samples)) {
    max = Math.max(max, Math.hypot(p.x, p.y));
  }
  return max;
}

/** Shoelace area of a Shape's outline. */
function planArea(shape: THREE.Shape, samples = 2048): number {
  const pts = shape.getPoints(samples);
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const q = pts[(i + 1) % pts.length];
    const p = pts[i];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

describe('layer geometry', () => {
  it('what you see is what hits — no design exceeds its collision radius', () => {
    // The sim collides at exactly `a.stats.radius + b.stats.radius`. A layer
    // drawn wider than that overlaps visibly before contact registers; drawn
    // much narrower and hits look like near-misses. This is the contract the
    // whole "what you see is what hits" note in beyMesh.ts is about, and until
    // now it was only ever checked by hand.
    const over: [string, number][] = [];
    for (const bey of BEY_REGISTRY) {
      const layer = LAYERS.find((l) => l.id === bey.id);
      expect(layer, `${bey.id} has no sim layer`).toBeTruthy();
      const r = layer!.radius;
      const silhouette = bladeSilhouette(layer!.blades, r, bey.anime.blade);
      const max = maxRadius(silhouette);
      over.push([bey.id, max / r]);
      // 1.006, and the slack is NOT taste. beyMesh.ts:235 records the measured
      // set: every design lands at 1.0000r except Cross X at 1.0053r, whose
      // `cut: 1.15` peaks a hair past r. That overshoot is known and accepted —
      // half a percent is invisible — so the bound admits it and nothing more.
      expect(max / r, `${bey.id} anime silhouette / collision radius`).toBeLessThanOrEqual(1.006);
      expect(max / r, `${bey.id} anime silhouette is suspiciously small`).toBeGreaterThan(0.8);
    }

    // And name the outlier, so a NEW design that starts overshooting fails here
    // rather than quietly widening the accepted set. A bound alone would let
    // the next bey drift to 1.005 unremarked.
    const exceeders = over.filter(([, k]) => k > 1.001).map(([id]) => id);
    console.log(`  max radius / r: ${over.map(([id, k]) => `${id} ${k.toFixed(4)}`).join('  ')}`);
    expect(exceeders, 'only Cross X is allowed past the collision radius').toEqual(['crossx']);
  });

  it('the classic layer sits inside the anime one, as its scale says', () => {
    // Classic renders at CLASSIC.layerScale. If someone changes that constant
    // without re-measuring, this catches it — that exact drift is what produced
    // the "the blades look very big now" report.
    for (const bey of BEY_REGISTRY) {
      const layer = LAYERS.find((l) => l.id === bey.id)!;
      const style = bey.classic?.blade ?? bey.anime.blade;
      const scale = bey.classic?.layerScale ?? CLASSIC.layerScale;
      const max = maxRadius(bladeSilhouette(layer.blades, layer.radius * scale, style));
      // Same 0.5% allowance as above, for the same reason and the same bey.
      expect(max / layer.radius, `${bey.id} classic vs collision radius`).toBeLessThanOrEqual(
        scale * 1.006,
      );
    }
  });

  it('no layer is a disc and none is a spider', () => {
    // Plan area as a fraction of its own circle. Below ~0.35 the silhouette has
    // so little material it reads as spokes rather than a top; at 1.0 it is a
    // featureless disc and the blade grammar has stopped doing anything. Both
    // ends are real failure modes of the procedural generator.
    const report: string[] = [];
    for (const bey of BEY_REGISTRY) {
      const layer = LAYERS.find((l) => l.id === bey.id)!;
      const shape = bladeSilhouette(layer.blades, layer.radius, bey.anime.blade);
      const frac = planArea(shape) / (Math.PI * layer.radius * layer.radius);
      report.push(`${bey.id} ${frac.toFixed(3)}`);
      expect(frac, `${bey.id} plan-area fraction`).toBeGreaterThan(0.35);
      expect(frac, `${bey.id} plan-area fraction`).toBeLessThan(0.98);
    }
    console.log('  plan area / circle: ' + report.join('  '));
  });

  it('blade count drives the silhouette, so swapping layers changes the shape', () => {
    // The original complaint that started the whole visual thread was "they all
    // look the same". Two layers with different blade counts must not produce
    // congruent outlines.
    const style = BEY_REGISTRY[0].anime.blade;
    const a = planArea(bladeSilhouette(3, 0.106, style));
    const b = planArea(bladeSilhouette(6, 0.106, style));
    expect(Math.abs(a - b) / a, 'a 3-blade and a 6-blade layer differ').toBeGreaterThan(0.01);
  });
});
