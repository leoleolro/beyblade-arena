import { RARITY_COLOUR, RARITY_LABEL } from '../economy';
import type { CrateResult, RewardRef } from '../economy';
import { drawBeyThumb } from './beyThumb';
import { LAYERS } from '../sim/parts';

/**
 * The crate reveal.
 *
 * This is the entire reason the crate exists. A pull that instantly prints
 * "you got X" is worth nothing — the value is in the seconds before you know,
 * and the mechanism the reference games use for that is a reel that scrolls
 * fast, slows, and *nearly* overshoots before settling.
 *
 * The result is already decided and already banked before this runs (see
 * `Game.openCrate`). Nothing here can change what you won, which matters for
 * two reasons: closing the tab mid-animation cannot cost you the item, and the
 * near-miss is honest theatre rather than a rigged-looking recalculation.
 *
 * The reel is positioned so the winning tile lands under the marker, rather
 * than the marker being moved to wherever the reel stopped. Those look
 * identical and are not: the second would let a rendering bug silently show
 * the wrong item.
 */

/** Tile width and gap in px. Layout maths below depends on both. */
const TILE = 96;
const GAP = 8;
const STRIDE = TILE + GAP;

/** How long the reel runs, before the settle. */
const SPIN_MS = 2600;

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

const isLayer = (r: RewardRef): boolean =>
  r.kind === 'layers' && LAYERS.some((l) => l.id === r.id);

/**
 * One reel tile. Layer rewards get their actual drawn plan view; everything
 * else gets a rarity-tinted plate with its name, because a disc or a driver
 * has no silhouette worth 96px and a fake one would be worse than none.
 */
function tile(r: RewardRef): HTMLElement {
  const el = document.createElement('div');
  el.className = `reel-tile r-${r.rarity}`;
  el.style.setProperty('--rar', hex(RARITY_COLOUR[r.rarity]));

  if (isLayer(r)) {
    const canvas = document.createElement('canvas');
    drawBeyThumb(canvas, r.id, 64);
    el.appendChild(canvas);
  } else {
    const glyph = document.createElement('div');
    glyph.className = 'reel-glyph';
    glyph.textContent = r.name.slice(0, 2).toUpperCase();
    el.appendChild(glyph);
  }

  const name = document.createElement('small');
  name.textContent = r.name;
  el.appendChild(name);
  return el;
}

/**
 * Ease with a late overshoot.
 *
 * A plain ease-out decelerates smoothly onto the answer, which reads as
 * inevitable. Carrying slightly past the target and coming back is what
 * produces the "it nearly stopped on the good one" beat that the whole
 * animation is for. The overshoot is small (about a third of a tile) so it
 * never looks like a bug.
 */
function ease(t: number): number {
  if (t >= 1) return 1;
  const k = 1 - t;
  // Cubic ease-out with a damped sine riding the tail.
  return 1 - k * k * k + Math.sin(t * Math.PI * 2.0) * 0.045 * k * k;
}

export function playCrateReveal(result: CrateResult, onDone: () => void): void {
  if (typeof document === 'undefined') {
    onDone();
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'crate-overlay';

  const box = document.createElement('div');
  box.className = 'crate-box';
  overlay.appendChild(box);

  const window_ = document.createElement('div');
  window_.className = 'crate-window';
  const strip = document.createElement('div');
  strip.className = 'crate-strip';
  window_.appendChild(strip);

  const marker = document.createElement('div');
  marker.className = 'crate-marker';
  window_.appendChild(marker);
  box.appendChild(window_);

  // The winner is placed deep enough into the strip that the reel is still
  // moving quickly when it passes the earlier tiles.
  const WIN_INDEX = Math.min(result.reel.length - 4, 38);
  const tiles: RewardRef[] = result.reel.slice();
  tiles[WIN_INDEX] = result.reward;
  for (const r of tiles) strip.appendChild(tile(r));
  const winTile = strip.children[WIN_INDEX] as HTMLElement;

  const caption = document.createElement('div');
  caption.className = 'crate-caption';
  caption.innerHTML = '<span class="crate-waiting">Opening…</span>';
  box.appendChild(caption);

  const skip = document.createElement('button');
  skip.className = 'crate-skip';
  skip.textContent = 'Skip';
  box.appendChild(skip);

  document.body.appendChild(overlay);

  // Measured after layout so the maths uses the real rendered width rather
  // than an assumed one — the overlay is responsive.
  const centre = window_.clientWidth / 2;
  const target = WIN_INDEX * STRIDE + TILE / 2 - centre;

  let raf = 0;
  let backstop = 0;
  let start = 0;
  let settled = false;
  let cleaned = false;

  const settle = (): void => {
    if (settled) return;
    settled = true;
    if (raf) cancelAnimationFrame(raf);
    if (backstop) clearTimeout(backstop);
    strip.style.transform = `translateX(${-target}px)`;

    const r = result.reward;
    const colour = hex(RARITY_COLOUR[r.rarity]);
    box.style.setProperty('--rar', colour);
    box.classList.add('settled', `r-${r.rarity}`);
    // Lift the winning tile out of the row. The marker says which one it is;
    // this says it is yours.
    winTile.classList.add('won');

    caption.innerHTML =
      `<span class="crate-rarity">${RARITY_LABEL[r.rarity]}</span>` +
      `<b>${escapeHtml(r.name)}</b>` +
      (result.duplicate
        ? `<span class="crate-dupe">Already owned — refunded ${result.refund} coins</span>`
        : '<span class="crate-new">New part unlocked</span>');

    skip.textContent = 'Continue';
  };

  const finish = (): void => {
    if (cleaned) return;
    cleaned = true;
    if (raf) cancelAnimationFrame(raf);
    if (backstop) clearTimeout(backstop);
    window.removeEventListener('keydown', onKey);
    overlay.remove();
    onDone();
  };

  function onKey(e: KeyboardEvent): void {
    e.preventDefault();
    if (settled) finish();
    else settle();
  }

  skip.addEventListener('click', (e) => {
    e.stopPropagation();
    if (settled) finish();
    else settle();
  });
  overlay.addEventListener('click', () => {
    if (settled) finish();
    else settle();
  });
  window.addEventListener('keydown', onKey);

  // Reduced motion: the scroll IS the effect, so there is nothing to soften.
  // Present the result and let them move on.
  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    settle();
    return;
  }

  const step = (now: number): void => {
    if (settled) return;
    if (!start) start = now;
    const t = Math.min(1, (now - start) / SPIN_MS);
    strip.style.transform = `translateX(${-target * ease(t)}px)`;
    if (t >= 1) {
      settle();
      return;
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);

  // Backstop, because rAF does not run in a hidden tab.
  //
  // Found by testing: switch away mid-reveal and the reel freezes mid-scroll
  // with no caption, and stays frozen after you come back. The item is already
  // banked at that point, so nothing is lost — but a stalled reel is
  // indistinguishable from a crash. A timer resolves it instead. Background
  // timers are throttled to about a second, which is fine: the player gets the
  // result rather than the animation, which is the right trade for someone who
  // chose to look at something else.
  backstop = window.setTimeout(settle, SPIN_MS + 400);
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}
