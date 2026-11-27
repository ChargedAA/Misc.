// Twentieth batch: classic tasks the suite was missing.
//   Opposite (reaction)  - press the side away from the dot. Blocks of "same" and "opposite".
//   Line     (judgement) - put a number on a number line.
//   Hold     (memory)    - remember positions while checking sums in between.
//   Chain    (reasoning) - keep a running total through a string of operations.

import { ANTICIPATION_MS, COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK, SND_TONE } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { Stair, arena, footer, foreperiod, handLabel, header, mean, median, message, ms, pct, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult, gameNow, scaled } from './kit.ts';

const TAU = Math.PI * 2;

function rint(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

type Rect = [number, number, number, number];

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
}

/** A 3x4 keypad (1-9, del, 0, ok) drawn at the bottom; returns the key rectangles. */
export function keypad(v: View, cx: number, bottom: number, u: number, active: boolean, labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '<', '0', 'ok']): [number, number, number, number, string][] {
  const ctx = v.ctx;
  const kw = Math.min(64 * u, v.w / 6);
  const kh = kw * 0.6;
  const gap = 8 * u;
  const x0 = cx - (kw * 3 + gap * 2) / 2;
  const y0 = bottom - (kh * 4 + gap * 3);
  const out: [number, number, number, number, string][] = [];
  labels.forEach((d, k) => {
    const x = x0 + (k % 3) * (kw + gap);
    const y = y0 + Math.floor(k / 3) * (kh + gap);
    out.push([x, y, kw, kh, d]);
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = v.dpr;
    ctx.strokeRect(x + 0.5, y + 0.5, kw - 1, kh - 1);
    ctx.fillStyle = active ? COL_LINE : COL_DIM;
    v.text(d === '<' ? 'del' : d, x + kw / 2, y + kh / 2 + 5 * v.dpr, v.fontHud, 'center');
  });
  return out;
}

// --- Opposite ---------------------------------------------------------------------

const OPP_BLOCKS = 4;
const OPP_PER = 10;

class Opposite implements Mini {
  private env!: MiniEnv;
  private block = 0;
  private trial = 0;
  /** Blocks alternate: same side, opposite side, same, opposite. */
  private anti = false;
  private state = 0; // 0 block card, 1 wait, 2 dot shown, 3 feedback
  private at = 0;
  private side = 1;
  private drawnAt = 0;
  private rts: [number[], number[]] = [[], []];
  private errs = [0, 0];
  private lastOk = true;
  private lastRt = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.card(now);
  }

  private card(now: number): void {
    this.anti = this.block % 2 === 1;
    this.trial = 0;
    this.state = 0;
    this.at = now + 1800;
  }

  private arm(now: number): void {
    this.state = 1;
    this.at = now + foreperiod(600, 600, 1800);
    this.side = Math.random() < 0.5 ? -1 : 1;
    this.drawnAt = 0;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0) return;
    if (this.state === 0) {
      this.at = ts;
      return;
    }
    if (this.state === 1) {
      this.errs[this.anti ? 1 : 0]!++;
      this.lastOk = false;
      this.lastRt = 0;
      this.env.sound(SND_FALSE);
      this.state = 3;
      this.at = ts + 700;
      return;
    }
    if (this.state !== 2 || !this.drawnAt) return;
    const rt = ts - this.drawnAt;
    if (rt < ANTICIPATION_MS) return;
    const want = this.anti ? -this.side : this.side;
    this.lastOk = s === want;
    this.lastRt = rt;
    if (this.lastOk) {
      this.rts[this.anti ? 1 : 0]!.push(rt);
      this.env.sound(s > 0 ? SND_TAP_R : SND_TAP_L);
    } else {
      this.errs[this.anti ? 1 : 0]!++;
      this.env.sound(SND_FALSE);
    }
    this.state = 3;
    this.at = ts + 500;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.arm(now);
    else if (this.state === 1 && now >= this.at) this.state = 2;
    else if (this.state === 2 && this.drawnAt && now - this.drawnAt > 1500) {
      this.errs[this.anti ? 1 : 0]!++;
      this.lastOk = false;
      this.lastRt = 0;
      this.state = 3;
      this.at = now + 500;
    } else if (this.state === 3 && now >= this.at) {
      this.trial++;
      if (this.trial >= OPP_PER) {
        this.block++;
        if (this.block >= scaled(OPP_BLOCKS)) return true;
        this.card(now);
      } else this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'rule', this.anti ? 'opposite' : 'same side', 'block', `${Math.min(this.block + 1, scaled(OPP_BLOCKS))} / ${scaled(OPP_BLOCKS)}`);
    const off = Math.min(220 * a.u, (a.right - a.left) / 2 - 40 * a.u);
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(a.cx - 6 * a.u, a.cy - v.dpr / 2, 12 * a.u, v.dpr);
    ctx.fillRect(a.cx - v.dpr / 2, a.cy - 6 * a.u, v.dpr, 12 * a.u);
    if (this.state === 0) {
      message(v, { ...a, cy: a.cy - 80 * a.u }, this.anti ? 'OPPOSITE' : 'SAME SIDE', this.anti ? 'press the hand away from the dot' : 'press the hand on the dot’s side', this.anti ? COL_ACCENT : COL_LINE);
    } else if (this.state === 2) {
      if (!this.drawnAt) this.drawnAt = gameNow();
      ctx.fillStyle = COL_LINE;
      ctx.beginPath();
      ctx.arc(a.cx + this.side * off, a.cy, 14 * a.u, 0, TAU);
      ctx.fill();
    } else if (this.state === 3) {
      ctx.fillStyle = this.lastOk ? COL_MID : COL_ACCENT;
      v.text(this.lastOk ? `${Math.round(this.lastRt)} ms` : 'wrong side', a.cx, a.cy - 40 * a.u, v.fontTiny, 'center');
    }
    ctx.fillStyle = COL_MID;
    v.text(handLabel(this.env, -1), a.cx - off, a.cy + 60 * a.u, v.fontTiny, 'center');
    v.text(handLabel(this.env, 1), a.cx + off, a.cy + 60 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const same = median(this.rts[0]);
    const anti = median(this.rts[1]);
    const n = this.rts[0].length + this.rts[1].length;
    return {
      score: anti ? Math.max(0, Math.round((800 - anti) * 1.5 - this.errs[1]! * 30 + n * 3)) : 0,
      primary: { label: 'opposite-side median', value: anti, unit: 'ms', lower: true },
      series: { label: 'median by rule', names: ['same side', 'opposite'], values: [same, anti], unit: 'ms', lower: true },
      lines: [
        { label: 'same side: median, wrong', value: `${ms(same)}  ·  ${this.errs[0]} wrong` },
        { label: 'opposite: median, wrong', value: `${ms(anti)}  ·  ${this.errs[1]} wrong` },
        { label: 'cost of going opposite', value: same && anti ? `${Math.round(anti - same)} ms` : '–' },
      ],
      rts: [...this.rts[0], ...this.rts[1]],
      saved: this.rts[1].length >= 5,
    };
  }
}

// --- Line -------------------------------------------------------------------------

const LINE_TRIALS = 16;

class NumberLine implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private max = 100;
  private target = 0;
  private state = 0; // 0 placing, 1 reveal
  private at = 0;
  private tapP = 0;
  private errs: number[] = [];
  private geo = { x0: 0, w: 1, y: 0 };
  private shownAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now);
  }

  private make(now: number): void {
    this.max = this.i < 6 ? 100 : this.i < 11 ? 1000 : 10000;
    this.target = rint(1, this.max - 1);
    if (this.max === 10000) this.target = Math.round(this.target / 10) * 10;
    this.state = 0;
    this.shownAt = now;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 0) return;
    const g = this.geo;
    if (Math.abs(y - g.y) > 240 || x < g.x0 - 20 || x > g.x0 + g.w + 20) return;
    this.tapP = Math.max(0, Math.min(1, (x - g.x0) / g.w));
    const e = Math.abs(this.tapP - this.target / this.max);
    this.errs.push(e);
    this.env.sound(e < 0.02 ? SND_CATCH : e < 0.06 ? SND_TAP_WEAK : SND_FALSE);
    this.i++;
    this.state = 1;
    this.at = ts + 1300;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now - this.shownAt > 15000) {
      this.errs.push(0.5);
      this.i++;
      this.state = 1;
      this.at = now + 1000;
    }
    if (this.state === 1 && now >= this.at) {
      if (this.i >= scaled(LINE_TRIALS)) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const recent = this.errs.slice(-4);
    header(v, touch, 'off by', recent.length ? pct(mean(recent)) : '–', 'number', `${Math.min(this.i + 1, scaled(LINE_TRIALS))} / ${scaled(LINE_TRIALS)}`);
    const w = Math.min(a.right - a.left - 60 * a.u, 680 * a.u);
    const x0 = a.cx - w / 2;
    const y = a.cy + 30 * a.u;
    this.geo = { x0, w, y };
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(x0, y, w, dpr);
    ctx.fillRect(x0 - dpr, y - 10 * a.u, 2 * dpr, 20 * a.u);
    ctx.fillRect(x0 + w - dpr, y - 10 * a.u, 2 * dpr, 20 * a.u);
    ctx.fillStyle = COL_MID;
    v.text('0', x0, y + 30 * a.u, v.fontTiny, 'center');
    v.text(this.max.toLocaleString('en'), x0 + w, y + 30 * a.u, v.fontTiny, 'center');
    ctx.fillStyle = COL_LINE;
    v.text(this.target.toLocaleString('en'), a.cx, a.cy - 70 * a.u, v.fontBig, 'center');
    if (this.state === 1) {
      ctx.fillStyle = COL_LINE;
      ctx.fillRect(x0 + (this.target / this.max) * w - dpr, y - 18 * a.u, 2 * dpr, 36 * a.u);
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.arc(x0 + this.tapP * w, y, 6 * a.u, 0, TAU);
      ctx.fill();
      const e = this.errs[this.errs.length - 1]!;
      ctx.fillStyle = COL_MID;
      v.text(`${(e * 100).toFixed(1)}% off`, a.cx, y + 60 * a.u, v.fontTiny, 'center');
    } else if (this.i === 0) {
      ctx.fillStyle = COL_MID;
      v.text('tap where the number belongs on the line', a.cx, y + 60 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.round(Math.max(0, 0.15 - m) * 5000) : 0,
      primary: { label: 'average miss', value: Math.round(m * 1000) / 10, unit: '%', lower: true, decimals: 1 },
      lines: [
        { label: 'average miss (share of the line)', value: this.errs.length ? `${(m * 100).toFixed(1)}%` : '–' },
        { label: 'within 2%', value: pct(this.errs.filter((e) => e < 0.02).length / (this.errs.length || 1)) },
      ],
      saved: this.errs.length >= 4,
    };
  }
}

// --- Hold (complex span) ----------------------------------------------------------

const HOLD_ROUNDS = 8;

class Hold implements Mini {
  private env!: MiniEnv;
  private readonly span = new Stair(2, 1, 2, 12);
  /** Cells to remember (0..15 on a 4x4 grid), shown one at a time, each followed by a sum. */
  private cells: number[] = [];
  private k = 0;
  private phase = 0; // 0 show cell, 1 sum, 2 recall, 3 feedback
  private at = 0;
  private sumText = '';
  private sumTrue = true;
  private sumAnswered = false;
  private sumsRight = 0;
  private sumsAll = 0;
  private recall: number[] = [];
  private round = 0;
  private best = 0;
  private ok = false;
  private geo = { x0: 0, y0: 0, s: 1 };
  private tf: Rect[] = [];
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 600);
  }

  private make(now: number): void {
    const n = this.span.level;
    const pool = [...Array(16).keys()];
    this.cells = [];
    for (let i = 0; i < n; i++) this.cells.push(pool.splice(rint(0, pool.length - 1), 1)[0]!);
    this.k = 0;
    this.recall = [];
    this.phase = 0;
    this.at = now + 900;
  }

  private newSum(): void {
    const a = rint(2, 9);
    const b = rint(2, 9);
    const add = Math.random() < 0.5;
    const real = add ? a + b : a * b;
    this.sumTrue = Math.random() < 0.5;
    const shown = this.sumTrue ? real : real + (Math.random() < 0.5 ? -1 : 1) * rint(1, 3);
    this.sumText = `${a} ${add ? '+' : '×'} ${b} = ${shown}`;
    this.sumAnswered = false;
  }

  private answerSum(yes: boolean, ts: number): void {
    if (this.phase !== 1 || this.sumAnswered) return;
    this.sumAnswered = true;
    this.sumsAll++;
    const right = yes === this.sumTrue;
    if (right) this.sumsRight++;
    this.env.sound(right ? SND_TAP_R : SND_FALSE);
    this.at = ts + 250;
  }

  private pick(cell: number, ts: number): void {
    if (this.phase !== 2 || this.recall.includes(cell)) return;
    this.recall.push(cell);
    this.env.sound(SND_TONE + (this.recall.length % 7));
    if (this.recall.length === this.cells.length) {
      this.ok = this.recall.every((c, i) => c === this.cells[i]);
      if (this.ok) this.best = Math.max(this.best, this.cells.length);
      this.span.update(this.ok, 1);
      this.env.sound(this.ok ? SND_CATCH : SND_FALSE);
      this.round++;
      this.phase = 3;
      this.at = ts + 1500;
    }
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s) this.answerSum(s > 0, ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(x: number, y: number, ts: number): void {
    if (this.phase === 1) {
      this.tf.forEach((r, k) => inRect(r, x, y) && this.answerSum(k === 1, ts));
      return;
    }
    const g = this.geo;
    const c = Math.floor((x - g.x0) / g.s);
    const r = Math.floor((y - g.y0) / g.s);
    if (c >= 0 && c < 4 && r >= 0 && r < 4) this.pick(r * 4 + c, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.phase === 0 && now >= this.at) {
      this.phase = 1;
      this.newSum();
      this.at = now + 3500;
    } else if (this.phase === 1 && now >= this.at) {
      if (!this.sumAnswered) this.sumsAll++;
      this.k++;
      if (this.k >= this.cells.length) this.phase = 2;
      else {
        this.phase = 0;
        this.at = now + 900;
      }
    } else if (this.phase === 3 && now >= this.at) {
      if (this.round >= scaled(HOLD_ROUNDS)) return true;
      this.make(now + 200);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'positions', String(this.span.level), 'sums right', this.sumsAll ? pct(this.sumsRight / this.sumsAll) : '–');
    const S = Math.min(a.bottom - a.top - 60 * a.u, a.right - a.left, 320 * a.u);
    const s = S / 4;
    const g = (this.geo = { x0: a.cx - S / 2, y0: a.cy - S / 2 + 10 * a.u, s });
    if (this.phase === 1) {
      ctx.fillStyle = COL_LINE;
      v.text(this.sumText, a.cx, a.cy - 10 * a.u, v.fontBig, 'center');
      const bw = 110 * a.u;
      this.tf = [
        [a.cx - bw - 10 * a.u, a.cy + 40 * a.u, bw, 44 * a.u],
        [a.cx + 10 * a.u, a.cy + 40 * a.u, bw, 44 * a.u],
      ];
      ['false', 'true'].forEach((label, i) => {
        const [x, y, w, h] = this.tf[i]!;
        ctx.strokeStyle = this.sumAnswered ? COL_DIM : COL_MID;
        ctx.lineWidth = dpr;
        ctx.strokeRect(x + 0.5, y + 0.5, w, h);
        ctx.fillStyle = COL_LINE;
        v.text(`${label}  ${handLabel(this.env, i ? 1 : -1)}`, x + w / 2, y + h / 2 + 5 * dpr, v.fontTiny, 'center');
      });
      ctx.fillStyle = COL_MID;
      v.text(`keep position ${this.k + 1} in mind`, a.cx, a.cy - 70 * a.u, v.fontTiny, 'center');
    } else {
      for (let c = 0; c < 16; c++) {
        const x = g.x0 + (c % 4) * s;
        const y = g.y0 + Math.floor(c / 4) * s;
        const showing = this.phase === 0 && now < this.at && this.cells[this.k] === c;
        const picked = this.recall.indexOf(c);
        const answer = this.phase === 3 ? this.cells.indexOf(c) : -1;
        ctx.strokeStyle = COL_DIM;
        ctx.lineWidth = dpr;
        ctx.strokeRect(x + 3 * dpr, y + 3 * dpr, s - 6 * dpr, s - 6 * dpr);
        if (showing) {
          ctx.fillStyle = COL_ACCENT;
          ctx.fillRect(x + 8 * dpr, y + 8 * dpr, s - 16 * dpr, s - 16 * dpr);
        } else if (answer >= 0) {
          ctx.fillStyle = this.recall[answer] === c ? COL_LINE : COL_MID;
          v.text(String(answer + 1), x + s / 2, y + s / 2 + 6 * dpr, v.fontHud, 'center');
        } else if (picked >= 0) {
          ctx.fillStyle = COL_LINE;
          v.text(String(picked + 1), x + s / 2, y + s / 2 + 6 * dpr, v.fontHud, 'center');
        }
      }
      ctx.fillStyle = COL_MID;
      const msg = this.phase === 0 ? `remember where it lights  ·  ${this.k + 1} of ${this.cells.length}` : this.phase === 2 ? 'tap the positions in the order they lit' : this.ok ? 'all in order' : 'numbers show the right order';
      v.text(msg, a.cx, g.y0 - 14 * dpr, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const sums = this.sumsAll ? this.sumsRight / this.sumsAll : 0;
    return {
      score: this.best * 100 + Math.round(sums * 100),
      primary: { label: 'span under load', value: this.best, unit: 'positions' },
      lines: [
        { label: 'longest run recalled in order', value: `${this.best} positions` },
        { label: 'sums checked right', value: `${this.sumsRight} of ${this.sumsAll}` },
        { label: 'rounds', value: String(this.round) },
      ],
      saved: this.round >= 2,
    };
  }
}

// --- Chain ------------------------------------------------------------------------

const CHAIN_ROUNDS = 10;

class Chain implements Mini {
  private env!: MiniEnv;
  private readonly len = new Stair(3, 1, 2, 20);
  private startN = 0;
  private ops: string[] = [];
  private answer = 0;
  private k = -1;
  private state = 0; // 0 showing, 1 typing, 2 feedback
  private t0 = 0;
  private at = 0;
  private typed = '';
  private round = 0;
  private best = 0;
  private right = 0;
  private ok = false;
  private keys: [number, number, number, number, string][] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 600);
  }

  private make(now: number): void {
    let x = rint(2, 12);
    this.startN = x;
    this.ops = [];
    for (let i = 0; i < this.len.level; i++) {
      const kind = rint(0, 3);
      if (kind === 0 || x < 4) {
        const n = rint(2, 9);
        x += n;
        this.ops.push(`+ ${n}`);
      } else if (kind === 1) {
        const n = rint(1, Math.min(9, x - 1));
        x -= n;
        this.ops.push(`− ${n}`);
      } else if (kind === 2 && x <= 30) {
        x *= 2;
        this.ops.push('× 2');
      } else if (x % 2 === 0) {
        x /= 2;
        this.ops.push('÷ 2');
      } else {
        x += 3;
        this.ops.push('+ 3');
      }
    }
    this.answer = x;
    this.k = -1;
    this.typed = '';
    this.state = 0;
    this.t0 = now;
  }

  private step(): number {
    return Math.max(400, 1700 - this.round * 40);
  }

  private type(d: string, ts: number): void {
    if (this.state !== 1) return;
    if (d === '<') this.typed = this.typed.slice(0, -1);
    else if (d === 'ok') {
      if (!this.typed) return;
      this.ok = Number(this.typed) === this.answer;
      if (this.ok) {
        this.right++;
        this.best = Math.max(this.best, this.ops.length);
      }
      this.len.update(this.ok);
      this.env.sound(this.ok ? SND_CATCH : SND_FALSE);
      this.round++;
      this.state = 2;
      this.at = ts + 1500;
    } else if (this.typed.length < 4) {
      this.typed += d;
      this.env.sound(SND_TONE + (Number(d) % 7));
    }
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const m = /^(?:Digit|Numpad)(\d)$/.exec(code);
    if (m) {
      this.type(m[1]!, ts);
      return true;
    }
    if (code === 'Backspace') {
      this.type('<', ts);
      return true;
    }
    if (code === 'Enter' || code === 'NumpadEnter') {
      this.type('ok', ts);
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    for (const [kx, ky, w, h, d] of this.keys) if (x >= kx && x <= kx + w && y >= ky && y <= ky + h) this.type(d, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.t0) {
      const k = Math.floor((now - this.t0) / this.step()) - 1;
      this.k = k;
      if (k >= this.ops.length) this.state = 1;
    }
    if (this.state === 1 && now - this.t0 > this.step() * (this.ops.length + 1) + 30000) {
      this.type(this.typed ? 'ok' : '0', now);
      if (this.state === 1) this.type('ok', now);
    }
    if (this.state === 2 && now >= this.at) {
      if (this.round >= scaled(CHAIN_ROUNDS)) return true;
      this.make(now + 300);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'steps', String(this.len.level), 'round', `${Math.min(this.round + 1, scaled(CHAIN_ROUNDS))} / ${scaled(CHAIN_ROUNDS)}`);
    const ty = a.top + 60 * a.u;
    if (this.state === 0 && now >= this.t0) {
      const inStep = (now - this.t0) % this.step() < this.step() * 0.75;
      ctx.fillStyle = COL_LINE;
      if (inStep) v.text(this.k < 0 ? String(this.startN) : this.ops[this.k] ?? '', a.cx, ty + 20 * a.u, v.fontBig, 'center');
      ctx.fillStyle = COL_MID;
      v.text(this.k < 0 ? 'start with' : `step ${this.k + 1} of ${this.ops.length}`, a.cx, ty - 30 * a.u, v.fontTiny, 'center');
    } else if (this.state >= 1) {
      ctx.fillStyle = this.state === 2 && !this.ok ? COL_ACCENT : COL_LINE;
      v.text(this.typed || (this.state === 1 ? '?' : ''), a.cx, ty + 20 * a.u, v.fontBig, 'center');
      ctx.fillStyle = COL_MID;
      v.text(this.state === 1 ? 'what is the total now? type it, then ok' : this.ok ? 'right' : `it was ${this.answer}`, a.cx, ty - 30 * a.u, v.fontTiny, 'center');
    }
    this.keys = keypad(v, a.cx, a.bottom - 6 * a.u, a.u, this.state === 1);
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 40 + this.best * 30,
      primary: { label: 'longest chain right', value: this.best, unit: 'steps' },
      lines: [
        { label: 'longest chain kept', value: `${this.best} steps` },
        { label: 'totals right', value: `${this.right} of ${this.round}` },
      ],
      saved: this.round >= 2,
    };
  }
}


export const BATCH20: MiniDef[] = [
  {
    id: 'opposite',
    name: 'Opposite',
    skill: 'reaction',
    blurb: 'Press the side away from the dot. Blocks of "same" and "opposite".',
    how: 'A dot appears left or right. In a SAME block press the hand on its side; in an OPPOSITE block press the other hand, fighting the pull toward the dot. Four blocks of ten, alternating. The results show what going opposite costs you.',
    input: 'keys',
    minKeys: 2,
    make: () => new Opposite(),
  },
  {
    id: 'line',
    name: 'Line',
    skill: 'judgement',
    blurb: 'Put a number on a number line.',
    how: 'A number appears above a line from 0 to 100 (later 1,000 and 10,000). Tap where it belongs. Sixteen numbers; scored on how close you land.',
    input: 'pointer',
    make: () => new NumberLine(),
  },
  {
    id: 'hold',
    name: 'Hold',
    skill: 'memory',
    blurb: 'Remember positions while checking sums in between.',
    how: 'A square lights on the grid; then a sum appears: true or false? (left hand false, right hand true, or tap). Then another square, another sum. At the end, tap the squares in the order they lit. Holding them through the sums is the point. Get it right and there is one more.',
    input: 'both',
    minKeys: 2,
    make: () => new Hold(),
  },
  {
    id: 'chain',
    name: 'Chain',
    skill: 'reasoning',
    blurb: 'Keep a running total through a string of operations.',
    how: 'A number shows, then operations one at a time: + 7, − 3, × 2, ÷ 2. Keep the running total in your head and type it at the end (number keys or the keypad, then Enter or ok). Get it right and the next chain is longer.',
    input: 'pointer',
    make: () => new Chain(),
  },
];
