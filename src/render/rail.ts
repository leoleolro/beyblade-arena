import * as THREE from 'three';
import { bowlHeight } from '../sim/physics';
import { metalToonMaterial, setOutline, toonMaterial } from './toon';

/**
 * The X-Rail: a toothed ring around the outer dish.
 *
 * Reported as "i barely saw the x-rail, i know its there, but i just couldnt
 * notice it and it wasnt as cool as i first saw it." Both halves of that are
 * fair, and they are separate problems:
 *
 *  - **Presence.** The first version was a 0.011-radius torus with 64 small
 *    teeth: a hairline against a dish that already carries painted guide rings
 *    and a saturated tornado shelf. It could not win that competition. This one
 *    is a raised bed with chunky teeth that visibly lean into the direction of
 *    travel, so it reads as machinery that *catches* something rather than as
 *    one more ring painted on the floor.
 *  - **Drama.** Engagement had almost no feedback: a top locked on, accelerated
 *    for 0.55s and got slung inward, and nothing announced any of it. The
 *    mechanic exists to manufacture decisive moments, so it now lights the
 *    segment the rider is actually on and that highlight travels with them.
 *
 * There is also an idle pulse running the ring whenever nothing is riding it.
 * That is not decoration: a player who has never engaged the rail has no reason
 * to look at it, and a slow travelling glint is what makes them notice the
 * thing exists before they ever use it.
 *
 * Presentation only — this file knows nothing about the sim beyond the radius
 * it is given and who is currently riding.
 */
export interface RailHandles {
  group: THREE.Group;
  /** Kept for the existing flare path in arena.ts. */
  material: THREE.MeshStandardMaterial;
  /** Baseline emissive, so the flare can return to it exactly. */
  baseEmissive: number;
  /**
   * Per-frame animation. `riderAngles` is the bearing of each top currently
   * locked on, in radians; empty means idle.
   */
  update(dt: number, elapsed: number, riderAngles: number[]): void;
  /** Rebuild materials for the cel themes, which cannot use emissive metal. */
  setToon(toon: boolean): void;
}

/** Teeth around the ring. Enough to read as a rack, few enough to stay chunky. */
const TEETH = 48;

export function buildRail(radius: number): RailHandles {
  const group = new THREE.Group();
  const y = bowlHeight(radius) + 0.012;

  // Warm and hot: the rail is the one aggressive object on the dish and should
  // not share the stadium's blues.
  const railMat = new THREE.MeshStandardMaterial({
    color: 0xffb020,
    emissive: 0xff7a00,
    emissiveIntensity: 1.4,
    metalness: 0.7,
    roughness: 0.3,
  });

  // The bed. A torus with real thickness rather than a hairline, sunk slightly
  // so the teeth stand proud of it instead of floating.
  const bed: THREE.Mesh<THREE.BufferGeometry, THREE.Material> = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.026, 10, 128),
    railMat,
  );
  bed.rotation.x = Math.PI / 2;
  bed.position.y = y;
  group.add(bed);

  // A darker backing ring behind the bed, so the rail has an edge against the
  // dish instead of dissolving into it at low contrast.
  const backMat = new THREE.MeshStandardMaterial({
    color: 0x3a2408,
    metalness: 0.5,
    roughness: 0.8,
  });
  const backing: THREE.Mesh<THREE.BufferGeometry, THREE.Material> = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.042, 8, 96),
    backMat,
  );
  backing.rotation.x = Math.PI / 2;
  backing.position.y = y - 0.012;
  group.add(backing);

  // Teeth. Raked rather than radial: a tooth angled against the direction of
  // travel reads as something that bites, which is the whole mechanic.
  const toothGeo = new THREE.BoxGeometry(0.032, 0.05, 0.075);
  const teeth: THREE.Mesh<THREE.BufferGeometry, THREE.Material>[] = [];
  for (let i = 0; i < TEETH; i++) {
    const a = (i / TEETH) * Math.PI * 2;
    const tooth: THREE.Mesh<THREE.BufferGeometry, THREE.Material> = new THREE.Mesh(
      toothGeo,
      railMat,
    );
    tooth.position.set(Math.cos(a) * radius, y + 0.014, Math.sin(a) * radius);
    tooth.rotation.y = -a + 0.34;
    group.add(tooth);
    teeth.push(tooth);
  }

  /**
   * The travelling highlight. One short arc that is parked invisible when idle
   * and snapped onto the rider's bearing while anyone is locked on — a single
   * reused mesh rather than per-frame geometry, since a ride lasts 0.55s and
   * would otherwise churn a torus every frame.
   */
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xfff0c0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const glow = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.05, 8, 24, 0.9),
    glowMat,
  );
  glow.rotation.x = Math.PI / 2;
  glow.position.y = y + 0.004;
  glow.renderOrder = 2;
  group.add(glow);

  let toonMode = false;

  return {
    group,
    material: railMat,
    baseEmissive: railMat.emissiveIntensity,

    setToon(toon: boolean): void {
      toonMode = toon;
      // Cel themes cannot use emissive metal — there is no bloom to bleed it,
      // so a hot emissive just clips to flat white. Banded metal instead, which
      // is what every other piece of hardware in that theme uses.
      const next = toon
        ? setOutline(metalToonMaterial(0xffb020, { gloss: 40, specular: 0.4, rim: 0.34 }), {
            thickness: 0.016,
          })
        : railMat;
      bed.material = next;
      for (const t of teeth) t.material = next;
      backing.material = toon ? toonMaterial(0x4a2f0c) : backMat;
    },

    update(dt: number, elapsed: number, riderAngles: number[]): void {
      void dt;
      if (riderAngles.length > 0) {
        // Snap to the first rider. With two riders the highlight tracking one
        // of them still reads correctly, and averaging their bearings would
        // put it between the tops where nothing is happening.
        const a = riderAngles[0];
        // Torus sweeps from +X toward +Z in its own frame; after the -90° X
        // rotation that maps to sim bearings running the other way, so the
        // arc is placed by negating and backing off half its own sweep.
        glow.rotation.z = -a - 0.45;
        glowMat.opacity = Math.min(0.95, glowMat.opacity + dt * 9);
      } else {
        // Idle: a slow glint travelling the ring so the rail advertises itself
        // to a player who has never engaged it.
        glow.rotation.z = -elapsed * 1.1;
        const target = toonMode ? 0.3 : 0.22;
        glowMat.opacity += (target - glowMat.opacity) * Math.min(1, dt * 3);
      }
    },
  };
}
