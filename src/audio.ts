/**
 * Sound, synthesized in WebAudio.
 *
 * Everything here is generated from oscillators and noise buffers rather than
 * loaded from files: no asset pipeline, nothing to download, and the pitch of a
 * hit can track its actual impact strength instead of picking from a handful of
 * pre-recorded samples.
 *
 * Browsers refuse to start an AudioContext until the user has interacted with
 * the page, so `resume()` is called from the first real input rather than at
 * construction.
 */

export type MoveSound = 'charge' | 'block' | 'dodge';

/** The separately controllable audio channels. */
export type Channel = 'master' | 'effects' | 'drone';

export interface AudioSettings {
  master: boolean;
  /** Impacts, launches, move cues, stings. Short and transient. */
  effects: boolean;
  /**
   * The continuous spin drone. Default OFF.
   *
   * A sustained tone that never resolves is fatiguing in a way short effects
   * are not — a playtester described it as a headache and assumed it was
   * background music. It is genuinely informative (pitch tracks remaining
   * spin), so it stays available, but opting *in* is the right default.
   */
  drone: boolean;
}

const SETTINGS_KEY = 'beyblade-arena.audio.v1';

const DEFAULT_SETTINGS: AudioSettings = {
  master: true,
  effects: true,
  drone: false,
};

export class Audio {
  private ctx: AudioContext | null = null;
  /** master -> destination. Everything routes through here. */
  private master: GainNode | null = null;
  /** Transient sounds. */
  private fx: GainNode | null = null;
  /** The sustained spin drone, on its own bus so it can be silenced alone. */
  private droneBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  /** The continuous spin whine, one per top. */
  private whines = new Map<string, { osc: OscillatorNode; gain: GainNode }>();

  settings: AudioSettings = Audio.loadSettings();

  private static loadSettings(): AudioSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AudioSettings>) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // Storage unavailable; the setting still applies for this session.
    }
  }

  isOn(channel: Channel): boolean {
    return this.settings[channel];
  }

  setChannel(channel: Channel, on: boolean): void {
    this.settings[channel] = on;
    this.saveSettings();
    this.applyGains();
    // Silencing the drone should stop it immediately, not wait for the round.
    if (channel === 'drone' && !on) this.stopWhines();
  }

  private applyGains(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.fx || !this.droneBus) return;
    const t = ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.master ? 0.9 : 0, t, 0.05);
    this.fx.gain.setTargetAtTime(this.settings.effects ? 1 : 0, t, 0.05);
    this.droneBus.gain.setTargetAtTime(this.settings.drone ? 1 : 0, t, 0.05);
  }

  /** Safe to call repeatedly; only the first call does anything. */
  resume(): void {
    if (!this.ctx) {
      // Older Safari still exposes the prefixed constructor.
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);

      this.fx = this.ctx.createGain();
      this.fx.connect(this.master);

      this.droneBus = this.ctx.createGain();
      this.droneBus.connect(this.master);

      this.noiseBuffer = this.makeNoise(this.ctx, 1.2);
      this.applyGains();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private makeNoise(ctx: AudioContext, seconds: number): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** A band-passed burst of noise — the basis of every impact sound. */
  private burst(opts: {
    freq: number;
    q: number;
    duration: number;
    gain: number;
    sweepTo?: number;
  }): void {
    const ctx = this.ctx;
    if (!ctx || !this.fx || !this.noiseBuffer) return;
    const t = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(opts.freq, t);
    filter.Q.value = opts.q;
    if (opts.sweepTo !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(40, opts.sweepTo),
        t + opts.duration,
      );
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(opts.gain, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.duration);

    src.connect(filter).connect(gain).connect(this.fx);
    src.start(t);
    src.stop(t + opts.duration + 0.02);
  }

  /** A short tone, used for move cues and stings. */
  private tone(opts: {
    freq: number;
    duration: number;
    gain: number;
    type?: OscillatorType;
    sweepTo?: number;
  }): void {
    const ctx = this.ctx;
    if (!ctx || !this.fx) return;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'triangle';
    osc.frequency.setValueAtTime(opts.freq, t);
    if (opts.sweepTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, opts.sweepTo),
        t + opts.duration,
      );
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(opts.gain, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.duration);

    osc.connect(gain).connect(this.fx);
    osc.start(t);
    osc.stop(t + opts.duration + 0.02);
  }

  /** The ripcord: a rising whoosh as the top is launched. */
  launch(power: number): void {
    this.resume();
    this.burst({
      freq: 320,
      q: 1.1,
      duration: 0.55,
      gain: 0.28 + power * 0.12,
      sweepTo: 2400 + power * 1600,
    });
    this.tone({ freq: 90, duration: 0.4, gain: 0.16, type: 'sawtooth', sweepTo: 260 });
  }

  /**
   * Metal on metal. Pitch and brightness follow the actual impact strength, so
   * a glancing tap and a full smash are audibly different events.
   */
  impact(strength: number, opposite: boolean): void {
    if (!this.ctx) return;
    const s = Math.min(strength, 6);
    const gain = Math.min(0.55, 0.1 + s * 0.075);

    this.burst({
      freq: 1400 + s * 420,
      q: 0.9,
      duration: 0.1 + s * 0.02,
      gain,
      sweepTo: 300,
    });
    // Opposite-spin clashes get a harsher second layer — they drain far more.
    if (opposite) {
      this.burst({ freq: 2600 + s * 300, q: 5, duration: 0.16, gain: gain * 0.6 });
    }
    this.tone({
      freq: 160 - s * 8,
      duration: 0.12,
      gain: gain * 0.5,
      type: 'square',
      sweepTo: 60,
    });
  }

  /** Distinct cue per move, so you can hear what your rival committed to. */
  move(kind: MoveSound): void {
    if (!this.ctx) return;
    if (kind === 'charge') {
      this.tone({ freq: 220, duration: 0.26, gain: 0.3, type: 'sawtooth', sweepTo: 720 });
    } else if (kind === 'block') {
      this.tone({ freq: 520, duration: 0.3, gain: 0.26, type: 'square', sweepTo: 130 });
    } else {
      this.tone({ freq: 680, duration: 0.2, gain: 0.24, type: 'sine', sweepTo: 1500 });
    }
  }

  /**
   * The X-Rail.
   *
   * Deliberately a one-shot sweep lasting the ride rather than a sustained
   * loop: a ride is only ~0.55s, and the spin drone already proved that
   * sustained tones in this game are fatiguing. A transient that rises for
   * exactly as long as the ride tells the player the same thing without the
   * cost, and it routes through the effects bus so it follows that toggle.
   */
  railEngage(duration: number): void {
    if (!this.ctx) return;
    // The teeth biting: a short mechanical clatter.
    this.burst({ freq: 900, q: 3.5, duration: 0.09, gain: 0.3, sweepTo: 2200 });
    // The ride: pitch climbs for exactly as long as the top is locked in, so
    // the sound ends when the slingshot fires.
    this.tone({
      freq: 180,
      duration,
      gain: 0.22,
      type: 'sawtooth',
      sweepTo: 900,
    });
    this.burst({ freq: 600, q: 1.6, duration, gain: 0.16, sweepTo: 3200 });
  }

  /** The slingshot release — a downward whoosh as it lets go. */
  railRelease(): void {
    if (!this.ctx) return;
    this.burst({ freq: 2600, q: 1.1, duration: 0.28, gain: 0.3, sweepTo: 260 });
  }

  /** Rejected input — a short dull thud, so a mis-press isn't silent. */
  reject(): void {
    if (!this.ctx) return;
    this.tone({ freq: 150, duration: 0.09, gain: 0.14, type: 'square', sweepTo: 90 });
  }

  /**
   * The continuous whine of a spinning top. Frequency tracks remaining spin, so
   * the arena audibly winds down as the round goes on.
   */
  updateWhine(id: string, spinNorm: number, alive: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.droneBus) return;
    if (!this.settings.drone) return;

    let w = this.whines.get(id);
    if (!alive || spinNorm <= 0.01) {
      if (w) {
        w.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
        w.osc.stop(ctx.currentTime + 0.4);
        this.whines.delete(id);
      }
      return;
    }

    if (!w) {
      const osc = ctx.createOscillator();
      // Triangle rather than sawtooth. A sawtooth's dense upper harmonics are
      // what made this abrasive over a full round; a triangle carries the same
      // pitch information with a fraction of the harmonic content.
      osc.type = 'triangle';
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      // Well below the ear's 2-5kHz sensitivity peak, where sustained energy
      // is most tiring.
      filter.frequency.value = 900;
      osc.connect(filter).connect(gain).connect(this.droneBus);
      osc.start();
      w = { osc, gain };
      this.whines.set(id, w);
    }

    const t = ctx.currentTime;
    w.osc.frequency.setTargetAtTime(70 + spinNorm * 190, t, 0.1);
    // Roughly half the previous level, and two tops sum.
    w.gain.gain.setTargetAtTime(0.009 + spinNorm * 0.015, t, 0.1);
  }

  /** Stop every whine, e.g. when a round ends. */
  stopWhines(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const [, w] of this.whines) {
      w.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.06);
      w.osc.stop(ctx.currentTime + 0.3);
    }
    this.whines.clear();
  }

  /** Round result sting. */
  roundEnd(won: boolean): void {
    if (!this.ctx) return;
    this.stopWhines();
    if (won) {
      this.tone({ freq: 520, duration: 0.16, gain: 0.3 });
      window.setTimeout(() => this.tone({ freq: 784, duration: 0.34, gain: 0.3 }), 130);
    } else {
      this.tone({ freq: 300, duration: 0.2, gain: 0.28 });
      window.setTimeout(
        () => this.tone({ freq: 190, duration: 0.42, gain: 0.28, sweepTo: 120 }),
        150,
      );
    }
  }
}
