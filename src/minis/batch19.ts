// Nineteenth batch: training more kinds of thing.
//   Pitch   (judgement)    - two tones. Was the second higher or lower? By ear alone.
//   Compass (reasoning)    - follow a string of turns in your head. Which way are you facing?
//   Bank    (judgement)    - a ball heads for the wall and vanishes. Where will it land after the bounce?
//   Mirror  (coordination) - steer along a track. Every so often the controls swap sides.
//   Letters (reasoning)    - unscramble the word. Type it.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK, SND_TONE } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { ENGLISH_5K } from './words.ts';
import { Stair, arena, clamp, footer, handLabel, header, mean, median, message, pct, shuffle, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult, scaled } from './kit.ts';

const TAU = Math.PI * 2;

// --- Pitch ------------------------------------------------------------------------

/** Pitch differences in cents (100 cents = one semitone), easy to hard. */
const CENTS = [200, 150, 100, 70, 50, 35, 25, 18, 12, 8, 5];
const PITCH_TRIALS = 30;

class Pitch implements Mini {
  private env!: MiniEnv;
  private readonly st = new Stair(0, 1, 0, CENTS.length - 1);
  private i = 0;
  private state = 0; // 0 listening, 1 answer, 2 feedback
  private t0 = 0;
  private at = 0;
  private base = 440;
  private up = 1;
  private played = 0;
  private lastOk = false;
  private correct = 0;
  private hist: number[] = [];
  private held = 0;
  private cx = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 700);
  }

  private arm(now: number): void {
    // The first tone is always a real note (A4 = 440 Hz, equal temperament), from about C#4 to
    // A5; only the second is moved, by the step being tested.
    const midi = 61 + Math.floor(Math.random() * 21);
    this.base = 440 * Math.pow(2, (midi - 69) / 12);
    this.up = Math.random() < 0.5 ? -1 : 1;
    this.t0 = now;
    this.played = 0;
    this.state = 0;
  }

  private answer(side: number, ts: number): void {
    if (this.state === 2 || side === 0 || this.played < 2) return;
    this.lastOk = side === this.up;
    if (this.lastOk) this.correct++;
    this.hist.push(CENTS[this.st.level]!);
    this.st.update(this.lastOk);
    this.env.sound(this.lastOk ? SND_CATCH : SND_FALSE);
    this.i++;
    this.state = 2;
    this.at = ts + 800;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    this.answer(sideOf(slot), ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(x: number, _y: number, ts: number): void {
    this.answer(x < this.cx ? -1 : 1, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const cents = CENTS[this.st.level]!;
    if (this.state === 0) {
      if (this.played === 0 && now >= this.t0) {
        this.played = 1;
        this.env.tone?.(this.base, 320);
      } else if (this.played === 1 && now >= this.t0 + 650) {
        this.played = 2;
        this.env.tone?.(this.base * Math.pow(2, (this.up * cents) / 1200), 320);
        this.state = 1;
      }
    }
    if (this.state === 1 && now - this.t0 > 7000) this.answer(-this.up, now);
    if (this.state === 2 && now >= this.at) {
      if (this.i >= scaled(PITCH_TRIALS)) return true;
      this.arm(now + 300);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    this.cx = a.cx;
    header(v, touch, 'difference', `${cents} cents`, 'trial', `${Math.min(this.i + 1, scaled(PITCH_TRIALS))} / ${scaled(PITCH_TRIALS)}`);
    // Two marks light as the two tones play.
    for (let k = 0; k < 2; k++) {
      const on = this.played > k && now - this.t0 - k * 650 < 320;
      ctx.fillStyle = on ? COL_LINE : COL_DIM;
      ctx.beginPath();
      ctx.arc(a.cx + (k ? 40 : -40) * a.u, a.cy - 40 * a.u, 12 * a.u, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = COL_MID;
    v.text(`lower  ${handLabel(this.env, -1)}`, a.cx - 100 * a.u, a.cy + 40 * a.u, v.fontTiny, 'center');
    v.text(`higher  ${handLabel(this.env, 1)}`, a.cx + 100 * a.u, a.cy + 40 * a.u, v.fontTiny, 'center');
    if (this.state === 2) {
      ctx.fillStyle = this.lastOk ? COL_LINE : COL_ACCENT;
      v.text(this.up > 0 ? 'it went up' : 'it went down', a.cx, a.cy + 90 * a.u, v.fontTiny, 'center');
    } else if (this.env.muted) {
      ctx.fillStyle = COL_ACCENT;
      v.text('sound is off: press 0 or turn it on in Settings, then play this again', a.cx, a.cy + 90 * a.u, v.fontTiny, 'center');
    } else if (this.i === 0) {
      ctx.fillStyle = COL_MID;
      v.text('two tones play. was the second one higher or lower?', a.cx, a.cy + 90 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const tail = this.hist.slice(-12);
    const thr = tail.length ? mean(tail) : 0;
    return {
      score: this.correct ? Math.round(this.correct * 10 + Math.max(0, 200 - thr) * 2) : 0,
      primary: { label: 'smallest step you can hear', value: thr, unit: 'cents', lower: true },
      lines: [
        { label: 'smallest pitch step you can hear (last 12)', value: thr ? `${Math.round(thr)} cents (${(thr / 100).toFixed(2)} semitones)` : '–' },
        { label: 'correct', value: `${this.correct} of ${this.i}` },
      ],
      saved: this.i >= 10 && !this.env.muted,
    };
  }
}

// --- Compass ----------------------------------------------------------------------

const COMPASS_MS = 75000;
const DIRS = ['N', 'E', 'S', 'W'];
const TURN_NAMES = ['right', 'around', 'left'];

class Compass implements Mini {
  private env!: MiniEnv;
  private t0 = 0;
  private start0 = 0;
  /** Turns as quarter-turns clockwise: 1 right, 2 around, 3 left. */
  private turns: number[] = [];
  private len = 2;
  private run = 0;
  private right = 0;
  private wrong = 0;
  private flash = 0;
  private flashOk = true;
  private lastAnswer = 0;
  private rects: [number, number, number, number][] = [];
  private done = false;
  private times: number[] = [];
  private shownAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.t0 = now + 500;
    this.make(now + 500);
  }

  private make(now: number): void {
    this.start0 = Math.floor(Math.random() * 4);
    this.turns = [];
    for (let k = 0; k < this.len; k++) this.turns.push([1, 2, 3][Math.floor(Math.random() * 3)]!);
    this.shownAt = now;
  }

  private facing(): number {
    return (this.start0 + this.turns.reduce((s, t) => s + t, 0)) % 4;
  }

  private choose(d: number, ts: number): void {
    if (this.done || ts < this.t0 || d < 0 || d > 3) return;
    const ok = d === this.facing();
    this.flash = ts;
    this.flashOk = ok;
    this.lastAnswer = this.facing();
    if (ok) {
      this.right++;
      this.times.push(ts - this.shownAt);
      if (++this.run >= 2) {
        this.run = 0;
        this.len = Math.min(8, this.len + 1);
      }
    } else {
      this.wrong++;
      this.run = 0;
      this.len = Math.max(2, this.len - 1);
    }
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.make(ts);
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const map: Record<string, number> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, KeyW: 0, KeyD: 1, KeyS: 2, KeyA: 3 };
    if (!(code in map)) return false;
    this.choose(map[code]!, ts);
    return true;
  }

  pointer(x: number, y: number, ts: number): void {
    this.rects.forEach((r, k) => {
      if (x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]) this.choose(k, ts);
    });
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const t = now - this.t0;
    if (t > scaled(COMPASS_MS)) {
      this.done = true;
      if (t > scaled(COMPASS_MS) + 700) return true;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'right', String(this.right), 'turns', String(this.len));
    if (!this.done) {
      // Where you start facing.
      const ax = a.cx - 150 * a.u;
      const ay = a.cy - 50 * a.u;
      const ang = (this.start0 / 4) * TAU - Math.PI / 2;
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.arc(ax, ay, 40 * a.u, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = COL_MID;
      v.text('N', ax, ay - 48 * a.u, v.fontTiny, 'center');
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.moveTo(ax + Math.cos(ang) * 30 * a.u, ay + Math.sin(ang) * 30 * a.u);
      ctx.lineTo(ax + Math.cos(ang + 2.5) * 16 * a.u, ay + Math.sin(ang + 2.5) * 16 * a.u);
      ctx.lineTo(ax + Math.cos(ang - 2.5) * 16 * a.u, ay + Math.sin(ang - 2.5) * 16 * a.u);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = COL_MID;
      v.text('you face', ax, ay + 62 * a.u, v.fontTiny, 'center');
      // The turns, in order.
      ctx.fillStyle = COL_LINE;
      v.text(this.turns.map((k) => TURN_NAMES[k - 1]).join('  →  '), a.cx + 60 * a.u, ay + 5 * dpr, v.fontHud, 'center');
      // Answer buttons as a compass rose.
      const rx = a.cx;
      const ry = a.cy + 110 * a.u;
      const s = 44 * a.u;
      const pos: [number, number][] = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ];
      this.rects = pos.map(([dx, dy]) => [rx + dx * s * 1.2 - s / 2, ry + dy * s * 1.2 - s / 2, s, s]);
      DIRS.forEach((d, k) => {
        const [x, y, w, h] = this.rects[k]!;
        const lit = now - this.flash < 500 && k === this.lastAnswer;
        ctx.strokeStyle = lit ? (this.flashOk ? COL_LINE : COL_ACCENT) : COL_MID;
        ctx.lineWidth = (lit ? 2 : 1) * dpr;
        ctx.strokeRect(x + 0.5, y + 0.5, w, h);
        ctx.fillStyle = COL_LINE;
        v.text(d, x + w / 2, y + h / 2 + 5 * dpr, v.fontHud, 'center');
      });
      if (this.right + this.wrong === 0) {
        ctx.fillStyle = COL_MID;
        v.text('make the turns in your head. which way do you face at the end? tap it or use the arrow keys', a.cx, a.bottom - 10 * a.u, v.fontTiny, 'center');
      }
    } else message(v, a, `${this.right} right`, `${this.wrong} wrong`);
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(a.cx - 120 * a.u, a.top + 4 * a.u, 240 * a.u, dpr);
    ctx.fillStyle = COL_MID;
    ctx.fillRect(a.cx - 120 * a.u, a.top + 4 * a.u, 240 * a.u * clamp(t / scaled(COMPASS_MS), 0, 1), dpr);
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const net = this.right - this.wrong;
    return {
      score: Math.max(0, net * 15 + this.len * 10),
      primary: { label: 'right minus wrong', value: net, unit: '' },
      lines: [
        { label: 'right', value: String(this.right) },
        { label: 'wrong', value: String(this.wrong) },
        { label: 'most turns', value: String(this.len) },
        { label: 'median time when right', value: this.times.length ? `${(median(this.times) / 1000).toFixed(1)} s` : '–' },
      ],
      rts: this.times, saved: this.right + this.wrong >= 5,
    };
  }
}

// --- Bank -------------------------------------------------------------------------

const BANK_TRIALS = 15;

class Bank implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private state = 0; // 0 flying (visible), 1 hidden (answer), 2 reveal
  private t0 = 0;
  private at = 0;
  private y0 = 0.5;
  private vy = 0.5;
  private hideAt = 0.4;
  private hitY = 0;
  private tapY = -1;
  private errs: number[] = [];
  private geo = { x0: 0, y0: 0, w: 1, h: 1 };

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 500);
  }

  /** Where the ball is at progress p (0 at the left wall, 1 at the right), with bounces. */
  private yAt(p: number): number {
    let y = this.y0 + this.vy * p;
    // Reflect off the top (0) and bottom (1).
    for (let k = 0; k < 4; k++) {
      if (y < 0) y = -y;
      else if (y > 1) y = 2 - y;
    }
    return y;
  }

  private make(now: number): void {
    // Always one bounce before the far wall.
    for (;;) {
      this.y0 = 0.15 + Math.random() * 0.7;
      this.vy = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.9);
      const end = this.y0 + this.vy;
      if (end < -0.05 || end > 1.05) break;
    }
    this.hitY = this.yAt(1);
    this.hideAt = 0.3 - Math.min(0.15, this.i * 0.01);
    this.t0 = now;
    this.tapY = -1;
    this.state = 0;
  }

  press(): void {}

  pointer(_x: number, y: number, ts: number): void {
    if (this.state === 2) return;
    const g = this.geo;
    const yy = (y - g.y0) / g.h;
    if (yy < -0.05 || yy > 1.05 || ts < this.t0) return;
    this.tapY = clamp(yy, 0, 1);
    const e = Math.abs(this.tapY - this.hitY);
    this.errs.push(e);
    this.env.sound(e < 0.04 ? SND_CATCH : e < 0.12 ? SND_TAP_WEAK : SND_FALSE);
    this.i++;
    this.state = 2;
    this.at = ts + 1600;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const p = (now - this.t0) / 1600;
    if (this.state === 0 && p > this.hideAt) this.state = 1;
    if (this.state === 1 && now - this.t0 > 12000) {
      this.errs.push(0.5);
      this.i++;
      this.state = 2;
      this.at = now + 1200;
    }
    if (this.state === 2 && now >= this.at) {
      if (this.i >= scaled(BANK_TRIALS)) return true;
      this.make(now + 300);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const recent = this.errs.slice(-5);
    header(v, touch, 'off by', recent.length ? pct(mean(recent)) : '–', 'shot', `${Math.min(this.i + 1, scaled(BANK_TRIALS))} / ${scaled(BANK_TRIALS)}`);
    const w = Math.min(a.right - a.left - 40 * a.u, 600 * a.u);
    const h = Math.min(a.bottom - a.top - 30 * a.u, w * 0.6);
    const g = (this.geo = { x0: a.cx - w / 2, y0: a.cy - h / 2, w, h });
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(g.x0, g.y0, w, dpr);
    ctx.fillRect(g.x0, g.y0 + h, w, dpr);
    ctx.fillStyle = COL_MID;
    ctx.fillRect(g.x0 + w - dpr, g.y0, 2 * dpr, h);
    const ball = (pp: number) => [g.x0 + pp * w, g.y0 + this.yAt(pp) * h] as const;
    if (this.state === 0) {
      const [x, y] = ball(Math.max(0, p));
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.arc(x, y, 7 * a.u, 0, TAU);
      ctx.fill();
    } else if (this.state === 2) {
      // The real path, and where you said.
      ctx.strokeStyle = COL_MID;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      for (let k = 0; k <= 60; k++) {
        const [x, y] = ball(k / 60);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = COL_LINE;
      ctx.beginPath();
      ctx.arc(g.x0 + w, g.y0 + this.hitY * h, 7 * a.u, 0, TAU);
      ctx.fill();
      if (this.tapY >= 0) {
        ctx.fillStyle = COL_ACCENT;
        ctx.fillRect(g.x0 + w - 18 * a.u, g.y0 + this.tapY * h - dpr, 36 * a.u, 2 * dpr);
      }
    }
    ctx.fillStyle = COL_MID;
    if (this.state === 1) v.text('tap where it hits the right-hand wall', a.cx, g.y0 - 14 * dpr, v.fontTiny, 'center');
    else if (this.i === 0 && this.state === 0) v.text('watch the ball: it bounces once off the top or bottom, then hides', a.cx, g.y0 - 14 * dpr, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.round(Math.max(0, 0.3 - m) * 3000) : 0,
      primary: { label: 'average miss', value: Math.round(m * 1000) / 10, unit: '%', lower: true, decimals: 1 },
      lines: [
        { label: 'average miss (share of the wall)', value: this.errs.length ? `${(m * 100).toFixed(1)}%` : '–' },
        { label: 'within 4%', value: pct(this.errs.filter((e) => e < 0.04).length / (this.errs.length || 1)) },
      ],
      saved: this.errs.length >= 4,
    };
  }
}

// --- Mirror -----------------------------------------------------------------------

const MIRROR_MS = 45000;

class Mirror implements Mini {
  private env!: MiniEnv;
  private x = 0;
  private t0 = 0;
  private last = 0;
  private flipped = false;
  private nextFlip = 0;
  private warnAt = 0;
  private inside = 0;
  private frames = 0;
  private flips = 0;
  private afterFlip: number[] = [];
  private flipAt = 0;
  private recovered = true;
  private held = 0;
  private seed = Math.random() * 100;
  private done = false;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.t0 = now + 800;
    this.last = now;
    this.nextFlip = this.t0 + 6000 + Math.random() * 4000;
  }

  press(slot: number): void {
    this.held |= 1 << slot;
    this.env.sound(sideOf(slot) > 0 ? SND_TAP_R : SND_TAP_L);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  /** Track centre at time t (ms), in -1..1. */
  private centre(t: number): number {
    const s = this.seed;
    const k = 1 + t / 60000;
    return 0.55 * Math.sin(t * 0.0009 * k + s) + 0.25 * Math.sin(t * 0.0023 * k + s * 2);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const t = now - this.t0;
    if (t > scaled(MIRROR_MS)) {
      this.done = true;
      if (t > scaled(MIRROR_MS) + 800) return true;
    }
    const half = 0.16;
    if (t >= 0 && !this.done) {
      if (now >= this.nextFlip - 900 && !this.warnAt) this.warnAt = now;
      if (now >= this.nextFlip) {
        this.flipped = !this.flipped;
        this.flips++;
        this.flipAt = now;
        this.recovered = false;
        this.warnAt = 0;
        this.nextFlip = now + 5000 + Math.random() * 5000;
        this.env.sound(SND_TONE + (this.flipped ? 1 : 5));
      }
      const l = (this.held & 0b111) !== 0 ? 1 : 0;
      const r = (this.held & 0b111000) !== 0 ? 1 : 0;
      const dir = (r - l) * (this.flipped ? -1 : 1);
      this.x = clamp(this.x + dir * 1.3 * dt, -1, 1);
      const c = this.centre(t);
      const inTrack = Math.abs(this.x - c) < half;
      this.frames++;
      if (inTrack) this.inside++;
      // Time to get back on track after each swap.
      if (!this.recovered && inTrack && now - this.flipAt > 150) {
        this.recovered = true;
        this.afterFlip.push(now - this.flipAt);
      }
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'on track', this.frames ? pct(this.inside / this.frames) : '–', 'controls', this.flipped ? 'swapped' : 'normal');
    const W = Math.min((a.right - a.left) / 2 - 20 * a.u, 280 * a.u);
    const H = a.bottom - a.top;
    const dotY = a.top + H * 0.8;
    const toX = (x: number) => a.cx + x * W;
    // The track ahead, scrolling down toward the dot.
    for (const side of [-1, 1]) {
      ctx.strokeStyle = COL_LINE;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      for (let k = 0; k <= 40; k++) {
        const yy = a.top + (k / 40) * H;
        const tt = t + ((dotY - yy) / H) * 2200;
        const xx = toX(this.centre(tt) + side * half);
        if (k === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
    const warn = this.warnAt && now - this.warnAt < 900;
    ctx.fillStyle = COL_ACCENT;
    ctx.strokeStyle = COL_ACCENT;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.arc(toX(this.x), dotY, 8 * a.u, 0, TAU);
    if (this.flipped) ctx.stroke();
    else ctx.fill();
    if (warn) {
      ctx.fillStyle = COL_MID;
      v.text('swap coming', toX(this.x), dotY + 30 * a.u, v.fontTiny, 'center');
    }
    if (t < 3000) message(v, { ...a, cy: a.top + 30 * a.u }, `hold ${handLabel(this.env, -1)} / ${handLabel(this.env, 1)} to stay on the track`, 'every so often the controls swap: a hollow dot means swapped', COL_MID);
    if (this.done) message(v, a, `${pct(this.inside / (this.frames || 1))} on track`, '');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const share = this.frames ? this.inside / this.frames : 0;
    return {
      score: Math.round(share * 700),
      primary: { label: 'time on track', value: Math.round(share * 100), unit: '%' },
      lines: [
        { label: 'time on track', value: pct(share) },
        { label: 'control swaps', value: String(this.flips) },
        { label: 'median time to recover after a swap', value: this.afterFlip.length ? `${(median(this.afterFlip) / 1000).toFixed(2)} s` : '–' },
      ],
      saved: this.frames > 300,
    };
  }
}

// --- Letters ----------------------------------------------------------------------

/** Words to unscramble: the more common half of the 5,000 most common English words, 4 to 7 letters. */
const WORDS = ENGLISH_5K.slice(0, 2500).filter((w) => w.length >= 4 && w.length <= 7);
/** Any of the 5,000 counts as an answer if it uses the same letters. */
const VALID = new Set(ENGLISH_5K);
const LETTERS_MS = 90000;

class Letters implements Mini {
  private env!: MiniEnv;
  private t0 = 0;
  private word = '';
  private shown = '';
  private typed = '';
  private solved = 0;
  private skipped = 0;
  private flash = 0;
  private flashOk = true;
  private lastWord = '';
  private done = false;
  private used = new Set<string>();
  private times: number[] = [];
  private shownAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.t0 = now + 500;
    this.make(now + 500);
  }

  private make(now: number): void {
    // Short words first, longer as you go.
    const maxLen = Math.min(6, 4 + Math.floor(this.solved / 3));
    let pool = WORDS.filter((w) => w.length <= maxLen && !this.used.has(w));
    if (!pool.length) {
      // Every word used: start the list again (but not with the one just solved).
      this.used = new Set([this.word]);
      pool = WORDS.filter((w) => w.length <= maxLen && !this.used.has(w));
    }
    this.word = pool[Math.floor(Math.random() * pool.length)] ?? WORDS[0]!;
    this.used.add(this.word);
    let s = this.word;
    for (let k = 0; k < 10 && s === this.word; k++) s = shuffle([...this.word]).join('');
    this.shown = s.toUpperCase();
    this.typed = '';
    this.shownAt = now;
  }

  private sorted(w: string): string {
    return [...w].sort().join('');
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    if (this.done) return /^Key[A-Z]$/.test(code) || code === 'Backspace' || code === 'Enter';
    const m = /^Key([A-Z])$/.exec(code);
    if (m) {
      if (this.typed.length < this.word.length) this.typed += m[1]!.toLowerCase();
      this.env.sound(SND_TAP_WEAK);
      if (this.typed.length === this.word.length) {
        // Any listed word with the same letters counts.
        const ok = this.typed === this.word || (VALID.has(this.typed) && this.sorted(this.typed) === this.sorted(this.word));
        this.flash = ts;
        this.flashOk = ok;
        this.lastWord = this.word;
        if (ok) {
          this.solved++;
          this.times.push(ts - this.shownAt);
          this.env.sound(SND_CATCH);
          this.make(ts);
        } else {
          this.env.sound(SND_FALSE);
          this.typed = '';
        }
      }
      return true;
    }
    if (code === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      return true;
    }
    if (code === 'Enter') {
      // Skip: show the answer, move on.
      this.skipped++;
      this.flash = ts;
      this.flashOk = false;
      this.lastWord = this.word;
      this.make(ts);
      return true;
    }
    return false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const t = now - this.t0;
    if (t > scaled(LETTERS_MS)) {
      this.done = true;
      if (t > scaled(LETTERS_MS) + 800) return true;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'solved', String(this.solved), 'time left', `${Math.max(0, Math.ceil((scaled(LETTERS_MS) - t) / 1000))} s`);
    if (!this.done) {
      const n = this.shown.length;
      const s = Math.min(54 * a.u, (a.right - a.left) / (n + 2));
      const x0 = a.cx - (n * s) / 2;
      [...this.shown].forEach((ch, k) => {
        ctx.strokeStyle = COL_DIM;
        ctx.lineWidth = dpr;
        ctx.strokeRect(x0 + k * s + 3 * dpr, a.cy - 70 * a.u, s - 6 * dpr, s - 6 * dpr);
        ctx.fillStyle = COL_LINE;
        v.text(ch, x0 + k * s + s / 2, a.cy - 70 * a.u + s / 2 + 7 * dpr, v.fontHud, 'center');
      });
      ctx.fillStyle = now - this.flash < 300 && !this.flashOk ? COL_ACCENT : COL_LINE;
      v.text(this.typed.toUpperCase().padEnd(n, '_').split('').join(' '), a.cx, a.cy + 30 * a.u, v.fontBig, 'center');
      ctx.fillStyle = COL_MID;
      if (now - this.flash < 1500 && !this.flashOk && this.lastWord !== this.word) v.text(`it was ${this.lastWord}`, a.cx, a.cy + 80 * a.u, v.fontTiny, 'center');
      else if (this.solved + this.skipped === 0) v.text('unscramble the letters and type the word. Enter skips. needs a keyboard', a.cx, a.cy + 80 * a.u, v.fontTiny, 'center');
    } else message(v, a, `${this.solved} words`, `${this.skipped} skipped`);
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.solved * 40,
      primary: { label: 'words solved', value: this.solved, unit: '' },
      lines: [
        { label: 'words solved in 90 s', value: String(this.solved) },
        { label: 'skipped', value: String(this.skipped) },
        { label: 'median time per word', value: this.times.length ? `${(median(this.times) / 1000).toFixed(1)} s` : '–' },
      ],
      rts: this.times, saved: this.solved + this.skipped >= 2,
    };
  }
}

export const BATCH19: MiniDef[] = [
  {
    id: 'pitch',
    name: 'Pitch',
    skill: 'ear',
    blurb: 'Two tones. Was the second higher or lower? By ear alone.',
    how: 'Two tones play, one after the other. Answer with the left hand if the second was lower, the right if it was higher (or tap that side). Get it right and the difference shrinks. Scored on the smallest step you can reliably hear. Needs sound on.',
    input: 'both',
    minKeys: 2,
    make: () => new Pitch(),
  },
  {
    id: 'compass',
    name: 'Compass',
    skill: 'reasoning',
    blurb: 'Follow a string of turns in your head. Which way are you facing?',
    how: 'You start facing the way the arrow points. Then come turns: right, left, around. Work out where you face at the end and tap that direction (or press the arrow key). Two right in a row adds a turn. 75 seconds.',
    input: 'pointer',
    make: () => new Compass(),
  },
  {
    id: 'bank',
    name: 'Bank',
    skill: 'judgement',
    blurb: 'A ball heads for the wall and vanishes. Where will it land after the bounce?',
    how: 'A ball sets off across the board. It bounces once off the top or bottom, but it disappears early. Tap the point on the right-hand wall where it will arrive. Fifteen shots; it hides sooner as you go.',
    input: 'pointer',
    make: () => new Bank(),
  },
  {
    id: 'mirror',
    name: 'Mirror',
    skill: 'coordination',
    blurb: 'Steer along a track. Every so often the controls swap sides.',
    how: 'Hold a left or right key to keep the dot on the winding track. Every few seconds the controls swap: left steers right. A hollow dot means swapped; a note warns just before. Scored on time on track and how fast you recover after each swap. 45 seconds.',
    input: 'keys',
    minKeys: 2,
    make: () => new Mirror(),
  },
  {
    id: 'letters',
    name: 'Letters',
    skill: 'reasoning',
    blurb: 'Unscramble the word. Type it.',
    how: 'Scrambled letters appear: type the word they make. Any real word using all the letters counts. Enter skips (and shows the answer). Words get longer as you solve them. 90 seconds. Needs a keyboard.',
    input: 'type',
    make: () => new Letters(),
  },
];
