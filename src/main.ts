import './style.css';
import { Game } from './game';
import { Ui } from './ui';

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

// Space does the right thing per screen: lock the launch meter, then boost.
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  e.preventDefault();
  if (game.screen === 'launch') game.launch();
  else if (game.screen === 'battle') game.boost();
});

// Expose for debugging in the console.
(window as unknown as { game: Game }).game = game;
