import './style.css';
import { Game } from './game';
import { Ui } from './ui';
import type { MoveKind } from './sim/types';

const canvas = document.getElementById('arena') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;

let ui: Ui;

const game = new Game(canvas, {
  onScreen: () => ui.render(),
  onFrame: () => ui.tick(),
  onFinish: (reason, won) => ui.showFinisher(reason, won),
});

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
