import { AiController } from './ai';
import type { Difficulty } from './ai';
import { ArenaRenderer } from './render/arena';
import { Battle } from './sim/battle';
import type { Fighter } from './sim/battle';
import * as C from './sim/constants';
import { DEFAULT_BUILD } from './sim/parts';
import type { BeyBuild, LaunchParams } from './sim/types';

/** Screens the player moves through. */
export type Screen = 'garage' | 'launch' | 'battle' | 'round-over' | 'match-over';

export interface GameEvents {
  onScreen(screen: Screen): void;
  onFrame(): void;
}

const PLAYER_ID = 'player';
const AI_ID = 'ai';

/**
 * Owns the match: screen flow, the launch minigame, input, and pumping the sim
 * and renderer. The sim itself knows nothing about any of this.
 */
export class Game {
  battle: Battle;
  screen: Screen = 'garage';

  playerBuild: BeyBuild = DEFAULT_BUILD();
  aiName = 'Rival';
  difficulty: Difficulty = 'blader';

  /** Oscillating launch meter, 0..1, while on the launch screen. */
  launchMeter = 0;
  /** Power the player locked in. */
  lockedPower = 0.8;

  private ai = new AiController(AI_ID, 'blader');
  private renderer: ArenaRenderer;
  private lastTime = 0;
  private meterDir = 1;
  private running = false;

  private events: GameEvents;

  constructor(canvas: HTMLCanvasElement, events: GameEvents) {
    this.events = events;
    this.renderer = new ArenaRenderer(canvas);
    this.battle = this.makeBattle(this.playerBuild, this.ai.chooseBuild(null).build);
    window.addEventListener('resize', () => this.renderer.resize());
  }

  private makeBattle(playerBuild: BeyBuild, aiBuild: BeyBuild): Battle {
    const fighters: Fighter[] = [
      { id: PLAYER_ID, name: 'You', build: playerBuild, spinDir: 1 },
      // The rival spins the other way, so every match is an opposite-spin
      // matchup: fast, violent, and the most fun version of the model.
      { id: AI_ID, name: this.aiName, build: aiBuild, spinDir: -1 },
    ];
    return new Battle(fighters, { seed: (Math.random() * 2 ** 31) | 0 });
  }

  /** Begin a fresh match with the player's current build. */
  startMatch(): void {
    const pick = this.ai.chooseBuild(this.playerBuild);
    this.aiName = pick.name;
    this.battle = this.makeBattle(this.playerBuild, pick.build);
    this.toLaunch();
  }

  setDifficulty(d: Difficulty): void {
    this.difficulty = d;
    this.ai.setDifficulty(d);
  }

  private toLaunch(): void {
    this.launchMeter = 0;
    this.meterDir = 1;
    this.setScreen('launch');
  }

  /** Lock the oscillating meter and start the round. */
  launch(): void {
    if (this.screen !== 'launch') return;
    this.lockedPower = this.launchMeter;

    const playerAngle = Math.random() * Math.PI * 2;
    const playerLaunch: LaunchParams = {
      power: this.lockedPower,
      entryAngle: playerAngle,
      // A hard launch rides the rim; a soft one drops toward the centre.
      entryDepth: 0.05 + (1 - this.lockedPower) * 0.35,
    };
    const aiBuild = this.battle.fighters.find((f) => f.id === AI_ID)!.build;
    const aiLaunch = this.ai.chooseLaunch(aiBuild, playerAngle);

    this.battle.startRound({ [PLAYER_ID]: playerLaunch, [AI_ID]: aiLaunch });
    this.renderer.setBeys(this.battle.beys);
    this.setScreen('battle');
  }

  /** Player pressed the boost key. */
  boost(): boolean {
    if (this.screen !== 'battle') return false;
    return this.battle.activateBoost(PLAYER_ID);
  }

  /** Advance to the next round, or back to the garage if the match is done. */
  next(): void {
    if (this.battle.phase === 'match-over') {
      this.setScreen('garage');
    } else {
      this.toLaunch();
    }
  }

  get player() {
    return this.battle.beys.find((b) => b.id === PLAYER_ID) ?? null;
  }

  get rival() {
    return this.battle.beys.find((b) => b.id === AI_ID) ?? null;
  }

  get playerScore(): number {
    return this.battle.scores[PLAYER_ID] ?? 0;
  }

  get rivalScore(): number {
    return this.battle.scores[AI_ID] ?? 0;
  }

  private setScreen(s: Screen): void {
    this.screen = s;
    this.events.onScreen(s);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.tick);
  }

  private tick = (now: number): void => {
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    if (this.screen === 'launch') {
      // Bounce the meter between 0 and 1; stopping it high is the skill test.
      this.launchMeter += this.meterDir * dt * 1.15;
      if (this.launchMeter >= 1) {
        this.launchMeter = 1;
        this.meterDir = -1;
      } else if (this.launchMeter <= 0) {
        this.launchMeter = 0;
        this.meterDir = 1;
      }
    }

    if (this.screen === 'battle') {
      this.battle.update(dt);
      this.ai.update(this.battle);
      if (this.battle.phase === 'round-over') this.setScreen('round-over');
      else if (this.battle.phase === 'match-over') this.setScreen('match-over');
    }

    // Keep drawing on every screen so the stadium is never a dead frame.
    this.renderer.update(this.battle.beys, this.battle.hits, dt);
    this.events.onFrame();
    requestAnimationFrame(this.tick);
  };
}

export { PLAYER_ID, AI_ID, C };
