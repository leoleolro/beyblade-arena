import type { Game } from './game';
import { DISCS, DRIVERS, LAYERS, deriveStats } from './sim/parts';
import * as C from './sim/constants';
import { SKINS, skinById } from './render/skins';
import type { Channel } from './audio';
import { THEMES } from './render/theme';
import { GarageView } from './render/garageView';
import { LADDER } from './ladder';
import type { BeyState, MoveKind } from './sim/types';

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
const pct = (n: number): string => `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;

/** Short, loud version of the finish reason for the title card. */
const FINISHER_WORD: Record<string, string> = {
  knockout: 'RING OUT',
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
    if (g.screen === 'howto') {
      this.root.appendChild(this.howTo());
      return;
    }
    if (g.screen === 'garage') {
      this.root.appendChild(this.garage());
      return;
    }

    this.root.appendChild(this.scoreboard());
    this.root.appendChild(this.fighters());

    if (g.screen === 'battle') {
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
          <tr><td>Moves used</td><td>${you.movesUsed}</td><td>${them.movesUsed}</td></tr>
          <tr><td>Burst charge</td><td>${pct(you.burst)}</td><td>${pct(them.burst)}</td></tr>
        </tbody>
      </table>`
        : '';

    panel.innerHTML = `
      <p class="result-title ${cls}">${title}</p>
      <p class="result-reason">${escapeHtml(REASON_TEXT[r?.reason ?? 'timeout'] ?? '')}</p>
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

    const play = document.createElement('button');
    play.className = 'primary';
    play.textContent = 'Play';
    play.addEventListener('click', () => g.goTo('garage'));

    const how = document.createElement('button');
    how.className = 'primary ghost';
    how.textContent = 'How to play';
    how.addEventListener('click', () => g.goTo('howto'));

    row.appendChild(play);
    row.appendChild(how);
    panel.appendChild(row);

    // Career state, so the home screen answers "where was I?".
    const d = g.progress.data;
    const career = document.createElement('div');
    career.className = 'career';
    if (g.progress.cleared) {
      career.innerHTML = `
        <div class="career-line"><b>Ladder cleared</b> — all ${LADDER.length} bladers beaten</div>
        <div class="career-stats">${d.wins}W · ${d.losses}L · best streak ${d.bestStreak}</div>`;
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

    const header = document.createElement('div');
    header.innerHTML = `
      <h1>Beyblade Arena</h1>
      <p class="sub">Build your top, then let it rip. First to ${C.POINTS_TO_WIN} points takes the match —
      ring out or burst scores 2, outlasting your rival scores 1.</p>`;
    panel.appendChild(header);

    panel.appendChild(this.explodedView());

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

    const slots: [string, { id: string; name: string; colour?: number; note: string }[], string][] = [
      [
        'Layer — decides how hard you hit and how well you take a hit',
        LAYERS.map((l) => ({
          id: l.id,
          name: l.name,
          colour: l.colour,
          note:
            `${l.archetype} · atk ${l.attack} · def ${l.defense}` +
            (l.spinSteal > 0 ? ` · absorbs ${Math.round(l.spinSteal * 100)}%` : ''),
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
      panel.appendChild(sec);
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
    panel.appendChild(stat);

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
    panel.appendChild(skinRow);

    // Visual theme. Cosmetic and fully reversible — 'Arena' is the original
    // look, reproduced exactly.
    const themeRow = document.createElement('div');
    themeRow.className = 'slot';
    themeRow.innerHTML = '<h4>Visual style</h4>';
    const themeChips = document.createElement('div');
    themeChips.className = 'chips';
    for (const t of THEMES) {
      const chip = document.createElement('button');
      chip.className = 'chip' + (g.themeId === t.id ? ' on' : '');
      chip.innerHTML = `<span>${escapeHtml(t.name)}<br><small>${escapeHtml(t.blurb)}</small></span>`;
      chip.addEventListener('click', () => {
        g.setTheme(t.id);
        this.render();
      });
      themeChips.appendChild(chip);
    }
    themeRow.appendChild(themeChips);
    panel.appendChild(themeRow);

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
    panel.appendChild(spinRow);

    const row = document.createElement('div');
    row.className = 'row';
    const go = document.createElement('button');
    go.className = 'primary';
    go.textContent = 'Enter the arena';
    go.addEventListener('click', () => {
      // First real gesture: browsers won't start an AudioContext before one.
      g.audio.resume();
      g.startMatch();
    });
    row.appendChild(go);

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
