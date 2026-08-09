/**
 * Visual themes.
 *
 * The game has one look today — dark, clean, technical — and it works. This
 * adds a second, anime-inspired one *without touching it*: `ARENA` below is a
 * literal transcription of the values that were previously hardcoded across
 * arena.ts and stadium.ts, so selecting it reproduces the original exactly.
 * That is the whole point. A theme system that subtly changes the default look
 * has failed at its one job, which is being reversible.
 *
 * A theme is deliberately a flat bag of *parameters*, not a set of callbacks or
 * a subclass. Everything here can be applied by assigning to existing materials
 * and lights, so switching never rebuilds the scene graph and there is nothing
 * to leak. The one exception is bloom, which swaps the render path — see
 * `postBloom` and ArenaRenderer.setTheme.
 *
 * Themes compose *over* skins rather than replacing them: a skin decides what a
 * top is made of, a theme decides what the world around it looks like. They are
 * separate cosmetic slots on purpose, because they are intended to become
 * separate cosmetic slots in the product sense too.
 */

export interface Theme {
  id: string;
  name: string;
  /** One line for the picker. */
  blurb: string;

  // ------------------------------------------------------------- world ----
  background: number;
  fogColour: number;
  fogNear: number;
  fogFar: number;

  // -------------------------------------------------------------- dish ----
  dishColour: number;
  dishMetalness: number;
  dishRoughness: number;
  /** The tornado-ridge guide ring. */
  ridgeColour: number;
  ridgeOpacity: number;
  /** The inner concentric guides. */
  guideColour: number;
  guideOpacity: number;

  wallColour: number;
  wallMetalness: number;
  wallRoughness: number;
  /** Exit-pocket marker posts. */
  postColour: number;
  postEmissive: number;
  skirtColour: number;

  // ------------------------------------------------------------ lights ----
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  keyIntensity: number;
  rimAColour: number;
  rimAIntensity: number;
  rimBColour: number;
  rimBIntensity: number;

  // ----------------------------------------------------------- effects ----
  sparkColour: number;
  sparkSize: number;
  trailOpacity: number;
  /**
   * A light parented to each top, tinted to its skin, that flares on impact.
   * Cheap and it is most of what makes the anime theme read — the tops light
   * the arena themselves rather than being lit by it.
   */
  beyLightIntensity: number;
  beyLightFlash: number;
  /** Expanding ground ring on a heavy clash. */
  shockwave: boolean;
  /** Crush ambient light for a moment on the decisive blow. */
  finisherBlackout: boolean;
  /** Route through EffectComposer + UnrealBloomPass. Costs a render target. */
  postBloom: boolean;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;

  /** Class applied to <body>, so CSS can theme the DOM overlay too. */
  bodyClass: string;
}

/**
 * The original look, transcribed exactly from the previously hardcoded values.
 * Do not "improve" these — this theme's contract is that it is unchanged.
 */
export const ARENA: Theme = {
  id: 'arena',
  name: 'Arena',
  blurb: 'clean, technical, readable',

  background: 0x070a12,
  fogColour: 0x070a12,
  fogNear: 3.2,
  fogFar: 7.5,

  dishColour: 0x232c3d,
  dishMetalness: 0.3,
  dishRoughness: 0.66,
  ridgeColour: 0x38bdf8,
  ridgeOpacity: 0.55,
  guideColour: 0x2b3648,
  guideOpacity: 0.35,

  wallColour: 0x2f3a4d,
  wallMetalness: 0.5,
  wallRoughness: 0.5,
  postColour: 0xf97316,
  postEmissive: 0.9,
  skirtColour: 0x121722,

  hemiSky: 0x8fb6ff,
  hemiGround: 0x0b0f18,
  hemiIntensity: 0.85,
  keyIntensity: 1.5,
  rimAColour: 0x3b82f6,
  rimAIntensity: 6,
  rimBColour: 0xf97316,
  rimBIntensity: 5,

  sparkColour: 0xffd28a,
  sparkSize: 0.028,
  trailOpacity: 0.45,
  beyLightIntensity: 0,
  beyLightFlash: 0,
  shockwave: false,
  finisherBlackout: false,
  postBloom: false,
  bloomStrength: 0,
  bloomRadius: 0,
  bloomThreshold: 1,

  bodyClass: 'theme-arena',
};

/**
 * Beam Clash: the anime read.
 *
 * The move is to stop lighting the arena and let the tops light it instead —
 * near-black world, almost no ambient fill, a coloured light parented to each
 * top that flares hard on contact, and bloom to bleed it. Everything that isn't
 * a bey falls away, which is exactly the framing the medium uses.
 */
export const BEAM: Theme = {
  id: 'beam',
  name: 'Beam Clash',
  blurb: 'anime — the tops light the arena',

  background: 0x01020a,
  fogColour: 0x01020a,
  fogNear: 2.6,
  fogFar: 6.4,

  // Near-black and rough, so it takes coloured light rather than adding any.
  dishColour: 0x090d18,
  dishMetalness: 0.12,
  dishRoughness: 0.86,
  ridgeColour: 0x67e8f9,
  ridgeOpacity: 0.95,
  guideColour: 0x1b2a44,
  guideOpacity: 0.5,

  wallColour: 0x0c1020,
  wallMetalness: 0.2,
  wallRoughness: 0.78,
  postColour: 0xff3d7f,
  postEmissive: 2.4,
  skirtColour: 0x03050e,

  // Ambient is crushed. This is the single biggest lever on the whole look.
  hemiSky: 0x2a3f6b,
  hemiGround: 0x000000,
  hemiIntensity: 0.16,
  keyIntensity: 0.35,
  rimAColour: 0x22d3ee,
  rimAIntensity: 2.2,
  rimBColour: 0xff2d6f,
  rimBIntensity: 2.2,

  sparkColour: 0xfff3c4,
  sparkSize: 0.042,
  trailOpacity: 0.95,
  beyLightIntensity: 1.8,
  beyLightFlash: 14,
  shockwave: true,
  finisherBlackout: true,
  postBloom: true,
  bloomStrength: 0.9,
  bloomRadius: 0.55,
  bloomThreshold: 0.62,

  bodyClass: 'theme-beam',
};

export const THEMES: Theme[] = [ARENA, BEAM];

export const themeById = (id: string): Theme =>
  THEMES.find((t) => t.id === id) ?? ARENA;

const KEY = 'beyblade-arena.theme.v1';

export function loadThemeId(): string {
  try {
    return localStorage.getItem(KEY) ?? ARENA.id;
  } catch {
    return ARENA.id;
  }
}

export function saveThemeId(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Storage unavailable; the choice still applies for this session.
  }
}
