import * as THREE from 'three';

/**
 * The beydex: canonical visual identity for every layer, as data.
 *
 * Researched against the source material (toy line + anime) so each layer
 * looks like *itself* rather than a recolour of its neighbour: Valtryek is the
 * blue-and-gold winged knight, Fafnir is the gold left-spin hoarder, Luinor is
 * the white dragon. The palette, motif, spin direction and blade character all
 * come from the real designs; the drawing itself stays procedural and
 * stylised — close enough to read instantly, distinct enough to be ours.
 *
 * This file is deliberately pure data + 2D drawing. The mesh code consumes it;
 * nothing here touches the scene graph, so the designs are reusable anywhere a
 * canvas can go (layer faces, picker chips, victory cards).
 */

/**
 * The silhouette grammar a layer is cut from.
 *
 * One curve language across every design made all ten read as recolours of
 * each other — the shapes differed in proportion but never in *kind*. These
 * are genuinely different constructions:
 *
 *  - `blade`  straight leading edge into a hard point, then a deep undercut.
 *             Reads as cut metal. Attack.
 *  - `wave`   continuous sinusoidal scalloping with no corners anywhere. Reads
 *             as moulded plastic. Defence and spin-steal.
 *  - `hook`   leading edge that bulges then curls back on itself, so each
 *             blade ends in a claw. Reads as aggressive and organic.
 *  - `flame`  asymmetric licks: a long slow rise and a short sharp fall, so
 *             the profile looks like it is being blown backwards.
 */
export type EdgeProfile = 'blade' | 'wave' | 'hook' | 'flame';

export interface BladeStyle {
  /** Root circle as a fraction of the collision radius. High = round shield. */
  root: number;
  /** How far outside the chord the leading edge bellies. */
  belly: number;
  /** How deep the trailing undercut bites toward the centre. */
  cut: number;
  /** Which curve language this layer is cut from. */
  edge: EdgeProfile;
}

export interface BeyDesign {
  /** Matches the sim layer id. */
  layerId: string;
  /** The canonical design this transcribes. */
  canonName: string;
  /** Dominant plastic colour. */
  primary: number;
  /** Second plastic / sticker colour. */
  secondary: number;
  /** Metal or foil accent — the colour of the layer's "jewellery". */
  accent: number;
  /** The beast, for the emblem drawing. */
  motif:
    | 'valkyrie'
    | 'flame'
    | 'twinface'
    | 'dragon'
    | 'coil'
    | 'shield'
    | 'xsword'
    | 'phoenix'
    | 'lion'
    | 'drakehead';
  /** Big roman letter on the face sticker, as on the real ones. */
  letter: string;
  /** Canonical spin direction: Fafnir and Luinor lines spin LEFT. */
  spinDir: 1 | -1;
  blade: BladeStyle;
  /**
   * Centre-chip treatment. 'sticker' is the flat printed roundel of the Burst
   * era; 'dark' is the black chip with a gold bezel and the beast drawn large
   * in accent colours — the treatment every one of the player-designed line
   * uses in its reference art.
   */
  chip: 'sticker' | 'dark';
  /**
   * Colour of the translucent under-ring tier beneath the blade tier. The
   * reference designs all stack a lighter translucent ring under the main
   * blades — it is most of what makes the side view read as layered hardware
   * rather than one extruded slab. Omitted = no under-ring.
   */
  underRing?: number;
  /** Raised gold armor crest extruded above the face. */
  crest?: 'xsword';
  /** Bare-metal layer: the side walls read as brushed steel, not plastic. */
  metal?: boolean;
  /**
   * Top-face treatment.
   *
   * Absent, the face is flat and carries bolted-on hardware (see
   * `addBladeDetail`). `'wave'` moulds the face instead: the extruded cap is
   * displaced into smooth radial crests and shaded as cel metal, so the
   * highlight sweeps across the ridges as the top spins. Only the `wave` edge
   * grammar takes it — a scalloped outline and a rippled face are the same
   * moulding decision, and a machined `blade` layer with a rippled face would
   * read as two designs bolted together.
   */
  surface?: 'wave';
}

/**
 * Transcribed from the researched designs. Hexes are the product palettes
 * rounded to flat cel colours — saturation carries identity here, the way it
 * does in the show.
 */
export const BEYDEX: BeyDesign[] = [
  {
    layerId: 'valtryek',
    canonName: 'Victory Valtryek',
    primary: 0x1e56c8,
    secondary: 0xd43a2f,
    accent: 0xe6b532,
    motif: 'valkyrie',
    letter: 'V',
    spinDir: 1,
    // Three broad swept wings, aggressive pinwheel.
    chip: 'sticker',
    // cut-metal wings over a lighter blue tier
    underRing: 0x2b6fd4,
    blade: { root: 0.6, belly: 1.0, cut: 1.0, edge: 'blade' },
  },
  {
    layerId: 'ragnaruk',
    canonName: 'Rising Ragnaruk',
    primary: 0x3daf4e,
    secondary: 0xf2cf2a,
    accent: 0xe0622a,
    motif: 'flame',
    letter: 'R',
    spinDir: 1,
    // Two undulating flame wings — wide, smooth arcs with the mass at the ends.
    chip: 'sticker',
    // fire licks over a yellow flame tier
    underRing: 0xf2cf2a,
    blade: { root: 0.68, belly: 1.15, cut: 0.7, edge: 'flame' },
  },
  {
    layerId: 'spryzen',
    canonName: 'Storm Spryzen',
    primary: 0xc62828,
    secondary: 0x2c3f9f,
    accent: 0xd9a72e,
    motif: 'twinface',
    letter: 'S',
    spinDir: 1,
    chip: 'sticker',
    // twin cut blades over the blue underside
    underRing: 0x2c3f9f,
    blade: { root: 0.62, belly: 0.95, cut: 0.9, edge: 'blade' },
  },
  {
    layerId: 'luinor',
    canonName: 'Lost Luinor',
    primary: 0xeef1f5,
    secondary: 0x3a7bd5,
    accent: 0xb9c2cc,
    motif: 'dragon',
    letter: 'L',
    spinDir: -1,
    // Jagged high-recoil silhouette: deep cuts, hard bellies.
    chip: 'sticker',
    // clawed dragon wings over an azure tier
    underRing: 0x3a7bd5,
    blade: { root: 0.58, belly: 1.1, cut: 1.2, edge: 'hook' },
  },
  {
    layerId: 'fafnir',
    canonName: 'Drain Fafnir',
    primary: 0xc9a227,
    secondary: 0x20337a,
    accent: 0x2ec4b6,
    motif: 'coil',
    letter: 'F',
    spinDir: -1,
    // Nearly round spin-steal shield: tiny nubs, no wings.
    chip: 'sticker',
    // smooth spin-steal scallops over teal
    underRing: 0x2ec4b6,
    surface: 'wave',
    blade: { root: 0.86, belly: 0.35, cut: 0.25, edge: 'wave' },
  },
  {
    layerId: 'aegis',
    canonName: 'Orb Aegis',
    primary: 0xe9ecec,
    secondary: 0x57c4a8,
    accent: 0xc0c7cd,
    motif: 'shield',
    letter: 'A',
    spinDir: 1,
    // A defensive wall: near-circular with shallow scallops.
    chip: 'sticker',
    // shield scallops over a mint tier
    underRing: 0x57c4a8,
    surface: 'wave',
    blade: { root: 0.9, belly: 0.3, cut: 0.2, edge: 'wave' },
  },

  // ------------------------------------------------------------------------
  // The player-designed line, transcribed from the owner's own reference art.
  // All four share a construction grammar the first six don't have: a
  // translucent under-ring tier below the blade tier, and a dark centre chip
  // with a gold bezel — which is why those became BeyDesign fields.
  // ------------------------------------------------------------------------
  {
    layerId: 'crossx',
    canonName: 'Cross X',
    // Cobalt core under translucent crimson wing blades, massive gold X-and-
    // sword armor raised over the face, teal-driver colourway.
    primary: 0x1d4fd8,
    secondary: 0xd0202a,
    accent: 0xe8b83a,
    motif: 'xsword',
    letter: 'X',
    spinDir: 1,
    chip: 'dark',
    underRing: 0x4d78e8,
    crest: 'xsword',
    blade: { root: 0.56, belly: 1.1, cut: 1.15, edge: 'blade' },
  },
  {
    layerId: 'phoenix',
    canonName: 'Crimson Phoenix',
    // Metallic crimson feather-wings over a translucent amber under-ring;
    // black chip with the firebird in red-orange, gold bezel.
    primary: 0xc01822,
    secondary: 0x8e0f18,
    accent: 0xf0a020,
    motif: 'phoenix',
    letter: 'P',
    spinDir: 1,
    chip: 'dark',
    underRing: 0xf0c020,
    blade: { root: 0.64, belly: 1.2, cut: 0.85, edge: 'flame' },
  },
  {
    layerId: 'leon',
    canonName: 'Steel Leon',
    // Bare brushed-metal armor lobes over a black under-layer; gold lion face
    // on the black chip, blue eye accent carried in `secondary`.
    primary: 0xc7ccd2,
    secondary: 0x3a7bd5,
    accent: 0xd4a017,
    motif: 'lion',
    letter: 'L',
    spinDir: 1,
    chip: 'dark',
    underRing: 0x23262b,
    metal: true,
    // The strongest read of the three: bare steel already, so the moulded
    // crests get the banded highlight on the walls as well as the face.
    surface: 'wave',
    blade: { root: 0.7, belly: 0.8, cut: 0.6, edge: 'wave' },
  },
  {
    layerId: 'drake',
    canonName: 'Cobalt Drake',
    // Compact matte-silver tri-blade hugging a deep translucent cobalt
    // under-layer; blue dragon head over split flames on the black chip.
    primary: 0xb9bec6,
    secondary: 0x2a3f9f,
    accent: 0x3f8fe8,
    motif: 'drakehead',
    letter: 'D',
    spinDir: 1,
    chip: 'dark',
    underRing: 0x1a2f8f,
    metal: true,
    blade: { root: 0.74, belly: 0.9, cut: 0.8, edge: 'hook' },
  },
];

export const designByLayer = (layerId: string): BeyDesign =>
  BEYDEX.find((d) => d.layerId === layerId) ?? BEYDEX[0];

/**
 * Whole beyblades, pickable as a unit.
 *
 * The combos mirror the rival ladder's presets so "pick a bey" and "fight a
 * rival" draw from the same universe, and each carries its canonical spin
 * direction — choosing Fafnir *means* choosing left spin, exactly as in the
 * source material. The recommended skin is the one whose hue family matches
 * the design, so the trail and HUD pick up the bey's colours.
 */
export interface BeyPreset {
  name: string;
  layerId: string;
  discId: string;
  driverId: string;
  spinDir: 1 | -1;
  skinId: string;
}

export const BEY_PRESETS: BeyPreset[] = [
  { name: 'Victory Valtryek', layerId: 'valtryek', discId: 'heavy', driverId: 'xtreme', spinDir: 1, skinId: 'frost' },
  { name: 'Storm Spryzen', layerId: 'spryzen', discId: 'heavy', driverId: 'orbit', spinDir: 1, skinId: 'ember' },
  { name: 'Rising Ragnaruk', layerId: 'ragnaruk', discId: 'blitz', driverId: 'volcanic', spinDir: 1, skinId: 'venom' },
  { name: 'Lost Luinor', layerId: 'luinor', discId: 'gravity', driverId: 'atomic', spinDir: -1, skinId: 'frost' },
  { name: 'Drain Fafnir', layerId: 'fafnir', discId: 'spread', driverId: 'needle', spinDir: -1, skinId: 'solar' },
  { name: 'Orb Aegis', layerId: 'aegis', discId: 'wall', driverId: 'bastion', spinDir: 1, skinId: 'venom' },
  // The player-designed line. Discs/drivers picked to match each design's
  // reference art: Cross X's teal knurled tip maps to Xtreme's rubber puck,
  // Phoenix's black knurled tip to Volcanic, Leon's red tip to Xtreme, Drake's
  // compact frame to Orbit's ball.
  { name: 'Cross X', layerId: 'crossx', discId: 'gravity', driverId: 'xtreme', spinDir: 1, skinId: 'frost' },
  { name: 'Crimson Phoenix', layerId: 'phoenix', discId: 'spread', driverId: 'volcanic', spinDir: 1, skinId: 'ember' },
  { name: 'Steel Leon', layerId: 'leon', discId: 'wall', driverId: 'xtreme', spinDir: 1, skinId: 'solar' },
  { name: 'Cobalt Drake', layerId: 'drake', discId: 'heavy', driverId: 'orbit', spinDir: 1, skinId: 'frost' },
];

// ---------------------------------------------------------------------------
// Emblems
// ---------------------------------------------------------------------------

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** Cel tint toward white — flat shading needs sibling tones, not gradients. */
const lighten = (c: number, f: number): string => {
  const ch = (v: number): number => Math.round(v + (255 - v) * f);
  return `rgb(${ch((c >> 16) & 0xff)}, ${ch((c >> 8) & 0xff)}, ${ch(c & 0xff)})`;
};

// Fixed chip-hardware colours: the bezel and dark face must match across the
// whole product line, so they cannot come from any one design's palette.
const CHIP_GOLD = '#e0b23c';
const CHIP_GOLD_DEEP = '#8a6a1c';
const DARK_FACE = '#141317';
// Drakehead's lower flame lobe is canonically ember orange on every design.
const EMBER = '#ff7a2e';

/**
 * The beast crest for a design, drawn onto a square canvas.
 *
 * Ten motifs, one drawing each. All share the same skeleton — disc, ring,
 * beast mark, roman letter — because that is the grammar of the real faces;
 * the beast mark is where they diverge. The letter matters more than it
 * looks: at battle distance the mark blurs but the letter survives, and the
 * show's own stickers lean on exactly that. The chip mode swaps only the
 * disc/ring/letter treatment, never the mark, so a beast keeps its
 * silhouette across product lines.
 */
export function beastEmblem(design: BeyDesign, size = 256): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const mid = size / 2;
  const ink = '#0a0a12';

  const dark = design.chip === 'dark';

  if (dark) {
    // Near-black face in a wide gold bezel: gold, deep gold, gold, so the
    // rim reads as machined metal rather than one flat band.
    ctx.fillStyle = DARK_FACE;
    ctx.beginPath();
    ctx.arc(mid, mid, size * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = CHIP_GOLD;
    ctx.lineWidth = size * 0.024;
    ctx.beginPath();
    ctx.arc(mid, mid, size * 0.464, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = CHIP_GOLD_DEEP;
    ctx.lineWidth = size * 0.03;
    ctx.beginPath();
    ctx.arc(mid, mid, size * 0.436, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = CHIP_GOLD;
    ctx.lineWidth = size * 0.02;
    ctx.beginPath();
    ctx.arc(mid, mid, size * 0.408, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // Disc + ink ring, common to every sticker crest.
    ctx.fillStyle = hex(design.secondary);
    ctx.beginPath();
    ctx.arc(mid, mid, size * 0.46, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = size * 0.05;
    ctx.stroke();
    ctx.strokeStyle = hex(design.accent);
    ctx.lineWidth = size * 0.02;
    ctx.beginPath();
    ctx.arc(mid, mid, size * 0.4, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(mid, mid);
  const s = size / 256; // the marks below are authored at 256

  // Dark chips grow the mark and swap the ink cel line for the design's
  // primary, so the beast carries the colour identity on the black face.
  ctx.save();
  if (dark) ctx.scale(1.15, 1.15);
  ctx.fillStyle = hex(design.accent);
  ctx.strokeStyle = dark ? hex(design.primary) : ink;
  ctx.lineWidth = 5 * s;

  switch (design.motif) {
    case 'valkyrie': {
      // Winged helm: two swept wings meeting at a crown peak.
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, -20 * s);
        ctx.quadraticCurveTo(dir * 30 * s, -70 * s, dir * 88 * s, -52 * s);
        ctx.quadraticCurveTo(dir * 52 * s, -30 * s, dir * 60 * s, -6 * s);
        ctx.quadraticCurveTo(dir * 28 * s, -18 * s, 0, -6 * s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'flame': {
      // Three licks of fire rising from a base arc.
      for (const [dx, h] of [
        [-40, 52],
        [0, 74],
        [40, 52],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(dx * s - 16 * s, -2 * s);
        ctx.quadraticCurveTo(dx * s - 20 * s, -h * 0.55 * s, dx * s, -h * s);
        ctx.quadraticCurveTo(dx * s + 20 * s, -h * 0.45 * s, dx * s + 16 * s, -2 * s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'twinface': {
      // Two horned profiles back to back — drawn as opposing crescents with a
      // horn barb each, one in each of the design's halves.
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(dir * 14 * s, -58 * s);
        ctx.quadraticCurveTo(dir * 66 * s, -34 * s, dir * 60 * s, 26 * s);
        ctx.quadraticCurveTo(dir * 40 * s, 4 * s, dir * 22 * s, -8 * s);
        ctx.quadraticCurveTo(dir * 40 * s, -30 * s, dir * 14 * s, -58 * s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Horn barb.
        ctx.beginPath();
        ctx.moveTo(dir * 34 * s, -52 * s);
        ctx.lineTo(dir * 62 * s, -78 * s);
        ctx.lineTo(dir * 52 * s, -40 * s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'dragon': {
      // A dragon head in profile: jagged crest, open jaw, lance line behind.
      ctx.beginPath();
      ctx.moveTo(-70 * s, 10 * s);
      ctx.lineTo(70 * s, 10 * s);
      ctx.stroke(); // the lance
      ctx.beginPath();
      ctx.moveTo(-46 * s, -6 * s);
      ctx.lineTo(-10 * s, -66 * s);
      ctx.lineTo(2 * s, -34 * s);
      ctx.lineTo(34 * s, -56 * s);
      ctx.lineTo(30 * s, -18 * s);
      ctx.lineTo(64 * s, -20 * s);
      ctx.lineTo(34 * s, 6 * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'coil': {
      // The hoarding dragon curled around its treasure: a fat spiral.
      ctx.lineWidth = 14 * s;
      ctx.strokeStyle = hex(design.accent);
      ctx.beginPath();
      for (let t = 0; t <= 1; t += 0.02) {
        const ang = t * Math.PI * 3.2 - Math.PI / 2;
        const rad = (12 + t * 52) * s;
        const x = Math.cos(ang) * rad;
        const y = Math.sin(ang) * rad;
        if (t === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.lineWidth = 5 * s;
      ctx.strokeStyle = ink;
      // Head wedge at the spiral's mouth.
      ctx.beginPath();
      ctx.moveTo(56 * s, -34 * s);
      ctx.lineTo(84 * s, -50 * s);
      ctx.lineTo(70 * s, -16 * s);
      ctx.closePath();
      ctx.fillStyle = hex(design.accent);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'shield': {
      // The gorgon shield: six serpent heads ringing a central eye.
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(ang) * 58 * s;
        const y = Math.sin(ang) * 58 * s;
        ctx.beginPath();
        ctx.arc(x, y, 13 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 26 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'xsword': {
      // Sword first so the X reads as laid over it.
      ctx.fillStyle = '#dde3ea';
      ctx.beginPath();
      ctx.moveTo(0, -78 * s);
      ctx.lineTo(6 * s, -66 * s);
      ctx.lineTo(6 * s, 14 * s);
      ctx.lineTo(-6 * s, 14 * s);
      ctx.lineTo(-6 * s, -66 * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = CHIP_GOLD;
      ctx.beginPath();
      ctx.rect(-20 * s, 14 * s, 40 * s, 8 * s); // crossguard
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(-4 * s, 22 * s, 8 * s, 14 * s); // grip
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 42 * s, 7 * s, 0, Math.PI * 2); // pommel
      ctx.fill();
      ctx.stroke();
      // Four arms; the tips notch inward so the flare reads at chip size.
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.rotate(Math.PI / 4 + (i * Math.PI) / 2);
        ctx.beginPath();
        ctx.moveTo(-7 * s, -6 * s);
        ctx.lineTo(-13 * s, -64 * s);
        ctx.lineTo(0, -57 * s);
        ctx.lineTo(13 * s, -64 * s);
        ctx.lineTo(7 * s, -6 * s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Diamond hatch: crossed thin black diagonals, per the reference art.
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2 * s;
        for (const [ya, yb] of [
          [-24, -34],
          [-40, -50],
          [-34, -24],
          [-50, -40],
        ] as const) {
          ctx.beginPath();
          ctx.moveTo(-8 * s, ya * s);
          ctx.lineTo(8 * s, yb * s);
          ctx.stroke();
        }
        ctx.restore();
      }
      break;
    }
    case 'phoenix': {
      // Rising firebird: wings of three lobed tongues a side, outer first so
      // the inner lobes overlap them.
      for (const dir of [-1, 1] as const) {
        for (const [tx, ty] of [
          [78, -34],
          [58, -62],
          [34, -78],
        ] as const) {
          ctx.beginPath();
          ctx.moveTo(dir * 8 * s, 14 * s);
          ctx.quadraticCurveTo(dir * tx * 0.9 * s, ty * 0.15 * s, dir * tx * s, ty * s);
          ctx.quadraticCurveTo(dir * tx * 0.35 * s, ty * 0.65 * s, dir * 6 * s, 2 * s);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
      // Tail flames trailing below.
      for (const [dx, len] of [
        [-17, 48],
        [0, 64],
        [17, 48],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo((dx - 7) * s, 14 * s);
        ctx.quadraticCurveTo((dx - 10) * s, len * 0.6 * s, dx * s, len * s);
        ctx.quadraticCurveTo((dx + 10) * s, len * 0.55 * s, (dx + 7) * s, 14 * s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // Body and head a step lighter than the wings, per the reference art.
      ctx.fillStyle = lighten(design.accent, 0.35);
      ctx.beginPath();
      ctx.ellipse(0, -2 * s, 14 * s, 22 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -50 * s); // beak, drawn first so the head covers its base
      ctx.lineTo(6 * s, -38 * s);
      ctx.lineTo(-6 * s, -38 * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -32 * s, 10 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'lion': {
      // Mane of nine triangular tufts on a disc — blocky, not fluffy.
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang - 0.28) * 52 * s, Math.sin(ang - 0.28) * 52 * s);
        ctx.lineTo(Math.cos(ang) * 78 * s, Math.sin(ang) * 78 * s);
        ctx.lineTo(Math.cos(ang + 0.28) * 52 * s, Math.sin(ang + 0.28) * 52 * s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, 54 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Ears, before the face so it pins their bases.
      for (const dir of [-1, 1] as const) {
        ctx.beginPath();
        ctx.moveTo(dir * 16 * s, -38 * s);
        ctx.lineTo(dir * 32 * s, -56 * s);
        ctx.lineTo(dir * 36 * s, -32 * s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // Face a step lighter so it separates from the mane at distance.
      ctx.fillStyle = lighten(design.accent, 0.22);
      ctx.beginPath();
      ctx.arc(0, 2 * s, 42 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Muzzle wedge.
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.moveTo(-11 * s, 8 * s);
      ctx.lineTo(11 * s, 8 * s);
      ctx.lineTo(0, 30 * s);
      ctx.closePath();
      ctx.fill();
      // Eyes in the contrasting secondary, browed inward for the glare.
      ctx.fillStyle = hex(design.secondary);
      for (const dir of [-1, 1] as const) {
        ctx.beginPath();
        ctx.moveTo(dir * 10 * s, -12 * s);
        ctx.lineTo(dir * 28 * s, -18 * s);
        ctx.lineTo(dir * 28 * s, -8 * s);
        ctx.lineTo(dir * 10 * s, -4 * s);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'drakehead': {
      // Split flame behind the head: accent above, fixed ember below.
      ctx.beginPath();
      ctx.moveTo(-8 * s, -26 * s);
      ctx.quadraticCurveTo(-44 * s, -52 * s, -80 * s, -38 * s);
      ctx.quadraticCurveTo(-40 * s, -16 * s, -6 * s, -4 * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = EMBER;
      ctx.beginPath();
      ctx.moveTo(-6 * s, 2 * s);
      ctx.quadraticCurveTo(-40 * s, 4 * s, -76 * s, 34 * s);
      ctx.quadraticCurveTo(-36 * s, 42 * s, -6 * s, 24 * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Swept-back horn pair, long over short.
      ctx.fillStyle = hex(design.accent);
      ctx.beginPath();
      ctx.moveTo(14 * s, -34 * s);
      ctx.quadraticCurveTo(-10 * s, -52 * s, -42 * s, -62 * s);
      ctx.quadraticCurveTo(-10 * s, -42 * s, 2 * s, -30 * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(24 * s, -28 * s);
      ctx.quadraticCurveTo(-2 * s, -40 * s, -24 * s, -44 * s);
      ctx.quadraticCurveTo(-2 * s, -32 * s, 10 * s, -22 * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Skull and snout, lighter than the flame; two teeth cut the jawline.
      ctx.fillStyle = lighten(design.accent, 0.22);
      ctx.beginPath();
      ctx.moveTo(-14 * s, -28 * s);
      ctx.lineTo(20 * s, -36 * s);
      ctx.lineTo(66 * s, -12 * s);
      ctx.lineTo(48 * s, -2 * s);
      ctx.lineTo(43 * s, 8 * s);
      ctx.lineTo(38 * s, -2 * s);
      ctx.lineTo(33 * s, 8 * s);
      ctx.lineTo(28 * s, -2 * s);
      ctx.lineTo(6 * s, -4 * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Lower jaw dropped open.
      ctx.beginPath();
      ctx.moveTo(4 * s, 0);
      ctx.lineTo(56 * s, 16 * s);
      ctx.lineTo(12 * s, 20 * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(16 * s, -20 * s, 4.5 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }

  // Eye slit only on the classic beasts: the shield's disc IS the eye, and
  // the newer marks draw their own eyes.
  if (
    design.motif === 'valkyrie' ||
    design.motif === 'flame' ||
    design.motif === 'twinface' ||
    design.motif === 'dragon' ||
    design.motif === 'coil'
  ) {
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(0, 22 * s, 20 * s, 9 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore(); // pop the dark-chip mark scale before lettering

  if (dark) {
    // Small gold letter tucked at the bottom edge, hallmark-style; the dark
    // stroke punches it out of whatever the mark left behind it.
    ctx.fillStyle = CHIP_GOLD;
    ctx.strokeStyle = DARK_FACE;
    ctx.lineWidth = 4 * s;
    ctx.font = `900 ${30 * s}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(design.letter, 0, 88 * s);
    ctx.fillText(design.letter, 0, 88 * s);
  } else {
    // The big roman letter, low on the crest like the real stickers.
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = ink;
    ctx.lineWidth = 6 * s;
    ctx.font = `900 ${72 * s}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(design.letter, 0, 62 * s);
    ctx.fillText(design.letter, 0, 62 * s);
  }

  ctx.restore();
  return canvas;
}

/** The emblem as a texture, for material maps. */
export function beastEmblemTexture(design: BeyDesign, size = 256): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(beastEmblem(design, size));
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
