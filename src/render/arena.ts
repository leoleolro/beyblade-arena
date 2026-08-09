import * as THREE from 'three';
import * as C from '../sim/constants';
import { spinNorm } from '../sim/physics';
import type { HitEvent } from '../sim/physics';
import type { BeyState } from '../sim/types';
import { buildBeyMesh } from './beyMesh';
import { SparkBurst, Trail } from './effects';
import { skinById } from './skins';
import type { Skin } from './skins';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { applyStadiumTheme, beyWorldPosition, buildStadium } from './stadium';
import type { StadiumHandles } from './stadium';
import { ARENA, themeById } from './theme';
import type { Theme } from './theme';
import { Shockwave } from './shockwave';

interface BeyVisual {
  group: THREE.Group;
  trail: Trail;
  /**
   * A light that lives with the top and flares on impact. Off in the default
   * theme; in the anime theme it's most of the look, because the tops end up
   * lighting the arena rather than being lit by it.
   */
  light: THREE.PointLight;
  /** Free-running precession phase, so wobble doesn't look mechanical. */
  wobblePhase: number;
}

/**
 * Draws the battle. Owns no game state: every frame it is handed the current
 * sim state and mirrors it. Spin, lean and wobble are *visual* consequences of
 * the sim's scalar spin value rather than separately simulated, which is what
 * keeps the physics stable while still looking like a real spinning top.
 */
export class ArenaRenderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly sparks = new SparkBurst();
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
  private bloom: UnrealBloomPass | null = null;
  /** Seconds left of the decisive-blow blackout, when the theme uses one. */
  private blackout = 0;

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
    this.scene.add(this.shockwaves.group);
    this.addLights();
    this.resize();
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
    this.theme = t;

    (this.scene.background as THREE.Color).setHex(t.background);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.setHex(t.fogColour);
    fog.near = t.fogNear;
    fog.far = t.fogFar;

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
      document.body.classList.remove('theme-arena', 'theme-beam');
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
    for (const v of this.visuals.values()) {
      this.beyRoot.remove(v.group);
      this.beyRoot.remove(v.trail.line);
    }
    this.visuals.clear();

    for (const b of beys) {
      const skin: Skin = skinById(skins[b.id] ?? 'frost');
      const group = buildBeyMesh(b.build, skin);
      const trail = new Trail(skin.primary);
      trail.setOpacity(this.theme.trailOpacity);

      // Parented to the group, so it tracks the top for free.
      const light = new THREE.PointLight(skin.primary, this.theme.beyLightIntensity, 1.6);
      light.position.y = 0.1;
      group.add(light);

      this.beyRoot.add(group);
      this.beyRoot.add(trail.line);
      this.visuals.set(b.id, {
        group,
        trail,
        light,
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
        if (v.group.position.y < -1.5) v.group.visible = false;
        continue;
      }

      const p = beyWorldPosition(b.pos.x, b.pos.y);
      v.group.position.copy(p);


      // Spin about its own axis.
      v.group.rotation.y = b.angle;

      // Lean, precessing slowly around the vertical. A top losing spin leans
      // further and wobbles faster — the visual tell that it's about to die.
      const sn = spinNorm(b);
      v.wobblePhase += dt * (2.5 + (1 - sn) * 9);
      const lean = b.tilt;
      v.group.rotation.x = Math.sin(v.wobblePhase) * lean;
      v.group.rotation.z = Math.cos(v.wobblePhase) * lean;

      v.trail.setVisible(true);
      v.trail.push(p.clone().setY(p.y + 0.05));

      // The hit ring flares on contact and dims as spin runs out.
      const ring = v.group.userData.ring as THREE.Mesh | undefined;
      if (ring) {
        const mat = ring.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.18 + 0.5 * sn + b.hitFlash * 0.5;
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
    }

    // Crush the fill for a beat on the decisive blow, then ease it back.
    if (this.blackout > 0) {
      this.blackout = Math.max(0, this.blackout - dt);
      const k = this.blackout / 0.55;
      this.hemi.intensity = this.theme.hemiIntensity * (1 - 0.92 * k);
      this.key.intensity = this.theme.keyIntensity * (1 - 0.8 * k);
    }

    this.sparks.update(dt);
    this.shockwaves.update(dt);
    this.updateCamera(beys, dt);

    if (this.theme.postBloom && this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
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
    const targetDist = 1.62 + spread * 0.34;
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

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
  }
}
