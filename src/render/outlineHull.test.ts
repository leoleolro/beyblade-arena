import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { addInkNormals, weldInkNormals } from './outlineHull';
import { bladeSilhouette } from './beyMesh';
import { BEY_REGISTRY } from './beys/registry';
import { LAYERS } from '../sim/parts';

/**
 * The measurement the black-shard bug never had.
 *
 * docs/BLACK-SHARDS.md exists because that artefact survived three fixes: two
 * of them were tuning passes on a number that could not have helped, and the
 * third removed the outline rather than the cause. Every one of them was
 * judged by eye on a screenshot. The thing that actually decides whether an
 * inverted hull holds together — whether two vertices sharing a POSITION also
 * share a NORMAL — is a count, and a count is exactly what this file takes.
 *
 * Nothing here needs a GL context. The hull is not a shading question; it is a
 * question about the geometry that gets fed to the shader, and that is pure
 * data.
 */

/**
 * Positions carrying more than one distinct normal, as a fraction of distinct
 * positions. This is the number quoted in the write-up — 98.1% for the imported
 * Valtryek — and it is the whole diagnosis in one figure: at every such
 * position three's outline shader pushes two coincident vertices in two
 * different directions and the hull comes apart there.
 */
function splitFraction(geometry: THREE.BufferGeometry, normalAttribute = 'normal'): number {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute(normalAttribute);
  const seen = new Map<string, Set<string>>();
  for (let i = 0; i < position.count; i++) {
    const at = `${position.getX(i)},${position.getY(i)},${position.getZ(i)}`;
    const dir =
      `${normal.getX(i).toFixed(4)},` +
      `${normal.getY(i).toFixed(4)},` +
      `${normal.getZ(i).toFixed(4)}`;
    const bucket = seen.get(at) ?? new Set<string>();
    bucket.add(dir);
    seen.set(at, bucket);
  }
  let split = 0;
  for (const bucket of seen.values()) if (bucket.size > 1) split++;
  return split / seen.size;
}

describe('outline hull normals', () => {
  it('welds the split normals a hard-edged mesh is made of', () => {
    // A box is the bug in miniature and the cheapest possible statement of it:
    // eight corners, twenty-four vertices, and every corner holding three
    // normals ninety degrees apart. Fix a box and you have fixed the class.
    const box = new THREE.BoxGeometry(1, 1, 1);
    expect(splitFraction(box), 'a box is split at every corner').toBe(1);

    expect(addInkNormals(box)).toBe(true);
    expect(splitFraction(box, 'inkNormal'), 'no corner is split for the hull').toBe(0);

    // And the welded normal has to be the corner's own outward diagonal — a
    // hull pushed along anything else does not inflate, it shears. On a cube
    // that is (±1,±1,±1)/sqrt(3), which is a value worth pinning rather than
    // merely asserting "non-zero": it is the only direction that keeps all
    // three faces meeting at that corner attached to each other.
    const position = box.getAttribute('position');
    const ink = box.getAttribute('inkNormal');
    const k = 1 / Math.sqrt(3);
    for (let i = 0; i < position.count; i++) {
      expect(ink.getX(i)).toBeCloseTo(Math.sign(position.getX(i)) * k, 5);
      expect(ink.getY(i)).toBeCloseTo(Math.sign(position.getY(i)) * k, 5);
      expect(ink.getZ(i)).toBeCloseTo(Math.sign(position.getZ(i)) * k, 5);
    }
  });

  it('leaves the shading normals exactly as authored', () => {
    // The reason for two sets rather than one smooth set is that the faceted
    // metal read on the imported tops is WANTED. If this ever starts smoothing
    // the display normals as a side effect, the models go soft and nobody will
    // connect it to a file about outlines.
    const box = new THREE.BoxGeometry(1, 1, 1);
    const before = Array.from(box.getAttribute('normal').array);
    addInkNormals(box);
    expect(Array.from(box.getAttribute('normal').array)).toEqual(before);
    expect(box.getAttribute('shadeNormal')).toBe(box.getAttribute('normal'));
  });

  it('welds every layer in the roster, at the scale they are authored at', () => {
    // The procedural tops are the half of the bug that is easy to forget,
    // because their version of it is a comb of shards at the blade tips rather
    // than a model plastered in them. Same cause: an extrusion splits its
    // normals at every bevel.
    //
    // Layers are authored at radius ~0.106 world units while an imported model
    // arrives 39 units across, and the weld tolerance is a FRACTION of the
    // geometry rather than an absolute distance precisely so that both weld
    // correctly with nobody tuning a constant. This is the small end of that
    // range; if the tolerance is ever made absolute, this test is where it
    // breaks.
    const report: string[] = [];
    for (const bey of BEY_REGISTRY) {
      const layer = LAYERS.find((l) => l.id === bey.id)!;
      const shape = bladeSilhouette(layer.blades, layer.radius, bey.anime.blade);
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: layer.radius * 0.24,
        bevelEnabled: true,
        bevelThickness: layer.radius * 0.05,
        bevelSize: layer.radius * 0.03,
        bevelSegments: 2,
        curveSegments: 6,
      });
      const before = splitFraction(geometry);
      expect(addInkNormals(geometry)).toBe(true);
      const after = splitFraction(geometry, 'inkNormal');
      report.push(`${bey.id} ${(before * 100).toFixed(0)}% -> ${(after * 100).toFixed(0)}%`);
      expect(before, `${bey.id} extrusion should be hard-edged to begin with`).toBeGreaterThan(0.5);
      expect(after, `${bey.id} hull normals still split`).toBe(0);
    }
    console.log('  split positions, shading -> ink: ' + report.join('  '));
  });

  it('keeps the authored normal where an average would collapse to nothing', () => {
    // Two coincident triangles facing opposite ways — a zero-thickness sheet.
    // Averaging gives the zero vector, and a vertex pushed by zero puts a hole
    // in the hull at exactly that point. The fallback is not cosmetic: without
    // it, one degenerate sheet anywhere in a mesh reintroduces the artefact
    // this module exists to remove.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0], 3),
    );
    geometry.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1], 3),
    );
    expect(addInkNormals(geometry)).toBe(true);
    const ink = geometry.getAttribute('inkNormal');
    for (let i = 0; i < 6; i++) {
      expect(Math.hypot(ink.getX(i), ink.getY(i), ink.getZ(i)), `vertex ${i}`).toBeCloseTo(1, 5);
    }
    expect(ink.getZ(0)).toBe(1);
    expect(ink.getZ(3)).toBe(-1);
  });

  it('costs nothing to run twice over a shared geometry', () => {
    // Imported models are cloned per top and `clone()` shares geometry, so this
    // runs two or three times over the same 15,000 vertices in a match. The
    // second call has to be a lookup, not a rebuild.
    const shared = new THREE.BoxGeometry(1, 1, 1);
    const a = new THREE.Mesh(shared);
    const b = new THREE.Mesh(shared);
    const root = new THREE.Group();
    root.add(a, b);
    weldInkNormals(root);
    const first = shared.getAttribute('inkNormal');
    weldInkNormals(root);
    expect(shared.getAttribute('inkNormal')).toBe(first);
  });

  it('declines a geometry with no normals rather than inventing some', () => {
    // `OutlineEffect.isCompatible` skips a mesh with no normal attribute
    // outright, so there is no hull to repair and nothing this could improve.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    expect(addInkNormals(geometry)).toBe(false);
    expect(geometry.getAttribute('inkNormal')).toBeUndefined();
  });
});
