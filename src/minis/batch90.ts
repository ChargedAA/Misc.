// Ninetieth batch.
//   Keepup - click under each falling ball to knock it back up. More balls join; don't let any land.

import { COL_ACCENT, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_FALL, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, plural, scaled, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

const KEEPUP_MS = 75000;
const KEEPUP_LIVES = 3;
const GRAV = 0.9;
const R = 0.045;

type Ball = { x: number; y: number; vx: number; vy: number; hit: number };

class Keepup implements Mini {
  private env!: MiniEnv;
  private balls: Ball[] = [];
  private started = false;
  private t0 = 0;
  private last = 0;
  private kicks = 0;
  private drops = 0;
  private misses = 0;
  private dropAt = -1e9;
  private field: [number, number, number, number] = [0, 0, 1, 1];
  private firstFrame = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
  }

  private add(): void {
    this.balls.push({ x: rnd(0.2, 0.8), y: 0.15, vx: rnd(-0.15, 0.15), vy: 0, hit: 0 });
  }

  press(): void {}

  pointer(px: number, py: number, ts: number): void {
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.last = ts;
      this.add();
      return;
    }
    const [fx, fy, fw, fh] = this.field;
    const x = (px - fx) / fw;
    const y = (py - fy) / fh;
    // The nearest ball within reach gets the kick; where you hit it sets the sideways push.
    let best: Ball | null = null;
    let bd = 1e9;
    for (const b of this.balls) {
      const d = Math.hypot((b.x - x) * (fw / fh), b.y - y);
      if (d < bd) [bd, best] = [d, b];
    }
    if (!best || bd > R * 1.6) {
      this.misses++;
      return;
    }
    best.vy = -rnd(0.85, 1.0);
    best.vx = (best.x - x) * 6 + rnd(-0.05, 0.05);
    best.hit = ts;
    this.kicks++;
    this.env.sound(SND_TAP_WEAK);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(KEEPUP_MS);
    if (this.started && (now - this.t0 >= len || this.drops >= KEEPUP_LIVES)) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.started) {
      const t = (now - this.t0) / 1000;
      // A ball joins every fifteen seconds, up to three; a lost ball comes back after a moment.
      const want = Math.min(3, 1 + Math.floor(t / 15));
      if (this.balls.length < want && now - this.dropAt > 1200) this.add();
      for (const b of this.balls) {
        b.vy += GRAV * (1 + t / 150) * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < R || b.x > 1 - R) {
          b.vx = -b.vx * 0.8;
          b.x = Math.max(R, Math.min(1 - R, b.x));
        }
        if (b.y < R && b.vy < 0) {
          b.vy = -b.vy * 0.5;
          b.y = R;
        }
      }
      const before = this.balls.length;
      this.balls = this.balls.filter((b) => b.y < 1 + R);
      if (this.balls.length < before) {
        this.drops += before - this.balls.length;
        this.dropAt = now;
        this.env.sound(SND_FALL);
      }
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'kicks', String(this.kicks), 'time', `${left} s`, KEEPUP_LIVES - this.drops, KEEPUP_LIVES);
    const fh = a.bottom - a.top - 30 * a.u;
    const fw = Math.min(a.right - a.left, fh * 1.3);
    const fx = a.cx - fw / 2;
    const fy = a.top + 4 * a.u;
    this.field = [fx, fy, fw, fh];
    ctx.strokeStyle = COL_FAINT;
    ctx.lineWidth = dpr;
    ctx.strokeRect(fx, fy, fw, fh);
    ctx.fillStyle = now - this.dropAt < 500 ? COL_ACCENT : COL_FAINT;
    ctx.fillRect(fx, fy + fh - 2 * dpr, fw, 3 * dpr);
    for (const b of this.balls) {
      ctx.fillStyle = now - b.hit < 120 ? COL_MID : COL_LINE;
      ctx.beginPath();
      ctx.arc(fx + b.x * fw, fy + b.y * fh, R * fh, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = COL_MID;
    v.text(this.started ? plural(this.drops, 'ball dropped', 'balls dropped') : 'click just under a ball to knock it up; hitting off-centre sends it sideways. click to start', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const lasted = this.started ? Math.min(scaled(KEEPUP_MS), this.last - this.t0) / 1000 : 0;
    return {
      score: Math.max(0, this.kicks * 10 + Math.round(lasted * 5) - this.drops * 40),
      primary: { label: 'kicks', value: this.kicks, unit: '' },
      lines: [
        { label: 'kicks', value: String(this.kicks) },
        { label: 'kept going', value: `${Math.round(lasted)} s` },
        { label: 'balls dropped', value: String(this.drops) },
        { label: 'clicks that missed', value: String(this.misses) },
      ],
      saved: this.started && this.kicks + this.drops >= 3,
    };
  }
}

export const BATCH90: MiniDef[] = [
  { id: 'keepup', name: 'Keepup', skill: 'aim', blurb: 'Click under each falling ball to knock it back up. More join; don’t let any land.', how: 'A ball falls; click just under it to knock it back up. Hitting it off-centre sends it sideways, so aim for the middle. A second ball joins after fifteen seconds and a third after thirty, and gravity slowly strengthens. Three dropped balls, or seventy-five seconds.', input: 'pointer', make: () => new Keepup() },
];
