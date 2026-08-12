/**
 * The manga impact frame: a full-screen cut on a heavy clash.
 *
 * DOM, not WebGL, on purpose: the frame is a *cut* — it must cover the whole
 * screen, appear on one frame and vanish abruptly with no fade tail (anime
 * cuts, it does not fade), and none of that wants to live in the render loop.
 *
 * Four distinct styles, re-rolled per hit and never the same twice in a row,
 * because one look repeated is exactly what made the effect read as canned.
 * Geometry (wedge count, jitter, rotation, inner radius, lifetime) is also
 * regenerated per hit so no two frames are the same drawing; heavy clashes
 * are rare enough that the allocation is irrelevant.
 */

const INK = '#0a0a12';

// Beyond any corner of the stretched 100×100 box, so every wedge is anchored
// off-screen regardless of aspect.
const OUTER = 170;

type FrameStyle = 'white-burst' | 'ink-burst' | 'clash-tone' | 'flash-cut';

export interface ImpactOpts {
  /** Sim hit strength: heavy clashes are >= 1.6, crits/finishers ~2.2+. */
  strength: number;
  crit: boolean;
  /** Design primary of each bey as a CSS hex, for the clash-tone style. */
  colourA: string;
  colourB: string;
}

/**
 * Per-wedge point lists (not full polygons) so each style can colour them
 * independently. Irregular by construction — jittered angle, bimodal width
 * and jittered inner radius: a perfectly regular burst reads as a loading
 * spinner, and an even width distribution reads as a gear, not a burst.
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
      (Math.random() < 0.3
        ? 1.1 + Math.random() * 1.3
        : 0.18 + Math.random() * 0.55) *
      (Math.PI / count);
    const inner = innerBase * (0.75 + Math.random() * 0.6);
    const ax = cx + Math.cos(a) * inner;
    const ay = cy + Math.sin(a) * inner;
    const bx = cx + Math.cos(a - half) * OUTER;
    const by = cy + Math.sin(a - half) * OUTER;
    const dx = cx + Math.cos(a + half) * OUTER;
    const dy = cy + Math.sin(a + half) * OUTER;
    out.push(
      `${ax.toFixed(1)},${ay.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)} ${dx.toFixed(1)},${dy.toFixed(1)}`,
    );
  }
  return out;
}

/** White wedges with a thin ink outline; stroke weight re-rolled per hit. */
function whiteBurst(wedges: string[]): string {
  const sw = (0.3 + Math.random() * 0.3).toFixed(2);
  return (
    `<g fill="#ffffff" stroke="${INK}" stroke-width="${sw}">` +
    wedges.map((p) => `<polygon points="${p}"/>`).join('') +
    `</g>`
  );
}

/** Near-black wedges, no outline — the classic manga read on a light floor. */
function inkBurst(wedges: string[]): string {
  return (
    `<g fill="${INK}">` +
    wedges.map((p) => `<polygon points="${p}"/>`).join('') +
    `</g>`
  );
}

/** Wedges cycling colourA / colourB / white: two powers colliding. The ink
 * stroke is what keeps the white and any pale primaries legible on the
 * near-white floor. */
function clashTone(wedges: string[], colourA: string, colourB: string): string {
  const cols = [colourA, colourB, '#ffffff'];
  return (
    `<g stroke="${INK}" stroke-width="0.3">` +
    wedges.map((p, i) => `<polygon fill="${cols[i % 3]}" points="${p}"/>`).join('') +
    `</g>`
  );
}

/**
 * Full-screen inversion for crits/finishers: a solid field with the wedges
 * knocked out of it in the opposite tone, plus a hard ring at the impact
 * point. phase 0 is the inverted pre-frame, phase 1 the resolved frame; both
 * reuse the same wedge geometry so the swap reads as one drawing inverting,
 * not two different bursts.
 */
function flashCut(
  cx: number,
  cy: number,
  wedges: string[],
  phase: 0 | 1,
): string {
  const field = phase === 0 ? INK : '#ffffff';
  const mark = phase === 0 ? '#ffffff' : INK;
  // Filled annulus instead of a stroked circle: preserveAspectRatio="none"
  // stretches strokes anisotropically, but two aspect-corrected filled
  // ellipses stay a true hard ring at any viewport shape.
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  const rO = 6.4 + Math.random() * 1.6;
  const rI = rO * 0.66;
  return (
    `<rect x="0" y="0" width="100" height="100" fill="${field}"/>` +
    `<g fill="${mark}">` +
    wedges.map((p) => `<polygon points="${p}"/>`).join('') +
    `</g>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${(rO / aspect).toFixed(2)}" ry="${rO.toFixed(2)}" fill="${mark}"/>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${(rI / aspect).toFixed(2)}" ry="${rI.toFixed(2)}" fill="${field}"/>`
  );
}

export class ImpactFrame {
  private layer: HTMLElement | null = null;
  private lastStyle: FrameStyle | null = null;

  private pickStyle(opts: ImpactOpts): FrameStyle {
    const big = opts.crit || opts.strength >= 2.2;
    // flash-cut is reserved for the biggest moments and preferred there, but
    // not guaranteed — a run of crits should not become its own repetition.
    if (big && this.lastStyle !== 'flash-cut' && Math.random() < 0.8) {
      return 'flash-cut';
    }
    // Never the same style twice in a row; the filtered pool always keeps at
    // least two options, so the pick stays a genuine choice.
    const pool = (['white-burst', 'ink-burst', 'clash-tone'] as FrameStyle[]).filter(
      (s) => s !== this.lastStyle,
    );
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
    // put every wedge on one side and read as a glitch, not a frame.
    const cx = Math.min(78, Math.max(22, xPct));
    const cy = Math.min(72, Math.max(28, yPct));

    const style = this.pickStyle(opts);
    this.lastStyle = style;

    const count = 26 + Math.floor(Math.random() * 21);
    const rot = Math.random() * Math.PI * 2;
    // Harder hits open a wider hole; flash-cut needs the hole to clear its
    // impact ring.
    let innerBase =
      11 + Math.random() * 8 + Math.min(6, Math.max(0, (opts.strength - 1.6) * 4));
    if (style === 'flash-cut') innerBase = Math.max(13, innerBase);
    const wedges = burstWedges(cx, cy, count, rot, innerBase);

    // Lifetime rides the hit — the sim's hitstop is longer on bigger clashes
    // and the cut should hold for the same beat. Still a cut: removal is
    // abrupt, no fade.
    const life = Math.round(
      Math.min(220, Math.max(130, 130 + (opts.strength - 1.6) * 100)),
    );

    const svg = (inner: string): string =>
      // preserveAspectRatio="none" stretches the square space to the
      // viewport; the distortion is invisible on shapes this irregular and it
      // keeps the percent coordinates honest.
      `<svg viewBox="0 0 100 100" preserveAspectRatio="none">${inner}</svg>`;

    const el = document.createElement('div');
    el.className = 'impact-frame';

    switch (style) {
      case 'white-burst':
        el.innerHTML = svg(whiteBurst(wedges));
        break;
      case 'ink-burst':
        el.innerHTML = svg(inkBurst(wedges));
        break;
      case 'clash-tone':
        el.innerHTML = svg(clashTone(wedges, opts.colourA, opts.colourB));
        break;
      case 'flash-cut':
        el.innerHTML = svg(flashCut(cx, cy, wedges, 0));
        // Two cuts, not a strobe: one inverted pre-frame, then the resolved
        // white field for the remainder.
        window.setTimeout(() => {
          el.innerHTML = svg(flashCut(cx, cy, wedges, 1));
        }, 45);
        break;
    }

    this.layer.appendChild(el);
    window.setTimeout(() => el.remove(), life);
  }
}
