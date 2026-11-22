// Seventeenth batch: more things you steer.
//   Tower  (timing)       - a block slides over the stack; drop it squarely. Overhang is cut off.
//   Lander (coordination) - feather the thrust to touch down softly on the pad.
//   Merge  (judgement)    - cars stream past the junction. Pull out into the first safe gap.
//   Pour   (judgement)    - fill the glass to the line. It keeps flowing after you let go.
//   Route  (memory)       - learn a string of turns, then drive it from memory.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALL, SND_FALSE, SND_LURCH, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK, SND_TONE } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { TONE, lander } from './sprites.ts';
import { Stair, arena, clamp, footer, handLabel, header, mean, message, ms, pct, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult, scaled } from './kit.ts';

// --- Tower ------------------------------------------------------------------------

class Tower implements Mini {
  private env!: MiniEnv;
  /** Each placed block: left edge and width, in 0..1 of the base. */
  private stack: { x: number; w: number }[] = [{ x: 0.3, w: 0.4 }];
  private x = 0;
  private dir = 1;
  private speed = 0.45;
  private last = 0;
  private over = false;
  private overAt = 0;
  private perfect = 0;
  private errs: number[] = [];
  private fall: { x: number; w: number; y: number; at: number } | null = null;
  private held = 0;
  private started = false;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
  }

  private drop(ts: number): void {
    this.started = true;
    if (this.over) return;
    const top = this.stack[this.stack.length - 1]!;
    const w = top.w;
    const left = Math.max(this.x, top.x);
    const right = Math.min(this.x + w, top.x + w);
    const err = this.x - top.x;
    this.errs.push(Math.abs(err));
    if (right - left <= 0.004) {
      this.over = true;
      this.overAt = ts + 1400;
      this.fall = { x: this.x, w, y: 0, at: ts };
      this.env.sound(SND_FALL);
      return;
    }
    // Within 1.5% of the base counts as perfect: no cut, and a sliver of width back.
    if (Math.abs(err) < 0.015) {
      this.perfect++;
      const nw = Math.min(0.4, w + 0.008);
      this.stack.push({ x: top.x - (nw - w) / 2, w: nw });
      this.env.sound(SND_TONE + Math.min(6, this.perfect % 7));
    } else {
      this.stack.push({ x: left, w: right - left });
      this.fall = { x: err > 0 ? right : this.x, w: w - (right - left), y: 0, at: ts };
      this.env.sound(SND_TAP_R);
    }
    this.speed = Math.min(1.4, 0.45 + this.stack.length * 0.025);
    this.x = this.dir > 0 ? 0 : 1 - this.stack[this.stack.length - 1]!.w;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    this.drop(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.drop(ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.over && now >= this.overAt) return true;
    const top = this.stack[this.stack.length - 1]!;
    if (!this.over) {
      this.x += this.dir * this.speed * dt;
      if (this.x + top.w > 1) {
        this.x = 1 - top.w;
        this.dir = -1;
      } else if (this.x < 0) {
        this.x = 0;
        this.dir = 1;
      }
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'height', String(this.stack.length - 1), 'perfect', String(this.perfect));
    const W = Math.min(a.right - a.left, 520 * a.u);
    const x0 = a.cx - W / 2;
    const bh = Math.min(22 * a.u, (a.bottom - a.top) / 18);
    // Keep the top of the stack in view.
    const shown = Math.floor((a.bottom - a.top) / bh) - 4;
    const offset = Math.max(0, this.stack.length - shown);
    const yOf = (i: number) => a.bottom - (i - offset + 1) * bh;
    this.stack.forEach((b, i) => {
      if (i < offset) return;
      ctx.fillStyle = i === 0 ? COL_MID : COL_LINE;
      ctx.fillRect(x0 + b.x * W, yOf(i), b.w * W, bh - 2 * v.dpr);
    });
    if (!this.over) {
      ctx.fillStyle = COL_ACCENT;
      ctx.fillRect(x0 + this.x * W, yOf(this.stack.length), top.w * W, bh - 2 * v.dpr);
    }
    if (this.fall) {
      const t = (now - this.fall.at) / 1000;
      ctx.globalAlpha = Math.max(0, 1 - t * 1.5);
      ctx.fillStyle = COL_MID;
      ctx.fillRect(x0 + this.fall.x * W, yOf(this.stack.length - 1) + t * t * 900 * v.dpr, this.fall.w * W, bh - 2 * v.dpr);
      ctx.globalAlpha = 1;
    }
    if (!this.started) message(v, { ...a, cy: a.top + 30 * a.u }, 'press (or tap) to drop the block onto the stack', 'whatever hangs over is cut off', COL_MID);
    if (this.over) message(v, { ...a, cy: a.top + 30 * a.u }, `${this.stack.length - 1} high`, '');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const h = this.stack.length - 1;
    return {
      score: h * 20 + this.perfect * 15,
      primary: { label: 'height', value: h, unit: '' },
      lines: [
        { label: 'blocks stacked', value: String(h) },
        { label: 'perfect drops', value: String(this.perfect) },
        { label: 'average offset (share of the base)', value: this.errs.length ? `${(mean(this.errs) * 100).toFixed(1)}%` : '–' },
      ],
      saved: h >= 3,
    };
  }
}

// --- Lander -----------------------------------------------------------------------

class Lander implements Mini {
  private env!: MiniEnv;
  private y = 1;
  private v = 0;
  private fuel = 1;
  private padX = 0.5;
  private x = 0.5;
  private vx = 0;
  private landed = 0;
  private crashes = 0;
  private soft: number[] = [];
  private state = 0; // 0 flying, 1 touched down (pause)
  private at = 0;
  private lastSpeed = 0;
  private lastOk = false;
  private last = 0;
  private held = 0;
  private started = false;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    this.reset();
  }

  private reset(): void {
    this.y = 1;
    this.v = -0.05 - this.landed * 0.02;
    this.fuel = 1;
    this.x = 0.15 + Math.random() * 0.7;
    this.vx = 0;
    this.padX = 0.15 + Math.random() * 0.7;
    this.state = 0;
  }

  press(slot: number): void {
    this.held |= 1 << slot;
    this.started = true;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.state === 1 && now >= this.at) {
      if (this.crashes >= 3) return true;
      this.reset();
    }
    // Left hand fires the left thruster (pushes right), right hand the right one, together: straight up.
    const l = (this.held & 0b111) !== 0 || (this.held & 0b1000000) !== 0;
    const r = (this.held & 0b111000) !== 0 || (this.held & 0b1000000) !== 0;
    const twoHands = this.env.mode.right > 0;
    const up = twoHands ? (l ? 0.5 : 0) + (r ? 0.5 : 0) : l || r ? 1 : 0;
    if (this.state === 0 && this.started) {
      const thrust = this.fuel > 0 ? up : 0;
      this.v += (-0.32 + thrust * 0.75) * dt;
      if (twoHands && this.fuel > 0) this.vx += ((l ? 1 : 0) - (r ? 1 : 0)) * 0.22 * dt;
      this.fuel = Math.max(0, this.fuel - thrust * dt * 0.09);
      this.y += this.v * dt;
      this.x = clamp(this.x + this.vx * dt, 0.03, 0.97);
      if (this.y <= 0) {
        this.y = 0;
        const speed = Math.hypot(this.v, this.vx * 0.6);
        const onPad = Math.abs(this.x - this.padX) < 0.08 || !twoHands;
        this.lastSpeed = speed;
        this.lastOk = speed < 0.14 && onPad;
        if (this.lastOk) {
          this.landed++;
          this.soft.push(speed);
          this.env.sound(SND_CATCH);
        } else {
          this.crashes++;
          this.env.sound(SND_LURCH);
        }
        this.state = 1;
        this.at = now + 1300;
      }
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'landed', String(this.landed), 'fuel', pct(this.fuel), 3 - this.crashes);
    const W = Math.min(a.right - a.left, 520 * a.u);
    const H = a.bottom - a.top - 40 * a.u;
    const x0 = a.cx - W / 2;
    const ground = a.top + H;
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(x0, ground, W, dpr);
    if (twoHands) {
      ctx.fillStyle = COL_LINE;
      ctx.fillRect(x0 + (this.padX - 0.08) * W, ground - 2 * dpr, 0.16 * W, 4 * dpr);
    }
    const lx = x0 + this.x * W;
    const ly = ground - this.y * H - 12 * a.u;
    // The lander; each engine's flame follows the hand firing it (one hand: both, as one thrust).
    const firing = this.state === 0 && this.fuel > 0 && up > 0;
    const flick = 0.75 + Math.random() * 0.25;
    const fl = firing && (twoHands ? l : true) ? flick : 0;
    const fr = firing && (twoHands ? r : true) ? flick : 0;
    lander(ctx, lx, ly - 6 * a.u, 7.8 * a.u, fl, fr, 0, this.state === 1 && !this.lastOk ? TONE.mid : TONE.light);
    // Descent speed gauge with the safe band.
    const gx = a.right - 24 * a.u;
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(gx, a.top + 20 * a.u, dpr, 120 * a.u);
    ctx.fillStyle = COL_MID;
    ctx.fillRect(gx - 6 * a.u, a.top + 20 * a.u, 12 * a.u, 0.14 * 200 * a.u * 0.6);
    ctx.fillStyle = -this.v < 0.14 ? COL_LINE : COL_ACCENT;
    ctx.fillRect(gx - 8 * a.u, a.top + 20 * a.u + clamp(-this.v, 0, 1) * 200 * a.u * 0.6, 16 * a.u, 2 * dpr);
    if (this.state === 1) message(v, { ...a, cy: a.top + 30 * a.u }, this.lastOk ? 'down softly' : this.lastSpeed >= 0.14 ? 'too fast' : 'missed the pad', `${(this.lastSpeed * 10).toFixed(1)} m/s`);
    else if (!this.started) message(v, { ...a, cy: a.top + 30 * a.u }, twoHands ? 'both hands: thrust up. one hand: thrust and drift sideways' : 'hold to thrust', 'touch down slower than the band on the right', COL_MID);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.landed * 80 + (this.soft.length ? Math.round((0.14 - mean(this.soft)) * 1000) : 0),
      primary: { label: 'landed', value: this.landed, unit: '' },
      lines: [
        { label: 'soft landings', value: String(this.landed) },
        { label: 'average touchdown speed', value: this.soft.length ? `${(mean(this.soft) * 10).toFixed(1)} m/s` : '–' },
        { label: 'crashes', value: String(this.crashes) },
      ],
      saved: this.landed + this.crashes >= 2,
    };
  }
}

// --- Merge ------------------------------------------------------------------------

const MERGE_ROUNDS = 12;
/** Seconds your car needs to clear the lane once it goes. */
const CROSS_S = 1.1;

class Merge implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private cars: { x: number }[] = [];
  private speed = 0.4;
  private t0 = 0;
  private goAt = 0;
  private state = 0; // 0 waiting, 1 crossing, 2 result
  private at = 0;
  private safe = 0;
  private crashes = 0;
  private waits: number[] = [];
  private verdict = '';
  private held = 0;
  private last = 0;
  /** Road width over the layout unit, from the last frame drawn (collisions use the same geometry). */
  private wu = 640;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    this.make(now + 600);
  }

  private make(now: number): void {
    // A stream of cars from the left. Gaps vary; at least one is wide enough.
    this.speed = 0.35 + Math.random() * 0.25 + this.round * 0.01;
    this.cars = [];
    let x = -0.1;
    const n = 6 + Math.floor(Math.random() * 3);
    const wide = 2 + Math.floor(Math.random() * (n - 3));
    for (let i = 0; i < n; i++) {
      this.cars.push({ x });
      const gapS = i === wide ? CROSS_S + 0.35 + Math.random() * 0.4 : 0.45 + Math.random() * 1.1;
      x -= gapS * this.speed;
    }
    this.t0 = now;
    this.goAt = 0;
    this.state = 0;
  }

  private go(ts: number): void {
    if (this.state !== 0 || ts < this.t0) return;
    this.goAt = ts;
    this.state = 1;
    this.env.sound(SND_TAP_R);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    this.go(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.go(ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.state === 2 && now >= this.at) {
      if (this.round >= scaled(MERGE_ROUNDS)) return true;
      this.make(now);
    }
    if (this.state <= 1) {
      for (const c of this.cars) c.x += this.speed * dt;
      // A hit is exactly what you see: your car (20 by 32) overlapping a car in the lane (44 by
      // 20). Your car drives from 70 below the lane's centre to 70 above, so it is only in the
      // lane for the middle part of the crossing.
      if (this.state === 1) {
        const p = (now - this.goAt) / 1000 / CROSS_S;
        const inLane = Math.abs(70 - 140 * p) < 16 + 10;
        const reach = (22 + 10) / this.wu;
        if (p < 1 && inLane && this.cars.some((c) => Math.abs(c.x - 0.5) < reach)) {
          this.crashes++;
          this.verdict = 'too close';
          this.env.sound(SND_LURCH);
          this.finish(now, false);
        } else if (p >= 1) {
          this.safe++;
          this.waits.push(this.goAt - this.t0);
          this.verdict = 'merged';
          this.env.sound(SND_CATCH);
          this.finish(now, true);
        }
      } else if (this.cars.every((c) => c.x > 0.56)) {
        // The whole stream went by: safe, but slow.
        this.go(now);
      }
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'merged', String(this.safe), 'round', `${Math.min(this.round + 1, scaled(MERGE_ROUNDS))} / ${scaled(MERGE_ROUNDS)}`, 3 - this.crashes);
    const W = Math.min(a.right - a.left, 640 * a.u);
    this.wu = W / a.u;
    const x0 = a.cx - W / 2;
    const roadY = a.cy - 10 * a.u;
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(x0, roadY - 24 * a.u, W, dpr);
    ctx.fillRect(x0, roadY + 24 * a.u, W, dpr);
    // Side road coming up to the junction.
    ctx.fillRect(x0 + 0.5 * W - 24 * a.u, roadY + 24 * a.u, dpr, a.bottom - roadY - 24 * a.u);
    ctx.fillRect(x0 + 0.5 * W + 24 * a.u, roadY + 24 * a.u, dpr, a.bottom - roadY - 24 * a.u);
    for (const c of this.cars) {
      if (c.x < -0.05 || c.x > 1.05) continue;
      ctx.fillStyle = COL_LINE;
      ctx.fillRect(x0 + c.x * W - 22 * a.u, roadY - 10 * a.u, 44 * a.u, 20 * a.u);
    }
    // Your car: waiting below the junction, then driving up through it.
    const p = this.state === 0 ? 0 : clamp((now - this.goAt) / 1000 / CROSS_S, 0, 1);
    const yy = roadY + 70 * a.u - p * 140 * a.u;
    ctx.fillStyle = COL_ACCENT;
    ctx.fillRect(x0 + 0.5 * W - 10 * a.u, yy - 16 * a.u, 20 * a.u, 32 * a.u);
    if (this.state === 2) message(v, { ...a, cy: a.top + 30 * a.u }, this.verdict, this.verdict === 'merged' ? `waited ${(this.waits[this.waits.length - 1]! / 1000).toFixed(1)} s` : '', this.verdict === 'merged' ? COL_LINE : COL_ACCENT);
    else if (this.round === 0 && this.state === 0) message(v, { ...a, cy: a.top + 30 * a.u }, 'press to pull across when the gap is big enough', 'the sooner you go safely, the better', COL_MID);
    footer(v, touch, this.held);
    return false;
  }

  private finish(now: number, _ok: boolean): void {
    this.round++;
    this.state = 2;
    this.at = now + 1200;
  }

  result(): MiniResult {
    const w = mean(this.waits);
    return {
      score: this.safe ? Math.max(0, this.safe * 60 - this.crashes * 40 + Math.round(Math.max(0, 6000 - w) / 30)) : 0,
      primary: { label: 'safe merges', value: this.safe, unit: `/ ${scaled(MERGE_ROUNDS)}` },
      lines: [
        { label: 'safe merges', value: `${this.safe} of ${this.round}` },
        { label: 'too close', value: String(this.crashes) },
        { label: 'average wait before going', value: this.waits.length ? `${(w / 1000).toFixed(1)} s` : '–' },
      ],
      saved: this.round >= 4,
    };
  }
}

// --- Pour -------------------------------------------------------------------------

const POUR_GLASSES = 10;

class Pour implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private level = 0;
  private flow = 0;
  private pouring = false;
  private target = 0.7;
  /** Glass shape: width at the bottom and at the top, as a share of the max. */
  private wb = 1;
  private wt = 1;
  private state = 0; // 0 pouring, 1 settling, 2 result
  private at = 0;
  private errs: number[] = [];
  private last = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    this.make();
  }

  private make(): void {
    this.level = 0;
    this.flow = 0;
    this.target = 0.45 + Math.random() * 0.4;
    // Straight, flared or tapered glasses: the same height fills at different rates.
    const k = Math.random();
    [this.wb, this.wt] = k < 0.33 ? [1, 1] : k < 0.66 ? [0.55, 1] : [1, 0.6];
    this.state = 0;
  }

  /** Width of the glass at a height (0..1). */
  private widthAt(h: number): number {
    return this.wb + (this.wt - this.wb) * h;
  }

  press(slot: number): void {
    this.held |= 1 << slot;
    if (this.state === 0) this.pouring = true;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
    if (this.held === 0) this.endPour();
  }

  private endPour(): void {
    if (this.state === 0 && this.pouring) {
      this.pouring = false;
      this.state = 1;
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    // The stream ramps up while held and keeps going for a moment after release.
    const want = this.pouring ? 1 : 0;
    this.flow += (want - this.flow) * Math.min(1, dt * (this.pouring ? 6 : 3.2));
    if (this.state <= 1) this.level = Math.min(1.05, this.level + (this.flow * 0.32 * dt) / Math.max(0.3, this.widthAt(this.level)));
    if (this.state === 1 && this.flow < 0.01) {
      const e = this.level - this.target;
      this.errs.push(Math.abs(e));
      this.env.sound(Math.abs(e) < 0.02 ? SND_CATCH : Math.abs(e) < 0.06 ? SND_TAP_WEAK : SND_FALSE);
      this.state = 2;
      this.at = now + 1300;
    }
    if (this.state === 2 && now >= this.at) {
      this.i++;
      if (this.i >= scaled(POUR_GLASSES)) return true;
      this.make();
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const recent = this.errs.slice(-3);
    header(v, touch, 'off by', recent.length ? pct(mean(recent)) : '–', 'glass', `${Math.min(this.i + 1, scaled(POUR_GLASSES))} / ${scaled(POUR_GLASSES)}`);
    const H = Math.min(a.bottom - a.top - 80 * a.u, 300 * a.u);
    const Wm = Math.min(200 * a.u, (a.right - a.left) * 0.5);
    const base = a.cy + H / 2;
    const top = base - H;
    const at = (h: number) => (this.widthAt(h) * Wm) / 2;
    // Liquid.
    const lv = Math.min(1, this.level);
    ctx.fillStyle = COL_MID;
    ctx.beginPath();
    ctx.moveTo(a.cx - at(0), base);
    ctx.lineTo(a.cx - at(lv), base - lv * H);
    ctx.lineTo(a.cx + at(lv), base - lv * H);
    ctx.lineTo(a.cx + at(0), base);
    ctx.closePath();
    ctx.fill();
    // Glass outline.
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(a.cx - at(1), top);
    ctx.lineTo(a.cx - at(0), base);
    ctx.lineTo(a.cx + at(0), base);
    ctx.lineTo(a.cx + at(1), top);
    ctx.stroke();
    // Target line.
    ctx.fillStyle = COL_ACCENT;
    ctx.fillRect(a.cx - at(this.target) - 14 * a.u, base - this.target * H - dpr, at(this.target) * 2 + 28 * a.u, 2 * dpr);
    // The stream.
    if (this.flow > 0.02) {
      ctx.fillStyle = COL_MID;
      const sw = 6 * a.u * this.flow;
      ctx.fillRect(a.cx - sw / 2, top - 50 * a.u, sw, base - lv * H - top + 50 * a.u);
    }
    if (this.state === 2) {
      const e = this.errs[this.errs.length - 1]!;
      message(v, { ...a, cy: top - 30 * a.u }, Math.abs(e) < 0.02 ? 'right on the line' : `${(Math.abs(e) * 100).toFixed(0)}% ${e > 0 ? 'over' : 'under'}`, '');
    } else if (this.i === 0 && this.state === 0) message(v, { ...a, cy: top - 30 * a.u }, 'hold to pour, let go to stop', 'it keeps flowing for a moment: stop early', COL_MID);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.round(Math.max(0, 0.15 - m) * 4000) : 0,
      primary: { label: 'average miss', value: m * 100, unit: '%', lower: true, decimals: 1 },
      lines: [
        { label: 'average miss (share of the glass)', value: this.errs.length ? `${(m * 100).toFixed(1)}%` : '–' },
        { label: 'within 2%', value: pct(this.errs.filter((e) => e < 0.02).length / (this.errs.length || 1)) },
      ],
      saved: this.errs.length >= 3,
    };
  }
}

// --- Route ------------------------------------------------------------------------

class Route implements Mini {
  private env!: MiniEnv;
  private readonly len = new Stair(3, 1, 2, 24);
  private turns: number[] = [];
  private k = 0;
  private state = 0; // 0 memorise, 1 driving, 2 feedback
  private t0 = 0;
  private at = 0;
  private junctionAt = 0;
  private answered = false;
  private round = 0;
  private best = 0;
  private strikes = 0;
  private ok = true;
  private rts: number[] = [];
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 500);
  }

  private make(now: number): void {
    this.turns = [];
    for (let i = 0; i < this.len.level; i++) this.turns.push(Math.random() < 0.5 ? -1 : 1);
    this.k = 0;
    this.state = 0;
    this.t0 = now;
  }

  private memoMs(): number {
    return 900 + this.turns.length * 550;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (this.state !== 1 || s === 0 || this.answered || ts < this.junctionAt - 900) return;
    this.answered = true;
    this.rts.push(Math.max(0, ts - (this.junctionAt - 900)));
    this.env.sound(s > 0 ? SND_TAP_R : SND_TAP_L);
    if (s !== this.turns[this.k]) this.fail(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  private fail(now: number): void {
    this.ok = false;
    this.strikes++;
    this.len.update(false);
    this.env.sound(SND_FALSE);
    this.state = 2;
    this.at = now + 1500;
    this.round++;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now - this.t0 > this.memoMs()) {
      this.state = 1;
      this.junctionAt = now + 1600;
      this.answered = false;
    }
    if (this.state === 1 && now >= this.junctionAt) {
      if (!this.answered) this.fail(now);
      else {
        this.k++;
        if (this.k >= this.turns.length) {
          this.ok = true;
          this.best = Math.max(this.best, this.turns.length);
          this.len.update(true);
          this.env.sound(SND_CATCH);
          this.state = 2;
          this.at = now + 1100;
          this.round++;
        } else {
          this.junctionAt = now + 1300;
          this.answered = false;
        }
      }
    }
    if (this.state === 2 && now >= this.at) {
      if (this.strikes >= 3) return true;
      this.make(now + 300);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'turns', String(this.len.level), 'best', String(this.best), 3 - this.strikes);
    if (this.state === 0) {
      // The route as arrows, to memorise.
      const n = this.turns.length;
      const w = Math.min(56 * a.u, (a.right - a.left) / (n + 1));
      const x0 = a.cx - (n * w) / 2;
      this.turns.forEach((t, i) => {
        const x = x0 + i * w + w / 2;
        ctx.fillStyle = COL_LINE;
        ctx.beginPath();
        ctx.moveTo(x + t * 14 * a.u, a.cy);
        ctx.lineTo(x - t * 6 * a.u, a.cy - 12 * a.u);
        ctx.lineTo(x - t * 6 * a.u, a.cy + 12 * a.u);
        ctx.closePath();
        ctx.fill();
      });
      progressBar(v, a.cx, a.cy + 50 * a.u, 120 * a.u, 1 - (now - this.t0) / this.memoMs());
      ctx.fillStyle = COL_MID;
      v.text('remember the turns', a.cx, a.cy - 60 * a.u, v.fontTiny, 'center');
    } else {
      // Driving up the road: the next junction approaches.
      const H = a.bottom - a.top;
      const carY = a.top + H * 0.82;
      const p = this.state === 1 ? clamp(1 - (this.junctionAt - now) / 1600, 0, 1) : 1;
      const jy = a.top + H * 0.1 + p * (carY - a.top - H * 0.1);
      ctx.fillStyle = COL_DIM;
      ctx.fillRect(a.cx - 30 * a.u, a.top, dpr, H);
      ctx.fillRect(a.cx + 30 * a.u, a.top, dpr, H);
      ctx.fillStyle = COL_MID;
      ctx.fillRect(a.cx - 160 * a.u, jy - 30 * a.u, 130 * a.u, dpr);
      ctx.fillRect(a.cx + 30 * a.u, jy - 30 * a.u, 130 * a.u, dpr);
      ctx.fillRect(a.cx - 160 * a.u, jy + 30 * a.u, 130 * a.u, dpr);
      ctx.fillRect(a.cx + 30 * a.u, jy + 30 * a.u, 130 * a.u, dpr);
      ctx.fillStyle = this.state === 2 && !this.ok ? COL_MID : COL_ACCENT;
      ctx.beginPath();
      ctx.moveTo(a.cx, carY - 14 * a.u);
      ctx.lineTo(a.cx - 9 * a.u, carY + 9 * a.u);
      ctx.lineTo(a.cx + 9 * a.u, carY + 9 * a.u);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = COL_MID;
      v.text(this.state === 2 ? (this.ok ? 'arrived' : `turn ${this.k + 1} was ${this.turns[this.k]! < 0 ? 'left' : 'right'}`) : `junction ${this.k + 1} of ${this.turns.length}${this.answered ? '' : `  ·  ${handLabel(this.env, -1)} left, ${handLabel(this.env, 1)} right`}`, a.cx, a.top + 24 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.best * 100,
      primary: { label: 'longest route', value: this.best, unit: 'turns' },
      lines: [
        { label: 'longest route driven', value: `${this.best} turns` },
        { label: 'routes', value: String(this.round) },
        { label: 'median decision time', value: ms(this.rts.length ? [...this.rts].sort((x, y) => x - y)[this.rts.length >> 1]! : 0) },
      ],
      rts: this.rts, saved: this.round >= 2,
    };
  }
}

function progressBar(v: View, cx: number, y: number, half: number, p: number): void {
  const ctx = v.ctx;
  ctx.fillStyle = COL_DIM;
  ctx.fillRect(cx - half, y, half * 2, v.dpr);
  ctx.fillStyle = COL_MID;
  ctx.fillRect(cx - half, y, half * 2 * clamp(p, 0, 1), v.dpr);
}


export const BATCH17: MiniDef[] = [
  {
    id: 'tower',
    name: 'Tower',
    skill: 'timing',
    blurb: 'A block slides over the stack. Drop it squarely; overhang is cut off.',
    how: 'The top block slides back and forth. Press (or tap) to drop it onto the stack. Whatever hangs over the edge is cut off, so the stack narrows. A near-perfect drop wins back a sliver. It speeds up as it grows.',
    input: 'both',
    make: () => new Tower(),
  },
  {
    id: 'lander',
    name: 'Lander',
    skill: 'coordination',
    blurb: 'Feather the thrust and touch down softly on the pad.',
    how: 'The lander falls. Both hands together thrust straight up; one hand alone also pushes it sideways (left hand to the right, right hand to the left). Touch down on the pad slower than the band on the gauge. Fuel is limited. Three crashes.',
    input: 'keys',
    make: () => new Lander(),
  },
  {
    id: 'merge',
    name: 'Merge',
    skill: 'judgement',
    blurb: 'Cars stream past the junction. Pull out into the first safe gap.',
    how: 'You are waiting at a junction while a stream of cars goes by. Press (or tap) to pull across. Your car is hit only if it touches a passing car, exactly as drawn. Go too soon and you are hit; wait for the whole stream and it counts, but slowly. Twelve junctions.',
    input: 'both',
    make: () => new Merge(),
  },
  {
    id: 'pour',
    name: 'Pour',
    skill: 'judgement',
    blurb: 'Fill the glass to the line. It keeps flowing after you let go.',
    how: 'Hold to pour, release to stop. The stream takes a moment to stop, so let go early. Glasses are straight, flared or tapered, so the same height fills at different speeds. Ten glasses.',
    input: 'keys',
    make: () => new Pour(),
  },
  {
    id: 'route',
    name: 'Route',
    skill: 'memory',
    blurb: 'Learn a string of turns, then drive it from memory.',
    how: 'A route shows as arrows: left, right, right... Then you drive. At each junction, press that hand to turn before you reach it. Get the whole route and the next one is longer. Three wrong turns end it.',
    input: 'keys',
    minKeys: 2,
    make: () => new Route(),
  },
];
