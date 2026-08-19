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
