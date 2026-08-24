import * as THREE from 'three';
import { poolBrightness, poolScale } from './motion';

/**
 * The white pool of light under a clash — the "white disk at the bottom of the
 * beyblades".
 *
 * WHY THIS EXISTS SEPARATELY FROM `Shockwave`. They were one thing for a long
 * time and that was the bug. The reference frame
 * (docs/design-targets/overdrive-target-clash.png) shows a broad, blown-out
 * white mass lying ON THE DISH FLOOR beneath the tops, spilling outward with a
 * blue halo. `Shockwave` draws the opposite object: a narrow annulus — its
 * texture is transparent until 87% of its radius — expanding outward as a
 * travelling front. A thin expanding circle is a ripple, and a ripple is
 * exactly what was reported: "not just a small wave like a water drop".
 *
 * Both are correct and neither substitutes for the other. The ring is the
 * pressure front leaving the impact; the pool is the impact itself. Trying to
 * get one mesh to be both is what produced a thin ring that was too faint to
 * read as a flash and too filled to read as a wave.
 *
 * WHY IT IS NOT JUST A BRIGHTER RING. The failure mode this project has hit
 * repeatedly is additive white under bloom, which saturates and turns any shape
 * into a featureless blob — the theme was once described as "glowing led light
 * bulbs hitting, full of light pollution". The defence here is not dimness, it
 * is TIME AND PLACE: the pool is large and genuinely bright, but it lives for a
 * quarter of a second, only on hits the sim has already called heavy, and it
 * lies flat on the floor where the dish's own curvature clips it. Light
 * pollution is glow with no event attached. This is glow that IS the event.
 *
 * WHY IT HUGS THE FLOOR. `depthTest` stays on, so the parts of the disk that
 * fall below the bowl's surface lose the depth test and are not drawn. The
 * pool therefore appears to pour into the basin rather than hover as a flat
 * card over it, which is what the reference shows and what makes it read as
 * being *under* the tops rather than in front of them.
 */

const POOL = 8;

/**
 * Seconds a pool lives.
 *
 * Deliberately shorter than the ring's 0.42. A flash that outlasts the moment
 * it belongs to stops being an impact and becomes lighting.
 */
const LIFE = 0.26;

let sharedPoolTexture: THREE.Texture | null = null;

/**
 * A filled radial flash — bright core, broad falloff, no edge.
 *
 * The stops matter more than they look. A plain linear gradient reads as a soft
 * haze with no centre, and a hard-edged disk reads as a decal; the reference is
 * neither. So the core holds near-full alpha out to ~30% of the radius — that
 * plateau is what makes it a *disk* rather than a glow — and then falls away on
 * a long tail that never reaches a visible boundary.
 */
function poolTexture(): THREE.Texture {
  if (sharedPoolTexture) return sharedPoolTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.92)');
    g.addColorStop(0.46, 'rgba(255,255,255,0.6)');
    g.addColorStop(0.64, 'rgba(255,255,255,0.28)');
    g.addColorStop(0.82, 'rgba(255,255,255,0.08)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  sharedPoolTexture = new THREE.CanvasTexture(canvas);
  return sharedPoolTexture;
}

export class ClashPool {
  readonly group = new THREE.Group();
  private readonly disks: THREE.Mesh[] = [];
  private readonly life: number[] = [];
  private readonly span: number[] = [];
  private readonly peak: number[] = [];
  private cursor = 0;
  private ink = false;

  constructor() {
    const geo = new THREE.PlaneGeometry(1, 1);
    const tex = poolTexture();
    for (let i = 0; i < POOL; i++) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          map: tex,
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          // Single-sided would vanish when the orbiting camera crosses the
          // floor plane, which it does on the low sweeps.
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.disks.push(mesh);
      this.life.push(0);
      this.span.push(1);
      this.peak.push(1);
      this.group.add(mesh);
    }
    this.group.frustumCulled = false;
  }

  /**
   * Glow or ink, on the same terms as `Shockwave.setInk`.
   *
   * Additive white is invisible on the Anime theme's near-white dish — additive
   * light cannot darken, so no colour choice rescues it while the blending
   * stays. In ink mode the pool blends normally and takes the theme's dark ink,
   * which is how a drawn medium shows an impact: a mark on the floor.
   */
  setInk(ink: boolean): void {
    this.ink = ink;
    for (const mesh of this.disks) {
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.blending = ink ? THREE.NormalBlending : THREE.AdditiveBlending;
      mat.needsUpdate = true;
    }
  }

  /**
   * Ink reads at a different alpha to glow.
   *
   * Lower than `Shockwave`'s 2.1x rather than higher, and for a reason worth
   * stating: that gain is applied to a thin line, where a large fraction of the
   * mark is the soft edge. This is a filled disk, so the same multiplier would
   * put a near-opaque dark blot under both tops on every heavy hit and read as
   * a hole in the dish rather than an impact.
   */
  private inkGain(): number {
    return this.ink ? 0.85 : 1;
  }

  /**
   * Flash a pool at a point.
   *
   * `span` is the plane's width in world units; the visible bright core is
   * roughly a third of that, with the spill reaching the full width.
   */
  spawn(at: THREE.Vector3, colour: number, span: number, peak = 0.9): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % POOL;

    const mesh = this.disks[i];
    mesh.position.copy(at);
    // Closer to the floor than the ring's 0.006. The pool is meant to be ON the
    // dish; lifting it enough to clear the surface everywhere would also lift
    // it out of the basin's curve and break the clipping that makes it pour.
    mesh.position.y += 0.004;
    mesh.visible = true;
    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.color.setHex(colour);
    mat.opacity = 0;
    this.life[i] = LIFE;
    this.span[i] = span;
    this.peak[i] = peak;
  }

  update(dt: number): void {
    for (let i = 0; i < POOL; i++) {
      if (this.life[i] <= 0) continue;

      this.life[i] -= dt;
      const mesh = this.disks[i];
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (this.life[i] <= 0) {
        mesh.visible = false;
        mat.opacity = 0;
        continue;
      }

      const t = 1 - this.life[i] / LIFE;
      // Both curves live in motion.ts, which is three-free and therefore
      // testable. See there for why a pool is born near full size and peaks
      // almost immediately, where the ring does neither.
      mesh.scale.setScalar(this.span[i] * poolScale(t));
      mat.opacity = Math.min(1, poolBrightness(t) * this.peak[i] * this.inkGain());
    }
  }
}
