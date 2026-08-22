import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { noOutline } from './toon';
import { applyEnvironment } from './environment';

/**
 * Imported beyblade models — a whole top per file.
 *
 * WHY WHOLE TOPS AND NOT PARTS. The original design here was one file per part
 * (layer / disc / driver), so that the 330 build combinations stayed visually
 * swappable. Then a real model arrived and the owner's own read of it settled
 * the question: the models are whole beyblades, splitting them is not wanted,
 * and the flat metal look is the point rather than a limitation. So a model
 * overrides the *whole top*.
 *
 * What that costs, stated plainly: while an imported top is showing, changing
 * the disc or driver does not change what you see. What it does NOT cost is
 * anything mechanical — the sim reads stats from the parts either way, so a
 * different disc still flies differently. The model is a skin over the build,
 * not the build.
 *
 * WHY STL IS SUPPORTED, WHICH IS NOT THE OBVIOUS CALL. STL is normally the
 * worst 3D format to build on: no materials, no colours, no UVs, no node names,
 * no hierarchy, and 3D-printing triangle counts. Every one of those objections
 * assumes you wanted per-part structure and authored colour. This project wants
 * neither — a top is one object, finished in one metal. The format's weaknesses
 * land entirely outside what we ask of it, and in exchange it removes a
 * conversion step from the loop that decides how often new beys get added.
 *
 * So: `.glb`, `.gltf` and `.stl` all load. Use whichever you have — VERIFIED by
 * converting the first model to STL and running it in the arena, not merely by
 * writing the branch.
 *
 * The one measured difference, and it is not visual: STL stores three full
 * vertices per triangle with no sharing, so the same mesh is 1.33x larger —
 * 708 kB against 532 kB for the first model, 42,456 stored vertices against
 * 14,978 real ones. Identical pixels, a third more download. That is the whole
 * case for preferring GLB, and it is a weak one next to "use the file you
 * already have".
 */

export type ModelFormat = 'glb' | 'gltf' | 'stl';

/**
 * Finish colour for imported tops.
 *
 * Near-white rather than a design colour, on the owner's read of the first
 * model: bare machined metal is the look, and tinting it toward a bey's palette
 * turns it back into painted plastic. The arena's own lighting supplies all
 * the colour it needs.
 */
export const MODEL_TINT = 0xd8dde3;

const formatOf = (url: string): ModelFormat =>
  url.endsWith('.stl') ? 'stl' : url.endsWith('.gltf') ? 'gltf' : 'glb';

/**
 * Loaded models, keyed by url.
 *
 * A promise rather than an object, so simultaneous requests for the same top
 * share one fetch. A miss is cached as hard as a hit — otherwise every round
 * re-requests a 404 for every bey nobody has modelled.
 */
const cache = new Map<string, Promise<THREE.Object3D | null>>();

let gltfLoader: GLTFLoader | null = null;
let stlLoader: STLLoader | null = null;

/**
 * Load one top. Resolves to null when there is no model, which is the normal
 * case and not an error — the caller keeps its procedural mesh.
 */
export function loadTopModel(url: string): Promise<THREE.Object3D | null> {
  const hit = cache.get(url);
  if (hit) return hit;

  const p =
    formatOf(url) === 'stl'
      ? (stlLoader ??= new STLLoader())
          .loadAsync(url)
          // STL is geometry, not a scene — there is nothing else in the file.
          .then((geo) => {
            geo.computeVertexNormals();
            const g = new THREE.Group();
            g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial()));
            return g as THREE.Object3D;
          })
          .catch(() => null)
      : (gltfLoader ??= new GLTFLoader())
          .loadAsync(url)
          .then((gltf) => gltf.scene as THREE.Object3D)
          .catch(() => null);

  cache.set(url, p);
  return p;
}

/**
 * Scale an imported top so what you see is what hits.
 *
 * The sim collides at exactly `a.stats.radius + b.stats.radius`, and the
 * procedural meshes satisfy that by construction because `bladeSilhouette` is
 * authored AT the collision radius. An imported model knows nothing about that,
 * and a modeller has no reason to guess this game's world units — the first
 * real file measured 39 units across.
 *
 * So the contract is enforced here rather than requested from the artist: the
 * model's own widest horizontal point is measured and scaled onto the collision
 * circle. Any model becomes honest regardless of the units it was authored in.
 *
 * Horizontal extent only. A top's height is a style choice; its RADIUS is the
 * one dimension the sim can feel.
 */
export function normaliseToRadius(obj: THREE.Object3D, radius: number): void {
  obj.updateMatrixWorld(true);
  const size = new THREE.Vector3();
  new THREE.Box3().setFromObject(obj).getSize(size);
  const widest = Math.max(size.x, size.z) / 2;
  if (!Number.isFinite(widest) || widest <= 1e-6) return;
  obj.scale.multiplyScalar(radius / widest);
}

/**
 * Sit the model on the dish with its driver tip at the group origin.
 *
 * Everything downstream assumes that origin: the burst scatter, the garage's
 * exploded view, the contact shadow and the ground glow all position from it.
 * An exported model is centred wherever the modeller left it — the first real
 * file arrived centred at (-20, 11, -46) — so this recentres horizontally and
 * drops the lowest point to y = 0.
 */
export function seatOnOrigin(obj: THREE.Object3D): void {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const centre = box.getCenter(new THREE.Vector3());
  obj.position.x -= centre.x;
  obj.position.z -= centre.z;
  obj.position.y -= box.min.y;
}

/**
 * Finish an imported top in cel metal.
 *
 * The first model carried no colour worth keeping — one merged material, a flat
 * grey diffuse, and that behind `KHR_materials_pbrSpecularGlossiness`, an
 * extension three removed years ago, so even the grey does not survive the
 * load. STL carries no colour at all by definition.
 *
 * That is fine, because a bare metal finish is what these are for. `tint` is
 * the design's own colour and is applied gently: the banded specular and
 * fresnel rim in `metalToonMaterial` do the work, and a strong tint would turn
 * machined metal back into painted plastic.
 */
export function finishAsMetal(
  obj: THREE.Object3D,
  tint: number,
  env: THREE.Texture | null = null,
): void {
  // ONE FINISH, EVERY THEME. This used to branch on `toon` and hand back cel
  // metal for the cartoon theme, which was the wrong axis to vary on: a top is
  // hardware in all three themes, and the theme dresses the arena around it.
  //
  // The cel branch also never worked in either direction. `MeshToonMaterial`
  // renders in flat bands with no real specular, so machined metal came out as
  // a pale paper cut-out; and the emissive lift that makes cel metal glow, plus
  // bloom, drove the whole model to a white blob with no readable geometry.
  //
  // Emissive is ZERO. An imported top is lit by the arena like everything else;
  // a self-lit one cannot be shaded, and under bloom it stops being an object.
  const mat = new THREE.MeshStandardMaterial({
    color: tint,
    metalness: 0.92,
    roughness: 0.28,
  });

  // NO INK, and this is now a decision rather than a workaround.
  //
  // The history is worth keeping because it was expensive. Inking an imported
  // top plastered it in black shards — three's inverted hull pushes every
  // vertex along its OWN normal, and this mesh has 98.1% of its positions
  // carrying more than one, so the hull tears open at every edge. That got
  // fixed properly with welded ink normals, and the fix works. Then the ink
  // came back at silhouette weight and the top read as a black blob in a live
  // match, because outline thickness is SCREEN-space: 0.02 is a fine line
  // around a top filling the inspector and a solid mass around one 60px wide.
  //
  // Owner's verdict on seeing both: "it looked much nicer without the outlines".
  // So imported tops are not inked at any weight, and the shard fix stays in
  // the tree for geometry that still draws linework.
  noOutline(mat);

  // Without this the material is a black rock. A metal's colour IS its
  // reflection, so at metalness 0.92 there is nothing to see until something is
  // being reflected — see environment.ts, which is where that is explained and
  // where the decision not to light the whole scene with it lives.
  if (env) applyEnvironment(mat, env);

  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) mesh.material = mat;
  });
}
