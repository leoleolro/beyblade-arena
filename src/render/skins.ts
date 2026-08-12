import * as THREE from 'three';
import { metalToonMaterial, toonMaterial } from './toon';

/**
 * Skins: purely cosmetic, and deliberately so.
 *
 * Nothing here touches a single stat. A skin that changed gameplay would turn
 * "which top do I like" into "which top wins", and the part triangle is where
 * that decision is supposed to live.
 *
 * The real job of this file is *identification*. The ownership markers this
 * replaces — a fixed cyan ring under your top — were a crutch: they told you
 * which top was yours without the top itself being recognisable. Skins fix the
 * underlying problem, but only if the two tops actually look different, which is
 * why `pickContrastingSkin` exists. Letting both sides run similar palettes
 * would put the confusion straight back.
 */

export type Finish = 'chrome' | 'matte' | 'glass' | 'carbon' | 'neon';

export interface Skin {
  id: string;
  name: string;
  /** Main body colour, and what the HUD swatch and trail use. */
  primary: number;
  /** Secondary colour for the disc. */
  secondary: number;
  finish: Finish;
  /** Hue in degrees, precomputed for the contrast check. */
  hue: number;
}

const hueOf = (hex: number): number => {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return hsl.h * 360;
};

const make = (
  id: string,
  name: string,
  primary: number,
  secondary: number,
  finish: Finish,
): Skin => ({ id, name, primary, secondary, finish, hue: hueOf(primary) });

/** Hues are spread around the wheel so any two picks can be told apart. */
export const SKINS: Skin[] = [
  make('frost', 'Frost', 0x38bdf8, 0xd6ecff, 'glass'),
  make('ember', 'Ember', 0xf9531b, 0x7c2d12, 'chrome'),
  make('venom', 'Venom', 0x22c55e, 0x064e3b, 'neon'),
  make('void', 'Void', 0x8b5cf6, 0x1e1b30, 'carbon'),
  make('solar', 'Solar', 0xfacc15, 0x78350f, 'chrome'),
  make('rose', 'Rose', 0xec4899, 0x4c0519, 'matte'),
];

export const skinById = (id: string): Skin =>
  SKINS.find((s) => s.id === id) ?? SKINS[0];

/** Shortest distance between two hues, in degrees (0–180). */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * The skin furthest in hue from the one given. This is what makes markers
 * unnecessary: the rival is guaranteed to be a different colour family, so the
 * two tops are distinguishable at a glance even mid-clash.
 */
export function pickContrastingSkin(playerSkin: Skin): Skin {
  let best = SKINS[0];
  let bestDist = -1;
  for (const s of SKINS) {
    if (s.id === playerSkin.id) continue;
    const d = hueDistance(s.hue, playerSkin.hue);
    if (d > bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

/** Build the material for a part, given the skin's finish. */
export function skinMaterial(
  skin: Skin,
  colour: number,
  opts: { emissiveBoost?: number; toon?: boolean; metal?: boolean } = {},
): THREE.Material {
  const boost = opts.emissiveBoost ?? 1;

  // Cel shading overrides the finish entirely. A chrome or glass *material*
  // under toon lighting just looks like a bug — the point of the toon theme is
  // that every surface reads as flat bands, so the finish becomes irrelevant
  // and only the colour survives.
  if (opts.toon) {
    const emissive = skin.finish === 'neon' ? 0.35 : 0.12;
    // `metal` marks the bare-metal designs, whose walls are brushed steel
    // rather than moulded plastic. The finish still decides the emissive lift,
    // so a neon skin on a metal layer stays a neon metal layer.
    return opts.metal
      ? metalToonMaterial(colour, { emissive, gloss: 34, specular: 0.3, rim: 0.32 })
      : toonMaterial(colour, emissive);
  }

  switch (skin.finish) {
    case 'chrome':
      return new THREE.MeshStandardMaterial({
        color: colour,
        metalness: 1,
        roughness: 0.12,
        emissive: new THREE.Color(colour).multiplyScalar(0.06 * boost),
      });

    case 'matte':
      return new THREE.MeshStandardMaterial({
        color: colour,
        metalness: 0.08,
        roughness: 0.88,
        emissive: new THREE.Color(colour).multiplyScalar(0.05 * boost),
      });

    case 'carbon':
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color(colour).multiplyScalar(0.55),
        metalness: 0.55,
        roughness: 0.55,
        emissive: new THREE.Color(colour).multiplyScalar(0.14 * boost),
      });

    case 'neon':
      return new THREE.MeshStandardMaterial({
        color: colour,
        metalness: 0.3,
        roughness: 0.35,
        // Strong self-illumination is this finish's whole identity — it stays
        // readable even when the top is on the dark far side of the dish.
        emissive: new THREE.Color(colour).multiplyScalar(0.62 * boost),
      });

    case 'glass':
      return new THREE.MeshPhysicalMaterial({
        color: colour,
        metalness: 0.1,
        roughness: 0.08,
        transmission: 0.55,
        thickness: 0.6,
        transparent: true,
        opacity: 0.92,
        emissive: new THREE.Color(colour).multiplyScalar(0.14 * boost),
      });
  }
}
