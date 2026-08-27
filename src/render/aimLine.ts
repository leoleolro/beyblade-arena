import * as THREE from 'three';
import { beyWorldPosition } from './stadium';

/**
 * The aim line — where a Charge will actually go.
 *
 * WHY THIS EXISTS. Charge used to home, so there was nothing to show: you
 * pressed the button and the game did the aiming. Now the player points, and a
 * control the player cannot see is not a control — they would press Charge,
 * fly somewhere unexpected, and learn nothing about why. This is the whole
 * feedback loop for the mechanic, so it is not decoration.
 *
 * WHY CHEVRONS AND NOT A LINE. It was a tapered ribbon first, and it was
 * invisible in play for two compounding reasons worth recording, because both
 * are easy to repeat:
 *
 *   - the taper was cubic, so past about a third of its length the stroke was
 *     under a millimetre wide in dish units. It measured correct — the vertex
 *     positions traced exactly the right bearing — and drew nothing. A shape
 *     can be verifiably in the right place and still not be a shape.
 *   - it was white, and half the themes have a near-white dish. Same trap the
 *     clash pool fell into from the other direction.
 *
 * Chevrons fix both by construction: each one is a solid area rather than a
 * width that trends to zero, and the arena already speaks in chevrons — the
 * pit hazard is drawn with them — so this reads as part of the floor's own
 * language rather than a HUD element lying on top of it.
 *
 * WHY THEY LIE ON THE DISH. Every position in this game is read off the bowl,
 * and a mark drawn flat over a curved floor points somewhere different from
 * where it lands — at the rim the parallax is most of a top's width. Each
 * chevron's corners take their height from `beyWorldPosition`, exactly like
 * the tops do. They follow the floor because the top will.
 */

/** Chevrons drawn along the aim. Odd enough to read as a run, few enough to stay clean. */
const COUNT = 5;

/**
 * All of these are in dish units, where the stadium radius is 1.0 and a top is
 * about 0.105 across the middle. That second number is the one to size against
 * — the first draft was built against a guess that the dish was half as wide,
 * and produced chevrons narrower than half a bey. They rendered, they were in
 * exactly the right place, and they were invisible in play.
 */

/** Distance from the top to the first chevron. Clear of the model's own radius. */
const START = 0.16;

/** Spacing between chevrons. */
const STEP = 0.14;

/** Length of one chevron along the aim. About a bey's width. */
const LENGTH = 0.10;

/** Half-width of one chevron across the aim. */
const HALF_WIDTH = 0.075;

/**
 * Height above the floor.
 *
 * 0.02, not the clash pool's 0.004. The pool is a broad soft disc where an
 * occluded edge costs nothing; this is five small marks, and at 0.004 the
 * bowl's own surface won the depth test for the four nearest the top — the
 * only one that drew was the far chevron out near the rim, which read as a
 * stray dot rather than an aim. The rest of the gap is the pit hazard's own
 * decal, which the aim has to sit above: the two overlap constantly, because
 * the hazard is exactly where a player most wants to know where they are
 * pointing.
 */
const LIFT = 0.02;

/**
 * How much larger the dark backing chevron is than the coloured one, in dish
 * units.
 *
 * WHY THERE IS AN OUTLINE. The aim run has to read over the pale dish, the
 * dark Overdrive dish, the pit's red hazard field AND that hazard's own yellow
 * chevrons — and cyan-on-red was the pairing that lost. No single fill colour
 * survives all four backgrounds, so the shape carries its own contrast with
 * it. This is also what the rest of the game does: everything here is
 * cel-shaded with an ink line, so an outlined mark belongs to the floor rather
 * than sitting on it like a HUD element.
 */
const OUTLINE = 0.022;

/** The ink colour of the backing chevron. Matches the toon outline. */
const INK = 0x101820;

/**
 * Radius past which a chevron is not drawn at all.
 *
 * Just inside `STADIUM_RADIUS` (1.0) so a mark never straddles the lip.
 */
const RIM = 0.94;

/**
 * Colour when the move can be paid for.
 *
 * Saturated cyan rather than white, and that is the whole point: it has to
 * read on Anime's near-white dish AND on Overdrive's near-black one, and no
 * neutral does both. A hue carries on either.
 */
const READY = 0x25d9f0;

/** Colour when the meter is short. Desaturated and dark enough to recede. */
const WAITING = 0x5c6675;

/** One drawn layer of the run: the ink backing, or the coloured fill. */
interface Layer {
  mesh: THREE.Mesh;
  geo: THREE.BufferGeometry;
  positions: Float32Array;
  mat: THREE.MeshBasicMaterial;
  /** Added to both half-extents, so the backing reads as an outline. */
  pad: number;
}

export class AimLine {
  readonly group = new THREE.Group();
  private readonly layers: Layer[] = [];
  private readonly fill: THREE.MeshBasicMaterial;
  /** Eased so the run does not snap between frames as the pointer moves. */
  private shown = 0;

  constructor() {
    // Ink first so the fill draws over it. Both have depthWrite off, so the
    // order here is the order they land in, and renderOrder keeps them ahead
    // of the floor either way.
    for (const [colour, pad, order] of [
      [INK, OUTLINE, 3],
      [READY, 0, 4],
    ] as const) {
      const geo = new THREE.BufferGeometry();
      // One triangle per chevron: tip forward, two trailing corners.
      const positions = new Float32Array(COUNT * 3 * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const mat = new THREE.MeshBasicMaterial({
        color: colour,
        transparent: true,
        opacity: 0,
        // Normal blending, not additive. This has to read on the Anime theme's
        // near-white dish as well as on Overdrive's near-black one, and
        // additive light cannot darken.
        blending: THREE.NormalBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
        // Depth test ON so the rim of the bowl occludes a run pointed past it,
        // which is the cue that tells the player the aim has left the dish.
        depthTest: true,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = order;
      this.group.add(mesh);
      this.layers.push({ mesh, geo, positions, mat, pad });
    }
    this.fill = this.layers[1].mat;
    this.group.frustumCulled = false;
    this.group.visible = false;
  }

  /** Cyan when the charge is affordable, slate when it is not. */
  setReady(ready: boolean): void {
    this.fill.color.setHex(ready ? READY : WAITING);
  }

  /**
   * Point the run of chevrons, or pass `visible: false` to fade it out.
   *
   * `fromX, fromY` and the direction are all in dish coordinates — this takes
   * sim-space and does the world mapping itself, so no caller has to know that
   * the dish's y is three's z.
   */
  aim(fromX: number, fromY: number, dirX: number, dirY: number, visible: boolean): void {
    const want = visible ? 1 : 0;
    // A fixed step rather than a dt-scaled one: this runs on the render loop,
    // and the only thing it must not do is pop.
    this.shown += (want - this.shown) * 0.25;
    if (this.shown < 0.01) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    const len = Math.hypot(dirX, dirY) || 1;
    const ux = dirX / len;
    const uy = dirY / len;
    // Perpendicular in the dish plane, for the chevron's spread.
    const px = -uy;
    const py = ux;

    for (const layer of this.layers) {
      // The ink sits a little softer than the fill so the outline reads as a
      // shadow under the mark rather than a second mark of its own.
      layer.mat.opacity = this.shown * (layer.pad > 0 ? 0.5 : 0.85);

      let o = 0;
      const put = (x: number, y: number): void => {
        const p = beyWorldPosition(x, y);
        layer.positions[o] = p.x;
        layer.positions[o + 1] = p.y + LIFT;
        layer.positions[o + 2] = p.z;
        o += 3;
      };

      for (let i = 0; i < COUNT; i++) {
        const base = START + i * STEP;
        // Shrink down the run rather than fading it. Opacity is one value for
        // the whole mesh — a per-vertex fade would need a custom material —
        // and size carries the same "this end is the front" reading for free.
        const k = 1 - i * 0.12;
        const bx = fromX + ux * base;
        const by = fromY + uy * base;

        // STOP AT THE RIM. Past the dish edge `beyWorldPosition` clamps its
        // radius, so a chevron out there sits at rim height and floats over
        // the outside of the stadium — an aim mark drawn on thin air.
        // Collapsing it instead is both correct and useful: the run visibly
        // runs out when you point at the wall, which is the cue that the
        // charge is about to spend itself on nothing.
        if (Math.hypot(bx, by) > RIM) {
          put(bx, by);
          put(bx, by);
          put(bx, by);
          continue;
        }

        const nose = LENGTH * k + layer.pad;
        const wide = HALF_WIDTH * k + layer.pad;
        // Tip, then the two trailing corners.
        put(bx + ux * nose, by + uy * nose);
        put(bx + px * wide, by + py * wide);
        put(bx - px * wide, by - py * wide);
      }

      layer.geo.attributes.position.needsUpdate = true;
      layer.geo.computeBoundingSphere();
    }
  }

  dispose(): void {
    for (const l of this.layers) {
      l.geo.dispose();
      l.mat.dispose();
    }
  }
}
