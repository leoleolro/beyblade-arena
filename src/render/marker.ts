import * as THREE from 'three';

/**
 * The "which one is mine?" problem.
 *
 * Two tops of similar colour circling a dark dish at speed are genuinely hard to
 * tell apart, and a player who loses track of their own top can't make any of
 * the decisions the rest of the game is built around. Layer colour alone isn't
 * enough — the player and the rival can pick similar layers.
 *
 * So ownership gets its own visual language, independent of the build: a ring on
 * the dish beneath the top and a pointer floating above it. The player's is
 * bright and animated; the rival's is dim and static, so the eye is drawn to
 * yours without the rival becoming invisible.
 */

export const PLAYER_MARKER_COLOUR = 0x38bdf8;
export const RIVAL_MARKER_COLOUR = 0xf97316;

export interface Marker {
  group: THREE.Group;
  update(dt: number, radius: number): void;
}

export function buildMarker(isPlayer: boolean, beyRadius: number): Marker {
  const group = new THREE.Group();
  const colour = isPlayer ? PLAYER_MARKER_COLOUR : RIVAL_MARKER_COLOUR;

  // Ring on the dish floor, sitting just proud of the surface.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(beyRadius * 1.35, beyRadius * 1.62, 48),
    new THREE.MeshBasicMaterial({
      color: colour,
      transparent: true,
      opacity: isPlayer ? 0.85 : 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.004;
  group.add(ring);

  // A second ring that pulses outward, but only for the player — the rival
  // doesn't need attention drawn to it.
  let pulse: THREE.Mesh | null = null;
  if (isPlayer) {
    pulse = new THREE.Mesh(
      new THREE.RingGeometry(beyRadius * 1.35, beyRadius * 1.5, 48),
      new THREE.MeshBasicMaterial({
        color: colour,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    pulse.rotation.x = -Math.PI / 2;
    pulse.position.y = 0.005;
    group.add(pulse);
  }

  // Downward pointer floating above, so the top is findable even when the
  // camera angle hides the floor ring behind the rim.
  const pointer = new THREE.Mesh(
    new THREE.ConeGeometry(beyRadius * 0.42, beyRadius * 0.75, 4),
    new THREE.MeshBasicMaterial({
      color: colour,
      transparent: true,
      opacity: isPlayer ? 0.95 : 0.42,
      depthWrite: false,
    }),
  );
  pointer.rotation.x = Math.PI; // point down at the top
  pointer.rotation.y = Math.PI / 4;
  group.add(pointer);

  let t = Math.random() * Math.PI * 2;

  return {
    group,
    update(dt: number, beyR: number): void {
      t += dt;

      // Bob the pointer, and lift it further as the top nears the rim so it
      // clears the wall geometry.
      const lift = 0.26 + Math.max(0, beyR - 0.7) * 0.22;
      pointer.position.y = lift + Math.sin(t * 3) * 0.02;
      pointer.rotation.y = t * 1.2;

      if (pulse) {
        // Expand and fade on a loop, then snap back.
        const phase = (t * 0.9) % 1;
        const s = 1 + phase * 0.85;
        pulse.scale.set(s, s, 1);
        (pulse.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - phase);
      }
    },
  };
}
