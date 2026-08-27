import * as THREE from 'three';
import * as C from '../sim/constants';
import type { ArenaFloorStyle } from '../sim/arena';

/**
 * The dish floor, painted per arena.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT `toon.ts/dishTexture`. That function paints
 * one specific object — the Burst Beystadium — and says so: "the shelf and rim
 * hexes are fixed because they are what makes this read as *that* stadium
 * rather than a recolour of a bowl." It was right for a game with one arena.
 * With eight it became the exact mechanism behind "every arena looks like the
 * anime arena": `base` tinted only the middle third of the canvas, so the
 * saturated shelf and the white rim slope — three fifths of the visible floor —
 * were byte-identical in all eight stadiums no matter what `look` said.
 *
 * So this takes a whole PALETTE rather than one tint, and on top of it a
 * *treatment*: the surface story of the floor. That second half matters more
 * than the colours. The eye reads structure long before hue, and eight bowls in
 * eight tints still read as one bowl; a grating, a scorch pattern and a set of
 * painted race sectors read as three different rooms even in greyscale — which
 * is precisely the test the non-toon path below puts them through.
 *
 * COORDINATES. `LatheGeometry` lays out UVs as u = angle around, v = distance
 * along the profile. The stadium's profile samples radius uniformly, so v is
 * exactly r / STADIUM_RADIUS. Horizontal bands in this canvas are therefore
 * concentric rings on the floor, and vertical strips are radial wedges.
 *
 * The texture is written with `flipY = false` so row 0 is the CENTRE of the
 * dish, and `wrapS = RepeatWrapping` so anything drawn across the u seam has to
 * tile — every angular pattern here uses a divisor of the full turn for that
 * reason.
 */

/** Canvas size. Wider than tall because u spans a 6.3-unit circumference. */
const W = 1024;
const H = 256;

/** v of the tornado ridge, which every treatment builds its outer band around. */
const RIDGE_V = C.RIDGE_RADIUS / C.STADIUM_RADIUS;

/**
 * The colours a treatment draws with.
 *
 * Deliberately a small fixed vocabulary rather than "any colour you like". Each
 * slot means something — `shelf` is always the ridge, `shade` is always the
 * dark wash — so one treatment can be re-palletted into a completely different
 * arena and still read correctly. It is also what lets the same drawing code
 * produce the greyscale multiply map the lit themes need: pass a monochrome
 * palette and the pattern survives while the colour does not.
 */
export interface FloorPalette {
  /** Innermost floor. The calm middle, so the lightest tone. */
  centre: string;
  /** Mid floor. */
  mid: string;
  /** Outer floor, inboard of the ridge. */
  outer: string;
  /** The tornado-ridge shelf — the one saturated band on a stock dish. */
  shelf: string;
  /** The slope from the shelf up to the wall. */
  rimSlope: string;
  /** Painted linework, alpha included. The dish suppresses mesh outlines. */
  ink: string;
  /** Livery: arrows, hatching, sector fills. */
  accent: string;
  /** Dark wash — scorch, dead ground, shadow. Alpha included. */
  shade: string;
  /** Light wash — sheen, highlights. Alpha included. */
  light: string;
  /** Lay the two glossy sweeps over the finished floor. */
  sheen: boolean;
}

const hex = (c: THREE.Color): string => `#${c.getHexString()}`;

const mix = (a: number, b: number, t: number): string =>
  hex(new THREE.Color(a).lerp(new THREE.Color(b), t));

const rgba = (colour: number, alpha: number): string => {
  const c = new THREE.Color(colour);
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${alpha})`;
};

/** The arena's own colours, as a full-colour palette for the cel dish. */
export function paintedPalette(c: {
  dish: number;
  ridge: number;
  guide: number;
  wall: number;
  accent: number;
}): FloorPalette {
  return {
    centre: mix(c.dish, 0xffffff, 0.5),
    mid: mix(c.dish, 0xffffff, 0.26),
    outer: hex(new THREE.Color(c.dish)),
    // THE SHELF IS THE ARENA'S OWN RIDGE COLOUR, and this single line is most
    // of the fix. It used to be a hardcoded 0x2f7fd6, a saturated blue band
    // 14% of the dish wide, sitting in the middle of every stadium in the game.
    shelf: hex(new THREE.Color(c.ridge)),
    rimSlope: mix(c.wall, 0xffffff, 0.15),
    ink: rgba(new THREE.Color(c.ridge).multiplyScalar(0.42).getHex(), 0.42),
    accent: hex(new THREE.Color(c.accent)),
    shade: rgba(new THREE.Color(c.guide).multiplyScalar(0.3).getHex(), 0.5),
    light: 'rgba(255, 255, 255, 0.55)',
    sheen: true,
  };
}

/**
 * A colourless version of the same palette, for the lit themes.
 *
 * WHY MULTIPLY RATHER THAN PAINT. The cel dish is `MeshBasicMaterial` and owns
 * its colour outright, but the lit dish is a `MeshStandardMaterial` whose
 * colour is pushed at it by `applyStadiumTheme` on every theme switch. Baking
 * arena colour into a map there would be overwritten by the next repaint, and
 * worse, would smuggle an arena's palette into a theme that has explicitly
 * refused it (`Theme.acceptsArenaLook` — Overdrive).
 *
 * A near-white greyscale map multiplies cleanly against whatever colour the
 * material is holding, so the *treatment* survives a theme switch while the
 * *palette* stays the theme's business. The range is deliberately shallow —
 * nothing here goes below 0.72 — because the same map has to sit under
 * Overdrive's near-black dish without turning parts of it to pure black.
 */
export const DETAIL_PALETTE: FloorPalette = {
  centre: '#ffffff',
  mid: '#f4f4f4',
  outer: '#ebebeb',
  shelf: '#dcdcdc',
  rimSlope: '#f7f7f7',
  ink: 'rgba(0, 0, 0, 0.17)',
  accent: '#d2d2d2',
  shade: 'rgba(0, 0, 0, 0.15)',
  light: 'rgba(255, 255, 255, 0.5)',
  sheen: false,
};

/**
 * Where a sim bearing lands on the u axis.
 *
 * `LatheGeometry` places a profile point at (x·sin φ, y, x·cos φ) with
 * u = φ / 2π, so world bearing atan2(z, x) is π/2 − φ. Read backwards, a
 * bearing of b belongs at u = (π/2 − b) / 2π — which also means u runs
 * CLOCKWISE in world terms while bearings run anticlockwise. Every directional
 * mark below (arrows, chevrons) is drawn against that, so getting it wrong
 * shows up as livery pointing the wrong way round the dish rather than as
 * anything subtle.
 */
const uOf = (bearing: number): number => {
  const u = (Math.PI / 2 - bearing) / (Math.PI * 2);
  return u - Math.floor(u);
};

/** Deterministic noise, so a rebuilt Crater is the same Crater. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ctx = CanvasRenderingContext2D;

/** A concentric band, from v0 to v1. */
function band(ctx: Ctx, v0: number, v1: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.fillRect(0, v0 * H, W, (v1 - v0) * H);
}

/** A concentric line at v, `px` canvas pixels thick. */
function ringLine(ctx: Ctx, v: number, px: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.fillRect(0, v * H - px / 2, W, px);
}

/** `count` evenly spaced radial marks between v0 and v1. */
function spokes(
  ctx: Ctx,
  count: number,
  v0: number,
  v1: number,
  px: number,
  fill: string,
  phase = 0,
): void {
  ctx.fillStyle = fill;
  for (let i = 0; i < count; i++) {
    const u = ((i + phase) / count) * W;
    ctx.fillRect(u - px / 2, v0 * H, px, (v1 - v0) * H);
    // The seam: a mark straddling u = 0 has to appear at both ends or it is
    // half-missing on the floor.
    if (u - px / 2 < 0) ctx.fillRect(u - px / 2 + W, v0 * H, px, (v1 - v0) * H);
  }
}

/**
 * A wedge of floor centred on a bearing, drawn wrap-safe.
 *
 * `halfTurns` is half its angular width as a fraction of the full turn, which
 * is what the caller has: a pocket is POCKET_HALF_WIDTH radians wide.
 */
function wedge(
  ctx: Ctx,
  bearing: number,
  halfTurns: number,
  v0: number,
  v1: number,
  fill: string,
): void {
  const u = uOf(bearing) * W;
  const half = halfTurns * W;
  ctx.fillStyle = fill;
  for (const shift of [-W, 0, W]) {
    ctx.fillRect(u - half + shift, v0 * H, half * 2, (v1 - v0) * H);
  }
}

/** Diagonal hazard hatching over a band. */
function hatch(ctx: Ctx, v0: number, v1: number, fill: string, pitch = 26): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, v0 * H, W, (v1 - v0) * H);
  ctx.clip();
  ctx.strokeStyle = fill;
  ctx.lineWidth = pitch * 0.42;
  const h = (v1 - v0) * H;
  for (let x = -h; x < W + h; x += pitch) {
    ctx.beginPath();
    ctx.moveTo(x, v0 * H);
    ctx.lineTo(x + h, v1 * H);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * `count` chevrons around a band.
 *
 * `outward` points the tip toward the rim; otherwise toward the centre. Drawn
 * as strokes rather than filled triangles because a stroked chevron survives
 * the u-axis stretch at large radius — a filled one thins out as the
 * circumference grows and disappears at the rim, which is where these live.
 */
function chevrons(
  ctx: Ctx,
  count: number,
  v0: number,
  v1: number,
  fill: string,
  outward: boolean,
  width = 0.34,
): void {
  ctx.strokeStyle = fill;
  ctx.lineWidth = Math.max(3, ((v1 - v0) * H) / 4);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const halfU = (width / count) * W;
  const tipV = (outward ? v1 : v0) * H;
  const backV = (outward ? v0 : v1) * H;
  for (let i = 0; i < count; i++) {
    const u = ((i + 0.5) / count) * W;
    for (const shift of [-W, 0, W]) {
      ctx.beginPath();
      ctx.moveTo(u - halfU + shift, backV);
      ctx.lineTo(u + shift, tipV);
      ctx.lineTo(u + halfU + shift, backV);
      ctx.stroke();
    }
  }
}

/** The six tone rings every treatment starts from. */
function baseBands(ctx: Ctx, p: FloorPalette): void {
  const rings: Array<[number, number, string]> = [
    [0, 0.3, p.centre],
    [0.3, 0.46, p.mid],
    [0.46, 0.62, p.outer],
    [0.62, RIDGE_V - 0.1, p.outer],
    [RIDGE_V - 0.1, RIDGE_V + 0.04, p.shelf],
    [RIDGE_V + 0.04, 1, p.rimSlope],
  ];
  for (const [from, to, fill] of rings) band(ctx, from, to, fill);
  for (const [, to] of rings.slice(0, -1)) ringLine(ctx, to, 2, p.ink);
}

/**
 * Two soft sweeps of painted gloss.
 *
 * Lifted from `dishTexture` including the reason they start clear of v = 0:
 * every u collapses to one vertex at the lathe's pole, so a sheen texel there
 * is stretched across the exact middle of the arena as a white speck.
 */
function sheen(ctx: Ctx): void {
  const from = 0.14 * H;
  ctx.globalAlpha = 0.2;
  for (const centre of [0.18, 0.66]) {
    const grad = ctx.createLinearGradient((centre - 0.13) * W, 0, (centre + 0.13) * W, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect((centre - 0.13) * W, from, 0.26 * W, H - from);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Treatments
// ---------------------------------------------------------------------------

/** Fine lathe rings and radial seams. Precision, not drama. */
function machined(ctx: Ctx, p: FloorPalette): void {
  ctx.globalAlpha = 0.5;
  for (let v = 0.1; v < RIDGE_V - 0.1; v += 0.028) ringLine(ctx, v, 1, p.ink);
  ctx.globalAlpha = 1;
  // Mould seams: 8 full-depth radial joins, with 48 short ticks between them
  // out on the working band where they can be seen without crowding the tops.
  spokes(ctx, 8, 0.1, RIDGE_V - 0.1, 2, p.ink);
  spokes(ctx, 48, 0.64, RIDGE_V - 0.11, 2, p.ink);
  // Bolt heads around the rim slope.
  spokes(ctx, 32, RIDGE_V + 0.09, RIDGE_V + 0.13, 5, p.ink);
}

/** A painted race lane under the rail, with arrows running the way it throws. */
function circuit(ctx: Ctx, p: FloorPalette): void {
  // The lane. The X-Rail sits at r = 0.9, so this brackets it: the floor says
  // where the mechanic is before the mechanic ever fires.
  band(ctx, RIDGE_V + 0.02, 0.99, p.accent);
  ctx.globalAlpha = 0.55;
  band(ctx, RIDGE_V + 0.02, 0.99, p.rimSlope);
  ctx.globalAlpha = 1;
  ringLine(ctx, RIDGE_V + 0.02, 4, p.accent);
  ringLine(ctx, 0.99, 4, p.accent);
  // Kerbing: alternating blocks along the lane edge, straight off a circuit.
  ctx.fillStyle = p.accent;
  for (let i = 0; i < 48; i += 2) {
    ctx.fillRect((i / 48) * W, (RIDGE_V + 0.02) * H, W / 48, 0.02 * H);
  }
  // Direction arrows. u runs clockwise in world terms (see `uOf`), so tips
  // pointing at increasing u point the way a released rider is carried.
  ctx.globalAlpha = 0.85;
  chevrons(ctx, 24, RIDGE_V + 0.05, 0.95, p.accent, true, 0.5);
  ctx.globalAlpha = 1;
  // Timing grid across the calm middle, so the centre is not simply blank.
  ctx.globalAlpha = 0.4;
  for (let v = 0.08; v < 0.6; v += 0.06) ringLine(ctx, v, 1, p.ink);
  spokes(ctx, 24, 0.08, 0.6, 1, p.ink);
  ctx.globalAlpha = 1;
  spokes(ctx, 4, 0.06, RIDGE_V, 3, p.ink);
}

/**
 * Blast-scarred plate.
 *
 * The Spike Pit's hazard disc (pit.ts) covers r < 0.42 and is drawn every
 * frame; this is what the floor AROUND it looks like after living next to it —
 * scorch bleeding outward past the zone, burn streaks radiating, and the plate
 * hatched where the drain begins. The point is that the arena looks dangerous
 * before the hazard is even switched on.
 */
function scorched(ctx: Ctx, p: FloorPalette): void {
  const r = rng(0x5915);
  // Scorch, heaviest at the pit's edge and fading outward.
  for (let i = 0; i < 14; i++) {
    const v = 0.4 + i * 0.022;
    ctx.globalAlpha = 0.5 * (1 - i / 14);
    ringLine(ctx, v, 5, p.shade);
  }
  ctx.globalAlpha = 1;
  // Burn streaks: irregular radial smears thrown out of the middle.
  for (let i = 0; i < 40; i++) {
    const u = r() * W;
    const from = 0.36 + r() * 0.16;
    const to = from + 0.1 + r() * 0.26;
    ctx.globalAlpha = 0.14 + r() * 0.24;
    ctx.fillStyle = p.shade;
    const w = 4 + r() * 16;
    ctx.fillRect(u - w / 2, from * H, w, (to - from) * H);
    if (u - w / 2 < 0) ctx.fillRect(u - w / 2 + W, from * H, w, (to - from) * H);
  }
  ctx.globalAlpha = 1;
  // Blast scars where something landed hard.
  //
  // The streaks alone were too even to read as damage — in the browser they
  // came out as a soft grey blur ring, which is what forty marks of the same
  // shape at the same radius always look like. A handful of dark, uneven
  // craters is what makes the rest of it read as scorch rather than as dirt.
  for (let i = 0; i < 9; i++) {
    const u = r() * W;
    const v = (0.5 + r() * 0.26) * H;
    const w = 26 + r() * 64;
    // Alpha drawn once and reused across the three wrap copies: pulling a new
    // random inside the shift loop would give the same scar a different tone at
    // each end of the seam, and the join would show as a visible edge.
    const dark = 0.3 + r() * 0.16;
    for (const shift of [-W, 0, W]) {
      ctx.globalAlpha = dark;
      ctx.fillStyle = p.shade;
      ctx.beginPath();
      ctx.ellipse(u + shift, v, w / 2, w * 0.19, 0, 0, Math.PI * 2);
      ctx.fill();
      // A pale lip above it: a crater has a rim, and the highlight is what
      // stops the dark patch reading as a hole punched in the texture.
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = p.light;
      ctx.beginPath();
      ctx.ellipse(u + shift, v - w * 0.13, w * 0.42, w * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  // The line the drain starts at, called out in hazard hatching.
  ctx.globalAlpha = 0.7;
  hatch(ctx, 0.44, 0.5, p.accent, 30);
  ctx.globalAlpha = 1;
  ringLine(ctx, 0.44, 3, p.ink);
  ringLine(ctx, 0.5, 3, p.ink);
  // Cracked plate joins out on the working band.
  spokes(ctx, 16, 0.54, RIDGE_V - 0.1, 3, p.ink);
  // NO SECOND RING OF ARROWS HERE. There used to be sixteen chevrons pointing
  // inward at v 0.56-0.66, and `pit.ts` draws twenty-four more pointing inward
  // at the pit's own edge just below them. Seen together in the browser the two
  // read as one enormous starburst and neither said anything: the hazard's own
  // marks are the ones that have to carry, since they are the ones that move
  // with the zone. The plate around it says "burnt", not "this way".
}

/** A running channel: dead middle, kerbed lane, flow arrows. */
function channel(ctx: Ctx, p: FloorPalette): void {
  // The middle is not floor here, it is the thing you are being kept out of —
  // so it gets no paint, no rings and no gloss, only shade.
  band(ctx, 0, 0.42, p.shade);
  ctx.globalAlpha = 0.5;
  band(ctx, 0, 0.42, p.outer);
  ctx.globalAlpha = 1;
  spokes(ctx, 6, 0, 0.42, 2, p.ink);
  // Lane edges, kerbed on both sides. Two painted lines make a band; blocks
  // running along them make a CHANNEL, which is the word the arena uses about
  // itself — the same trick `circuit` uses at the rail, applied to both edges
  // because here you are enclosed rather than guided.
  ringLine(ctx, 0.42, 6, p.accent);
  ringLine(ctx, RIDGE_V - 0.02, 6, p.accent);
  ctx.fillStyle = p.accent;
  for (let i = 0; i < 40; i += 2) {
    ctx.fillRect((i / 40) * W, 0.42 * H, W / 40, 0.016 * H);
    ctx.fillRect(((i + 1) / 40) * W, (RIDGE_V - 0.036) * H, W / 40, 0.016 * H);
  }
  // Flow arrows down the usable ring.
  //
  // WIDE AND FLAT, and they were the opposite: 18 chevrons spanning v 0.50 to
  // 0.72 are as deep radially as they are wide tangentially, which the browser
  // showed as a ring of spikes — a sunburst, not a current. An arrow only reads
  // as a DIRECTION when it is much wider across than it is long, because that
  // is the axis the eye takes the direction from.
  //
  // AND THEY HAVE TO NOT TOUCH. The correction after this one: at 14 wide
  // chevrons the round line caps met end to end and the ring closed into a
  // continuous zigzag — a crown, which is one shape rather than fourteen
  // arrows. Twelve at a third of the spacing leaves a clear gap between marks,
  // and a gap is what makes each one a separate instruction.
  ctx.globalAlpha = 0.8;
  chevrons(ctx, 12, 0.56, 0.65, p.accent, true, 0.3);
  ctx.globalAlpha = 1;
  ctx.fillStyle = p.ink;
  for (let i = 0; i < 36; i += 2) {
    ctx.fillRect((i / 36) * W, 0.46 * H, (W / 36) * 0.6, 3);
    ctx.fillRect((i / 36) * W, (RIDGE_V - 0.06) * H, (W / 36) * 0.6, 3);
  }
  ctx.globalAlpha = 0.7;
  hatch(ctx, RIDGE_V + 0.06, 1, p.accent, 34);
  ctx.globalAlpha = 1;
}

/**
 * Severe: heavy approach wedges at each exit, and almost nothing else.
 *
 * The only treatment here that REMOVES detail. Sudden Death is the plain bowl
 * with one exit worth more, so its whole visual argument is that there is
 * nothing to look at except the way out — a busy floor would be arguing the
 * opposite.
 */
function severe(ctx: Ctx, p: FloorPalette, exits: number[]): void {
  // NARROW AND OUTBOARD, and the first version was neither — this is the one
  // treatment here that got worse the harder it tried. Four wedges 40° wide
  // running from r = 0.34 to the rim cover most of the floor, and on Sudden
  // Death's green palette the browser showed a white-and-green pinwheel: busy,
  // cheerful, and arguing the exact opposite of the arena it is painted on.
  //
  // An approach lane is a lane. 20° wide, starting outboard of the calm middle,
  // so the wedges read as four marked runs at the exits and the rest of the
  // floor reads as the empty thing the arena is named for.
  const from = 0.56;
  for (const a of exits) {
    // Twice, deliberately: `shade` carries its own alpha and one pass is a
    // grey suggestion. Severe wants the wedge to read as a decision.
    wedge(ctx, a, 0.028, from, 1, p.shade);
    wedge(ctx, a, 0.028, from, 1, p.shade);
    // The centre line, in `light` rather than `accent`. Sudden Death paints its
    // accent a mid green and its shade a dark green, so an accent spine on a
    // shaded lane was one green on another and vanished; white is the only tone
    // guaranteed to read against a wedge whose whole job is to be the darkest
    // thing on the floor. Thin enough to be a marking rather than a third tone,
    // and starting outboard of the wedge's own head so it reads as pointing OUT.
    wedge(ctx, a, 0.006, from + 0.06, 1, p.light);
  }
  // One heavy ring, at the tornado ridge. Severe earns its identity by taking
  // away, so the floor gets exactly one line on it and no others.
  ringLine(ctx, RIDGE_V - 0.1, 7, p.ink);
  ctx.globalAlpha = 0.5;
  ringLine(ctx, from, 2, p.ink);
  ctx.globalAlpha = 1;
}

/** Steel grating over dead ground, and one bright band where the fight is. */
function grate(ctx: Ctx, p: FloorPalette): void {
  // Tight Dish's pit reaches r = 0.66 and is a slope you are always on rather
  // than a hazard you avoid, so it is drawn as FLOOR PLATE — grating, not
  // danger. Reading it as a wide bite would teach the wrong rule.
  band(ctx, 0, 0.66, p.shade);
  ctx.globalAlpha = 0.55;
  band(ctx, 0, 0.66, p.outer);
  ctx.globalAlpha = 1;
  ctx.globalAlpha = 0.6;
  for (let v = 0.06; v < 0.66; v += 0.032) ringLine(ctx, v, 3, p.ink);
  ctx.globalAlpha = 0.45;
  spokes(ctx, 72, 0.06, 0.66, 3, p.ink);
  ctx.globalAlpha = 1;
  // The bearer beams the grating sits in.
  spokes(ctx, 8, 0, 0.66, 7, p.ink);
  // The fighting ring: bright machined band between the dead ground and the
  // ridge, which is the entire usable floor of this arena.
  band(ctx, 0.66, RIDGE_V - 0.02, p.centre);
  ctx.globalAlpha = 0.5;
  for (let v = 0.68; v < RIDGE_V - 0.02; v += 0.022) ringLine(ctx, v, 1, p.ink);
  ctx.globalAlpha = 1;
  ringLine(ctx, 0.66, 6, p.accent);
  ctx.globalAlpha = 0.8;
  hatch(ctx, 0.66, 0.7, p.accent, 24);
  hatch(ctx, RIDGE_V + 0.06, 1, p.accent, 30);
  ctx.globalAlpha = 1;
  ringLine(ctx, 0.7, 3, p.ink);
}

/**
 * Numbered sectors, with the arc that holds the exits hatched as danger.
 *
 * Three Sides Safe is the one arena whose floor is genuinely asymmetric, and
 * the sim already knows exactly where: this is drawn from the SAME pocket
 * bearings the rim wall is cut with, so the hatching cannot drift away from the
 * holes it is warning about.
 */
function sector(ctx: Ctx, p: FloorPalette, exits: number[]): void {
  spokes(ctx, 8, 0.22, RIDGE_V + 0.02, 3, p.ink);
  ctx.globalAlpha = 0.45;
  for (let v = 0.24; v < RIDGE_V - 0.1; v += 0.05) ringLine(ctx, v, 1, p.ink);
  ctx.globalAlpha = 1;
  ringLine(ctx, 0.22, 4, p.ink);
  // The danger arc, one span per exit plus the ground between them.
  //
  // AT HALF STRENGTH, because Three Sides paints it in a near-navy accent and
  // a solid fill of that on a near-white dish is not a warning, it is a stain —
  // the browser showed a third of the floor gone black with no legible pattern
  // in it. Dropping the alpha lets the hatching underneath do the talking,
  // which is the part that actually says "danger" rather than "dirt".
  ctx.globalAlpha = 0.4;
  for (const a of exits) {
    wedge(ctx, a, 0.075, RIDGE_V - 0.1, 1, p.accent);
  }
  ctx.globalAlpha = 1;
  for (const a of exits) {
    ctx.save();
    ctx.globalAlpha = 0.34;
    const u = uOf(a) * W;
    const halfU = 0.075 * W;
    ctx.beginPath();
    for (const shift of [-W, 0, W]) {
      ctx.rect(u - halfU + shift, (RIDGE_V - 0.1) * H, halfU * 2, (1 - RIDGE_V + 0.1) * H);
    }
    ctx.clip();
    hatch(ctx, RIDGE_V - 0.1, 1, p.ink, 26);
    ctx.restore();
  }
  ringLine(ctx, RIDGE_V - 0.1, 4, p.ink);
}

/** Fractured stone. The only floor here that was not made in a factory. */
function cracked(ctx: Ctx, p: FloorPalette): void {
  const r = rng(0xc7a7e);
  // Patchy weathering, so the stone is never one flat tone.
  for (let i = 0; i < 60; i++) {
    ctx.globalAlpha = 0.06 + r() * 0.12;
    ctx.fillStyle = r() > 0.5 ? p.shade : p.light;
    const u = r() * W;
    const v = r() * H;
    const w = 40 + r() * 150;
    const h = 8 + r() * 26;
    ctx.beginPath();
    ctx.ellipse(u, v, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Fault lines: radial, but each one wanders in u as it climbs so it reads as
  // a fracture rather than as a mould seam.
  //
  // THE WANDER HAD EATEN THE RADIAL, which the browser made obvious: ±17 px per
  // step over nineteen steps is up to a third of the way round the dish, so the
  // "fractures" arrived as thick circumferential squiggles draped across the
  // floor like branches. A fault radiates. Half the wander keeps each line
  // clearly heading outward while still refusing to be a straight seam, and the
  // thinner pen stops them reading as ink doodles on a light dish.
  ctx.strokeStyle = p.ink;
  ctx.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const start = 0.06 + r() * 0.5;
    const end = Math.min(1, start + 0.25 + r() * 0.6);
    let u = r() * W;
    ctx.lineWidth = 1.6 + r() * 3;
    ctx.beginPath();
    ctx.moveTo(u, start * H);
    for (let v = start; v < end; v += 0.05) {
      u += (r() - 0.5) * 16;
      ctx.lineTo(u, v * H);
    }
    ctx.stroke();
    // Wrap-safe: the same fracture again a full turn away, so one crossing the
    // seam is continuous instead of stopping dead at u = 0.
    ctx.translate(u > W / 2 ? -W : W, 0);
    ctx.stroke();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  // Rubble against the rim, where anything shaken loose ends up.
  for (let i = 0; i < 120; i++) {
    ctx.globalAlpha = 0.18 + r() * 0.3;
    ctx.fillStyle = r() > 0.35 ? p.shade : p.light;
    const u = r() * W;
    const v = RIDGE_V - 0.06 + r() * 0.3;
    const s = 3 + r() * 9;
    ctx.fillRect(u, v * H, s, s * 0.6);
  }
  ctx.globalAlpha = 1;
}

/**
 * Paint one arena's floor.
 *
 * @param exits Pocket bearings, for the treatments that mark them. Taken rather
 *   than recomputed so the paint and the holes in the wall come from one source.
 */
export function arenaFloorTexture(
  style: ArenaFloorStyle,
  p: FloorPalette,
  exits: number[],
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    baseBands(ctx, p);
    switch (style) {
      case 'machined':
        machined(ctx, p);
        break;
      case 'circuit':
        circuit(ctx, p);
        break;
      case 'scorched':
        scorched(ctx, p);
        break;
      case 'channel':
        channel(ctx, p);
        break;
      case 'severe':
        severe(ctx, p, exits);
        break;
      case 'grate':
        grate(ctx, p);
        break;
      case 'sector':
        sector(ctx, p, exits);
        break;
      case 'cracked':
        cracked(ctx, p);
        break;
      case 'plain':
        break;
    }
    // The rim slope keeps its ink line in every treatment: it is the join
    // between floor and wall, and without it the two moulding colours meet in a
    // soft edge that reads as a rendering error rather than as a seam.
    ringLine(ctx, RIDGE_V + 0.04, 2, p.ink);
    if (p.sheen && style !== 'cracked' && style !== 'scorched') sheen(ctx);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  // Without this the rim ring would be drawn at the centre of the dish and vice
  // versa — the bands above are written centre-first.
  tex.flipY = false;
  return tex;
}
