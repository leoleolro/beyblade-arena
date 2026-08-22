import * as THREE from 'three';
import type { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';

/**
 * Two sets of normals: one to shade with, one to ink with.
 *
 * THE BUG THIS EXISTS TO KILL. `OutlineEffect` is an inverted-hull outliner. It
 * redraws the scene with `side: BackSide` and a vertex shader whose whole body
 * is "push this vertex along its own normal by a fixed amount of screen":
 *
 *     vec3 outlineNormal = - objectNormal;
 *     gl_Position = calculateOutline( gl_Position, outlineNormal, ... );
 *
 * The word that matters is OWN. Each vertex moves independently, so the hull
 * only stays a closed shell if vertices that share a POSITION also share a
 * NORMAL. Our geometry does not. The imported Valtryek was measured at 14,978
 * vertices over 7,020 distinct positions with 98.1% of those positions carrying
 * more than one normal — a fully hard-edged mesh, one normal per face, split at
 * every edge. The procedural tops are milder but the same disease: extrusions
 * with a hard bevel, so the cap and the side wall meet at a shared position
 * holding two normals ninety degrees apart.
 *
 * At every one of those positions the hull does not inflate, it TEARS. The two
 * coincident vertices fly apart, the shell opens, and the black backfaces of
 * the hull poke through the front of the model. That is the black-shard field
 * in docs/BLACK-SHARDS.md, and it is why no thickness was ever going to fix it:
 * shrinking a torn hull just gives you smaller tears.
 *
 * THE FIX IS THE ARC SYSTEM WORKS ONE. Guilty Gear Xrd hits this exact wall —
 * hard edges are wanted for the shading and fatal for the outline — and solves
 * it by shipping two sets of vertex normals per model: the authored, split ones
 * for lighting, and a second set, averaged across every face meeting at a
 * position, used by nothing but the hull. Hard shading and an unbroken contour
 * at the same time, because the two passes stop sharing an input.
 *
 * So each opted-in geometry carries two extra attributes:
 *
 *   `shadeNormal` — an alias of whatever `normal` was authored as. The display
 *                   pass renders through this and nothing about the faceted
 *                   metal look changes.
 *   `inkNormal`   — the position-welded average. Same vertex COUNT as
 *                   `position`, so it is a drop-in swap.
 *
 * and `renderInked()` swaps `geometry.attributes.normal` between them around
 * `OutlineEffect.renderOutline()`.
 *
 * WHY NOT `BufferGeometryUtils.mergeVertices` + `computeVertexNormals`, which
 * is the answer the three.js forums give. Two reasons, both fatal here and both
 * checked against r185's actual source rather than against a blog post.
 * `mergeVertices` hashes EVERY attribute of a vertex, not just its position
 * (BufferGeometryUtils.js, the `for j of attributeNames` loop inside the vertex
 * scan) — so two coincident vertices with different normals hash differently
 * and do not merge. It declines to weld precisely the vertices we need welded.
 * And even setting that aside, a merged geometry has a different vertex count
 * and a different index, so it cannot be swapped into the original mesh; it
 * would have to become a second mesh, a second draw call and a second copy of
 * every top in the scene. Averaging in place is smaller and exact.
 *
 * WHY NOT POST-PROCESS EDGE DETECTION, which is what a modern stylised game
 * would ship. It is the technique that would still be correct after ten more
 * imported models, and it was seriously considered. It loses on the shape of
 * this renderer: `OutlineEffect` and the bloom `EffectComposer` are mutually
 * exclusive by construction in arena.ts, so a depth+normal edge pass has to
 * either replace both paths or fork them, and it would then also have to
 * re-derive per-material ink control — the dish, the backdrop and the contact
 * shadow are all deliberately un-inked via `noOutline`, and a full-screen edge
 * filter has no idea which surfaces those are. That is a rewrite of the cel
 * look. This is thirty lines of vertex maths that leaves the look identical
 * everywhere it was already right.
 */

/**
 * Where the two normal sets live on the geometry.
 *
 * Both are stored as REAL named attributes rather than in a WeakMap, and that
 * is not a stylistic call. three frees a geometry's GPU buffers by iterating
 * `geometry.attributes` on the dispose event (WebGLGeometries.onGeometryDispose)
 * — an attribute it cannot see there is an attribute whose buffer it never
 * deletes. The garage rebuilds its mesh on every part click, so a hidden
 * normal buffer would leak one copy per click. Being in the map costs an
 * upload of a buffer no shader binds; being outside it costs a leak.
 */
const INK_NORMAL = 'inkNormal';
const SHADE_NORMAL = 'shadeNormal';

/**
 * Weld radius, as a fraction of the geometry's largest dimension.
 *
 * RELATIVE, not absolute, because the two things this runs on differ in scale
 * by a factor of two hundred: a procedural layer is authored at radius 0.106 in
 * world units, while an imported model keeps whatever units its artist used —
 * the first one measured 39 across, and `normaliseToRadius` scales the OBJECT,
 * never the geometry, so the numbers this function sees stay at the authored
 * size. A fixed tolerance that welds correctly on one is either blind or
 * catastrophically greedy on the other. A fraction is right on both without
 * anybody tuning a constant per model, which is the whole point given that more
 * models are coming.
 *
 * 1e-4 of the bounding box is far above float round-off on a duplicated vertex
 * and far below the smallest real feature on either kind of mesh.
 */
const WELD = 1e-4;

/**
 * Give every mesh under `root` a set of ink normals.
 *
 * Idempotent and cheap to call twice: geometries are shared between the clones
 * of an imported model — one source object is cloned per top, and `clone()`
 * shares geometry by design — so the second and third top through here hit the
 * early return rather than recomputing 15,000 averages.
 */
export function weldInkNormals(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) addInkNormals(mesh.geometry);
  });
}

/** One geometry's worth of the above. Returns whether ink normals are present. */
export function addInkNormals(geometry: THREE.BufferGeometry): boolean {
  if (geometry.attributes[INK_NORMAL] !== undefined) return true;

  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  // No normals means no hull: `OutlineEffect.isCompatible` skips such a mesh
  // outright, so there is nothing here to fix.
  if (!position || !normal || position.count !== normal.count) return false;

  const welded = weldedNormals(position, normal);
  if (!welded) return false;

  geometry.setAttribute(INK_NORMAL, welded);
  // An alias, not a copy. `normal` is about to be reassigned once a frame and
  // this is the handle that puts the authored one back.
  geometry.setAttribute(SHADE_NORMAL, normal);
  return true;
}

/**
 * The averaged normal for every vertex, in the original vertex order.
 *
 * The average is UNWEIGHTED over the vertices sharing a position, rather than
 * area-weighted the way `computeVertexNormals` does it, and the difference is
 * visible on exactly the geometry this is for. On a hard-edged mesh each split
 * vertex already carries its own face's normal, so an unweighted average over
 * the split set is the average of the adjacent FACE normals — the bisector, the
 * direction that keeps a hull's corner square. Area weighting instead lets the
 * biggest neighbouring face win: at a blade tip, where a long thin side wall
 * meets a broad flat cap, the averaged normal would tip almost entirely to the
 * cap and the hull would push up instead of out, thinning or dropping the very
 * silhouette line the whole exercise is about.
 *
 * It also means a partly-smooth mesh does the sensible thing for free. A vertex
 * that was already shared across five faces carries their average and
 * contributes it once, so a smooth region blends into a hard edge instead of
 * being outvoted by it.
 */
function weldedNormals(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  normal: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
): THREE.BufferAttribute | null {
  const count = position.count;
  if (count === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  if (!Number.isFinite(extent) || extent <= 0) return null;

  // Positions are bucketed by rounding onto a lattice of this pitch. That is
  // the same quantise-and-hash trick `mergeVertices` uses, and it inherits the
  // same caveat: two positions a hair apart can land either side of a lattice
  // boundary and fail to weld. It is the right trade anyway, because the thing
  // being welded is a vertex the exporter DUPLICATED — bit-identical
  // coordinates, which always round the same way.
  const lattice = 1 / (extent * WELD);

  const clusters = new Map<string, number>();
  const owner = new Int32Array(count);
  const sumX = new Float64Array(count);
  const sumY = new Float64Array(count);
  const sumZ = new Float64Array(count);
  let next = 0;

  for (let i = 0; i < count; i++) {
    const key =
      `${Math.round(position.getX(i) * lattice)},` +
      `${Math.round(position.getY(i) * lattice)},` +
      `${Math.round(position.getZ(i) * lattice)}`;
    let cluster = clusters.get(key);
    if (cluster === undefined) {
      cluster = next++;
      clusters.set(key, cluster);
    }
    owner[i] = cluster;
    sumX[cluster] += normal.getX(i);
    sumY[cluster] += normal.getY(i);
    sumZ[cluster] += normal.getZ(i);
  }

  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const c = owner[i];
    let x = sumX[c];
    let y = sumY[c];
    let z = sumZ[c];
    const length = Math.sqrt(x * x + y * y + z * z);
    if (length < 1e-6) {
      // The normals at this position cancelled out — a zero-thickness sheet
      // whose two sides sit on top of each other, or a degenerate fan. There is
      // no meaningful average, and a zero-length push would collapse the hull
      // to nothing right there. Keep the authored normal: that vertex outlines
      // exactly as badly as it did before and no worse.
      x = normal.getX(i);
      y = normal.getY(i);
      z = normal.getZ(i);
    } else {
      x /= length;
      y /= length;
      z /= length;
    }
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  }

  return new THREE.BufferAttribute(out, 3);
}

/**
 * Draw the scene, then draw the ink over it with the welded normals.
 *
 * This replaces `OutlineEffect.render()`, which is nothing but these same two
 * renders back to back; splitting it is what opens the seam between them where
 * the normals get swapped. `renderOutline()` is a documented public method with
 * exactly this use in mind — three's own docs show it being called separately
 * so the outline can be threaded into a VR frame — so this is not reaching into
 * the effect's internals.
 *
 * One behavioural difference is worth naming because it is an improvement and
 * not an accident. `OutlineEffect.render()` sets `renderer.autoClear =
 * this.autoClear`, and `this.autoClear` is never initialised anywhere in r185,
 * so the base pass has been running with `autoClear === undefined` — falsy.
 * Nothing broke because an opaque `scene.background` forces a clear anyway and
 * an alpha canvas gets one from the browser, but calling the renderer directly
 * restores its own default and takes the question off the table.
 */
export function renderInked(
  renderer: THREE.WebGLRenderer,
  effect: OutlineEffect,
  scene: THREE.Scene,
  camera: THREE.Camera,
): void {
  renderer.render(scene, camera);

  useNormals(scene, INK_NORMAL);
  try {
    effect.renderOutline(scene, camera);
  } finally {
    // In a finally block because the alternative is a scene left shading
    // through its ink normals for the rest of the session — every faceted
    // surface silently gone smooth, with nothing on screen to connect it to
    // whatever threw three frames ago.
    useNormals(scene, SHADE_NORMAL);
  }
}

/**
 * Point every opted-in geometry's `normal` at one of its two sets.
 *
 * A full traversal per swap, twice a frame, which sounds worse than it is:
 * `renderOutline` already traverses the scene twice on its own to swap
 * materials, and this loop does one map lookup per node. Geometries that never
 * asked for ink normals are skipped on that lookup and pay nothing.
 *
 * Reassigning the attribute is enough to make three rebind it — `needsUpdate`
 * in WebGLBindingStates compares the cached attribute OBJECT against the one
 * currently on the geometry, so swapping the object invalidates the vertex
 * array and forces `setupVertexAttributes` to run again. Verified in r185's
 * source; if that ever stopped being true the outline would silently go back to
 * using the shading normals, which is to say back to shards.
 */
function useNormals(root: THREE.Object3D, which: string): void {
  root.traverse((child) => {
    const geometry = (child as THREE.Mesh).geometry;
    if (!geometry) return;
    const attribute = geometry.attributes[which];
    if (attribute) geometry.attributes.normal = attribute;
  });
}
