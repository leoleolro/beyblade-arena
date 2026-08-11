import * as THREE from 'three';

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

/** A fading ribbon following one top, so its orbit path stays readable. */
export class Trail {
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
