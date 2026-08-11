import * as THREE from 'three';
import { noOutline } from './toon';

/**
 * The spin-blur disc: the anime drawing of a top too fast to see.
 *
 * Fast rotation cannot be rendered honestly here — at 60fps a top spinning
 * hundreds of rad/s aliases into a slow churn — so past ~0.55 spinNorm the
 * detailed mesh hands the silhouette over to this: a flat disc of tangential
 * streaks in the skin's colours, bounded by a hot rim ring, which is exactly
 * the shorthand the reference frames use. Below that spin it fades out and the
 * sculpted top (and its wobble) carries the frame again.
 */
export interface SpinBlur {
  mesh: THREE.Mesh;
  /** Returns blur dominance 0–1, so the caller can shrink the detail under it. */
  update(spinNorm: number, dt: number): number;
}

const css = (hex: number, a: number): string => {
  const c = new THREE.Color(hex);
  return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
};

function blurTexture(primary: number, secondary: number): THREE.CanvasTexture {
  const size = 256;
  const mid = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Base wash so the disc reads as one solid object rather than loose lines,
    // densest in the band where the layer's mass actually is.
    const base = ctx.createRadialGradient(mid, mid, 0, mid, mid, mid);
    base.addColorStop(0, css(secondary, 0.5));
    base.addColorStop(0.45, css(primary, 0.55));
    base.addColorStop(0.8, css(primary, 0.35));
    base.addColorStop(1, css(primary, 0));
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.arc(mid, mid, mid, 0, Math.PI * 2);
    ctx.fill();

    // Tangential streaks — arcs, never radial lines: the smear of a rotating
    // silhouette runs along the direction of motion.
    for (let i = 0; i < 110; i++) {
      const r = (0.2 + Math.random() * 0.75) * mid;
      const a0 = Math.random() * Math.PI * 2;
      const sweep = 0.35 + Math.random() * 1.6;
      const pick = Math.random();
      const colour = pick < 0.4 ? 0xffffff : pick < 0.72 ? primary : secondary;
      ctx.strokeStyle = css(colour, 0.12 + Math.random() * 0.3);
      ctx.lineWidth = 1 + Math.random() * 3.2;
      ctx.beginPath();
      ctx.arc(mid, mid, r, a0, a0 + sweep);
      ctx.stroke();
    }

    // The glowing rim. The reference draws the blur as a disc *bounded* by a
    // hot edge; without it the streaks read as smoke.
    ctx.strokeStyle = css(0xffffff, 0.85);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(mid, mid, mid * 0.9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = css(primary, 0.55);
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.arc(mid, mid, mid * 0.86, 0, Math.PI * 2);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Colours are the LAYER DESIGN's, not the skin's: the blur disc is the drawn
 * stand-in for the bey itself, and Valtryek blurred is still blue-and-red no
 * matter whose hand threw it. Ownership colour stays on the trail and aura.
 */
export function buildSpinBlur(primary: number, secondary: number, radius: number): SpinBlur {
  const geo = new THREE.CircleGeometry(radius * 1.15, 48);
  // Flat, facing up: the camera sits ~34° above horizontal, so the top face is
  // the most visible surface and the disc must present to it.
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshBasicMaterial({
    map: blurTexture(primary, secondary),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  // An inverted-hull outline around a transparent disc paints a black plate
  // over the very top it replaces.
  noOutline(mat);

  const mesh = new THREE.Mesh(geo, mat);
  // Just above the layer's sticker face (top of the squat toon stack sits at
  // r·1.15). Any higher and the disc reads as a UFO hovering over the top
  // rather than the top itself — measured on screen before this was lowered.
  mesh.position.y = radius * 1.25;
  // Above dish and ribbons, below sparks.
  mesh.renderOrder = 2;
  mesh.visible = false;

  return {
    mesh,
    update(spinNorm: number, dt: number): number {
      const k = Math.min(1, Math.max(0, (spinNorm - 0.55) / 0.35));
      mat.opacity = k * 0.92;
      mesh.visible = k > 0.002;
      // The parent group already spins at the sim's angle; the extra counter-
      // rotation keeps the streaks shimmering even when that spin aliases
      // against the frame rate.
      mesh.rotation.y -= dt * 21;
      return k;
    },
  };
}
