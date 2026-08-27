import * as THREE from 'three';
import * as C from '../sim/constants';
import { bowlHeight, pocketAngles } from '../sim/physics';
import type { Theme } from './theme';
import type { ArenaLook } from '../sim/arena';
import { dishMaterial, noOutline, toonMaterial } from './toon';
import { DETAIL_PALETTE, arenaFloorTexture, paintedPalette } from './arenaFloor';
import { buildFurniture } from './arenaFurniture';

/**
 * Handles onto every themed material in the stadium.
 *
 * Returned so a theme switch can re-parameterise in place. Rebuilding the
 * stadium on every switch would mean disposing geometries and materials by
 * hand, and one missed dispose is a GPU leak that only shows up after a dozen
 * toggles — assigning to existing materials avoids the whole class of bug.
 */
export interface StadiumHandles {
  group: THREE.Group;
  floor: THREE.MeshStandardMaterial;
  ridge: THREE.MeshBasicMaterial;
  guides: THREE.MeshBasicMaterial[];
  wall: THREE.MeshStandardMaterial;
  posts: THREE.MeshStandardMaterial[];
  skirt: THREE.MeshStandardMaterial;
  /**
   * Greyscale surface map for the LIT dish, or null where this arena has no
   * treatment. Held rather than merely assigned because a theme that refuses
   * arena palettes has to be able to drop it and get it back — see
   * `applyStadiumTheme`.
   */
  floorDetail: THREE.Texture | null;
  /** Structural metalwork: struts, pylons, rim cap, grilles, kerb. */
  frames: THREE.MeshStandardMaterial[];
  /** Wall signage. */
  signs: THREE.MeshBasicMaterial[];
  /**
   * The arena's own colours, kept rather than applied once and forgotten.
   *
   * WHY. `applyStadiumTheme` runs on every theme switch and deliberately does
   * not rebuild, so with no copy here it had nothing to repaint FROM and could
   * only ever restore the THEME's hexes. Verified in the browser: standing in
   * the X-Rail stadium and re-applying its own theme turned the gold tornado
   * ring red, because that is the Anime theme's `ridgeColour`, and nothing put
   * the gold back until the player changed arena. Every arena's palette was one
   * theme click from being erased.
   *
   * Held as the raw `look` rather than as the resolved palette because the
   * resolution depends on `Theme.acceptsArenaLook`, which is exactly the thing
   * that changes underneath it — the same reason `floorDetail` is built from
   * `look` and only *assigned* per theme.
   */
  look: ArenaLook | null;
}

/**
 * The arena's colour where it has an opinion and the theme allows one.
 *
 * `undefined` and "the arena said nothing" are the same thing here, so a floor
 * that sets only `dish` still inherits the theme's wall and posts rather than
 * inheriting black.
 */
const pick = (accepts: boolean, arena: number | undefined, themed: number): number =>
  accepts && arena !== undefined ? arena : themed;

/**
 * Repaint anything carrying an `arenaTint`.
 *
 * Every furniture material is built holding BOTH the colour its arena asked for
 * and the colour to fall back to under a theme that refuses arena palettes, so
 * switching theme is a choice between two known hexes rather than a rebuild.
 * See `FurnitureOptions.frameNeutral` for why they cannot be looked up here.
 */
function retint(mats: THREE.Material[], accepts: boolean): void {
  for (const m of mats) {
    const tint = m.userData.arenaTint as { arena: number; neutral: number } | undefined;
    if (!tint) continue;
    (m as THREE.MeshStandardMaterial).color.setHex(accepts ? tint.arena : tint.neutral);
  }
}

/** Push a theme's values onto an already-built stadium. */
export function applyStadiumTheme(h: StadiumHandles, t: Theme): void {
  const accepts = t.acceptsArenaLook;
  const look = h.look ?? undefined;

  // Under toon the dish colour lives in its painted texture and the material
  // tint is left at white; re-applying the hex here would multiply the colour
  // into itself and the dish would come out near-black.
  if (!t.toon) {
    h.floor.color.setHex(pick(accepts, look?.dish, t.dishColour));
    h.floor.metalness = t.dishMetalness;
    h.floor.roughness = t.dishRoughness;
    // The surface treatment is colourless (see DETAIL_PALETTE) but it is still
    // the arena's opinion about its own floor, so a theme that has refused
    // arena looks drops it. Assigning `map` is the whole switch — the texture
    // stays alive on the handles, so toggling back costs nothing and leaks
    // nothing.
    const wanted = t.acceptsArenaLook ? h.floorDetail : null;
    if (h.floor.map !== wanted) {
      h.floor.map = wanted;
      h.floor.needsUpdate = true;
    }
  }

  retint(h.frames, t.acceptsArenaLook);
  retint(h.signs, t.acceptsArenaLook);

  // Opacity, metalness and roughness stay the THEME's in every line below.
  // Those are what make Anime look like Anime; an arena reaches its colours
  // only — see the note on ArenaSpec.look.
  h.ridge.color.setHex(pick(accepts, look?.ridge, t.ridgeColour));
  h.ridge.opacity = t.ridgeOpacity;

  const guideColour = pick(accepts, look?.guide, t.guideColour);
  for (const g of h.guides) {
    g.color.setHex(guideColour);
    g.opacity = t.guideOpacity;
  }

  h.wall.color.setHex(pick(accepts, look?.wall, t.wallColour));
  h.wall.metalness = t.wallMetalness;
  h.wall.roughness = t.wallRoughness;

  const postColour = pick(accepts, look?.post, t.postColour);
  for (const p of h.posts) {
    p.color.setHex(postColour);
    p.emissive.setHex(postColour);
    p.emissiveIntensity = t.postEmissive;
  }

  h.skirt.color.setHex(t.skirtColour);
}

/**
 * Colour of the posts either side of the graded exit pocket.
 *
 * Deliberately not a theme value. Every theme's own `postColour` is chosen to
 * sit WITH that theme; the whole job of this one is to sit apart from it, so
 * that the pocket worth 3 points reads at a glance in all three.
 *
 * GREEN, and the first attempt was gold — which was wrong for a reason worth
 * writing down, because it is the same mistake three other effects made in this
 * codebase. Gold reads as "special" in the abstract and this marker lives in
 * the X-Rail stadium, whose rail is a band of gold running right past these
 * posts. Verified in the browser: the materials were being set correctly and
 * the marking was still invisible, because it was the same hue as the object
 * behind it.
 *
 * Green is the gap in every theme's palette here — Overdrive runs magenta posts
 * and a gold rail, Anime red posts on a near-white dish, Arena orange posts on
 * dark blue. Nothing else in the frame is green.
 */
const FINISH_POST = 0x4dffa0;

/**
 * Mark one pocket as the Xtreme Finish, or clear the marking with null.
 *
 * REPAINTS EVERY POST FIRST, which the first version did not, and that was a
 * real bug rather than a tidiness point. It returned early on null, so it could
 * only ever ADD a marking. Switching from the X-Rail stadium to the plain dish
 * left two green posts standing on an arena that has no graded pocket —
 * advertising a scoring rule that cannot fire there. Caught by switching arenas
 * and looking, not by any test.
 *
 * `theme` is taken rather than assumed so the clear restores the colour this
 * theme actually uses; the posts are magenta in Overdrive, red in Anime and
 * orange in Arena.
 *
 * Posts are built two per pocket in pocket order, so pocket `i` owns `2i` and
 * `2i + 1`. Bounds-checked rather than trusted: an index past the end is a
 * misconfigured arena, and a silent no-op there would look identical to the
 * feature being switched off.
 */
export function markFinishPocket(
  h: StadiumHandles,
  index: number | null,
  theme: Theme,
): void {
  // The arena's own post colour where it has one, for the same reason
  // `applyStadiumTheme` takes it: this function repaints every post on every
  // arena change, so restoring the theme's hex here would undo the arena's
  // palette one frame after the rebuild set it.
  const base = pick(theme.acceptsArenaLook, h.look?.post, theme.postColour);
  for (const p of h.posts) {
    p.color.setHex(base);
    p.emissive.setHex(base);
  }
  if (index === null) return;
  for (const side of [0, 1]) {
    const post = h.posts[index * 2 + side];
    if (!post) return;
    post.color.setHex(FINISH_POST);
    post.emissive.setHex(FINISH_POST);
  }
}

/**
 * The stadium. The dish surface is generated by revolving the *same*
 * `bowlHeight` profile the physics uses, so what the player sees is exactly the
 * surface the tops are being pushed around on — including the tornado ridge.
 */
/**
 * @param pockets Exit bearings for this arena, or undefined for the default
 *   four. The rim wall's gaps are cut at build time, so a stadium whose exits
 *   are clustered has to be REBUILT rather than re-flagged — a floor whose
 *   holes do not line up with where the sim lets tops leave is the worst kind
 *   of mismatch, because everything still works and nothing looks right.
 */
export function buildStadium(
  theme: Theme,
  pockets?: number[],
  look?: ArenaLook,
): StadiumHandles {
  // The arena's own colours where it has an opinion, the theme's where it does
  // not. A theme is a rendering STYLE and applies to the whole scene; an arena
  // is a PLACE, and places have their own palette. Without this every stadium
  // in a one-theme mode renders identically — see ArenaSpec.look.
  // Only where the theme's visual language allows it — see
  // Theme.acceptsArenaLook. Overdrive refuses, because its identity is how much
  // of the frame is black and a bright arena palette destroys the clash effect
  // that reads correctly on a dark floor.
  const paint = theme.acceptsArenaLook ? look : undefined;
  const dishColour = paint?.dish ?? theme.dishColour;
  const wallColour = paint?.wall ?? theme.wallColour;
  const ridgeColour = paint?.ridge ?? theme.ridgeColour;
  const guideColour = paint?.guide ?? theme.guideColour;
  const postColour = paint?.post ?? theme.postColour;
  // Livery and metalwork. `neutral` is what a refusing theme gets, resolved now
  // because a theme switch never rebuilds this — see FurnitureOptions.
  const frameNeutral = new THREE.Color(theme.wallColour).multiplyScalar(0.68).getHex();
  const accentColour = paint?.accent ?? theme.postColour;
  const frameColour = paint?.frame ?? frameNeutral;
  const group = new THREE.Group();
  const guides: THREE.MeshBasicMaterial[] = [];
  const posts: THREE.MeshStandardMaterial[] = [];

  // Hoisted above the floor because the floor is painted FROM it: the arenas
  // that mark their exits on the ground (Sudden Death's approach wedges, Three
  // Sides' danger arc) have to take those bearings from the same list the rim
  // wall is cut with. Two sources would drift, and a hazard stripe painted
  // where there is no hole is worse than no stripe at all.
  const exits = (pockets ?? pocketAngles()).slice().sort((a, b) => a - b);

  // ---- dish floor ----------------------------------------------------------
  const profile: THREE.Vector2[] = [];
  const steps = 96;
  for (let i = 0; i <= steps; i++) {
    const r = (i / steps) * C.STADIUM_RADIUS;
    profile.push(new THREE.Vector2(Math.max(r, 0.0001), bowlHeight(r)));
  }

  // How this arena's floor is surfaced. `plain` under a theme that has refused
  // arena palettes, which is what keeps Overdrive's near-black dish its own.
  const floorStyle = look?.floor ?? 'plain';

  // The greyscale relief map for the LIT dish. Built from `look` rather than
  // `paint` on purpose: it carries no colour at all, so it is safe to have
  // ready even under a theme that is currently refusing arena palettes, and
  // that theme can then be switched away from without a rebuild.
  const floorDetail =
    floorStyle === 'plain' ? null : arenaFloorTexture(floorStyle, DETAIL_PALETTE, exits);

  // The dish is rebuilt on a toon switch rather than re-parameterised, because
  // MeshToonMaterial is a different material class — the one place the
  // "assign, never rebuild" rule genuinely can't hold.
  const floorMat = (
    theme.toon
      ? // Unlit and painted — see `dishMaterial` for why this one surface
        // opts out of lighting entirely. When the arena has an opinion the
        // paint is its own; otherwise the stock Beystadium art stands.
        paint
        ? noOutline(
            new THREE.MeshBasicMaterial({
              map: arenaFloorTexture(
                floorStyle,
                paintedPalette({
                  dish: dishColour,
                  ridge: ridgeColour,
                  guide: guideColour,
                  wall: wallColour,
                  accent: accentColour,
                }),
                exits,
              ),
              side: THREE.DoubleSide,
            }),
          )
        : dishMaterial(dishColour)
      : new THREE.MeshStandardMaterial({
          color: dishColour,
          map: theme.acceptsArenaLook ? floorDetail : null,
          metalness: theme.dishMetalness,
          roughness: theme.dishRoughness,
          side: THREE.DoubleSide,
        })
  ) as THREE.MeshStandardMaterial;
  floorMat.side = THREE.DoubleSide;
  // The dish is concave, so an inverted-hull outline lifts off it and paints the
  // basin dark — see `noOutline`. The rim, ridge and posts carry the linework.
  noOutline(floorMat);
  const floor = new THREE.Mesh(new THREE.LatheGeometry(profile, 128), floorMat);
  // An unlit dish can't take a shadow map; under toon the tops draw their own
  // contact shadow instead.
  floor.receiveShadow = !theme.toon;
  group.add(floor);

  // Concentric guide rings, so motion across the dish is readable.
  let ridgeMat: THREE.MeshBasicMaterial | null = null;
  for (const r of [0.25, 0.5, C.RIDGE_RADIUS]) {
    const isRidge = r === C.RIDGE_RADIUS;
    const mat = new THREE.MeshBasicMaterial({
      color: isRidge ? ridgeColour : guideColour,
      transparent: true,
      opacity: isRidge ? theme.ridgeOpacity : theme.guideOpacity,
    });
    if (isRidge) ridgeMat = mat;
    else guides.push(mat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.004, 6, 128), mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = bowlHeight(r) + 0.004;
    group.add(ring);
  }

  // RADIAL TICKS around the outer floor.
  //
  // The other half of "the arena looks bare bone". The dish had three
  // concentric rings and nothing else across a large pale surface, so the floor
  // read as a blank bowl however much detail the rim gained. Real stadium
  // floors are moulded in radial segments and every seam shows.
  //
  // Placed on the OUTER floor only, between the tornado ridge and the rim.
  // That band is the part a player watches — it is where the rail sits, where
  // orbits ride, and where the exits are — and it is also the only part wide
  // enough to take marks without crowding the tops. The calm centre stays
  // clean, which is what makes the ridge read as a boundary.
  const tickMat = new THREE.MeshBasicMaterial({
    color: guideColour,
    transparent: true,
    // Slightly under the guide rings, with a FLOOR.
    //
    // First attempt was a flat `guideOpacity * 0.5` on the reasoning that many
    // short marks should be lighter than three long ones. Measured on the
    // Anime theme that landed at 0.11 and the ticks were invisible — which is
    // worse than not adding them, since the complaint being answered is that
    // the floor looks bare. The floor keeps them legible on the themes whose
    // guides are already faint, without letting them outshine the rings on the
    // themes whose guides are strong.
    opacity: Math.max(0.2, theme.guideOpacity * 0.75),
  });
  //
  // NOT IN EVERY ARENA, which is the whole argument of this change in
  // miniature. These ticks say "moulded in radial segments", and two floors
  // here are explicitly saying something else: Sudden Death earns its identity
  // by being nearly empty, and the Crater is the one surface in the game that
  // was never manufactured at all. Adding detail to those two would cost them
  // the thing that makes them distinct.
  const tickCount = floorStyle === 'severe' || floorStyle === 'cracked' ? 0 : 24;
  const tickInner = C.RIDGE_RADIUS + 0.03;
  const tickOuter = C.STADIUM_RADIUS - 0.02;
  const tickGeo = new THREE.PlaneGeometry(tickOuter - tickInner, 0.006);
  for (let i = 0; i < tickCount; i++) {
    const a = (i / tickCount) * Math.PI * 2;
    const mid = (tickInner + tickOuter) / 2;
    const tick = new THREE.Mesh(tickGeo, tickMat);
    tick.position.set(Math.cos(a) * mid, bowlHeight(mid) + 0.004, Math.sin(a) * mid);
    tick.rotation.x = -Math.PI / 2;
    tick.rotation.z = -a;
    group.add(tick);
  }

  // ---- rim wall, with a gap at every exit pocket ---------------------------
  const rimHeight = 0.13;
  const rimY = bowlHeight(C.STADIUM_RADIUS) + rimHeight / 2;
  const wallMat = (
    theme.toon
      ? toonMaterial(wallColour)
      : new THREE.MeshStandardMaterial({
          color: wallColour,
          metalness: theme.wallMetalness,
          roughness: theme.wallRoughness,
          side: THREE.DoubleSide,
        })
  ) as THREE.MeshStandardMaterial;
  wallMat.side = THREE.DoubleSide;

  // Ribs sit a shade darker than the wall. A LIGHTER rib reads as a painted
  // stripe; a darker one reads as a shadowed seam, which is what a moulding
  // join actually looks like.
  const ribColour = new THREE.Color(wallColour).multiplyScalar(0.82).getHex();
  const ribMat = theme.toon
    ? toonMaterial(ribColour)
    : new THREE.MeshStandardMaterial({
        color: ribColour,
        metalness: theme.wallMetalness,
        roughness: theme.wallRoughness,
      });

  for (let i = 0; i < exits.length; i++) {
    const start = exits[i] + C.POCKET_HALF_WIDTH;
    const end = exits[(i + 1) % exits.length] - C.POCKET_HALF_WIDTH;
    let sweep = end - start;
    while (sweep <= 0) sweep += Math.PI * 2;

    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(
        C.STADIUM_RADIUS,
        C.STADIUM_RADIUS,
        rimHeight,
        64,
        1,
        true,
        0,
        sweep,
      ),
      wallMat,
    );
    // CylinderGeometry lays its vertices out as (sin t, cos t), so its sweep
    // starts at +Z and runs clockwise, while sim bearings are (cos a, sin a)
    // starting at +X. Rotating by -start leaves the segments in the wrong place
    // entirely; this is the offset that lines a segment's end up with `start`.
    wall.rotation.y = Math.PI / 2 - start - sweep;
    wall.position.y = rimY;
    group.add(wall);

    // VERTICAL RIBS along the wall.
    //
    // Reported as the arena looking "very bare bone and not detailed at the
    // level of the beyblades", and that was fair: the rim was one smooth
    // extruded band, which next to a faceted chrome top reads as a placeholder.
    // Real stadiums are moulded in segments and every seam between them shows
    // as a vertical rib — it is the cheapest detail that makes a wall read as a
    // manufactured object rather than a cylinder.
    //
    // Spaced by ARC LENGTH rather than a fixed count per segment, so a long
    // wall gets more ribs than a short one and the spacing stays even all the
    // way round. A fixed count would crowd them on the short segments of a
    // clustered-pocket floor like Three Sides Safe.
    const ribEvery = 0.19;
    const ribs = Math.max(1, Math.round(sweep / ribEvery));
    const ribGeo = new THREE.BoxGeometry(0.012, rimHeight * 0.86, 0.016);
    for (let k = 1; k < ribs; k++) {
      const a = start + (sweep * k) / ribs;
      const rib = new THREE.Mesh(ribGeo, ribMat);
      rib.position.set(
        Math.cos(a) * (C.STADIUM_RADIUS + 0.004),
        rimY,
        Math.sin(a) * (C.STADIUM_RADIUS + 0.004),
      );
      // Face outward, so the rib stands proud of the wall rather than cutting
      // through it.
      rib.rotation.y = -a;
      group.add(rib);
    }
  }

  // Glowing markers either side of each pocket, so exits are obvious.
  for (const angle of exits) {
    for (const side of [-1, 1]) {
      const a = angle + side * C.POCKET_HALF_WIDTH;
      const postMat = (
        theme.toon
          ? toonMaterial(postColour, theme.postEmissive * 0.4)
          : new THREE.MeshStandardMaterial({
              color: postColour,
              emissive: postColour,
              emissiveIntensity: theme.postEmissive,
            })
      ) as THREE.MeshStandardMaterial;
      posts.push(postMat);
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, rimHeight * 1.5, 8),
        postMat,
      );
      post.position.set(
        Math.cos(a) * C.STADIUM_RADIUS,
        rimY,
        Math.sin(a) * C.STADIUM_RADIUS,
      );
      group.add(post);
    }
  }

  // ---- outer housing -------------------------------------------------------
  const skirtMat = (
    theme.toon
      ? // Matte and banded: a metalness-0.4 standard surface would be the one
        // shiny CG object left in an otherwise cel-shaded frame.
        toonMaterial(theme.skirtColour)
      : new THREE.MeshStandardMaterial({
          color: theme.skirtColour,
          metalness: 0.4,
          roughness: 0.8,
        })
  ) as THREE.MeshStandardMaterial;
  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(C.STADIUM_RADIUS * 1.32, C.STADIUM_RADIUS * 1.5, 0.16, 64),
    skirtMat,
  );
  // Sunk until its top cap clears the bowl.
  //
  // CylinderGeometry is capped, so this housing carries a solid disc of radius
  // 1.32 across its top. At the old y the cap sat at +0.06 while the dish floor
  // — bowlHeight(r) = 0.2r² — is below 0.06 for every r < 0.548. The cap was
  // therefore drawn *over the middle of the stadium*, and had been all along:
  // in the dark themes the skirt and dish colours were close enough that
  // nobody could see it, and on a bright painted dish it read as a black hole
  // exactly where the fight happens. Now the cap sits under the lowest point
  // of the bowl and can never win the depth test against the floor.
  skirt.position.y = -0.14;
  skirt.receiveShadow = true;
  group.add(skirt);

  // ---- structural furniture ------------------------------------------------
  //
  // Built from `look` rather than from `paint`, and the distinction is
  // deliberate. `acceptsArenaLook` is a theme's veto on arena COLOUR — see the
  // note on it in theme.ts, which is entirely about Overdrive's frame being
  // black and a bright palette destroying that. Struts, pylons and buttresses
  // are not colour, they are the arena's SHAPE, and eight identical silhouettes
  // are eight identical arenas in any palette. So the geometry is built either
  // way and only its tint answers to the theme.
  const furniture = buildFurniture({
    structure: look?.structure ?? 'none',
    signs: look?.signs ?? 'none',
    rim: look?.rim ?? 'none',
    kerb: look?.kerb === true,
    frameColour,
    accentColour,
    frameNeutral,
    accentNeutral: theme.postColour,
    exits,
    rimHeight,
    rimY,
    toon: theme.toon,
  });
  group.add(furniture.group);

  return {
    group,
    floor: floorMat,
    ridge: ridgeMat as THREE.MeshBasicMaterial,
    guides,
    wall: wallMat,
    posts,
    skirt: skirtMat,
    floorDetail,
    frames: furniture.frame,
    signs: furniture.sign,
    // `look`, not `paint`: a theme that is refusing arena palettes right now
    // may be switched away from without a rebuild, and the arena's colours have
    // to survive that. Same argument as `floorDetail` two fields up.
    look: look ?? null,
  };
}

/** World-space position for a top at sim coordinates (x, y). */
export function beyWorldPosition(x: number, y: number): THREE.Vector3 {
  const r = Math.hypot(x, y);
  return new THREE.Vector3(x, bowlHeight(Math.min(r, C.STADIUM_RADIUS)), y);
}
