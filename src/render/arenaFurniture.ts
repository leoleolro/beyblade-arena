import * as THREE from 'three';
import * as C from '../sim/constants';
import { bowlHeight } from '../sim/physics';
import type { ArenaRimStyle, ArenaSignStyle, ArenaStructureStyle } from '../sim/arena';
import { noOutline, setOutline, toonMaterial } from './toon';

/**
 * Everything the stadium is made of that is not the bowl.
 *
 * THE HALF OF "BARE BONE" A TEXTURE CANNOT FIX. Every arena in this game had
 * exactly one silhouette — bowl, band, skirt — so from any distance at all, and
 * in any thumbnail, they were the same object. Repainting the floor does not
 * touch that: an outline is read before a colour is, and eight identical
 * outlines are eight identical arenas however they are surfaced.
 *
 * So this builds the parts that change the OUTLINE. Struts and buttresses under
 * the rim, pylons that stand proud of it, bars that make a rim read as a cage,
 * a cap on the wall, signage inside it. All of it is placed against the same
 * numbers the stadium itself uses, and none of it reaches inside the dish where
 * it could occlude the fight.
 *
 * Placement convention, since it is easy to get backwards and impossible to
 * spot when you do: a child of a group at bearing `a` with `rotation.y = -a`
 * has its local +X pointing radially OUTWARD and its local +Z tangential. So a
 * strut leaning inward at the top is a rotation about local +Z, which tips
 * local +Y toward local -X.
 */

export interface FurnitureHandles {
  group: THREE.Group;
  /** Structural metal. Kept so a theme switch can repaint without rebuilding. */
  frame: THREE.MeshStandardMaterial[];
  /** Signage. Its texture is drawn in white, so the colour is all in `.color`. */
  sign: THREE.MeshBasicMaterial[];
}

export interface FurnitureOptions {
  structure: ArenaStructureStyle;
  signs: ArenaSignStyle;
  rim: ArenaRimStyle;
  /** Raise the tornado ridge into a visible lip. */
  kerb: boolean;
  frameColour: number;
  accentColour: number;
  /**
   * What to fall back to under a theme that refuses arena palettes.
   *
   * BUILT NOW, NOT LOOKED UP LATER, because a theme switch does not rebuild the
   * stadium — `setTheme` only reconstructs it when the `toon` flag flips, and
   * the two themes that can differ here (Arena and Overdrive) are both non-toon.
   * So both colours are resolved at build time and stashed on each material;
   * `applyStadiumTheme` then only has to choose between them, which is a repaint
   * rather than a rebuild and cannot leak.
   */
  frameNeutral: number;
  accentNeutral: number;
  /** Exit bearings, sorted ascending — the same list the wall is cut with. */
  exits: number[];
  /** Height of the rim wall band. */
  rimHeight: number;
  /** Centre height of the rim wall band. */
  rimY: number;
  toon: boolean;
}

/**
 * One repeated shape, all the way round.
 *
 * A TABLE RATHER THAN NINE FUNCTIONS. Every structure style here is the same
 * object — a box between the housing and the rim — differing only in how many,
 * how thick, how far it leans and what sits on top. Written as nine builders
 * they would drift apart on the details that are supposed to be shared (where
 * the foot sits, how the lean is derived) and the ones that are supposed to
 * differ would be buried. As a table the whole vocabulary is one screen, and
 * adding a tenth arena costs a row.
 */
interface StrutSpec {
  count: number;
  /** Tangential width. */
  width: number;
  /** Radial thickness. */
  depth: number;
  /** How far the foot stands out past the wall. */
  reach: number;
  /** How far the head rises above the top of the wall. Negative stops short. */
  rise: number;
  /** 0 keeps the box square; 1 sharpens the head to a point. */
  taper: number;
  /** A block capping each head, in the accent colour. */
  cap: boolean;
  /** Radii of horizontal bands threaded through the struts. */
  bands: number[];
  /** Vent grilles bolted to the housing between struts. */
  grilles: number;
  /** Per-instance size and lean variation. 0 is machined. */
  jitter: number;
  /** Drop any strut within this many radians of an exit. */
  clearExits: number;
}

const STRUTS: Record<ArenaStructureStyle, StrutSpec | null> = {
  none: null,
  // Tidy, unremarkable, tournament-issue: the baseline the others are read
  // against, so it is deliberately the least interesting row in the table.
  brackets: {
    count: 12,
    width: 0.038,
    depth: 0.05,
    reach: 0.2,
    rise: -0.03,
    taper: 0,
    cap: true,
    bands: [],
    grilles: 0,
    jitter: 0,
    clearExits: 0,
  },
  // Motorsport trussing: thin, many, with a cable run around them.
  trusses: {
    count: 18,
    width: 0.018,
    depth: 0.028,
    reach: 0.3,
    rise: 0.02,
    taper: 0,
    cap: false,
    bands: [1.16, 1.28],
    grilles: 0,
    jitter: 0,
    clearExits: 0,
  },
  // Heavy and standing PROUD of the rim, which is the point: the Spike Pit
  // should look like somewhere cordoned off rather than somewhere played in.
  pylons: {
    count: 8,
    width: 0.062,
    depth: 0.062,
    reach: 0.15,
    rise: 0.12,
    taper: 0.25,
    cap: true,
    bands: [],
    grilles: 4,
    jitter: 0,
    clearExits: 0,
  },
  // Close-set bars. Nothing else here is dense enough to read as containment.
  cage: {
    count: 34,
    width: 0.015,
    depth: 0.022,
    reach: 0.11,
    rise: 0.09,
    taper: 0,
    cap: false,
    bands: [1.05, 1.09],
    grilles: 0,
    jitter: 0,
    clearExits: 0,
  },
  // Six tall blades, sharpened. Severe is a silhouette, not a texture.
  fins: {
    count: 6,
    width: 0.014,
    depth: 0.13,
    reach: 0.22,
    rise: 0.18,
    taper: 0.92,
    cap: false,
    bands: [],
    grilles: 0,
    jitter: 0,
    clearExits: 0,
  },
  // Squat, bolted, with vent grilles: machinery rather than architecture.
  clamps: {
    count: 10,
    width: 0.1,
    depth: 0.07,
    reach: 0.13,
    rise: -0.05,
    taper: 0,
    cap: true,
    bands: [1.1],
    grilles: 10,
    jitter: 0,
    clearExits: 0,
  },
  // Slabs, and only where there is no way out. `clearExits` is what makes the
  // Three Sides silhouette itself asymmetric — heavy on the safe walls, open on
  // the one that can throw you out.
  bulwark: {
    count: 12,
    width: 0.17,
    depth: 0.1,
    reach: 0.26,
    rise: -0.035,
    taper: 0.12,
    cap: false,
    bands: [],
    grilles: 0,
    jitter: 0,
    clearExits: 0.5,
  },
  // Uneven props. The jitter is the whole point: anything evenly spaced reads
  // as manufactured, which is the one thing the Crater must not.
  rubble: {
    count: 17,
    width: 0.075,
    depth: 0.075,
    reach: 0.19,
    rise: -0.04,
    taper: 0.3,
    cap: false,
    bands: [],
    grilles: 0,
    jitter: 0.55,
    clearExits: 0,
  },
};

/** Deterministic, so a rebuilt arena is the same arena. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Top of the outer housing, where every strut has its foot. */
const FOOT_Y = -0.055;

/**
 * A box sharpened toward +Y.
 *
 * Done by moving vertices rather than by using a cone, because the result has
 * to be a BOX at taper 0 — the same geometry code path serving both keeps the
 * struts and the fins consistent under the cel outline, which inks the two very
 * differently if one is a cylinder.
 */
function taperedBox(w: number, h: number, d: number, taper: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (taper > 0) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 0) {
        pos.setX(i, pos.getX(i) * (1 - taper));
        pos.setZ(i, pos.getZ(i) * (1 - taper));
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }
  return geo;
}

/** White-on-transparent chevrons, tiled around the inside of the wall. */
function chevronStrip(): THREE.CanvasTexture {
  const w = 128;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 11;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    for (const x of [24, 74]) {
      ctx.beginPath();
      ctx.moveTo(x - 20, 10);
      ctx.lineTo(x + 12, h / 2);
      ctx.lineTo(x - 20, h - 10);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** White-on-transparent diagonal hazard stripes. */
function hazardStrip(): THREE.CanvasTexture {
  const w = 96;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    for (let i = -1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * (w / 3), 0);
      ctx.lineTo(i * (w / 3) + w / 6, 0);
      ctx.lineTo(i * (w / 3) + w / 6 + h, h);
      ctx.lineTo(i * (w / 3) + h, h);
      ctx.closePath();
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/**
 * A numbered sector plate.
 *
 * Real stadiums number their segments and it is the cheapest possible signal
 * that a wall is a made object with a purpose, rather than an extruded ring.
 */
function sectorPlate(n: number): THREE.CanvasTexture {
  const w = 128;
  const h = 96;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 7;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${h * 0.6}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), w / 2, h / 2 + 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Wall spans between the exits — the same arithmetic `buildStadium` uses. */
function segments(exits: number[]): Array<{ start: number; sweep: number }> {
  const out: Array<{ start: number; sweep: number }> = [];
  for (let i = 0; i < exits.length; i++) {
    const start = exits[i] + C.POCKET_HALF_WIDTH;
    const end = exits[(i + 1) % exits.length] - C.POCKET_HALF_WIDTH;
    let sweep = end - start;
    while (sweep <= 0) sweep += Math.PI * 2;
    out.push({ start, sweep });
  }
  return out;
}

/** Shortest angular distance between two bearings. */
function angleGap(a: number, b: number): number {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

export function buildFurniture(o: FurnitureOptions): FurnitureHandles {
  const group = new THREE.Group();
  const frame: THREE.MeshStandardMaterial[] = [];
  const sign: THREE.MeshBasicMaterial[] = [];

  const shade = (colour: number, dark: number): number =>
    new THREE.Color(colour).multiplyScalar(dark).getHex();

  const make = (arena: number, neutral: number, dark: number): THREE.MeshStandardMaterial => {
    const c = shade(arena, dark);
    const mat = (
      o.toon
        ? toonMaterial(c)
        : new THREE.MeshStandardMaterial({ color: c, metalness: 0.45, roughness: 0.62 })
    ) as THREE.MeshStandardMaterial;
    // Structure sits at the edge of frame and is small; a heavy hull makes a
    // ring of thin bars read as a solid black band.
    if (o.toon) setOutline(mat, { thickness: 0.006 });
    mat.userData.arenaTint = { arena: c, neutral: shade(neutral, dark) };
    frame.push(mat);
    return mat;
  };

  const frameMetal = (dark = 1): THREE.MeshStandardMaterial =>
    make(o.frameColour, o.frameNeutral, dark);
  const accentMetal = (dark = 1): THREE.MeshStandardMaterial =>
    make(o.accentColour, o.accentNeutral, dark);

  const rimTop = o.rimY + o.rimHeight / 2;
  const wallR = C.STADIUM_RADIUS;

  // ---- struts, buttresses, bars -------------------------------------------
  const spec = STRUTS[o.structure];
  if (spec) {
    const r = rng(0x51a7 + spec.count);
    const body = frameMetal();
    const capMat = spec.cap ? accentMetal() : null;

    for (let i = 0; i < spec.count; i++) {
      const a = (i / spec.count) * Math.PI * 2;
      if (spec.clearExits > 0 && o.exits.some((e) => angleGap(a, e) < spec.clearExits)) continue;

      const j = spec.jitter > 0 ? 1 + (r() - 0.5) * spec.jitter : 1;
      const reach = spec.reach * j;
      const rise = spec.rise * (spec.jitter > 0 ? j : 1);

      const rFoot = wallR + reach;
      const rHead = wallR + 0.015;
      const yHead = rimTop + rise;
      const dr = rFoot - rHead;
      const dy = yHead - FOOT_Y;
      const len = Math.hypot(dr, dy);
      const lean = Math.atan2(dr, dy);

      const pivot = new THREE.Group();
      pivot.rotation.y = -a + (spec.jitter > 0 ? (r() - 0.5) * 0.18 : 0);
      pivot.position.set(
        Math.cos(a) * ((rFoot + rHead) / 2),
        (FOOT_Y + yHead) / 2,
        Math.sin(a) * ((rFoot + rHead) / 2),
      );

      const strut = new THREE.Mesh(
        taperedBox(spec.depth, len, spec.width * j, spec.taper),
        body,
      );
      strut.rotation.z = lean;
      pivot.add(strut);

      if (capMat) {
        const cap = new THREE.Mesh(
          new THREE.BoxGeometry(spec.depth * 1.25, 0.02, spec.width * 1.25 * j),
          capMat,
        );
        // Along the strut's own axis, so a cap on a leaning bracket sits on its
        // head rather than hanging in the air beside it.
        cap.position.set(-Math.sin(lean) * (len / 2), Math.cos(lean) * (len / 2), 0);
        cap.rotation.z = lean;
        pivot.add(cap);
      }

      group.add(pivot);
    }

    // Horizontal bands threaded through them: a cable run, a clamp belt, the
    // rail of a cage. One torus each, which is cheap and reads immediately.
    for (const br of spec.bands) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(br, 0.008, 6, 96),
        frameMetal(0.82),
      );
      ring.rotation.x = Math.PI / 2;
      // Threaded partway up the struts rather than at either end, where it
      // would read as a second rim or as a foot plate.
      ring.position.y = FOOT_Y + (rimTop - FOOT_Y) * (br > wallR + 0.2 ? 0.35 : 0.75);
      group.add(ring);
    }

    // Vent grilles on the housing, between the struts.
    if (spec.grilles > 0) {
      const grilleMat = frameMetal(0.7);
      const slat = new THREE.BoxGeometry(0.012, 0.012, 0.09);
      for (let i = 0; i < spec.grilles; i++) {
        const a = ((i + 0.5) / spec.grilles) * Math.PI * 2;
        for (let k = 0; k < 3; k++) {
          const vent = new THREE.Mesh(slat, grilleMat);
          vent.position.set(
            Math.cos(a) * (wallR + 0.3),
            FOOT_Y - 0.012 - k * 0.02,
            Math.sin(a) * (wallR + 0.3),
          );
          vent.rotation.y = -a;
          group.add(vent);
        }
      }
    }
  }

  // ---- rim cap -------------------------------------------------------------
  //
  // Per wall SEGMENT, never a full ring: a cap drawn across a pocket would
  // close the hole the sim throws tops through, which is the exact class of
  // sim/picture mismatch the rim wall itself is built segment-by-segment to
  // avoid.
  if (o.rim !== 'none') {
    const capMat = frameMetal(1.08);
    const tube = o.rim === 'heavy' ? 0.019 : 0.012;
    const r = rng(0xbb0c);

    for (const { start, sweep } of segments(o.exits)) {
      if (o.rim === 'broken') {
        // Chunks with gaps. Drawn as several short arcs rather than one arc
        // with holes, because a gap has to have ENDS to read as broken.
        let at = 0;
        while (at < sweep) {
          const run = Math.min(sweep - at, 0.12 + r() * 0.3);
          if (r() > 0.24) {
            const arc = new THREE.Mesh(
              new THREE.TorusGeometry(wallR, tube * (0.7 + r() * 0.8), 6, 24, run),
              capMat,
            );
            arc.rotation.x = Math.PI / 2;
            arc.rotation.z = start + at;
            arc.position.y = rimTop - r() * 0.012;
            group.add(arc);
          }
          at += run + 0.05 + r() * 0.14;
        }
      } else {
        const arc = new THREE.Mesh(
          new THREE.TorusGeometry(wallR, tube, 8, Math.max(8, Math.round(sweep * 40)), sweep),
          capMat,
        );
        // A torus arc sweeps from local +X toward +Y; after the -90° X tilt
        // that lands on world bearings t + rotation.z, so the arc's start is
        // simply the segment's start.
        arc.rotation.x = Math.PI / 2;
        arc.rotation.z = start;
        arc.position.y = rimTop;
        group.add(arc);
      }

      if (o.rim === 'heavy') {
        const lower = new THREE.Mesh(
          new THREE.TorusGeometry(wallR + 0.008, 0.008, 6, Math.max(8, Math.round(sweep * 36)), sweep),
          capMat,
        );
        lower.rotation.x = Math.PI / 2;
        lower.rotation.z = start;
        lower.position.y = o.rimY - o.rimHeight * 0.3;
        group.add(lower);
      }

      if (o.rim === 'toothed') {
        const teeth = Math.max(1, Math.round(sweep / 0.115));
        const toothGeo = new THREE.BoxGeometry(0.03, 0.026, 0.045);
        const toothMat = accentMetal();
        for (let k = 0; k <= teeth; k++) {
          const a = start + (sweep * k) / teeth;
          const tooth = new THREE.Mesh(toothGeo, toothMat);
          tooth.position.set(Math.cos(a) * wallR, rimTop + 0.012, Math.sin(a) * wallR);
          tooth.rotation.y = -a;
          group.add(tooth);
        }
      }
    }
  }

  // ---- signage inside the wall --------------------------------------------
  //
  // On the INSIDE face, because that is the one the battle camera sees: it
  // looks down into the bowl from outside, so the far wall shows its inner
  // face and the near wall shows only its cap.
  if (o.signs === 'chevrons' || o.signs === 'hazard') {
    const tex = o.signs === 'chevrons' ? chevronStrip() : hazardStrip();
    const pitch = o.signs === 'chevrons' ? 0.2 : 0.13;
    for (const { start, sweep } of segments(o.exits)) {
      const map = tex.clone();
      map.needsUpdate = true;
      map.repeat.x = Math.max(1, Math.round(sweep / pitch));
      const mat = new THREE.MeshBasicMaterial({
        map,
        color: o.accentColour,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      noOutline(mat);
      mat.userData.arenaTint = { arena: o.accentColour, neutral: o.accentNeutral };
      sign.push(mat);
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(
          wallR - 0.004,
          wallR - 0.004,
          o.rimHeight * 0.52,
          Math.max(8, Math.round(sweep * 40)),
          1,
          true,
          0,
          sweep,
        ),
        mat,
      );
      // Same offset the wall segments use — CylinderGeometry sweeps from +Z
      // clockwise while bearings run from +X anticlockwise.
      band.rotation.y = Math.PI / 2 - start - sweep;
      band.position.y = o.rimY + o.rimHeight * 0.14;
      group.add(band);
    }
  } else if (o.signs === 'sectors') {
    const plateGeo = new THREE.PlaneGeometry(0.082, 0.06);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 16;
      // A plate floating across a pocket would be signage for a piece of wall
      // that is not there.
      if (o.exits.some((e) => angleGap(a, e) < C.POCKET_HALF_WIDTH + 0.09)) continue;
      const mat = new THREE.MeshBasicMaterial({
        map: sectorPlate(i + 1),
        color: o.accentColour,
        transparent: true,
        depthWrite: false,
      });
      noOutline(mat);
      mat.userData.arenaTint = { arena: o.accentColour, neutral: o.accentNeutral };
      sign.push(mat);
      const plate = new THREE.Mesh(plateGeo, mat);
      plate.position.set(
        Math.cos(a) * (wallR - 0.006),
        o.rimY + o.rimHeight * 0.08,
        Math.sin(a) * (wallR - 0.006),
      );
      // A plane's normal is +Z; this turns it to face the middle of the dish.
      plate.rotation.y = -a - Math.PI / 2;
      group.add(plate);
    }
  }

  // ---- ridge kerb ----------------------------------------------------------
  if (o.kerb) {
    const kerb = new THREE.Mesh(
      new THREE.TorusGeometry(C.RIDGE_RADIUS, 0.009, 6, 128),
      frameMetal(0.92),
    );
    kerb.rotation.x = Math.PI / 2;
    // Sat ON the ridge the physics already puts here — see ArenaLook.kerb for
    // why this is an emphasis rather than an invented wall.
    kerb.position.y = bowlHeight(C.RIDGE_RADIUS) + 0.006;
    group.add(kerb);
  }

  return { group, frame, sign };
}
