// Tiny procedural sound effects. Every sound is synthesised once into an
// AudioBuffer when the context starts; playing one is a single buffer source.
// There is deliberately no sound on cue onset: an audible cue would turn the
// visual reaction test into an auditory one.

export const SND_TAP_L = 0;
export const SND_TAP_R = 1;
export const SND_TAP_WEAK = 2;
export const SND_CATCH = 3;
export const SND_LURCH = 4;
export const SND_FALSE = 5;
export const SND_FALL = 6;
export const SND_BURST_OK = 7;
export const SND_UI = 8;
export const SND_SURGE = 9;
/** Five pickup ticks, rising with the chain: SND_RING + 0..4. */
export const SND_RING = 10;
/** Seven mallet tones on a pentatonic scale, low to high: SND_TONE + 0..6. */
export const SND_TONE = 15;
/** Metronome: SND_BEAT, and a brighter SND_BEAT_UP for the first beat of a bar. */
export const SND_BEAT = 22;
export const SND_BEAT_UP = 23;
const SOUND_COUNT = 24;

type Synth = (t: number, i: number) => number;

export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private pans: (AudioNode | null)[] = [null, null, null];
  private readonly buffers: (AudioBuffer | null)[] = new Array<AudioBuffer | null>(SOUND_COUNT).fill(null);
  private readonly panOf = new Int8Array(SOUND_COUNT);
  private noiseSeed = 12345;

  /** Must be called from a user gesture (first key or click). */
  /** How long after a sound is started it reaches the speakers (ms), as the browser reports it. */
  latencyMs(): number {
    const c = this.ctx as (AudioContext & { outputLatency?: number }) | null;
    if (!c) return 0;
    const ms = ((c.outputLatency ?? 0) + (c.baseLatency ?? 0)) * 1000;
    return Number.isFinite(ms) ? Math.min(250, Math.max(0, ms)) : 0;
  }

  /** Freeze the audio clock (sounds already scheduled wait too), for a pause. */
  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    // A gentle limiter, so sounds that land together never clip.
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -9;
    lim.knee.value = 6;
    lim.ratio.value = 12;
    lim.attack.value = 0.002;
    lim.release.value = 0.12;
    this.master.connect(lim);
    lim.connect(ctx.destination);
    for (let i = 0; i < 3; i++) {
      if (typeof ctx.createStereoPanner === 'function') {
        const p = ctx.createStereoPanner();
        p.pan.value = (i - 1) * 0.35;
        p.connect(this.master);
        this.pans[i] = p;
      } else {
        this.pans[i] = this.master;
      }
    }
    this.build(ctx);
  }

  /** Master volume, 0 to 1. */
  volume = 0.8;

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setValueAtTime(m ? 0 : this.volume, this.ctx.currentTime);
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx && !this.muted) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
  }

  /** Play a sound now, or `delayMs` from now on the audio clock (sample-accurate, unlike a frame). */
  play(id: number, delayMs = 0): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const buf = this.buffers[id];
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.pans[this.panOf[id]! + 1]!);
    src.start(delayMs > 0 ? ctx.currentTime + delayMs / 1000 : 0);
  }

  /** A pure tone at any pitch, with a soft attack and release: for listening drills. */
  /**
   * A pure tone. `pan` places it exactly, from -1 (left) to 1 (right); `toHz` glides the
   * pitch smoothly to that frequency over the tone's length.
   */
  tone(hz: number, ms: number, pan = 0, gain = 0.18, toHz?: number): void {
    const ctx = this.ctx;
    if (!ctx || this.muted || !this.master) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz;
    if (toHz) {
      osc.frequency.setValueAtTime(hz, ctx.currentTime + 0.01);
      osc.frequency.exponentialRampToValueAtTime(toHz, ctx.currentTime + Math.max(0.02, ms / 1000 - 0.01));
    }
    const g = ctx.createGain();
    const t = ctx.currentTime;
    const d = ms / 1000;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.015);
    g.gain.setValueAtTime(gain, t + Math.max(0.02, d - 0.03));
    g.gain.linearRampToValueAtTime(0, t + d);
    osc.connect(g);
    // Placed exactly where asked, not on the three fixed positions the game sounds use.
    if (pan && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      p.connect(this.master);
    } else g.connect(this.master);
    osc.start(t);
    osc.stop(t + d + 0.02);
  }

  /**
   * A plucked note, warmer than a pure tone and easy to name: a triangle with a soft attack,
   * a quick decay to a sustain, and a release. `delayMs` schedules it on the audio clock,
   * so chords land together and phrases keep time.
   */
  note(hz: number, ms: number, delayMs = 0, gain = 0.16): void {
    const ctx = this.ctx;
    if (!ctx || this.muted || !this.master) return;
    const t = ctx.currentTime + Math.max(0, delayMs) / 1000;
    const d = ms / 1000;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(gain * 0.45, t + 0.18);
    g.gain.setValueAtTime(gain * 0.45, t + Math.max(0.2, d - 0.08));
    g.gain.linearRampToValueAtTime(0, t + d);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + d + 0.02);
  }

  private noise(): number {
    this.noiseSeed = (Math.imul(this.noiseSeed, 1664525) + 1013904223) | 0;
    return (this.noiseSeed >>> 8) / 8388608 - 1;
  }

  private make(ctx: AudioContext, id: number, seconds: number, pan: number, fn: Synth): void {
    const rate = ctx.sampleRate;
    const n = Math.max(1, Math.round(seconds * rate));
    const buf = ctx.createBuffer(1, n, rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = fn(i / rate, i);
    // Short fades so nothing clicks at the edges.
    const fade = Math.min(n >> 1, Math.round(rate * 0.0015));
    for (let i = 0; i < fade; i++) {
      d[i]! *= i / fade;
      d[n - 1 - i]! *= i / fade;
    }
    this.buffers[id] = buf;
    this.panOf[id] = pan;
  }

  private build(ctx: AudioContext): void {
    const TAU = Math.PI * 2;
    const rate = ctx.sampleRate;
    // A soft attack (1.5 ms) keeps every onset crisp enough to time to, without a click.
    const att = (t: number) => Math.min(1, t / 0.0015);
    /** A struck tone: a sine that drops a little in pitch, with a quieter overtone. */
    const strike = (f: number, decay: number, gain: number, over = 2.76, drop = 0.06): Synth => {
      let p1 = 0;
      let p2 = 0;
      return (t) => {
        const ff = f * (1 + drop * Math.exp(-t / 0.01));
        p1 += (TAU * ff) / rate;
        p2 += (TAU * ff * over) / rate;
        return (Math.sin(p1) + 0.25 * Math.sin(p2) * Math.exp(-t / (decay * 0.4))) * Math.exp(-t / decay) * att(t) * gain;
      };
    };
    /** Woody: a struck tone with a short filtered-noise knock on top. */
    const wood = (f: number, decay: number, gain: number): Synth => {
      const tone = strike(f, decay, gain, 2.4, 0.12);
      let lp = 0;
      return (t, i) => {
        lp += (this.noise() - lp) * 0.25;
        return tone(t, i) + lp * Math.exp(-t / 0.004) * gain * 0.6;
      };
    };
    /** Two struck notes, the second `gap` seconds after the first. */
    const two = (a: Synth, b: Synth, gap: number): Synth => (t, i) => a(t, i) + (t > gap ? b(t - gap, i) : 0);

    // Your own presses: short and woody, left a little lower than right.
    this.make(ctx, SND_TAP_L, 0.06, -1, wood(392, 0.018, 0.22));
    this.make(ctx, SND_TAP_R, 0.06, 1, wood(466, 0.018, 0.22));
    this.make(ctx, SND_TAP_WEAK, 0.05, 0, wood(262, 0.012, 0.14));
    this.make(ctx, SND_UI, 0.04, 0, strike(1047, 0.012, 0.07));
    // Pickups: a rising run on a pentatonic scale.
    const penta = [0, 2, 4, 7, 9];
    for (let i = 0; i < 5; i++) this.make(ctx, SND_RING + i, 0.2, 0, strike(880 * Math.pow(2, penta[i]! / 12), 0.06, 0.12, 3.01));

    // Melodic tones: a soft felt mallet, exactly in tune (A4 = 440 Hz, equal temperament): a
    // sine with a gentle octave overtone and no pitch bend at the start. E4 up to F#5, pentatonic.
    const scale = [0, 2, 4, 7, 9, 12, 14];
    for (let i = 0; i < 7; i++) {
      const f = 440 * Math.pow(2, (64 + scale[i]! - 69) / 12);
      this.make(ctx, SND_TONE + i, 0.6, 0, strike(f, 0.22, 0.26, 2, 0));
    }
    // Metronome: a woodblock with a sharp, clear onset; the first beat of a bar higher.
    this.make(ctx, SND_BEAT, 0.09, 0, wood(784, 0.03, 0.3));
    this.make(ctx, SND_BEAT_UP, 0.09, 0, wood(1175, 0.032, 0.32));

    // Surge: a short upward whoosh.
    let ph = 0;
    let lpS = 0;
    this.make(ctx, SND_SURGE, 0.16, 0, (t) => {
      const f = 220 + 700 * (t / 0.16);
      ph += (TAU * f) / rate;
      lpS += (this.noise() - lpS) * 0.08;
      const env = Math.min(1, t / 0.02) * Math.exp(-t / 0.05);
      return (Math.sin(ph) * 0.5 + lpS * 0.8) * env * 0.18;
    });

    // Right: a bright two-note chime, up a fifth.
    this.make(ctx, SND_CATCH, 0.3, 0, two(strike(880, 0.07, 0.13, 3.01), strike(1319, 0.11, 0.12, 3.01), 0.045));

    // Lurch / hit: a dull, low knock.
    let lp = 0;
    this.make(ctx, SND_LURCH, 0.18, 0, (t) => {
      lp += (this.noise() - lp) * 0.06;
      return (lp * 1.2 * Math.exp(-t / 0.015) + Math.sin(TAU * 130 * t) * Math.exp(-t / 0.05)) * att(t) * 0.32;
    });

    // Wrong: a soft, low, slightly sour double note. Unmistakable, not a buzzer.
    let w1 = 0;
    let w2 = 0;
    this.make(ctx, SND_FALSE, 0.2, 0, (t) => {
      w1 += (TAU * 196) / rate;
      w2 += (TAU * 185) / rate;
      return (Math.sin(w1) + Math.sin(w2)) * 0.5 * Math.exp(-t / 0.06) * att(t) * 0.22;
    });

    // Fail: a falling tone with a soft knock.
    let lp2 = 0;
    let phase = 0;
    this.make(ctx, SND_FALL, 0.5, 0, (t) => {
      const f = 55 + 110 * Math.exp(-t / 0.09);
      phase += (TAU * f) / rate;
      lp2 += (this.noise() - lp2) * 0.04;
      return (Math.sin(phase) * Math.exp(-t / 0.14) + lp2 * Math.exp(-t / 0.015)) * att(t) * 0.42;
    });

    // Cleared / best: three rising notes.
    this.make(ctx, SND_BURST_OK, 0.4, 0, two(two(strike(659, 0.06, 0.12, 3.01), strike(880, 0.06, 0.12, 3.01), 0.06), strike(1319, 0.14, 0.12, 3.01), 0.12));
  }
}
