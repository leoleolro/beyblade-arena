import * as THREE from 'three';
import { bowlHeight } from '../sim/physics';

/**
 * The X-Rail: a toothed ring around the outer dish.
 *
 * Drawn as a glowing band with radial teeth, because the mechanic depends on
 * the player recognising it as something that *grabs* rather than as decoration.
 * A smooth ring would read like the tornado-ridge guide it sits next to.
 */
export function buildRail(radius: number): THREE.Group {
  const group = new THREE.Group();
  const y = bowlHeight(radius) + 0.012;

  const railMat = new THREE.MeshStandardMaterial({
    color: 0xffb020,
    emissive: 0xff7a00,
    emissiveIntensity: 1.4,
    metalness: 0.7,
    roughness: 0.3,
  });

  const band = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.011, 8, 128), railMat);
  band.rotation.x = Math.PI / 2;
  band.position.y = y;
  group.add(band);

  // Teeth. These are what make it read as a rail rather than a painted line.
  const toothGeo = new THREE.BoxGeometry(0.02, 0.016, 0.05);
  const TEETH = 64;
  for (let i = 0; i < TEETH; i++) {
    const a = (i / TEETH) * Math.PI * 2;
    const tooth = new THREE.Mesh(toothGeo, railMat);
    tooth.position.set(Math.cos(a) * radius, y, Math.sin(a) * radius);
    tooth.rotation.y = -a;
    group.add(tooth);
  }

  return group;
}
