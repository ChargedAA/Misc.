// Memory games.
//   Sequence - a pattern plays across your keys; play it back. It grows.
//   Grid     - tiles flash on a board; tap them all once they hide.
//   Order    - numbers flash; tap them in order after they hide.
//   Back     - n-back: does this match the one n steps ago? Dual with sound.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_WEAK, SND_TONE, SND_UI } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import {
  arena,
  footer,
  handLabel,
  header,
  message,
  pct,
  shuffle,
  sideOf,
  slotsOf,
  type Arena,
  type Mini,
  type MiniDef,
  type MiniEnv,
  type MiniResult,
  scaled,
} from './kit.ts';

const STRIKES = 3;

// --- Sequence ---------------------------------------------------------------------

class Sequence implements Mini {
  private env!: MiniEnv;
  private slots: number[] = [];
  private seq: number[] = [];
  private pos = 0;
  private played = 0;
  /** 0 showing, 1 input, 2 feedback (next shows after) */
  private state = 0;
  private t0 = 0;
  private strikes = 0;
  private best = 0;
  private lit = -1;
  private litUntil = 0;
  private litGood = true;
  private wrongAt = -1;
  private rounds = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.slots = slotsOf(env.mode);
    for (let i = 0; i < (this.slots.length === 2 ? 4 : 3); i++) this.seq.push(this.rand());
    this.show(now + 700);
  }

  private rand(): number {
    // No more than two of the same lane in a row: those are hard to see.
    let v = Math.floor(Math.random() * this.slots.length);
    const n = this.seq.length;
    if (n >= 2 && this.seq[n - 1] === v && this.seq[n - 2] === v) v = (v + 1) % this.slots.length;
    return v;
  }

  private step(): number {
    return Math.max(260, 560 - this.seq.length * 18);
  }

  private show(at: number): void {
    this.state = 0;
    this.t0 = at;
    this.pos = 0;
    this.played = 0;
    this.wrongAt = -1;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state !== 1) return;
    const lane = this.slots.indexOf(slot);
    if (lane < 0) return;
    this.lit = lane;
    this.litUntil = ts + 180;
    if (lane === this.seq[this.pos]) {
      this.litGood = true;
      this.env.sound(SND_TONE + (lane % 7));
      this.pos++;
      if (this.pos === this.seq.length) {
        if (this.seq.length > this.best) this.best = this.seq.length;
        this.rounds++;
        this.seq.push(this.rand());
        this.state = 2;
        this.t0 = ts + 650;
      }
    } else {
      this.litGood = false;
      this.wrongAt = this.seq[this.pos]!;
      this.strikes++;
      this.env.sound(SND_FALSE);
      this.state = 2;
      this.t0 = ts + 1200;
      // A fresh pattern of the same length.
      const n = this.seq.length;
      this.seq = [];
      for (let i = 0; i < n; i++) this.seq.push(this.rand());
    }
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const step = this.step();
    if (this.state === 2 && now >= this.t0) {
      if (this.strikes >= STRIKES) return true;
      this.show(now + 300);
    }
    let showing = -1;
    if (this.state === 0 && now >= this.t0) {
      const k = Math.floor((now - this.t0) / step);
      if (k >= this.seq.length) {
        this.state = 1;
        this.pos = 0;
      } else {
        if ((now - this.t0) % step < step * 0.7) showing = this.seq[k]!;
        if (k >= this.played) {
          this.played = k + 1;
          this.env.sound(SND_TONE + (this.seq[k]! % 7));
        }
      }
    }

    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'length', String(this.seq.length), 'best', String(this.best), STRIKES - this.strikes);
    const n = this.slots.length;
    const span = Math.min(a.right - a.left, n * 110 * a.u);
    const top = a.top + 20 * a.u;
    const bottom = a.bottom - 40 * a.u;
    for (let i = 0; i < n; i++) {
      const x = Math.round(a.cx - span / 2 + (span * (i + 0.5)) / n) + 0.5;
      let col = COL_DIM;
      let w = dpr;
      if (showing === i) {
        col = COL_ACCENT;
        w = 4 * dpr;
      } else if (this.lit === i && now < this.litUntil) {
        col = this.litGood ? COL_LINE : COL_MID;
        w = 3 * dpr;
      } else if (this.state === 2 && this.wrongAt === i) {
        col = COL_MID;
        w = 3 * dpr;
      }
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.fillStyle = COL_MID;
      v.text(this.env.labels[this.slots[i]!] ?? '', x, bottom + 22 * dpr, v.fontTiny, 'center');
    }
    ctx.fillStyle = COL_MID;
    const status = this.state === 0 ? 'watch' : this.state === 1 ? `your turn  ${this.pos} / ${this.seq.length}` : this.wrongAt >= 0 ? 'wrong string' : 'yes';
    v.text(status, a.cx, top - 8 * dpr, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.best * 100 + this.rounds * 10,
      primary: { label: 'longest', value: this.best, unit: '' },
      lines: [
        { label: 'longest sequence', value: String(this.best) },
        { label: 'rounds cleared', value: String(this.rounds) },
        { label: 'strings', value: String(this.slots.length) },
      ],
      saved: this.rounds > 0 || this.strikes > 0,
    };
  }
}

// --- Grid -------------------------------------------------------------------------

interface Board {
  x0: number;
  y0: number;
  cell: number;
  n: number;
}

function board(a: Arena, n: number): Board {
  const size = Math.min(a.bottom - a.top - 30 * a.u, a.right - a.left, 520 * a.u);
  const cell = size / n;
  return { x0: a.cx - size / 2, y0: a.cy - size / 2, cell, n };
}

function cellAt(b: Board, x: number, y: number): number {
  const cx = Math.floor((x - b.x0) / b.cell);
  const cy = Math.floor((y - b.y0) / b.cell);
  if (cx < 0 || cy < 0 || cx >= b.n || cy >= b.n) return -1;
  return cy * b.n + cx;
}

class Grid implements Mini {
  private env!: MiniEnv;
  private level = 1;
  private n = 3;
  private targets = new Set<number>();
  private found = new Set<number>();
  private wrong = new Set<number>();
  private state = 0; // 0 flash, 1 input, 2 between
  private t0 = 0;
  private lives = STRIKES;
  private best = 0;
  private b: Board | null = null;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.setup(now + 500);
  }

  private setup(at: number): void {
    const tiles = this.level + 2;
    this.n = Math.max(3, Math.ceil(Math.sqrt(tiles * 2.4)));
    const cells = shuffle([...Array(this.n * this.n).keys()]);
    this.targets = new Set(cells.slice(0, tiles));
    this.found.clear();
    this.wrong.clear();
    this.state = 0;
    this.t0 = at;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 1 || !this.b) return;
    const c = cellAt(this.b, x, y);
    if (c < 0 || this.found.has(c) || this.wrong.has(c)) return;
    if (this.targets.has(c)) {
      this.found.add(c);
      this.env.sound(SND_TONE + (this.found.size % 7));
      if (this.found.size === this.targets.size) {
        if (this.level > this.best) this.best = this.level;
        this.level++;
        this.state = 2;
        this.t0 = ts + 700;
        this.env.sound(SND_CATCH);
      }
    } else {
      this.wrong.add(c);
      this.env.sound(SND_FALSE);
      if (this.wrong.size >= 3) {
        this.lives--;
        this.state = 2;
        this.t0 = ts + 1200;
      }
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const flash = 900 + this.level * 60;
    if (this.state === 0 && now - this.t0 > flash) this.state = 1;
    if (this.state === 2 && now >= this.t0) {
      if (this.lives <= 0) return true;
      this.setup(now + 400);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'level', String(this.level), 'tiles', String(this.targets.size), this.lives);
    const b = (this.b = board(a, this.n));
    const gap = Math.max(2 * dpr, b.cell * 0.08);
    const showAll = (this.state === 0 && now >= this.t0) || (this.state === 2 && this.lives >= 0 && this.wrong.size >= 3);
    for (let c = 0; c < this.n * this.n; c++) {
      const x = b.x0 + (c % this.n) * b.cell + gap / 2;
      const y = b.y0 + Math.floor(c / this.n) * b.cell + gap / 2;
      const s = b.cell - gap;
      if ((showAll && this.targets.has(c)) || this.found.has(c)) {
        ctx.fillStyle = this.found.has(c) ? COL_LINE : showAll && this.state === 2 ? COL_MID : COL_LINE;
        ctx.fillRect(x, y, s, s);
      } else if (this.wrong.has(c)) {
        ctx.strokeStyle = COL_MID;
        ctx.lineWidth = 1.5 * dpr;
        ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
        ctx.beginPath();
        ctx.moveTo(x + s * 0.3, y + s * 0.3);
        ctx.lineTo(x + s * 0.7, y + s * 0.7);
        ctx.moveTo(x + s * 0.7, y + s * 0.3);
        ctx.lineTo(x + s * 0.3, y + s * 0.7);
        ctx.stroke();
      } else {
        ctx.strokeStyle = COL_DIM;
        ctx.lineWidth = dpr;
        ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
      }
    }
    ctx.fillStyle = COL_MID;
    v.text(this.state === 0 ? 'remember' : this.state === 1 ? `${this.found.size} of ${this.targets.size}` : '', a.cx, b.y0 - 10 * dpr, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.best * 100,
      primary: { label: 'level', value: this.best, unit: '' },
      lines: [
        { label: 'highest level', value: String(this.best) },
        { label: 'tiles at that level', value: String(this.best + 2) },
      ],
      saved: this.best > 0 || this.lives < STRIKES,
    };
  }
}

// --- Order ------------------------------------------------------------------------

const ORDER_COLS = 8;
const ORDER_ROWS = 5;

class Order implements Mini {
  private env!: MiniEnv;
  private n = 4;
  private cells: number[] = [];
  private next = 1;
  private hidden = false;
  private state = 1; // 1 playing, 2 between
  private t0 = 0;
  private strikes = 0;
  private best = 0;
  private wrongCell = -1;
  private geo = { x0: 0, y0: 0, cell: 0 };

  start(env: MiniEnv): void {
    this.env = env;
    this.setup();
  }

  private setup(): void {
    this.cells = shuffle([...Array(ORDER_COLS * ORDER_ROWS).keys()]).slice(0, this.n);
    this.next = 1;
    this.hidden = false;
    this.state = 1;
    this.wrongCell = -1;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 1) return;
    const g = this.geo;
    const cx = Math.floor((x - g.x0) / g.cell);
    const cy = Math.floor((y - g.y0) / g.cell);
    if (cx < 0 || cy < 0 || cx >= ORDER_COLS || cy >= ORDER_ROWS) return;
    const idx = this.cells.indexOf(cy * ORDER_COLS + cx);
    if (idx < 0 || idx + 1 < this.next) return;
    if (idx + 1 === this.next) {
      this.next++;
      this.hidden = true;
      this.env.sound(SND_TONE + ((idx % 7) as number));
      if (this.next > this.n) {
        if (this.n > this.best) this.best = this.n;
        this.n++;
        this.state = 2;
        this.t0 = ts + 600;
        this.env.sound(SND_CATCH);
      }
    } else {
      this.strikes++;
      this.wrongCell = this.cells[idx]!;
      this.env.sound(SND_FALSE);
      this.state = 2;
      this.t0 = ts + 1300;
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 2 && now >= this.t0) {
      if (this.strikes >= STRIKES) return true;
      this.setup();
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'numbers', String(this.n), 'best', String(this.best), STRIKES - this.strikes);
    const cell = Math.min((a.right - a.left) / ORDER_COLS, (a.bottom - a.top) / ORDER_ROWS, 96 * a.u);
    const g = (this.geo = { x0: a.cx - (cell * ORDER_COLS) / 2, y0: a.cy - (cell * ORDER_ROWS) / 2, cell });
    const reveal = this.state === 2 && this.wrongCell >= 0;
    for (let i = 0; i < this.n; i++) {
      if (i + 1 < this.next && !reveal) continue;
      const c = this.cells[i]!;
      const x = g.x0 + (c % ORDER_COLS) * cell + cell / 2;
      const y = g.y0 + Math.floor(c / ORDER_COLS) * cell + cell / 2;
      const s = cell * 0.78;
      if (this.hidden && !reveal) {
        ctx.fillStyle = COL_LINE;
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      } else {
        ctx.strokeStyle = c === this.wrongCell ? COL_ACCENT : COL_DIM;
        ctx.lineWidth = (c === this.wrongCell ? 2 : 1) * dpr;
        ctx.strokeRect(x - s / 2 + 0.5, y - s / 2 + 0.5, s - 1, s - 1);
        ctx.fillStyle = i + 1 < this.next ? COL_MID : COL_LINE;
        v.text(String(i + 1), x, y + 8 * dpr, v.fontHud, 'center');
      }
    }
    if (this.state === 2 && this.wrongCell < 0) message(v, a, `next: ${this.n} numbers`);
    if (this.best === 0 && this.next === 1 && this.state === 1) {
      ctx.fillStyle = COL_MID;
      v.text('tap 1, then the rest hide: keep going in order', a.cx, a.bottom - 6 * dpr, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.best * 100,
      primary: { label: 'numbers', value: this.best, unit: '' },
      lines: [{ label: 'most numbers in order', value: String(this.best) }],
      saved: this.best > 0 || this.strikes > 0,
    };
  }
}

// --- Back (n-back) ----------------------------------------------------------------

const BACK_BLOCKS = 3;
const BACK_STEP = 2300;
const BACK_SHOW = 600;

class Back implements Mini {
  private env!: MiniEnv;
  private dual = false;
  private n = 1;
  private block = 0;
  private trial = 0;
  private trials = 0;
  private pos: number[] = [];
  private snd: number[] = [];
  private t0 = 0;
  private state = 0; // 0 running, 1 block summary
  private pressedPos = false;
  private pressedSnd = false;
  private hits = 0;
  private misses = 0;
  private falses = 0;
  private rejects = 0;
  private flashPos = 0;
  private flashSnd = 0;
  private flashGood = true;
  private bestN = 0;
  private score = 0;
  private summary = '';
  private accs: number[] = [];
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.dual = env.mode.right > 0 && !env.muted;
    this.newBlock(now + 800);
  }

  private newBlock(at: number): void {
    this.trials = 20 + this.n;
    this.pos = [];
    this.snd = [];
    // About 30% matches in each stream, placed on purpose.
    for (let i = 0; i < this.trials; i++) {
      const canMatch = i >= this.n;
      const p = canMatch && Math.random() < 0.3 ? this.pos[i - this.n]! : this.randNot(9, canMatch ? this.pos[i - this.n]! : -1);
      const s = canMatch && Math.random() < 0.3 ? this.snd[i - this.n]! : this.randNot(7, canMatch ? this.snd[i - this.n]! : -1);
      this.pos.push(p);
      this.snd.push(s);
    }
    this.trial = -1;
    this.t0 = at;
    this.state = 0;
    this.hits = this.misses = this.falses = this.rejects = 0;
  }

  private randNot(k: number, not: number): number {
    let v = Math.floor(Math.random() * k);
    if (v === not) v = (v + 1 + Math.floor(Math.random() * (k - 1))) % k;
    return v;
  }

  private isMatch(stream: number[], i: number): boolean {
    return i >= this.n && stream[i] === stream[i - this.n];
  }

  /** Close out a trial: count misses and correct rejections. */
  private settle(i: number): void {
    if (i < 0) return;
    const pm = this.isMatch(this.pos, i);
    if (pm && !this.pressedPos) this.misses++;
    if (!pm && !this.pressedPos && i >= this.n) this.rejects++;
    if (this.dual) {
      const sm = this.isMatch(this.snd, i);
      if (sm && !this.pressedSnd) this.misses++;
      if (!sm && !this.pressedSnd && i >= this.n) this.rejects++;
    }
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state !== 0 || this.trial < 0) return;
    const sound = this.dual && sideOf(slot) > 0;
    if (sound ? this.pressedSnd : this.pressedPos) return;
    const match = this.isMatch(sound ? this.snd : this.pos, this.trial);
    if (sound) this.pressedSnd = true;
    else this.pressedPos = true;
    if (match) this.hits++;
    else this.falses++;
    this.flashGood = match;
    if (sound) this.flashSnd = ts + 300;
    else this.flashPos = ts + 300;
    this.env.sound(match ? SND_TAP_WEAK : SND_FALSE);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.t0) {
      const k = Math.floor((now - this.t0) / BACK_STEP);
      if (k !== this.trial) {
        this.settle(this.trial);
        if (k >= this.trials) {
          // Block over: score it and move n.
          const total = this.hits + this.misses + this.falses + this.rejects;
          const acc = total ? (this.hits + this.rejects) / total : 0;
          this.accs.push(acc);
          this.score += Math.round(acc * 100 * this.n);
          const was = this.n;
          if (acc >= 0.8 && this.n > this.bestN) this.bestN = this.n;
          if (acc >= 0.85) this.n++;
          else if (acc < 0.65 && this.n > 1) this.n--;
          this.summary = `${was}-back  ${pct(acc)}  →  ${this.n}-back`;
          this.block++;
          this.state = 1;
          this.t0 = now + 2600;
          this.env.sound(SND_UI);
        } else {
          this.trial = k;
          this.pressedPos = this.pressedSnd = false;
          if (this.dual) this.env.sound(SND_TONE + this.snd[k]!);
        }
      }
    } else if (this.state === 1 && now >= this.t0) {
      if (this.block >= scaled(BACK_BLOCKS)) return true;
      this.newBlock(now + 600);
    }

    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'n', `${this.n}-back`, 'block', `${Math.min(this.block + 1, scaled(BACK_BLOCKS))} / ${scaled(BACK_BLOCKS)}`);
    const size = Math.min(a.bottom - a.top - 70 * a.u, a.right - a.left, 360 * a.u);
    const cell = size / 3;
    const x0 = a.cx - size / 2;
    const y0 = a.cy - size / 2 - 14 * a.u;
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x0 + i * cell, y0);
      ctx.lineTo(x0 + i * cell, y0 + size);
      ctx.moveTo(x0, y0 + i * cell);
      ctx.lineTo(x0 + size, y0 + i * cell);
      ctx.stroke();
    }
    if (this.state === 0 && this.trial >= 0 && now - this.t0 - this.trial * BACK_STEP < BACK_SHOW) {
      const p = this.pos[this.trial]!;
      const s = cell * 0.62;
      ctx.fillStyle = COL_LINE;
      ctx.fillRect(x0 + (p % 3) * cell + (cell - s) / 2, y0 + Math.floor(p / 3) * cell + (cell - s) / 2, s, s);
    }
    if (this.state === 1) message(v, a, this.summary, 'next block');
    // Answer indicators under the grid.
    const iy = y0 + size + 34 * a.u;
    const ind = (x: number, label: string, until: number) => {
      const on = now < until;
      ctx.strokeStyle = on ? (this.flashGood ? COL_LINE : COL_MID) : COL_DIM;
      ctx.lineWidth = (on ? 2 : 1) * dpr;
      ctx.strokeRect(x - 60 * a.u, iy - 16 * a.u, 120 * a.u, 28 * a.u);
      ctx.fillStyle = on ? COL_LINE : COL_MID;
      v.text(label, x, iy + 3 * dpr, v.fontTiny, 'center');
    };
    if (this.dual) {
      ind(a.cx - 80 * a.u, `place  ${handLabel(this.env, -1)}`, this.flashPos);
      ind(a.cx + 80 * a.u, `sound  ${handLabel(this.env, 1)}`, this.flashSnd);
    } else ind(a.cx, 'place  any key', this.flashPos);
    if (this.block === 0 && this.trial < 4) {
      ctx.fillStyle = COL_MID;
      v.text(`press when it matches the one ${this.n} step${this.n > 1 ? 's' : ''} back`, a.cx, y0 - 12 * dpr, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.score,
      primary: { label: 'n reached', value: this.bestN, unit: '-back' },
      lines: [
        { label: 'highest n at 80%+', value: this.bestN ? `${this.bestN}-back` : '–' },
        { label: 'block accuracy', value: this.accs.map(pct).join('  ') || '–' },
        { label: 'streams', value: this.dual ? 'place and sound' : 'place' },
      ],
      saved: this.block > 0,
    };
  }
}

export const MEMORY: MiniDef[] = [
  {
    id: 'sequence',
    name: 'Sequence',
    skill: 'memory',
    blurb: 'A pattern plays across your strings. Play it back.',
    how: 'Each string lights up and plucks in turn. Then play the same order on your keys. It grows by one each time; a wrong string is a strike.',
    input: 'keys',
    minKeys: 2,
    make: () => new Sequence(),
  },
  {
    id: 'grid',
    name: 'Grid',
    skill: 'memory',
    blurb: 'Tiles flash. Tap every one once they hide.',
    how: 'Some tiles light up for a moment, then hide. Tap all of them. Three wrong taps on one board costs a life; the board grows as you go.',
    input: 'pointer',
    make: () => new Grid(),
  },
  {
    id: 'order',
    name: 'Order',
    skill: 'memory',
    blurb: 'Numbers flash. Tap them in order, blind.',
    how: 'Numbers appear on the board. Tap 1, and the rest turn into blank squares: keep tapping them in order from memory. One more number each time.',
    input: 'pointer',
    make: () => new Order(),
  },
  {
    id: 'back',
    name: 'Back',
    skill: 'memory',
    blurb: 'Does it match the one n steps ago? Two streams at once.',
    how: 'A square appears every couple of seconds. Press when it is in the same place as n steps back. With two or more keys, a tone plays too: left hand for place, right hand for sound. n rises at 85% and falls below 65%.',
    input: 'keys',
    make: () => new Back(),
  },
];
