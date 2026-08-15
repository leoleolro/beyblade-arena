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
 * The colour of a friction spark, as it cools.
 *
 * A grinding spark is not a coloured dot. It is a chip of steel torn off the
 * surface, heated past its ignition point by the work done tearing it loose,
 * burning in air and then cooling as it flies. So its colour is a *clock*: it
 * leaves the contact white-hot, passes through straw yellow and orange, and
 * dies deep red. Drawing every particle one flat colour throws that away, and
 * it is the single strongest cue that what you are looking at is hot metal
 * rather than confetti.
 *
 * Stops are eyeballed off the blackbody curve rather than computed from it:
 * the real Planck locus at these temperatures runs through a pink-white that
 * reads as washed-out on screen, and a saturated straw yellow sells "sparks"
 * better than the physically exact colour does. This is the one place in this
 * file where the reference is a photograph and not a formula.
 */
const HEAT_STOPS: number[][] = [
  [1.0, 1.0, 0.98], // white hot, just torn loose
  [1.0, 0.95, 0.62], // straw
  [1.0, 0.68, 0.22], // orange
  [0.92, 0.3, 0.06], // deep orange
  [0.55, 0.08, 0.02], // dying red
];

/** Sample HEAT_STOPS at k (1 = hottest, 0 = dead), into `out`. */
function heatColour(k: number, out: THREE.Color): void {
  const t = (1 - (k < 0 ? 0 : k > 1 ? 1 : k)) * (HEAT_STOPS.length - 1);
  const i = Math.min(HEAT_STOPS.length - 2, Math.floor(t));
  const f = t - i;
  const a = HEAT_STOPS[i];
  const b = HEAT_STOPS[i + 1];
  out.setRGB(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
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
  /** Life this particle started with, so the cooling ramp has a denominator. */
  private readonly maxLife: Float32Array;
  /** Per-particle RGB, rewritten every frame from the cooling ramp. */
  private readonly colours: Float32Array;
  /**
   * Seconds until this particle forks, or -1 for one that never will.
   *
   * Steel sparks fork because the chip is not pure iron: the carbon in it
   * burns, the trapped CO2 bursts the chip open, and the fragments fly off as
   * a little star. It is the most recognisable single feature of grinding
   * sparks and no amount of tuning a plain particle spray produces it.
   */
  private readonly fork: Float32Array;
  /** Air drag per particle. Grind chips are tiny and slow down hard. */
  private readonly drag: Float32Array;
  private readonly max: number;
  private cursor = 0;
  /** Scratch for the directional cone basis; keeps `spawn` allocation-free. */
  private readonly dir = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  /** Scratch for the cooling ramp; keeps `update` allocation-free. */
  private readonly scratch = new THREE.Color();
  /** The theme's spark hue, blended into the physical ramp. */
  private readonly tint = new THREE.Color(0xffd28a);

  /**
   * 1200, up from 600.
   *
   * The pool is a ring buffer, so an over-subscribed pool does not drop the new
   * sparks — it evicts the *oldest live* ones. A rail ride now streams 14
   * particles every 0.012s (see arena.ts), which is ~1170 particles per second
   * against a spark lifetime of 0.35–0.65s: at 600 the stream alone laps the
   * buffer roughly twice a second, so a clash landing mid-ride had its sparks
   * deleted within a few frames by the grind behind it. 1200 holds ~1s of
   * worst-case rail stream plus a full 72-particle finisher burst on top.
   */
  constructor(max = 1200) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.velocities = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.colours = new Float32Array(max * 3);
    this.fork = new Float32Array(max).fill(-1);
    this.drag = new Float32Array(max);

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
    geo.setAttribute('color', new THREE.BufferAttribute(this.colours, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.028,
      // White, because the colour now lives per-particle. PointsMaterial
      // MULTIPLIES `color` by the vertex colour, so anything else here would
      // tint the whole cooling ramp a second time and a dying red spark under
      // an orange theme came out near-black.
      color: 0xffffff,
      vertexColors: true,
      // PointsMaterial draws square points; the round falloff map is what
      // makes them sparks. Invisible on a dark dish, but on the anime theme's
      // near-white floor the bare squares read as boxes.
      map: sparkSprite(),
      transparent: true,
      // 0.82, down from 0.95. These are additively blended, and a grind stream
      // is dense: at 0.95 overlapping particles summed past white and the
      // cooling ramp was invisible in exactly the place it matters most.
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  /**
   * Re-style for a theme. Same pool, different look.
   *
   * The theme's colour is no longer applied to the material — it is kept as a
   * TINT that the cooling ramp is pulled a third of the way toward, so each
   * theme keeps its hue family (Arena's warm straw, Anime's hot orange) while
   * every particle still travels white -> yellow -> orange -> red over its own
   * life. Multiplying instead of blending was the first attempt and it crushed
   * the cool end of the ramp to black.
   */
  setStyle(colour: number, size: number): void {
    const mat = this.points.material as THREE.PointsMaterial;
    mat.size = size;
    this.tint.setHex(colour);
  }

  /**
   * Spawn `count` sparks at a world position, scaled by hit strength.
   *
   * With no `along`, the burst is isotropic — the clash behaviour, unchanged.
   * Pass `along` for a *stream*: grinding metal throws sparks in a narrow cone
   * off the contact, and an isotropic puff at the same rate reads as smoke
   * rather than as friction. `cone` is the half-angle of that spread in
   * radians.
   */
  spawn(
    at: THREE.Vector3,
    strength: number,
    count = 24,
    along?: THREE.Vector3,
    cone = 0.32,
    grind = false,
  ): void {
    // Clamp the strength term so a hit cannot throw sparks clean out of the
    // stadium. The clamp was 2.5, which is only a shade above the
    // impact-frame bar of 2.6 — every hit worth watching hit the ceiling and
    // came out looking identical to every other. 4.5 is just under the
    // hardest impacts the sim produces (opposite-spin crits register 5+), so
    // the range a player can actually see now spans the range the sim rolls.
    // Measured spawn speed at the top of the range: 0.35 + 4.5*0.26 = 1.52,
    // versus 1.0 before; sparks travel ~0.5 units in their ~0.5s life, which
    // is half the dish and still lands inside the rim.
    const speed = 0.35 + Math.min(strength, 4.5) * 0.26;

    if (along) {
      this.dir.copy(along);
      if (this.dir.lengthSq() < 1e-8) this.dir.set(1, 0, 0);
      this.dir.normalize();
      // Ground-plane perpendicular. A full orthonormal basis is overkill: the
      // stream is always roughly horizontal and the vertical spread comes from
      // the same upward bias the isotropic burst uses.
      this.side.set(-this.dir.z, 0, this.dir.x);
      if (this.side.lengthSq() < 1e-8) this.side.set(0, 0, 1);
      this.side.normalize();
    }

    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;

      this.positions[idx * 3] = at.x;
      this.positions[idx * 3 + 1] = at.y;
      this.positions[idx * 3 + 2] = at.z;

      // Bias upward so sparks arc off the dish rather than sink into it.
      const up = 0.35 + Math.random() * 0.8;
      if (along) {
        const yaw = (Math.random() - 0.5) * 2 * cone;
        const mag = speed * (0.55 + Math.random() * 0.85);
        const c = Math.cos(yaw);
        const s = Math.sin(yaw);
        this.velocities[idx * 3] = (this.dir.x * c + this.side.x * s) * mag;
        // Flatter than the burst: a grind sprays along the surface, and a
        // stream that lofts as hard as a clash reads as an explosion.
        this.velocities[idx * 3 + 1] = up * speed * 0.6;
        this.velocities[idx * 3 + 2] = (this.dir.z * c + this.side.z * s) * mag;
      } else {
        const theta = Math.random() * Math.PI * 2;
        const radial = speed * (0.4 + Math.random() * 0.8);
        this.velocities[idx * 3] = Math.cos(theta) * radial;
        this.velocities[idx * 3 + 1] = up * speed;
        this.velocities[idx * 3 + 2] = Math.sin(theta) * radial;
      }
      // GRIND PARTICLES ARE PHYSICALLY DIFFERENT PARTICLES, not restyled ones.
      //
      // A clash spark is debris thrown by an impact: comparatively large, and
      // it coasts. A grind spark is a chip of steel a few tens of microns
      // across, torn off by friction and burning. That size difference is the
      // whole reason grinding looks the way it does:
      //
      //  - it decelerates hard, because drag scales with area/mass and the
      //    chip has almost no mass. Real grinding sparks visibly stop in air.
      //  - it burns out fast, so the stream is short and dense rather than
      //    long and sparse.
      //  - some of them FORK. The chip is steel, not iron: its carbon burns,
      //    the trapped gas bursts the chip, and it opens into a little star.
      //    Roughly a third do it here, at a random point in the second half of
      //    their life, which is where it happens on a grinding wheel.
      const life = grind ? 0.16 + Math.random() * 0.22 : 0.35 + Math.random() * 0.3;
      this.life[idx] = life;
      this.maxLife[idx] = life;
      this.drag[idx] = grind ? 5.5 : 0.6;
      this.fork[idx] = grind && Math.random() < 0.34 ? life * (0.25 + Math.random() * 0.3) : -1;
      // Seeded hot so the first frame is not black; update() takes over.
      this.colours[idx * 3] = 1;
      this.colours[idx * 3 + 1] = 1;
      this.colours[idx * 3 + 2] = 0.95;
    }
  }

  /**
   * The carbon burst: one chip becomes a handful of shorter-lived fragments.
   *
   * Deliberately NOT a call back into `spawn`. Fragments inherit the parent's
   * velocity plus a wide isotropic kick, which is what makes the fork read as
   * something bursting rather than as a second spray from the same origin, and
   * they must not re-fork or a single spark can chain into a firework.
   */
  private burstCarbon(parent: number): void {
    const px = this.positions[parent * 3];
    const py = this.positions[parent * 3 + 1];
    const pz = this.positions[parent * 3 + 2];
    const vx = this.velocities[parent * 3];
    const vy = this.velocities[parent * 3 + 1];
    const vz = this.velocities[parent * 3 + 2];

    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      // Skip the parent, or a full pool can have the burst overwrite the very
      // particle it is bursting from mid-loop.
      if (idx === parent) continue;

      this.positions[idx * 3] = px;
      this.positions[idx * 3 + 1] = py;
      this.positions[idx * 3 + 2] = pz;

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(1 - 2 * Math.random());
      const kick = 0.35 + Math.random() * 0.5;
      this.velocities[idx * 3] = vx * 0.45 + Math.sin(phi) * Math.cos(theta) * kick;
      this.velocities[idx * 3 + 1] = vy * 0.45 + Math.cos(phi) * kick * 0.6;
      this.velocities[idx * 3 + 2] = vz * 0.45 + Math.sin(phi) * Math.sin(theta) * kick;

      const life = 0.07 + Math.random() * 0.09;
      this.life[idx] = life;
      this.maxLife[idx] = life;
      this.drag[idx] = 7;
      this.fork[idx] = -1;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        // Park dead sparks far below the stadium instead of drawing them.
        this.positions[i * 3 + 1] = -999;
        this.fork[i] = -1;
        continue;
      }

      if (this.fork[i] > 0) {
        this.fork[i] -= dt;
        if (this.fork[i] <= 0) {
          this.fork[i] = -1;
          this.burstCarbon(i);
        }
      }

      this.velocities[i * 3 + 1] -= 3.2 * dt; // gravity
      // Exponential drag, not linear: a linear term can drive the velocity
      // through zero and backwards at a large dt, which sends sparks flying
      // back into the top they came off.
      const keep = Math.exp(-this.drag[i] * dt);
      this.velocities[i * 3] *= keep;
      this.velocities[i * 3 + 1] *= keep;
      this.velocities[i * 3 + 2] *= keep;

      this.positions[i * 3] += this.velocities[i * 3] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.velocities[i * 3 + 2] * dt;

      // Cool. The ramp is driven by remaining life, and then pulled a third of
      // the way toward the theme's hue so Arena and Anime still look like
      // themselves.
      const denom = this.maxLife[i] || 1;
      heatColour(this.life[i] / denom, this.scratch);
      this.scratch.lerp(this.tint, 0.25);
      this.colours[i * 3] = this.scratch.r;
      this.colours[i * 3 + 1] = this.scratch.g;
      this.colours[i * 3 + 2] = this.scratch.b;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
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

let sharedMoonTexture: THREE.Texture | null = null;

/**
 * The pool of light a spinning top throws on the dish beneath it.
 *
 * Reported as missing, and the description is exact: "glowing lights on the
 * bottom of beyblades when they collided — looked like moon, circle". It came
 * from the per-top PointLight in the first themed build, which sat a few
 * centimetres above the floor with a 1.6-unit falloff and therefore painted a
 * bright disc on the dish under each top, flaring on `hitFlash`.
 *
 * Rebuilding it as a LIGHT again would be the obvious move and it is the wrong
 * one. A point light's pool is not really a circle — its shape and brightness
 * depend on the dish's local slope, its material, and how many other lights are
 * competing, so it fades out toward the rim exactly where the fighting happens
 * and it costs a real light in every material's shader permutation. What the
 * effect actually wants is a *decal*: an additive disc lying flat on the floor,
 * the same size and brightness wherever the top is.
 *
 * Two stops rather than a long gradient. A smooth falloff reads as a soft
 * shadow-ish blob; the crisp inner plateau with a short shoulder is what makes
 * it read as a projected circle of light — the moon in the description.
 */
function moonTexture(): THREE.Texture {
  if (sharedMoonTexture) return sharedMoonTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.72, 'rgba(255,255,255,0.16)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  sharedMoonTexture = new THREE.CanvasTexture(canvas);
  return sharedMoonTexture;
}

export interface GroundGlow {
  readonly mesh: THREE.Mesh;
  /** Size and brightness follow spin, and flare on contact. */
  update(spinNorm: number, hitFlash: number, grind: number): void;
  setTint(colour: number): void;
}

/** A skin-tinted disc of light on the dish under one top. */
export function buildGroundGlow(colour: number, radius: number): GroundGlow {
  const mat = new THREE.MeshBasicMaterial({
    map: moonTexture(),
    color: colour,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    // The dish is drawn before this and the glow must not fight it for depth;
    // additive with depthTest still on keeps it from bleeding through the wall.
    side: THREE.DoubleSide,
  });
  noOutline(mat);

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  // Under the tops and the sparks, above the painted dish.
  mesh.renderOrder = 0;
  mesh.frustumCulled = false;

  const base = radius * 3.4;

  return {
    mesh,
    setTint(c: number): void {
      mat.color.setHex(c);
    },
    update(sn: number, hitFlash: number, grind: number): void {
      // Three inputs, three different jobs: spin is the resting glow so a
      // healthy top sits in its own light and a dying one dims, hitFlash is the
      // collision flare the effect was remembered for, and grind is the low
      // continuous swell while two tops lean on each other — which is most of a
      // round and used to be drawn as nothing at all.
      const energy = 0.28 + sn * 0.5 + hitFlash * 1.5 + grind * 0.6;
      mat.opacity = Math.min(0.85, energy * 0.45);
      const scale = base * (0.85 + sn * 0.2 + hitFlash * 0.55 + grind * 0.25);
      mesh.scale.set(scale, scale, 1);
    },
  };
}
