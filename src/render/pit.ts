import * as THREE from 'three';
import * as C from '../sim/constants';
import { bowlHeight } from '../sim/physics';
import { noOutline } from './toon';

/**
 * The hazard zone in the dish floor.
 *
 * A hazard the player cannot see is not a mechanic, it is a bug — so this has
 * to read as *ground that costs you* at a glance, and it has to communicate the
 * two things the physics actually does:
 *
 *  - The drain scales with depth, so the fill is a gradient darkening inward
 *    rather than a flat disc. Where it looks worst is where it is worst.
 *  - The drain needs unbroken dwell time to ramp, so the ring pulses only
 *    while something is actually being drained. A permanently animated hazard
 *    would read as always-on and teach the wrong rule.
 *
 * Drawn flat on the bowl surface rather than as geometry standing in it: the
 * tops orbit through this space constantly, and spikes tall enough to see
 * would occlude the fight they are supposed to be shaping.
 *
 * NOT ONE PICTURE FOR FOUR DIFFERENT ZONES, which is what it was, and looking
 * at all eight arenas in the browser is what caught it. Four arenas own a pit
 * and they mean very different things by it; the Tight Dish's whole stated
 * identity is that its middle is *dead ground you are always slightly on*, and
 * it was being painted with the Spike Pit's deep-red bite at almost twice the
 * radius. The result was that the one arena meant to read cramped and
 * industrial read as the most lethal floor in the game, and the steel grating
 * underneath it — the entire `grate` treatment — was invisible.
 *
 * The two treatments below are derived from the GEOMETRY rather than passed in,
 * because in this game the geometry *is* the statement. See DEAD_GROUND and
 * `swirl`.
 */
export interface PitHandles {
  group: THREE.Group;
  /** Rim ring, pulsed while a top is being drained. */
  ringMaterial: THREE.MeshBasicMaterial;
}

/**
 * Past this radius a pit stops being a hazard and starts being ground.
 *
 * 0.6 of the tornado ridge, which is 0.49 — and the gap either side of it is
 * the whole justification. Every "avoid this" pit in the game is at 0.34-0.42
 * and the one "you are always on this" pit is at 0.66, so the threshold sits in
 * open space rather than between two neighbours. Expressed against the ridge
 * rather than as a bare number because the ridge is what makes a zone wide: a
 * pit reaching most of the way to the tornado line has taken the floor away,
 * and there is nowhere left to avoid it to.
 *
 * DERIVED RATHER THAN DECLARED, deliberately. `PitSpec` is a physics record and
 * `ArenaLook` is a palette; a third place to say which kind of zone this is
 * would be a third thing that can disagree with the other two. Radius cannot
 * disagree with itself.
 */
const DEAD_GROUND = C.RIDGE_RADIUS * 0.6;

/** Polar helper, in the canvas frame — see `hazardTexture` on what that is. */
function polar(mid: number, a: number, r: number): [number, number] {
  return [mid + Math.cos(a) * mid * r, mid + Math.sin(a) * mid * r];
}

/**
 * The zone's face.
 *
 * COORDINATES. The disc is a `CircleGeometry` whose UVs are u = lx/2r + 0.5,
 * v = ly/2r + 0.5, sampled through a `flipY = true` texture, and the mesh is
 * then rotated so local (lx, ly) lands at sim (lx, −ly). Those two sign flips
 * cancel: **canvas angle is sim bearing**, measured the same way round. That
 * matters for `swirl` alone, where an arrow drawn backwards would tell the
 * player the current runs the opposite way to the force the sim applies.
 *
 * @param dead Wide zone: dead ground rather than a bite. Never red, never
 *   opaque — the floor treatment underneath has to keep reading through it.
 * @param swirl Off-centre zone: the mechanic is a tangential current (see
 *   `PitSpec.push`), so the marks run around the well instead of into it.
 */
function hazardTexture(dead: boolean, swirl: boolean): THREE.CanvasTexture {
  const size = 256;
  const mid = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const g = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
    if (dead) {
      // Cool graphite, and SHALLOW. This zone covers most of the dish, so
      // anything strong enough to read as danger would also be strong enough
      // to bury the floor plate — and the plate is the point. It still darkens
      // inward, because the drain still does.
      g.addColorStop(0, 'rgba(44, 52, 64, 0.34)');
      g.addColorStop(0.55, 'rgba(52, 60, 72, 0.24)');
      g.addColorStop(0.86, 'rgba(60, 68, 80, 0.16)');
      g.addColorStop(1, 'rgba(60, 68, 80, 0.05)');
    } else {
      // Depth gradient: transparent at the rim, deep red at the centre. This is
      // the drain curve made visible.
      //
      // Tuned against the anime dish, which is near-white — the first pass used
      // muted reds at moderate alpha and simply vanished into it. On a light
      // floor a hazard has to commit.
      g.addColorStop(0, 'rgba(120, 0, 14, 0.96)');
      g.addColorStop(0.35, 'rgba(176, 16, 28, 0.86)');
      g.addColorStop(0.7, 'rgba(206, 44, 40, 0.56)');
      g.addColorStop(0.92, 'rgba(220, 70, 50, 0.2)');
      g.addColorStop(1, 'rgba(220, 70, 50, 0)');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(mid, mid, mid, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (dead) {
      // No chevrons at all: an arrow is an instruction, and there is nothing to
      // do about a zone that covers the middle of the floor. What it gets
      // instead is an EDGE — a hatched band on the inside of the boundary,
      // which is how a real floor says "plant nothing past this line".
      ctx.save();
      ctx.beginPath();
      ctx.arc(mid, mid, mid * 0.99, 0, Math.PI * 2);
      ctx.arc(mid, mid, mid * 0.86, 0, Math.PI * 2, true);
      ctx.clip('evenodd');
      ctx.strokeStyle = 'rgba(226, 176, 64, 0.62)';
      ctx.lineWidth = size * 0.03;
      for (let x = -size; x < size * 2; x += size * 0.075) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + size, size);
        ctx.stroke();
      }
      ctx.restore();
    } else if (swirl) {
      // Tangential chevrons, pointing the way the current carries you.
      //
      // `updatePit` adds velocity along (−dy, dx) — the offset vector turned a
      // quarter turn ANTICLOCKWISE in sim coordinates — and canvas angle is sim
      // bearing (see above), so the tip belongs at a LARGER angle than the
      // tail. Drawn the other way round this becomes a picture of a current
      // that does not exist.
      // A SHAFT AND A HEAD, not a bare chevron. Two attempts at a chevron
      // alone failed in the browser for opposite reasons — a tight one read as
      // a lightning bolt, a swept one as two unrelated dashes — because a
      // chevron only says "direction" when the eye already knows which axis it
      // is travelling along, and on a small off-centre disc it does not. An arc
      // with an arrowhead on its leading end supplies the axis and the sense in
      // one mark, which is how a current is drawn on any chart.
      ctx.strokeStyle = 'rgba(255, 226, 120, 0.85)';
      ctx.lineWidth = size * 0.022;
      const SPOKES = 6;
      /** Angular length of one arrow. Just under the 60° spacing, so they read as a broken ring rather than a solid one. */
      const RUN = 0.82;
      for (let i = 0; i < SPOKES; i++) {
        const a = (i / SPOKES) * Math.PI * 2;
        for (const rr of [0.84, 0.5]) {
          ctx.beginPath();
          ctx.arc(mid, mid, mid * rr, a, a + RUN);
          ctx.stroke();
          const tip = a + RUN;
          ctx.beginPath();
          ctx.moveTo(...polar(mid, tip - 0.2, rr * 1.13));
          ctx.lineTo(...polar(mid, tip, rr));
          ctx.lineTo(...polar(mid, tip - 0.2, rr * 0.87));
          ctx.stroke();
        }
      }
    } else {
      // Hazard chevrons pointing inward, fading out before the centre so they
      // never compete with the tops fighting over it.
      ctx.strokeStyle = 'rgba(255, 226, 120, 0.85)';
      ctx.lineWidth = size * 0.026;
      const SPOKES = 12;
      for (let i = 0; i < SPOKES; i++) {
        const a = (i / SPOKES) * Math.PI * 2;
        for (const rr of [0.9, 0.72]) {
          const tip = rr - 0.12;
          ctx.beginPath();
          ctx.moveTo(...polar(mid, a - 0.1, rr));
          ctx.lineTo(...polar(mid, a, tip));
          ctx.lineTo(...polar(mid, a + 0.1, rr));
          ctx.stroke();
        }
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildPit(radius: number, offX = 0, offZ = 0): PitHandles {
  const group = new THREE.Group();
  const dead = radius > DEAD_GROUND;
  const swirl = offX !== 0 || offZ !== 0;

  const floorMat = new THREE.MeshBasicMaterial({
    map: hazardTexture(dead, swirl),
    transparent: true,
    depthWrite: false,
  });
  noOutline(floorMat);

  /**
   * Where a point of this zone's local plane really sits on the dish.
   *
   * The mesh is rotated −90° about X, which maps local (x, y, z) to world
   * (x, z, −y): world height comes from local *z*, positive-up, and world
   * *depth* comes from local −y.
   *
   * THAT SECOND HALF WAS WRONG, and looking at the Crater in the browser is
   * what showed it. The height was taken from `hypot(x + offX, y + offZ)`,
   * which is the bowl radius of a point MIRRORED across the zone's centre in
   * z. For a centred zone the two agree exactly, so nothing was visible for as
   * long as every pit sat in the middle; the moment one moved off-centre, half
   * the disc was drawn at the wrong height and sank under the floor. What the
   * screenshot showed was a red kidney bean, not a crater.
   */
  const heightAt = (lx: number, ly: number): number =>
    bowlHeight(Math.hypot(lx + offX, offZ - ly));

  // Follows the bowl profile instead of lying flat: a flat disc across a
  // curved dish either sinks into it at the rim or floats at the centre.
  const seg = 48;
  const geo = new THREE.CircleGeometry(radius, seg);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setZ(i, heightAt(pos.getX(i), pos.getY(i)) + 0.006);
  }
  geo.computeVertexNormals();

  const floor = new THREE.Mesh(geo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(offX, 0, offZ);
  // Above the dish paint, below the tops and their contact shadows.
  floor.renderOrder = -3;
  group.add(floor);

  const ringMat = new THREE.MeshBasicMaterial({
    // Hot orange for a bite, brass for dead ground. The ring is the one part
    // of the zone that PULSES, so it has to stay legible in both — but a red
    // ring around the Tight Dish's floor plate would put back exactly the
    // "this is where the spikes are" reading the fill above just removed.
    color: dead ? 0xc8a24a : 0xff5a3c,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  noOutline(ringMat);

  // THE BOUNDARY FOLLOWS THE BOWL TOO, which a flat torus cannot.
  //
  // It used to be one torus parked at `bowlHeight(offset + radius)` — the bowl
  // height of the zone's FURTHEST point — with a comment conceding that a flat
  // ring "can only sit at ONE height". On a centred pit that is a hairline of
  // float. On the Crater it put the whole ring a fifth of the rim's height
  // above the disc it was supposed to edge, and from the battle camera the two
  // read as unrelated objects: a red blob with a larger orange circle hanging
  // over it. Rotating the geometry first and then displacing each vertex costs
  // one loop at build time and makes the ring sit on the floor everywhere.
  const ringGeo = new THREE.TorusGeometry(radius, 0.006, 6, 96);
  ringGeo.rotateX(Math.PI / 2);
  const ringPos = ringGeo.attributes.position;
  for (let i = 0; i < ringPos.count; i++) {
    // Post-rotation the tube's own thickness is the y component, so it is kept
    // and the bowl height added to it rather than replacing it.
    ringPos.setY(
      i,
      ringPos.getY(i) + bowlHeight(Math.hypot(ringPos.getX(i) + offX, ringPos.getZ(i) + offZ)) + 0.004,
    );
  }
  ringGeo.computeVertexNormals();
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.set(offX, 0, offZ);
  ring.renderOrder = -3;
  group.add(ring);

  return { group, ringMaterial: ringMat };
}
