import * as THREE from 'three';
import { bowlHeight } from '../sim/physics';
import { noOutline } from './toon';

/**
 * The Spike Pit: the hazard occupying the middle of the dish.
 *
 * A hazard the player cannot see is not a mechanic, it is a bug — so this has
 * to read as *dangerous ground* at a glance, and it has to communicate the two
 * things the physics actually does:
 *
 *  - The drain scales with depth, so the fill is a gradient darkening inward
 *    rather than a flat disc. Where it looks worst is where it is worst.
 *  - The drain needs unbroken dwell time to ramp, so the ring pulses only
 *    while something is actually being drained. A permanently animated hazard
 *    would read as always-on and teach the wrong rule.
 *
 * Drawn flat on the bowl surface rather than as geometry standing in it: the
 * tops orbit through this space constantly, and spikes tall enough to see
 * would occlude the fight they are supposed to be shaping.
 */
export interface PitHandles {
  group: THREE.Group;
  /** Rim ring, pulsed while a top is being drained. */
  ringMaterial: THREE.MeshBasicMaterial;
}

function hazardTexture(): THREE.CanvasTexture {
  const size = 256;
  const mid = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Depth gradient: transparent at the rim, deep red at the centre. This is
    // the drain curve made visible.
    //
    // Tuned against the anime dish, which is near-white — the first pass used
    // muted reds at moderate alpha and simply vanished into it. On a light
    // floor a hazard has to commit.
    const g = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
    g.addColorStop(0, 'rgba(120, 0, 14, 0.96)');
    g.addColorStop(0.35, 'rgba(176, 16, 28, 0.86)');
    g.addColorStop(0.7, 'rgba(206, 44, 40, 0.56)');
    g.addColorStop(0.92, 'rgba(220, 70, 50, 0.2)');
    g.addColorStop(1, 'rgba(220, 70, 50, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(mid, mid, mid, 0, Math.PI * 2);
    ctx.fill();

    // Hazard chevrons pointing inward, fading out before the centre so they
    // never compete with the tops fighting over it.
    ctx.strokeStyle = 'rgba(255, 226, 120, 0.85)';
    ctx.lineWidth = size * 0.026;
    const SPOKES = 12;
    for (let i = 0; i < SPOKES; i++) {
      const a = (i / SPOKES) * Math.PI * 2;
      for (const rr of [0.9, 0.72]) {
        const tip = rr - 0.12;
        ctx.beginPath();
        ctx.moveTo(mid + Math.cos(a - 0.1) * mid * rr, mid + Math.sin(a - 0.1) * mid * rr);
        ctx.lineTo(mid + Math.cos(a) * mid * tip, mid + Math.sin(a) * mid * tip);
        ctx.lineTo(mid + Math.cos(a + 0.1) * mid * rr, mid + Math.sin(a + 0.1) * mid * rr);
        ctx.stroke();
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildPit(radius: number): PitHandles {
  const group = new THREE.Group();

  const floorMat = new THREE.MeshBasicMaterial({
    map: hazardTexture(),
    transparent: true,
    depthWrite: false,
  });
  noOutline(floorMat);

  // Follows the bowl profile instead of lying flat: a flat disc across a
  // curved dish either sinks into it at the rim or floats at the centre.
  //
  // The sign matters and is easy to get backwards: the mesh is rotated -90°
  // about X, which maps local (x, y, z) to world (x, z, -y) — so world height
  // comes from local *z*, positive-up. Negating it buries the hazard under
  // the dish, where it renders as nothing at all.
  const seg = 48;
  const geo = new THREE.CircleGeometry(radius, seg);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, bowlHeight(Math.hypot(x, y)) + 0.006);
  }
  geo.computeVertexNormals();

  const floor = new THREE.Mesh(geo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  // Above the dish paint, below the tops and their contact shadows.
  floor.renderOrder = -3;
  group.add(floor);

  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff5a3c,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  noOutline(ringMat);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.006, 6, 96),
    ringMat,
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = bowlHeight(radius) + 0.004;
  ring.renderOrder = -3;
  group.add(ring);

  return { group, ringMaterial: ringMat };
}
