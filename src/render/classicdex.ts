import { designByLayer } from './beydex';
import type { BladeStyle } from './beydex';

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
export const CLASSIC_DEX: ClassicDesign[] = [
  {
    layerId: 'valtryek',
    name: 'Valtryek',
    // Anodised steel-blue over brushed grey, chrome hardware. The anime one is
    // toy blue with a red sticker; this one is a machined part.
    primary: 0x2b5f8f,
    secondary: 0x8a939c,
    accent: 0xd8dee6,
    // Harder than the anime cut: less belly (a machined edge does not swell),
    // deeper undercut, lower root — a three-tooth cutter rather than a wing.
    blade: { root: 0.52, belly: 0.82, cut: 1.3, edge: 'blade' },
  },
  {
    layerId: 'ragnaruk',
    name: 'Ragnaruk',
    // Burnt copper on cast iron with brass hardware.
    primary: 0xa35a24,
    secondary: 0x3a3f45,
    accent: 0xe0a355,
    // The anime Ragnaruk is a pair of flame licks. Classic reads it as what a
    // two-blade attacker is mechanically: a counterweighted bar with two hard
    // points. Same blade count, opposite grammar.
    blade: { root: 0.5, belly: 0.9, cut: 1.15, edge: 'blade' },
  },
  {
    layerId: 'luinor',
    name: 'Luinor',
    // Titanium white with a cyan indicator accent — the cold end of the set.
    primary: 0xdfe4ea,
    secondary: 0x4a5560,
    accent: 0x6fcfe4,
    // Still a claw, but a milled one: the barb keeps its curl, the belly comes
    // in and the undercut goes deeper so the recoil reads as ratchet teeth.
    blade: { root: 0.54, belly: 0.95, cut: 1.3, edge: 'hook' },
  },
  {
    layerId: 'fafnir',
    name: 'Fafnir',
    // Keeps the gold-and-teal identity, in aged brass rather than toy gold.
    primary: 0xb08d2f,
    secondary: 0x2f333a,
    accent: 0x2ec4b6,
    // The single biggest divergence in the set, and the one that most earns the
    // file. The anime Fafnir is a smooth scalloped spin-steal shield — no
    // corners anywhere by construction. Classic cuts the same near-round mass
    // as a gear: high root, shallow belly, `blade` grammar, so the profile is a
    // ring of six flat-topped teeth.
    blade: { root: 0.84, belly: 0.42, cut: 0.34, edge: 'blade' },
    layerScale: 0.9,
  },
  {
    layerId: 'aegis',
    name: 'Aegis',
    // Gunmetal plate over slate, with a mint indicator — the only cool accent
    // that survives from the anime entry.
    primary: 0x8d959d,
    secondary: 0x3d4650,
    accent: 0x5fd0b0,
    // Eight bolted armour facets instead of eight scallops. Same defensive
    // near-circle, faceted rather than moulded.
    blade: { root: 0.88, belly: 0.36, cut: 0.26, edge: 'blade' },
    layerScale: 0.9,
  },
];

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
