import type { BeyDesign } from './beydex';
import { CHIP_GOLD, EMBER, hex, lighten } from './palette';

/**
 * The beast marks.
 *
 * Their own module, and the reason is a runtime import cycle rather than
 * tidiness. Each bey module under `beys/` imports its mark; `beys/registry.ts`
 * imports every bey module; and `beydex.ts` derives `BEYDEX` from the registry.
 * With the marks living in beydex.ts that closed a loop — beydex -> registry ->
 * beys/* -> beydex — and `BEYDEX` evaluated to `registryDesigns is not a
 * function` because the registry had not finished initialising.
 *
 * The `BeyDesign` import below is deliberately `import type`: type-only imports
 * are erased, so it cannot reopen the cycle.
 */
/** Cel ink for the marks. Module scope now that the marks are functions. */
export const ink = '#0a0a12';

/**
 * One beast mark, drawn into the emblem canvas.
 *
 * A FUNCTION on the design, not a name in a union. `motif` used to be a closed
 * union of eleven string literals switched exhaustively right here, which meant
 * TypeScript refused to compile until BOTH the union and the switch were edited
 * for every new beyblade. Adding a bey should not require editing the engine.
 *
 * The contract: the canvas is already translated to the chip centre, `s` is the
 * 256px authoring scale, and fill/stroke/lineWidth are already set from the
 * design's palette. A mark draws its shape and nothing else — the bezel, the
 * chip mode and the roman letter are the caller’s.
 */
export type EmblemDraw = (
  ctx: CanvasRenderingContext2D,
  s: number,
  design: BeyDesign,
) => void;

export const valkyrieEmblem: EmblemDraw = (ctx, s) => {
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
  // The eye slit belongs to the MARK, not the caller. It used to be drawn in
  // `beastEmblem` behind a list of five motif names — which is exactly the kind
  // of central switch this refactor exists to delete. The newer beasts already
  // drew their own eyes; now every beast does.
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.ellipse(0, 22 * s, 20 * s, 9 * s, 0, 0, Math.PI * 2);
  ctx.fill();
};

export const flameEmblem: EmblemDraw = (ctx, s) => {
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
  // The eye slit belongs to the MARK, not the caller. It used to be drawn in
  // `beastEmblem` behind a list of five motif names — which is exactly the kind
  // of central switch this refactor exists to delete. The newer beasts already
  // drew their own eyes; now every beast does.
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.ellipse(0, 22 * s, 20 * s, 9 * s, 0, 0, Math.PI * 2);
  ctx.fill();
};

export const twinfaceEmblem: EmblemDraw = (ctx, s) => {
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
  // The eye slit belongs to the MARK, not the caller. It used to be drawn in
  // `beastEmblem` behind a list of five motif names — which is exactly the kind
  // of central switch this refactor exists to delete. The newer beasts already
  // drew their own eyes; now every beast does.
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.ellipse(0, 22 * s, 20 * s, 9 * s, 0, 0, Math.PI * 2);
  ctx.fill();
};

export const dragonEmblem: EmblemDraw = (ctx, s) => {
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
  // The eye slit belongs to the MARK, not the caller. It used to be drawn in
  // `beastEmblem` behind a list of five motif names — which is exactly the kind
  // of central switch this refactor exists to delete. The newer beasts already
  // drew their own eyes; now every beast does.
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.ellipse(0, 22 * s, 20 * s, 9 * s, 0, 0, Math.PI * 2);
  ctx.fill();
};

export const coilEmblem: EmblemDraw = (ctx, s, design) => {
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
  // The eye slit belongs to the MARK, not the caller. It used to be drawn in
  // `beastEmblem` behind a list of five motif names — which is exactly the kind
  // of central switch this refactor exists to delete. The newer beasts already
  // drew their own eyes; now every beast does.
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.ellipse(0, 22 * s, 20 * s, 9 * s, 0, 0, Math.PI * 2);
  ctx.fill();
};

export const shieldEmblem: EmblemDraw = (ctx, s) => {
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
};

export const xswordEmblem: EmblemDraw = (ctx, s) => {
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
};

export const phoenixEmblem: EmblemDraw = (ctx, s, design) => {
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
};

export const lionEmblem: EmblemDraw = (ctx, s, design) => {
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
};

export const drakeheadEmblem: EmblemDraw = (ctx, s, design) => {
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
};

export const batwingEmblem: EmblemDraw = (ctx, s, design) => {
  // Bat with wings spread the full width of the chip. The whole read is in
  // the trailing edge: one long convex sweep out to the tip, then three
  // concave scallops back to the body, each control point pulled *inside*
  // the chord so the membrane looks stretched between finger bones. Drawn
  // wings-first so the torso pins their roots.
  //
  // WINGSPAN IS BOUNDED BY THE BEZEL, and the bound is RADIAL.
  //
  // The first version put the tip at (86, -44) and justified it as "86 px,
  // inside the 104 px inner gold ring" — which measured the x component
  // and forgot the y. The tip's actual distance from the chip centre is
  // hypot(86, 44) = 96.6; times the 1.15 dark-chip scale that is 111.1,
  // plus half the 5·s stroke = 114.0. The chip's gold bands sit at
  // 101.8–107.0 and 107.7–115.4, and nothing here clips, so both wingtips
  // painted straight across the inner ring and landed centred on the deep
  // one — a gold mark over a gold bezel with a crimson cel line through
  // it. Every other dark-chip motif clears it (lion 89.7, phoenix 97.9,
  // drakehead 101.9).
  //
  // Scaled 0.85 throughout so the shape keeps its proportions: the tip is
  // now at hypot(73, 37) = 81.8 → 94.1 + 2.9 stroke = 97.0, clear of the
  // 101.8 inner band with room for the stroke to breathe.
  for (const dir of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(dir * 7 * s, -14 * s);
    ctx.quadraticCurveTo(dir * 37 * s, -54 * s, dir * 73 * s, -37 * s); // leading edge
    ctx.quadraticCurveTo(dir * 56 * s, -27 * s, dir * 53 * s, -3 * s); // outer scallop
    ctx.quadraticCurveTo(dir * 39 * s, -17 * s, dir * 32 * s, 5 * s);
    ctx.quadraticCurveTo(dir * 21 * s, -12 * s, dir * 11 * s, 2 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // Torso, tapering to a point — a hanging bat, not a standing beast.
  ctx.beginPath();
  ctx.moveTo(-15 * s, -8 * s);
  ctx.quadraticCurveTo(-13 * s, 26 * s, 0, 38 * s);
  ctx.quadraticCurveTo(13 * s, 26 * s, 15 * s, -8 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Ears before the head, so the skull covers their bases.
  for (const dir of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(dir * 5 * s, -30 * s);
    ctx.lineTo(dir * 21 * s, -62 * s);
    ctx.lineTo(dir * 25 * s, -26 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // Skull a step lighter than the wings — same trick the lion uses, and the
  // reason the face still separates at chip size.
  ctx.fillStyle = lighten(design.accent, 0.22);
  ctx.beginPath();
  ctx.ellipse(0, -20 * s, 20 * s, 17 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Eyes: narrow wedges raked inward and down, for the glare.
  ctx.fillStyle = hex(design.primary);
  for (const dir of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(dir * 4 * s, -22 * s);
    ctx.lineTo(dir * 15 * s, -27 * s);
    ctx.lineTo(dir * 15 * s, -19 * s);
    ctx.lineTo(dir * 4 * s, -16 * s);
    ctx.closePath();
    ctx.fill();
  }
  // Fangs, hung off the jawline over the torso: the one detail that says
  // vampire rather than bat, so they get bone white rather than a tint.
  ctx.fillStyle = '#f2f0ea';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2.5 * s;
  for (const dir of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(dir * 3 * s, -8 * s);
    ctx.lineTo(dir * 9 * s, -8 * s);
    ctx.lineTo(dir * 5 * s, 6 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
};

/**
 * THE BOUND EVERY MARK BELOW RESPECTS, stated once so it stops being folklore.
 *
 * `beastEmblem` scales a dark-chip mark by 1.15 and the chip's inner gold band
 * starts at radius 101.8, so an authored point at radius r paints at
 * r * 1.15 + half the 5·s stroke. Keeping every point inside r = 84 lands at
 * 99.1 and clears the bezel. batwingEmblem carries the full derivation and the
 * story of the version that got it wrong by measuring x instead of hypot.
 */

export const seiryuEmblem: EmblemDraw = (ctx, s, design) => {
  // Seiryu, the Azure Dragon of the East, in side profile — one of the Four
  // Auspicious Beasts, and what CobaltDragoon's Gear Chip actually carries.
  //
  // A CHINESE dragon, which is the entire reason this is not `drakeheadEmblem`.
  // That one is a western skull: bat horns, flame, a hinged jaw. This one is
  // serpentine — a long coiling body, antler horns, trailing whiskers, no
  // wings — and the two must not read as recolours of each other, because the
  // roster already has both kinds of dragon in it.
  //
  // THE CALLER'S CEL LINE IS CAPTURED, NOT ASSUMED. `beastEmblem` sets the
  // stroke to `ink` on a sticker chip and to the design's PRIMARY on a dark
  // one, because ink on a near-black chip face is an invisible outline. The
  // older marks hard-set `ink` and get away with it only because every bey
  // using them happens to be a sticker chip — so this one keeps the value it
  // was handed and restores it whenever it borrows the stroke for something
  // else, and works under either treatment.
  const line = ctx.strokeStyle;

  // Body first, so the mane and head pin its near end and the coil reads as
  // passing BEHIND the skull rather than butting into it.
  ctx.lineCap = 'round';
  ctx.lineWidth = 15 * s;
  ctx.strokeStyle = hex(design.accent);
  ctx.beginPath();
  ctx.moveTo(-64 * s, 32 * s);
  ctx.quadraticCurveTo(-22 * s, 54 * s, 2 * s, 14 * s);
  ctx.quadraticCurveTo(22 * s, -18 * s, -10 * s, -28 * s);
  ctx.stroke();

  // Tail fin at the far end of the coil: three tapering barbs, so the body
  // terminates in something rather than just stopping mid-stroke.
  ctx.lineWidth = 4 * s;
  ctx.strokeStyle = line;
  ctx.fillStyle = hex(design.accent);
  // Tips at radius 75-80: the coil's own stroke already reaches 79 with its
  // 15-unit width, and the barbs must not push past it into the bezel.
  for (const [tx, ty] of [
    [-74, 12],
    [-74, 30],
    [-62, 44],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(-62 * s, 26 * s);
    ctx.lineTo(tx * s, ty * s);
    ctx.lineTo(-56 * s, 40 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Mane: five spines climbing the neck, each a little longer than the last, so
  // the ridge reads as growing toward the skull.
  for (const [bx, by, tx, ty] of [
    [-26, 4, -44, -6],
    [-22, -8, -42, -20],
    [-16, -18, -36, -34],
    [-8, -26, -26, -46],
    [2, -32, -12, -54],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(bx * s, by * s);
    ctx.lineTo(tx * s, ty * s);
    ctx.lineTo((bx + 8) * s, (by - 8) * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Antler horns, swept back over the mane: one long forked pair.
  ctx.beginPath();
  ctx.moveTo(6 * s, -42 * s);
  ctx.quadraticCurveTo(-16 * s, -58 * s, -42 * s, -64 * s);
  ctx.quadraticCurveTo(-14 * s, -50 * s, 0, -36 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-12 * s, -54 * s);
  ctx.lineTo(-30 * s, -68 * s);
  ctx.lineTo(-16 * s, -46 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Whiskers, trailing back past the mane. Thin and unfilled — they are the
  // detail that says "eastern dragon" faster than the horns do.
  ctx.lineWidth = 3.5 * s;
  for (const [cy, ey] of [
    [-14, -26],
    [-4, -12],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(8 * s, -28 * s);
    ctx.quadraticCurveTo(-24 * s, cy * s, -54 * s, ey * s);
    ctx.stroke();
  }

  // Skull and snout a step lighter than the body, so the head separates at
  // chip size — the same trick the lion and the bat use. Three teeth are cut
  // straight out of the jawline rather than drawn on top of it.
  ctx.lineWidth = 4 * s;
  ctx.fillStyle = lighten(design.accent, 0.24);
  ctx.beginPath();
  ctx.moveTo(-14 * s, -38 * s);
  ctx.lineTo(18 * s, -50 * s);
  ctx.lineTo(64 * s, -34 * s);
  ctx.lineTo(46 * s, -23 * s);
  ctx.lineTo(41 * s, -14 * s);
  ctx.lineTo(36 * s, -23 * s);
  ctx.lineTo(31 * s, -14 * s);
  ctx.lineTo(26 * s, -23 * s);
  ctx.lineTo(2 * s, -22 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Lower jaw, dropped open on the roar.
  ctx.beginPath();
  ctx.moveTo(0, -18 * s);
  ctx.lineTo(54 * s, -6 * s);
  ctx.lineTo(8 * s, -2 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.ellipse(16 * s, -34 * s, 6 * s, 4 * s, -0.2, 0, Math.PI * 2);
  ctx.fill();
};

export const firebirdEmblem: EmblemDraw = (ctx, s, design) => {
  // The phoenix spreading its wings, as PhoenixWing's Gear Chip carries it.
  //
  // Deliberately NOT `phoenixEmblem`, which the player-designed Crimson Phoenix
  // already owns. Two beys sharing a beast is fine; two beys sharing a drawing
  // is what made this roster read as recolours of itself. So this one is
  // heraldic and frontal where that one is a rising firebird: the wings are
  // built in two RANKS of feathers rather than one fan, and the tail splays
  // into five plumes rather than three licks.
  //
  // Outer rank first, so the inner rank overlaps it and the wing reads as
  // layered rather than as one flat sheet.
  for (const dir of [-1, 1] as const) {
    for (const [tx, ty, root] of [
      [76, -20, 16],
      [70, -40, 12],
      [52, -60, 8],
      [28, -70, 4],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(dir * 8 * s, root * s);
      ctx.quadraticCurveTo(dir * tx * 0.92 * s, ty * 0.18 * s, dir * tx * s, ty * s);
      ctx.quadraticCurveTo(dir * tx * 0.34 * s, ty * 0.62 * s, dir * 6 * s, (root - 12) * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  // Tail: five plumes, longest in the middle, so the fan is symmetric about the
  // body rather than raked to one side.
  for (const [dx, len, w] of [
    [-34, 52, 7],
    [-18, 66, 8],
    [0, 76, 9],
    [18, 66, 8],
    [34, 52, 7],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo((dx - w) * s, 16 * s);
    ctx.quadraticCurveTo((dx - w - 4) * s, len * 0.62 * s, dx * s, len * s);
    ctx.quadraticCurveTo((dx + w + 4) * s, len * 0.58 * s, (dx + w) * s, 16 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Body, then a three-plume head crest, then the skull — in that order so each
  // one pins the roots of the last.
  ctx.fillStyle = lighten(design.accent, 0.3);
  ctx.beginPath();
  ctx.ellipse(0, 2 * s, 16 * s, 26 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  for (const [tx, ty] of [
    [-22, -66],
    [0, -74],
    [22, -66],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(-6 * s, -38 * s);
    ctx.quadraticCurveTo(tx * 0.5 * s, ty * 0.8 * s, tx * s, ty * s);
    ctx.quadraticCurveTo(tx * 0.3 * s, ty * 0.5 * s, 6 * s, -38 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // Beak before the skull, so the skull covers its base.
  ctx.beginPath();
  ctx.moveTo(0, -20 * s);
  ctx.lineTo(9 * s, -36 * s);
  ctx.lineTo(-9 * s, -36 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -42 * s, 13 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Eyes in the contrasting secondary, raked inward for the glare.
  ctx.fillStyle = hex(design.secondary);
  for (const dir of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(dir * 3 * s, -44 * s);
    ctx.lineTo(dir * 11 * s, -48 * s);
    ctx.lineTo(dir * 11 * s, -40 * s);
    ctx.closePath();
    ctx.fill();
  }
};

export const wizardEmblem: EmblemDraw = (ctx, s, design) => {
  // A fantasy wizard casting a spell — what WizardArrow's Gear Chip carries,
  // and the only mark in this file that is a PERSON rather than a beast.
  //
  // That is why it gets a hat rather than a face: at chip size a human head is
  // an oval with two dots and reads as nothing at all, whereas a wide brim over
  // a shadowed face and a forked beard reads as "wizard" instantly. The whole
  // silhouette is carried by three shapes — brim, cone, beard — and everything
  // else is detail hung off them.
  //
  // Staff on the right, beard on the left of centre, so the mark balances
  // across the chip instead of piling up on one side.
  //
  // The caller's cel line is captured rather than assumed, for the reason
  // spelled out in `seiryuEmblem`: it is `ink` on a sticker chip and the
  // design's primary on a dark one, and hard-setting ink would erase every
  // outline on a black chip face.
  const line = ctx.strokeStyle;
  ctx.lineWidth = 5 * s;

  // Staff first: a plain shaft, so the orb and its sparks sit on top of it.
  ctx.fillStyle = lighten(design.accent, 0.15);
  ctx.beginPath();
  ctx.moveTo(50 * s, 60 * s);
  ctx.lineTo(56 * s, 46 * s);
  ctx.lineTo(44 * s, -22 * s);
  ctx.lineTo(34 * s, -20 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Six sparks radiating off the orb, drawn under it so they read as escaping.
  ctx.lineWidth = 3.5 * s;
  ctx.strokeStyle = hex(design.accent);
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.moveTo((38 + Math.cos(ang) * 18) * s, (-36 + Math.sin(ang) * 18) * s);
    ctx.lineTo((38 + Math.cos(ang) * 30) * s, (-36 + Math.sin(ang) * 30) * s);
    ctx.stroke();
  }
  ctx.lineWidth = 5 * s;
  ctx.strokeStyle = line;
  ctx.fillStyle = hex(design.accent);
  ctx.beginPath();
  ctx.arc(38 * s, -36 * s, 15 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Beard: a long forked fall, drawn before the face so the jaw covers its top.
  ctx.beginPath();
  ctx.moveTo(-30 * s, 2 * s);
  ctx.quadraticCurveTo(-40 * s, 44 * s, -22 * s, 70 * s);
  ctx.quadraticCurveTo(-8 * s, 46 * s, 0, 62 * s);
  ctx.quadraticCurveTo(12 * s, 42 * s, 26 * s, 66 * s);
  ctx.quadraticCurveTo(38 * s, 40 * s, 28 * s, 2 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Shadowed face, a step darker than the beard rather than lighter — the
  // opposite of the beasts, because a wizard's face belongs UNDER the brim.
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.ellipse(0, 4 * s, 26 * s, 24 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hat: cone, then brim over it, so the brim's far edge cuts the cone's base.
  ctx.fillStyle = hex(design.accent);
  ctx.strokeStyle = line;
  ctx.beginPath();
  ctx.moveTo(-38 * s, -12 * s);
  ctx.quadraticCurveTo(-28 * s, -52 * s, 4 * s, -74 * s);
  ctx.quadraticCurveTo(24 * s, -50 * s, 34 * s, -12 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, -10 * s, 60 * s, 13 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Four-point star on the cone, and the two eyes under the brim. Both in the
  // contrasting secondary so they survive the black of the face and the flat
  // of the hat at battle distance.
  ctx.fillStyle = hex(design.secondary);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rad = (i % 2 === 0 ? 15 : 5) * s;
    const x = -2 * s + Math.cos(ang) * rad;
    const y = -40 * s + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  // Eyes go PALE rather than secondary: they sit on the ink hood, and a deep
  // jewel tone on near-black is two dark shapes with no edge between them.
  ctx.fillStyle = lighten(design.accent, 0.55);
  for (const dir of [-1, 1] as const) {
    ctx.beginPath();
    ctx.ellipse(dir * 11 * s, 2 * s, 6 * s, 3.5 * s, dir * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
};

/**
 * EIGHT MARKS FOR THE DEFENCE-AND-STAMINA PASS.
 *
 * Every one of them is the Gear Chip its own source page describes, and where
 * the page does not describe one the mark is drawn from the part's NAME and
 * says so at the top of the function. That distinction is the same one
 * `sim/parts.ts` draws between a transcribed number and an invented one, and it
 * matters more here than it looks: a beast mark is the thing a player uses to
 * tell two tops apart at battle distance, so an invented one is a design
 * decision rather than a decoration.
 *
 * All eight respect the r = 84 bound stated above `seiryuEmblem`, and all eight
 * capture the caller's cel line rather than hard-setting `ink`, so each works
 * under either chip treatment. The older marks get away with hard-setting ink
 * only because every bey using them happens to be a sticker chip.
 */

export const triceratopsEmblem: EmblemDraw = (ctx, s, design) => {
  // "The Gear Chip features the side profile of a green triceratops."
  //
  // SIDE PROFILE, which is what makes it drawable at chip size at all. Frontal,
  // a triceratops is a disc with three spikes on it and reads as a sun; from the
  // side the frill is a great scalloped fan behind a low skull, and the two brow
  // horns rake forward past the beak. That silhouette is unmistakable at 40 px.
  //
  // Drawn frill-first so the skull pins its near edge, the same ordering
  // `seiryuEmblem` uses for its coil.
  const line = ctx.strokeStyle;

  // The frill: a fan sweeping up and back, its rim broken into seven scallops
  // (the osteoderms). Scalloped rather than smooth because a smooth fan reads
  // as a shield, and this roster already has three shields.
  ctx.fillStyle = hex(design.accent);
  ctx.beginPath();
  ctx.moveTo(6 * s, 24 * s);
  ctx.quadraticCurveTo(-46 * s, 30 * s, -68 * s, -14 * s);
  for (const [cx, cy, ex, ey] of [
    [-74, -34, -58, -44],
    [-58, -58, -40, -58],
    [-36, -70, -18, -64],
    [-8, -70, 6, -58],
  ] as const) {
    ctx.quadraticCurveTo(cx * s, cy * s, ex * s, ey * s);
  }
  ctx.quadraticCurveTo(18 * s, -44 * s, 16 * s, -10 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Skull and beak, a step lighter so the head separates from the frill —
  // the trick the lion, the bat and the dragon all use. The beak is a parrot
  // hook, which is the second thing after the frill that says triceratops.
  ctx.fillStyle = lighten(design.accent, 0.26);
  ctx.beginPath();
  ctx.moveTo(-2 * s, -46 * s);
  ctx.quadraticCurveTo(40 * s, -40 * s, 58 * s, -12 * s);
  ctx.lineTo(72 * s, 2 * s); // beak tip
  ctx.quadraticCurveTo(56 * s, 12 * s, 44 * s, 6 * s);
  ctx.quadraticCurveTo(20 * s, 26 * s, -4 * s, 20 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Two brow horns raked forward, the far one shorter and darker so the pair
  // reads as depth rather than as a fork. Nose horn last, short and blunt.
  ctx.fillStyle = hex(design.secondary);
  for (const [bx, by, tx, ty, w] of [
    [10, -44, 62, -60, 9],
    [22, -36, 70, -44, 8],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(bx * s, by * s);
    ctx.quadraticCurveTo((bx + tx) * 0.5 * s, (by + ty) * 0.5 * s - 8 * s, tx * s, ty * s);
    ctx.lineTo((bx + w) * s, (by + w) * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(50 * s, -14 * s);
  ctx.lineTo(64 * s, -30 * s);
  ctx.lineTo(60 * s, -8 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Eye: a narrow wedge under the brow, raked back for the glare.
  ctx.fillStyle = ink;
  ctx.strokeStyle = line;
  ctx.beginPath();
  ctx.ellipse(24 * s, -22 * s, 8 * s, 5 * s, -0.3, 0, Math.PI * 2);
  ctx.fill();
};

export const mummyEmblem: EmblemDraw = (ctx, s, design) => {
  // "The Gear Chip features a mummy."
  //
  // The whole read is the WRAPPING, not the face. A bandaged head is an oval
  // with two lit eyes; what makes it a mummy is that the oval is crossed by
  // bands running at an angle and that two loose ends trail off it. So the
  // bands are cut out of the head as strokes in the chip's own dark, rather
  // than drawn on top in a third colour that would muddy at chip size.
  const line = ctx.strokeStyle;

  // Trailing bandage ends first, so the head covers where they attach. Two,
  // different lengths, both curling — a symmetric pair would read as ribbons.
  ctx.lineCap = 'round';
  ctx.lineWidth = 11 * s;
  ctx.strokeStyle = hex(design.accent);
  ctx.beginPath();
  ctx.moveTo(-24 * s, 24 * s);
  ctx.quadraticCurveTo(-58 * s, 44 * s, -46 * s, 72 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(26 * s, 26 * s);
  ctx.quadraticCurveTo(62 * s, 34 * s, 58 * s, 58 * s);
  ctx.stroke();

  // The head: a tall wrapped oval, wider at the crown than the jaw.
  ctx.lineWidth = 5 * s;
  ctx.strokeStyle = line;
  ctx.fillStyle = hex(design.accent);
  ctx.beginPath();
  ctx.moveTo(0, -74 * s);
  ctx.quadraticCurveTo(46 * s, -66 * s, 44 * s, -8 * s);
  ctx.quadraticCurveTo(42 * s, 44 * s, 0, 50 * s);
  ctx.quadraticCurveTo(-42 * s, 44 * s, -44 * s, -8 * s);
  ctx.quadraticCurveTo(-46 * s, -66 * s, 0, -74 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Six bands raked across the head. Clipped to the head so they cannot spill
  // past the silhouette, which is what separates "wrapped" from "scribbled on".
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 5 * s;
  for (const y of [-58, -40, -22, 2, 20, 38] as const) {
    ctx.beginPath();
    ctx.moveTo(-56 * s, y * s);
    ctx.lineTo(56 * s, (y - 16) * s);
    ctx.stroke();
  }
  // The eye slot: one dark band left deliberately wide, which is where the
  // eyes sit. Cutting the slot rather than drawing a face is the whole idea.
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(-52 * s, -6 * s);
  ctx.lineTo(52 * s, -22 * s);
  ctx.lineTo(52 * s, -2 * s);
  ctx.lineTo(-52 * s, 14 * s);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Two lit eyes in the slot. The design's secondary, because they have to
  // survive being painted on near-black and a jewel tone would vanish.
  ctx.fillStyle = hex(design.secondary);
  for (const [dx, dy] of [
    [-19, 0],
    [19, -6],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(dx * s, dy * s, 9 * s, 5 * s, -0.14, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const haloEmblem: EmblemDraw = (ctx, s, design) => {
  // "The Gear Chip features an angel halo and wings, along with a ring in the
  // background."
  //
  // Three elements and the source names all three, which is rarer than it
  // sounds — most Gear Chip lines in the data name one beast and stop. So this
  // mark is drawn strictly to that sentence: background ring, then wings, then
  // the halo floating clear above them with nothing between.
  //
  // NO BODY. Every winged mark already in this file hangs its wings off a
  // torso (the bat, both phoenixes), and repeating that would make this the
  // fourth bird. An empty space where the figure should be is what makes it
  // read as a halo rather than as an angel — and it is also what the part is:
  // a Blade whose centre is a ring.
  const line = ctx.strokeStyle;

  // The background ring: a wide open annulus, drawn first and left unfilled so
  // the wings cross in front of it.
  ctx.strokeStyle = hex(design.secondary);
  ctx.lineWidth = 9 * s;
  ctx.beginPath();
  ctx.arc(0, 4 * s, 66 * s, 0, Math.PI * 2);
  ctx.stroke();

  // Wings: four primaries a side, each a long taper, the outer ones sweeping
  // further back. Drawn root-outward so each feather overlaps the one behind.
  ctx.lineWidth = 4.5 * s;
  ctx.strokeStyle = line;
  ctx.fillStyle = hex(design.accent);
  for (const dir of [-1, 1] as const) {
    for (const [tx, ty, root] of [
      [78, 30, 22],
      [76, 8, 14],
      [66, -14, 6],
      [48, -34, -2],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(dir * 10 * s, root * s);
      ctx.quadraticCurveTo(dir * tx * 0.66 * s, (ty - 18) * s, dir * tx * s, ty * s);
      ctx.quadraticCurveTo(dir * tx * 0.44 * s, (ty + 14) * s, dir * 8 * s, (root - 14) * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  // Coverts: a short second rank at the shoulder, a step lighter, so the wing
  // has a near edge instead of reading as one flat sheet of primaries.
  ctx.fillStyle = lighten(design.accent, 0.3);
  for (const dir of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(dir * 8 * s, 20 * s);
    ctx.quadraticCurveTo(dir * 40 * s, 6 * s, dir * 42 * s, -14 * s);
    ctx.quadraticCurveTo(dir * 26 * s, -2 * s, dir * 6 * s, 2 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // The halo, floating clear above the wing roots: an ellipse in perspective,
  // struck as a ring rather than filled.
  ctx.strokeStyle = hex(design.accent);
  ctx.lineWidth = 9 * s;
  ctx.beginPath();
  ctx.ellipse(0, -52 * s, 30 * s, 11 * s, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = line;
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.ellipse(0, -52 * s, 34 * s, 14 * s, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, -52 * s, 26 * s, 8 * s, 0, 0, Math.PI * 2);
  ctx.stroke();
};

export const bearEmblem: EmblemDraw = (ctx, s, design) => {
  // Savage Bear's own page does not describe its Gear Chip — its Description is
  // two sentences about which other Blade shares its mold. So this mark comes
  // from the part's NAME rather than from a sentence, and that is stated here
  // rather than buried: it is the one invented mark in this batch.
  //
  // Frontal, and deliberately so. Every profile head already in this file (the
  // dragon, the drake, the triceratops, the shark) faces right; a fifth would
  // make the emblem set look like one drawing at different zooms. A bear seen
  // head-on is two round ears on a broad skull, which is a shape nothing else
  // here owns.
  const line = ctx.strokeStyle;

  // Ears first, so the skull covers their bases and they read as behind it.
  ctx.fillStyle = hex(design.accent);
  for (const dir of [-1, 1] as const) {
    ctx.beginPath();
    ctx.arc(dir * 44 * s, -44 * s, 22 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // Inner ear, a step lighter — without it the ears are two flat coins.
  ctx.fillStyle = lighten(design.accent, 0.32);
  for (const dir of [-1, 1] as const) {
    ctx.beginPath();
    ctx.arc(dir * 44 * s, -42 * s, 11 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // Skull: broad across the brow, narrowing to a heavy muzzle.
  ctx.fillStyle = hex(design.accent);
  ctx.beginPath();
  ctx.moveTo(0, -62 * s);
  ctx.quadraticCurveTo(56 * s, -56 * s, 56 * s, -6 * s);
  ctx.quadraticCurveTo(56 * s, 44 * s, 0, 56 * s);
  ctx.quadraticCurveTo(-56 * s, 44 * s, -56 * s, -6 * s);
  ctx.quadraticCurveTo(-56 * s, -56 * s, 0, -62 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Muzzle, lighter again, so the face has three tones and separates at size.
  ctx.fillStyle = lighten(design.accent, 0.34);
  ctx.beginPath();
  ctx.ellipse(0, 22 * s, 30 * s, 22 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Nose and the open jaw beneath it, both cut in ink so they punch through.
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(-14 * s, 10 * s);
  ctx.lineTo(14 * s, 10 * s);
  ctx.quadraticCurveTo(12 * s, 26 * s, 0, 28 * s);
  ctx.quadraticCurveTo(-12 * s, 26 * s, -14 * s, 10 * s);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-20 * s, 36 * s);
  ctx.quadraticCurveTo(0, 52 * s, 20 * s, 36 * s);
  ctx.quadraticCurveTo(0, 44 * s, -20 * s, 36 * s);
  ctx.closePath();
  ctx.fill();
  // Two lower fangs hung off the jaw, bone white — the detail that turns a
  // bear into a SAVAGE bear, which is the half of the name doing the work.
  ctx.fillStyle = '#f2f0ea';
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2.5 * s;
  for (const dir of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(dir * 8 * s, 38 * s);
    ctx.lineTo(dir * 16 * s, 38 * s);
    ctx.lineTo(dir * 12 * s, 52 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Eyes: small, deep-set and angled down toward the muzzle for the scowl.
  ctx.fillStyle = hex(design.secondary);
  ctx.strokeStyle = line;
  for (const dir of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(dir * 12 * s, -18 * s);
    ctx.lineTo(dir * 32 * s, -24 * s);
    ctx.lineTo(dir * 32 * s, -10 * s);
    ctx.lineTo(dir * 12 * s, -8 * s);
    ctx.closePath();
    ctx.fill();
  }
};

export const clockEmblem: EmblemDraw = (ctx, s, design) => {
  // "The Gear Chip features a pendulum clock representing Horologium, one of the
  // 88 constellations in space."
  //
  // A PENDULUM clock, not a wristwatch, and the difference is the whole mark:
  // the dial is only the top half, and the bob swinging under it on a rod is
  // what the eye actually reads at chip size. Drawn off-vertical so it is
  // caught mid-swing — a bob hanging straight down reads as a plumb line.
  //
  // The dial's rim is cut into sixty teeth. That is not decoration: the Blade
  // itself has "60 edges around its circumference", and this is the one mark in
  // the set whose ornament is a transcription of the part's own geometry.
  const line = ctx.strokeStyle;

  // Sixty teeth, struck as short radial ticks rather than drawn as a gear
  // outline. A filled 60-tooth gear at this size turns into a grey ring.
  ctx.strokeStyle = hex(design.accent);
  ctx.lineWidth = 2.5 * s;
  for (let i = 0; i < 60; i++) {
    const ang = (i / 60) * Math.PI * 2;
    const long = i % 5 === 0;
    const r0 = long ? 50 : 55;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * r0 * s, (-26 + Math.sin(ang) * r0) * s);
    ctx.lineTo(Math.cos(ang) * 62 * s, (-26 + Math.sin(ang) * 62) * s);
    ctx.stroke();
  }

  // The pendulum, under the dial and drawn before it so the case covers the
  // rod's pivot. Off-vertical by 0.28 rad: mid-swing.
  const swing = 0.28;
  const px = Math.sin(swing);
  const py = Math.cos(swing);
  ctx.strokeStyle = line;
  ctx.lineWidth = 4.5 * s;
  ctx.beginPath();
  ctx.moveTo(0, -26 * s);
  ctx.lineTo(px * 96 * s, (-26 + py * 96) * s);
  ctx.stroke();
  ctx.fillStyle = hex(design.accent);
  ctx.beginPath();
  ctx.ellipse(px * 74 * s, (-26 + py * 74) * s, 15 * s, 12 * s, swing, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // The dial: a filled disc a step lighter than the teeth, so the face reads as
  // paper behind machined brass.
  ctx.fillStyle = lighten(design.accent, 0.3);
  ctx.beginPath();
  ctx.arc(0, -26 * s, 48 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Hands at 10:08 — the angle every clock is photographed at, because it
  // frames the dial's centre instead of hiding it, and reads as a clock faster
  // than any other setting.
  ctx.strokeStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineWidth = 7 * s;
  ctx.beginPath();
  ctx.moveTo(0, -26 * s);
  ctx.lineTo(-22 * s, -48 * s);
  ctx.stroke();
  ctx.lineWidth = 5 * s;
  ctx.beginPath();
  ctx.moveTo(0, -26 * s);
  ctx.lineTo(26 * s, -54 * s);
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(0, -26 * s, 6 * s, 0, Math.PI * 2);
  ctx.fill();

  // Four constellation stars scattered off the dial — Horologium, which is what
  // the source says the clock represents. Small, unstroked, and in the
  // secondary so they sit behind the mark rather than competing with it.
  ctx.fillStyle = hex(design.secondary);
  for (const [cx, cy, rad] of [
    [-64, -66, 5],
    [-40, -78, 3.5],
    [58, -70, 4],
    [70, -40, 3],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx * s, cy * s, rad * s, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const pteranodonEmblem: EmblemDraw = (ctx, s, design) => {
  // "The Gear Chip features a pteranodon."
  //
  // The head is the mark. A pteranodon in flight is a pair of triangles and
  // reads as a paper dart; the head — a long spear beak forward and a long bony
  // crest raked back, almost the same length — is a shape nothing else in
  // nature has, and it survives being 40 px across.
  //
  // So: head in profile, large, with the wings reduced to two swept membranes
  // behind it. The reverse of `firebirdEmblem`, which is all wing and a small
  // skull, so the two do not read as the same bird twice.
  const line = ctx.strokeStyle;

  // Wings first and darker, so the head lands on top of them.
  ctx.fillStyle = hex(design.secondary);
  for (const [dir, ty] of [
    [-1, -6],
    [1, 26],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(-6 * s, 14 * s);
    ctx.quadraticCurveTo(-46 * s, (ty - 28) * s, -78 * s, ty * s);
    ctx.quadraticCurveTo(-44 * s, (ty + 16) * s, -20 * s, (14 + dir * 10) * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // The crest: a long backswept blade off the back of the skull, as long as the
  // beak is. Drawn before the skull so the skull pins its root.
  ctx.fillStyle = hex(design.accent);
  ctx.beginPath();
  ctx.moveTo(-4 * s, -34 * s);
  ctx.quadraticCurveTo(-34 * s, -56 * s, -70 * s, -44 * s);
  ctx.quadraticCurveTo(-40 * s, -30 * s, -6 * s, -16 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Skull and the spear beak, a step lighter, running the other way. The beak
  // is straight and needle-fine — a curved one is a pelican.
  ctx.fillStyle = lighten(design.accent, 0.26);
  ctx.beginPath();
  ctx.moveTo(-10 * s, -36 * s);
  ctx.quadraticCurveTo(24 * s, -40 * s, 34 * s, -22 * s);
  ctx.lineTo(80 * s, -4 * s); // beak tip
  ctx.lineTo(34 * s, 6 * s);
  ctx.quadraticCurveTo(4 * s, 14 * s, -12 * s, -6 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // The lower mandible, dropped open a few degrees so the head is calling
  // rather than gliding — the same choice `seiryuEmblem` makes with its jaw.
  ctx.beginPath();
  ctx.moveTo(18 * s, 4 * s);
  ctx.lineTo(70 * s, 6 * s);
  ctx.lineTo(20 * s, 18 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Eye, set high and forward under the crest root.
  ctx.fillStyle = ink;
  ctx.strokeStyle = line;
  ctx.beginPath();
  ctx.ellipse(8 * s, -20 * s, 7 * s, 5 * s, 0.15, 0, Math.PI * 2);
  ctx.fill();
};

export const ghostEmblem: EmblemDraw = (ctx, s, design) => {
  // "The Gear Chip features a stylized ghost."
  //
  // STYLIZED is the operative word and the source uses it, so this is the sheet
  // ghost — a domed head over a scalloped hem — rather than an attempt at a
  // spectre. The hem is three lobes with the gaps cut UP into the body, which
  // is what makes the bottom edge read as cloth rather than as a rounded base.
  //
  // It is also the one mark here whose shape is the Blade's shape: GhostCircle
  // is "a Stamina Type Blade with a near perfectly circular shape", and the
  // ghost's dome is drawn as a true arc for the same reason.
  const line = ctx.strokeStyle;

  // Two trailing wisps behind the body, drawn first. They are what stops the
  // silhouette sitting dead still on the chip.
  ctx.lineCap = 'round';
  ctx.strokeStyle = hex(design.secondary);
  ctx.lineWidth = 7 * s;
  for (const [dir, ey] of [
    [-1, 18],
    [1, 34],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(dir * 40 * s, 0);
    ctx.quadraticCurveTo(dir * 72 * s, (ey - 22) * s, dir * 66 * s, ey * s);
    ctx.stroke();
  }

  // The body: a true semicircular dome, then straight sides, then three hem
  // lobes with gaps cut up between them.
  ctx.lineWidth = 5 * s;
  ctx.strokeStyle = line;
  ctx.fillStyle = hex(design.accent);
  ctx.beginPath();
  ctx.arc(0, -12 * s, 46 * s, Math.PI, 0);
  ctx.lineTo(46 * s, 24 * s);
  // Hem, right to left: lobe, notch, lobe, notch, lobe.
  ctx.quadraticCurveTo(46 * s, 54 * s, 26 * s, 54 * s);
  ctx.quadraticCurveTo(20 * s, 34 * s, 14 * s, 50 * s);
  ctx.quadraticCurveTo(4 * s, 66 * s, -6 * s, 50 * s);
  ctx.quadraticCurveTo(-14 * s, 34 * s, -22 * s, 52 * s);
  ctx.quadraticCurveTo(-34 * s, 62 * s, -46 * s, 40 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Eyes and mouth as HOLES in the sheet — filled in the chip's own dark rather
  // than in a colour, because a hole is what a sheet ghost's face is.
  ctx.fillStyle = ink;
  for (const dir of [-1, 1] as const) {
    ctx.beginPath();
    ctx.ellipse(dir * 19 * s, -18 * s, 10 * s, 13 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(0, 14 * s, 12 * s, 9 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // A pale catchlight in each eye, which is the difference between a ghost and
  // two holes. Pale rather than the secondary, for the reason `wizardEmblem`
  // records: a jewel tone on near-black is two dark shapes with no edge.
  ctx.fillStyle = lighten(design.accent, 0.6);
  for (const dir of [-1, 1] as const) {
    ctx.beginPath();
    ctx.ellipse((dir * 19 + 3) * s, -22 * s, 3.5 * s, 4.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const sharkheadEmblem: EmblemDraw = (ctx, s, design) => {
  // "The Gear Chip features a shark head, and its name refers to the gill slits
  // on sharks."
  //
  // The gill slits are named in the source, so they are the mark's subject
  // rather than a texture on it: five raked slits, cut in ink, sized so they
  // are the second thing read after the jaw. Without them this is a generic
  // shark and the part is called Gill Shark.
  //
  // Head-on-the-diagonal rather than flat profile, so the open jaw is visible
  // as a shape instead of as a line — a shark drawn in true profile has its
  // teeth edge-on and loses them.
  const line = ctx.strokeStyle;

  // Pectoral fin behind, darker, giving the head something to sit against.
  ctx.fillStyle = hex(design.secondary);
  ctx.beginPath();
  ctx.moveTo(-18 * s, 10 * s);
  ctx.quadraticCurveTo(-58 * s, 22 * s, -76 * s, 52 * s);
  ctx.quadraticCurveTo(-40 * s, 44 * s, -12 * s, 34 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Dorsal fin, the shark's one unmistakable shape, above and behind.
  ctx.beginPath();
  ctx.moveTo(-24 * s, -18 * s);
  ctx.quadraticCurveTo(-46 * s, -50 * s, -74 * s, -58 * s);
  ctx.quadraticCurveTo(-52 * s, -28 * s, -46 * s, -6 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // The head: a blunt wedge driving down and right, snout over a dropped jaw.
  ctx.fillStyle = hex(design.accent);
  ctx.beginPath();
  ctx.moveTo(-40 * s, -22 * s);
  ctx.quadraticCurveTo(16 * s, -34 * s, 62 * s, -2 * s); // snout ridge
  ctx.quadraticCurveTo(52 * s, 16 * s, 30 * s, 18 * s);
  ctx.quadraticCurveTo(48 * s, 34 * s, 40 * s, 52 * s); // the jaw, dropped
  ctx.quadraticCurveTo(-4 * s, 46 * s, -34 * s, 22 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // The gape, cut in ink between snout and jaw, with teeth left standing in it.
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(26 * s, 14 * s);
  ctx.quadraticCurveTo(46 * s, 26 * s, 38 * s, 46 * s);
  ctx.quadraticCurveTo(6 * s, 40 * s, -8 * s, 24 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f2f0ea';
  for (const [tx, ty, bx, by] of [
    [24, 16, 16, 28],
    [8, 20, 2, 32],
    [-6, 22, -12, 33],
    [32, 30, 22, 38],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(tx * s, ty * s);
    ctx.lineTo((tx - 9) * s, (ty + 3) * s);
    ctx.lineTo(bx * s, by * s);
    ctx.closePath();
    ctx.fill();
  }

  // FIVE GILL SLITS, raked back off the jaw hinge. Five is the count on the
  // sharks the name points at, and they get the ink line rather than a tint so
  // they survive the plated accent behind them.
  ctx.strokeStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineWidth = 4.5 * s;
  for (let i = 0; i < 5; i++) {
    const x = (-30 + i * 9) * s;
    ctx.beginPath();
    ctx.moveTo(x, -8 * s);
    ctx.quadraticCurveTo(x - 5 * s, 6 * s, x - 2 * s, 20 * s);
    ctx.stroke();
  }

  // Eye: small, black, set high on the snout — a shark's eye is a bead, and
  // drawing it any larger turns the head into a dolphin.
  ctx.strokeStyle = line;
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(14 * s, -14 * s, 7 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lighten(design.accent, 0.55);
  ctx.beginPath();
  ctx.arc(16 * s, -16 * s, 2.5 * s, 0, Math.PI * 2);
  ctx.fill();
};
