import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { metalToonMaterial, noOutline, setOutline, toonMaterial } from './toon';

/**
 * Optional imported geometry for a beyblade part.
 *
 * A model is an OVERRIDE, never a replacement for the system. Any part without
 * one keeps its procedural mesh, so the game runs identically with an empty
 * `public/models/` directory — which is how it ships today.
 *
 * WHY PER PART AND NOT PER BEY. The renderer already builds tops from part ids:
 * `buildToonDriver` switches on the driver id, `buildToonDisc` on the disc id,
 * and the layer comes from its design. So the asset surface is 11 layers +
 * 5 discs + 6 drivers = 22 files, not 330 assembled tops — and per-part files
 * keep every combination swappable for free. A model of a whole assembled bey
 * would silently delete the part system.
 *
 * LOADING IS LAZY AND NON-BLOCKING. The procedural mesh is built and shown
 * immediately; if a model exists it resolves later and swaps in. First paint,
 * the headless sim and every test are therefore unaffected by whether any model
 * exists at all.
 */

/** Where a part's model lives, if it has one. `public/` is served at the root. */
const modelUrl = (kind: PartKind, id: string): string => `models/${id}-${kind}.glb`;

export type PartKind = 'layer' | 'disc' | 'driver';

/**
 * Cache of parsed scenes, keyed by url.
 *
 * A promise rather than a scene, so N simultaneous requests for the same part
 * share one network fetch instead of racing. `null` means "asked for, does not
 * exist" — a miss is cached as hard as a hit, because otherwise every round
 * would re-request a 404 for every part nobody has modelled.
 */
const cache = new Map<string, Promise<THREE.Object3D | null>>();

let loader: GLTFLoader | null = null;

/**
 * Fetch a part's model, or null if there isn't one.
 *
 * Never throws. A missing model is the normal case, not an error, so a 404
 * resolves to null and the caller keeps its procedural mesh.
 */
export function loadPartModel(kind: PartKind, id: string): Promise<THREE.Object3D | null> {
  const url = modelUrl(kind, id);
  const hit = cache.get(url);
  if (hit) return hit;

  loader ??= new GLTFLoader();
  const p = loader
    .loadAsync(url)
    .then((gltf) => gltf.scene as THREE.Object3D)
    .catch(() => null);
  cache.set(url, p);
  return p;
}

/**
 * Scale an imported part so what you see is what hits.
 *
 * The sim collides at exactly `a.stats.radius + b.stats.radius`, and the
 * codebase holds a documented "what you see is what hits" contract that the
 * procedural meshes satisfy by construction — `bladeSilhouette` is authored AT
 * the collision radius. An imported model knows nothing about that, and a
 * modeller has no reason to guess the game's world units.
 *
 * So the contract is enforced here rather than requested from the artist: we
 * measure the model's own horizontal extent and scale it so its widest point
 * sits exactly on the collision circle. That makes ANY model honest regardless
 * of what units it was authored in, which is strictly stronger than the
 * hand-tuned constants the procedural path needs.
 *
 * Measured on the XZ plane only. A layer's height is a style choice; its RADIUS
 * is the thing the sim can feel.
 */
export function normaliseToRadius(obj: THREE.Object3D, radius: number): void {
  const box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3();
  box.getSize(size);
  const widest = Math.max(size.x, size.z) / 2;
  if (widest <= 1e-6) return;
  obj.scale.multiplyScalar(radius / widest);
}

/**
 * Convert an imported model's materials to the theme's shading.
 *
 * A GLB arrives as `MeshStandardMaterial` with PBR maps. The Anime theme needs
 * `MeshToonMaterial` — the cel banding IS `gradientMap` plus NearestFilter, and
 * a standard material has no such slot — so those materials are rebuilt from
 * the imported base colour and map. Classic and Overdrive are already lit
 * renderers and keep what the artist exported.
 *
 * Worth knowing: `OutlineEffect` copies only `userData.outlineParameters` and
 * works on ANY material, so outlines are not toon-coupled. Only cel banding and
 * cel metal are. And `MeshToonMaterial` has no metalness or roughness slot, so
 * those two maps have nowhere to go — a modeller should not rely on them.
 */
export function retheme(obj: THREE.Object3D, toon: boolean, outline: number): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    const list = Array.isArray(mat) ? mat : [mat];

    if (!toon) {
      // Lit themes keep the exported PBR material; just give it the ink hook so
      // the outline pass can find it.
      for (const m of list) setOutline(m, { thickness: outline });
      return;
    }

    const rebuilt = list.map((m) => {
      const std = m as THREE.MeshStandardMaterial;
      const colour = std.color?.getHex() ?? 0xcccccc;
      // Anything the artist marked metallic gets cel metal, which is the one
      // treatment MeshToonMaterial cannot express on its own.
      const next =
        (std.metalness ?? 0) > 0.5
          ? metalToonMaterial(colour, { emissive: 0.04 })
          : (toonMaterial(colour) as THREE.MeshToonMaterial);
      if (std.map) (next as THREE.MeshToonMaterial).map = std.map;
      setOutline(next, { thickness: outline });
      return next;
    });
    mesh.material = rebuilt.length === 1 ? rebuilt[0] : rebuilt;
  });
}

/** Suppress ink on a subtree — for interior hardware. See HARDWARE_OUTLINE. */
export function unink(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    for (const m of Array.isArray(mat) ? mat : [mat]) noOutline(m);
  });
}
