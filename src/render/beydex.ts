import { registryDesigns, registryPresets } from './beys/registry';
import { ink } from './emblems';
import type { EmblemDraw } from './emblems';
import { CHIP_GOLD, CHIP_GOLD_DEEP, DARK_FACE, hex } from './palette';

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
  /**
   * How this bey's beast mark is drawn. A function, not a name — see EmblemDraw.
   * A new beyblade supplies its own and no existing file changes.
   */
  emblem: EmblemDraw;
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
// Derived from the per-bey registry — see beys/registry.ts. This array used to
// be the source of truth and was one of four parallel lists that had to be
// edited in lockstep for every new beyblade.
export const BEYDEX: BeyDesign[] =  registryDesigns();

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

// Derived from the per-bey registry — see beys/registry.ts.
export const BEY_PRESETS: BeyPreset[] =  registryPresets();

// ---------------------------------------------------------------------------
// Emblems
// ---------------------------------------------------------------------------


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

  design.emblem(ctx, s, design);

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

