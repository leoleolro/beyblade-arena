import {
  PERFECT_LAUNCH_SEMITONES,
  SPIN_UPDATE_EPS,
  STING_ROOT_MIDI,
  STING_STEP,
  burstVoice,
  countdownVoice,
  duckFor,
  duckForImpact,
  grindHz,
  grindLevel,
  impactTier,
  impactVoice,
  launchVoice,
  midiHz,
  railReleaseVoice,
  railVoice,
  rejectVoice,
  ringOutVoice,
  spinVoice,
  stingSemitones,
} from './design';
import type { ContactLike, Duck, HitLike } from './design';
import { MusicDirector } from './music';
import { MENU_INTENSITY, TONIC_MIDI, musicIntensity } from './score';
import { makeNoiseBuffer, playImpact, playSweep, playTone } from './voices';

/**
 * The audio layer's front door.
 *
 * Everything the game needs is a method named after the thing that happened —
 * `launch(power)`, `hit(event)`, `burst()` — never after a waveform. The call
 * site should read as the event, and swapping a sound should never touch the
 * call site.
 *
 * Three rules this class exists to enforce:
 *
 *   - NOTHING is created at import time. Browsers refuse to start an
 *     AudioContext before a user gesture, and a context constructed in a module
 *     body is a context that starts suspended and stays there. `resume()` is
 *     called from the first real input.
 *   - EVERY method is safe to call before that gesture. Events fire during
 *     loading far more often than anyone expects, and an audio layer that
 *     throws on the title screen takes the game down with it.
 *   - The sound DESIGN is not in here. It is in design.ts and score.ts, which
 *     are pure and tested. This file is graph plumbing and lifecycle.
 */

export type MoveSound = 'charge' | 'block' | 'dodge';

/** The separately controllable channels. */
export type Channel = 'master' | 'effects' | 'spin' | 'music';

/** Which part of the game the mix should be sitting in. */
export type Scene = 'menu' | 'launch' | 'battle' | 'result';

export interface AudioSettings {
  master: boolean;
  /** Impacts, launches, move cues, stings. Short and event-driven. */
  effects: boolean;
  /**
   * The continuous arena bed: the spin loop, and the grind of two tops leaning
   * on each other. One switch for both because they are one decision — "should
   * the arena make a noise when nothing is happening" — and because they fail
   * together: they are the only two sounds in the game that never stop.
   *
   * ON by default, which is a DEPARTURE from the usual rule that a sustained
   * tone must be opt-in, and it is worth being explicit about why. The rule
   * exists because an unresolving pure tone is fatiguing; a playtester on an
   * earlier version of this game described exactly that and assumed it was
   * music. The answer taken here is to fix the tone rather than hide it — the
   * bed is mostly filtered noise rather than a bare oscillator, it sits ~25 dB
   * under a clash, it wobbles rather than holding still, and it stops the
   * moment the round does. It also carries the single most useful piece of
   * information in the game: which top is about to die. It still has its own
   * switch, so a player who disagrees is one click from silence.
   */
  spin: boolean;
  /**
   * Adaptive music. Its own switch, never bundled under a single "sound"
   * toggle: wanting effects on and music off — because something else is
   * already playing — is one of the most common preferences there is.
   */
  music: boolean;
}

const SETTINGS_KEY = 'beyblade-arena.audio.v2';

const DEFAULT_SETTINGS: AudioSettings = {
  master: true,
  effects: true,
  spin: true,
  music: true,
};

/** Headroom. Everything sums into this, so it is not 1.0. */
const MASTER_GAIN = 0.9;

/**
 * The music bus, and the arithmetic behind the number.
 *
 * Music has to lose to effects: effects carry information, music carries mood.
 * The target is 12-18 dB under peak effect level. A heavy clash peaks at 0.62
 * (design.ts caps it there); the stems sum to roughly 0.9 at full intensity
 * before this gain. 0.13 puts the music's worst case at ~0.117, which is 14.5
 * dB under the clash — inside the band, and on the quiet side of it, which is
 * the right side to be wrong on.
 */
const MUSIC_BUS_GAIN = 0.13;

/**
 * Minimum gap between two audible impacts, seconds.
 *
 * The sim can resolve several collisions inside one frame, and an exchange can
 * land three scoring hits in 30 ms. The ear cannot separate transients that
 * close — the second one does not read as a second hit, it reads as the first
 * one being louder — so playing them all buys nothing but level and a stack of
 * nodes. Anything above a graze still gets through regardless: dropping a
 * hitstop-grade hit would break the rule that the freeze is never silent.
 */
export const GRAZE_MIN_GAP = 0.045;

/** Spin voice fade in/out, seconds. Short enough to feel instant, long enough not to click. */
const SPIN_FADE = 0.08;
/** Time constant for spin parameter moves. Smooths the 3-per-second updates. */
const SPIN_SMOOTH = 0.1;

/** Base music intensity per scene, for everything that is not a live round. */
const SCENE_INTENSITY: Record<Scene, number> = {
  menu: MENU_INTENSITY,
  // The launch screen is anticipation: pulse, but no motion yet.
  launch: 0.34,
  // Overwritten every frame by `frame()`; only a starting point.
  battle: 0.4,
  result: 0.22,
};

interface SpinNodes {
  body: OscillatorNode;
  bearing: AudioBufferSourceNode;
  lp: BiquadFilterNode;
  trem: GainNode;
  lfo: OscillatorNode;
  lfoDepth: GainNode;
  out: GainNode;
  /** Last spin this voice was written for. See SPIN_UPDATE_EPS. */
  lastSpin: number;
}

interface GrindNodes {
  src: AudioBufferSourceNode;
  band: BiquadFilterNode;
  gain: GainNode;
}

/** Minimal storage shape, so tests can pass one and Node can have none. */
export interface SettingsStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AudioEngineOptions {
  /**
   * Injection seam. Tests pass a fake; the browser gets the real thing. Return
   * null to make the engine permanently silent but still safe to call.
   */
  createContext?: () => AudioContext | null;
  /** Pass null to disable persistence entirely. */
  storage?: SettingsStore | null;
  musicSeed?: number;
}

/** Everything the audio layer needs from one frame of a round. Plain data. */
export interface TopAudioState {
  id: string;
  /** `abs(bey.spin) / SPIN_REF` — the same 0..1 the HUD bar uses. */
  spinNorm: number;
  alive: boolean;
}

export interface BattleAudioFrame {
  tops: readonly TopAudioState[];
  /** This frame's non-scoring contacts. Structurally a sim ContactEvent[]. */
  contacts: readonly ContactLike[];
  roundTime: number;
  /** Either fighter is one round from taking the match. */
  matchPoint: boolean;
  /** The round is genuinely running — not the finish hold, not a menu. */
  live: boolean;
}

export class AudioEngine {
  settings: AudioSettings;

  private makeContext: () => AudioContext | null;
  private store: SettingsStore | null;
  private musicSeed: number;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private fx: GainNode | null = null;
  private spinBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  /** Between the music and its bus, so ducking never fights the mute. */
  private duckGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private music: MusicDirector | null = null;

  private spins = new Map<string, SpinNodes>();
  private grind: GrindNodes | null = null;
  private grindValue = 0;
  private lastImpactAt = -1;
  private scene: Scene = 'menu';
  private burstCount = 0;

  constructor(opts: AudioEngineOptions = {}) {
    this.makeContext = opts.createContext ?? defaultContextFactory;
    this.store = opts.storage === undefined ? defaultStore() : opts.storage;
    this.musicSeed = opts.musicSeed ?? 0xb1ade;
    this.settings = this.loadSettings();
  }

  // ------------------------------------------------------------- settings ---

  private loadSettings(): AudioSettings {
    try {
      const raw = this.store?.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AudioSettings>) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private saveSettings(): void {
    try {
      this.store?.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // Storage unavailable (private mode, quota, no DOM). The setting still
      // applies for this session, which is the part the player asked for.
    }
  }

  isOn(channel: Channel): boolean {
    return this.settings[channel];
  }

  setChannel(channel: Channel, on: boolean): void {
    this.settings[channel] = on;
    this.saveSettings();
    this.applyChannelGains();
    // Silencing a continuous channel must stop it NOW, not at the end of the
    // round. A gain of zero is inaudible but it is still a node graph running,
    // and "off" should mean off.
    if (channel === 'spin' && !on) this.stopSpin();
    if (channel === 'music') {
      if (on) this.music?.start();
      else this.music?.stop();
    }
  }

  private applyChannelGains(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.fx || !this.spinBus || !this.musicBus) return;
    const t = ctx.currentTime;
    // 0.05 rather than an instant set: a step in a gain is a click.
    this.master.gain.setTargetAtTime(this.settings.master ? MASTER_GAIN : 0, t, 0.05);
    this.fx.gain.setTargetAtTime(this.settings.effects ? 1 : 0, t, 0.05);
    this.spinBus.gain.setTargetAtTime(this.settings.spin ? 1 : 0, t, 0.05);
    this.musicBus.gain.setTargetAtTime(
      this.settings.music ? MUSIC_BUS_GAIN : 0,
      t,
      0.05,
    );
  }

  // ------------------------------------------------------------ lifecycle ---

  /** True once a context exists. Everything is a no-op until then. */
  get ready(): boolean {
    return this.ctx !== null;
  }

  /**
   * Create the context if it does not exist, and un-suspend it.
   *
   * Idempotent and cheap after the first call, because it is called from every
   * plausible first gesture — a key press, a menu button, the launch itself —
   * and if the UI is restructured the gesture moves. A game whose only symptom
   * is silence is very easy to ship.
   */
  resume(): void {
    if (!this.ctx) {
      const ctx = this.makeContext();
      if (!ctx) return;
      this.ctx = ctx;

      this.master = ctx.createGain();
      this.master.connect(ctx.destination);

      this.fx = ctx.createGain();
      this.fx.connect(this.master);

      this.spinBus = ctx.createGain();
      this.spinBus.connect(this.master);

      this.musicBus = ctx.createGain();
      this.musicBus.connect(this.master);

      this.duckGain = ctx.createGain();
      this.duckGain.gain.value = 1;
      this.duckGain.connect(this.musicBus);

      this.noise = makeNoiseBuffer(ctx);
      this.music = new MusicDirector(ctx, this.duckGain, { seed: this.musicSeed });

      this.applyChannelGains();
      if (this.settings.music) {
        this.music.start();
        this.music.setIntensity(SCENE_INTENSITY[this.scene]);
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /**
   * Park everything. For a hidden tab: rAF stops but the audio thread does not,
   * so without this the music plays on to an empty room.
   */
  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  /** Which part of the game we are in. Moves the music; does not restart it. */
  setScene(scene: Scene): void {
    this.scene = scene;
    if (scene !== 'battle') {
      this.stopSpin();
      this.music?.setFinalRound(false);
    }
    this.music?.setIntensity(SCENE_INTENSITY[scene]);
  }

  // --------------------------------------------------------------- events ---

  /**
   * Pre-round pips. `step` is 3, 2, 1 and then 0 for GO.
   *
   * Nothing in the game currently counts down — see the wiring notes. It is
   * here because a countdown is the one moment where the player is doing
   * nothing and listening, and it is the cheapest place in a match to establish
   * the key the rest of the audio is written in.
   */
  countdown(step: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.fx) return;
    const v = countdownVoice(step);
    playTone(ctx, this.fx, { hz: v.hz, duration: v.duration, gain: v.gain }, ctx.currentTime, {
      type: 'sine',
    });
  }

  /** The ripcord. This is also the gesture that starts the context. */
  launch(power: number): void {
    this.resume();
    const ctx = this.ctx;
    if (!ctx || !this.fx || !this.noise) return;
    const v = launchVoice(power);
    playSweep(ctx, this.fx, this.noise, v.rip, ctx.currentTime);
    playTone(
      ctx,
      this.fx,
      {
        hz: v.shoveHz,
        toHz: v.shoveToHz,
        duration: v.shoveDuration,
        gain: v.shoveGain,
      },
      ctx.currentTime,
      { type: 'sawtooth' },
    );
    this.duck(duckFor('launch'));
  }

  /**
   * The rip landed in the green band.
   *
   * Laid OVER the launch roar rather than replacing it: the launch still has to
   * sound like a launch. This is a bonus on top of an action, not a different
   * action, so it is bright and short enough to cut through half a second of
   * noise that is already playing.
   */
  perfectLaunch(): void {
    const ctx = this.ctx;
    if (!ctx || !this.fx) return;
    const t = ctx.currentTime;
    PERFECT_LAUNCH_SEMITONES.forEach((semi, i) => {
      playTone(
        ctx,
        this.fx!,
        { hz: midiHz(TONIC_MIDI + semi), duration: 0.16 + i * 0.08, gain: 0.14 - i * 0.03 },
        t + i * 0.075,
        { type: 'triangle' },
      );
    });
  }

  /** Distinct cue per move, so a rival's commitment can be heard as well as seen. */
  move(kind: MoveSound): void {
    const ctx = this.ctx;
    if (!ctx || !this.fx) return;
    const t = ctx.currentTime;
    if (kind === 'charge') {
      playTone(ctx, this.fx, { hz: 220, toHz: 720, duration: 0.26, gain: 0.3 }, t, {
        type: 'sawtooth',
      });
    } else if (kind === 'block') {
      // Falling and square: a shutter coming down.
      playTone(ctx, this.fx, { hz: 520, toHz: 130, duration: 0.3, gain: 0.26 }, t, {
        type: 'square',
      });
    } else {
      // Rising and sine: getting out of the way.
      playTone(ctx, this.fx, { hz: 680, toHz: 1500, duration: 0.2, gain: 0.24 }, t, {
        type: 'sine',
      });
    }
  }

  /** Rejected input. A mis-press with no sound reads as a dropped input. */
  reject(): void {
    const ctx = this.ctx;
    if (!ctx || !this.fx) return;
    const v = rejectVoice();
    playTone(
      ctx,
      this.fx,
      { hz: v.fromHz, toHz: v.toHz, duration: v.duration, gain: v.gain },
      ctx.currentTime,
      { type: 'square' },
    );
  }

  /**
   * A clash. Takes a sim HitEvent directly — structurally, so the audio layer
   * never imports one and the sim never learns that audio exists.
   */
  hit(event: HitLike): void {
    const ctx = this.ctx;
    if (!ctx || !this.fx || !this.noise) return;
    const t = ctx.currentTime;
    const tier = impactTier(event.strength);
    if (tier === 'graze' && t - this.lastImpactAt < GRAZE_MIN_GAP) return;
    this.lastImpactAt = t;
    playImpact(ctx, this.fx, this.noise, impactVoice(event), t);
    const plan = duckForImpact(tier);
    if (plan) this.duck(plan);
  }

  /**
   * The X-Rail bite and ride. `grip` is the top's `stats.railGrip`, 0..1.
   *
   * One shot lasting exactly as long as the ride, not a loop that gets faded
   * out. A loop can outlive the thing it describes; a transient cannot.
   */
  railEngage(duration: number, grip: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.fx || !this.noise) return;
    const v = railVoice(duration, grip);
    const t = ctx.currentTime;
    playSweep(ctx, this.fx, this.noise, v.bite, t);
    playSweep(ctx, this.fx, this.noise, v.air, t);
    playTone(
      ctx,
      this.fx,
      { hz: v.ride.fromHz, toHz: v.ride.toHz, duration: v.ride.duration, gain: v.ride.gain },
      t,
      { type: 'sawtooth' },
    );
  }

  /** The slingshot letting go. */
  railRelease(): void {
    const ctx = this.ctx;
    if (!ctx || !this.fx || !this.noise) return;
    playSweep(ctx, this.fx, this.noise, railReleaseVoice(), ctx.currentTime);
  }

  /** A burst finish: one crack, then debris. */
  burst(): void {
    const ctx = this.ctx;
    if (!ctx || !this.fx || !this.noise) return;
    const t = ctx.currentTime;
    const v = burstVoice(this.burstCount++);
    playSweep(ctx, this.fx, this.noise, v.crack, t);
    playTone(ctx, this.fx, { hz: 150, toHz: 48, duration: 0.3, gain: 0.4 }, t, {
      type: 'square',
    });
    for (const s of v.shards) {
      playSweep(
        ctx,
        this.fx,
        this.noise,
        { fromHz: s.hz, toHz: s.hz * 0.6, q: 4, duration: s.duration, gain: s.gain },
        t,
        { delay: s.delay },
      );
    }
    this.duck(duckFor('finish'));
  }

  /** A ring out: one continuous fall, then a landing outside the dish. */
  ringOut(xtreme: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.fx || !this.noise) return;
    const t = ctx.currentTime;
    const v = ringOutVoice(xtreme);
    playSweep(ctx, this.fx, this.noise, v.fall, t);
    playTone(
      ctx,
      this.fx,
      { hz: v.landHz, toHz: 55, duration: 0.22, gain: v.landGain },
      t + v.landDelay,
      { type: 'square' },
    );
    v.bellSemitones.forEach((semi, i) => {
      playTone(
        ctx,
        this.fx!,
        { hz: midiHz(TONIC_MIDI + semi), duration: 0.3, gain: 0.13 },
        t + 0.06 + i * 0.07,
        { type: 'sine' },
      );
    });
    this.duck(duckFor('finish'));
  }

  /**
   * The round result.
   *
   * Scheduled on the audio clock rather than with setTimeout: a timer in a
   * throttled tab can arrive hundreds of milliseconds late, and a two-note
   * motif whose second note is late is not a motif.
   */
  roundEnd(won: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.fx) return;
    this.stopSpin();
    const t = ctx.currentTime;
    stingSemitones(won).forEach((semi, i) => {
      playTone(
        ctx,
        this.fx!,
        {
          hz: midiHz(STING_ROOT_MIDI + semi),
          // The last note is the one that lands, so it gets the length.
          duration: i === 2 ? 0.42 : 0.16,
          gain: 0.3,
        },
        t + i * STING_STEP,
        { type: 'triangle' },
      );
    });
    this.duck(duckFor('finish'));
  }

  // ---------------------------------------------------------- the bed ------

  /**
   * Per-frame update: the spin bed, the grind, and the music's intensity.
   *
   * One call rather than three so the wiring in game.ts is a single line and
   * cannot drift out of step with itself.
   */
  frame(f: BattleAudioFrame, dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;

    if (f.live && this.settings.spin) {
      for (const top of f.tops) this.updateSpinVoice(top);
      this.updateGrind(f.contacts, dt);
    } else if (this.spins.size > 0 || this.grindValue > 0) {
      this.stopSpin();
    }

    if (this.music) {
      this.music.setFinalRound(f.matchPoint);
      this.music.setIntensity(
        f.live
          ? musicIntensity({
              spins: f.tops.filter((t) => t.alive).map((t) => t.spinNorm),
              roundTime: f.roundTime,
              matchPoint: f.matchPoint,
            })
          : SCENE_INTENSITY[this.scene],
      );
    }
  }

  /** Stop every continuous voice. Called when a round ends or the bed is muted. */
  stopSpin(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const [, v] of this.spins) this.releaseSpinVoice(v, t);
    this.spins.clear();
    if (this.grind) {
      this.grind.gain.gain.setTargetAtTime(0, t, 0.06);
      this.grind.src.stop(t + 0.4);
      this.grind = null;
    }
    this.grindValue = 0;
  }

  private releaseSpinVoice(v: SpinNodes, t: number): void {
    v.out.gain.setTargetAtTime(0, t, SPIN_FADE);
    // Stop well after the fade. Stopping on the same frame is a click, and a
    // click at the end of every round is the one the player remembers.
    v.body.stop(t + 0.4);
    v.bearing.stop(t + 0.4);
    v.lfo.stop(t + 0.4);
  }

  private updateSpinVoice(top: TopAudioState): void {
    const ctx = this.ctx;
    if (!ctx || !this.spinBus || !this.noise) return;
    const t = ctx.currentTime;
    let v = this.spins.get(top.id);

    if (!top.alive || top.spinNorm <= 0.01) {
      if (v) {
        this.releaseSpinVoice(v, t);
        this.spins.delete(top.id);
      }
      return;
    }

    if (!v) {
      v = this.buildSpinVoice(ctx, top.spinNorm, t);
      this.spins.set(top.id, v);
      return;
    }

    if (Math.abs(top.spinNorm - v.lastSpin) < SPIN_UPDATE_EPS) return;
    v.lastSpin = top.spinNorm;
    const sv = spinVoice(top.spinNorm);
    v.body.frequency.setTargetAtTime(sv.hz, t, SPIN_SMOOTH);
    v.lp.frequency.setTargetAtTime(sv.cutoffHz, t, SPIN_SMOOTH);
    v.out.gain.setTargetAtTime(sv.gain, t, SPIN_SMOOTH);
    v.lfo.frequency.setTargetAtTime(sv.wobbleHz, t, SPIN_SMOOTH);
    v.lfoDepth.gain.setTargetAtTime(sv.wobbleDepth, t, SPIN_SMOOTH);
    v.trem.gain.setTargetAtTime(1 - sv.wobbleDepth, t, SPIN_SMOOTH);
  }

  /**
   * One top's voice: a body tone, bearing hiss, a shared lowpass, and a
   * tremolo whose rate is the wobble.
   *
   * The hiss is what stops this being the pure tone that got called a headache
   * last time. A filtered noise layer gives the ear something to latch onto
   * that is not a pitch, and it is also what makes a top sound mechanical
   * rather than synthesised.
   */
  private buildSpinVoice(ctx: AudioContext, spinNorm: number, t: number): SpinNodes {
    const sv = spinVoice(spinNorm);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = sv.cutoffHz;
    lp.Q.value = 0.9;

    const trem = ctx.createGain();
    trem.gain.value = 1 - sv.wobbleDepth;

    const out = ctx.createGain();
    out.gain.value = 0;
    lp.connect(trem).connect(out).connect(this.spinBus!);
    out.gain.setTargetAtTime(sv.gain, t, SPIN_FADE);

    const body = ctx.createOscillator();
    // Triangle, not sawtooth. A sawtooth's dense upper harmonics are what made
    // the previous version abrasive over a full round; a triangle carries the
    // same pitch information with a fraction of the harmonic content, and the
    // hiss layer supplies the texture the harmonics were doing badly.
    body.type = 'triangle';
    body.frequency.value = sv.hz;
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.62;
    body.connect(bodyGain).connect(lp);
    body.start(t);

    const bearing = ctx.createBufferSource();
    bearing.buffer = this.noise!;
    bearing.loop = true;
    const bearingGain = ctx.createGain();
    // Well under the body. This is texture, not a voice of its own.
    bearingGain.gain.value = 0.22;
    bearing.connect(bearingGain).connect(lp);
    bearing.start(t, Math.random() * 0.5);

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = sv.wobbleHz;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = sv.wobbleDepth;
    lfo.connect(lfoDepth).connect(trem.gain);
    lfo.start(t);

    return { body, bearing, lp, trem, lfo, lfoDepth, out, lastSpin: spinNorm };
  }

  /**
   * The grind of two tops leaning on each other.
   *
   * A level that follows the contacts rather than a sound per contact. The sim
   * reports the pair inside contact distance on 22.5% of all frames and up to
   * 96% late in a round; one-shotting that is a machine gun, and silencing it
   * is what "the fight feels dead" actually was.
   */
  private updateGrind(contacts: readonly ContactLike[], dt: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.spinBus || !this.noise) return;
    this.grindValue = grindLevel(this.grindValue, contacts, dt);
    if (this.grindValue <= 0 && !this.grind) return;

    if (!this.grind) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = 1.4;
      band.frequency.value = grindHz(0);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(band).connect(gain).connect(this.spinBus);
      src.start(ctx.currentTime, Math.random() * 0.5);
      this.grind = { src, band, gain };
    }

    let slip = 0;
    for (const c of contacts) {
      const a = Math.abs(c.slip);
      if (a > slip) slip = a;
    }
    const t = ctx.currentTime;
    this.grind.gain.gain.setTargetAtTime(this.grindValue, t, 0.03);
    if (contacts.length > 0) {
      this.grind.band.frequency.setTargetAtTime(grindHz(slip), t, 0.05);
    }
  }

  // -------------------------------------------------------------- ducking ---

  /**
   * Get the music out of the way.
   *
   * Cancels first and re-anchors at the current computed value, because
   * overlapping ducks otherwise leave an earlier release scheduled to fire
   * after a later duck has started — the music comes back up in the middle of
   * the very thing it was ducking for.
   */
  private duck(plan: Duck): void {
    const ctx = this.ctx;
    const g = this.duckGain;
    if (!ctx || !g) return;
    const t = ctx.currentTime;
    const now = g.gain.value;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(now, t);
    // Time constants are a third of the stated time: setTargetAtTime is
    // exponential and gets ~95% of the way there in three of them.
    g.gain.setTargetAtTime(plan.gain, t, Math.max(0.005, plan.attack / 3));
    g.gain.setTargetAtTime(
      1,
      t + plan.attack + plan.hold,
      Math.max(0.01, plan.release / 3),
    );
  }
}

function defaultContextFactory(): AudioContext | null {
  const g = globalThis as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  // Older Safari still only exposes the prefixed constructor.
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

function defaultStore(): SettingsStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Accessing localStorage throws outright in some privacy modes.
    return null;
  }
}
