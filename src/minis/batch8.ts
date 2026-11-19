// Eighth batch.
//   Tilt    (judgement) - which way does the line lean? Later a tilted frame tries to fool you.
//   Faster  (judgement) - which dot moved faster? Distance is no clue.
//   Shade   (judgement) - which square is lighter? Their surroundings lie.
//   Sum     (reasoning) - true or false, as fast as you can.
//   Compare (reasoning) - which side is bigger?
//   Series  (reasoning) - what comes next?

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import {
  Stair,
  arena,
  clamp,
  footer,
  handLabel,
  header,
  mean,
  median,
  message,
  pct,
  progress,
  shuffle,
  sideOf,
  type Arena,
  type Mini,
  type MiniDef,
  type MiniEnv,
  type MiniResult,
  scaled,
} from './kit.ts';

const TAU = Math.PI * 2;

/**
 * Two-alternative threshold task: each trial has a right side (-1 or +1), the
 * difference comes from a table walked by a staircase, and the threshold is the
 * mean difference over the last twelve trials.
 */
abstract class Threshold implements Mini {
  protected env!: MiniEnv;
  protected readonly st: Stair;
  protected i = 0;
  protected state = 0; // 0 showing, 1 answer (stimulus gone), 2 feedback
  protected t0 = 0;
  protected answerSide = -1;
  protected lastOk = false;
  private at = 0;
  private correct = 0;
  private hist: number[] = [];
  private rts: number[] = [];
  private held = 0;
  private cx = 0;

  protected readonly table: readonly number[];
  protected readonly trials: number;
  /** How long the stimulus stays up, or 0 to keep it until answered. */
  protected readonly showMs: number;

  constructor(table: readonly number[], trials: number, showMs: number) {
    this.table = table;
    this.trials = trials;
    this.showMs = showMs;
    this.st = new Stair(0, 1, 0, table.length - 1);
  }

  protected abstract arm(diff: number, now: number): void;
  protected abstract draw(v: View, a: Arena, now: number): void;
  protected abstract readonly diffLabel: string;
  protected abstract fmt(d: number): string;
  protected abstract hint(): string;

  get diff(): number {
    return this.table[this.st.level]!;
  }

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next(now + 500);
  }

  private next(now: number): void {
    this.answerSide = Math.random() < 0.5 ? -1 : 1;
    this.t0 = now;
    this.state = 0;
    this.arm(this.diff, now);
  }

  private answer(side: number, ts: number): void {
    if (this.state === 2 || side === 0 || ts < this.t0) return;
    this.lastOk = side === this.answerSide;
    if (this.lastOk) this.correct++;
    if (this.lastOk) this.rts.push(ts - this.t0);
    this.hist.push(this.diff);
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
    if (this.state === 0 && this.showMs && now - this.t0 > this.showMs) this.state = 1;
    if (this.state < 2 && now - this.t0 > 6000) this.answer(-this.answerSide, now);
    if (this.state === 2 && now >= this.at) {
      if (this.i >= this.trials) return true;
      this.next(now);
    }
    v.clear();
    const a = arena(v, touch);
    this.cx = a.cx;
    header(v, touch, this.diffLabel, this.fmt(this.diff), 'trial', `${Math.min(this.i + 1, this.trials)} / ${this.trials}`);
    this.draw(v, a, now);
    if (this.i === 0 && this.state !== 2) {
      v.ctx.fillStyle = COL_MID;
      v.text(this.hint(), a.cx, a.bottom - 14 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  protected threshold(): number {
    const tail = this.hist.slice(-12);
    return tail.length ? mean(tail) : 0;
  }

  protected base(label: string, unit: string, decimals: number, score: number): MiniResult {
    const thr = this.threshold();
    return {
      score: Math.round(this.correct * 10 + score),
      primary: { label, value: thr, unit, lower: true, decimals },
      lines: [
        { label: `${label} (last 12)`, value: this.i ? `${this.fmt(thr)}` : '–' },
        { label: 'correct', value: `${this.correct} of ${this.i}` },
      ],
      rts: this.rts,
      saved: this.i >= 10,
    };
  }

  abstract result(): MiniResult;
}

// --- Tilt -------------------------------------------------------------------------

const TILTS = [8, 6, 4.5, 3.5, 2.7, 2.1, 1.6, 1.25, 1, 0.8, 0.6, 0.45];

class Tilt extends Threshold {
  protected readonly diffLabel = 'tilt';
  private frameAng = 0;
  private off = 0;

  constructor() {
    super(TILTS, 30, 350);
  }

  protected arm(): void {
    // From trial ten a tilted frame surrounds the line: the rod-and-frame illusion.
    this.frameAng = this.i >= 10 ? (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 12) : 0;
    this.off = (Math.random() - 0.5) * 80;
  }

  protected fmt(d: number): string {
    return `${d.toFixed(d < 1 ? 2 : 1)}°`;
  }

  protected hint(): string {
    return 'which way does the line lean? left hand: left. right hand: right';
  }

  protected draw(v: View, a: Arena, _now: number): void {
    const ctx = v.ctx;
    const dpr = v.dpr;
    const cx = a.cx + this.off * a.u;
    const cy = a.cy;
    const L = Math.min(170 * a.u, (a.bottom - a.top) * 0.45);
    if (this.state === 0 || this.state === 2) {
      if (this.frameAng) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((this.frameAng * Math.PI) / 180);
        ctx.strokeStyle = COL_MID;
        ctx.lineWidth = 1.5 * dpr;
        ctx.strokeRect(-L * 0.75, -L * 0.75, L * 1.5, L * 1.5);
        ctx.restore();
      }
      const ang = (this.answerSide * this.diff * Math.PI) / 180;
      ctx.strokeStyle = this.state === 2 ? (this.lastOk ? COL_LINE : COL_ACCENT) : COL_LINE;
      ctx.lineWidth = 3 * dpr;
      ctx.beginPath();
      ctx.moveTo(cx - (Math.sin(ang) * L) / 2, cy + (Math.cos(ang) * L) / 2);
      ctx.lineTo(cx + (Math.sin(ang) * L) / 2, cy - (Math.cos(ang) * L) / 2);
      ctx.stroke();
      if (this.state === 2) {
        ctx.fillStyle = COL_MID;
        v.text(this.answerSide < 0 ? 'it leaned left' : 'it leaned right', a.cx, a.top + 20 * a.u, v.fontTiny, 'center');
      }
    } else {
      ctx.fillStyle = COL_DIM;
      v.text('left or right?', a.cx, a.cy, v.fontTiny, 'center');
    }
  }

  result(): MiniResult {
    const thr = this.threshold();
    return this.base('smallest tilt', '°', 2, thr ? Math.max(0, 8 - thr) * 40 : 0);
  }
}

// --- Faster -----------------------------------------------------------------------

const SPEED_RATIOS = [1.6, 1.45, 1.33, 1.25, 1.19, 1.15, 1.12, 1.09, 1.07, 1.05, 1.04];

class Faster extends Threshold {
  protected readonly diffLabel = 'ratio';
  private v0 = [0, 0];
  private dur = [0, 0];
  private y0 = [0, 0];

  constructor() {
    super(SPEED_RATIOS, 30, 0);
  }

  protected arm(r: number): void {
    const slow = 0.25 + Math.random() * 0.2; // board heights per second
    this.v0 = this.answerSide < 0 ? [slow * r, slow] : [slow, slow * r];
    // Each dot moves for its own time, so whichever travels further is not always faster.
    this.dur = [700 + Math.random() * 500, 700 + Math.random() * 500];
    this.y0 = [Math.random() * 0.2, Math.random() * 0.2];
  }

  protected fmt(d: number): string {
    return `${d.toFixed(2)}`;
  }

  protected hint(): string {
    return 'which dot moved faster? they move for different times, so watch speed, not distance';
  }

  protected draw(v: View, a: Arena, now: number): void {
    const ctx = v.ctx;
    const dpr = v.dpr;
    const t = now - this.t0;
    const h = Math.min(a.bottom - a.top - 50 * a.u, 420 * a.u);
    const half = Math.min((a.right - a.left) / 4, 160 * a.u);
    const top = a.cy - h / 2;
    if (this.state === 0 && t > Math.max(this.dur[0]!, this.dur[1]!) + 150) this.state = 1;
    for (let s = 0; s < 2; s++) {
      const x = a.cx + (s ? half : -half);
      ctx.fillStyle = COL_DIM;
      ctx.fillRect(x - dpr / 2, top, dpr, h);
      const tt = Math.min(t, this.dur[s]!) / 1000;
      const moving = this.state === 0 && t < this.dur[s]!;
      if (moving || this.state === 2) {
        const y = top + (this.y0[s]! + this.v0[s]! * (this.state === 2 ? this.dur[s]! / 1000 : tt)) * h;
        ctx.fillStyle = this.state === 2 && (s ? 1 : -1) === this.answerSide ? (this.lastOk ? COL_LINE : COL_ACCENT) : this.state === 2 ? COL_MID : COL_LINE;
        ctx.beginPath();
        ctx.arc(x, y, 7 * a.u, 0, TAU);
        ctx.fill();
      }
    }
  }

  result(): MiniResult {
    const thr = this.threshold();
    return this.base('smallest speed ratio', '', 2, thr ? Math.max(0, 1.6 - thr) * 500 : 0);
  }
}

// --- Shade ------------------------------------------------------------------------

/** Brightness differences in 0-255 steps. */
const SHADES = [28, 22, 17, 13, 10, 8, 6, 5, 4, 3, 2];

class Shade extends Threshold {
  protected readonly diffLabel = 'difference';
  private lum = [0, 0];
  private sur = [0, 0];

  constructor() {
    super(SHADES, 30, 0);
  }

  protected arm(d: number): void {
    const base = 100 + Math.floor(Math.random() * 50);
    this.lum = this.answerSide < 0 ? [base + d, base] : [base, base + d];
    // From trial eight the surrounds differ, and often against you: the lighter
    // square sits on the lighter surround, which makes it look darker.
    if (this.i >= 8) {
      const against = Math.random() < 0.6;
      const light = against ? this.answerSide : -this.answerSide;
      this.sur = light < 0 ? [190, 25] : [25, 190];
    } else this.sur = [60, 60];
  }

  protected fmt(d: number): string {
    return Number.isInteger(d) ? `${d}` : d.toFixed(1);
  }

  protected hint(): string {
    return 'which middle square is lighter? left hand or right hand (or tap that side)';
  }

  protected draw(v: View, a: Arena, _now: number): void {
    const ctx = v.ctx;
    const box = Math.min((a.right - a.left) / 2 - 20 * a.u, a.bottom - a.top - 60 * a.u, 280 * a.u);
    for (let s = 0; s < 2; s++) {
      const x0 = a.cx + (s ? 8 * a.u : -8 * a.u - box);
      const y0 = a.cy - box / 2;
      const g = this.sur[s]!;
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.fillRect(x0, y0, box, box);
      const l = this.lum[s]!;
      ctx.fillStyle = `rgb(${l},${l},${l})`;
      ctx.fillRect(x0 + box * 0.35, y0 + box * 0.35, box * 0.3, box * 0.3);
      if (this.state === 2 && (s ? 1 : -1) === this.answerSide) {
        ctx.strokeStyle = this.lastOk ? COL_LINE : COL_ACCENT;
        ctx.lineWidth = 2 * v.dpr;
        ctx.strokeRect(x0 - 4 * v.dpr, y0 - 4 * v.dpr, box + 8 * v.dpr, box + 8 * v.dpr);
      }
    }
  }

  result(): MiniResult {
    const thr = this.threshold();
    return this.base('smallest difference', '', 1, thr ? Math.max(0, 28 - thr) * 15 : 0);
  }
}

// --- Sum --------------------------------------------------------------------------

const SUM_MS = 60000;

function rint(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** An equation at a difficulty level, and whether it is shown true. */
function equation(level: number): { text: string; truth: boolean } {
  let a = 0;
  let b = 0;
  let op = '+';
  let ans = 0;
  const kind = level < 2 ? 0 : level < 4 ? rint(0, 1) : level < 6 ? rint(0, 2) : rint(0, 3);
  const big = level >= 3;
  if (kind === 0) {
    a = big ? rint(12, 89) : rint(2, 9);
    b = big ? rint(3, level >= 5 ? 89 : 19) : rint(2, 9);
    ans = a + b;
  } else if (kind === 1) {
    op = '−';
    b = big ? rint(3, 39) : rint(2, 9);
    ans = big ? rint(5, 60) : rint(1, 9);
    a = ans + b;
  } else if (kind === 2) {
    op = '×';
    a = rint(2, level >= 7 ? 15 : 9);
    b = rint(2, 9);
    ans = a * b;
  } else {
    op = '÷';
    b = rint(2, 9);
    ans = rint(2, 12);
    a = ans * b;
  }
  const truth = Math.random() < 0.5;
  let shown = ans;
  if (!truth) {
    // Plausible wrong answers: off by one or two, by ten, or a neighbouring table entry.
    const opts = [ans + 1, ans - 1, ans + 2, ans - 2, ans + 10, ans - 10];
    if (kind === 2) opts.push(ans + b, ans - b, ans + a);
    const ok = opts.filter((x) => x >= 0 && x !== ans);
    shown = ok[Math.floor(Math.random() * ok.length)]!;
  }
  return { text: `${a} ${op} ${b} = ${shown}`, truth };
}

class Sum implements Mini {
  private env!: MiniEnv;
  private t0 = 0;
  private level = 0;
  private run = 0;
  private eq = { text: '', truth: true };
  private shownAt = 0;
  private right = 0;
  private wrong = 0;
  private times: number[] = [];
  private flash = 0;
  private flashOk = false;
  private held = 0;
  private cx = 0;
  private done = false;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.t0 = now + 600;
    this.eq = equation(0);
    this.shownAt = this.t0;
  }

  private answer(yes: boolean, ts: number): void {
    if (this.done || ts < this.t0) return;
    const ok = yes === this.eq.truth;
    this.flash = ts;
    this.flashOk = ok;
    if (ok) {
      this.right++;
      this.times.push(ts - this.shownAt);
      if (++this.run >= 3) {
        this.run = 0;
        this.level = Math.min(8, this.level + 1);
      }
    } else {
      this.wrong++;
      this.run = 0;
      this.level = Math.max(0, this.level - 1);
    }
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.eq = equation(this.level);
    this.shownAt = ts;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s) this.answer(s > 0, ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(x: number, _y: number, ts: number): void {
    this.answer(x >= this.cx, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const t = now - this.t0;
    if (t > scaled(SUM_MS)) {
      this.done = true;
      if (t > scaled(SUM_MS) + 700) return true;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    this.cx = a.cx;
    header(v, touch, 'right', String(this.right), 'level', String(this.level + 1));
    if (!this.done) {
      ctx.fillStyle = now - this.flash < 160 && !this.flashOk ? COL_ACCENT : COL_LINE;
      ctx.font = v.fontBig;
      ctx.textAlign = 'center';
      ctx.fillText(this.eq.text, a.cx, a.cy + 10 * a.u);
    } else message(v, a, `${this.right} right`, `${this.wrong} wrong`);
    ctx.fillStyle = COL_MID;
    const y = a.cy + 80 * a.u;
    v.text(`false  ${handLabel(this.env, -1)}`, a.cx - 90 * a.u, y, v.fontTiny, 'center');
    v.text(`true  ${handLabel(this.env, 1)}`, a.cx + 90 * a.u, y, v.fontTiny, 'center');
    progress(v, a.cx, a.bottom - 20 * a.u, 120 * a.u, clamp(t / scaled(SUM_MS), 0, 1));
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const net = this.right - this.wrong;
    return {
      score: Math.max(0, net * 10 + this.level * 15),
      primary: { label: 'right minus wrong', value: net, unit: '' },
      lines: [
        { label: 'right', value: String(this.right) },
        { label: 'wrong', value: String(this.wrong) },
        { label: 'median time per answer', value: this.times.length ? `${(median(this.times) / 1000).toFixed(2)} s` : '–' },
        { label: 'level reached', value: String(this.level + 1) },
      ],
      rts: this.times, saved: this.right + this.wrong >= 5,
    };
  }
}

// --- Compare ----------------------------------------------------------------------

const COMPARE_MS = 45000;

function expr(level: number, target: number): { text: string; value: number } {
  // Build an expression near `target`.
  const kind = level < 2 ? 0 : rint(0, Math.min(3, level - 1));
  if (kind === 0) {
    const a = rint(1, Math.max(1, target - 1));
    return { text: `${a} + ${target - a}`, value: target };
  }
  if (kind === 1) {
    const b = rint(2, 20);
    return { text: `${target + b} − ${b}`, value: target };
  }
  // A product near the target.
  let best = { text: `${target}`, value: target };
  let bestD = Infinity;
  for (let tries = 0; tries < 30; tries++) {
    const a = rint(2, 12);
    const b = Math.max(2, Math.round(target / a));
    const d = Math.abs(a * b - target);
    if (d < bestD) {
      bestD = d;
      best = { text: `${a} × ${b}`, value: a * b };
    }
  }
  if (kind === 3) {
    const c = rint(1, 9);
    best = { text: `${best.text} + ${c}`, value: best.value + c };
  }
  return best;
}

class Compare implements Mini {
  private env!: MiniEnv;
  private t0 = 0;
  private level = 0;
  private run = 0;
  private pair: { text: string; value: number }[] = [];
  private right = 0;
  private wrong = 0;
  private flash = 0;
  private flashOk = false;
  private held = 0;
  private cx = 0;
  private done = false;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.t0 = now + 600;
    this.make();
  }

  private make(): void {
    const target = rint(12, 30 + this.level * 15);
    const gap = Math.max(1, Math.round(target * (0.3 - this.level * 0.035)));
    let a = expr(this.level, target);
    let b = expr(this.level, target + (Math.random() < 0.5 ? gap : -gap));
    for (let k = 0; k < 10 && a.value === b.value; k++) b = expr(this.level, target + gap + k);
    if (a.value === b.value) b = { text: `${b.value + 1}`, value: b.value + 1 };
    if (Math.random() < 0.5) [a, b] = [b, a];
    this.pair = [a, b];
  }

  private answer(side: number, ts: number): void {
    if (this.done || ts < this.t0 || side === 0) return;
    const bigger = this.pair[0]!.value > this.pair[1]!.value ? -1 : 1;
    const ok = side === bigger;
    this.flash = ts;
    this.flashOk = ok;
    if (ok) {
      this.right++;
      if (++this.run >= 3) {
        this.run = 0;
        this.level = Math.min(7, this.level + 1);
      }
    } else {
      this.wrong++;
      this.run = 0;
      this.level = Math.max(0, this.level - 1);
    }
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.make();
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
    const t = now - this.t0;
    if (t > scaled(COMPARE_MS)) {
      this.done = true;
      if (t > scaled(COMPARE_MS) + 700) return true;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    this.cx = a.cx;
    header(v, touch, 'right', String(this.right), 'level', String(this.level + 1));
    if (!this.done) {
      const half = Math.min((a.right - a.left) / 4, 200 * a.u);
      ctx.fillStyle = now - this.flash < 160 && !this.flashOk ? COL_ACCENT : COL_LINE;
      ctx.font = v.fontHud;
      ctx.textAlign = 'center';
      ctx.fillText(this.pair[0]!.text, a.cx - half, a.cy);
      ctx.fillText(this.pair[1]!.text, a.cx + half, a.cy);
      ctx.fillStyle = COL_DIM;
      ctx.fillRect(a.cx - dpr / 2, a.cy - 60 * a.u, dpr, 90 * a.u);
      if (this.right + this.wrong === 0) {
        ctx.fillStyle = COL_MID;
        v.text('which side is bigger? that hand, or tap that side', a.cx, a.cy + 80 * a.u, v.fontTiny, 'center');
      }
    } else message(v, a, `${this.right} right`, `${this.wrong} wrong`);
    progress(v, a.cx, a.bottom - 20 * a.u, 120 * a.u, clamp(t / scaled(COMPARE_MS), 0, 1));
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const net = this.right - this.wrong;
    return {
      score: Math.max(0, net * 10 + this.level * 15),
      primary: { label: 'right minus wrong', value: net, unit: '' },
      lines: [
        { label: 'right', value: String(this.right) },
        { label: 'wrong', value: String(this.wrong) },
        { label: 'accuracy', value: pct(this.right / (this.right + this.wrong || 1)) },
        { label: 'level reached', value: String(this.level + 1) },
      ],
      saved: this.right + this.wrong >= 5,
    };
  }
}

// --- Series -----------------------------------------------------------------------

const SERIES_N = 12;

/** A number series of the given difficulty: the first five terms and the next. */
function series(level: number): number[] {
  const kinds = level < 3 ? [0, 1] : level < 6 ? [0, 1, 2, 3] : [1, 2, 3, 4, 5];
  const kind = kinds[Math.floor(Math.random() * kinds.length)]!;
  const out: number[] = [];
  if (kind === 0) {
    // Add a constant.
    const a = rint(1, 20);
    const d = rint(2, 9) * (Math.random() < 0.3 ? -1 : 1);
    for (let k = 0; k < 6; k++) out.push(a + d * k + (d < 0 ? 60 : 0));
  } else if (kind === 1) {
    // Growing steps: +1, +2, +3 ... (or +2, +4, +6).
    let x = rint(1, 10);
    const s = rint(1, 3);
    for (let k = 0; k < 6; k++) {
      out.push(x);
      x += s * (k + 1);
    }
  } else if (kind === 2) {
    // Multiply.
    let x = rint(1, 4);
    const m = rint(2, 3);
    for (let k = 0; k < 6; k++) {
      out.push(x);
      x *= m;
    }
  } else if (kind === 3) {
    // Two interleaved series.
    const a = rint(1, 9);
    const b = rint(20, 40);
    const da = rint(2, 5);
    const db = -rint(1, 4);
    for (let k = 0; k < 6; k++) out.push(k % 2 ? b + db * (k >> 1) : a + da * (k >> 1));
  } else if (kind === 4) {
    // Each term is the sum of the two before.
    let p = rint(1, 5);
    let q = rint(p, 8);
    for (let k = 0; k < 6; k++) {
      out.push(p);
      [p, q] = [q, p + q];
    }
  } else {
    // Alternate: times two, plus a constant.
    let x = rint(1, 5);
    const c = rint(1, 6);
    for (let k = 0; k < 6; k++) {
      out.push(x);
      x = k % 2 ? x + c : x * 2;
    }
  }
  return out;
}

class Series implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private level = 0;
  private terms: number[] = [];
  private opts: number[] = [];
  private rects: number[][] = [];
  private state = 0; // 0 answering, 1 feedback
  private shownAt = 0;
  private at = 0;
  private picked = -1;
  private right = 0;
  private times: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 300);
  }

  private make(now: number): void {
    this.terms = series(this.level);
    const ans = this.terms[5]!;
    const d = Math.abs(this.terms[5]! - this.terms[4]!) || 3;
    const cand = new Set<number>([ans]);
    const pool = shuffle([ans + 1, ans - 1, ans + 2, ans - 2, ans + d, ans - d, this.terms[4]! + (this.terms[4]! - this.terms[3]!), ans + 10]);
    for (const x of pool) if (cand.size < 4 && x !== ans && x >= 0) cand.add(x);
    this.opts = shuffle([...cand]);
    this.state = 0;
    this.shownAt = now;
    this.picked = -1;
  }

  private choose(k: number, ts: number): void {
    if (this.state !== 0 || k < 0 || k >= this.opts.length) return;
    this.picked = k;
    const ok = this.opts[k] === this.terms[5];
    if (ok) {
      this.right++;
      this.times.push(ts - this.shownAt);
      this.level = Math.min(8, this.level + 1);
    } else this.level = Math.max(0, this.level - 1);
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.i++;
    this.state = 1;
    this.at = ts + (ok ? 700 : 1600);
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const m = /^(?:Digit|Numpad)([1-4])$/.exec(code);
    if (!m) return false;
    this.choose(Number(m[1]) - 1, ts);
    return true;
  }

  pointer(x: number, y: number, ts: number): void {
    this.rects.forEach((r, k) => {
      if (x >= r[0]! && x <= r[0]! + r[2]! && y >= r[1]! && y <= r[1]! + r[3]!) this.choose(k, ts);
    });
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now - this.shownAt > 20000) {
      this.i++;
      this.level = Math.max(0, this.level - 1);
      this.env.sound(SND_FALSE);
      this.state = 1;
      this.at = now + 1600;
    }
    if (this.state === 1 && now >= this.at) {
      if (this.i >= scaled(SERIES_N)) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'right', `${this.right} / ${this.i}`, 'question', `${Math.min(this.i + 1, scaled(SERIES_N))} / ${scaled(SERIES_N)}`);
    ctx.fillStyle = COL_LINE;
    ctx.font = v.fontHud;
    ctx.textAlign = 'center';
    const shown = this.terms.slice(0, 5).join('   ');
    ctx.fillText(`${shown}   ${this.state === 1 ? this.terms[5] : '?'}`, a.cx, a.cy - 50 * a.u);
    const w = Math.min(100 * a.u, (a.right - a.left - 30 * a.u) / 4);
    const h = 54 * a.u;
    const gap = 10 * a.u;
    const x0 = a.cx - (this.opts.length * w + (this.opts.length - 1) * gap) / 2;
    const y0 = a.cy + 10 * a.u;
    this.rects = this.opts.map((_, k) => [x0 + k * (w + gap), y0, w, h]);
    this.opts.forEach((o, k) => {
      const [x, y] = this.rects[k]!;
      const isAns = o === this.terms[5];
      ctx.strokeStyle = this.state === 1 && isAns ? COL_LINE : this.state === 1 && k === this.picked ? COL_ACCENT : COL_DIM;
      ctx.lineWidth = dpr;
      ctx.strokeRect(x! + 0.5, y! + 0.5, w - 1, h - 1);
      ctx.fillStyle = COL_LINE;
      v.text(String(o), x! + w / 2, y! + h / 2 + 6 * dpr, v.fontHud, 'center');
      ctx.fillStyle = COL_DIM;
      v.text(String(k + 1), x! + w / 2, y! + h + 16 * dpr, v.fontTiny, 'center');
    });
    if (this.i === 0) {
      ctx.fillStyle = COL_MID;
      v.text('what comes next? tap it, or press 1 to 4', a.cx, a.bottom - 20 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 60 + this.level * 20,
      primary: { label: 'right', value: this.right, unit: `/ ${scaled(SERIES_N)}` },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'median time when right', value: this.times.length ? `${(median(this.times) / 1000).toFixed(1)} s` : '–' },
        { label: 'level reached', value: String(this.level + 1) },
      ],
      rts: this.times, saved: this.i >= 4,
    };
  }
}

export const BATCH8: MiniDef[] = [
  {
    id: 'tilt',
    name: 'Tilt',
    skill: 'judgement',
    blurb: 'Which way does the line lean? Later, a tilted frame tries to fool you.',
    how: 'A line flashes, leaning very slightly left or right. Answer with that hand or tap that side. The lean shrinks as you get it right. After ten, a tilted frame appears around it: the rod-and-frame illusion pulls your sense of upright.',
    input: 'both',
    minKeys: 2,
    make: () => new Tilt(),
  },
  {
    id: 'faster',
    name: 'Faster',
    skill: 'judgement',
    blurb: 'Which dot moved faster? Distance is no clue.',
    how: 'Two dots slide down for a moment. Which was faster? Each moves for its own length of time, so the one that went further is not always the faster one. The speeds get closer as you get it right.',
    input: 'both',
    minKeys: 2,
    make: () => new Faster(),
  },
  {
    id: 'shade',
    name: 'Shade',
    skill: 'judgement',
    blurb: 'Which square is lighter? Their surroundings lie.',
    how: 'Two small grey squares. Which is lighter? After a few, they sit on different backgrounds, usually arranged to fool you: a square on a light background looks darker than it is.',
    input: 'both',
    minKeys: 2,
    make: () => new Shade(),
  },
  {
    id: 'sum',
    name: 'Sum',
    skill: 'reasoning',
    blurb: 'True or false, as fast as you can.',
    how: 'An equation appears. Right hand if it is true, left hand if false (or tap that side). A minute long. Three right in a row and the sums get harder; wrong answers are close, so check.',
    input: 'both',
    minKeys: 2,
    make: () => new Sum(),
  },
  {
    id: 'compare',
    name: 'Compare',
    skill: 'reasoning',
    blurb: 'Two expressions. Which is bigger?',
    how: 'Two sums or products. Pick the bigger one with that hand or tap that side. They get closer and trickier as you go. Forty-five seconds.',
    input: 'both',
    minKeys: 2,
    make: () => new Compare(),
  },
  {
    id: 'series',
    name: 'Series',
    skill: 'reasoning',
    blurb: 'Five numbers. What comes next?',
    how: 'Find the rule and pick the next number: tap it or press 1 to 4. Rules include steady steps, growing steps, doubling, two series woven together, and adding the last two. Twelve questions.',
    input: 'pointer',
    make: () => new Series(),
  },
];
