import * as THREE from 'three';
import { noOutline } from './toon';
import type { BeyDesign } from './beydex';

/**
 * The high-spin read: what the medium draws when a top is turning too fast to
 * be drawn honestly.
 *
 * WHAT THIS REPLACED, AND WHY IT LOOKED LIKE STRIPES. The first version painted
 * tangential streak arcs on a flat disc bounded by a hot rim ring, and the
 * result read as a striped plate inside a picket fence of vertical lines. Two
 * causes, both measurable rather than aesthetic:
 *
 *  1. The layer's own blades alias. `b.angle += b.spin · dt · 0.05` advances
 *     0.75 rad per 60 fps frame at SPIN_REF (900). One blade step is 2π/blades:
 *     0.79 rad on Aegis's 8, so the blades advance 0.955 of a step per frame
 *     and alias to a 0.045-step crawl *backwards* — a stationary fence. No
 *     blade count lands anywhere trackable (3 blades = 0.36 of a step per
 *     frame, just under Nyquist). What the fence is made of is the blades' own
 *     side walls, each inked at BEY_OUTLINE = 0.02.
 *  2. The disc never covered them. A flat plate at y = 1.25r of radius 1.15r
 *     only hides what is behind it, and with the camera 34° above horizontal
 *     the sight line to the near blade tip (0.82r out, 0.94r up once the detail
 *     shrink applies) crosses the disc plane at 0.82r + 0.31r/tan34° = 1.28r —
 *     outside the disc. The near half of the fence was in front of the blur.
 *
 * The streaks and the rim only made it worse: hard tangential arcs at 110 per
 * texture are stripes by construction, and a hot ring seen at 34° is a hard
 * ellipse, which is what made the whole thing read as a plate.
 *
 * So this is not a better streak texture. The body is soft concentric bands
 * with no rim line on geometry that never rotates (a rotationally symmetric
 * disc cannot alias); the sense of motion comes from ONE glint sweeping at a
 * *drawn* rate; the blades are smeared by afterimage copies of the real
 * silhouette placed to fill the gaps between them; and the layer's ink thins as
 * the blur takes over, so the fence loses the lines it was drawn with.
 */
export interface SpinBlur {
  mesh: THREE.Mesh;
  /** Returns blur dominance 0–1, so the caller can shrink the detail under it. */
  update(spinNorm: number, dt: number): number;
}

/** Blur starts here and is fully in charge BLUR_SPAN of spinNorm later. */
const BLUR_FROM = 0.55;
const BLUR_SPAN = 0.35;

/**
 * Afterimage copies. Three puts a ghost every quarter blade-step, so blades +
 * ghosts are 4× the blade count evenly spaced — the gaps the fence was made of
 * are gone even before the alpha ramp does anything.
 */
const GHOSTS = 3;

/**
 * Glint sweep, rad/s, deliberately unrelated to the sim's angle: at 3.4 rad/s
 * the highlight moves ~3.2° per frame, which the eye follows as one travelling
 * highlight. Anything locked to the real spin strobes (see above).
 */
const GLINT_RATE = 3.4;

/**
 * Ink left on the layer at full blur, as a fraction of its authored thickness.
 * Not zero: the silhouette still needs a line against a near-white dish. Low
 * enough that the individual blade walls stop reading as separate lines.
 */
const INK_AT_FULL_BLUR = 0.45;

/** Scratch for the view-angle fade; onBeforeRender must not allocate. */
const camPos = new THREE.Vector3();
const discPos = new THREE.Vector3();

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

const smooth = (x: number, a: number, b: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

const css = (hex: number, a: number): string => {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
};

/** Toward white, for the highlight tones the palette doesn't carry itself. */
const lift = (hex: number, t: number): number =>
  new THREE.Color(hex).lerp(new THREE.Color(0xffffff), t).getHex();

/**
 * The blurred body: concentric colour bands in the design's own palette.
 *
 * Every stop is far enough from its neighbours that the gradient never
 * hardens into an edge — a band boundary the eye can find is a stripe, which
 * is the thing this replaced. The last stop is alpha 0 *inside* the geometry,
 * so the disc has no drawn rim at all and cannot read as a plate edge.
 */
function bandTexture(design: BeyDesign): THREE.CanvasTexture {
  const size = 256;
  const mid = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const g = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
    // Hub: the lightest tone, so the centre reads as the axis rather than a hole.
    g.addColorStop(0, css(lift(design.secondary, 0.55), 0.62));
    g.addColorStop(0.2, css(design.secondary, 0.74));
    // Ring 1 — the body colour, the widest band and the one that carries mass.
    g.addColorStop(0.42, css(design.primary, 0.86));
    // Ring 2 — the jewellery colour, where the real layer's accent ring sits.
    g.addColorStop(0.62, css(design.accent, 0.8));
    // Ring 3 — the bright outer band, standing in for the blade tips smeared
    // into a circle. Brighter than the body: speed lives at the rim.
    g.addColorStop(0.79, css(lift(design.primary, 0.4), 0.66));
    g.addColorStop(0.92, css(design.primary, 0.22));
    g.addColorStop(1, css(design.primary, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let sharedGlint: THREE.CanvasTexture | null = null;

/**
 * The specular sweep: one soft arc riding the outer band, white so the material
 * colour can tint it per design.
 *
 * Per-pixel rather than a canvas gradient because it needs an angular falloff
 * as well as a radial one, and `createConicGradient` interpolates in a straight
 * line between stops — which puts a visible corner at the ends of the arc.
 */
function glintTexture(): THREE.CanvasTexture {
  if (sharedGlint) return sharedGlint;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const img = ctx.createImageData(size, size);
    const data = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = ((x + 0.5) / size) * 2 - 1;
        const dy = ((y + 0.5) / size) * 2 - 1;
        const rad = Math.hypot(dx, dy);
        const i = (y * size + x) * 4;
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        if (rad > 1) continue;
        // cos^22 is half-height at ~20° and gone by 35°: an arc, not a wedge.
        const facing = Math.max(0, Math.cos(Math.atan2(dy, dx)));
        const angular = Math.pow(facing, 22);
        // Centred on 0.72 of the radius — the same band the bright ring is in,
        // so the glint reads as light on that ring rather than a separate mark.
        const radial = Math.exp(-((rad - 0.72) ** 2) / (2 * 0.16 * 0.16));
        // The gaussian is still at 0.22 by the texture edge; without this the
        // arc would end on a hard circular cut.
        const edge = 1 - smooth(rad, 0.86, 1);
        data[i + 3] = Math.round(255 * angular * radial * edge);
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  sharedGlint = new THREE.CanvasTexture(canvas);
  sharedGlint.colorSpace = THREE.SRGBColorSpace;
  return sharedGlint;
}

/**
 * A very shallow dome, not a plate.
 *
 * `rise` is 13% of the radius: enough that the silhouette keeps a curve when
 * the camera drops toward the dish (and that the rim is never a straight edge
 * seen end-on), far too little to read as a bowl from the playing angle.
 * CircleGeometry's UVs come from the undisplaced x/y, so the band texture maps
 * the same way it would on the flat disc.
 */
function domeGeometry(radius: number, rise: number): THREE.BufferGeometry {
  const geo = new THREE.CircleGeometry(radius, 64);
  // The camera sits ~34° above horizontal: the disc presents to it face-up.
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.hypot(pos.getX(i), pos.getZ(i)) / radius;
    pos.setY(i, rise * (1 - t * t));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

interface InkParams {
  thickness?: number;
  visible?: boolean;
}

/**
 * Every outline parameter block on the layer, with the thickness it was
 * authored at. OutlineEffect re-reads `userData.outlineParameters` on every
 * object it draws (updateUniforms, from its per-object onBeforeRender), so
 * thinning these live costs nothing and needs no material rebuild.
 *
 * Materials are per-bey (skinMaterial/toonMaterial construct one per call), so
 * this can never reach across to the other top.
 */
function collectInk(layer: THREE.Object3D): Array<{ params: InkParams; base: number }> {
  const seen = new Set<InkParams>();
  const out: Array<{ params: InkParams; base: number }> = [];
  layer.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    const list = Array.isArray(mat) ? mat : [mat];
    for (const m of list) {
      const params = m.userData.outlineParameters as InkParams | undefined;
      if (!params || params.visible === false) continue;
      if (typeof params.thickness !== 'number' || seen.has(params)) continue;
      seen.add(params);
      out.push({ params, base: params.thickness });
    }
  });
  return out;
}

/**
 * Build the blur for one top.
 *
 * Colours are the LAYER DESIGN's, not the skin's: the blur is the drawn stand-in
 * for the bey itself, and Valtryek blurred is still blue-and-red no matter whose
 * hand threw it. Ownership colour stays on the trail and aura.
 *
 * `layer` is the top's own layer group. It is read, never modified or reparented:
 * the afterimages share its geometries, which is what makes them cost nothing —
 * no clone, no rebuild, and nothing allocated once the top exists.
 */
export function buildSpinBlur(
  design: BeyDesign,
  radius: number,
  layer: THREE.Object3D,
  blades: number,
): SpinBlur {
  // Rim at 1.06r with a 0.15r rise: the dome's surface clears the layer's face
  // once the detail shrink is past ~0.95 (at the shrink floor of 0.82 the face
  // is 0.94r and the dome above it is 1.13r), and its rim is *inside* the top's
  // own height range, so the blur sits in the body instead of hovering over it.
  const discBase = radius * 1.06;
  const geo = domeGeometry(radius * 1.12, radius * 0.15);

  const bandMat = new THREE.MeshBasicMaterial({
    map: bandTexture(design),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  // An inverted-hull outline around a transparent disc paints a black plate
  // over the very top it replaces.
  noOutline(bandMat);

  const mesh = new THREE.Mesh(geo, bandMat);
  mesh.position.y = discBase;
  // Above dish and ribbons, below sparks.
  mesh.renderOrder = 2;
  mesh.visible = false;

  // One rotating highlight. Its own child so the band disc can stay unrotated:
  // the bands are rotationally symmetric and rotating them would buy nothing
  // but a chance to alias.
  const glintMat = new THREE.MeshBasicMaterial({
    map: glintTexture(),
    color: lift(design.accent, 0.6),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  noOutline(glintMat);
  const glint = new THREE.Mesh(geo, glintMat);
  // Same geometry, lifted clear: coplanar surfaces both pass a LessEqual depth
  // test, so which one wins would otherwise depend on draw order.
  glint.position.y = radius * 0.004;
  glint.renderOrder = 2;

  mesh.add(glint);

  // Afterimages sit at the layer's real height, so the pivot cancels the disc's
  // own lift and puts their frame back on the bey group's.
  const pivot = new THREE.Group();
  pivot.position.y = -discBase;
  mesh.add(pivot);

  const step = (Math.PI * 2) / Math.max(1, blades);
  const tints = [lift(design.primary, 0.42), design.primary, design.secondary];
  const alphas = [0.3, 0.2, 0.12];
  const ghosts: THREE.Group[] = [];
  const ghostMats: THREE.MeshBasicMaterial[] = [];

  for (let i = 0; i < GHOSTS; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: tints[i % tints.length],
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    // These are smears of the top, not more copies of it: a ghost with its own
    // ink would put back exactly the fence this exists to remove.
    noOutline(mat);

    const ghost = new THREE.Group();
    // Behind the top's rotation. The sign is settled at runtime from which way
    // the parent is actually turning — spin direction is the player's choice,
    // not the design's, so it isn't known here.
    ghost.rotation.y = -((i + 1) * step) / (GHOSTS + 1);

    for (const child of layer.children) {
      const src = child as THREE.Mesh;
      if (src.isMesh !== true || !src.geometry) continue;
      if (!src.geometry.boundingSphere) src.geometry.computeBoundingSphere();
      const bounds = src.geometry.boundingSphere;
      // Silhouette tiers only. Measured on the built layers: the blade tier,
      // under-ring and hit ring bound at ≥0.97r, every piece of face hardware
      // (ridges, chips, vents, crest) at ≤0.61r. Ghosting the hardware would
      // add clutter inside a shape whose *outline* is the whole point.
      if (!bounds || bounds.radius < radius * 0.7) continue;
      const copy = new THREE.Mesh(src.geometry, mat);
      copy.position.copy(src.position);
      copy.quaternion.copy(src.quaternion);
      copy.scale.copy(src.scale);
      copy.renderOrder = 2;
      ghost.add(copy);
    }

    ghosts.push(ghost);
    ghostMats.push(mat);
    pivot.add(ghost);
  }

  const ink = collectInk(layer);

  // Read back by update() one frame later rather than applied here: the glint
  // draws in its own pass and would otherwise depend on sibling draw order.
  let viewFade = 1;
  mesh.onBeforeRender = (_renderer, _scene, camera): void => {
    discPos.setFromMatrixPosition(mesh.matrixWorld);
    camPos.setFromMatrixPosition(camera.matrixWorld);
    const dist = camPos.distanceTo(discPos);
    const sinEl = dist > 1e-4 ? (camPos.y - discPos.y) / dist : 1;
    // Full from ~26° up (the arena camera lives at ~30–34°), thinning to a
    // third by ~6°, where a lit disc is all edge and reads as a plate however
    // it is painted. The afterimages carry the top at those angles instead.
    viewFade = 0.32 + 0.68 * smooth(sinEl, 0.1, 0.44);
  };

  let glintPhase = 0;
  let lastParentAngle = Number.NaN;
  let dir = 1;

  return {
    mesh,
    update(spinNorm: number, dt: number): number {
      const k = clamp01((spinNorm - BLUR_FROM) / BLUR_SPAN);
      mesh.visible = k > 0.002;

      // The parent group carries the sim's angle, which is unwrapped, so its
      // frame-to-frame delta is the true signed rotation even though the angle
      // itself aliases on screen.
      const parentAngle = mesh.parent ? mesh.parent.rotation.y : 0;
      const delta = parentAngle - lastParentAngle;
      lastParentAngle = parentAngle;
      if (Number.isFinite(delta) && Math.abs(delta) > 1e-4) {
        const turning = delta < 0 ? -1 : 1;
        if (turning !== dir) {
          dir = turning;
          for (let i = 0; i < ghosts.length; i++) {
            ghosts[i].rotation.y = (-dir * ((i + 1) * step)) / (GHOSTS + 1);
          }
        }
      }

      // Cancelling the parent's angle is what keeps the one asymmetric element
      // on the disc off the sim's aliasing rate.
      glintPhase = (glintPhase + dt * GLINT_RATE * dir) % (Math.PI * 2);
      glint.rotation.y = glintPhase - parentAngle;

      bandMat.opacity = k * 0.82 * viewFade;
      glintMat.opacity = k * 0.6 * viewFade;
      for (let i = 0; i < ghostMats.length; i++) ghostMats[i].opacity = k * alphas[i];

      for (const line of ink) {
        line.params.thickness = line.base * (1 - (1 - INK_AT_FULL_BLUR) * k);
      }

      return k;
    },
  };
}
