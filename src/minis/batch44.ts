// Forty-fourth batch.
//   Carom    - a ball sets off and vanishes. Where will it be when it stops, after its bounces?
//   Prime    - a number: prime or not? As fast as you can.
//   Fraction - two fractions: which is bigger?
//   Marble   - tilt the board with the mouse; roll the marble into the goal, round the holes.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALL, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, mean, median, ms, pct, scaled, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

// --- Carom -----------------------------------------------------------------------------

const CAROM_ROUNDS = 12;

class Carom implements Mini {
  private env!: MiniEnv;
  private round = 0;
  /** Start, direction and path length in table units (the table is 2 wide, 1 tall). */
  private sx = 0;
  private sy = 0;
  private ang = 0;
  private dist = 0;
  private end: [number, number] = [0, 0];
  private path: [number, number][] = [];
  private state = 0; // 0 showing the start, 1 guessing, 2 feedback
  private at = 0;
  private guess: [number, number] | null = null;
  private errs: number[] = [];
  private table: [number, number, number] = [0, 0, 1];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 400);
  }

  private arm(at: number): void {
    this.sx = rnd(0.2, 1.8);
    this.sy = rnd(0.15, 0.85);
    this.ang = rnd(0, TAU);
    // Longer paths, so more bounces, as you go.
    this.dist = rnd(0.8, 1.4) + this.round * 0.25;
    // Trace the path with bounces off the cushions.
    let x = this.sx;
    let y = this.sy;
    let dx = Math.cos(this.ang);
    let dy = Math.sin(this.ang);
    let left = this.dist;
    this.path = [[x, y]];
    while (left > 1e-6) {
      const tx = dx > 0 ? (2 - x) / dx : dx < 0 ? -x / dx : Infinity;
      const ty = dy > 0 ? (1 - y) / dy : dy < 0 ? -y / dy : Infinity;
      const t = Math.min(tx, ty, left);
      x += dx * t;
      y += dy * t;
      left -= t;
      this.path.push([x, y]);
      if (left <= 1e-6) break;
      if (t === tx) dx = -dx;
      if (t === ty) dy = -dy;
    }
    this.end = [x, y];
    this.guess = null;
    this.state = 0;
    this.at = at;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 1) return;
    const [x0, y0, s] = this.table;
    const gx = (x - x0) / s;
    const gy = (y - y0) / s;
    if (gx < -0.1 || gx > 2.1 || gy < -0.1 || gy > 1.1) return;
    this.guess = [gx, gy];
    const e = Math.hypot(gx - this.end[0], gy - this.end[1]) * 50;
    this.errs.push(e);
    this.env.sound(e < 4 ? SND_CATCH : SND_TAP_WEAK);
    this.round++;
    this.state = 2;
    this.at = ts + 2000;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at + 1200) this.state = 1;
    if (this.state === 2 && now >= this.at) {
      if (this.round >= scaled(CAROM_ROUNDS)) return true;
      this.arm(now + 300);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'off by', this.errs.length ? `${mean(this.errs.slice(-3)).toFixed(1)}%` : '–', 'shot', `${Math.min(this.round + 1, scaled(CAROM_ROUNDS))} / ${scaled(CAROM_ROUNDS)}`);
    const s = Math.min((a.right - a.left - 20 * a.u) / 2, a.bottom - a.top - 70 * a.u);
    const x0 = a.cx - s;
    const y0 = a.top + 30 * a.u;
    this.table = [x0, y0, s];
    const X = (x: number) => x0 + x * s;
    const Y = (y: number) => y0 + y * s;
    ctx.fillStyle = '#121215';
    ctx.fillRect(x0, y0, 2 * s, s);
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 3 * dpr;
    ctx.strokeRect(x0, y0, 2 * s, s);
    // The start and the direction, with an arrow as long as the trip (so length is shown too).
    ctx.fillStyle = COL_ACCENT;
    ctx.beginPath();
    ctx.arc(X(this.sx), Y(this.sy), 8 * a.u, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = COL_ACCENT;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(X(this.sx), Y(this.sy));
    const ax = X(this.sx) + Math.cos(this.ang) * 40 * a.u;
    const ay = Y(this.sy) + Math.sin(this.ang) * 40 * a.u;
    ctx.lineTo(ax, ay);
    ctx.stroke();
    // A ruler showing how far it will roll in total.
    const ry = y0 + s + 26 * a.u;
    ctx.fillStyle = COL_MID;
    ctx.fillRect(x0, ry, this.dist * s, 3 * dpr);
    v.text('how far it rolls, bounces and all', x0, ry + 18 * a.u, v.fontTiny, 'left');
    if (this.state === 2) {
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      this.path.forEach(([x, y], k) => (k ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      ctx.stroke();
      ctx.fillStyle = COL_LINE;
      ctx.beginPath();
      ctx.arc(X(this.end[0]), Y(this.end[1]), 8 * a.u, 0, TAU);
      ctx.fill();
    }
    if (this.guess) {
      ctx.strokeStyle = COL_ACCENT;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(X(this.guess[0]), Y(this.guess[1]), 9 * a.u, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = COL_MID;
    v.text(this.state === 0 ? 'the ball sets off this way and rolls the length of the bar' : this.state === 1 ? 'click where it stops: it bounces off the cushions' : `${this.errs[this.errs.length - 1]!.toFixed(1)}% off`, a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.round(Math.max(0, 30 - m) * 30) : 0,
      primary: { label: 'average miss', value: m, unit: '%', lower: true, decimals: 1 },
      lines: [
        { label: 'average miss (share of the table width)', value: this.errs.length ? `${m.toFixed(1)}%` : '–' },
        { label: 'closest', value: this.errs.length ? `${Math.min(...this.errs).toFixed(1)}%` : '–' },
      ],
      saved: this.errs.length >= 3,
    };
  }
}

// --- Prime -----------------------------------------------------------------------------

const PRIME_MS = 60000;

function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

class Prime implements Mini {
  private env!: MiniEnv;
  private n = 0;
  private at = 0;
  private t0 = 0;
  private started = false;
  private right = 0;
  private wrong = 0;
  private rts: number[] = [];
  private flash = 0;
  private note = '';
  private held = 0;
  private firstFrame = 0;
  private top = 50;

  start(env: MiniEnv): void {
    this.env = env;
  }

  private newNumber(now: number): void {
    // Half prime, half not; the composites are the tricky odd ones (no evens past 2, no fives).
    const wantPrime = Math.random() < 0.5;
    for (let k = 0; k < 500; k++) {
      const c = rint(2, this.top);
      if (isPrime(c) !== wantPrime) continue;
      if (!wantPrime && (c % 2 === 0 || c % 5 === 0) && Math.random() < 0.8) continue;
      this.n = c;
      break;
    }
    this.at = now;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0) return;
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.newNumber(ts);
      return;
    }
    const ok = (s > 0) === isPrime(this.n);
    if (ok) {
      this.right++;
      this.rts.push(ts - this.at);
      this.top = Math.min(500, this.top + 8);
      this.env.sound(s < 0 ? SND_TAP_L : SND_TAP_R);
      this.note = '';
    } else {
      this.wrong++;
      this.env.sound(SND_FALSE);
      const f = [2, 3, 5, 7, 11, 13, 17, 19].find((d) => this.n % d === 0 && this.n !== d);
      this.note = isPrime(this.n) ? `${this.n} is prime` : `${this.n} = ${f} × ${this.n / f!}`;
      this.flash = ts + 1100;
    }
    this.newNumber(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(PRIME_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.right), 'time', `${left} s`);
    ctx.font = `600 ${Math.round(80 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL_LINE;
    ctx.fillText(this.started ? String(this.n) : 'prime?', a.cx, a.cy - 20 * a.u);
    ctx.fillStyle = COL_MID;
    v.text('not prime (left)   ·   prime (right)', a.cx, a.cy + 50 * a.u, v.fontTiny, 'center');
    if (now < this.flash) {
      ctx.fillStyle = COL_ACCENT;
      v.text(this.note, a.cx, a.cy + 80 * a.u, v.fontTiny, 'center');
    }
    if (!this.started) v.text('press either side to start. the numbers grow as you go', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.right * 20 - this.wrong * 30),
      primary: { label: 'right in a minute', value: this.right, unit: '' },
      lines: [
        { label: 'right', value: String(this.right) },
        { label: 'wrong', value: String(this.wrong) },
        { label: 'typical time a number', value: this.rts.length ? ms(median(this.rts)) : '–' },
        { label: 'numbers reached', value: `up to ${this.top}` },
      ],
      saved: this.right + this.wrong >= 5,
    };
  }
}

// --- Fraction --------------------------------------------------------------------------

const FRACTION_MS = 60000;

class Fraction implements Mini {
  private env!: MiniEnv;
  private f: [[number, number], [number, number]] = [[1, 2], [1, 3]];
  private at = 0;
  private t0 = 0;
  private started = false;
  private right = 0;
  private wrong = 0;
  private rts: number[] = [];
  private level = 0;
  private flash = 0;
  private held = 0;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  private make(now: number): void {
    // Closer and less friendly pairs as you go.
    const maxD = Math.min(30, 6 + this.level * 2);
    for (let k = 0; k < 500; k++) {
      const b = rint(2, maxD);
      const d = rint(2, maxD);
      const a = rint(1, b - 1);
      const c = rint(1, d - 1);
      const diff = Math.abs(a / b - c / d);
      if (diff < 1e-9) continue;
      const want = Math.max(0.01, 0.25 / (1 + this.level * 0.35));
      if (diff > want * 1.6 || diff < want * 0.4) continue;
      this.f = [[a, b], [c, d]];
      break;
    }
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
    const [[a, b], [c, d]] = this.f;
    const ok = (s < 0) === a / b > c / d;
    if (ok) {
      this.right++;
      this.level++;
      this.rts.push(ts - this.at);
      this.env.sound(s < 0 ? SND_TAP_L : SND_TAP_R);
    } else {
      this.wrong++;
      this.level = Math.max(0, this.level - 2);
      this.flash = ts + 500;
      this.env.sound(SND_FALSE);
    }
    this.make(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(FRACTION_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.right), 'time', `${left} s`);
    const frac = (n: number, d: number, x: number) => {
      ctx.font = `600 ${Math.round(52 * a.u)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = now < this.flash ? COL_ACCENT : COL_LINE;
      ctx.fillText(String(n), x, a.cy - 44 * a.u);
      ctx.fillRect(x - 40 * a.u, a.cy - 2 * dpr, 80 * a.u, 3 * dpr);
      ctx.fillText(String(d), x, a.cy + 40 * a.u);
    };
    if (this.started) {
      frac(this.f[0][0], this.f[0][1], a.cx - 110 * a.u);
      frac(this.f[1][0], this.f[1][1], a.cx + 110 * a.u);
    }
    ctx.fillStyle = COL_MID;
    v.text(this.started ? 'which is bigger? left or right' : 'which fraction is bigger? press its side. press either to start', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.right * 20 - this.wrong * 20 + this.level * 10),
      primary: { label: 'right in a minute', value: this.right, unit: '' },
      lines: [
        { label: 'right', value: String(this.right) },
        { label: 'wrong', value: String(this.wrong) },
        { label: 'typical time a pair', value: this.rts.length ? ms(median(this.rts)) : '–' },
        { label: 'accuracy', value: pct(this.right / Math.max(1, this.right + this.wrong)) },
      ],
      saved: this.right + this.wrong >= 5,
    };
  }
}

// --- Marble ----------------------------------------------------------------------------

const MARBLE_MS = 120000;

class Marble implements Mini {
  private env!: MiniEnv;
  private bx = 0.1;
  private by = 0.5;
  private vx = 0;
  private vy = 0;
  private tx = 0;
  private ty = 0;
  private holes: [number, number, number][] = [];
  private goal: [number, number] = [0.9, 0.5];
  private level = 0;
  private done = 0;
  private falls = 0;
  private last = 0;
  private t0 = 0;
  private started = false;
  private pausedUntil = 0;
  private note = '';
  private board: [number, number, number] = [0, 0, 1];
  private times: number[] = [];
  private levelAt = 0;
  private firstFrame = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    this.layout(now);
  }

  /** The board is 1.6 wide and 1 tall; holes get more numerous with each level. */
  private layout(now: number): void {
    this.bx = 0.12;
    this.by = rnd(0.2, 0.8);
    this.vx = 0;
    this.vy = 0;
    this.goal = [1.48, rnd(0.2, 0.8)];
    this.holes = [];
    const n = 2 + this.level * 2;
    for (let k = 0; k < 400 && this.holes.length < n; k++) {
      const h: [number, number, number] = [rnd(0.3, 1.35), rnd(0.08, 0.92), rnd(0.045, 0.07)];
      const clear = (x: number, y: number, r: number) => Math.hypot(h[0] - x, h[1] - y) > h[2] + r;
      if (clear(this.bx, this.by, 0.16) && clear(this.goal[0], this.goal[1], 0.14) && this.holes.every((o) => clear(o[0], o[1], o[2] + 0.07))) this.holes.push(h);
    }
    this.levelAt = now;
  }

  press(): void {}

  pointerMove(x: number, y: number): void {
    const [x0, y0, s] = this.board;
    // The pointer's offset from the board's centre is the tilt.
    this.tx = Math.max(-1, Math.min(1, (x - (x0 + 0.8 * s)) / (0.8 * s)));
    this.ty = Math.max(-1, Math.min(1, (y - (y0 + 0.5 * s)) / (0.5 * s)));
  }

  pointer(x: number, y: number, ts: number): void {
    this.pointerMove(x, y);
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.levelAt = ts;
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(MARBLE_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    const dt = Math.min(0.033, (now - this.last) / 1000);
    this.last = now;
    if (this.started && now >= this.pausedUntil) {
      if (this.note) {
        this.note = '';
      }
      // Tilt accelerates the marble; a little friction; it bounces softly off the rim.
      this.vx = (this.vx + this.tx * 1.6 * dt) * (1 - 0.6 * dt);
      this.vy = (this.vy + this.ty * 1.6 * dt) * (1 - 0.6 * dt);
      this.bx += this.vx * dt;
      this.by += this.vy * dt;
      const r = 0.035;
      if (this.bx < r || this.bx > 1.6 - r) {
        this.vx = -this.vx * 0.4;
        this.bx = Math.max(r, Math.min(1.6 - r, this.bx));
      }
      if (this.by < r || this.by > 1 - r) {
        this.vy = -this.vy * 0.4;
        this.by = Math.max(r, Math.min(1 - r, this.by));
      }
      if (Math.hypot(this.bx - this.goal[0], this.by - this.goal[1]) < 0.05) {
        this.done++;
        this.times.push((now - this.levelAt) / 1000);
        this.level++;
        this.env.sound(SND_CATCH);
        this.note = 'in';
        this.pausedUntil = now + 800;
        this.layout(now + 800);
      } else if (this.holes.some(([hx, hy, hr]) => Math.hypot(this.bx - hx, this.by - hy) < hr)) {
        this.falls++;
        this.env.sound(SND_FALL);
        this.note = 'fell in';
        this.pausedUntil = now + 900;
        this.bx = 0.12;
        this.vx = 0;
        this.vy = 0;
      }
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'boards done', String(this.done), 'time', `${left} s`);
    const s = Math.min((a.right - a.left) / 1.6, a.bottom - a.top - 30 * a.u);
    const x0 = a.cx - 0.8 * s;
    const y0 = a.top + 6 * a.u;
    this.board = [x0, y0, s];
    const X = (x: number) => x0 + x * s;
    const Y = (y: number) => y0 + y * s;
    ctx.fillStyle = '#16161a';
    ctx.fillRect(x0, y0, 1.6 * s, s);
    ctx.strokeStyle = COL_MID;
    ctx.lineWidth = 2 * dpr;
    ctx.strokeRect(x0, y0, 1.6 * s, s);
    for (const [hx, hy, hr] of this.holes) {
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(X(hx), Y(hy), hr * s, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = COL_FAINT;
      ctx.stroke();
    }
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    ctx.arc(X(this.goal[0]), Y(this.goal[1]), 0.05 * s, 0, TAU);
    ctx.stroke();
    // The tilt, as a small arrow in the corner.
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(X(0.08), Y(0.92));
    ctx.lineTo(X(0.08) + this.tx * 30 * a.u, Y(0.92) + this.ty * 30 * a.u);
    ctx.stroke();
    ctx.fillStyle = COL_ACCENT;
    ctx.beginPath();
    ctx.arc(X(this.bx), Y(this.by), 0.035 * s, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(X(this.bx) - 0.01 * s, Y(this.by) - 0.01 * s, 0.01 * s, 0, TAU);
    ctx.fill();
    ctx.fillStyle = COL_MID;
    v.text(this.note || (this.started ? 'the pointer tilts the board: roll the marble into the white ring' : 'click to start. move the pointer away from the middle to tilt the board that way'), a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.done * 100 - this.falls * 15),
      primary: { label: 'boards done', value: this.done, unit: '' },
      lines: [
        { label: 'boards done', value: String(this.done) },
        { label: 'fell in a hole', value: String(this.falls) },
        { label: 'typical time a board', value: this.times.length ? `${median(this.times).toFixed(1)} s` : '–' },
      ],
      saved: this.started && this.done + this.falls >= 1,
    };
  }
}

export const BATCH44: MiniDef[] = [
  { id: 'carom', name: 'Carom', skill: 'judgement', blurb: 'A ball sets off and vanishes. Where will it stop, after its bounces?', how: 'A ball on a table, an arrow for its direction, and a bar for how far it will roll in all. It bounces off the cushions like a pool ball. Click where it will stop. Longer trips, with more bounces, as you go. Scored as a share of the table’s width. Twelve shots.', input: 'pointer', make: () => new Carom() },
  { id: 'prime', name: 'Prime', skill: 'reasoning', blurb: 'A number: prime or not? As fast as you can.', how: 'A number appears. Prime (divisible only by 1 and itself): right. Not prime: left. The tricky ones are odd numbers like 51 or 91. The numbers grow as you go. A minute; mistakes count against you and show the factors.', input: 'keys', minKeys: 2, make: () => new Prime() },
  { id: 'fraction', name: 'Fraction', skill: 'reasoning', blurb: 'Two fractions. Which is bigger?', how: 'Two fractions side by side: press the side of the bigger one. As you get them right they get closer together and their numbers less friendly. A minute.', input: 'keys', minKeys: 2, make: () => new Fraction() },
  { id: 'marble', name: 'Marble', skill: 'coordination', blurb: 'Tilt the board with the mouse; roll the marble into the goal, round the holes.', how: 'A marble on a board with holes. Where the pointer sits, away from the board’s middle, is the way the board tilts: the further, the steeper. Roll the marble into the white ring without dropping it into a hole. Each board has more holes. Two minutes.', input: 'pointer', make: () => new Marble() },
];

