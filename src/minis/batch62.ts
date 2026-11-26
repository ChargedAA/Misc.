// Sixty-second batch.
//   Basins  - two basins fill at their own rates; each hand stops its own at the line.
//   Product - two products, like 23 × 4 and 19 × 5: which is bigger?
//   Alpha   - two words: which comes first in the dictionary?
//   Blinks  - a light flickers, too fast to count comfortably. How many flashes?

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, handLabel, header, mean, median, ms, pct, scaled, sideOf, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';
import { WORDS } from './batch24.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;
const digitOf = (code: string) => (code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '');

// --- Basins ----------------------------------------------------------------------------

const BASIN_ROUNDS = 12;

class Basins implements Mini {
  private env!: MiniEnv;
  private round = 0;
  /** Each basin: its line (0..1), fill rate (a second), level when stopped (or -1). */
  private line = [0.6, 0.7];
  private rate = [0.2, 0.3];
  private stopped = [-1, -1];
  private startAt = 0;
  private state = 0; // 0 countdown, 1 filling, 2 result
  private at = 0;
  private errs: number[] = [];
  private held = 0;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.arm(now);
  }

  private arm(now: number): void {
    this.line = [rnd(0.4, 0.85), rnd(0.4, 0.85)];
    const fast = 1 + this.round * 0.05;
    this.rate = [rnd(0.16, 0.3) * fast, rnd(0.16, 0.3) * fast];
    this.stopped = [-1, -1];
    this.state = 0;
    this.at = now + 900;
  }

  private level(k: number, now: number): number {
    if (this.stopped[k]! >= 0) return this.stopped[k]!;
    if (this.state !== 1) return 0;
    return Math.min(1.05, ((now - this.startAt) / 1000) * this.rate[k]!);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 1) return;
    const k = s < 0 ? 0 : 1;
    if (this.stopped[k]! >= 0) return;
    this.stopped[k] = this.level(k, ts);
    this.env.sound(k ? SND_TAP_R : SND_TAP_L);
    this.check(ts);
  }

  private check(now: number): void {
    if (this.stopped[0]! < 0 || this.stopped[1]! < 0) return;
    const e = [0, 1].map((k) => Math.abs(this.stopped[k]! - this.line[k]!));
    this.errs.push(...e);
    this.env.sound(e[0]! < 0.03 && e[1]! < 0.03 ? SND_CATCH : SND_TAP_WEAK);
    this.round++;
    this.state = 2;
    this.at = now + 1400;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) {
      this.state = 1;
      this.startAt = now;
    }
    if (this.state === 1) {
      // A basin left to overflow stops itself, full.
      for (let k = 0; k < 2; k++) if (this.stopped[k]! < 0 && this.level(k, now) >= 1.05) this.stopped[k] = 1.05;
      this.check(now);
    }
    if (this.state === 2 && now >= this.at) {
      if (this.round >= scaled(BASIN_ROUNDS)) return true;
      this.arm(now);
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'off by', this.errs.length ? pct(mean(this.errs.slice(-6))) : '–', 'round', `${Math.min(this.round + 1, scaled(BASIN_ROUNDS))} / ${scaled(BASIN_ROUNDS)}`);
    const bw = Math.min(120 * a.u, (a.right - a.left) / 4);
    const bh = a.bottom - a.top - 90 * a.u;
    const base = a.top + 20 * a.u + bh;
    for (let k = 0; k < 2; k++) {
      const x = a.cx + (k ? 1 : -1) * bw * 1.1 - bw / 2;
      const lv = Math.min(1, this.level(k, now));
      ctx.fillStyle = this.stopped[k]! >= 0 ? '#8a8a92' : '#b8b8c0';
      ctx.fillRect(x, base - lv * bh, bw, lv * bh);
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = 2 * dpr;
      ctx.strokeRect(x, base - bh, bw, bh);
      ctx.fillStyle = COL_ACCENT;
      ctx.fillRect(x - 8 * a.u, base - this.line[k]! * bh - dpr, bw + 16 * a.u, 2 * dpr);
      if (this.state === 2) {
        const e = this.stopped[k]! - this.line[k]!;
        ctx.fillStyle = COL_MID;
        v.text(`${e >= 0 ? '+' : ''}${Math.round(e * 100)}%`, x + bw / 2, base - bh - 12 * a.u, v.fontTiny, 'center');
      }
    }
    const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  stop left`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`stop right  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    if (this.round === 0 && this.state === 0) v.text('both basins fill at once; stop each at its orange line with its own hand', a.cx, a.bottom - 30 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.max(0, Math.round((0.15 - m) * 12000)) : 0,
      primary: { label: 'average miss', value: Math.round(m * 1000) / 10, unit: '%', lower: true, decimals: 1 },
      lines: [
        { label: 'average miss', value: this.errs.length ? `${(m * 100).toFixed(1)}%` : '–' },
        { label: 'within 3%', value: this.errs.length ? pct(this.errs.filter((e) => e < 0.03).length / this.errs.length) : '–' },
      ],
      saved: this.round >= 3,
    };
  }
}

// --- Product ---------------------------------------------------------------------------

const PRODUCT_MS = 60000;

class Product implements Mini {
  private env!: MiniEnv;
  private pairs: [number, number][] = [];
  private bigger = 0;
  private t0 = 0;
  private at = 0;
  private started = false;
  private ok = 0;
  private bad = 0;
  private rts: number[] = [];
  private flash = 0;
  private note = '';
  private held = 0;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  private make(now: number): void {
    // Products within a few percent of each other, closer as you go.
    const spread = Math.max(0.02, 0.2 - this.ok * 0.008);
    for (let tries = 0; tries < 400; tries++) {
      const a: [number, number] = [rint(11, 49), rint(2, 9)];
      const b: [number, number] = [rint(11, 49), rint(2, 9)];
      const pa = a[0] * a[1];
      const pb = b[0] * b[1];
      const r = Math.abs(pa - pb) / Math.max(pa, pb);
      if (pa !== pb && r <= spread && r >= spread / 4 && a[0] !== b[0]) {
        this.pairs = [a, b];
        this.bigger = pa > pb ? 0 : 1;
        break;
      }
    }
    this.at = now;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0) return;
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.make(ts);
      return;
    }
    if ((s < 0 ? 0 : 1) === this.bigger) {
      this.ok++;
      this.rts.push(ts - this.at);
      this.env.sound(s < 0 ? SND_TAP_L : SND_TAP_R);
    } else {
      this.bad++;
      const [a, b] = this.pairs;
      this.note = `${a![0]} × ${a![1]} = ${a![0] * a![1]},  ${b![0]} × ${b![1]} = ${b![0] * b![1]}`;
      this.flash = ts + 1500;
      this.env.sound(SND_FALSE);
    }
    this.make(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(PRODUCT_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    ctx.font = `600 ${Math.round(38 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL_LINE;
    if (this.started) {
      const off = Math.min(160 * a.u, (a.right - a.left) / 4);
      this.pairs.forEach(([x, y], k) => ctx.fillText(`${x} × ${y}`, a.cx + (k ? 1 : -1) * off, a.cy - 10 * a.u));
    } else ctx.fillText('which product is bigger?', a.cx, a.cy - 10 * a.u);
    if (now < this.flash) {
      ctx.fillStyle = COL_ACCENT;
      v.text(this.note, a.cx, a.cy + 50 * a.u, v.fontTiny, 'center');
    }
    const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  left`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`right  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    if (!this.started) v.text('press either side to start; a minute', a.cx, a.bottom - 30 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.ok * 30 - this.bad * 40),
      primary: { label: 'right in a minute', value: this.ok, unit: '' },
      lines: [
        { label: 'right', value: String(this.ok) },
        { label: 'wrong', value: String(this.bad) },
        { label: 'typical time a pair', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.ok + this.bad >= 4,
    };
  }
}

// --- Alpha (dictionary order) ----------------------------------------------------------

const ALPHA_MS = 45000;
const POOL = WORDS.filter((w) => w.length >= 3 && w.length <= 9 && /^[a-z]+$/.test(w));

class Alpha implements Mini {
  private env!: MiniEnv;
  private words: [string, string] = ['', ''];
  private first = 0;
  private t0 = 0;
  private at = 0;
  private started = false;
  private ok = 0;
  private bad = 0;
  private rts: number[] = [];
  private flash = 0;
  private held = 0;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  private make(now: number): void {
    // Later pairs share longer beginnings, so the difference sits deeper in the word.
    const share = Math.min(3, Math.floor(this.ok / 6));
    for (let tries = 0; tries < 400; tries++) {
      const a = pick(POOL);
      const b = pick(POOL);
      if (a === b || a.startsWith(b) || b.startsWith(a)) continue;
      let same = 0;
      while (a[same] === b[same]) same++;
      if (same >= share || tries > 300) {
        this.words = [a, b];
        this.first = a < b ? 0 : 1;
        break;
      }
    }
    this.at = now;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0) return;
    if (!this.started) {
      this.started = true;
      this.t0 = ts;
      this.make(ts);
      return;
    }
    if ((s < 0 ? 0 : 1) === this.first) {
      this.ok++;
      this.rts.push(ts - this.at);
      this.env.sound(s < 0 ? SND_TAP_L : SND_TAP_R);
    } else {
      this.bad++;
      this.flash = ts + 500;
      this.env.sound(SND_FALSE);
    }
    this.make(ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(ALPHA_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.ok), 'time', `${left} s`);
    ctx.font = `600 ${Math.round(36 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = now < this.flash ? COL_ACCENT : COL_LINE;
    if (this.started) {
      const off = Math.min(170 * a.u, (a.right - a.left) / 4);
      this.words.forEach((w, k) => ctx.fillText(w, a.cx + (k ? 1 : -1) * off, a.cy - 10 * a.u));
    } else ctx.fillText('which comes first?', a.cx, a.cy - 10 * a.u);
    const off = Math.min(200 * a.u, (a.right - a.left) / 2 - 30 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`${handLabel(this.env, -1)}  left first`, a.cx - off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    v.text(`right first  ${handLabel(this.env, 1)}`, a.cx + off, a.bottom - 6 * a.u, v.fontTiny, 'center');
    if (!this.started) v.text('press the side of the word that comes first in the dictionary. press to start', a.cx, a.bottom - 30 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.ok * 20 - this.bad * 30),
      primary: { label: 'right in 45 seconds', value: this.ok, unit: '' },
      lines: [
        { label: 'right', value: String(this.ok) },
        { label: 'wrong', value: String(this.bad) },
        { label: 'typical time a pair', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.ok + this.bad >= 5,
    };
  }
}

// --- Blinks (count the flashes) --------------------------------------------------------

const BLINK_ROUNDS = 12;

class Blinks implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private times: number[] = [];
  private t0 = 0;
  private typed = '';
  /** 0 gap, 1 flashing, 2 answer, 3 feedback. */
  private state = 0;
  private at = 0;
  private right = 0;
  private offs: number[] = [];
  private lastOk = true;
  private n = 5;
  private firstAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.firstAt = now;
    this.at = now + 800;
  }

  private play(now: number): void {
    const n = rint(Math.max(3, this.n - 2), this.n + 2);
    this.times = [];
    let t = 0;
    for (let k = 0; k < n; k++) {
      this.times.push(t);
      // Irregular gaps, so the count cannot be read off the duration.
      t += rnd(110, 260);
    }
    this.t0 = now + 300;
    this.typed = '';
    this.state = 1;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    if (this.state !== 2) return !!digitOf(code);
    const d = digitOf(code);
    if (d) {
      if (this.typed.length < 2) this.typed += d;
      return true;
    }
    if (code === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      return true;
    }
    if ((code === 'Enter' || code === 'NumpadEnter' || code === 'Space') && this.typed) {
      const n = this.times.length;
      const got = Number(this.typed);
      const ok = got === n;
      this.lastOk = ok;
      this.offs.push(Math.abs(got - n));
      if (ok) {
        this.right++;
        this.n = Math.min(16, this.n + 1);
      } else this.n = Math.max(4, this.n - 1);
      this.env.sound(ok ? SND_CATCH : SND_FALSE);
      this.round++;
      this.state = 3;
      this.at = ts + 1400;
      return true;
    }
    return false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.play(now);
    else if (this.state === 1 && now > this.t0 + this.times[this.times.length - 1]! + 300) this.state = 2;
    else if (this.state === 3 && now >= this.at) {
      if (this.round >= scaled(BLINK_ROUNDS)) return true;
      this.state = 0;
      this.at = now + 500;
    }
    if (now - this.firstAt > 600000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'right', String(this.right), 'run', `${Math.min(this.round + 1, scaled(BLINK_ROUNDS))} / ${scaled(BLINK_ROUNDS)}`);
    const on = this.state === 1 && this.times.some((t) => now >= this.t0 + t && now < this.t0 + t + 55);
    ctx.fillStyle = on ? COL_LINE : '#1c1c20';
    ctx.beginPath();
    ctx.arc(a.cx, a.cy - 40 * a.u, 46 * a.u, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = 1.5 * v.dpr;
    ctx.stroke();
    if (this.state >= 2) {
      ctx.font = `600 ${Math.round(36 * a.u)}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = this.state === 3 && !this.lastOk ? COL_ACCENT : COL_LINE;
      ctx.fillText(this.typed || '_', a.cx, a.cy + 50 * a.u);
      if (this.state === 3 && !this.lastOk) {
        ctx.fillStyle = COL_MID;
        v.text(`there were ${this.times.length}`, a.cx, a.cy + 90 * a.u, v.fontTiny, 'center');
      }
    }
    ctx.fillStyle = COL_MID;
    v.text(this.state === 2 ? 'how many flashes? type it, then Enter' : this.round === 0 && this.state < 2 ? 'watch the light and count its flashes' : '', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 60 + this.n * 20,
      primary: { label: 'counted right', value: this.right, unit: `of ${this.round}` },
      lines: [
        { label: 'right', value: `${this.right} of ${this.round}` },
        { label: 'typical miss when wrong', value: this.offs.some((o) => o > 0) ? String(median(this.offs.filter((o) => o > 0))) : '–' },
        { label: 'longest run reached', value: `about ${this.n} flashes` },
      ],
      saved: this.round >= 3,
    };
  }
}

export const BATCH62: MiniDef[] = [
  { id: 'basins', name: 'Basins', skill: 'coordination', blurb: 'Two basins fill at their own rates. Each hand stops its own at the line.', how: 'Two basins start filling together, each at its own rate, each with its own orange line. The left hand stops the left basin, the right hand the right one: press as each reaches its line. Watching one while the other fills is the trick. The rates rise. Twelve rounds; scored on how far off the lines you stop.', input: 'keys', minKeys: 2, make: () => new Basins() },
  { id: 'product', name: 'Product', skill: 'reasoning', blurb: 'Two products, like 23 × 4 and 19 × 5. Which is bigger?', how: 'Two multiplications side by side: press the side whose answer is bigger. Work them out or estimate, but be right: as you score the two answers get closer together. A minute; a mistake shows both answers.', input: 'keys', minKeys: 2, make: () => new Product() },
  { id: 'alpha', name: 'Alpha', skill: 'speed', blurb: 'Two words. Which comes first in the dictionary?', how: 'Two words side by side: press the side of the one that comes first in alphabetical order. As you go the words share longer beginnings, so the difference sits deeper in. Forty-five seconds; mistakes count against you.', input: 'keys', minKeys: 2, make: () => new Alpha() },
  { id: 'blinks', name: 'Blinks', skill: 'attention', blurb: 'A light flickers, too fast to count comfortably. How many flashes?', how: 'A light flashes several times in a quick, uneven burst. Type how many flashes there were and press Enter. Right answers bring longer bursts; misses, shorter. Twelve bursts.', input: 'type', make: () => new Blinks() },
];
