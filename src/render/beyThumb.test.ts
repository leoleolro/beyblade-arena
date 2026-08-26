import { describe, expect, it, beforeEach } from 'vitest';
import { THUMB_CACHE_LIMIT, __thumbStats, beyThumb } from './beyThumb';

/**
 * The roster has to survive a hundred beyblades.
 *
 * Stated by the owner as a constraint on the architecture: "The architecture of
 * the game should support up to 100 beyblades in the future. without affecting
 * the games performance."
 *
 * Measured, the binding cost was not the sim or the 3D scene — it was these
 * thumbnails. `drawBeyThumb` paints a real illustration at 2.52 ms, the garage
 * repaints every bey in the roster on every part click, and a hundred beys
 * projected to a quarter-second freeze per click.
 *
 * The cache fixed that, and then the cache's own sizing became the risk. These
 * tests guard the property that makes it work rather than the speed, because
 * speed is machine-dependent and the property is not.
 */

/** A no-op 2D canvas; the suite runs in node. See spinBlur.test.ts. */
function stubCanvas(): void {
  if (typeof document !== 'undefined') return;
  const ctx = new Proxy(
    {},
    {
      get: (_t, key) => {
        if (key === 'canvas') return { width: 256, height: 256 };
        return () => ({
          addColorStop: () => undefined,
          data: new Uint8ClampedArray(256 * 256 * 4),
          width: 256,
          height: 256,
        });
      },
      set: () => true,
    },
  );
  const make = (): unknown => ({ width: 0, height: 0, style: {}, getContext: () => ctx });
  (globalThis as unknown as { document: unknown }).document = { createElement: make };
  (globalThis as unknown as { window: unknown }).window = { devicePixelRatio: 2 };
}

stubCanvas();

const ids = (n: number, tag: string): string[] =>
  Array.from({ length: n }, (_, i) => `${tag}-${i}`);

describe('thumbnail cache', () => {
  beforeEach(() => {
    __thumbStats.paints = 0;
    __thumbStats.hits = 0;
  });

  it('paints a bey once and blits it thereafter', () => {
    const roster = ids(8, 'once');
    for (const id of roster) beyThumb(id, 64, 'anime');
    expect(__thumbStats.paints).toBe(8);

    for (let pass = 0; pass < 5; pass++) {
      for (const id of roster) beyThumb(id, 64, 'anime');
    }
    // Five more passes, no further painting.
    expect(__thumbStats.paints).toBe(8);
    expect(__thumbStats.hits).toBe(40);
  });

  it('serves every requested size from one master', () => {
    // The three callers ask for 56, 64 and 72. Caching per requested size would
    // have the roster and the shop evicting each other over the same bey.
    beyThumb('sizes', 56, 'anime');
    expect(__thumbStats.paints).toBe(1);
    beyThumb('sizes', 64, 'anime');
    beyThumb('sizes', 72, 'anime');
    expect(__thumbStats.paints).toBe(1);
  });

  it('does not thrash on a hundred-bey roster', () => {
    // THE ONE THAT MATTERS. A cache smaller than a single render pass evicts
    // each entry just before it is next needed and hits roughly never — the
    // classic LRU sequential-scan pathology. It is invisible from outside: same
    // pictures, no error, just no speed-up. This is the earlier 48-entry
    // version's actual behaviour and the reason the limit is what it is.
    const roster = ids(100, 'hundred');
    for (const id of roster) beyThumb(id, 64, 'anime');
    const afterFirst = __thumbStats.paints;
    expect(afterFirst).toBe(100);

    for (const id of roster) beyThumb(id, 64, 'anime');
    // Second full pass over the same hundred: everything still cached.
    expect(__thumbStats.paints).toBe(afterFirst);
    expect(__thumbStats.hits).toBe(100);
  });

  it('has room for the target roster', () => {
    // Stated as a relationship, not a number, so raising the roster target
    // fails here rather than silently degrading to a thrash.
    expect(THUMB_CACHE_LIMIT).toBeGreaterThan(100);
  });

  it('stays bounded when pushed well past the limit', () => {
    // The other half: it must not be an unbounded Map. A hundred beys of canvas
    // is already ~8 MB of backing store at dpr 2.
    for (const id of ids(THUMB_CACHE_LIMIT * 2, 'flood')) beyThumb(id, 64, 'anime');
    __thumbStats.hits = 0;
    // The earliest keys should have been evicted, so they repaint.
    beyThumb('flood-0', 64, 'anime');
    expect(__thumbStats.hits).toBe(0);
  });
});
