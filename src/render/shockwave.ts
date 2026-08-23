import * as THREE from 'three';

/**
 * Waves of light travelling out from a clash.
 *
 * WHAT WAS WRONG WITH THE FIRST VERSION, because it is a good lesson about
 * additive blending. The ring spawned at `scale = 0.05` and its opacity curve
 * peaked at birth, so for the first few frames of every impact it was a
 * sub-pixel-thick annulus at maximum brightness — which additive blending plus
 * bloom turns into a solid white ball. Reported exactly that way: "just fluffy
 * light balls... looks like solid white disc". The ring only became a ring
 * after it had already faded most of the way out, so the part of its life that
 * read as a wave was the part nobody could see.
 *
 * So three things changed, and none of them is a brightness tweak:
 *
 *  1. It is BORN AT A REAL RADIUS (22% of its travel), never as a point. A
 *     shockwave you can see the origin of is a flash, not a wave.
 *  2. Its brightness peaks IN FLIGHT rather than at birth — `sin(pi*t)`
 *     shaped — so it fades up as it forms and fades down as it dissipates,
 *     which is what a pressure front does and what stops the bloom from ever
 *     catching it at its smallest.
 *  3. A hit throws a TRAIN of two or three fronts a beat apart, not one ring.
 *     One expanding circle reads as a bubble; several chasing each other read
 *     as waves radiating from a centre, which is the thing being asked for.
 *
 * The band is also a soft gradient now rather than a hard-edged annulus. A
 * geometric ring is a wire circle; light has no edges.
 *
 * Pooled and pre-allocated. Rings spawn on the most violent frame of a round,
 * which is precisely when allocating would cost a hitch.
 */

const POOL = 14;

/** Seconds a single front lives. */
const LIFE = 0.42;

let sharedWaveTexture: THREE.Texture | null = null;

/**
 * A soft annulus, drawn once and shared.
 *
 * Painted as a ring of light rather than cut as geometry: the band fades to
 * nothing on both edges, so the front has no silhouette to give itself away as
 * a polygon, and it survives being scaled to any size. The inner edge falls off
 * faster than the outer one — a real pressure front has a steep leading face
 * and a long wake, and reversing that reads as a shrinking ring.
 */
function waveTexture(): THREE.Texture {
  if (sharedWaveTexture) return sharedWaveTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    // NARROW. The first soft version ran the band from 0.66 to 1.0 — a third
    // of the radius — and at a span of 0.8 that is a quarter of a world unit of
    // soft additive white, which under bloom is not a wavefront, it is a
    // floodlight. Seen in the browser as a white blowout covering half the
    // dish. A front is thin: the light is in WHERE it is, not how much of it
    // there is.
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.87, 'rgba(255,255,255,0)');
    g.addColorStop(0.93, 'rgba(255,255,255,0.4)');
    g.addColorStop(0.965, 'rgba(255,255,255,1)'); // the front itself
    g.addColorStop(0.99, 'rgba(255,255,255,0.3)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  sharedWaveTexture = new THREE.CanvasTexture(canvas);
  return sharedWaveTexture;
}

export class Shockwave {
  readonly group = new THREE.Group();
  private readonly rings: THREE.Mesh[] = [];
  private readonly life: number[] = [];
  private readonly span: number[] = [];
  /** Seconds before this front starts moving. Staggers a wave train. */
  private readonly delay: number[] = [];
  private readonly peak: number[] = [];
  private cursor = 0;
  private ink = false;

  constructor() {
    const geo = new THREE.PlaneGeometry(1, 1);
    const tex = waveTexture();
    for (let i = 0; i < POOL; i++) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          map: tex,
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.rings.push(mesh);
      this.life.push(0);
      this.span.push(1);
      this.delay.push(0);
      this.peak.push(0.5);
      this.group.add(mesh);
    }
    this.group.frustumCulled = false;
  }

  /**
   * Throw a wave train from a point.
   *
   * `fronts` is how many rings chase each other outward. Two is a clash, three
   * is a finisher; one is available but reads as a bubble and is only right for
   * something that genuinely is a single pulse.
   */
  /**
   * Glow or ink.
   *
   * ADDITIVE IS ONLY RIGHT ON A DARK FLOOR. These rings are drawn additively
   * and spawned near-white, which is invisible on the Anime theme's near-white
   * polycarbonate dish — filmstripped, a heavy clash there produced a few
   * specks and no ring at all, in the one theme whose whole identity is impact
   * drama. Additive light cannot darken, so no colour choice fixes it while the
   * blending stays.
   *
   * In ink mode the ring blends normally and takes a dark colour, which is how
   * a drawn medium shows a shockwave in the first place: a line, not a glow.
   */
  setInk(ink: boolean): void {
    this.ink = ink;
    for (const mesh of this.rings) {
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.blending = ink ? THREE.NormalBlending : THREE.AdditiveBlending;
      mat.needsUpdate = true;
    }
  }

  /**
   * Opacity multiplier, because ink and glow do not read at the same alpha.
   *
   * The peaks every caller passes were chosen against ADDITIVE blending, where
   * 0.26 of near-white on a dark floor is a clearly visible front. The same
   * 0.26 of dark navy blended normally over a near-white dish is a pale grey
   * smudge — technically present, not actually an effect. 2.1x lands it at
   * roughly the same perceived contrast against its own background.
   */
  private inkGain(): number {
    return this.ink ? 2.1 : 1;
  }

  spawn(at: THREE.Vector3, colour: number, scale: number, fronts = 2, peak = 0.5): void {
    for (let f = 0; f < fronts; f++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % POOL;

      const mesh = this.rings[i];
      mesh.position.copy(at);
      mesh.position.y += 0.006;
      mesh.visible = true;
      mesh.scale.setScalar(0.001);
      (mesh.material as THREE.MeshBasicMaterial).color.setHex(colour);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0;
      this.life[i] = LIFE;
      // Later fronts are slightly smaller and dimmer — a wave train loses
      // energy, and identical rings read as a stutter rather than a sequence.
      this.span[i] = scale * (1 - f * 0.16);
      this.delay[i] = f * 0.055;
      this.peak[i] = peak * (1 - f * 0.22);
    }
  }

  update(dt: number): void {
    for (let i = 0; i < POOL; i++) {
      if (this.life[i] <= 0) continue;

      if (this.delay[i] > 0) {
        this.delay[i] -= dt;
        continue;
      }

      this.life[i] -= dt;
      const mesh = this.rings[i];
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (this.life[i] <= 0) {
        mesh.visible = false;
        mat.opacity = 0;
        continue;
      }

      const t = 1 - this.life[i] / LIFE;
      // Fast at first then easing out — a pressure front decelerates.
      const eased = 1 - (1 - t) * (1 - t);
      // BORN AT 22% OF ITS TRAVEL. The whole defect in the first version was
      // starting at 0.05 absolute: the front was a dot for the frames it was
      // brightest, and a bright dot under bloom is a ball.
      const r = this.span[i] * (0.22 + 0.78 * eased);
      mesh.scale.setScalar(r);
      // Peaks IN FLIGHT. sin(pi*t) is zero at both ends, so a front is never
      // visible at its smallest and never lingers at its largest.
      mat.opacity = Math.min(1, Math.sin(Math.PI * t) * this.peak[i] * this.inkGain());
    }
  }
}
