import { CLASSIC, bladeSilhouette } from './beyMesh';
import { beastEmblem, designByLayer } from './beydex';
import { classicByLayer } from './classicdex';
import { LAYERS } from '../sim/parts';

/**
 * A bey drawn flat, for the picker.
 *
 * Ten designs now differ in silhouette, tiering, surface hardware and palette,
 * and none of that was visible at the one moment it should matter — the picker
 * represented each as a text chip with a colour dot, so choosing a bey was
 * choosing a *name*.
 *
 * Deliberately Canvas2D rather than a WebGL preview per chip. Ten live
 * renderers would blow through the browser's ~16 context limit on its own, and
 * the plan view is the honest one anyway: it is the angle the blade profile
 * actually reads from, and the angle the battle camera mostly shows.
 *
 * The silhouette is the *same* `bladeSilhouette` the mesh is extruded from,
 * sampled with `Shape.getPoints`, so a thumbnail cannot drift from the model it
 * advertises. That shared source is the whole point: a preview that is drawn
 * separately is a second implementation of the design, and it will be wrong
 * eventually.
 */

/** Sampled outline of a silhouette, in canvas pixels, centred on the origin. */
function tracePath(
  ctx: CanvasRenderingContext2D,
  blades: number,
  radius: number,
  style: Parameters<typeof bladeSilhouette>[2],
  rotate: number,
): void {
  // Shape space is unit-radius here, so the sample count only has to satisfy
  // the curviest grammar rather than scale with the drawn size.
  const pts = bladeSilhouette(blades, 1, style).getPoints(24 * blades);
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const a = Math.atan2(pts[i].y, pts[i].x) + rotate;
    const r = Math.hypot(pts[i].x, pts[i].y) * radius;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Which design set the chip should advertise. */
export type ThumbTheme = 'anime' | 'classic';

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/**
 * Draw one bey's plan view.
 *
 * Painted in the same order the mesh is stacked — under-ring tier, blade tier,
 * accent ring, chip — because that ordering is what makes the tiering read.
 * The under-ring carries the same half-blade-step stagger the mesh uses, so a
 * thumbnail shows the under-blades filling the upper tier's cutaways exactly
 * as the model does.
 */
export function drawBeyThumb(
  canvas: HTMLCanvasElement,
  layerId: string,
  size = 72,
  theme: ThumbTheme = 'anime',
): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const blades = LAYERS.find((l) => l.id === layerId)?.blades ?? 3;

  ctx.setTransform(dpr, 0, 0, dpr, (size * dpr) / 2 / dpr, (size * dpr) / 2 / dpr);
  ctx.clearRect(-size, -size, size * 2, size * 2);

  // Leaves room for the ink line without the outline clipping at the edge.
  const R = size * 0.44;
  const ink = '#0a0a12';

  if (theme === 'classic') {
    drawClassicThumb(ctx, layerId, blades, R, size, ink);
    return;
  }

  const design = designByLayer(layerId);

  // Under-ring tier: a blunter cut of the same grammar, staggered half a blade
  // step so its blades sit in the upper tier's gaps.
  if (design.underRing !== undefined) {
    tracePath(
      ctx,
      blades,
      R * 0.97,
      {
        root: Math.min(0.92, design.blade.root + 0.1),
        belly: design.blade.belly * 0.7,
        cut: design.blade.cut * 0.5,
        edge: design.blade.edge,
      },
      Math.PI / blades,
    );
    ctx.fillStyle = hex(design.underRing);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = size * 0.022;
    ctx.stroke();
  }

  // Blade tier.
  tracePath(ctx, blades, R, design.blade, 0);
  ctx.fillStyle = hex(design.primary);
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = size * 0.03;
  ctx.stroke();

  // Metal designs get a lighter inner wash, standing in for the banded
  // highlight the mesh gets from the cel-metal shader.
  if (design.metal) {
    ctx.save();
    ctx.clip();
    const g = ctx.createLinearGradient(-R, -R, R * 0.4, R);
    g.addColorStop(0, 'rgba(255,255,255,0.42)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = g;
    ctx.fillRect(-R, -R, R * 2, R * 2);
    ctx.restore();
  }

  // Accent ring — the layer's jewellery, and the fastest read of which
  // colour family a design belongs to.
  ctx.strokeStyle = hex(design.accent);
  ctx.lineWidth = size * 0.035;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.56, 0, Math.PI * 2);
  ctx.stroke();

  // Centre chip, at the same relative scale the mesh uses for each treatment.
  const chip = beastEmblem(design, 128);
  const cs = R * (design.chip === 'dark' ? 0.92 : 1.16);
  ctx.drawImage(chip, -cs / 2, -cs / 2, cs, cs);
}

/**
 * The Classic plan view.
 *
 * A separate painter rather than a palette swap, because the two themes build
 * genuinely different objects and a chip that shows anime construction for a
 * top rendered in classic construction is lying to the player at the exact
 * moment they are choosing. Classic has no under-ring tier, no sticker face and
 * no beast emblem — its layer is one extruded solid with a faceted cone boss —
 * so what shows through the blade cutaways is the DISC, and the centre is
 * hardware, not a crest.
 *
 * Proportions come from `CLASSIC` in beyMesh, so the chip tracks the mesh.
 */
function drawClassicThumb(
  ctx: CanvasRenderingContext2D,
  layerId: string,
  blades: number,
  R: number,
  size: number,
  ink: string,
): void {
  const design = classicByLayer(layerId);
  const ds = CLASSIC.discScale;
  const facets = Math.max(6, blades * 2);

  const polygon = (radius: number, sides: number, turn: number): void => {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2 + turn;
      const x = Math.cos(a) * radius;
      const y = Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

  // The disc, seen through the layer's undercuts — the six flat facets are the
  // mesh's own six radial segments.
  polygon(R * 0.88 * ds, 6, Math.PI / 6);
  ctx.fillStyle = hex(design.secondary);
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = size * 0.022;
  ctx.stroke();

  // The layer, at the same scale the extrude uses.
  tracePath(ctx, blades, R * (design.layerScale ?? CLASSIC.layerScale), design.blade, 0);
  ctx.fillStyle = hex(design.primary);
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = size * 0.03;
  ctx.stroke();

  // Boss ring, then the boss cone's own facet count on top of it: from directly
  // above that is exactly what the two accent meshes project to.
  ctx.strokeStyle = hex(design.accent);
  ctx.lineWidth = size * 0.03;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.375, 0, Math.PI * 2);
  ctx.stroke();

  polygon(R * 0.36, facets, 0);
  ctx.fillStyle = hex(design.accent);
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = size * 0.022;
  ctx.stroke();
}

/** Convenience: a ready-made canvas element for a layer. */
export function beyThumb(
  layerId: string,
  size = 72,
  theme: ThumbTheme = 'anime',
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'bey-thumb';
  drawBeyThumb(canvas, layerId, size, theme);
  return canvas;
}
