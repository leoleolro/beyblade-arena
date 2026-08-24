import type { Game } from './game';
import { DISCS, DRIVERS, LAYERS, deriveStats, makeBuild } from './sim/parts';
import { BEY_PRESETS } from './render/beydex';
import { beyThumb } from './render/beyThumb';
import { modelThumb } from './render/modelThumb';
import { setUnlockPreference, unlockPreference } from './devUnlock';
import { shopSection } from './render/shopSection';
import { topModelFor } from './render/topModelIndex';
import * as C from './sim/constants';
import { SKINS, skinById } from './render/skins';
import type { Channel } from './audio';
import { THEMES, themeById } from './render/theme';
import { MODES, modeById, stadiumsByLook } from './modes';
import { GarageView } from './render/garageView';
import { LADDER } from './ladder';
import type { BeyState, MoveKind } from './sim/types';

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

/**
 * All DOM. Rebuilds the panels on screen changes and does a cheap per-frame
 * pass over just the live bars, so the HUD doesn't thrash the DOM at 60fps.
 */
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
      ['charge', 'SPACE', 'Charge', 'hunt & smash'],
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
      msg = 'Meter full — SPACE to Charge, A to Block, S to Dodge';
      tone = '';
    } else if (you.burst > 0.55) {
      msg = 'Burst gauge is high — tap S to Dodge before the next hit';
      tone = 'urgent';
    } else {
      msg = 'Meter is filling. Watch the rival card for its move.';
      tone = '';
    }

    if (el.textContent !== msg) el.textContent = msg;
    el.className = `coach on ${tone}`;
  }

  private launchBar(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'launch';
    el.innerHTML = `
      <div class="track">
        <div class="sweet"></div>
        <div class="needle"></div>
      </div>
      <p><b>Tap <kbd>SPACE</kbd> once</b> to let it rip. Stop the needle in the green band for a perfect launch and bonus spin.</p>`;
    this.live.needle = el.querySelector('.needle') as HTMLElement;
    return el;
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
   * Spin direction. Also a match setting — the two pairings measure completely
   * differently, so this decides what kind of fight you get.
   */
  private spinSection(): HTMLElement {
    const g = this.game;
      // Spin direction. Measured, the two pairings play completely differently,
      // so this is a real decision rather than a cosmetic toggle.
      const spinRow = document.createElement('div');
      spinRow.className = 'slot';
      spinRow.innerHTML = '<h4>Spin direction — decides what kind of fight you get</h4>';
      const spinChips = document.createElement('div');
      spinChips.className = 'chips';
      const spins: [1 | -1, string, string][] = [
        [1, 'Right spin', 'clockwise'],
        [-1, 'Left spin', 'counter-clockwise'],
      ];
      for (const [dir, label, note] of spins) {
        const chip = document.createElement('button');
        chip.className = 'chip' + (g.playerSpinDir === dir ? ' on' : '');
        chip.innerHTML = `<span>${escapeHtml(label)}<br><small>${escapeHtml(note)}</small></span>`;
        chip.addEventListener('click', () => {
          g.playerSpinDir = dir;
          this.render();
        });
        spinChips.appendChild(chip);
      }
      spinRow.appendChild(spinChips);
      const spinNote = document.createElement('p');
      spinNote.className = 'sub';
      spinNote.style.margin = '10px 0 0';
      spinNote.textContent =
        'Match your rival’s spin for a quieter attrition race that stamina wins. ' +
        'Oppose it for a longer run of violent exchanges where attack pays off.';
      spinRow.appendChild(spinNote);
    return spinRow;
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
    const rows: [string, string, string][] = [
      ['layer', g.playerBuild.layer.name, `${g.playerBuild.layer.archetype} · ${g.playerBuild.layer.blades} blades`],
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
    const presetChips = document.createElement('div');
    presetChips.className = 'chips';
    for (const p of BEY_PRESETS) {
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
          note: `${d.mass}kg · stab ${d.stability}`,
        })),
        'disc',
      ],
      [
        'Driver — how you move and how long you last',
        DRIVERS.map((d) => ({
          id: d.id,
          name: d.name,
          note: `${d.archetype} · spin ${d.spinRetention} · aggro ${d.wander}`,
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
    const s = deriveStats(g.playerBuild);
    const stat = document.createElement('div');
    stat.className = 'statline';
    stat.innerHTML = `
      <span>Mass <b>${s.mass.toFixed(2)}</b></span>
      <span>Attack <b>${s.attack.toFixed(2)}</b></span>
      <span>Defense <b>${s.defense.toFixed(2)}</b></span>
      <span>Burst resist <b>${s.burstResist.toFixed(2)}</b></span>
      <span>Spin retention <b>${s.spinRetention.toFixed(2)}</b></span>
      <span>Aggression <b>${s.wander.toFixed(2)}</b></span>`;
    workshop.appendChild(stat);

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

    // Audio, split by channel. The sustained spin drone is the fatiguing one
    // and is off by default, so it needs its own switch rather than being
    // bundled under a single "sound" toggle.
    const audioRow = document.createElement('div');
    audioRow.className = 'slot';
    audioRow.style.marginTop = '20px';
    audioRow.innerHTML = '<h4>Audio</h4>';
    const audioChips = document.createElement('div');
    audioChips.className = 'chips';

    const channels: [Channel, string, string][] = [
      ['master', 'All sound', 'everything'],
      ['effects', 'Impacts & cues', 'hits, launches, moves'],
      ['drone', 'Spin drone', 'continuous — off by default'],
    ];
    for (const [ch, label, note] of channels) {
      const chip = document.createElement('button');
      const set = () => {
        chip.className = 'chip' + (g.audio.isOn(ch) ? ' on' : '');
        chip.innerHTML = `<span>${escapeHtml(label)}<br><small>${escapeHtml(
          g.audio.isOn(ch) ? note : 'off',
        )}</small></span>`;
      };
      set();
      chip.addEventListener('click', () => {
        g.audio.resume();
        g.audio.setChannel(ch, !g.audio.isOn(ch));
        set();
      });
      audioChips.appendChild(chip);
    }
    audioRow.appendChild(audioChips);
    panel.appendChild(audioRow);

    // The manga cuts get their own switch beside the audio ones, for the same
    // reason the spin drone does: it is the strongest, most repetitive device
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
