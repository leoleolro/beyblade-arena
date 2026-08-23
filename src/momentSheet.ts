import type { Game } from './game';
import { AI_ID, PLAYER_ID } from './game';
import * as C from './sim/constants';

/**
 * A filmstrip of the moments that only exist for a few frames.
 *
 * The contact sheet answers "does every bey look right in every theme". It
 * cannot answer "does a clash look right", because a clash is four frames long
 * and lives inside a running match. Checking one by hand means starting a
 * round, guessing when two tops will meet, and screenshotting — which mostly
 * produces pictures of nothing happening, and is exactly how "the clashing and
 * launch effect doesn't look like the video" went unnoticed on this end.
 *
 * So this drives the sim BY HAND. `Game.stop()` takes the render loop out of
 * the way, the round is stepped a frame at a time until the event we care about
 * fires, and the renderer is snapshotted at chosen offsets after it. The sim is
 * seeded and deterministic, so the same call gives the same filmstrip and a
 * before/after comparison is a real comparison.
 *
 * Requires `?shot` in the URL — see `ArenaRenderer.snapshot`.
 *
 * WHAT IT CANNOT FILM, so nobody adds it and wonders why the strip is empty:
 * anything drawn outside the WebGL canvas. `snapshot` reads the canvas, and the
 * manga impact frame, the finisher title card, the speed lines and the whole
 * HUD are DOM overlays — they would come back missing rather than wrong, which
 * is the worse failure. Those need `__manga()` and an ordinary screenshot; see
 * main.ts.
 */

const STEP = 1 / 60;

/**
 * Frames after the event to capture. 0 is the frame the event lands on.
 *
 * THREE, not five. The strip is read by looking at it, and five frames laid
 * across a 1280px window are 160px each — wide enough to see that something
 * happened and far too small to judge whether it looks right, which is the only
 * question being asked.
 *
 * Per moment, because the two events have very different lengths. A clash is
 * over in a fifth of a second; the entry drop is ENTRY_TIME = 0.35s of fall
 * plus a rebound, so sampling it on a clash's schedule photographs the same
 * instant three times.
 */
const OFFSETS: Record<Moment, number[]> = {
  clash: [0, 4, 12],
  launch: [0, 10, 22],
  // A defeat animation is the longest thing here: burst scatter runs 0.34s and
  // a ring-out arc 0.4s, both followed by a hold. Sampled across that whole
  // span rather than bunched at the front.
  burst: [0, 8, 20],
  ringout: [0, 8, 20],
};

/**
 * Give up looking for the event after this many frames.
 *
 * 8 seconds of sim, not 25. Every frame here is a full `renderer.update` —
 * effects, particles, camera, the lot — so patience is paid for in wall clock,
 * and at 25s the whole call ran past the 30s budget of the harness driving it
 * and returned nothing at all. A heavy clash lands inside 8s in the
 * overwhelming majority of rounds (played.test.ts: 3.28 of them per round, p50
 * round length 7.4s), and a run that finds nothing is cheap to repeat.
 */
const PATIENCE: Record<Moment, number> = {
  clash: 60 * 8,
  launch: 60 * 2,
  // A round ends at p50 7.4s and p90 19.4s (played.test.ts), so a defeat needs
  // real patience where a clash does not. Still bounded: a run that finds
  // nothing is cheap to repeat, and a run that never returns is not.
  burst: 60 * 22,
  ringout: 60 * 22,
};

export type Moment = 'clash' | 'launch' | 'burst' | 'ringout';

interface Frame {
  label: string;
  url: string;
}

/**
 * Step the round until `ready` says the interesting frame has arrived, then
 * capture the offsets after it.
 *
 * Both the sim and the renderer are advanced by the same fixed step, so the
 * effects — which decay on real elapsed seconds — age at the rate they would in
 * a real match rather than at whatever rate the stepping loop happens to run.
 */
/** Why a capture came back empty, for a message that is worth reading. */
let lastMiss = '';

function capture(game: Game, moment: Moment): Frame[] {
  const shots: Frame[] = [];
  lastMiss = `${moment} did not happen within ${(PATIENCE[moment] / 60).toFixed(0)}s of sim`;
  const spec = MOMENTS[moment];
  const offsets = OFFSETS[moment];

  // Some moments cannot be waited for, only caused. The entry drop is over
  // 21 frames after the round starts, so by the time anything is stepping the
  // sim it has already happened — the only way to film it is to start the
  // round from in here.
  spec.prime?.(game);

  const battle = game.battle;
  let found = -1;
  for (let f = 0; f < PATIENCE[moment]; f++) {
    if (found < 0) {
      game.ai.update(battle, STEP);
      battle.update(STEP);
    }
    game.renderer.update(
      battle.beys,
      found < 0 ? battle.hits : [],
      STEP,
      found < 0 ? battle.contacts : [],
    );

    if (found < 0 && spec.ready(game)) found = f;

    // A round that has ENDED will never produce the event, and stepping a
    // finished battle is just burning wall clock — 22 seconds of it, on the
    // first run of the burst capture, to discover the round had ring-outed
    // four seconds in. Bail and say so: "did not happen" and "could not have
    // happened" are different answers and only one of them means try again.
    if (found < 0 && battle.phase !== 'battle') {
      lastMiss =
        `round ended by ${battle.lastRound?.reason ?? 'unknown'} before any ${moment}` +
        ' — run it again, or pick a matchup that ends the way you want to film';
      break;
    }

    if (found >= 0) {
      const since = f - found;
      if (offsets.includes(since)) {
        const url = game.renderer.snapshot();
        if (!url) return [];
        shots.push({ label: `+${since}f (${(since * STEP * 1000) | 0}ms)`, url });
        if (since === offsets[offsets.length - 1]) break;
      }
      // Past the event the sim keeps running; only the first frame of the
      // event itself is special.
      if (since > 0) {
        game.ai.update(battle, STEP);
        battle.update(STEP);
      }
    }
  }
  return shots;
}

interface MomentSpec {
  /** Put the game into the state where the event is about to happen. */
  prime?: (game: Game) => void;
  /** True on the frame the event lands. */
  ready: (game: Game) => boolean;
  /**
   * Whether a round that ends the wrong way should be replayed.
   *
   * Only the defeat moments want this. How a round ends is not something the
   * caller chooses — three consecutive attempts at filming a burst produced a
   * burst, a ring-out and a spin-finish — so without a retry the tool is a
   * lottery, and a tool you have to run five times is one nobody runs.
   */
  retry?: boolean;
}

const MOMENTS: Record<Moment, MomentSpec> = {
  // The frame a genuinely heavy hit lands. HITSTOP_THRESHOLD is the same gate
  // the shockwave and the screen shake use, so this is the moment the game
  // itself considers worth reacting to.
  clash: {
    ready: (game) => game.battle.hits.some((h) => h.strength >= C.HITSTOP_THRESHOLD),
  },

  // The entry drop, filmed from the frame the round starts.
  //
  // This one has to CAUSE the event rather than wait for it. An earlier version
  // waited for `roundTime > 0.05`, which is true a single frame in — so it
  // filmed three near-identical pictures of two tops already sitting on the
  // dish, and the drop the strip was supposed to show had finished before the
  // first frame was taken.
  //
  // `game.launch()` is exactly what the space bar calls, so what gets filmed is
  // the real entry and not a reconstruction of one. Its entry angle comes from
  // Math.random, so unlike the clash this strip is NOT frame-identical between
  // runs; the tops arrive from a different bearing each time. Composition and
  // timing are what it is for, and those do not move.
  launch: {
    prime: (game) => game.launch(),
    ready: (game) => game.battle.roundTime > 0,
  },

  // The two ways a round ends badly. Both are pure presentation — the sim has
  // already decided — and both had never been looked at frame by frame.
  burst: {
    ready: (game) => game.battle.beys.some((b) => b.defeat === 'burst'),
    retry: true,
  },
  ringout: {
    ready: (game) => game.battle.beys.some((b) => b.defeat === 'knockout'),
    retry: true,
  },
};

/** How many rounds to burn looking for a defeat that ends the right way. */
const ROUND_ATTEMPTS = 12;

/**
 * Start a fresh round without going through the launch screen.
 *
 * `Game.launch` is the real entry point and is used where it can be, but it
 * only works from the launch screen — and after a round ends the game is on
 * round-over. This is the same call `launch` makes underneath, with both sides
 * chosen by the AI, so the round it starts is an ordinary one.
 */
function restartRound(game: Game): void {
  const angle = Math.random() * Math.PI * 2;
  const player = game.battle.fighters.find((f) => f.id === PLAYER_ID);
  const ai = game.battle.fighters.find((f) => f.id === AI_ID);
  if (!player || !ai) return;
  game.battle.startRound({
    [PLAYER_ID]: game.ai.chooseLaunch(player.build, angle),
    [AI_ID]: game.ai.chooseLaunch(ai.build, angle),
  });
  game.renderer.start(angle);
}

/** Compose the captured frames into one labelled strip. */
async function strip(frames: Frame[], title: string): Promise<string> {
  // createImageBitmap, not `new Image()` + decode. An <img> only settles its
  // decode once the document paints, and the tab driving this is usually
  // backgrounded — so the Image path hangs forever having already done every
  // expensive part of the job. Decoding a blob is independent of compositing.
  const imgs = await Promise.all(
    frames.map(async (f) => createImageBitmap(await (await fetch(f.url)).blob())),
  );
  if (!imgs.length) throw new Error('no frames captured');

  const W = 420;
  const H = Math.round((imgs[0].height / imgs[0].width) * W);
  const PAD = 8;
  const LABEL = 20;

  const sheet = document.createElement('canvas');
  sheet.width = imgs.length * (W + PAD) + PAD;
  sheet.height = H + LABEL * 2 + PAD * 2;
  const ctx = sheet.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(0, 0, sheet.width, sheet.height);

  ctx.fillStyle = '#9fb3d1';
  ctx.font = '14px ui-monospace, monospace';
  ctx.fillText(title, PAD, LABEL - 4);

  imgs.forEach((img, i) => {
    const x = PAD + i * (W + PAD);
    ctx.drawImage(img, x, LABEL + PAD, W, H);
    ctx.fillStyle = '#9fb3d1';
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText(frames[i].label, x, LABEL + PAD + H + 14);
  });

  return sheet.toDataURL('image/png');
}

/**
 * Capture a moment from the CURRENT round and show it, replacing the page.
 *
 * Call it with a round already running. It stops the render loop and does not
 * restart it: the round has been stepped by hand and is no longer in sync with
 * anything, so resuming would be misleading. Reload to play again.
 */
export async function showMoment(game: Game, moment: Moment = 'clash'): Promise<void> {
  game.stop();

  let frames = capture(game, moment);
  if (!frames.length && MOMENTS[moment].retry) {
    for (let attempt = 1; attempt < ROUND_ATTEMPTS && !frames.length; attempt++) {
      restartRound(game);
      frames = capture(game, moment);
    }
  }
  if (!frames.length) {
    document.body.innerHTML =
      '<pre style="color:#e66;font:14px ui-monospace;padding:24px">' +
      `no ${moment}: ${lastMiss}` +
      '</pre>';
    return;
  }

  const url = await strip(frames, `${moment} · ${game.themeId}`);
  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;background:#0b0e14;overflow:auto';
  const img = new Image();
  img.src = url;
  img.style.cssText = 'display:block;width:100%;height:auto';
  document.body.appendChild(img);
  // Deliberately NOT awaiting decode. A backgrounded tab does not composite,
  // so decode never settles and the whole call times out having already done
  // all the work — the strip is built and on the page either way.
}
