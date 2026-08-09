import * as THREE from 'three';

/**
 * Expanding ground rings on a heavy clash.
 *
 * The single cheapest way to make an impact read as an *impact* rather than as
 * two objects touching: a hard-edged annulus that grows and fades in about a
 * third of a second. Anime uses exactly this shape, and because it lies flat on
 * the dish it reads at any camera angle.
 *
 * Pooled and pre-allocated. Rings spawn on the most violent frame of a round,
 * which is precisely when allocating would cost a hitch.
 */

const POOL = 6;

export class Shockwave {
  readonly group = new THREE.Group();
  private readonly rings: THREE.Mesh[] = [];
  private readonly life: number[] = [];
  private readonly span: number[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < POOL; i++) {
      const mesh = new THREE.Mesh(
        // Unit ring, scaled at spawn — one geometry for the whole pool.
        new THREE.RingGeometry(0.86, 1, 48),
        new THREE.MeshBasicMaterial({
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
      this.rings.push(mesh);
      this.life.push(0);
      this.span.push(1);
      this.group.add(mesh);
    }
    this.group.frustumCulled = false;
  }

  spawn(at: THREE.Vector3, colour: number, scale: number): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % POOL;

    const mesh = this.rings[i];
    mesh.position.copy(at);
    mesh.position.y += 0.006;
    mesh.visible = true;
    mesh.scale.setScalar(0.05);
    (mesh.material as THREE.MeshBasicMaterial).color.setHex(colour);
    this.life[i] = 0.34;
    this.span[i] = scale;
  }

  update(dt: number): void {
    for (let i = 0; i < POOL; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;

      const mesh = this.rings[i];
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (this.life[i] <= 0) {
        mesh.visible = false;
        mat.opacity = 0;
        continue;
      }

      // Fast at first then easing out, which is what makes it read as a
      // pressure wave rather than a growing circle.
      const t = 1 - this.life[i] / 0.34;
      const eased = 1 - (1 - t) * (1 - t);
      mesh.scale.setScalar(0.05 + eased * this.span[i]);
      mat.opacity = (1 - t) * 0.85;
    }
  }
}
