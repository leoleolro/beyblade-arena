import { hash01, midiHz } from './design';
import {
  ARP_STEPS,
  BAR_SECONDS,
  BEATS_PER_BAR,
  CHORDS,
  HAT_HIGHPASS_HZ,
  KICK_HZ,
  KICK_TO_HZ,
  STEM_FALL_TAU,
  STEM_GAIN_EPS,
  STEM_RISE_TAU,
  STEPS_PER_BAR,
  STEP_SECONDS,
  TONIC_MIDI,
  arpMidi,
  humanise,
  layerGains,
  nextChordIndex,
  percAt,
} from './score';
import type { Chord, LayerGains } from './score';
import { makeNoiseBuffer, playSweep, playTone } from './voices';

/**
 * The music scheduler.
 *
 * Everything musical it does is decided in score.ts; this file is the machinery
 * that turns a bar number into oscillators at the right moment. The two things
 * it exists to get right are both timing:
 *
 *   1. Schedule against `ctx.currentTime`, never wall clock and never rAF.
 *      WebAudio's is the only clock in the browser that is sample-accurate, and
 *      rAF additionally stops entirely in a hidden tab.
 *   2. Run far enough ahead of the audible edge to survive a throttled timer.
 */

/**
 * How far ahead to schedule, in bars.
 *
 * Two bars is 3.75 s. Backgrounded tabs clamp `setInterval` to about one second
 * and can do considerably worse under load; the lookahead has to cover the
 * worst gap between two ticks or the music develops holes the moment the player
 * alt-tabs. Two bars costs nothing but a few dozen scheduled nodes.
 */
const SCHEDULE_BARS = 2;

/**
 * Pad voices, and why they are permanent oscillators rather than notes.
 *
 * A pad re-triggered every bar has an audible seam at every bar line, which is
 * precisely the thing the pad is there to hide. Four oscillators that simply
 * GLIDE to the new chord have no seam at all, cost four nodes for the whole
 * session instead of four per bar, and give the chord change a soft edge that
 * is much harder to write with envelopes.
 */
const PAD_VOICES = 4;
/** Seconds for the pad to arrive at a new chord. Under a beat, over a blink. */
const PAD_GLIDE = 0.35;
/** Pad lowpass, Hz. Below the impact band so clashes always have air above. */
const PAD_CUTOFF = 780;

/** The arp plays every other sixteenth: eight notes a bar. */
const ARP_STRIDE = 2;

export interface MusicOptions {
  /** Scatters the chord walk and the humanisation. */
  seed?: number;
}

interface Stem {
  gain: GainNode;
  /** What we last asked for, since AudioParam.value lies during a ramp. */
  target: number;
}

export class MusicDirector {
  private ctx: BaseAudioContext;
  private noise: AudioBuffer;
  private seed: number;

  private pad: Stem;
  private bass: Stem;
  private arp: Stem;
  private perc: Stem;
  private tension: Stem;

  private padOscs: OscillatorNode[] = [];
  private tensionOscs: OscillatorNode[] = [];
  /**
   * Whether the permanent oscillators have been started.
   *
   * An OscillatorNode can be started exactly ONCE in its life; a second
   * `start()` throws InvalidStateError. The pad and tension voices are
   * permanent by design (see `buildPad`), and `stop()` deliberately leaves them
   * running at zero gain — so the *second* `start()` is not a hypothetical: it
   * is what a player does the moment they toggle music off and back on again.
   * Without this flag that toggle threw and took the rest of the click handler
   * down with it.
   */
  private oscsStarted = false;

  private bar = 0;
  private chordIndex = 0;
  private nextBarTime = 0;
  private startTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private finalRound = false;

  constructor(ctx: BaseAudioContext, dest: AudioNode, opts: MusicOptions = {}) {
    this.ctx = ctx;
    this.seed = opts.seed ?? 0xb1ade;
    this.noise = makeNoiseBuffer(ctx, 1.2);

    const stem = (): Stem => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(dest);
      return { gain: g, target: 0 };
    };
    this.pad = stem();
    this.bass = stem();
    this.arp = stem();
    this.perc = stem();
    this.tension = stem();

    this.buildPad();
    this.buildTension();
  }

  /** True once the scheduler is running. */
  get playing(): boolean {
    return this.timer !== null;
  }

  /**
   * Begin, and never stop again for the life of the page.
   *
   * Stems are not resynced on a scene change and the bar counter is not reset
   * when a round starts. Restarting at a moment the player can predict is the
   * fastest way to make a generative loop sound like a loop; letting it run and
   * only moving the gains is what makes a layer arriving feel like the music
   * responding rather than the music restarting.
   */
  start(): void {
    if (this.timer !== null) return;
    const now = this.ctx.currentTime;
    // A small lead-in: scheduling the first bar at exactly `currentTime` means
    // scheduling it in the past by the time the call returns.
    this.startTime = now + 0.08;
    this.nextBarTime = this.startTime;
    if (!this.oscsStarted) {
      for (const o of [...this.padOscs, ...this.tensionOscs]) o.start(this.startTime);
      this.oscsStarted = true;
    }
    this.applyChord(CHORDS[this.chordIndex], this.startTime);
    this.tick();
    this.timer = setInterval(this.tick, BAR_SECONDS * 500);
  }

  /** Stop scheduling. The permanent oscillators keep running at zero gain. */
  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
    const t = this.ctx.currentTime;
    for (const s of this.stems()) {
      s.target = 0;
      s.gain.gain.setTargetAtTime(0, t, STEM_FALL_TAU);
    }
  }

  setFinalRound(on: boolean): void {
    this.finalRound = on;
  }

  /**
   * Move the stems to match an intensity.
   *
   * Rises are quantised to the next beat and fast; falls happen immediately and
   * slowly. Arriving on a beat is what makes a layer appearing read as
   * intentional instead of glitched, and there is nothing to quantise a fall to
   * because tension draining is not an event.
   */
  setIntensity(intensity: number): void {
    if (this.timer === null) return;
    const g = layerGains(intensity, this.finalRound);
    const now = this.ctx.currentTime;
    const beat = this.nextBeatTime(now);
    this.moveStem(this.pad, g.pad, now, beat);
    this.moveStem(this.bass, g.bass, now, beat);
    this.moveStem(this.arp, g.arp, now, beat);
    this.moveStem(this.perc, g.perc, now, beat);
    this.moveStem(this.tension, g.tension, now, beat);
  }

  /** The gains currently asked for, for tests and for the dev overlay. */
  currentGains(): LayerGains {
    return {
      pad: this.pad.target,
      bass: this.bass.target,
      arp: this.arp.target,
      perc: this.perc.target,
      tension: this.tension.target,
    };
  }

  private stems(): Stem[] {
    return [this.pad, this.bass, this.arp, this.perc, this.tension];
  }

  private moveStem(s: Stem, target: number, now: number, beat: number): void {
    if (Math.abs(target - s.target) < STEM_GAIN_EPS) return;
    const rising = target > s.target;
    s.target = target;
    s.gain.gain.setTargetAtTime(
      target,
      rising ? beat : now,
      rising ? STEM_RISE_TAU : STEM_FALL_TAU,
    );
  }

  private nextBeatTime(now: number): number {
    const beat = BAR_SECONDS / BEATS_PER_BAR;
    const n = Math.ceil((now - this.startTime) / beat);
    return this.startTime + n * beat;
  }

  private buildPad(): void {
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = PAD_CUTOFF;
    filter.connect(this.pad.gain);
    for (let i = 0; i < PAD_VOICES; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      // A few cents apart, alternating sign. Two oscillators at exactly the
      // same frequency are one oscillator; a few cents of spread is what turns
      // four notes into a chord with width.
      osc.detune.value = (i % 2 === 0 ? 1 : -1) * (3 + i * 2);
      const g = ctx.createGain();
      // Divided down so four voices sum to about one voice's worth.
      g.gain.value = 0.25 / PAD_VOICES;
      osc.connect(g).connect(filter);
      this.padOscs.push(osc);
    }
  }

  /**
   * The final-round layer: a low fifth with a fast tremolo.
   *
   * A bare open fifth deliberately — no third, so it does not commit to major
   * or minor and cannot fight whichever chord the walk is on. The tremolo is
   * what makes it read as tension rather than as another pad.
   */
  private buildTension(): void {
    const ctx = this.ctx;
    const trem = ctx.createGain();
    trem.gain.value = 0.6;
    trem.connect(this.tension.gain);

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    // 5.2 Hz: fast enough to be agitation, slow enough not to become a pitch.
    lfo.frequency.value = 5.2;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.4;
    lfo.connect(lfoDepth).connect(trem.gain);
    this.tensionOscs.push(lfo);

    for (const semi of [-12, -5]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiHz(TONIC_MIDI + semi);
      const g = ctx.createGain();
      g.gain.value = 0.09;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      osc.connect(lp).connect(g).connect(trem);
      this.tensionOscs.push(osc);
    }
  }

  private applyChord(chord: Chord, at: number): void {
    for (let i = 0; i < this.padOscs.length; i++) {
      const midi = TONIC_MIDI + chord.notes[i % chord.notes.length];
      this.padOscs[i].frequency.setTargetAtTime(midiHz(midi), at, PAD_GLIDE);
    }
  }

  private tick = (): void => {
    const horizon = this.ctx.currentTime + BAR_SECONDS * SCHEDULE_BARS;
    // Bounded, so a tab that was suspended for ten minutes catches up by
    // skipping rather than by scheduling six hundred bars into a stack.
    let guard = 0;
    while (this.nextBarTime < horizon && guard++ < 8) {
      this.emitBar(this.bar, this.nextBarTime);
      this.bar += 1;
      this.nextBarTime += BAR_SECONDS;
    }
    if (this.nextBarTime < this.ctx.currentTime) {
      this.nextBarTime = this.ctx.currentTime + 0.05;
    }
  };

  private emitBar(bar: number, at: number): void {
    this.chordIndex = nextChordIndex(this.chordIndex, hash01(this.seed, bar));
    const chord = CHORDS[this.chordIndex];
    this.applyChord(chord, at);

    // Bass: root on the downbeat and again on the eleventh sixteenth, which is
    // off the grid enough to push rather than march.
    for (const step of [0, 10]) {
      const h = humanise(this.seed, bar * STEPS_PER_BAR + step);
      playTone(
        this.ctx,
        this.bass.gain,
        {
          hz: midiHz(TONIC_MIDI + chord.bass),
          duration: step === 0 ? 0.55 : 0.3,
          gain: 0.3,
        },
        at + step * STEP_SECONDS + h.delaySeconds,
        { type: 'sawtooth', detune: h.cents, attack: 0.08 },
      );
    }

    for (let step = 0; step < STEPS_PER_BAR; step++) {
      const when = at + step * STEP_SECONDS;

      if (step % ARP_STRIDE === 0) {
        // The figure advances by its own count, not the bar's, so seven notes
        // land against eight slots and the phrase walks around the bar.
        const arpIndex = Math.floor((bar * STEPS_PER_BAR + step) / ARP_STRIDE);
        const h = humanise(this.seed, arpIndex + 7919);
        playTone(
          this.ctx,
          this.arp.gain,
          {
            hz: midiHz(arpMidi(arpIndex % ARP_STEPS, chord)),
            duration: 0.14,
            gain: 0.12,
          },
          when + h.delaySeconds,
          { type: 'triangle', detune: h.cents },
        );
      }

      const hit = percAt(bar, step);
      if (hit === 'kick') {
        playTone(
          this.ctx,
          this.perc.gain,
          { hz: KICK_HZ, toHz: KICK_TO_HZ, duration: 0.14, gain: 0.5 },
          when,
          { type: 'sine', attack: 0.02 },
        );
      } else if (hit === 'hat') {
        playSweep(
          this.ctx,
          this.perc.gain,
          this.noise,
          {
            fromHz: HAT_HIGHPASS_HZ,
            toHz: HAT_HIGHPASS_HZ * 1.4,
            q: 0.7,
            duration: 0.035,
            gain: 0.1,
          },
          when,
          { filter: 'highpass' },
        );
      }
    }
  }
}
