// Eighty-third batch.
//   Parallel - turn your line until it runs parallel to the reference line across the screen.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, handLabel, header, mean, scaled, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

const PARALLEL_ROUNDS = 12;
const SET_MS = 7000;

class Parallel implements Mini {
  private env!: MiniEnv;
  private round = 0;
  /** Angles in radians: the reference, yours, and where each sits on the screen. */
  private ref = 0;
  private mine = 0;
  private refPos: [number, number] = [0.25, 0.5];
  private minePos: [number, number] = [0.75, 0.5];
  private frame_ = false;
  private state = 0; // 0 turning, 1 result
  private at = 0;
  private last = 0;
  private lastErr = 0;
  private errs: number[] = [];
  private held = 0;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm(now);
  }

  private arm(now: number): void {
    this.ref = rnd(0, Math.PI);
    this.mine = this.ref + (Math.random() < 0.5 ? -1 : 1) * rnd(0.4, 1.2);
    // Far apart, at different heights; later a tilted frame around yours tries to mislead.
    this.refPos = [rnd(0.15, 0.35), rnd(0.25, 0.75)];
    this.minePos = [rnd(0.65, 0.85), rnd(0.25, 0.75)];
    this.frame_ = this.round >= 6;
    this.state = 0;
    this.at = now + SET_MS;
    this.last = now;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    // Both sides at once locks it in early.
    let l = false;
    let r = false;
    for (let k = 0; k < 6; k++) if (this.held & (1 << k)) (sideOf(k) < 0 ? (l = true) : sideOf(k) > 0 && (r = true));
    if (l && r && this.state === 0) this.lock(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  private lock(now: number): void {
    // Lines have no direction: compare angles modulo half a turn.
    let d = (this.mine - this.ref) % Math.PI;
    if (d > Math.PI / 2) d -= Math.PI;
    if (d < -Math.PI / 2) d += Math.PI;
    this.lastErr = (d * 180) / Math.PI;
    this.errs.push(Math.abs(this.lastErr));
    this.env.sound(Math.abs(this.lastErr) < 2 ? SND_CATCH : SND_TAP_WEAK);
    this.round++;
    this.state = 1;
    this.at = now + 1500;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.state === 0) {
      let s = 0;
      for (let k = 0; k < 6; k++) if (this.held & (1 << k)) s += sideOf(k);
      // A steady, gentle turn: fine enough to set within a degree with taps.
      this.mine += Math.sign(s) * 0.5 * dt;
      if (now >= this.at) this.lock(now);
    } else if (now >= this.at) {
      if (this.round >= scaled(PARALLEL_ROUNDS)) return true;
      this.arm(now);
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'off by', this.errs.length ? `${mean(this.errs.slice(-3)).toFixed(1)}°` : '–', 'line', `${Math.min(this.round + 1, scaled(PARALLEL_ROUNDS))} / ${scaled(PARALLEL_ROUNDS)}`);
    const W = a.right - a.left;
    const H = a.bottom - a.top - 50 * a.u;
    const L = Math.min(W, H) * 0.32;
    const line = (cx: number, cy: number, ang: number, col: string, w: number) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = w * dpr;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - Math.cos(ang) * L, cy - Math.sin(ang) * L);
      ctx.lineTo(cx + Math.cos(ang) * L, cy + Math.sin(ang) * L);
      ctx.stroke();
      ctx.lineCap = 'butt';
    };
    const rx = a.left + this.refPos[0] * W;
    const ry = a.top + 10 * a.u + this.refPos[1] * H;
    const mx = a.left + this.minePos[0] * W;
    const my = a.top + 10 * a.u + this.minePos[1] * H;
    if (this.frame_) {
      // A tilted square around your line, to pull the eye.
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(0.25 * Math.sin(this.round * 1.7));
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeRect(-L * 1.2, -L * 1.2, L * 2.4, L * 2.4);
      ctx.restore();
    }
    line(rx, ry, this.ref, '#a8a8b0', 3);
    line(mx, my, this.mine, this.state === 1 ? (Math.abs(this.lastErr) < 2 ? COL_LINE : COL_ACCENT) : COL_LINE, 3);
    if (this.state === 1) line(mx, my, this.ref, COL_MID, 1);
    if (this.state === 0) {
      ctx.fillStyle = COL_ACCENT;
      ctx.fillRect(a.cx - 100 * a.u, a.bottom - 34 * a.u, 200 * a.u * Math.max(0, (this.at - now) / SET_MS), 3 * dpr);
    }
    ctx.fillStyle = COL_MID;
    v.text(this.state === 1 ? `off by ${Math.abs(this.lastErr).toFixed(1)}°` : 'turn the white line until it is parallel to the grey one; both keys together to lock it in', a.cx, a.bottom - 6 * a.u, v.fontTiny, 'center');
    const off = Math.min(220 * a.u, W / 2 - 20 * a.u);
    if (this.state === 0) {
      v.text(`${handLabel(this.env, -1)}  anticlockwise`, a.cx - off, a.top + 12 * a.u, v.fontTiny, 'center');
      v.text(`clockwise  ${handLabel(this.env, 1)}`, a.cx + off, a.top + 12 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.max(0, Math.round((15 - m) * 150)) : 0,
      primary: { label: 'average error', value: Math.round(m * 10) / 10, unit: '°', lower: true, decimals: 1 },
      lines: [
        { label: 'average error', value: this.errs.length ? `${m.toFixed(1)}°` : '–' },
        { label: 'within 2°', value: String(this.errs.filter((e) => e < 2).length) },
      ],
      saved: this.errs.length >= 3,
    };
  }
}

export const BATCH83: MiniDef[] = [
  { id: 'parallel', name: 'Parallel', skill: 'judgement', blurb: 'Turn your line until it runs parallel to the reference line across the screen.', how: 'A grey line on one side of the screen, your white line on the other. Hold left or right to turn yours until the two are parallel, then press both together to lock it in (or wait for the bar to run out). From the seventh line on, a tilted frame around yours tries to pull your eye. Twelve lines; scored in degrees off.', input: 'keys', minKeys: 2, make: () => new Parallel() },
];
