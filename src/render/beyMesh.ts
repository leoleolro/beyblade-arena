import * as THREE from 'three';
import type { BeyBuild } from '../sim/types';
import { skinMaterial } from './skins';
import type { Skin } from './skins';
import { metalToonMaterial, noOutline, setOutline, toonMaterial } from './toon';
import type { MetalToonOptions } from './toon';
import { beastEmblem, designByLayer } from './beydex';
import type { BeyDesign, BladeStyle } from './beydex';

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
 *
 * Two entirely separate constructions behind one signature. The classic path
 * is the preserved backup style and must not drift; the toon path rebuilds
 * every part around the anime read (sculpted silhouette, sticker face, metal
 * ring) rather than re-dressing the classic geometry. Sharing meshes between
 * them would force compromises on both, so they share only the contract:
 * userData.parts / partY / ring / layerMat, and the tip at local origin.
 */
export function buildBeyMesh(build: BeyBuild, skin: Skin, toon = false): THREE.Group {
  return toon ? buildToonBey(build, skin) : buildClassicBey(build, skin);
}

// ---------------------------------------------------------------------------
// Classic path — the preserved non-toon style. Do not restyle: this is the
// backup look, kept byte-for-byte equivalent to what it rendered before the
// toon redesign.
// ---------------------------------------------------------------------------

function buildClassicBey(build: BeyBuild, skin: Skin): THREE.Group {
  const group = new THREE.Group();
  const driverGroup = new THREE.Group();
  const discGroup = new THREE.Group();
  const layerGroup = new THREE.Group();
  group.add(driverGroup, discGroup, layerGroup);

  const { layer } = build;
  const r = layer.radius;
  // Classic reads the beydex too.
  //
  // It used to build every layer from the same faceted cylinder in the skin's
  // colour, so swapping beys in this theme changed the blade *count* and
  // nothing else — ten designs rendered as one model in six palettes. The
  // silhouette and palette now come from the design, exactly as in Anime;
  // what stays classic is the *material* treatment (metalness/roughness
  // MeshStandardMaterial, no cel bands, no ink outline), which is what gives
  // this theme its character. The stadium and lighting are untouched.
  const design = designByLayer(layer.id);

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
  driverGroup.add(tip);

  const driverMat = new THREE.MeshStandardMaterial({
    color: 0x3d4450,
    metalness: 0.7,
    roughness: 0.45,
  });
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
  const discMat = skinMaterial(skin, design.secondary);
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
  // The layer carries the *design's* colour; the skin still owns the hit ring
  // and the trail, so "which bey is that" and "whose is it" stay separable.
  const layerMat = skinMaterial(skin, design.primary);

  const facets = Math.max(6, layer.blades * 2);

  // The design's own silhouette, extruded — the same 2D profile the Anime
  // theme cuts, in a metallic material rather than a cel one. This is what
  // makes a Fafnir read as a rounded spin-steal shield and a Valtryek as a
  // three-winged attacker in *both* themes.
  const coreGeo = new THREE.ExtrudeGeometry(
    bladeSilhouette(layer.blades, r, design.blade),
    { depth: r * 0.34, bevelEnabled: true, bevelThickness: r * 0.05,
      bevelSize: r * 0.04, bevelOffset: 0, bevelSegments: 2, curveSegments: 8 },
  );
  const core = new THREE.Mesh(coreGeo, layerMat);
  core.rotation.x = -Math.PI / 2;
  core.position.y = layerY - r * 0.17;
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
  const accentMat = skinMaterial(skin, design.accent);
  const boss = new THREE.Mesh(
    new THREE.ConeGeometry(r * 0.36, r * 0.3, facets),
    accentMat,
  );
  boss.position.y = layerY + r * 0.3;
  boss.castShadow = true;
  layerGroup.add(boss);

  const bossRing = new THREE.Mesh(
    new THREE.TorusGeometry(r * 0.34, r * 0.05, 6, facets),
    accentMat,
  );
  bossRing.rotation.x = Math.PI / 2;
  bossRing.position.y = layerY + r * 0.17;
  layerGroup.add(bossRing);

  // The blades are the extruded silhouette above, not glued-on wedges — which
  // is exactly why swapping designs now changes the shape in this theme.

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

// ---------------------------------------------------------------------------
// Toon path — the anime construction.
// ---------------------------------------------------------------------------

/**
 * Burst proportions, as fractions of the layer radius. Real Burst hardware is
 * wide and squat — a 45 mm layer on a ~35 mm-tall body — and the camera sits
 * 34° above horizontal, so most of what the player ever sees is the top face.
 * The classic stack is ~2.3 radii tall, which under this camera reads as a
 * chess piece; the toon stack tops out at 1.15 radii so the layer dominates.
 *
 * The stack is built tip-up with ~0.01r of deliberate interpenetration at each
 * joint: cel shading has no ambient occlusion to swallow hairline gaps, so any
 * daylight between parts reads as a broken toy.
 */
const TOON = {
  tipH: 0.4,
  discY: 0.78,
  layerBottom: 0.85,
  layerDepth: 0.3,
} as const;

function buildToonBey(build: BeyBuild, skin: Skin): THREE.Group {
  const group = new THREE.Group();
  const driverGroup = new THREE.Group();
  const discGroup = new THREE.Group();
  const layerGroup = new THREE.Group();
  group.add(driverGroup, discGroup, layerGroup);

  const r = build.layer.radius;
  const blades = build.layer.blades;
  // The layer's look comes from its canonical design, not the skin: Valtryek
  // is blue-and-gold whoever throws it. The skin keeps the slots that carry
  // *ownership* — trail, aura, blur tint, hit ring, HUD swatch — so the two
  // systems answer different questions: "which bey is that?" vs "whose is it?".
  const design = designByLayer(build.layer.id);

  buildToonDriver(driverGroup, build.driver.id, r);
  const discY = buildToonDisc(discGroup, build.disc.id, r);

  // ---- energy layer: tiered, bevelled construction -------------------------
  //
  // "It's a flat piece still... from a side view the blades shouldn't be just
  // a straight vertical line" — correct, and the reference hardware agrees.
  // Real layers are a STACK: a translucent under-ring peeking out beneath the
  // main blades, a main blade tier whose walls curve (moulded plastic swells
  // at the waist), and for some designs a raised armor crest above the face.
  const layerBottom = r * TOON.layerBottom;
  const layerDepth = r * TOON.layerDepth;
  const layerY = layerBottom + layerDepth / 2;

  // Side walls keep the skin pipeline's finish but wear the design's colour;
  // this is also the material the arena flashes on hits, so it is the one
  // exported as layerMat.
  // `design.metal` marks the bare-metal layers (Steel Leon, Cobalt Drake),
  // whose side walls are brushed steel rather than moulded plastic — they take
  // the banded highlight and rim; every other design's walls stay flat.
  const sideMat = setOutline(
    skinMaterial(skin, design.primary, { toon: true, metal: design.metal }),
    { thickness: BEY_OUTLINE },
  );
  // The face is unlit for the same reason the dish is: anime stickers are
  // flat-printed, and a cel band crawling across the emblem as the top wobbles
  // reads as a rendering artefact, not shading.
  const faceMat = new THREE.MeshBasicMaterial({
    map: layerFaceTexture(design, blades, r),
  });
  // No hull on the cap: OutlineEffect would float a copy of this flat face
  // 0.02 above the sticker, which flashes black at low camera angles (garage
  // orbit, deep wobble). The side-wall hull already inks the silhouette.
  noOutline(faceMat);

  // The curved wall. Bevel geometry facts, from three's source: with
  // bevelOffset 0 the CAPS keep the original contour — so the face texture's
  // ±r mapping survives — while the wall between them expands by bevelSize at
  // the shape plane. The profile therefore swells at the waist and tucks back
  // in at the face and the underside: a moulded edge, not an extruded slab.
  const bevelT = layerDepth * 0.16;
  const mainDepth = layerDepth - bevelT * 2;
  // ExtrudeGeometry material groups: index 0 is the caps, index 1 the walls
  // (bevel faces belong to the walls).
  const geo = new THREE.ExtrudeGeometry(bladeSilhouette(blades, r, design.blade), {
    depth: mainDepth,
    bevelEnabled: true,
    bevelThickness: bevelT,
    bevelSize: r * 0.04,
    bevelOffset: 0,
    bevelSegments: 3,
    curveSegments: 10,
  });
  const layerMesh = new THREE.Mesh(geo, [faceMat, sideMat]);
  // Extrusion runs along local +z; this maps it to +y so the cap faces the
  // camera. It mirrors the profile in plan view, but the face texture is
  // authored in the same shape space, so paint and geometry mirror together.
  layerMesh.rotation.x = -Math.PI / 2;
  // The bottom bevel dips bevelT below the mesh origin.
  layerMesh.position.y = layerBottom + bevelT;
  layerMesh.castShadow = true;
  layerGroup.add(layerMesh);

  // Surface hardware on the blade faces. The edge grammar changed the
  // outline; without this the faces stay flat colour and the layer still
  // reads as a printed disc rather than a moulded part.
  addBladeDetail(layerGroup, design, blades, r, layerBottom + layerDepth);

  // The under-ring tier: a thinner, blunter silhouette in its own colour,
  // rotated a half blade-step so its blades peek out of the main tier's
  // cutaways. This is most of the side-view "layered hardware" read, and the
  // half-step stagger is what the reference art does — the under-blades fill
  // the gaps, they don't hide behind the uppers.
  if (design.underRing !== undefined) {
    // The under-tier is deliberately a *softer* cut of the same grammar: same
    // edge language so the two tiers read as one design, blunter numbers so
    // it reads as the structural layer underneath rather than a second set of
    // blades competing with the first.
    const underStyle: BladeStyle = {
      root: Math.min(0.92, design.blade.root + 0.1),
      belly: design.blade.belly * 0.7,
      cut: design.blade.cut * 0.5,
      edge: design.blade.edge,
    };
    const underDepth = layerDepth * 0.38;
    // Slight emissive lift fakes translucency — cel shading has no
    // transmission, but translucent plastic reads as "lit from inside".
    const underMat = setOutline(
      toonMaterial(design.underRing, 0.22),
      { thickness: BEY_OUTLINE * 0.7 },
    );
    const underGeo = new THREE.ExtrudeGeometry(
      bladeSilhouette(blades, r * 0.97, underStyle),
      { depth: underDepth, bevelEnabled: false, curveSegments: 8 },
    );
    const under = new THREE.Mesh(underGeo, underMat);
    under.rotation.x = -Math.PI / 2;
    under.rotation.z = Math.PI / blades; // the half-step stagger
    under.position.y = layerBottom - underDepth * 0.55;
    under.castShadow = true;
    layerGroup.add(under);
  }

  // Raised armor crest: an extruded gold X spanning the face. Geometry rather
  // than paint because the reference's crest visibly stands off the layer —
  // it catches its own outline and its own cel band.
  if (design.crest === 'xsword') {
    // Gold armour, not painted plastic: the crest is the loudest piece of
    // hardware on the top and the one the eye lands on first, so it carries
    // the metal treatment even on a plastic design.
    const crestMat = setOutline(
      metalToonMaterial(design.accent, { ...LAYER_METAL, emissive: 0.12 }),
      { thickness: BEY_OUTLINE * 0.7 },
    );
    const crest = new THREE.Mesh(
      new THREE.ExtrudeGeometry(xCrestShape(r), {
        depth: r * 0.07,
        bevelEnabled: false,
        curveSegments: 4,
      }),
      crestMat,
    );
    crest.rotation.x = -Math.PI / 2;
    crest.position.y = layerBottom + layerDepth;
    crest.castShadow = true;
    layerGroup.add(crest);
  }

  // A faint energy ring at the exact collision radius — reads as the hitbox,
  // and carries the OWNER's colour (see the design/skin split above).
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
  group.userData.layerMat = sideMat;
  group.userData.parts = {
    driver: driverGroup,
    disc: discGroup,
    layer: layerGroup,
  } satisfies BeyParts;
  // Height of each part's centre, so the garage knows where to draw its label.
  group.userData.partY = {
    driver: r * TOON.tipH * 0.8,
    disc: discY,
    layer: layerY,
  };
  return group;
}

/** Toon material with the bey-weight outline, in one call. Plastic. */
const inked = (colour: number, emissive = 0): THREE.Material =>
  setOutline(toonMaterial(colour, emissive), { thickness: BEY_OUTLINE });

/**
 * Which parts get the metal treatment, and why it is only some of them.
 *
 * A Burst top is mostly plastic. The forge disc is the one part that is
 * genuinely machined metal, and the layer's accent hardware — contact chips,
 * armour crests, raised bands — is plated jewellery bolted onto plastic.
 * Everything else keeps the flat `toonMaterial`. That contrast IS the effect:
 * a top where every surface carries a specular chip reads as chrome-plated,
 * which is both wrong and, worse, stops saying "this bit is metal" about
 * anything.
 *
 * Two profiles, because the families are different objects. The disc is a big
 * flat machined face, so its highlight is a small hard chip. Layer hardware is
 * small and curved, and a disc-tight lobe on it strobes as the top spins —
 * softer gloss, stronger rim, since at 34° the rim is most of what is visible.
 */
const DISC_METAL: MetalToonOptions = { gloss: 56, specular: 0.36, rim: 0.26 };
const LAYER_METAL: MetalToonOptions = { gloss: 34, specular: 0.3, rim: 0.32 };

/** Forge-disc material: cel metal with the bey-weight outline, in one call. */
const forged = (colour: number, emissive = 0): THREE.Material =>
  setOutline(metalToonMaterial(colour, { ...DISC_METAL, emissive }), {
    thickness: BEY_OUTLINE,
  });

/**
 * Drivers, each with the real part's silhouette.
 *
 * Six ids, six genuinely different shapes — the user's complaint that drove
 * this was that swapping a driver "does not look like it changed much". The
 * distinguishing features come from the researched hardware: Xtreme's wide
 * rubber puck, Volcanic's knurled free-tip collar, Atomic's ball-and-skirt,
 * Orbit's tight-collared ball, Needle's studded point, Bastion's pot-lid
 * flange. Colours are the parts' own — drivers are hardware, not cosmetics,
 * so they do not take the skin.
 */
function buildToonDriver(parent: THREE.Group, driverId: string, r: number): void {
  const tipH = r * TOON.tipH;

  switch (driverId) {
    case 'xtreme': {
      // Short wide cone into the widest contact tip of the set: a broad flat
      // blue rubber puck.
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.3, r * 0.2, tipH * 0.8, 12),
        inked(0xdfe3e8),
      );
      body.position.y = tipH * 0.6;
      parent.add(body);
      const puck = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.24, r * 0.28, tipH * 0.4, 16),
        inked(0x2b6fd4, 0.08),
      );
      puck.position.y = tipH * 0.2;
      parent.add(puck);
      break;
    }
    case 'volcanic': {
      // Taller than standard; a small flat tip under a knurled friction ring
      // with a visible seam — drawn as an actual ring.
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.28, r * 0.16, tipH * 0.9, 12),
        inked(0xe8681f, 0.1),
      );
      body.position.y = tipH * 0.65;
      parent.add(body);
      const collar = new THREE.Mesh(
        new THREE.TorusGeometry(r * 0.17, r * 0.05, 8, 8),
        inked(0xc23c22),
      );
      collar.rotation.x = Math.PI / 2;
      collar.position.y = tipH * 0.28;
      parent.add(collar);
      const tip = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.1, r * 0.13, tipH * 0.24, 10),
        inked(0xc23c22),
      );
      tip.position.y = tipH * 0.1;
      parent.add(tip);
      break;
    }
    case 'atomic': {
      // The planet-with-a-collar: a big exposed ball under a wide flaring
      // skirt ring that reaches past the cone body.
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.26, r * 0.18, tipH * 0.6, 12),
        inked(0xefece4),
      );
      body.position.y = tipH * 0.72;
      parent.add(body);
      const skirt = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.34, r * 0.42, tipH * 0.22, 16),
        inked(0xb8383d, 0.06),
      );
      skirt.position.y = tipH * 0.42;
      parent.add(skirt);
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(r * 0.16, 12, 10),
        inked(0xefece4),
      );
      ball.position.y = tipH * 0.16;
      parent.add(ball);
      break;
    }
    case 'orbit': {
      // Atomic's slimmer sibling: smaller ball, tight three-tab collar, no
      // skirt — a straight conical silhouette.
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.26, r * 0.15, tipH * 0.75, 12),
        inked(0xf0eee8),
      );
      body.position.y = tipH * 0.62;
      parent.add(body);
      const collarMat = inked(0x2e8b8b);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const tab = new THREE.Mesh(
          new THREE.BoxGeometry(r * 0.08, tipH * 0.2, r * 0.06),
          collarMat,
        );
        tab.position.set(Math.cos(a) * r * 0.11, tipH * 0.26, Math.sin(a) * r * 0.11);
        tab.rotation.y = -a;
        parent.add(tab);
      }
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(r * 0.11, 10, 8),
        inked(0xf0eee8),
      );
      ball.position.y = tipH * 0.12;
      parent.add(ball);
      break;
    }
    case 'needle': {
      // Narrowest contact of the set: a studded point — the studs are real
      // little spheres because at this scale a bump map would vanish.
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.26, r * 0.1, tipH * 0.85, 10),
        inked(0x6b4fa0, 0.08),
      );
      body.position.y = tipH * 0.55;
      parent.add(body);
      const point = new THREE.Mesh(
        new THREE.ConeGeometry(r * 0.09, tipH * 0.3, 8),
        inked(0x6b4fa0),
      );
      point.rotation.x = Math.PI;
      point.position.y = tipH * 0.15;
      parent.add(point);
      const studMat = inked(0x8f74c4);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const stud = new THREE.Mesh(new THREE.SphereGeometry(r * 0.03, 6, 5), studMat);
        stud.position.set(Math.cos(a) * r * 0.08, tipH * 0.22, Math.sin(a) * r * 0.08);
        parent.add(stud);
      }
      break;
    }
    case 'bastion':
    default: {
      // Squat and armoured: ball tip, four chunky tabs, and the pot-lid — a
      // fixed horizontal flange wider than the cone itself.
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.28, r * 0.2, tipH * 0.6, 12),
        inked(0xd4a017, 0.08),
      );
      body.position.y = tipH * 0.72;
      parent.add(body);
      const flange = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.46, r * 0.46, tipH * 0.12, 16),
        inked(0xb8860b),
      );
      flange.position.y = tipH * 0.46;
      parent.add(flange);
      const tabMat = inked(0xb8860b);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const tab = new THREE.Mesh(
          new THREE.BoxGeometry(r * 0.1, tipH * 0.26, r * 0.09),
          tabMat,
        );
        tab.position.set(Math.cos(a) * r * 0.18, tipH * 0.26, Math.sin(a) * r * 0.18);
        tab.rotation.y = -a;
        parent.add(tab);
      }
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(r * 0.12, 10, 8),
        inked(0xd4a017),
      );
      ball.position.y = tipH * 0.12;
      parent.add(ball);
      break;
    }
  }
}

/**
 * Forge discs. Same rule as the drivers: six ids, six silhouettes, colours
 * from the researched metal tones. Returns the disc's centre height for
 * `partY`, since the shapes differ enough that one constant no longer covers
 * them.
 */
function buildToonDisc(parent: THREE.Group, discId: string, r: number): number {
  const discY = r * TOON.discY;

  switch (discId) {
    case 'heavy': {
      // Compact thick ring, mass packed at the centre, four armour bosses.
      const ringMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.62, r * 0.58, r * 0.2, 16),
        forged(0xa8adb4, 0.06),
      );
      ringMesh.position.y = discY;
      ringMesh.castShadow = true;
      parent.add(ringMesh);
      const bossMat = forged(0x878d96);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const boss = new THREE.Mesh(
          new THREE.BoxGeometry(r * 0.16, r * 0.06, r * 0.12),
          bossMat,
        );
        boss.position.set(Math.cos(a) * r * 0.42, discY + r * 0.1, Math.sin(a) * r * 0.42);
        boss.rotation.y = -a;
        parent.add(boss);
      }
      break;
    }
    case 'gravity': {
      // The octagon: eight straight facets, rim-heavy flywheel band, thinner
      // than Heavy. The 8-segment cylinder IS the octagonal silhouette.
      const plate = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.74, r * 0.72, r * 0.12, 8),
        forged(0xb9bec5, 0.06),
      );
      plate.position.y = discY;
      plate.castShadow = true;
      parent.add(plate);
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.36, r * 0.34, r * 0.16, 8),
        forged(0x9aa1ab),
      );
      hub.position.y = discY;
      parent.add(hub);
      break;
    }
    case 'spread': {
      // The discus: widest and flattest, tapering to a knife edge — two
      // shallow cones back to back.
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.4, r * 0.8, r * 0.07, 24),
        forged(0xc6cad1, 0.08),
      );
      top.position.y = discY + r * 0.035;
      top.castShadow = true;
      parent.add(top);
      const bottom = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.8, r * 0.4, r * 0.07, 24),
        forged(0xb3b9c2),
      );
      bottom.position.y = discY - r * 0.035;
      parent.add(bottom);
      break;
    }
    case 'blitz': {
      // Rounded-triangular core with three blade flaps flaring at the
      // corners — the attacking disc visibly wants to hit things.
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.56, r * 0.52, r * 0.14, 3),
        forged(0xb0b5bc, 0.06),
      );
      core.position.y = discY;
      core.castShadow = true;
      parent.add(core);
      const flapMat = forged(0xd94840);
      for (let i = 0; i < 3; i++) {
        // CylinderGeometry's 3 segments put corners at these angles; the flaps
        // must ride the corners, not the flats, to read as extensions of them.
        const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
        const flap = new THREE.Mesh(
          new THREE.BoxGeometry(r * 0.26, r * 0.08, r * 0.14),
          flapMat,
        );
        flap.position.set(Math.cos(a) * r * 0.58, discY, Math.sin(a) * r * 0.58);
        flap.rotation.y = -a + 0.35; // raked, like a swinging flap caught mid-flare
        parent.add(flap);
      }
      break;
    }
    case 'wall':
    default: {
      // Six shield lobes bulging outward and upward — a raised defensive wall,
      // clearly the tallest band of the five.
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.56, r * 0.52, r * 0.14, 12),
        forged(0x9ba1a9, 0.05),
      );
      base.position.y = discY;
      base.castShadow = true;
      parent.add(base);
      const lobeMat = forged(0x8a9099);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const lobe = new THREE.Mesh(new THREE.SphereGeometry(r * 0.14, 10, 8), lobeMat);
        lobe.scale.set(1, 0.85, 0.8);
        lobe.position.set(Math.cos(a) * r * 0.52, discY + r * 0.05, Math.sin(a) * r * 0.52);
        lobe.rotation.y = -a;
        parent.add(lobe);
      }
      break;
    }
  }

  return discY;
}

/**
 * Surface hardware on the blade faces.
 *
 * The edge grammar gave each layer its own outline, but the faces were still
 * flat colour with painted ring lines — so from above a top read as a printed
 * disc rather than a moulded part. Real hardware breaks its faces up: ridges
 * running out along each blade, slots cut into the plastic, plates that
 * overlap. Cel shading rewards this more than a lit renderer would, because
 * `OutlineEffect` inks every one of these pieces individually.
 *
 * The detail follows the *edge grammar* rather than being a separate field —
 * a scalloped layer with hard machined ridges on it would read as two designs
 * bolted together. Each treatment is the natural surface for its outline:
 *
 *  - `blade` raised radial ridges, tapering out along the blade. Machined.
 *  - `wave`  recessed slots following the scallop. Vented plastic.
 *  - `hook`  overlapping plates stepping outward. Scaled and organic.
 *  - `flame` swept fins raked back against the spin. Blown backwards.
 *
 * Everything sits strictly inside the contact radius, so `what you see is what
 * hits` still holds — none of this widens the silhouette the sim collides on.
 */
function addBladeDetail(
  parent: THREE.Group,
  design: BeyDesign,
  blades: number,
  r: number,
  faceY: number,
): void {
  const step = (Math.PI * 2) / blades;
  // A step darker than the plastic, so the hardware reads as a change in
  // surface rather than as a second colour competing with the design.
  const dark = new THREE.Color(design.primary).multiplyScalar(0.62).getHex();
  const light = new THREE.Color(design.primary)
    .lerp(new THREE.Color(0xffffff), 0.3)
    .getHex();
  // Ridges, slots, plates and fins are the surface of whatever the blade is
  // made of — plastic on most designs, steel on a `metal: true` one — so they
  // follow the wall rather than picking a treatment of their own. Getting this
  // wrong is what would turn a moulded Valtryek wing into chrome.
  const surface = (c: number, emissive = 0): THREE.Material =>
    design.metal
      ? metalToonMaterial(c, { ...LAYER_METAL, emissive })
      : toonMaterial(c, emissive);

  const detailMat = setOutline(surface(dark), { thickness: BEY_OUTLINE * 0.55 });
  // Contact chips, bands and outer plates are the layer's jewellery: plated
  // hardware on every design, so these are metal unconditionally. They are also
  // the pieces that strike, which puts the highlight exactly where the eye
  // already is during a clash.
  const accentMat = setOutline(
    metalToonMaterial(design.accent, { ...LAYER_METAL, emissive: 0.1 }),
    { thickness: BEY_OUTLINE * 0.55 },
  );
  const liftMat = setOutline(surface(light), { thickness: BEY_OUTLINE * 0.55 });

  for (let i = 0; i < blades; i++) {
    const a = i * step;

    switch (design.blade.edge) {
      case 'blade': {
        // Two ridges per blade, the outer one shorter, both raked to sit on
        // the blade rather than in the gap between blades.
        for (const [frac, len, wide] of [
          [0.3, 0.34, 0.05],
          [0.46, 0.22, 0.035],
        ] as const) {
          const ang = a + step * frac;
          const mid = r * 0.68;
          const ridge = new THREE.Mesh(
            new THREE.BoxGeometry(r * len, r * 0.05, r * wide),
            detailMat,
          );
          ridge.position.set(Math.cos(ang) * mid, faceY, Math.sin(ang) * mid);
          ridge.rotation.y = -ang;
          parent.add(ridge);
        }
        // A bright chip at the contact point — the bit that actually strikes.
        const tipAng = a + step * 0.5;
        const chip = new THREE.Mesh(
          new THREE.BoxGeometry(r * 0.1, r * 0.06, r * 0.12),
          accentMat,
        );
        chip.position.set(Math.cos(tipAng) * r * 0.86, faceY, Math.sin(tipAng) * r * 0.86);
        chip.rotation.y = -tipAng;
        parent.add(chip);
        break;
      }

      case 'wave': {
        // Slots cut along the scallop. Cylinders rather than boxes so the
        // vents curve with the surface they sit in.
        for (const frac of [0.34, 0.5, 0.66]) {
          const ang = a + step * frac;
          const slot = new THREE.Mesh(
            new THREE.CylinderGeometry(r * 0.045, r * 0.045, r * 0.05, 8),
            detailMat,
          );
          slot.position.set(Math.cos(ang) * r * 0.72, faceY, Math.sin(ang) * r * 0.72);
          parent.add(slot);
        }
        // A raised band arcing across the lobe, tying the vents together.
        const band = new THREE.Mesh(
          new THREE.TorusGeometry(r * 0.58, r * 0.028, 6, 10, step * 0.7),
          accentMat,
        );
        band.rotation.x = Math.PI / 2;
        band.rotation.z = -(a + step * 0.15);
        band.position.y = faceY;
        parent.add(band);
        break;
      }

      case 'hook': {
        // Overlapping plates stepping outward, each a little higher than the
        // last, so the face reads as scaled rather than smooth.
        for (let k = 0; k < 3; k++) {
          const ang = a + step * (0.26 + k * 0.13);
          const rad = r * (0.56 + k * 0.11);
          const plate = new THREE.Mesh(
            new THREE.BoxGeometry(r * 0.16, r * 0.04 + k * r * 0.012, r * 0.1),
            k === 2 ? accentMat : detailMat,
          );
          plate.position.set(Math.cos(ang) * rad, faceY + k * r * 0.012, Math.sin(ang) * rad);
          plate.rotation.y = -ang + 0.24;
          parent.add(plate);
        }
        break;
      }

      case 'flame': {
        // Fins raked back against the direction of the lick, so the surface
        // agrees with the outline about which way the flame is blowing.
        for (let k = 0; k < 3; k++) {
          const ang = a + step * (0.24 + k * 0.16);
          const rad = r * (0.6 + k * 0.08);
          const fin = new THREE.Mesh(
            new THREE.BoxGeometry(r * 0.22 - k * r * 0.04, r * 0.05, r * 0.03),
            k === 1 ? liftMat : detailMat,
          );
          fin.position.set(Math.cos(ang) * rad, faceY, Math.sin(ang) * rad);
          // Raked progressively harder along the lick.
          fin.rotation.y = -ang - 0.3 - k * 0.16;
          parent.add(fin);
        }
        break;
      }
    }
  }
}

/**
 * The raised X crest: four flared arms at the diagonals, as one closed shape.
 * Arm proportions follow the reference art — arms reach just past the chip
 * bezel and the tips flare wider than the shafts.
 */
function xCrestShape(r: number): THREE.Shape {
  const shape = new THREE.Shape();
  const armLen = r * 0.56;
  const shaftHalf = r * 0.07;
  const tipHalf = r * 0.13;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    // Perpendicular for the arm's width.
    const pxn = -sin;
    const pyn = cos;
    const rootR = r * 0.1;
    const p = (along: number, side: number): [number, number] => [
      cos * along + pxn * side,
      sin * along + pyn * side,
    ];
    const [x0, y0] = p(rootR, -shaftHalf);
    const [x1, y1] = p(armLen * 0.72, -shaftHalf);
    const [x2, y2] = p(armLen, -tipHalf);
    const [x3, y3] = p(armLen, tipHalf);
    const [x4, y4] = p(armLen * 0.72, shaftHalf);
    const [x5, y5] = p(rootR, shaftHalf);
    if (i === 0) shape.moveTo(x0, y0);
    else shape.lineTo(x0, y0);
    shape.lineTo(x1, y1);
    shape.lineTo(x2, y2);
    shape.lineTo(x3, y3);
    shape.lineTo(x4, y4);
    shape.lineTo(x5, y5);
  }
  shape.closePath();
  return shape;
}

/**
 * The layer's blade profile: `blades` sweeping wedges around a core circle,
 * shaped by the design's BladeStyle. The silhouette IS the design — Burst
 * layers are recognised by their cut-out — so the three style numbers move it
 * from Valtryek's aggressive pinwheel (low root, deep cut) to Fafnir's
 * near-circular spin-steal shield (high root, nub-shallow everything) without
 * changing the curve grammar.
 *
 * Per sector of width step = 2π/blades, anchored at angle a (polar → xy):
 *   root out:  (root, a)
 *   leading:   quadratic to (r, a+0.46·step) — control radius scales with
 *              `belly`, outside the chord so the edge bulges outward
 *   tip:       quadratic to (r, a+0.64·step) — an arc approximation good to
 *              <1% over this span
 *   trailing:  quadratic to (root, a+step) — control radius dips toward the
 *              centre with `cut`, the concave undercut
 *
 * Every ratio is of `step`, so the same math holds from Ragnaruk's 2 blades
 * to Aegis's 8. Peak radius is exactly r: what you see is what hits.
 */
export function bladeSilhouette(blades: number, r: number, style: BladeStyle): THREE.Shape {
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / blades;
  const root = r * style.root;
  const px = (rad: number, ang: number): number => Math.cos(ang) * rad;
  const py = (rad: number, ang: number): number => Math.sin(ang) * rad;
  const pt = (rad: number, ang: number): [number, number] => [px(rad, ang), py(rad, ang)];

  const leadR = root + (r - root) * 0.92 * style.belly;
  const cutR = root - (r - root) * 0.32 * style.cut;

  for (let i = 0; i < blades; i++) {
    const a = i * step;
    if (i === 0) shape.moveTo(px(root, a), py(root, a));
    else shape.lineTo(px(root, a), py(root, a));

    switch (style.edge) {
      case 'blade': {
        // Cut metal: a straight run out to a hard point, a short flat at the
        // contact radius, then a deep concave undercut. The straight leading
        // line is the whole character — any curve on it reads as moulded
        // plastic instead of a machined edge.
        shape.lineTo(...pt(leadR, a + step * 0.14));
        shape.lineTo(...pt(r, a + step * 0.44));
        shape.lineTo(...pt(r, a + step * 0.58));
        shape.quadraticCurveTo(...pt(cutR, a + step * 0.82), ...pt(root, a + step));
        break;
      }

      case 'wave': {
        // Moulded plastic: one continuous scallop with no corner anywhere.
        // Both control points sit outside their chords, so the profile swells
        // out and settles back without ever pinching — the defensive read.
        const midR = (leadR + r) / 2;
        shape.quadraticCurveTo(...pt(midR, a + step * 0.18), ...pt(r, a + step * 0.5));
        shape.quadraticCurveTo(
          ...pt(midR, a + step * 0.82),
          ...pt(root, a + step),
        );
        break;
      }

      case 'hook': {
        // A claw. The edge bulges past the contact radius early, then curls
        // back *inside* it before the undercut, so each blade finishes with a
        // visible barb rather than a tip.
        shape.quadraticCurveTo(
          ...pt(leadR, a + step * 0.16),
          ...pt(r, a + step * 0.42),
        );
        shape.quadraticCurveTo(
          ...pt(r * 1.0, a + step * 0.54),
          ...pt(r * 0.86, a + step * 0.64),
        );
        // The barb: a short reverse curve tucking under the tip.
        shape.quadraticCurveTo(
          ...pt(r * 0.95, a + step * 0.7),
          ...pt(cutR, a + step * 0.86),
        );
        shape.quadraticCurveTo(...pt(cutR, a + step * 0.94), ...pt(root, a + step));
        break;
      }

      case 'flame': {
        // Asymmetric lick: a long slow rise and a short sharp fall, so the
        // whole profile looks blown backwards. Three rising control points
        // rather than one is what keeps the rise from reading as a plain arc.
        shape.quadraticCurveTo(
          ...pt(root + (r - root) * 0.45, a + step * 0.12),
          ...pt(root + (r - root) * 0.72, a + step * 0.3),
        );
        shape.quadraticCurveTo(
          ...pt(leadR, a + step * 0.46),
          ...pt(r, a + step * 0.62),
        );
        // The fall: short, and cutting well inside the root for the notch
        // between licks.
        shape.quadraticCurveTo(
          ...pt(r * 0.72, a + step * 0.74),
          ...pt(cutR, a + step * 0.84),
        );
        shape.quadraticCurveTo(...pt(root * 0.98, a + step * 0.93), ...pt(root, a + step));
        break;
      }
    }
  }
  shape.closePath();
  return shape;
}

/**
 * The sticker face: one canvas across the whole top cap, in the design's own
 * colours with its beast crest at the centre.
 *
 * ExtrudeGeometry generates cap UVs as the raw shape-space x/y, so the
 * texture's repeat/offset maps [-r, r]² onto [0, 1]² and the canvas is drawn
 * in that same space (setTransform flips y so math angles match the shape).
 * The chain cancels exactly: a mark painted at polar (rad, θ) lands on the
 * geometry at polar (rad, θ), which is what lets the speed ticks below sit on
 * the actual blades instead of drifting off them.
 *
 * Paint order is radial because that is how the real stickers are die-cut:
 * secondary blade tips, primary body disc, accent ring, thin near-black ring
 * lines (die-cut seams), one white tick per blade, and the beast crest across
 * the centre.
 */
function layerFaceTexture(design: BeyDesign, blades: number, r: number): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const scale = size / (2 * r);
    ctx.setTransform(scale, 0, 0, -scale, size / 2, size / 2);
    const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

    // Base coat = blade tips; only the region outside the body disc survives.
    //
    // Metal designs take a darkened steel rather than `secondary`: on those,
    // `secondary` is the *detail* colour (the lion's eyes, the drake's flame)
    // and painting the blade tips with it turned a brushed-steel layer into a
    // blue-and-white one.
    const tipCol = design.metal
      ? `#${new THREE.Color(design.primary).multiplyScalar(0.62).getHexString()}`
      : hex(design.secondary);
    ctx.fillStyle = tipCol;
    ctx.fillRect(-r, -r, 2 * r, 2 * r);

    // Body disc, lifted toward white: the face is unlit, so any brightness the
    // "plastic" is going to have must be painted in here.
    const bodyCol = new THREE.Color(design.primary).lerp(new THREE.Color(0xffffff), 0.16);
    ctx.fillStyle = `#${bodyCol.getHexString()}`;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
    ctx.fill();

    // One white speed tick per blade, riding the leading sweep. Angles reuse
    // the silhouette's step fractions so the ticks stay on the blade wedges
    // for any blade count.
    const step = (Math.PI * 2) / blades;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < blades; i++) {
      const a = i * step;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a + step * 0.26) * r * 0.75, Math.sin(a + step * 0.26) * r * 0.75);
      ctx.lineTo(Math.cos(a + step * 0.42) * r * 0.97, Math.sin(a + step * 0.42) * r * 0.97);
      ctx.lineTo(Math.cos(a + step * 0.44) * r * 0.8, Math.sin(a + step * 0.44) * r * 0.8);
      ctx.closePath();
      ctx.fill();
    }

    // Ring lines — near-black, not pure black, so they sit under the true
    // black of the mesh outlines instead of competing with them. The accent
    // ring between them is the design's "jewellery" colour.
    ctx.strokeStyle = '#11131c';
    ctx.lineWidth = r * 0.028;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = r * 0.014;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.87, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = hex(design.accent);
    ctx.lineWidth = r * 0.022;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
    ctx.stroke();

    // Metal layers carry rivet detail on the face — paint, not geometry, at
    // this scale. One rivet pair per blade, riding the body ring.
    if (design.metal) {
      ctx.fillStyle = '#7d838c';
      for (let i = 0; i < blades; i++) {
        for (const f of [0.14, 0.3]) {
          const a = i * step + step * f;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * r * 0.64, Math.sin(a) * r * 0.64, r * 0.022, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // The beast crest. Sticker chips span the whole inner face; dark chips are
    // a smaller centre medallion — the reference art's black-and-gold chip
    // reads as a jewel set into the layer, not a print across it.
    //
    // The transform chain (y-flipped canvas → extrude cap UVs → the -π/2 mesh
    // rotation) nets out to a 180° turn, verified on screen: without the
    // counter-rotation the V rendered as an A. The rotate cancels it so the
    // crest reads upright from the camera's side of the dish.
    ctx.save();
    ctx.scale(1, -1);
    ctx.rotate(Math.PI);
    const emblem = beastEmblem(design);
    const eSize = design.chip === 'dark' ? r * 0.85 : r * 1.1;
    ctx.drawImage(emblem, -eSize / 2, -eSize / 2, eSize, eSize);
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Cap UVs are shape-space coordinates; this maps x, y ∈ [-r, r] to [0, 1].
  tex.repeat.set(1 / (2 * r), 1 / (2 * r));
  tex.offset.set(0.5, 0.5);
  // The face is viewed at ~34° elevation, where trilinear filtering smears the
  // ring lines radially; mild anisotropy keeps them crisp without a renderer
  // capability query.
  tex.anisotropy = 4;
  return tex;
}
