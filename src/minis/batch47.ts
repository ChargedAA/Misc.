// Forty-seventh batch.
//   Clicks - a quick burst of clicks: how many were there?
//   Entry  - type numbers exactly, fast: amounts, codes and dates.
//   Rank   - four numbers: press their positions from smallest to largest.
//   Curves - two zigzag paths: which is longer?

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { Stair, arena, footer, header, mean, median, ms, pct, scaled, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Clicks ----------------------------------------------------------------------------

const CLICKS_ROUNDS = 15;

class Clicks implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private n = 0;
  private rate = 6;
  private plan: { t: number; done: boolean }[] = [];
  private state = 0; // 0 listening, 1 answering, 2 feedback
  private at = 0;
  private typed = '';
  private errs: number[] = [];
  private exact = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 700);
  }

  private arm(at: number): void {
    // More clicks, faster, as you go; the gaps wobble a little so it cannot be timed.
    this.n = rint(4, Math.min(16, 7 + this.round));
    this.rate = Math.min(14, 6 + this.round * 0.5);
    const gap = 1000 / this.rate;
    this.plan = [];
    let t = at;
    for (let k = 0; k < this.n; k++) {
      this.plan.push({ t, done: false });
      t += gap * rnd(0.8, 1.2);
    }
    this.at = t + 200;
    this.typed = '';
    this.state = 0;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const d = digitOf(code);
    if (this.state !== 1) return !!d;
    if (d) {
      if (this.typed.length < 2) this.typed += d;
      if (this.typed.length === 2) this.check(ts);
      return true;
    }
    if (code === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      return true;
    }
    if ((code === 'Enter' || code === 'NumpadEnter' || code === 'Space') && this.typed) {
      this.check(ts);
      return true;
    }
    return false;
  }

  private check(ts: number): void {
    const e = Math.abs(Number(this.typed) - this.n);
    this.errs.push(e);
    if (e === 0) this.exact++;
    this.env.sound(e === 0 ? SND_CATCH : SND_FALSE);
    this.round++;
    this.state = 2;
    this.at = ts + 1300;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    for (const p of this.plan) {
      if (!p.done && now >= p.t) {
        p.done = true;
        this.env.sound(SND_TAP_WEAK);
      }
    }
    if (this.state === 0 && now >= this.at) this.state = 1;
    if (this.state === 2 && now >= this.at) {
      if (this.round >= scaled(CLICKS_ROUNDS)) return true;
      this.arm(now + 600);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'exactly right', this.round ? `${this.exact} of ${this.round}` : '–', 'burst', `${Math.min(this.round + 1, scaled(CLICKS_ROUNDS))} / ${scaled(CLICKS_ROUNDS)}`);
    ctx.fillStyle = this.state === 0 ? COL_MID : COL_LINE;
    v.text(this.state === 0 ? 'listen and count…' : this.state === 1 ? `how many clicks?  ${this.typed || '_'}` : this.errs[this.errs.length - 1] === 0 ? `right: ${this.n}` : `there were ${this.n}`, a.cx, a.cy, v.fontHud, 'center');
    if (this.round === 0 && this.state === 1) {
      ctx.fillStyle = COL_MID;
      v.text('type the number, then Enter', a.cx, a.cy + 40 * a.u, v.fontTiny, 'center');
    }
    if (this.env.muted) {
      ctx.fillStyle = COL_ACCENT;
      v.text('needs sound on', a.cx, a.top + 10 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.exact * 60 + Math.round(Math.max(0, 3 - m) * 50),
      primary: { label: 'counted exactly', value: this.errs.length ? Math.round((100 * this.exact) / this.errs.length) : 0, unit: '%' },
      lines: [
        { label: 'exactly right', value: `${this.exact} of ${this.errs.length}` },
        { label: 'typically off by', value: this.errs.length ? `${m.toFixed(1)} clicks` : '–' },
        { label: 'fastest burst', value: `${this.rate.toFixed(1)} clicks a second` },
      ],
      saved: this.errs.length >= 3,
    };
  }
}

// --- Entry (number data entry) ---------------------------------------------------------

const ENTRY_MS = 60000;

class Entry implements Mini {
  private env!: MiniEnv;
  private target = '';
  private typed = '';
  private t0 = 0;
  private started = false;
  private done = 0;
  private chars = 0;
  private errors = 0;
  private itemAt = 0;
  private times: number[] = [];
  private flash = 0;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
    this.make();
  }

  private make(): void {
    const kind = rint(0, 3);
    if (kind === 0) this.target = `${rint(1, 9999)}.${String(rint(0, 99)).padStart(2, '0')}`;
    else if (kind === 1) this.target = String(rint(100000, 9999999));
    else if (kind === 2) this.target = `${String(rint(1, 28)).padStart(2, '0')}/${String(rint(1, 12)).padStart(2, '0')}/${rint(1950, 2030)}`;
    else this.target = `${rint(100, 999)}-${rint(100, 999)}-${rint(1000, 9999)}`;
    this.typed = '';
  }

  press(): void {}

  typeKey(code: string, ts: number, key?: string): boolean {
    const ch = digitOf(code) || (key === '.' || key === '/' || key === '-' ? key : code === 'Period' || code === 'NumpadDecimal' ? '.' : code === 'Slash' || code === 'NumpadDivide' ? '/' : code === 'Minus' || code === 'NumpadSubtract' ? '-' : '');
    if (!this.started && ch) {
      this.started = true;
      this.t0 = ts;
      this.itemAt = ts;
    }
    if (ch) {
      const want = this.target[this.typed.length];
      if (ch === want) {
        this.typed += ch;
        this.chars++;
        if (this.typed === this.target) {
          this.done++;
          this.times.push(ts - this.itemAt);
          this.itemAt = ts;
          this.env.sound(SND_TAP_WEAK);
          this.make();
        }
      } else {
        // A wrong key is refused and counted: entry has to be exact.
        this.errors++;
        this.flash = ts + 200;
        this.env.sound(SND_FALSE);
      }
      return true;
    }
    return false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(ENTRY_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'entries', String(this.done), 'time', `${left} s`);
    ctx.font = `600 ${Math.round(46 * a.u)}px ui-monospace, 'JetBrains Mono', Menlo, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const cw = ctx.measureText('0').width;
    const x0 = a.cx - (this.target.length * cw) / 2;
    for (let k = 0; k < this.target.length; k++) {
      ctx.fillStyle = k < this.typed.length ? COL_LINE : k === this.typed.length && now < this.flash ? COL_ACCENT : COL_DIM;
      ctx.fillText(this.target[k]!, x0 + k * cw, a.cy);
    }
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(x0 + this.typed.length * cw, a.cy + 30 * a.u, cw, 3 * v.dpr);
    ctx.fillStyle = COL_MID;
    v.text(this.started ? 'type it exactly: digits, points, slashes and dashes' : 'type the number exactly. the clock starts with your first key. a minute', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const mins = Math.max(1 / 60, scaled(ENTRY_MS) / 60000);
    return {
      score: Math.max(0, this.chars * 2 - this.errors * 5),
      primary: { label: 'characters a minute', value: Math.round(this.chars / mins), unit: '/min' },
      lines: [
        { label: 'entries completed', value: String(this.done) },
        { label: 'wrong keys', value: `${this.errors}  (accuracy ${pct(this.chars / Math.max(1, this.chars + this.errors))})` },
        { label: 'typical time an entry', value: this.times.length ? ms(median(this.times)) : '–' },
      ],
      saved: this.chars >= 15,
    };
  }
}

// --- Rank ------------------------------------------------------------------------------

const RANK_MS = 60000;

class Rank implements Mini {
  private env!: MiniEnv;
  private nums: number[] = [];
  private order: number[] = [];
  private step = 0;
  private t0 = 0;
  private started = false;
  private sets = 0;
  private wrong = 0;
  private setAt = 0;
  private times: number[] = [];
  private flash = -1;
  private flashUntil = 0;
  private level = 0;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
    this.make(0);
  }

  private make(now: number): void {
    // Closer values, and decimals and negatives, as you go.
    const lv = this.level;
    const gen = () => (lv < 4 ? rint(1, 99) : lv < 8 ? rint(-50, 99) : Math.round(rnd(-20, 20) * 10) / 10);
    const set = new Set<number>();
    while (set.size < 4) set.add(gen());
    this.nums = [...set];
    this.order = this.nums.map((_, k) => k).sort((x, y) => this.nums[x]! - this.nums[y]!);
    this.step = 0;
    this.setAt = now;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const d = Number(digitOf(code));
    if (!(d >= 1 && d <= 4)) return false;
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.make(ts);
      return true;
    }
    const k = d - 1;
    if (k === this.order[this.step]) {
      this.step++;
      this.env.sound(this.step % 2 ? SND_TAP_L : SND_TAP_R);
      if (this.step === 4) {
        this.sets++;
        this.level++;
        this.times.push(ts - this.setAt);
        this.make(ts);
      }
    } else {
      this.wrong++;
      this.level = Math.max(0, this.level - 1);
      this.flash = k;
      this.flashUntil = ts + 300;
      this.env.sound(SND_FALSE);
    }
    return true;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(RANK_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'sets', String(this.sets), 'time', `${left} s`);
    const bw = Math.min(130 * a.u, (a.right - a.left) / 4 - 14 * a.u);
    this.nums.forEach((n, k) => {
      const x = a.cx + (k - 2) * (bw + 14 * a.u) + 7 * a.u;
      const done = this.order.slice(0, this.step).includes(k);
      ctx.strokeStyle = k === this.flash && now < this.flashUntil ? COL_ACCENT : done ? COL_DIM : COL_MID;
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeRect(x, a.cy - bw * 0.4, bw, bw * 0.8);
      ctx.fillStyle = done ? COL_DIM : COL_LINE;
      v.text(this.started ? String(n) : '?', x + bw / 2, a.cy + 6 * dpr, v.fontHud, 'center');
      ctx.fillStyle = COL_DIM;
      v.text(String(k + 1), x + bw / 2, a.cy + bw * 0.4 + 18 * a.u, v.fontTiny, 'center');
    });
    ctx.fillStyle = COL_MID;
    v.text(this.started ? 'press 1 to 4 for the boxes, smallest number first' : 'press the boxes (1 to 4) from smallest number to largest. press any of 1 to 4 to start', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.sets * 50 - this.wrong * 20),
      primary: { label: 'sets ranked', value: this.sets, unit: '' },
      lines: [
        { label: 'sets ranked', value: String(this.sets) },
        { label: 'wrong presses', value: String(this.wrong) },
        { label: 'typical time a set', value: this.times.length ? ms(median(this.times)) : '–' },
      ],
      saved: this.sets + this.wrong >= 2,
    };
  }
}

// --- Curves (which path is longer) -----------------------------------------------------

/** Length difference between the two paths (%), staircased. */
const CURVES_TRIALS = 30;

class Curves implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private readonly stair = new Stair(24, 2, 2, 40, 2);
  private paths: [number, number][][] = [[], []];
  private longer = 0;
  private state = 0;
  private next = 0;
  private right = 0;
  private levels: number[] = [];
  private held = 0;
  private last = '';

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 600;
  }

  /** A zigzag path with a given total length (unit coordinates), its wiggles at random. */
  private path(len: number): [number, number][] {
    for (;;) {
      const pts: [number, number][] = [[0, 0]];
      const n = rint(4, 7);
      for (let k = 0; k < n; k++) pts.push([rnd(-0.5, 0.5), rnd(-0.5, 0.5)]);
      let L = 0;
      for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k]![0] - pts[k - 1]![0], pts[k]![1] - pts[k - 1]![1]);
      const s = len / L;
      const out = pts.map(([x, y]) => [x * s, y * s] as [number, number]);
      const xs = out.map((p) => p[0]);
      const ys = out.map((p) => p[1]);
      // Kept to a box, so length cannot be read from spread alone.
      if (Math.max(...xs) - Math.min(...xs) < 0.95 && Math.max(...ys) - Math.min(...ys) < 0.95) {
        const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
        const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
        return out.map(([x, y]) => [x - cx, y - cy]);
      }
    }
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 1) return;
    const ok = (s < 0 ? 0 : 1) === this.longer;
    if (ok) this.right++;
    this.levels.push(this.stair.level);
    this.stair.update(ok, -1);
    this.last = ok ? '' : `the ${this.longer ? 'right' : 'left'} one was longer`;
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.i++;
    this.state = 2;
    this.next = ts + (ok ? 500 : 1000);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state !== 1 && now >= this.next) {
      if (this.i >= scaled(CURVES_TRIALS)) return true;
      const base = rnd(2.2, 3);
      const d = this.stair.level / 100;
      this.longer = Math.random() < 0.5 ? 0 : 1;
      this.paths = [this.path(this.longer === 0 ? base * (1 + d) : base), this.path(this.longer === 1 ? base * (1 + d) : base)];
      this.state = 1;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'difference', `${Math.round(this.stair.level)}%`, 'pair', `${Math.min(this.i + 1, scaled(CURVES_TRIALS))} / ${scaled(CURVES_TRIALS)}`);
    const S = Math.min((a.right - a.left) / 2 - 30 * a.u, a.bottom - a.top - 70 * a.u);
    this.paths.forEach((p, k) => {
      const cx = a.cx + (k ? 1 : -1) * ((a.right - a.left) / 4);
      const cy = a.cy - 10 * a.u;
      ctx.strokeStyle = this.state === 2 && k === this.longer ? COL_LINE : this.state === 2 ? COL_DIM : COL_LINE;
      ctx.lineWidth = 2.5 * dpr;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      p.forEach(([x, y], q) => (q ? ctx.lineTo(cx + x * S, cy + y * S) : ctx.moveTo(cx + x * S, cy + y * S)));
      ctx.stroke();
    });
    ctx.fillStyle = COL_MID;
    v.text(this.state === 2 && this.last ? this.last : 'which path is longer, end to end? left or right', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const thr = this.levels.length >= 8 ? median(this.levels.slice(-12)) : NaN;
    return {
      score: Number.isFinite(thr) ? Math.round(Math.max(0, 42 - thr) * 25) : 0,
      primary: { label: 'smallest difference you see', value: thr, unit: '%', lower: true },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'smallest reached', value: this.levels.length ? `${Math.min(...this.levels)}%` : '–' },
      ],
      saved: this.i >= 8,
    };
  }
}

export const BATCH47: MiniDef[] = [
  { id: 'clicks', name: 'Clicks', skill: 'ear', blurb: 'A quick burst of clicks. How many were there?', how: 'A burst of clicks plays, too fast to count comfortably. Type how many there were and press Enter. The bursts grow longer and faster, and the gaps wobble so you cannot just time them. Fifteen bursts.', input: 'type', make: () => new Clicks() },
  { id: 'entry', name: 'Entry', skill: 'dexterity', blurb: 'Type numbers exactly, fast: amounts, codes and dates.', how: 'Amounts, codes, phone numbers and dates appear one after another. Type each exactly; a wrong key is refused and counted. The number row or the numpad both work. A minute, scored in characters a minute.', input: 'type', make: () => new Entry() },
  { id: 'rank', name: 'Rank', skill: 'reasoning', blurb: 'Four numbers: press them from smallest to largest.', how: 'Four numbers in boxes numbered 1 to 4. Press the boxes’ keys in order from the smallest number to the largest. Negative numbers and decimals join in, and the values get closer. A minute; wrong presses count against you.', input: 'type', make: () => new Rank() },
  { id: 'curves', name: 'Curves', skill: 'judgement', blurb: 'Two zigzag paths. Which is longer?', how: 'Two zigzag paths, each kept to the same size of box. Which is longer, end to end, if you straightened it out? Press its side. The difference shrinks as you get them right. Scored on the smallest difference you still see.', input: 'keys', minKeys: 2, make: () => new Curves() },
];
