// Eighty-seventh batch.
//   Magnitude - two numbers in different sizes of type: press the side of the bigger number, not the bigger print.

import { COL_ACCENT, COL_LINE, COL_MID } from '../config.ts';
import { SND_FALSE, SND_TAP_L, SND_TAP_R } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, handLabel, header, median, ms, scaled, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

const MAG_MS = 45000;

class Magnitude implements Mini {
  private env!: MiniEnv;
  private nums: [number, number] = [1, 2];
  /** Which side gets the big print, and whether it agrees with the bigger number. */
  private bigPrint = 0;
  private congruent = true;
  private t0 = 0;
  private at = 0;
  private started = false;
  private ok = 0;
  private bad = 0;
  private rtCon: number[] = [];
  private rtInc: number[] = [];
  private flash = 0;
  private held = 0;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  private make(now: number): void {
    const a = rint(1, 9);
    let b = rint(1, 9);
    while (b === a) b = rint(1, 9);
    this.nums = [a, b];
    this.congruent = Math.random() < 0.5;
    const bigger = a > b ? 0 : 1;
    this.bigPrint = this.congruent ? bigger : 1 - bigger;
    this.at = now;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0) return;
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.make(ts);
      return;
    }
    const bigger = this.nums[0] > this.nums[1] ? 0 : 1;
    if ((s < 0 ? 0 : 1) === bigger) {
      this.ok++;
      (this.congruent ? this.rtCon : this.rtInc).push(ts - this.at);
      this.env.sound(s < 0 ? SND_TAP_L : SND_TAP_R);
    } else {
      this.bad++;
      this.flash = ts + 400;
      this.env.sound(SND_FALSE);
    }
    this.make(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(MAG_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const off = Math.min(170 * a.u, (a.right - a.left) / 4);
    if (this.started) {
      this.nums.forEach((n, k) => {
        const big = k === this.bigPrint;
        ctx.font = `600 ${Math.round((big ? 110 : 44) * a.u)}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = now < this.flash ? COL_ACCENT : COL_LINE;
        ctx.fillText(String(n), a.cx + (k ? 1 : -1) * off, a.cy - 10 * a.u);
      });
    } else {
      ctx.font = `600 ${Math.round(32 * a.u)}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = COL_LINE;
      ctx.fillText('which number is bigger?', a.cx, a.cy - 10 * a.u);
    }
    const koff = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  left`, a.cx - koff, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`right  ${handLabel(this.env, 1)}`, a.cx + koff, a.bottom - 6 * a.u, v.fontTiny, 'center');
    if (!this.started) v.text('go by the value, not the size of the print. press either side to start', a.cx, a.bottom - 30 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const c = median(this.rtCon);
    const i = median(this.rtInc);
    return {
      score: Math.max(0, this.ok * 20 - this.bad * 40),
      primary: { label: 'right in 45 seconds', value: this.ok, unit: '' },
      lines: [
        { label: 'right', value: String(this.ok) },
        { label: 'wrong', value: String(this.bad) },
        { label: 'print agreeing', value: this.rtCon.length ? ms(c) : '–' },
        { label: 'print disagreeing', value: this.rtInc.length ? ms(i) : '–' },
        { label: 'cost of the clash', value: this.rtCon.length && this.rtInc.length ? ms(Math.max(1, i - c)) : '–' },
      ],
      saved: this.ok + this.bad >= 6,
    };
  }
}

export const BATCH87: MiniDef[] = [
  { id: 'magnitude', name: 'Magnitude', skill: 'speed', blurb: 'Two numbers, one in big print. Press the side of the bigger number, not the bigger print.', how: 'Two digits, one printed large and one small. Press the side of the digit with the bigger value. Half the time the big print is on the smaller number. Forty-five seconds; the results show how much the clash slows you.', input: 'keys', minKeys: 2, make: () => new Magnitude() },
];
