import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { normaliseToRadius } from './partModels';
import { LAYERS } from '../sim/parts';

/**
 * The safety rail for imported geometry.
 *
 * The sim collides at exactly `a.stats.radius + b.stats.radius`, and the
 * procedural meshes satisfy that by construction — `bladeSilhouette` is
 * authored AT the collision radius, and `geometry.test.ts` measures every
 * design against it.
 *
 * An imported model has no such guarantee. A modeller works in millimetres, or
 * in Blender units, or at whatever scale looked right in the viewport, and has
 * no reason to know the game's world units. If that arrived unnormalised the
 * result would be a top that overlaps before it touches, or one that registers
 * hits across a visible gap — the exact defect the "what you see is what hits"
 * note in beyMesh.ts was written about.
 *
 * So the contract is enforced in code rather than requested from the artist,
 * and these tests are what make that promise real.
 */

/** A stand-in for an imported part, at a deliberately absurd scale. */
function fakePart(width: number, height: number): THREE.Object3D {
  const g = new THREE.Group();
  // Two meshes at different offsets, so the bounding box is not centred on the
  // origin — an imported model rarely is.
  const a = new THREE.Mesh(new THREE.BoxGeometry(width, height, width * 0.8));
  const b = new THREE.Mesh(new THREE.BoxGeometry(width * 0.3, height * 2, width * 0.3));
  b.position.set(width * 0.2, height, 0);
  g.add(a, b);
  return g;
}

/** Widest horizontal half-extent, which is what the sim collides on. */
function radiusOf(obj: THREE.Object3D): number {
  obj.updateMatrixWorld(true);
  const size = new THREE.Vector3();
  new THREE.Box3().setFromObject(obj).getSize(size);
  return Math.max(size.x, size.z) / 2;
}

describe('imported part normalisation', () => {
  it('lands any model on the collision radius, whatever units it was authored in', () => {
    // Millimetres, metres, inches, "whatever looked right" — all of them.
    for (const authored of [0.001, 0.05, 1, 42, 1000]) {
      for (const layer of LAYERS) {
        const part = fakePart(authored, authored * 0.4);
        normaliseToRadius(part, layer.radius);
        expect(radiusOf(part), `${layer.id} authored at ${authored}`).toBeCloseTo(
          layer.radius,
          6,
        );
      }
    }
  });

  it('measures the horizontal extent, not the height', () => {
    // A layer's height is a style choice; its radius is the only dimension the
    // sim can feel. A tall part must not be shrunk for being tall.
    const tall = fakePart(1, 8);
    const flat = fakePart(1, 0.1);
    normaliseToRadius(tall, 0.106);
    normaliseToRadius(flat, 0.106);
    expect(radiusOf(tall)).toBeCloseTo(0.106, 6);
    expect(radiusOf(flat)).toBeCloseTo(0.106, 6);
  });

  it('survives a degenerate model instead of dividing by zero', () => {
    // An empty group, or a part exported with no geometry, must not produce a
    // NaN scale that silently makes the whole top disappear.
    const empty = new THREE.Group();
    expect(() => normaliseToRadius(empty, 0.106)).not.toThrow();
    expect(Number.isFinite(empty.scale.x)).toBe(true);
    expect(empty.scale.x).toBe(1);
  });

  it('is idempotent, so a re-normalised part does not creep', () => {
    // setBeys can run more than once per round (a mid-round theme switch calls
    // it again). Normalising twice must not halve the model.
    const part = fakePart(3, 1);
    normaliseToRadius(part, 0.106);
    normaliseToRadius(part, 0.106);
    expect(radiusOf(part)).toBeCloseTo(0.106, 6);
  });
});
