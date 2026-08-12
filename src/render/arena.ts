import * as THREE from 'three';
import * as C from '../sim/constants';
import { spinNorm } from '../sim/physics';
import type { HitEvent } from '../sim/physics';
import type { BeyState } from '../sim/types';
import { buildBeyMesh } from './beyMesh';
import type { BeyParts } from './beyMesh';
import { RibbonTrail, SparkBurst, Trail } from './effects';
import type { TrailLike } from './effects';
import { buildSpinBlur } from './spinBlur';
import type { SpinBlur } from './spinBlur';
import { ImpactFrame } from './impactFrame';
import { skinById } from './skins';
import type { Skin } from './skins';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { applyStadiumTheme, beyWorldPosition, buildStadium } from './stadium';
import type { StadiumHandles } from './stadium';
import { ARENA, THEMES, themeById } from './theme';
import type { Theme } from './theme';
import { Shockwave } from './shockwave';
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

interface BeyVisual {
  group: THREE.Group;
  trail: TrailLike;
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
   * Drawn contact shadow, used by the toon theme.
   *
   * Kept as a sibling of the top rather than a child of it: the group leans and
   * precesses for wobble, and a parented shadow would tip up off the floor with
   * it. This one stays flat on the dish and only follows the position.
   */
  shadow: THREE.Mesh | null;
  /** Free-running precession phase, so wobble doesn't look mechanical. */
  wobblePhase: number;
}

/**
 * Draws the battle. Owns no game state: every frame it is handed the current
 * sim state and mirrors it. Spin, lean and wobble are *visual* consequences of
 * the sim's scalar spin value rather than separately simulated, which is what
 * keeps the physics stable while still looking like a real spinning top.
 */
const clampUnit = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

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
  private readonly impactFrame = new ImpactFrame();
  /** Scratch for projecting hit points to the screen; no per-hit allocation. */
  private readonly projected = new THREE.Vector3();
  private readonly visuals = new Map<string, BeyVisual>();
  private readonly beyRoot = new THREE.Group();

  private shake = 0;
  private cameraAngle = 0;
  private elapsed = 0;

  private readonly canvas: HTMLCanvasElement;

  private theme: Theme = ARENA;
  private stadium!: StadiumHandles;
  private hemi!: THREE.HemisphereLight;
  private key!: THREE.DirectionalLight;
  private rimA!: THREE.PointLight;
  private rimB!: THREE.PointLight;
  private readonly shockwaves = new Shockwave();
  private composer: EffectComposer | null = null;
  /**
   * Inverted-hull outline pass. Created lazily on first toon use and then kept:
   * it wraps the renderer rather than owning a render target, so leaving it
   * allocated costs nothing when unused.
   */
  private outline: OutlineEffect | null = null;
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

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
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

    this.hemi.color.setHex(t.hemiSky);
    this.hemi.groundColor.setHex(t.hemiGround);
    this.hemi.intensity = t.hemiIntensity;
    this.key.intensity = t.keyIntensity;
    this.rimA.color.setHex(t.rimAColour);
    this.rimA.intensity = t.rimAIntensity;
    this.rimB.color.setHex(t.rimBColour);
    this.rimB.intensity = t.rimBIntensity;

    this.sparks.setStyle(t.sparkColour, t.sparkSize);
    for (const v of this.visuals.values()) {
      v.trail.setOpacity(t.trailOpacity);
      v.light.intensity = t.beyLightIntensity;
      if (v.aura) v.aura.sprite.visible = t.aura;
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

  private ensureComposer(): void {
    if (this.composer) return;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.9, 0.55, 0.62);
    this.composer.addPass(this.bloom);
    this.composer.setSize(w, h);
  }

  /**
   * Show or hide the arena's rail. Built once on first use and then toggled —
   * a round can start in either arena and rebuilding each time would leak.
   */
  setArena(arena: ArenaSpec): void {
    if (arena.rail && !this.rail) {
      this.rail = buildRail(arena.rail.radius);
      this.scene.add(this.rail.group);
    }
    if (this.rail) this.rail.group.visible = !!arena.rail;

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
    for (const v of this.visuals.values()) {
      this.beyRoot.remove(v.group);
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
      const trail: TrailLike = this.theme.toon
        ? new RibbonTrail(skin.primary, b.stats.radius)
        : new Trail(skin.primary);
      trail.setOpacity(this.theme.trailOpacity);

      // Toon only: motion is drawn, not simulated — at high spin the blur is
      // the top, and the detailed mesh shrinks slightly underneath it. The blur
      // reads the layer group because its afterimages are copies of that exact
      // silhouette, sharing its geometry.
      const design = designByLayer(b.build.layer.id);
      const parts = group.userData.parts as BeyParts;
      const blur = this.theme.toon
        ? buildSpinBlur(design, b.stats.radius, parts.layer, b.build.layer.blades)
        : null;
      if (blur) group.add(blur.mesh);

      // Parented to the group, so it tracks the top for free.
      const light = new THREE.PointLight(skin.primary, this.theme.beyLightIntensity, 1.6);
      light.position.y = 0.1;
      group.add(light);

      // Parented to the top so it tracks for free. Built regardless of theme
      // and simply hidden, so a mid-match theme switch needs no rebuild.
      const aura = buildAura(skin.primary);
      aura.sprite.position.y = 0.12;
      aura.sprite.visible = this.theme.aura;
      group.add(aura.sprite);

      const shadow = this.theme.toon ? contactShadow(b.stats.radius) : null;
      if (shadow) this.beyRoot.add(shadow);

      this.beyRoot.add(group);
      this.beyRoot.add(trail.object);
      this.visuals.set(b.id, {
        group,
        trail,
        blur,
        parts,
        light,
        aura,
        shadow,
        wobblePhase: Math.random() * Math.PI * 2,
      });
    }
  }

  /** Mirror one frame of sim state. `dt` is real elapsed seconds. */
  update(beys: BeyState[], hits: HitEvent[], dt: number): void {
    this.elapsed += dt;

    for (const b of beys) {
      const v = this.visuals.get(b.id);
      if (!v) continue;

      if (!b.alive) {
        // Knocked-out tops drop away and stop trailing.
        v.group.position.y -= dt * 1.6;
        v.group.rotation.z += dt * 4;
        v.trail.setVisible(false);
        if (v.blur) v.blur.mesh.visible = false;
        if (v.aura) v.aura.sprite.visible = false;
        if (v.shadow) v.shadow.visible = false;
        if (v.group.position.y < -1.5) v.group.visible = false;
        continue;
      }

      const p = beyWorldPosition(b.pos.x, b.pos.y);
      v.group.position.copy(p);

      if (v.shadow) {
        // Sits on the dish under the top, flat, tracking position only. The
        // dish rises toward the rim, so the height has to come from the same
        // bowl profile the top itself is placed on.
        v.shadow.visible = true;
        v.shadow.position.set(p.x, p.y + 0.004, p.z);
      }


      // Spin about its own axis.
      v.group.rotation.y = b.angle;

      // Lean, precessing slowly around the vertical. A top losing spin leans
      // further and wobbles faster — the visual tell that it's about to die.
      const sn = spinNorm(b);
      v.wobblePhase += dt * (2.5 + (1 - sn) * 9);
      const lean = b.tilt;
      v.group.rotation.x = Math.sin(v.wobblePhase) * lean;
      v.group.rotation.z = Math.cos(v.wobblePhase) * lean;

      // Hand the silhouette to the blur at high spin; at low spin the detail
      // returns at full size and its wobble carries the frame. Shrink rather
      // than hide: the afterimages stay at full radius, so the shrink is what
      // opens the gap between the solid top and its own smear.
      const blurK = v.blur ? v.blur.update(sn, dt) : 0;
      const detail = 1 - blurK * 0.18;
      v.parts.layer.scale.setScalar(detail);
      v.parts.disc.scale.setScalar(detail);

      v.trail.setVisible(true);
      v.trail.push(p.clone().setY(p.y + 0.05));

      // The hit ring flares on contact and dims as spin runs out.
      const ring = v.group.userData.ring as THREE.Mesh | undefined;
      if (ring) {
        const mat = ring.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.18 + 0.5 * sn + b.hitFlash * 0.5;
      }

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

    for (const h of hits) {
      const at = beyWorldPosition(h.at.x, h.at.y);
      at.y += 0.06;
      this.sparks.spawn(at, h.strength, h.opposite ? 40 : 24);
      this.shake = Math.min(0.09, this.shake + h.strength * 0.016);
      if (this.theme.shockwave && h.strength >= C.HITSTOP_THRESHOLD) {
        this.shockwaves.spawn(at, h.crit ? 0xfff0a0 : 0xffffff, h.crit ? 1.6 : 1.1);
      }
      // The manga cut, centred on where the clash actually happened. Same
      // threshold as hitstop: the sim freezes for a beat and this is the frame
      // it freezes on. Camera matrices are one frame stale here, which is
      // invisible at these speeds.
      if (this.theme.toon && h.strength >= C.HITSTOP_THRESHOLD) {
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
      if (riders.length && this.railSparkClock > 0.035) {
        this.railSparkClock = 0;
        for (const b of riders) {
          const at = beyWorldPosition(b.pos.x, b.pos.y);
          at.y += 0.03;
          this.sparks.spawn(at, 1.4, 5);
        }
      }
      const flare = riders.length > 0 ? 2.6 : 0;
      const mat = this.rail.material;
      mat.emissiveIntensity +=
        (this.rail.baseEmissive + flare - mat.emissiveIntensity) *
        Math.min(1, dt * 9);
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
    this.updateCamera(beys, dt);

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
      this.outline.render(this.scene, this.camera);
    } else if (this.theme.postBloom && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * Slow orbit around the stadium, easing toward the action and shaking on
   * heavy contact.
   */
  private updateCamera(beys: BeyState[], dt: number): void {
    this.cameraAngle += dt * 0.09;

    // Frame the surviving tops: pull back when they're far apart.
    const alive = beys.filter((b) => b.alive);
    let spread = 0;
    for (let i = 0; i < alive.length; i++) {
      for (let k = i + 1; k < alive.length; k++) {
        spread = Math.max(
          spread,
          Math.hypot(alive[i].pos.x - alive[k].pos.x, alive[i].pos.y - alive[k].pos.y),
        );
      }
    }
    // Pull back on narrow viewports. `fov` is the *vertical* field of view, so
    // a portrait window has a much smaller horizontal one — without this the
    // tops slide off the sides of the screen exactly when they separate.
    const aspect = this.camera.aspect || 1;
    const narrow = aspect < 1.6 ? 1.6 / Math.max(aspect, 0.5) : 1;
    const targetDist = (1.62 + spread * 0.34) * narrow;
    const radius = THREE.MathUtils.lerp(
      Math.hypot(this.camera.position.x, this.camera.position.z),
      targetDist,
      1 - Math.exp(-dt * 2.2),
    );

    this.shake = Math.max(0, this.shake - dt * 0.22);
    const jitter = this.shake;

    this.camera.position.set(
      Math.sin(this.cameraAngle) * radius + (Math.random() - 0.5) * jitter,
      1.16 + Math.sin(this.elapsed * 0.35) * 0.08 + (Math.random() - 0.5) * jitter,
      Math.cos(this.cameraAngle) * radius + (Math.random() - 0.5) * jitter,
    );
    this.camera.lookAt(0, C.BOWL_DEPTH * 0.35, 0);
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
