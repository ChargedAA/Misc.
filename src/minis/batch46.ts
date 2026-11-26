// Forty-sixth batch.
//   Till    - a price and what was paid: type the change.
//   Share   - a pie chart: what percentage is the orange slice?
//   Swarm   - steer the pointer through a swarm of shots. How long can you last?
//   Balloon - click the balloon to bat it up; keep it off the floor.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALL, SND_FALSE, SND_TAP_L, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, mean, median, ms, pct, scaled, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Till ------------------------------------------------------------------------------

const TILL_ROUNDS = 12;

class Till implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private price = 0;
  private paid = 0;
  private typed = '';
  private state = 0;
  private at = 0;
  private right = 0;
  private rts: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now);
  }

  /** Prices in cents; payment is the next round note (or a note and coins later on). */
  private arm(now: number): void {
    const big = this.round >= 6;
    this.price = big ? rint(1001, 9899) : rint(105, 1995);
    const notes = [500, 1000, 2000, 5000, 10000];
    const note = notes.find((n) => n > this.price)!;
    // Later, people hand over extra coins to get rounder change.
    const extra = this.round >= 8 && Math.random() < 0.5 ? this.price % 100 : 0;
    this.paid = note + extra;
    this.typed = '';
    this.state = 0;
    this.at = now;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const d = digitOf(code);
    if (this.state !== 0) return !!d;
    if (d) {
      if (this.typed.length < 5) this.typed += d;
      return true;
    }
    if (code === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      return true;
    }
    if ((code === 'Enter' || code === 'NumpadEnter' || code === 'Space') && this.typed) {
      const said = Number(this.typed);
      const ok = said === this.paid - this.price;
      if (ok) {
        this.right++;
        this.rts.push(ts - this.at);
      }
      this.env.sound(ok ? SND_CATCH : SND_FALSE);
      this.round++;
      this.state = 1;
      this.at = ts + (ok ? 800 : 1800);
      return true;
    }
    return false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.round >= scaled(TILL_ROUNDS)) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const money = (c: number) => `$${(c / 100).toFixed(2)}`;
    header(v, touch, 'right', String(this.right), 'customer', `${Math.min(this.round + 1, scaled(TILL_ROUNDS))} / ${scaled(TILL_ROUNDS)}`);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `500 ${Math.round(26 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = COL_MID;
    ctx.fillText('price', a.cx - 120 * a.u, a.cy - 90 * a.u);
    ctx.fillText('paid', a.cx + 120 * a.u, a.cy - 90 * a.u);
    ctx.font = `600 ${Math.round(46 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = COL_LINE;
    ctx.fillText(money(this.price), a.cx - 120 * a.u, a.cy - 50 * a.u);
    ctx.fillText(money(this.paid), a.cx + 120 * a.u, a.cy - 50 * a.u);
    // The answer as cents, shown as dollars as you type.
    const cents = Number(this.typed || '0');
    ctx.font = `600 ${Math.round(46 * a.u)}px ui-monospace, 'JetBrains Mono', Menlo, monospace`;
    const last = this.state === 1;
    ctx.fillStyle = last ? (Number(this.typed) === this.paid - this.price ? COL_LINE : COL_ACCENT) : COL_LINE;
    ctx.fillText(money(cents), a.cx, a.cy + 40 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(last && Number(this.typed) !== this.paid - this.price ? `the change is ${money(this.paid - this.price)}` : 'change: type it in cents (digits fill from the right), then Enter', a.cx, a.cy + 90 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 80 + (this.rts.length ? Math.round(Math.max(0, 12000 - median(this.rts)) / 40) : 0),
      primary: { label: 'right', value: this.right, unit: `of ${this.round}` },
      lines: [
        { label: 'right', value: `${this.right} of ${this.round}` },
        { label: 'typical time when right', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.round >= 3,
    };
  }
}

// --- Share (estimate a pie slice) ------------------------------------------------------

const SHARE_ROUNDS = 15;

class Share implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private slices: number[] = [];
  private target = 0;
  private start0 = 0;
  private typed = '';
  private state = 0;
  private at = 0;
  private errs: number[] = [];
  private signed: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now);
  }

  private arm(now: number): void {
    // Three to six slices; the orange one is anywhere from tiny to most of the pie.
    const n = rint(3, 6);
    const raw = Array.from({ length: n }, () => rnd(0.3, 1));
    const sum = raw.reduce((s, x) => s + x, 0);
    this.slices = raw.map((x) => x / sum);
    this.target = rint(0, n - 1);
    this.start0 = rnd(0, TAU);
    this.typed = '';
    this.state = 0;
    this.at = now;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const d = digitOf(code);
    if (this.state !== 0) return !!d;
    if (d) {
      if (this.typed.length < 3) this.typed += d;
      return true;
    }
    if (code === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      return true;
    }
    if ((code === 'Enter' || code === 'NumpadEnter' || code === 'Space') && this.typed) {
      const truth = this.slices[this.target]! * 100;
      const e = Number(this.typed) - truth;
      this.errs.push(Math.abs(e));
      this.signed.push(e);
      this.env.sound(Math.abs(e) < 3 ? SND_CATCH : SND_TAP_WEAK);
      this.round++;
      this.state = 1;
      this.at = ts + 1500;
      return true;
    }
    return false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.round >= scaled(SHARE_ROUNDS)) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'off by', this.errs.length ? `${mean(this.errs.slice(-3)).toFixed(1)} points` : '–', 'chart', `${Math.min(this.round + 1, scaled(SHARE_ROUNDS))} / ${scaled(SHARE_ROUNDS)}`);
    const R = Math.min(a.bottom - a.top - 90 * a.u, a.right - a.left) * 0.42;
    const cx = a.cx;
    const cy = a.top + R + 10 * a.u;
    let ang = this.start0;
    this.slices.forEach((s, k) => {
      ctx.fillStyle = k === this.target ? COL_ACCENT : ['#2c2c33', '#45454d', '#5f5f68', '#3a3a41', '#52525a', '#6c6c74'][k]!;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, ang, ang + s * TAU);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#0a0a0b';
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();
      ang += s * TAU;
    });
    ctx.fillStyle = COL_LINE;
    const truth = this.slices[this.target]! * 100;
    v.text(this.state === 1 ? `it was ${truth.toFixed(1)}%  ·  you said ${this.typed}%` : `${this.typed || '_'} %`, a.cx, cy + R + 36 * a.u, v.fontHud, 'center');
    if (this.round === 0 && this.state === 0) {
      ctx.fillStyle = COL_MID;
      v.text('what percentage of the pie is the orange slice? type it, then Enter', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    const b = mean(this.signed);
    return {
      score: this.errs.length ? Math.round(Math.max(0, 15 - m) * 60) : 0,
      primary: { label: 'average miss', value: m, unit: 'points', lower: true, decimals: 1 },
      lines: [
        { label: 'average miss', value: this.errs.length ? `${m.toFixed(1)} percentage points` : '–' },
        { label: 'tendency', value: this.signed.length >= 4 ? `${Math.abs(b).toFixed(1)} points ${b > 0 ? 'too high' : 'too low'}` : '–' },
        { label: 'within 3 points', value: this.errs.length ? pct(this.errs.filter((e) => e < 3).length / this.errs.length) : '–' },
      ],
      saved: this.errs.length >= 3,
    };
  }
}

// --- Swarm (dodge with the pointer) ----------------------------------------------------

interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

class Swarm implements Mini {
  private env!: MiniEnv;
  private shots: Shot[] = [];
  private px = -1;
  private py = -1;
  private started = false;
  private over = false;
  private overAt = 0;
  private t0 = 0;
  private last = 0;
  private nextShot = 0;
  private survived = 0;
  private near = 0;
  private box: [number, number, number, number] = [0, 0, 0, 0];
  private firstFrame = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
  }

  press(): void {}

  pointerMove(x: number, y: number): void {
    this.px = x;
    this.py = y;
  }

  pointer(x: number, y: number, ts: number): void {
    this.px = x;
    this.py = y;
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.last = ts;
      this.nextShot = ts + 300;
      this.env.sound(SND_TAP_L);
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    if (this.over && now >= this.overAt) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    const a = arena(v, touch);
    this.box = [a.left, a.top, a.right - a.left, a.bottom - a.top];
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.started && !this.over) {
      const t = (now - this.t0) / 1000;
      this.survived = t;
      // Shots from the edges, aimed near the pointer; more and faster as time goes on.
      while (now >= this.nextShot) {
        const side = rint(0, 3);
        const [bx, by, bw, bh] = this.box;
        const x = side === 0 ? bx : side === 1 ? bx + bw : bx + Math.random() * bw;
        const y = side === 2 ? by : side === 3 ? by + bh : by + Math.random() * bh;
        const aim = Math.atan2(this.py + rnd(-60, 60) * a.u - y, this.px + rnd(-60, 60) * a.u - x);
        const speed = (140 + t * 6) * a.u;
        this.shots.push({ x, y, vx: Math.cos(aim) * speed, vy: Math.sin(aim) * speed, r: rnd(5, 9) * a.u });
        this.nextShot += Math.max(110, 650 - t * 14);
      }
      for (const s of this.shots) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const d = Math.hypot(s.x - this.px, s.y - this.py);
        if (d < s.r + 5 * a.u) {
          this.over = true;
          this.overAt = now + 1200;
          this.env.sound(SND_FALL);
        } else if (d < s.r + 18 * a.u) this.near += dt;
      }
      const [bx, by, bw, bh] = this.box;
      this.shots = this.shots.filter((s) => s.x > bx - 40 && s.x < bx + bw + 40 && s.y > by - 40 && s.y < by + bh + 40);
      // Leaving the arena counts as being hit, so the edge is not a hiding place.
      if (this.px < bx || this.px > bx + bw || this.py < by || this.py > by + bh) {
        this.over = true;
        this.overAt = now + 1200;
        this.env.sound(SND_FALSE);
      }
    }
    v.clear();
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'lasted', `${this.survived.toFixed(1)} s`, 'shots in the air', String(this.shots.length));
    ctx.strokeStyle = COL_FAINT;
    ctx.lineWidth = dpr;
    ctx.strokeRect(...this.box);
    for (const s of this.shots) {
      ctx.fillStyle = COL_LINE;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    if (this.px >= 0) {
      ctx.fillStyle = this.over ? COL_MID : COL_ACCENT;
      ctx.beginPath();
      ctx.arc(this.px, this.py, 5 * a.u, 0, TAU);
      ctx.fill();
    }
    if (!this.started) {
      ctx.fillStyle = COL_MID;
      v.text('click to start, then keep the pointer (orange) clear of the white shots. stay inside the box', a.cx, a.cy, v.fontTiny, 'center');
    }
    if (this.over) {
      ctx.fillStyle = COL_LINE;
      v.text(`${this.survived.toFixed(1)} s`, a.cx, a.cy, v.fontHud, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.round(this.survived * 30),
      primary: { label: 'lasted', value: Math.round(this.survived * 10) / 10, unit: 's', decimals: 1 },
      lines: [
        { label: 'lasted', value: `${this.survived.toFixed(1)} s` },
        { label: 'near misses (time close to a shot)', value: `${this.near.toFixed(1)} s` },
      ],
      saved: this.started && this.survived > 1,
    };
  }
}

// --- Balloon ---------------------------------------------------------------------------

class Balloon implements Mini {
  private env!: MiniEnv;
  private bx = 0.5;
  private by = 0.3;
  private vx = 0;
  private vy = 0;
  private started = false;
  private over = false;
  private overAt = 0;
  private hits = 0;
  private misses = 0;
  private last = 0;
  private t0 = 0;
  private box: [number, number, number, number] = [0, 0, 0, 0];
  private firstFrame = 0;
  private flash = 0;
  private gravity = 0.45;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    const [bx, by, bw, bh] = this.box;
    const s = Math.min(bw, bh);
    const px = (x - bx) / s;
    const py = (y - by) / s;
    const r = 0.07;
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.vy = -0.4;
      return;
    }
    if (this.over) return;
    const d = Math.hypot(px - this.bx, py - this.by);
    if (d < r * 1.4) {
      // Hit off-centre and it flies off to the side; low hits send it higher.
      this.vx += (this.bx - px) * 6;
      this.vy = -0.9 - Math.max(0, py - this.by) * 3;
      this.hits++;
      this.flash = ts + 120;
      this.env.sound(SND_TAP_WEAK);
    } else {
      this.misses++;
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    if (this.over && now >= this.overAt) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    const a = arena(v, touch);
    this.box = [a.left, a.top, a.right - a.left, a.bottom - a.top];
    const W = (a.right - a.left) / Math.min(a.right - a.left, a.bottom - a.top);
    const dt = Math.min(0.033, (now - this.last) / 1000);
    this.last = now;
    if (this.started && !this.over) {
      // Heavier as you go.
      const t = (now - this.t0) / 1000;
      this.gravity = 0.3 + t * 0.01;
      // A balloon drifts: it never falls faster than its (slowly rising) top speed.
      this.vy = Math.min(this.vy + this.gravity * dt, 0.42 + t * 0.012);
      this.vx *= 1 - 0.8 * dt;
      this.bx += this.vx * dt;
      this.by += this.vy * dt;
      if (this.bx < 0.07 || this.bx > W - 0.07) {
        this.vx = -this.vx * 0.7;
        this.bx = Math.max(0.07, Math.min(W - 0.07, this.bx));
      }
      if (this.by < 0.07) {
        this.vy = Math.abs(this.vy) * 0.5;
        this.by = 0.07;
      }
      if (this.by > (a.bottom - a.top) / Math.min(a.right - a.left, a.bottom - a.top) - 0.07) {
        this.over = true;
        this.overAt = now + 1200;
        this.env.sound(SND_FALL);
      }
    }
    v.clear();
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'bats', String(this.hits), 'missed clicks', String(this.misses));
    const s = Math.min(a.right - a.left, a.bottom - a.top);
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(a.left, a.bottom - 2 * dpr, a.right - a.left, 2 * dpr);
    const x = a.left + this.bx * s;
    const y = a.top + this.by * s;
    const r = 0.07 * s;
    ctx.fillStyle = now < this.flash ? COL_LINE : COL_ACCENT;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.88, r, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(x, y + r);
    ctx.quadraticCurveTo(x - 6 * dpr, y + r * 1.5, x, y + r * 2.1);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.18, r * 0.28, -0.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = COL_MID;
    if (!this.started) v.text('click to start. click the balloon to bat it up; keep it off the floor', a.cx, a.cy + 40 * a.u, v.fontTiny, 'center');
    if (this.over) {
      ctx.fillStyle = COL_LINE;
      v.text(`${this.hits} bats`, a.cx, a.cy, v.fontHud, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.hits * 20 - this.misses * 2 > 0 ? this.hits * 20 - this.misses * 2 : this.hits * 5,
      primary: { label: 'bats', value: this.hits, unit: '' },
      lines: [
        { label: 'bats in a row', value: String(this.hits) },
        { label: 'clicks that missed', value: String(this.misses) },
      ],
      saved: this.started && this.hits >= 1,
    };
  }
}

export const BATCH46: MiniDef[] = [
  { id: 'till', name: 'Till', skill: 'reasoning', blurb: 'A price and what was paid. Type the change.', how: 'A price, and the money handed over. Type the change in cents (the digits fill in from the right, like a till: 3 7 5 makes $3.75) and press Enter. Prices grow, and later customers hand over extra coins to get rounder change. Twelve customers.', input: 'type', make: () => new Till() },
  { id: 'share', name: 'Share', skill: 'judgement', blurb: 'A pie chart: what percentage is the orange slice?', how: 'A pie chart with three to six slices. Type what percentage of the whole the orange slice is, then press Enter. Scored on how far off you are, in percentage points; the results show whether you tend to guess high or low. Fifteen charts.', input: 'type', make: () => new Share() },
  { id: 'swarm', name: 'Swarm', skill: 'aim', blurb: 'Keep the pointer clear of a swarm of shots. How long can you last?', how: 'Click to start. White shots fly in from the edges, aimed near the pointer, more and faster as time goes on. Keep the orange pointer clear of them, and inside the box. One touch ends it. Scored on how long you last.', input: 'pointer', make: () => new Swarm() },
  { id: 'balloon', name: 'Balloon', skill: 'aim', blurb: 'Click the balloon to bat it up. Keep it off the floor.', how: 'A balloon floats down. Click it to bat it back up: hit it off-centre and it flies off to the side, hit it low and it goes higher. It gets heavier as you go. Keep it off the floor as long as you can; misses do not end it, but they cost points.', input: 'pointer', make: () => new Balloon() },
];

