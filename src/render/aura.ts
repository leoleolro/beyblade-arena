import * as THREE from 'three';

/**
 * The energy aura around a top.
 *
 * The single strongest anime signal available here. In the medium a fighter's
 * power is drawn *around* them, not on them — a glow that swells as they wind up
 * and flares on impact. The tops already carry the state this needs (spin and
 * hitFlash), so the aura is pure presentation over numbers that exist.
 *
 * Built as a camera-facing sprite with a procedurally generated radial gradient.
 * The texture is generated once and shared across every aura, because it is
 * tinted per-instance through the material colour rather than baked in — a
 * texture per top would be a pointless upload for identical pixels.
 */

let sharedTexture: THREE.Texture | null = null;

/**
 * A soft radial falloff with a hot core, drawn to an offscreen canvas.
 *
 * Procedural rather than an image file: the CSP blocks external assets, and a
 * gradient is cheaper to generate than to download anyway.
 */
function auraTexture(): THREE.Texture {
  if (sharedTexture) return sharedTexture;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    // Hot centre, long soft tail. The mid stops matter more than the ends —
    // a linear falloff reads as fog, this reads as energy.
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  sharedTexture = new THREE.CanvasTexture(canvas);
  return sharedTexture;
}

export interface Aura {
  sprite: THREE.Sprite;
  /** Drive from spin and hit flash each frame. */
  update(spinNorm: number, hitFlash: number, radius: number, boost: number): void;
  /**
   * Overall opacity multiplier, set from the theme.
   *
   * Exists because "frames the top, never replaces it" was true only in a
   * theme with no bloom behind it. This sprite is additive, about three times
   * the top's diameter, and has a hot near-opaque core; run that through
   * Overdrive's bloom pass and the core clears the threshold, blooms outward,
   * and swallows the top it was drawn around — reported as a glowing blob you
   * could not see the beyblade inside.
   *
   * Same lesson as the posts, the rail and the metal exposure: in the theme
   * that already glows, the individual glowing things have to give ground.
   */
  setStrength(strength: number): void;
}

export function buildAura(colour: number): Aura {
  const material = new THREE.SpriteMaterial({
    map: auraTexture(),
    color: colour,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    // Otherwise the aura is clipped by the dish it is sitting on.
    depthTest: false,
  });

  let strength = 1;

  const sprite = new THREE.Sprite(material);
  // Draw BEFORE the tops, not after. With depthTest off (needed so the dish
  // doesn't clip it) a late render order painted the aura straight over the
  // bey and washed out the thing it was supposed to be framing. Anime puts the
  // energy behind the fighter.
  sprite.renderOrder = -1;

  return {
    sprite,
    update(spinNorm: number, hitFlash: number, radius: number, boost: number): void {
      // Swells with remaining spin, flares on contact, and swells again while a
      // move is active — so the aura reads as "how much fight is left in this".
      const energy = 0.3 + spinNorm * 0.4 + hitFlash * 0.8 + boost * 0.4;
      const scale = radius * (2.2 + spinNorm * 0.7 + hitFlash * 1.6 + boost * 0.9);
      sprite.scale.set(scale, scale, 1);
      // Capped well below opaque: the aura frames the top, it never replaces it.
      material.opacity = Math.min(0.5, energy * 0.34) * strength;
    },
    setStrength(s: number): void {
      strength = s;
    },
  };
}
