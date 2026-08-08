import * as THREE from 'three';
import * as C from '../sim/constants';
import { spinNorm } from '../sim/physics';
import type { HitEvent } from '../sim/physics';
import type { BeyState } from '../sim/types';
import { buildBeyMesh } from './beyMesh';
import { SparkBurst, Trail } from './effects';
import { beyWorldPosition, buildStadium } from './stadium';

interface BeyVisual {
  group: THREE.Group;
  trail: Trail;
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

    this.scene.background = new THREE.Color(0x070a12);
    this.scene.fog = new THREE.Fog(0x070a12, 3.2, 7.5);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 1.16, 1.7);
    this.camera.lookAt(0, 0, 0);

    this.scene.add(buildStadium());
    this.scene.add(this.beyRoot);
    this.scene.add(this.sparks.points);
    this.addLights();
    this.resize();
  }

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight(0x8fb6ff, 0x0b0f18, 0.85));

    const key = new THREE.DirectionalLight(0xffffff, 1.5);
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
    const rimA = new THREE.PointLight(0x3b82f6, 6, 6);
    rimA.position.set(-1.8, 0.9, -1.4);
    this.scene.add(rimA);

    const rimB = new THREE.PointLight(0xf97316, 5, 6);
    rimB.position.set(1.9, 0.8, -1.2);
    this.scene.add(rimB);
  }

  /** Rebuild the meshes for a new round. */
  setBeys(beys: BeyState[]): void {
    for (const v of this.visuals.values()) {
      this.beyRoot.remove(v.group);
      this.beyRoot.remove(v.trail.line);
    }
    this.visuals.clear();

    for (const b of beys) {
      const group = buildBeyMesh(b.build);
      const trail = new Trail(b.build.layer.colour);
      this.beyRoot.add(group);
      this.beyRoot.add(trail.line);
      this.visuals.set(b.id, { group, trail, wobblePhase: Math.random() * Math.PI * 2 });
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
    }

    for (const h of hits) {
      const at = beyWorldPosition(h.at.x, h.at.y);
      at.y += 0.06;
      this.sparks.spawn(at, h.strength, h.opposite ? 40 : 24);
      this.shake = Math.min(0.09, this.shake + h.strength * 0.016);
    }

    this.sparks.update(dt);
    this.updateCamera(beys, dt);
    this.renderer.render(this.scene, this.camera);
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
  }
}
