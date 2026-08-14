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

const sharedRamps = new Map<number, THREE.DataTexture>();

/**
 * Ramp levels by band count.
 *
 * Three is the house look: shadow, mid, light. Five exists for one job — the
 * moulded wave cap — and the reason is worth stating, because "more bands" is
 * otherwise just a slider back toward smooth shading.
 *
 * A cel band boundary is a *contour line* of surface curvature: it shows where
 * the normal crosses a threshold. Three bands give two boundaries, and a gently
 * rolling surface whose normal only sweeps through part of the range crosses
 * neither of them — so a sculpted wave renders as one flat plate and the
 * modelling is thrown away. Five bands put four contour lines across the same
 * sweep, which is what makes the crests read as rolling metal.
 *
 * The five levels are not evenly spaced. The gaps widen toward the light end so
 * the bright side keeps the hard, graphic top band that reads as cartoon metal,
 * while the extra resolution goes into the mid tones where the wave actually
 * turns over.
 */
const RAMP_LEVELS: Record<number, number[]> = {
  3: [70, 150, 255],
  5: [62, 112, 158, 206, 255],
};

/**
 * The tone ramp, cached per band count.
 *
 * NearestFilter is the entire trick — with linear filtering this interpolates
 * back into the smooth gradient it is supposed to be replacing.
 */
export function toonRamp(bands = 3): THREE.DataTexture {
  const cached = sharedRamps.get(bands);
  if (cached) return cached;

  const levels = RAMP_LEVELS[bands] ?? RAMP_LEVELS[3];
  const steps = new Uint8Array(levels);
  const tex = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  sharedRamps.set(bands, tex);
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

// ---------------------------------------------------------------------------
// Cel metal
// ---------------------------------------------------------------------------

/**
 * Cel-shaded metal: banded diffuse plus the two cues `MeshToonMaterial` lacks.
 *
 * `MeshToonMaterial` has no metalness channel and no specular term at all, so
 * a gold forge disc renders as flat yellow and brushed steel as flat grey. The
 * Classic theme only looks more metallic because MeshStandardMaterial hands it
 * a real specular lobe. Cel art solves the same problem differently, and the
 * two things it actually draws are:
 *
 *  1. A **banded** specular lobe — a hard-edged chip of light that snaps
 *     between levels. A smooth Blinn-Phong falloff is the single strongest
 *     "this is CG" signal there is; the snap is what reads as painted metal.
 *  2. A **fresnel rim**, also banded, tinted with the metal rather than white,
 *     so gold edges warm and steel edges cool.
 *
 * Implemented as an `onBeforeCompile` patch on a real MeshToonMaterial rather
 * than a ShaderMaterial, which is what keeps the lights, the gradientMap, the
 * shadow maps and the fog working untouched.
 *
 * **OutlineEffect still inks these.** Verified by reading r185's
 * `examples/jsm/effects/OutlineEffect.js`: it does not clone or recompile the
 * source material. `getOutlineMaterialFromCache` builds a *fresh* BackSide
 * ShaderMaterial keyed on `originalMaterial.uuid`, swaps it onto the mesh for
 * the hull pass, and copies across exactly `userData.outlineParameters`,
 * `opacity`, `visible`, `transparent`, `fog`, `toneMapped`,
 * `premultipliedAlpha`, `displacementMap` and `version`. Neither
 * `onBeforeCompile` nor `customProgramCacheKey` is on that list, so the ink
 * pass cannot see this patch at all — a metal part outlines identically to a
 * plastic one, and `setOutline` keeps working on the result because the return
 * type is still an ordinary Material. Measured: 254 hull pixels for a plastic
 * cube, 254 for the same cube in metal, 0 once `noOutline` is applied.
 */
export interface MetalToonOptions {
  /** Emissive lift. Same meaning as `toonMaterial`'s second argument. */
  emissive?: number;
  /** Highlight tightness. Higher = a smaller, harder chip of light. */
  gloss?: number;
  /** Highlight brightness. */
  specular?: number;
  /** Rim brightness. */
  rim?: number;
  /** Rim falloff. Higher = the rim hugs the silhouette more tightly. */
  rimPower?: number;
  /** Highlight colour. Defaults to the base lifted most of the way to white. */
  specTint?: number;
  /** Rim colour. Defaults to the base barely lifted, so it keeps the metal's hue. */
  rimTint?: number;
  /** Diffuse band count. 3 is the house look; 5 is for moulded surfaces. */
  bands?: number;
}

const WHITE = new THREE.Color(0xffffff);

/**
 * Program cache key.
 *
 * `onBeforeCompile` makes the shader source depend on something three cannot
 * see, and its default key — `onBeforeCompile.toString()` — is both expensive
 * and a lie under a minifier, which can collapse two different closures to the
 * same text. A constant is correct here only because every metal material emits
 * *byte-identical* source: gloss, thresholds, strengths and tints are all
 * uniforms, and there is not one `#define` among them. Bake anything into the
 * source text and this key has to carry it.
 */
const CEL_METAL_KEY = 'metalToon/1';

/**
 * Injected straight after `#include <lights_toon_pars_fragment>`, which is
 * where `RE_Direct_Toon` and the `RE_Direct` macro are defined. Overriding the
 * macro rather than hand-rolling a light loop is what buys the shadow term and
 * every light type for free.
 */
const CEL_METAL_PARS = /* glsl */ `
uniform vec3 celSpecColour;
uniform vec3 celRimColour;
// Packed as x: gloss/power, y: low band threshold, z: high band threshold,
// w: strength. Two vec4s instead of eight scalars, because uniform slots are
// the one thing this patch actually spends.
uniform vec4 celSpec;
uniform vec4 celRim;

// Three levels: 0, 0.38, 1. step(), never smoothstep() — the discontinuity is
// the effect, and softening it puts the CG read straight back.
float celBand( const in float v, const in float lo, const in float hi ) {
	return step( lo, v ) * 0.38 + step( hi, v ) * 0.62;
}

void RE_Direct_MetalToon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {

	// The gradientMap banding is untouched: this adds a lobe on top of the flat
	// diffuse, it does not replace it.
	RE_Direct_Toon( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );

	vec3 celH = normalize( directLight.direction + geometryViewDir );
	float celLobe = pow( saturate( dot( geometryNormal, celH ) ), celSpec.x );
	// N·H stays positive at grazing angles for a light *behind* the surface,
	// which put a hot chip on the shadow side of the disc. Gate on N·L.
	float celLit = step( 0.0, dot( geometryNormal, directLight.direction ) );

	// directLight.color arrives already multiplied by the shadow term — see
	// lights_fragment_begin — so the highlight is shadowed for free.
	reflectedLight.directSpecular += directLight.color * celSpecColour *
		( celBand( celLobe, celSpec.y, celSpec.z ) * celSpec.w * celLit );

}

#undef RE_Direct
#define RE_Direct RE_Direct_MetalToon
`;

/**
 * Replaces meshtoon's `outgoingLight` line, which sums diffuse and emissive
 * only — the toon shader has no specular slot to sum, so the banded lobe would
 * otherwise be computed and thrown away.
 *
 * `geometryNormal` and `geometryViewDir` are declared by
 * `lights_fragment_begin` earlier in main, so the rim rides along for free.
 */
const CEL_METAL_OUTGOING = /* glsl */ `
	// The rim is deliberately light-independent: it is a drawn element, the same
	// way the contact shadow under a top is drawn rather than projected. It
	// lands just inside the OutlineEffect hull, which is exactly where cel art
	// puts it — bright edge, then black line.
	float celFresnel = pow( saturate( 1.0 - dot( geometryNormal, geometryViewDir ) ), celRim.x );
	vec3 celRimLight = celRimColour * ( celBand( celFresnel, celRim.y, celRim.z ) * celRim.w );

	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + celRimLight + totalEmissiveRadiance;
`;

const TOON_PARS_ANCHOR = '#include <lights_toon_pars_fragment>';
const OUTGOING_ANCHOR =
  'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;';

/**
 * Throws rather than warns. A missing anchor means a three upgrade renamed a
 * chunk and every metal part has silently reverted to flat toon — which is the
 * precise regression this material exists to fix, and invisible from the
 * outside. three is pinned, so this can only fire on a deliberate upgrade, and
 * it fires on the first frame of the Anime theme rather than in a screenshot.
 */
function mustReplace(src: string, anchor: string, replacement: string): string {
  if (!src.includes(anchor)) {
    throw new Error(`metalToonMaterial: three's toon fragment shader no longer contains "${anchor}"`);
  }
  return src.replace(anchor, replacement);
}

/** Cel-shaded metal in the given colour. See the block comment above. */
export function metalToonMaterial(
  colour: number,
  opts: MetalToonOptions = {},
): THREE.MeshToonMaterial {
  const base = new THREE.Color(colour);
  const mat = new THREE.MeshToonMaterial({
    color: colour,
    gradientMap: toonRamp(opts.bands ?? 3),
    emissive: base.clone().multiplyScalar(opts.emissive ?? 0),
  });

  // Built here, not inside onBeforeCompile, for two reasons: the callback does
  // not run until the material's first frame, and three clones the uniform set
  // per material, so these objects have to be per-material to stay tunable.
  const uniforms = {
    celSpecColour: {
      value:
        opts.specTint !== undefined
          ? new THREE.Color(opts.specTint)
          : base.clone().lerp(WHITE, 0.72),
    },
    celRimColour: {
      value:
        opts.rimTint !== undefined
          ? new THREE.Color(opts.rimTint)
          : base.clone().lerp(WHITE, 0.3),
    },
    // Thresholds are tuned against the Anime key light (directional, intensity
    // 2.2) with no tone mapping: the top band clips past white, which is what
    // makes the chip read as metal now that bloom is off. Measured on a gold
    // sphere, peak luminance 172 flat → 244 with the lobe.
    celSpec: {
      value: new THREE.Vector4(opts.gloss ?? 42, 0.28, 0.62, opts.specular ?? 0.32),
    },
    celRim: {
      value: new THREE.Vector4(opts.rimPower ?? 2.4, 0.42, 0.68, opts.rim ?? 0.3),
    },
  };

  mat.onBeforeCompile = (shader): void => {
    for (const [name, uniform] of Object.entries(uniforms)) shader.uniforms[name] = uniform;
    shader.fragmentShader = mustReplace(
      shader.fragmentShader,
      TOON_PARS_ANCHOR,
      TOON_PARS_ANCHOR + CEL_METAL_PARS,
    );
    shader.fragmentShader = mustReplace(
      shader.fragmentShader,
      OUTGOING_ANCHOR,
      CEL_METAL_OUTGOING,
    );
  };
  mat.customProgramCacheKey = (): string => CEL_METAL_KEY;

  // Live handles, so a hit flash or a finisher can push the highlight without
  // rebuilding the material.
  mat.userData.cel = uniforms;
  return mat;
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
