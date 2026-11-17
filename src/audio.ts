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
const SOUND_COUNT = 15;

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
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(ctx.destination);
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

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setValueAtTime(m ? 0 : 1, this.ctx.currentTime);
  }

  play(id: number): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const buf = this.buffers[id];
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.pans[this.panOf[id]! + 1]!);
    src.start();
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
    const tick = (f: number, gain: number): Synth => (t) =>
      (Math.sin(TAU * f * t) * 0.8 + this.noise() * 0.2) * Math.exp(-t / 0.0035) * gain;
    this.make(ctx, SND_TAP_L, 0.022, -1, tick(1750, 0.16));
    this.make(ctx, SND_TAP_R, 0.022, 1, tick(2150, 0.16));
    this.make(ctx, SND_TAP_WEAK, 0.02, 0, tick(820, 0.1));
    this.make(ctx, SND_UI, 0.018, 0, tick(1300, 0.08));
    for (let i = 0; i < 5; i++) this.make(ctx, SND_RING + i, 0.03, 0, tick(2300 * Math.pow(1.122, i), 0.085));

    // Surge: a short upward whip.
    let ph = 0;
    this.make(ctx, SND_SURGE, 0.14, 0, (t) => {
      const f = 260 + 900 * (t / 0.14);
      ph += (TAU * f) / ctx.sampleRate;
      const env = Math.min(1, t / 0.012) * Math.exp(-t / 0.05);
      return (Math.sin(ph) * 0.7 + this.noise() * 0.3) * env * 0.2;
    });

    // Reflex caught: a crisp two-part click.
    this.make(ctx, SND_CATCH, 0.05, 0, (t) => {
      const a = Math.sin(TAU * 3200 * t) * Math.exp(-t / 0.004);
      const u = t - 0.018;
      const b = u > 0 ? Math.sin(TAU * 4300 * u) * Math.exp(-u / 0.006) : 0;
      return (a + b) * 0.2;
    });

    // Lurch: a dull knock.
    let lp = 0;
    this.make(ctx, SND_LURCH, 0.16, 0, (t) => {
      lp += (this.noise() - lp) * 0.12;
      return (lp * 1.6 * Math.exp(-t / 0.02) + Math.sin(TAU * 150 * t) * Math.exp(-t / 0.045)) * 0.34;
    });

    // False start: a short flat blip.
    this.make(ctx, SND_FALSE, 0.07, 0, (t) => (Math.sin(TAU * 240 * t) > 0 ? 1 : -1) * Math.exp(-t / 0.025) * 0.07);

    // Fail thud: falling sine with a soft noise transient.
    let lp2 = 0;
    let phase = 0;
    const rate = ctx.sampleRate;
    this.make(ctx, SND_FALL, 0.42, 0, (t) => {
      const f = 42 + 78 * Math.exp(-t / 0.07);
      phase += (TAU * f) / rate;
      lp2 += (this.noise() - lp2) * 0.06;
      return (Math.sin(phase) * Math.exp(-t / 0.11) + lp2 * 1.4 * Math.exp(-t / 0.018)) * 0.5;
    });

    // Heavy pull cleared: two rising blips.
    this.make(ctx, SND_BURST_OK, 0.11, 0, (t) => {
      const a = Math.sin(TAU * 1250 * t) * Math.exp(-t / 0.012);
      const u = t - 0.05;
      const b = u > 0 ? Math.sin(TAU * 1880 * u) * Math.exp(-u / 0.016) : 0;
      return (a + b) * 0.13;
    });
  }
}
