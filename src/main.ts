import './style.css';
import { Game } from './game';
import { Ui } from './ui';
import { applyUnlockAll, unlockMode } from './devUnlock';
import { showContactSheet } from './render/contactSheet';
import { showMoment } from './momentSheet';
import type { Moment } from './momentSheet';
import type { MoveKind } from './sim/types';

const canvas = document.getElementById('arena') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;

let ui: Ui;

const game = new Game(canvas, {
  onScreen: () => ui.render(),
  onFrame: () => ui.tick(),
  onFinish: (reason, won) => ui.showFinisher(reason, won),
  onImpactFlash: (strength) => ui.impactFlash(strength),
  onPerfectLaunch: () => ui.showPerfectLaunch(),
});

// Before the first render, so the garage is built against the granted roster
// rather than rebuilt after it. See devUnlock.ts for why the default form of
// this deliberately never touches the saved career.
const mode = unlockMode();
if (applyUnlockAll(game.progress, mode)) {
  console.info(
    `[dev] unlock=${mode} — every part, skin and rung granted.` +
      (mode === 'session' ? ' Not saved; reload without ?unlock to get your career back.' : ' SAVED.'),
  );
}

ui = new Ui(uiRoot, game);
ui.render();
game.start();

// Space locks the launch meter, then becomes Charge. A and S are the other two
// moves, sitting under the same hand.
const MOVE_KEYS: Record<string, MoveKind> = {
  Space: 'charge',
  KeyA: 'block',
  KeyS: 'dodge',
};

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  // Any real key press counts as the gesture that unblocks audio.
  game.audio.resume();

  // Escape leaves whatever is in progress. Every screen the player can reach
  // needs a way back out; a battle you cannot quit trains people to close the
  // tab instead.
  if (e.code === 'Escape') {
    e.preventDefault();
    game.quitToGarage();
    return;
  }

  if (e.code === 'Space' && game.screen === 'launch') {
    e.preventDefault();
    game.launch();
    return;
  }

  const move = MOVE_KEYS[e.code];
  if (move && game.screen === 'battle') {
    e.preventDefault();
    if (!game.useMove(move)) ui.rejectMove(move);
  }
});

// Expose for debugging in the console.
Object.assign(window as unknown as Record<string, unknown>, { game, ui });

/**
 * Save the current frame, for `docs/design-targets/`.
 *
 * Only works when the page was loaded with `?shot` — see the renderer
 * construction in arena.ts for why keeping a readable back buffer is not
 * something to switch on for every player. Without the flag this says so
 * rather than silently handing back a blank PNG, which is what a plain
 * `toDataURL()` on a live WebGL canvas does and is a genuinely confusing
 * half-hour to debug.
 */
/**
 * Every bey in every theme, as one picture, replacing the page.
 *
 * The cheap way to check a rendering change against all thirty-three
 * combinations instead of the one or two that get driven by hand. See
 * contactSheet.ts.
 */
Object.assign(window as unknown as Record<string, unknown>, {
  __sweep: (ids?: string[]): Promise<void> => showContactSheet(ids),
  /**
   * A filmstrip of a clash, launch or defeat, stepped by hand out of the
   * current round. Needs `?shot` and a round in progress. See momentSheet.ts.
   */
  __moment: (which: Moment = 'clash'): Promise<void> => showMoment(game, which),

  /**
   * Fire a manga impact frame on demand, so it can be looked at.
   *
   * It is a DOM overlay rather than canvas, so `__moment` cannot film it, and
   * only a crit or a perfect block earns one in play — well under one a round
   * by design. Between those two facts the effect was unreviewable without
   * grinding matches and hoping. Call it and take an ordinary screenshot.
   *
   * `crit` picks from the heavier compositions; the position is where on
   * screen the clash was, in percent.
   */
  __manga(crit = true, x = 50, y = 48): void {
    game.renderer.impactFrame.trigger(x, y, {
      strength: crit ? 3.1 : 2.0,
      crit,
      colourA: '#4d8dff',
      colourB: '#ffb020',
    });
  },
});

Object.assign(window as unknown as Record<string, unknown>, {
  __shot(name = 'shot'): string | null {
    const url = game.renderer.snapshot();
    if (!url) {
      console.warn('[shot] reload with ?shot in the URL first.');
      return null;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.png`;
    a.click();
    return url;
  },
});
