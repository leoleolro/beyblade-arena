import { AiController } from './ai';
import { AudioEngine } from './audio/engine';
import type { Scene, TopAudioState } from './audio/engine';
import { LADDER, endlessRival, rivalAt } from './ladder';
import type { Rival, Unlocks } from './ladder';
import { Progress } from './progress';
import type { Difficulty } from './ai';
import { ArenaRenderer } from './render/arena';
import { pickContrastingSkin, skinById } from './render/skins';
import { loadImpactFrames, saveImpactFrames, saveThemeId } from './render/theme';
import { arenaById, ARENAS } from './sim/arena';
import {
  loadModeId,
  loadStadiumId,
  modeById,
  saveModeId,
  saveStadiumId,
  stadiumIn,
} from './modes';
import type { ModeId, Stadium } from './modes';
import { Battle } from './sim/battle';
import type { Fighter } from './sim/battle';
import * as C from './sim/constants';
import { DEFAULT_BUILD } from './sim/parts';
import type { BeyBuild, LaunchParams, MoveKind } from './sim/types';
import { DIRECT_PRICE, REROLL_COST, REWARDS, crateById, rollCrate, rollOffer } from './economy';
import type { CrateResult, OfferSlot, RewardRef } from './economy';

/** Screens the player moves through. */
export type Screen =
  | 'home'
  | 'mode'
  | 'howto'
  | 'garage'
  | 'stadium'
  | 'launch'
  | 'battle'
  | 'round-over'
  | 'match-over';

export interface GameEvents {
  onScreen(screen: Screen): void;
  onFrame(): void;
  /** The decisive blow, fired at the start of the finish hold. */
  onFinish(reason: string, playerWon: boolean): void;
  /** A heavy clash, in themes that pulse the screen. 0–1 strength. */
  onImpactFlash(strength: number): void;
  /** The player's rip landed in the launch meter's green band. */
  onPerfectLaunch(): void;
}

/** Shared empty array, so the no-hits path allocates nothing per frame. */
const EMPTY_HITS: never[] = [];

const PLAYER_ID = 'player';
const AI_ID = 'ai';

/**
 * Which mix each screen sits in. See AudioEngine.Scene.
 *
 * A table rather than a chain of ifs because the mapping is not one-to-one in
 * either direction — five menu screens share one scene, and the two result
 * screens share another — and a lookup makes an unmapped screen a compile
 * error instead of a silent fall-through to whatever the last branch was.
 */
const SCREEN_SCENE: Record<Screen, Scene> = {
  home: 'menu',
  mode: 'menu',
  howto: 'menu',
  garage: 'menu',
  stadium: 'menu',
  launch: 'launch',
  battle: 'battle',
  'round-over': 'result',
  'match-over': 'result',
};

/**
 * Seconds left on the round clock that get a countdown pip.
 *
 * The pips exist because the clock is the one way to lose that the player
 * cannot see coming — a top going out is on screen, a top running down is a bar
 * they are not looking at, and "TIME UP" arriving unannounced reads as the game
 * cutting the round short. Three is the whole of `COUNTDOWN_MIDI`'s pip range,
 * so it is also all the design has notes for.
 */
const CLOCK_PIP_FROM = 3;

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
  /**
   * Randomness for crate rolls.
   *
   * Deliberately NOT the sim's seeded PRNG. The sim is seeded so a match
   * replays identically, which is exactly the wrong property here — a crate
   * whose outcome is a pure function of a stored seed can be re-rolled by
   * reloading before the reveal finishes, and a save-scummable crate is not a
   * crate. Unpredictability is the mechanic.
   */
  private readonly crateRng: () => number = Math.random;

  /**
   * Which game this is — the roster, or the kept prototype. See modes.ts.
   *
   * The first choice a player makes, and the only one that changes what a
   * beyblade IS rather than how it is lit.
   */
  modeId: ModeId = loadModeId();

  /**
   * Where the fight happens: an arena and a look, chosen together. See modes.ts
   * for why those are one decision and not two.
   */
  stadium: Stadium = stadiumIn(loadModeId(), loadStadiumId());

  /** Visual theme id. Cosmetic only; 'arena' is the untouched original look. */
  themeId = this.stadium.themeId;
  /**
   * Gameplay arena. Unlike skins and themes this changes the physics, so it is
   * a match setting the player picks — never something that could be sold.
   */
  arenaId = this.stadium.arenaId;

  /**
   * Switch mode, and re-resolve the stadium inside it.
   *
   * The re-resolve is not defensive tidying: a stadium carries the theme, the
   * theme carries `toon`, and `toon` decides which beyblade gets built. Keeping
   * a stadium across a mode switch would put prototype tops in the roster mode.
   * `stadiumIn` falls back to the new mode's own default, so that cannot happen
   * even if a stale id survives in storage.
   */
  setMode(id: string): void {
    this.modeId = modeById(id).id;
    saveModeId(this.modeId);
    this.setStadium(stadiumIn(this.modeId, this.stadium.id).id);
  }

  setStadium(id: string): void {
    this.stadium = stadiumIn(this.modeId, id);
    saveStadiumId(this.stadium.id);
    // The stadium is the persisted unit. Arena and theme were saved separately
    // when they were separate choices; storing all three would be three keys
    // that must agree, and the one that disagreed would decide the match.
    this.arenaId = this.stadium.arenaId;
    this.setTheme(this.stadium.themeId);
    // Show the floor being chosen, not the one from last match.
    //
    // The arena behind the panels is a live scene, and until now the renderer
    // only learned the arena at `startMatch`. That was invisible when the
    // picker was a chip row inside the garage; on a screen whose entire job is
    // choosing a floor, picking the X-Rail and watching the plain dish stay put
    // reads as the click not having registered.
    this.renderer.setArena(arenaById(this.arenaId));
  }

  /** Manga impact frames, on or off. Anime theme only; cosmetic. */
  impactFrames = loadImpactFrames();

  setImpactFrames(on: boolean): void {
    this.impactFrames = on;
    saveImpactFrames(on);
    this.renderer.setImpactFrames(on);
  }

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
    // Past the ladder the opponents keep coming — see `endlessRival`. Before
    // this, `rivalAt` clamped to Zeph forever, so clearing the game left you
    // replaying the same fight with nothing to move.
    if (this.progress.cleared) {
      return endlessRival(this.progress.data.endless + 1);
    }
    return rivalAt(this.progress.data.rung);
  }
  aiName = 'Rival';
  difficulty: Difficulty = 'blader';

  /** Oscillating launch meter, 0..1, while on the launch screen. */
  launchMeter = 0;
  /** Power the player locked in. */
  lockedPower = 0.8;

  /**
   * Launcher tilt for the next launch, -1 to 1. The player's only POSITIONAL
   * input, and the reason it exists.
   *
   * The battle had three buttons and no way to influence WHERE anything
   * happened, so the only variable was when to press — which is what made the
   * fight read as a pursuit. Tilt is decided before the round and shapes the
   * whole orbit: zero spirals to the centre and settles there, either extreme
   * oscillates between rim and centre, which is the real game's flower pattern.
   * Measured radius over the first 1.25s of a round:
   *
   *     tilt  0.0   0.82 -> 0.61 -> 0.51 -> 0.43 -> 0.39 -> 0.44   settles
   *     tilt -0.8   0.80 -> 0.38 -> 0.88 -> 0.44 -> 0.73 -> 0.82   oscillates
   *
   * Held across rounds on purpose: it is a stance, not a twitch input, and
   * re-choosing it every round would make it noise rather than a decision.
   */
  launchTilt = 0;

  setLaunchTilt(v: number): void {
    this.launchTilt = Math.max(-1, Math.min(1, v));
  }

  /** The rival's spin for this match, shown in the HUD. */
  rivalSpinDir: 1 | -1 = -1;

  /** Public so dev tools can step a round by hand. See momentSheet.ts. */
  readonly ai = new AiController(AI_ID, 'blader');
  /** Public so the `?shot` console helper in main.ts can force a snapshot. */
  readonly renderer: ArenaRenderer;
  private lastTime = 0;
  private meterDir = 1;
  /** Seconds of hitstop freeze remaining. */
  private hitstop = 0;
  /** Guards against recording the same match result twice. */
  private matchRecorded = false;
  /** Previous rail timer per top, for engage/release edge detection. */
  private railWas = new Map<string, number>();
  /**
   * Seconds left holding on the stadium after a round is decided, before the
   * result panel covers it. The sim has already stopped by then, so this is not
   * slow motion of the sim — the *renderer* is stepped at a reduced rate so the
   * sparks and camera drift through the moment the player cares about.
   */
  private finishHold = 0;

  readonly audio = new AudioEngine();
  /**
   * Reused per-top audio states, mutated in place each frame.
   *
   * `frame()` runs every tick for the whole round, so building two fresh
   * objects and an array for it is 120 allocations a second thrown away — the
   * same reason `EMPTY_HITS` exists a few lines up. The engine only reads them
   * synchronously and never keeps a reference, so reuse is safe.
   */
  private audioTops: TopAudioState[] = [];
  /**
   * The last whole second the clock countdown fired on, or 0 for none.
   *
   * `roundTime` advances in fixed steps, so the same whole second is crossed on
   * several consecutive frames; without this the last three seconds of a round
   * would be a pip per frame rather than a pip per second.
   */
  private lastClockPip = 0;
  private running = false;

  private events: GameEvents;

  /**
   * A keyboard aim, held between frames.
   *
   * Null is not a failure state — it is the default, and it means the charge
   * homes exactly as it always did. Everything about aiming is additive: a
   * player who never touches the pointer plays the game that shipped.
   *
   * Kept separate from the pointer aim rather than folded into it because the
   * two are resolved differently — the pointer names a POINT on the dish and
   * has to be re-projected as the top moves, while the keys name a DIRECTION
   * that is already final. See `resolveAim`.
   */
  private keyAim: { x: number; y: number } | null = null;

  /** Last pointer position in client pixels, for re-projection each frame. */
  private pointer: { x: number; y: number } | null = null;

  constructor(canvas: HTMLCanvasElement, events: GameEvents) {
    this.events = events;
    this.renderer = new ArenaRenderer(canvas);
    this.renderer.setTheme(this.themeId);
    this.battle = this.makeBattle(this.playerBuild, this.ai.chooseBuild(null).build);
    window.addEventListener('resize', () => this.renderer.resize());

    // Pointer aiming. `pointermove` rather than `mousemove` so a touch drag
    // aims too — on a phone there is no hover, and dragging a finger across
    // the dish is the only aiming gesture available.
    canvas.addEventListener('pointermove', (e) => {
      this.pointer = { x: e.clientX, y: e.clientY };
      this.keyAim = null;
    });
    // Leaving the canvas stops aiming rather than freezing the last aim, which
    // would leave a stale line pointing at wherever the cursor happened to
    // exit.
    canvas.addEventListener('pointerleave', () => {
      this.pointer = null;
    });
  }

  /**
   * Aim with the keyboard, in screen terms.
   *
   * `sx, sy` is a direction on the SCREEN — (0,-1) is "away from me". The
   * camera orbits, so that has to be rotated into dish space or the arrow keys
   * would mean something different every second. Pass null to stop.
   */
  setKeyAim(sx: number, sy: number): void {
    if (sx === 0 && sy === 0) {
      this.keyAim = null;
      return;
    }
    const yaw = this.renderer.cameraYaw();
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    this.keyAim = { x: sx * c - sy * sn, y: sx * sn + sy * c };
    this.pointer = null;
  }

  /**
   * The aim to hand the sim this frame, or null.
   *
   * The pointer names a point, so the direction has to be recomputed from
   * wherever the player's top is NOW — aiming at a spot and then drifting past
   * it should reverse the aim, because that is what the player is looking at.
   */
  private resolveAim(): { x: number; y: number } | null {
    if (this.keyAim) return this.keyAim;
    if (!this.pointer) return null;
    const me = this.battle.beys.find((b) => b.id === PLAYER_ID);
    if (!me || !me.alive) return null;
    const at = this.renderer.pointerToDish(this.pointer.x, this.pointer.y);
    if (!at) return null;
    const dx = at.x - me.pos.x;
    const dy = at.y - me.pos.y;
    const d = Math.hypot(dx, dy);
    // Too close to mean anything: pointing AT your own top is not a direction.
    if (d < 0.03) return null;
    return { x: dx / d, y: dy / d };
  }

  private makeBattle(playerBuild: BeyBuild, aiBuild: BeyBuild): Battle {
    // Both directions used to be hardcoded opposite. That guaranteed a head-on
    // inside half an orbit and made the median round 1.2 seconds; now each side
    // chooses, and the pairing is a genuine strategic dial.
    // The rival commits without seeing this launch — but it remembers the last
    // one. See `observePlayerSpin`: a player who always brings left spin gets
    // read, which is what stops the counter from being a permanently correct
    // answer.
    const aiSpin = this.ai.chooseSpinDir(aiBuild);
    this.ai.observePlayerSpin(this.playerSpinDir);
    this.rivalSpinDir = aiSpin;
    const fighters: Fighter[] = [
      { id: PLAYER_ID, name: 'You', build: playerBuild, spinDir: this.playerSpinDir },
      { id: AI_ID, name: this.aiName, build: aiBuild, spinDir: aiSpin },
    ];
    return new Battle(fighters, {
      seed: (Math.random() * 2 ** 31) | 0,
      arena: arenaById(this.arenaId),
    });
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
    this.railWas.clear();
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
      tilt: this.launchTilt,
    };
    const aiBuild = this.battle.fighters.find((f) => f.id === AI_ID)!.build;
    const aiLaunch = this.ai.chooseLaunch(aiBuild, playerAngle);

    this.battle.startRound({ [PLAYER_ID]: playerLaunch, [AI_ID]: aiLaunch });
    this.renderer.setBeys(this.battle.beys, {
      [PLAYER_ID]: this.playerSkinId,
      [AI_ID]: this.rivalSkinId,
    });
    this.renderer.setArena(arenaById(this.arenaId));
    // Purely visual: drops both tops into the dish and swings the camera round
    // to the player's entry side. Must follow setBeys, which clears it.
    this.renderer.start(playerAngle);
    this.lastClockPip = 0;
    this.audio.resume();
    this.audio.launch(this.lockedPower);
    // "GO", laid over the rip.
    //
    // The pips it belongs to are on the round CLOCK rather than here — nothing
    // in this game counts you in, so 3-2-1 before a launch would be three
    // seconds of new dead time invented for a sound. GO still earns its place
    // on its own: it is an octave above the first pip, which the ear reads as
    // "arrived" with or without having heard them, and it establishes the key
    // everything else in the mix is written in at the one moment the player is
    // listening rather than pressing.
    this.audio.countdown(0);

    // Confirm a perfect launch.
    //
    // `perfectLaunch` has been written by the sim since the launch minigame got
    // stakes and read by NOTHING — the bonus spin was applied silently, while
    // the tutorial told the player to aim for the green band and promised them
    // they would know when they hit it. Perfect BLOCK is plumbed all the way
    // through to a colour, a shockwave and a guaranteed impact frame; this was
    // its missing twin.
    const me = this.battle.beys.find((b) => b.id === PLAYER_ID);
    if (me?.perfectLaunch) {
      this.audio.perfectLaunch();
      this.events.onPerfectLaunch();
    }

    this.setScreen('battle');
  }

  /** Player used a move. Returns false if it couldn't be afforded. */
  useMove(kind: MoveKind): boolean {
    if (this.screen !== 'battle') return false;
    // Only Charge is aimed. Block does not move and Dodge already has its own
    // rule — it aims AWAY from the opponent, and letting the player point a
    // dodge would mostly be a way to dodge into a pocket.
    const aim = kind === 'charge' ? (this.resolveAim() ?? undefined) : undefined;
    const ok = this.battle.activateMove(PLAYER_ID, kind, aim);
    if (ok) this.audio.move(kind);
    else this.audio.reject();
    return ok;
  }

  /** Move between the non-battle screens. */
  /** Spendable coins. Read-only to the UI; only the economy mutates them. */
  get coins(): number {
    return this.progress.data.coins;
  }

  canAfford(crateId: string): boolean {
    const crate = crateById(crateId);
    return crate !== undefined && this.progress.data.coins >= crate.cost;
  }

  /**
   * Buy and roll one crate. Returns null when it could not be afforded, so a
   * double-click cannot open two crates for the price of one.
   *
   * The unlock is granted here rather than when the reveal animation finishes:
   * a player who closes the tab mid-reveal has already paid, and losing the
   * item because the animation did not complete would be the worst possible
   * failure mode. The reveal is a presentation of a result that has already
   * happened.
   */
  openCrate(crateId: string): CrateResult | null {
    const crate = crateById(crateId);
    if (!crate) return null;
    if (!this.progress.spend(crate.cost)) return null;

    const result = rollCrate(
      crate,
      (kind, id) => this.progress.has(kind, id),
      this.crateRng,
    );
    if (result.duplicate) this.progress.credit(result.refund);
    else this.progress.grant(result.reward.kind, result.reward.id);
    return result;
  }

  /**
   * The current shop offer, rolled lazily.
   *
   * Lazy because rolling needs to know what is already owned, and that is not
   * known when a fresh save is constructed. Stale entries are dropped on read
   * rather than at grant time: a part can become owned through the ladder or a
   * crate while the offer is sitting there, and the shop should never sell
   * something the player already has.
   */
  get offer(): OfferSlot[] {
    const owned = (kind: keyof Unlocks, id: string): boolean =>
      this.progress.has(kind, id);
    const stored = this.progress.data.offer
      .map((ref) => REWARDS.find((r) => r.kind === ref.kind && r.id === ref.id))
      .filter((r): r is RewardRef => r !== undefined && !owned(r.kind, r.id))
      .map((reward) => ({ reward, price: DIRECT_PRICE[reward.rarity] }));

    if (stored.length === this.progress.data.offer.length && stored.length > 0) {
      return stored;
    }

    // Anything dropped, or nothing rolled yet: roll a full set. Topping up the
    // remaining slots instead would let a player buy one part and get a fresh
    // look at the rest for free, over and over.
    const fresh = rollOffer(owned, this.crateRng);
    // Guarded, because a fully-collected player rolls an empty offer on every
    // read and this getter runs on every garage render — an unguarded write
    // would be a localStorage save per frame of the settings screen.
    if (fresh.length > 0 || this.progress.data.offer.length > 0) {
      this.progress.setOffer(fresh.map((s) => ({ kind: s.reward.kind, id: s.reward.id })));
    }
    return fresh;
  }

  /** Buy a specific part outright. Returns false when it can't be afforded. */
  buyOffer(kind: keyof Unlocks, id: string): boolean {
    const slot = this.offer.find((s) => s.reward.kind === kind && s.reward.id === id);
    if (!slot) return false;
    if (!this.progress.spend(slot.price)) return false;
    this.progress.grant(kind, id);
    // Granting makes the slot stale, and the `offer` getter drops stale slots —
    // so the bought part vanishes from the shelf on the next read, which is
    // exactly right, and the remaining slots survive because they are still
    // valid. Clearing the whole offer here would reroll it for free.
    this.progress.setOffer(
      this.progress.data.offer.filter((r) => !(r.kind === kind && r.id === id)),
    );
    return true;
  }

  /** Pay to replace the whole offer. */
  rerollOffer(): boolean {
    if (!this.progress.spend(REROLL_COST)) return false;
    const fresh = rollOffer((k, i) => this.progress.has(k, i), this.crateRng);
    this.progress.setOffer(fresh.map((s) => ({ kind: s.reward.kind, id: s.reward.id })));
    return true;
  }

  goTo(screen: 'home' | 'mode' | 'howto' | 'garage' | 'stadium'): void {
    this.audio.resume();
    this.setScreen(screen);
  }

  /**
   * Abandon whatever is in progress and go back.
   *
   * There was no way out of a battle at all: once you launched, the only exit
   * was to finish the match. Every screen a player can reach has to have a way
   * back out of it, and a game that traps you in a fight you have stopped
   * wanting is training you to close the tab.
   *
   * The match is discarded rather than paused. A half-finished match resumed
   * later would need its rival, scores and round state persisted, and none of
   * that is worth carrying for a feature whose whole job is "let me leave".
   * Ladder progress only moves on a *finished* match, so quitting costs the
   * player nothing except the match they chose to walk away from.
   */
  quitToGarage(): void {
    if (this.screen === 'home' || this.screen === 'garage') return;
    this.audio.stopSpin();
    this.hitstop = 0;
    this.finishHold = 0;
    // Rebuild against the current rival so the garage's "next opponent" card
    // and the arena behind it agree with each other again.
    this.battle = this.makeBattle(this.playerBuild, this.currentRival.build());
    this.renderer.setBeys(this.battle.beys, {
      [PLAYER_ID]: this.playerSkinId,
      [AI_ID]: this.rivalSkinId,
    });
    this.setScreen('garage');
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

  /**
   * Is the player currently aiming?
   *
   * Exposed for the coaching line, which has to teach the aim by CONTRAST —
   * "you are not aiming, here is how" against "you are aiming, now fire". A
   * single static sentence cannot do that, and aiming is invisible until you
   * happen to move the pointer over the dish.
   */
  get aiming(): boolean {
    return this.resolveAim() !== null;
  }

  get player() {
    return this.battle.beys.find((b) => b.id === PLAYER_ID) ?? null;
  }

  get rival() {
    return this.battle.beys.find((b) => b.id === AI_ID) ?? null;
  }

  /** 0–1 "how fast does this feel", for the speed-line overlay. */
  get intensity(): number {
    return this.screen === 'battle'
      ? this.renderer.intensity(this.battle.beys)
      : 0;
  }

  get playerScore(): number {
    return this.battle.scores[PLAYER_ID] ?? 0;
  }

  get rivalScore(): number {
    return this.battle.scores[AI_ID] ?? 0;
  }

  private setScreen(s: Screen): void {
    // Moving the mix is the same call as leaving the arena: `setScene` silences
    // every sustained voice for any scene that is not 'battle', which is the
    // belt and braces against a spin bed outliving the round that spawned it.
    this.audio.setScene(SCREEN_SCENE[s]);
    this.screen = s;
    this.events.onScreen(s);
  }

  /**
   * Whether either fighter can take the match this round.
   *
   * Derived from the scoring table rather than written as a number: a knockout
   * is the ordinary decisive finish, so "within one knockout of the target" is
   * what match point actually means, and it stays true if either constant is
   * retuned. The music reads this to arm its tension layer from the first
   * second of the round rather than once something has happened.
   */
  private get matchPoint(): boolean {
    const near = C.POINTS_TO_WIN - C.POINTS_KNOCKOUT;
    return this.playerScore >= near || this.rivalScore >= near;
  }

  /**
   * Hand the audio layer this frame of the round.
   *
   * One call covering the spin bed, the grind of two tops leaning on each
   * other, and the music's intensity — see AudioEngine.frame. `live` is the
   * round genuinely running rather than the screen being 'battle', because the
   * screen stays 'battle' for the whole finish hold and the bed must stop when
   * the fight does, not when the panel appears.
   */
  private pumpAudio(dt: number): void {
    const beys = this.battle.beys;
    for (let i = 0; i < beys.length; i++) {
      const b = beys[i];
      const slot = (this.audioTops[i] ??= { id: b.id, spinNorm: 0, alive: false });
      slot.id = b.id;
      // Normalised against SPIN_REF and NOT against this top's own
      // `spinAtLaunch`, which is what the HUD bar uses. The bar answers "how
      // much of what you started with is left", which is the right question for
      // a percentage; the bed answers "how fast is this thing actually
      // turning", which is the right question for a pitch. Per-top
      // normalisation would make a weak launch and a strong one sound
      // identical at the start and put two tops at genuinely different speeds
      // on the same note.
      slot.spinNorm = Math.abs(b.spin) / C.SPIN_REF;
      slot.alive = b.alive;
    }
    this.audioTops.length = beys.length;

    this.audio.frame(
      {
        tops: this.audioTops,
        contacts: this.battle.contacts,
        roundTime: this.battle.roundTime,
        matchPoint: this.matchPoint,
        live: this.screen === 'battle' && this.battle.phase === 'battle',
      },
      dt,
    );
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame(this.tick);
  }

  /**
   * Stop driving frames. `start()` resumes.
   *
   * `running` guarded nothing but a double-`start()` before this existed; the
   * loop re-scheduled itself unconditionally. The flag now means what it says,
   * which is what lets a tool step the sim by hand without the live loop
   * interleaving its own frames — see momentSheet.ts.
   */
  stop(): void {
    this.running = false;
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

        // Rail transitions. Detected here rather than in the sim so the sim
        // stays free of presentation concerns and replays identically.
        for (const b of this.battle.beys) {
          const was = this.railWas.get(b.id) ?? 0;
          // The tip's own Dash stat rides along: a Gear Flat's slingshot should
          // not sound like a Ball's, and the sim already publishes the number.
          if (was === 0 && b.railTime > 0) {
            this.audio.railEngage(b.railTime, b.stats.railGrip);
          } else if (was > 0 && b.railTime === 0) this.audio.railRelease();
          this.railWas.set(b.id, b.railTime);
        }

        for (const h of this.battle.hits) {
          // The whole HitEvent, not two of its fields: strength picks the tier,
          // `opposite` adds the bite, and `crit`/`perfectBlock` are what make a
          // punish audibly different from an exchange. See design.impactVoice.
          this.audio.hit(h);
          if (h.strength >= C.HITSTOP_THRESHOLD) {
            this.hitstop = C.HITSTOP_DURATION;
            if (this.renderer.wantsImpactFlash) {
              this.events.onImpactFlash(Math.min(1, h.strength / 4));
            }
          }
        }
        // The clock running out, announced. Ceil rather than floor so the pip
        // named "1" plays with a second still to go rather than as time expires.
        if (this.battle.phase === 'battle') {
          const pip = Math.ceil(C.ROUND_TIME_LIMIT - this.battle.roundTime);
          if (pip >= 1 && pip <= CLOCK_PIP_FROM && pip !== this.lastClockPip) {
            this.lastClockPip = pip;
            this.audio.countdown(pip);
          }
        }
      }

      // The round is decided, but hold on the stadium for a beat first.
      if (this.battle.phase !== 'battle' && this.finishHold <= 0) {
        this.finishHold = C.FINISH_HOLD_TIME;
        // How the round ENDED, on the frame it ended.
        //
        // Burst and ring-out are worth the same 2 points and a player who
        // cannot tell which rule just paid out cannot learn the rules, so they
        // get two different envelope shapes rather than two pitches of one —
        // one crack then debris, against a single continuous fall. The verdict
        // sting is deliberately NOT played here; see the finish-hold block.
        // A spin finish and a timeout get nothing here on purpose: the bed
        // winding down to a low, muffled wobble IS the sound of that ending,
        // and `pumpAudio` fades it out on this same frame now the phase has
        // left 'battle'. Firing a one-shot over it would talk across the one
        // cue the spin loop exists to deliver.
        const last = this.battle.lastRound;
        if (last?.reason === 'burst') this.audio.burst();
        else if (last?.reason === 'knockout') {
          this.audio.ringOut(last.xtremeFinish === true);
        }
        this.renderer.finish();
        // An Xtreme Finish is a knockout, but it must not be ANNOUNCED as one:
        // being handed 3 points and told "ring out" teaches the player that the
        // arena is arbitrary, which is the opposite of what a graded pocket is
        // for. The card is the only place the rule is ever explained.
        this.events.onFinish(
          last?.xtremeFinish ? 'xtreme' : (last?.reason ?? 'timeout'),
          last?.winnerId === PLAYER_ID,
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
        // The verdict, at the end of the hold rather than at the start of it.
        //
        // The finish sound and the sting are two different statements — "it
        // burst" and "you won" — and stacking them on the same frame turns both
        // into mush, because the finish duck drops the music to near-silence for
        // 0.9 s precisely so the finish can ring out alone. Landing the sting as
        // the result panel appears puts it on the thing it is describing.
        this.audio.roundEnd(this.battle.lastRound?.winnerId === PLAYER_ID);
        if (this.battle.phase === 'round-over') this.setScreen('round-over');
        else if (this.battle.phase === 'match-over') this.setScreen('match-over');
      }
    }

    // The spin bed, the grind and the music's intensity, once per frame.
    //
    // Outside the hitstop branch and outside the `phase === 'battle'` guard on
    // purpose: the bed has to keep breathing through a freeze — a frozen screen
    // in silence reads as a dropped frame — and it has to be told when the round
    // has stopped so it can fade out rather than be abandoned running.
    if (this.screen === 'battle') this.pumpAudio(dt);

    // Keep drawing on every screen so the stadium is never a dead frame.
    // During the finish hold the renderer runs slow; that is what sells it.
    const renderDt = this.finishHold > 0 ? dt * C.FINISH_RENDER_SCALE : dt;
    // Belt and braces alongside the fix in Battle.update: effects are only ever
    // driven by hits from a round that is actually running.
    const hits = this.screen === 'battle' ? this.battle.hits : EMPTY_HITS;
    const contacts = this.screen === 'battle' ? this.battle.contacts : EMPTY_HITS;
    // The aim line, resolved fresh every frame. See `resolveAim` — the
    // pointer names a point, so the DIRECTION changes as the top moves under
    // a stationary cursor, and a line computed once on pointermove would be
    // wrong within a tenth of a second.
    const me = this.battle.beys.find((b) => b.id === PLAYER_ID);
    const aiming = this.screen === 'battle' && !!me?.alive && me.moveTime <= 0;
    this.renderer.setAim(
      aiming ? PLAYER_ID : null,
      aiming ? this.resolveAim() : null,
      !!me && me.meter >= C.MOVES.charge.cost,
    );

    this.renderer.update(this.battle.beys, hits, renderDt, contacts);
    this.events.onFrame();
    if (this.running) requestAnimationFrame(this.tick);
  };
}

export { PLAYER_ID, AI_ID, C, LADDER, ARENAS };
