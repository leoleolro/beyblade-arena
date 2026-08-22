import * as THREE from 'three';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
import { buildBeyMesh } from './beyMesh';
import type { BeyParts } from './beyMesh';
import { skinById } from './skins';
import { themeById } from './theme';
import {
  MODEL_TINT,
  finishImported,
  loadTopModel,
  normaliseToRadius,
  seatOnOrigin,
} from './topModels';
import { renderInked } from './outlineHull';
import { studioEnvironment } from './environment';
import { topModelFor } from './topModelIndex';
import type { BeyBuild } from '../sim/types';

/**
 * The garage preview: the top, exploded.
 *
 * The parts list used to be a wall of text chips, which told you a build's
 * numbers but never what it *was*. This shows the actual thing you're
 * assembling, pulled apart so each slot is a visible object rather than a row.
 *
 * Two decisions worth stating:
 *
 *  - It owns a **separate renderer and scene** on its own canvas rather than
 *    borrowing the arena's. The arena renderer is driven by the game loop and
 *    carries battle state, shake and a bloom pass; sharing it would mean the
 *    garage could disturb a live match, and it renders only on demand here.
 *  - The parts **counter-rotate at different rates**. Spinning them in unison
 *    reads as a turntable; opposed rates read as a working mechanism. The rates
 *    come from each part's own stats, so a stamina driver visibly spins on
 *    where an attack driver is more frantic — the animation previews what the
 *    part actually does.
 */

/** How far apart the parts sit when exploded, in mesh units. */
const SEPARATION = 0.085;

export class GarageView {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly root = new THREE.Group();

  private mesh: THREE.Group | null = null;
  private parts: BeyParts | null = null;
  /**
   * Outline pass, created lazily on first toon build.
   *
   * The garage owns its own renderer, so it needs its own outline wrapper —
   * the arena's can't be shared. Without this the exploded view stayed
   * un-inked while the battle behind it was fully cel-shaded, which read as a
   * bug rather than a style.
   */
  private outline: OutlineEffect | null = null;
  private toon = false;
  /**
   * Guards against a slow model landing on a build the player has since
   * changed. The garage re-renders on every part click, so two loads can be in
   * flight at once and the slower one must not win.
   */
  private modelToken = 0;
  private readonly hemi: THREE.HemisphereLight;
  private readonly key: THREE.DirectionalLight;
  private readonly fill: THREE.PointLight;
  private rates = { driver: 0, disc: 0, layer: 0 };
  /** Y offset that centres the exploded assembly on the origin. */
  private centreY = 0;

  /** User-controlled turntable angle, from dragging. */
  private yaw = 0.6;
  private pitch = 0.15;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  private raf = 0;
  private lastTime = 0;
  private running = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.05, 20);
    this.camera.position.set(0, 0.22, 0.95);

    this.scene.add(this.root);

    // Lit from three sides so the silhouette reads without the arena's rig.
    this.hemi = new THREE.HemisphereLight(0x9fc6ff, 0x0a0e18, 1.1);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffffff, 2.1);
    this.key.position.set(1.4, 2.2, 1.6);
    this.scene.add(this.key);
    this.fill = new THREE.PointLight(0x66ccff, 3.2, 4);
    this.fill.position.set(-1.2, 0.4, 0.8);
    this.scene.add(this.fill);

    this.bindDrag();
  }

  private bindDrag(): void {
    const down = (e: PointerEvent): void => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent): void => {
      if (!this.dragging) return;
      this.yaw += (e.clientX - this.lastX) * 0.01;
      // Clamped so the model can't be flipped past vertical, which looks broken.
      this.pitch = Math.max(
        -0.5,
        Math.min(0.9, this.pitch + (e.clientY - this.lastY) * 0.006),
      );
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    };
    const up = (e: PointerEvent): void => {
      this.dragging = false;
      if (this.canvas.hasPointerCapture(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId);
      }
    };
    this.canvas.addEventListener('pointerdown', down);
    this.canvas.addEventListener('pointermove', move);
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
  }

  /** Rebuild for a new build/skin. Disposes the previous mesh. */
  setBuild(build: BeyBuild, skinId: string, themeId: string): void {
    if (this.mesh) {
      this.root.remove(this.mesh);
      disposeTree(this.mesh);
    }

    const skin = skinById(skinId);
    this.toon = themeById(themeId).toon;
    const mesh = buildBeyMesh(build, skin, this.toon);
    this.mesh = mesh;
    this.parts = mesh.userData.parts as BeyParts;
    this.root.add(mesh);

    // The imported top, if this bey has one.
    //
    // The arena had this and the garage did not, which is the worst possible
    // split: you picked a bey, saw the old procedural model in the preview,
    // started a match and got a different one. The preview is where a player
    // decides what to equip, so it is the place the real thing matters most.
    const entry = topModelFor(build.layer.id);
    if (entry) {
      const parts = this.parts;
      const token = ++this.modelToken;
      void loadTopModel(entry.url).then((src) => {
        // A later setBuild may have replaced this mesh while the file loaded;
        // the token says whether this result is still the one being asked for.
        if (!src || token !== this.modelToken) return;
        const model = src.clone(true);
        normaliseToRadius(model, build.layer.radius);
        seatOnOrigin(model);
        finishImported(
          model,
          MODEL_TINT,
          studioEnvironment(this.renderer),
          entry.finish,
          themeById(themeId).envIntensity,
        );
        parts.layer.clear();
        parts.layer.add(model);
        parts.disc.visible = false;
        parts.driver.visible = false;
        this.layout();
      });
    }

    // Rates from the parts themselves. Opposed directions, and the driver is
    // the fastest because it's the part that actually meets the floor.
    this.rates = {
      layer: 0.55,
      disc: -0.34,
      driver: 1.15 * build.driver.spinRetention,
    };

    this.layout();

    // The preview picks up the chosen theme's background so the garage and the
    // arena don't look like two different games.
    const theme = themeById(themeId);

    // Cel bands need flat, high-key light. The default rig's tight blue point
    // fill is a specular trick — under a toon ramp it just blows one side of
    // the disc to the top band and hides the shape it was meant to describe.
    this.hemi.color.setHex(this.toon ? 0xffffff : 0x9fc6ff);
    this.hemi.groundColor.setHex(this.toon ? 0x5566aa : 0x0a0e18);
    this.hemi.intensity = this.toon ? 1.5 : 1.1;
    this.key.intensity = this.toon ? 2.2 : 2.1;
    this.fill.intensity = this.toon ? 0 : 3.2;

    this.scene.background = null;
    this.canvas.style.background = `radial-gradient(circle at 50% 40%, #${theme.dishColour
      .toString(16)
      .padStart(6, '0')} 0%, #${theme.background.toString(16).padStart(6, '0')} 70%)`;
  }

  /**
   * Explode the parts apart, then frame them.
   *
   * The framing is computed from the real part heights rather than a fixed
   * offset — layers differ in radius and therefore in height, so a hardcoded
   * offset left taller builds clipped at the bottom of the canvas.
   */
  private layout(): void {
    if (!this.parts || !this.mesh) return;
    this.parts.driver.position.y = -SEPARATION;
    this.parts.disc.position.y = 0;
    this.parts.layer.position.y = SEPARATION;

    const partY = this.mesh.userData.partY as {
      driver: number;
      disc: number;
      layer: number;
    };
    const lo = partY.driver - SEPARATION;
    const hi = partY.layer + SEPARATION;
    this.centreY = (lo + hi) / 2;

    // Pull the camera back just far enough to hold the whole assembly with a
    // margin, so every build fills the frame the same amount.
    const span = Math.max(hi - lo, 0.25) * 1.5;
    const fov = (this.camera.fov * Math.PI) / 180;
    this.camera.position.set(0, 0, span / 2 / Math.tan(fov / 2));
    this.camera.lookAt(0, 0, 0);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.resize();
    this.layout();
    const tick = (now: number): void => {
      if (!this.running) return;
      const dt = Math.min((now - this.lastTime) / 1000, 0.1);
      this.lastTime = now;
      this.update(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Stop animating and release the frame callback. */
  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private update(dt: number): void {
    if (this.parts) {
      this.parts.layer.rotation.y += this.rates.layer * dt;
      this.parts.disc.rotation.y += this.rates.disc * dt;
      this.parts.driver.rotation.y += this.rates.driver * dt;
    }

    // Idle drift when the player isn't dragging, so it never looks frozen.
    if (!this.dragging) this.yaw += dt * 0.12;

    this.root.rotation.y = this.yaw;
    this.root.rotation.x = this.pitch * 0.4;
    this.root.position.y = -this.centreY;

    if (this.toon) {
      if (!this.outline) {
        this.outline = new OutlineEffect(this.renderer, {
          defaultThickness: 0.014,
          defaultColor: [0.02, 0.02, 0.05],
          defaultAlpha: 1,
        });
      }
      // The arena's note applies here too: the ink pass runs against the
      // welded normals, so `renderInked` rather than `outline.render`.
      renderInked(this.renderer, this.outline, this.scene, this.camera);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  resize(): void {
    const w = this.canvas.clientWidth || 300;
    const h = this.canvas.clientHeight || 220;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Free every GPU resource. The garage view is created and destroyed often. */
  dispose(): void {
    this.stop();
    if (this.mesh) disposeTree(this.mesh);
    this.renderer.dispose();
  }
}

/**
 * Depth-first dispose of geometries and materials.
 *
 * Removing a mesh from a scene does not free its GPU buffers — without this the
 * garage would leak a full set of geometries and materials every time the
 * player clicked a different part, which in a parts picker is constantly.
 */
function disposeTree(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}
