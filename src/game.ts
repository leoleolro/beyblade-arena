import { AiController } from './ai';
import { Audio } from './audio';
import { LADDER, rivalAt } from './ladder';
import type { Rival, Unlocks } from './ladder';
import { Progress } from './progress';
import type { Difficulty } from './ai';
import { ArenaRenderer } from './render/arena';
import { pickContrastingSkin, skinById } from './render/skins';
import { loadThemeId, saveThemeId } from './render/theme';
import { Battle } from './sim/battle';
import type { Fighter } from './sim/battle';
import * as C from './sim/constants';
import { DEFAULT_BUILD } from './sim/parts';
import type { BeyBuild, LaunchParams, MoveKind } from './sim/types';

/** Screens the player moves through. */
export type Screen =
  | 'home'
  | 'howto'
  | 'garage'
  | 'launch'
  | 'battle'
  | 'round-over'
  | 'match-over';

export interface GameEvents {
  onScreen(screen: Screen): void;
  onFrame(): void;
  /** The decisive blow, fired at the start of the finish hold. */
  onFinish(reason: string, playerWon: boolean): void;
}

/** Shared empty array, so the no-hits path allocates nothing per frame. */
const EMPTY_HITS: never[] = [];

const PLAYER_ID = 'player';
const AI_ID = 'ai';

/**
 * Owns the match: screen flow, the launch minigame, input, and pumping the sim
 * and renderer. The sim itself knows nothing about any of this.
 */
export class Game {
  battle: Battle;
  screen: Screen = 'home';

  playerBuild: BeyBuild = DEFAULT_BUILD();
  /** +1 = right spin, -1 = left spin. A real strategic choice, see ai.ts. */
  playerSpinDir: 1 | -1 = 1;
  /** Cosmetic only — skins never touch a stat. */
  playerSkinId = 'frost';
  /** Chosen to contrast with the player's, so the two tops can't be confused. */
  rivalSkinId = 'ember';

  readonly progress = new Progress();
  /** Visual theme id. Cosmetic only; 'arena' is the untouched original look. */
  themeId = loadThemeId();

  setTheme(id: string): void {
    this.themeId = id;
    saveThemeId(id);
    this.renderer.setTheme(id);
  }
  /** What the last match unlocked, for the result screen to reveal. */
  lastUnlocks: Unlocks = {};

  /**
   * The rival this match is against — fixed by the ladder, not random. Named
   * distinctly from `rival`, which is the live BeyState during a battle.
   */
  get currentRival(): Rival {
    return rivalAt(this.progress.data.rung);
  }
  aiName = 'Rival';
  difficulty: Difficulty = 'blader';

  /** Oscillating launch meter, 0..1, while on the launch screen. */
  launchMeter = 0;
  /** Power the player locked in. */
  lockedPower = 0.8;

  /** The rival's spin for this match, shown in the HUD. */
  rivalSpinDir: 1 | -1 = -1;

  private ai = new AiController(AI_ID, 'blader');
  private renderer: ArenaRenderer;
  private lastTime = 0;
  private meterDir = 1;
  /** Seconds of hitstop freeze remaining. */
  private hitstop = 0;
  /** Guards against recording the same match result twice. */
  private matchRecorded = false;
  /**
   * Seconds left holding on the stadium after a round is decided, before the
   * result panel covers it. The sim has already stopped by then, so this is not
   * slow motion of the sim — the *renderer* is stepped at a reduced rate so the
   * sparks and camera drift through the moment the player cares about.
   */
  private finishHold = 0;

  readonly audio = new Audio();
  private running = false;

  private events: GameEvents;

  constructor(canvas: HTMLCanvasElement, events: GameEvents) {
    this.events = events;
    this.renderer = new ArenaRenderer(canvas);
    this.renderer.setTheme(this.themeId);
    this.battle = this.makeBattle(this.playerBuild, this.ai.chooseBuild(null).build);
    window.addEventListener('resize', () => this.renderer.resize());
  }

  private makeBattle(playerBuild: BeyBuild, aiBuild: BeyBuild): Battle {
    // Both directions used to be hardcoded opposite. That guaranteed a head-on
    // inside half an orbit and made the median round 1.2 seconds; now each side
    // chooses, and the pairing is a genuine strategic dial.
    const aiSpin = this.ai.chooseSpinDir(aiBuild, this.playerSpinDir);
    this.rivalSpinDir = aiSpin;
    const fighters: Fighter[] = [
      { id: PLAYER_ID, name: 'You', build: playerBuild, spinDir: this.playerSpinDir },
      { id: AI_ID, name: this.aiName, build: aiBuild, spinDir: aiSpin },
    ];
    return new Battle(fighters, { seed: (Math.random() * 2 ** 31) | 0 });
  }

  /**
   * Begin a match against the current ladder rival. The opponent is fixed
   * rather than random: a named rival with a known build is a problem the
   * player can prepare for, which is what makes the garage matter.
   */
  startMatch(): void {
    const rival = this.currentRival;
    this.aiName = `${rival.name} · ${rival.beyName}`;
    this.setDifficulty(rival.difficulty);

    // The rival's own skin, unless it clashes with the player's — identification
    // outranks flavour, so a collision falls back to the contrasting pick.
    const playerSkin = skinById(this.playerSkinId);
    this.rivalSkinId =
      rival.skinId === this.playerSkinId
        ? pickContrastingSkin(playerSkin).id
        : rival.skinId;

    this.lastUnlocks = {};
    this.matchRecorded = false;
    this.battle = this.makeBattle(this.playerBuild, rival.build());
    this.toLaunch();
  }

  setDifficulty(d: Difficulty): void {
    this.difficulty = d;
    this.ai.setDifficulty(d);
  }

  private toLaunch(): void {
    this.finishHold = 0;
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
    this.renderer.setBeys(this.battle.beys, {
      [PLAYER_ID]: this.playerSkinId,
      [AI_ID]: this.rivalSkinId,
    });
    this.audio.resume();
    this.audio.launch(this.lockedPower);
    this.setScreen('battle');
  }

  /** Player used a move. Returns false if it couldn't be afforded. */
  useMove(kind: MoveKind): boolean {
    if (this.screen !== 'battle') return false;
    const ok = this.battle.activateMove(PLAYER_ID, kind);
    if (ok) this.audio.move(kind);
    else this.audio.reject();
    return ok;
  }

  /** Move between the non-battle screens. */
  goTo(screen: 'home' | 'howto' | 'garage'): void {
    this.audio.resume();
    this.setScreen(screen);
  }

  /**
   * How many battles the player has finished. Coaching prompts only appear in
   * the first couple of matches — a tutorial that never stops is a nag.
   */
  battlesPlayed = 0;

  /** Advance to the next round, or back to the garage if the match is done. */
  next(): void {
    if (this.battle.phase === 'match-over') {
      this.battlesPlayed += 1;
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
    // Leaving the arena silences anything sustained. Belt and braces against
    // a drone outliving the round that spawned it.
    if (s !== 'battle') this.audio.stopWhines();
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
      // Hitstop: freeze the simulation for a beat on a heavy clash. This lives
      // here rather than in the sim so the sim stays deterministic — a replay
      // re-simulates without it and reaches the same result.
      if (this.hitstop > 0) {
        this.hitstop = Math.max(0, this.hitstop - dt);
      } else {
        const rivalMoveBefore = this.rival?.move ?? null;
        this.battle.update(dt);
        this.ai.update(this.battle, dt);

        // Announce the rival's move so it can be heard as well as seen.
        const rivalMoveAfter = this.rival?.move ?? null;
        if (rivalMoveAfter && rivalMoveAfter !== rivalMoveBefore) {
          this.audio.move(rivalMoveAfter);
        }

        for (const h of this.battle.hits) {
          this.audio.impact(h.strength, h.opposite);
          if (h.strength >= C.HITSTOP_THRESHOLD) this.hitstop = C.HITSTOP_DURATION;
        }
        // Only while the round is genuinely running. `screen` stays 'battle'
        // for the whole finish hold, so without this guard the drone is
        // recreated on the frame after roundEnd() stopped it and then plays on
        // through the result screen and menus, never stopping.
        if (this.battle.phase === 'battle') {
          for (const b of this.battle.beys) {
            this.audio.updateWhine(b.id, Math.abs(b.spin) / C.SPIN_REF, b.alive);
          }
        }
      }

      // The round is decided, but hold on the stadium for a beat first.
      if (this.battle.phase !== 'battle' && this.finishHold <= 0) {
        this.finishHold = C.FINISH_HOLD_TIME;
        this.audio.roundEnd(this.battle.lastRound?.winnerId === PLAYER_ID);
        this.renderer.finish();
        this.events.onFinish(
          this.battle.lastRound?.reason ?? 'timeout',
          this.battle.lastRound?.winnerId === PLAYER_ID,
        );

        // Record the match exactly once, the moment it is decided.
        if (this.battle.phase === 'match-over' && !this.matchRecorded) {
          this.matchRecorded = true;
          this.lastUnlocks = this.progress.recordMatch(
            this.battle.matchWinnerId === PLAYER_ID,
          );
        }
      }
    }

    if (this.finishHold > 0) {
      this.finishHold = Math.max(0, this.finishHold - dt);
      if (this.finishHold === 0) {
        if (this.battle.phase === 'round-over') this.setScreen('round-over');
        else if (this.battle.phase === 'match-over') this.setScreen('match-over');
      }
    }

    // Keep drawing on every screen so the stadium is never a dead frame.
    // During the finish hold the renderer runs slow; that is what sells it.
    const renderDt = this.finishHold > 0 ? dt * C.FINISH_RENDER_SCALE : dt;
    // Belt and braces alongside the fix in Battle.update: effects are only ever
    // driven by hits from a round that is actually running.
    const hits = this.screen === 'battle' ? this.battle.hits : EMPTY_HITS;
    this.renderer.update(this.battle.beys, hits, renderDt);
    this.events.onFrame();
    requestAnimationFrame(this.tick);
  };
}

export { PLAYER_ID, AI_ID, C, LADDER };
