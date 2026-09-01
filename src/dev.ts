import { LADDER } from './ladder';
import { CUP_ROUNDS } from './tournament';
import type { Game } from './game';
import type { Progress } from './progress';

/**
 * Developer actions — reach any state without playing to it.
 *
 * WHY IT IS A MODULE AND NOT A HANDFUL OF BUTTONS. Each of these is a small
 * mutation across two or three systems, and every one has an ordering trap. A
 * button that sets `rung` without clearing the live battle leaves the garage
 * showing a rival the sim is not fighting; one that ends a round without going
 * through `Battle` skips the recording that the result screen then tries to
 * read. Putting them here means the traps are written down once, next to the
 * code, rather than rediscovered in the click handler.
 *
 * THE ONE RULE THESE FOLLOW: **nothing here changes the game's rules.** No
 * action grants a stat, alters a constant, or touches balance. They only reach
 * places that are otherwise behind ladder progress, a day's wait, or a run of
 * luck. That matters because every balance number in this repo is measured
 * against a fixed catalogue — a dev switch that quietly buffed something would
 * make the whole suite describe a game nobody plays.
 *
 * MOST OF THEM TAKE `Progress`, NOT `Game`, and that is not tidiness — it is
 * what makes them testable. A `Game` needs a canvas and a WebGL context, so an
 * action that asks for one can only ever be verified by clicking it. The two
 * that genuinely need a live battle say so by taking `Game`.
 *
 * They DO write to the save, which the unlock switch deliberately does not.
 * That is the honest difference between "let me see the whole roster" and "put
 * me on rung 9": the first is a view, the second is a state you asked for.
 */

/** Every ladder rung, for the jump-to control. */
export const rungOptions = (): { value: number; label: string }[] => [
  ...LADDER.map((r, i) => ({ value: i, label: `${i + 1}. ${r.name}` })),
  { value: LADDER.length, label: `${LADDER.length + 1}. Cleared (endless)` },
];

/**
 * Jump to a ladder rung.
 *
 * Grants every unlock from the rungs skipped, because arriving at rung 9 with
 * a starter roster is not the state rung 9 describes — the ladder IS the
 * unlock schedule, and skipping it without the grants tests a game that cannot
 * happen.
 */
export function setRung(progress: Progress, rung: number): void {
  const d = progress.data;
  d.rung = Math.max(0, Math.min(LADDER.length, Math.floor(rung)));
  for (let i = 0; i < d.rung; i++) {
    for (const kind of ['layers', 'discs', 'drivers', 'skins'] as const) {
      for (const id of LADDER[i].unlocks[kind] ?? []) {
        if (!d[kind].includes(id)) d[kind].push(id);
      }
    }
  }
  progress.save();
}

/** Hand over coins, for testing crates and the shop. */
export function grantCoins(progress: Progress, n: number): void {
  progress.data.coins = Math.max(0, progress.data.coins + n);
  progress.save();
}

/**
 * Force the round to end, awarding it to one side.
 *
 * Goes through the sim rather than setting a screen: it kills the loser's spin
 * and lets `Battle` notice on its next step. That keeps the whole chain honest
 * — defeat reason, points, the career record, the objective tick and the result
 * screen all happen exactly as they would in play. A button that jumped
 * straight to the result screen would test the screen and nothing behind it.
 */
export function endRound(game: Game, playerWins: boolean): void {
  if (game.screen !== 'battle') return;
  const loser = game.battle.beys.find((b) =>
    playerWins ? b.id !== 'player' : b.id === 'player',
  );
  if (!loser) return;
  loser.spin = 0;
}

/**
 * Put the cup back to un-entered so today's can be drawn again.
 *
 * `lastDay` is the gate, so it is the field that has to move — clearing the
 * bracket alone would leave the day still spent and the panel still refusing.
 */
export function resetCup(progress: Progress): void {
  const c = progress.data.cup;
  c.field = [];
  c.wins = 0;
  c.out = false;
  c.paid = false;
  c.lastDay = -1;
  progress.save();
}

/** Win the current cup outright, for testing the purse and the champion title. */
export function winCup(progress: Progress): void {
  if (!progress.cupRunning) return;
  for (let i = 0; i < CUP_ROUNDS; i++) progress.recordCup(true, Date.now());
}

/**
 * Bring the nemesis forward.
 *
 * `nemesisDue` reads matches played against `lastSeenAt`, so pushing that back
 * is what makes them due — setting a flag would not, since there is no flag.
 */
export function summonNemesis(progress: Progress): void {
  const d = progress.data;
  d.rung = Math.max(d.rung, 4);
  d.nemesis.lastSeenAt = -999;
  progress.save();
}

/** Fill the player's meter, for testing moves without waiting. */
export function fillMeter(game: Game): void {
  const me = game.battle.beys.find((b) => b.id === 'player');
  if (me) me.meter = 1;
}

/**
 * Wipe the career.
 *
 * Deliberately has no confirmation HERE — the caller owns that, because a
 * confirm() inside a pure-ish action makes it untestable and puts a browser
 * dialog in a module that otherwise touches none.
 */
export function resetCareer(): void {
  try {
    localStorage.removeItem('beyblade-arena.progress.v1');
  } catch {
    // Storage unavailable; the reload below still gives a fresh session.
  }
}
