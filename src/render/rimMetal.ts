import * as THREE from 'three';

/**
 * A view-dependent rim light for real PBR metal.
 *
 * WHAT THIS IS FOR. The Overdrive reference shows a top as a DARK body with
 * bright edges and a pool of light at its tip — the shape is described by its
 * silhouette catching the light, not by the whole object being bright. Ours was
 * the opposite: a pale chrome object lit from point-blank range, which under a
 * bloom pass is a ball of light with no readable geometry at all.
 *
 * Darkening the body alone does not get there. A dark metal with nothing to
 * reflect is just a dark blob, and the arena's rim lights are directional — they
 * light whichever SIDE faces them, not the edges, so from the battle camera
 * they read as a broad wash across the near face rather than as a contour.
 *
 * A fresnel term is the thing that actually draws an edge, because it depends
 * on the angle between the surface and the VIEWER: it is near zero where a face
 * points at the camera and near one where it turns away, which by definition is
 * the silhouette. That is the same reason `metalToonMaterial` in toon.ts has
 * one, and this is the standard-material sibling of that code.
 *
 * DELIBERATELY LIGHT-INDEPENDENT, exactly like the cel version. The rim is a
 * drawn element — it says "here is the edge of this object" — and making it
 * depend on where the key light happens to be would mean the edge disappears on
 * the shadowed side, which is precisely the side that needs it most.
 */

export interface RimOptions {
  /** Rim colour. Defaults to a cool white. */
  colour?: number;
  /**
   * Falloff exponent. Higher is a tighter line hugging the silhouette; lower
   * spreads the light further onto the face. 2.6 is about a fifth of the
   * visible surface on a curved top.
   */
  power?: number;
  /** Peak brightness of the rim, added on top of the lit result. */
  strength?: number;
}

/** Guards against three re-using a cached program that has no rim in it. */
const RIM_KEY = 'rimMetal/1';

const RIM_PARS = /* glsl */ `
uniform vec3 rimColour;
uniform vec2 rimShape;
`;

/**
 * The anchor line from `meshphysical.glsl.js`. Matched exactly rather than
 * loosely, so a three upgrade that rewrites this line fails loudly at the
 * replace instead of silently dropping the rim.
 */
const OUTGOING_ANCHOR =
  'vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;';

const RIM_OUTGOING = /* glsl */ `
	float rimF = pow( saturate( 1.0 - dot( geometryNormal, geometryViewDir ) ), rimShape.x );
	vec3 rimLight = rimColour * ( rimF * rimShape.y );
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance + rimLight;
`;

/**
 * Add the rim to a standard material, in place.
 *
 * Returns the same material so it can be chained onto a construction
 * expression. A strength of 0 leaves the material completely untouched — the
 * shader patch is skipped rather than applied with a zero uniform, so themes
 * that do not want a rim also do not pay for a second shader program.
 */
export function addFresnelRim<T extends THREE.Material>(mat: T, opts: RimOptions = {}): T {
  const strength = opts.strength ?? 0;
  if (strength <= 0) return mat;

  // IDEMPOTENT, because callers cannot reasonably guarantee they only ask once.
  // A bey group shares one material across several meshes, so the obvious
  // `traverse` that rims every mesh reaches the same material repeatedly — and
  // the naive version chained a second patch onto the first, which then could
  // not find the anchor line the first one had already consumed and threw. The
  // symptom was an empty arena and a stack of `onBeforeCompile` calling itself.
  //
  // Re-asking now just retunes the live uniforms, which is also what a theme
  // switch wants.
  const existing = mat.userData.rim as
    | { rimColour: { value: THREE.Color }; rimShape: { value: THREE.Vector2 } }
    | undefined;
  if (existing) {
    existing.rimColour.value.set(opts.colour ?? 0xdfefff);
    existing.rimShape.value.set(opts.power ?? 2.6, strength);
    return mat;
  }

  // Built out here rather than inside the callback: `onBeforeCompile` does not
  // run until the material's first frame, and three copies the uniform set per
  // material, so these have to be per-material objects to stay live handles.
  const uniforms = {
    rimColour: { value: new THREE.Color(opts.colour ?? 0xdfefff) },
    rimShape: { value: new THREE.Vector2(opts.power ?? 2.6, strength) },
  };

  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer): void => {
    prev?.call(mat, shader, renderer);
    for (const [name, uniform] of Object.entries(uniforms)) shader.uniforms[name] = uniform;

    if (!shader.fragmentShader.includes(OUTGOING_ANCHOR)) {
      throw new Error('rimMetal: outgoingLight anchor missing — three shader changed');
    }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <normal_pars_fragment>', '#include <normal_pars_fragment>' + RIM_PARS)
      .replace(OUTGOING_ANCHOR, RIM_OUTGOING);
  };

  // Without this every rimmed material shares the un-rimmed program's cache
  // entry and only the first one compiled gets the patch.
  mat.customProgramCacheKey = (): string => RIM_KEY;

  mat.userData.rim = uniforms;
  return mat;
}
