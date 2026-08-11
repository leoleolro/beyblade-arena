import * as THREE from 'three';
import type { BeyBuild } from '../sim/types';
import { skinMaterial } from './skins';
import type { Skin } from './skins';
import { emblemTexture, noOutline, setOutline, toonMaterial } from './toon';

/**
 * The tops get a heavier line than the world around them.
 *
 * Anime doesn't ink every object equally — the fighters carry the thickest
 * line and the set behind them is drawn lighter. Giving the beys their own
 * thickness is what stops them from dissolving into the stadium once both are
 * outlined, and it costs nothing: OutlineEffect reads it per material.
 */
const BEY_OUTLINE = 0.02;

/** The three part sub-groups, so a caller can address them individually. */
export interface BeyParts {
  driver: THREE.Group;
  disc: THREE.Group;
  layer: THREE.Group;
}

/**
 * Builds a top's mesh from its parts, so a build is readable at a glance:
 * the layer's blade count and colour, the disc's bulk, the driver's tip.
 *
 * Returned as a group with the tip at local origin, so the renderer can place
 * it directly on the dish floor and lean the whole assembly for wobble.
 *
 * The three parts live in sub-groups sitting at the origin, with the meshes
 * keeping their own offsets. That is deliberately a no-op for the arena — the
 * assembled top renders identically — but it lets the garage pull the parts
 * apart and spin them independently without a second set of meshes.
 */
export function buildBeyMesh(build: BeyBuild, skin: Skin, toon = false): THREE.Group {
  const group = new THREE.Group();
  const driverGroup = new THREE.Group();
  const discGroup = new THREE.Group();
  const layerGroup = new THREE.Group();
  group.add(driverGroup, discGroup, layerGroup);

  const { layer } = build;
  const r = layer.radius;

  // ---- driver: a slim cone that meets the floor at the group origin --------
  const tipHeight = r * 1.05;
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(r * 0.22, tipHeight, 16),
    toon
      ? toonMaterial(0x39405a)
      : new THREE.MeshStandardMaterial({
          color: 0x2a2f3a,
          metalness: 0.85,
          roughness: 0.35,
        }),
  );
  tip.position.y = tipHeight / 2;
  tip.rotation.x = Math.PI; // point downward
  driverGroup.add(tip);

  const driverMat = toon
    ? toonMaterial(0x4a5268)
    : new THREE.MeshStandardMaterial({
        color: 0x3d4450,
        metalness: 0.7,
        roughness: 0.45,
      });
  if (toon) {
    setOutline(tip.material as THREE.Material, { thickness: BEY_OUTLINE });
    setOutline(driverMat, { thickness: BEY_OUTLINE });
  }
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.3, r * 0.3, r * 0.4, 16),
    driverMat,
  );
  shaft.position.y = tipHeight + r * 0.1;
  driverGroup.add(shaft);

  // Fins on the shaft. A plain cylinder is rotationally symmetric, so spinning
  // it produces no visible change at all — the driver looked frozen while it
  // was in fact turning faster than anything else on the top.
  const finGeo = new THREE.BoxGeometry(r * 0.26, r * 0.3, r * 0.07);
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const fin = new THREE.Mesh(finGeo, driverMat);
    fin.position.set(
      Math.cos(angle) * r * 0.3,
      tipHeight + r * 0.1,
      Math.sin(angle) * r * 0.3,
    );
    fin.rotation.y = -angle;
    driverGroup.add(fin);
  }

  // ---- disc: the heavy middle ---------------------------------------------
  const discHeight = r * 0.46;
  const discY = tipHeight + r * 0.36;
  // Six radial segments rather than 24: the flat faces catch the light
  // differently as it turns, which is what makes the rotation readable.
  const discMat = skinMaterial(skin, skin.secondary, { toon });
  if (toon) setOutline(discMat, { thickness: BEY_OUTLINE });
  const discMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.78, r * 0.88, discHeight, 6),
    discMat,
  );
  discMesh.position.y = discY;
  discMesh.castShadow = true;
  discGroup.add(discMesh);

  // Weight blocks around the rim, the disc's equivalent of the layer's blades.
  const weightGeo = new THREE.BoxGeometry(r * 0.2, discHeight * 1.15, r * 0.16);
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const w = new THREE.Mesh(weightGeo, discMat);
    w.position.set(Math.cos(angle) * r * 0.8, discY, Math.sin(angle) * r * 0.8);
    w.rotation.y = -angle;
    w.castShadow = true;
    discGroup.add(w);
  }

  // ---- layer: the contact ring, plus one blade per contact point ----------
  const layerY = discY + discHeight * 0.5 + r * 0.2;
  // The layer carries the skin's primary colour. Part identity is still
  // readable from the blade count and silhouette, which the skin doesn't touch.
  const layerMat = skinMaterial(skin, skin.primary, { toon });
  if (toon) setOutline(layerMat, { thickness: BEY_OUTLINE });

  // Faceted core with a hard bevel. Matching the facet count to the blade count
  // makes the whole layer read as one machined piece rather than a cylinder with
  // things glued to it.
  const facets = Math.max(6, layer.blades * 2);
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.62, r * 0.74, r * 0.34, facets),
    layerMat,
  );
  core.position.y = layerY;
  core.castShadow = true;
  layerGroup.add(core);

  // Underside bevel — the layer tapers into the disc instead of stopping flat.
  const bevel = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.74, r * 0.56, r * 0.16, facets),
    layerMat,
  );
  bevel.position.y = layerY - r * 0.24;
  layerGroup.add(bevel);

  // The centre boss: a raised, faceted crown. This is the part that reads as a
  // "face" at a glance and gives the top an up direction.
  const boss = new THREE.Mesh(
    new THREE.ConeGeometry(r * 0.36, r * 0.3, facets),
    layerMat,
  );
  boss.position.y = layerY + r * 0.3;
  boss.castShadow = true;
  layerGroup.add(boss);

  // The beast emblem. Every real Beyblade has one, and it is the single detail
  // that most says "Beyblade" rather than "spinning shape".
  if (toon) {
    const emblem = new THREE.Mesh(
      new THREE.CircleGeometry(r * 0.46, 24),
      new THREE.MeshBasicMaterial({
        map: emblemTexture(skin.primary, skin.secondary),
        transparent: true,
      }),
    );
    emblem.rotation.x = -Math.PI / 2;
    emblem.position.y = layerY + r * 0.47;
    layerGroup.add(emblem);
  }

  const bossRing = new THREE.Mesh(
    new THREE.TorusGeometry(r * 0.34, r * 0.05, 6, facets),
    layerMat,
  );
  bossRing.rotation.x = Math.PI / 2;
  bossRing.position.y = layerY + r * 0.17;
  layerGroup.add(bossRing);

  // Blades sit at the collision radius, so what you see is what hits.
  //
  // Raked wedges rather than upright boxes: each one is tapered along its length
  // and tilted so it leads with an edge. A blade that visibly cuts into the
  // direction of travel is most of what separates this from a cog.
  const bladeGeo = new THREE.CylinderGeometry(r * 0.055, r * 0.3, r * 0.62, 4);
  for (let i = 0; i < layer.blades; i++) {
    const angle = (i / layer.blades) * Math.PI * 2;
    const blade = new THREE.Mesh(bladeGeo, layerMat);
    blade.position.set(Math.cos(angle) * r * 0.7, layerY, Math.sin(angle) * r * 0.7);

    // Lay the wedge on its side pointing outward, then rake it back against the
    // direction of spin so the leading edge is the thin one.
    blade.rotation.order = 'YZX';
    blade.rotation.y = -angle;
    blade.rotation.z = -Math.PI / 2;
    blade.rotation.x = 0.42;
    blade.castShadow = true;
    layerGroup.add(blade);
  }

  // A faint energy ring at the exact collision radius — reads as the hitbox.
  const ringMat = new THREE.MeshBasicMaterial({
    color: skin.primary,
    transparent: true,
    opacity: 0.32,
  });
  // No ink on the hitbox. A solid black line around a 32%-opacity guide turns a
  // hint into the loudest thing on the top.
  noOutline(ringMat);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.05, 8, 40), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = layerY;
  layerGroup.add(ring);

  group.userData.ring = ring;
  group.userData.layerMat = layerMat;
  group.userData.parts = {
    driver: driverGroup,
    disc: discGroup,
    layer: layerGroup,
  } satisfies BeyParts;
  // Height of each part's centre, so the garage knows where to draw its label.
  group.userData.partY = {
    driver: tipHeight * 0.5,
    disc: discY,
    layer: layerY,
  };
  return group;
}
