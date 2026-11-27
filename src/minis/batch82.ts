// Eighty-second batch.
//   Duo - the mouse follows a wandering target while the keys keep a drifting needle centred.

import { COL_ACCENT, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, handLabel, header, pct, scaled, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

const DUO_MS = 60000;

class Duo implements Mini {
  private env!: MiniEnv;
  /** The target's place and the pointer's, in field shares. */
  private tx = 0.5;
  private ty = 0.5;
  private ph = [rnd(0, TAU), rnd(0, TAU), rnd(0, TAU)];
  private px = -1;
  private py = -1;
  /** The needle: -1..1, with a drift that keeps changing. */
  private needle = 0;
  private nv = 0;
  private drift = 0;
  private held = 0;
  private started = false;
  private t0 = 0;
  private last = 0;
  private onTarget = 0;
  private onNeedle = 0;
  private both = 0;
  private field: [number, number, number, number] = [0, 0, 1, 1];
  private firstFrame = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (!this.started && sideOf(slot) !== 0) this.begin(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  private begin(ts: number): void {
    this.started = true;
    this.t0 = ts;
    this.last = ts;
  }

  pointerMove(x: number, y: number): void {
    const [fx, fy, fw, fh] = this.field;
    this.px = (x - fx) / fw;
    this.py = (y - fy) / fh;
  }

  pointer(x: number, y: number, ts: number): void {
    this.pointerMove(x, y);
    if (!this.started) this.begin(ts);
  }

  private steer(): number {
    let s = 0;
    for (let k = 0; k < 6; k++) if (this.held & (1 << k)) s += sideOf(k);
    return Math.sign(s);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(DUO_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const [, , fw, fh] = this.field;
    if (this.started) {
      const t = (now - this.t0) / 1000;
      const sp = 1 + t / 60;
      // The target wanders on a smooth, never-repeating path.
      this.tx = 0.5 + 0.36 * Math.sin(t * 0.7 * sp + this.ph[0]!) * Math.cos(t * 0.23 + this.ph[1]!);
      this.ty = 0.5 + 0.34 * Math.sin(t * 0.53 * sp + this.ph[2]!);
      // The needle drifts one way, then the other; the keys push back.
      this.drift = 0.6 * Math.sin(t * 0.45 + this.ph[0]!) + 0.3 * Math.sin(t * 1.3 + this.ph[1]!);
      this.nv += (this.drift * sp * 0.9 + this.steer() * 1.6) * dt;
      this.nv *= Math.pow(0.3, dt);
      this.needle = Math.max(-1, Math.min(1, this.needle + this.nv * dt));
      if (Math.abs(this.needle) >= 1) this.nv = 0;
      const r = 0.06;
      const onT = Math.hypot((this.px - this.tx) * fw, (this.py - this.ty) * fh) <= r * fh;
      const onN = Math.abs(this.needle) < 0.25;
      if (onT) this.onTarget += dt;
      if (onN) this.onNeedle += dt;
      if (onT && onN) this.both += dt;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const el = this.started ? Math.max(0.001, Math.min(len, now - this.t0) / 1000) : 0;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'both at once', this.started ? pct(this.both / el) : '–', 'time', `${left} s`);
    // The field for the mouse task, and the gauge for the keys below it.
    const gH = 50 * a.u;
    const nfx = a.left;
    const nfy = a.top + 4 * a.u;
    const nfw = a.right - a.left;
    const nfh = a.bottom - a.top - gH - 40 * a.u;
    this.field = [nfx, nfy, nfw, nfh];
    ctx.strokeStyle = COL_FAINT;
    ctx.lineWidth = dpr;
    ctx.strokeRect(nfx, nfy, nfw, nfh);
    const R = 0.06 * nfh;
    const onT = Math.hypot((this.px - this.tx) * nfw, (this.py - this.ty) * nfh) <= R;
    ctx.strokeStyle = onT ? COL_LINE : COL_ACCENT;
    ctx.lineWidth = 2.5 * dpr;
    ctx.beginPath();
    ctx.arc(nfx + this.tx * nfw, nfy + this.ty * nfh, R, 0, TAU);
    ctx.stroke();
    if (this.px >= 0) {
      ctx.fillStyle = COL_LINE;
      ctx.beginPath();
      ctx.arc(nfx + this.px * nfw, nfy + this.py * nfh, 3 * dpr, 0, TAU);
      ctx.fill();
    }
    const gy = nfy + nfh + 20 * a.u;
    const gw = Math.min(nfw * 0.7, 520 * a.u);
    const gx = a.cx - gw / 2;
    ctx.fillStyle = '#16161a';
    ctx.fillRect(gx, gy, gw, gH * 0.5);
    ctx.fillStyle = '#26262b';
    ctx.fillRect(a.cx - gw * 0.125, gy, gw * 0.25, gH * 0.5);
    const onN = Math.abs(this.needle) < 0.25;
    ctx.fillStyle = onN ? COL_LINE : COL_ACCENT;
    ctx.fillRect(a.cx + this.needle * gw * 0.5 - 2 * dpr, gy - 6 * a.u, 4 * dpr, gH * 0.5 + 12 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  push left`, gx - 12 * a.u, gy + gH * 0.3, v.fontTiny, 'right');
    v.text(`push right  ${handLabel(this.env, 1)}`, gx + gw + 12 * a.u, gy + gH * 0.3, v.fontTiny, 'left');
    if (!this.started) {
      ctx.fillStyle = COL_MID;
      v.text('keep the pointer in the ring with the mouse, and the needle in the middle with the keys. click to start', a.cx, nfy + nfh / 2, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const total = this.started ? Math.max(0.001, Math.min(scaled(DUO_MS), this.last - this.t0) / 1000) : 1;
    return {
      score: Math.round((this.both / total) * 2000),
      primary: { label: 'time on both at once', value: Math.round((this.both / total) * 100), unit: '%' },
      lines: [
        { label: 'both at once', value: pct(this.both / total) },
        { label: 'pointer on target', value: pct(this.onTarget / total) },
        { label: 'needle centred', value: pct(this.onNeedle / total) },
      ],
      saved: this.started && total > 5,
    };
  }
}

export const BATCH82: MiniDef[] = [
  { id: 'duo', name: 'Duo', skill: 'coordination', blurb: 'The mouse follows a wandering target while the keys keep a drifting needle centred.', how: 'Two jobs at once. With the mouse, keep the pointer inside the ring as it wanders the screen. With the keys, keep the needle below in the middle band: it drifts one way and then the other, and the left and right keys push it back. Scored on the time both are right together. A minute.', input: 'both', minKeys: 2, make: () => new Duo() },
];

