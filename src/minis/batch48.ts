// Forty-eighth batch.
//   Cannon - set the barrel's angle to land a shot on the target. Wind joins later.
//   Pins   - a lock's pins bob up and down; press as each reaches the line to set it.
//   Darts  - the aim drifts like a real hand; throw when it is over the bull.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALL, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, mean, median, scaled, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

// --- Cannon ----------------------------------------------------------------------------

const CANNON_SHOTS = 15;
const G = 9.8;
const V0 = 14;

class Cannon implements Mini {
  private env!: MiniEnv;
  private shot = 0;
  private angle = 45;
  private target = 12;
  private wind = 0;
  private held = 0;
  private holdAt = 0;
  private lastStep = 0;
  private state = 0; // 0 aiming, 1 flying, 2 feedback
  private fly0 = 0;
  private land = 0;
  private hits = 0;
  private misses: number[] = [];
  private at = 0;
  private trail: [number, number][] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now);
  }

  private arm(now: number): void {
    this.target = rnd(7, 19);
    this.wind = this.shot >= 6 ? rnd(-2.5, 2.5) : 0;
    this.state = 0;
    this.at = now;
    this.trail = [];
  }

  /** Where a shot at this angle lands (metres), with a steady wind pushing it along. */
  private flight(angleDeg: number, t: number): [number, number] {
    const a = (angleDeg * Math.PI) / 180;
    const x = V0 * Math.cos(a) * t + 0.5 * this.wind * t * t;
    const y = V0 * Math.sin(a) * t - 0.5 * G * t * t;
    return [x, y];
  }

  private landing(angleDeg: number): number {
    const a = (angleDeg * Math.PI) / 180;
    const tf = (2 * V0 * Math.sin(a)) / G;
    return this.flight(angleDeg, tf)[0];
  }

  press(slot: number, ts: number): void {
    const was = this.held;
    this.held |= 1 << slot;
    if (this.state !== 0) return;
    const L = (this.held & 0b111) !== 0;
    const R = (this.held & 0b111000) !== 0;
    if (L && R && !((was & 0b111) !== 0 && (was & 0b111000) !== 0)) {
      // Both together: fire.
      this.state = 1;
      this.fly0 = ts;
      this.land = this.landing(this.angle);
      this.env.sound(SND_TAP_R);
      return;
    }
    if (!was) {
      this.angle = Math.max(5, Math.min(85, this.angle + (sideOf(slot) < 0 ? 1 : -1)));
      this.holdAt = ts;
      this.lastStep = ts;
    }
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && this.held) {
      const L = (this.held & 0b111) !== 0;
      const R = (this.held & 0b111000) !== 0;
      if (L !== R && now - this.holdAt > 350 && now - this.lastStep > 60) {
        this.angle = Math.max(5, Math.min(85, this.angle + (L ? 0.5 : -0.5)));
        this.lastStep = now;
      }
    }
    const a = (this.angle * Math.PI) / 180;
    const tf = (2 * V0 * Math.sin(a)) / G;
    if (this.state === 1) {
      const t = ((now - this.fly0) / 1000) * 1.6;
      if (t >= tf) {
        const off = Math.abs(this.land - this.target);
        const hit = off < 0.8;
        if (hit) this.hits++;
        this.misses.push(off);
        this.env.sound(hit ? SND_CATCH : SND_FALL);
        this.shot++;
        this.state = 2;
        this.at = now + 1400;
      } else this.trail.push(this.flight(this.angle, t));
    } else if (this.state === 2 && now >= this.at) {
      if (this.shot >= scaled(CANNON_SHOTS)) return true;
      this.arm(now);
    }
    v.clear();
    const ar = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'hits', `${this.hits} of ${this.shot}`, 'angle', `${this.angle.toFixed(1)}°`);
    const span = 24;
    const s = (ar.right - ar.left - 40 * ar.u) / span;
    const gx = ar.left + 30 * ar.u;
    const gy = ar.bottom - 30 * ar.u;
    const X = (m: number) => gx + m * s;
    const Y = (m: number) => gy - m * s;
    ctx.fillStyle = COL_MID;
    ctx.fillRect(ar.left, gy, ar.right - ar.left, 2 * dpr);
    // Distance marks every 2 m.
    for (let m = 2; m <= span; m += 2) {
      ctx.fillStyle = COL_FAINT;
      ctx.fillRect(X(m) - dpr / 2, gy, dpr, 6 * dpr);
    }
    // The target.
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(X(this.target - 0.8), gy - 5 * dpr, 1.6 * s, 5 * dpr);
    ctx.fillStyle = COL_ACCENT;
    ctx.fillRect(X(this.target) - 2 * dpr, gy - 24 * ar.u, 4 * dpr, 24 * ar.u);
    // The cannon.
    ctx.save();
    ctx.translate(X(0), Y(0));
    ctx.rotate(-a);
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(0, -5 * ar.u, 34 * ar.u, 10 * ar.u);
    ctx.restore();
    ctx.fillStyle = '#3a3a41';
    ctx.beginPath();
    ctx.arc(X(0), Y(0), 12 * ar.u, Math.PI, TAU);
    ctx.fill();
    // Wind.
    if (this.wind) {
      ctx.fillStyle = COL_MID;
      v.text(`wind ${this.wind > 0 ? '→' : '←'} ${Math.abs(this.wind).toFixed(1)}`, ar.cx, ar.top + 10 * ar.u, v.fontTiny, 'center');
    }
    // The shot.
    if (this.trail.length) {
      ctx.fillStyle = COL_DIM;
      for (const [x, y] of this.trail) ctx.fillRect(X(x) - dpr, Y(y) - dpr, 2 * dpr, 2 * dpr);
      const [lx, ly] = this.trail[this.trail.length - 1]!;
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.arc(X(lx), Y(Math.max(0, ly)), 5 * ar.u, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = COL_MID;
    v.text(this.state === 2 ? (Math.abs(this.land - this.target) < 0.8 ? 'hit' : `${Math.abs(this.land - this.target).toFixed(1)} m ${this.land > this.target ? 'long' : 'short'}`) : 'left key raises the barrel, right lowers it (hold to run). both keys fire', ar.cx, ar.bottom - 4 * ar.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.misses);
    return {
      score: this.hits * 80 + Math.round(Math.max(0, 5 - m) * 40),
      primary: { label: 'hits', value: this.hits, unit: `of ${this.shot}` },
      lines: [
        { label: 'hits', value: `${this.hits} of ${this.shot}` },
        { label: 'typical miss', value: this.misses.length ? `${median(this.misses).toFixed(1)} m` : '–' },
      ],
      saved: this.shot >= 3,
    };
  }
}

// --- Pins (lock picking by timing) ------------------------------------------------------

const PINS_MS = 120000;

class Pins implements Mini {
  private env!: MiniEnv;
  private n = 4;
  private set = 0;
  private phase: number[] = [];
  private speed: number[] = [];
  private t0 = 0;
  private started = false;
  private locks = 0;
  private slips = 0;
  private held = 0;
  private flash = 0;
  private flashOk = true;
  private lockAt = 0;
  private times: number[] = [];
  private firstFrame = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.newLock(now);
  }

  private newLock(now: number): void {
    this.n = Math.min(7, 4 + Math.floor(this.locks / 2));
    this.set = 0;
    this.phase = Array.from({ length: this.n }, () => rnd(0, TAU));
    this.speed = Array.from({ length: this.n }, () => rnd(2.4, 4.2) * (1 + this.locks * 0.08));
    this.lockAt = now;
  }

  /** A pin's height: 0 at the bottom, 1 at the top; the shear line is at 0.5. */
  private height(k: number, now: number): number {
    return 0.5 + 0.5 * Math.sin(this.phase[k]! + this.speed[k]! * (now / 1000));
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (sideOf(slot) === 0 && !this.started) return;
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.lockAt = ts;
      return;
    }
    const h = this.height(this.set, ts);
    // Close to the line, and the pin sets; otherwise the last pin set drops.
    if (Math.abs(h - 0.5) < 0.08) {
      this.set++;
      this.flash = ts + 120;
      this.flashOk = true;
      this.env.sound(SND_TAP_L);
      if (this.set >= this.n) {
        this.locks++;
        this.times.push((ts - this.lockAt) / 1000);
        this.env.sound(SND_CATCH);
        this.newLock(ts);
      }
    } else {
      this.slips++;
      if (this.set > 0) this.set--;
      this.flash = ts + 200;
      this.flashOk = false;
      this.env.sound(SND_FALSE);
    }
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
    const len = scaled(PINS_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'locks opened', String(this.locks), 'time', `${left} s`);
    const pw = Math.min(46 * a.u, (a.right - a.left) / (this.n + 1));
    const top = a.top + 30 * a.u;
    const H = a.bottom - top - 50 * a.u;
    const line = top + H / 2;
    const x0 = a.cx - (this.n * pw) / 2;
    // The lock body and the shear line.
    ctx.fillStyle = '#16161a';
    ctx.fillRect(x0 - 10 * a.u, top, this.n * pw + 20 * a.u, H);
    ctx.fillStyle = COL_ACCENT;
    ctx.fillRect(x0 - 16 * a.u, line - dpr, this.n * pw + 32 * a.u, 2 * dpr);
    for (let k = 0; k < this.n; k++) {
      const x = x0 + k * pw + pw * 0.2;
      const w = pw * 0.6;
      const h = k < this.set ? 0.5 : this.height(k, now);
      const y = top + H * (1 - h) - H * 0.18;
      ctx.fillStyle = k < this.set ? COL_DIM : k === this.set ? (now < this.flash ? (this.flashOk ? COL_LINE : COL_ACCENT) : COL_LINE) : '#3a3a41';
      ctx.fillRect(x, y, w, H * 0.36);
    }
    ctx.fillStyle = COL_MID;
    v.text(this.started ? 'press any key (or tap) as the bright pin crosses the orange line' : 'set each pin at the line in turn: press as the bright one crosses it. press to start', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.locks * 100 - this.slips * 5),
      primary: { label: 'locks opened', value: this.locks, unit: '' },
      lines: [
        { label: 'locks opened', value: String(this.locks) },
        { label: 'slips', value: String(this.slips) },
        { label: 'typical time a lock', value: this.times.length ? `${median(this.times).toFixed(1)} s` : '–' },
      ],
      saved: this.started && this.locks + this.slips >= 2,
    };
  }
}

// --- Darts (aim through sway) ----------------------------------------------------------

const DARTS = 12;

class Darts implements Mini {
  private env!: MiniEnv;
  private thrown = 0;
  private total = 0;
  private scores: number[] = [];
  private ph: number[] = [];
  private px = 0;
  private py = 0;
  private state = 0;
  private at = 0;
  private landed: [number, number] | null = null;
  private held = 0;
  private sway = 1;
  private bx = 0;
  private by = 0;
  private R = 1;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.ph = Array.from({ length: 6 }, () => rnd(0, TAU));
    this.at = now;
  }

  /** The aim drifts on its own, like a hand that cannot keep perfectly still. The pointer steers it. */
  private aim(now: number): [number, number] {
    const t = now / 1000;
    const s = this.sway * this.R * 0.35;
    const dx = Math.sin(t * 1.3 + this.ph[0]!) * 0.6 + Math.sin(t * 2.9 + this.ph[1]!) * 0.3 + Math.sin(t * 5.1 + this.ph[2]!) * 0.1;
    const dy = Math.sin(t * 1.1 + this.ph[3]!) * 0.6 + Math.sin(t * 3.3 + this.ph[4]!) * 0.3 + Math.sin(t * 4.7 + this.ph[5]!) * 0.1;
    return [this.px + dx * s, this.py + dy * s];
  }

  /** Points by ring: bull 50, then 25, 15, 10, 5 and 1 at the edge; nothing off the board. */
  private points(x: number, y: number): number {
    const d = Math.hypot(x - this.bx, y - this.by) / this.R;
    return d < 0.07 ? 50 : d < 0.18 ? 25 : d < 0.4 ? 15 : d < 0.62 ? 10 : d < 0.82 ? 5 : d <= 1 ? 1 : 0;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (sideOf(slot) === 0) return;
    this.throwDart(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointerMove(x: number, y: number): void {
    this.px = x;
    this.py = y;
  }

  pointer(x: number, y: number, ts: number): void {
    this.px = x;
    this.py = y;
    this.throwDart(ts);
  }

  private throwDart(ts: number): void {
    if (this.state !== 0) return;
    const [x, y] = this.aim(ts);
    this.landed = [x, y];
    const p = this.points(x, y);
    this.scores.push(p);
    this.total += p;
    this.thrown++;
    // The hand gets a little shakier with every dart.
    this.sway = 1 + this.thrown * 0.08;
    this.env.sound(p >= 25 ? SND_CATCH : p > 0 ? SND_TAP_WEAK : SND_FALSE);
    this.state = 1;
    this.at = ts + 900;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.thrown >= scaled(DARTS)) return true;
      this.state = 0;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    this.R = Math.min(a.bottom - a.top, a.right - a.left) * 0.42;
    this.bx = a.cx;
    this.by = a.cy;
    if (!this.px) {
      this.px = a.cx;
      this.py = a.cy;
    }
    header(v, touch, 'score', String(this.total), 'dart', `${Math.min(this.thrown + 1, scaled(DARTS))} / ${scaled(DARTS)}`);
    const rings: [number, string][] = [[1, '#1f1f24'], [0.82, '#2c2c33'], [0.62, '#1f1f24'], [0.4, '#2c2c33'], [0.18, '#45454d'], [0.07, COL_ACCENT]];
    for (const [r, c] of rings) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(this.bx, this.by, r * this.R, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.arc(this.bx, this.by, this.R, 0, TAU);
    ctx.stroke();
    if (this.landed) {
      ctx.fillStyle = COL_LINE;
      ctx.beginPath();
      ctx.arc(this.landed[0], this.landed[1], 4 * dpr, 0, TAU);
      ctx.fill();
    }
    if (this.state === 0) {
      const [x, y] = this.aim(now);
      ctx.strokeStyle = COL_LINE;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo(x - 10 * dpr, y);
      ctx.lineTo(x + 10 * dpr, y);
      ctx.moveTo(x, y - 10 * dpr);
      ctx.lineTo(x, y + 10 * dpr);
      ctx.stroke();
    }
    ctx.fillStyle = COL_MID;
    v.text(this.state === 1 && this.scores.length ? `${this.scores[this.scores.length - 1]} points` : 'steer the drifting aim with the mouse; click (or press a key) to throw when it is on the bull', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.total * 2,
      primary: { label: 'points', value: this.total, unit: '' },
      lines: [
        { label: 'points', value: `${this.total} from ${this.thrown} darts` },
        { label: 'bulls', value: String(this.scores.filter((s) => s === 50).length) },
        { label: 'average a dart', value: this.scores.length ? (this.total / this.scores.length).toFixed(1) : '–' },
        { label: 'off the board', value: String(this.scores.filter((s) => s === 0).length) },
      ],
      saved: this.thrown >= 3,
    };
  }
}

export const BATCH48: MiniDef[] = [
  { id: 'cannon', name: 'Cannon', skill: 'judgement', blurb: 'Set the barrel’s angle to land a shot on the target. Wind joins later.', how: 'A cannon fires at a fixed speed. The left key raises the barrel, the right lowers it (hold to run); press both to fire. Land the shot on the target, which moves every time. Two angles reach any spot, high and low. From the seventh shot a wind pushes the shot along. Fifteen shots.', input: 'keys', minKeys: 2, make: () => new Cannon() },
  { id: 'pins', name: 'Pins', skill: 'timing', blurb: 'A lock’s pins bob up and down. Press as each crosses the line to set it.', how: 'A lock with a row of pins, each bobbing up and down at its own speed. Press any key (or tap) as the bright pin crosses the orange line: it sets and the next one lights. Press off the line and the last set pin drops back. Each lock has more pins, moving faster. Two minutes.', input: 'both', make: () => new Pins() },
  { id: 'darts', name: 'Darts', skill: 'aim', blurb: 'The aim drifts like a real hand. Throw when it is over the bull.', how: 'A dartboard, and an aim that drifts on its own like a hand that cannot keep still; the mouse steers it. Click (or press a key) to throw when it passes over the middle. The bull is worth 50, then the rings 25, 15, 10, 5 and 1. The hand gets shakier with every dart. Twelve darts.', input: 'pointer', make: () => new Darts() },
];

