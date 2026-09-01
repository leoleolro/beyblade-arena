import { bearEmblem } from '../emblems';
import type { BeyEntry } from './registry';

/**
 * Savage Bear — the light defender.
 *
 * Source: beyblade.fandom.com/wiki/Blade_-_Savage_Bear (Japanese: BearScratch).
 * Defense Type, **A25 / D45 / S30**, 29.6 g — "a round four-sided Defense Type
 * Blade. The plastic components of Savage Bear are identical to those of
 * RhinoHorn, and the metal component is nearly identical."
 *
 * 29.6 g MAKES IT THE LIGHTEST DEFENDER IN THE GAME by seven grams, and the
 * mass mapping puts it at 0.408 — below the 0.44 that WizardArrow's 31.8 g
 * anchors. That is not out of range, it is the point: a defence blade this
 * light gets moved by hits the heavy defenders shrug off, and its D45 is the
 * lowest of the five defenders to match. It defends by being round, not by
 * being immovable.
 *
 * "ROUND FOUR-SIDED" IS HELLSSCYTHE'S EXACT WORDING, so it takes HellsScythe's
 * 0.15 rather than the 0.30 the plainly-circular blades get. The catalogue
 * treats the adjective as the evidence, so identical phrasing has to produce
 * an identical value or the rule is not a rule.
 *
 * SHARES A MOLD WITH RHINOHORN, which the source states outright — so the
 * silhouette here is deliberately RhinoHorn's grammar with the corners rounded
 * off, rather than a new shape invented for a new name.
 *
 * Gear Chip: not described on its page — the Description is two sentences about
 * which other Blade shares its mold. `bearEmblem` is therefore drawn from the
 * NAME, and says so at the top of the function. That distinction matters: an
 * invented beast mark is a design decision, not a decoration.
 */
export const entry: BeyEntry = {
  id: 'savagebear',
  anime: {
    layerId: 'savagebear',
    canonName: 'Savage Bear',
    primary: 0xb9a48c,
    secondary: 0x8a5a33,
    accent: 0xd9a05b,
    emblem: bearEmblem,
    letter: 'B',
    spinDir: 1,
    metal: true,
    chip: 'dark',
    underRing: 0x8a5a33,
    // Round four-sided: high root so the circle survives, four broad swells,
    // and a cut deep enough that you can still count them.
    blade: { root: 0.85, belly: 0.3, cut: 0.22, edge: 'wave' },
  },
  preset: {
    name: 'Savage Bear 3-60N',
    // Release is Savage Bear 3-60S. Spike is not in this catalogue; Needle is
    // the sharp low-friction tip nearest to it, and 3-60 is exact.
    discId: 'r360',
    driverId: 'needle',
    spinDir: 1,
    skinId: 'ember',
  },
};
