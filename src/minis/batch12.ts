// Twelfth batch.
//   Shells (attention) - a ball under a cup, then the cups swap. Where is it?
//   Hop    (timing)    - run, and jump the blocks. Hold for a higher jump.
//   Again  (memory)    - pairs of shapes, one after another. Seen this exact one before?
//   Odd    (reasoning) - all but one share something. Which one does not?

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALL, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK, SND_TONE } from '../audio.ts';
import { SHAPE_CIRCLE, SHAPE_CROSS, SHAPE_DIAMOND, SHAPE_SQUARE, SHAPE_TRIANGLE, type View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import {
  arena,
  clamp,
  footer,
  handLabel,
  header,
  median,
  message,
  pct,
  shuffle,
  sideOf,
  type Mini,
  type MiniDef,
  type MiniEnv,
  type MiniResult,
  scaled,
} from './kit.ts';

const TAU = Math.PI * 2;
const GREY = '#6c6c74';
const SHAPES = [SHAPE_CIRCLE, SHAPE_SQUARE, SHAPE_TRIANGLE, SHAPE_DIAMOND, SHAPE_CROSS];

function rint(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

// --- Shells -----------------------------------------------------------------------

const SHELL_ROUNDS = 12;

class Shells implements Mini {
  private env!: MiniEnv;
  private level = 0;
  private n = 3;
  /** Which position each cup is at; cup 0 hides the ball. */
  private pos: number[] = [];
  private swaps: [number, number][] = [];
  private swapMs = 500;
  private state = 0; // 0 show ball, 1 shuffling, 2 choose, 3 feedback
  private t0 = 0;
  private at = 0;
  private round = 0;
  private right = 0;
  private picked = -1;
  private bestSwaps = 0;
  private geo = { x0: 0, gap: 1, y: 0, r: 1 };

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 400);
  }

  private make(now: number): void {
    this.n = this.level < 4 ? 3 : this.level < 8 ? 4 : 5;
    this.pos = [...Array(this.n).keys()];
    const count = 4 + (this.level % 4) * 2 + Math.floor(this.level / 4);
    this.swapMs = Math.max(230, 520 - this.level * 25);
    this.swaps = [];
    for (let k = 0; k < count; k++) {
      const a = rint(0, this.n - 1);
      let b = rint(0, this.n - 1);
      while (b === a) b = rint(0, this.n - 1);
      this.swaps.push([a, b]);
    }
    this.state = 0;
    this.t0 = now;
    this.picked = -1;
  }

  /** Cup x positions at time t: positions swap along arcs. */
  private cupAt(now: number): [number, number][] {
    const out: [number, number][] = this.pos.map((p) => [p, 0]);
    if (this.state !== 1) return out;
    const t = now - this.t0;
    const k = Math.floor(t / this.swapMs);
    const p = (t % this.swapMs) / this.swapMs;
    // Replay the swaps done so far from the start.
    const pos = [...Array(this.n).keys()];
    for (let i = 0; i < Math.min(k, this.swaps.length); i++) {
      const [a, b] = this.swaps[i]!;
      const ca = pos.indexOf(a);
      const cb = pos.indexOf(b);
      pos[ca] = b;
      pos[cb] = a;
    }
    const res: [number, number][] = pos.map((q) => [q, 0]);
    if (k < this.swaps.length) {
      const [a, b] = this.swaps[k]!;
      const e = p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
      const ca = pos.indexOf(a);
      const cb = pos.indexOf(b);
      res[ca] = [a + (b - a) * e, Math.sin(Math.PI * e)];
      res[cb] = [b + (a - b) * e, -Math.sin(Math.PI * e)];
    }
    return res;
  }

  private finalPos(): number[] {
    const pos = [...Array(this.n).keys()];
    for (const [a, b] of this.swaps) {
      const ca = pos.indexOf(a);
      const cb = pos.indexOf(b);
      pos[ca] = b;
      pos[cb] = a;
    }
    return pos;
  }

  private choose(slotPos: number, ts: number): void {
    if (this.state !== 2 || slotPos < 0 || slotPos >= this.n) return;
    this.picked = slotPos;
    const ok = this.pos[0] === slotPos;
    if (ok) {
      this.right++;
      this.bestSwaps = Math.max(this.bestSwaps, this.swaps.length);
      this.level = Math.min(11, this.level + 1);
      this.env.sound(SND_CATCH);
    } else {
      this.level = Math.max(0, this.level - 1);
      this.env.sound(SND_FALSE);
    }
    this.round++;
    this.state = 3;
    this.at = ts + 1300;
  }

  press(slot: number, ts: number): void {
    // With keys: left hand for the leftmost cups, right for the rightmost, if only three cups.
    if (this.n === 3 && this.state === 2) {
      const s = sideOf(slot);
      if (s < 0) this.choose(0, ts);
      else if (s > 0) this.choose(2, ts);
      else this.choose(1, ts);
    }
  }

  typeKey(code: string, ts: number): boolean {
    const m = /^(?:Digit|Numpad)([1-5])$/.exec(code);
    if (!m) return false;
    this.choose(Number(m[1]) - 1, ts);
    return true;
  }

  pointer(x: number, _y: number, ts: number): void {
    const g = this.geo;
    this.choose(Math.round((x - g.x0) / g.gap), ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now - this.t0 > 1100) {
      this.state = 1;
      this.t0 = now;
    }
    if (this.state === 1 && now - this.t0 >= this.swaps.length * this.swapMs) {
      this.pos = this.finalPos();
      this.state = 2;
      this.t0 = now;
    }
    if (this.state === 2 && now - this.t0 > 15000) this.choose((this.pos[0]! + 1) % this.n, now);
    if (this.state === 3 && now >= this.at) {
      if (this.round >= scaled(SHELL_ROUNDS)) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'swaps', String(this.swaps.length), 'round', `${Math.min(this.round + 1, scaled(SHELL_ROUNDS))} / ${scaled(SHELL_ROUNDS)}`);
    const gap = Math.min((a.right - a.left) / (this.n + 0.4), 170 * a.u);
    const r = Math.min(gap * 0.32, 50 * a.u);
    const x0 = a.cx - (gap * (this.n - 1)) / 2;
    const y = a.cy + 10 * a.u;
    this.geo = { x0, gap, y, r };
    const cups = this.cupAt(now);
    cups.forEach(([p, lift], cup) => {
      const x = x0 + p * gap;
      const yy = y - lift * gap * 0.35;
      const open = this.state === 0 || this.state === 3;
      if (cup === 0 && open) {
        ctx.fillStyle = COL_ACCENT;
        ctx.beginPath();
        ctx.arc(x, y + r * 0.35, r * 0.3, 0, TAU);
        ctx.fill();
      }
      const raise = open ? r * 1.1 : 0;
      ctx.strokeStyle = this.state === 3 && Math.round(p) === this.picked ? (cup === 0 ? COL_LINE : COL_MID) : COL_LINE;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo(x - r, yy + r * 0.7 - raise);
      ctx.lineTo(x - r * 0.7, yy - r * 0.8 - raise);
      ctx.lineTo(x + r * 0.7, yy - r * 0.8 - raise);
      ctx.lineTo(x + r, yy + r * 0.7 - raise);
      ctx.closePath();
      ctx.stroke();
    });
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(x0 - gap * 0.5, y + r * 0.72, gap * this.n, dpr);
    for (let k = 0; k < this.n; k++) v.text(String(k + 1), x0 + k * gap, y + r + 26 * a.u, v.fontTiny, 'center');
    ctx.fillStyle = COL_MID;
    const msg = this.state === 0 ? 'watch the ball' : this.state === 1 ? '' : this.state === 2 ? `where is it? tap the cup or press 1 to ${this.n}${this.n === 3 ? `, or ${handLabel(this.env, -1)} / ${handLabel(this.env, 1)} for the outer cups` : ''}` : this.picked === this.pos[0] ? 'found it' : 'it was there';
    v.text(msg, a.cx, a.top + 30 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 50 + this.bestSwaps * 20 + this.level * 20,
      primary: { label: 'found', value: this.right, unit: `/ ${scaled(SHELL_ROUNDS)}` },
      lines: [
        { label: 'found', value: `${this.right} of ${this.round}` },
        { label: 'most swaps followed', value: String(this.bestSwaps) },
        { label: 'level reached', value: String(this.level + 1) },
      ],
      saved: this.round >= 3,
    };
  }
}

// --- Hop --------------------------------------------------------------------------

interface Block {
  x: number;
  w: number;
  h: number;
  passed: boolean;
}

class Hop implements Mini {
  private env!: MiniEnv;
  private x = 0;
  private speed = 0.8;
  private y = 0;
  private vy = 0;
  private holding = false;
  private blocks: Block[] = [];
  private nextAt = 2;
  private last = 0;
  private started = false;
  private over = false;
  private overAt = 0;
  private cleared = 0;
  private jumps = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
  }

  private slams = 0;
  private slamAt = -1e9;
  private width = 1;

  private jump(): void {
    this.started = true;
    if (this.over || this.y > 0.001) return;
    this.vy = 1.7;
    this.jumps++;
    this.env.sound(SND_TAP_R);
  }

  /** Straight down, fast: for landing in time before the next block. */
  private slam(now: number): void {
    this.started = true;
    if (this.over || this.y <= 0.001) return;
    this.vy = -4.5;
    this.holding = false;
    this.slams++;
    this.slamAt = now;
    this.env.sound(SND_TAP_WEAK);
  }

  /** Jump keys: the left hand (and Space). Slam keys: the right hand. One key does both: again in the air slams. */
  private isSlam(slot: number): boolean {
    if (this.env.mode.right === 0) return this.y > 0.001;
    return sideOf(slot) > 0;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.isSlam(slot)) {
      this.slam(ts);
      return;
    }
    this.holding = true;
    this.jump();
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
    // Jumping stays "held" while any jump key is down.
    let jumpHeld = false;
    for (let k = 0; k < 7; k++) if (this.held & (1 << k) && !(this.env.mode.right > 0 && sideOf(k) > 0)) jumpHeld = true;
    if (!jumpHeld) this.holding = false;
  }

  pointer(x: number, _y: number, ts: number): void {
    // Left half: a short jump. Right half: slam.
    if (x > this.width / 2) this.slam(ts);
    else {
      this.jump();
      this.holding = false;
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.over && now >= this.overAt) return true;
    if (this.started && !this.over) {
      this.speed = 0.8 + this.x * 0.006;
      this.x += this.speed * dt;
      // Variable jump: gravity is lighter while held and rising.
      const g = this.holding && this.vy > 0 ? 3.2 : 7.5;
      this.vy -= g * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        if (this.vy < -0.5) this.env.sound(SND_TAP_L);
        this.y = 0;
        this.vy = 0;
      }
      // Blocks, in world units; the runner sits 0.25 from the left.
      while (this.nextAt < this.x + 2.5) {
        const tall = Math.random() < Math.min(0.4, this.x * 0.008);
        const w = 0.025 + Math.random() * (tall ? 0.02 : 0.045);
        this.blocks.push({ x: this.nextAt, w, h: tall ? 0.22 + Math.random() * 0.06 : 0.07 + Math.random() * 0.06, passed: false });
        // Sometimes a quick pair.
        const close = this.x > 10 && Math.random() < 0.25;
        this.nextAt += close ? 0.5 + Math.random() * 0.08 : 0.9 + Math.random() * 0.9;
      }
      const rx = this.x + 0.25;
      for (const b of this.blocks) {
        if (rx + 0.015 > b.x && rx - 0.015 < b.x + b.w && this.y < b.h) {
          this.over = true;
          this.overAt = now + 1300;
          this.env.sound(SND_FALL);
          break;
        }
        if (!b.passed && rx - 0.015 > b.x + b.w) {
          b.passed = true;
          this.cleared++;
          if (this.cleared % 10 === 0) this.env.sound(SND_TONE + 4);
        }
      }
      this.blocks = this.blocks.filter((b) => b.x + b.w > this.x - 0.5);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'cleared', String(this.cleared), 'speed', `${(this.speed / 0.8).toFixed(2)}×`);
    const W = a.right - a.left;
    const scale = Math.min(W, (a.bottom - a.top) * 1.6);
    const ground = a.cy + scale * 0.12;
    const toX = (d: number) => a.left + (d - this.x) * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(a.left, a.top, W, a.bottom - a.top);
    ctx.clip();
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(a.left, ground, W, dpr);
    // Ground ticks scroll to show speed.
    for (let d = Math.floor(this.x * 10) / 10; d < this.x + W / scale; d += 0.1) ctx.fillRect(toX(d), ground + 4 * dpr, dpr, 4 * dpr);
    ctx.fillStyle = COL_LINE;
    for (const b of this.blocks) ctx.fillRect(toX(b.x), ground - b.h * scale, b.w * scale, b.h * scale);
    if (now - this.slamAt < 200) {
      // A short streak above the ball while it slams.
      ctx.fillStyle = COL_MID;
      ctx.fillRect(toX(this.x + 0.25) - dpr, ground - this.y * scale - 0.07 * scale, 2 * dpr, 0.05 * scale);
    }
    ctx.fillStyle = COL_ACCENT;
    ctx.beginPath();
    ctx.arc(toX(this.x + 0.25), ground - this.y * scale - 0.015 * scale, 0.015 * scale, 0, TAU);
    ctx.fill();
    ctx.restore();
    if (!this.started)
      message(
        v,
        { ...a, cy: a.top + 40 * a.u },
        this.env.mode.right ? `${handLabel(this.env, -1)} jumps (hold for higher)  \u00b7  ${handLabel(this.env, 1)} slams down` : 'press to jump, hold for higher, press again in the air to slam down',
        'slam to land fast before a close block',
        COL_MID,
      );
    if (this.over) message(v, { ...a, cy: a.top + 40 * a.u }, `${this.cleared} cleared`, '');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.cleared * 20,
      primary: { label: 'cleared', value: this.cleared, unit: '' },
      lines: [
        { label: 'blocks cleared', value: String(this.cleared) },
        { label: 'distance', value: (this.x * 10).toFixed(0) },
        { label: 'jumps', value: String(this.jumps) },
        { label: 'slams', value: String(this.slams) },
      ],
      saved: this.cleared >= 3,
    };
  }
}

// --- Again ------------------------------------------------------------------------

const AGAIN_ITEMS = 40;

/** An item: two shapes side by side, each white or grey. Encoded as a number. */
function itemCode(s0: number, g0: boolean, s1: number, g1: boolean): number {
  return ((s0 * 2 + (g0 ? 1 : 0)) * 5 + s1) * 2 + (g1 ? 1 : 0);
}

function decode(c: number): [number, boolean, number, boolean] {
  const g1 = c % 2 === 1;
  c = Math.floor(c / 2);
  const s1 = c % 5;
  c = Math.floor(c / 5);
  const g0 = c % 2 === 1;
  const s0 = Math.floor(c / 2);
  return [SHAPES[s0]!, g0, SHAPES[s1]!, g1];
}

class Again implements Mini {
  private env!: MiniEnv;
  private items: number[] = [];
  private seenBefore: boolean[] = [];
  private i = 0;
  private state = 0; // 0 showing, 1 feedback
  private shownAt = 0;
  private at = 0;
  private hits = 0;
  private misses = 0;
  private fas = 0;
  private crs = 0;
  private lastOk = true;
  private rts: number[] = [];
  private held = 0;
  private cx = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    // Build the list: about 40% repeats at lags of 2 to 12, and lures that swap
    // the order or flip one shade of something already shown.
    const shown = new Set<number>();
    const list: number[] = [];
    while (list.length < scaled(AGAIN_ITEMS)) {
      const r = Math.random();
      let c: number;
      if (list.length > 3 && r < 0.4) {
        const lag = rint(2, Math.min(12, list.length));
        c = list[list.length - lag]!;
      } else if (list.length > 3 && r < 0.6) {
        const [s0, g0, s1, g1] = decode(list[list.length - rint(1, Math.min(10, list.length))]!);
        const i0 = SHAPES.indexOf(s0);
        const i1 = SHAPES.indexOf(s1);
        c = Math.random() < 0.5 ? itemCode(i1, g1, i0, g0) : itemCode(i0, !g0, i1, g1);
      } else {
        c = itemCode(rint(0, 4), Math.random() < 0.5, rint(0, 4), Math.random() < 0.5);
      }
      list.push(c);
      this.seenBefore.push(shown.has(c));
      shown.add(c);
    }
    this.items = list;
    this.shownAt = now + 600;
  }

  private answer(seen: boolean, ts: number): void {
    if (this.state !== 0 || ts < this.shownAt) return;
    const truth = this.seenBefore[this.i]!;
    this.lastOk = seen === truth;
    if (truth && seen) this.hits++;
    else if (truth) this.misses++;
    else if (seen) this.fas++;
    else this.crs++;
    if (this.lastOk) this.rts.push(ts - this.shownAt);
    this.env.sound(this.lastOk ? SND_TONE + 3 : SND_FALSE);
    this.state = 1;
    this.at = ts + (this.lastOk ? 250 : 900);
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
    if (this.state === 0 && now - this.shownAt > 4000) this.answer(!this.seenBefore[this.i], now);
    if (this.state === 1 && now >= this.at) {
      this.i++;
      if (this.i >= this.items.length) return true;
      this.state = 0;
      this.shownAt = now + 150;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    this.cx = a.cx;
    header(v, touch, 'right', String(this.hits + this.crs), 'item', `${Math.min(this.i + 1, scaled(AGAIN_ITEMS))} / ${scaled(AGAIN_ITEMS)}`);
    if (now >= this.shownAt && this.i < this.items.length) {
      const [s0, g0, s1, g1] = decode(this.items[this.i]!);
      const r = 26 * a.u;
      ctx.fillStyle = g0 ? GREY : COL_LINE;
      v.shape(s0, a.cx - r * 1.6, a.cy - 20 * a.u, r, true);
      ctx.fillStyle = g1 ? GREY : COL_LINE;
      v.shape(s1, a.cx + r * 1.6, a.cy - 20 * a.u, r, true);
      if (this.state === 1 && !this.lastOk) {
        ctx.fillStyle = COL_ACCENT;
        v.text(this.seenBefore[this.i] ? 'you had seen it' : 'this one was new', a.cx, a.cy + 40 * a.u, v.fontTiny, 'center');
      }
    }
    ctx.fillStyle = COL_MID;
    v.text(`new  ${handLabel(this.env, -1)}`, a.cx - 90 * a.u, a.cy + 90 * a.u, v.fontTiny, 'center');
    v.text(`seen  ${handLabel(this.env, 1)}`, a.cx + 90 * a.u, a.cy + 90 * a.u, v.fontTiny, 'center');
    if (this.i < 3) v.text('seen means this exact pair, same order and shades', a.cx, a.bottom - 20 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const n = this.hits + this.misses + this.fas + this.crs;
    const hr = (this.hits + 0.5) / (this.hits + this.misses + 1);
    const far = (this.fas + 0.5) / (this.fas + this.crs + 1);
    const corrected = hr - far;
    return {
      score: Math.round(Math.max(0, corrected) * 800 + (this.hits + this.crs) * 5),
      primary: { label: 'hits minus false alarms', value: Math.round(corrected * 100), unit: '%' },
      lines: [
        { label: 'repeats spotted', value: `${this.hits} of ${this.hits + this.misses}` },
        { label: 'new ones called seen', value: `${this.fas} of ${this.fas + this.crs}` },
        { label: 'accuracy', value: pct((this.hits + this.crs) / (n || 1)) },
        { label: 'median time when right', value: this.rts.length ? `${Math.round(median(this.rts))} ms` : '–' },
      ],
      saved: n >= 10,
    };
  }
}

// --- Odd --------------------------------------------------------------------------

const ODD_MS = 60000;

interface Thing {
  shape: number;
  grey: boolean;
  count: number;
  big: boolean;
}

class Odd implements Mini {
  private env!: MiniEnv;
  private t0 = 0;
  private level = 0;
  private run = 0;
  private things: Thing[] = [];
  private odd = 0;
  private rule = '';
  private rects: number[][] = [];
  private right = 0;
  private wrong = 0;
  private flash = 0;
  private flashOk = true;
  private lastRule = '';
  private done = false;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.t0 = now + 500;
    this.make();
  }

  private make(): void {
    const n = this.level < 3 ? 4 : this.level < 6 ? 5 : 6;
    // The shared attribute; the others vary freely (more of them as you level up).
    const attrs = ['shape', 'shade', 'count', 'size'];
    const rule = attrs[rint(0, 3)]!;
    const vary = this.level < 2 ? 1 : this.level < 5 ? 2 : 3;
    const free = shuffle(attrs.filter((x) => x !== rule)).slice(0, vary);
    const base: Thing = { shape: SHAPES[rint(0, 4)]!, grey: Math.random() < 0.5, count: rint(1, 3), big: Math.random() < 0.5 };
    // A freely varying attribute must not leave a lone odd tile of its own,
    // or there would be two right answers: every value it uses appears twice or more.
    const key = (t: Thing, at: string) => (at === 'shape' ? t.shape : at === 'shade' ? +t.grey : at === 'count' ? t.count : +t.big);
    const fair = (list: Thing[]) =>
      free.every((at) => {
        const counts = new Map<number, number>();
        for (const t of list) counts.set(key(t, at), (counts.get(key(t, at)) ?? 0) + 1);
        return [...counts.values()].every((c) => c >= 2);
      });
    let things: Thing[] = [];
    for (let tries = 0; tries < 200; tries++) {
      things = [];
      for (let k = 0; k < n; k++) {
        const t = { ...base };
        if (free.includes('shape')) t.shape = SHAPES[rint(0, 2)]!;
        if (free.includes('shade')) t.grey = Math.random() < 0.5;
        if (free.includes('count')) t.count = rint(1, 3);
        if (free.includes('size')) t.big = Math.random() < 0.5;
        things.push(t);
      }
      if (fair(things)) break;
    }
    if (!fair(things)) things = things.map(() => ({ ...base }));
    this.odd = rint(0, n - 1);
    const o = things[this.odd]!;
    if (rule === 'shape') o.shape = SHAPES[(SHAPES.indexOf(base.shape) + rint(1, 4)) % 5]!;
    else if (rule === 'shade') o.grey = !base.grey;
    else if (rule === 'count') o.count = (base.count % 3) + 1;
    else o.big = !base.big;
    this.things = things;
    this.rule = rule;
  }

  private choose(k: number, ts: number): void {
    if (this.done || ts < this.t0 || k < 0 || k >= this.things.length) return;
    const ok = k === this.odd;
    this.flash = ts;
    this.flashOk = ok;
    this.lastRule = this.rule;
    if (ok) {
      this.right++;
      if (++this.run >= 2) {
        this.run = 0;
        this.level = Math.min(8, this.level + 1);
      }
    } else {
      this.wrong++;
      this.run = 0;
      this.level = Math.max(0, this.level - 1);
    }
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.make();
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const m = /^(?:Digit|Numpad)([1-6])$/.exec(code);
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
    const t = now - this.t0;
    if (t > scaled(ODD_MS)) {
      this.done = true;
      if (t > scaled(ODD_MS) + 700) return true;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'right', String(this.right), 'level', String(this.level + 1));
    if (!this.done) {
      const n = this.things.length;
      const cols = n <= 4 ? n : 3;
      const rows = Math.ceil(n / cols);
      const s = Math.min((a.right - a.left) / (cols + 0.3), (a.bottom - a.top - 80 * a.u) / rows, 150 * a.u);
      const x0 = a.cx - (cols * s) / 2;
      const y0 = a.cy - (rows * s) / 2;
      this.rects = [];
      this.things.forEach((th, k) => {
        const x = x0 + (k % cols) * s;
        const y = y0 + Math.floor(k / cols) * s;
        this.rects.push([x + 4 * dpr, y + 4 * dpr, s - 8 * dpr, s - 8 * dpr]);
        ctx.strokeStyle = COL_DIM;
        ctx.lineWidth = dpr;
        ctx.strokeRect(x + 4 * dpr, y + 4 * dpr, s - 8 * dpr, s - 8 * dpr);
        ctx.fillStyle = th.grey ? GREY : COL_LINE;
        const r = s * (th.big ? 0.11 : 0.065);
        for (let c = 0; c < th.count; c++) v.shape(th.shape, x + s / 2 + (c - (th.count - 1) / 2) * s * 0.26, y + s / 2, r, true);
        ctx.fillStyle = COL_DIM;
        v.text(String(k + 1), x + 12 * dpr, y + 18 * dpr, v.fontTiny, 'left');
      });
      ctx.fillStyle = now - this.flash < 600 && !this.flashOk ? COL_ACCENT : COL_MID;
      const hint = now - this.flash < 600 && !this.flashOk ? `the odd one was different in ${this.lastRule}` : this.right + this.wrong === 0 ? 'all but one share something. tap the one that does not (or press its number)' : '';
      v.text(hint, a.cx, a.bottom - 14 * a.u, v.fontTiny, 'center');
    } else message(v, a, `${this.right} right`, `${this.wrong} wrong`);
    const p = clamp(t / scaled(ODD_MS), 0, 1);
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(a.cx - 120 * a.u, a.top + 4 * a.u, 240 * a.u, dpr);
    ctx.fillStyle = COL_MID;
    ctx.fillRect(a.cx - 120 * a.u, a.top + 4 * a.u, 240 * a.u * p, dpr);
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const net = this.right - this.wrong;
    return {
      score: Math.max(0, net * 15 + this.level * 20),
      primary: { label: 'right minus wrong', value: net, unit: '' },
      lines: [
        { label: 'right', value: String(this.right) },
        { label: 'wrong', value: String(this.wrong) },
        { label: 'level reached', value: String(this.level + 1) },
      ],
      saved: this.right + this.wrong >= 5,
    };
  }
}

export const BATCH12: MiniDef[] = [
  {
    id: 'shells',
    name: 'Shells',
    skill: 'attention',
    blurb: 'A ball under a cup, then the cups swap. Where is it?',
    how: 'Watch which cup the ball goes under. The cups swap around, faster and more often as you go, and later there are four or five. Then tap the cup (or press its number).',
    input: 'pointer',
    make: () => new Shells(),
  },
  {
    id: 'hop',
    name: 'Hop',
    skill: 'timing',
    blurb: 'Run, jump the blocks, and slam down to land in time.',
    how: 'You run on your own. Left hand jumps: hold longer to jump higher. Right hand slams you straight down, so you can land in time for a block that follows close behind. With one key, press again in the air to slam. On a touch screen, tap the left half to jump and the right half to slam. It speeds up. One hit ends it.',
    input: 'both',
    make: () => new Hop(),
  },
  {
    id: 'again',
    name: 'Again',
    skill: 'memory',
    blurb: 'Pairs of shapes, one after another. Seen this exact one before?',
    how: 'A pair of shapes at a time. Right hand if you have seen this exact pair before in this session, left hand if it is new (or tap that side). Watch for lures: the same shapes in the other order, or with one shade flipped, are new.',
    input: 'both',
    minKeys: 2,
    make: () => new Again(),
  },
  {
    id: 'odd',
    name: 'Odd',
    skill: 'reasoning',
    blurb: 'All but one share something. Which one does not?',
    how: 'All the tiles but one share a shape, shade, count or size. Find the one that breaks the pattern: tap it or press its number. More things vary as you level up, so the pattern hides. One minute.',
    input: 'pointer',
    make: () => new Odd(),
  },
];
