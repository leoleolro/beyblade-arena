import * as THREE from 'three';

/**
 * Cel shading.
 *
 * The gap between "3D game" and "cartoon" is almost entirely two things: light
 * falling in *bands* instead of a smooth gradient, and a hard dark line around
 * every silhouette. Colour palette and effects matter far less than people
 * expect — a scene with flat bands and outlines reads as animation even with
 * ordinary geometry, and a scene without them reads as CG no matter how
 * saturated it is.
 *
 * Both are cheap here: MeshToonMaterial does the banding given a gradient map
 * with nearest-neighbour filtering, and three ships an OutlineEffect that draws
 * the inverted-hull outline for the whole scene in one wrap of the renderer.
 */

let sharedRamp: THREE.DataTexture | null = null;

/**
 * The tone ramp. Three hard steps: shadow, mid, light.
 *
 * NearestFilter is the entire trick — with linear filtering this interpolates
 * back into the smooth gradient it is supposed to be replacing.
 */
export function toonRamp(): THREE.DataTexture {
  if (sharedRamp) return sharedRamp;

  const steps = new Uint8Array([70, 150, 255]);
  const tex = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  sharedRamp = tex;
  return tex;
}

/** A cel-shaded material in the given colour. */
export function toonMaterial(colour: number, emissive = 0): THREE.Material {
  return new THREE.MeshToonMaterial({
    color: colour,
    gradientMap: toonRamp(),
    emissive: new THREE.Color(colour).multiplyScalar(emissive),
  });
}

/**
 * The dish: **unlit**, painted, and immune to the lighting entirely.
 *
 * Two independent reasons, and it took a measurement to find the second:
 *
 *  1. Design. Anime paints the set flat and spends the whole shading budget on
 *     the fighters. Cel-banding a large, gently curved floor puts a hard edge
 *     across the arena that competes with the subject and reads as an artefact.
 *  2. Correctness. The dish is a `LatheGeometry` revolved from a centre → rim
 *     profile, and that profile order makes three generate normals pointing
 *     *down* — measured at `ny ≈ -1` across every sampled vertex, giving `NdotL`
 *     ≈ -0.8 for a key light overhead. Under `MeshStandardMaterial` in a dark
 *     theme nobody noticed; a toon ramp turned it into a black hole in the
 *     middle of the stadium. An unlit material sidesteps the whole question
 *     rather than depending on getting the winding right.
 *
 * The trade is that an unlit floor can't receive shadow maps, so the tops get
 * an explicit contact shadow instead — which is what the reference art draws
 * anyway: a hard ellipse, not a soft projection.
 *
 * LatheGeometry lays out UVs as (u = angle around, v = distance along the
 * profile), so v *is* radius — verified against the live geometry. Horizontal
 * bands in this canvas become concentric rings on the stadium, and vertical
 * variation becomes wedges.
 */
export function dishTexture(base: number): THREE.CanvasTexture {
  const w = 512;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // The Burst Beystadium palette: pale cyan plastic, one saturated-blue
    // tornado shelf, a white rim. `base` (theme.dishColour) tints the centre
    // plastic; the shelf and rim hexes are fixed because they are what makes
    // this read as *that* stadium rather than a recolour of a bowl.
    const centre = new THREE.Color(base);
    const shelf = new THREE.Color(0x2f7fd6);
    const rim = new THREE.Color(0xe9eef4);
    const white = new THREE.Color(0xffffff);
    const css = (c: THREE.Color): string => `#${c.getHexString()}`;
    const mix = (a: THREE.Color, b: THREE.Color, t: number): string =>
      css(a.clone().lerp(b, t));

    // Concentric tone rings. v = 0 is the centre of the dish, v = 1 the rim.
    const rings: Array<[number, number, string]> = [
      [0, 0.3, mix(centre, white, 0.55)], // near-white centre — the fight happens here
      [0.3, 0.46, mix(centre, white, 0.28)],
      [0.46, 0.62, css(centre)],
      [0.62, 0.72, mix(centre, shelf, 0.22)],
      [0.72, 0.86, css(shelf)], // tornado-ridge shelf, the one saturated band
      [0.86, 1, css(rim)], // rim slope, white-grey so wall and dish read as one moulding
    ];
    for (const [from, to, fill] of rings) {
      ctx.fillStyle = fill;
      ctx.fillRect(0, from * h, w, (to - from) * h);
    }

    // Crisp ink lines between bands. The dish suppresses the mesh outline
    // (`noOutline`, see below), so its linework has to be painted — these are
    // the cel outlines of the floor.
    ctx.fillStyle = 'rgba(21, 60, 110, 0.3)';
    for (const [, to] of rings.slice(0, -1)) {
      ctx.fillRect(0, to * h - 1, w, 2);
    }

    // Two soft sheen sweeps. Painted highlights, not specular — glossy plastic
    // without implying a light source. Alpha is higher than the old dark-dish
    // value because white-on-pale needs more to register at all.
    //
    // They start clear of v = 0 because every u collapses to a single point at
    // the lathe's pole: whichever texel lands on the centre vertex gets
    // stretched across the middle of the dish, and a sheen texel there showed
    // up as a white speck in the exact centre of the arena.
    const sheenFrom = 0.14 * h;
    ctx.globalAlpha = 0.22;
    for (const centre2 of [0.18, 0.66]) {
      const grad = ctx.createLinearGradient((centre2 - 0.13) * w, 0, (centre2 + 0.13) * w, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, 'rgba(255,255,255,1)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect((centre2 - 0.13) * w, sheenFrom, 0.26 * w, h - sheenFrom);
    }
    ctx.globalAlpha = 1;
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  // Textures flip vertically by default, which would put the rim ring at the
  // centre of the dish and the centre ring at the rim — the rings above are
  // written centre-first, so the flip has to go.
  tex.flipY = false;
  return tex;
}

/**
 * Flat, unlit dish material. Pairs with `dishTexture`.
 *
 * Deliberately `MeshBasicMaterial`: what you paint is exactly what renders, no
 * lights, no normals, no ramp. On a surface this large that predictability is
 * worth more than any shading it could gain.
 */
export function dishMaterial(base: number): THREE.MeshBasicMaterial {
  const mat = new THREE.MeshBasicMaterial({
    map: dishTexture(base),
    side: THREE.DoubleSide,
  });
  return noOutline(mat);
}

/**
 * The contact shadow under a top.
 *
 * Anime doesn't project soft shadows; it draws a hard dark ellipse under the
 * character and moves on. That happens to be exactly what this needs, because
 * the toon dish is unlit and cannot receive a shadow map at all. So the shadow
 * becomes a drawn element rather than a rendered one — which is both cheaper
 * and more on-model.
 */
export function contactShadow(radius: number): THREE.Mesh {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Hard core, short falloff. A long gradient reads as a soft render shadow
    // and puts the look straight back where it started.
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(10,12,26,1)');
    g.addColorStop(0.62, 'rgba(10,12,26,1)');
    g.addColorStop(0.82, 'rgba(10,12,26,0.55)');
    g.addColorStop(1, 'rgba(10,12,26,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  const mat = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  noOutline(mat);

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2.6, radius * 2.6), mat);
  mesh.rotation.x = -Math.PI / 2;
  // Just clear of the dish so it never z-fights with the floor beneath it.
  mesh.position.y = 0.004;
  mesh.renderOrder = -2;
  return mesh;
}

/**
 * Per-material outline control. `OutlineEffect` reads these off
 * `material.userData`, which is the only hook it offers.
 */
export interface OutlineParams {
  visible?: boolean;
  thickness?: number;
  color?: [number, number, number];
  alpha?: number;
}

export function setOutline<T extends THREE.Material>(mat: T, p: OutlineParams): T {
  mat.userData.outlineParameters = { ...(mat.userData.outlineParameters ?? {}), ...p };
  return mat;
}

/**
 * Suppress the outline on a surface.
 *
 * Necessary for large **concave** meshes, and the reason is worth writing down
 * because the symptom looks nothing like the cause. OutlineEffect draws an
 * inverted hull: it pushes vertices out along their normals and renders back
 * faces. On a convex object the hull hides behind the original and only its
 * edges show — the outline. On a concave one, the dish, the normals point up
 * and inward, so the hull lifts *off* the surface toward the camera and the
 * back faces win the depth test across the whole basin. The result was a dark
 * ellipse painted over the middle of the stadium, exactly where the fight is.
 */
export const noOutline = <T extends THREE.Material>(mat: T): T =>
  setOutline(mat, { visible: false });

/**
 * The beast emblem on the layer's face.
 *
 * Every real Beyblade has one, and it is the detail that most says "this is a
 * Beyblade" rather than "this is a spinning shape". Drawn procedurally: an
 * angular star burst inside a ring, which reads as a crest at the size it is
 * actually seen without pretending to be a specific character.
 */
export function emblemTexture(primary: number, accent: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

  if (ctx) {
    const mid = size / 2;
    ctx.clearRect(0, 0, size, size);

    // Disc
    ctx.fillStyle = hex(primary);
    ctx.beginPath();
    ctx.arc(mid, mid, size * 0.46, 0, Math.PI * 2);
    ctx.fill();

    // Hard outline — the same rule as the meshes: silhouettes get a dark line.
    ctx.strokeStyle = '#0a0a12';
    ctx.lineWidth = size * 0.055;
    ctx.stroke();

    // Angular burst, drawn as alternating long and short spokes so it reads as
    // a crest rather than a gear.
    ctx.fillStyle = hex(accent);
    ctx.beginPath();
    const spokes = 8;
    for (let i = 0; i < spokes * 2; i++) {
      const a = (i / (spokes * 2)) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? size * 0.36 : size * 0.15;
      const x = mid + Math.cos(a) * rr;
      const y = mid + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#0a0a12';
    ctx.lineWidth = size * 0.03;
    ctx.stroke();

    // Eye slit at the centre, which is what makes it read as a creature.
    ctx.fillStyle = '#0a0a12';
    ctx.beginPath();
    ctx.ellipse(mid, mid, size * 0.1, size * 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
