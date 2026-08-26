import * as THREE from 'three';
import { finishImported, instantiateModel, loadTopModel, normaliseToRadius, seatOnOrigin } from './topModels';
import { MODEL_TINT } from './topModels';
import { studioEnvironment } from './environment';
import { topModelFor } from './topModelIndex';

/**
 * A picker chip for a bey that has an imported model.
 *
 * WHY THE CANVAS2D THUMBNAIL IS NOT ENOUGH FOR THESE. `beyThumb` traces the
 * same `bladeSilhouette` the procedural mesh is extruded from, and that shared
 * source is its whole argument: a thumbnail drawn from the same data as the
 * model cannot advertise something the player will not get. That argument
 * simply does not extend to an imported top, which has no `Shape` to sample —
 * so a modelled bey showed the OLD procedural artwork in the picker while the
 * preview beside it and the match afterwards both showed a completely
 * different object. Picking a bey by its chip meant picking the wrong picture.
 *
 * WHY THIS DOES NOT REPRODUCE THE PROBLEM beyThumb WAS AVOIDING. That module
 * rejected "a WebGL preview per chip" because ten live renderers would blow
 * through the browser's ~16 context limit. This is one renderer, created on
 * first use, drawing each model ONCE into a still image and caching the data
 * URL. Two models today and the count grows with the roster, not with the
 * number of chips on screen — a hundred chips would still be one context and
 * whatever handful of distinct models the roster holds.
 *
 * A still rather than a live view is also the honest choice for a chip. The
 * plan view beyThumb draws is chosen because it is the angle a blade profile
 * reads from; this keeps a similar high three-quarter angle for the same
 * reason, and neither needs to animate to say which bey it is.
 */

/** Square edge of the rendered image, in device pixels. */
const RENDER_SIZE = 192;

/**
 * Put the bey's identity colour back behind the render.
 *
 * The chips are colour-coded, and that coding is doing real work at 64px: a
 * player finds Fafnir by looking for the yellow one long before they read the
 * label. Both imported models are bare metal, so replacing their chips with
 * accurate renders made the two of them grey, similar to each other, and the
 * only two chips in the picker with no colour identity at all — accurate, and
 * measurably harder to pick out.
 *
 * So the render is composited over a soft radial wash of the layer's own
 * colour. The chip keeps the coding it had, and the object on top of it is
 * still the object you will actually get.
 */
function composite(source: HTMLCanvasElement, tint: number): string {
  const out = document.createElement('canvas');
  out.width = RENDER_SIZE;
  out.height = RENDER_SIZE;
  const ctx = out.getContext('2d');
  if (!ctx) return source.toDataURL('image/png');

  const r = (tint >> 16) & 0xff;
  const g = (tint >> 8) & 0xff;
  const b = tint & 0xff;
  const half = RENDER_SIZE / 2;
  const wash = ctx.createRadialGradient(half, half, 0, half, half, half);
  // NEARLY FLAT, falling off only at the rim. The obvious gradient — hot centre,
  // gone by the edge — was measured at alpha 0.03 everywhere it was actually
  // visible, because the model covers the middle 80% of the tile and the only
  // part of the wash left on screen was its faintest tail. The tint has to live
  // where the model is not.
  wash.addColorStop(0, `rgba(${r},${g},${b},0.5)`);
  wash.addColorStop(0.62, `rgba(${r},${g},${b},0.44)`);
  wash.addColorStop(1, `rgba(${r},${g},${b},0.1)`);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, RENDER_SIZE, RENDER_SIZE);

  ctx.drawImage(source, 0, 0);
  return out.toDataURL('image/png');
}

let renderer: THREE.WebGLRenderer | null = null;
const cache = new Map<string, Promise<string | null>>();

/**
 * The shared offscreen renderer.
 *
 * `alpha: true` and a fully transparent clear, so the chip keeps the CSS
 * background behind it rather than carrying a black square into a themed panel.
 */
function offscreen(): THREE.WebGLRenderer {
  if (renderer) return renderer;
  const canvas = document.createElement('canvas');
  canvas.width = RENDER_SIZE;
  canvas.height = RENDER_SIZE;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

/**
 * Render one model to a PNG data URL, or resolve null when the bey has none.
 *
 * Null is the ordinary answer, not an error: most beys have no model and the
 * caller keeps the Canvas2D thumbnail it already drew.
 */
export function modelThumb(
  layerId: string,
  radius: number,
  tint: number,
): Promise<string | null> {
  const hit = cache.get(layerId);
  if (hit) return hit;

  const entry = topModelFor(layerId);
  if (!entry) {
    const miss = Promise.resolve(null);
    // Cached as hard as a hit, so a picker of ten chips does not re-ask ten
    // times per render for the eight that will never have one.
    cache.set(layerId, miss);
    return miss;
  }

  const job = loadTopModel(entry.url)
    .then((src) => {
      if (!src) return null;

      const gl = offscreen();
      const scene = new THREE.Scene();

      const model = instantiateModel(src);
      normaliseToRadius(model, radius);
      seatOnOrigin(model);
      // Full exposure regardless of theme: a chip is read against a panel, not
      // inside an arena, so there is no bloom to stay under and no pale dish to
      // hold contrast against. The two reasons a theme dims this do not apply.
      finishImported(model, MODEL_TINT, studioEnvironment(gl), entry.finish, 0.85);
      scene.add(model);

      // Lit for legibility rather than for mood — this is a catalogue picture.
      scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x20242e, 1.5));
      const key = new THREE.DirectionalLight(0xffffff, 2.4);
      key.position.set(1.2, 2.4, 1.5);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x88bbff, 1.2);
      rim.position.set(-1.5, 0.6, -1.2);
      scene.add(rim);

      // Frame from the model's real extent, so a wide top and a tall one both
      // fill the chip. Measured after seating, and on the model alone — there
      // is nothing else in this scene to contaminate the box.
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());

      const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
      const fov = (camera.fov * Math.PI) / 180;
      // 1.35 is margin. The chip is small and a top that touches the edges
      // reads as cropped rather than as big.
      const need = Math.max(size.x, size.y, size.z) * 1.35;
      const dist = need / 2 / Math.tan(fov / 2);
      // A high three-quarter angle: enough elevation to show the blade plan,
      // enough offset to keep the side profile readable.
      camera.position.set(dist * 0.42, dist * 0.62, dist * 0.66);
      camera.lookAt(centre);

      gl.setSize(RENDER_SIZE, RENDER_SIZE, false);
      gl.render(scene, camera);
      const url = composite(gl.domElement, tint);

      // The scene is thrown away but its GPU resources are not automatic.
      // Geometry is SHARED with the cached source model and must NOT be
      // disposed — the arena and the garage clone from that same object, and
      // freeing it here would empty their meshes. Materials are made fresh by
      // `finishImported`, so those are ours to release.
      model.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of list) m?.dispose();
      });

      return url;
    })
    .catch(() => null);

  cache.set(layerId, job);
  return job;
}
