// Ninth batch.
//   Relate  (reasoning) - "square above circle, circle above triangle": is the square above the triangle?
//   Matrix  (reasoning) - a three-by-three pattern with a gap. Which piece fits?
//   Balance (reasoning) - scales in balance. How many triangles weigh the same as a square?
//   Running (memory)    - digits stream by and stop without warning. Type the last few.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_WEAK, SND_TONE } from '../audio.ts';
import { SHAPE_CIRCLE, SHAPE_CROSS, SHAPE_DIAMOND, SHAPE_SQUARE, SHAPE_TRIANGLE, type View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import {
  Stair,
  arena,
  footer,
  handLabel,
  header,
  median,
  pct,
  shuffle,
  sideOf,
  type Arena,
  type Mini,
  type MiniDef,
  type MiniEnv,
  type MiniResult,
} from './kit.ts';

const SHAPES = [SHAPE_CIRCLE, SHAPE_SQUARE, SHAPE_TRIANGLE, SHAPE_DIAMOND, SHAPE_CROSS];
const GREY = '#6c6c74';

function rint(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

type Rect = [number, number, number, number];

function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
}

/** Four answer boxes in a row; returns their rectangles. */
function optionBoxes(a: Arena, y: number, n: number, w: number, h: number): Rect[] {
  const gap = 12 * a.u;
  const x0 = a.cx - (n * w + (n - 1) * gap) / 2;
  const out: Rect[] = [];
  for (let k = 0; k < n; k++) out.push([x0 + k * (w + gap), y, w, h]);
  return out;
}

// --- Relate -----------------------------------------------------------------------

const RELATE_N = 16;

interface Premise {
  a: number;
  b: number;
  /** true: "a above b"; false: "a below b". */
  above: boolean;
}

class Relate implements Mini {
  private env!: MiniEnv;
  private readonly items = new Stair(3, 1, 3, 5);
  private order: number[] = [];
  private premises: Premise[] = [];
  private q: Premise = { a: 0, b: 0, above: true };
  private truth = true;
  private hide = false;
  private state = 0; // 0 reading, 1 answering (premises hidden), 2 feedback
  private shownAt = 0;
  private at = 0;
  private i = 0;
  private right = 0;
  private lastOk = false;
  private times: number[] = [];
  private held = 0;
  private cx = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 300);
  }

  private make(now: number): void {
    const n = this.items.level;
    this.order = shuffle([...SHAPES]).slice(0, n);
    // Adjacent pairs, each phrased either way, in a shuffled order.
    this.premises = shuffle(
      this.order.slice(0, -1).map((s, k) => {
        const up = Math.random() < 0.5;
        return up ? { a: s, b: this.order[k + 1]!, above: true } : { a: this.order[k + 1]!, b: s, above: false };
      }),
    );
    // Ask about a pair that is not stated directly when possible.
    let i = 0;
    let j = 0;
    do {
      i = rint(0, n - 1);
      j = rint(0, n - 1);
    } while (i === j || (n > 3 && Math.abs(i - j) === 1 && Math.random() < 0.8));
    const above = Math.random() < 0.5;
    this.q = { a: this.order[i]!, b: this.order[j]!, above };
    this.truth = above ? i < j : i > j;
    // After a few, the premises disappear when the question comes.
    this.hide = this.i >= 6;
    this.state = this.hide ? 0 : 1;
    this.shownAt = now;
  }

  private answer(yes: boolean, ts: number): void {
    if (this.state !== 1 || ts < this.shownAt) return;
    this.lastOk = yes === this.truth;
    if (this.lastOk) {
      this.right++;
      this.times.push(ts - this.shownAt);
    }
    this.items.update(this.lastOk);
    this.env.sound(this.lastOk ? SND_CATCH : SND_FALSE);
    this.i++;
    this.state = 2;
    this.at = ts + (this.lastOk ? 700 : 1800);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (this.state === 0 && s) {
      // Ready: hide the premises and show the question.
      this.state = 1;
      this.shownAt = ts;
      return;
    }
    if (s) this.answer(s > 0, ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(x: number, _y: number, ts: number): void {
    if (this.state === 0) {
      this.state = 1;
      this.shownAt = ts;
      return;
    }
    this.answer(x >= this.cx, ts);
  }

  private line(v: View, p: Premise, cx: number, y: number, s: number, col: string): void {
    const ctx = v.ctx;
    ctx.fillStyle = col;
    v.shape(p.a, cx - 70 * s, y - 5 * v.dpr, 9 * s, true);
    v.text(p.above ? 'is above' : 'is below', cx, y, v.fontHud, 'center');
    v.shape(p.b, cx + 70 * s, y - 5 * v.dpr, 9 * s, true);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state < 2 && now - this.shownAt > 20000) this.answer(!this.truth, now);
    if (this.state === 2 && now >= this.at) {
      if (this.i >= RELATE_N) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    this.cx = a.cx;
    header(v, touch, 'shapes', String(this.items.level), 'question', `${Math.min(this.i + 1, RELATE_N)} / ${RELATE_N}`);
    const lh = 34 * a.u;
    const top = a.cy - (this.premises.length * lh) / 2 - 40 * a.u;
    if (this.state === 0 || !this.hide || this.state === 2) {
      this.premises.forEach((p, k) => this.line(v, p, a.cx, top + k * lh, a.u, this.state === 2 ? COL_MID : COL_LINE));
    }
    const qy = top + this.premises.length * lh + 40 * a.u;
    if (this.state === 0) {
      ctx.fillStyle = COL_MID;
      v.text('read them, then press either key (or tap) for the question', a.cx, qy, v.fontTiny, 'center');
    } else {
      ctx.fillStyle = COL_MID;
      v.text('so', a.cx, qy - 20 * a.u, v.fontTiny, 'center');
      this.line(v, this.q, a.cx, qy + 10 * a.u, a.u, this.state === 2 ? (this.lastOk ? COL_LINE : COL_ACCENT) : COL_LINE);
      ctx.fillStyle = COL_MID;
      if (this.state === 2) {
        // Show the true order, top to bottom.
        v.text(this.truth ? 'true' : 'false', a.cx, qy + 50 * a.u, v.fontTiny, 'center');
        this.order.forEach((s, k) => {
          ctx.fillStyle = COL_MID;
          v.shape(s, a.right - 30 * a.u, a.cy - ((this.order.length - 1) * 26 * a.u) / 2 + k * 26 * a.u, 8 * a.u, true);
        });
      } else {
        v.text(`false  ${handLabel(this.env, -1)}`, a.cx - 90 * a.u, qy + 60 * a.u, v.fontTiny, 'center');
        v.text(`true  ${handLabel(this.env, 1)}`, a.cx + 90 * a.u, qy + 60 * a.u, v.fontTiny, 'center');
      }
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right ? this.right * 50 + (this.items.level - 3) * 40 : 0,
      primary: { label: 'right', value: this.right, unit: `/ ${RELATE_N}` },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'median time when right', value: this.times.length ? `${(median(this.times) / 1000).toFixed(1)} s` : '–' },
        { label: 'shapes at the end', value: String(this.items.level) },
      ],
      saved: this.i >= 4,
    };
  }
}

// --- Matrix -----------------------------------------------------------------------

const MATRIX_N = 12;

interface Cell {
  shape: number;
  grey: boolean;
  count: number;
}

function sameCell(p: Cell, q: Cell): boolean {
  return p.shape === q.shape && p.grey === q.grey && p.count === q.count;
}

class Matrix implements Mini {
  private env!: MiniEnv;
  private level = 0;
  private cells: Cell[] = [];
  private opts: Cell[] = [];
  private rects: Rect[] = [];
  private state = 0;
  private shownAt = 0;
  private at = 0;
  private picked = -1;
  private i = 0;
  private right = 0;
  private times: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 300);
  }

  private make(now: number): void {
    // Each attribute follows a rule across the grid.
    //   0 constant, 1 changes along rows, 2 changes down columns, 3 each value once per row and column.
    const nRules = Math.min(3, 1 + Math.floor(this.level / 3));
    const attrs = shuffle([0, 1, 2]).slice(0, nRules);
    const rule = (attr: number) => (attrs.includes(attr) ? rint(1, this.level >= 4 ? 3 : 2) : 0);
    const rs = [rule(0), rule(1), rule(2)];
    const shapes = shuffle([...SHAPES]).slice(0, 3);
    const greys = Math.random() < 0.5 ? [false, true, false] : [true, false, true];
    const counts = Math.random() < 0.5 ? [1, 2, 3] : [3, 2, 1];
    const perm = shuffle([0, 1, 2]);
    const idx = (r: number, c: number, kind: number) => (kind === 0 ? 0 : kind === 1 ? c : kind === 2 ? r : perm[(r + c) % 3]!);
    this.cells = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        this.cells.push({ shape: shapes[idx(r, c, rs[0]!)]!, grey: greys[idx(r, c, rs[1]!)]!, count: counts[idx(r, c, rs[2]!)]! });
      }
    }
    const ans = this.cells[8]!;
    // Wrong options change one attribute, or two later on.
    const cand: Cell[] = [ans];
    let guard = 0;
    while (cand.length < 4 && guard++ < 100) {
      const w = { ...ans };
      const k = rint(0, 2);
      if (k === 0) w.shape = shapes.concat(SHAPES)[rint(0, 4)]!;
      else if (k === 1) w.grey = !w.grey;
      else w.count = ((w.count + rint(0, 1)) % 3) + 1;
      if (this.level >= 5 && Math.random() < 0.5) w.grey = !w.grey;
      if (!cand.some((x) => sameCell(x, w))) cand.push(w);
    }
    this.opts = shuffle(cand);
    this.state = 0;
    this.shownAt = now;
    this.picked = -1;
  }

  private choose(k: number, ts: number): void {
    if (this.state !== 0 || k < 0 || k >= this.opts.length) return;
    this.picked = k;
    const ok = sameCell(this.opts[k]!, this.cells[8]!);
    if (ok) {
      this.right++;
      this.times.push(ts - this.shownAt);
      this.level = Math.min(8, this.level + 1);
    } else this.level = Math.max(0, this.level - 1);
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.i++;
    this.state = 1;
    this.at = ts + (ok ? 800 : 1800);
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
      if (inRect(r, x, y)) this.choose(k, ts);
    });
  }

  private cell(v: View, c: Cell, x: number, y: number, s: number): void {
    const ctx = v.ctx;
    ctx.fillStyle = c.grey ? GREY : COL_LINE;
    const r = s * 0.12;
    for (let k = 0; k < c.count; k++) {
      v.shape(c.shape, x + s / 2 + (k - (c.count - 1) / 2) * r * 2.6, y + s / 2, r, true);
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now - this.shownAt > 45000) {
      this.i++;
      this.level = Math.max(0, this.level - 1);
      this.env.sound(SND_FALSE);
      this.state = 1;
      this.at = now + 1800;
    }
    if (this.state === 1 && now >= this.at) {
      if (this.i >= MATRIX_N) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'right', `${this.right} / ${this.i}`, 'puzzle', `${Math.min(this.i + 1, MATRIX_N)} / ${MATRIX_N}`);
    const avail = a.bottom - a.top - 30 * a.u;
    const s = Math.min(avail * 0.62 / 3, (a.right - a.left) / 4.2, 110 * a.u);
    const gx = a.cx - (s * 3) / 2;
    const gy = a.top + 10 * a.u;
    for (let k = 0; k < 9; k++) {
      const x = gx + (k % 3) * s;
      const y = gy + Math.floor(k / 3) * s;
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = dpr;
      ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
      if (k < 8 || this.state === 1) this.cell(v, this.cells[k]!, x, y, s);
      else {
        ctx.fillStyle = COL_MID;
        v.text('?', x + s / 2, y + s / 2 + 6 * dpr, v.fontHud, 'center');
      }
    }
    const os = Math.min(s * 0.9, (a.right - a.left - 40 * a.u) / 4.4);
    this.rects = optionBoxes(a, gy + s * 3 + 22 * a.u, this.opts.length, os, os);
    this.opts.forEach((o, k) => {
      const [x, y, w] = this.rects[k]!;
      const isAns = sameCell(o, this.cells[8]!);
      ctx.strokeStyle = this.state === 1 && isAns ? COL_LINE : this.state === 1 && k === this.picked ? COL_ACCENT : COL_DIM;
      ctx.lineWidth = dpr;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, w - 1);
      this.cell(v, o, x, y, w);
      ctx.fillStyle = COL_DIM;
      v.text(String(k + 1), x + w / 2, y + w + 14 * dpr, v.fontTiny, 'center');
    });
    if (this.i === 0 && this.state === 0) {
      ctx.fillStyle = COL_MID;
      v.text('each row and column follows a rule. which piece fills the gap? tap it, or press 1 to 4', a.cx, a.bottom - 6 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 60 + this.level * 25,
      primary: { label: 'right', value: this.right, unit: `/ ${MATRIX_N}` },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'median time when right', value: this.times.length ? `${(median(this.times) / 1000).toFixed(1)} s` : '–' },
        { label: 'level reached', value: String(this.level + 1) },
      ],
      saved: this.i >= 4,
    };
  }
}

// --- Balance ----------------------------------------------------------------------

const BALANCE_N = 12;

interface Pan {
  /** Shape id and how many, per side. */
  left: [number, number][];
  right: [number, number][];
}

class Balance implements Mini {
  private env!: MiniEnv;
  private level = 0;
  private scales: Pan[] = [];
  private ask = 0;
  private unit = 0;
  private answer = 0;
  private opts: number[] = [];
  private rects: Rect[] = [];
  private state = 0;
  private shownAt = 0;
  private at = 0;
  private picked = -1;
  private i = 0;
  private right = 0;
  private times: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 300);
  }

  private make(now: number): void {
    const [s0, s1, s2, s3] = shuffle([...SHAPES]);
    this.scales = [];
    const kind = this.level < 3 ? 0 : this.level < 6 ? 1 : 2;
    if (kind === 0) {
      // A = m B, B = n C. A = ? C.
      const m = rint(2, 3);
      const n = rint(2, 3);
      this.scales.push({ left: [[s0!, 1]], right: [[s1!, m]] }, { left: [[s1!, 1]], right: [[s2!, n]] });
      this.ask = s0!;
      this.unit = s2!;
      this.answer = m * n;
    } else if (kind === 1) {
      // A = m B, B = n C, C = p D. A = ? D (kept small), or a shared pan.
      if (Math.random() < 0.5) {
        const m = 2;
        const n = rint(2, 3);
        const p = 2;
        this.scales.push({ left: [[s0!, 1]], right: [[s1!, m]] }, { left: [[s1!, 1]], right: [[s2!, n]] }, { left: [[s2!, 1]], right: [[s3!, p]] });
        this.ask = s0!;
        this.unit = s3!;
        this.answer = m * n * p;
      } else {
        // A + B = k C, B = n C. A = ? C.
        const n = rint(1, 3);
        const aW = rint(1, 4);
        this.scales.push({ left: [[s0!, 1], [s1!, 1]], right: [[s2!, aW + n]] }, { left: [[s1!, 1]], right: [[s2!, n]] });
        this.ask = s0!;
        this.unit = s2!;
        this.answer = aW;
      }
    } else {
      // 2A = B + 2C, B = 2C. A = ? C. Or A + 2B = 7C, A = B + C.
      if (Math.random() < 0.5) {
        const b = rint(1, 3) * 2;
        const c2 = 2;
        const aW = (b + c2) / 2;
        this.scales.push({ left: [[s0!, 2]], right: [[s1!, 1], [s2!, 2]] }, { left: [[s1!, 1]], right: [[s2!, b]] });
        this.ask = s0!;
        this.unit = s2!;
        this.answer = aW;
      } else {
        const bW = rint(1, 3);
        const aW = bW + rint(1, 2);
        this.scales.push({ left: [[s0!, 1], [s1!, 2]], right: [[s2!, aW + 2 * bW]] }, { left: [[s0!, 1]], right: [[s1!, 1], [s2!, aW - bW]] });
        this.ask = s0!;
        this.unit = s2!;
        this.answer = aW;
      }
    }
    const cand = new Set<number>([this.answer]);
    for (const x of shuffle([this.answer + 1, this.answer - 1, this.answer + 2, this.answer * 2, this.answer - 2, this.answer + 3])) if (cand.size < 4 && x > 0) cand.add(x);
    this.opts = shuffle([...cand]);
    this.state = 0;
    this.shownAt = now;
    this.picked = -1;
  }

  private choose(k: number, ts: number): void {
    if (this.state !== 0 || k < 0 || k >= this.opts.length) return;
    this.picked = k;
    const ok = this.opts[k] === this.answer;
    if (ok) {
      this.right++;
      this.times.push(ts - this.shownAt);
      this.level = Math.min(8, this.level + 1);
    } else this.level = Math.max(0, this.level - 1);
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.i++;
    this.state = 1;
    this.at = ts + (ok ? 800 : 1800);
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
      if (inRect(r, x, y)) this.choose(k, ts);
    });
  }

  private pan(v: View, items: [number, number][], cx: number, y: number, r: number): void {
    const flat: number[] = [];
    for (const [s, n] of items) for (let k = 0; k < n; k++) flat.push(s);
    const per = Math.min(flat.length, 4);
    flat.forEach((s, k) => {
      const row = Math.floor(k / per);
      const col = k % per;
      const inRow = Math.min(per, flat.length - row * per);
      v.ctx.fillStyle = COL_LINE;
      v.shape(s, cx + (col - (inRow - 1) / 2) * r * 2.5, y - r - row * r * 2.5, r, true);
    });
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now - this.shownAt > 45000) {
      this.i++;
      this.level = Math.max(0, this.level - 1);
      this.env.sound(SND_FALSE);
      this.state = 1;
      this.at = now + 1800;
    }
    if (this.state === 1 && now >= this.at) {
      if (this.i >= BALANCE_N) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'right', `${this.right} / ${this.i}`, 'puzzle', `${Math.min(this.i + 1, BALANCE_N)} / ${BALANCE_N}`);
    const n = this.scales.length;
    const sw = Math.min((a.right - a.left) / n - 20 * a.u, 260 * a.u);
    const r = Math.min(9 * a.u, sw / 24);
    const y = a.top + 120 * a.u;
    this.scales.forEach((sc, k) => {
      const cx = a.cx + (k - (n - 1) / 2) * (sw + 20 * a.u);
      ctx.fillStyle = COL_MID;
      ctx.fillRect(cx - sw * 0.42, y, sw * 0.84, 2 * dpr);
      ctx.beginPath();
      ctx.moveTo(cx, y + 2 * dpr);
      ctx.lineTo(cx - 10 * a.u, y + 22 * a.u);
      ctx.lineTo(cx + 10 * a.u, y + 22 * a.u);
      ctx.closePath();
      ctx.fill();
      this.pan(v, sc.left, cx - sw * 0.24, y - 4 * dpr, r);
      this.pan(v, sc.right, cx + sw * 0.24, y - 4 * dpr, r);
    });
    // The question.
    const qy = y + 80 * a.u;
    ctx.fillStyle = COL_LINE;
    v.shape(this.ask, a.cx - 60 * a.u, qy - 5 * dpr, 10 * a.u, true);
    v.text(`= ${this.state === 1 ? this.answer : '?'} ×`, a.cx, qy, v.fontHud, 'center');
    v.shape(this.unit, a.cx + 60 * a.u, qy - 5 * dpr, 10 * a.u, true);
    const ow = Math.min(80 * a.u, (a.right - a.left - 40 * a.u) / 4.4);
    this.rects = optionBoxes(a, qy + 30 * a.u, this.opts.length, ow, ow * 0.7);
    this.opts.forEach((o, k) => {
      const [x, yy, w, h] = this.rects[k]!;
      ctx.strokeStyle = this.state === 1 && o === this.answer ? COL_LINE : this.state === 1 && k === this.picked ? COL_ACCENT : COL_DIM;
      ctx.lineWidth = dpr;
      ctx.strokeRect(x + 0.5, yy + 0.5, w - 1, h - 1);
      ctx.fillStyle = COL_LINE;
      v.text(String(o), x + w / 2, yy + h / 2 + 6 * dpr, v.fontHud, 'center');
      ctx.fillStyle = COL_DIM;
      v.text(String(k + 1), x + w / 2, yy + h + 14 * dpr, v.fontTiny, 'center');
    });
    if (this.i === 0 && this.state === 0) {
      ctx.fillStyle = COL_MID;
      v.text('every scale balances. how many of the right shape weigh the same as the left? tap or press 1 to 4', a.cx, a.bottom - 6 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 60 + this.level * 25,
      primary: { label: 'right', value: this.right, unit: `/ ${BALANCE_N}` },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'median time when right', value: this.times.length ? `${(median(this.times) / 1000).toFixed(1)} s` : '–' },
        { label: 'level reached', value: String(this.level + 1) },
      ],
      saved: this.i >= 4,
    };
  }
}

// --- Running ----------------------------------------------------------------------

const RUN_ROUNDS = 10;

class Running implements Mini {
  private env!: MiniEnv;
  private readonly n = new Stair(3, 1, 2, 9);
  private stream = '';
  private typed = '';
  private state = 0; // 0 streaming, 1 typing, 2 feedback
  private t0 = 0;
  private gap = 750;
  private at = 0;
  private round = 0;
  private ok = false;
  private best = 0;
  private hits = 0;
  private keys: [number, number, number, number, string][] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 600);
  }

  private make(now: number): void {
    const want = this.n.level;
    // The stream is a few digits longer than what you report, by a random amount.
    const len = want + rint(2, 8);
    let s = '';
    for (let k = 0; k < len; k++) {
      let d = String(rint(0, 9));
      while (s.endsWith(d)) d = String(rint(0, 9));
      s += d;
    }
    this.stream = s;
    this.typed = '';
    this.t0 = now;
    this.state = 0;
  }

  private want(): string {
    return this.stream.slice(-this.n.level);
  }

  private type(d: string, ts: number): void {
    if (this.state !== 1) return;
    if (d === '<') {
      this.typed = this.typed.slice(0, -1);
      return;
    }
    this.typed += d;
    this.env.sound(SND_TONE + (Number(d) % 7));
    if (this.typed.length === this.n.level) {
      const want = this.want();
      this.ok = this.typed === want;
      if (this.ok) {
        this.hits++;
        this.best = Math.max(this.best, this.n.level);
        this.env.sound(SND_CATCH);
      } else this.env.sound(SND_FALSE);
      this.n.update(this.ok, 1);
      this.round++;
      this.state = 2;
      this.at = ts + 1600;
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
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    for (const [kx, ky, w, h, d] of this.keys) if (x >= kx && x <= kx + w && y >= ky && y <= ky + h) this.type(d, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const k = Math.floor((now - this.t0) / this.gap);
    if (this.state === 0 && k >= this.stream.length) {
      this.state = 1;
      this.env.sound(SND_TAP_WEAK);
    }
    if (this.state === 2 && now >= this.at) {
      if (this.round >= RUN_ROUNDS) return true;
      this.make(now + 300);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'last', String(this.n.level), 'round', `${Math.min(this.round + 1, RUN_ROUNDS)} / ${RUN_ROUNDS}`);
    const ty = a.top + 60 * a.u;
    if (this.state === 0) {
      const on = now >= this.t0 && (now - this.t0) % this.gap < this.gap * 0.7;
      if (on && k >= 0) {
        ctx.fillStyle = COL_LINE;
        v.text(this.stream[k]!, a.cx, ty + 10 * a.u, v.fontBig, 'center');
      }
      ctx.fillStyle = COL_MID;
      v.text(`keep the last ${this.n.level} in mind. it stops without warning`, a.cx, ty - 40 * a.u, v.fontTiny, 'center');
    } else {
      ctx.fillStyle = this.state === 2 && !this.ok ? COL_MID : COL_LINE;
      v.text(this.typed.padEnd(this.n.level, '_').split('').join(' '), a.cx, ty + 10 * a.u, v.fontBig, 'center');
      ctx.fillStyle = this.state === 1 ? COL_ACCENT : COL_MID;
      v.text(this.state === 1 ? `stopped. type the last ${this.n.level}` : this.ok ? 'right' : `it was ${this.want()}`, a.cx, ty - 40 * a.u, v.fontTiny, 'center');
    }
    // Keypad.
    const kw = Math.min(70 * a.u, (a.right - a.left) / 3.6);
    const kh = kw * 0.62;
    const gap = 8 * a.u;
    const x0 = a.cx - (kw * 3 + gap * 2) / 2;
    const y0 = Math.max(ty + 60 * a.u, a.bottom - (kh * 4 + gap * 3));
    const labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '<', '0', ''];
    this.keys = [];
    labels.forEach((d, i) => {
      if (!d) return;
      const x = x0 + (i % 3) * (kw + gap);
      const y = y0 + Math.floor(i / 3) * (kh + gap);
      this.keys.push([x, y, kw, kh, d]);
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = dpr;
      ctx.strokeRect(x + 0.5, y + 0.5, kw - 1, kh - 1);
      ctx.fillStyle = this.state === 1 ? COL_LINE : COL_DIM;
      v.text(d === '<' ? 'del' : d, x + kw / 2, y + kh / 2 + 5 * dpr, v.fontHud, 'center');
    });
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.best * 100 + this.hits * 20,
      primary: { label: 'longest right', value: this.best, unit: 'digits' },
      lines: [
        { label: 'longest right', value: `${this.best} digits` },
        { label: 'rounds right', value: `${this.hits} of ${this.round}` },
        { label: 'accuracy', value: pct(this.hits / (this.round || 1)) },
      ],
      saved: this.round >= 3,
    };
  }
}

export const BATCH9: MiniDef[] = [
  {
    id: 'relate',
    name: 'Relate',
    skill: 'reasoning',
    blurb: 'Square above circle, circle above triangle. Is the square above the triangle?',
    how: 'A few statements about which shape is above which. Then a question: true or false? Right hand for true, left for false (or tap that side). Get two right and there is one more shape; after six, the statements vanish when the question appears.',
    input: 'both',
    minKeys: 2,
    make: () => new Relate(),
  },
  {
    id: 'matrix',
    name: 'Matrix',
    skill: 'reasoning',
    blurb: 'A three-by-three pattern with a gap. Which piece fits?',
    how: 'Shape, shade and count each follow a rule across the rows and down the columns. Work out the rules and pick the piece that completes the grid: tap it or press 1 to 4. The rules stack up as you go.',
    input: 'pointer',
    make: () => new Matrix(),
  },
  {
    id: 'balance',
    name: 'Balance',
    skill: 'reasoning',
    blurb: 'The scales balance. How many triangles weigh the same as a square?',
    how: 'Each scale is in balance. Use them to work out how many of one shape weigh the same as another: tap the answer or press 1 to 4. Later puzzles need two steps, or taking one scale away from another.',
    input: 'pointer',
    make: () => new Balance(),
  },
  {
    id: 'running',
    name: 'Running',
    skill: 'memory',
    blurb: 'Digits stream by and stop without warning. Type the last few.',
    how: 'Digits appear one at a time and stop at an unpredictable point. Type the last few you saw, in order, on the keypad or number keys. You have to keep updating what you hold, which is harder than it sounds.',
    input: 'pointer',
    make: () => new Running(),
  },
];
