// Thirteenth batch.
//   Rain   (speed)        - letters fall. Type them before they land.
//   Link   (memory)       - shapes and numbers, paired. Which number went with this shape?
//   Except (attention)    - press for every digit except 3. The rare 3 is the trap.
//   Sync   (coordination) - both hands at exactly the same moment, then with a set gap.

import { ANTICIPATION_MS, COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALL, SND_FALSE, SND_LURCH, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK, SND_TONE } from '../audio.ts';
import { SHAPE_CIRCLE, SHAPE_CROSS, SHAPE_DIAMOND, SHAPE_SQUARE, SHAPE_TRIANGLE, type View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import {
  Stair,
  arena,
  footer,
  handLabel,
  header,
  mean,
  median,
  message,
  ms,
  pct,
  shuffle,
  sideOf,
  type Mini,
  type MiniDef,
  type MiniEnv,
  type MiniResult,
  scaled,
} from './kit.ts';

const GREY = '#6c6c74';
const SHAPES = [SHAPE_CIRCLE, SHAPE_SQUARE, SHAPE_TRIANGLE, SHAPE_DIAMOND, SHAPE_CROSS];

function rint(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function sd(a: readonly number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
}

// --- Rain -------------------------------------------------------------------------

/** Home row first, then the rows above and below. */
const LETTERS = 'FJDKSLAGHRUEIWOTYVNCMBXZQP';

interface Drop {
  ch: string;
  x: number;
  y: number;
  hitAt: number;
}

class Rain implements Mini {
  private env!: MiniEnv;
  private drops: Drop[] = [];
  private last = 0;
  private time = 0;
  private spawn = 0.5;
  private lives = 3;
  private typed = 0;
  private wrong = 0;
  private over = false;
  private overAt = 0;
  private flash = 0;
  private gone: { ch: string; x: number; y: number; at: number }[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
  }

  private pool(): string {
    // Start with eight letters; add one every few seconds.
    return LETTERS.slice(0, Math.min(LETTERS.length, 8 + Math.floor(this.time / 4)));
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const m = /^Key([A-Z])$/.exec(code);
    if (!m) return false;
    if (this.over) return true;
    // The lowest drop with that letter goes.
    let best = -1;
    this.drops.forEach((d, i) => {
      if (d.ch === m[1] && (best < 0 || d.y > this.drops[best]!.y)) best = i;
    });
    if (best < 0) {
      this.wrong++;
      this.flash = ts;
      this.env.sound(SND_TAP_WEAK);
    } else {
      const d = this.drops.splice(best, 1)[0]!;
      this.gone.push({ ch: d.ch, x: d.x, y: d.y, at: ts });
      this.typed++;
      this.env.sound(SND_TONE + (this.typed % 7));
    }
    return true;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.over && now >= this.overAt) return true;
    if (!this.over) {
      this.time += dt;
      this.spawn -= dt;
      if (this.spawn <= 0) {
        const p = this.pool();
        this.drops.push({ ch: p[Math.floor(Math.random() * p.length)]!, x: 0.08 + Math.random() * 0.84, y: 0, hitAt: 0 });
        this.spawn = Math.max(0.32, 1.1 - this.time * 0.012) * (0.75 + Math.random() * 0.5);
      }
      const fall = 0.16 + this.time * 0.0035;
      for (const d of this.drops) d.y += fall * dt;
      const landed = this.drops.filter((d) => d.y >= 1);
      if (landed.length) {
        this.drops = this.drops.filter((d) => d.y < 1);
        this.lives -= landed.length;
        this.flash = now;
        this.env.sound(SND_LURCH);
        if (this.lives <= 0) {
          this.over = true;
          this.overAt = now + 1300;
          this.env.sound(SND_FALL);
        }
      }
      this.gone = this.gone.filter((g) => now - g.at < 300);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const rate = this.time > 3 ? (this.typed / this.time) * 60 : 0;
    header(v, touch, 'typed', String(this.typed), 'per minute', rate ? String(Math.round(rate)) : '–', Math.max(0, this.lives));
    const top = a.top + 10 * a.u;
    const H = a.bottom - top - 30 * a.u;
    const W = Math.min(a.right - a.left, 760 * a.u);
    const x0 = a.cx - W / 2;
    ctx.fillStyle = now - this.flash < 200 ? COL_ACCENT : COL_DIM;
    ctx.fillRect(x0, top + H, W, dpr);
    ctx.font = v.fontHud;
    ctx.textAlign = 'center';
    const lowest = this.drops.reduce((m, d) => Math.max(m, d.y), 0);
    for (const d of this.drops) {
      ctx.fillStyle = d.y === lowest ? COL_LINE : d.y > 0.7 ? COL_LINE : COL_MID;
      ctx.fillText(d.ch, x0 + d.x * W, top + d.y * H);
    }
    for (const g of this.gone) {
      ctx.globalAlpha = 1 - (now - g.at) / 300;
      ctx.fillStyle = COL_ACCENT;
      ctx.fillText(g.ch, x0 + g.x * W, top + g.y * H - ((now - g.at) / 300) * 20 * a.u);
    }
    ctx.globalAlpha = 1;
    if (this.time < 3 && !this.over) message(v, { ...a, cy: a.cy }, 'type the letters before they land', 'needs a keyboard', COL_MID);
    if (this.over) message(v, a, `${this.typed} letters`, rate ? `${Math.round(rate)} a minute` : '');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const rate = this.time > 1 ? (this.typed / this.time) * 60 : 0;
    return {
      score: this.typed * 10 + Math.round(this.time * 2),
      primary: { label: 'letters', value: this.typed, unit: '' },
      lines: [
        { label: 'letters typed', value: String(this.typed) },
        { label: 'per minute', value: String(Math.round(rate)) },
        { label: 'stray keys', value: String(this.wrong) },
        { label: 'lasted', value: `${this.time.toFixed(1)} s` },
      ],
      saved: this.typed >= 5,
    };
  }
}

// --- Link -------------------------------------------------------------------------

const LINK_ROUNDS = 8;

class Link implements Mini {
  private env!: MiniEnv;
  private readonly n = new Stair(3, 1, 2, 8);
  private pairs: { shape: number; grey: boolean; digit: number }[] = [];
  private order: number[] = [];
  private q = 0;
  private state = 0; // 0 study, 1 recall, 2 round feedback
  private t0 = 0;
  private at = 0;
  private round = 0;
  private right = 0;
  private asked = 0;
  private roundRight = 0;
  private answers: number[] = [];
  private keys: [number, number, number, number, string][] = [];
  private best = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 500);
  }

  private make(now: number): void {
    const k = this.n.level;
    const looks = shuffle([...Array(10).keys()]).slice(0, k);
    const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, k);
    this.pairs = looks.map((c, i) => ({ shape: SHAPES[c % 5]!, grey: c >= 5, digit: digits[i]! }));
    this.order = shuffle([...Array(k).keys()]);
    this.q = 0;
    this.roundRight = 0;
    this.answers = [];
    this.state = 0;
    this.t0 = now;
  }

  private studyMs(): number {
    return 1300;
  }

  private answer(d: number, ts: number): void {
    if (this.state !== 1) return;
    const p = this.pairs[this.order[this.q]!]!;
    const ok = d === p.digit;
    this.answers.push(d);
    this.asked++;
    if (ok) {
      this.right++;
      this.roundRight++;
    }
    this.env.sound(ok ? SND_TONE + (d % 7) : SND_FALSE);
    this.q++;
    if (this.q >= this.pairs.length) {
      const all = this.roundRight === this.pairs.length;
      if (all) this.best = Math.max(this.best, this.pairs.length);
      this.n.update(all);
      this.env.sound(all ? SND_CATCH : SND_TAP_WEAK);
      this.round++;
      this.state = 2;
      this.at = ts + 2000;
    }
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(code);
    if (!m) return false;
    this.answer(Number(m[1]), ts);
    return true;
  }

  pointer(x: number, y: number, ts: number): void {
    for (const [kx, ky, w, h, d] of this.keys) if (x >= kx && x <= kx + w && y >= ky && y <= ky + h) this.answer(Number(d), ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now - this.t0 >= this.pairs.length * this.studyMs() + 400) this.state = 1;
    if (this.state === 2 && now >= this.at) {
      if (this.round >= scaled(LINK_ROUNDS)) return true;
      this.make(now + 300);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'pairs', String(this.n.level), 'round', `${Math.min(this.round + 1, scaled(LINK_ROUNDS))} / ${scaled(LINK_ROUNDS)}`);
    const r = 24 * a.u;
    const cy = a.top + 80 * a.u;
    if (this.state === 0) {
      const k = Math.floor((now - this.t0) / this.studyMs());
      const p = this.pairs[k];
      if (p && now >= this.t0 && (now - this.t0) % this.studyMs() < this.studyMs() - 200) {
        ctx.fillStyle = p.grey ? GREY : COL_LINE;
        v.shape(p.shape, a.cx - 50 * a.u, cy, r, true);
        ctx.fillStyle = COL_LINE;
        v.text(String(p.digit), a.cx + 50 * a.u, cy + 14 * dpr, v.fontBig, 'center');
      }
      ctx.fillStyle = COL_MID;
      v.text(`remember each pair  ·  ${Math.min(k + 1, this.pairs.length)} of ${this.pairs.length}`, a.cx, a.top + 20 * a.u, v.fontTiny, 'center');
    } else if (this.state === 1) {
      const p = this.pairs[this.order[this.q]!]!;
      ctx.fillStyle = p.grey ? GREY : COL_LINE;
      v.shape(p.shape, a.cx - 50 * a.u, cy, r, true);
      ctx.fillStyle = COL_ACCENT;
      v.text('?', a.cx + 50 * a.u, cy + 14 * dpr, v.fontBig, 'center');
      ctx.fillStyle = COL_MID;
      v.text(`which number went with this?  ·  ${this.q + 1} of ${this.pairs.length}`, a.cx, a.top + 20 * a.u, v.fontTiny, 'center');
    } else {
      // All the pairs, with what you answered.
      const n = this.pairs.length;
      const w = Math.min(90 * a.u, (a.right - a.left) / n);
      const x0 = a.cx - (n * w) / 2;
      this.order.forEach((pi, i) => {
        const p = this.pairs[pi]!;
        const x = x0 + i * w + w / 2;
        ctx.fillStyle = p.grey ? GREY : COL_LINE;
        v.shape(p.shape, x, cy - 16 * a.u, 12 * a.u, true);
        const ok = this.answers[i] === p.digit;
        ctx.fillStyle = ok ? COL_LINE : COL_ACCENT;
        v.text(String(p.digit), x, cy + 22 * a.u, v.fontHud, 'center');
      });
      ctx.fillStyle = COL_MID;
      v.text(`${this.roundRight} of ${n}`, a.cx, a.top + 20 * a.u, v.fontTiny, 'center');
    }
    // Keypad 1-9.
    const kw = Math.min(64 * a.u, (a.right - a.left) / 3.6);
    const kh = kw * 0.6;
    const gap = 8 * a.u;
    const kx0 = a.cx - (kw * 3 + gap * 2) / 2;
    const ky0 = Math.max(cy + 70 * a.u, a.bottom - (kh * 3 + gap * 2) - 6 * a.u);
    this.keys = [];
    for (let d = 1; d <= 9; d++) {
      const x = kx0 + ((d - 1) % 3) * (kw + gap);
      const y = ky0 + Math.floor((d - 1) / 3) * (kh + gap);
      this.keys.push([x, y, kw, kh, String(d)]);
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = dpr;
      ctx.strokeRect(x + 0.5, y + 0.5, kw - 1, kh - 1);
      ctx.fillStyle = this.state === 1 ? COL_LINE : COL_DIM;
      v.text(String(d), x + kw / 2, y + kh / 2 + 5 * dpr, v.fontHud, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 25 + this.best * 60,
      primary: { label: 'most pairs, all right', value: this.best, unit: '' },
      lines: [
        { label: 'most pairs recalled perfectly', value: String(this.best) },
        { label: 'pairs right', value: `${this.right} of ${this.asked}` },
        { label: 'accuracy', value: pct(this.right / (this.asked || 1)) },
      ],
      saved: this.round >= 2,
    };
  }
}

// --- Except -----------------------------------------------------------------------

const EXCEPT_TRIALS = 72;
const EXCEPT_SOA = 1150;
const EXCEPT_ON = 250;

class Except implements Mini {
  private env!: MiniEnv;
  private digits: number[] = [];
  private sizes: number[] = [];
  private t0 = 0;
  private i = -1;
  private responded = false;
  private rts: number[] = [];
  private commissions = 0;
  private omissions = 0;
  private nogos = 0;
  private gos = 0;
  private lastErr = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    // About one in nine is a 3, never two in a row.
    for (let k = 0; k < scaled(EXCEPT_TRIALS); k++) {
      let d = rint(1, 9);
      if (k > 0 && d === 3 && this.digits[k - 1] === 3) d = 4;
      this.digits.push(d);
      this.sizes.push(0.7 + Math.random() * 0.8);
    }
    this.t0 = now + 1500;
  }

  private settle(): void {
    if (this.i < 0 || this.i >= this.digits.length) return;
    if (this.digits[this.i] === 3) this.nogos++;
    else {
      this.gos++;
      if (!this.responded) this.omissions++;
    }
  }

  private hit(ts: number): void {
    if (this.i < 0 || this.i >= this.digits.length || this.responded) return;
    const rt = ts - (this.t0 + this.i * EXCEPT_SOA);
    if (rt < ANTICIPATION_MS) return;
    this.responded = true;
    if (this.digits[this.i] === 3) {
      this.commissions++;
      this.lastErr = ts;
      this.env.sound(SND_FALSE);
    } else this.rts.push(rt);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    this.hit(ts);
    this.env.sound(sideOf(slot) > 0 ? SND_TAP_R : SND_TAP_L);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.hit(ts);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const k = Math.floor((now - this.t0) / EXCEPT_SOA);
    if (k !== this.i && now >= this.t0) {
      this.settle();
      this.i = k;
      this.responded = false;
      if (this.i >= this.digits.length) return true;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'threes pressed', String(this.commissions), 'digit', `${Math.max(0, Math.min(this.i + 1, scaled(EXCEPT_TRIALS)))} / ${scaled(EXCEPT_TRIALS)}`);
    const ph = (now - this.t0) % EXCEPT_SOA;
    if (now >= this.t0 && this.i >= 0) {
      if (ph < EXCEPT_ON) {
        ctx.fillStyle = COL_LINE;
        ctx.font = v.fontBig.replace(/\d+px/, `${Math.round(64 * a.u * this.sizes[this.i]!)}px`);
        ctx.textAlign = 'center';
        ctx.fillText(String(this.digits[this.i]), a.cx, a.cy + 20 * a.u * this.sizes[this.i]!);
      } else {
        // A mask between digits.
        ctx.strokeStyle = COL_DIM;
        ctx.lineWidth = v.dpr;
        const s = 26 * a.u;
        ctx.beginPath();
        ctx.arc(a.cx, a.cy, s, 0, Math.PI * 2);
        ctx.moveTo(a.cx - s, a.cy - s);
        ctx.lineTo(a.cx + s, a.cy + s);
        ctx.moveTo(a.cx + s, a.cy - s);
        ctx.lineTo(a.cx - s, a.cy + s);
        ctx.stroke();
      }
    }
    if (now - this.lastErr < 400) {
      ctx.fillStyle = COL_ACCENT;
      v.text('that was a 3', a.cx, a.cy + 90 * a.u, v.fontTiny, 'center');
    } else if (this.i < 4) {
      ctx.fillStyle = COL_MID;
      v.text('press for every digit, as it comes. except 3: then do nothing', a.cx, a.cy + 90 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const caught = this.nogos - this.commissions;
    return {
      score: this.rts.length ? Math.round(Math.max(0, caught) * 40 + (this.gos - this.omissions) * 3 + Math.max(0, 500 - median(this.rts))) : 0,
      primary: { label: 'threes held back', value: this.nogos ? (caught / this.nogos) * 100 : 0, unit: '%' },
      lines: [
        { label: 'threes held back', value: `${Math.max(0, caught)} of ${this.nogos}` },
        { label: 'digits missed', value: `${this.omissions} of ${this.gos}` },
        { label: 'median press', value: ms(median(this.rts)) },
        { label: 'steadiness (spread)', value: ms(sd(this.rts)) },
      ],
      rts: this.rts,
      saved: this.i >= 20,
    };
  }
}

// --- Sync -------------------------------------------------------------------------

/** How long a ball takes to fall to the line (ms). */
const TAU = Math.PI * 2;
/** How long a ball takes to fall to the line (ms). */
const SYNC_FALL = 1200;
const SYNC_TRIALS = 24;

class Sync implements Mini {
  private env!: MiniEnv;
  private i = 0;
  /** How much later the right ball lands than the left (ms); negative means the left lands later. */
  private gap = 0;
  private state = 0; // 0 falling, 1 feedback
  private at = 0;
  private t0 = 0;
  private crossL = 0;
  private crossR = 0;
  private tL = 0;
  private tR = 0;
  private errs: number[] = [];
  private together: number[] = [];
  private lastErr = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 600);
  }

  private arm(now: number): void {
    // First eight: together. Then one ball lags, by more as you go.
    this.gap = this.i < 8 ? 0 : (Math.random() < 0.5 ? -1 : 1) * [100, 150, 200, 260][rint(0, 3)]!;
    this.state = 0;
    this.t0 = now + 400 + Math.random() * 500;
    const base = this.t0 + SYNC_FALL;
    this.crossL = this.gap >= 0 ? base : base - this.gap;
    this.crossR = this.gap >= 0 ? base + this.gap : base;
    this.tL = 0;
    this.tR = 0;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 0 || ts < this.t0) return;
    if (s < 0 && !this.tL) {
      this.tL = ts;
      this.env.sound(SND_TAP_L);
    }
    if (s > 0 && !this.tR) {
      this.tR = ts;
      this.env.sound(SND_TAP_R);
    }
    if (this.tL && this.tR) this.judge(ts);
  }

  private judge(now: number): void {
    // What counts is the gap between your hands against the gap between the balls.
    const err = this.tR - this.tL - (this.crossR - this.crossL);
    this.lastErr = err;
    this.errs.push(Math.abs(err));
    if (this.gap === 0) this.together.push(Math.abs(err));
    this.env.sound(Math.abs(err) < 20 ? SND_CATCH : Math.abs(err) < 50 ? SND_TAP_WEAK : SND_FALSE);
    this.i++;
    this.state = 1;
    this.at = now + 1100;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now > Math.max(this.crossL, this.crossR) + 450) {
      if (!this.tL || !this.tR) {
        // A hand never came.
        this.lastErr = 999;
        this.errs.push(300);
        this.i++;
        this.state = 1;
        this.at = now + 1100;
        this.env.sound(SND_FALSE);
      }
    }
    if (this.state === 1 && now >= this.at) {
      if (this.i >= scaled(SYNC_TRIALS)) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const recent = this.errs.slice(-6);
    header(v, touch, 'hands off by', recent.length ? ms(mean(recent)) : '–', 'drop', `${Math.min(this.i + 1, scaled(SYNC_TRIALS))} / ${scaled(SYNC_TRIALS)}`);
    const top = a.top + 20 * a.u;
    const line = a.bottom - 70 * a.u;
    const speed = (line - top) / SYNC_FALL;
    const off = Math.min(110 * a.u, (a.right - a.left) / 4);
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(a.cx - off * 2, line, off * 4, dpr);
    for (const s of [-1, 1]) {
      const x = a.cx + s * off;
      const cross = s < 0 ? this.crossL : this.crossR;
      const press = s < 0 ? this.tL : this.tR;
      // The lane.
      ctx.fillStyle = COL_FAINT;
      ctx.fillRect(x - dpr / 2, top, dpr, line - top);
      // The ball: falls at a steady speed and crosses the line at its moment.
      const t = press && this.state === 1 ? press : now;
      const y = line - (cross - t) * speed;
      if (t >= this.t0 && y > top - 20 * a.u) {
        ctx.fillStyle = this.state === 1 ? COL_MID : COL_ACCENT;
        ctx.beginPath();
        ctx.arc(x, Math.min(y, line + 60 * a.u), 11 * a.u, 0, TAU);
        ctx.fill();
      }
      // After the drop: where the ball was when you pressed, against the line.
      if (this.state === 1 && press) {
        const py = line - (cross - press) * speed;
        ctx.fillStyle = COL_LINE;
        ctx.fillRect(x - 18 * a.u, py - dpr, 36 * a.u, 2 * dpr);
        ctx.fillStyle = COL_MID;
        const d = Math.round(press - cross);
        v.text(`${d > 0 ? '+' : ''}${d} ms`, x + (s < 0 ? -26 : 26) * a.u, py + 4 * dpr, v.fontTiny, s < 0 ? 'right' : 'left');
      }
      ctx.fillStyle = COL_MID;
      v.text(handLabel(this.env, s), x, line + 28 * a.u, v.fontTiny, 'center');
    }
    ctx.fillStyle = COL_MID;
    const msg =
      this.state === 0
        ? this.gap === 0
          ? 'each hand as its ball hits the line: together'
          : 'each hand as its ball hits the line: one lands later'
        : this.lastErr === 999
          ? 'use both hands'
          : Math.abs(this.lastErr) < 20
            ? `spot on: ${Math.abs(Math.round(this.lastErr))} ms`
            : `the gap between your hands was ${Math.abs(Math.round(this.lastErr))} ms ${this.lastErr > 0 === this.crossR >= this.crossL ? 'too long' : 'too short'}`;
    v.text(msg, a.cx, top + 10 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.round(Math.max(0, 120 - m) * 10) : 0,
      primary: { label: 'hands off by, on average', value: m, unit: 'ms', lower: true },
      lines: [
        { label: 'gap between hands, average error', value: ms(m) },
        { label: 'together drops, average error', value: this.together.length ? ms(mean(this.together)) : '–' },
        { label: 'within 20 ms', value: pct(this.errs.filter((e) => e < 20).length / (this.errs.length || 1)) },
      ],
      saved: this.i >= 6,
    };
  }
}

export const BATCH13: MiniDef[] = [
  {
    id: 'rain',
    name: 'Rain',
    skill: 'speed',
    blurb: 'Letters fall. Type them before they land.',
    how: 'Letters drift down the screen. Type one and the lowest of that letter vanishes. It starts on the home row and adds letters as you go, and the rain gets heavier. Three that land end it. Needs a keyboard.',
    input: 'type',
    make: () => new Rain(),
  },
  {
    id: 'link',
    name: 'Link',
    skill: 'memory',
    blurb: 'Shapes and numbers, paired. Which number went with this shape?',
    how: 'Pairs of a shape and a number show one at a time. Then each shape comes back, in a new order: type or tap its number. Get every pair right and the next round has one more.',
    input: 'pointer',
    make: () => new Link(),
  },
  {
    id: 'except',
    name: 'Except',
    skill: 'attention',
    blurb: 'Press for every digit except 3. The rare 3 is the trap.',
    how: 'Digits flash one at a time, about one a second, in different sizes. Press for every one, except 3: then do nothing. Threes are rare, so the habit of pressing is what catches you. Seventy-two digits.',
    input: 'both',
    make: () => new Except(),
  },
  {
    id: 'sync',
    name: 'Sync',
    skill: 'coordination',
    blurb: 'Two balls drop, one per hand. Press as each hits the line, together or one after the other.',
    how: 'Two balls fall, one in each lane. Press each hand as its ball crosses the line. In the first eight they land together; after that one lands a little later, and your hands should follow the same gap. Scored on how well the gap between your two presses matches the gap between the balls.',
    input: 'keys',
    minKeys: 2,
    make: () => new Sync(),
  },
];
