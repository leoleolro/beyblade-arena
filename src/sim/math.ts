/** Minimal 2D vector math + deterministic RNG for the battle simulation. */

export interface Vec2 {
  x: number;
  y: number;
}

export const vec = (x = 0, y = 0): Vec2 => ({ x, y });

export const len = (v: Vec2): number => Math.hypot(v.x, v.y);

export const lenSq = (v: Vec2): number => v.x * v.x + v.y * v.y;

export function norm(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.y);
  return l < 1e-9 ? vec(0, 0) : vec(v.x / l, v.y / l);
}

/** Rotate 90 degrees counter-clockwise. */
export const perp = (v: Vec2): Vec2 => vec(-v.y, v.x);

export function rotate(v: Vec2, radians: number): Vec2 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return vec(v.x * c - v.y * s, v.x * s + v.y * c);
}

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export const clamp = (n: number, lo: number, hi: number): number =>
  n < lo ? lo : n > hi ? hi : n;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * mulberry32 — small, fast, seedable PRNG. The sim must be reproducible from a
 * seed so replays and (later) networked play agree on the outcome.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
