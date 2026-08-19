import { designByLayer } from './beydex';
import type { BladeStyle } from './beydex';
import { registryClassic } from './beys/registry';

/**
 * The classicdex: Classic's own design set, independent of the beydex.
 *
 * WHY A SECOND FILE RATHER THAN MORE FIELDS ON BeyDesign. The beydex is the
 * *anime* asset library — researched against the source material, and owned as
 * such. Classic was pointed at it in 79f5100 so that swapping beys would change
 * more than the blade count, and that part worked; what came with it was that
 * Classic inherited anime identity wholesale, which is not what this theme is
 * for. Classic is the clean, technical, mechanical look: it should be allowed
 * its own palettes and its own cuts.
 *
 * WHY THIS SHAPE. The classic mesh path reads exactly four of BeyDesign's ~14
 * fields — primary, secondary, accent, blade. motif / letter / chip / crest /
 * underRing / surface / metal / spinDir are all anime *construction*: sticker
 * faces, translucent under-rings, moulded wave caps, raised crests. Classic has
 * none of those (its layer is one extruded solid with a cone boss on top), so
 * copying them here would be dead data that silently rots. A ClassicDesign is
 * therefore those four fields plus a name.
 *
 * WHY IT KEYS ON layerId AND NOTHING ELSE. Radius, blade count and every stat
 * stay with the sim's LAYERS table. Nothing here can move a hitbox, a mass or
 * an archetype, so balance, the AI preset pool and the collision model are
 * provably untouched by anything in this file — it is paint and profile only.
 *
 * WHY MOST ENTRIES ARE MISSING. `classicByLayer` falls back to the beydex
 * entry, so Classic diverges one design at a time. Anything not authored here
 * keeps rendering exactly as it does today; the four player-designed beys
 * (crossx / phoenix / leon / drake) are deliberately left on fallback because
 * those are the owner's own reference art and are not ours to reinterpret.
 */
export interface ClassicDesign {
  /** Matches the sim layer id. */
  layerId: string;
  /**
   * Shared with the anime set on purpose. Blade count comes from the sim and
   * the name comes from here, so a player still recognises which layer they
   * are looking at across a theme switch — only the palette and the cut move.
   */
  name: string;
  /** Dominant body colour. Classic renders this as MeshStandardMaterial. */
  primary: number;
  /** The disc's colour. */
  secondary: number;
  /** Centre boss and its ring — the layer's hardware colour. */
  accent: number;
  blade: BladeStyle;
  /**
   * Per-design override of `CLASSIC.layerScale` (see beyMesh.ts).
   *
   * The near-circular designs need it. Measured at the shared 0.94, Fafnir and
   * Aegis cover 0.741 and 0.775·pi·r^2 in plan view against 0.485–0.643 for
   * every bladed layer, because a shield IS mostly disc — so on screen they
   * read a size class above the attackers even though Fafnir's collision radius
   * (0.0988) is the *smallest* in the game. Pulling both to 0.90 brings them to
   * 0.679 and 0.711 and puts the visual ordering back with the stats.
   */
  layerScale?: number;
}

/**
 * The divergent designs. Palette direction: machined and industrial — anodised
 * steel, gunmetal, brass, cast iron — against the anime set's saturated toy
 * plastic. Classic lights with real metalness/roughness rather than cel bands,
 * so it is the one theme where a genuinely metallic palette pays off; the same
 * hexes under the toon ramp would flatten into grey.
 *
 * Each keeps a thread back to its anime counterpart (Valtryek stays blue,
 * Fafnir stays gold-and-teal) so the two sets read as the same roster in two
 * finishes rather than as two unrelated rosters.
 */
// Derived from the per-bey registry — see beys/registry.ts. Only entries that
// authored a classic design appear; the rest fall back to the anime palette.
export const CLASSIC_DEX: ClassicDesign[] =  registryClassic();

/**
 * Everything not authored above keeps its anime palette and cut. Deliberately
 * lossy: only the four fields Classic actually reads cross over, so a fallback
 * entry is indistinguishable from a hand-written one downstream and adding one
 * later is a pure addition to CLASSIC_DEX.
 */
const fallbackFromBeydex = (layerId: string): ClassicDesign => {
  const d = designByLayer(layerId);
  return {
    layerId: d.layerId,
    name: d.canonName,
    primary: d.primary,
    secondary: d.secondary,
    accent: d.accent,
    blade: d.blade,
  };
};

export const classicByLayer = (layerId: string): ClassicDesign =>
  CLASSIC_DEX.find((d) => d.layerId === layerId) ?? fallbackFromBeydex(layerId);
