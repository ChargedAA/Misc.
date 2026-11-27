// Thirty-seventh batch: knowing what you know, an artist's eye, and swing.
//   Sure    - which line is longer, and how sure are you? Scored on calibration.
//   Range   - how many dots? Give a range you are 80% sure of.
//   Figure  - place a feature on a figure by the classic drawing proportions.
//   Shuffle - tap the swung offbeat, and keep the swing when the hi-hat drops out.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT, SND_BEAT_UP, SND_CATCH, SND_FALSE, SND_TAP_L, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { Stair, arena, footer, header, mean, median, pct, scaled, shown, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

// --- Sure (calibration) ----------------------------------------------------------------

const SURE_TRIALS = 40;
/** What each confidence rating claims: 1 guessing, 2 fairly sure, 3 certain. */
const CLAIM = [0, 0.5, 0.75, 0.95];

class Sure implements Mini {
  private env!: MiniEnv;
  private i = 0;
  /** Length difference (%), staircased to keep you near 75% right. */
  private readonly stair = new Stair(14, 1.2, 1, 30, 3);
  private lenA = 0;
  private lenB = 0;
  private state = 0; // 0 gap, 1 showing, 2 which, 3 how sure, 4 feedback
  private at = 0;
  private next = 0;
  private choice = 0;
  private correct = false;
  /** Per rating: [right, total]. */
  private byRating: [number, number][] = [[0, 0], [0, 0], [0, 0], [0, 0]];
  private brier: number[] = [];
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 700;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if ((this.state === 1 || this.state === 2) && s !== 0) {
      this.choice = s < 0 ? 0 : 1;
      this.correct = (this.choice === 0) === this.lenA > this.lenB;
      this.state = 3;
      this.env.sound(s < 0 ? SND_TAP_L : SND_TAP_WEAK);
      void ts;
    }
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  typeKey(code: string, ts: number): boolean {
    const d = code.startsWith('Digit') ? Number(code.slice(5)) : code.startsWith('Numpad') ? Number(code.slice(6)) : NaN;
    if (!(d >= 1 && d <= 3)) return false;
    if (this.state !== 3) return true;
    const r = this.byRating[d]!;
    r[1]++;
    if (this.correct) r[0]++;
    this.brier.push((CLAIM[d]! - (this.correct ? 1 : 0)) ** 2);
    this.stair.update(this.correct, -1);
    this.env.sound(this.correct ? SND_CATCH : SND_FALSE);
    this.i++;
    this.state = 4;
    this.next = ts + 700;
    return true;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if ((this.state === 0 || this.state === 4) && now >= this.next) {
      if (this.i >= scaled(SURE_TRIALS)) return true;
      const base = rnd(120, 180);
      const d = this.stair.level / 100;
      const longer = base * (1 + d);
      [this.lenA, this.lenB] = Math.random() < 0.5 ? [longer, base] : [base, longer];
      this.state = 1;
      this.at = now;
    }
    if (this.state === 1 && now - this.at > 700) this.state = 2;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'right', this.i ? pct(this.byRating.reduce((s, r) => s + r[0], 0) / this.i) : '–', 'pair', `${Math.min(this.i + 1, scaled(SURE_TRIALS))} / ${scaled(SURE_TRIALS)}`);
    if (this.state === 1) {
      ctx.fillStyle = COL_LINE;
      ctx.fillRect(a.cx - 30 * a.u - this.lenA * a.u, a.cy - 20 * a.u, this.lenA * a.u, 3 * dpr);
      ctx.fillRect(a.cx + 30 * a.u, a.cy + 20 * a.u, this.lenB * a.u, 3 * dpr);
    }
    ctx.fillStyle = COL_MID;
    const msg =
      this.state <= 2
        ? 'which line was longer: left or right?'
        : this.state === 3
          ? 'how sure?   1 guessing   ·   2 fairly sure   ·   3 certain'
          : this.correct
            ? 'right'
            : 'wrong';
    v.text(msg, a.cx, a.cy + 80 * a.u, this.state === 3 ? v.fontHud : v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const rows = [1, 2, 3].map((d) => ({ d, n: this.byRating[d]![1], r: this.byRating[d]![1] ? this.byRating[d]![0] / this.byRating[d]![1] : NaN }));
    // Calibration gap: how far each rating's hit rate is from what it claims, weighted by use.
    const used = rows.filter((x) => x.n > 0);
    const gap = used.length ? used.reduce((s, x) => s + Math.abs(x.r - CLAIM[x.d]!) * x.n, 0) / used.reduce((s, x) => s + x.n, 0) : NaN;
    return {
      score: Number.isFinite(gap) ? Math.round(Math.max(0, 0.5 - gap) * 2000) : 0,
      primary: { label: 'calibration gap', value: Number.isFinite(gap) ? Math.round(gap * 100) : 0, unit: 'points', lower: true, zeroOk: true },
      lines: rows.map((x) => ({ label: `said "${['', 'guessing', 'fairly sure', 'certain'][x.d]}" (${Math.round(CLAIM[x.d]! * 100)}%)`, value: x.n ? `right ${pct(x.r)} of ${x.n}` : '–' })).concat([{ label: 'Brier score (0 is perfect)', value: this.brier.length ? mean(this.brier).toFixed(3) : '–' }]),
      saved: this.i >= 10,
    };
  }
}

// --- Range (80% intervals) -------------------------------------------------------------

const RANGE_ROUNDS = 15;

class Range implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private dots: [number, number][] = [];
  private truth = 0;
  private max = 200;
  private state = 0; // 0 gap, 1 flash, 2 low, 3 high, 4 feedback
  private at = 0;
  private next = 0;
  private lo = -1;
  private hi = -1;
  private hover = -1;
  private hits = 0;
  private widths: number[] = [];
  private line: [number, number, number] = [0, 0, 0];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 600;
  }

  press(): void {}

  private valueAt(x: number): number {
    const [x0, x1] = this.line;
    return Math.round(Math.max(0, Math.min(1, (x - x0) / (x1 - x0))) * this.max);
  }

  pointerMove(x: number): void {
    if (this.state === 2 || this.state === 3) this.hover = this.valueAt(x);
  }

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 2 && this.state !== 3) return;
    if (Math.abs(y - this.line[2]) > 80) return;
    const val = this.valueAt(x);
    if (this.state === 2) {
      this.lo = val;
      this.state = 3;
      this.env.sound(SND_TAP_L);
      return;
    }
    this.hi = Math.max(val, this.lo);
    this.lo = Math.min(val, this.lo);
    const hit = this.truth >= this.lo && this.truth <= this.hi;
    if (hit) this.hits++;
    this.widths.push((this.hi - this.lo) / Math.max(1, this.truth));
    this.env.sound(hit ? SND_CATCH : SND_FALSE);
    this.round++;
    this.state = 4;
    this.next = ts + 1500;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const a = arena(v, touch);
    if ((this.state === 0 || this.state === 4) && now >= this.next) {
      if (this.round >= scaled(RANGE_ROUNDS)) return true;
      this.truth = rint(15, 160);
      this.max = 200;
      this.dots = [];
      while (this.dots.length < this.truth) this.dots.push([rnd(0.04, 0.96), rnd(0.04, 0.96)]);
      this.lo = this.hi = -1;
      this.state = 1;
      this.at = now;
    }
    if (this.state === 1 && now - this.at > 900) this.state = 2;
    v.clear();
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'truth inside your range', this.round ? `${this.hits} of ${this.round}  (aim: 80%)` : '–', 'cloud', `${Math.min(this.round + 1, scaled(RANGE_ROUNDS))} / ${scaled(RANGE_ROUNDS)}`);
    const bw = Math.min(a.right - a.left, 420 * a.u);
    const bh = Math.min(a.bottom - a.top - 110 * a.u, 260 * a.u);
    const bx = a.cx - bw / 2;
    const by = a.top + 6 * a.u;
    ctx.strokeStyle = COL_FAINT;
    ctx.lineWidth = dpr;
    ctx.strokeRect(bx, by, bw, bh);
    if (this.state === 1 || this.state === 4) {
      ctx.fillStyle = this.state === 1 ? COL_LINE : COL_DIM;
      for (const [px, py] of this.dots) {
        ctx.beginPath();
        ctx.arc(bx + px * bw, by + py * bh, 3 * a.u, 0, TAU);
        ctx.fill();
      }
    }
    // The number line, 0 to 200.
    const ly = by + bh + 60 * a.u;
    const x0 = a.cx - bw / 2;
    const x1 = a.cx + bw / 2;
    this.line = [x0, x1, ly];
    ctx.fillStyle = COL_MID;
    ctx.fillRect(x0, ly, x1 - x0, 2 * dpr);
    for (let t = 0; t <= this.max; t += 25) {
      const x = x0 + (t / this.max) * (x1 - x0);
      ctx.fillRect(x - dpr / 2, ly - 5 * dpr, dpr, 10 * dpr);
      v.text(String(t), x, ly + 22 * dpr, v.fontTiny, 'center');
    }
    const X = (val: number) => x0 + (val / this.max) * (x1 - x0);
    if (this.lo >= 0) {
      const hi = this.state === 3 ? Math.max(this.lo, this.hover) : this.hi;
      const lo = this.state === 3 ? Math.min(this.lo, this.hover) : this.lo;
      ctx.fillStyle = 'rgba(236,236,238,0.18)';
      ctx.fillRect(X(lo), ly - 12 * dpr, X(hi) - X(lo), 24 * dpr);
      ctx.fillStyle = COL_LINE;
      ctx.fillRect(X(lo) - dpr, ly - 14 * dpr, 2 * dpr, 28 * dpr);
      if (this.state === 4) ctx.fillRect(X(hi) - dpr, ly - 14 * dpr, 2 * dpr, 28 * dpr);
    } else if ((this.state === 2) && this.hover >= 0) {
      ctx.fillStyle = COL_DIM;
      ctx.fillRect(X(this.hover) - dpr, ly - 14 * dpr, 2 * dpr, 28 * dpr);
    }
    if (this.state === 4) {
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.arc(X(this.truth), ly, 6 * dpr, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = COL_MID;
    const msg = this.state === 1 ? 'how many dots?' : this.state === 2 ? 'click the low end of a range you are 80% sure holds the count' : this.state === 3 ? 'now the high end' : this.state === 4 ? `there were ${this.truth}` : '';
    v.text(msg, a.cx, ly - 34 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const rate = this.round ? this.hits / this.round : 0;
    const w = this.widths.length ? median(this.widths) : 0;
    // Hitting 80% matters most; among ranges that do, narrower is better.
    const miss = Math.abs(rate - 0.8);
    return {
      score: this.round ? Math.round(Math.max(0, 1 - miss * 2.5) * 800 + Math.max(0, 1 - w) * 200) : 0,
      primary: { label: 'truth inside your 80% ranges', value: Math.round(rate * 100), unit: '%' },
      lines: [
        { label: 'inside the range', value: `${this.hits} of ${this.round}  (80% is the aim)` },
        { label: 'typical range width', value: this.widths.length ? `${Math.round(w * 100)}% of the true count` : '–' },
        { label: 'verdict', value: !this.round ? '–' : rate < 0.65 ? 'overconfident: make the ranges wider' : rate > 0.92 ? 'underconfident: ranges can be narrower' : 'well calibrated' },
      ],
      saved: this.round >= 5,
    };
  }
}

// --- Figure (drawing proportions) ------------------------------------------------------

interface Task {
  q: string;
  /** Where the answer lies, from the top of the figure to its bottom (0..1). */
  at: number;
  shape: 'head' | 'body';
}

const FIGURE_TASKS: Task[] = [
  { q: 'click where the eyes go', at: 0.5, shape: 'head' },
  { q: 'click where the bottom of the nose goes', at: 0.7, shape: 'head' },
  { q: 'click where the mouth goes', at: 0.8, shape: 'head' },
  { q: 'click where the eyebrows go', at: 0.4, shape: 'head' },
  { q: 'click where the hairline goes', at: 0.13, shape: 'head' },
  { q: 'click where the hips go (the figure is 8 heads tall)', at: 0.5, shape: 'body' },
  { q: 'click where the knees go', at: 0.75, shape: 'body' },
  { q: 'click where the nipples go', at: 0.25, shape: 'body' },
  { q: 'click where the navel goes', at: 0.375, shape: 'body' },
  { q: 'click where the chin goes', at: 0.125, shape: 'body' },
];

class Figure implements Mini {
  private env!: MiniEnv;
  private order: Task[] = [];
  private i = 0;
  private state = 0;
  private next = 0;
  private picked = -1;
  private errs: number[] = [];
  private signed: number[] = [];
  private box: [number, number, number, number] = [0, 0, 0, 0];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.order = [...FIGURE_TASKS].sort(() => Math.random() - 0.5);
    this.next = now + 400;
  }

  press(): void {}

  pointer(_x: number, y: number, ts: number): void {
    if (this.state !== 1) return;
    const [, top, , h] = this.box;
    const f = (y - top) / h;
    const t = this.order[this.i % this.order.length]!;
    this.picked = f;
    const e = (f - t.at) * 100;
    this.errs.push(Math.abs(e));
    this.signed.push(e);
    this.env.sound(Math.abs(e) < 3 ? SND_CATCH : SND_TAP_WEAK);
    this.i++;
    this.state = 2;
    this.next = ts + 1500;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state !== 1 && now >= this.next) {
      if (this.i >= scaled(FIGURE_TASKS.length)) return true;
      this.state = 1;
      this.picked = -1;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const t = this.order[(this.state === 2 ? this.i - 1 : this.i) % this.order.length]!;
    header(v, touch, 'off by', this.errs.length ? `${mean(this.errs.slice(-3)).toFixed(1)}%` : '–', 'task', `${Math.min(this.i + (this.state === 2 ? 0 : 1), scaled(FIGURE_TASKS.length))} / ${scaled(FIGURE_TASKS.length)}`);
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 2 * dpr;
    let top = 0;
    let h = 0;
    if (t.shape === 'head') {
      // A head from the front: an egg, wider at the top. No features, just the outline.
      h = Math.min(a.bottom - a.top - 50 * a.u, 300 * a.u);
      const w = h * 0.72;
      top = a.top + 10 * a.u;
      const cx = a.cx;
      ctx.beginPath();
      ctx.moveTo(cx, top);
      ctx.bezierCurveTo(cx + w * 0.62, top, cx + w * 0.55, top + h * 0.72, cx, top + h);
      ctx.bezierCurveTo(cx - w * 0.55, top + h * 0.72, cx - w * 0.62, top, cx, top);
      ctx.stroke();
      this.box = [cx - w / 2, top, w, h];
    } else {
      // A standing figure, eight heads tall, in simple blocks.
      h = a.bottom - a.top - 40 * a.u;
      top = a.top + 8 * a.u;
      const H = h / 8;
      const cx = a.cx;
      ctx.beginPath();
      ctx.ellipse(cx, top + H / 2, H * 0.38, H / 2, 0, 0, TAU);
      ctx.moveTo(cx - H * 0.15, top + H);
      ctx.lineTo(cx - H * 0.15, top + H * 1.2);
      ctx.moveTo(cx + H * 0.15, top + H);
      ctx.lineTo(cx + H * 0.15, top + H * 1.2);
      ctx.moveTo(cx - H * 0.95, top + H * 1.3);
      ctx.lineTo(cx + H * 0.95, top + H * 1.3);
      ctx.lineTo(cx + H * 0.7, top + H * 4);
      ctx.lineTo(cx + H * 0.55, top + h);
      ctx.moveTo(cx - H * 0.95, top + H * 1.3);
      ctx.lineTo(cx - H * 0.7, top + H * 4);
      ctx.lineTo(cx - H * 0.55, top + h);
      ctx.moveTo(cx + H * 0.95, top + H * 1.3);
      ctx.lineTo(cx + H * 1.15, top + H * 4.3);
      ctx.moveTo(cx - H * 0.95, top + H * 1.3);
      ctx.lineTo(cx - H * 1.15, top + H * 4.3);
      ctx.moveTo(cx - H * 0.55, top + h);
      ctx.lineTo(cx + H * 0.55, top + h);
      ctx.stroke();
      this.box = [cx - H, top, 2 * H, h];
    }
    if (this.state === 2) {
      ctx.fillStyle = COL_LINE;
      ctx.fillRect(this.box[0] - 30 * a.u, top + t.at * h - dpr, this.box[2] + 60 * a.u, 2 * dpr);
      ctx.fillStyle = COL_ACCENT;
      ctx.fillRect(this.box[0] - 30 * a.u, top + this.picked * h - dpr, this.box[2] + 60 * a.u, 2 * dpr);
    }
    ctx.fillStyle = COL_MID;
    v.text(this.state === 2 ? `${Math.abs(this.signed[this.signed.length - 1]!).toFixed(1)}% ${this.signed[this.signed.length - 1]! > 0 ? 'too low' : 'too high'}  ·  white is the classic proportion` : t.q, a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    const b = mean(this.signed);
    return {
      score: this.errs.length ? Math.round(Math.max(0, 20 - m) * 50) : 0,
      primary: { label: 'average miss', value: m, unit: '%', lower: true, decimals: 1 },
      lines: [
        { label: 'average miss (share of the height)', value: this.errs.length ? `${m.toFixed(1)}%` : '–' },
        { label: 'tendency', value: this.signed.length >= 3 ? `${Math.abs(b).toFixed(1)}% ${b > 0 ? 'too low' : 'too high'}` : '–' },
      ],
      saved: this.errs.length >= 3,
    };
  }
}

// --- Shuffle (swing) -------------------------------------------------------------------

const SHUFFLE_ROUNDS = 8;

class Shuffle implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private bpm = 100;
  private swing = 0.66;
  private t0 = 0;
  private exact = false;
  private state = 0; // 0 playing, 1 feedback
  private at = 0;
  private taps: number[] = [];
  private fired = 0;
  private errs: number[] = [];
  private played: number[] = [];
  private lastRatio = 0;
  private held = 0;
  private flash = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.exact = !!env.soundAt && !env.muted;
    this.arm(now + 900, now);
  }

  private beat(): number {
    return 60000 / this.bpm;
  }

  private arm(at: number, now: number): void {
    // From nearly straight to hard swing, and a little faster each round.
    this.swing = [0.58, 0.67, 0.62, 0.72, 0.55, 0.69, 0.6, 0.75][this.round % 8]!;
    this.bpm = 92 + this.round * 6;
    this.t0 = at;
    this.taps = [];
    this.fired = 0;
    this.state = 0;
    if (this.exact) {
      const b = this.beat();
      for (let k = 0; k < 16; k++) {
        this.env.soundAt!(k % 4 === 0 ? SND_BEAT_UP : SND_BEAT, at - now + k * b);
        // The swung hi-hat only for the first two bars.
        if (k < 8) this.env.soundAt!(SND_TAP_WEAK, at - now + (k + this.swing) * b);
      }
    }
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state !== 0) return;
    const t = ts - this.t0 - (this.exact ? (this.env.latency ?? 0) : 0);
    this.taps.push(t);
    this.flash = ts + 80;
    this.env.sound(SND_TAP_L);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.press(0, ts);
    this.release(0);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const b = this.beat();
    if (this.state === 0) {
      const t = now - this.t0;
      if (!this.exact) {
        while (this.fired < 32) {
          const k = this.fired >> 1;
          const off = this.fired & 1 ? this.swing : 0;
          if (k * b + off * b > t) break;
          if (!(this.fired & 1)) this.env.sound(k % 4 === 0 ? SND_BEAT_UP : SND_BEAT);
          else if (k < 8) this.env.sound(SND_TAP_WEAK);
          this.fired++;
        }
      }
      if (t > 16 * b + 200) {
        // Only the last two bars, with no hi-hat, count: where in the beat did your taps fall?
        const own = this.taps.filter((x) => x > 8 * b - b * 0.3).map((x) => x / b - Math.floor(x / b + 0.15));
        const near = own.filter((p) => p > 0.35 && p < 0.92);
        const ratio = near.length >= 3 ? median(near) : NaN;
        const err = Number.isFinite(ratio) ? Math.abs(ratio - this.swing) * 100 : 30;
        this.errs.push(err);
        this.played.push(Number.isFinite(ratio) ? ratio : 0);
        this.lastRatio = ratio;
        this.env.sound(err < 4 ? SND_CATCH : SND_TAP_WEAK);
        this.round++;
        this.state = 1;
        this.at = now + 2200;
      }
    } else if (now >= this.at) {
      if (this.round >= scaled(SHUFFLE_ROUNDS)) return true;
      this.arm(now + 600, now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'off by', this.errs.length ? `${mean(this.errs.slice(-3)).toFixed(1)} points` : '–', 'groove', `${Math.min(this.round + 1, scaled(SHUFFLE_ROUNDS))} / ${scaled(SHUFFLE_ROUNDS)}`);
    // One beat, drawn wide: the beat at the left, the next at the right, the swung "and" between.
    const W = Math.min(a.right - a.left - 60 * a.u, 520 * a.u);
    const x0 = a.cx - W / 2;
    const y = a.cy;
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(x0, y, W, dpr);
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(x0 - dpr, y - 26 * a.u, 2 * dpr, 52 * a.u);
    ctx.fillRect(x0 + W - dpr, y - 26 * a.u, 2 * dpr, 52 * a.u);
    if (this.state === 0) {
      const t = (shown(now) - this.t0 - (this.exact ? (this.env.latency ?? 0) : 0)) / b;
      const hat = t < 8;
      const k = Math.floor(t);
      if (hat) {
        ctx.fillStyle = COL_MID;
        ctx.beginPath();
        ctx.arc(x0 + this.swing * W, y, 6 * a.u, 0, TAU);
        ctx.fill();
      }
      if (t >= 0) {
        const p = t - k;
        ctx.fillStyle = now < this.flash ? COL_ACCENT : COL_LINE;
        ctx.fillRect(x0 + p * W - dpr, y - 18 * a.u, 2 * dpr, 36 * a.u);
      }
      // Your taps this bar, folded into one beat.
      ctx.fillStyle = COL_ACCENT;
      for (const x of this.taps.slice(-6)) {
        const p = x / b - Math.floor(x / b + 0.15);
        ctx.fillRect(x0 + p * W - dpr, y + 22 * a.u, 2 * dpr, 10 * a.u);
      }
      ctx.fillStyle = COL_MID;
      v.text(t < 0 ? 'get ready' : hat ? 'tap with the swung offbeat (the grey dot)' : 'the hi-hat is gone: keep the same swing', a.cx, y - 60 * a.u, v.fontTiny, 'center');
    } else {
      const r = this.lastRatio;
      ctx.fillStyle = COL_LINE;
      ctx.beginPath();
      ctx.arc(x0 + this.swing * W, y, 6 * a.u, 0, TAU);
      ctx.fill();
      if (Number.isFinite(r)) {
        ctx.fillStyle = COL_ACCENT;
        ctx.fillRect(x0 + r * W - 1.5 * dpr, y - 20 * a.u, 3 * dpr, 40 * a.u);
      }
      ctx.fillStyle = COL_MID;
      const sw = Math.round(this.swing * 100);
      v.text(Number.isFinite(r) ? `you played ${Math.round(r * 100)}:${100 - Math.round(r * 100)}, it was ${sw}:${100 - sw}` : 'not enough taps in the last two bars', a.cx, y - 60 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.round(Math.max(0, 30 - m) * 30) : 0,
      primary: { label: 'swing error', value: m, unit: 'points', lower: true, decimals: 1 },
      lines: [
        { label: 'swing error, on average', value: this.errs.length ? `${m.toFixed(1)} points` : '–' },
        { label: 'grooves', value: String(this.round) },
      ],
      saved: this.round >= 2,
    };
  }
}

export const BATCH37: MiniDef[] = [
  { id: 'sure', name: 'Sure', skill: 'judgement', blurb: 'Which line is longer, and how sure are you? Scored on calibration.', how: 'Two lines flash. Press the side of the longer one, then say how sure you are: 1 guessing, 2 fairly sure, 3 certain. The lines adjust so you are right about three times in four. The score is not how often you are right but whether your "certain" is right 95% of the time, your "fairly sure" 75%, and your "guessing" half: calibration, the skill of weather forecasters.', input: 'keys', minKeys: 2, make: () => new Sure() },
  { id: 'range', name: 'Range', skill: 'judgement', blurb: 'How many dots? Give a range you are 80% sure of.', how: 'A cloud of dots flashes. Click the low end, then the high end, of a range you are 80% sure holds the count. Most people are overconfident: their 80% ranges catch the truth only about half the time. Aim for the truth inside four ranges in five, with ranges as narrow as you can manage. Fifteen clouds.', input: 'pointer', make: () => new Range() },
  { id: 'figure', name: 'Figure', skill: 'judgement', blurb: 'Place a feature on a figure by the classic drawing proportions.', how: 'An outline: a head, or a standing figure eight heads tall. Click where a feature goes, by the proportions artists learn: the eyes halfway down the head, the hips halfway down the figure, and so on. The classic line then shows. Scored as a share of the height. Ten tasks.', input: 'pointer', make: () => new Figure() },
  { id: 'shuffle', name: 'Shuffle', skill: 'timing', blurb: 'Tap the swung offbeat, then keep the swing when the hi-hat drops out.', how: 'A groove plays with a swung hi-hat: the "and" of each beat comes late, long-short. Tap with it. After two bars the hi-hat stops and you keep the same swing for two more, over the click alone. Each groove has a different swing, from nearly straight to hard swing. Scored on how far your swing is from the groove’s, in percentage points.', input: 'both', make: () => new Shuffle() },
];
