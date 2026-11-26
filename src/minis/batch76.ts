// Seventy-sixth batch.
//   Hide    - digits fill a grid, then are covered: where was the 7?
//   Average - a handful of numbers: which is their average?

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, median, ms, pct, scaled, shuffle, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Hide ------------------------------------------------------------------------------

const HIDE_ROUNDS = 12;

class Hide implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private size = 3;
  /** The digit in each cell, or 0 for an empty cell. */
  private cells: number[] = [];
  private asks: number[] = [];
  private ask = 0;
  /** 0 showing, 1 asking, 2 feedback. */
  private state = 0;
  private at = 0;
  private rects: Rect[] = [];
  private chosen = -1;
  private right = 0;
  private total = 0;
  private roundRight = 0;
  private filled = 4;
  private best = 0;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm(now);
  }

  private arm(now: number): void {
    this.size = this.filled > 7 ? 4 : 3;
    const N = this.size * this.size;
    const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, this.filled);
    const spots = shuffle(Array.from({ length: N }, (_, k) => k)).slice(0, this.filled);
    this.cells = Array<number>(N).fill(0);
    spots.forEach((s, k) => (this.cells[s] = digits[k]!));
    this.asks = shuffle([...digits]).slice(0, 2);
    this.roundRight = 0;
    this.state = 0;
    this.at = now + 1500 + this.filled * 350;
  }

  private nextAsk(): void {
    this.ask = this.asks.shift()!;
    this.chosen = -1;
    this.state = 1;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    if (this.state === 0 && (code === 'Space' || code === 'Enter')) {
      this.at = ts;
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 1) return;
    const k = this.rects.findIndex((r) => inside(r, x, y));
    if (k < 0) return;
    this.chosen = k;
    const ok = this.cells[k] === this.ask;
    this.total++;
    if (ok) {
      this.right++;
      this.roundRight++;
    }
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.state = 2;
    this.at = ts + (ok ? 500 : 1300);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.nextAsk();
    if (this.state === 2 && now >= this.at) {
      if (this.asks.length) this.nextAsk();
      else {
        if (this.roundRight === 2) {
          this.best = Math.max(this.best, this.filled);
          this.filled = Math.min(9, this.filled + 1);
        } else if (this.roundRight === 0) this.filled = Math.max(3, this.filled - 1);
        this.round++;
        if (this.round >= scaled(HIDE_ROUNDS)) return true;
        this.arm(now);
      }
    }
    if (now - this.firstAt > 900000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'right', `${this.right} of ${this.total}`, 'grid', `${Math.min(this.round + 1, scaled(HIDE_ROUNDS))} / ${scaled(HIDE_ROUNDS)}`);
    const S = Math.min(a.right - a.left, a.bottom - a.top - 70 * a.u);
    const s = S / this.size;
    const x0 = a.cx - S / 2;
    const y0 = a.top + 40 * a.u;
    this.rects = [];
    for (let k = 0; k < this.size * this.size; k++) {
      const r: Rect = [x0 + (k % this.size) * s + 4 * dpr, y0 + Math.floor(k / this.size) * s + 4 * dpr, s - 8 * dpr, s - 8 * dpr];
      this.rects.push(r);
      const show = this.state === 0 || (this.state === 2 && (this.cells[k] === this.ask || k === this.chosen));
      const isAns = this.state === 2 && this.cells[k] === this.ask;
      ctx.fillStyle = this.state === 0 ? '#141418' : '#1c1c22';
      ctx.fillRect(...r);
      if (this.state === 2 && (isAns || k === this.chosen)) {
        ctx.strokeStyle = isAns ? COL_LINE : COL_ACCENT;
        ctx.lineWidth = 2.5 * dpr;
        ctx.strokeRect(...r);
      }
      if (show && this.cells[k]) {
        ctx.font = `600 ${Math.round(s * 0.42)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = COL_LINE;
        ctx.fillText(String(this.cells[k]), r[0] + r[2] / 2, r[1] + r[3] / 2);
      }
    }
    ctx.fillStyle = this.state === 1 ? COL_LINE : COL_MID;
    v.text(this.state === 0 ? 'remember where each digit is (Space when ready)' : `where was the ${this.ask}?`, a.cx, a.top + 18 * a.u, v.fontHud, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 40 + this.best * 40,
      primary: { label: 'most digits placed', value: this.best, unit: 'digits' },
      lines: [
        { label: 'right', value: `${this.right} of ${this.total}` },
        { label: 'accuracy', value: this.total ? pct(this.right / this.total) : '–' },
        { label: 'largest grid kept whole', value: this.best ? `${this.best} digits` : '–' },
      ],
      saved: this.total >= 6,
    };
  }
}

// --- Average ---------------------------------------------------------------------------

const AVERAGE_MS = 60000;

class Average implements Mini {
  private env!: MiniEnv;
  private nums: number[] = [];
  private opts: number[] = [];
  private answer = 0;
  private boxes: Rect[] = [];
  private t0 = 0;
  private at = 0;
  private started = false;
  private ok = 0;
  private bad = 0;
  private rts: number[] = [];
  private flash = 0;
  private note = '';
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  private make(now: number): void {
    const n = this.ok < 5 ? 3 : this.ok < 12 ? 4 : 5;
    // Pick the mean first, then numbers around it that add up exactly.
    const mean = rint(5, 60);
    const nums: number[] = [];
    let sum = 0;
    for (let k = 0; k < n - 1; k++) {
      const x = Math.max(1, mean + rint(-20, 20));
      nums.push(x);
      sum += x;
    }
    const last = mean * n - sum;
    if (last < 1 || last > 99) return this.make(now);
    nums.push(last);
    this.nums = shuffle(nums);
    const wrong = new Set<number>();
    for (const w of shuffle([mean + 1, mean - 1, mean + 2, mean - 2, mean + 3, mean - 3, Math.round((sum + last) / (n - 1))])) {
      if (w !== mean && w > 0) wrong.add(w);
      if (wrong.size >= 3) break;
    }
    this.opts = [...wrong].slice(0, 3);
    this.answer = rint(0, 3);
    this.opts.splice(this.answer, 0, mean);
    this.at = now;
  }

  press(): void {}

  private pick(k: number, ts: number): void {
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.make(ts);
      return;
    }
    if (k === this.answer) {
      this.ok++;
      this.rts.push(ts - this.at);
      this.env.sound(SND_CATCH);
    } else {
      this.bad++;
      this.note = `(${this.nums.join(' + ')}) ÷ ${this.nums.length} = ${this.opts[this.answer]}`;
      this.flash = ts + 1600;
      this.env.sound(SND_FALSE);
    }
    this.make(ts);
  }

  typeKey(code: string, ts: number): boolean {
    const d = Number(digitOf(code));
    if (d >= 1 && d <= 4) {
      this.pick(d - 1, ts);
      return true;
    }
    if (!this.started && (code === 'Space' || code === 'Enter')) {
      this.pick(-1, ts);
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    if (!this.started) return this.pick(-1, ts);
    const k = this.boxes.findIndex((r) => inside(r, x, y));
    if (k >= 0) this.pick(k, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(AVERAGE_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    ctx.font = `600 ${Math.round(40 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL_LINE;
    ctx.fillText(this.started ? this.nums.join('   ') : 'the average?', a.cx, a.cy - 60 * a.u);
    if (this.started) {
      const bw = Math.min(90 * a.u, (a.right - a.left) / 4 - 12 * a.u);
      this.boxes = this.opts.map((_, k) => [a.cx + (k - 2) * (bw + 12 * a.u) + 6 * a.u, a.cy, bw, 50 * a.u] as Rect);
      this.boxes.forEach(([x, y, w, h], k) => {
        ctx.strokeStyle = COL_DIM;
        ctx.lineWidth = 1.5 * dpr;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = COL_LINE;
        v.text(String(this.opts[k]), x + w / 2, y + h / 2 + 6 * dpr, v.fontHud, 'center');
        ctx.fillStyle = COL_DIM;
        v.text(String(k + 1), x + 7 * dpr, y + 13 * dpr, v.fontTiny, 'left');
      });
    }
    if (now < this.flash) {
      ctx.fillStyle = COL_ACCENT;
      v.text(this.note, a.cx, a.cy + 90 * a.u, v.fontTiny, 'center');
    }
    ctx.fillStyle = COL_MID;
    v.text(this.started ? 'pick the average (the mean): 1 to 4 or a click' : 'click (or press Space) to start; a minute', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.ok * 30 - this.bad * 30),
      primary: { label: 'right in a minute', value: this.ok, unit: '' },
      lines: [
        { label: 'right', value: String(this.ok) },
        { label: 'wrong', value: String(this.bad) },
        { label: 'typical time a set', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.ok + this.bad >= 4,
    };
  }
}

export const BATCH76: MiniDef[] = [
  { id: 'hide', name: 'Hide', skill: 'memory', blurb: 'Digits fill a grid, then are covered. Where was the 7?', how: 'Some digits are scattered over a grid: remember where each one is (Space when ready). Then they are covered, and you are asked for two of them in turn: click the square each was in. Both right and the next grid has one more digit; both wrong and it has one fewer. Twelve grids.', input: 'pointer', make: () => new Hide() },
  { id: 'average', name: 'Average', skill: 'reasoning', blurb: 'A handful of numbers. Which is their average?', how: 'Three numbers (later four, then five): pick their average, the total divided by how many there are, from four answers (1 to 4, or click). The wrong answers sit close by. A minute; a mistake shows the working.', input: 'pointer', make: () => new Average() },
];
