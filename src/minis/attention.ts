// Attention games.
//   Track  - follow a few dots among identical ones as they all move.
//   Find   - spot the one item that matches the target among look-alikes.
//   Switch - the rule depends on where the number appears. Keep switching.

import { COL_ACCENT, COL_DIM, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_WEAK, SND_TONE } from '../audio.ts';
import { SHAPE_CIRCLE, SHAPE_SQUARE, type View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import {
  Stair,
  arena,
  footer,
  handLabel,
  header,
  mean,
  median,
  ms,
  pct,
  shuffle,
  sideOf,
  type Arena,
  type Mini,
  type MiniDef,
  type MiniEnv,
  type MiniResult,
  gameNow,
  scaled,
} from './kit.ts';

const STRIKES = 3;
const GREY = '#6c6c74';

// --- Track ------------------------------------------------------------------------

const TRACK_DOTS = 10;

class Track implements Mini {
  private env!: MiniEnv;
  private k = 2;
  private speed = 0.22; // box widths per second
  private x = new Float64Array(TRACK_DOTS);
  private y = new Float64Array(TRACK_DOTS);
  private vx = new Float64Array(TRACK_DOTS);
  private vy = new Float64Array(TRACK_DOTS);
  private targets = new Set<number>();
  private picked = new Set<number>();
  /** 0 cue, 1 moving, 2 pick, 3 reveal */
  private state = 0;
  private t0 = 0;
  private last = 0;
  private strikes = 0;
  private best = 0;
  private correct = 0;
  private rounds = 0;
  private box = { x: 0, y: 0, s: 1 };

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.setup(now + 300);
  }

  private setup(at: number): void {
    // Spread the dots so none start on top of each other.
    for (let i = 0; i < TRACK_DOTS; i++) {
      let tries = 0;
      do {
        this.x[i] = 0.08 + Math.random() * 0.84;
        this.y[i] = 0.08 + Math.random() * 0.84;
      } while (tries++ < 50 && this.crowded(i));
      const ang = Math.random() * Math.PI * 2;
      this.vx[i] = Math.cos(ang);
      this.vy[i] = Math.sin(ang);
    }
    this.targets = new Set(shuffle([...Array(TRACK_DOTS).keys()]).slice(0, this.k));
    this.picked.clear();
    this.state = 0;
    this.t0 = at;
    this.last = at;
  }

  private crowded(i: number): boolean {
    for (let j = 0; j < i; j++) {
      const dx = this.x[i]! - this.x[j]!;
      const dy = this.y[i]! - this.y[j]!;
      if (dx * dx + dy * dy < 0.018) return true;
    }
    return false;
  }

  press(): void {}

  pointer(px: number, py: number, ts: number): void {
    if (this.state !== 2) return;
    const b = this.box;
    let best = -1;
    let bestD = (0.07 * b.s) ** 2;
    for (let i = 0; i < TRACK_DOTS; i++) {
      if (this.picked.has(i)) continue;
      const dx = b.x + this.x[i]! * b.s - px;
      const dy = b.y + this.y[i]! * b.s - py;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) return;
    this.picked.add(best);
    this.env.sound(this.targets.has(best) ? SND_TONE + this.picked.size : SND_FALSE);
    if (this.picked.size === this.k) {
      let hits = 0;
      for (const p of this.picked) if (this.targets.has(p)) hits++;
      this.correct += hits;
      this.rounds++;
      if (hits === this.k) {
        if (this.k > this.best) this.best = this.k;
        this.env.sound(SND_CATCH);
        if (this.k < 6) this.k++;
        else this.speed *= 1.12;
      } else {
        this.strikes++;
        if (this.k > 2 && hits < this.k - 1) this.k--;
      }
      this.state = 3;
      this.t0 = ts + 1400;
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.state === 0 && now - this.t0 > 1800) {
      this.state = 1;
      this.t0 = now;
    }
    if (this.state === 1) {
      const sp = this.speed;
      for (let i = 0; i < TRACK_DOTS; i++) {
        // Wander: a slow random turn, then bounce off the walls.
        const turn = (Math.random() - 0.5) * 3 * dt;
        const c = Math.cos(turn);
        const s = Math.sin(turn);
        const nx = this.vx[i]! * c - this.vy[i]! * s;
        const ny = this.vx[i]! * s + this.vy[i]! * c;
        this.vx[i] = nx;
        this.vy[i] = ny;
        this.x[i]! += nx * sp * dt;
        this.y[i]! += ny * sp * dt;
        if (this.x[i]! < 0.05 || this.x[i]! > 0.95) this.vx[i] = -this.vx[i]!;
        if (this.y[i]! < 0.05 || this.y[i]! > 0.95) this.vy[i] = -this.vy[i]!;
        this.x[i] = Math.min(0.95, Math.max(0.05, this.x[i]!));
        this.y[i] = Math.min(0.95, Math.max(0.05, this.y[i]!));
      }
      if (now - this.t0 > 6000) this.state = 2;
    }
    if (this.state === 3 && now >= this.t0) {
      if (this.strikes >= STRIKES) return true;
      this.setup(now + 200);
    }

    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'tracking', String(this.k), 'speed', `${(this.speed / 0.22).toFixed(1)}×`, STRIKES - this.strikes);
    const s = Math.min(a.bottom - a.top - 30 * a.u, a.right - a.left, 560 * a.u);
    const b = (this.box = { x: a.cx - s / 2, y: a.cy - s / 2 + 10 * a.u, s });
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, s - 1, s - 1);
    const r = s * 0.028;
    for (let i = 0; i < TRACK_DOTS; i++) {
      const px = b.x + this.x[i]! * s;
      const py = b.y + this.y[i]! * s;
      const target = this.targets.has(i);
      const picked = this.picked.has(i);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      if (this.state === 0 && target) {
        ctx.fillStyle = COL_ACCENT;
        ctx.fill();
      } else if (this.state === 3 && target) {
        ctx.fillStyle = picked ? COL_LINE : COL_ACCENT;
        ctx.fill();
      } else if (picked) {
        ctx.fillStyle = this.state === 3 ? GREY : COL_LINE;
        ctx.fill();
      } else {
        ctx.strokeStyle = COL_LINE;
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
      }
    }
    ctx.fillStyle = COL_MID;
    const label = this.state === 0 ? `remember the orange ${this.k}` : this.state === 1 ? 'follow them' : this.state === 2 ? `tap the ${this.k} you followed  ${this.picked.size} / ${this.k}` : '';
    v.text(label, a.cx, b.y - 10 * dpr, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.correct * 20 + this.best * 100,
      primary: { label: 'tracked', value: this.best, unit: 'dots' },
      lines: [
        { label: 'most dots tracked perfectly', value: String(this.best) },
        { label: 'targets found', value: String(this.correct) },
        { label: 'rounds', value: String(this.rounds) },
      ],
      saved: this.rounds >= 1,
    };
  }
}

// --- Find -------------------------------------------------------------------------

const FIND_MS = 45000;

interface Item {
  shape: number;
  grey: boolean;
  x: number;
  y: number;
}

class Find implements Mini {
  private env!: MiniEnv;
  private items: Item[] = [];
  private target = 0;
  private wantShape = SHAPE_CIRCLE;
  private wantGrey = true;
  private count = 8;
  private t0 = 0;
  private trialAt = 0;
  private found = 0;
  private errors = 0;
  private times: number[] = [];
  private flash = 0;
  private flashGood = true;
  private geo = { x0: 0, y0: 0, cell: 0, cols: 0 };
  private keysOk = false;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.keysOk = env.mode.right > 0;
    this.t0 = now + 600;
    this.next(this.t0);
  }

  private next(at: number): void {
    const cols = 8;
    const rows = 5;
    const n = Math.min(cols * rows - 2, this.count);
    // Conjunction search: the target shares its shape with some items and its shade with others.
    this.wantShape = Math.random() < 0.5 ? SHAPE_CIRCLE : SHAPE_SQUARE;
    this.wantGrey = Math.random() < 0.5;
    const other = this.wantShape === SHAPE_CIRCLE ? SHAPE_SQUARE : SHAPE_CIRCLE;
    // Keep the target off the middle two columns' seam so its side is clear.
    const cells = shuffle([...Array(cols * rows).keys()]).slice(0, n);
    this.items = cells.map((c, i) => ({
      shape: i === 0 ? this.wantShape : i % 2 ? other : this.wantShape,
      grey: i === 0 ? this.wantGrey : i % 2 ? this.wantGrey : !this.wantGrey,
      x: c % cols,
      y: Math.floor(c / cols),
    }));
    this.target = 0;
    this.trialAt = at;
  }

  private answer(ok: boolean, ts: number): void {
    this.flash = ts + 220;
    this.flashGood = ok;
    if (ok) {
      this.found++;
      this.times.push(ts - this.trialAt);
      this.count = Math.min(38, this.count + 2);
      this.env.sound(SND_TAP_WEAK);
    } else {
      this.errors++;
      this.count = Math.max(6, this.count - 4);
      this.env.sound(SND_FALSE);
    }
    this.next(ts + 120);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (!this.keysOk || ts < this.trialAt || ts - this.t0 > scaled(FIND_MS)) return;
    const side = sideOf(slot);
    if (side === 0) return;
    const t = this.items[this.target]!;
    this.answer((t.x < 4 ? -1 : 1) === side, ts);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(px: number, py: number, ts: number): void {
    if (ts < this.trialAt || ts - this.t0 > scaled(FIND_MS)) return;
    const g = this.geo;
    const cx = Math.floor((px - g.x0) / g.cell);
    const cy = Math.floor((py - g.y0) / g.cell);
    const idx = this.items.findIndex((it) => it.x === cx && it.y === cy);
    if (idx < 0) return;
    this.answer(idx === this.target, ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const t = now - this.t0;
    if (t > scaled(FIND_MS) + 400) return true;
    v.clear();
    const a: Arena = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'found', String(this.found), 'time', `${Math.max(0, Math.ceil((scaled(FIND_MS) - Math.max(0, t)) / 1000))} s`);
    // The target, shown above the board.
    ctx.fillStyle = COL_MID;
    v.text('find', a.cx - 18 * dpr, a.top + 6 * dpr, v.fontTiny, 'right');
    ctx.fillStyle = this.wantGrey ? GREY : COL_LINE;
    v.shape(this.wantShape, a.cx, a.top + 2 * dpr, 9 * dpr, true);
    const cols = 8;
    const rows = 5;
    const cell = Math.min((a.right - a.left) / cols, (a.bottom - a.top - 50 * a.u) / rows, 80 * a.u);
    const g = (this.geo = { x0: a.cx - (cell * cols) / 2, y0: a.cy - (cell * rows) / 2 + 16 * a.u, cell, cols });
    if (t >= 0) {
      for (const it of this.items) {
        ctx.fillStyle = it.grey ? GREY : COL_LINE;
        v.shape(it.shape, g.x0 + (it.x + 0.5) * cell, g.y0 + (it.y + 0.5) * cell, cell * 0.26, true);
      }
    }
    if (this.keysOk) {
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.moveTo(Math.round(a.cx) + 0.5, g.y0);
      ctx.lineTo(Math.round(a.cx) + 0.5, g.y0 + cell * rows);
      ctx.stroke();
    }
    if (now < this.flash) {
      ctx.strokeStyle = this.flashGood ? COL_LINE : COL_ACCENT;
      ctx.lineWidth = 2 * dpr;
      ctx.strokeRect(g.x0 - 6 * dpr, g.y0 - 6 * dpr, cell * cols + 12 * dpr, cell * rows + 12 * dpr);
    }
    if (this.found + this.errors < 2) {
      ctx.fillStyle = COL_MID;
      const how = this.keysOk ? `which side is it on?  left ${handLabel(this.env, -1)}  right ${handLabel(this.env, 1)}  (or tap it)` : 'tap it';
      v.text(how, a.cx, a.bottom - 6 * dpr, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.found * 50 - this.errors * 30 > 0 ? this.found * 50 - this.errors * 30 : 0,
      primary: { label: 'found', value: this.found, unit: '' },
      lines: [
        { label: 'found in 45 s', value: String(this.found) },
        { label: 'wrong', value: String(this.errors) },
        { label: 'median time each', value: ms(median(this.times)) },
        { label: 'biggest board', value: `${this.count} items` },
      ],
      saved: this.found + this.errors >= 5,
    };
  }
}

// --- Switch -----------------------------------------------------------------------

const SWITCH_TRIALS = 48;

class Switch implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private state = 0;
  private next = 0;
  private digit = 3;
  private top = true;
  private prevTop = true;
  private drawnAt = 0;
  private readonly win = new Stair(2200, 100, 700, 2600);
  private rep: number[] = [];
  private sw: number[] = [];
  private errors = 0;
  private slow = 0;
  private feedback = '';
  private score = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 700);
  }

  private arm(at: number): void {
    this.state = 0;
    this.next = at + 250;
    this.drawnAt = 0;
    this.prevTop = this.top;
    this.top = Math.random() < 0.5;
    const pool = [1, 2, 3, 4, 6, 7, 8, 9];
    this.digit = pool[Math.floor(Math.random() * pool.length)]!;
  }

  /** -1 for the left answer, +1 for the right. */
  private want(): number {
    return this.top ? (this.digit % 2 ? -1 : 1) : this.digit < 5 ? -1 : 1;
  }

  private end(now: number, ok: boolean, rt: number, text: string): void {
    const switched = this.i > 0 && this.top !== this.prevTop;
    this.i++;
    this.state = 2;
    this.feedback = text;
    this.next = now + (ok ? 120 : 800);
    this.win.update(ok, -1);
    if (ok) {
      (switched ? this.sw : this.rep).push(rt);
      this.score += 10 + (switched ? 5 : 0) + Math.max(0, Math.round((this.win.level - rt) / 40));
      this.env.sound(SND_TAP_WEAK);
    } else this.env.sound(SND_FALSE);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state !== 1 || this.drawnAt === 0) return;
    const side = sideOf(slot);
    if (side === 0) return;
    const rt = ts - this.drawnAt;
    if (rt < 120) return;
    if (side === this.want()) this.end(ts, true, rt, '');
    else {
      this.errors++;
      this.end(ts, false, 0, this.top ? `${this.digit} is ${this.digit % 2 ? 'odd' : 'even'}` : `${this.digit} is ${this.digit < 5 ? 'low' : 'high'}`);
    }
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.next) this.state = 1;
    if (this.state === 1 && this.drawnAt > 0 && now - this.drawnAt > this.win.level) {
      this.slow++;
      this.end(now, false, 0, 'too slow');
    }
    if (this.state === 2 && now >= this.next) {
      if (this.i >= scaled(SWITCH_TRIALS)) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'score', String(this.score), 'trial', `${Math.min(this.i + 1, scaled(SWITCH_TRIALS))} / ${scaled(SWITCH_TRIALS)}`);
    const w = Math.min(a.right - a.left, 420 * a.u);
    const h = Math.min((a.bottom - a.top) / 2 - 20 * a.u, 150 * a.u);
    const x0 = a.cx - w / 2;
    const yTop = a.cy - h - 6 * a.u;
    const yBot = a.cy + 6 * a.u;
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = dpr;
    ctx.strokeRect(x0 + 0.5, yTop + 0.5, w - 1, h - 1);
    ctx.strokeRect(x0 + 0.5, yBot + 0.5, w - 1, h - 1);
    ctx.fillStyle = COL_MID;
    v.text('odd', x0 + 12 * dpr, yTop + 20 * dpr, v.fontTiny, 'left');
    v.text('even', x0 + w - 12 * dpr, yTop + 20 * dpr, v.fontTiny, 'right');
    v.text('low (1-4)', x0 + 12 * dpr, yBot + h - 12 * dpr, v.fontTiny, 'left');
    v.text('high (6-9)', x0 + w - 12 * dpr, yBot + h - 12 * dpr, v.fontTiny, 'right');
    if (this.state === 1) {
      ctx.fillStyle = COL_LINE;
      v.text(String(this.digit), a.cx, (this.top ? yTop : yBot) + h / 2 + 16 * dpr, v.fontBig, 'center');
      if (this.drawnAt === 0) this.drawnAt = gameNow();
    } else if (this.state === 2 && this.feedback) {
      ctx.fillStyle = COL_MID;
      v.text(this.feedback, a.cx, (this.top ? yTop : yBot) + h / 2 + 5 * dpr, v.fontHud, 'center');
    }
    if (this.i < 3) {
      ctx.fillStyle = COL_MID;
      v.text(`top box: odd or even   bottom box: low or high   left ${handLabel(this.env, -1)}  right ${handLabel(this.env, 1)}`, a.cx, a.bottom - 6 * dpr, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const cost = this.sw.length && this.rep.length ? median(this.sw) - median(this.rep) : 0;
    const done = this.i || 1;
    return {
      score: this.score,
      primary: { label: 'switch cost', value: cost, unit: 'ms', lower: true, zeroOk: true },
      lines: [
        { label: 'same rule as before', value: ms(median(this.rep)) },
        { label: 'rule switched', value: ms(median(this.sw)) },
        { label: 'switch cost', value: ms(cost) },
        { label: 'correct', value: pct((done - this.errors - this.slow) / done) },
        { label: 'average answer', value: ms(mean([...this.rep, ...this.sw])) },
      ],
      rts: [...this.rep, ...this.sw],
      saved: this.i >= 12,
    };
  }
}

export const ATTENTION: MiniDef[] = [
  {
    id: 'track',
    name: 'Track',
    skill: 'attention',
    blurb: 'Follow a few dots among identical ones.',
    how: 'Some dots flash orange, then all of them look the same and wander for six seconds. Tap the ones you were following. Get them all and you track one more.',
    input: 'pointer',
    make: () => new Track(),
  },
  {
    id: 'find',
    name: 'Find',
    skill: 'attention',
    blurb: 'Spot the one that matches, among look-alikes.',
    how: 'Find the item that matches the target shown at the top: the right shape AND the right shade. Press the side it is on, or tap it. The board fills up as you get faster. 45 seconds.',
    input: 'both',
    make: () => new Find(),
  },
  {
    id: 'switch',
    name: 'Switch',
    skill: 'attention',
    blurb: 'The rule depends on where the number lands.',
    how: 'A number appears in the top or bottom box. Top: is it odd (left) or even (right)? Bottom: is it low (left) or high (right)? The box changes without warning; the cost of switching is measured.',
    input: 'keys',
    minKeys: 2,
    make: () => new Switch(),
  },
];
