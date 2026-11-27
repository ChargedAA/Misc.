// Thirty-sixth batch.
//   Voices - several notes sound at once. How many?
//   Triad  - twelve cards; find three where every feature is all the same or all different.
//   Oven   - sort numbers, and take the cakes out on time with no clock in sight.
//   Fold   - paper folds, a hole is punched: where are the holes when it opens?

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, mean, median, ms, pct, scaled, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

// --- Voices ----------------------------------------------------------------------------

const VOICES_TRIALS = 30;

class Voices implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private maxN = 3;
  private streak = 0;
  private best = 0;
  private n = 1;
  private notes: number[] = [];
  private state = 0; // 0 gap, 1 answering, 2 feedback
  private next = 0;
  private boxes: Rect[] = [];
  private right = 0;
  private last = '';
  private byN = new Map<number, [number, number]>();

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 800;
  }

  private play(): void {
    for (const m of this.notes) this.env.note?.(hz(m), 1100, 0);
  }

  private make(): void {
    this.n = rint(1, this.maxN);
    // Notes from a wide range at first; closer together as the count climbs.
    const span = Math.max(8, 26 - this.maxN * 2);
    const lo = rint(48, 60);
    const pool = Array.from({ length: span }, (_, k) => lo + k);
    this.notes = [];
    while (this.notes.length < this.n) {
      const m = pool[Math.floor(Math.random() * pool.length)]!;
      // No octaves and no unisons: those fuse into one sound.
      if (!this.notes.some((x) => x === m || Math.abs(x - m) % 12 === 0)) this.notes.push(m);
    }
    this.play();
  }

  press(): void {}

  private answer(k: number, ts: number): void {
    if (this.state !== 1) return;
    const ok = k === this.n;
    const s = this.byN.get(this.n) ?? [0, 0];
    s[1]++;
    if (ok) s[0]++;
    this.byN.set(this.n, s);
    if (ok) {
      this.right++;
      this.streak++;
      if (this.streak >= 3 && this.maxN < 7) {
        this.best = Math.max(this.best, this.maxN);
        this.maxN++;
        this.streak = 0;
      }
    } else {
      this.streak = 0;
    }
    this.last = ok ? '' : `there were ${this.n}`;
    this.env.sound(ok ? SND_TAP_WEAK : SND_FALSE);
    this.i++;
    this.state = 2;
    this.next = ts + (ok ? 700 : 1300);
  }

  typeKey(code: string, ts: number): boolean {
    const d = code.startsWith('Digit') ? Number(code.slice(5)) : code.startsWith('Numpad') ? Number(code.slice(6)) : NaN;
    if (d >= 1 && d <= 7) {
      this.answer(d, ts);
      return true;
    }
    if (code === 'KeyR' && this.state === 1) {
      this.play();
      return true;
    }
    return false;
  }

  pointer(x: number, y: number, ts: number): void {
    const k = this.boxes.findIndex((r) => inside(r, x, y));
    if (k >= 0) this.answer(k + 1, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if ((this.state === 0 || this.state === 2) && now >= this.next) {
      if (this.i >= scaled(VOICES_TRIALS)) return true;
      this.make();
      this.state = 1;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'up to', `${this.maxN} notes`, 'chord', `${Math.min(this.i + 1, scaled(VOICES_TRIALS))} / ${scaled(VOICES_TRIALS)}`);
    const n = 7;
    const bw = Math.min(70 * a.u, (a.right - a.left - 20 * a.u) / n - 8 * a.u);
    this.boxes = Array.from({ length: n }, (_, k) => [a.cx + (k - n / 2) * (bw + 8 * a.u) + 4 * a.u, a.cy, bw, bw] as Rect);
    this.boxes.forEach((r, k) => {
      const on = k + 1 <= this.maxN;
      ctx.strokeStyle = on ? COL_MID : COL_FAINT;
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeRect(r[0], r[1], r[2], r[3]);
      ctx.fillStyle = on ? COL_LINE : COL_DIM;
      v.text(String(k + 1), r[0] + r[2] / 2, r[1] + r[3] / 2 + 6 * dpr, v.fontHud, 'center');
    });
    ctx.fillStyle = COL_MID;
    v.text(this.state === 2 && this.last ? this.last : 'how many notes are sounding together? (1 to 7; R plays it again)', a.cx, a.cy - 40 * a.u, v.fontTiny, 'center');
    if (this.env.muted) {
      ctx.fillStyle = COL_ACCENT;
      v.text('needs sound on', a.cx, a.top + 10 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const best = Math.max(this.best, this.i >= 3 ? this.maxN - 1 : 0);
    return {
      score: best * 120 + this.right * 5,
      primary: { label: 'most notes counted reliably', value: best, unit: '' },
      series: { label: 'right, by number of notes', names: [...this.byN.keys()].sort((x, y) => x - y).map(String), values: [...this.byN.keys()].sort((x, y) => x - y).map((k) => Math.round((100 * this.byN.get(k)![0]) / this.byN.get(k)![1])), unit: '%' },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'reached', value: `up to ${this.maxN} notes at once` },
      ],
      saved: this.i >= 6,
    };
  }
}

// --- Triad -----------------------------------------------------------------------------

/** A card: shape, count, shade, each 0..2. */
type Card = [number, number, number];
const TRIAD_MS = 90000;

function isTriad(a: Card, b: Card, c: Card): boolean {
  for (let f = 0; f < 3; f++) {
    const s = new Set([a[f], b[f], c[f]]);
    if (s.size === 2) return false;
  }
  return true;
}

function randomCard(): Card {
  return [rint(0, 2), rint(0, 2), rint(0, 2)];
}

class Triad implements Mini {
  private env!: MiniEnv;
  private cards: Card[] = [];
  private sel: number[] = [];
  private found = 0;
  private wrong = 0;
  private times: number[] = [];
  private lastAt = 0;
  private t0 = 0;
  private started = false;
  private boxes: Rect[] = [];
  private flash = 0;
  private flashOk = true;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
    this.deal();
  }

  private triads(): number {
    let n = 0;
    for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let k = j + 1; k < 12; k++) if (isTriad(this.cards[i]!, this.cards[j]!, this.cards[k]!)) n++;
    return n;
  }

  private deal(): void {
    // Twelve different cards with at least one triad among them.
    for (;;) {
      const seen = new Set<string>();
      this.cards = [];
      while (this.cards.length < 12) {
        const c = randomCard();
        if (!seen.has(c.join())) {
          seen.add(c.join());
          this.cards.push(c);
        }
      }
      if (this.triads() >= 1) return;
    }
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.lastAt = ts;
    }
    const k = this.boxes.findIndex((r) => inside(r, x, y));
    if (k < 0) return;
    const at = this.sel.indexOf(k);
    if (at >= 0) {
      this.sel.splice(at, 1);
      return;
    }
    this.sel.push(k);
    this.env.sound(SND_TAP_L);
    if (this.sel.length < 3) return;
    const [i, j, l] = this.sel as [number, number, number];
    const ok = isTriad(this.cards[i]!, this.cards[j]!, this.cards[l]!);
    this.flash = ts + 400;
    this.flashOk = ok;
    if (ok) {
      this.found++;
      this.times.push(ts - this.lastAt);
      this.lastAt = ts;
      this.env.sound(SND_CATCH);
      // Replace the three, keeping every card different and a triad on the board.
      const keep = new Set(this.cards.filter((_, q) => !this.sel.includes(q)).map((c) => c.join()));
      for (let tries = 0; tries < 400; tries++) {
        const fresh = this.sel.map(() => randomCard());
        const keys = fresh.map((c) => c.join());
        if (new Set(keys).size < 3 || keys.some((q) => keep.has(q))) continue;
        const old = this.cards.slice();
        this.sel.forEach((q, n) => (this.cards[q] = fresh[n]!));
        if (this.triads() >= 1) break;
        this.cards = old;
      }
    } else {
      this.wrong++;
      this.env.sound(SND_FALSE);
    }
    this.sel = [];
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(TRIAD_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'triads', String(this.found), 'time', `${left} s`);
    const cols = 4;
    const rows = 3;
    const gw = Math.min(a.right - a.left, (a.bottom - a.top) * 1.55);
    const cw = gw / cols - 10 * a.u;
    const ch = Math.min(cw * 0.62, (a.bottom - a.top) / rows - 12 * a.u);
    const x0 = a.cx - (cols * (cw + 10 * a.u)) / 2 + 5 * a.u;
    const y0 = a.cy - (rows * (ch + 12 * a.u)) / 2 + 6 * a.u;
    this.boxes = this.cards.map((_, k) => [x0 + (k % cols) * (cw + 10 * a.u), y0 + Math.floor(k / cols) * (ch + 12 * a.u), cw, ch] as Rect);
    this.cards.forEach((c, k) => {
      const [x, y, w, h] = this.boxes[k]!;
      const picked = this.sel.includes(k);
      ctx.fillStyle = '#121215';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = picked ? COL_ACCENT : COL_DIM;
      ctx.lineWidth = (picked ? 3 : 1.5) * dpr;
      ctx.strokeRect(x, y, w, h);
      const n = c[1] + 1;
      const s = Math.min(h * 0.32, w / 7);
      for (let q = 0; q < n; q++) {
        const sx = x + w / 2 + (q - (n - 1) / 2) * s * 2.4;
        const sy = y + h / 2;
        ctx.beginPath();
        if (c[0] === 0) ctx.arc(sx, sy, s, 0, TAU);
        else if (c[0] === 1) ctx.rect(sx - s * 0.85, sy - s * 0.85, s * 1.7, s * 1.7);
        else {
          ctx.moveTo(sx, sy - s);
          ctx.lineTo(sx + s, sy + s * 0.8);
          ctx.lineTo(sx - s, sy + s * 0.8);
          ctx.closePath();
        }
        if (c[2] === 2) {
          ctx.strokeStyle = COL_LINE;
          ctx.lineWidth = 2 * dpr;
          ctx.stroke();
        } else {
          ctx.fillStyle = c[2] === 0 ? COL_LINE : '#7a7a82';
          ctx.fill();
        }
      }
    });
    if (now < this.flash) {
      ctx.fillStyle = this.flashOk ? COL_LINE : COL_MID;
      v.text(this.flashOk ? 'triad' : 'not a triad', a.cx, a.bottom - 2 * a.u, v.fontTiny, 'center');
    } else if (!this.started || this.found === 0) {
      ctx.fillStyle = COL_MID;
      v.text('pick three cards where shape, number and shade are each all the same or all different', a.cx, a.bottom - 2 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.found * 100 - this.wrong * 20),
      primary: { label: 'triads found', value: this.found, unit: '' },
      lines: [
        { label: 'triads found', value: String(this.found) },
        { label: 'wrong picks', value: String(this.wrong) },
        { label: 'typical time a triad', value: this.times.length ? ms(median(this.times)) : '–' },
      ],
      saved: this.started && this.found + this.wrong >= 1,
    };
  }
}

// --- Oven (time-based prospective memory) -----------------------------------------------

const OVEN_MS = 120000;

class Oven implements Mini {
  private env!: MiniEnv;
  private t0 = 0;
  private started = false;
  private interval = 30000;
  /** When each cake is due, from the start. */
  private due: number[] = [];
  private presses: number[] = [];
  private peeks = 0;
  private peekUntil = 0;
  private num = 0;
  private numAt = 0;
  private sorted = 0;
  private sortErr = 0;
  private flash = '';
  private flashAt = 0;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
    this.interval = [25000, 30000, 35000][rint(0, 2)]!;
  }

  private begin(ts: number): void {
    this.started = true;
    this.t0 = ts;
    const len = scaled(OVEN_MS);
    this.due = [];
    for (let t = this.interval; t < len; t += this.interval) this.due.push(t);
    this.newNumber(ts);
  }

  private newNumber(ts: number): void {
    this.num = rint(11, 99);
    this.numAt = ts;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    if (!this.started) {
      if (code === 'KeyZ' || code === 'KeyM' || code === 'Space') {
        this.begin(ts);
        return true;
      }
      return false;
    }
    if (code === 'KeyZ' || code === 'KeyM') {
      const odd = this.num % 2 === 1;
      if ((code === 'KeyZ') === odd) this.sorted++;
      else {
        this.sortErr++;
        this.env.sound(SND_FALSE);
      }
      this.env.sound(code === 'KeyZ' ? SND_TAP_L : SND_TAP_R);
      this.newNumber(ts);
      return true;
    }
    if (code === 'Space') {
      this.presses.push(ts - this.t0);
      this.flash = 'cake out';
      this.flashAt = ts;
      this.env.sound(SND_CATCH);
      return true;
    }
    if (code === 'KeyC') {
      this.peeks++;
      this.peekUntil = ts + 1000;
      return true;
    }
    return false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(OVEN_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    // A number not sorted in time moves on anyway.
    if (this.started && now - this.numAt > 2500) {
      this.sortErr++;
      this.newNumber(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'cakes out', String(this.presses.length), 'sorted', String(this.sorted));
    ctx.font = `600 ${Math.round(80 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.started) {
      ctx.fillStyle = COL_LINE;
      ctx.fillText(String(this.num), a.cx, a.cy - 20 * a.u);
      ctx.fillStyle = COL_MID;
      v.text('Z odd   ·   M even', a.cx, a.cy + 50 * a.u, v.fontTiny, 'center');
      if (now < this.peekUntil) {
        // The peek: the oven clock, for a second.
        const since = (now - this.t0) % this.interval;
        ctx.fillStyle = COL_LINE;
        v.text(`oven: ${Math.floor(since / 1000)} s of ${this.interval / 1000}`, a.cx, a.top + 20 * a.u, v.fontHud, 'center');
      }
      if (now - this.flashAt < 600) {
        ctx.fillStyle = COL_ACCENT;
        v.text(this.flash, a.cx, a.top + 50 * a.u, v.fontTiny, 'center');
      }
      ctx.fillStyle = COL_DIM;
      v.text(`a cake comes out every ${this.interval / 1000} s: press Space on each one   ·   hold C to peek at the oven clock`, a.cx, a.bottom - 6 * a.u, v.fontTiny, 'center');
    } else {
      ctx.fillStyle = COL_MID;
      v.text(`sort numbers with Z (odd) and M (even). every ${this.interval / 1000} seconds a cake is ready: press Space`, a.cx, a.cy - 20 * a.u, v.fontTiny, 'center');
      v.text('there is no clock on screen; C peeks at it, and every peek counts. press Z or M to start', a.cx, a.cy + 10 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  /** Each due time matched with the nearest Space press within half an interval; misses count as half. */
  private errors(): number[] {
    const used = new Set<number>();
    return this.due.map((d) => {
      let bi = -1;
      this.presses.forEach((p, k) => {
        if (!used.has(k) && Math.abs(p - d) < this.interval / 2 && (bi < 0 || Math.abs(p - d) < Math.abs(this.presses[bi]! - d))) bi = k;
      });
      if (bi < 0) return this.interval / 2;
      used.add(bi);
      return Math.abs(this.presses[bi]! - d);
    });
  }

  result(): MiniResult {
    const errs = this.errors().map((e) => e / 1000);
    const m = mean(errs);
    return {
      score: errs.length ? Math.round(Math.max(0, 15 - m) * 60 - this.peeks * 10 + this.sorted) : 0,
      primary: { label: 'cakes out, typically off by', value: errs.length ? m : 0, unit: 's', lower: true, decimals: 1 },
      lines: [
        { label: 'cakes: average timing error', value: errs.length ? `${m.toFixed(1)} s` : '–' },
        { label: 'peeks at the clock', value: String(this.peeks) },
        { label: 'numbers sorted right', value: `${this.sorted} (${this.sortErr} wrong or missed)` },
        { label: 'sorting accuracy', value: pct(this.sorted / Math.max(1, this.sorted + this.sortErr)) },
      ],
      saved: this.started && this.due.length >= 1 && this.sorted >= 5,
    };
  }
}

// --- Fold ------------------------------------------------------------------------------

/** One fold: which edge folds over onto the other. */
type FoldDir = 'L' | 'R' | 'T' | 'B';

class Fold implements Mini {
  private env!: MiniEnv;
  private n = 4;
  private level = 1;
  private best = 0;
  private lives = 3;
  private folds: FoldDir[] = [];
  /** The paper's extent after each fold, in grid cells: [x0, y0, x1, y1). */
  private extents: [number, number, number, number][] = [];
  private punch: [number, number][] = [];
  private holes = new Set<number>();
  private picks = new Set<number>();
  private state = 0; // 0 folding, 1 answering, 2 feedback
  private at = 0;
  private cells: Rect[] = [];
  private doneBox: Rect = [0, 0, 0, 0];
  private ok = false;
  private rounds = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 400);
  }

  private arm(at: number): void {
    const nf = Math.min(3, 1 + Math.floor((this.level - 1) / 2));
    const np = this.level >= 4 ? 2 : 1;
    // Each original cell's place on the folded paper.
    let pos = Array.from({ length: this.n * this.n }, (_, c) => [c % this.n, Math.floor(c / this.n)] as [number, number]);
    let ext: [number, number, number, number] = [0, 0, this.n, this.n];
    this.folds = [];
    this.extents = [ext];
    for (let k = 0; k < nf; k++) {
      const w = ext[2] - ext[0];
      const h = ext[3] - ext[1];
      const opts: FoldDir[] = [];
      if (w >= 2) opts.push('L', 'R');
      if (h >= 2) opts.push('T', 'B');
      const d = opts[rint(0, opts.length - 1)]!;
      this.folds.push(d);
      if (d === 'L' || d === 'R') {
        const mid = ext[0] + w / 2;
        // L: the left half folds over onto the right half.
        pos = pos.map(([x, y]) => [d === 'L' ? (x < mid ? 2 * mid - 1 - x : x) : x >= mid ? 2 * mid - 1 - x : x, y]);
        ext = d === 'L' ? [mid, ext[1], ext[2], ext[3]] : [ext[0], ext[1], mid, ext[3]];
      } else {
        const mid = ext[1] + h / 2;
        pos = pos.map(([x, y]) => [x, d === 'T' ? (y < mid ? 2 * mid - 1 - y : y) : y >= mid ? 2 * mid - 1 - y : y]);
        ext = d === 'T' ? [ext[0], mid, ext[2], ext[3]] : [ext[0], ext[1], ext[2], mid];
      }
      this.extents.push(ext);
    }
    this.punch = [];
    while (this.punch.length < np) {
      const p: [number, number] = [rint(ext[0], ext[2] - 1), rint(ext[1], ext[3] - 1)];
      if (!this.punch.some((q) => q[0] === p[0] && q[1] === p[1])) this.punch.push(p);
    }
    this.holes = new Set(pos.map((p, c) => (this.punch.some((q) => q[0] === p[0] && q[1] === p[1]) ? c : -1)).filter((c) => c >= 0));
    this.picks = new Set();
    this.state = 0;
    this.at = at;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 1) return;
    if (inside(this.doneBox, x, y)) {
      this.submit(ts);
      return;
    }
    const c = this.cells.findIndex((r) => inside(r, x, y));
    if (c < 0) return;
    if (this.picks.has(c)) this.picks.delete(c);
    else this.picks.add(c);
    this.env.sound(SND_TAP_WEAK);
  }

  typeKey(code: string, ts: number): boolean {
    if ((code === 'Enter' || code === 'Space') && this.state === 1) {
      this.submit(ts);
      return true;
    }
    return false;
  }

  private submit(ts: number): void {
    this.ok = this.picks.size === this.holes.size && [...this.picks].every((c) => this.holes.has(c));
    this.rounds++;
    if (this.ok) {
      this.best = Math.max(this.best, this.level);
      this.level++;
      this.env.sound(SND_CATCH);
    } else {
      this.lives--;
      this.env.sound(SND_FALSE);
    }
    this.state = 2;
    this.at = ts + (this.ok ? 900 : 2200);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const step = 1100;
    if (this.state === 0 && now >= this.at + step * (this.folds.length + 1.5)) this.state = 1;
    if (this.state === 2 && now >= this.at) {
      if (this.lives <= 0) return true;
      this.arm(now + 300);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'level', String(this.level), 'best', String(this.best), this.lives);
    const size = Math.min(a.bottom - a.top - 40 * a.u, (a.right - a.left) * 0.6);
    const cs = size / this.n;
    const x0 = a.cx - size / 2;
    const y0 = a.top + 10 * a.u;
    if (this.state === 0) {
      // The folding, one step at a time: the paper so far, the fold line, an arrow; then the punch.
      const k = Math.max(0, Math.floor((now - this.at) / step));
      const shown = Math.min(k, this.folds.length);
      const ext = this.extents[shown]!;
      ctx.strokeStyle = COL_FAINT;
      ctx.lineWidth = dpr;
      ctx.strokeRect(x0, y0, size, size);
      ctx.fillStyle = '#e8e8ea';
      ctx.fillRect(x0 + ext[0] * cs, y0 + ext[1] * cs, (ext[2] - ext[0]) * cs, (ext[3] - ext[1]) * cs);
      if (k < this.folds.length) {
        const d = this.folds[k]!;
        ctx.strokeStyle = COL_ACCENT;
        ctx.lineWidth = 2 * dpr;
        ctx.setLineDash?.([6 * dpr, 5 * dpr]);
        ctx.beginPath();
        if (d === 'L' || d === 'R') {
          const mx = x0 + ((ext[0] + ext[2]) / 2) * cs;
          ctx.moveTo(mx, y0 + ext[1] * cs - 10 * dpr);
          ctx.lineTo(mx, y0 + ext[3] * cs + 10 * dpr);
        } else {
          const my = y0 + ((ext[1] + ext[3]) / 2) * cs;
          ctx.moveTo(x0 + ext[0] * cs - 10 * dpr, my);
          ctx.lineTo(x0 + ext[2] * cs + 10 * dpr, my);
        }
        ctx.stroke();
        ctx.setLineDash?.([]);
        ctx.fillStyle = COL_MID;
        const word = d === 'L' ? 'left half folds over to the right' : d === 'R' ? 'right half folds over to the left' : d === 'T' ? 'top half folds down' : 'bottom half folds up';
        v.text(`fold ${k + 1}: ${word}`, a.cx, y0 + size + 24 * a.u, v.fontTiny, 'center');
      } else {
        for (const [px, py] of this.punch) {
          ctx.fillStyle = '#0a0a0b';
          ctx.beginPath();
          ctx.arc(x0 + (px + 0.5) * cs, y0 + (py + 0.5) * cs, cs * 0.18, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = COL_MID;
        v.text(this.punch.length > 1 ? 'two holes punched through every layer' : 'a hole punched through every layer', a.cx, y0 + size + 24 * a.u, v.fontTiny, 'center');
      }
    } else {
      // The opened sheet: tap every cell that has a hole.
      this.cells = [];
      for (let c = 0; c < this.n * this.n; c++) {
        const r: Rect = [x0 + (c % this.n) * cs + 2 * dpr, y0 + Math.floor(c / this.n) * cs + 2 * dpr, cs - 4 * dpr, cs - 4 * dpr];
        this.cells.push(r);
        ctx.fillStyle = '#e8e8ea';
        ctx.fillRect(r[0], r[1], r[2], r[3]);
        const mark = this.state === 2 ? this.holes.has(c) : this.picks.has(c);
        if (mark || (this.state === 2 && this.picks.has(c))) {
          ctx.fillStyle = this.state === 2 && !this.holes.has(c) ? COL_ACCENT : '#0a0a0b';
          ctx.beginPath();
          ctx.arc(r[0] + r[2] / 2, r[1] + r[3] / 2, cs * 0.18, 0, TAU);
          ctx.fill();
        }
      }
      this.doneBox = [a.cx - 60 * a.u, y0 + size + 12 * a.u, 120 * a.u, 36 * a.u];
      ctx.strokeStyle = COL_LINE;
      ctx.lineWidth = 1.5 * dpr;
      ctx.strokeRect(...this.doneBox);
      ctx.fillStyle = COL_LINE;
      v.text(this.state === 2 ? (this.ok ? 'right' : 'the holes were here') : 'done (Enter)', a.cx, this.doneBox[1] + 23 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.best * 100,
      primary: { label: 'level', value: this.best, unit: '' },
      lines: [
        { label: 'highest level', value: String(this.best) },
        { label: 'sheets', value: String(this.rounds) },
      ],
      saved: this.rounds >= 1,
    };
  }
}

export const BATCH36: MiniDef[] = [
  { id: 'voices', name: 'Voices', skill: 'ear', blurb: 'Several notes sound at once. How many?', how: 'A chord of one to seven notes sounds. Press how many notes there were (1 to 7, or tap the number); R plays it again. Three right in a row and chords can have one more note, and their notes sit closer together. Octaves never appear, since they blend into one.', input: 'pointer', make: () => new Voices() },
  { id: 'triad', name: 'Triad', skill: 'reasoning', blurb: 'Twelve cards. Find three where every feature is all the same or all different.', how: 'Each card has a shape, a number of shapes (1 to 3) and a shade (white, grey or outline). Pick three cards where, for each of those features, the three are all the same or all different. Two the same and one different breaks it. Found triads are replaced; there is always one on the board. Ninety seconds.', input: 'pointer', make: () => new Triad() },
  { id: 'oven', name: 'Oven', skill: 'memory', blurb: 'Sort numbers, and take the cakes out on time, with no clock in sight.', how: 'Numbers appear one after another: Z if odd, M if even. Meanwhile a cake is ready every 25, 30 or 35 seconds (you are told which): press Space each time one is due. There is no clock on screen; C shows the oven clock for a second, and every peek is counted. Two minutes, scored on how close your Space presses are to the true times.', input: 'type', make: () => new Oven() },
  { id: 'fold', name: 'Fold', skill: 'reasoning', blurb: 'Paper folds, a hole is punched. Where are the holes when it opens?', how: 'A square of paper folds once, twice or three times, step by step, and then a hole is punched through every layer. Then it opens out: tap every square that has a hole and press done. Get it right and the next sheet folds more, and later two holes are punched. Three lives.', input: 'pointer', make: () => new Fold() },
];

