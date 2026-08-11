/**
 * Visual themes.
 *
 * The game has one look today — dark, clean, technical — and it works. This
 * adds a second, anime one *without touching it*: `ARENA` below is a literal
 * transcription of the values that were previously hardcoded across arena.ts
 * and stadium.ts, so selecting it reproduces the original exactly. That is the
 * whole point. A theme system that subtly changes the default look has failed
 * at its one job, which is being reversible.
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
 *
 * There used to be three attempts at the anime look (beam / overdrive / toon).
 * They are consolidated into ANIME; the retired ids must keep resolving — see
 * LEGACY_ANIME_IDS — because they live in players' localStorage.
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

  /**
   * Cel shading: banded lighting and a hard outline on every silhouette.
   *
   * This is the switch that turns the game from "3D" into "cartoon". It changes
   * the render *path* (outline pass instead of the bloom composer) and the
   * materials, so it is the one theme flag that isn't a simple parameter.
   */
  toon: boolean;
  /** Energy aura sprite around each top, swelling with spin and flaring on hits. */
  aura: boolean;
  /** Radial speed lines over the whole screen when the action is fast. */
  speedLines: boolean;
  /** Full-screen white pulse on a heavy clash. */
  impactFlash: boolean;
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
  toon: false,
  aura: false,
  speedLines: false,
  impactFlash: false,

  bodyClass: 'theme-arena',
};

/**
 * Anime: the one cartoon theme, replacing the beam / overdrive / toon trio.
 *
 * The cartoon read comes from the render path, not the palette: banded light,
 * ink outlines, drawn effects (aura, speed lines, impact flash, shockwave).
 * Bloom stays off because cel art doesn't bleed — glow fights the flat bands —
 * and the per-top light stays at 0 because painted colour must not be re-lit.
 *
 * PALETTE: every hex below is a PLACEHOLDER (carried over from the retired
 * Toon theme). The bright anime palette — cyan glossy dish, white rim, high-key
 * environment — is owned by the palette pass; keep the structure, swap values.
 */
export const ANIME: Theme = {
  id: 'anime',
  name: 'Anime',
  blurb: 'full cartoon — cel shading, ink lines, impact frames',

  // The hall stays DARK. Research on the source material was unambiguous:
  // Burst battles run on dark, desaturated backgrounds so the saturated bey
  // colours and trails carry all the energy, and the glossy cyan bowl is the
  // brightest object in frame — a lit stage in a dark arena, not a daytime
  // scene. fogColour matches the backdrop sphere's horizon band so fogged
  // geometry dissolves into the backdrop rather than into a different haze.
  background: 0x0b1322,
  fogColour: 0x16294a,
  fogNear: 5.0,
  fogFar: 12.0,

  // Under toon this hex is the centre colour of the painted dish texture, not
  // a material tint — see dishTexture. Pale Beystadium polycarbonate.
  dishColour: 0xcfe8ff,
  dishMetalness: 0,
  dishRoughness: 1,
  // Red ring on the saturated-blue tornado shelf: the Burst accent pairing.
  ridgeColour: 0xff4646,
  ridgeOpacity: 0.9,
  guideColour: 0x6ea9dd,
  guideOpacity: 0.22,

  // White-grey moulding, red exit posts — the wbba stadium's own colours.
  wallColour: 0xf2f5f9,
  wallMetalness: 0,
  wallRoughness: 1,
  postColour: 0xe0312f,
  postEmissive: 0.5,
  skirtColour: 0x33415e,

  // High and flat ON THE SUBJECT. Cel bands need strong, simple light: a dim
  // scene collapses every band into the same shadow step. The dish is unlit
  // painted texture, so bright lights here hit only the beys and the rim —
  // which is exactly the "lit stage in a dark hall" framing.
  hemiSky: 0xffffff,
  hemiGround: 0x51648c,
  hemiIntensity: 1.5,
  keyIntensity: 2.2,
  rimAColour: 0x88bbff,
  rimAIntensity: 1.2,
  rimBColour: 0xffbb88,
  rimBIntensity: 1.2,

  // Deeper spark orange than the other themes: pale yellow vanishes against a
  // near-white dish.
  sparkColour: 0xff9f2e,
  sparkSize: 0.055,
  trailOpacity: 0.85,
  beyLightIntensity: 0,
  beyLightFlash: 0,
  shockwave: true,
  finisherBlackout: false,
  postBloom: false,
  bloomStrength: 0,
  bloomRadius: 0,
  bloomThreshold: 1,
  toon: true,
  aura: true,
  speedLines: true,
  impactFlash: true,

  bodyClass: 'theme-anime',
};

export const THEMES: Theme[] = [ARENA, ANIME];

/**
 * Retired theme ids that may still be in players' localStorage or in old
 * ArenaSpec.suggestedTheme values. They were all attempts at the anime look,
 * so they must resolve to ANIME — falling back to ARENA would silently strip
 * the cartoon mode from returning players.
 */
const LEGACY_ANIME_IDS = new Set(['beam', 'overdrive', 'toon']);

export const themeById = (id: string): Theme =>
  LEGACY_ANIME_IDS.has(id) ? ANIME : (THEMES.find((t) => t.id === id) ?? ARENA);

const KEY = 'beyblade-arena.theme.v1';

export function loadThemeId(): string {
  try {
    const raw = localStorage.getItem(KEY) ?? ARENA.id;
    return LEGACY_ANIME_IDS.has(raw) ? ANIME.id : raw;
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
