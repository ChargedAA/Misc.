// Thirty-fourth batch.
//   Ballpark - a sum and four answers, no time to work it out: pick the closest.
//   Jars     - two jars of marbles: which gives the better chance of orange?
//   Twist    - tiles flash on a grid, the grid turns: tap where they are now.
//   Blink    - letters stream past fast with two digits hidden in them: type both.
//   Script   - a tiny program: type what it prints.
//   Syntax   - type real lines of code, symbols and all.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_L, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { Stair, arena, footer, header, median, ms, pct, scaled, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
/** Code drawn one character at a time, so the coding font never joins >= or == into one sign. */
function mono(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  const cw = ctx.measureText('M').width;
  for (let k = 0; k < text.length; k++) ctx.fillText(text[k]!, x + k * cw, y);
}

const fmt = (n: number) => (Math.abs(n) >= 1000 ? Math.round(n).toLocaleString('en-US') : String(Math.round(n * 10) / 10));

// --- Ballpark --------------------------------------------------------------------------

/** How far apart the answers are (fraction of the true value), easy to hard. */
const SPREAD = [0.5, 0.4, 0.32, 0.25, 0.2, 0.16, 0.13, 0.1, 0.08, 0.065, 0.05];
const BALLPARK_TRIALS = 30;

class Ballpark implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private readonly stair = new Stair(0, 1, 0, SPREAD.length - 1, 2);
  private q = '';
  private truth = 0;
  private opts: number[] = [];
  private right = 0;
  private state = 0; // 0 gap, 1 asking, 2 feedback
  private at = 0;
  private next = 0;
  private limit = 3500;
  private boxes: Rect[] = [];
  private chosen = -1;
  private levels: number[] = [];
  private rts: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 700;
  }

  private make(): void {
    const kind = this.i < 8 ? 0 : rint(0, 3);
    if (kind === 0) {
      const a = rint(12, 99);
      const b = rint(12, 99);
      this.q = `${a} × ${b}`;
      this.truth = a * b;
    } else if (kind === 1) {
      const a = rint(110, 980);
      const b = rint(12, 89);
      this.q = `${a} × ${b}`;
      this.truth = a * b;
    } else if (kind === 2) {
      const p = rint(3, 47);
      const n = rint(120, 9800);
      this.q = `${p}% of ${n.toLocaleString('en-US')}`;
      this.truth = (p / 100) * n;
    } else {
      const b = rint(7, 48);
      const n = rint(800, 49000);
      this.q = `${n.toLocaleString('en-US')} ÷ ${b}`;
      this.truth = n / b;
    }
    const s = SPREAD[Math.round(this.stair.level)]!;
    // Four answers at even steps; the right one lands anywhere among them.
    const k = rint(0, 3);
    this.opts = [0, 1, 2, 3].map((j) => this.truth * (1 + (j - k) * s));
    if (this.opts[0]! <= 0) this.opts = this.opts.map((_, j) => this.truth * (1 + j * s));
    this.chosen = -1;
  }

  press(): void {}

  private answer(j: number, ts: number): void {
    if (this.state !== 1) return;
    const best = this.opts.reduce((bi, v, k) => (Math.abs(v - this.truth) < Math.abs(this.opts[bi]! - this.truth) ? k : bi), 0);
    const ok = j === best;
    this.chosen = j;
    this.levels.push(SPREAD[Math.round(this.stair.level)]! * 100);
    this.stair.update(ok, 1);
    if (ok) {
      this.right++;
      this.rts.push(ts - this.at);
    }
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.i++;
    this.state = 2;
    this.next = ts + 900;
  }

  typeKey(code: string, ts: number): boolean {
    const d = code.startsWith('Digit') ? Number(code.slice(5)) : code.startsWith('Numpad') ? Number(code.slice(6)) : NaN;
    if (d >= 1 && d <= 4) {
      this.answer(d - 1, ts);
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    const j = this.boxes.findIndex((r) => inside(r, x, y));
    if (j >= 0) this.answer(j, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state !== 1 && now >= this.next) {
      if (this.i >= scaled(BALLPARK_TRIALS)) return true;
      this.make();
      this.state = 1;
      this.at = now;
    }
    if (this.state === 1 && now - this.at > this.limit) {
      this.levels.push(SPREAD[Math.round(this.stair.level)]! * 100);
      this.stair.update(false, 1);
      this.i++;
      this.state = 2;
      this.next = now + 900;
      this.env.sound(SND_FALSE);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'answers', `within ${Math.round(SPREAD[Math.round(this.stair.level)]! * 100)}%`, 'sum', `${Math.min(this.i + 1, scaled(BALLPARK_TRIALS))} / ${scaled(BALLPARK_TRIALS)}`);
    if (this.state >= 1) {
      ctx.fillStyle = COL_LINE;
      ctx.font = `600 ${Math.round(46 * a.u)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.q, a.cx, a.cy - 70 * a.u);
      if (this.state === 1) {
        const p = Math.min(1, (now - this.at) / this.limit);
        ctx.fillStyle = COL_DIM;
        ctx.fillRect(a.cx - 150 * a.u, a.cy - 30 * a.u, 300 * a.u, 2 * dpr);
        ctx.fillStyle = COL_LINE;
        ctx.fillRect(a.cx - 150 * a.u, a.cy - 30 * a.u, 300 * a.u * (1 - p), 2 * dpr);
      }
      const bw = Math.min(140 * a.u, (a.right - a.left - 30 * a.u) / 4);
      const bh = 52 * a.u;
      const y = a.cy + 10 * a.u;
      const best = this.opts.reduce((bi, val, k) => (Math.abs(val - this.truth) < Math.abs(this.opts[bi]! - this.truth) ? k : bi), 0);
      this.boxes = this.opts.map((_, j) => [a.cx + (j - 2) * (bw + 10 * a.u) + 5 * a.u, y, bw, bh] as Rect);
      this.opts.forEach((o, j) => {
        const [x, yy, w, h] = this.boxes[j]!;
        ctx.strokeStyle = this.state === 2 && j === best ? COL_LINE : this.state === 2 && j === this.chosen ? COL_ACCENT : COL_DIM;
        ctx.lineWidth = (this.state === 2 && (j === best || j === this.chosen) ? 2.5 : 1.5) * dpr;
        ctx.strokeRect(x, yy, w, h);
        ctx.fillStyle = COL_LINE;
        v.text(fmt(o), x + w / 2, yy + h / 2 + 6 * dpr, v.fontHud, 'center');
        ctx.fillStyle = COL_MID;
        v.text(String(j + 1), x + 10 * dpr, yy + 16 * dpr, v.fontTiny, 'left');
      });
      if (this.state === 2) {
        ctx.fillStyle = COL_MID;
        v.text(`exactly ${fmt(this.truth)}`, a.cx, y + bh + 30 * a.u, v.fontTiny, 'center');
      }
    }
    if (this.i < 2 && this.state === 1) {
      ctx.fillStyle = COL_MID;
      v.text('no time to work it out: pick the closest (1 to 4, or tap)', a.cx, a.bottom - 10 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const thr = this.levels.length >= 8 ? median(this.levels.slice(-12)) : NaN;
    return {
      score: Number.isFinite(thr) ? Math.round(Math.max(0, 55 - thr) * 25) : 0,
      primary: { label: 'answers you can tell apart', value: thr, unit: '%', lower: true },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'closest spacing reached', value: this.levels.length ? `${Math.min(...this.levels).toFixed(1)}%` : '–' },
        { label: 'typical time to answer', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      rts: this.rts,
      saved: this.i >= 8,
    };
  }
}

// --- Jars ------------------------------------------------------------------------------

/** The gap between the two jars' chances, in percentage points, easy to hard. */
const GAPS = [20, 15, 11, 8, 6, 4.5, 3.5, 2.5, 2, 1.5, 1];
const JARS_TRIALS = 30;

class Jars implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private readonly stair = new Stair(0, 1, 0, GAPS.length - 1, 2);
  private jars: { orange: number; total: number; dots: [number, number, boolean][] }[] = [];
  private better = 0;
  private state = 0;
  private at = 0;
  private next = 0;
  private right = 0;
  private neglect = 0;
  private neglectTrials = 0;
  private levels: number[] = [];
  private chosen = -1;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 700;
  }

  private make(): void {
    const gap = GAPS[Math.round(this.stair.level)]! / 100;
    // One small jar and one big one; half the time the worse chance has more orange marbles.
    for (let tries = 0; tries < 200; tries++) {
      const t1 = rint(8, 20);
      const t2 = rint(40, 100);
      const p1 = rnd(0.08, 0.6);
      const smallBetter = Math.random() < 0.5;
      const p2 = smallBetter ? p1 - gap : p1 + gap;
      if (p2 <= 0.02 || p2 >= 0.95) continue;
      const o1 = Math.round(p1 * t1);
      const o2 = Math.round(p2 * t2);
      const q1 = o1 / t1;
      const q2 = o2 / t2;
      if (o1 < 1 || o2 < 1 || Math.abs(q1 - q2) < gap * 0.6 || Math.abs(q1 - q2) > gap * 1.6 || q1 === q2) continue;
      const side = Math.random() < 0.5;
      const A = { orange: o1, total: t1 };
      const B = { orange: o2, total: t2 };
      const [L, R] = side ? [A, B] : [B, A];
      this.jars = [L, R].map((j) => {
        const dots: [number, number, boolean][] = [];
        for (let k = 0; k < j.total; k++) dots.push([Math.random(), Math.random(), k < j.orange]);
        return { ...j, dots };
      });
      this.better = this.jars[0]!.orange / this.jars[0]!.total > this.jars[1]!.orange / this.jars[1]!.total ? 0 : 1;
      return;
    }
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 1) return;
    this.answer(s < 0 ? 0 : 1, ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(x: number, _y: number, ts: number): void {
    if (this.state === 1) this.answer(x < this.cx ? 0 : 1, ts);
  }

  private cx = 0;

  private answer(j: number, ts: number): void {
    const ok = j === this.better;
    this.chosen = j;
    // Denominator neglect: the worse jar had more orange marbles, and that pulled you.
    const trap = this.jars[1 - this.better]!.orange > this.jars[this.better]!.orange;
    if (trap) {
      this.neglectTrials++;
      if (!ok) this.neglect++;
    }
    this.levels.push(GAPS[Math.round(this.stair.level)]!);
    this.stair.update(ok, 1);
    if (ok) this.right++;
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.i++;
    this.state = 2;
    this.next = ts + 1100;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state !== 1 && now >= this.next) {
      if (this.i >= scaled(JARS_TRIALS)) return true;
      this.make();
      this.state = 1;
      this.at = now;
    }
    // Less time to look as it gets close, so counting is not an option.
    const limit = Math.max(1800, 4500 - this.stair.level * 250);
    if (this.state === 1 && now - this.at > limit) {
      this.levels.push(GAPS[Math.round(this.stair.level)]!);
      this.stair.update(false, 1);
      this.chosen = -1;
      this.i++;
      this.state = 2;
      this.next = now + 1000;
      this.env.sound(SND_FALSE);
    }
    v.clear();
    const a = arena(v, touch);
    this.cx = a.cx;
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'chances differ by', `${GAPS[Math.round(this.stair.level)]} points`, 'pick', `${Math.min(this.i + 1, scaled(JARS_TRIALS))} / ${scaled(JARS_TRIALS)}`);
    const jw = Math.min(200 * a.u, (a.right - a.left) / 2 - 40 * a.u);
    const jh = Math.min(240 * a.u, a.bottom - a.top - 90 * a.u);
    this.jars.forEach((j, k) => {
      const x = a.cx + (k ? 30 * a.u : -30 * a.u - jw);
      const y = a.top + 20 * a.u;
      ctx.strokeStyle = this.state === 2 && k === this.better ? COL_LINE : this.state === 2 && k === this.chosen ? COL_ACCENT : COL_DIM;
      ctx.lineWidth = (this.state === 2 && k === this.better ? 3 : 1.5) * dpr;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + jh);
      ctx.lineTo(x + jw, y + jh);
      ctx.lineTo(x + jw, y);
      ctx.stroke();
      const r = Math.max(2.5 * dpr, Math.min(7 * a.u, Math.sqrt((jw * jh) / j.total) * 0.32));
      for (const [px, py, o] of j.dots) {
        ctx.fillStyle = o ? COL_ACCENT : COL_LINE;
        ctx.beginPath();
        ctx.arc(x + r + px * (jw - 2 * r), y + jh * 0.12 + r + py * (jh * 0.88 - 2 * r), r, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = COL_MID;
      if (this.state === 2) v.text(`${j.orange} in ${j.total}  ·  ${Math.round((100 * j.orange) / j.total)}%`, x + jw / 2, y + jh + 24 * a.u, v.fontTiny, 'center');
      else v.text(`${j.orange} orange of ${j.total}`, x + jw / 2, y + jh + 24 * a.u, v.fontTiny, 'center');
    });
    if (this.i < 2) {
      ctx.fillStyle = COL_MID;
      v.text('draw one marble at random: which jar gives the better chance of orange?', a.cx, a.bottom - 8 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const thr = this.levels.length >= 8 ? median(this.levels.slice(-12)) : NaN;
    return {
      score: Number.isFinite(thr) ? Math.round(Math.max(0, 22 - thr) * 50) : 0,
      primary: { label: 'smallest difference you get right', value: thr, unit: 'points', lower: true, decimals: 1 },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'fooled by the jar with more orange', value: this.neglectTrials ? `${this.neglect} of ${this.neglectTrials}` : '–' },
      ],
      saved: this.i >= 8,
    };
  }
}

// --- Twist -----------------------------------------------------------------------------

class Twist implements Mini {
  private env!: MiniEnv;
  private n = 4;
  private count = 3;
  private best = 0;
  private lives = 3;
  private targets = new Set<number>();
  private tapped = new Set<number>();
  private wrong = new Set<number>();
  /** The turn: 1, 2 or 3 quarter turns clockwise, or a mirror (4). */
  private turn = 1;
  private state = 0; // 0 show, 1 turning, 2 answer, 3 feedback
  private at = 0;
  private cells: Rect[] = [];
  private rounds = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 600);
  }

  private arm(at: number): void {
    this.n = this.count >= 8 ? 5 : 4;
    this.targets = new Set();
    while (this.targets.size < this.count) this.targets.add(rint(0, this.n * this.n - 1));
    this.turn = this.count >= 6 && Math.random() < 0.25 ? 4 : rint(1, this.count >= 5 ? 3 : 2);
    this.tapped = new Set();
    this.wrong = new Set();
    this.state = 0;
    this.at = at;
  }

  /** Where a cell ends up after the turn. */
  private moved(c: number): number {
    const n = this.n;
    let r = Math.floor(c / n);
    let k = c % n;
    if (this.turn === 4) return r * n + (n - 1 - k);
    for (let t = 0; t < this.turn; t++) [r, k] = [k, n - 1 - r];
    return r * n + k;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 2) return;
    const c = this.cells.findIndex((r) => inside(r, x, y));
    if (c < 0 || this.tapped.has(c) || this.wrong.has(c)) return;
    const goal = new Set([...this.targets].map((t) => this.moved(t)));
    if (goal.has(c)) {
      this.tapped.add(c);
      this.env.sound(SND_TAP_WEAK);
      if (this.tapped.size === goal.size) {
        this.best = Math.max(this.best, this.count);
        this.count++;
        this.rounds++;
        this.env.sound(SND_CATCH);
        this.state = 3;
        this.at = ts + 700;
      }
    } else {
      this.wrong.add(c);
      this.env.sound(SND_FALSE);
      if (this.wrong.size >= 2) {
        this.lives--;
        this.rounds++;
        this.count = Math.max(2, this.count - 1);
        this.state = 3;
        this.at = ts + 1300;
      }
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at + 1100) {
      this.state = 1;
      this.at = now;
    }
    if (this.state === 1 && now >= this.at + 700) this.state = 2;
    if (this.state === 3 && now >= this.at) {
      if (this.lives <= 0) return true;
      this.arm(now + 400);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'tiles', String(this.count), 'best', String(this.best), this.lives);
    const size = Math.min(a.right - a.left, a.bottom - a.top - 30 * a.u) * 0.86;
    const cs = size / this.n;
    const x0 = a.cx - size / 2;
    const y0 = a.cy - size / 2 + 10 * a.u;
    this.cells = [];
    for (let c = 0; c < this.n * this.n; c++) this.cells.push([x0 + (c % this.n) * cs + 3 * dpr, y0 + Math.floor(c / this.n) * cs + 3 * dpr, cs - 6 * dpr, cs - 6 * dpr]);
    ctx.save();
    if (this.state === 0 || this.state === 1) {
      // The turn, animated: the whole grid rotates (or flips) around its centre.
      ctx.translate(a.cx, y0 + size / 2);
      const p = this.state === 1 ? Math.min(1, (now - this.at) / 650) : 0;
      const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      if (this.turn === 4) ctx.scale(1 - 2 * e, 1);
      else ctx.rotate((this.turn * Math.PI * e) / 2);
      ctx.translate(-a.cx, -(y0 + size / 2));
    }
    this.cells.forEach((r, c) => {
      const lit = this.state === 0 && this.targets.has(c);
      ctx.fillStyle = lit ? COL_ACCENT : this.tapped.has(c) ? COL_LINE : this.wrong.has(c) ? '#2a2a30' : '#151518';
      ctx.fillRect(r[0], r[1], r[2], r[3]);
      ctx.strokeStyle = COL_FAINT;
      ctx.lineWidth = dpr;
      ctx.strokeRect(r[0], r[1], r[2], r[3]);
    });
    // A notch marks the grid's top-left corner, so the turn can be followed.
    ctx.fillStyle = COL_LINE;
    ctx.beginPath();
    ctx.moveTo(x0 - 4 * dpr, y0 - 4 * dpr);
    ctx.lineTo(x0 + 18 * dpr, y0 - 4 * dpr);
    ctx.lineTo(x0 - 4 * dpr, y0 + 18 * dpr);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (this.state === 3 && this.wrong.size >= 2) {
      const goal = [...this.targets].map((t) => this.moved(t));
      for (const c of goal) {
        const r = this.cells[c]!;
        ctx.strokeStyle = COL_LINE;
        ctx.lineWidth = 2 * dpr;
        ctx.strokeRect(r[0] + 4 * dpr, r[1] + 4 * dpr, r[2] - 8 * dpr, r[3] - 8 * dpr);
      }
    }
    ctx.fillStyle = COL_MID;
    const what = this.turn === 4 ? 'it flips over' : this.turn === 2 ? 'it turns half way' : 'it turns a quarter';
    v.text(this.state === 0 ? 'remember the orange tiles' : this.state === 1 ? what : this.state === 2 ? 'tap where they are now' : '', a.cx, a.top + 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.best * 100,
      primary: { label: 'most tiles followed', value: this.best, unit: '' },
      lines: [
        { label: 'most tiles followed through a turn', value: String(this.best) },
        { label: 'rounds', value: String(this.rounds) },
      ],
      saved: this.rounds >= 2,
    };
  }
}

// --- Blink (attentional blink) ---------------------------------------------------------

const BLINK_TRIALS = 24;
const LETTERS = 'ABCDEFGHJKLMNPRTUVWXYZ';
const LAGS = [1, 2, 3, 5, 7];

class Blink implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private stream: string[] = [];
  private t1 = 0;
  private lag = 2;
  private digits: [string, string] = ['', ''];
  private item = 100;
  private state = 0; // 0 gap, 1 streaming, 2 answering, 3 feedback
  private at = 0;
  private next = 0;
  private typed = '';
  /** Per lag: second digit right when the first was right. */
  private hits = new Map<number, [number, number]>();
  private bothRight = 0;
  private firstRight = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 800;
  }

  private make(now: number): void {
    const len = 18;
    this.stream = Array.from({ length: len }, () => pick([...LETTERS]));
    this.lag = LAGS[this.i % LAGS.length]!;
    if (this.i >= LAGS.length) this.lag = pick(LAGS);
    this.t1 = rint(4, len - 1 - 7);
    const d1 = String(rint(2, 9));
    let d2 = String(rint(2, 9));
    while (d2 === d1) d2 = String(rint(2, 9));
    this.digits = [d1, d2];
    this.stream[this.t1] = d1;
    this.stream[this.t1 + this.lag] = d2;
    // A touch faster as you go.
    this.item = Math.max(80, 110 - this.i);
    this.typed = '';
    this.state = 1;
    this.at = now;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const d = code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '';
    if (!d || this.state !== 2) return !!d;
    this.typed += d;
    this.env.sound(SND_TAP_L);
    if (this.typed.length === 2) {
      const r1 = this.typed[0] === this.digits[0];
      const r2 = this.typed[1] === this.digits[1];
      if (r1) {
        this.firstRight++;
        const h = this.hits.get(this.lag) ?? [0, 0];
        h[1]++;
        if (r2) h[0]++;
        this.hits.set(this.lag, h);
      }
      if (r1 && r2) this.bothRight++;
      this.env.sound(r1 && r2 ? SND_CATCH : SND_FALSE);
      this.i++;
      this.state = 3;
      this.next = ts + 1000;
    }
    return true;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if ((this.state === 0 || this.state === 3) && now >= this.next) {
      if (this.i >= scaled(BLINK_TRIALS)) return true;
      this.make(now);
    }
    const k = Math.floor((now - this.at) / this.item);
    if (this.state === 1 && k >= this.stream.length + 2) this.state = 2;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'both digits', this.i ? pct(this.bothRight / this.i) : '–', 'stream', `${Math.min(this.i + 1, scaled(BLINK_TRIALS))} / ${scaled(BLINK_TRIALS)}`);
    ctx.font = `600 ${Math.round(56 * a.u)}px ui-monospace, 'JetBrains Mono', Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.state === 1 && k >= 0 && k < this.stream.length) {
      ctx.fillStyle = COL_LINE;
      ctx.fillText(this.stream[k]!, a.cx, a.cy);
    } else if (this.state === 2) {
      ctx.fillStyle = COL_LINE;
      ctx.fillText(`${this.typed[0] ?? '_'} ${this.typed[1] ?? '_'}`, a.cx, a.cy);
      ctx.fillStyle = COL_MID;
      v.text('type the two digits, in order', a.cx, a.cy + 60 * a.u, v.fontTiny, 'center');
    } else if (this.state === 3) {
      ctx.fillStyle = COL_MID;
      v.text(`they were ${this.digits[0]} then ${this.digits[1]}`, a.cx, a.cy, v.fontHud, 'center');
    } else {
      ctx.fillStyle = COL_DIM;
      ctx.fillText('+', a.cx, a.cy);
    }
    if (this.i === 0 && this.state <= 1) {
      ctx.fillStyle = COL_MID;
      v.text('letters flash past; two of them are digits. remember both', a.cx, a.bottom - 10 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  private rate(lags: number[]): number {
    let h = 0;
    let n = 0;
    for (const l of lags) {
      const x = this.hits.get(l);
      if (x) {
        h += x[0];
        n += x[1];
      }
    }
    return n ? h / n : NaN;
  }

  result(): MiniResult {
    const short = this.rate([2, 3]);
    const long = this.rate([5, 7]);
    return {
      score: Number.isFinite(short) ? Math.round(short * 700 + (this.bothRight / Math.max(1, this.i)) * 300) : 0,
      primary: { label: 'second digit caught soon after the first', value: Number.isFinite(short) ? Math.round(short * 100) : 0, unit: '%' },
      series: { label: 'second digit caught, by gap (items)', names: LAGS.map(String), values: LAGS.map((l) => Math.round((this.rate([l]) || 0) * 100)), unit: '%' },
      lines: [
        { label: 'both digits right', value: `${this.bothRight} of ${this.i}` },
        { label: 'second digit, 2 to 3 items after the first', value: Number.isFinite(short) ? pct(short) : '–' },
        { label: 'second digit, 5 to 7 items after', value: Number.isFinite(long) ? pct(long) : '–' },
        { label: 'the blink (how much the short gap costs)', value: Number.isFinite(short) && Number.isFinite(long) ? `${Math.round((long - short) * 100)} points` : '–' },
      ],
      saved: this.i >= 6,
    };
  }
}

// --- Script (code tracing) -------------------------------------------------------------

interface Prog {
  lines: string[];
  out: number;
}

/** A small program and what it prints, harder by level. */
function program(level: number): Prog {
  const v = () => rint(2, 9);
  const kind = Math.min(level, 7);
  if (kind <= 1) {
    const a = v();
    const b = v();
    return { lines: [`x = ${a}`, `x = x * ${b}`, `x = x + ${a}`, 'print(x)'], out: a * b + a };
  }
  if (kind === 2) {
    const a = v();
    const b = v();
    const t = rint(10, 40);
    const x = a * b;
    return { lines: [`x = ${a} * ${b}`, `if x > ${t}:`, `    x = x - ${t}`, 'else:', `    x = x + ${b}`, 'print(x)'], out: x > t ? x - t : x + b };
  }
  if (kind === 3) {
    const a = v();
    const b = v();
    return { lines: [`a = ${a}`, `b = ${b}`, 'a, b = b, a + b', 'a, b = b, a + b', 'print(a)'], out: (() => { let p = a, q = b; [p, q] = [q, p + q]; [p, q] = [q, p + q]; return p; })() };
  }
  if (kind === 4) {
    const n = rint(3, 5);
    const k = v();
    let t = 0;
    for (let i = 0; i < n; i++) t += i * k;
    return { lines: ['total = 0', `for i in range(${n}):`, `    total = total + i * ${k}`, 'print(total)'], out: t };
  }
  if (kind === 5) {
    const n = rint(20, 70);
    const m = rint(3, 9);
    return { lines: [`n = ${n}`, `q = n // ${m}`, `r = n % ${m}`, 'print(q * 10 + r)'], out: Math.floor(n / m) * 10 + (n % m) };
  }
  if (kind === 6) {
    const xs = Array.from({ length: 5 }, () => rint(1, 9));
    const i = rint(0, 4);
    const j = rint(0, 4);
    return { lines: [`xs = [${xs.join(', ')}]`, `xs[${i}] = xs[${j}] * 2`, `print(xs[${i}] + xs[${(i + 1) % 5}])`], out: xs[j]! * 2 + (i === (i + 1) % 5 ? xs[j]! * 2 : xs[(i + 1) % 5]!) };
  }
  const n = rint(4, 7);
  let x = 1;
  let s = 0;
  for (let i = 1; i <= n; i++) {
    if (i % 2 === 0) s += x;
    else x = x + i;
  }
  return { lines: ['x = 1', 's = 0', `for i in range(1, ${n + 1}):`, '    if i % 2 == 0:', '        s = s + x', '    else:', '        x = x + i', 'print(s)'], out: s };
}

class Script implements Mini {
  private env!: MiniEnv;
  private level = 1;
  private best = 0;
  private lives = 3;
  private prog: Prog = { lines: [], out: 0 };
  private typed = '';
  private state = 0;
  private at = 0;
  private next = 0;
  private solved = 0;
  private times: number[] = [];
  private lastOk = true;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 500;
  }

  press(): void {}

  typeKey(code: string, ts: number, key?: string): boolean {
    if (this.state !== 1) return false;
    if (/^[0-9]$/.test(key ?? '') || code.startsWith('Digit') || code.startsWith('Numpad')) {
      const d = /^[0-9]$/.test(key ?? '') ? key! : code.replace(/^(Digit|Numpad)/, '');
      if (/^[0-9]$/.test(d) && this.typed.length < 7) this.typed += d;
      return true;
    }
    if (key === '-' || code === 'Minus' || code === 'NumpadSubtract') {
      if (!this.typed) this.typed = '-';
      return true;
    }
    if (code === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      return true;
    }
    if ((code === 'Enter' || code === 'NumpadEnter' || code === 'Space') && this.typed && this.typed !== '-') {
      const ok = Number(this.typed) === this.prog.out;
      this.lastOk = ok;
      if (ok) {
        this.solved++;
        this.best = Math.max(this.best, this.level);
        this.times.push(ts - this.at);
        this.level++;
        this.env.sound(SND_CATCH);
      } else {
        this.lives--;
        this.env.sound(SND_FALSE);
      }
      this.state = 2;
      this.next = ts + (ok ? 700 : 2200);
      return true;
    }
    return false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state !== 1 && now >= this.next) {
      if (this.lives <= 0) return true;
      this.prog = program(this.level);
      this.typed = '';
      this.state = 1;
      this.at = now;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'level', String(this.level), 'solved', String(this.solved), this.lives);
    const lh = Math.min(30 * a.u, (a.bottom - a.top - 120 * a.u) / Math.max(4, this.prog.lines.length));
    const fs = Math.round(Math.min(20 * a.u, lh * 0.72));
    ctx.font = `500 ${fs}px ui-monospace, 'JetBrains Mono', Menlo, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const wMax = Math.max(...this.prog.lines.map((l) => l.length * ctx.measureText('M').width), 100);
    const x0 = a.cx - wMax / 2;
    const y0 = a.top + 20 * a.u;
    this.prog.lines.forEach((l, k) => {
      ctx.fillStyle = COL_DIM;
      ctx.fillText(String(k + 1).padStart(2, ' '), x0 - 34 * a.u, y0 + k * lh);
      ctx.fillStyle = l.startsWith('print') ? COL_LINE : '#c8c8cc';
      mono(ctx, l, x0, y0 + k * lh);
    });
    const ay = y0 + this.prog.lines.length * lh + 40 * a.u;
    ctx.fillStyle = COL_MID;
    v.text('it prints:', a.cx - 76 * a.u, ay, v.fontTiny, 'right');
    ctx.font = `600 ${Math.round(28 * a.u)}px ui-monospace, 'JetBrains Mono', Menlo, monospace`;
    ctx.fillStyle = this.state === 2 ? (this.lastOk ? COL_LINE : COL_ACCENT) : COL_LINE;
    ctx.fillText(`${this.typed}${this.state === 1 && Math.floor(now / 500) % 2 ? '▏' : ''}`, a.cx - 56 * a.u, ay);
    ctx.fillStyle = COL_FAINT;
    ctx.fillRect(a.cx - 60 * a.u, ay + 18 * a.u, 160 * a.u, dpr);
    if (this.state === 2 && !this.lastOk) {
      ctx.fillStyle = COL_MID;
      v.text(`it prints ${this.prog.out}`, a.cx, ay + 50 * a.u, v.fontTiny, 'center');
    }
    if (this.level === 1 && this.state === 1) {
      ctx.fillStyle = COL_MID;
      v.text('read the program, type the number it prints, then Enter', a.cx, a.bottom - 6 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.best * 100 + this.solved * 10,
      primary: { label: 'level', value: this.best, unit: '' },
      lines: [
        { label: 'highest level solved', value: String(this.best) },
        { label: 'programs solved', value: String(this.solved) },
        { label: 'typical time a program', value: this.times.length ? ms(median(this.times)) : '–' },
      ],
      saved: this.solved + (3 - this.lives) >= 1,
    };
  }
}

// --- Syntax (typing code) --------------------------------------------------------------

const CODE_LINES = [
  'if (x[i] >= 10) { y += 2; }',
  'const total = items.reduce((a, b) => a + b, 0);',
  'for (let i = 0; i < n; i++) sum += i * i;',
  "print(f'{name}: {score:.1f}')",
  'return a && !b ? [x, y] : {z: 1};',
  'def area(r): return 3.14 * r ** 2',
  'while (q.length > 0 && !done) step(q.pop());',
  'arr.sort((a, b) => b.score - a.score);',
  "<a href='/home'>Back</a>",
  'SELECT name, age FROM users WHERE age > 18;',
  'let [first, ...rest] = list.split(",");',
  'x = (a + b) * (c - d) / 2 % 7',
  'grid[r][c] = (r + c) % 2 === 0 ? "#" : ".";',
  'if not (0 <= i < len(xs)): raise IndexError',
  'color: rgba(255, 90, 54, 0.8);',
  '$total = $price * ($qty - $discount);',
  'map.set(key, (map.get(key) ?? 0) + 1);',
  'git commit -m "fix: off-by-one in loop"',
  'h1 { font-size: 2.5rem; margin: 0 auto; }',
  '/^[a-z0-9_-]{3,16}$/i.test(user)',
  'std::vector<int> v = {1, 2, 3};',
  'a |= 1 << (n & 7); b ^= ~mask;',
];
const SYNTAX_MS = 60000;

class Syntax implements Mini {
  private env!: MiniEnv;
  private lines: string[] = [];
  private li = 0;
  private typed = '';
  private t0 = 0;
  private started = false;
  private correct = 0;
  private keys = 0;
  private errors = 0;
  private done = 0;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
    const pool = [...CODE_LINES];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    this.lines = [...pool, ...pool];
  }

  press(): void {}

  typeKey(code: string, ts: number, key?: string): boolean {
    if (!this.started) {
      if (!key || key.length !== 1) return false;
      this.started = true;
      this.t0 = ts;
    }
    const line = this.lines[this.li]!;
    if (code === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      return true;
    }
    if (code === 'Enter' && this.typed === line) {
      this.next();
      return true;
    }
    if (!key || key.length !== 1) return code === 'Tab';
    this.keys++;
    const want = line[this.typed.length];
    // Wrong characters stay until fixed: typing on past a mistake is not allowed.
    if (this.typed.length < line.length && this.typed === line.slice(0, this.typed.length) && key === want) this.correct++;
    else this.errors++;
    if (this.typed.length < line.length + 5) this.typed += key;
    if (this.typed === line) this.next();
    return true;
  }

  private next(): void {
    this.done++;
    this.env.sound(SND_TAP_WEAK);
    this.li = (this.li + 1) % this.lines.length;
    this.typed = '';
  }

  private wpm(now: number): number {
    const mins = Math.max(1 / 60, (now - this.t0) / 60000);
    return this.correct / 5 / mins;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(SYNTAX_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'code wpm', this.started && now - this.t0 > 2000 ? String(Math.round(this.wpm(now))) : '–', 'time', `${left} s`);
    const line = this.lines[this.li]!;
    const fs = Math.round(Math.min(24 * a.u, ((a.right - a.left) / Math.max(20, line.length)) * 1.6));
    ctx.font = `500 ${fs}px ui-monospace, 'JetBrains Mono', Menlo, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const cw = ctx.measureText('M').width;
    const x0 = a.cx - (line.length * cw) / 2;
    const y = a.cy - 20 * a.u;
    for (let k = 0; k < line.length; k++) {
      const t = this.typed[k];
      ctx.fillStyle = t === undefined ? COL_MID : t === line[k] && this.typed.slice(0, k) === line.slice(0, k) ? COL_LINE : COL_ACCENT;
      ctx.fillText(line[k]!, x0 + k * cw, y);
      if (t !== undefined && t !== line[k]) {
        ctx.fillStyle = 'rgba(255,90,54,0.25)';
        ctx.fillRect(x0 + k * cw, y + fs * 0.55, cw, 2 * dpr);
      }
    }
    // Extra characters typed past the end.
    for (let k = line.length; k < this.typed.length; k++) {
      ctx.fillStyle = COL_ACCENT;
      ctx.fillText(this.typed[k]!, x0 + k * cw, y);
    }
    // Caret.
    if (Math.floor(now / 500) % 2 === 0 || !this.started) {
      ctx.fillStyle = COL_LINE;
      ctx.fillRect(x0 + this.typed.length * cw - dpr, y - fs * 0.6, 2 * dpr, fs * 1.2);
    }
    // The next line, dim.
    const nxt = this.lines[(this.li + 1) % this.lines.length]!;
    ctx.fillStyle = COL_DIM;
    ctx.font = `500 ${Math.round(fs * 0.8)}px ui-monospace, 'JetBrains Mono', Menlo, monospace`;
    mono(ctx, nxt, a.cx - (nxt.length * cw * 0.8) / 2, y + 50 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(this.started ? 'type it exactly; backspace fixes mistakes' : 'start typing to start the clock. symbols and capitals count', a.cx, a.bottom - 10 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const mins = Math.max(1 / 60, Math.min(scaled(SYNTAX_MS), this.started ? scaled(SYNTAX_MS) : 0) / 60000);
    const wpm = this.correct / 5 / mins;
    const acc = this.keys ? this.correct / this.keys : 0;
    return {
      score: Math.round(wpm * 10 * acc),
      primary: { label: 'code words per minute', value: Math.round(wpm), unit: 'wpm' },
      lines: [
        { label: 'accuracy', value: pct(acc) },
        { label: 'lines finished', value: String(this.done) },
        { label: 'mistyped characters', value: String(this.errors) },
      ],
      saved: this.correct >= 20,
    };
  }
}

export const BATCH34: MiniDef[] = [
  { id: 'ballpark', name: 'Ballpark', skill: 'reasoning', blurb: 'A sum and four answers. No time to work it out: pick the closest.', how: 'A sum appears, like 48 × 31 or 17% of 2,340, with four answers and a few seconds on the clock. There is no time to work it out exactly: estimate, and pick the one closest to the true answer (1 to 4, or tap). As you get them right the answers move closer together. Scored on how close the answers can be while you still pick the right one.', input: 'pointer', make: () => new Ballpark() },
  { id: 'jars', name: 'Jars', skill: 'judgement', blurb: 'Two jars of marbles. Which gives the better chance of drawing orange?', how: 'Two jars of white and orange marbles. If you drew one marble at random, which jar gives the better chance of orange? Press its side. Watch out: the jar with more orange marbles is not always the better bet; what matters is the share. The chances get closer and the time shorter as you go. Scored on the smallest difference you still get right.', input: 'keys', minKeys: 2, make: () => new Jars() },
  { id: 'twist', name: 'Twist', skill: 'memory', blurb: 'Tiles flash on a grid, then the grid turns. Tap where they are now.', how: 'Some tiles light up on a grid, then the empty grid turns: a quarter turn, a half turn, or later a flip. Tap where the tiles are now. A notch marks the grid’s corner so you can follow it. Get them all and the next has one more; two wrong taps on a board cost a life. Three lives.', input: 'pointer', make: () => new Twist() },
  { id: 'blink', name: 'Blink', skill: 'attention', blurb: 'Letters flash past ten a second, with two digits hidden among them. Type both.', how: 'Letters flash one at a time in the middle, about ten a second. Two of them are digits. When the stream ends, type both digits in order. When the second digit comes soon after the first, most people miss it: the attentional blink. The results show how much it costs you, gap by gap.', input: 'type', make: () => new Blink() },
  { id: 'script', name: 'Script', skill: 'reasoning', blurb: 'A tiny program. Type what it prints.', how: 'A short program appears, a few lines of Python-like code. Work out what it prints, type the number and press Enter. It starts with simple sums and moves on to if/else, swaps, loops, integer division and remainders, and lists. Three wrong answers end it.', input: 'type', make: () => new Script() },
  { id: 'syntax', name: 'Syntax', skill: 'dexterity', blurb: 'Type real lines of code, symbols and all.', how: 'Lines of real code from several languages, full of brackets, operators and quotes. Type each exactly; a mistake turns orange and has to be fixed with Backspace before the line counts. The clock starts at your first key. One minute, scored in words per minute of correct characters.', input: 'type', make: () => new Syntax() },
];

