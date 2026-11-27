// Seventy-third batch.
//   Landing - a ball is thrown and vanishes at the top of its flight: click where it lands.
//   Pyramid - each block is the sum of the two beneath it: what goes at the top?

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, mean, median, ms, pct, scaled, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Landing ---------------------------------------------------------------------------

const LANDING_ROUNDS = 12;
const G = 1.6;

class Landing implements Mini {
  private env!: MiniEnv;
  private round = 0;
  /** Launch point and velocity, in field units (x across 0..1.6, y up from the ground 0..1). */
  private x0 = 0.1;
  private y0 = 0.1;
  private vx = 0.4;
  private vy = 1;
  private startAt = 0;
  private hideAt = 0;
  private landX = 1;
  private guess = -1;
  private state = 0; // 0 gap, 1 flight, 2 result
  private at = 0;
  private errs: number[] = [];
  private field: [number, number, number] = [0, 0, 1];
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.at = now + 600;
  }

  private arm(now: number): void {
    this.x0 = rnd(0.05, 0.35);
    this.y0 = rnd(0, 0.25);
    this.vy = rnd(0.9, 1.5);
    this.vx = rnd(0.25, 0.6);
    // Where it lands: solve y0 + vy t - G t²/2 = 0.
    const t = (this.vy + Math.sqrt(this.vy * this.vy + 2 * G * this.y0)) / G;
    this.landX = this.x0 + this.vx * t;
    if (this.landX > 1.55) this.vx *= 1.5 / this.landX;
    const t2 = (this.vy + Math.sqrt(this.vy * this.vy + 2 * G * this.y0)) / G;
    this.landX = this.x0 + this.vx * t2;
    this.startAt = now;
    // It vanishes at the top of its arc, later on a little before.
    const apex = this.vy / G;
    this.hideAt = now + apex * 1000 * (this.round < 6 ? 1 : rnd(0.6, 0.9));
    this.guess = -1;
    this.state = 1;
  }

  private posAt(now: number): [number, number] {
    const t = (now - this.startAt) / 1000;
    return [this.x0 + this.vx * t, this.y0 + this.vy * t - (G * t * t) / 2];
  }

  press(): void {}

  pointer(x: number, _y: number, ts: number): void {
    if (this.state !== 1 || ts < this.hideAt) return;
    const [fx, , u] = this.field;
    this.guess = (x - fx) / u;
    const e = Math.abs(this.guess - this.landX) / 1.6;
    this.errs.push(e);
    this.env.sound(e < 0.02 ? SND_CATCH : e < 0.06 ? SND_TAP_WEAK : SND_FALSE);
    this.round++;
    this.state = 2;
    this.at = ts + 1600;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.arm(now);
    if (this.state === 1 && now - this.startAt > 15000) {
      this.round++;
      this.errs.push(0.5);
      this.state = 2;
      this.at = now + 1200;
    }
    if (this.state === 2 && now >= this.at) {
      if (this.round >= scaled(LANDING_ROUNDS)) return true;
      this.state = 0;
      this.at = now + 400;
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'off by', this.errs.length ? pct(mean(this.errs.slice(-3))) : '–', 'throw', `${Math.min(this.round + 1, scaled(LANDING_ROUNDS))} / ${scaled(LANDING_ROUNDS)}`);
    const u = Math.min((a.right - a.left) / 1.6, (a.bottom - a.top - 40 * a.u) / 1.0);
    const fx = a.cx - 0.8 * u;
    const ground = a.bottom - 30 * a.u;
    this.field = [fx, ground, u];
    const X = (x: number) => fx + x * u;
    const Y = (y: number) => ground - y * u;
    ctx.fillStyle = COL_FAINT;
    ctx.fillRect(fx, ground, 1.6 * u, 2 * dpr);
    // The launch platform.
    ctx.fillStyle = '#2a2a30';
    ctx.fillRect(X(this.x0) - 10 * a.u, Y(this.y0), 20 * a.u, ground - Y(this.y0));
    if (this.state >= 1) {
      // The visible part of the flight leaves a faint trail.
      const tEnd = this.state === 2 ? 99 : Math.min((now - this.startAt) / 1000, (this.hideAt - this.startAt) / 1000);
      const tHide = (this.hideAt - this.startAt) / 1000;
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      const steps = 40;
      const upto = this.state === 2 ? (this.landX - this.x0) / this.vx : Math.min(tEnd, tHide);
      for (let k = 0; k <= steps; k++) {
        const t = (k / steps) * upto;
        const px = this.x0 + this.vx * t;
        const py = Math.max(0, this.y0 + this.vy * t - (G * t * t) / 2);
        if (k) ctx.lineTo(X(px), Y(py));
        else ctx.moveTo(X(px), Y(py));
      }
      ctx.stroke();
      if (this.state === 1 && now < this.hideAt) {
        const [px, py] = this.posAt(now);
        ctx.fillStyle = COL_LINE;
        ctx.beginPath();
        ctx.arc(X(px), Y(py), 7 * a.u, 0, TAU);
        ctx.fill();
      }
      if (this.state === 2) {
        ctx.fillStyle = COL_LINE;
        ctx.beginPath();
        ctx.arc(X(this.landX), ground - 7 * a.u, 7 * a.u, 0, TAU);
        ctx.fill();
        if (this.guess >= 0) {
          ctx.fillStyle = COL_ACCENT;
          ctx.fillRect(X(this.guess) - dpr, ground - 20 * a.u, 2 * dpr, 24 * a.u);
        }
      }
    }
    ctx.fillStyle = COL_MID;
    const msg = this.state === 1 && now >= this.hideAt ? 'click on the ground where it will land' : this.state === 2 ? `off by ${pct(this.errs[this.errs.length - 1]!)} of the field` : this.round === 0 ? 'watch the throw; it vanishes in the air' : '';
    v.text(msg, a.cx, a.top + 14 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.max(0, Math.round((0.2 - m) * 10000)) : 0,
      primary: { label: 'average miss', value: Math.round(m * 1000) / 10, unit: '% of the field', lower: true, decimals: 1 },
      lines: [
        { label: 'average miss', value: this.errs.length ? `${(m * 100).toFixed(1)}%` : '–' },
        { label: 'within 2%', value: this.errs.length ? pct(this.errs.filter((e) => e < 0.02).length / this.errs.length) : '–' },
      ],
      saved: this.errs.length >= 3,
    };
  }
}

// --- Pyramid ---------------------------------------------------------------------------

const PYRAMID_MS = 90000;

class Pyramid implements Mini {
  private env!: MiniEnv;
  private base: number[] = [];
  private top = 0;
  private typed = '';
  private t0 = 0;
  private at = 0;
  private started = false;
  private ok = 0;
  private bad = 0;
  private rts: number[] = [];
  private flash = 0;
  private reveal: number[][] = [];
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  private make(now: number): void {
    const n = this.ok < 4 ? 3 : this.ok < 10 ? 4 : 5;
    this.base = Array.from({ length: n }, () => rint(1, n >= 5 ? 9 : 12));
    let row = this.base;
    while (row.length > 1) row = row.slice(1).map((x, k) => x + row[k]!);
    this.top = row[0]!;
    this.typed = '';
    this.at = now;
  }

  private rows(base: number[]): number[][] {
    const out = [base];
    let row = base;
    while (row.length > 1) {
      row = row.slice(1).map((x, k) => x + row[k]!);
      out.push(row);
    }
    return out;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    if (!this.started) {
      if (code === 'Space' || code === 'Enter' || digitOf(code)) {
        this.started = true;
        this.t0 = ts;
        this.make(ts);
        return true;
      }
      return false;
    }
    const d = digitOf(code);
    if (d) {
      if (this.typed.length < 4) this.typed += d;
      return true;
    }
    if (code === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      return true;
    }
    if ((code === 'Enter' || code === 'NumpadEnter' || code === 'Space') && this.typed) {
      if (Number(this.typed) === this.top) {
        this.ok++;
        this.rts.push(ts - this.at);
        this.env.sound(SND_CATCH);
      } else {
        this.bad++;
        this.reveal = this.rows(this.base);
        this.flash = ts + 1800;
        this.env.sound(SND_FALSE);
      }
      this.make(ts);
      return true;
    }
    return false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(PYRAMID_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    // Show the last wrong pyramid worked out for a moment; otherwise the new one.
    const showing = now < this.flash ? this.reveal : this.started ? this.rows(this.base) : this.rows([2, 5, 3]);
    const n = showing[0]!.length;
    const bw = Math.min(64 * a.u, (a.right - a.left) / (n + 1));
    const bh = Math.min(46 * a.u, (a.bottom - a.top - 60 * a.u) / (n + 0.5));
    showing.forEach((row, r) => {
      row.forEach((val, k) => {
        const x = a.cx + (k - (row.length - 1) / 2) * bw - bw / 2;
        const y = a.bottom - 40 * a.u - (r + 1) * bh;
        const isTop = r === showing.length - 1;
        const known = r === 0 || now < this.flash;
        ctx.strokeStyle = isTop ? (now < this.flash ? COL_ACCENT : COL_LINE) : COL_DIM;
        ctx.lineWidth = (isTop ? 2.5 : 1.5) * dpr;
        ctx.strokeRect(x + 2 * dpr, y + 2 * dpr, bw - 4 * dpr, bh - 4 * dpr);
        ctx.fillStyle = r === 0 ? COL_LINE : COL_MID;
        const label = known ? String(val) : isTop ? (this.started ? this.typed || '?' : '?') : '';
        if (label) v.text(label, x + bw / 2, y + bh / 2 + 5 * dpr, v.fontHud, 'center');
      });
    });
    ctx.fillStyle = COL_MID;
    v.text(this.started ? (now < this.flash ? 'worked out: each block is the sum of the two under it' : 'type the top block, then Enter') : 'press Space to start: each block is the sum of the two beneath it', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.ok * 50 - this.bad * 30),
      primary: { label: 'pyramids solved', value: this.ok, unit: '' },
      lines: [
        { label: 'solved', value: String(this.ok) },
        { label: 'wrong', value: String(this.bad) },
        { label: 'typical time a pyramid', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.ok + this.bad >= 3,
    };
  }
}

export const BATCH73: MiniDef[] = [
  { id: 'landing', name: 'Landing', skill: 'judgement', blurb: 'A ball is thrown and vanishes at the top of its flight. Click where it lands.', how: 'A ball is thrown from a platform. It vanishes at the top of its arc (later, before the top). Click on the ground where it will come down. Its whole path is then drawn. Twelve throws; scored as a share of the field’s width.', input: 'pointer', make: () => new Landing() },
  { id: 'pyramid', name: 'Pyramid', skill: 'reasoning', blurb: 'Each block is the sum of the two beneath it. What goes at the top?', how: 'A pyramid of blocks: only the bottom row is filled in, and each block above is the sum of the two beneath it. Type the number for the top block and press Enter. Three blocks wide at first, then four, then five. Ninety seconds; a mistake shows the pyramid worked out.', input: 'type', make: () => new Pyramid() },
];
