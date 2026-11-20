// Sound check: tap along to a steady click so the rhythm games can allow for how late
// sound reaches you on this setup (Bluetooth headphones can add 150 ms or more).

import { COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT, SND_BEAT_UP } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, median, message, type Mini, type MiniEnv, type MiniResult } from './kit.ts';

const BEATS = 20;
const LEAD = 4;
const IOI = 600;

export class SoundCheck implements Mini {
  private env!: MiniEnv;
  private t0 = 0;
  private times: number[] = [];
  /** Press minus click start (ms), for presses near a click after the lead-in. */
  readonly offsets: number[] = [];
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.t0 = now + 800;
    for (let i = 0; i < BEATS; i++) {
      this.times.push(this.t0 + i * IOI);
      env.soundAt?.(i % 4 === 0 ? SND_BEAT_UP : SND_BEAT, this.t0 - now + i * IOI);
    }
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const k = Math.round((ts - this.t0) / IOI);
    if (k < LEAD || k >= BEATS) return;
    const off = ts - this.times[k]!;
    if (Math.abs(off) < IOI * 0.45) this.offsets.push(off);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  /** Typical delay from a click starting to your press landing on it (ms). */
  delay(): number {
    return this.offsets.length >= 6 ? median(this.offsets) : NaN;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (now > this.t0 + BEATS * IOI + 400) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const k = Math.floor((now - this.t0) / IOI);
    header(v, touch, 'taps counted', String(this.offsets.length), 'beat', `${Math.max(0, Math.min(BEATS, k + 1))} / ${BEATS}`);
    // A steady visual count, deliberately not flashing on the beat: the ear has to do the work.
    for (let i = 0; i < BEATS; i++) {
      ctx.fillStyle = i <= k ? COL_MID : COL_DIM;
      ctx.fillRect(a.cx + (i - BEATS / 2) * 18 * a.u, a.cy + 40 * a.u, 8 * a.u, 2 * v.dpr);
    }
    message(v, { ...a, cy: a.cy - 30 * a.u }, k < LEAD ? 'listen…' : 'tap any key exactly on each click', 'eyes closed is best', k < LEAD ? COL_MID : COL_LINE);
    if (this.env.muted) message(v, { ...a, cy: a.cy + 90 * a.u }, 'sound is off: turn it on in settings first', '', COL_MID);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return { score: 0, primary: { label: 'delay', value: this.delay(), unit: 'ms' }, lines: [], saved: false };
  }
}
