import * as THREE from 'three';
import type { BeyBuild } from '../sim/types';
import { skinMaterial } from './skins';
import type { Skin } from './skins';

/**
 * Builds a top's mesh from its parts, so a build is readable at a glance:
 * the layer's blade count and colour, the disc's bulk, the driver's tip.
 *
 * Returned as a group with the tip at local origin, so the renderer can place
 * it directly on the dish floor and lean the whole assembly for wobble.
 */
export function buildBeyMesh(build: BeyBuild, skin: Skin): THREE.Group {
  const group = new THREE.Group();
  const { layer } = build;
  const r = layer.radius;

  // ---- driver: a slim cone that meets the floor at the group origin --------
  const tipHeight = r * 1.05;
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(r * 0.22, tipHeight, 16),
    new THREE.MeshStandardMaterial({
      color: 0x2a2f3a,
      metalness: 0.85,
      roughness: 0.35,
    }),
  );
  tip.position.y = tipHeight / 2;
  tip.rotation.x = Math.PI; // point downward
  group.add(tip);

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.3, r * 0.3, r * 0.4, 16),
    new THREE.MeshStandardMaterial({
      color: 0x3d4450,
      metalness: 0.7,
      roughness: 0.45,
    }),
  );
  shaft.position.y = tipHeight + r * 0.1;
  group.add(shaft);

  // ---- disc: the heavy middle ---------------------------------------------
  const discHeight = r * 0.46;
  const discY = tipHeight + r * 0.36;
  const discMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.78, r * 0.88, discHeight, 24),
    skinMaterial(skin, skin.secondary),
  );
  discMesh.position.y = discY;
  discMesh.castShadow = true;
  group.add(discMesh);

  // ---- layer: the contact ring, plus one blade per contact point ----------
  const layerY = discY + discHeight * 0.5 + r * 0.2;
  // The layer carries the skin's primary colour. Part identity is still
  // readable from the blade count and silhouette, which the skin doesn't touch.
  const layerMat = skinMaterial(skin, skin.primary);

  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.66, r * 0.78, r * 0.42, 24),
    layerMat,
  );
  core.position.y = layerY;
  core.castShadow = true;
  group.add(core);

  // Blades sit at the collision radius, so what you see is what hits.
  const bladeGeo = new THREE.BoxGeometry(r * 0.5, r * 0.38, r * 0.34);
  for (let i = 0; i < layer.blades; i++) {
    const angle = (i / layer.blades) * Math.PI * 2;
    const blade = new THREE.Mesh(bladeGeo, layerMat);
    blade.position.set(Math.cos(angle) * r * 0.76, layerY, Math.sin(angle) * r * 0.76);
    blade.rotation.y = -angle;
    blade.castShadow = true;
    group.add(blade);
  }

  // A faint energy ring at the exact collision radius — reads as the hitbox.
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(r, r * 0.05, 8, 40),
    new THREE.MeshBasicMaterial({
      color: skin.primary,
      transparent: true,
      opacity: 0.32,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = layerY;
  group.add(ring);

  group.userData.ring = ring;
  group.userData.layerMat = layerMat;
  return group;
}
