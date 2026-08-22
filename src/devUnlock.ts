import { LAYERS, DISCS, DRIVERS } from './sim/parts';
import { SKINS } from './render/skins';
import type { Progress } from './progress';

/**
 * Own everything, for testing.
 *
 * WHY THIS EXISTS. Judging a visual change means seeing it on the thing that
 * changed, and most of the roster is behind ladder progress — so checking
 * whether a new finish reads on Nosferu meant either winning six matches or
 * hand-editing localStorage in devtools, every time the save was cleared. That
 * is a tax on exactly the work this project spends most of its time doing.
 *
 * WHY IT DOES NOT PERSIST BY DEFAULT, which is the part worth arguing for. A
 * testing switch that quietly rewrites career progress is a switch that
 * eventually eats somebody's run — you open the game with the flag still in the
 * URL, it saves, and the ladder you were climbing is now a solved game with no
 * way back. So `?unlock=all` applies to the session in memory only, and
 * `?unlock=persist` is the deliberate, separate spelling for "yes, actually
 * write this down".
 *
 * "In memory only" is enforced by `Progress.ephemeral`, not by this function
 * declining to call `save()`. The first version did the latter and it did not
 * work: the shop rolls its offer lazily on first read and saves, so merely
 * opening the garage wrote the granted roster to disk — reloading without the
 * flag showed all eleven layers and a cleared ladder. The switch has to sit on
 * the object that owns the storage, because that is the only place a save path
 * nobody remembered cannot get around it.
 *
 * Neither form is reachable from the UI. A URL parameter is discoverable enough
 * for the person who needs it and invisible to everyone else, which is the
 * right amount of exposure for a cheat.
 */

export type UnlockMode = 'off' | 'session' | 'persist';

/** Coins granted alongside the parts, so the crate and shelf paths are testable too. */
const DEV_COINS = 99_999;

export function unlockMode(search: string = location.search): UnlockMode {
  const value = new URLSearchParams(search).get('unlock');
  if (value === null) return 'off';
  // Bare `?unlock` and `?unlock=all` mean the same thing: the common case
  // should not require remembering which spelling is the real one.
  if (value === '' || value === 'all' || value === '1') return 'session';
  if (value === 'persist' || value === 'save') return 'persist';
  return 'off';
}

/**
 * Grant every part and skin, and leave the ladder exactly where it was.
 *
 * THE LADDER IS DELIBERATELY UNTOUCHED, correcting an earlier version of this
 * function that set `rung = LADDER.length` on the theory that some parts were
 * gated on ladder position. They are not — `rung` is read in exactly three
 * places and every one of them is about WHO YOU FIGHT or how the career line
 * renders. Ownership comes entirely from the four lists below.
 *
 * So clearing it bought nothing and cost a lot: `progress.cleared` flips true,
 * which puts the tester into endless mode against escalating rivals instead of
 * the ladder opponent they expected. Symptom was rounds ending in a burst
 * inside a second while trying to look at a beyblade, which reads as a broken
 * game rather than as a much better opponent.
 */
export function applyUnlockAll(progress: Progress, mode: UnlockMode): boolean {
  if (mode === 'off') return false;

  // Set BEFORE the grant, so that even a save triggered during it is caught.
  progress.ephemeral = mode === 'session';

  const d = progress.data;
  d.layers = LAYERS.map((p) => p.id);
  d.discs = DISCS.map((p) => p.id);
  d.drivers = DRIVERS.map((p) => p.id);
  d.skins = SKINS.map((s) => s.id);
  d.coins = Math.max(d.coins, DEV_COINS);

  if (mode === 'persist') progress.save();
  return true;
}
