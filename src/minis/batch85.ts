// Eighty-fifth batch.
//   Slice - two pies of different sizes, each with a slice picked out: which slice is the bigger share?

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_FALSE, SND_TAP_L, SND_TAP_R } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, handLabel, header, mean, scaled, sideOf, Stair, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

const SLICE_TRIALS = 30;

class Slice implements Mini {
  private env!: MiniEnv;
  /** How much bigger the bigger share is, in percent of it. */
  private readonly diff = new Stair(40, 4, 3, 60, 2);
  private levels: number[] = [];
  private trial = 0;
  private shares = [0.2, 0.25];
  private starts = [0, 0];
  private radii = [1, 1];
  private bigger = 0;
  private state = 0;
  private at = 0;
  private right = 0;
  private lastOk = true;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now);
  }

  private make(now: number): void {
    this.bigger = Math.random() < 0.5 ? 0 : 1;
    const base = rnd(0.12, 0.35);
    this.shares = [base, base];
    this.shares[this.bigger] = base * (1 + this.diff.level / 100);
    // Each slice starts at its own angle, and the pies differ in size, so neither area nor position helps.
    this.starts = [rnd(0, TAU), rnd(0, TAU)];
    const big = Math.random() < 0.5 ? 0 : 1;
    this.radii = [1, 1];
    this.radii[big] = rnd(0.6, 0.8);
    this.state = 0;
    this.at = now;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 0) return;
    const ok = (s < 0 ? 0 : 1) === this.bigger;
    this.lastOk = ok;
    this.levels.push(this.diff.level);
    this.diff.update(ok, -1);
    if (ok) this.right++;
    this.env.sound(ok ? (s < 0 ? SND_TAP_L : SND_TAP_R) : SND_FALSE);
    this.trial++;
    this.state = 1;
    this.at = ts + (ok ? 400 : 1100);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.trial >= scaled(SLICE_TRIALS)) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'difference', `${this.diff.level}%`, 'pair', `${Math.min(this.trial + 1, scaled(SLICE_TRIALS))} / ${scaled(SLICE_TRIALS)}`);
    const R = Math.min((a.right - a.left) / 5, (a.bottom - a.top) * 0.33);
    [0, 1].forEach((k) => {
      const cx = a.cx + (k ? 1 : -1) * R * 1.35;
      const cy = a.cy - 10 * a.u;
      const r = R * this.radii[k]!;
      ctx.fillStyle = '#2a2a30';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.fill();
      const show = this.state === 1;
      ctx.fillStyle = show && k === this.bigger ? COL_LINE : show ? COL_DIM : '#c8c8ce';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, this.starts[k]!, this.starts[k]! + this.shares[k]! * TAU);
      ctx.closePath();
      ctx.fill();
      if (show) {
        ctx.fillStyle = COL_MID;
        v.text(`${Math.round(this.shares[k]! * 100)}%`, cx, cy + R + 22 * a.u, v.fontTiny, 'center');
      }
    });
    ctx.fillStyle = this.state === 1 && !this.lastOk ? COL_ACCENT : COL_MID;
    v.text(this.state === 1 && !this.lastOk ? 'the other slice was the bigger share' : 'which white slice is the bigger share of its own pie?', a.cx, a.bottom - 34 * a.u, v.fontTiny, 'center');
    const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  left`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`right  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const th = this.levels.length >= 10 ? mean(this.levels.slice(-12)) : 0;
    return {
      score: th ? Math.max(0, Math.round((62 - th) * 30 + this.right * 5)) : 0,
      primary: { label: 'smallest difference you see', value: Math.round(th), unit: '%', lower: true },
      lines: [
        { label: 'threshold (last 12 pairs)', value: th ? `${th.toFixed(0)}%` : '–' },
        { label: 'right', value: `${this.right} of ${this.trial}` },
      ],
      saved: this.trial >= 10,
    };
  }
}

export const BATCH85: MiniDef[] = [
  { id: 'slice', name: 'Slice', skill: 'judgement', blurb: 'Two pies of different sizes, a slice picked out of each. Which is the bigger share?', how: 'Two pies, one smaller than the other, each with one white slice turned to any angle. Which slice is the bigger share of its own pie? Size does not matter, only the angle. Get them right and the difference shrinks. Thirty pairs; scored on the smallest difference you can still see.', input: 'keys', minKeys: 2, make: () => new Slice() },
];
