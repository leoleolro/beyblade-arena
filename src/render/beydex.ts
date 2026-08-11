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

export interface BladeStyle {
  /** Root circle as a fraction of the collision radius. High = round shield. */
  root: number;
  /** How far outside the chord the leading edge bellies. */
  belly: number;
  /** How deep the trailing undercut bites toward the centre. */
  cut: number;
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
  motif: 'valkyrie' | 'flame' | 'twinface' | 'dragon' | 'coil' | 'shield';
  /** Big roman letter on the face sticker, as on the real ones. */
  letter: string;
  /** Canonical spin direction: Fafnir and Luinor lines spin LEFT. */
  spinDir: 1 | -1;
  blade: BladeStyle;
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
    blade: { root: 0.6, belly: 1.0, cut: 1.0 },
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
    blade: { root: 0.68, belly: 1.15, cut: 0.7 },
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
    blade: { root: 0.62, belly: 0.95, cut: 0.9 },
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
    blade: { root: 0.58, belly: 1.1, cut: 1.2 },
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
    blade: { root: 0.86, belly: 0.35, cut: 0.25 },
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
    blade: { root: 0.9, belly: 0.3, cut: 0.2 },
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
];

// ---------------------------------------------------------------------------
// Emblems
// ---------------------------------------------------------------------------

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/**
 * The beast crest for a design, drawn onto a square canvas.
 *
 * Six motifs, one drawing each. All share the same skeleton — coloured disc,
 * heavy ink ring, beast mark, big roman letter — because that is the grammar
 * of the real face stickers; the beast mark is where they diverge. The letter
 * matters more than it looks: at battle distance the mark blurs but the letter
 * survives, and the show's own stickers lean on exactly that.
 */
export function beastEmblem(design: BeyDesign, size = 256): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const mid = size / 2;
  const ink = '#0a0a12';

  // Disc + ink ring, common to every crest.
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

  ctx.save();
  ctx.translate(mid, mid);
  const s = size / 256; // the marks below are authored at 256

  ctx.fillStyle = hex(design.accent);
  ctx.strokeStyle = ink;
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
  }

  // Eye slit on every beast except the shield (whose disc IS the eye).
  if (design.motif !== 'shield') {
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(0, 22 * s, 20 * s, 9 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // The big roman letter, low on the crest like the real stickers.
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 6 * s;
  ctx.font = `900 ${72 * s}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText(design.letter, 0, 62 * s);
  ctx.fillText(design.letter, 0, 62 * s);

  ctx.restore();
  return canvas;
}

/** The emblem as a texture, for material maps. */
export function beastEmblemTexture(design: BeyDesign, size = 256): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(beastEmblem(design, size));
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
