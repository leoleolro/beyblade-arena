import * as THREE from 'three';
import * as C from '../sim/constants';
import { slipNorm, spinNorm, surfaceSlip } from '../sim/physics';
import type { ContactEvent, HitEvent } from '../sim/physics';
import type { BeyState } from '../sim/types';
import { buildBeyMesh } from './beyMesh';
import type { BeyParts } from './beyMesh';
import { RibbonTrail, SparkBurst, buildGroundGlow } from './effects';
import type { GroundGlow, TrailLike } from './effects';
import { buildSpinBlur } from './spinBlur';
import type { SpinBlur } from './spinBlur';
import { ImpactFrame } from './impactFrame';
import { skinById } from './skins';
import type { Skin } from './skins';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { applyStadiumTheme, beyWorldPosition, buildStadium, markFinishPocket } from './stadium';
import type { StadiumHandles } from './stadium';
import { ARENA, THEMES, loadImpactFrames, themeById } from './theme';
import type { Theme } from './theme';
import { Shockwave } from './shockwave';
import { ClashPool } from './clashPool';
import type { ArenaSpec } from '../sim/arena';
import { buildRail } from './rail';
import type { RailHandles } from './rail';
import { buildPit } from './pit';
import type { PitHandles } from './pit';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { buildAura } from './aura';
import type { Aura } from './aura';
import { contactShadow, noOutline } from './toon';
import { designByLayer } from './beydex';
import {
  finishImported,
  loadTopModel,
  normaliseToRadius,
  seatOnOrigin,
} from './topModels';
import { renderInked } from './outlineHull';
import { setEnvironmentIntensity, studioEnvironment } from './environment';
import { addFresnelRim } from './rimMetal';
import { drawnSpinRate, trailScale } from './motion';
import { topModelFor } from './topModelIndex';

interface BeyVisual {
  group: THREE.Group;
  trail: TrailLike;
  /**
   * The angle the top is DRAWN at, accumulated separately from `state.angle`.
   *
   * The sim's angle advances too fast to be sampled at 60fps and aliases — see
   * `drawnSpinRate`. This is the eye-trackable version of the same rotation,
   * and it has to be integrated rather than derived because the rate itself
   * varies with remaining spin.
   */
  drawnAngle: number;
  /** Spin-blur disc, toon only: the drawn stand-in for a top too fast to see. */
  blur: SpinBlur | null;
  /** The three part sub-groups, scaled down while the blur dominates. */
  parts: BeyParts;
  /**
   * A light that lives with the top and flares on impact. Off in the default
   * theme; in the anime theme it's most of the look, because the tops end up
   * lighting the arena rather than being lit by it.
   */
  light: THREE.PointLight;
  /** Energy shell, present only in themes that use one. */
  aura: Aura | null;
  /**
   * The disc of light on the dish beneath this top. Present in every theme —
   * it is the one effect that reads at the battle camera's distance, where the
   * tops are only about 60px across and everything drawn ON them is lost.
   */
  glow: GroundGlow;
  /** Grind level this frame, 0..1, for the glow to swell on. */
  grind: number;
  /**
   * Drawn contact shadow, used by the toon theme.
   *
   * Kept as a sibling of the top rather than a child of it: the group leans and
   * precesses for wobble, and a parented shadow would tip up off the floor with
   * it. This one stays flat on the dish and only follows the position.
   */
  shadow: THREE.Mesh | null;
  /** Free-running precession phase, so wobble doesn't look mechanical. */
  wobblePhase: number;
  /** Seconds since this top died. Drives the defeat animation. */
  death: number;
  /** One-shot latch for the flash/ring on the frame a top goes out. */
  defeatOpened: boolean;
  /** Unit exit bearing, captured on the frame a knocked-out top leaves. */
  exit: THREE.Vector3;
}

/**
 * The entry drop.
 *
 * There was no entry at all: setBeys placed both tops at their sim positions
 * and the first frame simply had them there, mid-orbit, as if they had always
 * been spinning. Reported as "the blades enter the arena so slow", which is the
 * right complaint about the wrong thing — nothing entered, so there was nothing
 * to be slow.
 *
 * 0.35s from 0.62 units up (the rim is at 0.2), well inside the sim's
 * SETTLE_TIME of 1.25s, so the drop is finished long before the first contact
 * can matter. ENTRY_FALL splits the window: fall, then a single small rebound.
 */
const ENTRY_TIME = 0.35;
const ENTRY_HEIGHT = 0.62;
const ENTRY_FALL = 0.78;

/**
 * Put a top's three sub-groups back where buildBeyMesh left them.
 *
 * The burst defeat is the only thing in the renderer that writes to a part
 * transform, and a round can be cut short mid-scatter. buildBeyMesh hands back
 * fresh groups every round so this is belt-and-braces — but "the scattered
 * pieces cannot survive into the next round" is a property worth stating in
 * code rather than inferring from an allocation.
 */
function resetParts(parts: BeyParts): void {
  for (const p of [parts.layer, parts.disc, parts.driver]) {
    p.position.set(0, 0, 0);
    p.rotation.set(0, 0, 0);
    p.scale.setScalar(1);
  }
}

/**
 * Draws the battle. Owns no game state: every frame it is handed the current
 * sim state and mirrors it. Spin, lean and wobble are *visual* consequences of
 * the sim's scalar spin value rather than separately simulated, which is what
 * keeps the physics stable while still looking like a real spinning top.
 */
const clampUnit = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Whether this session can screenshot itself. See the renderer construction.
 *
 * Read once at module load rather than per-frame: `preserveDrawingBuffer` is a
 * context-creation attribute and cannot be changed afterwards, so a later
 * change of mind would need a reload anyway.
 */
const SHOT_MODE =
  typeof location !== 'undefined' && /[?&]shot\b/.test(location.search);



/** Shared empty array, so the no-contacts path allocates nothing per frame. */
const EMPTY_CONTACTS: readonly ContactEvent[] = [];

/** Depth-first dispose, so rebuilding on a theme switch can't leak GPU memory. */
function disposeTree(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}

/**
 * The anime backdrop: a huge inverted sphere carrying a painted vertical
 * gradient of a dark tournament hall.
 *
 * `scene.background` is a flat Color and cannot hold a gradient, so the hall
 * is geometry. Dark on purpose — the source material lights the bowl and lets
 * the arena around it fall away, so the gradient is near-black at the zenith
 * with one cyan glow band at the horizon where the stadium lighting would be.
 * BackSide so the camera sees it from inside; fog off because at radius 40 the
 * whole sphere sits past fogFar and would flatten to one solid fog-coloured
 * wall, deleting the gradient it exists to show; depthWrite off plus
 * renderOrder -10 so it can never occlude the stadium; outline suppressed
 * because an inverted hull on a BackSide sphere renders in front of it.
 */
function buildBackdrop(): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#060b16'); // zenith: the dark of the hall
    g.addColorStop(0.4, '#101d36');
    g.addColorStop(0.52, '#16294a'); // must equal ANIME.fogColour — fog blends here
    g.addColorStop(0.58, '#2b5a8f'); // the arena-light glow band on the horizon
    g.addColorStop(0.66, '#16294a');
    g.addColorStop(1, '#0a1424'); // below horizon: the dark floor mass
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  noOutline(mat);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 24), mat);
  mesh.renderOrder = -10;
  return mesh;
}

export class ArenaRenderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly sparks = new SparkBurst();
  /**
   * The manga cut.
   *
   * Public so a dev tool can trigger one directly. It is a DOM overlay, so the
   * canvas filmstrip cannot capture it, and it is deliberately the rarest thing
   * the game draws — only a crit or a perfect block earns one — which together
   * mean the only way to look at it was to play until one happened by luck.
   */
  readonly impactFrame = new ImpactFrame();
  /** Scratch for projecting hit points to the screen; no per-hit allocation. */
  private readonly projected = new THREE.Vector3();
  /** Scratch for the drain stream's direction; no per-frame allocation. */
  private readonly drainDir = new THREE.Vector3();
  /** Scratch for the grind stream's tangent; no per-hit allocation. */
  private readonly grindDir = new THREE.Vector3();
  /** Throttle on the drain stream, so absorption glows instead of strobing. */
  private drainCooldown = 0;
  /** Throttle on the continuous grind, which can fire on every single frame. */
  private grindCooldown = 0;
  /** Player switch for the manga cuts. See loadImpactFrames. */
  private impactFrames = loadImpactFrames();
  /**
   * Seconds until another impact frame may fire.
   *
   * Reported as "the impact frames are happening too much". The gate was the
   * hitstop threshold alone, and heavy clashes are not rare — an opposite-spin
   * exchange lands several in a row, so the screen was being cut on almost
   * every meaningful contact. A cut that happens constantly is not a cut, it
   * is a strobe, and it stops marking anything as important.
   *
   * Two gates now: a refractory period so consecutive hits in one exchange
   * produce one frame rather than four, and a bar above the hitstop threshold
   * so ordinary heavy hits keep their hitstop and sparks without also
   * repainting the screen.
   */
  private frameCooldown = 0;
  private readonly visuals = new Map<string, BeyVisual>();
  private readonly beyRoot = new THREE.Group();

  private shake = 0;
  /**
   * Clash punch, 0–1: a short radius pull-in and lens kick on a heavy hit.
   *
   * Separate from `shake` because they decay at different rates and mean
   * different things — shake is the operator being rattled and is over in a
   * beat, punch is the shot tightening on the exchange and wants to breathe.
   */
  private punch = 0;
  private cameraAngle = 0;
  /**
   * Orbit radius, tracked rather than re-derived from camera.position.
   *
   * It used to be read back as hypot(position.x, position.z), which was only
   * correct while the camera orbited the world origin. It now orbits `focus`,
   * so the readback would fold the focus offset into the radius and the camera
   * would creep outward as the fight drifted off centre.
   */
  private camRadius = 1.7;
  /** Eased look-at target: where the fight is, not where the bowl is. */
  private readonly focus = new THREE.Vector3(0, C.BOWL_DEPTH * 0.35, 0);
  private readonly focusTarget = new THREE.Vector3();
  /** Resting vertical field of view; the punch kicks below this and eases back. */
  private readonly baseFov = 42;
  private elapsed = 0;
  /** Seconds of entry drop remaining; 0 when idle. */
  private entry = 0;
  /** One-shot latch for the touchdown ring, so it fires on exactly one frame. */
  private entryLanded = true;

  private readonly canvas: HTMLCanvasElement;

  private theme: Theme = ARENA;
  private stadium!: StadiumHandles;
  private hemi!: THREE.HemisphereLight;
  private key!: THREE.DirectionalLight;
  private rimA!: THREE.PointLight;
  private rimB!: THREE.PointLight;
  private readonly shockwaves = new Shockwave();
  private readonly clashPools = new ClashPool();
  /** Which pocket layout the current stadium mesh was cut for. */
  private pocketKey = '';
  private composer: EffectComposer | null = null;
  /**
   * Inverted-hull outline pass. Created lazily on first toon use and then kept:
   * it wraps the renderer rather than owning a render target, so leaving it
   * allocated costs nothing when unused.
   */
  private outline: OutlineEffect | null = null;
  /** Which pocket scores an Xtreme Finish in the current arena, if any. */
  private finishPocket: number | null = null;
  /** Skins of the current round, so a toon switch can rebuild the meshes. */
  private lastSkins: Record<string, string> = {};
  private lastBeys: BeyState[] = [];
  private bloom: UnrealBloomPass | null = null;
  /** Seconds left of the decisive-blow blackout, when the theme uses one. */
  private blackout = 0;
  /** The X-Rail ring, present only in arenas that have one. */
  private rail: RailHandles | null = null;
  /** The Spike Pit hazard, present only in arenas that have one. */
  private pit: PitHandles | null = null;
  /** Painted hall sphere, present only under the anime theme. */
  private backdrop: THREE.Mesh | null = null;
  /** Throttles rail sparks so a ride doesn't drain the whole particle pool. */
  private railSparkClock = 0;
  /** Scratch for rider bearings; reused so the rail costs no allocation. */
  private readonly railAngles: number[] = [];
  /** Scratch for the rail spark stream direction. */
  private readonly railStream = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      // OPT-IN SCREENSHOTS, off by default.
      //
      // A WebGL back buffer is cleared the moment it is composited, so
      // `canvas.toDataURL()` on a live arena returns a blank image — which is
      // why "keep a screenshot of the state we agreed on" (docs/design-targets)
      // was a manual, take-it-with-your-phone step.
      //
      // `preserveDrawingBuffer` fixes that and is NOT free: it forces the
      // driver to keep a readable copy of every frame, which costs bandwidth on
      // exactly the mobile GPUs least able to spare it. So it is behind a flag
      // rather than on for everyone, and the game every player actually loads
      // is unchanged. Add `?shot` to the URL, then call `__shot()`.
      preserveDrawingBuffer: SHOT_MODE,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.background = new THREE.Color(ARENA.background);
    this.scene.fog = new THREE.Fog(ARENA.fogColour, ARENA.fogNear, ARENA.fogFar);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 1.16, 1.7);
    this.camera.lookAt(0, 0, 0);

    this.stadium = buildStadium(ARENA);
    this.scene.add(this.stadium.group);
    this.scene.add(this.beyRoot);
    this.scene.add(this.sparks.points);
    // Sparks draw over the ribbons (1) and blur discs (2) in every theme.
    this.sparks.points.renderOrder = 3;
    this.scene.add(this.shockwaves.group);
    this.scene.add(this.clashPools.group);
    this.addLights();
    this.resize();

    // Dev-only handle on the live scene. Rendering bugs are the one class of
    // bug you cannot reason your way to — three times now the cause of a
    // visual has been the opposite of what it looked like — and being able to
    // poke the real scene graph from the console beats another guess.
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__arena = this;
    }
  }

  /**
   * Switch visual theme.
   *
   * Everything is re-parameterised in place rather than rebuilt, so switching
   * back and forth is free and leaks nothing. The one structural change is the
   * bloom pass, which is created lazily on first use and then simply bypassed
   * when a theme doesn't want it — building and disposing a render target on
   * every toggle would be the only real leak risk here.
   */
  /** Turn the manga impact frames on or off. Persisted by the caller. */
  setImpactFrames(on: boolean): void {
    this.impactFrames = on;
  }

  /**
   * The current frame as a PNG data URL, or null when `?shot` was not set.
   *
   * Renders immediately before reading. Even with `preserveDrawingBuffer` the
   * safe moment to read a WebGL canvas is straight after a draw, and forcing
   * one here means the caller does not have to reason about where in the frame
   * loop it happens to be standing.
   */
  snapshot(): string | null {
    if (!SHOT_MODE) return null;
    this.present();
    return this.renderer.domElement.toDataURL('image/png');
  }

  setTheme(id: string): void {
    const t = themeById(id);
    const toonChanged = t.toon !== this.theme.toon;
    this.theme = t;

    // Toon uses MeshToonMaterial, a different material *class* — the one case
    // the "assign, never rebuild" rule can't cover. Rebuild the stadium and the
    // tops, disposing the old ones so repeated switching doesn't leak.
    if (toonChanged) {
      this.scene.remove(this.stadium.group);
      disposeTree(this.stadium.group);
      this.stadium = buildStadium(t);
      this.scene.add(this.stadium.group);
      if (this.lastBeys.length) this.setBeys(this.lastBeys, this.lastSkins);
    }

    (this.scene.background as THREE.Color).setHex(t.background);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.setHex(t.fogColour);
    fog.near = t.fogNear;
    fog.far = t.fogFar;

    // Built on entering the anime theme, fully disposed on leaving it, so
    // toggling can't accumulate spheres. disposeTree covers geometry and
    // material but not the texture hanging off the material's map slot.
    if (t.toon && !this.backdrop) {
      this.backdrop = buildBackdrop();
      this.scene.add(this.backdrop);
    } else if (!t.toon && this.backdrop) {
      this.scene.remove(this.backdrop);
      (this.backdrop.material as THREE.MeshBasicMaterial).map?.dispose();
      disposeTree(this.backdrop);
      this.backdrop = null;
    }

    applyStadiumTheme(this.stadium, t);
    // After the repaint, never before — see markFinishPocket.
    markFinishPocket(this.stadium, this.finishPocket, this.theme);
    // The rail carries emissive metal in the lit themes and banded cel metal in
    // the anime one; a hot emissive with no bloom behind it just clips white.
    this.rail?.setToon(t.toon);

    this.hemi.color.setHex(t.hemiSky);
    this.hemi.groundColor.setHex(t.hemiGround);
    this.hemi.intensity = t.hemiIntensity;
    this.key.intensity = t.keyIntensity;
    this.rimA.color.setHex(t.rimAColour);
    this.rimA.intensity = t.rimAIntensity;
    this.rimB.color.setHex(t.rimBColour);
    this.rimB.intensity = t.rimBIntensity;

    this.sparks.setStyle(t.sparkColour, t.sparkSize);
    this.shockwaves.setInk(t.shockwaveInk !== null);
    this.clashPools.setInk(t.shockwaveInk !== null);
    for (const v of this.visuals.values()) {
      v.trail.setOpacity(t.trailOpacity);
      v.light.intensity = t.beyLightIntensity;
      if (v.aura) {
        v.aura.sprite.visible = t.aura;
        v.aura.setStrength(t.auraStrength);
      }
      // Imported tops are built with the exposure of whatever theme was active
      // at the time, and the two themes that differ most here are both non-toon
      // — so the rebuild above does not cover the switch that matters. See
      // setEnvironmentIntensity.
      setEnvironmentIntensity(v.group, t.envIntensity);
    }

    if (t.postBloom) {
      this.ensureComposer();
      if (this.bloom) {
        this.bloom.strength = t.bloomStrength;
        this.bloom.radius = t.bloomRadius;
        this.bloom.threshold = t.bloomThreshold;
      }
    }

    if (typeof document !== 'undefined') {
      // Every theme class, not a hand-kept subset — a stale class left behind
      // keeps the wrong HUD skin active after switching away.
      for (const th of THEMES) document.body.classList.remove(th.bodyClass);
      document.body.classList.add(t.bodyClass);
    }
  }

  /**
   * Build the bloom render path, once, on first use by a theme that wants it.
   *
   * This had not executed since the theme consolidation deleted the only
   * postBloom theme, and it did not survive the three.js upgrades that happened
   * meanwhile. EffectComposer's buffers are HalfFloatType and therefore LINEAR,
   * and UnrealBloomPass's final blend is a plain ShaderMaterial that does no
   * colour-space conversion — so the last pass was writing linear values
   * straight into an sRGB framebuffer. That is not a subtle difference: the
   * whole image comes out washed out and milky, which would have read as "the
   * bloom is broken" rather than as "the output pass is missing".
   *
   * OutputPass does the tone-mapping and sRGB conversion the renderer would
   * normally do for itself, and must be LAST in the chain.
   */
  private ensureComposer(): void {
    if (this.composer) return;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.9, 0.55, 0.62);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.setSize(w, h);
  }

  /**
   * Show or hide the arena's rail. Built once on first use and then toggled —
   * a round can start in either arena and rebuilding each time would leak.
   */
  setArena(arena: ArenaSpec): void {
    // Remembered so a later theme switch can re-apply it: `applyStadiumTheme`
    // repaints every post, so the marking has to be re-stated after it rather
    // than set once here.
    // Rebuild if this arena cuts its exits somewhere else. The rim wall's gaps
    // are geometry, not a flag, so a clustered floor needs new geometry — see
    // buildStadium. Keyed on the bearings themselves so the common case (same
    // layout, different rail or pit) still costs nothing.
    const key = (arena.pockets ?? []).join(',');
    if (key !== this.pocketKey) {
      this.pocketKey = key;
      this.scene.remove(this.stadium.group);
      disposeTree(this.stadium.group);
      this.stadium = buildStadium(this.theme, arena.pockets);
      this.scene.add(this.stadium.group);
    }

    this.finishPocket = arena.finishPocket ?? null;
    markFinishPocket(this.stadium, this.finishPocket, this.theme);

    if (arena.rail && !this.rail) {
      this.rail = buildRail(arena.rail.radius);
      this.scene.add(this.rail.group);
    }
    if (this.rail) {
      this.rail.group.visible = !!arena.rail;
      this.rail.setToon(this.theme.toon);
    }

    if (arena.pit && !this.pit) {
      this.pit = buildPit(arena.pit.radius);
      this.scene.add(this.pit.group);
    }
    if (this.pit) this.pit.group.visible = !!arena.pit;
  }

  /**
   * Called when a round is decided. Themes that want it crush the ambient light
   * for a beat so everything except the two tops falls into black — the frame
   * anime uses to sell a finishing blow.
   */
  finish(): void {
    if (this.theme.finisherBlackout) this.blackout = 0.55;
    this.shake = Math.max(this.shake, 0.07);
    this.punch = Math.max(this.punch, 0.75);
  }

  /**
   * Called when a round starts — the mirror of finish().
   *
   * Two jobs. The tops DROP IN from above the rim instead of materialising
   * mid-orbit, landing together in a ring of sparks; and the camera starts wide
   * and swung round to the player's entry side, so the exponential radius ease
   * updateCamera already runs reads as a hard push-in on the launch.
   *
   * Render-only by construction: the drop is a y offset added on top of the sim
   * position each frame (see entryOffset) and is never written back into
   * b.pos, so the physics is untouched and a headless run is unaffected.
   *
   * @param entryAngle The player's launch bearing, in sim-plane radians.
   */
  start(entryAngle = 0): void {
    this.entry = ENTRY_TIME;
    this.entryLanded = false;
    this.shake = 0;
    this.punch = 0;
    // The focus is damped at 3.5/s, so a round that ended in a knockout leaves
    // it parked over the loser's exit point out near the rim. Without this the
    // next round opens aimed off-centre and drifts back over roughly the whole
    // 0.35s drop — i.e. the entry, the one shot that has to be composed.
    this.focus.set(0, C.BOWL_DEPTH * 0.35, 0);
    // Otherwise a cut spent on the last hit of the previous round can eat the
    // first clash of this one.
    this.frameCooldown = 0;

    // Sim (x, y) maps to world (x, z) and the orbit is parameterised as
    // (sin, cos), so pi/2 - entryAngle is the bearing that puts the camera
    // over the player's drop point.
    this.cameraAngle = Math.PI / 2 - entryAngle;

    // 35% wider than the resting frame. updateCamera closes the gap at 2.2/s,
    // so the push-in runs for most of the 1.25s settle window and finishes
    // about when the tops are first allowed to hurt each other.
    const aspect = this.camera.aspect || 1;
    const narrow = aspect < 1.6 ? 1.6 / Math.max(aspect, 0.62) : 1;
    this.camRadius = 1.62 * narrow * 1.35;
  }

  /**
   * Friction sparks at the contact patch.
   *
   * Grinding metal throws sparks because the two surfaces are moving PAST each
   * other: friction at the contact tears microscopic chips off, and the work
   * that tears them loose is enough to heat them past ignition. So the thing
   * that decides whether a contact sparks is not how hard it was — it is how
   * fast the two surfaces SLIP against each other.
   *
   * `surfaceSlip` in the sim computes that slip and documents why it is a SUM
   * rather than a difference — briefly, two touching tops are meshing gears,
   * so the terms cancel in an opposite-spin matchup and add in a same-spin
   * one. Same-spin is the case that grinds.
   *
   * Emitted as a big arc along the slip and a smaller counter-arc against it,
   * which is what a grinding wheel actually throws.
   */
  private grindSparks(h: HitEvent, at: THREE.Vector3): void {
    const a = this.lastBeys.find((x) => x.id === h.a);
    const b = this.lastBeys.find((x) => x.id === h.b);
    if (!a || !b) return;

    const dx = b.pos.x - a.pos.x;
    const dy = b.pos.y - a.pos.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return;
    // perp(n), in sim coordinates. Sim (x, y) is world (x, z).
    const px = -dy / d;
    const py = dx / d;

    // The physics lives in the sim (see surfaceSlip / slipNorm) so it can be
    // tested without a GL context; this function only turns it into particles.
    const slip = surfaceSlip(a, b);
    const k = slipNorm(a, b);
    // Below this the surfaces are effectively rolling on each other and a real
    // contact would polish rather than spark. Two dying tops throw nothing,
    // and so does a clean opposite-spin head-on — measured, that pairing sits
    // at k ≈ 0.018, because the two terms cancel to the difference in layer
    // radii alone.
    if (k < 0.04) return;

    const sign = slip < 0 ? -1 : 1;
    this.grindDir.set(px * sign, 0, py * sign);

    // Scaled by slip, not by impact: a hard head-on between counter-rotating
    // tops barely grinds, and a long same-spin scrape throws a lot.
    const n = Math.round(3 + k * 30);
    this.sparks.spawn(at, 0.5 + k * 3.4, n, this.grindDir, 0.42, true);

    // The counter-arc: smaller, wider, and thrown the other way. Both surfaces
    // shed chips, and a single one-sided jet reads as a rocket.
    this.grindDir.multiplyScalar(-1);
    this.sparks.spawn(
      at,
      0.4 + k * 2.2,
      Math.max(2, Math.round(n * 0.35)),
      this.grindDir,
      0.6,
      true,
    );
  }

  /**
   * Height to add to a top's visual position this frame, in world units.
   *
   * Cubic ease-out over the first 78% of the window — fast out of the sky,
   * decelerating into the dish — and then one small rebound, because a drop
   * that stops dead at the floor reads as a teleport that happened to have a
   * trajectory. Measured: 0.62 to 0 over 0.27s, then +0.045 to 0 over 0.08s.
   */
  private entryOffset(): number {
    if (this.entry <= 0) return 0;
    const t = 1 - this.entry / ENTRY_TIME;
    if (t < ENTRY_FALL) {
      const k = t / ENTRY_FALL;
      return ENTRY_HEIGHT * (1 - k) ** 3;
    }
    const k = (t - ENTRY_FALL) / (1 - ENTRY_FALL);
    return 0.045 * Math.sin(k * Math.PI) * (1 - k);
  }

  private addLights(): void {
    this.hemi = new THREE.HemisphereLight(
      ARENA.hemiSky,
      ARENA.hemiGround,
      ARENA.hemiIntensity,
    );
    this.scene.add(this.hemi);

    const key = new THREE.DirectionalLight(0xffffff, ARENA.keyIntensity);
    this.key = key;
    key.position.set(2.2, 4.2, 1.8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 12;
    const cam = key.shadow.camera as THREE.OrthographicCamera;
    cam.left = -2;
    cam.right = 2;
    cam.top = 2;
    cam.bottom = -2;
    this.scene.add(key);

    // Two coloured rim lights give the metal something to catch.
    const rimA = new THREE.PointLight(ARENA.rimAColour, ARENA.rimAIntensity, 6);
    rimA.position.set(-1.8, 0.9, -1.4);
    this.rimA = rimA;
    this.scene.add(rimA);

    const rimB = new THREE.PointLight(ARENA.rimBColour, ARENA.rimBIntensity, 6);
    rimB.position.set(1.9, 0.8, -1.2);
    this.rimB = rimB;
    this.scene.add(rimB);
  }

  /**
   * Rebuild the meshes for a new round.
   *
   * `skins` is keyed by bey id. The two skins are guaranteed to be far apart in
   * hue (see pickContrastingSkin), which is what replaced the ownership markers:
   * the tops are now told apart by what they *are* rather than by a ring drawn
   * under one of them.
   */
  setBeys(beys: BeyState[], skins: Record<string, string> = {}): void {
    this.lastSkins = skins;
    this.lastBeys = beys;
    // A mid-round theme switch calls straight back in here (see setTheme), and
    // without this the tops would jump back into the sky and re-drop in the
    // middle of a fight. start() is the only thing that arms the entry.
    this.entry = 0;
    this.entryLanded = true;
    for (const v of this.visuals.values()) {
      this.beyRoot.remove(v.group);
      // The mesh tree is disposed too, not just detached.
      //
      // It used to be only removed, and that leaked the whole top — geometry,
      // materials, the aura's generated texture, the spin-blur mesh — once per
      // round for both tops, unbounded across a ladder run. The trail and the
      // shadow beside it were always disposed, so this was an omission rather
      // than a policy. buildBeyMesh allocates a fresh tree every round, so
      // there is nothing to keep.
      // The aura sprite is a CHILD of the group (see setBeys below), so this
      // covers its material. Its texture is deliberately shared across every
      // aura ever built and must outlive any one of them, which is why
      // disposeTree only disposes materials and geometry, never maps.
      disposeTree(v.group);
      this.beyRoot.remove(v.glow.mesh);
      disposeTree(v.glow.mesh);
      this.beyRoot.remove(v.trail.object);
      disposeTree(v.trail.object);
      if (v.shadow) {
        this.beyRoot.remove(v.shadow);
        disposeTree(v.shadow);
      }
    }
    this.visuals.clear();

    for (const b of beys) {
      const skin: Skin = skinById(skins[b.id] ?? 'frost');
      const group = buildBeyMesh(b.build, skin, this.theme.toon);

      // THE SAME CONTOUR ON THE PROCEDURAL TOPS, not just the imported ones.
      //
      // The reference has BOTH beys reading as dark bodies with luminous edges,
      // and the imported models were only half the roster. A rim ADDS light at
      // the silhouette without touching the base colour, so a bey keeps the
      // palette that identifies it — Fafnir stays gold — and gains the edge that
      // makes it read as an object against a dark dish.
      //
      // Applied here rather than inside `buildClassicBey` because it is a theme
      // decision, and beyMesh has no business knowing which theme asked. Runs
      // before `applyTopModel`, so an imported top is untouched by it and gets
      // its rim through `finishImported` instead — patched once, never twice.
      if (this.theme.topRimStrength > 0) {
        const rim = {
          colour: this.theme.topRimColour,
          strength: this.theme.topRimStrength,
        };
        group.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of list) {
            // Standard materials only. The cel path has its own rim and a
            // MeshToonMaterial has no `outgoingLight` line to patch.
            if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) addFresnelRim(m, rim);
          }
        });
      }

      // An imported top, if this bey has one, swapped in when it resolves.
      // Deliberately after the procedural build rather than instead of it: the
      // round starts on the frame it starts, and a model that is slow or
      // missing must never be able to delay or empty the arena.
      this.applyTopModel(group, b.build.layer.id, b.stats.radius);

      // The ribbon is not a toon effect — it is simply a trail you can SEE.
      // The fallback `Trail` is a THREE.Line, which no desktop GL driver draws
      // wider than one pixel (documented at effects.ts), so on a 4K display the
      // "trail" was a hairline nobody ever noticed. RibbonTrail is real
      // geometry and reads at any resolution; its noOutline call is inert
      // outside the toon path, so there is nothing toon-specific left in it.
      //
      // EVERY theme gets the ribbon, ARENA included, and that is a deliberate
      // narrowing of ARENA's "unchanged" contract rather than a violation of
      // it. Two reasons:
      //
      //  - The old `Trail` is a 1px THREE.Line, and effects.ts records that
      //    linewidth is ignored on essentially every platform. ARENA's hairline
      //    trail is not a design choice anyone made; it is what the platform
      //    does to a choice nobody could implement. Preserving it preserves a
      //    limitation, not a look.
      //  - Keeping a per-theme PRIMITIVE was an outright bug. setTheme only
      //    rebuilds the tops when `toon` changes, and ARENA.toon === OVERDRIVE
      //    .toon === false, so switching between those two left whichever
      //    primitive the last launch built — a wide additive ribbon stranded in
      //    ARENA, or the invisible hairline stranded in the theme whose entire
      //    point is spectacle — until the next round rebuilt it.
      //
      // What the contract does still bind is ARENA's PARAMETERS: its palette,
      // its lights, and its effect flags are untouched, and trailOpacity stays
      // at the 0.45 it has always had, so the ribbon reads as a soft wake here
      // and as a hard streak in Overdrive at 0.8.
      const trail: TrailLike = new RibbonTrail(skin.primary, b.stats.radius);
      trail.setOpacity(this.theme.trailOpacity);

      // Toon only: motion is drawn, not simulated — at high spin the blur is
      // the top, and the detailed mesh shrinks slightly underneath it. The blur
      // reads the layer group because its afterimages are copies of that exact
      // silhouette, sharing its geometry.
      const design = designByLayer(b.build.layer.id);
      const parts = group.userData.parts as BeyParts;
      resetParts(parts);
      // NOT ON AN IMPORTED TOP, and the reason is in the sentence above: the
      // afterimages are copies of the layer group's silhouette. A model
      // replaces that group wholesale a few frames later, so the blur ends up
      // smearing a shape that is no longer on screen over an object it was
      // never measured against — a coloured dome sitting on a silver top.
      // Caught by the contact sheet rather than by a player, which is the
      // point of the contact sheet.
      const blur =
        this.theme.toon && !topModelFor(b.build.layer.id)
          ? buildSpinBlur(design, b.stats.radius, parts.layer, b.build.layer.blades)
          : null;
      if (blur) group.add(blur.mesh);

      // Parented to the group, so it tracks the top for free.
      //
      // AT THE TIP, not at the waist. This sat at y = 0.1 — roughly mid-body on
      // a top whose whole height is about 0.24 — which put a point light INSIDE
      // the object it was meant to light. The top flooded from within and came
      // out as a bright mass, brightest at the middle where there should be a
      // shaded underside.
      //
      // The reference capture is unambiguous about what this effect is: a tight
      // bright pool on the dish right at the contact point, with the body of the
      // top staying dark above it. That is a light sitting just off the floor,
      // raking up. y = 0.03 puts it there, and the same intensity now spends
      // itself on the dish rather than on the top's own interior.
      // FALLOFF 0.34, NOT 1.6, and this one number was the glowing-ball bug.
      //
      // 1.6 world units is larger than the dish, so what the comment called a
      // per-top light was in practice a floodlight: it lit its own top from
      // point-blank range, the opponent, and the whole floor. Two of them
      // turned both beys into balls of light, and a clash then had nothing to
      // add — filmstripped with momentSheet, the impact frame was one white
      // wash with neither bey visible inside it.
      //
      // Proved by isolation rather than argued: zeroing ONLY these lights, with
      // the aura, the bloom, the metal and everything else untouched, turned
      // both tops back into readable objects immediately.
      //
      // Zero is still wrong — the reference has a distinct bright pool under
      // each top, and that pool is this light. What it needs is a radius near
      // the top's own, so it lights the floor it stands on and rakes the body
      // from beneath, and reaches nothing else. 0.34 is about three times a
      // top's radius.
      const light = new THREE.PointLight(skin.primary, this.theme.beyLightIntensity, 0.34);
      light.position.y = 0.03;
      group.add(light);

      // Parented to the top so it tracks for free. Built regardless of theme
      // and simply hidden, so a mid-match theme switch needs no rebuild.
      const aura = buildAura(skin.primary);
      aura.setStrength(this.theme.auraStrength);
      aura.sprite.position.y = 0.12;
      aura.sprite.visible = this.theme.aura;
      group.add(aura.sprite);

      const shadow = this.theme.toon ? contactShadow(b.stats.radius) : null;
      if (shadow) this.beyRoot.add(shadow);

      // A sibling of the top, not a child: the group leans and precesses for
      // wobble, and a parented decal would tip up off the floor with it — the
      // same reason the contact shadow above is a sibling.
      const glow = buildGroundGlow(skin.primary, b.stats.radius);
      this.beyRoot.add(glow.mesh);

      this.beyRoot.add(group);
      this.beyRoot.add(trail.object);
      this.visuals.set(b.id, {
        group,
        trail,
        // Seeded from the sim's angle rather than 0, so the two tops do not
        // both start facing the camera dead-on at launch.
        drawnAngle: b.angle,
        blur,
        parts,
        light,
        aura,
        shadow,
        glow,
        grind: 0,
        wobblePhase: Math.random() * Math.PI * 2,
        death: 0,
        defeatOpened: false,
        exit: new THREE.Vector3(1, 0, 0),
      });
    }
  }

  /**
   * Swap a procedural top for an imported model, if one exists.
   *
   * Async and fire-and-forget. The procedural mesh is already on screen and
   * stays there until the model resolves; if there is no model, or it fails,
   * nothing happens at all and the top is simply the one the game drew.
   *
   * The model replaces the LAYER group's contents and hides the procedural
   * disc and driver, because an imported file is a whole assembled beyblade —
   * see topModels.ts. The part groups themselves are left in place and keep
   * their transforms, so the burst scatter, the garage explode and the spin
   * blur all keep working against the same three handles they always used.
   */
  private applyTopModel(group: THREE.Group, layerId: string, radius: number): void {
    const entry = topModelFor(layerId);
    if (!entry) return;
    const parts = group.userData.parts as BeyParts | undefined;
    if (!parts) return;

    void loadTopModel(entry.url).then((src) => {
      if (!src) return;
      // The group may already have been torn down for the next round.
      if (!group.parent) return;

      const model = src.clone(true);
      normaliseToRadius(model, radius);
      seatOnOrigin(model);
      finishImported(model, this.theme.modelTint, studioEnvironment(this.renderer), entry.finish, this.theme.envIntensity, {
        colour: this.theme.topRimColour,
        strength: this.theme.topRimStrength,
      });

      parts.layer.clear();
      parts.layer.add(model);
      parts.disc.visible = false;
      parts.driver.visible = false;
    });
  }

  /** Mirror one frame of sim state. `dt` is real elapsed seconds. */
  update(
    beys: BeyState[],
    hits: HitEvent[],
    dt: number,
    contacts: readonly ContactEvent[] = EMPTY_CONTACTS,
  ): void {
    this.elapsed += dt;
    this.frameCooldown = Math.max(0, this.frameCooldown - dt);
    this.drainCooldown = Math.max(0, this.drainCooldown - dt);
    this.grindCooldown = Math.max(0, this.grindCooldown - dt);

    this.entry = Math.max(0, this.entry - dt);
    const drop = this.entryOffset();
    const entering = this.entry > 0;
    // Ramps 0 to 1 across the entry window, so the drawn motion spins UP as the
    // top lands rather than arriving already at full smear.
    const entryK = entering ? clampUnit(1 - this.entry / ENTRY_TIME) : 1;

    for (const b of beys) {
      const v = this.visuals.get(b.id);
      if (!v) continue;

      if (!b.alive) {
        v.death += dt;
        v.trail.setVisible(false);
        if (v.blur) v.blur.mesh.visible = false;
        if (v.shadow) v.shadow.visible = false;
        this.playDefeat(v, b, dt);
        continue;
      }

      const p = beyWorldPosition(b.pos.x, b.pos.y);
      v.group.position.copy(p);
      // The entry drop. Purely additive on the render position — the sim has
      // the top on the dish the whole time.
      if (drop > 0) v.group.position.y += drop;

      if (v.shadow) {
        // Sits on the dish under the top, flat, tracking position only. The
        // dish rises toward the rim, so the height has to come from the same
        // bowl profile the top itself is placed on.
        v.shadow.visible = true;
        v.shadow.position.set(p.x, p.y + 0.004, p.z);
      }


      // Lean, precessing slowly around the vertical. A top losing spin leans
      // further and wobbles faster — the visual tell that it's about to die.
      const sn = spinNorm(b);

      // Spin about its own axis, at a rate the eye can actually integrate
      // rather than at the sim's. See drawnSpinRate for the sampling argument;
      // the short version is that `b.angle` advances far enough per frame that
      // a six- or eight-bladed layer aliases and appears to stand still.
      v.drawnAngle +=
        drawnSpinRate(sn, b.build.layer.blades) * dt * Math.sign(b.spin || 1);
      v.group.rotation.y = v.drawnAngle;
      v.wobblePhase += dt * (2.5 + (1 - sn) * 9);
      const lean = b.tilt;
      v.group.rotation.x = Math.sin(v.wobblePhase) * lean;
      v.group.rotation.z = Math.cos(v.wobblePhase) * lean;

      // Hand the silhouette to the blur at high spin; at low spin the detail
      // returns at full size and its wobble carries the frame. Shrink rather
      // than hide: the afterimages stay at full radius, so the shrink is what
      // opens the gap between the solid top and its own smear.
      const blurK = v.blur ? v.blur.update(sn * entryK, dt) : 0;
      const detail = 1 - blurK * 0.18;
      v.parts.layer.scale.setScalar(detail);
      v.parts.disc.scale.setScalar(detail);

      if (entering) {
        // Hold the trail off and keep re-seeding it while the top is in the
        // air. Pushed positions include the drop offset, so a live trail would
        // draw a streak hanging out of the sky and then leave it there — the
        // ribbon's fade ramp is fixed-length and cannot outrun it.
        v.trail.setVisible(false);
        v.trail.reset();
      } else {
        v.trail.setVisible(true);
        v.trail.push(p.clone().setY(p.y + 0.05));
        // THE TRAIL IS THE SPEEDOMETER.
        //
        // "the blades shouldn't be travelling at the same speed throughout the
        // game" — and they are not. Measured over ten AI-played rounds, one
        // top's own speed varies by 4.3x inside a single round (p10 0.63, p90
        // 2.99, peak 4.34). The sim was never the problem.
        //
        // The problem was that NOTHING on screen read velocity. Exactly one
        // consumer existed, the full-screen speed lines, and they only start
        // above 2.0 — past the median — so for most of every round the game
        // showed a top drifting and a top charging in identically.
        //
        // The trail is the right carrier: it is already per-top, already
        // coloured by whose it is, and a streak that thickens with speed is the
        // one motion cue that needs no explaining. Scaled against the measured
        // envelope rather than a guess, and floored rather than faded to zero,
        // because a top that is barely moving should still be identifiable.
        v.trail.setOpacity(this.theme.trailOpacity * trailScale(b));
      }

      // THE DRAIN.
      //
      // `stealPulse` is set to 1 by the sim on the frame a top absorbs spin and
      // decays at 3.5/s, exactly like `hitFlash`. It shipped written-but-unread,
      // which meant the game's most distinctive mechanic — a top that is losing
      // and climbing back — had no signal at all beyond a number in the
      // post-round table.
      //
      // Drawn as a stream running from the VICTIM to the ABSORBER, because the
      // direction is the whole point: spin is leaving one top and arriving at
      // the other, and a glow on the winner alone would read as "it got a
      // buff". Tinted with the absorber's own skin so you can see who is
      // feeding. Reuses the directional spark path added for the rail grind, so
      // it costs no new pooled resource.
      const pulse = b.stealPulse ?? 0;
      if (pulse > 0.06 && this.drainCooldown <= 0) {
        const donor = beys.find((o) => o.id !== b.id && o.alive);
        if (donor) {
          const from = beyWorldPosition(donor.pos.x, donor.pos.y);
          from.y += 0.05;
          this.drainDir.copy(p).sub(from);
          const dist = this.drainDir.length();
          if (dist > 1e-4) {
            this.drainDir.multiplyScalar(1 / dist);
            // A tight cone and a count that follows the pulse: a big absorb
            // reads as a torrent, a trickle as a few motes.
            this.sparks.spawn(
              from,
              1.1 + pulse * 1.4,
              Math.round(6 + pulse * 14),
              this.drainDir,
              0.18,
            );
          }
        }
        // Absorbing tops take contact several times a second, and an
        // unthrottled stream strobes exactly the way the impact frames did
        // before their cooldown landed.
        this.drainCooldown = 0.08;
      }

      // The hit ring flares on contact and dims as spin runs out.
      const ring = v.group.userData.ring as THREE.Mesh | undefined;
      if (ring) {
        const mat = ring.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.18 + 0.5 * sn + b.hitFlash * 0.5;
      }

      // The moon on the dish. Sits just above the bowl floor beneath the top,
      // flat regardless of how far the top has leaned.
      v.glow.mesh.position.set(p.x, beyWorldPosition(b.pos.x, b.pos.y).y + 0.004, p.z);
      v.glow.update(sn, b.hitFlash, v.grind);
      // Decays fast: the grind term is re-armed every frame the tops are
      // actually touching, so a slow decay would leave the glow swollen for a
      // second after they part.
      v.grind = Math.max(0, v.grind - dt * 4);

      if (v.aura) {
        v.aura.sprite.visible = this.theme.aura;
        if (this.theme.aura) {
          // Moves and rail rides both count as "winding up", which is when
          // anime draws the aura biggest.
          const boost = (b.moveTime > 0 ? 0.7 : 0) + (b.railTime > 0 ? 0.9 : 0);
          v.aura.update(sn, b.hitFlash, b.stats.radius, boost);
        }
      }

      // hitFlash is already set to 1 on contact and decays in the sim, so the
      // light flare comes free off state that exists.
      if (this.theme.beyLightIntensity > 0) {
        v.light.intensity =
          this.theme.beyLightIntensity * (0.35 + 0.65 * sn) +
          b.hitFlash * this.theme.beyLightFlash;
      }
    }

    // Touchdown. Both tops land on the same frame — that simultaneity is the
    // point, it is the "big collision at the start" the entry exists for.
    if (!this.entryLanded && this.entry <= ENTRY_TIME * (1 - ENTRY_FALL)) {
      this.entryLanded = true;
      for (const b of beys) {
        if (!b.alive) continue;
        const at = beyWorldPosition(b.pos.x, b.pos.y);
        at.y += 0.02;
        // Gated on the theme's own shockwave flag rather than fired blind:
        // that flag is exactly the statement "this theme draws pressure rings",
        // and ARENA says no.
        //
        // 0.5, not the 1.5 this shipped at. This ring fires TWICE — once per
        // top — on the same frame, at the start of literally every round, and
        // at 1.5 the pair swept out to one and a half stadium radii and read
        // as two grey bands wiping across the whole frame. It was the single
        // most visible thing in the restored theme and it was not an effect
        // anyone would recognise as a touchdown. Landing is a small, sharp
        // event; the ring should sit under the top, not cross the arena.
        if (this.theme.shockwave) {
          this.shockwaves.spawn(at, this.theme.shockwaveInk ?? 0xffffff, 0.55, 1, 0.22);
          // Small and dim next to a clash. A landing is two tops touching down
          // on the same frame at the start of EVERY round; at clash weight the
          // pair would white out the opening beat of the match, which is the
          // one moment the reference keeps darkest.
          this.clashPools.spawn(at, this.theme.shockwaveInk ?? 0xffffff, 0.9, 0.5);
        }
        this.sparks.spawn(at, 3.0, 40);
      }
      this.shake = Math.max(this.shake, 0.05);
      this.punch = Math.max(this.punch, 0.5);
    }

    // THE GRIND.
    //
    // These are the contacts the sim refuses to score — 84% of all contact
    // frames, and near enough 100% of them late in a round. They are correctly
    // not clashes: nothing is being damaged, and scoring them would grind out
    // hundreds of hits a round. But they are two blades physically leaning on
    // each other, and until now the game drew nothing for them at all. That
    // silence is most of what "the fight feels dead" was: the tops were in
    // contact for a fifth of the round and it looked like they were apart.
    //
    // Throttled, and driven by SLIP rather than by impact — these have almost
    // no impact by definition, which is exactly why the impact-driven spark
    // path never fired for them. A same-spin lean is the hardest grind in the
    // game and it produces no hit event whatsoever.
    for (const c of contacts) {
      // `grind`, not slipNorm: see `abrasion` in the sim. Measured on real
      // leaning contacts, slipNorm peaks at 0.018 for an opposite-spin pair —
      // under any sane floor — because the idealised formula treats a bladed
      // layer as a smooth disc and counter-rotating discs roll. Blades do not.
      const k = c.grind;

      // The ground glow swells on EVERY leaning contact, ungated and
      // unthrottled, before either of the spark gates below. It is one lerp on
      // a material, and it is the half of this effect that survives the battle
      // camera: at that distance a top is about 60px across and a particle is
      // a pixel, while a disc of light on the floor under it is unmissable.
      const va = this.visuals.get(c.a);
      const vb = this.visuals.get(c.b);
      if (va) va.grind = Math.max(va.grind, k);
      if (vb) vb.grind = Math.max(vb.grind, k);

      // Sparks are the expensive half, so they are both throttled and floored.
      if (this.grindCooldown > 0) continue;
      if (k < 0.12) continue;
      const a = this.lastBeys.find((x) => x.id === c.a);
      const b = this.lastBeys.find((x) => x.id === c.b);
      if (!a || !b) continue;
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      const sign = c.slip < 0 ? -1 : 1;
      this.grindDir.set((-dy / d) * sign, 0, (dx / d) * sign);
      const at = beyWorldPosition(c.at.x, c.at.y);
      at.y += 0.045;
      // Deliberately thinner than a clash grind: this is a continuous stream,
      // so per-event counts that look right for a one-off read as a flare.
      this.sparks.spawn(at, 0.4 + k * 1.8, Math.round(2 + k * 7), this.grindDir, 0.5, true);
      this.grindCooldown = 0.045;
    }

    for (const h of hits) {
      const at = beyWorldPosition(h.at.x, h.at.y);
      at.y += 0.06;
      // The spark count was 24 or 40, chosen purely by spin parity — so a
      // finisher and a glancing tap threw an identical shower and the whole
      // damage range the sim produces was invisible. Strength drives it now:
      // 12 + 14*strength, so a 0.4 nudge gets ~18, a hitstop-grade hit (1.6)
      // gets ~34, an impact-frame hit (2.6) ~48, and a 5+ opposite-spin crit
      // hits the 72 cap. The opposite-spin bonus survives as a multiplier
      // because blades biting the wrong way genuinely do throw more.
      const count = Math.min(
        72,
        Math.round((12 + h.strength * 14) * (h.opposite ? 1.25 : 1)),
      );
      this.sparks.spawn(at, h.strength, count);
      this.grindSparks(h, at);
      this.shake = Math.min(0.09, this.shake + h.strength * 0.016);
      this.punch = Math.min(1, this.punch + h.strength * 0.14);
      if (this.theme.shockwave && h.strength >= C.HITSTOP_THRESHOLD) {
        // Ring size scales with the hit too. The ring always expands over a
        // fixed 0.34s (shockwave.ts), so a bigger span is also a FASTER wave —
        // size and speed come off the one number, which is what makes a heavy
        // ring feel like more pressure instead of just a wider circle.
        //
        // THE CAP IS THE STADIUM, not a taste value. shockwave.ts scales the
        // unit ring to `0.05 + eased * span` against STADIUM_RADIUS 1.0 and a
        // skirt that ends at 1.5, so a span past ~1.55 spends most of its life
        // as a grey band expanding through empty air outside the bowl — and
        // with the camera orbiting at 1.62–2.19 it sweeps out past and under
        // the lens. Seen in the browser at the first attempt's 2.95: two huge
        // arcs across the whole frame that read as fog, not as impact.
        // THE SCALE HERE WAS FOUND BY BISECTION IN THE BROWSER, not by taste,
        // because three plausible suspects looked identical on screen. The
        // first attempt spanned 2.95 and drew two grey bands across the whole
        // frame; suspecting the new ribbon trail, I zeroed trailOpacity and
        // the bands were still there; disabling `shockwave` on the theme
        // removed them. So the ring was always the culprit, and the reason is
        // arithmetic rather than tuning: a ring centred on the clash and
        // expanding to radius 1.0 has, by definition, swept the entire
        // stadium, and something covering the whole arena reads as weather,
        // not as an impact.
        //
        // The span went back UP once the ring became a real wavefront. The
        // 0.42 cap was a correct fix for the WRONG defect: at that size, with
        // the old hard-edged annulus born at a point and brightest at birth,
        // there was no travel long enough to read as a wave and every hit was
        // a white ball. A soft front that fades up as it forms can afford to
        // cross real ground. Now: 0.50 at the hitstop bar, 0.60 at the
        // impact-frame bar, 0.82 at the cap — still inside the 1.0 stadium
        // radius, so it dies at the wall rather than sailing over it.
        const span = Math.min(0.82, 0.34 + h.strength * 0.1) + (h.crit ? 0.1 : 0);
        // A perfect block is the DEFENDER's moment, so it gets the defender's
        // colour and a second inner ring travelling the other way in size. The
        // sim has computed perfectBlock since the move triangle landed and
        // nothing has ever drawn it: the one exchange that rewards reading the
        // opponent looked exactly like a lucky bump.
        // In an ink theme the ring is a DRAWN line and takes one colour; the
        // white/pale palette below only makes sense as additive light on a dark
        // floor, and on a near-white dish it is invisible whatever the hit was.
        // The perfect-block and crit distinctions survive in the second ring
        // and the size, which read on any background.
        const colour =
          this.theme.shockwaveInk ??
          (h.perfectBlock ? 0x7dd3fc : h.crit ? 0xfff0a0 : 0xffffff);
        // Two fronts on an ordinary clash, three on a crit. One expanding
        // circle reads as a bubble; a train reads as waves radiating out.
        // 0.26 peak, not 0.6. Additive white on a bloomed scene saturates almost
        // immediately, and two overlapping fronts double it — the two-front
        // train is what makes this read as waves, so the per-front brightness
        // has to come down to pay for it.
        this.shockwaves.spawn(at, colour, span, h.crit ? 3 : 2, 0.26);
        if (h.perfectBlock) this.shockwaves.spawn(at, colour, span * 0.62, 2, 0.24);
        // The white disk under the tops — the thing the reference frame is
        // actually of, and the thing the ring above is not. See clashPool.ts.
        //
        // Sized in the SAME currency as the ring but roughly double it, because
        // a pool and a front of equal width read as very different sizes: the
        // ring's texture puts its light at 96% of its radius, the pool's puts
        // the bright core inside 30%. Matching their spans would have produced
        // a flash a third the width of the wave that left it.
        //
        // 1.5 at the hitstop bar, 1.9 at the impact-frame bar, 2.2 at the cap.
        // The dish clips it, so the number that matters is how far the spill
        // reaches across the basin, not the plane's width.
        const poolSpan = Math.min(2.2, 0.95 + h.strength * 0.34) + (h.crit ? 0.25 : 0);
        this.clashPools.spawn(at, colour, poolSpan, h.crit ? 1 : 0.86);
      }
      // The manga cut, centred on where the clash actually happened. Same
      // threshold as hitstop: the sim freezes for a beat and this is the frame
      // it freezes on. Camera matrices are one frame stale here, which is
      // invisible at these speeds.
      // RESERVED FOR THE MOMENTS THAT DESERVE ONE.
      //
      // This gate has now been tightened twice off the same report, and the
      // second time it was not a frequency problem: 审美疲劳, aesthetic
      // fatigue — a strong full-screen device stops landing when it is the
      // ordinary case. Cutting the rate again would have kept the same
      // trajectory, so the rule changed shape instead.
      //
      // A frame is no longer earned by being HARD. `IMPACT_FRAME_THRESHOLD`
      // caught ordinary heavy trades, and heavy trades are most of a round — a
      // manga cut for the median exchange is a manga cut for nothing. Now only
      // a crit or a perfect block earns one: both are genuinely rare, both are
      // moments the player did something, and neither happens twice in a row by
      // accident. Measured before: 1.5 frames a round. Expect well under one.
      //
      // A perfect block still bypasses the refractory window. It is the rarest
      // thing in the move triangle — contact has to land inside the opening
      // beat of a block thrown on the read — so it cannot strobe, and being cut
      // out by a window an ordinary trade opened a moment earlier is precisely
      // backwards.
      const frameWorthy = h.crit;
      const framed = h.perfectBlock || (frameWorthy && this.frameCooldown <= 0);
      if (this.theme.toon && this.impactFrames && framed) {
        this.frameCooldown = C.IMPACT_FRAME_COOLDOWN;
        this.projected.copy(at).project(this.camera);
        // Design primaries feed the clash-tone frame style; the sim only
        // carries ids, and BeyDesign colours are numeric, hence the lookup
        // and hex conversion here.
        const beyA = this.lastBeys.find((b) => b.id === h.a);
        const beyB = this.lastBeys.find((b) => b.id === h.b);
        const cssHex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
        this.impactFrame.trigger(
          (this.projected.x * 0.5 + 0.5) * 100,
          (0.5 - this.projected.y * 0.5) * 100,
          {
            strength: h.strength,
            crit: h.crit,
            colourA: cssHex(
              beyA ? designByLayer(beyA.build.layer.id).primary : 0xffffff,
            ),
            colourB: cssHex(
              beyB ? designByLayer(beyB.build.layer.id).primary : 0xffffff,
            ),
          },
        );
      }
    }

    // Riding the rail needs to be *visible*, not just felt. Sparks stream off
    // the contact point and the rail itself flares while anyone is locked in —
    // without this the slingshot arrives with no explanation.
    if (this.rail && this.rail.group.visible) {
      const riders = beys.filter((b) => b.alive && b.railTime > 0);
      this.railSparkClock += dt;
      // 0.012s x 14, up from 0.035s x 5. The hook was firing all along — 94% of
      // rounds engage the rail inside 0.25s — but 143 particles/second of
      // isotropic puff at the top's centre is a wisp of smoke, not a grind.
      // ~1170/s off the contact edge in a directional cone is a weld.
      if (riders.length && this.railSparkClock > 0.012) {
        this.railSparkClock = 0;
        for (const b of riders) {
          // Spawn at the CONTACT EDGE. Taken as the top's own outer edge rather
          // than from the rail's radius: they coincide while a top is locked
          // in, and this stays correct for a top still drifting inside the
          // engage band, with no need to plumb the rail spec through.
          const r = Math.hypot(b.pos.x, b.pos.y) || 1;
          const at = beyWorldPosition(
            b.pos.x + (b.pos.x / r) * b.stats.radius,
            b.pos.y + (b.pos.y / r) * b.stats.radius,
          );
          at.y += 0.02;
          // Trailing BACKWARD along -velocity in a narrow cone. Sim (x, y) is
          // world (x, z). Grinding metal throws a stream behind the contact;
          // the isotropic burst this used to spawn read as the top steaming.
          this.railStream.set(-b.vel.x, 0, -b.vel.y);
          this.sparks.spawn(at, 1.8, 14, this.railStream, 0.28);
        }
      }
      // 1.05 now the resting value is 0.78 rather than 0.4 — see rail.ts, where
      // the base had to come back up for the teeth to fuse into a band. The
      // ridden total stays where it was, a little under 1.9.
      //
      // The original was 2.6, and the reason it came down is how OFTEN this is
      // on rather than how bright it is. 94% of rounds engage the rail inside the first
      // quarter-second and X-Rail keeps a top locked on for long stretches, so
      // "riding" is close to the resting state of that arena — a flare tuned
      // as a rare event was in practice the arena's normal brightness, and at
      // 0.4 + 2.6 that normal was a solid wall of fire with the teeth blown
      // out. 0.4 -> 1.8 still reads clearly as the rail catching someone,
      // while leaving the band gold instead of white.
      const flare = riders.length > 0 ? 1.05 : 0;
      const mat = this.rail.material;
      mat.emissiveIntensity +=
        (this.rail.baseEmissive + flare - mat.emissiveIntensity) *
        Math.min(1, dt * 9);

      // The travelling highlight rides the actual bearing of whoever is locked
      // on, so the rail visibly carries the top around rather than merely
      // glowing while it happens.
      this.railAngles.length = 0;
      for (const b of riders) this.railAngles.push(Math.atan2(b.pos.y, b.pos.x));
      this.rail.update(dt, this.elapsed, this.railAngles);
    }

    // The pit only announces itself while it is actually taking spin: the
    // drain needs unbroken dwell to ramp, so a hazard that pulsed constantly
    // would teach the wrong rule. Driven off pitTime rather than mere
    // presence, which is the same quantity the physics charges on.
    if (this.pit && this.pit.group.visible) {
      const worst = beys.reduce(
        (m, b) => (b.alive ? Math.max(m, b.pitTime) : m),
        0,
      );
      const bite = clampUnit(worst / 1.8);
      const target = 0.45 + bite * 0.5 + (bite > 0 ? Math.sin(this.elapsed * 9) * 0.12 * bite : 0);
      const mat = this.pit.ringMaterial;
      mat.opacity += (target - mat.opacity) * Math.min(1, dt * 8);
    }

    // Crush the fill for a beat on the decisive blow, then ease it back.
    if (this.blackout > 0) {
      this.blackout = Math.max(0, this.blackout - dt);
      const k = this.blackout / 0.55;
      // Dim, don't extinguish. Taking ambient to near zero while a top is
      // flaring left nothing for the eye to read the scene against, so the
      // frame became one bright smear instead of two lit tops in the dark.
      this.hemi.intensity = this.theme.hemiIntensity * (1 - 0.55 * k);
      this.key.intensity = this.theme.keyIntensity * (1 - 0.5 * k);
    }

    this.sparks.update(dt);
    this.shockwaves.update(dt);
    this.clashPools.update(dt);
    this.updateCamera(beys, dt);

    this.present();
  }

  /**
   * Draw the scene once, through whichever path this theme uses.
   *
   * Extracted from `update` so `snapshot` can force a frame without
   * duplicating the dispatch. Splitting it is also what makes the invariant
   * below checkable in one place rather than trusted at two call sites.
   */
  private present(): void {
    // Exactly one render path per frame, and toon wins the tie by construction.
    // OutlineEffect and EffectComposer must never both run: the outline pass
    // renders the scene TWICE straight to the canvas, so following it with a
    // composer render would draw a third, un-outlined image over the top, and
    // preceding it would throw the composer's work away. The if/else chain is
    // the guarantee — no theme is expected to set both flags, but a theme that
    // did would still render exactly once.
    if (this.theme.toon) {
      if (!this.outline) {
        // Thick and near-black. Thin outlines read as anti-aliasing artefacts;
        // the reference art uses a line heavy enough to be a design element in
        // its own right, and that boldness is most of the cartoon signal.
        this.outline = new OutlineEffect(this.renderer, {
          defaultThickness: 0.014,
          defaultColor: [0.02, 0.02, 0.05],
          defaultAlpha: 1,
        });
      }
      // Not `outline.render()`: that is these same two passes back to back, and
      // the ink pass has to run against the welded normals rather than the
      // shading ones or the hull tears itself apart on every hard edge in the
      // scene. See outlineHull.ts — this is still exactly one render path.
      renderInked(this.renderer, this.outline, this.scene, this.camera);
    } else if (this.theme.postBloom && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * The camera.
   *
   * This is the only write point for camera position in the whole renderer and
   * nothing in the scene is baked to it, which makes it the cheapest place in
   * the codebase to buy presence. It used to be a tripod: a slow orbit of the
   * world origin, staring at a fixed point in the middle of an empty bowl,
   * plus uncorrelated per-axis position jitter on contact. Four changes:
   *
   *   - it FRAMES THE FIGHT, easing the look-at toward the midpoint of the live
   *     tops instead of at the furniture;
   *   - a heavy clash punches the radius in and kicks the lens;
   *   - the shake is a decaying ROLL about the view axis, not a positional
   *     jitter — see below;
   *   - the eye height is derived from the pull-back distance rather than
   *     constant, to hold a hard floor on elevation.
   *
   * Everything is exponentially eased at a per-second rate, so it is
   * frame-rate independent and nothing snaps.
   */
  private updateCamera(beys: BeyState[], dt: number): void {
    this.cameraAngle += dt * 0.09;

    // FRAME WHAT IS STILL ON SCREEN, not what is still in play.
    //
    // This filtered on `b.alive`, so the instant a top was knocked out the
    // framing set dropped to the survivor alone: the focus snapped to it, and
    // `spread` collapsed to 0 which pushed the camera IN. The knockout — a top
    // arcing over the rim, which is the most dramatic thing that happens in a
    // round — played out at the edge of the frame and partly outside it.
    // Filmstripped with `__moment('ringout')` and it is unmistakable: three
    // frames of the winner glowing while the loser leaves off-camera.
    //
    // A defeated top's visual stays visible for the length of its exit (0.34s
    // of burst scatter, or an arc that ends when it drops below y = -1.2), and
    // `group.visible` is the renderer's own record of that. Framing on it means
    // the camera holds both tops for exactly as long as there are two to hold,
    // with no new timer to keep in sync with the animations.
    // FRAME WHERE THE TOP IS DRAWN, not where the sim last had it.
    //
    // The paragraph above got the framing SET right and the framing POSITIONS
    // wrong, which is a subtle enough combination that the fix looked complete.
    // A knocked-out top's `b.pos` is frozen at the moment it crossed
    // EXIT_RADIUS — the sim has stopped touching it — while its VISUAL keeps
    // going, on the ballistic arc in `playDefeat`, out past the rim and up. So
    // the camera dutifully held a point the top had already left, and the arc
    // still flew out of frame; filmstripped with `__moment('ringout')`, the
    // top is near the top edge by +8f and gone entirely by +20f.
    //
    // Reading the visual's own position instead means the camera tracks the
    // arc and, because `spread` is computed from the same set, widens to keep
    // both the winner and the departing loser in shot. `beyWorldPosition` maps
    // sim (x, y) to world (x, height, z) one-to-one, so the visual's x/z drop
    // straight back into the sim-space framing maths with no conversion.
    const framed: { x: number; y: number }[] = [];
    for (const b of beys) {
      const v = this.visuals.get(b.id);
      if (b.alive) {
        framed.push({ x: b.pos.x, y: b.pos.y });
      } else if (v?.group.visible) {
        framed.push({ x: v.group.position.x, y: v.group.position.z });
      }
    }
    const alive = framed;

    // ---------------------------------------------------------- framing ----
    // Damped to 0.55 of the way out to the midpoint rather than tracking it
    // 1:1, for two reasons. Two tops orbiting to opposite sides put the
    // midpoint back at the centre anyway, so the last 45% buys almost nothing;
    // and the impact-frame projection in update() reads a camera that is one
    // frame stale, so a fast pan lands the manga cut visibly off the clash.
    // 0.55 with a 3.5/s ease holds the worst-case pan near 0.3 degrees/frame at
    // 60fps, comfortably inside what the 22–78% clamp in impactFrame.ts
    // absorbs.
    let mx = 0;
    let my = 0;
    for (const p of alive) {
      mx += p.x;
      my += p.y;
    }
    if (alive.length) {
      mx /= alive.length;
      my /= alive.length;
    }
    const mid = beyWorldPosition(mx, my);
    this.focusTarget.set(mid.x * 0.55, mid.y + 0.05, mid.z * 0.55);
    this.focus.lerp(this.focusTarget, 1 - Math.exp(-dt * 3.5));

    // Pull back when the tops are far apart.
    let spread = 0;
    for (let i = 0; i < alive.length; i++) {
      for (let k = i + 1; k < alive.length; k++) {
        spread = Math.max(
          spread,
          Math.hypot(alive[i].x - alive[k].x, alive[i].y - alive[k].y),
        );
      }
    }
    // Pull back on narrow viewports. `fov` is the *vertical* field of view, so
    // a portrait window has a much smaller horizontal one — without this the
    // tops slide off the sides of the screen exactly when they separate.
    const aspect = this.camera.aspect || 1;
    // The 0.62 floor, not 0.5. The compensation itself is exact — it keeps the
    // same horizontal world-extent visible as a 1.6-aspect desktop — but a
    // phone does not need a desktop's extent. At 375x812 the old floor pulled
    // the camera back 3.2x and the stadium became a small object adrift in a
    // tall empty frame. 0.62 gives 2.58x: measurably closer, with the tops
    // still inside the frame at the rim, which is the property the pullback
    // exists to protect.
    const narrow = aspect < 1.6 ? 1.6 / Math.max(aspect, 0.62) : 1;

    // ------------------------------------------------------------ punch ----
    // Decays over ~0.4s from a full hit. Accumulated in the hits loop, and by
    // finish() and the entry touchdown.
    this.punch = Math.max(0, this.punch - dt * 2.4);
    const punch = clampUnit(this.punch);

    const targetDist = (1.62 + spread * 0.34) * narrow * (1 - punch * 0.12);
    this.camRadius += (targetDist - this.camRadius) * (1 - Math.exp(-dt * 2.2));

    // Lens kick: 42 down to ~38.4 at full punch, eased at 9/s. Deliberately
    // small. A big fov swing on every clash is nauseating, and it also
    // re-projects the impact frame — at this rate the fov moves under 0.4
    // degrees in a 16ms frame, which the stale-projection clamp swallows.
    const targetFov = this.baseFov - punch * 3.6;
    const fov =
      this.camera.fov + (targetFov - this.camera.fov) * (1 - Math.exp(-dt * 9));
    if (Math.abs(fov - this.camera.fov) > 1e-4) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    // -------------------------------------------------------- elevation ----
    // HARD FLOOR, and the reason the height is no longer the constant 1.16.
    // spinBlur's viewFade (spinBlur.ts:363) is at full strength only above
    // sin(elevation) >= 0.44, about 26 degrees, and falls away to 0.32 by 6
    // degrees — so a camera that sinks toward the rim silently guts the anime
    // motion read to a third and gives no sign it has done so. tan(26 deg) is
    // 0.488; 0.5 taken against (radius + 0.45) rather than radius alone keeps
    // even the far top — up to about a unit beyond the focus — above ~24
    // degrees when the shot is at its widest.
    const bob = Math.sin(this.elapsed * 0.35) * 0.08;
    const height = Math.max(
      1.16 + bob,
      this.focus.y + (this.camRadius + 0.45) * 0.5,
    );

    this.camera.position.set(
      this.focus.x + Math.sin(this.cameraAngle) * this.camRadius,
      height,
      this.focus.z + Math.cos(this.cameraAngle) * this.camRadius,
    );
    this.camera.lookAt(this.focus);

    // ------------------------------------------------------------ shake ----
    // Rotational, about the view axis, applied after lookAt so it is in view
    // space. The old version offset the camera POSITION on all three axes by
    // independent random values every frame, which is indistinguishable from a
    // dropped frame — the whole image steps sideways and back with no
    // continuity between frames, and it reads as a glitch rather than as
    // force. Rolling the camera keeps the subject pinned where the eye already
    // is and moves the horizon instead, which is what a physical operator
    // absorbing a shock actually does. Two incommensurate frequencies so
    // consecutive hits cannot beat into a regular oscillation.
    // At the 0.09 shake ceiling this is ~4.6 degrees of roll and ~1.8 of
    // pitch, decaying to nothing in 0.4s.
    this.shake = Math.max(0, this.shake - dt * 0.22);
    if (this.shake > 1e-4) {
      this.camera.rotateZ(Math.sin(this.elapsed * 47) * this.shake * 0.9);
      this.camera.rotateX(Math.sin(this.elapsed * 31 + 1.7) * this.shake * 0.35);
    }
  }

  /**
   * The three ways a round ends, drawn as three different things.
   *
   * The sim has always said which one happened — `BeyState.defeat`, set in
   * battle.ts — and the renderer has always ignored it. Burst, ring-out and
   * spin-finish all sank through the floor identically, so the signature moment
   * of the entire franchise (the top coming APART) had no picture at all and
   * looked the same as running out of spin.
   *
   * THE BUDGET IS 0.40 SECONDS, not the 1.15 of FINISH_HOLD_TIME. Game.tick
   * feeds the renderer `dt * FINISH_RENDER_SCALE` for the whole hold (that
   * slow-motion is what sells the finish), so 1.15s of wall clock delivers
   * 1.15 * 0.35 = 0.40s of render time here before the result panel covers the
   * stadium. `t` below is render time and is therefore measured against that,
   * not against the wall clock. Getting this wrong is invisible in code review
   * and obvious on screen: the animation is simply cut off mid-way.
   *
   * Measured against the 0.40s budget: the burst scatter completes at 0.34,
   * the knockout arc leaves the frame at 0.40, the topple settles at 0.36.
   */
  private playDefeat(v: BeyVisual, b: BeyState, dt: number): void {
    const t = v.death;

    if (b.defeat === 'burst') {
      // The layer, disc and driver are ALREADY separate sub-groups (v.parts,
      // built by beyMesh), so the top can literally come apart — no extra
      // geometry, and the pieces that fly are the pieces the player chose.
      if (!v.defeatOpened) {
        v.defeatOpened = true;
        const at = v.group.position.clone();
        at.y += 0.06;
        // White, and larger than any clash ring can be, so a burst can never
        // be mistaken for one more heavy hit. That is an invariant, not a
        // wish: the clash span above caps at 1.55 + 0.12 on a crit = 1.67, so
        // this must stay strictly above the clash cap of 0.82 + 0.1 = 0.92 —
        // and it still has to die near the skirt rather than sail off into
        // empty air, which is why it is a hair over rather than double. TWO rings a beat apart carry the extra
        // weight instead of one huge one.
        //
        // PEAK 0.22, NOT 0.34, and the span is deliberately left alone. Three
        // fronts at 0.34 of additive white overlap near the centre at better
        // than 1.0 and saturate, which a bloom pass then spreads — filmstripped
        // with `__moment('burst')`, frame zero was a white rectangle with no
        // arena visible in it at all. The reference for this theme keeps the
        // dish readable through its burst.
        //
        // Lowering the SPAN would have been the wrong fix twice over: it is
        // load-bearing for the invariant above, and the ring travelling far is
        // what makes a burst feel bigger than a clash. Three fronts that do not
        // stack to white carry the same weight and leave the arena visible.
        if (this.theme.shockwave) {
          this.shockwaves.spawn(at, this.theme.shockwaveInk ?? 0xffffff, 1.05, 3, 0.22);
          // The biggest pool in the game, and the only one allowed to be. A
          // burst ends the round, so there is no following frame for it to
          // wash out — the invariant the ring has to protect (keep the dish
          // readable through a burst) is about the SUSTAINED bands, not a
          // quarter-second flash.
          this.clashPools.spawn(at, this.theme.shockwaveInk ?? 0xffffff, 2.6, 1);
        }
        this.sparks.spawn(at, 4.5, 64);
        // Only in themes that already light the arena from the tops. ARENA
        // holds beyLightIntensity at 0 and must not grow a light source it has
        // never had.
        if (this.theme.beyLightIntensity > 0) {
          v.light.color.setHex(0xffffff);
          v.light.intensity = Math.max(v.light.intensity, 9);
        }
        this.shake = Math.max(this.shake, 0.085);
      }
      // Ease-out: the pieces leave hard and then coast, which is what makes it
      // read as something breaking rather than something being thrown.
      const k = clampUnit(t / 0.34);
      const eased = 1 - (1 - k) * (1 - k);
      const parts = [v.parts.layer, v.parts.disc, v.parts.driver];
      for (let i = 0; i < parts.length; i++) {
        // Fanned off the top's own wobble phase, so the three pieces separate
        // instead of overlapping and the fan differs per top for free.
        const a = v.wobblePhase + i * 2.4;
        const reach = 0.3 + i * 0.06;
        // Gravity is deliberately weak — 0.16 against a launch of 0.30..0.18.
        //
        // The first attempt used 0.55, which is roughly physical and completely
        // wrong here. The group's origin is the DRIVER TIP (beyMesh.ts:32), so
        // the three parts sit at local y of only ~0.19 / 0.15 / 0.07; a 0.55
        // fall term puts the driver under the dish 25% into the animation and
        // the disc at 43%, and the floor lathe is opaque and depth-writing, so
        // most of the burst played out invisibly beneath it — the exact defect
        // this animation was written to replace. At 0.16 every piece ends the
        // 0.34s window ABOVE where it started (+0.14 / +0.08 / +0.02), which is
        // also the right read: a burst throws the layer up and out, it does not
        // drop it.
        parts[i].position.set(
          Math.cos(a) * reach * eased,
          (0.3 - i * 0.06) * eased - 0.16 * eased * eased,
          Math.sin(a) * reach * eased,
        );
        parts[i].rotation.x += dt * (7 + i * 3);
        parts[i].rotation.z += dt * (5 - i * 2);
        parts[i].scale.setScalar(1);
      }
      // The flash fades faster than the parts fly, so the pieces are readable
      // against the dark rather than silhouetted in their own glare.
      v.light.intensity *= Math.exp(-dt * 6);
      if (v.aura) {
        v.aura.sprite.visible = this.theme.aura && k < 1;
        if (v.aura.sprite.visible) v.aura.update(0.2, 1 - k, b.stats.radius, 1.4);
      }
      if (k >= 1) v.group.visible = false;
      return;
    }

    if (b.defeat === 'knockout') {
      // Ringed out: it went through a pocket, so it leaves the way it was
      // travelling — a ballistic arc over the rim, not a sink through the
      // floor. The sim's final position is already past EXIT_RADIUS, so the
      // outward radial IS the exit bearing and needs nothing else to derive.
      if (!v.defeatOpened) {
        v.defeatOpened = true;
        v.exit.copy(v.group.position).setY(0);
        if (v.exit.lengthSq() < 1e-8) v.exit.set(1, 0, 0);
        v.exit.normalize();
      }
      v.group.position.x += v.exit.x * 2.6 * dt;
      v.group.position.z += v.exit.z * 2.6 * dt;
      // Up at 2.2/s against 26/s^2 of gravity: peaks 0.09 above the rim at
      // 0.085s, crosses back down at 0.17s, and passes the -1.2 cut-off at
      // 0.40s — exactly the render-time budget. Steep on purpose: it has to be
      // a whole arc inside 0.4s, and a lazy lob would still be hanging in
      // frame when the result panel arrives.
      v.group.position.y += (2.2 - t * 26) * dt;
      v.group.rotation.z += dt * 14;
      v.group.rotation.x += dt * 6;
      if (v.aura) v.aura.sprite.visible = false;
      if (v.group.position.y < -1.2) v.group.visible = false;
      return;
    }

    // spin-finish, and any defeat the sim left unset: out of spin, not out of
    // the arena. It stays on the dish, the precession races as the last of the
    // spin goes, then the lean opens all the way over and it lies down. The
    // wobble rate is driven to zero by the same curve that lays it flat, so it
    // topples and STOPS rather than lolling on its side forever.
    const k = clampUnit(t / 0.36);
    const eased = k * k;
    const lean = b.tilt + (Math.PI / 2 - b.tilt) * eased;
    v.wobblePhase += dt * 14 * (1 - eased);
    v.group.rotation.x = Math.sin(v.wobblePhase) * lean;
    v.group.rotation.z = Math.cos(v.wobblePhase) * lean;
    v.group.rotation.y += dt * 5 * (1 - eased);
    if (v.aura) v.aura.sprite.visible = false;
  }

  /**
   * How fast the action currently feels, 0–1, for the DOM overlay to drive
   * speed lines from. Reading it from the renderer keeps the UI ignorant of
   * physics units.
   */
  intensity(beys: BeyState[]): number {
    if (!this.theme.speedLines) return 0;
    let fastest = 0;
    let boosted = false;
    for (const b of beys) {
      if (!b.alive) continue;
      fastest = Math.max(fastest, Math.hypot(b.vel.x, b.vel.y));
      if (b.moveTime > 0 || b.railTime > 0) boosted = true;
    }
    // Capped below 1: at full opacity the streaks fought the tops for
    // attention instead of framing them.
    const speedPart = clampUnit((fastest - 2.0) / 2.6);
    return clampUnit(speedPart * 0.42 + (boosted ? 0.18 : 0));
  }

  /** True when this theme wants a full-screen pulse on heavy contact. */
  get wantsImpactFlash(): boolean {
    // Toon replaces the soft screen pulse with the manga impact frame — a cut
    // and a fade on the same hit undercut each other.
    return this.theme.impactFlash && !this.theme.toon;
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
  }
}
