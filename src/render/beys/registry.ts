import type { BeyDesign } from '../beydex';
import type { ClassicDesign } from '../classicdex';

/**
 * One beyblade, in one file.
 *
 * WHY THIS EXISTS. Registering a beyblade used to mean editing four hand-kept
 * parallel lists — `BEYDEX` and `BEY_PRESETS` in beydex.ts, `CLASSIC_DEX` in
 * classicdex.ts, and the ladder's `unlocks` — plus the stat row in
 * `sim/parts.ts`. Measured on the two most recent additions, that was four to
 * six files, and nothing caught a half-registration: a bey with stats but no
 * design, or a design with no preset, simply rendered wrong at runtime.
 *
 * Now the art half of a beyblade is one module under `beys/`, and the four
 * lists are *projections* of the registry rather than sources of truth.
 *
 * WHY THE STATS STAY IN `sim/parts.ts` AND ARE NOT IN HERE. `src/sim/` must
 * never import from `src/render/`; that boundary is what lets the balance suite
 * sweep thousands of matches headlessly. A single combined entry would drag the
 * whole renderer into the sim's import graph. So a beyblade is deliberately two
 * halves joined by `id` — and `registry.test.ts` fails the build if the halves
 * ever disagree, which is the safety net the old parallel lists never had.
 */
export interface BeyEntry {
  /** Must match a `LayerPart.id` in `sim/parts.ts`. Pinned by the registry test. */
  id: string;
  /** Full cel-shaded design: palette, silhouette grammar, emblem, chip, tiers. */
  anime: BeyDesign;
  /**
   * Optional non-toon design. Absent means the classic themes fall back to the
   * anime palette — deliberately lossy, and a pure addition whenever someone
   * wants to author one.
   */
  classic?: ClassicDesign;
  /**
   * Optional whole-top preset for the garage picker: the disc, driver, spin and
   * skin this bey is canonically built with.
   */
  preset?: {
    name: string;
    discId: string;
    driverId: string;
    spinDir: 1 | -1;
    skinId: string;
  };
}

import { entry as valtryek } from './valtryek';
import { entry as ragnaruk } from './ragnaruk';
import { entry as spryzen } from './spryzen';
import { entry as luinor } from './luinor';
import { entry as fafnir } from './fafnir';
import { entry as aegis } from './aegis';
import { entry as crossx } from './crossx';
import { entry as phoenix } from './phoenix';
import { entry as leon } from './leon';
import { entry as drake } from './drake';
import { entry as nosferu } from './nosferu';

/**
 * Every beyblade, in catalog order.
 *
 * Adding one is: create `beys/<id>.ts`, add its stat row to `sim/parts.ts`, and
 * add two lines here. Nothing else in the engine changes — the emblem is a
 * function on the entry (see `EmblemDraw`), so there is no union to widen and
 * no switch to extend.
 */
export const BEY_REGISTRY: BeyEntry[] = [
  valtryek,
  ragnaruk,
  spryzen,
  luinor,
  fafnir,
  aegis,
  crossx,
  phoenix,
  leon,
  drake,
  nosferu,
];

/** The anime design set — the projection beydex.ts used to hand-maintain. */
export const registryDesigns = (): BeyDesign[] => BEY_REGISTRY.map((b) => b.anime);

/** The classic design set. Only the entries that authored one. */
export const registryClassic = (): ClassicDesign[] =>
  BEY_REGISTRY.map((b) => b.classic).filter((c): c is ClassicDesign => c !== undefined);

/** The garage's whole-top presets, for the entries that declare one. */
export const registryPresets = (): {
  name: string;
  layerId: string;
  discId: string;
  driverId: string;
  spinDir: 1 | -1;
  skinId: string;
}[] =>
  BEY_REGISTRY.flatMap((b) =>
    b.preset ? [{ layerId: b.id, ...b.preset }] : [],
  );
