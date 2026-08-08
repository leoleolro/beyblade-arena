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
});

ui = new Ui(uiRoot, game);
ui.render();
game.start();

// Space locks the launch meter, then becomes Charge. A and S are the other two
// moves, sitting under the same hand.
const MOVE_KEYS: Record<string, MoveKind> = {
  Space: 'charge',
  KeyA: 'anchor',
  KeyS: 'slip',
};

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;

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
(window as unknown as { game: Game }).game = game;
