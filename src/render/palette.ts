/**
 * Chip palette helpers, shared by the design catalog and the beast marks.
 *
 * Their own module for one structural reason: `emblems.ts` and `beydex.ts` both
 * need them, and if either owned them the other would have to import a VALUE
 * across — which closes the runtime cycle
 * `beydex -> beys/registry -> beys/* -> emblems` that this split exists to
 * break. A leaf module with no imports of its own cannot participate in a cycle.
 */

export const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** Cel tint toward white — flat shading needs sibling tones, not gradients. */
export const lighten = (c: number, f: number): string => {
  const ch = (v: number): number => Math.round(v + (255 - v) * f);
  return `rgb(${ch((c >> 16) & 0xff)}, ${ch((c >> 8) & 0xff)}, ${ch(c & 0xff)})`;
};

// Fixed chip-hardware colours: the bezel and dark face must match across the
// whole product line, so they cannot come from any one design's palette.
export const CHIP_GOLD = '#e0b23c';
export const CHIP_GOLD_DEEP = '#8a6a1c';
export const DARK_FACE = '#141317';
// Drakehead's lower flame lobe is canonically ember orange on every design.
export const EMBER = '#ff7a2e';
