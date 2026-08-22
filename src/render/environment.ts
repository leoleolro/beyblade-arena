import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Something for metal to reflect.
 *
 * THE BUG THIS FIXES, because it looks like a colour problem and is not. A
 * `MeshStandardMaterial` at `metalness: 0.92` has almost no diffuse response by
 * definition — a metal's colour comes from what it *reflects*, not from light
 * scattering out of it. With no environment in the scene there is nothing to
 * reflect, so the material resolves to near-black and takes only a thin
 * specular streak off the direct lights. That is exactly what the imported top
 * rendered as the moment it stopped being cel-shaded: a black rock with one
 * white scratch on it, in a scene where every other surface looked fine.
 *
 * It had been hidden until now. Cel metal (`metalToonMaterial`) fakes its
 * highlights with banded lighting and needs no environment at all, so while the
 * imported tops were cel-shaded they looked like polished steel. Switching them
 * to a real PBR metal is what surfaced a gap that had always been there — this
 * project has never had an environment map, and every high-metalness material
 * in it has been quietly rendering darker than intended.
 *
 * WHY `RoomEnvironment` RATHER THAN AN HDRI. It is generated in code from a
 * handful of emissive boxes, so it costs no download, no decode and no asset
 * pipeline — which matters for a game whose whole bundle is already 591 kB of
 * three. It is a small neutral studio: bright above, darker below, a couple of
 * soft sources. For machined metal that is the right reference anyway, and it
 * is what three's own material examples use.
 *
 * WHY NOT `scene.environment`, which is the one-liner. That applies to every
 * PBR material in the scene, including the dish, the wall and the rail — and
 * the Arena theme's stated contract is that it renders exactly as it did before
 * themes existed. Lighting the whole stadium differently to fix the tops would
 * break that for a change nobody asked for. So the map is handed to specific
 * materials through `envMap`, and the surfaces that were already right stay
 * untouched.
 */

/**
 * The PMREM-prefiltered environment, built once per renderer.
 *
 * Keyed by renderer because a PMREM texture belongs to the GL context that
 * compiled it: the arena, the garage preview and the inspector are three
 * separate `WebGLRenderer`s, and sharing one texture across them renders black
 * on two of the three.
 */
const cache = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();

export function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const hit = cache.get(renderer);
  if (hit) return hit;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  // The generator holds its own render targets and shaders; the texture it
  // produced outlives it, so releasing here leaks nothing and saves keeping a
  // second object alive for the session.
  pmrem.dispose();

  cache.set(renderer, env);
  return env;
}

/**
 * Point a material at the environment.
 *
 * `envMapIntensity` is the exposure dial and it is deliberately not 1. At 1 the
 * room's bright ceiling panel blows the top of a polished top out to white,
 * which reads as an unlit overexposure rather than as chrome; 0.85 keeps the
 * reflection bright enough to sell the finish while leaving headroom for the
 * arena's own key light to still be visible on the same surface.
 */
export function applyEnvironment(
  material: THREE.Material,
  env: THREE.Texture,
  intensity = 0.85,
): void {
  const m = material as THREE.MeshStandardMaterial;
  if (!('envMap' in m)) return;
  m.envMap = env;
  m.envMapIntensity = intensity;
  m.needsUpdate = true;
}

/**
 * Re-expose every already-reflective material under `root`.
 *
 * Needed because a theme switch does not rebuild the scene. `setTheme` only
 * reconstructs the tops when the `toon` flag flips, and the two themes whose
 * exposures differ most — Arena at 0.85 and Overdrive at 0.3 — are BOTH
 * non-toon. So switching between exactly those two left an imported top holding
 * whichever intensity it happened to be built with, and going Arena → Overdrive
 * put a 0.85 chrome top under a bloom pass tuned for 0.3: the white blob, back
 * again, but only for players who had switched rather than started there. The
 * kind of bug that never appears in a fresh load and always appears in real use.
 *
 * Only touches materials that already carry an `envMap`, so it cannot
 * accidentally make the dish or the wall reflective — those were deliberately
 * left out of the environment and must stay out. See the note above about not
 * using `scene.environment`.
 */
export function setEnvironmentIntensity(root: THREE.Object3D, intensity: number): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of list) {
      const m = mat as THREE.MeshStandardMaterial;
      if (m && m.envMap) m.envMapIntensity = intensity;
    }
  });
}
