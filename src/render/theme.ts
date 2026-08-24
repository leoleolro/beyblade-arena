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
 * Beam and Toon are consolidated into ANIME; the retired ids must keep
 * resolving — see LEGACY_ANIME_IDS — because they live in players'
 * localStorage.
 *
 * OVERDRIVE was consolidated away with them and that was a mistake. Folding it
 * into ANIME assumed the cartoon look was a strict superset, and it is not:
 * cel shading deletes glow by construction (flat bands cannot bleed), so
 * everything OVERDRIVE was — glowing lights, bloom, auras and speed lines over
 * a *3D* arena — had no home in either survivor. Players read that as "the
 * effects are gone", which is exactly what happened. It is back as its own
 * theme, and the picker now covers three distinct answers rather than two:
 *
 *   Arena     — clean, technical, readable. No glow. The reference look.
 *   Overdrive — the same 3D world lit up: bloom, per-top lights, impact.
 *   Anime     — not 3D at all: cel bands, ink lines, drawn motion.
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
  /**
   * Ink colour for that ring, or null to draw it as additive light.
   *
   * A theme with a dark floor wants glow; a theme with a near-white one needs a
   * drawn line, because additive light cannot darken and a white ring on a
   * white dish is nothing at all. See `Shockwave.setInk`.
   */
  shockwaveInk: number | null;
  /** Crush ambient light for a moment on the decisive blow. */
  finisherBlackout: boolean;
  /** Route through EffectComposer + UnrealBloomPass. Costs a render target. */
  postBloom: boolean;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;

  /**
   * How hard the studio environment reflects off an imported top's metal.
   *
   * A theme-level value because it is the only dial that makes one metal finish
   * survive three very different lighting rigs, and a single number for all
   * three failed in three different ways at once. Measured in a match, same
   * top, same model:
   *
   *   Arena      dark dish, no bloom      — chrome reads perfectly at 0.85
   *   Anime      pale polycarbonate dish  — a bright silver top on a near-white
   *                                         bowl has almost no contrast left and
   *                                         dissolves into the floor
   *   Overdrive  dark dish, heavy bloom   — the reflection clears the 0.7 bloom
   *                                         threshold across the whole top, which
   *                                         then blooms into a featureless white
   *                                         blob with no geometry visible at all
   *
   * So it comes DOWN where the scene is already doing the work. Lower intensity
   * is a darker metal, which is what buys back contrast against a pale floor and
   * what keeps a surface under a bloom threshold. It is not a quality setting.
   */
  envIntensity: number;

  /**
   * Base colour for an imported top's metal in this theme.
   *
   * A second dial alongside `envIntensity` because they fix different halves of
   * the same problem. Exposure decides how hard the environment reflects;
   * this decides how bright the metal is before anything reflects off it at
   * all, and near-white metal clips under a bloom pass no matter how little it
   * is reflecting.
   *
   * The reference capture for Overdrive is unambiguous: a top there is a DARK
   * body with bright rims and a pool beneath. Ours was a pale chrome object
   * with a point light at point-blank range, which is a ball of light.
   */
  modelTint: number;

  /**
   * Silhouette rim on a top's metal: colour, and peak brightness.
   *
   * Strength 0 turns it off entirely, shader patch included. See rimMetal.ts —
   * the short version is that a fresnel term is the only thing that draws an
   * EDGE, because it depends on the angle to the viewer rather than to a light,
   * and the arena's rim lights wash a whole face instead.
   */
  topRimColour: number;
  topRimStrength: number;

  /**
   * Cel shading: banded lighting and a hard outline on every silhouette.
   *
   * This is the switch that turns the game from "3D" into "cartoon". It changes
   * the render *path* (outline pass instead of the bloom composer) and the
   * materials, so it is the one theme flag that isn't a simple parameter.
   */
  toon: boolean;
  /**
   * Energy aura sprite around each top, swelling with spin and flaring on hits.
   *
   * OFF in Overdrive, which is a deliberate loss. The sprite is camera-facing,
   * additive, and about three times a top's diameter — a glowing ball centred
   * on the bey. That is not what this theme's reference looks like: there a top
   * is a dark body with a tight pool at its tip and no halo at all, and at play
   * scale a top is only ~50px, so a 150px halo IS the object as far as the eye
   * is concerned. Compared side by side in a clash filmstrip, turning it off is
   * the difference between a bright smudge and a readable beyblade.
   *
   * What it cost: the aura was a live read on remaining spin. That signal still
   * exists in the HUD bar, in the wobble (which quickens as spin drains) and in
   * the drawn spin rate, so it is duplicated rather than gone.
   */
  aura: boolean;
  /**
   * Aura opacity multiplier. 1 is the value the effect was authored at.
   *
   * Below 1 only where a bloom pass is already supplying the glow — see
   * `Aura.setStrength` for why an additive sprite that "frames" the top in one
   * theme swallows it whole in another.
   */
  auraStrength: number;
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

  // The reference case. A dark blue dish and no bloom, so a chrome top has
  // both the contrast and the headroom to be fully reflective.
  envIntensity: 0.85,

  // Unused: this theme has no aura at all.
  auraStrength: 1,

  // Bright chrome on a dark dish with no bloom: the case the finish was
  // authored for, and it reads perfectly.
  modelTint: 0xd8dde3,

  // Off. This theme's contract is that it renders as it did before themes
  // existed, and a rim is a visible addition, not a correction.
  topRimColour: 0xffffff,
  topRimStrength: 0,

  // No ring at all in this theme; the value is inert.
  shockwaveInk: null,

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
  // FALSE, and it must stay false while this theme is the toon one.
  //
  // The only consumer is `impactFlash && !theme.toon` (arena.ts) — the manga
  // cut and a full-screen white fade on the same hit undercut each other, so
  // toon themes deliberately get the cut instead. This read `true` for a long
  // time and was silently gated off, which is worse than either answer: a flag
  // that says a feature is on while the code guarantees it is off.
  impactFlash: false,

  // 0.62, up from 0.45. The dish here is near-white polycarbonate so the top
  // still has to read against it, but 0.45 plus the darkened tint took the
  // reflection down far enough that the metal stopped looking like metal. This
  // is the dial that should carry that trade rather than the tint: it changes
  // how hard the studio reflects without flattening the highlight.
  envIntensity: 0.62,

  // Full strength. No bloom here, so the aura is exactly as drawn — and it is
  // the single strongest anime signal the theme has.
  auraStrength: 1,

  // 0xd2d9e2, back up from 0xb3bcc7. The step down was for contrast against a
  // near-white dish and it overshot: the owner's report is that the imported
  // Valtryek lost "the glossy finish when we first imported in", and a mid-grey
  // metal is exactly what a chrome top looks like once you take the highlight
  // off it. Contrast against the bowl is bought back with `envIntensity`
  // instead, which darkens the BODY while leaving the specular alone — the
  // highlight is what reads as gloss, not the base tone.
  modelTint: 0xd2d9e2,

  // Off: the cel path draws its own rim inside `metalToonMaterial`, and the
  // ink outline is already describing every silhouette in the frame.
  topRimColour: 0xffffff,
  topRimStrength: 0,

  // Deep ink, drawn rather than glowed. The dish here is near-white, so the
  // additive white ring every other theme uses was literally invisible.
  shockwaveInk: 0x1e2f57,

  bodyClass: 'theme-anime',
};

/**
 * Overdrive: the 3D arena with the lights on.
 *
 * Restored verbatim from the pre-consolidation literal, with two deliberate
 * deviations, both noted at their fields: `toon` (the flag postdates this
 * theme, and Overdrive is emphatically not a cartoon) and `trailOpacity` (the
 * trail primitive changed underneath it).
 *
 * Anime draws power *around* a fighter rather than on them, cuts to speed lines
 * when something moves fast, and blows the frame white on a decisive hit. This
 * theme does all three over real geometry: an energy aura per top, a radial
 * speed-line overlay driven by actual speed, a full-screen impact flash, and
 * bloom hot enough that the emissive parts genuinely glow instead of merely
 * being bright. The per-top lights are the load-bearing part — at 2.1 the tops
 * light the arena rather than the arena lighting them, which is the whole
 * difference between "a dark scene" and "a Gundam fight".
 */
export const OVERDRIVE: Theme = {
  id: 'overdrive',
  name: 'Overdrive',
  blurb: '3D with the lights on — glow, bloom, impact',

  background: 0x05010f,
  fogColour: 0x0a0320,
  fogNear: 2.8,
  fogFar: 6.8,

  dishColour: 0x140a26,
  dishMetalness: 0.2,
  dishRoughness: 0.8,
  ridgeColour: 0x00e5ff,
  ridgeOpacity: 1,
  guideColour: 0x35205c,
  guideOpacity: 0.6,

  wallColour: 0x140a28,
  wallMetalness: 0.3,
  wallRoughness: 0.7,
  postColour: 0xff2e88,
  // 0.35, down from 3, and this one number was most of what people meant by
  // "glowing led light bulbs hitting, full of light pollution".
  //
  // A post is a cylinder of radius 0.012 — a thin bar, about four pixels wide
  // at match framing. At emissive 3 it saturates to white well past the bloom
  // threshold, and bloom at radius 0.62 then smears those four pixels into a
  // forty-pixel capsule. Twelve of them ring the stadium, so the frame gained
  // twelve fat glowing pills and lost its blacks. The geometry was never the
  // problem and no amount of shrinking it would have helped.
  //
  // At 0.35 the bar stops being a light source and goes back to being an
  // object lit by the rim lights — which is what it looks like in the
  // reference capture, where the posts read magenta because `rimAColour` is
  // magenta and nothing is drowning it out. Confirmed in the browser before
  // this was written down: thin bars, dark between them, tops readable.
  postEmissive: 0.35,
  skirtColour: 0x050110,

  // Deliberately dim ambient with hot rims. The tops carry their own light
  // (beyLightIntensity below), so a bright fill would flatten exactly the
  // contrast that makes them read as light *sources*.
  hemiSky: 0x4a2f8f,
  hemiGround: 0x05010f,
  hemiIntensity: 0.28,
  keyIntensity: 0.5,
  rimAColour: 0xff2e88,
  rimAIntensity: 3.4,
  rimBColour: 0x00e5ff,
  rimBIntensity: 3.4,

  // A HUE FAMILY, not a brightness. Sparks carry their own white -> straw ->
  // orange -> red cooling ramp per particle now, and the theme colour is
  // blended into it rather than replacing it — so pure white here erased the
  // ramp and every spark in the theme with the most sparks came out the same
  // flat white. Hot straw keeps Overdrive reading hotter than Arena without
  // flattening the temperature.
  sparkColour: 0xffb45a,
  sparkSize: 0.05,
  // Was 1 when the trail was a one-pixel THREE.Line. It is a RibbonTrail now —
  // a real triangle strip roughly 30x the screen area — and at 1 under additive
  // blending plus bloom the ribbon outshone the top it was trailing. 0.8 keeps
  // it the brightest thing after the beys themselves without eating them.
  // 0.32, not the original 1.0 and not the 0.8 this was first restored at.
  //
  // Measured in the browser: the ribbon is additive, and bloom here has
  // threshold 0.7 — so a trail at 0.8 saturates to white, clears the threshold
  // along its whole length, and blooms into a pair of arcs that span the frame
  // and read as fog banks rather than as motion. It also destroyed the one
  // thing the trail is for, which is telling you WHOSE top that is: both
  // ribbons clipped to white and lost the skin colour entirely.
  //
  // At 0.32 the ribbon stays under the bloom threshold along the tail and only
  // the head — the brightest 20% of the fade ramp — blooms, which is exactly
  // the read wanted: a hot streak at the top with a coloured wake behind it.
  trailOpacity: 0.32,
  // 1.1, halved. Each top carries a point light, and at 2.1 a single one lit
  // the whole basin — in the capture that produced this change the dish under
  // the player's top was a white disc a third of the arena across, with no
  // floor texture left inside it. Two tops did it twice.
  //
  // The reference has this exactly right and it is worth naming precisely: the
  // underglow is a TIGHT bright pool right at the tip, maybe a top's width
  // across, sitting on a dish that stays dark everywhere else. That reads as a
  // top glowing onto the floor. A wide even wash reads as the floor being lit,
  // which is a different picture and a much duller one.
  beyLightIntensity: 1.1,
  beyLightFlash: 6,
  shockwave: true,
  finisherBlackout: true,
  postBloom: true,
  // Threshold matters more than strength: raising it means only genuinely hot
  // things bloom, so the glow reads as emissive rather than as fog.
  //
  // RADIUS is the one that had actually gone wrong. Strength says how much a
  // hot pixel adds; radius says how far it travels, and travel is what turns
  // glow into fog. At 0.62 every bright element in the frame reached most of
  // the way to every other one, so the arena had a permanent haze over it that
  // survived even when nothing was happening — the "light pollution" report.
  // 0.32 keeps the halo attached to the object making it.
  //
  // Strength comes down with it, but only a little and only because a tighter
  // halo concentrates what is left; the look is set by radius.
  bloomStrength: 0.5,
  bloomRadius: 0.32,
  bloomThreshold: 0.7,
  // The `toon` flag did not exist when this theme was written. It is false
  // because Overdrive's entire proposition is *3D with glow* — cel bands and
  // ink outlines would delete the bloom this theme is built around.
  toon: false,
  aura: false,
  speedLines: true,
  impactFlash: true,

  // 0.3, the lowest of the three, because this is the theme with a bloom pass.
  // At 0.85 the studio reflection put the entire top above `bloomThreshold`
  // 0.7, so bloom ate it: a white blob with no geometry, in a theme whose
  // whole point is that you can see the hardware glowing. Same lesson as the
  // posts and the rail — something already at full brightness has nothing left
  // to say.
  envIntensity: 0.3,

  // Unused — `aura` is false here. Kept at the authored value so that turning
  // the flag back on gives the effect as designed rather than an invisible one.
  auraStrength: 1,

  // Genuinely dark, not merely dimmed. 0x79828f was a compromise made before
  // there was a rim: dark enough to stop blooming, still bright enough to be a
  // grey lump. With `topRimStrength` drawing the contour the body no longer has
  // to describe itself, so it can go where the reference puts it.
  modelTint: 0x323b4a,

  // The whole point of this theme's look. A cold white-blue edge on a dark
  // body, matching the reference, where the contour is what describes the top
  // and the body itself stays out of the way.
  topRimColour: 0xa8dcff,
  topRimStrength: 1.15,

  // Dark floor: glow is correct here and the ring reads as pressure.
  shockwaveInk: null,

  bodyClass: 'theme-overdrive',
};

// Ordered as the picker shows them: least to most stylised.
export const THEMES: Theme[] = [ARENA, OVERDRIVE, ANIME];

/**
 * Retired theme ids that may still be in players' localStorage or in old
 * ArenaSpec.suggestedTheme values. They were attempts at the anime look, so
 * they must resolve to ANIME — falling back to ARENA would silently strip the
 * cartoon mode from returning players.
 *
 * 'overdrive' was in this set and has been REMOVED, deliberately reversing the
 * earlier remap. The remap was correct only while Overdrive did not exist; now
 * that it does, a saved 'overdrive' must resolve to Overdrive — the whole
 * reason the id is in someone's localStorage is that they chose it, and
 * silently substituting a different theme for their explicit choice is the bug
 * this set exists to prevent, not an instance of it. `themeById` finds it in
 * THEMES on its own, so no special case is needed here.
 */
const LEGACY_ANIME_IDS = new Set(['beam', 'toon']);

export const themeById = (id: string): Theme =>
  LEGACY_ANIME_IDS.has(id) ? ANIME : (THEMES.find((t) => t.id === id) ?? ARENA);

const KEY = 'beyblade-arena.theme.v1';

export function loadThemeId(): string {
  try {
    // OVERDRIVE, not ARENA, is what a player with no saved preference gets.
    // Arena is the *reference* look — deliberately plain, and correct as the
    // thing every other theme is diffed against — but nobody opens a Beyblade
    // game hoping for restraint. Overdrive is the same readable 3D arena with
    // the spectacle turned on, so it is the better first impression while
    // costing nothing: Arena is one click away in the picker and its values
    // remain untouched. Anyone who has ever chosen a theme is unaffected,
    // because a saved id always wins over this default.
    const raw = localStorage.getItem(KEY) ?? OVERDRIVE.id;
    return LEGACY_ANIME_IDS.has(raw) ? ANIME.id : raw;
  } catch {
    return OVERDRIVE.id;
  }
}

export function saveThemeId(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Storage unavailable; the choice still applies for this session.
  }
}


/* ----------------------------------------------------- the manga cut switch */

const FRAME_KEY = 'beyblade-arena.impactFrames';

/**
 * Whether the manga impact frames are drawn at all.
 *
 * A switch rather than another round of tuning, because the report was
 * 审美疲劳 — aesthetic fatigue — and that is not a frequency complaint you can
 * solve by picking a better number. A full-screen stylised cut is a strong
 * device: some players want it every heavy clash and some find any amount of it
 * tiring, and there is no rate that satisfies both. The rate is now much lower
 * for everyone (see IMPACT_FRAME in arena.ts) and this turns the rest off.
 *
 * Defaults ON, because it is one of the things that makes the Anime theme read
 * as anime, and it only exists in that theme in the first place.
 */
export function loadImpactFrames(): boolean {
  try {
    return localStorage.getItem(FRAME_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function saveImpactFrames(on: boolean): void {
  try {
    localStorage.setItem(FRAME_KEY, on ? 'on' : 'off');
  } catch {
    // Storage unavailable. The session keeps the choice; only memory is lost.
  }
}
