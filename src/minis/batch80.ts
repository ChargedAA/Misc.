// Eightieth batch.
//   Kite - a two-line stunt kite: pull the left or right line to turn, both to drive. Fly it through the rings.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALL } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, handLabel, header, plural, scaled, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

const KITE_MS = 90000;

class Kite implements Mini {
  private env!: MiniEnv;
  /** Position in the sky (0..1 across, 0 ground .. 1 top), heading (0 = straight up), speed. */
  private x = 0.5;
  private y = 0.4;
  private head = 0;
  private speed = 0.25;
  private ring: [number, number] = [0.5, 0.7];
  private ringR = 0.07;
  private held = 0;
  private started = false;
  private t0 = 0;
  private last = 0;
  private rings = 0;
  private crashes = 0;
  private crashAt = -1e9;
  private trail: [number, number][] = [];
  private firstFrame = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    this.newRing();
  }

  private newRing(): void {
    for (let tries = 0; tries < 30; tries++) {
      const r: [number, number] = [rnd(0.15, 0.85), rnd(0.3, 0.88)];
      if (Math.hypot(r[0] - this.x, r[1] - this.y) > 0.3) {
        this.ring = r;
        break;
      }
    }
    this.ringR = Math.max(0.04, 0.08 - this.rings * 0.002);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (!this.started && sideOf(slot) !== 0) {
      this.started = true;
      this.t0 = ts;
      this.last = ts;
    }
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  private side(s: number): boolean {
    for (let k = 0; k < 6; k++) if (this.held & (1 << k) && sideOf(k) === s) return true;
    return false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(KITE_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.started && now - this.crashAt > 1200) {
      const L = this.side(-1);
      const R = this.side(1);
      // One line turns the kite toward its side; both together drive it faster, straight.
      if (L && !R) this.head -= 3.2 * dt;
      if (R && !L) this.head += 3.2 * dt;
      const target = L && R ? 0.55 : L || R ? 0.32 : 0.22;
      this.speed += (target - this.speed) * Math.min(1, 2 * dt);
      this.x += Math.sin(this.head) * this.speed * dt;
      // The wind holds it up; gravity wins when it points down or slows.
      this.y += (Math.cos(this.head) * this.speed - 0.05) * dt;
      // The window: the edges of the sky turn it back gently; the ground is a crash.
      if (this.x < 0.03 || this.x > 0.97) {
        this.x = Math.max(0.03, Math.min(0.97, this.x));
        this.head = -this.head;
      }
      if (this.y > 0.98) {
        this.y = 0.98;
        this.head = Math.PI - this.head;
      }
      if (this.y < 0.02) {
        this.crashes++;
        this.crashAt = now;
        this.env.sound(SND_FALL);
        this.x = 0.5;
        this.y = 0.4;
        this.head = 0;
        this.speed = 0.25;
        this.trail = [];
      }
      if (Math.hypot(this.x - this.ring[0], (this.y - this.ring[1]) * 0.9) < this.ringR) {
        this.rings++;
        this.env.sound(SND_CATCH);
        this.newRing();
      }
      this.trail.push([this.x, this.y]);
      if (this.trail.length > 40) this.trail.shift();
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'rings', String(this.rings), 'time', `${left} s`);
    const W = Math.min(a.right - a.left, (a.bottom - a.top - 40 * a.u) * 1.6);
    const H = W / 1.6;
    const x0 = a.cx - W / 2;
    const y0 = a.top + 6 * a.u;
    const X = (x: number) => x0 + x * W;
    const Y = (y: number) => y0 + (1 - y) * H;
    ctx.fillStyle = COL_FAINT;
    ctx.fillRect(x0, Y(0), W, 2 * dpr);
    // The flyer at the bottom, and the two lines up to the kite.
    const fx = X(0.5);
    const fy = Y(0) - 4 * a.u;
    const kx = X(this.x);
    const ky = Y(this.y);
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(fx + s * 6 * a.u, fy);
      ctx.lineTo(kx + Math.cos(this.head) * s * 12 * a.u, ky + Math.sin(this.head) * s * 12 * a.u);
      ctx.stroke();
    }
    // The ring to fly through.
    ctx.strokeStyle = COL_ACCENT;
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    ctx.ellipse(X(this.ring[0]), Y(this.ring[1]), this.ringR * W, this.ringR * W * 1.1, 0, 0, TAU);
    ctx.stroke();
    // Its trail, then the kite: a diamond pointing along its heading.
    ctx.strokeStyle = '#3a3a41';
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    this.trail.forEach(([tx, ty], k) => (k ? ctx.lineTo(X(tx), Y(ty)) : ctx.moveTo(X(tx), Y(ty))));
    ctx.stroke();
    ctx.save();
    ctx.translate(kx, ky);
    ctx.rotate(this.head);
    ctx.fillStyle = now - this.crashAt < 1200 ? COL_ACCENT : COL_LINE;
    ctx.beginPath();
    ctx.moveTo(0, -16 * a.u);
    ctx.lineTo(14 * a.u, 0);
    ctx.lineTo(0, 6 * a.u);
    ctx.lineTo(-14 * a.u, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  pull left`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`pull right  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(this.started ? plural(this.crashes, 'crash', 'crashes') : 'hold one side to turn the kite that way, both to drive it; fly it through the rings. press to start', a.cx, a.bottom - 28 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.rings * 60 - this.crashes * 40),
      primary: { label: 'rings flown through', value: this.rings, unit: '' },
      lines: [
        { label: 'rings', value: String(this.rings) },
        { label: 'crashes', value: String(this.crashes) },
      ],
      saved: this.started && this.rings + this.crashes >= 2,
    };
  }
}

export const BATCH80: MiniDef[] = [
  { id: 'kite', name: 'Kite', skill: 'coordination', blurb: 'A two-line stunt kite. Pull one line to turn, both to drive. Fly it through the rings.', how: 'A stunt kite on two lines, one for each hand. Hold the left key to turn it left, the right key to turn it right, and both together to drive it faster in a straight line. Let it point down for long and it falls; hit the ground and it crashes. Fly it through each orange ring. Ninety seconds.', input: 'keys', minKeys: 2, make: () => new Kite() },
];
