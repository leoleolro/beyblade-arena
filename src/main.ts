import './style.css';
import { Game } from './game';
import { Ui } from './ui';
import { applyUnlockAll, unlockMode } from './devUnlock';
import { showContactSheet } from './render/contactSheet';
import { showMoment } from './momentSheet';
import { showModelAudit } from './modelAudit';
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
  onObjectives: (outcome) => ui.showObjectives(outcome),
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

/**
 * The audio gate: the first real gesture anywhere on the page.
 *
 * The individual buttons that begin play call `resume()` themselves, and that
 * is the path that matters — but this is the one listener that cannot go stale.
 * Every other gesture site is a button that a UI change can move, rename or
 * delete, and the failure mode when one does is a game that is simply silent
 * with nothing in the console to say why. `resume()` is idempotent and cheap
 * after the first call, so the cost of the belt and braces is one listener that
 * removes itself.
 *
 * `pointerdown` rather than `click` so a touch counts, and `capture` so a
 * handler that stops propagation cannot swallow the gesture on the way down.
 */
addEventListener('pointerdown', () => game.audio.resume(), {
  once: true,
  capture: true,
});

/**
 * A hidden tab is a room nobody is in.
 *
 * requestAnimationFrame stops when the tab is hidden but the audio thread does
 * not — the music scheduler runs on `setInterval` against the audio clock by
 * design, precisely so it survives throttling, which means that without this it
 * plays on to an empty room while the game itself is frozen.
 */
document.addEventListener('visibilitychange', () => {
  // Guarded on `ready`, because visibilitychange is NOT a user gesture: calling
  // resume() before one has happened would build the whole graph around a
  // context the browser starts suspended, which is the one thing the audio
  // layer is written to avoid. Coming back to a tab you never clicked on should
  // leave it exactly as silent as it was.
  if (!game.audio.ready) return;
  if (document.hidden) game.audio.suspend();
  else game.audio.resume();
});

// Space locks the launch meter, then becomes Charge. A and S are the other two
// moves, sitting under the same hand.
const MOVE_KEYS: Record<string, MoveKind> = {
  Space: 'charge',
  KeyA: 'block',
  KeyS: 'dodge',
};

/**
 * Keyboard aiming, as a fallback for the pointer.
 *
 * Arrow keys rather than WASD, because A and S are already Block and Dodge —
 * the move keys were placed under the left hand deliberately and moving them
 * to make room for aiming would trade a control people have learnt for one
 * they have not.
 *
 * These are SCREEN directions. `setKeyAim` rotates them into dish space using
 * the camera's bearing, so "up" always means away from the viewer even while
 * the camera orbits.
 */
const AIM_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

/** Which aim keys are down. Held so diagonals work. */
const aimHeld = new Set<string>();

function pushAim(): void {
  let x = 0;
  let y = 0;
  for (const code of aimHeld) {
    const d = AIM_KEYS[code];
    if (d) {
      x += d[0];
      y += d[1];
    }
  }
  game.setKeyAim(x, y);
}

window.addEventListener('keyup', (e) => {
  if (aimHeld.delete(e.code)) pushAim();
});

// A window that loses focus mid-press never delivers the keyup, which would
// leave an aim stuck on until the next press.
window.addEventListener('blur', () => {
  if (aimHeld.size) {
    aimHeld.clear();
    pushAim();
  }
});

window.addEventListener('keydown', (e) => {
  if (AIM_KEYS[e.code] && game.screen === 'battle') {
    e.preventDefault();
    if (!e.repeat) {
      aimHeld.add(e.code);
      pushAim();
    }
    return;
  }

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
  /**
   * The live Game, for poking at from the console.
   *
   * Added after a visual bug cost twenty minutes purely because there was no
   * way to ask the running renderer a question — the filmstrip could show that
   * an effect was missing but not whether it had ever been spawned, and every
   * other route meant editing source and reloading. The other helpers here are
   * unconditional for the same reason; nothing reads this in normal play.
   */
  __game: game,
  /**
   * Audit every imported model in one command — size, upright axis, seating,
   * and leftover rig. See modelAudit.ts for why a bounding box alone is not
   * enough. Run it after dropping any new model in.
   */
  __models: (): Promise<unknown> => showModelAudit(),
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
