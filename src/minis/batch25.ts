// Twenty-fifth batch: puzzles and monitoring, each its own kind of thinking.
//   Schulte (attention) - tap 1 to 25, scattered on a grid, in order.
//   Trail   (attention) - connect 1-A-2-B-3-C, switching between numbers and letters.
//   Maze    (reasoning) - arrow keys through a maze to the exit.
//   Hanoi   (reasoning) - move the tower peg to peg, never a big disk on a small one.
//   Slide   (reasoning) - put a scrambled 3x3 sliding puzzle back in order.
//   Toggle  (reasoning) - each tap flips a tile and its neighbours: turn them all off.
//   Latin   (reasoning) - fill a 4x4 square so each row and column has 1 to 4 once.
//   Target  (reasoning) - pick numbers that add up to exactly the target.
//   Gauges  (attention) - four needles drift; reset any that creep into the red.
//   Tally   (attention) - shapes pop up all over: keep a running count of the squares.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_LURCH, SND_TAP_WEAK, SND_TONE, SND_UI } from '../audio.ts';
import { SHAPE_CIRCLE, SHAPE_SQUARE, SHAPE_TRIANGLE, type View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { keypad } from './batch20.ts';
import { arena, footer, header, mean, median, message, pct, scaled, shuffle, type Arena, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;

function rint(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

type Rect = [number, number, number, number];

function inside(r: Rect, x: number, y: number): boolean {
  return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
}

/** A square grid of n x n cells centred in the arena; returns cell rectangles row by row. */
function gridRects(a: Arena, n: number, maxCell = 64): Rect[] {
  const cell = Math.min(maxCell * a.u, (a.bottom - a.top - 30 * a.u) / n, (a.right - a.left) / n);
  const x0 = a.cx - (cell * n) / 2;
  const y0 = a.cy - (cell * n) / 2 + 10 * a.u;
  const out: Rect[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) out.push([x0 + c * cell, y0 + r * cell, cell, cell]);
  return out;
}

/** A one-line instruction just inside the bottom (or top) of the arena, clear of the footer. */
function hint(v: View, a: Arena, text: string, top = false): void {
  v.ctx.fillStyle = COL_MID;
  v.text(text, a.cx, top ? a.top + 4 * a.u : a.bottom - 14 * a.u, v.fontTiny, 'center');
}

function cellText(v: View, r: Rect, text: string, color: string, font = v.fontHud): void {
  v.ctx.fillStyle = color;
  v.text(text, r[0] + r[2] / 2, r[1] + r[3] / 2 + 6 * v.dpr, font, 'center');
}

function cellBox(v: View, r: Rect, stroke: string, fill?: string): void {
  const ctx = v.ctx;
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(r[0] + 3, r[1] + 3, r[2] - 6, r[3] - 6);
  }
  ctx.strokeStyle = stroke;
  ctx.lineWidth = v.dpr;
  ctx.strokeRect(r[0] + 3.5, r[1] + 3.5, r[2] - 7, r[3] - 7);
}

// --- Schulte ------------------------------------------------------------------------

class Schulte implements Mini {
  private env!: MiniEnv;
  private at = 0;
  private unsolved = 0;
  private readonly tables = scaled(3);
  private t = 0;
  private nums: number[] = [];
  private next = 1;
  private startAt = 0;
  private times: number[] = [];
  private errors = 0;
  private rects: Rect[] = [];
  private flash = -1;
  private flashAt = 0;
  private state = 0; // 0 table, 1 between

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now);
  }

  private make(now: number): void {
    this.nums = shuffle([...Array(25).keys()].map((k) => k + 1));
    this.next = 1;
    this.startAt = now;
    this.state = 0;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 0) return;
    const k = this.rects.findIndex((r) => inside(r, x, y));
    if (k < 0) return;
    if (this.nums[k] === this.next) {
      this.next++;
      this.env.sound(SND_TAP_WEAK);
      if (this.next > 25) {
        this.times.push(ts - this.startAt);
        this.env.sound(SND_CATCH);
        this.t++;
        this.state = 1;
        this.at = ts + 900;
      }
    } else {
      this.errors++;
      this.flash = k;
      this.flashAt = ts;
      this.env.sound(SND_FALSE);
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    // Nobody is left stuck: past the limit this one is skipped as unsolved.
    if (this.state === 0 && now - this.startAt > 90000) {
      this.unsolved++;
      this.t++;
      this.state = 1;
      this.at = now + 900;
      this.env.sound(SND_LURCH);
    }
    if (this.state === 1 && now >= this.at) {
      if (this.t >= this.tables) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    header(v, touch, 'find', this.state === 0 ? String(this.next) : '–', 'table', `${Math.min(this.t + 1, this.tables)} / ${this.tables}`);
    this.rects = gridRects(a, 5, 66);
    this.rects.forEach((r, k) => {
      const n = this.nums[k]!;
      const done = n < this.next;
      cellBox(v, r, k === this.flash && now - this.flashAt < 300 ? COL_ACCENT : COL_FAINT);
      cellText(v, r, String(n), done ? COL_DIM : COL_LINE);
    });
    if (this.t === 0 && this.next === 1) hint(v, a, 'tap 1, then 2, then 3… up to 25, as fast as you can');
    if (this.state === 1 && this.times.length) message(v, { ...a, cy: a.top + 10 * a.u }, `${(this.times[this.times.length - 1]! / 1000).toFixed(1)} s`, '');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.times);
    return {
      score: this.times.length ? Math.max(0, Math.round((60000 - m) / 60 - this.errors * 5)) : 0,
      primary: { label: 'time per table', value: m / 1000, unit: 's', lower: true, decimals: 1 },
      lines: [
        { label: 'tables', value: String(this.times.length) },
        { label: 'wrong taps', value: String(this.errors) },
        { label: 'fastest table', value: this.times.length ? `${(Math.min(...this.times) / 1000).toFixed(1)} s` : '–' },
      ],
      saved: this.times.length >= 1,
    };
  }
}

// --- Trail --------------------------------------------------------------------------

class Trail implements Mini {
  private env!: MiniEnv;
  private at = 0;
  private unsolved = 0;
  private readonly boards = scaled(3);
  private b = 0;
  private labels: string[] = [];
  private pts: [number, number][] = [];
  private next = 0;
  private startAt = 0;
  private times: number[] = [];
  private errors = 0;
  private geo = { x0: 0, y0: 0, w: 1, h: 1, r: 20 };
  private flash = -1;
  private flashAt = 0;
  private state = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now);
  }

  private make(now: number): void {
    const n = 7 + Math.min(3, this.b);
    this.labels = [];
    for (let i = 0; i < n; i++) {
      this.labels.push(String(i + 1));
      if (i < n - 1) this.labels.push(String.fromCharCode(65 + i));
    }
    // Scatter, kept apart from each other.
    this.pts = [];
    for (const _ of this.labels) {
      let p: [number, number] = [0.5, 0.5];
      for (let t = 0; t < 200; t++) {
        p = [0.06 + Math.random() * 0.88, 0.06 + Math.random() * 0.88];
        if (this.pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.14)) break;
      }
      this.pts.push(p);
    }
    this.next = 0;
    this.startAt = now;
    this.state = 0;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 0) return;
    const g = this.geo;
    const k = this.pts.findIndex((p) => Math.hypot(g.x0 + p[0] * g.w - x, g.y0 + p[1] * g.h - y) < g.r * 1.3);
    if (k < 0) return;
    if (k === this.next) {
      this.next++;
      this.env.sound(SND_TAP_WEAK);
      if (this.next >= this.labels.length) {
        this.times.push(ts - this.startAt);
        this.env.sound(SND_CATCH);
        this.b++;
        this.state = 1;
        this.at = ts + 900;
      }
    } else if (k > this.next) {
      this.errors++;
      this.flash = k;
      this.flashAt = ts;
      this.env.sound(SND_FALSE);
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    // Nobody is left stuck: past the limit this one is skipped as unsolved.
    if (this.state === 0 && now - this.startAt > 90000) {
      this.unsolved++;
      this.b++;
      this.state = 1;
      this.at = now + 900;
      this.env.sound(SND_LURCH);
    }
    if (this.state === 1 && now >= this.at) {
      if (this.b >= this.boards) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'next', this.labels[this.next] ?? '–', 'board', `${Math.min(this.b + 1, this.boards)} / ${this.boards}`);
    const w = Math.min(a.right - a.left, 640 * a.u);
    const h = a.bottom - a.top - 20 * a.u;
    this.geo = { x0: a.cx - w / 2, y0: a.top + 10 * a.u, w, h, r: 17 * a.u };
    const g = this.geo;
    const P = (k: number): [number, number] => [g.x0 + this.pts[k]![0] * g.w, g.y0 + this.pts[k]![1] * g.h];
    // The path so far.
    ctx.strokeStyle = COL_MID;
    ctx.lineWidth = 1.5 * v.dpr;
    ctx.beginPath();
    for (let k = 0; k < this.next; k++) {
      const [x, y] = P(k);
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
    this.labels.forEach((lab, k) => {
      const [x, y] = P(k);
      ctx.beginPath();
      ctx.arc(x, y, g.r, 0, TAU);
      ctx.fillStyle = k < this.next ? COL_FAINT : '#0a0a0b';
      ctx.fill();
      ctx.strokeStyle = k === this.flash && now - this.flashAt < 300 ? COL_ACCENT : k < this.next ? COL_DIM : COL_MID;
      ctx.stroke();
      ctx.fillStyle = k < this.next ? COL_DIM : COL_LINE;
      v.text(lab, x, y + 5 * v.dpr, v.fontTiny, 'center');
    });
    if (this.b === 0 && this.next === 0) {
      ctx.fillStyle = COL_MID;
      v.text('tap 1, then A, then 2, then B… alternating numbers and letters', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.times);
    return {
      score: this.times.length ? Math.max(0, Math.round((60000 - m) / 60 - this.errors * 8)) : 0,
      primary: { label: 'time per board', value: m / 1000, unit: 's', lower: true, decimals: 1 },
      lines: [
        { label: 'boards', value: String(this.times.length) },
        { label: 'wrong taps', value: String(this.errors) },
      ],
      saved: this.times.length >= 1,
    };
  }
}

// --- Maze ---------------------------------------------------------------------------

class Maze implements Mini {
  private env!: MiniEnv;
  private unsolved = 0;
  private readonly total = scaled(5);
  private m = 0;
  private n = 7;
  /** walls[cell] bitmask: 1 up, 2 right, 4 down, 8 left. */
  private walls: number[] = [];
  private pos = 0;
  private startAt = 0;
  private times: number[] = [];
  private bumps = 0;
  private state = 0;
  private at = 0;
  private trail: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now);
  }

  private make(now: number): void {
    this.n = 7 + this.m * 2;
    const n = this.n;
    this.walls = Array<number>(n * n).fill(15);
    // Depth-first carve.
    const seen = new Set<number>([0]);
    const stack = [0];
    while (stack.length) {
      const c = stack[stack.length - 1]!;
      const r = Math.floor(c / n);
      const k = c % n;
      const opts: [number, number, number][] = [];
      if (r > 0 && !seen.has(c - n)) opts.push([c - n, 1, 4]);
      if (k < n - 1 && !seen.has(c + 1)) opts.push([c + 1, 2, 8]);
      if (r < n - 1 && !seen.has(c + n)) opts.push([c + n, 4, 1]);
      if (k > 0 && !seen.has(c - 1)) opts.push([c - 1, 8, 2]);
      if (!opts.length) {
        stack.pop();
        continue;
      }
      const [nx, bit, back] = opts[Math.floor(Math.random() * opts.length)]!;
      this.walls[c]! &= ~bit;
      this.walls[nx]! &= ~back;
      seen.add(nx);
      stack.push(nx);
    }
    this.pos = 0;
    this.trail = [0];
    this.startAt = now;
    this.state = 0;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const dirs: Record<string, [number, number]> = { ArrowUp: [1, -this.n], KeyW: [1, -this.n], ArrowRight: [2, 1], KeyD: [2, 1], ArrowDown: [4, this.n], KeyS: [4, this.n], ArrowLeft: [8, -1], KeyA: [8, -1] };
    const d = dirs[code];
    if (!d) return false;
    if (this.state !== 0) return true;
    if (this.walls[this.pos]! & d[0]) {
      this.bumps++;
      this.env.sound(SND_TAP_WEAK);
      return true;
    }
    this.pos += d[1];
    this.trail.push(this.pos);
    this.env.sound(SND_UI);
    if (this.pos === this.n * this.n - 1) {
      this.times.push(ts - this.startAt);
      this.env.sound(SND_CATCH);
      this.m++;
      this.state = 1;
      this.at = ts + 800;
    }
    return true;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    // Nobody is left stuck: past the limit this one is skipped as unsolved.
    if (this.state === 0 && now - this.startAt > 90000) {
      this.unsolved++;
      this.m++;
      this.state = 1;
      this.at = now + 900;
      this.env.sound(SND_LURCH);
    }
    if (this.state === 1 && now >= this.at) {
      if (this.m >= this.total) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'maze', `${Math.min(this.m + 1, this.total)} / ${this.total}`, 'time', `${((now - this.startAt) / 1000).toFixed(0)} s`);
    const n = this.n;
    const cell = Math.min((a.bottom - a.top - 30 * a.u) / n, (a.right - a.left) / n);
    const x0 = a.cx - (cell * n) / 2;
    const y0 = a.cy - (cell * n) / 2;
    ctx.strokeStyle = COL_MID;
    ctx.lineWidth = 1.5 * v.dpr;
    ctx.beginPath();
    for (let c = 0; c < n * n; c++) {
      const x = x0 + (c % n) * cell;
      const y = y0 + Math.floor(c / n) * cell;
      const w = this.walls[c]!;
      if (w & 1) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + cell, y);
      }
      if (w & 8) {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + cell);
      }
      if (c % n === n - 1 && w & 2) {
        ctx.moveTo(x + cell, y);
        ctx.lineTo(x + cell, y + cell);
      }
      if (Math.floor(c / n) === n - 1 && w & 4) {
        ctx.moveTo(x, y + cell);
        ctx.lineTo(x + cell, y + cell);
      }
    }
    ctx.stroke();
    // Where you have been, the exit, and you.
    ctx.fillStyle = COL_FAINT;
    for (const c of this.trail) ctx.fillRect(x0 + (c % n) * cell + cell * 0.35, y0 + Math.floor(c / n) * cell + cell * 0.35, cell * 0.3, cell * 0.3);
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(x0 + (n - 1) * cell + cell * 0.25, y0 + (n - 1) * cell + cell * 0.25, cell * 0.5, cell * 0.5);
    ctx.fillStyle = COL_ACCENT;
    ctx.beginPath();
    ctx.arc(x0 + (this.pos % n) * cell + cell / 2, y0 + Math.floor(this.pos / n) * cell + cell / 2, cell * 0.3, 0, TAU);
    ctx.fill();
    if (this.m === 0 && this.trail.length < 2) hint(v, a, 'arrow keys (or W A S D) to the white square in the far corner');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.times);
    return {
      score: this.times.length * 60 + Math.max(0, Math.round(300 - m / 100)),
      primary: { label: 'mazes solved', value: this.times.length, unit: '' },
      lines: [
        { label: 'average time', value: this.times.length ? `${(m / 1000).toFixed(1)} s` : '–' },
        { label: 'walls bumped', value: String(this.bumps) },
      ],
      saved: this.times.length >= 1,
    };
  }
}

// --- Hanoi --------------------------------------------------------------------------

class Hanoi implements Mini {
  private env!: MiniEnv;
  private unsolved = 0;
  private readonly puzzles = scaled(3);
  private p = 0;
  private disks = 3;
  private pegs: number[][] = [[], [], []];
  private held = -1;
  private moves = 0;
  private startAt = 0;
  private eff: number[] = [];
  private times: number[] = [];
  private pegRects: Rect[] = [];
  private state = 0;
  private at = 0;
  private bad = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now);
  }

  private make(now: number): void {
    this.disks = 3 + Math.min(2, this.p);
    this.pegs = [[...Array(this.disks).keys()].map((k) => this.disks - k), [], []];
    this.held = -1;
    this.moves = 0;
    this.startAt = now;
    this.state = 0;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const k = ['Digit1', 'Digit2', 'Digit3'].indexOf(code);
    if (k < 0) return false;
    this.choose(k, ts);
    return true;
  }

  pointer(x: number, y: number, ts: number): void {
    const k = this.pegRects.findIndex((r) => inside(r, x, y));
    if (k >= 0) this.choose(k, ts);
  }

  private choose(k: number, ts: number): void {
    if (this.state !== 0) return;
    if (this.held < 0) {
      if (this.pegs[k]!.length) {
        this.held = k;
        this.env.sound(SND_UI);
      }
      return;
    }
    if (k === this.held) {
      this.held = -1;
      return;
    }
    const from = this.pegs[this.held]!;
    const to = this.pegs[k]!;
    const d = from[from.length - 1]!;
    if (to.length && to[to.length - 1]! < d) {
      this.bad++;
      this.env.sound(SND_FALSE);
      this.held = -1;
      return;
    }
    to.push(from.pop()!);
    this.moves++;
    this.held = -1;
    this.env.sound(SND_TAP_WEAK);
    if (this.pegs[2]!.length === this.disks) {
      const best = 2 ** this.disks - 1;
      this.eff.push(best / this.moves);
      this.times.push(ts - this.startAt);
      this.env.sound(SND_CATCH);
      this.p++;
      this.state = 1;
      this.at = ts + 1000;
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    // Nobody is left stuck: past the limit this one is skipped as unsolved.
    if (this.state === 0 && now - this.startAt > 120000) {
      this.unsolved++;
      this.p++;
      this.state = 1;
      this.at = now + 900;
      this.env.sound(SND_LURCH);
    }
    if (this.state === 1 && now >= this.at) {
      if (this.p >= this.puzzles) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'moves', `${this.moves}  (best ${2 ** this.disks - 1})`, 'tower', `${Math.min(this.p + 1, this.puzzles)} / ${this.puzzles}`);
    const w = Math.min(a.right - a.left, 660 * a.u);
    const base = a.cy + 90 * a.u;
    const dh = 20 * a.u;
    this.pegRects = [];
    for (let k = 0; k < 3; k++) {
      const cx = a.cx + (k - 1) * (w / 3);
      this.pegRects.push([cx - w / 6, base - 200 * a.u, w / 3, 230 * a.u]);
      ctx.fillStyle = k === 2 ? COL_MID : COL_DIM;
      ctx.fillRect(cx - 1.5 * v.dpr, base - (this.disks + 1.5) * dh, 3 * v.dpr, (this.disks + 1.5) * dh);
      ctx.fillRect(cx - w / 7, base, (w / 7) * 2, 2 * v.dpr);
      this.pegs[k]!.forEach((d, i) => {
        const dw = ((w / 7) * 2 * (0.25 + (0.75 * d) / this.disks)) / 1;
        const lift = this.held === k && i === this.pegs[k]!.length - 1 ? 40 * a.u : 0;
        ctx.fillStyle = lift ? COL_ACCENT : COL_LINE;
        ctx.fillRect(cx - dw / 2, base - (i + 1) * dh - lift + 2, dw, dh - 4);
      });
      ctx.fillStyle = COL_MID;
      v.text(k === 2 ? `3 · goal` : String(k + 1), cx, base + 26 * a.u, v.fontTiny, 'center');
    }
    if (this.p === 0 && this.moves === 0) hint(v, a, 'move the whole tower to peg 3: tap a peg to lift its top disk, tap another to drop it. never a bigger disk on a smaller one', true);
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const e = mean(this.eff);
    return {
      score: this.eff.length ? Math.round(e * 100 * this.eff.length * 3) : 0,
      primary: { label: 'efficiency (fewest moves ÷ yours)', value: Math.round(e * 100), unit: '%' },
      lines: [
        { label: 'towers moved', value: String(this.eff.length) },
        { label: 'average time', value: this.times.length ? `${(mean(this.times) / 1000).toFixed(0)} s` : '–' },
        { label: 'illegal moves tried', value: String(this.bad) },
      ],
      saved: this.eff.length >= 1,
    };
  }
}

// --- Slide --------------------------------------------------------------------------

class Slide implements Mini {
  private env!: MiniEnv;
  private unsolved = 0;
  private readonly puzzles = scaled(4);
  private p = 0;
  private tiles: number[] = [];
  private moves = 0;
  private startAt = 0;
  private times: number[] = [];
  private moveCounts: number[] = [];
  private rects: Rect[] = [];
  private state = 0;
  private at = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now);
  }

  private make(now: number): void {
    // Scramble from solved with random legal moves, so it is always solvable.
    this.tiles = [1, 2, 3, 4, 5, 6, 7, 8, 0];
    let blank = 8;
    let prev = -1;
    const depth = 10 + this.p * 6;
    for (let i = 0; i < depth; i++) {
      const nb = this.neighbours(blank).filter((x) => x !== prev);
      const t = nb[Math.floor(Math.random() * nb.length)]!;
      this.tiles[blank] = this.tiles[t]!;
      this.tiles[t] = 0;
      prev = blank;
      blank = t;
    }
    if (this.solved()) return this.make(now);
    this.moves = 0;
    this.startAt = now;
    this.state = 0;
  }

  private neighbours(i: number): number[] {
    const r = Math.floor(i / 3);
    const c = i % 3;
    const out: number[] = [];
    if (r > 0) out.push(i - 3);
    if (r < 2) out.push(i + 3);
    if (c > 0) out.push(i - 1);
    if (c < 2) out.push(i + 1);
    return out;
  }

  private solved(): boolean {
    return this.tiles.every((t, i) => t === (i === 8 ? 0 : i + 1));
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    // Arrows move the tile next to the gap into it.
    const blank = this.tiles.indexOf(0);
    const map: Record<string, number> = { ArrowUp: blank + 3, ArrowDown: blank - 3, ArrowLeft: blank + 1, ArrowRight: blank - 1 };
    const t = map[code];
    if (t === undefined) return false;
    if (this.neighbours(blank).includes(t)) this.slide(t, ts);
    return true;
  }

  pointer(x: number, y: number, ts: number): void {
    const k = this.rects.findIndex((r) => inside(r, x, y));
    if (k >= 0 && this.neighbours(this.tiles.indexOf(0)).includes(k)) this.slide(k, ts);
  }

  private slide(k: number, ts: number): void {
    if (this.state !== 0) return;
    const blank = this.tiles.indexOf(0);
    this.tiles[blank] = this.tiles[k]!;
    this.tiles[k] = 0;
    this.moves++;
    this.env.sound(SND_TAP_WEAK);
    if (this.solved()) {
      this.times.push(ts - this.startAt);
      this.moveCounts.push(this.moves);
      this.env.sound(SND_CATCH);
      this.p++;
      this.state = 1;
      this.at = ts + 900;
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    // Nobody is left stuck: past the limit this one is skipped as unsolved.
    if (this.state === 0 && now - this.startAt > 120000) {
      this.unsolved++;
      this.p++;
      this.state = 1;
      this.at = now + 900;
      this.env.sound(SND_LURCH);
    }
    if (this.state === 1 && now >= this.at) {
      if (this.p >= this.puzzles) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    header(v, touch, 'moves', String(this.moves), 'puzzle', `${Math.min(this.p + 1, this.puzzles)} / ${this.puzzles}`);
    this.rects = gridRects(a, 3, 90);
    this.rects.forEach((r, k) => {
      const t = this.tiles[k]!;
      if (!t) return;
      cellBox(v, r, t === k + 1 ? COL_MID : COL_DIM);
      cellText(v, r, String(t), COL_LINE, v.fontBig);
    });
    if (this.p === 0 && this.moves === 0) hint(v, a, 'put 1 to 8 in order, gap last: tap a tile next to the gap (or use the arrows)');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.times.length * 80 + Math.max(0, Math.round(200 - mean(this.times) / 300)),
      primary: { label: 'time per puzzle', value: mean(this.times) / 1000, unit: 's', lower: true, decimals: 1 },
      lines: [
        { label: 'puzzles solved', value: String(this.times.length) },
        { label: 'average moves', value: this.moveCounts.length ? mean(this.moveCounts).toFixed(0) : '–' },
      ],
      saved: this.times.length >= 1,
    };
  }
}

// --- Toggle -------------------------------------------------------------------------

class Toggle implements Mini {
  private env!: MiniEnv;
  private readonly puzzles = scaled(5);
  private p = 0;
  private n = 4;
  private on: boolean[] = [];
  private moves = 0;
  private par = 0;
  private startAt = 0;
  private times: number[] = [];
  private overPar: number[] = [];
  private rects: Rect[] = [];
  private state = 0;
  private at = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now);
  }

  private flip(k: number): void {
    const n = this.n;
    const r = Math.floor(k / n);
    const c = k % n;
    for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < n && cc >= 0 && cc < n) this.on[rr * n + cc] = !this.on[rr * n + cc];
    }
  }

  private make(now: number): void {
    this.n = this.p < 2 ? 4 : 5;
    this.on = Array<boolean>(this.n * this.n).fill(false);
    // Built from a few random taps, so it can be solved in that many.
    const taps = new Set<number>();
    const want = 2 + Math.min(4, this.p);
    while (taps.size < want) taps.add(rint(0, this.n * this.n - 1));
    for (const t of taps) this.flip(t);
    if (this.on.every((x) => !x)) return this.make(now);
    this.par = taps.size;
    this.moves = 0;
    this.startAt = now;
    this.state = 0;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 0) return;
    const k = this.rects.findIndex((r) => inside(r, x, y));
    if (k < 0) return;
    this.flip(k);
    this.moves++;
    this.env.sound(SND_TAP_WEAK);
    if (this.on.every((b) => !b)) {
      this.times.push(ts - this.startAt);
      this.overPar.push(this.moves - this.par);
      this.env.sound(SND_CATCH);
      this.p++;
      this.state = 1;
      this.at = ts + 900;
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.p >= this.puzzles) return true;
      this.make(now);
    }
    // Way over par: give up on this one and move on.
    if (this.state === 0 && this.moves > this.par * 4 + 10) {
      this.overPar.push(this.moves - this.par);
      this.p++;
      this.state = 1;
      this.at = now + 900;
      this.env.sound(SND_LURCH);
    }
    v.clear();
    const a = arena(v, touch);
    header(v, touch, 'taps', `${this.moves}  (par ${this.par})`, 'puzzle', `${Math.min(this.p + 1, this.puzzles)} / ${this.puzzles}`);
    this.rects = gridRects(a, this.n, 72);
    this.rects.forEach((r, k) => cellBox(v, r, COL_DIM, this.on[k] ? COL_LINE : undefined));
    if (this.p === 0 && this.moves === 0) hint(v, a, 'turn every tile off. a tap flips that tile and the four next to it');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const solved = this.times.length;
    return {
      score: solved * 70 + Math.max(0, Math.round(100 - mean(this.overPar) * 10)),
      primary: { label: 'puzzles solved', value: solved, unit: '' },
      lines: [
        { label: 'taps over par, average', value: this.overPar.length ? mean(this.overPar).toFixed(1) : '–' },
        { label: 'average time', value: solved ? `${(mean(this.times) / 1000).toFixed(1)} s` : '–' },
      ],
      saved: this.overPar.length >= 1,
    };
  }
}

// --- Latin --------------------------------------------------------------------------

class Latin implements Mini {
  private env!: MiniEnv;
  private unsolved = 0;
  private readonly puzzles = scaled(4);
  private p = 0;
  private solution: number[] = [];
  private given: boolean[] = [];
  private cells: number[] = [];
  private sel = -1;
  private startAt = 0;
  private times: number[] = [];
  private wrongs = 0;
  private rects: Rect[] = [];
  private state = 0;
  private at = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now);
  }

  private make(now: number): void {
    // A shuffled cyclic square is a valid Latin square.
    const rows = shuffle([0, 1, 2, 3]);
    const cols = shuffle([0, 1, 2, 3]);
    const syms = shuffle([1, 2, 3, 4]);
    this.solution = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) this.solution.push(syms[(rows[r]! + cols[c]!) % 4]!);
    const blanks = 6 + Math.min(4, this.p * 2);
    const hide = new Set(shuffle([...Array(16).keys()]).slice(0, blanks));
    this.given = this.solution.map((_, i) => !hide.has(i));
    this.cells = this.solution.map((s, i) => (this.given[i] ? s : 0));
    this.sel = [...hide][0] ?? -1;
    this.startAt = now;
    this.state = 0;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    const k = this.rects.findIndex((r) => inside(r, x, y));
    if (k < 0 || this.given[k]) return;
    // Tapping a blank cycles 1-4; tapping selects it for the number keys too.
    if (this.sel === k) this.set(k, (this.cells[k]! % 4) + 1, ts);
    this.sel = k;
  }

  typeKey(code: string, ts: number): boolean {
    const d = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(code);
    if (d >= 0 && this.sel >= 0) {
      this.set(this.sel, d + 1, ts);
      // On to the next blank.
      const next = this.cells.findIndex((c, i) => i > this.sel && !this.given[i] && !c);
      if (next >= 0) this.sel = next;
      return true;
    }
    const mv: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 };
    if (mv[code] !== undefined) {
      const n = this.sel + mv[code]!;
      if (n >= 0 && n < 16) this.sel = n;
      return true;
    }
    return false;
  }

  private set(k: number, val: number, ts: number): void {
    if (this.state !== 0 || this.given[k]) return;
    this.cells[k] = val;
    this.env.sound(SND_TONE + val);
    if (this.cells.every((c) => c > 0)) {
      if (this.cells.every((c, i) => c === this.solution[i] || this.valid())) {
        this.times.push(ts - this.startAt);
        this.env.sound(SND_CATCH);
        this.p++;
        this.state = 1;
        this.at = ts + 900;
      } else {
        this.wrongs++;
        this.env.sound(SND_FALSE);
      }
    }
  }

  /** Any filled square that obeys the rule counts, not only the generated one. */
  private valid(): boolean {
    for (let i = 0; i < 4; i++) {
      const row = new Set(this.cells.slice(i * 4, i * 4 + 4));
      const col = new Set([0, 1, 2, 3].map((r) => this.cells[r * 4 + i]));
      if (row.size !== 4 || col.size !== 4) return false;
    }
    return true;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    // Nobody is left stuck: past the limit this one is skipped as unsolved.
    if (this.state === 0 && now - this.startAt > 120000) {
      this.unsolved++;
      this.p++;
      this.state = 1;
      this.at = now + 900;
      this.env.sound(SND_LURCH);
    }
    if (this.state === 1 && now >= this.at) {
      if (this.p >= this.puzzles) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    header(v, touch, 'puzzle', `${Math.min(this.p + 1, this.puzzles)} / ${this.puzzles}`, 'time', `${((now - this.startAt) / 1000).toFixed(0)} s`);
    this.rects = gridRects(a, 4, 74);
    const full = this.cells.every((c) => c > 0);
    this.rects.forEach((r, k) => {
      cellBox(v, r, k === this.sel ? COL_ACCENT : COL_FAINT);
      const c = this.cells[k]!;
      if (c) cellText(v, r, String(c), this.given[k] ? COL_MID : full && !this.valid() ? COL_ACCENT : COL_LINE, v.fontBig);
    });
    if (this.p === 0) hint(v, a, 'each row and column holds 1, 2, 3 and 4 once. tap a blank to cycle it, or pick it and type the number');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.times.length * 60 + Math.max(0, Math.round(200 - mean(this.times) / 400)),
      primary: { label: 'time per square', value: mean(this.times) / 1000, unit: 's', lower: true, decimals: 1 },
      lines: [
        { label: 'squares done', value: String(this.times.length) },
        { label: 'full but wrong', value: String(this.wrongs) },
      ],
      saved: this.times.length >= 1,
    };
  }
}

// --- Target -------------------------------------------------------------------------

class Target implements Mini {
  private env!: MiniEnv;
  private readonly total = scaled(10);
  private i = 0;
  private nums: number[] = [];
  private picked = new Set<number>();
  private target = 0;
  private startAt = 0;
  private times: number[] = [];
  private skips = 0;
  private rects: Rect[] = [];
  private state = 0;
  private at = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now);
  }

  private make(now: number): void {
    const n = 9;
    const hi = 9 + Math.min(16, this.i * 2);
    this.nums = [];
    for (let k = 0; k < n; k++) this.nums.push(rint(1, hi));
    // The target is the sum of a random 2-4 of them, so an answer exists.
    const take = shuffle([...Array(n).keys()]).slice(0, 2 + Math.min(2, Math.floor(this.i / 3)));
    this.target = take.reduce((s, k) => s + this.nums[k]!, 0);
    this.picked.clear();
    this.startAt = now;
    this.state = 0;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 0) return;
    const k = this.rects.findIndex((r) => inside(r, x, y));
    if (k < 0) return;
    if (this.picked.has(k)) this.picked.delete(k);
    else this.picked.add(k);
    this.env.sound(SND_TAP_WEAK);
    const sum = [...this.picked].reduce((s, j) => s + this.nums[j]!, 0);
    if (sum === this.target) {
      this.times.push(ts - this.startAt);
      this.env.sound(SND_CATCH);
      this.finish(ts);
    }
  }

  typeKey(code: string, ts: number): boolean {
    const d = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'].indexOf(code);
    if (d < 0) return false;
    const r = this.rects[d];
    if (r) this.pointer(r[0] + r[2] / 2, r[1] + r[3] / 2, ts);
    return true;
  }

  private finish(ts: number): void {
    this.i++;
    this.state = 1;
    this.at = ts + 700;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now - this.startAt > 25000) {
      this.skips++;
      this.env.sound(SND_LURCH);
      this.finish(now);
    }
    if (this.state === 1 && now >= this.at) {
      if (this.i >= this.total) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const sum = [...this.picked].reduce((s, j) => s + this.nums[j]!, 0);
    header(v, touch, 'sum', String(sum), 'target', `${Math.min(this.i + 1, this.total)} / ${this.total}`);
    ctx.fillStyle = COL_LINE;
    v.text(String(this.target), a.cx, a.top + 40 * a.u, v.fontBig, 'center');
    const ga: Arena = { ...a, top: a.top + 70 * a.u, cy: a.cy + 40 * a.u };
    this.rects = gridRects(ga, 3, 70);
    this.rects.forEach((r, k) => {
      const on = this.picked.has(k);
      cellBox(v, r, on ? COL_ACCENT : COL_DIM, on ? COL_FAINT : undefined);
      cellText(v, r, String(this.nums[k]), on ? COL_LINE : COL_MID, v.fontHud);
    });
    ctx.fillStyle = sum > this.target ? COL_ACCENT : COL_MID;
    if (this.i === 0) v.text('pick numbers that add up to exactly the target (tap, or press 1 to 9)', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    else if (sum > this.target) v.text('over: take one off', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = median(this.times);
    return {
      score: this.times.length * 40 + Math.max(0, Math.round((15000 - m) / 50)),
      primary: { label: 'median time to hit the target', value: m / 1000, unit: 's', lower: true, decimals: 1 },
      lines: [
        { label: 'hit', value: `${this.times.length} of ${this.i}` },
        { label: 'ran out of time', value: String(this.skips) },
      ],
      saved: this.i >= 3 && this.times.length >= 1,
    };
  }
}

// --- Gauges -------------------------------------------------------------------------

class Gauges implements Mini {
  private env!: MiniEnv;
  private readonly length = scaled(60000);
  private t0 = 0;
  private last = 0;
  private val = [0.3, 0.3, 0.3, 0.3];
  private drift = [0, 0, 0, 0];
  private redSince = [0, 0, 0, 0];
  private redTime = 0;
  private resets: number[] = [];
  private overs = 0;
  private needless = 0;
  private rects: Rect[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.t0 = now + 800;
    this.last = now;
    this.val = this.val.map(() => 0.15 + Math.random() * 0.3);
  }

  press(): void {}

  private reset(k: number, ts: number): void {
    if (ts < this.t0) return;
    if (this.val[k]! >= RED) {
      this.resets.push(ts - this.redSince[k]!);
      this.val[k] = 0.1 + Math.random() * 0.15;
      this.redSince[k] = 0;
      this.env.sound(SND_CATCH);
    } else {
      this.needless++;
      this.env.sound(SND_FALSE);
    }
  }

  pointer(x: number, y: number, ts: number): void {
    const k = this.rects.findIndex((r) => inside(r, x, y));
    if (k >= 0) this.reset(k, ts);
  }

  typeKey(code: string, ts: number): boolean {
    const k = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(code);
    if (k < 0) return false;
    this.reset(k, ts);
    return true;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const el = now - this.t0;
    if (el > this.length) return true;
    if (el > 0) {
      const pace = 1 + el / 60000;
      for (let k = 0; k < 4; k++) {
        // A wandering rise: each needle creeps up at its own changing rate.
        this.drift[k] = Math.max(0.01, Math.min(0.12, this.drift[k]! + (Math.random() - 0.45) * 0.02));
        this.val[k] = Math.min(1, this.val[k]! + this.drift[k]! * pace * dt);
        if (this.val[k]! >= RED && !this.redSince[k]) this.redSince[k] = now;
        if (this.val[k]! >= RED) this.redTime += dt;
        if (this.val[k]! >= 1) {
          // Pinned at the top: an overload, then it drops back by itself.
          this.overs++;
          this.env.sound(SND_LURCH);
          this.val[k] = 0.2;
          this.redSince[k] = 0;
        }
      }
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'overloads', String(this.overs), 'time', `${Math.max(0, Math.ceil((this.length - Math.max(0, el)) / 1000))} s`);
    const w = Math.min(a.right - a.left, 640 * a.u);
    const gw = w / 4;
    const top = a.top + 30 * a.u;
    const h = a.bottom - top - 50 * a.u;
    this.rects = [];
    for (let k = 0; k < 4; k++) {
      const x = a.cx - w / 2 + k * gw + gw * 0.3;
      const bw = gw * 0.4;
      this.rects.push([a.cx - w / 2 + k * gw, top, gw, h + 40 * a.u]);
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = v.dpr;
      ctx.strokeRect(x, top, bw, h);
      // The red zone at the top.
      ctx.fillStyle = 'rgba(255,90,54,0.18)';
      ctx.fillRect(x, top, bw, h * (1 - RED));
      const yv = top + h * (1 - this.val[k]!);
      ctx.fillStyle = this.val[k]! >= RED ? COL_ACCENT : COL_LINE;
      ctx.fillRect(x, yv - 2 * v.dpr, bw, 4 * v.dpr);
      ctx.fillStyle = COL_MID;
      v.text(String(k + 1), x + bw / 2, top + h + 26 * a.u, v.fontTiny, 'center');
    }
    if (el < 3000) hint(v, a, 'when a needle reaches the red, tap that gauge (or press its number) to reset it', true);
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = median(this.resets);
    return {
      score: Math.max(0, Math.round(this.resets.length * 10 - this.overs * 25 - this.needless * 5 + (m ? (1500 - m) / 10 : 0))),
      primary: { label: 'median time to catch a red needle', value: m, unit: 'ms', lower: true },
      lines: [
        { label: 'resets', value: String(this.resets.length) },
        { label: 'overloads (missed)', value: String(this.overs) },
        { label: 'resets before the red', value: String(this.needless) },
        { label: 'share of time a needle sat in the red', value: pct(this.redTime / Math.max(1, this.length / 1000) / 4) },
      ],
      saved: this.resets.length + this.overs >= 4,
    };
  }
}

const RED = 0.78;

// --- Tally --------------------------------------------------------------------------

class Tally implements Mini {
  private env!: MiniEnv;
  private readonly rounds = scaled(8);
  private r = 0;
  private items: { at: number; x: number; y: number; kind: number }[] = [];
  private t0 = 0;
  private dur = 9000;
  private squares = 0;
  private state = 0; // 0 watching, 1 answering, 2 feedback
  private at = 0;
  private typed = '';
  private keys: [number, number, number, number, string][] = [];
  private errs: number[] = [];
  private exact = 0;
  private lastOk = true;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 800);
  }

  private make(at: number): void {
    this.t0 = at;
    this.dur = 8000 + Math.min(6000, this.r * 800);
    const n = 14 + this.r * 2;
    this.items = [];
    this.squares = 0;
    for (let k = 0; k < n; k++) {
      const kind = Math.random() < 0.4 ? SHAPE_SQUARE : Math.random() < 0.5 ? SHAPE_CIRCLE : SHAPE_TRIANGLE;
      if (kind === SHAPE_SQUARE) this.squares++;
      this.items.push({ at: at + (k / n) * this.dur + Math.random() * 200, x: Math.random(), y: Math.random(), kind });
    }
    this.state = 0;
    this.typed = '';
  }

  press(): void {}

  private key(d: string, ts: number): void {
    if (this.state !== 1) return;
    if (d === '<') this.typed = this.typed.slice(0, -1);
    else if (d === 'ok') {
      if (!this.typed) return;
      const got = Number(this.typed);
      const e = Math.abs(got - this.squares);
      this.errs.push(e);
      this.lastOk = e === 0;
      if (e === 0) this.exact++;
      this.env.sound(e === 0 ? SND_CATCH : SND_FALSE);
      this.r++;
      this.state = 2;
      this.at = ts + 1300;
    } else if (this.typed.length < 2) this.typed += d;
  }

  pointer(x: number, y: number, ts: number): void {
    const k = this.keys.find((r) => inside([r[0], r[1], r[2], r[3]], x, y));
    if (k) this.key(k[4], ts);
  }

  typeKey(code: string, ts: number): boolean {
    if (code.startsWith('Digit')) this.key(code.slice(5), ts);
    else if (code === 'Backspace') this.key('<', ts);
    else if (code === 'Enter') this.key('ok', ts);
    else return false;
    return true;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now > this.t0 + this.dur + 700) this.state = 1;
    else if (this.state === 2 && now >= this.at) {
      if (this.r >= this.rounds) return true;
      this.make(now + 600);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'exact', `${this.exact} of ${this.r}`, 'round', `${Math.min(this.r + 1, this.rounds)} / ${this.rounds}`);
    const w = Math.min(a.right - a.left, 640 * a.u);
    const h = a.bottom - a.top - 200 * a.u;
    if (this.state === 0) {
      // Each shape shows for 600 ms somewhere on the board.
      for (const it of this.items) {
        if (now < it.at || now > it.at + 600) continue;
        v.shape(it.kind, a.cx - w / 2 + 30 * a.u + it.x * (w - 60 * a.u), a.top + 30 * a.u + it.y * (h + 100 * a.u), 14 * a.u, it.kind === SHAPE_SQUARE);
      }
      ctx.fillStyle = COL_MID;
      v.text(now < this.t0 ? 'count the squares only' : 'squares only: keep count', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    } else {
      ctx.fillStyle = this.state === 2 && !this.lastOk ? COL_ACCENT : COL_LINE;
      v.text(this.state === 1 ? this.typed || '?' : `${this.squares}`, a.cx, a.top + 40 * a.u, v.fontBig, 'center');
      ctx.fillStyle = COL_MID;
      v.text(this.state === 1 ? 'how many squares? type it, then ok' : this.lastOk ? 'exactly right' : `you said ${this.typed}`, a.cx, a.top + 80 * a.u, v.fontTiny, 'center');
      this.keys = keypad(v, a.cx, a.bottom - 6 * a.u, a.u, this.state === 1);
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.r ? Math.max(0, Math.round(this.exact * 60 - m * 20 + this.r * 10)) : 0,
      primary: { label: 'counts exactly right', value: this.r ? Math.round((this.exact / this.r) * 100) : 0, unit: '%' },
      lines: [
        { label: 'exact', value: `${this.exact} of ${this.r}` },
        { label: 'average miss', value: this.errs.length ? m.toFixed(1) : '–' },
      ],
      saved: this.r >= 2,
    };
  }
}

export const BATCH25: MiniDef[] = [
  { id: 'schulte', name: 'Schulte', skill: 'attention', blurb: 'Tap 1 to 25, scattered on a grid, in order.', how: 'The numbers 1 to 25 are scattered over a 5×5 grid. Tap them in order, 1 then 2 then 3, as fast as you can. A classic for widening what you take in at a glance. Scored on time per table.', input: 'pointer', make: () => new Schulte() },
  { id: 'trail', name: 'Trail', skill: 'attention', blurb: 'Connect 1-A-2-B-3-C, switching between numbers and letters.', how: 'Circles with numbers and letters are scattered over the board. Tap them alternating: 1, A, 2, B, 3, C… The switching is the hard part. Scored on time per board.', input: 'pointer', make: () => new Trail() },
  { id: 'maze', name: 'Maze', skill: 'reasoning', blurb: 'Arrow keys through a maze to the exit.', how: 'You start in the top left corner. Find your way to the white square in the bottom right with the arrow keys (or W A S D). Each maze is bigger than the last.', input: 'type', make: () => new Maze() },
  { id: 'hanoi', name: 'Hanoi', skill: 'reasoning', blurb: 'Move the tower peg to peg, never a big disk on a small one.', how: 'Move the whole tower from peg 1 to peg 3. Tap a peg (or press 1, 2, 3) to lift its top disk, then tap another to drop it there. A disk may never sit on a smaller one. Three disks, then four, then five. Scored on how close you come to the fewest moves possible.', input: 'pointer', make: () => new Hanoi() },
  { id: 'slide', name: 'Slide', skill: 'reasoning', blurb: 'Put a scrambled 3×3 sliding puzzle back in order.', how: 'Eight tiles and a gap. Tap a tile next to the gap to slide it in (or use the arrow keys). Get 1 to 8 in order with the gap last. Each puzzle is scrambled a little more.', input: 'pointer', make: () => new Slide() },
  { id: 'toggle', name: 'Toggle', skill: 'reasoning', blurb: 'Each tap flips a tile and its neighbours. Turn them all off.', how: 'Some tiles are lit. Tapping a tile flips it and the four next to it, on to off or off to on. Turn every tile off. Par is the number of taps it was made with; think before you tap.', input: 'pointer', make: () => new Toggle() },
  { id: 'latin', name: 'Latin', skill: 'reasoning', blurb: 'Fill a 4×4 square so each row and column has 1 to 4 once.', how: 'Some cells are filled. Fill the rest so every row and every column holds 1, 2, 3 and 4 exactly once. Tap a blank to select it and tap again to cycle its number, or type the number. Blanks increase as you go.', input: 'pointer', make: () => new Latin() },
  { id: 'target', name: 'Target', skill: 'reasoning', blurb: 'Pick numbers that add up to exactly the target.', how: 'Nine numbers and a target. Tap numbers (or press 1 to 9) to pick them; tap again to drop one. Hit the target exactly. Answers need two numbers at first, up to four later.', input: 'pointer', make: () => new Target() },
  { id: 'gauges', name: 'Gauges', skill: 'attention', blurb: 'Four needles drift up. Reset any that creep into the red.', how: 'Four gauges, each needle creeping up at its own changing rate. When one reaches the red zone, tap that gauge (or press its number) to reset it. Leave it and it overloads. Resetting before the red counts against you. One minute; it speeds up.', input: 'pointer', make: () => new Gauges() },
  { id: 'tally', name: 'Tally', skill: 'attention', blurb: 'Shapes pop up all over. Keep a running count of the squares.', how: 'Squares, circles and triangles flash up one at a time all over the board. Count the squares only. At the end, type how many you saw (keypad or number keys, then ok or Enter).', input: 'pointer', make: () => new Tally() },
];

