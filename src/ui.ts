import type { Game } from './game';
import { DISCS, DRIVERS, LAYERS, buildArchetype, deriveStats, makeBuild } from './sim/parts';
import { BEY_PRESETS } from './render/beydex';
import { beyThumb } from './render/beyThumb';
import { modelThumb } from './render/modelThumb';
import { setUnlockPreference, unlockPreference } from './devUnlock';
import { aimCharge, devMode, setAimCharge, setDevMode } from './prefs';
import {
  endRound,
  fillMeter,
  grantCoins,
  resetCareer,
  resetCup,
  rungOptions,
  setRung,
  summonNemesis,
  winCup,
} from './dev';
import { ARENAS } from './sim/arena';
import { shopSection } from './render/shopSection';
import { topModelFor } from './render/topModelIndex';
import * as C from './sim/constants';
import { SKINS, skinById } from './render/skins';
import type { Channel } from './audio/engine';
import type { RoundOutcome } from './progress';
import { MASTERY_NAMES, challengeById, masteryTier, masteryToNext } from './career';
import {
  CUP_PLAYER,
  CUP_PURSE,
  CUP_ROUNDS,
  CUP_ROUND_NAMES,
  CUP_TBD,
  cupBracket,
  cupEntrantById,
} from './tournament';
import { THEMES, themeById } from './render/theme';
import { MODES, modeById, stadiumsByLook } from './modes';
import { groupByClass } from './render/beyClass';
import { GarageView } from './render/garageView';
import { LADDER } from './ladder';
import type { BeyBuild, BeyState, MoveKind } from './sim/types';

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const pct = (n: number): string => `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;

/** Short, loud version of the finish reason for the title card. */
const FINISHER_WORD: Record<string, string> = {
  knockout: 'RING OUT',
  // Not a `Defeat` — the sim only knows 'knockout'. `game.ts` substitutes this
  // when the exit went through the arena's graded pocket, so the card can name
  // the rule that just paid out.
  xtreme: 'XTREME FINISH',
  burst: 'BURST FINISH',
  'spin-finish': 'SPIN FINISH',
  timeout: 'TIME UP',
  draw: 'DOUBLE KO',
};

const REASON_TEXT: Record<string, string> = {
  knockout: 'Ring out! +2',
  burst: 'Burst finish! +2',
  'spin-finish': 'Spin finish. +1',
  timeout: 'Time up — no points.',
  draw: 'Double elimination — no points.',
};

/** Which pairing a build wants: the two spins the same way, or against. */
type Pairing = 'same' | 'opposite' | 'either';

interface SpinRead {
  wants: Pairing;
  /** The whole build's archetype — layer and driver together, not the layer's. */
  arch: string;
  /** Why, in the player's words, read off this build's own numbers. */
  line: string;
}

/**
 * What spin direction is actually worth to a build, read off its own stats.
 *
 * THE GAME NEVER SAID. The garage has had a spin toggle since the beginning and
 * it read `left spin` / `right spin` — a cosmetic label on the largest decision
 * the game offers. Measured across the whole 37-build roster with the direction
 * FORCED, so the AI's own policy could not generate the evidence, the two
 * pairings are ±24 points apart:
 *
 *     attack    same 63.8%   opposite 40.2%    -23.6
 *     balance   same 37.6%   opposite 45.9%     +8.3
 *     defense   same 31.8%   opposite 56.8%    +25.0
 *     stamina   same 12.2%   opposite 35.9%    +23.8
 *
 * READ OFF THE STAT, NOT THE LABEL, and in that order — because `spinSteal` is
 * the whole story and the archetype is only its shadow. `resolvePair` pays the
 * drain in opposite spin alone, so the gain per build tracks the stat and not
 * the class: Fafnir (stamina, steal 0.62) gains +45.3 from opposite spin while
 * Silver Wolf (stamina, steal 0.00) gains +1.6. Explaining a stamina build by
 * its archetype average would therefore promise Silver Wolf twenty-four points
 * that only Fafnir collects.
 *
 * There is deliberately no per-bey table here. A build assembled by hand in the
 * Workshop has never been seen by anyone and has to be explained exactly as
 * accurately as a preset, so every sentence below is generated from the parts
 * the player actually has fitted.
 */
function spinRead(build: BeyBuild): SpinRead {
  const steal = build.layer.spinSteal;
  const same = build.layer.sameSteal ?? 0;
  // The BUILD's archetype, which is the layer's only when the driver agrees —
  // the same rule the AI's own policy and the measured table above both use.
  const arch = buildArchetype(build);

  // The vampire. One layer in the catalog declares `sameSteal`, and it is the
  // only build in the game whose drain is not simply switched off by a matched
  // spin — so it must not be told the same thing as Fafnir.
  if (steal > 0 && same > 0) {
    return {
      wants: 'opposite',
      arch,
      line:
        `Absorbs ${pct(steal)} of every hit it takes, and it is the one layer in the game ` +
        `that keeps draining in same spin — ${pct(steal * same)} of the rate survives a matched ` +
        'launch. Opposite spin is still where it does its real work.',
    };
  }

  if (steal > 0) {
    return {
      wants: 'opposite',
      arch,
      line:
        `Absorbs ${pct(steal)} of every hit it takes and turns it back into its own spin — ` +
        'but only against a top turning the other way. Match your rival and the drain is ' +
        'switched off completely, which is what makes this the biggest choice on the screen.',
    };
  }

  if (arch === 'attack') {
    return {
      wants: 'same',
      arch,
      line:
        'An attack build wants the SAME spin, which surprises most players. Measured across ' +
        'the roster it wins 24 points more often there — it is the one archetype that loses ' +
        'by opposing.',
    };
  }
  if (arch === 'defense') {
    return {
      wants: 'opposite',
      arch,
      line:
        'A defense build wants the OPPOSITE spin: 25 points better, measured. It has no drain ' +
        'of its own, so it collects less than an absorber would, but the direction still pays.',
    };
  }
  if (arch === 'stamina') {
    return {
      wants: 'opposite',
      arch,
      // The honest version of the archetype row. Stamina's +23.8 is real as an
      // average and misleading as advice: it is earned almost entirely by the
      // two layers that drain, and this build is not one of them.
      line:
        'Stamina prefers the OPPOSITE spin on average, but that average is earned by the ' +
        'layers that drain — and this one does not. Expect little either way; fit a layer ' +
        'with a drain stat and the choice starts mattering.',
    };
  }
  return {
    wants: 'either',
    arch,
    line:
      // Said out loud when it applies, because the layer chips advertise the
      // LAYER's archetype and a Valtryek on an Atomic driver reads here as
      // balance. Without this, the two screens look like they disagree.
      (build.layer.archetype !== build.driver.archetype
        ? // `An attack layer`, not `A attack layer` — the archetype names are
          // data, so the article has to be chosen rather than written.
          `${article(build.layer.archetype)} ${build.layer.archetype} layer on ` +
          `${article(build.driver.archetype)} ${build.driver.archetype} driver counts as balance. `
        : '') +
      'Balance sits between the two: +8 points for opposite spin across the roster, the ' +
      'narrowest gap of the four archetypes. Either pairing is playable with this build.',
  };
}

/** How hard this rival will try to get the pairing its build wants. */
const RIVAL_SPIN_SKILL: Record<string, string> = {
  // Tier-gated in `chooseSpinDir` by the AI's `spinRead` profile stat, which is
  // 0 / 0.5 / 1 across the three tiers — a rookie does not know the matchup
  // exists, a champion always launches for the pairing it wants.
  rookie: 'but a rookie does not know this matchup exists — its launch is near a coin flip',
  blader: 'and it finds that pairing about half the time',
  champion: 'and a champion launches for it every time',
};

/**
 * All DOM. Rebuilds the panels on screen changes and does a cheap per-frame
 * pass over just the live bars, so the HUD doesn't thrash the DOM at 60fps.
 */

/** `a` or `an`, for names that come from data rather than from prose. */
const article = (word: string): string => ('aeiou'.includes(word[0]) ? 'an' : 'a');

export class Ui {
  private root: HTMLElement;
  private live: {
    playerCard?: HTMLElement;
    rivalCard?: HTMLElement;
    needle?: HTMLElement;
    playerPts?: HTMLElement;
    rivalPts?: HTMLElement;
    rivalMove?: HTMLElement;
    coach?: HTMLElement;
    speedLines?: HTMLElement;
    moveButtons: Map<MoveKind, HTMLElement>;
  } = { moveButtons: new Map() };

  private game: Game;

  /**
   * The garage preview is created ONCE and re-parented on every render.
   *
   * render() wipes innerHTML, and the garage re-renders on every part click.
   * Building a fresh GarageView each time would allocate a new WebGLRenderer
   * per click and blow through the browser's ~16 live WebGL context limit in
   * seconds, after which the canvas silently stops drawing.
   */
  private garageView: GarageView | null = null;
  private garageCanvas: HTMLCanvasElement | null = null;
  /** Eased speed-line opacity, so it swells instead of snapping. */
  private speedEase = 0;
  /**
   * Which garage tab is open. UI state, not game state — it must not persist
   * into a save or affect anything the sim can see.
   */
  private garageTab: 'collection' | 'workshop' = 'collection';

  constructor(root: HTMLElement, game: Game) {
    this.root = root;
    this.game = game;
  }

  render(): void {
    const g = this.game;
    // Detach the preview canvas before the wipe so it survives innerHTML = ''.
    this.garageCanvas?.remove();
    if (g.screen !== 'garage') this.garageView?.stop();

    this.root.innerHTML = '';
    this.live = { moveButtons: new Map() };

    if (g.screen === 'home') {
      this.root.appendChild(this.home());
      return;
    }
    if (g.screen === 'mode') {
      this.root.appendChild(this.modeScreen());
      return;
    }
    if (g.screen === 'howto') {
      this.root.appendChild(this.howTo());
      return;
    }
    if (g.screen === 'garage') {
      this.root.appendChild(this.garage());
      return;
    }
    if (g.screen === 'stadium') {
      this.root.appendChild(this.stadiumScreen());
      return;
    }

    this.root.appendChild(this.scoreboard());
    this.root.appendChild(this.quitButton());
    this.root.appendChild(this.fighters());

    if (g.screen === 'battle') {
      this.root.appendChild(this.speedLines());
      this.root.appendChild(this.coach());
      this.root.appendChild(this.moveBar());
    }
    if (g.screen === 'launch') this.root.appendChild(this.launchBar());
    if (g.screen === 'round-over' || g.screen === 'match-over') {
      this.root.appendChild(this.result());
    }
  }

  /** Cheap per-frame update of only the values that change. */
  tick(): void {
    const g = this.game;

    if (this.live.needle && g.screen === 'launch') {
      this.live.needle.style.left = `calc(${g.launchMeter * 100}% - 2px)`;
    }

    if (this.live.playerCard) this.updateCard(this.live.playerCard, g.player);
    if (this.live.rivalCard) this.updateCard(this.live.rivalCard, g.rival);

    if (this.live.playerPts) this.live.playerPts.textContent = String(g.playerScore);
    if (this.live.rivalPts) this.live.rivalPts.textContent = String(g.rivalScore);

    // Move buttons: affordable, active, or too expensive right now.
    const p = g.player;
    if (p) {
      for (const [kind, el] of this.live.moveButtons) {
        const cost = C.MOVES[kind].cost;
        const active = p.move === kind && p.moveTime > 0;
        const busy = p.moveTime > 0;
        el.classList.toggle('active', active);
        el.classList.toggle('ready', !busy && p.meter >= cost);
        el.classList.toggle('locked', !busy && p.meter < cost);
        el.classList.toggle('busy', busy && !active);
        const timer = el.querySelector<HTMLElement>('.move-timer');
        if (timer) timer.textContent = active ? `${p.moveTime.toFixed(1)}s` : '';
      }
    }

    // Speed lines follow the renderer's intensity signal, eased so they swell
    // and fade rather than snapping on.
    const lines = this.live.speedLines;
    if (lines) {
      const target = g.intensity;
      this.speedEase += (target - this.speedEase) * 0.12;
      lines.style.opacity = String(this.speedEase);
    }

    this.updateCoach();

    // Show what the rival is doing — you can't counter what you can't see.
    const rivalMove = this.live.rivalMove;
    const r = g.rival;
    if (rivalMove) {
      if (r && r.move && r.moveTime > 0) {
        rivalMove.textContent = r.move.toUpperCase();
        rivalMove.className = `rival-move on ${r.move}`;
      } else {
        rivalMove.textContent = '';
        rivalMove.className = 'rival-move';
      }
    }
  }

  /**
   * The finisher title card: letterbox bars and the finish reason, shown during
   * the 1.15s hold that already exists. Pure CSS over the canvas — it converts
   * a beat that was previously dead time into the moment of the round.
   */
  showFinisher(reason: string, won: boolean): void {
    const el = document.createElement('div');
    el.className = `finisher ${won ? 'win' : 'lose'}`;
    el.innerHTML = `
      <div class="finisher-bar top"></div>
      <div class="finisher-word">${escapeHtml(FINISHER_WORD[reason] ?? 'FINISH')}</div>
      <div class="finisher-bar bottom"></div>`;
    this.root.appendChild(el);
    // Remove itself when the hold ends; the result panel takes over from here.
    window.setTimeout(() => el.remove(), 1400);
  }

  /**
   * "PERFECT LAUNCH" — the confirmation the launch minigame never had.
   *
   * The green band on the meter grants real spin (PERFECT_LAUNCH_SPIN_BONUS),
   * and the how-to-play screen tells the player to aim for it. But the sim's
   * `perfectLaunch` flag was written and read by nothing, so hitting it felt
   * identical to missing it — the one input the player makes before the round
   * starts had no response at all.
   *
   * Deliberately brief and out of the way. It fires at the exact moment the
   * tops are dropping in, so it must not compete with the entry: 900ms, above
   * the dish, and gone before the first clash.
   */
  showPerfectLaunch(): void {
    const el = document.createElement('div');
    el.className = 'perfect-launch';
    el.innerHTML = `<span>PERFECT LAUNCH</span><small>+${Math.round(
      C.PERFECT_LAUNCH_SPIN_BONUS * 100,
    )}% spin</small>`;
    this.root.appendChild(el);
    window.setTimeout(() => el.remove(), 900);
  }

  /**
   * Announce the objectives a round just finished, and any mastery tier it
   * crossed.
   *
   * Deliberately a transient banner rather than a line on the result screen. An
   * objective is a small, frequent reward and it has to land in the moment it
   * was earned — a list the player discovers later in a menu teaches them the
   * menu, not the objective. Same reasoning as `showPerfectLaunch`, which
   * exists because a bonus applied silently was a bonus nobody knew they had.
   *
   * Stacks vertically when several land at once, which is common: a decisive
   * round can close a daily and a weekly together.
   */
  showObjectives(outcome: RoundOutcome): void {
    const el = document.createElement('div');
    el.className = 'objectives-pop';
    const rows = outcome.completed
      .map(
        (c) =>
          `<div class="objective-row"><span class="objective-name">${c.text}</span>` +
          `<span class="objective-scope">${c.scope}</span></div>`,
      )
      .join('');
    const mastery =
      outcome.masteryTier > 0
        ? `<div class="objective-mastery">${MASTERY_NAMES[outcome.masteryTier - 1]} — ${LAYERS.find((l) => l.id === outcome.masteryLayerId)?.name ?? outcome.masteryLayerId}</div>`
        : '';
    el.innerHTML =
      `<div class="objectives-head">OBJECTIVE${outcome.completed.length > 1 ? 'S' : ''} COMPLETE</div>` +
      rows +
      mastery +
      `<div class="objectives-coins">+${outcome.coins} coins</div>`;
    this.root.appendChild(el);
    // Longer than the perfect-launch flash: this one has words to read, and
    // several of them when a weekly lands with a daily.
    window.setTimeout(() => el.remove(), 2600);
  }

  /**
   * Leave the match. Present on every in-match screen, because there was no
   * way out of a battle at all — once launched, the only exit was to finish.
   *
   * Deliberately small and cornered rather than a prominent button: it must be
   * findable when wanted and ignorable otherwise, and a large "quit" competing
   * with the move bar would get hit by accident mid-clash.
   */
  private quitButton(): HTMLElement {
    const el = document.createElement('button');
    el.className = 'quit-btn';
    el.innerHTML = '<span>Quit</span><small>Esc</small>';
    el.title = 'Abandon this match and return to the garage';
    el.addEventListener('click', () => this.game.quitToGarage());
    return el;
  }

  /** Flash a move button that the player couldn't afford. */
  rejectMove(kind: MoveKind): void {
    const el = this.live.moveButtons.get(kind);
    if (!el) return;
    el.classList.remove('reject');
    // Force a reflow so the animation restarts on repeated presses.
    void el.offsetWidth;
    el.classList.add('reject');
  }

  private updateCard(card: HTMLElement, bey: BeyState | null): void {
    if (!bey) return;
    const spin = card.querySelector<HTMLElement>('.fill-spin');
    const burst = card.querySelector<HTMLElement>('.fill-burst');
    const meter = card.querySelector<HTMLElement>('.fill-meter');
    const spinTxt = card.querySelector<HTMLElement>('.spin-val');

    const spinFrac = Math.abs(bey.spin) / bey.spinAtLaunch;
    if (spin) spin.style.width = pct(spinFrac);
    if (spinTxt) spinTxt.textContent = pct(spinFrac);
    if (burst) burst.style.width = pct(bey.burst);
    if (meter) {
      meter.style.width = pct(bey.meter);
      meter.classList.toggle('ready', bey.meter >= 1);
    }
    card.classList.toggle('out', !bey.alive);
  }

  // ------------------------------------------------------------------ views

  private scoreboard(): HTMLElement {
    const g = this.game;
    const el = document.createElement('div');
    el.className = 'scoreboard';
    el.innerHTML = `
      <div class="side">
        <span class="name">You</span>
        <span class="pts" data-you>${g.playerScore}</span>
      </div>
      <div class="side" style="min-width:auto">
        <span class="vs">FIRST TO ${C.POINTS_TO_WIN}</span>
        <span class="round">ROUND ${Math.max(1, g.battle.roundNumber)}</span>
      </div>
      <div class="side">
        <span class="name">${escapeHtml(g.aiName)}</span>
        <span class="pts" data-rival>${g.rivalScore}</span>
      </div>`;
    this.live.playerPts = el.querySelector('[data-you]') as HTMLElement;
    this.live.rivalPts = el.querySelector('[data-rival]') as HTMLElement;
    return el;
  }

  private fighters(): HTMLElement {
    const g = this.game;
    const wrap = document.createElement('div');
    wrap.className = 'fighters';

    const player = this.card('Your Bey', g.player, true, g.playerSpinDir);
    const rival = this.card(g.aiName, g.rival, false, g.rivalSpinDir);
    this.live.playerCard = player;
    this.live.rivalCard = rival;

    wrap.appendChild(player);
    wrap.appendChild(rival);
    return wrap;
  }

  private card(
    title: string,
    bey: BeyState | null,
    isPlayer: boolean,
    spinDir: 1 | -1,
  ): HTMLElement {
    const el = document.createElement('div');
    el.className = 'card';
    const build = bey?.build ?? this.game.playerBuild;
    const spinLabel = spinDir === 1 ? '↻ right' : '↺ left';
    // The card is keyed to the *skin*, which is also what the top on the dish
    // is wearing — so card and bey are linked by the same colour rather than by
    // an ownership marker drawn on top of the scene.
    const skin = skinById(
      isPlayer ? this.game.playerSkinId : this.game.rivalSkinId,
    );
    const skinColour = hex(skin.primary);
    el.innerHTML = `
      <h3>
        <span class="who" style="--marker:${skinColour}">
          <i class="swatch" style="background:${skinColour}"></i>${escapeHtml(title)}
        </span>
        <span class="spin-dir">${spinLabel}</span>
      </h3>
      <p class="parts">${escapeHtml(build.layer.name)} · ${escapeHtml(build.disc.name)} · ${escapeHtml(build.driver.name)}</p>
      <div class="bar-label"><span>Spin</span><span class="spin-val">100%</span></div>
      <div class="bar"><i class="fill-spin" style="width:100%"></i></div>
      <div class="bar-label"><span>Burst</span><span></span></div>
      <div class="bar"><i class="fill-burst" style="width:0%"></i></div>
      <div class="bar-label"><span>Meter</span><span></span></div>
      <div class="bar"><i class="fill-meter" style="width:0%"></i></div>
      ${isPlayer ? '' : '<div class="rival-move"></div>'}`;
    if (!isPlayer) {
      this.live.rivalMove = el.querySelector('.rival-move') as HTMLElement;
    }
    return el;
  }

  /**
   * The three moves. Each shows its key, its meter cost, and what it is for —
   * a player who can't see why to press a button won't press it.
   */
  private moveBar(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'moves';

    const defs: [MoveKind, string, string, string][] = [
      ['charge', 'SPACE', 'Charge', aimCharge() ? 'aim & smash' : 'hunt & smash'],
      ['block', 'A', 'Block', 'absorb a hit'],
      ['dodge', 'S', 'Dodge', 'break away'],
    ];

    for (const [kind, key, label, blurb] of defs) {
      const btn = document.createElement('button');
      btn.className = 'move';
      btn.dataset.move = kind;
      btn.innerHTML = `
        <span class="move-key">${key}</span>
        <span class="move-name">${label}</span>
        <span class="move-blurb">${blurb}</span>
        <span class="move-cost">${Math.round(C.MOVES[kind].cost * 100)}</span>
        <span class="move-timer"></span>`;
      btn.addEventListener('click', () => {
        if (!this.game.useMove(kind)) this.rejectMove(kind);
      });
      this.live.moveButtons.set(kind, btn);
      el.appendChild(btn);
    }
    return el;
  }

  /**
   * A single line of contextual coaching, shown only for the first couple of
   * matches. It names the situation and the key that answers it, because the
   * move names alone were not teaching anyone what to press.
   */
  /**
   * Radial speed lines. Pure CSS over the canvas, so it costs the renderer
   * nothing and can't destabilise the 3D path — but it is most of what makes
   * fast motion read as *anime* fast rather than merely quick.
   */
  private speedLines(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'speedlines';
    this.live.speedLines = el;
    return el;
  }

  /** Full-screen pulse on a heavy clash. */
  impactFlash(strength: number): void {
    const el = document.createElement('div');
    el.className = 'impact-flash';
    el.style.setProperty('--flash', String(Math.min(1, strength)));
    this.root.appendChild(el);
    window.setTimeout(() => el.remove(), 260);
  }

  private coach(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'coach';
    this.live.coach = el;
    return el;
  }

  private updateCoach(): void {
    const el = this.live.coach;
    const g = this.game;
    if (!el) return;

    // Stop nagging once the player has clearly got it.
    if (g.battlesPlayed >= 2) {
      el.textContent = '';
      el.className = 'coach';
      return;
    }

    const you = g.player;
    const them = g.rival;
    if (!you || !them || !you.alive) {
      el.textContent = '';
      el.className = 'coach';
      return;
    }

    let msg = '';
    let tone = '';

    if (you.move && you.moveTime > 0) {
      msg = `${you.move.toUpperCase()} active — ${you.moveTime.toFixed(1)}s`;
      tone = 'good';
    } else if (them.move === 'charge' && them.moveTime > 0) {
      msg = 'Rival is CHARGING — tap A to Block it';
      tone = 'urgent';
    } else if (them.move === 'block' && them.moveTime > 0) {
      msg = 'Rival is BLOCKING — tap S to Dodge and make it waste the meter';
      tone = 'urgent';
    } else if (them.move === 'dodge' && them.moveTime > 0) {
      msg = 'Rival is DODGING — tap SPACE to Charge it down';
      tone = 'urgent';
    } else if (you.railTime > 0) {
      msg = 'ON THE RAIL — it will slingshot you across the dish';
      tone = 'good';
    } else if (them.railTime > 0) {
      msg = 'Rival is on the rail — tap A to Block the slingshot';
      tone = 'urgent';
    } else if (you.meter >= 1) {
      // TEACH THE AIM BY CONTRAST. Charge is aimed now, and an aim is
      // invisible until the player happens to move the pointer over the dish —
      // so a single static line naming three keys would leave the game's one
      // positional control undiscovered. These two messages swap as soon as the
      // pointer moves, which is the whole lesson in one gesture.
      // The teach-by-contrast line only makes sense while aiming is ON. With
      // it off there is nothing to point, so naming the keys is the whole
      // lesson again.
      if (!aimCharge()) {
        msg = 'Meter full — SPACE to Charge, A to Block, S to Dodge';
        tone = '';
      } else {
        msg = g.aiming
          ? 'Aimed — SPACE sends the Charge along the arrows'
          : 'Meter full — move the mouse to AIM your Charge, then SPACE';
        tone = g.aiming ? 'good' : '';
      }
    } else if (you.burst > 0.55) {
      msg = 'Burst gauge is high — tap S to Dodge before the next hit';
      tone = 'urgent';
    } else if (you.spinStolen > 0) {
      // THE MECHANIC, NAMED AT THE MOMENT IT IS VISIBLE. A drain is the one
      // thing in this game that looks like a bug while it happens — a top that
      // was dying climbs back — and the garage's explanation is two screens
      // away by then. Lowest priority on purpose: it is a lesson, not a prompt,
      // so it only takes the line when nothing needs pressing.
      msg = 'You are DRAINING it — that only works because you launched opposite spin';
      tone = 'good';
    } else if (
      g.playerSpinDir === g.rivalSpinDir &&
      you.build.layer.spinSteal > 0 &&
      (you.build.layer.sameSteal ?? 0) === 0
    ) {
      msg = 'Same spin — your bey’s drain is switched off this round. Oppose it next time.';
      tone = '';
    } else {
      msg = 'Meter is filling. Watch the rival card for its move.';
      tone = '';
    }

    if (el.textContent !== msg) el.textContent = msg;
    el.className = `coach on ${tone}`;
  }

  private launchBar(): HTMLElement {
    const g = this.game;
    const el = document.createElement('div');
    el.className = 'launch';
    el.innerHTML = `
      <div class="track">
        <div class="sweet"></div>
        <div class="needle"></div>
      </div>
      <p><b>Tap <kbd>SPACE</kbd> once</b> to let it rip. Stop the needle in the green band for a perfect launch and bonus spin.</p>`;
    this.live.needle = el.querySelector('.needle') as HTMLElement;

    // LAUNCHER TILT — the player's only positional input.
    //
    // Everything else in a battle is a timing decision: three move buttons and
    // a meter to stop. Tilt is the one thing that decides WHERE the round
    // happens, and it is chosen before the launch because that is when a real
    // blader chooses it — the launcher angle is set before the rip, not
    // adjusted mid-battle.
    //
    // Three presets rather than a slider. The measured difference between them
    // is large and the difference within them is not, so a continuous control
    // would offer a precision that does not exist.
    // The notes name the TRADE-OFF, not just the shape, because there is a
    // real one and it is not obvious. Measured: any tilt costs rail access,
    // because riding the rail needs a stable rim orbit and an oscillating top
    // crosses the band instead of sitting in it. Flat is the rail launch.
    const tilts: [string, number, string][] = [
      ['Dive', -0.7, 'in and back out — crosses the middle'],
      ['Flat', 0, 'holds one orbit — best for the rail'],
      ['Bank', 0.7, 'out and back in — wide, misses the rail'],
    ];
    const row = document.createElement('div');
    row.className = 'chips launch-tilt';
    for (const [label, value, note] of tilts) {
      const chip = document.createElement('button');
      chip.className = 'chip' + (Math.abs(g.launchTilt - value) < 0.05 ? ' on' : '');
      chip.innerHTML = `<span>${escapeHtml(label)}<br><small>${escapeHtml(note)}</small></span>`;
      chip.addEventListener('click', () => {
        g.setLaunchTilt(value);
        this.render();
      });
      row.appendChild(chip);
    }
    el.appendChild(row);
    return el;
  }

  /**
   * What the round just paid, on the screen the player is actually looking at.
   *
   * The banner that fires mid-round is the reward LANDING — it has to be in the
   * moment or it teaches nothing. This is the receipt, and both are needed:
   * the banner is transient by design and a player watching the tops is exactly
   * the player who missed it. A reward nobody can confirm afterwards may as
   * well not have been paid.
   *
   * Silent when the round earned nothing, rather than showing a row of zeroes.
   * "You earned: nothing" is worse than no line at all.
   */
  private earnedHtml(): string {
    const o = this.game.lastRoundOutcome;
    if (!o || (!o.completed.length && o.masteryTier === 0)) return '';

    const rows = o.completed
      .map(
        (c) =>
          `<li><span class="earned-tick">✓</span>${escapeHtml(c.text)}` +
          `<span class="earned-scope">${escapeHtml(c.scope)}</span></li>`,
      )
      .join('');
    const layer = LAYERS.find((l) => l.id === o.masteryLayerId);
    const mastery =
      o.masteryTier > 0
        ? `<li><span class="earned-tick">★</span>${escapeHtml(
            MASTERY_NAMES[o.masteryTier - 1],
          )} with ${escapeHtml(layer?.name ?? o.masteryLayerId)}` +
          `<span class="earned-scope">mastery</span></li>`
        : '';

    return `
      <div class="earned">
        <div class="earned-head">Earned this round${o.coins > 0 ? ` · +${o.coins} coins` : ''}</div>
        <ul>${rows}${mastery}</ul>
      </div>`;
  }

  private result(): HTMLElement {
    const g = this.game;
    const r = g.battle.lastRound;
    const matchOver = g.screen === 'match-over';
    const won = matchOver
      ? g.battle.matchWinnerId === 'player'
      : r?.winnerId === 'player';

    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    const title = matchOver
      ? won
        ? 'MATCH WON'
        : 'MATCH LOST'
      : r?.winnerId
        ? won
          ? 'ROUND WON'
          : 'ROUND LOST'
        : 'DRAW';
    const cls = !r?.winnerId && !matchOver ? 'tie' : won ? 'win' : 'lose';

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.width = 'min(520px, 92vw)';
    // A round that only reports its outcome teaches nothing. The breakdown is
    // what lets a player work out *why* they lost and change something.
    const you = g.player;
    const them = g.rival;
    const breakdown =
      you && them
        ? `
      <table class="breakdown">
        <thead>
          <tr><th></th><th>You</th><th>${escapeHtml(g.aiName)}</th></tr>
        </thead>
        <tbody>
          <tr><td>Spin left</td><td>${pct(Math.abs(you.spin) / you.spinAtLaunch)}</td><td>${pct(Math.abs(them.spin) / them.spinAtLaunch)}</td></tr>
          <tr><td>Hits landed</td><td>${you.hitsLanded}</td><td>${them.hitsLanded}</td></tr>
          <tr><td>Spin drained</td><td>${Math.round(you.spinDealt)}</td><td>${Math.round(them.spinDealt)}</td></tr>
          ${
            you.spinStolen > 0 || them.spinStolen > 0
              ? `<tr><td>Spin absorbed</td><td>${Math.round(you.spinStolen)}</td><td>${Math.round(them.spinStolen)}</td></tr>`
              : ''
          }
          <tr><td>Biggest hit</td><td>${you.biggestHit.toFixed(1)}</td><td>${them.biggestHit.toFixed(1)}</td></tr>
          ${
            // Arena-specific rows, shown only when the arena that produces them
            // was actually played. Both numbers were computed by the sim and
            // documented as "shown in the breakdown" while the breakdown showed
            // neither — so the arena's whole effect on a round was invisible in
            // the one screen that explains what just happened.
            you.railRides > 0 || them.railRides > 0
              ? `<tr><td>Rail rides</td><td>${you.railRides}</td><td>${them.railRides}</td></tr>`
              : ''
          }
          ${
            you.pitDrained > 0 || them.pitDrained > 0
              ? `<tr><td>Spin lost to the pit</td><td>${Math.round(you.pitDrained)}</td><td>${Math.round(them.pitDrained)}</td></tr>`
              : ''
          }
          <tr><td>Moves used</td><td>${you.movesUsed}</td><td>${them.movesUsed}</td></tr>
          <tr><td>Burst charge</td><td>${pct(you.burst)}</td><td>${pct(them.burst)}</td></tr>
        </tbody>
      </table>`
        : '';

    panel.innerHTML = `
      <p class="result-title ${cls}">${title}</p>
      <p class="result-reason">${escapeHtml(
        r?.xtremeFinish
          ? `Xtreme Finish! +${r.points}`
          : REASON_TEXT[r?.reason ?? 'timeout'] ?? '',
      )}</p>
      <p class="sub">You ${g.playerScore} — ${g.rivalScore} ${escapeHtml(g.aiName)}</p>
      ${breakdown}
      ${this.earnedHtml()}
      ${matchOver ? this.unlockHtml() : ''}
      <div class="row">
        <button class="primary" data-next>${matchOver ? 'Back to garage' : 'Next round'}</button>
      </div>`;
    panel.querySelector('[data-next]')?.addEventListener('click', () => g.next());
    overlay.appendChild(panel);
    return overlay;
  }

  /**
   * The exploded preview: the top pulled apart, each part labelled and spinning
   * on its own axis. A parts list tells you a build's numbers; this shows you
   * what you are actually assembling.
   */

  /**
   * Spin direction — the biggest decision in the game, and the one it never
   * explained.
   *
   * This was two chips reading `clockwise` / `counter-clockwise` and one line
   * of flavour that was, on the measurements, backwards: it promised stamina an
   * attrition race it wins by default, when what stamina actually wants is the
   * pairing where its drain exists at all. A ±24 point decision was dressed as
   * a cosmetic label.
   *
   * So the section now answers the three questions a player has here, in the
   * order they have them: what does this do for the bey I am holding, what am I
   * about to walk into, and — for the first two matches only — what is a spin
   * pairing in the first place.
   */
  private spinSection(): HTMLElement {
    const g = this.game;
    const spinRow = document.createElement('div');
    spinRow.className = 'slot';
    spinRow.innerHTML = '<h4>Spin direction — the largest decision in the game</h4>';

    const read = spinRead(g.playerBuild);

    const spinChips = document.createElement('div');
    spinChips.className = 'chips';
    // The bey's canonical direction, so the toggle stops jumping for no visible
    // reason when a preset is picked — choosing Fafnir chooses left spin, and
    // the chip should say so rather than leave the player to notice.
    const canon = BEY_PRESETS.find((p) => p.layerId === g.playerBuild.layer.id);
    const spins: [1 | -1, string, string][] = [
      [1, 'Right spin', 'clockwise'],
      [-1, 'Left spin', 'counter-clockwise'],
    ];
    for (const [dir, label, note] of spins) {
      const chip = document.createElement('button');
      chip.className = 'chip' + (g.playerSpinDir === dir ? ' on' : '');
      const asBuilt = canon?.spinDir === dir ? ' · as designed' : '';
      chip.innerHTML = `<span>${escapeHtml(label)}<br><small>${escapeHtml(
        note + asBuilt,
      )}</small></span>`;
      chip.addEventListener('click', () => {
        g.playerSpinDir = dir;
        this.render();
      });
      spinChips.appendChild(chip);
    }
    spinRow.appendChild(spinChips);

    // WHAT THIS BEY WANTS. Generated from the fitted parts, so it is as true of
    // a hand-assembled Workshop build as it is of a preset.
    const want = document.createElement('p');
    want.className = 'spin-read';
    const wantWord =
      read.wants === 'either'
        ? '<b class="either">either pairing</b>'
        : `<b class="${read.wants}">${read.wants} spin</b>`;
    want.innerHTML =
      `<span class="spin-read-head">This ${escapeHtml(read.arch)} build wants ${wantWord}</span>` +
      `<span class="spin-read-body">${escapeHtml(read.line)}</span>`;
    spinRow.appendChild(want);

    // WHAT YOU ARE WALKING INTO. The rival's build is known here — the ladder
    // fixes it — so the one thing the player cannot see is which way it will
    // launch, and that is precisely because it commits blind. Saying so is the
    // difference between a read and a guess.
    const rival = g.currentRival;
    const rivalBuild = rival.build();
    const rivalRead = spinRead(rivalBuild);
    const rivalSteal = rivalBuild.layer.spinSteal;
    const opp = document.createElement('p');
    opp.className = 'spin-vs';
    opp.textContent =
      `${rival.name} brings ${rival.beyName} — ${buildArchetype(rivalBuild)}` +
      (rivalSteal > 0 ? `, drains ${pct(rivalSteal)}` : ', no drain') +
      `. It wants ${rivalRead.wants === 'either' ? 'either pairing' : `${rivalRead.wants} spin`}, ` +
      `${RIVAL_SPIN_SKILL[rival.difficulty] ?? ''}. You both launch at the same moment and ` +
      'neither of you sees the other choose, so this is a read, not a counter.';
    spinRow.appendChild(opp);

    // FIRST TIME ONLY, on the same gate as the in-battle coach: two matches,
    // then it stops. A modal would make the player dismiss the one screen that
    // explains the mechanic; a line that expires teaches and then gets out of
    // the way. See `updateCoach`.
    if (g.battlesPlayed < 2) {
      const coach = document.createElement('p');
      coach.className = 'coach-note';
      coach.textContent =
        'New here? Both tops spin one way or the other. Turning the SAME way as your rival is a ' +
        'shoving match; turning against it is a spin-draining one, and only some beys are built ' +
        'to win that. Nothing else you choose is worth as much.';
      spinRow.appendChild(coach);
    }

    return spinRow;
  }

  /**
   * Audio: one switch per bus, plus a master level.
   *
   * FOUR switches rather than one "sound" toggle, because the four fail
   * differently and a player who wants three of them has to be able to say so.
   * The two continuous channels are the reason the split exists at all: they are
   * the only sounds in the game that never stop, so they are the only ones that
   * can become fatiguing, and "turn the arena off but keep the hits" is a real
   * preference that a single toggle cannot express. Music gets its own for the
   * most common preference there is — something else is already playing.
   *
   * The level is a separate question from the switches and gets a separate
   * control: which of these do I want to hear at all, versus how loud is this
   * game against everything else on the machine.
   *
   * Persistence is the AudioEngine's own — it writes every change straight to
   * localStorage under its settings key, the same shape as `saveThemeId` and
   * `saveImpactFrames`, so there is nothing to save from here.
   */
  private audioSection(): HTMLElement {
    const g = this.game;
    const row = document.createElement('div');
    row.className = 'slot';
    row.style.marginTop = '20px';
    row.innerHTML = '<h4>Audio</h4>';

    const chips = document.createElement('div');
    chips.className = 'chips';
    const channels: [Channel, string, string][] = [
      ['master', 'All sound', 'everything'],
      ['effects', 'Impacts & cues', 'hits, launches, moves'],
      ['spin', 'Arena bed', 'spin whine — pitch tracks spin left'],
      ['music', 'Music', 'builds as the round gets close'],
    ];
    for (const [ch, label, note] of channels) {
      const chip = document.createElement('button');
      const set = (): void => {
        chip.className = 'chip' + (g.audio.isOn(ch) ? ' on' : '');
        chip.innerHTML = `<span>${escapeHtml(label)}<br><small>${escapeHtml(
          g.audio.isOn(ch) ? note : 'off',
        )}</small></span>`;
      };
      set();
      chip.addEventListener('click', () => {
        // The click IS the gesture, and for a player who opens the settings
        // before ever pressing Play it is the first one — so unmuting has to
        // build the context, or the switch reads as broken.
        g.audio.resume();
        g.audio.setChannel(ch, !g.audio.isOn(ch));
        set();
      });
      chips.appendChild(chip);
    }
    row.appendChild(chips);

    const vol = document.createElement('label');
    vol.className = 'volume';
    const readout = document.createElement('b');
    readout.textContent = pct(g.audio.volume);
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    // Whole percent. The gain is continuous underneath, but a step finer than
    // this is a step nobody can hear and a slider nobody can land on.
    slider.step = '1';
    slider.value = String(Math.round(g.audio.volume * 100));
    slider.setAttribute('aria-label', 'Master volume');
    // 'input' rather than 'change' so the level moves under the thumb — a volume
    // control that only applies on release cannot be set by ear, which is the
    // only way anyone sets one.
    slider.addEventListener('input', () => {
      const v = Number(slider.value) / 100;
      g.audio.resume();
      g.audio.setVolume(v);
      readout.textContent = pct(v);
    });
    const label = document.createElement('span');
    label.textContent = 'Volume';
    vol.appendChild(label);
    vol.appendChild(slider);
    vol.appendChild(readout);
    row.appendChild(vol);

    return row;
  }

  private explodedView(): HTMLElement {
    const g = this.game;
    const wrap = document.createElement('div');
    wrap.className = 'exploded';

    const stage = document.createElement('div');
    stage.className = 'exploded-stage';

    if (!this.garageCanvas) {
      this.garageCanvas = document.createElement('canvas');
      this.garageCanvas.className = 'exploded-canvas';
    }
    stage.appendChild(this.garageCanvas);

    // Labels sit at the same three heights as the parts, with a connector rule,
    // so the diagram reads without projecting 3D positions every frame.
    const labels = document.createElement('div');
    labels.className = 'exploded-labels';
    // The drain belongs on the layer line and nowhere else: it is a property of
    // the layer, it is the most valuable stat in the game for the builds that
    // have it, and this label was listing blade COUNT while saying nothing
    // about it. A bey that drains looked identical to one that does not.
    const steal = g.playerBuild.layer.spinSteal;
    const rows: [string, string, string][] = [
      [
        'layer',
        g.playerBuild.layer.name,
        `${g.playerBuild.layer.archetype} · ${g.playerBuild.layer.blades} blades` +
          (steal > 0 ? ` · drains ${pct(steal)} in opposite spin` : ''),
      ],
      ['disc', g.playerBuild.disc.name, `${g.playerBuild.disc.mass}kg · stability ${g.playerBuild.disc.stability}`],
      ['driver', g.playerBuild.driver.name, `${g.playerBuild.driver.archetype} · spin ${g.playerBuild.driver.spinRetention}`],
    ];
    for (const [slot, name, note] of rows) {
      const row = document.createElement('div');
      row.className = `exploded-row ${slot}`;
      row.innerHTML = `
        <span class="exploded-rule"></span>
        <span class="exploded-text">
          <b>${escapeHtml(name)}</b>
          <small>${escapeHtml(slot.toUpperCase())} — ${escapeHtml(note)}</small>
        </span>`;
      labels.appendChild(row);
    }

    wrap.appendChild(stage);
    wrap.appendChild(labels);

    const hint = document.createElement('p');
    hint.className = 'exploded-hint';
    hint.textContent = 'Drag to rotate.';
    wrap.appendChild(hint);

    // Build/refresh after the element is in the DOM so the canvas has a size.
    requestAnimationFrame(() => {
      if (!this.garageCanvas) return;
      if (!this.garageView) this.garageView = new GarageView(this.garageCanvas);
      this.garageView.setBuild(g.playerBuild, g.playerSkinId, g.themeId);
      this.garageView.start();
    });

    return wrap;
  }

  /** Title screen. The game used to open straight onto a wall of part chips. */
  private home(): HTMLElement {
    const g = this.game;
    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    const panel = document.createElement('div');
    panel.className = 'panel home-panel';
    panel.innerHTML = `
      <h1 class="home-title">BEYBLADE<span>ARENA</span></h1>
      <p class="home-tag">Build a top. Read your rival. Let it rip.</p>`;

    const row = document.createElement('div');
    row.className = 'row home-row';

    // Play goes to the mode choice, not straight to the garage. The mode
    // decides which beyblade gets built at all — see modes.ts — so arriving in
    // the garage without having made it means being shown a roster that is
    // whatever last session happened to leave in storage.
    const play = document.createElement('button');
    play.className = 'primary';
    play.textContent = 'Play';
    play.addEventListener('click', () => g.goTo('mode'));

    // Inspect is a destination now, not a link in the footer. Judging a design
    // is the thing this project does most often, and it was reached by knowing
    // a filename.
    const inspect = document.createElement('a');
    inspect.className = 'primary ghost as-button';
    inspect.href = 'inspect.html';
    inspect.textContent = 'Inspect';

    const how = document.createElement('button');
    how.className = 'primary ghost';
    how.textContent = 'How to play';
    how.addEventListener('click', () => g.goTo('howto'));

    row.appendChild(play);
    row.appendChild(inspect);
    row.appendChild(how);
    panel.appendChild(row);

    // The visual style chips used to sit here AND in the garage. Both are gone:
    // the look is now part of choosing a stadium, because a look with no arena
    // attached is not somewhere you can have a match. See modes.ts.

    // Career state, so the home screen answers "where was I?".
    const d = g.progress.data;
    const career = document.createElement('div');
    career.className = 'career';
    if (g.progress.cleared) {
      // Past the ladder the game used to just say "cleared" and stop. Now the
      // run itself is the content, so this shows the two numbers that matter:
      // how deep you are right now, and how deep you have ever been.
      const next = g.currentRival;
      career.innerHTML = `
        <div class="career-line">Endless · <b>Round ${d.endless + 1}</b> — ${escapeHtml(
          next.name,
        )}, ${escapeHtml(next.beyName)}</div>
        <div class="career-stats">
          ${d.endless > 0 ? `${d.endless} deep this run · ` : ''}best ${d.bestEndless} ·
          ${d.wins}W · ${d.losses}L
        </div>
        <div class="career-stats">Ladder cleared — a loss ends the run, nothing else.</div>`;
    } else {
      const next = g.currentRival;
      career.innerHTML = `
        <div class="career-line">Next up · <b>${escapeHtml(next.name)}</b>, ${escapeHtml(next.title)}</div>
        <div class="career-progress">
          ${LADDER.map((_, i) => `<i class="${i < d.rung ? 'done' : i === d.rung ? 'now' : ''}"></i>`).join('')}
        </div>
        <div class="career-stats">${d.rung} of ${LADDER.length} beaten · ${d.wins}W · ${d.losses}L</div>`;
    }
    panel.appendChild(career);

    const hint = document.createElement('p');
    hint.className = 'sub';
    hint.style.marginTop = '18px';
    hint.textContent =
      'New here? How to play takes about a minute and covers the one thing that decides most battles.';
    panel.appendChild(hint);

    const tools = document.createElement('p');
    tools.className = 'sub home-tools';
    tools.textContent = 'Inspect — every top, up close, on a turntable.';
    panel.appendChild(tools);

    overlay.appendChild(panel);
    return overlay;
  }

  /**
   * Mode select: the first choice, and the one that decides what a beyblade is.
   *
   * This screen exists because the alternative was a "visual style" row at the
   * bottom of the garage, under two shops. That row was not a cosmetic setting
   * — `theme.toon` picks between two different construction paths, so it was
   * silently choosing between the designed roster and the prototype's plain
   * metal tops. A decision that large cannot be the ninth thing on a screen.
   *
   * Two cards rather than a chip row, because the two are not variants of one
   * another. Each says what its beyblades are, since that is the actual
   * difference and the reason the choice comes first.
   */
  private modeScreen(): HTMLElement {
    const g = this.game;
    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    const panel = document.createElement('div');
    panel.className = 'panel mode-panel';
    panel.innerHTML = `
      <h2>Choose your game</h2>
      <p class="sub">This sets what the beyblades are, not just how they look.</p>`;

    const cards = document.createElement('div');
    cards.className = 'mode-cards';

    for (const m of MODES) {
      const card = document.createElement('button');
      card.className = 'mode-card' + (g.modeId === m.id ? ' on' : '');
      card.style.setProperty('--accent', '#' + m.accent.toString(16).padStart(6, '0'));
      const looks = m.themeIds.map((id) => themeById(id).name).join(' · ');
      card.innerHTML = `
        <span class="mode-name">${escapeHtml(m.name)}</span>
        <span class="mode-tag">${escapeHtml(m.tagline)}</span>
        <span class="mode-blurb">${escapeHtml(m.blurb)}</span>
        <span class="mode-looks">${escapeHtml(looks)}</span>`;
      card.addEventListener('click', () => {
        g.setMode(m.id);
        g.goTo('garage');
      });
      cards.appendChild(card);
    }
    panel.appendChild(cards);

    const row = document.createElement('div');
    row.className = 'row';
    const back = document.createElement('button');
    back.className = 'primary ghost';
    back.textContent = 'Back';
    back.addEventListener('click', () => g.goTo('home'));
    row.appendChild(back);
    panel.appendChild(row);

    overlay.appendChild(panel);
    return overlay;
  }

  /**
   * Stadium select: where the fight happens, arena and look together.
   *
   * Asked for directly — "combine arena and visual style into just simply Arena
   * or Stadium". Grouped by look rather than listed flat, because within one
   * look the three entries differ by physics and that is the comparison a
   * player is actually making. The heading carries the look's own blurb so the
   * grouping explains itself instead of being decoration.
   */
  private stadiumScreen(): HTMLElement {
    const g = this.game;
    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    const panel = document.createElement('div');
    panel.className = 'panel stadium-panel';
    panel.innerHTML = `
      <h2>Choose your stadium</h2>
      <p class="sub">${escapeHtml(modeById(g.modeId).name)} — the floor changes how the match plays.</p>`;

    for (const group of stadiumsByLook(g.modeId)) {
      const theme = THEMES.find((t) => t.name === group.look);
      const section = document.createElement('div');
      section.className = 'slot';
      section.innerHTML = `<h4>${escapeHtml(group.look)}${
        theme ? ` — <span class="dim">${escapeHtml(theme.blurb)}</span>` : ''
      }</h4>`;

      const chips = document.createElement('div');
      chips.className = 'chips';
      for (const s of group.items) {
        const chip = document.createElement('button');
        chip.className = 'chip' + (g.stadium.id === s.id ? ' on' : '');
        chip.innerHTML = `<span>${escapeHtml(s.name)}<br><small>${escapeHtml(s.blurb)}</small></span>`;
        chip.addEventListener('click', () => {
          g.setStadium(s.id);
          this.render();
        });
        chips.appendChild(chip);
      }
      section.appendChild(chips);
      panel.appendChild(section);
    }

    const row = document.createElement('div');
    row.className = 'row';
    const go = document.createElement('button');
    go.className = 'primary';
    go.textContent = 'Let it rip';
    go.addEventListener('click', () => {
      // First real gesture on this path: browsers won't start an AudioContext
      // before one, and the garage no longer has the button that used to be it.
      g.audio.resume();
      g.startMatch();
    });
    row.appendChild(go);

    const back = document.createElement('button');
    back.className = 'primary ghost';
    back.textContent = 'Back to your bey';
    back.addEventListener('click', () => g.goTo('garage'));
    row.appendChild(back);
    panel.appendChild(row);

    overlay.appendChild(panel);
    return overlay;
  }

  /**
   * The rules that actually matter, with the move triangle drawn rather than
   * described. The triangle is the deepest system in the game and nothing else
   * in the UI reveals it.
   */
  private howTo(): HTMLElement {
    const g = this.game;
    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `
      <h1>How to play</h1>
      <p class="sub">Three screens, three keys, one triangle.</p>

      <div class="slot">
        <h4>1 — Launch</h4>
        <p class="howto-body">
          A bar sweeps left and right. <b>Tap <kbd>SPACE</kbd> once</b> to stop it.
          Stopping inside the <b class="ok-text">green band</b> is a perfect launch and
          grants bonus spin. Land left of it and your top spirals to the safe centre;
          land right and it rides the rim, which hits harder but risks the exit pockets.
        </p>
      </div>

      <div class="slot">
        <h4>2 — Battle</h4>
        <p class="howto-body">
          Your top fights on its own. Your job is the <b>meter</b> at the bottom of your
          card: it fills as the round runs, and you spend it on moves.
          <b>Every move is a single tap — nothing here is held down.</b>
          You can also click the buttons instead of using keys.
        </p>
      </div>

      <div class="slot">
        <h4>Arenas</h4>
        <p class="howto-body">
          The <b>Standard Dish</b> is a plain bowl — no archetype is favoured.
          The <b>X-Rail Stadium</b> adds a glowing rail around the outside: a top
          moving fast enough gets caught, accelerated, then flung back across the
          arena. Rounds there are faster and deadlier.
          The <b>Spike Pit</b> drains spin from anything that sits in the middle,
          and the longer you loiter the harder it bites — so camping the centre,
          which is otherwise the safest place to be, stops being free.
          Pick one in the garage: the arena is the one setting that changes how
          the match actually <em>plays</em> rather than how it looks.
        </p>
      </div>

      <div class="slot">
        <h4>3 — The triangle — this decides most battles</h4>
        <p class="howto-body">
          Each move beats one other move. Watch your rival's card: when it commits,
          the move it chose lights up there. Counter it.
        </p>
      </div>`;

    panel.appendChild(this.triangleDiagram());

    const keys = document.createElement('div');
    keys.className = 'keytable';
    keys.innerHTML = `
      <div class="keyrow"><kbd>SPACE</kbd><b>Charge</b><span>Hunt the rival and hit much harder. Costs the full meter, and leaves you open to a Block.</span></div>
      <div class="keyrow"><kbd>A</kbd><b>Block</b><span>Absorb a hit and throw damage back. Block <em>as the hit lands</em> for a perfect block and a huge punish.</span></div>
      <div class="keyrow"><kbd>S</kbd><b>Dodge</b><span>Break away and conserve spin. Beats a Block, because a blocking top can't catch anything.</span></div>`;
    panel.appendChild(keys);

    const scoring = document.createElement('p');
    scoring.className = 'howto-body';
    scoring.style.marginTop = '18px';
    scoring.innerHTML =
      'Knock your rival out of the arena or burst it for <b>2 points</b>. Outlast it for <b>1</b>. First to ' +
      `<b>${C.POINTS_TO_WIN}</b> wins the match.`;
    panel.appendChild(scoring);

    const row = document.createElement('div');
    row.className = 'row';
    row.style.marginTop = '22px';
    const back = document.createElement('button');
    back.className = 'primary';
    back.textContent = 'Got it — build my top';
    back.addEventListener('click', () => g.goTo('garage'));
    row.appendChild(back);
    const home = document.createElement('button');
    home.className = 'primary ghost';
    home.textContent = 'Back';
    home.addEventListener('click', () => g.goTo('home'));
    row.appendChild(home);
    panel.appendChild(row);

    overlay.appendChild(panel);
    return overlay;
  }

  /** The move triangle, drawn. Text alone has not been teaching it. */
  private triangleDiagram(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'triangle-wrap';
    wrap.innerHTML = `
      <svg viewBox="0 0 420 250" role="img"
           aria-label="Charge beats Dodge, Dodge beats Block, Block beats Charge.">
        <defs>
          <marker id="tri-arrow" viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="5" markerHeight="5" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#7f8ea8"/>
          </marker>
        </defs>

        <path d="M 196 58 L 300 148" fill="none" stroke="#7f8ea8" stroke-width="1.5"
              marker-end="url(#tri-arrow)"/>
        <path d="M 286 186 L 148 186" fill="none" stroke="#7f8ea8" stroke-width="1.5"
              marker-end="url(#tri-arrow)"/>
        <path d="M 128 148 L 190 68" fill="none" stroke="#7f8ea8" stroke-width="1.5"
              marker-end="url(#tri-arrow)"/>

        <g>
          <rect x="152" y="14" width="120" height="42" rx="9" fill="rgba(239,68,68,.16)" stroke="#ef4444"/>
          <text x="212" y="34" text-anchor="middle" fill="#ef4444" font-size="14" font-weight="700">CHARGE</text>
          <text x="212" y="48" text-anchor="middle" fill="#7f8ea8" font-size="10">SPACE</text>
        </g>
        <g>
          <rect x="286" y="150" width="120" height="42" rx="9" fill="rgba(34,197,94,.16)" stroke="#22c55e"/>
          <text x="346" y="170" text-anchor="middle" fill="#22c55e" font-size="14" font-weight="700">DODGE</text>
          <text x="346" y="184" text-anchor="middle" fill="#7f8ea8" font-size="10">S</text>
        </g>
        <g>
          <rect x="18" y="150" width="120" height="42" rx="9" fill="rgba(56,189,248,.16)" stroke="#38bdf8"/>
          <text x="78" y="170" text-anchor="middle" fill="#38bdf8" font-size="14" font-weight="700">BLOCK</text>
          <text x="78" y="184" text-anchor="middle" fill="#7f8ea8" font-size="10">A</text>
        </g>

        <text x="268" y="104" fill="#7f8ea8" font-size="10">beats</text>
        <text x="204" y="204" text-anchor="middle" fill="#7f8ea8" font-size="10">beats</text>
        <text x="112" y="104" text-anchor="end" fill="#7f8ea8" font-size="10">beats</text>
      </svg>`;
    return wrap;
  }

  /**
   * What the match just unlocked. An unlock the player doesn't notice may as
   * well not have happened, so it gets its own block rather than a line in the
   * garage they might scroll past.
   */
  private unlockHtml(): string {
    const u = this.game.lastUnlocks;
    const names: string[] = [];
    for (const id of u.layers ?? []) names.push(LAYERS.find((x) => x.id === id)?.name ?? id);
    for (const id of u.discs ?? []) names.push(DISCS.find((x) => x.id === id)?.name ?? id);
    for (const id of u.drivers ?? []) names.push(DRIVERS.find((x) => x.id === id)?.name ?? id);
    for (const id of u.skins ?? []) names.push(SKINS.find((x) => x.id === id)?.name ?? id);
    if (!names.length) return '';
    return `
      <div class="unlocks">
        <div class="unlocks-head">Unlocked</div>
        <div class="unlocks-list">${names.map((n) => `<span>${escapeHtml(n)}</span>`).join('')}</div>
        <p class="unlocks-note">New options, not stronger ones — every part trades something away.</p>
      </div>`;
  }

  /**
   * The career strip: what to chase, how far in you are, and who is coming.
   *
   * WHY IT SITS IN THE GARAGE rather than on its own screen. Every one of these
   * is a reason to pick a particular bey, and the garage is where a bey gets
   * picked — an objective saying "win with a left-spin bey" is useless on a
   * results screen and actionable three inches above the roster. The nemesis is
   * here for the same reason the next opponent is: a problem you can prepare
   * for.
   *
   * Rebuilt on every render rather than diffed. The garage is not a hot path
   * and a stale progress bar is a worse bug than a wasted allocation.
   */
  private careerSection(): HTMLElement {
    const g = this.game;
    const d = g.progress.data;
    const el = document.createElement('div');
    el.className = 'career';

    // --- objectives ---------------------------------------------------------
    const rows: string[] = [];
    for (const p of [...d.challenges.daily, ...d.challenges.weekly]) {
      const c = challengeById(p.id);
      if (!c) continue;
      const have = c.key ? p.keys.length : p.n;
      const pctDone = Math.min(100, (have / c.target) * 100);
      rows.push(
        `<div class="career-obj${p.paid ? ' done' : ''}">` +
          `<div class="career-obj-top">` +
          `<span class="career-obj-text">${escapeHtml(c.text)}</span>` +
          `<span class="career-obj-count">${p.paid ? '✓' : `${have}/${c.target}`}</span>` +
          `</div>` +
          `<div class="career-bar"><i style="width:${pctDone}%"></i></div>` +
          `</div>`,
      );
    }

    // --- mastery on the equipped bey ---------------------------------------
    const layerId = g.playerBuild.layer.id;
    const rounds = d.mastery[layerId] ?? 0;
    const tier = masteryTier(rounds);
    const toNext = masteryToNext(rounds);
    const masteryLine =
      tier > 0
        ? `${MASTERY_NAMES[tier - 1]} · ${rounds} rounds`
        : `${rounds} rounds`;
    const nextLine = toNext > 0 ? `${toNext} to ${MASTERY_NAMES[tier]}` : 'maxed';

    // --- title --------------------------------------------------------------
    const earned = g.progress.titles();
    const equipped = g.progress.equippedTitle();

    el.innerHTML = `
      <div class="career-head">
        <span class="career-label">Career</span>
        ${equipped ? `<span class="career-title">${escapeHtml(equipped.text)}</span>` : ''}
      </div>
      <div class="career-grid">
        <div class="career-col">
          <div class="career-col-head">Objectives</div>
          ${rows.join('') || '<div class="career-empty">Play a round to get today\'s set.</div>'}
        </div>
        <div class="career-col">
          <div class="career-col-head">${escapeHtml(g.playerBuild.layer.name)} mastery</div>
          <div class="career-mastery">${escapeHtml(masteryLine)}</div>
          <div class="career-sub">${escapeHtml(nextLine)}</div>
          ${this.nemesisMarkup()}
        </div>
      </div>`;

    // The title picker is built rather than templated, because it needs
    // listeners and an option per earned title.
    if (earned.length) {
      const pick = document.createElement('select');
      pick.className = 'career-title-pick';
      pick.title = 'Choose a title';
      const none = document.createElement('option');
      none.value = '';
      none.textContent = 'No title';
      pick.appendChild(none);
      for (const t of earned) {
        const o = document.createElement('option');
        o.value = t.id;
        o.textContent = `${t.text} — ${t.how}`;
        pick.appendChild(o);
      }
      pick.value = d.title;
      pick.addEventListener('change', () => {
        g.progress.equipTitle(pick.value);
        this.render();
      });
      el.querySelector('.career-head')?.appendChild(pick);
    }
    return el;
  }

  /**
   * The nemesis line, or nothing before they have ever turned up.
   *
   * Deliberately silent until the first meeting: announcing a rival the player
   * has not met is a spoiler, and an empty head-to-head reads as a bug.
   */
  private nemesisMarkup(): string {
    const n = this.game.progress.data.nemesis;
    if (!n.id || n.met === 0) return '';
    const due = this.game.progress.nemesisIsDue();
    return (
      `<div class="career-nemesis${due ? ' due' : ''}">` +
      `<span class="career-col-head">Nemesis</span>` +
      `<span>${n.playerWins}–${n.rivalWins} in ${n.met}</span>` +
      (due ? '<span class="career-due">waiting for you</span>' : '') +
      `</div>`
    );
  }

  /**
   * The cup: enter it, or see how far up the bracket you are.
   *
   * ONE PANEL FOR BOTH STATES rather than a separate screen, because the cup is
   * a thing you decide to do from the garage and then a thing you are IN. A
   * player mid-bracket needs to see the ladder they are climbing at the moment
   * they are choosing what to bring to the next match, and that moment happens
   * here.
   *
   * Hidden entirely before the unlock rung. An empty box saying "locked" is a
   * worse first impression than no box.
   */
  private cupSection(): HTMLElement {
    const g = this.game;
    const el = document.createElement('div');
    const c = g.progress.data.cup;
    const live = g.progress.cupRunning;
    const canEnter = g.progress.canEnterCup(Date.now());

    if (!live && !canEnter && c.entered === 0) {
      // Never played and not yet available: say nothing at all.
      el.hidden = true;
      return el;
    }

    el.className = `cup${live ? ' live' : ''}`;

    const head =
      `<div class="cup-head">` +
      `<span class="lab">Daily cup</span>` +
      (c.entered > 0
        ? `<span class="cup-record">${c.won} won &middot; ${c.entered} entered</span>`
        : '') +
      `</div>`;

    if (live) {
      const foe = g.progress.cupOpponent();
      const rounds = cupBracket(c);
      // One column per round, so the shape of a bracket is the shape of the
      // markup. A list of names would not read as a tournament.
      const cols = rounds
        .map(
          (matches, r) =>
            `<div class="cup-col">` +
            `<div class="cup-col-head">${escapeHtml(CUP_ROUND_NAMES[r])}</div>` +
            matches
              .map((m) => {
                const nm = (id: string): string =>
                  id === CUP_PLAYER
                    ? 'You'
                    : id === CUP_TBD
                      ? '&mdash;'
                      : escapeHtml(cupEntrantById(id)?.name ?? id);
                const slot = (id: string): string =>
                  `<span class="cup-slot${id === CUP_PLAYER ? ' me' : ''}` +
                  `${m.winner && m.winner === id ? ' through' : ''}` +
                  `${m.winner && m.winner !== id && id !== CUP_TBD ? ' out' : ''}">${nm(id)}</span>`;
                return `<div class="cup-match${m.player ? ' mine' : ''}">${slot(m.a)}${slot(m.b)}</div>`;
              })
              .join('') +
            `</div>`,
        )
        .join('');

      el.innerHTML =
        head +
        `<div class="cup-now">Next: <strong>${escapeHtml(foe?.name ?? '')}</strong>` +
        `<span class="cup-round">${escapeHtml(CUP_ROUND_NAMES[c.wins])}</span></div>` +
        `<div class="cup-bracket-scroll"><div class="cup-bracket">${cols}</div></div>`;
      return el;
    }

    // Not running. Either today's cup is available, or it is spent.
    const purse = CUP_PURSE[CUP_ROUNDS];
    if (canEnter) {
      el.innerHTML =
        head +
        `<p class="cup-pitch">Eight blades, three rounds, single elimination. ` +
        `Win it for <strong>${purse} coins</strong>. One run a day &mdash; the ` +
        `field is the same for everyone today.</p>`;
      const btn = document.createElement('button');
      btn.className = 'primary cup-enter';
      btn.textContent = 'Enter the cup';
      btn.addEventListener('click', () => {
        g.enterCup();
        this.render();
      });
      el.appendChild(btn);
    } else {
      el.innerHTML =
        head +
        `<p class="cup-pitch cup-spent">Today's run is over. A new field is ` +
        `drawn tomorrow.</p>`;
    }
    return el;
  }

  /**
   * The developer panel: reach any state without playing to it.
   *
   * Lives in the garage rather than in settings because these are things you
   * do BETWEEN matches while testing — jump the ladder, then immediately pick a
   * bey and fight. Making that a two-screen trip is the tax the tool exists to
   * remove, which is the same argument that moved the unlock switch out of a
   * URL parameter.
   *
   * Rendered as nothing at all when the mode is off, so it costs a hidden
   * element and no layout.
   */
  private devSection(): HTMLElement {
    const g = this.game;
    const el = document.createElement('div');
    if (!devMode()) {
      el.hidden = true;
      return el;
    }
    el.className = 'devpanel';

    const head = document.createElement('div');
    head.className = 'dev-head';
    head.innerHTML =
      `<span class="lab">Developer</span>` +
      `<span class="dev-note">nothing here changes the game's rules</span>`;
    el.appendChild(head);

    const rows = document.createElement('div');
    rows.className = 'dev-rows';
    el.appendChild(rows);

    /** One labelled row of controls. */
    const row = (label: string): HTMLElement => {
      const r = document.createElement('div');
      r.className = 'dev-row';
      r.innerHTML = `<span class="dev-label">${escapeHtml(label)}</span>`;
      rows.appendChild(r);
      return r;
    };
    const button = (into: HTMLElement, text: string, fn: () => void): void => {
      const b = document.createElement('button');
      b.className = 'dev-btn';
      b.textContent = text;
      b.addEventListener('click', () => {
        fn();
        this.render();
      });
      into.appendChild(b);
    };
    const select = (
      into: HTMLElement,
      options: { value: string; label: string }[],
      current: string,
      fn: (v: string) => void,
    ): void => {
      const sel = document.createElement('select');
      sel.className = 'dev-select';
      for (const o of options) {
        const opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.label;
        sel.appendChild(opt);
      }
      sel.value = current;
      sel.addEventListener('change', () => {
        fn(sel.value);
        this.render();
      });
      into.appendChild(sel);
    };

    // --- arena ---------------------------------------------------------------
    const arenaRow = row('Arena');
    select(
      arenaRow,
      ARENAS.map((a) => ({ value: a.id, label: a.name })),
      g.arenaId,
      (v) => {
        g.arenaId = v;
      },
    );

    // --- ladder --------------------------------------------------------------
    const rungRow = row('Ladder rung');
    select(
      rungRow,
      rungOptions().map((o) => ({ value: String(o.value), label: o.label })),
      String(g.progress.data.rung),
      (v) => setRung(g.progress, Number(v)),
    );

    // --- difficulty ----------------------------------------------------------
    const diffRow = row('Rival skill');
    select(
      diffRow,
      (['rookie', 'blader', 'champion'] as const).map((d) => ({ value: d, label: d })),
      g.difficulty,
      (v) => g.setDifficulty(v as 'rookie' | 'blader' | 'champion'),
    );

    // --- economy -------------------------------------------------------------
    const coinRow = row(`Coins (${g.progress.data.coins})`);
    button(coinRow, '+1000', () => grantCoins(g.progress, 1000));
    button(coinRow, '+10000', () => grantCoins(g.progress, 10_000));

    // --- cup -----------------------------------------------------------------
    const cupRow = row('Cup');
    button(cupRow, 'Reset today', () => resetCup(g.progress));
    button(cupRow, 'Win current', () => winCup(g.progress));

    // --- career --------------------------------------------------------------
    const careerRow = row('Career');
    button(careerRow, 'Summon nemesis', () => summonNemesis(g.progress));
    const wipe = document.createElement('button');
    wipe.className = 'dev-btn danger';
    wipe.textContent = 'Wipe save';
    wipe.addEventListener('click', () => {
      // The confirmation lives here rather than in `dev.ts` deliberately: a
      // browser dialog inside the action module would make it untestable.
      if (!window.confirm('Erase the entire career? This cannot be undone.')) return;
      resetCareer();
      location.reload();
    });
    careerRow.appendChild(wipe);

    // --- in battle -----------------------------------------------------------
    // Only rendered during a round, because "fill the meter" on the garage
    // screen is a button that silently does nothing.
    if (g.screen === 'battle') {
      const battleRow = row('This round');
      button(battleRow, 'Fill meter', () => fillMeter(g));
      button(battleRow, 'Win round', () => endRound(g, true));
      button(battleRow, 'Lose round', () => endRound(g, false));
    }

    return el;
  }

  private garage(): HTMLElement {
    const g = this.game;
    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    const panel = document.createElement('div');
    panel.className = 'panel';

    // Named for the MODE, not the game. Standing under "Beyblade Arena" while
    // holding an Overdrive top is the exact confusion the mode select exists to
    // remove — the heading has to confirm which game you are in.
    const header = document.createElement('div');
    header.innerHTML = `
      <h1>${escapeHtml(modeById(g.modeId).name)}</h1>
      <p class="sub">Build your top, then let it rip. First to ${C.POINTS_TO_WIN} points takes the match —
      ring out or burst scores 2, outlasting your rival scores 1.</p>`;
    panel.appendChild(header);

    panel.appendChild(this.explodedView());
    panel.appendChild(this.careerSection());
    panel.appendChild(this.cupSection());
    panel.appendChild(this.devSection());

    // Two tabs, because the garage was doing two psychologically opposite
    // jobs at once. Picking a finished bey is choosing an *identity*;
    // assembling one from parts is tuning a machine. Presented as one long
    // scroll, players could not tell which of the two they were looking at —
    // the reported symptom was not knowing where the prebuilt beys were
    // versus where you build your own.
    const collection = document.createElement('div');
    const workshop = document.createElement('div');
    workshop.hidden = true;

    // Who you're up against. A named rival with a known build is a problem you
    // can prepare for, which is the entire point of the garage.
    if (!g.progress.cleared) {
      const r = g.currentRival;
      const opp = document.createElement('div');
      opp.className = 'opponent';
      opp.innerHTML = `
        <div class="opp-head">
          <span class="opp-label">Next opponent</span>
          <span class="opp-diff">${escapeHtml(r.difficulty)}</span>
        </div>
        <div class="opp-name">${escapeHtml(r.name)} <span>${escapeHtml(r.title)}</span></div>
        <div class="opp-bey">${escapeHtml(r.beyName)}</div>
        <p class="opp-line">${escapeHtml(r.line)}</p>`;
      panel.appendChild(opp);
    }

    // Whole beyblades first. Most players think in beys, not in parts — "give
    // me Valtryek" — and the anime's combos ARE identities. The part slots
    // below stay for the players who want to tinker; picking a preset simply
    // sets all three slots (and the canonical spin direction) at once.
    const presetRow = document.createElement('div');
    presetRow.className = 'slot';
    presetRow.innerHTML =
      '<h4>Beyblade — pick a whole top, or build your own below</h4>';
    // GROUPED BY CLASS, like the inspector already was.
    //
    // The inspector got Legendary/Epic headings and the garage did not, so the
    // one screen a player actually picks from stayed a flat run of twenty-one
    // chips with the two imported models buried somewhere in the middle. A
    // categorisation that exists only on the page nobody plays from is not a
    // categorisation.
    for (const group of groupByClass(BEY_PRESETS, (p) => p.layerId)) {
    const head = document.createElement('div');
    head.className = 'class-head';
    head.style.setProperty('--accent', hex(group.info.colour));
    head.innerHTML =
      `<b>${escapeHtml(group.info.label)}</b> <span>${escapeHtml(group.info.blurb)}</span>`;
    presetRow.appendChild(head);
    const presetChips = document.createElement('div');
    presetChips.className = 'chips';
    for (const p of group.items) {
      const owned =
        g.progress.has('layers', p.layerId) &&
        g.progress.has('discs', p.discId) &&
        g.progress.has('drivers', p.driverId);
      const active =
        g.playerBuild.layer.id === p.layerId &&
        g.playerBuild.disc.id === p.discId &&
        g.playerBuild.driver.id === p.driverId &&
        g.playerSpinDir === p.spinDir;
      const chip = document.createElement('button');
      chip.className = 'chip' + (active ? ' on' : '') + (owned ? '' : ' locked-part');
      chip.disabled = !owned;
      // A drawn plan view rather than a colour dot. Ten designs differ in
      // silhouette, tiering and palette, and a dot advertised none of it —
      // picking a bey was picking a name.
      chip.classList.add('bey-chip');
      // The chip draws the design set the active theme actually renders —
      // Classic has its own (see classicdex), so an anime chip in Classic would
      // advertise a bey the player will not get.
      const thumb = beyThumb(p.layerId, 64, themeById(g.themeId).toon ? 'anime' : 'classic');
      chip.appendChild(thumb);

      // A bey with an imported model gets a picture of THAT, replacing the
      // traced silhouette above once it has rendered. The Canvas2D thumbnail
      // stays as the immediate paint — it is already drawn, it is right for
      // most of the roster, and swapping it late is invisible next to leaving
      // the chip blank while a model loads.
      //
      // Resolves null for every bey without a model, which is most of them.
      const layer = LAYERS.find((l) => l.id === p.layerId);
      void modelThumb(p.layerId, layer?.radius ?? 0.1, layer?.colour ?? 0x8899aa).then(
        (url) => {
          if (!url || !thumb.isConnected) return;
          const img = new Image();
          img.className = thumb.className;
          img.width = 64;
          img.height = 64;
          img.decoding = 'async';
          img.alt = '';
          img.src = url;
          thumb.replaceWith(img);
        },
      );
      const label = document.createElement('span');
      label.innerHTML = `${escapeHtml(p.name)}<br><small>${escapeHtml(
        `${p.spinDir === -1 ? 'left spin' : 'right spin'} · ${p.discId} · ${p.driverId}`,
      )}</small>`;
      chip.appendChild(label);
      if (!owned) chip.title = 'Beat more bladers to unlock its parts';
      chip.addEventListener('click', () => {
        if (!owned) return;
        g.playerBuild = makeBuild(p.layerId, p.discId, p.driverId);
        // Canonical spin comes with the bey: choosing Fafnir means choosing
        // left spin, exactly as in the source material.
        g.playerSpinDir = p.spinDir;
        if (g.progress.has('skins', p.skinId)) g.playerSkinId = p.skinId;
        this.render();
      });
      presetChips.appendChild(chip);
    }
    presetRow.appendChild(presetChips);
    }
    collection.appendChild(presetRow);
    // Match settings sit directly under the bey, before the parts.
    //
    // They used to be sections 6 and 8 of 9, below every part slot — far
    // enough down that the X-Rail was reported as "disappeared" when it had
    // simply never been scrolled to. Arena and spin direction both change how
    // the match *plays*, so they belong with the choice of bey, not filed
    // under cosmetics.
    // The arena picker moved out to its own screen and took the visual style
    // with it — they are one choice now. Spin direction stays: it is a property
    // of how you launch THIS bey, so it belongs beside the bey.
    collection.appendChild(this.spinSection());
    // Crates sit in Collection because acquiring is what this tab is for; the
    // Workshop is about tuning what you already own.
    collection.appendChild(shopSection(g, () => this.render()));

    // Attribution for an imported model, when one is equipped.
    //
    // Not politeness — a CC-BY licence requires the credit wherever the work is
    // shared, and this game is meant to be shared. A credit that lives only in
    // the licence.txt inside a downloaded folder is a credit nobody will ever
    // see, and it disappears the first time someone tidies the directory.
    const model = topModelFor(g.playerBuild.layer.id);
    if (model?.credit) {
      const credit = document.createElement('p');
      credit.className = 'sub model-credit';
      credit.textContent = `3D model: ${model.credit}`;
      collection.appendChild(credit);
    }

    const slots: [string, { id: string; name: string; colour?: number; note: string }[], string][] = [
      [
        'Layer — decides how hard you hit and how well you take a hit',
        LAYERS.map((l) => ({
          id: l.id,
          name: l.name,
          colour: l.colour,
          note:
            `${l.archetype} · atk ${l.attack} · def ${l.defense}` +
            (l.spinSteal > 0 ? ` · absorbs ${Math.round(l.spinSteal * 100)}%` : '') +
            // The one property that makes a vampire a different bey rather
            // than a bigger Fafnir: matching its spin does not switch it off.
            // Without this it read identically to every other absorber at the
            // exact moment the player picks a spin direction to fight it.
            ((l.sameSteal ?? 0) > 0 ? ' · drains either spin' : ''),
        })),
        'layer',
      ],
      [
        'Disc — weight and stability',
        DISCS.map((d) => ({
          id: d.id,
          name: d.name,
          colour: d.colour,
          // Protrusion count where the part has one — it is half the real
          // Ratchet's NAME (`4-60` is four protrusions at 6.0 mm) and it is
          // what the blade/ratchet alignment rule reads. A player choosing
          // between them should see the number the name is made of.
          note:
            d.protrusions !== undefined
              ? `${d.protrusions} prong${d.protrusions === 1 ? '' : 's'} · ${d.heightMm}mm · stab ${d.stability}`
              : `${d.mass}kg · stab ${d.stability}`,
        })),
        'disc',
      ],
      [
        'Driver — how you move and how long you last',
        DRIVERS.map((d) => ({
          id: d.id,
          name: d.name,
          // Dash shown where it is transcribed, because it is the stat that
          // decides how hard the X-Rail throws you and the only reason to
          // prefer one attack bottom over another.
          note:
            d.railGrip !== undefined
              ? `${d.archetype} · dash ${Math.round(d.railGrip * 40)} · spin ${d.spinRetention}`
              : `${d.archetype} · spin ${d.spinRetention} · aggro ${d.wander}`,
        })),
        'driver',
      ],
    ];

    for (const [label, items, slot] of slots) {
      const sec = document.createElement('div');
      sec.className = 'slot';
      const h = document.createElement('h4');
      h.textContent = label;
      sec.appendChild(h);

      const chips = document.createElement('div');
      chips.className = 'chips';
      for (const item of items) {
        const kind = (slot + 's') as 'layers' | 'discs' | 'drivers';
        const owned = g.progress.has(kind, item.id);
        const chip = document.createElement('button');
        chip.className = 'chip' + (owned ? '' : ' locked-part');
        chip.disabled = !owned;
        const current = (g.playerBuild as any)[slot].id;
        if (current === item.id) chip.classList.add('on');
        chip.innerHTML = `
          ${item.colour !== undefined ? `<span class="dot" style="background:${hex(item.colour)}"></span>` : ''}
          <span>${escapeHtml(item.name)}<br><small>${escapeHtml(item.note)}</small></span>`;
        if (!owned) chip.title = 'Beat more bladers to unlock this part';
        chip.addEventListener('click', () => {
          if (!owned) return;
          const list = slot === 'layer' ? LAYERS : slot === 'disc' ? DISCS : DRIVERS;
          const part = (list as { id: string }[]).find((p) => p.id === item.id);
          (g.playerBuild as any)[slot] = part;
          this.render();
        });
        chips.appendChild(chip);
      }
      sec.appendChild(chips);
      workshop.appendChild(sec);
    }

    // Derived stats, so the player can see what a swap actually did.
    //
    // SPIN STEAL WAS MISSING FROM THIS ROW. `deriveStats` has returned it since
    // the mechanic was written and the six numbers listed here did not include
    // it — so the single most valuable stat in the game, the one that decides a
    // ±45 point launch choice for the layers that have it, was invisible on the
    // one screen built to show what a part swap did. Fitting Fafnir changed
    // nothing anybody could see.
    const s = deriveStats(g.playerBuild);
    const stat = document.createElement('div');
    stat.className = 'statline';
    stat.innerHTML = `
      <span>Mass <b>${s.mass.toFixed(2)}</b></span>
      <span>Attack <b>${s.attack.toFixed(2)}</b></span>
      <span>Defense <b>${s.defense.toFixed(2)}</b></span>
      <span>Burst resist <b>${s.burstResist.toFixed(2)}</b></span>
      <span>Spin retention <b>${s.spinRetention.toFixed(2)}</b></span>
      <span>Aggression <b>${s.wander.toFixed(2)}</b></span>
      <span>Spin steal <b>${s.spinSteal.toFixed(2)}</b></span>`;
    workshop.appendChild(stat);

    // And the plain-English half, because 0.62 is not a sentence. Shown for a
    // zero too: "this build cannot do that" is information, and its absence is
    // why a player would never think to go looking for a layer that can.
    const stealNote = document.createElement('p');
    stealNote.className = 'sub stat-note';
    stealNote.style.margin = '-14px 0 20px';
    stealNote.textContent =
      s.spinSteal > 0
        ? `Spin steal ${s.spinSteal.toFixed(2)} — this bey bites into a top turning the other ` +
          `way and converts ${pct(s.spinSteal)} of the hit back into its own spin. ` +
          (s.sameSteal > 0
            ? `Uniquely, ${pct(s.spinSteal * s.sameSteal)} of that survives a same-spin launch too.`
            : 'In same spin it does nothing at all — the launch choice is worth more than any move you press.')
        : 'Spin steal 0.00 — this build drains nothing. Only a layer with a drain stat can win ' +
          'the opposite-spin fight on spin alone; everything else has to knock its rival out.';
    workshop.appendChild(stealNote);

    // Skins. Purely cosmetic — the rival is always forced to a contrasting hue,
    // which is what makes the two tops readable without ownership markers.
    const skinRow = document.createElement('div');
    skinRow.className = 'slot';
    skinRow.innerHTML =
      '<h4>Finish — cosmetic only, never changes a stat</h4>';
    const skinChips = document.createElement('div');
    skinChips.className = 'chips';
    for (const s of SKINS) {
      const owned = g.progress.has('skins', s.id);
      const chip = document.createElement('button');
      chip.className =
        'chip' + (g.playerSkinId === s.id ? ' on' : '') + (owned ? '' : ' locked-part');
      chip.disabled = !owned;
      chip.innerHTML = `
        <span class="dot skin-dot" style="background:${hex(s.primary)}"></span>
        <span>${escapeHtml(s.name)}<br><small>${escapeHtml(s.finish)}</small></span>`;
      chip.addEventListener('click', () => {
        if (!owned) return;
        g.playerSkinId = s.id;
        this.render();
      });
      skinChips.appendChild(chip);
    }
    skinRow.appendChild(skinChips);
    const skinNote = document.createElement('p');
    skinNote.className = 'sub';
    skinNote.style.margin = '10px 0 0';
    skinNote.textContent =
      'Your rival is always given the most contrasting finish available, so the two tops stay easy to tell apart mid-battle.';
    skinRow.appendChild(skinNote);
    workshop.appendChild(skinRow);


    // The switch itself sits above both panes so it is the first thing read
    // after the bey preview.
    const tabs = document.createElement('div');
    tabs.className = 'garage-tabs';
    const mkTab = (label: string, note: string, key: 'collection' | 'workshop'): void => {
      const b = document.createElement('button');
      b.className = 'garage-tab' + (this.garageTab === key ? ' on' : '');
      b.innerHTML = `<b>${escapeHtml(label)}</b><small>${escapeHtml(note)}</small>`;
      b.addEventListener('click', () => {
        this.garageTab = key;
        this.render();
      });
      tabs.appendChild(b);
    };
    mkTab('Collection', 'your beys and spin', 'collection');
    mkTab('Workshop', 'build one from parts', 'workshop');

    collection.hidden = this.garageTab !== 'collection';
    workshop.hidden = this.garageTab !== 'workshop';
    panel.appendChild(tabs);
    panel.appendChild(collection);
    panel.appendChild(workshop);

    const row = document.createElement('div');
    row.className = 'row';
    const go = document.createElement('button');
    go.className = 'primary';
    // Not "Enter the arena" any more, because it no longer does: the arena is
    // the next screen. A button that names the screen it opens is the whole
    // reason a two-step setup reads as two steps.
    go.textContent = 'Choose your stadium';
    go.addEventListener('click', () => g.goTo('stadium'));
    row.appendChild(go);

    const modeBtn = document.createElement('button');
    modeBtn.className = 'primary ghost';
    modeBtn.textContent = 'Change game';
    modeBtn.addEventListener('click', () => g.goTo('mode'));
    row.appendChild(modeBtn);

    const howto = document.createElement('button');
    howto.className = 'primary ghost';
    howto.textContent = 'How to play';
    howto.addEventListener('click', () => g.goTo('howto'));
    row.appendChild(howto);

    panel.appendChild(row);

    panel.appendChild(this.audioSection());

    // The manga cuts get their own switch beside the audio ones, for the same
    // reason the arena bed does: it is the strongest, most repetitive device
    // in the game, and how much of it is too much is a matter of taste rather
    // than a number anyone can pick correctly for everybody.
    const fxRow = document.createElement('div');
    fxRow.className = 'slot';
    fxRow.style.marginTop = '18px';
    fxRow.innerHTML = '<h4>Effects</h4>';
    const fxChips = document.createElement('div');
    fxChips.className = 'chips';
    const frameChip = document.createElement('button');
    const setFrame = (): void => {
      frameChip.className = 'chip' + (g.impactFrames ? ' on' : '');
      frameChip.innerHTML = `<span>Impact frames<br><small>${
        g.impactFrames ? 'manga cut on a crit — Anime theme' : 'off'
      }</small></span>`;
    };
    setFrame();
    frameChip.addEventListener('click', () => {
      g.setImpactFrames(!g.impactFrames);
      setFrame();
    });
    fxChips.appendChild(frameChip);

    // ALL BEYBLADES, as a remembered toggle rather than a URL parameter.
    //
    // The owner tests this game by playing it, and the roster is behind ladder
    // progress — so judging a design on Nosferu meant winning six matches or
    // retyping `?unlock=all` after every reload. That is the tax the switch was
    // written to remove, reimposed by where it lived.
    //
    // It grants in memory only and never rewrites the career on disk, so
    // turning it off hands the real save back untouched. That is what makes it
    // safe to leave on indefinitely, and why it sits beside the other taste
    // switches instead of behind a warning.
    const unlockChip = document.createElement('button');
    const setUnlock = (): void => {
      const on = unlockPreference();
      unlockChip.className = 'chip' + (on ? ' on' : '');
      unlockChip.innerHTML = `<span>All beyblades<br><small>${
        on ? 'every part available — career untouched' : 'follow the ladder'
      }</small></span>`;
    };
    setUnlock();
    unlockChip.addEventListener('click', () => {
      setUnlockPreference(!unlockPreference());
      setUnlock();
      // A reload is the honest way to apply it: the grant happens at startup,
      // before the garage is built, and faking it live would leave the shop and
      // the ladder disagreeing with the roster.
      location.reload();
    });
    fxChips.appendChild(unlockChip);

    // AIM CHARGE, as a real preference rather than a difficulty setting.
    // Turning it off is not a handicap — the sim falls back to the homing it
    // always had, which is what the AI uses. Pointer aiming assumes a mouse;
    // on a trackpad, on a touchscreen, or for someone who would rather watch
    // the fight than drive it, the auto-homing charge is the better game.
    const aimChip = document.createElement('button');
    const setAim = (): void => {
      const on = aimCharge();
      aimChip.className = 'chip' + (on ? ' on' : '');
      aimChip.innerHTML = `<span>Aim your charge<br><small>${
        on ? 'point where it should go' : 'it steers itself'
      }</small></span>`;
    };
    setAim();
    aimChip.addEventListener('click', () => {
      setAimCharge(!aimCharge());
      setAim();
      // Live, no reload: the aim is resolved every frame and the coach and the
      // move button both read the preference on their next render.
      this.render();
    });
    fxChips.appendChild(aimChip);

    // DEVELOPER MODE. Nothing behind it changes the game's rules — see dev.ts —
    // it only reaches states that are otherwise behind ladder progress, a day's
    // wait, or a run of luck.
    const devChip = document.createElement('button');
    const setDev = (): void => {
      const on = devMode();
      devChip.className = 'chip' + (on ? ' on' : '');
      devChip.innerHTML = `<span>Developer mode<br><small>${
        on ? 'testing tools shown' : 'off'
      }</small></span>`;
    };
    setDev();
    devChip.addEventListener('click', () => {
      setDevMode(!devMode());
      setDev();
      this.render();
    });
    fxChips.appendChild(devChip);

    fxRow.appendChild(fxChips);
    panel.appendChild(fxRow);

    overlay.appendChild(panel);
    return overlay;
  }
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
