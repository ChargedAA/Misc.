// Eighty-ninth batch.
//   Pendulum - tap each time the pendulum reaches the end of its swing; now and then it swings unseen.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, mean, median, ms, pct, scaled, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

const PENDULUM_MS = 60000;

class Pendulum implements Mini {
  private env!: MiniEnv;
  /** Half a swing (ms): the time from one end to the other. */
  private half = 700;
  private t0 = 0;
  private started = false;
  /** Swings (by index) during which the pendulum is hidden. */
  private hiddenFrom = -1;
  private hiddenTo = -1;
  private errsSeen: number[] = [];
  private errsHidden: number[] = [];
  private signed: number[] = [];
  private lastTap = -1e9;
  private lastErr = 0;
  private held = 0;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  /** Which end-of-swing a moment is nearest, and how far from it (ms). */
  private nearest(t: number): [number, number] {
    const k = Math.round((t - this.t0) / this.half);
    return [k, t - (this.t0 + k * this.half)];
  }

  private hiddenAt(t: number): boolean {
    const k = (t - this.t0) / this.half;
    return k >= this.hiddenFrom && k < this.hiddenTo;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (!this.started) {
      this.started = true;
      this.half = rnd(600, 800);
      this.t0 = ts + this.half / 2;
      this.planHide(0);
      return;
    }
    if (ts - this.lastTap < this.half * 0.4) return;
    this.lastTap = ts;
    const [k, e] = this.nearest(ts);
    if (k < 1) return;
    this.lastErr = e;
    const hid = this.hiddenAt(this.t0 + k * this.half);
    (hid ? this.errsHidden : this.errsSeen).push(Math.abs(e));
    this.signed.push(e);
    this.env.sound(SND_TAP_WEAK);
  }

  private planHide(fromSwing: number): void {
    // After six visible ends, it hides for four, then shows for a while, and so on.
    this.hiddenFrom = fromSwing + 6 + Math.floor(Math.random() * 3);
    this.hiddenTo = this.hiddenFrom + 4;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.press(0, ts);
    this.release(0);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(PENDULUM_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    if (this.started) {
      const k = (now - this.t0) / this.half;
      if (k >= this.hiddenTo + 4) this.planHide(Math.floor(k));
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    const all = [...this.errsSeen, ...this.errsHidden];
    header(v, touch, 'typical miss', all.length ? ms(median(all)) : '–', 'time', `${left} s`);
    const L = Math.min((a.bottom - a.top) * 0.7, 320 * a.u);
    const px = a.cx;
    const py = a.top + 20 * a.u;
    // Swinging between ±0.6 rad, like a real pendulum: fastest in the middle, still at the ends.
    const phase = this.started ? ((now - this.t0) / this.half) * Math.PI : 0;
    const ang = 0.6 * Math.cos(phase);
    const bx = px + Math.sin(ang) * L;
    const by = py + Math.cos(ang) * L;
    // The two ends of the swing are marked.
    for (const s of [-1, 1]) {
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.arc(px + Math.sin(0.6 * s) * L, py + Math.cos(0.6 * s) * L, 16 * a.u, 0, TAU);
      ctx.stroke();
    }
    const hidden = this.started && this.hiddenAt(now);
    if (!hidden) {
      ctx.strokeStyle = COL_MID;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.fillStyle = now - this.lastTap < 120 ? COL_ACCENT : COL_LINE;
      ctx.beginPath();
      ctx.arc(bx, by, 14 * a.u, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = COL_MID;
      v.text('keep tapping: it is still swinging', a.cx, py + L * 0.6, v.fontTiny, 'center');
    }
    ctx.fillStyle = COL_LINE;
    ctx.beginPath();
    ctx.arc(px, py, 4 * dpr, 0, TAU);
    ctx.fill();
    ctx.fillStyle = COL_MID;
    v.text(this.started ? (now - this.lastTap < 800 ? `${this.lastErr < 0 ? 'early' : 'late'} by ${ms(Math.abs(this.lastErr))}` : '') : 'tap any key (or the screen) each time the pendulum reaches an end of its swing. press to start', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const all = [...this.errsSeen, ...this.errsHidden];
    const m = median(all);
    const bias = mean(this.signed);
    return {
      score: all.length ? Math.max(0, Math.round(all.length * Math.max(0, 200 - m) / 4)) : 0,
      primary: { label: 'typical miss', value: m, unit: 'ms', lower: true },
      lines: [
        { label: 'while you could see it', value: this.errsSeen.length ? ms(median(this.errsSeen)) : '–' },
        { label: 'while it was hidden', value: this.errsHidden.length ? ms(median(this.errsHidden)) : '–' },
        { label: 'tendency', value: this.signed.length ? (Math.abs(bias) < 15 ? 'on time' : `${bias < 0 ? 'early' : 'late'} by ${ms(Math.abs(bias))}`) : '–' },
        { label: 'taps within 40 ms', value: all.length ? pct(all.filter((e) => e < 40).length / all.length) : '–' },
      ],
      saved: all.length >= 8,
    };
  }
}

export const BATCH89: MiniDef[] = [
  { id: 'pendulum', name: 'Pendulum', skill: 'timing', blurb: 'Tap each time the pendulum reaches an end of its swing. Now and then it swings unseen.', how: 'A pendulum swings steadily, slowing at each end as a real one does. Tap any key (or the screen) as it reaches each end. Every so often it vanishes for a few swings: keep tapping in time until it comes back. A minute; your timing with and without it in view is shown apart.', input: 'both', make: () => new Pendulum() },
];
