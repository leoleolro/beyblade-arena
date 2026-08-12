/**
 * The manga impact frame: a full-screen cut on a heavy clash.
 *
 * DOM, not WebGL, on purpose: the frame is a *cut* — it must cover the whole
 * screen, appear on one frame and vanish abruptly with no fade tail (anime
 * cuts, it does not fade), and none of that wants to live in the render loop.
 *
 * The axis of variation is COMPOSITION. A previous pass varied only palette
 * plus jitter inside a single radial-wedge drawing; measured over 300 triggers
 * the palette split was even and it still read as repetitive, because every
 * frame was the same drawing recoloured. So there are six framings that are
 * genuinely different pictures — radial burst, speed-line sheet with a hole
 * punched at the clash, shattered pane, concentric shock, ink vignette, and a
 * crit-only negative slam — and tone (ink / paper / inverted / bey colours) is
 * rolled independently on top of whichever one is chosen.
 *
 * Everything geometric is regenerated per hit; heavy clashes are rare enough
 * that the allocation is irrelevant.
 */

const INK = '#0a0a12';
const PAPER = '#ffffff';

// Beyond any corner of the stretched 100×100 box, so radial geometry is
// anchored off-screen regardless of aspect.
const OUTER = 170;

// Masks need document-unique ids and two frames can overlap in time.
let uid = 0;

type Pt = [number, number];

type Composition =
  | 'radial'
  | 'speed-sheet'
  | 'shatter'
  | 'rings'
  | 'vignette'
  | 'negative-slam';

type Composer = (cx: number, cy: number, opts: ImpactOpts) => string;

export interface ImpactOpts {
  /** Sim hit strength: heavy clashes are >= 1.6, crits/finishers ~2.2+. */
  strength: number;
  crit: boolean;
  /** Design primary of each bey as a CSS hex, for the clash tone. */
  colourA: string;
  colourB: string;
}

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
const chance = (p: number): boolean => Math.random() < p;
const pts = (p: Pt[]): string =>
  p.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' ');

/**
 * preserveAspectRatio="none" stretches the square user space to the viewport,
 * so anything that must read as round on screen scales its x by 1/aspect.
 */
function xScale(): number {
  return Math.max(1, window.innerHeight) / Math.max(1, window.innerWidth);
}

/** How much further a harder hit opens the cleared centre, in user units. */
function reach(strength: number): number {
  return Math.min(6, Math.max(0, (strength - 1.6) * 4));
}

interface Tone {
  /** Backdrop fill; empty leaves the 3-D scene visible between the marks. */
  field: string;
  /** Cycled across the composition's parts. */
  fills: string[];
  /** Hairline outline, needed wherever a pale fill sits on the near-white
   *  stadium floor. Empty for none. */
  edge: string;
  edgeWidth: number;
}

/**
 * `allowField` is off for compositions whose whole point is the untouched
 * centre — a backdrop rect would fill in what they are trying to clear.
 */
function rollTone(opts: ImpactOpts, allowField: boolean): Tone {
  const r = Math.random() * (allowField ? 4 : 3);
  if (r < 1) return { field: '', fills: [INK], edge: '', edgeWidth: 0 };
  if (r < 2)
    return { field: '', fills: [PAPER], edge: INK, edgeWidth: rnd(0.3, 0.6) };
  if (r < 3)
    return {
      field: '',
      fills: [opts.colourA, opts.colourB, PAPER],
      edge: INK,
      edgeWidth: 0.3,
    };
  return { field: INK, fills: [PAPER], edge: '', edgeWidth: 0 };
}

const fillAt = (t: Tone, i: number): string => t.fills[i % t.fills.length];

/** Dominant fill with occasional accents. Strict cycling across large flat
 *  areas turns the clash tone into a pie chart; cycling is only safe on parts
 *  thin enough that no single colour holds the frame. */
const accentFill = (t: Tone, keep: number): string =>
  t.fills.length < 2 || chance(keep)
    ? t.fills[0]
    : t.fills[1 + Math.floor(Math.random() * (t.fills.length - 1))];

const edgeAttr = (t: Tone): string =>
  t.edge ? ` stroke="${t.edge}" stroke-width="${t.edgeWidth.toFixed(2)}"` : '';

const fieldRect = (t: Tone): string =>
  t.field ? `<rect x="0" y="0" width="100" height="100" fill="${t.field}"/>` : '';

/** Backdrop plus one polygon per geometry string, coloured by the caller. */
function paint(t: Tone, geom: string[], fill: (i: number) => string): string {
  return (
    fieldRect(t) +
    `<g${edgeAttr(t)}>` +
    geom.map((p, i) => `<polygon fill="${fill(i)}" points="${p}"/>`).join('') +
    `</g>`
  );
}

/**
 * Ring band as a filled polygon — outer arc, then the inner arc reversed so
 * the opposite winding knocks the middle out. Filled rather than stroked
 * because preserveAspectRatio="none" scales stroke width anisotropically: a
 * stroked circle comes out fat at the sides and thin top and bottom.
 */
function arcBand(
  cx: number,
  cy: number,
  r: number,
  kx: number,
  from: number,
  to: number,
  thick: number,
  wob: number,
  phase: number,
): string {
  const steps = Math.max(8, Math.ceil((Math.abs(to - from) / (Math.PI * 2)) * 84));
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    // Two harmonics of radius noise: a mathematically exact circle reads as a
    // UI element rather than a drawn shock ring.
    const k =
      1 + wob * (Math.sin(a * 3 + phase) * 0.6 + Math.sin(a * 7 + phase * 2.3) * 0.4);
    const ro = (r + thick / 2) * k;
    const ri = Math.max(0.2, (r - thick / 2) * k);
    outer.push([cx + Math.cos(a) * ro * kx, cy + Math.sin(a) * ro]);
    inner.push([cx + Math.cos(a) * ri * kx, cy + Math.sin(a) * ri]);
  }
  inner.reverse();
  return pts(outer.concat(inner));
}

/** Closed irregular loop; shared by the punched hole and the vignette edge. */
function blob(
  cx: number,
  cy: number,
  r: number,
  kx: number,
  n: number,
  wob: number,
  phase: number,
): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k =
      1 + wob * (Math.sin(a * 3 + phase) * 0.6 + Math.sin(a * 5 + phase * 1.7) * 0.4);
    const rr = r * k * rnd(0.94, 1.06);
    out.push([cx + Math.cos(a) * rr * kx, cy + Math.sin(a) * rr]);
  }
  return out;
}

/** Shrinks a shard by a fixed distance all round, so crack gaps stay an even
 *  width instead of widening with the shard. */
function inset(poly: Pt[], gap: number): Pt[] {
  let gx = 0;
  let gy = 0;
  for (const p of poly) {
    gx += p[0];
    gy += p[1];
  }
  gx /= poly.length;
  gy /= poly.length;
  return poly.map((p): Pt => {
    const dx = gx - p[0];
    const dy = gy - p[1];
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(0.45, gap / d);
    return [p[0] + dx * k, p[1] + dy * k];
  });
}

/**
 * Per-wedge point lists. Irregular by construction — jittered angle, bimodal
 * width and jittered inner radius: a perfectly regular burst reads as a
 * loading spinner, and an even width distribution reads as a gear.
 */
function burstWedges(
  cx: number,
  cy: number,
  count: number,
  rot: number,
  innerBase: number,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = rot + ((i + (Math.random() - 0.5) * 0.9) / count) * Math.PI * 2;
    // ~30% fat slabs among mostly thin needles; slabs may overlap their
    // neighbours, which is how hand-drawn bursts actually look.
    const half =
      (chance(0.3) ? rnd(1.1, 2.4) : rnd(0.18, 0.73)) * (Math.PI / count);
    const inner = innerBase * rnd(0.75, 1.35);
    out.push(
      pts([
        [cx + Math.cos(a) * inner, cy + Math.sin(a) * inner],
        [cx + Math.cos(a - half) * OUTER, cy + Math.sin(a - half) * OUTER],
        [cx + Math.cos(a + half) * OUTER, cy + Math.sin(a + half) * OUTER],
      ]),
    );
  }
  return out;
}

/** Wedges thrown from the clash point to past every corner. */
const radial: Composer = (cx, cy, opts) => {
  const tone = rollTone(opts, true);
  const count = 26 + Math.floor(Math.random() * 21);
  const inner = rnd(11, 19) + reach(opts.strength);
  return paint(
    tone,
    burstWedges(cx, cy, count, Math.random() * Math.PI * 2, inner),
    (i) => fillAt(tone, i),
  );
};

/**
 * The classic manga impact panel: the frame filled edge to edge with parallel
 * lines at one angle and a clean hole punched where the clash happened. A mask
 * rather than an even-odd hole, because even-odd would fill the gaps between
 * the lines inside the hole instead of clearing them.
 */
const speedSheet: Composer = (cx, cy, opts) => {
  const tone = rollTone(opts, true);
  // Hairlines this thin cannot carry an outline, so a pale line needs an inked
  // ground or it vanishes into the near-white stadium floor.
  if (!tone.field && tone.fills.indexOf(PAPER) >= 0) tone.field = INK;

  const ang = Math.random() * Math.PI;
  // A slight fan turns a flat sheet into lines converging past the frame,
  // which is the other half of how the panel is actually drawn.
  const fan = chance(0.45) ? rnd(-0.0018, 0.0018) : 0;
  const n = 34 + Math.floor(Math.random() * 60);
  const step = 200 / n;
  const vx = -Math.sin(ang);
  const vy = Math.cos(ang);

  const geom: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = -100 + i * step + rnd(-step * 0.45, step * 0.45);
    const a = ang + fan * t;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    // Bimodal weight against the spacing: an even weight distribution reads as
    // a printed grid, not drawn speed lines.
    const w = (chance(0.18) ? rnd(0.3, 0.45) : rnd(0.05, 0.16)) * step;
    const px = 50 + vx * t;
    const py = 50 + vy * t;
    geom.push(
      pts([
        [px - uy * w - ux * OUTER, py + ux * w - uy * OUTER],
        [px - uy * w + ux * OUTER, py + ux * w + uy * OUTER],
        [px + uy * w + ux * OUTER, py - ux * w + uy * OUTER],
        [px + uy * w - ux * OUTER, py - ux * w - uy * OUTER],
      ]),
    );
  }

  const kx = xScale();
  // Measured on a 1280×820 viewport: below ~15 user units the hole reads as a
  // speck of dust rather than the cleared centre of the panel.
  const hole = rnd(16, 26) + reach(opts.strength);
  const ry = hole * rnd(0.85, 1.15);
  const id = `ifm${++uid}`;
  const cut = chance(0.5)
    ? `<ellipse cx="${cx}" cy="${cy}" rx="${(hole * kx * rnd(0.85, 1.3)).toFixed(2)}" ry="${ry.toFixed(2)}"/>`
    : `<polygon points="${pts(blob(cx, cy, ry, kx, 16 + Math.floor(Math.random() * 12), rnd(0.05, 0.16), Math.random() * 6.28))}"/>`;

  const rim = chance(0.55)
    ? `<polygon fill="${tone.field ? PAPER : INK}" points="${arcBand(cx, cy, ry * 1.06, kx, 0, Math.PI * 2, rnd(0.4, 1.2), rnd(0.02, 0.06), Math.random() * 6.28)}"/>`
    : '';

  return (
    fieldRect(tone) +
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">` +
    `<rect x="0" y="0" width="100" height="100" fill="#fff"/>` +
    `<g fill="#000">${cut}</g>` +
    `</mask>` +
    `<g mask="url(#${id})">` +
    geom
      .map((p, i) => `<polygon fill="${fillAt(tone, i)}" points="${p}"/>`)
      .join('') +
    `</g>` +
    rim
  );
};

/**
 * The frame cracked into angular shards with thin dark gaps between them. Two
 * bands split by a jagged mid ring, some outer shards split again: a single
 * band of triangles meeting at the centre would just be the radial burst with
 * gaps in it. The impact point itself is left empty, so the clash shows
 * through the hole the cracks radiate from.
 */
const shatter: Composer = (cx, cy, opts) => {
  const tone = rollTone(opts, true);
  // The crack is the drawing here, so it gets a heavier line than the hairline
  // that merely keeps a pale fill legible elsewhere.
  if (tone.edge) tone.edgeWidth = rnd(0.5, 1.1);
  // Shards are the largest flat areas any composition draws, so the bey
  // primaries lead to a stained-glass window rather than a broken pane. Paper
  // takes the lead and the primaries survive as chips.
  if (tone.fills.length > 2) tone.fills = [PAPER, opts.colourA, opts.colourB];
  const n = 7 + Math.floor(Math.random() * 8);
  const kx = xScale();
  const rot = Math.random() * Math.PI * 2;
  const coreBase = rnd(4.5, 9) + reach(opts.strength) * 0.5;
  const midBase = rnd(26, 46);
  const gap = rnd(0.9, 2.2);

  const ang: number[] = [];
  const core: number[] = [];
  const mid: number[] = [];
  for (let i = 0; i < n; i++) {
    ang.push(rot + ((i + rnd(-0.32, 0.32)) / n) * Math.PI * 2);
    core.push(coreBase * rnd(0.7, 1.4));
    mid.push(midBase * rnd(0.72, 1.3));
  }
  ang.push(ang[0] + Math.PI * 2);
  core.push(core[0]);
  mid.push(mid[0]);

  // The rim points deliberately skip the x correction: scaled down on a wide
  // viewport they would stop short of the frame edge and leave a bare corner.
  const at = (a: number, r: number, corrected: boolean): Pt => [
    cx + Math.cos(a) * r * (corrected ? kx : 1),
    cy + Math.sin(a) * r,
  ];

  const geom: string[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = ang[i];
    const a1 = ang[i + 1];
    const shards: Pt[][] = [
      [
        at(a0, core[i], true),
        at(a1, core[i + 1], true),
        at(a1, mid[i + 1], true),
        at(a0, mid[i], true),
      ],
    ];
    if (chance(0.4)) {
      const s = rnd(0.35, 0.7);
      const b0 = mid[i] + (OUTER - mid[i]) * s;
      const b1 = mid[i + 1] + (OUTER - mid[i + 1]) * s;
      shards.push([
        at(a0, mid[i], true),
        at(a1, mid[i + 1], true),
        at(a1, b1, false),
        at(a0, b0, false),
      ]);
      shards.push([
        at(a0, b0, false),
        at(a1, b1, false),
        at(a1, OUTER, false),
        at(a0, OUTER, false),
      ]);
    } else {
      shards.push([
        at(a0, mid[i], true),
        at(a1, mid[i + 1], true),
        at(a1, OUTER, false),
        at(a0, OUTER, false),
      ]);
    }
    for (const s of shards) {
      // A missing shard reads as a piece already blown out of the frame.
      if (chance(0.06)) continue;
      geom.push(pts(inset(s, gap)));
    }
  }
  return paint(tone, geom, () => accentFill(tone, 0.68));
};

/** Hard-edged shock rings, unevenly spaced and mostly broken. */
const rings: Composer = (cx, cy, opts) => {
  const tone = rollTone(opts, true);
  const kx = xScale();
  // Six thin rings at even spacing stop reading as a shock and start reading
  // as a fingerprint, so the set stays short and the leading ring stays heavy.
  const count = 3 + Math.floor(Math.random() * 3);
  const geom: string[] = [];
  // Solid slug at the origin, drawn as a disc rather than a band: a band whose
  // inner radius goes negative degenerates into a blot.
  geom.push(pts(blob(cx, cy, rnd(2.2, 4.4) + reach(opts.strength) * 0.4, kx, 20, 0.16, Math.random() * 6.28)));
  let r = rnd(6, 10) + reach(opts.strength);
  for (let i = 0; i < count; i++) {
    // Past ~55 a ring only clips the corners of a landscape viewport, so
    // spacing that outruns it spends the whole set on two visible rings.
    if (r > 62) break;
    // Capped against the radius: a band as thick as its ring is round reads as
    // a glyph, and a broken one reads as a letter.
    const thick = Math.min(r * 0.42, rnd(1.6, 5.2) * (i === 0 ? 1.35 : 1 - i * 0.1));
    // Past ~0.07 the ring stops reading as a ring and starts reading as a
    // potato; under ~0.02 it reads as a dartboard.
    const wob = rnd(0.025, 0.065);
    const phase = Math.random() * 6.28;
    // Each ring drifts off the last, growing with radius. Perfectly concentric
    // rings read as a target however irregular their edges are.
    const dx = cx + Math.max(-3, Math.min(3, rnd(-1, 1) * r * 0.07));
    const dy = cy + Math.max(-3, Math.min(3, rnd(-1, 1) * r * 0.07));
    // The innermost ring stays closed — it is the shock origin, and breaking
    // it is what made the set read as a symbol rather than a wave.
    const breaks = i > 0 && chance(0.78) ? 1 + Math.floor(Math.random() * 3) : 0;
    if (breaks === 0) {
      geom.push(arcBand(dx, dy, r, kx, 0, Math.PI * 2, thick, wob, phase));
    } else {
      // Independent start angle per ring, so the breaks never line up into a
      // radial channel through the whole set.
      let a = Math.random() * Math.PI * 2;
      const seg = (Math.PI * 2) / breaks;
      for (let b = 0; b < breaks; b++) {
        geom.push(
          arcBand(dx, dy, r, kx, a + rnd(0.15, 0.75), a + seg, thick, wob, phase),
        );
        a += seg;
      }
    }
    r = r * rnd(1.34, 1.78) + rnd(2, 6);
  }
  return paint(tone, geom, (i) => fillAt(tone, i));
};

/** Heavy ink closing in from every edge, leaving the clash clear. One
 *  even-odd path: outer frame, inner loop knocked out of it. */
const vignette: Composer = (cx, cy, opts) => {
  const tone = rollTone(opts, false);
  // This is an ink effect first. A bey primary flooding the whole border is a
  // good frame occasionally and a garish one every third clash, so most of the
  // pale and coloured rolls are pulled back to ink.
  if (tone.fills[0] !== INK && chance(0.4)) tone.fills = [INK];
  // Half-corrected: a truly round opening leaves a slab of ink down each side
  // of a wide viewport, an uncorrected one reads as a stretched oval.
  const kx = 0.5 + 0.5 * xScale();
  // Pulled back toward the middle — an opening hard against a frame edge reads
  // as a rendering fault rather than a framing choice.
  const hx = 50 + (cx - 50) * 0.55;
  const hy = 50 + (cy - 50) * 0.55;
  // Measured on a 1280×820 viewport: at 24 the ink swallows the frame and
  // reads as a blot, at 46 it survives only as a rim. 29–39 leaves an ink band
  // of roughly a sixth of the frame, which is what a slam vignette is.
  const base = rnd(29, 39) + reach(opts.strength) * 1.2;
  // Few enough vertices that the chords between them stay straight — a smooth
  // high-vertex loop reads as a cloud rather than brushed ink.
  const n = 13 + Math.floor(Math.random() * 10);
  const phase = Math.random() * 6.28;
  const lean = Math.random() * 6.28;
  const wob = rnd(0.05, 0.16);
  const spike = chance(0.65) ? rnd(0.18, 0.4) : 0;

  const loop: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let k =
      1 + wob * (Math.sin(a * 3 + phase) * 0.6 + Math.sin(a * 5 + phase * 1.7) * 0.4);
    // Weighted to one side: an evenly thick border is a UI frame, not ink.
    k *= 1 - 0.2 * Math.cos(a - lean);
    if (spike && chance(0.25)) k *= 1 - spike;
    const rr = base * k;
    loop.push([hx + Math.cos(a) * rr * kx, hy + Math.sin(a) * rr]);
  }
  const d =
    'M0,0 H100 V100 H0 Z M' +
    loop.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L') +
    ' Z';
  return `<path fill-rule="evenodd" fill="${fillAt(tone, 0)}" d="${d}"/>`;
};

const COMPOSERS: Record<Exclude<Composition, 'negative-slam'>, Composer> = {
  radial,
  'speed-sheet': speedSheet,
  shatter,
  rings,
  vignette,
};

interface SlamGeometry {
  wedges: string[];
  bands: string[];
}

function slamGeometry(cx: number, cy: number, opts: ImpactOpts): SlamGeometry {
  const kx = xScale();
  const inner = Math.max(14, rnd(13, 21) + reach(opts.strength));
  const bands: string[] = [];
  // Not always the same tight donut at the centre: with the frame inverting
  // under it, a fixed ring is the one element every crit would share.
  const tight = Math.random();
  if (tight < 0.75) {
    const a = tight < 0.5 ? 0 : Math.random() * Math.PI * 2;
    const arc = tight < 0.5 ? Math.PI * 2 : rnd(3.8, 5.9);
    bands.push(
      arcBand(cx, cy, rnd(5, 12), kx, a, a + arc, rnd(1.6, 3.4), 0.03, Math.random() * 6.28),
    );
  }
  if (chance(0.7)) {
    const a = Math.random() * Math.PI * 2;
    bands.push(
      arcBand(cx, cy, rnd(17, 30), kx, a, a + rnd(3.4, 5.6), rnd(1, 2.4), 0.05, Math.random() * 6.28),
    );
  }
  return {
    wedges: burstWedges(
      cx,
      cy,
      30 + Math.floor(Math.random() * 20),
      Math.random() * Math.PI * 2,
      inner,
    ),
    bands,
  };
}

/**
 * Full-screen inversion, reserved for crits: a solid field with the wedges and
 * rings knocked out of it. Phase 0 is the inverted pre-frame, phase 1 the
 * resolved frame; both reuse the same geometry so the swap reads as one
 * drawing inverting, not two different pictures.
 */
function slamPhase(g: SlamGeometry, phase: 0 | 1): string {
  const field = phase === 0 ? INK : PAPER;
  const mark = phase === 0 ? PAPER : INK;
  return (
    `<rect x="0" y="0" width="100" height="100" fill="${field}"/>` +
    `<g fill="${mark}">` +
    g.wedges.concat(g.bands).map((p) => `<polygon points="${p}"/>`).join('') +
    `</g>`
  );
}

/** Compositions that need longer on screen to be read at all. */
const HOLD: Record<Composition, number> = {
  radial: 1,
  'speed-sheet': 1.15,
  shatter: 1.2,
  rings: 1.1,
  vignette: 1.05,
  'negative-slam': 1,
};

const POOL: Composition[] = ['radial', 'speed-sheet', 'shatter', 'rings', 'vignette'];

export class ImpactFrame {
  private layer: HTMLElement | null = null;
  // Most recent first, capped at two. One-back memory is not enough with a set
  // this small: A B A B never repeats back-to-back and still reads as a loop.
  private recent: Composition[] = [];

  private pick(opts: ImpactOpts): Composition {
    const big = opts.crit || opts.strength >= 2.2;
    // The slam is the most extreme framing and is kept out of the ordinary
    // pool, but is not guaranteed even on crits — a run of them would become
    // its own repetition.
    if (big && this.recent.indexOf('negative-slam') < 0 && chance(0.75)) {
      return 'negative-slam';
    }
    // Never within the last two, which still leaves at least three options.
    const pool = POOL.filter((c) => this.recent.indexOf(c) < 0);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /** Screen position of the clash in percent (0–100 each axis). */
  trigger(xPct: number, yPct: number, opts: ImpactOpts): void {
    if (typeof document === 'undefined') return;
    if (!this.layer) {
      this.layer = document.createElement('div');
      this.layer.className = 'impact-frame-layer';
      document.body.appendChild(this.layer);
    }

    // Clamp toward the middle: a clash projected near the screen edge would
    // put every mark on one side and read as a glitch, not a frame.
    const cx = Math.min(78, Math.max(22, xPct));
    const cy = Math.min(72, Math.max(28, yPct));

    const comp = this.pick(opts);
    this.recent.unshift(comp);
    if (this.recent.length > 2) this.recent.pop();

    const svg = (inner: string): string =>
      // preserveAspectRatio="none" stretches the square space to the viewport;
      // the distortion is invisible on shapes this irregular and it keeps the
      // percent coordinates honest.
      `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${inner}</svg>`;

    const el = document.createElement('div');
    el.className = 'impact-frame';

    if (comp === 'negative-slam') {
      const geo = slamGeometry(cx, cy, opts);
      el.innerHTML = svg(slamPhase(geo, 0));
      // Two cuts, not a strobe: one inverted pre-frame, then the resolved
      // frame for the remainder.
      window.setTimeout(() => {
        el.innerHTML = svg(slamPhase(geo, 1));
      }, 45);
    } else {
      el.innerHTML = svg(COMPOSERS[comp](cx, cy, opts));
    }

    // Hits can land inside each other's lifetime; three stacked full-screen
    // frames is noise, not emphasis, and the oldest is the stale read.
    while (this.layer.childElementCount >= 2) {
      const stale = this.layer.firstElementChild;
      if (!stale) break;
      stale.remove();
    }
    this.layer.appendChild(el);

    // Lifetime rides the hit — the sim's hitstop is longer on bigger clashes
    // and the cut should hold for the same beat. Still a cut: removal is
    // abrupt, no fade.
    const life = Math.round(
      Math.min(250, Math.max(130, 130 + (opts.strength - 1.6) * 100)) * HOLD[comp],
    );
    window.setTimeout(() => el.remove(), life);
  }
}
