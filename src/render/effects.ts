import * as THREE from 'three';
import { noOutline } from './toon';

let sharedSparkSprite: THREE.CanvasTexture | null = null;

/** Round soft-edged sprite for the spark points, built once and shared. */
function sparkSprite(): THREE.CanvasTexture {
  if (sharedSparkSprite) return sharedSparkSprite;
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  sharedSparkSprite = new THREE.CanvasTexture(canvas);
  return sharedSparkSprite;
}

/**
 * A pooled additive-blended particle burst, used for clash sparks. Particles
 * are allocated once and recycled — a battle produces bursts constantly and
 * allocating per hit would sawtooth the frame time.
 */
export class SparkBurst {
  readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly life: Float32Array;
  private readonly max: number;
  private cursor = 0;

  constructor(max = 600) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.velocities = new Float32Array(max * 3);
    this.life = new Float32Array(max);

    // Park the whole pool below the stadium up front.
    //
    // `update` parks sparks at y = -999 once they die, but a particle that has
    // never been *spawned* has never been through that path — so the untouched
    // pool sat at (0, 0, 0), which is the exact centre of the dish. All 600 of
    // them drew there additively every frame, as a bright speck in the middle
    // of the arena that looked like a rendering glitch and outlived every
    // theme.
    for (let i = 0; i < max; i++) this.positions[i * 3 + 1] = -999;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const alpha = new THREE.BufferAttribute(new Float32Array(max), 1);
    geo.setAttribute('alpha', alpha);

    const mat = new THREE.PointsMaterial({
      size: 0.028,
      color: 0xffd28a,
      // PointsMaterial draws square points; the round falloff map is what
      // makes them sparks. Invisible on a dark dish, but on the anime theme's
      // near-white floor the bare squares read as boxes.
      map: sparkSprite(),
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  /** Re-style for a theme. Same pool, different look. */
  setStyle(colour: number, size: number): void {
    const mat = this.points.material as THREE.PointsMaterial;
    mat.color.setHex(colour);
    mat.size = size;
  }

  /** Spawn `count` sparks at a world position, scaled by hit strength. */
  spawn(at: THREE.Vector3, strength: number, count = 24): void {
    // Clamp the strength term: a heavy opposite-spin clash can register an
    // impact of 5+, which uncapped throws sparks clean out of the stadium.
    const speed = 0.35 + Math.min(strength, 2.5) * 0.26;
    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;

      this.positions[idx * 3] = at.x;
      this.positions[idx * 3 + 1] = at.y;
      this.positions[idx * 3 + 2] = at.z;

      // Bias upward so sparks arc off the dish rather than sink into it.
      const theta = Math.random() * Math.PI * 2;
      const up = 0.35 + Math.random() * 0.8;
      const radial = speed * (0.4 + Math.random() * 0.8);
      this.velocities[idx * 3] = Math.cos(theta) * radial;
      this.velocities[idx * 3 + 1] = up * speed;
      this.velocities[idx * 3 + 2] = Math.sin(theta) * radial;
      this.life[idx] = 0.35 + Math.random() * 0.3;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // Park dead sparks far below the stadium instead of drawing them.
        this.positions[i * 3 + 1] = -999;
        continue;
      }
      this.velocities[i * 3 + 1] -= 3.2 * dt; // gravity
      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

/**
 * The surface arena.ts holds a trail through, so the toon ribbon and the
 * classic line are interchangeable per theme without the caller caring which
 * one it has.
 */
export interface TrailLike {
  readonly object: THREE.Object3D;
  push(p: THREE.Vector3): void;
  reset(): void;
  setVisible(v: boolean): void;
  setOpacity(o: number): void;
}

/** A fading ribbon following one top, so its orbit path stays readable. */
export class Trail implements TrailLike {
  readonly line: THREE.Line;
  private readonly positions: Float32Array;
  private readonly length: number;
  private filled = false;

  constructor(colour: number, length = 90) {
    this.length = length;
    this.positions = new Float32Array(length * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        color: colour,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.line.frustumCulled = false;
  }

  get object(): THREE.Object3D {
    return this.line;
  }

  push(p: THREE.Vector3): void {
    if (!this.filled) {
      // Seed the whole buffer on first use so the trail doesn't streak in
      // from the world origin.
      for (let i = 0; i < this.length; i++) {
        this.positions[i * 3] = p.x;
        this.positions[i * 3 + 1] = p.y;
        this.positions[i * 3 + 2] = p.z;
      }
      this.filled = true;
    } else {
      this.positions.copyWithin(0, 3);
      const last = (this.length - 1) * 3;
      this.positions[last] = p.x;
      this.positions[last + 1] = p.y;
      this.positions[last + 2] = p.z;
    }
    this.line.geometry.attributes.position.needsUpdate = true;
  }

  reset(): void {
    this.filled = false;
  }

  setVisible(v: boolean): void {
    this.line.visible = v;
  }

  setOpacity(o: number): void {
    (this.line.material as THREE.LineBasicMaterial).opacity = o;
  }
}

/**
 * The toon trail: a flat triangle-strip ribbon rather than a one-pixel line.
 *
 * Anime draws motion as a thick glowing ribbon behind the mover, and
 * LineBasicMaterial cannot be wider than a pixel on most platforms — so the
 * width has to be real geometry. Fixed-size buffers rewritten in place per
 * push: a battle pushes every frame, and per-frame allocation would sawtooth
 * the frame time.
 *
 * The fade lives in a per-vertex colour attribute under additive blending,
 * where black *is* transparent — which keeps the material a plain
 * MeshBasicMaterial instead of a shader.
 */
export class RibbonTrail implements TrailLike {
  readonly mesh: THREE.Mesh;
  private readonly centres: Float32Array;
  private readonly positions: Float32Array;
  private readonly samples: number;
  private readonly halfWidth: number;
  private filled = false;
  private lastSideX = 1;
  private lastSideZ = 0;

  constructor(colour: number, layerRadius: number, samples = 60) {
    this.samples = samples;
    this.halfWidth = layerRadius * 0.55 * 0.5;
    this.centres = new Float32Array(samples * 3);
    this.positions = new Float32Array(samples * 2 * 3);

    // Static fade ramp, brightest at the head. Never touched again.
    const colours = new Float32Array(samples * 2 * 3);
    const c = new THREE.Color(colour);
    for (let i = 0; i < samples; i++) {
      const fade = (i / (samples - 1)) ** 1.6;
      const o = i * 2 * 3;
      colours[o] = colours[o + 3] = c.r * fade;
      colours[o + 1] = colours[o + 4] = c.g * fade;
      colours[o + 2] = colours[o + 5] = c.b * fade;
    }

    const index: number[] = [];
    for (let i = 0; i < samples - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    geo.setIndex(index);

    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    // OutlineEffect would draw an inverted hull around the strip — a black
    // ribbon under the glowing one.
    noOutline(mat);

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    // Above the dish and the tops' transparent bits, below blur discs (2) and
    // sparks (3).
    this.mesh.renderOrder = 1;
  }

  get object(): THREE.Object3D {
    return this.mesh;
  }

  push(p: THREE.Vector3): void {
    const n = this.samples;
    if (!this.filled) {
      // Seed the whole buffer on first use so the ribbon doesn't streak in
      // from the world origin.
      for (let i = 0; i < n; i++) {
        this.centres[i * 3] = p.x;
        this.centres[i * 3 + 1] = p.y;
        this.centres[i * 3 + 2] = p.z;
      }
      this.filled = true;
    } else {
      this.centres.copyWithin(0, 3);
      const last = (n - 1) * 3;
      this.centres[last] = p.x;
      this.centres[last + 1] = p.y;
      this.centres[last + 2] = p.z;
    }

    // Rebuild the strip: each sample extrudes sideways in the ground plane,
    // perpendicular to the path, tapering from full width at the head to zero
    // at the tail.
    for (let i = 0; i < n; i++) {
      const prev = Math.max(0, i - 1) * 3;
      const next = Math.min(n - 1, i + 1) * 3;
      const dx = this.centres[next] - this.centres[prev];
      const dz = this.centres[next + 2] - this.centres[prev + 2];
      const len = Math.hypot(dx, dz);
      if (len > 1e-6) {
        this.lastSideX = -dz / len;
        this.lastSideZ = dx / len;
      }
      // A stationary segment keeps the last good side vector — collapsing the
      // width there makes the ribbon flicker whenever the top slows.
      const w = this.halfWidth * (i / (n - 1));
      const sx = this.lastSideX * w;
      const sz = this.lastSideZ * w;

      const cx = this.centres[i * 3];
      const cy = this.centres[i * 3 + 1];
      const cz = this.centres[i * 3 + 2];
      const o = i * 2 * 3;
      this.positions[o] = cx + sx;
      this.positions[o + 1] = cy;
      this.positions[o + 2] = cz + sz;
      this.positions[o + 3] = cx - sx;
      this.positions[o + 4] = cy;
      this.positions[o + 5] = cz - sz;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }

  reset(): void {
    this.filled = false;
  }

  setVisible(v: boolean): void {
    this.mesh.visible = v;
  }

  setOpacity(o: number): void {
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = o;
  }
}
