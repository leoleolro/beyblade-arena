/**
 * The manga impact frame: a full-screen cut to radial burst lines on a heavy
 * clash.
 *
 * DOM, not WebGL, on purpose: the frame is a *cut* — it must cover the whole
 * screen, appear on one frame and vanish ~0.18s later with no fade tail
 * (anime cuts, it does not fade), and none of that wants to live in the render
 * loop. The wedges are regenerated per hit so no two frames are the same
 * drawing; heavy clashes are rare enough that the allocation is irrelevant.
 */
export class ImpactFrame {
  private layer: HTMLElement | null = null;

  /** Screen position of the clash in percent (0–100 each axis). */
  trigger(xPct: number, yPct: number, inked = true): void {
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

    const wedges: string[] = [];
    const count = 40;
    for (let i = 0; i < count; i++) {
      // Irregular by construction — jittered angle, width and inner radius. A
      // perfectly regular burst reads as a loading spinner.
      const a = ((i + Math.random() * 0.8) / count) * Math.PI * 2;
      const half = (0.25 + Math.random() * 1.1) * (Math.PI / count);
      const inner = 14 + Math.random() * 13;
      // Beyond any corner of the stretched 100×100 box, so every wedge is
      // anchored off-screen regardless of aspect.
      const outer = 170;
      const ax = cx + Math.cos(a) * inner;
      const ay = cy + Math.sin(a) * inner;
      const bx = cx + Math.cos(a - half) * outer;
      const by = cy + Math.sin(a - half) * outer;
      const dx = cx + Math.cos(a + half) * outer;
      const dy = cy + Math.sin(a + half) * outer;
      wedges.push(
        `<polygon points="${ax.toFixed(1)},${ay.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)} ${dx.toFixed(1)},${dy.toFixed(1)}"/>`,
      );
    }

    const el = document.createElement('div');
    el.className = 'impact-frame';
    // preserveAspectRatio="none" stretches the square space to the viewport;
    // the distortion is invisible on shapes this irregular and it keeps the
    // percent coordinates honest.
    el.innerHTML =
      `<svg viewBox="0 0 100 100" preserveAspectRatio="none">` +
      `<g fill="#ffffff"${inked ? ' stroke="#0a0a12" stroke-width="0.5"' : ''}>` +
      wedges.join('') +
      `</g></svg>`;
    this.layer.appendChild(el);
    window.setTimeout(() => el.remove(), 180);
  }
}
