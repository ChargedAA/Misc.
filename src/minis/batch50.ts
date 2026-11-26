// Fiftieth batch.
//   Stack   - a block slides over the tower; drop it square. What hangs over is cut off.
//   Deal    - cards flash past one at a time: which suit came up most?
//   Ten     - a grid of digits: click pairs that make ten, as fast as you can.
//   Lantern - a dark room and a small pool of light: find the one T among the Ls.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALL, SND_FALSE, SND_TAP_L, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, median, ms, pct, scaled, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Stack -----------------------------------------------------------------------------

/** Width of the tower's first block, as a share of the play width. */
const STACK_W = 0.4;

class Stack implements Mini {
  private env!: MiniEnv;
  /** Placed blocks: left edge and width, as shares of the play width. */
  private blocks: [number, number][] = [[0.5 - STACK_W / 2, STACK_W]];
  private moving: [number, number] = [0, STACK_W];
  private dir = 1;
  private moveAt = 0;
  private started = false;
  private over = false;
  private overAt = 0;
  private perfect = 0;
  private streak = 0;
  private best = 0;
  private held = 0;
  private flash = 0;
  private cut: [number, number, number] | null = null;
  private offs: number[] = [];
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  private speed(): number {
    // Shares of the width per second, faster as the tower grows.
    return 0.45 + this.blocks.length * 0.025;
  }

  private spawn(now: number): void {
    const w = this.blocks[this.blocks.length - 1]![1];
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.moving = [this.dir > 0 ? -w : 1, w];
    this.moveAt = now;
  }

  private posAt(now: number): number {
    // Bounce between the two sides of the play area, starting just off one edge.
    const w = this.moving[1];
    const span = 1 + w;
    const travelled = ((now - this.moveAt) / 1000) * this.speed();
    const p = travelled % (2 * span);
    const t = p < span ? p : 2 * span - p;
    return this.dir > 0 ? -w + t : 1 - t;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.over) return;
    if (!this.started) {
      this.started = true;
      this.spawn(ts);
      return;
    }
    const x = this.posAt(ts);
    const w = this.moving[1];
    const [bx, bw] = this.blocks[this.blocks.length - 1]!;
    const off = x - bx;
    this.offs.push(Math.abs(off) / bw);
    // Within a whisker of square counts as perfect and keeps the full width.
    if (Math.abs(off) < 0.012) {
      this.blocks.push([bx, bw]);
      this.perfect++;
      this.streak++;
      this.best = Math.max(this.best, this.streak);
      this.flash = ts + 200;
      this.env.sound(SND_CATCH);
      this.cut = null;
      this.spawn(ts);
      return;
    }
    this.streak = 0;
    const l = Math.max(x, bx);
    const r = Math.min(x + w, bx + bw);
    if (r - l <= 0.004) {
      this.over = true;
      this.overAt = ts + 1600;
      this.cut = [x, w, ts];
      this.env.sound(SND_FALL);
      return;
    }
    this.cut = off > 0 ? [r, x + w - r, ts] : [x, l - x, ts];
    this.blocks.push([l, r - l]);
    this.env.sound(SND_TAP_L);
    this.spawn(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.press(0, ts);
    this.release(0);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    if (this.over && now >= this.overAt) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    // A cap, so a run cannot go on for ever.
    if (this.blocks.length > 400) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'height', String(this.blocks.length - 1), 'perfect', String(this.perfect));
    const W = Math.min(a.right - a.left, 520 * a.u);
    const x0 = a.cx - W / 2;
    const bh = Math.min(22 * a.u, (a.bottom - a.top) / 14);
    const base = a.bottom - 40 * a.u;
    // Scroll so the top of the tower stays at a steady height.
    const shown = Math.min(this.blocks.length, Math.floor((a.bottom - a.top - 120 * a.u) / bh));
    const first = this.blocks.length - shown;
    this.blocks.slice(first).forEach(([bx, bw], k) => {
      const y = base - (k + 1) * bh;
      const top = first + k === this.blocks.length - 1;
      ctx.fillStyle = top && now < this.flash ? COL_LINE : top ? '#d6d6dc' : k % 2 ? '#8a8a92' : '#76767e';
      ctx.fillRect(x0 + bx * W, y + dpr, bw * W, bh - 2 * dpr);
    });
    const topY = base - (shown + 1) * bh;
    if (this.started && !this.over) {
      const x = this.posAt(now);
      ctx.fillStyle = COL_LINE;
      ctx.fillRect(x0 + x * W, topY + dpr, this.moving[1] * W, bh - 2 * dpr);
    }
    // The piece cut off falls away.
    if (this.cut) {
      const [cx, cw, at] = this.cut;
      const t = (now - at) / 1000;
      if (t < 1.2) {
        ctx.globalAlpha = Math.max(0, 1 - t / 1.2);
        ctx.fillStyle = COL_ACCENT;
        ctx.fillRect(x0 + cx * W, topY + bh + 0.5 * 2000 * t * t * (bh / 22), cw * W, bh - 2 * dpr);
        ctx.globalAlpha = 1;
      }
    }
    ctx.fillStyle = COL_FAINT;
    ctx.fillRect(x0, base, W, dpr);
    ctx.fillStyle = COL_MID;
    if (this.over) v.text(`${this.blocks.length - 1} high`, a.cx, a.top + 20 * a.u, v.fontHud, 'center');
    else if (!this.started) v.text('press any key (or tap) to drop the block on the tower. press to start', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    else if (now < this.flash) v.text('perfect', a.cx, a.top + 20 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const h = this.blocks.length - 1;
    return {
      score: h * 40 + this.perfect * 20,
      primary: { label: 'tower height', value: h, unit: 'blocks' },
      lines: [
        { label: 'height', value: `${h} blocks` },
        { label: 'perfect drops', value: String(this.perfect) },
        { label: 'longest perfect run', value: String(this.best) },
        { label: 'typical overhang', value: this.offs.length ? pct(median(this.offs)) : '–' },
      ],
      saved: this.started && this.offs.length >= 3,
    };
  }
}

// --- Deal (which suit came up most) ----------------------------------------------------

const DEAL_ROUNDS = 12;
const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];

/** Draws a suit centred at (x, y), about r in radius. */
function suit(ctx: CanvasRenderingContext2D, k: number, x: number, y: number, r: number): void {
  ctx.beginPath();
  if (k === 2) {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.7, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.7, y);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (k === 3) {
    const c = r * 0.38;
    ctx.arc(x, y - r * 0.42, c, 0, TAU);
    ctx.moveTo(x - r * 0.42 + c, y + r * 0.08);
    ctx.arc(x - r * 0.42, y + r * 0.08, c, 0, TAU);
    ctx.moveTo(x + r * 0.42 + c, y + r * 0.08);
    ctx.arc(x + r * 0.42, y + r * 0.08, c, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + r * 0.25, y + r);
    ctx.lineTo(x - r * 0.25, y + r);
    ctx.closePath();
    ctx.fill();
    return;
  }
  // Hearts point down; spades are a heart upside down with a stem.
  const s = k === 1 ? 1 : -1;
  const cy = y - s * r * 0.3;
  ctx.moveTo(x, y + s * r * 0.9);
  ctx.bezierCurveTo(x - r * 1.2, cy + s * r * 0.1, x - r * 0.75, cy - s * r * 0.9, x, cy - s * r * 0.25);
  ctx.bezierCurveTo(x + r * 0.75, cy - s * r * 0.9, x + r * 1.2, cy + s * r * 0.1, x, y + s * r * 0.9);
  ctx.fill();
  if (k === 0) {
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.2);
    ctx.lineTo(x + r * 0.25, y + r);
    ctx.lineTo(x - r * 0.25, y + r);
    ctx.closePath();
    ctx.fill();
  }
}

class Deal implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private cards: number[] = [];
  private answer = 0;
  private gap = 450;
  private at = 0;
  /** 0 waiting to start, 1 dealing, 2 asking, 3 showing the answer. */
  private state = 0;
  private chosen = -1;
  private boxes: Rect[] = [];
  private right = 0;
  private held = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  private deal(now: number): void {
    const n = Math.min(22, 8 + this.round);
    this.gap = Math.max(260, 480 - this.round * 18);
    // Counts with a single most common suit, one ahead of the next.
    const counts = [0, 0, 0, 0];
    this.answer = rint(0, 3);
    const lead = Math.ceil(n / 4) + 1;
    counts[this.answer] = lead;
    let rest = n - lead;
    while (rest > 0) {
      const k = rint(0, 3);
      if (k !== this.answer && counts[k]! < lead - 1) {
        counts[k]!++;
        rest--;
      }
      if (counts.every((c, i) => i === this.answer || c >= lead - 1)) break;
    }
    this.cards = counts.flatMap((c, k) => Array<number>(c).fill(k)).sort(() => Math.random() - 0.5);
    this.state = 1;
    this.at = now + 500;
    this.chosen = -1;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state === 0) this.deal(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  private pick(k: number, ts: number): void {
    if (this.state !== 2) return;
    this.chosen = k;
    const ok = k === this.answer;
    if (ok) this.right++;
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.round++;
    this.state = 3;
    this.at = ts + (ok ? 900 : 1600);
  }

  typeKey(code: string, ts: number): boolean {
    const d = Number(digitOf(code));
    if (this.state === 2 && d >= 1 && d <= 4) {
      this.pick(d - 1, ts);
      return true;
    }
    if (this.state === 0 && (code === 'Space' || code === 'Enter')) {
      this.deal(ts);
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    if (this.state === 0) return this.deal(ts);
    const k = this.boxes.findIndex((r) => inside(r, x, y));
    if (k >= 0) this.pick(k, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at + this.cards.length * this.gap) this.state = 2;
    if (this.state === 3 && now >= this.at) {
      if (this.round >= scaled(DEAL_ROUNDS)) return true;
      this.deal(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'right', String(this.right), 'deal', `${Math.min(this.round + 1, scaled(DEAL_ROUNDS))} / ${scaled(DEAL_ROUNDS)}`);
    const cw = 110 * a.u;
    const ch = 150 * a.u;
    if (this.state === 1) {
      const i = Math.floor((now - this.at) / this.gap);
      const into = (now - this.at) % this.gap;
      if (i >= 0 && i < this.cards.length && into < this.gap * 0.75) {
        ctx.fillStyle = '#ececf0';
        ctx.fillRect(a.cx - cw / 2, a.cy - ch / 2, cw, ch);
        const k = this.cards[i]!;
        ctx.fillStyle = k === 1 || k === 2 ? '#d0442c' : '#111114';
        suit(ctx, k, a.cx, a.cy, 34 * a.u);
      }
      ctx.fillStyle = COL_DIM;
      v.text(`${Math.min(this.cards.length, Math.max(0, i + 1))} / ${this.cards.length}`, a.cx, a.cy + ch / 2 + 26 * a.u, v.fontTiny, 'center');
    } else if (this.state >= 2) {
      ctx.fillStyle = COL_LINE;
      v.text('which suit came up most?', a.cx, a.cy - 90 * a.u, v.fontHud, 'center');
      const bw = 90 * a.u;
      this.boxes = SUITS.map((_, k) => [a.cx + (k - 2) * (bw + 14 * a.u) + 7 * a.u, a.cy - 50 * a.u, bw, bw] as Rect);
      const counts = [0, 0, 0, 0];
      for (const c of this.cards) counts[c]!++;
      this.boxes.forEach(([x, y, w, h], k) => {
        const show = this.state === 3;
        ctx.strokeStyle = show && k === this.answer ? COL_LINE : show && k === this.chosen ? COL_ACCENT : COL_DIM;
        ctx.lineWidth = (show && (k === this.answer || k === this.chosen) ? 2.5 : 1.5) * dpr;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = k === 1 || k === 2 ? '#e0583e' : COL_LINE;
        suit(ctx, k, x + w / 2, y + h / 2, 24 * a.u);
        ctx.fillStyle = COL_DIM;
        v.text(String(k + 1), x + 8 * dpr, y + 14 * dpr, v.fontTiny, 'left');
        if (show) {
          ctx.fillStyle = COL_MID;
          v.text(`${counts[k]}`, x + w / 2, y + h + 20 * a.u, v.fontTiny, 'center');
        }
      });
    } else {
      ctx.fillStyle = COL_MID;
      v.text('cards will flash past one at a time; keep count of the suits', a.cx, a.cy - 10 * a.u, v.fontHud, 'center');
      v.text('press any key (or tap) to deal', a.cx, a.cy + 24 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 100,
      primary: { label: 'deals called right', value: this.right, unit: `of ${this.round}` },
      lines: [
        { label: 'right', value: `${this.right} of ${this.round}` },
        { label: 'accuracy', value: this.round ? pct(this.right / this.round) : '–' },
      ],
      saved: this.round >= 3,
    };
  }
}

// --- Ten (pairs that make ten) ---------------------------------------------------------

const TEN_MS = 60000;
const TEN_COLS = 6;
const TEN_ROWS = 4;

class Ten implements Mini {
  private env!: MiniEnv;
  private grid: number[] = [];
  private sel = -1;
  private cells: Rect[] = [];
  private t0 = 0;
  private started = false;
  private pairs = 0;
  private wrong = 0;
  private lastAt = 0;
  private gaps: number[] = [];
  private bad: [number, number, number] | null = null;
  private pop: [number, number][] = [];
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
    this.grid = Array.from({ length: TEN_COLS * TEN_ROWS }, () => rint(1, 9));
    this.ensurePair();
  }

  /** Makes sure at least one pair on the grid adds to ten. */
  private ensurePair(skip = -1): void {
    for (let i = 0; i < this.grid.length; i++) for (let j = i + 1; j < this.grid.length; j++) if (this.grid[i]! + this.grid[j]! === 10) return;
    let i = rint(0, this.grid.length - 1);
    if (i === skip) i = (i + 1) % this.grid.length;
    let j = (i + rint(1, this.grid.length - 1)) % this.grid.length;
    if (j === skip) j = (j + 1) % this.grid.length === i ? (j + 2) % this.grid.length : (j + 1) % this.grid.length;
    this.grid[j] = 10 - this.grid[i]!;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.lastAt = ts;
      return;
    }
    const k = this.cells.findIndex((r) => inside(r, x, y));
    if (k < 0) return;
    if (this.sel < 0 || this.sel === k) {
      this.sel = this.sel === k ? -1 : k;
      this.env.sound(SND_TAP_WEAK);
      return;
    }
    if (this.grid[this.sel]! + this.grid[k]! === 10) {
      this.pairs++;
      this.gaps.push(ts - this.lastAt);
      this.lastAt = ts;
      this.pop = [[this.sel, ts], [k, ts]];
      this.grid[this.sel] = rint(1, 9);
      this.grid[k] = rint(1, 9);
      this.ensurePair();
      this.env.sound(SND_CATCH);
    } else {
      this.wrong++;
      this.bad = [this.sel, k, ts + 400];
      this.env.sound(SND_FALSE);
    }
    this.sel = -1;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(TEN_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'pairs', String(this.pairs), 'time', `${left} s`);
    const s = Math.min((a.right - a.left) / TEN_COLS, (a.bottom - a.top - 40 * a.u) / TEN_ROWS, 80 * a.u);
    const x0 = a.cx - (s * TEN_COLS) / 2;
    const y0 = a.cy - (s * TEN_ROWS) / 2;
    this.cells = this.grid.map((_, k) => [x0 + (k % TEN_COLS) * s + 4 * dpr, y0 + Math.floor(k / TEN_COLS) * s + 4 * dpr, s - 8 * dpr, s - 8 * dpr] as Rect);
    ctx.font = `600 ${Math.round(s * 0.42)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    this.cells.forEach(([x, y, w, h], k) => {
      const isBad = this.bad && now < this.bad[2] && (this.bad[0] === k || this.bad[1] === k);
      const popped = this.pop.some(([p, at]) => p === k && now - at < 250);
      ctx.strokeStyle = isBad ? COL_ACCENT : k === this.sel ? COL_LINE : COL_FAINT;
      ctx.lineWidth = (k === this.sel || isBad ? 2.5 : 1.5) * dpr;
      ctx.strokeRect(x, y, w, h);
      if (!this.started) return;
      ctx.fillStyle = popped ? COL_DIM : COL_LINE;
      ctx.fillText(String(this.grid[k]), x + w / 2, y + h / 2 + dpr);
    });
    ctx.fillStyle = COL_MID;
    v.text(this.started ? 'click two numbers that add up to ten' : 'click to start: pick pairs of numbers that add up to ten, as many as you can in a minute', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.pairs * 25 - this.wrong * 15),
      primary: { label: 'pairs in a minute', value: this.pairs, unit: '' },
      lines: [
        { label: 'pairs', value: String(this.pairs) },
        { label: 'wrong pairs', value: String(this.wrong) },
        { label: 'typical time a pair', value: this.gaps.length ? ms(median(this.gaps)) : '–' },
      ],
      saved: this.pairs + this.wrong >= 3,
    };
  }
}

// --- Lantern (search in the dark) ------------------------------------------------------

const LANTERN_ROUNDS = 12;

class Lantern implements Mini {
  private env!: MiniEnv;
  private round = 0;
  /** Letters: position (shares of the field), rotation, and whether it is the T. */
  private items: { x: number; y: number; rot: number; t: boolean }[] = [];
  private mx = 0.5;
  private my = 0.5;
  private at = 0;
  private times: number[] = [];
  private misses = 0;
  private flash = 0;
  private found = -1;
  private field: Rect = [0, 0, 1, 1];
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now);
    this.firstAt = now;
  }

  private make(now: number): void {
    const n = Math.min(60, 18 + this.round * 3);
    this.items = [];
    for (let tries = 0; this.items.length < n && tries < 4000; tries++) {
      const x = rnd(0.04, 0.96);
      const y = rnd(0.06, 0.94);
      if (this.items.some((o) => Math.hypot((o.x - x) * 1.6, o.y - y) < 0.09)) continue;
      this.items.push({ x, y, rot: rint(0, 3) * (Math.PI / 2), t: false });
    }
    this.items[rint(0, this.items.length - 1)]!.t = true;
    this.at = now;
    this.found = -1;
  }

  /** Light radius, as a share of the field's height: shrinks as you go. */
  private radius(): number {
    return Math.max(0.09, 0.2 - this.round * 0.01);
  }

  press(): void {}

  pointerMove(x: number, y: number): void {
    const [fx, fy, fw, fh] = this.field;
    this.mx = (x - fx) / fw;
    this.my = (y - fy) / fh;
  }

  pointer(x: number, y: number, ts: number): void {
    this.pointerMove(x, y);
    if (this.found >= 0) return;
    const [, , fw, fh] = this.field;
    const k = this.items.findIndex((o) => Math.hypot((o.x - this.mx) * fw, (o.y - this.my) * fh) < fh * 0.045);
    if (k >= 0 && this.items[k]!.t) {
      this.times.push(ts - this.at);
      this.found = k;
      this.round++;
      this.at = ts + 700;
      this.env.sound(SND_CATCH);
    } else {
      this.misses++;
      this.flash = ts + 300;
      this.env.sound(SND_FALSE);
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.found >= 0 && now >= this.at) {
      if (this.round >= scaled(LANTERN_ROUNDS)) return true;
      this.make(now);
    }
    if (now - this.firstAt > 300000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'typical find', this.times.length ? ms(median(this.times)) : '–', 'room', `${Math.min(this.round + 1, scaled(LANTERN_ROUNDS))} / ${scaled(LANTERN_ROUNDS)}`);
    const fh = Math.min(a.bottom - a.top - 30 * a.u, (a.right - a.left) / 1.6);
    const fw = fh * 1.6;
    const fx = a.cx - fw / 2;
    const fy = a.top + 4 * a.u;
    this.field = [fx, fy, fw, fh];
    ctx.fillStyle = '#050506';
    ctx.fillRect(fx, fy, fw, fh);
    const R = this.radius() * fh;
    const lx = fx + this.mx * fw;
    const ly = fy + this.my * fh;
    const s = fh * 0.04;
    ctx.lineWidth = 2.5 * dpr;
    ctx.lineCap = 'square';
    this.items.forEach((o, k) => {
      const x = fx + o.x * fw;
      const y = fy + o.y * fh;
      const d = Math.hypot(x - lx, y - ly);
      const lit = this.found === k ? 1 : Math.max(0, Math.min(1, (R - d) / (R * 0.3)));
      if (lit <= 0) return;
      ctx.globalAlpha = lit;
      ctx.strokeStyle = this.found === k ? COL_ACCENT : COL_LINE;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(o.rot);
      ctx.beginPath();
      if (o.t) {
        ctx.moveTo(-s, -s);
        ctx.lineTo(s, -s);
        ctx.moveTo(0, -s);
        ctx.lineTo(0, s);
      } else {
        // An L with a slightly offset foot, so it is not a T at a glance.
        ctx.moveTo(-s * 0.7, -s);
        ctx.lineTo(-s * 0.7, s);
        ctx.lineTo(s, s);
      }
      ctx.stroke();
      ctx.restore();
    });
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = now < this.flash ? COL_ACCENT : '#2a2a30';
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.arc(lx, ly, R, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = COL_MID;
    v.text(this.round === 0 && this.found < 0 ? 'move the light with the mouse; find the one T among the Ls and click it' : `${this.misses} wrong clicks`, a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = median(this.times);
    return {
      score: this.times.length ? Math.max(0, Math.round((this.times.length * Math.max(0, 20000 - m)) / 80) - this.misses * 10) : 0,
      primary: { label: 'typical time to find', value: m, unit: 'ms', lower: true },
      lines: [
        { label: 'found', value: String(this.times.length) },
        { label: 'typical time to find', value: this.times.length ? ms(m) : '–' },
        { label: 'wrong clicks', value: String(this.misses) },
      ],
      saved: this.times.length >= 3,
    };
  }
}

export const BATCH50: MiniDef[] = [
  { id: 'stack', name: 'Stack', skill: 'timing', blurb: 'A block slides over the tower. Drop it square: what hangs over is cut off.', how: 'A block slides back and forth above the tower. Press any key (or tap) to drop it. Whatever hangs over the block below is cut off, so the next block is narrower. Drop it dead square and it keeps its width. It slides faster as the tower grows. Miss the tower entirely and the run ends.', input: 'both', make: () => new Stack() },
  { id: 'deal', name: 'Deal', skill: 'attention', blurb: 'Cards flash past one at a time. Which suit came up most?', how: 'Cards flash past one at a time: spades, hearts, diamonds, clubs. Keep count; at the end, pick the suit that came up most (1 to 4, or tap). One suit always leads by at least one. The deals get longer and faster. Twelve deals.', input: 'both', make: () => new Deal() },
  { id: 'ten', name: 'Ten', skill: 'reasoning', blurb: 'A grid of digits. Click pairs that make ten, as fast as you can.', how: 'A grid of the digits 1 to 9. Click two that add up to ten (3 and 7, 5 and 5); they are replaced with new digits. There is always at least one pair. A minute; wrong pairs count against you.', input: 'pointer', make: () => new Ten() },
  { id: 'lantern', name: 'Lantern', skill: 'attention', blurb: 'A dark room, a small pool of light. Find the one T among the Ls.', how: 'The room is dark except for a pool of light that follows the mouse. Among the scattered letters, all turned every which way, is one T; the rest are Ls. Find it and click it. Each room has more letters and a smaller light. Twelve rooms; scored on your typical time to find it.', input: 'pointer', make: () => new Lantern() },
];
