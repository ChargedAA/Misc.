// Ninety-second batch.
//   Stake      - a known chance of winning an even-money bet: how much of your bank do you stake?
//   Forecast   - a noisy trend of twelve points: click where the next one most likely lands.
//   Spacing    - two dots on a line: click where the next one goes, at the same spacing.
//   Proportion - make the second rectangle the same shape as the first, at a different size.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALL, SND_FALSE, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, mean, pct, scaled, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Stake (bet sizing) ----------------------------------------------------------------

const STAKE_BETS = 20;
const STAKES = [0, 0.1, 0.25, 0.5];

class Stake implements Mini {
  private env!: MiniEnv;
  private bet = 0;
  private bank = 100;
  /** What a bettor staking the ideal share each time would have now, on the same spins. */
  private ideal = 100;
  private p = 0.6;
  private spin = 0;
  private won = false;
  private chosen = -1;
  private state = 0; // 0 choosing, 1 spinning, 2 result
  private at = 0;
  private boxes: Rect[] = [];
  private choices: number[] = [];
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm();
  }

  private arm(): void {
    this.p = rint(40, 80) / 100;
    this.chosen = -1;
    this.state = 0;
  }

  press(): void {}

  private pick(k: number, ts: number): void {
    if (this.state !== 0) return;
    this.chosen = k;
    this.choices.push(STAKES[k]!);
    this.won = Math.random() < this.p;
    this.spin = Math.random() * (this.won ? this.p : 1 - this.p) + (this.won ? 0 : this.p);
    const s = STAKES[k]! * this.bank;
    this.bank += this.won ? s : -s;
    // The best fixed share for an even-money bet is 2p - 1, or nothing when the odds are against you.
    const best = Math.max(0, 2 * this.p - 1);
    this.ideal *= this.won ? 1 + best : 1 - best;
    this.state = 1;
    this.at = ts + 1100;
  }

  typeKey(code: string, ts: number): boolean {
    const d = Number(digitOf(code));
    if (d >= 1 && d <= 4) {
      this.pick(d - 1, ts);
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    const k = this.boxes.findIndex((r) => inside(r, x, y));
    if (k >= 0) this.pick(k, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      this.env.sound(this.won ? SND_CATCH : SND_FALL);
      this.state = 2;
      this.at = now + 1000;
    } else if (this.state === 2 && now >= this.at) {
      this.bet++;
      if (this.bet >= scaled(STAKE_BETS) || this.bank < 1) return true;
      this.arm();
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'bank', `${Math.round(this.bank)}`, 'bet', `${Math.min(this.bet + 1, scaled(STAKE_BETS))} / ${scaled(STAKE_BETS)}`);
    // The wheel: white is a win, grey a loss.
    const R = Math.min(80 * a.u, (a.bottom - a.top) * 0.22);
    const cx = a.cx;
    const cy = a.top + R + 16 * a.u;
    ctx.fillStyle = COL_LINE;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + this.p * TAU);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3a3a41';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, -Math.PI / 2 + this.p * TAU, Math.PI * 1.5);
    ctx.closePath();
    ctx.fill();
    // The pointer spins to rest on the outcome.
    if (this.state >= 1) {
      const t = this.state === 1 ? Math.min(1, 1 - (this.at - now) / 1100) : 1;
      const ease = 1 - (1 - t) ** 3;
      const ang = -Math.PI / 2 + (this.spin + 2 * (1 - ease)) * TAU * ease + this.spin * TAU * (1 - ease);
      ctx.strokeStyle = COL_ACCENT;
      ctx.lineWidth = 3 * dpr;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * R * 1.1, cy + Math.sin(ang) * R * 1.1);
      ctx.stroke();
    }
    ctx.fillStyle = COL_MID;
    v.text(`${Math.round(this.p * 100)}% chance to win; a win pays what you stake`, cx, cy + R + 22 * a.u, v.fontTiny, 'center');
    const bw = Math.min(100 * a.u, (a.right - a.left) / 4 - 12 * a.u);
    const by = cy + R + 40 * a.u;
    this.boxes = STAKES.map((_, k) => [a.cx + (k - 2) * (bw + 12 * a.u) + 6 * a.u, by, bw, 46 * a.u] as Rect);
    this.boxes.forEach(([x, y, w, h], k) => {
      ctx.strokeStyle = k === this.chosen ? COL_LINE : COL_DIM;
      ctx.lineWidth = (k === this.chosen ? 2.5 : 1.5) * dpr;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = COL_LINE;
      v.text(k ? `stake ${Math.round(STAKES[k]! * 100)}%` : 'pass', x + w / 2, y + h / 2 + 5 * dpr, v.fontTiny, 'center');
      ctx.fillStyle = COL_DIM;
      v.text(String(k + 1), x + 6 * dpr, y + 12 * dpr, v.fontTiny, 'left');
    });
    ctx.fillStyle = this.state === 2 ? (this.won ? COL_LINE : COL_ACCENT) : COL_MID;
    v.text(this.state === 2 ? (this.chosen === 0 ? (this.won ? 'it would have won' : 'it lost: good pass') : this.won ? 'won' : 'lost') : 'how much of your bank do you stake? (1 to 4, or click)', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, Math.round(this.bank * 5)),
      primary: { label: 'final bank', value: Math.round(this.bank), unit: 'from 100' },
      lines: [
        { label: 'final bank', value: String(Math.round(this.bank)) },
        { label: 'ideal stakes, same spins', value: String(Math.round(this.ideal)) },
        { label: 'typical stake', value: this.choices.length ? pct(mean(this.choices)) : '–' },
      ],
      saved: this.bet >= 5,
    };
  }
}

// --- Forecast --------------------------------------------------------------------------

const FORECAST_ROUNDS = 12;

class Forecast implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private pts: number[] = [];
  /** The trend behind the points: level, slope and a slow wave. */
  private trend = (_k: number) => 0.5;
  private guess = -1;
  private state = 0;
  private at = 0;
  private errs: number[] = [];
  private plot: [number, number, number, number] = [0, 0, 1, 1];
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm();
  }

  private arm(): void {
    const level = rnd(0.3, 0.7);
    const slope = rnd(-0.03, 0.03);
    const amp = this.round >= 6 ? rnd(0.05, 0.12) : 0;
    const per = rnd(5, 9);
    const ph = rnd(0, TAU);
    this.trend = (k: number) => level + slope * (k - 6) + amp * Math.sin((k / per) * TAU + ph);
    const noise = rnd(0.02, 0.06);
    this.pts = Array.from({ length: 12 }, (_, k) => Math.min(0.95, Math.max(0.05, this.trend(k) + (Math.random() - 0.5) * 2 * noise)));
    this.guess = -1;
    this.state = 0;
  }

  press(): void {}

  pointer(_x: number, y: number, ts: number): void {
    if (this.state !== 0) return;
    const [, py, , ph] = this.plot;
    this.guess = Math.max(0, Math.min(1, 1 - (y - py) / ph));
    const e = Math.abs(this.guess - this.trend(12));
    this.errs.push(e);
    this.env.sound(e < 0.04 ? SND_CATCH : SND_TAP_WEAK);
    this.round++;
    this.state = 1;
    this.at = ts + 1500;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.round >= scaled(FORECAST_ROUNDS)) return true;
      this.arm();
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'off by', this.errs.length ? pct(mean(this.errs.slice(-3))) : '–', 'chart', `${Math.min(this.round + 1, scaled(FORECAST_ROUNDS))} / ${scaled(FORECAST_ROUNDS)}`);
    const pw = Math.min(a.right - a.left - 40 * a.u, 680 * a.u);
    const ph = a.bottom - a.top - 60 * a.u;
    const px = a.cx - pw / 2;
    const py = a.top + 10 * a.u;
    this.plot = [px, py, pw, ph];
    const X = (k: number) => px + (k / 13) * pw;
    const Y = (val: number) => py + (1 - val) * ph;
    ctx.fillStyle = COL_FAINT;
    for (let g = 0; g <= 4; g++) ctx.fillRect(px, py + (g / 4) * ph, pw, dpr);
    // The column for the next point.
    ctx.fillStyle = '#16161a';
    ctx.fillRect(X(12) - 14 * a.u, py, 28 * a.u, ph);
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    this.pts.forEach((val, k) => (k ? ctx.lineTo(X(k), Y(val)) : ctx.moveTo(X(k), Y(val))));
    ctx.stroke();
    ctx.fillStyle = COL_LINE;
    this.pts.forEach((val, k) => {
      ctx.beginPath();
      ctx.arc(X(k), Y(val), 4 * dpr, 0, TAU);
      ctx.fill();
    });
    if (this.state === 1) {
      // The trend behind the points, and where it was heading.
      ctx.strokeStyle = COL_MID;
      ctx.setLineDash?.([4 * dpr, 4 * dpr]);
      ctx.beginPath();
      for (let k = 0; k <= 12; k += 0.25) (k ? ctx.lineTo(X(k), Y(this.trend(k))) : ctx.moveTo(X(k), Y(this.trend(k))));
      ctx.stroke();
      ctx.setLineDash?.([]);
      ctx.fillStyle = COL_LINE;
      ctx.beginPath();
      ctx.arc(X(12), Y(this.trend(12)), 6 * dpr, 0, TAU);
      ctx.fill();
      ctx.fillStyle = COL_ACCENT;
      ctx.fillRect(X(12) - 12 * a.u, Y(this.guess) - dpr, 24 * a.u, 3 * dpr);
    }
    ctx.fillStyle = COL_MID;
    v.text(this.state === 1 ? `off by ${pct(this.errs[this.errs.length - 1]!)} of the chart's height; the dashed line is the trend` : 'click in the dark column where the next point will most likely land', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.max(0, Math.round((0.2 - m) * 10000)) : 0,
      primary: { label: 'average miss', value: Math.round(m * 1000) / 10, unit: '% of the height', lower: true, decimals: 1 },
      lines: [
        { label: 'average miss', value: this.errs.length ? `${(m * 100).toFixed(1)}%` : '–' },
        { label: 'within 4%', value: this.errs.length ? pct(this.errs.filter((e) => e < 0.04).length / this.errs.length) : '–' },
      ],
      saved: this.errs.length >= 3,
    };
  }
}

// --- Spacing ---------------------------------------------------------------------------

const SPACING_ROUNDS = 15;

class Spacing implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private a: [number, number] = [0.3, 0.5];
  private b: [number, number] = [0.45, 0.5];
  private guess: [number, number] = [0, 0];
  private state = 0;
  private at = 0;
  private errs: number[] = [];
  private field: Rect = [0, 0, 1, 1];
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm();
  }

  private arm(): void {
    for (let tries = 0; tries < 100; tries++) {
      const ang = rnd(0, TAU);
      const gap = rnd(0.12, 0.25);
      const a: [number, number] = [rnd(0.15, 0.85), rnd(0.15, 0.85)];
      const b: [number, number] = [a[0] + Math.cos(ang) * gap, a[1] + Math.sin(ang) * gap];
      const c = [b[0] + Math.cos(ang) * gap, b[1] + Math.sin(ang) * gap];
      if (c.every((z) => z > 0.08 && z < 0.92) && b.every((z) => z > 0.08 && z < 0.92)) {
        this.a = a;
        this.b = b;
        break;
      }
    }
    this.state = 0;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 0) return;
    const [fx, fy, fw, fh] = this.field;
    this.guess = [(x - fx) / fw, (y - fy) / fh];
    const c = [2 * this.b[0] - this.a[0], 2 * this.b[1] - this.a[1]];
    const gap = Math.hypot(this.b[0] - this.a[0], this.b[1] - this.a[1]);
    const e = Math.hypot(this.guess[0] - c[0]!, this.guess[1] - c[1]!) / gap;
    this.errs.push(e);
    this.env.sound(e < 0.05 ? SND_CATCH : e < 0.12 ? SND_TAP_WEAK : SND_FALSE);
    this.round++;
    this.state = 1;
    this.at = ts + 1300;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.round >= scaled(SPACING_ROUNDS)) return true;
      this.arm();
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const ar = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'off by', this.errs.length ? pct(mean(this.errs.slice(-3))) : '–', 'row', `${Math.min(this.round + 1, scaled(SPACING_ROUNDS))} / ${scaled(SPACING_ROUNDS)}`);
    const S = Math.min(ar.right - ar.left, ar.bottom - ar.top - 30 * ar.u);
    const fx = ar.cx - S / 2;
    const fy = ar.top + 4 * ar.u;
    this.field = [fx, fy, S, S];
    const P = (p: [number, number] | number[]) => [fx + p[0]! * S, fy + p[1]! * S] as const;
    const [ax, ay] = P(this.a);
    const [bx, by] = P(this.b);
    // The line they sit on, running on past the second dot.
    ctx.strokeStyle = COL_FAINT;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(ax - (bx - ax) * 0.5, ay - (by - ay) * 0.5);
    ctx.lineTo(ax + (bx - ax) * 3, ay + (by - ay) * 3);
    ctx.stroke();
    ctx.fillStyle = COL_LINE;
    for (const [x, y] of [[ax, ay], [bx, by]]) {
      ctx.beginPath();
      ctx.arc(x!, y!, 7 * dpr, 0, TAU);
      ctx.fill();
    }
    if (this.state === 1) {
      const [cx, cy] = P([2 * this.b[0] - this.a[0], 2 * this.b[1] - this.a[1]]);
      ctx.strokeStyle = COL_LINE;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, 9 * dpr, 0, TAU);
      ctx.stroke();
      const [gx, gy] = P(this.guess);
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.arc(gx, gy, 5 * dpr, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = COL_MID;
    v.text(this.state === 1 ? `off by ${pct(this.errs[this.errs.length - 1]!)} of a gap` : 'click where the third dot goes: on the line, at the same spacing', ar.cx, ar.bottom - 4 * ar.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.max(0, Math.round((0.4 - m) * 5000)) : 0,
      primary: { label: 'average miss', value: Math.round(m * 100), unit: '% of a gap', lower: true },
      lines: [
        { label: 'average miss', value: this.errs.length ? pct(m) : '–' },
        { label: 'within 5%', value: this.errs.length ? pct(this.errs.filter((e) => e < 0.05).length / this.errs.length) : '–' },
      ],
      saved: this.errs.length >= 3,
    };
  }
}

// --- Proportion ------------------------------------------------------------------------

const PROPORTION_ROUNDS = 12;

class Proportion implements Mini {
  private env!: MiniEnv;
  private round = 0;
  /** The reference's width and height, and the second rectangle's width (shares of the space). */
  private rw = 0.3;
  private rh = 0.2;
  private w2 = 0.2;
  private h2 = -1;
  private hover = -1;
  private state = 0;
  private at = 0;
  private errs: number[] = [];
  private base = 0;
  private unit = 1;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm();
  }

  private arm(): void {
    const ratio = rnd(0.4, 2.2);
    this.rw = rnd(0.15, 0.3);
    this.rh = Math.min(0.75, this.rw * ratio);
    this.rw = this.rh / ratio;
    this.w2 = this.rw * rnd(0.55, 1.6);
    if (this.w2 * ratio > 0.8) this.w2 = 0.8 / ratio;
    this.h2 = -1;
    this.state = 0;
  }

  press(): void {}

  pointerMove(_x: number, y: number): void {
    this.hover = Math.max(0, (this.base - y) / this.unit);
  }

  pointer(_x: number, y: number, ts: number): void {
    if (this.state !== 0) return;
    this.h2 = Math.max(0.01, (this.base - y) / this.unit);
    const want = (this.w2 * this.rh) / this.rw;
    const e = Math.abs(this.h2 - want) / want;
    this.errs.push(e);
    this.env.sound(e < 0.04 ? SND_CATCH : SND_TAP_WEAK);
    this.round++;
    this.state = 1;
    this.at = ts + 1500;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.round >= scaled(PROPORTION_ROUNDS)) return true;
      this.arm();
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'off by', this.errs.length ? pct(mean(this.errs.slice(-3))) : '–', 'shape', `${Math.min(this.round + 1, scaled(PROPORTION_ROUNDS))} / ${scaled(PROPORTION_ROUNDS)}`);
    const U = Math.min((a.right - a.left) / 2, a.bottom - a.top - 50 * a.u);
    this.unit = U;
    this.base = a.bottom - 34 * a.u;
    const lx = a.cx - U * 0.5;
    const rx = a.cx + U * 0.5;
    ctx.fillStyle = '#a8a8b0';
    ctx.fillRect(lx - (this.rw * U) / 2, this.base - this.rh * U, this.rw * U, this.rh * U);
    // The second rectangle's width is fixed; its height follows the pointer until you click.
    const h = this.state === 1 ? this.h2 : Math.max(0, this.hover);
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 2 * dpr;
    ctx.strokeRect(rx - (this.w2 * U) / 2, this.base - h * U, this.w2 * U, h * U);
    if (this.state === 1) {
      const want = (this.w2 * this.rh) / this.rw;
      ctx.strokeStyle = COL_ACCENT;
      ctx.setLineDash?.([4 * dpr, 4 * dpr]);
      ctx.strokeRect(rx - (this.w2 * U) / 2, this.base - want * U, this.w2 * U, want * U);
      ctx.setLineDash?.([]);
    }
    ctx.fillStyle = COL_FAINT;
    ctx.fillRect(a.left, this.base, a.right - a.left, dpr);
    ctx.fillStyle = COL_MID;
    v.text(this.state === 1 ? `off by ${pct(this.errs[this.errs.length - 1]!)}; the dashed outline is the true shape` : 'click to set the right rectangle’s height so it is the same shape as the grey one', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.max(0, Math.round((0.3 - m) * 6000)) : 0,
      primary: { label: 'average miss', value: Math.round(m * 100), unit: '%', lower: true },
      lines: [
        { label: 'average miss', value: this.errs.length ? pct(m) : '–' },
        { label: 'within 4%', value: this.errs.length ? pct(this.errs.filter((e) => e < 0.04).length / this.errs.length) : '–' },
      ],
      saved: this.errs.length >= 3,
    };
  }
}

export const BATCH92: MiniDef[] = [
  { id: 'stake', name: 'Stake', skill: 'judgement', blurb: 'A known chance of winning an even-money bet. How much of your bank do you stake?', how: 'Each bet shows its chance of winning, from 40% to 80%; a win pays exactly what you staked. Pass, or stake 10%, 25% or 50% of your bank. Stake too little on good odds and you grow slowly; too much and a loss hurts more than a win helps. Twenty bets, starting from 100; the results show what the ideal stakes made on the same spins.', input: 'pointer', make: () => new Stake() },
  { id: 'forecast', name: 'Forecast', skill: 'judgement', blurb: 'A noisy trend of twelve points. Click where the next one most likely lands.', how: 'Twelve points follow a trend with noise on top. Click in the dark column where the thirteenth will most likely fall: follow the trend, not the last wobble. The hidden trend is then drawn. From the seventh chart, the trends curve. Twelve charts.', input: 'pointer', make: () => new Forecast() },
  { id: 'spacing', name: 'Spacing', skill: 'judgement', blurb: 'Two dots on a line. Click where the next one goes, at the same spacing.', how: 'Two dots sit on a faint line at some angle. Click where the third dot belongs: further along the line, the same distance on as the first two are apart. Scored as a share of the gap. Fifteen rows.', input: 'pointer', make: () => new Spacing() },
  { id: 'proportion', name: 'Proportion', skill: 'judgement', blurb: 'Make the second rectangle the same shape as the first, at a different size.', how: 'A grey rectangle, and beside it an outline of a different width whose height follows the mouse. Click when it is the same shape as the grey one: as tall for its width. The true shape is then outlined. Twelve shapes; scored as a percentage off.', input: 'pointer', make: () => new Proportion() },
];
