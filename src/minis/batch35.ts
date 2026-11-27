// Thirty-fifth batch.
//   Herd   - sheep wander in and out of a pen. How many are inside now?
//   Camo   - a ring hides in a field of random strokes. Click inside it.
//   Mix    - mix cyan, magenta and yellow to match a colour.
//   Vanish - a street in perspective: click where its lines meet.
//   Pace   - hear a beat, then set its tempo.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT, SND_CATCH, SND_FALSE, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { Stair, arena, footer, header, mean, median, pct, scaled, sideOf, type Arena, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];

// --- Herd ------------------------------------------------------------------------------

const HERD_ROUNDS = 6;

interface Sheep {
  x: number;
  y: number;
  tx: number;
  ty: number;
  inPen: boolean;
  /** Walking through the gate: 0 not, otherwise the time it finishes. */
  moving: number;
  sx: number;
  sy: number;
  t0: number;
}

class Herd implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private sheep: Sheep[] = [];
  private state = 0; // 0 watching, 1 answering, 2 feedback
  private at = 0;
  private endAt = 0;
  private nextMove = 0;
  private typed = '';
  private answers: { said: number; truth: number }[] = [];
  private moves = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 600);
  }

  private arm(at: number): void {
    const n = 8 + this.round * 2;
    const inside0 = rint(2, Math.floor(n / 2));
    this.sheep = Array.from({ length: n }, (_, i) => {
      const inPen = i < inside0;
      const [x, y] = this.spot(inPen);
      return { x, y, tx: x, ty: y, inPen, moving: 0, sx: x, sy: y, t0: 0 };
    });
    this.state = 0;
    this.at = at;
    this.endAt = at + 12000 + this.round * 2500;
    this.nextMove = at + 1200;
    this.typed = '';
    this.moves = 0;
  }

  /** A place to stand: inside the pen (the middle square) or out in the field (0..1 coordinates). */
  private spot(inPen: boolean): [number, number] {
    if (inPen) return [rnd(0.38, 0.62), rnd(0.32, 0.68)];
    for (;;) {
      const x = rnd(0.05, 0.95);
      const y = rnd(0.08, 0.92);
      if (x < 0.3 || x > 0.7 || y < 0.24 || y > 0.76) return [x, y];
    }
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    if (this.state !== 1) return /^(Digit|Numpad)\d$/.test(code);
    const d = code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '';
    if (/^\d$/.test(d)) {
      if (this.typed.length < 2) this.typed += d;
      return true;
    }
    if (code === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      return true;
    }
    if ((code === 'Enter' || code === 'Space' || code === 'NumpadEnter') && this.typed) {
      const truth = this.sheep.filter((s) => s.inPen).length;
      const said = Number(this.typed);
      this.answers.push({ said, truth });
      this.env.sound(said === truth ? SND_CATCH : SND_FALSE);
      this.round++;
      this.state = 2;
      this.at = ts + 1600;
      return true;
    }
    return false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) {
      // Every so often a sheep walks in or out through the gate on the right of the pen.
      if (now >= this.nextMove && now < this.endAt - 1500) {
        const free = this.sheep.filter((s) => !s.moving);
        const s = free[Math.floor(Math.random() * free.length)];
        if (s) {
          s.inPen = !s.inPen;
          const [tx, ty] = this.spot(s.inPen);
          s.sx = s.x;
          s.sy = s.y;
          s.tx = tx;
          s.ty = ty;
          s.t0 = now;
          s.moving = now + 1800;
          this.moves++;
        }
        this.nextMove = now + Math.max(500, 1500 - this.round * 160) * rnd(0.6, 1.3);
      }
      for (const s of this.sheep) {
        if (!s.moving) continue;
        // Out (or in) by way of the gate.
        const p = Math.min(1, (now - s.t0) / (s.moving - s.t0));
        const gx = 0.7;
        const gy = 0.5;
        if (p < 0.5) {
          const k = p * 2;
          s.x = s.sx + (gx - s.sx) * k;
          s.y = s.sy + (gy - s.sy) * k;
        } else {
          const k = (p - 0.5) * 2;
          s.x = gx + (s.tx - gx) * k;
          s.y = gy + (s.ty - gy) * k;
        }
        if (p >= 1) s.moving = 0;
      }
      if (now >= this.endAt && this.sheep.every((s) => !s.moving)) this.state = 1;
    }
    if (this.state === 2 && now >= this.at) {
      if (this.round >= scaled(HERD_ROUNDS)) return true;
      this.arm(now + 500);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const right = this.answers.filter((x) => x.said === x.truth).length;
    header(v, touch, 'right', this.answers.length ? `${right} of ${this.answers.length}` : '–', 'round', `${Math.min(this.round + 1, scaled(HERD_ROUNDS))} / ${scaled(HERD_ROUNDS)}`);
    const W = a.right - a.left;
    const H = a.bottom - a.top - 30 * a.u;
    const X = (x: number) => a.left + x * W;
    const Y = (y: number) => a.top + y * H;
    // The pen, with its gate on the right.
    ctx.strokeStyle = COL_MID;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.moveTo(X(0.7), Y(0.44));
    ctx.lineTo(X(0.7), Y(0.24));
    ctx.lineTo(X(0.3), Y(0.24));
    ctx.lineTo(X(0.3), Y(0.76));
    ctx.lineTo(X(0.7), Y(0.76));
    ctx.lineTo(X(0.7), Y(0.56));
    ctx.stroke();
    if (this.state !== 1) {
      for (const s of this.sheep) {
        const r = 9 * a.u;
        ctx.fillStyle = COL_LINE;
        ctx.beginPath();
        ctx.ellipse(X(s.x), Y(s.y), r * 1.3, r, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#2a2a30';
        ctx.beginPath();
        ctx.arc(X(s.x) + r * 1.2, Y(s.y) - r * 0.2, r * 0.5, 0, TAU);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#151518';
      ctx.fillRect(X(0.3) + dpr, Y(0.24) + dpr, X(0.7) - X(0.3) - 2 * dpr, Y(0.76) - Y(0.24) - 2 * dpr);
    }
    ctx.fillStyle = this.state === 1 ? COL_LINE : COL_MID;
    if (this.state === 0) v.text(now < this.at + 2500 && this.round === 0 ? 'keep count of the sheep in the pen as they come and go' : 'keep counting…', a.cx, a.bottom - 6 * a.u, v.fontTiny, 'center');
    else if (this.state === 1) v.text(`how many are in the pen?  ${this.typed || '_'}   (type it, then Enter)`, a.cx, a.bottom - 6 * a.u, v.fontHud, 'center');
    else {
      const last = this.answers[this.answers.length - 1]!;
      v.text(last.said === last.truth ? `right: ${last.truth}` : `there were ${last.truth}`, a.cx, a.bottom - 6 * a.u, v.fontHud, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const right = this.answers.filter((x) => x.said === x.truth).length;
    const off = this.answers.map((x) => Math.abs(x.said - x.truth));
    return {
      score: right * 150 + Math.round(Math.max(0, 3 - mean(off)) * 50),
      primary: { label: 'counts right', value: this.answers.length ? Math.round((100 * right) / this.answers.length) : 0, unit: '%' },
      lines: [
        { label: 'right', value: `${right} of ${this.answers.length}` },
        { label: 'typically off by', value: off.length ? `${mean(off).toFixed(1)} sheep` : '–' },
      ],
      saved: this.answers.length >= 2,
    };
  }
}

// --- Camo ------------------------------------------------------------------------------

/** How much the ring's strokes wobble off true (degrees), easy to hard. */
const WOBBLE = [0, 6, 12, 18, 24, 30, 36, 42, 48];
const CAMO_TRIALS = 20;

class Camo implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private readonly stair = new Stair(0, 1, 0, WOBBLE.length - 1, 2);
  private strokes: [number, number, number, boolean][] = [];
  private ring: [number, number, number] = [0, 0, 0];
  private state = 0;
  private at = 0;
  private next = 0;
  private levels: number[] = [];
  private right = 0;
  private clicked: [number, number] | null = null;
  private ok = false;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 600;
  }

  private make(a: Arena): void {
    const W = a.right - a.left;
    const H = a.bottom - a.top;
    const gap = 26 * a.u;
    const R = rnd(55, 85) * a.u;
    const cx = rnd(a.left + R + 20 * a.u, a.right - R - 20 * a.u);
    const cy = rnd(a.top + R + 10 * a.u, a.bottom - R - 10 * a.u);
    this.ring = [cx, cy, R];
    const wob = (WOBBLE[Math.round(this.stair.level)]! * Math.PI) / 180;
    this.strokes = [];
    // The ring: strokes along it, each tangent give or take the wobble.
    const n = Math.round((TAU * R) / gap);
    for (let k = 0; k < n; k++) {
      const t = (k / n) * TAU;
      this.strokes.push([cx + Math.cos(t) * R, cy + Math.sin(t) * R, t + Math.PI / 2 + rnd(-wob, wob), true]);
    }
    // The field: a jittered grid of random strokes, kept clear of the ring's own.
    for (let y = a.top + gap / 2; y < a.top + H; y += gap)
      for (let x = a.left + gap / 2; x < a.left + W; x += gap) {
        const px = x + rnd(-gap * 0.3, gap * 0.3);
        const py = y + rnd(-gap * 0.3, gap * 0.3);
        if (Math.abs(Math.hypot(px - cx, py - cy) - R) < gap * 0.55) continue;
        this.strokes.push([px, py, rnd(0, Math.PI), false]);
      }
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 1) return;
    const [cx, cy, R] = this.ring;
    this.ok = Math.hypot(x - cx, y - cy) < R * 0.9;
    this.clicked = [x, y];
    this.answer(ts);
  }

  private answer(ts: number): void {
    this.levels.push(WOBBLE[Math.round(this.stair.level)]!);
    this.stair.update(this.ok, 1);
    if (this.ok) this.right++;
    this.env.sound(this.ok ? SND_CATCH : SND_FALSE);
    this.i++;
    this.state = 2;
    this.next = ts + 1100;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const a = arena(v, touch);
    if (this.state !== 1 && now >= this.next) {
      if (this.i >= scaled(CAMO_TRIALS)) return true;
      this.make(a);
      this.clicked = null;
      this.state = 1;
      this.at = now;
    }
    if (this.state === 1 && now - this.at > 5000) {
      this.ok = false;
      this.clicked = null;
      this.answer(now);
    }
    v.clear();
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'wobble', `${WOBBLE[Math.round(this.stair.level)]}°`, 'field', `${Math.min(this.i + 1, scaled(CAMO_TRIALS))} / ${scaled(CAMO_TRIALS)}`);
    const L = 9 * a.u;
    ctx.lineWidth = 2 * dpr;
    ctx.lineCap = 'round';
    for (const [x, y, ang, onRing] of this.strokes) {
      ctx.strokeStyle = this.state === 2 && onRing ? COL_ACCENT : COL_LINE;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(ang) * L, y - Math.sin(ang) * L);
      ctx.lineTo(x + Math.cos(ang) * L, y + Math.sin(ang) * L);
      ctx.stroke();
    }
    if (this.state === 1) {
      const p = Math.min(1, (now - this.at) / 5000);
      ctx.fillStyle = COL_DIM;
      ctx.fillRect(a.cx - 120 * a.u, a.bottom + 8 * dpr, 240 * a.u * (1 - p), 2 * dpr);
    }
    if (this.clicked) {
      ctx.strokeStyle = this.ok ? COL_LINE : COL_MID;
      ctx.beginPath();
      ctx.arc(this.clicked[0], this.clicked[1], 6 * dpr, 0, TAU);
      ctx.stroke();
    }
    if (this.i < 2 && this.state === 1) {
      ctx.fillStyle = COL_MID;
      v.text('some strokes line up into a ring: click inside it', a.cx, a.top - 12 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const thr = this.levels.length >= 6 ? median(this.levels.slice(-10)) : NaN;
    return {
      score: Number.isFinite(thr) ? Math.round(thr * 20 + this.right * 10) : 0,
      primary: { label: 'most wobble you still see through', value: thr, unit: '°' },
      lines: [
        { label: 'rings found', value: `${this.right} of ${this.i}` },
        { label: 'most wobble reached', value: this.levels.length ? `${Math.max(...this.levels)}°` : '–' },
      ],
      saved: this.i >= 5,
    };
  }
}

// --- Mix -------------------------------------------------------------------------------

const MIX_ROUNDS = 8;

/** Perceptual distance between two RGB colours (CIE76 ΔE in Lab). */
function deltaE(a: [number, number, number], b: [number, number, number]): number {
  const lab = (c: [number, number, number]) => {
    const lin = c.map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    const x = (lin[0]! * 0.4124 + lin[1]! * 0.3576 + lin[2]! * 0.1805) / 0.95047;
    const y = lin[0]! * 0.2126 + lin[1]! * 0.7152 + lin[2]! * 0.0722;
    const z = (lin[0]! * 0.0193 + lin[1]! * 0.1192 + lin[2]! * 0.9505) / 1.08883;
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  };
  const p = lab(a);
  const q = lab(b);
  return Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
}

const cmyRgb = (c: number[]): [number, number, number] => [Math.round(255 * (1 - c[0]!)), Math.round(255 * (1 - c[1]!)), Math.round(255 * (1 - c[2]!))];

class Mix implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private target = [0, 0, 0];
  private mine = [0, 0, 0];
  private state = 0;
  private next = 0;
  private tracks: Rect[] = [];
  private done: Rect = [0, 0, 0, 0];
  private dragging = -1;
  private errs: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 400;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 1) return;
    if (inside(this.done, x, y)) {
      const e = deltaE(cmyRgb(this.target), cmyRgb(this.mine));
      this.errs.push(e);
      this.env.sound(e < 6 ? SND_CATCH : SND_TAP_WEAK);
      this.round++;
      this.state = 2;
      this.next = ts + 1800;
      return;
    }
    const k = this.tracks.findIndex((r) => inside([r[0] - 20, r[1] - 10, r[2] + 40, r[3] + 20], x, y));
    if (k >= 0) {
      this.dragging = k;
      this.set(k, y);
    }
  }

  pointerMove(_x: number, y: number): void {
    if (this.dragging >= 0 && this.state === 1) this.set(this.dragging, y);
  }

  pointerUp(): void {
    this.dragging = -1;
  }

  private set(k: number, y: number): void {
    const r = this.tracks[k]!;
    this.mine[k] = Math.max(0, Math.min(1, 1 - (y - r[1]) / r[3]));
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state !== 1 && now >= this.next) {
      if (this.round >= scaled(MIX_ROUNDS)) return true;
      // Mostly two inks, with a little of the third later on.
      const pickTwo = [0, 1, 2].sort(() => Math.random() - 0.5);
      this.target = [0, 0, 0];
      this.target[pickTwo[0]!] = rnd(0.25, 0.95);
      this.target[pickTwo[1]!] = rnd(0.1, 0.8);
      if (this.round >= 3) this.target[pickTwo[2]!] = rnd(0, 0.3);
      this.mine = [0, 0, 0];
      this.state = 1;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'off by', this.errs.length ? `ΔE ${mean(this.errs.slice(-3)).toFixed(1)}` : '–', 'colour', `${Math.min(this.round + 1, scaled(MIX_ROUNDS))} / ${scaled(MIX_ROUNDS)}`);
    const sw = Math.min(150 * a.u, (a.right - a.left) / 4);
    const sy = a.top + 20 * a.u;
    const rgb = (c: number[]) => {
      const [r, g, b] = cmyRgb(c);
      return `rgb(${r},${g},${b})`;
    };
    ctx.fillStyle = rgb(this.target);
    ctx.fillRect(a.cx - sw - 10 * a.u, sy, sw, sw);
    ctx.fillStyle = rgb(this.mine);
    ctx.fillRect(a.cx + 10 * a.u, sy, sw, sw);
    ctx.fillStyle = COL_MID;
    v.text('match this', a.cx - sw / 2 - 10 * a.u, sy + sw + 18 * a.u, v.fontTiny, 'center');
    v.text('your mix', a.cx + sw / 2 + 10 * a.u, sy + sw + 18 * a.u, v.fontTiny, 'center');
    // Three ink sliders: cyan, magenta, yellow.
    const names = ['cyan', 'magenta', 'yellow'];
    const cols = ['#00b7eb', '#e0218a', '#f5d90a'];
    const th = Math.max(80 * a.u, a.bottom - (sy + sw + 40 * a.u) - 70 * a.u);
    const ty = sy + sw + 40 * a.u;
    this.tracks = [0, 1, 2].map((k) => [a.cx + (k - 1) * 90 * a.u - 6 * a.u, ty, 12 * a.u, th] as Rect);
    this.tracks.forEach((r, k) => {
      ctx.fillStyle = COL_FAINT;
      ctx.fillRect(r[0], r[1], r[2], r[3]);
      const h = this.mine[k]! * r[3];
      ctx.fillStyle = cols[k]!;
      ctx.fillRect(r[0], r[1] + r[3] - h, r[2], h);
      ctx.fillStyle = COL_LINE;
      ctx.fillRect(r[0] - 6 * a.u, r[1] + r[3] - h - 2 * dpr, r[2] + 12 * a.u, 4 * dpr);
      ctx.fillStyle = COL_MID;
      v.text(names[k]!, r[0] + r[2] / 2, r[1] + r[3] + 18 * a.u, v.fontTiny, 'center');
    });
    this.done = [a.cx + 170 * a.u, ty + th / 2 - 22 * a.u, 90 * a.u, 44 * a.u];
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeRect(...this.done);
    ctx.fillStyle = COL_LINE;
    v.text(this.state === 2 ? `ΔE ${this.errs[this.errs.length - 1]!.toFixed(1)}` : 'done', this.done[0] + this.done[2] / 2, this.done[1] + this.done[3] / 2 + 5 * dpr, v.fontTiny, 'center');
    if (this.state === 2) {
      ctx.fillStyle = COL_MID;
      const t = this.target.map((x) => Math.round(x * 100));
      v.text(`it was cyan ${t[0]}, magenta ${t[1]}, yellow ${t[2]}`, a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    } else if (this.round === 0) {
      ctx.fillStyle = COL_MID;
      v.text('drag the three inks to mix the colour on the left, then press done', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.round(Math.max(0, 40 - m) * 25) : 0,
      primary: { label: 'colour difference, on average', value: m, unit: 'ΔE', lower: true, decimals: 1 },
      lines: [
        { label: 'average difference', value: this.errs.length ? `ΔE ${m.toFixed(1)}  (under 2.3 is hard to see)` : '–' },
        { label: 'closest match', value: this.errs.length ? `ΔE ${Math.min(...this.errs).toFixed(1)}` : '–' },
      ],
      saved: this.errs.length >= 2,
    };
  }
}

// --- Vanish ----------------------------------------------------------------------------

const VANISH_ROUNDS = 10;

class Vanish implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private vp: [number, number] = [0, 0];
  private segs: [number, number, number, number][] = [];
  private state = 0;
  private next = 0;
  private pickXY: [number, number] | null = null;
  private errs: number[] = [];
  private a: Arena | null = null;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 400;
  }

  private make(a: Arena): void {
    const W = a.right - a.left;
    const H = a.bottom - a.top;
    this.vp = [a.left + rnd(0.25, 0.75) * W, a.top + rnd(0.25, 0.6) * H];
    const [vx, vy] = this.vp;
    this.segs = [];
    // Road edges, kerbs, rooflines and window rows heading for the vanishing point, each cut
    // well short of it, and a little wobble so it is judgement, not a ruler.
    const ends: [number, number][] = [];
    for (let k = 0; k < 10; k++) {
      const side = k % 2 ? 1 : -1;
      const ex = side > 0 ? a.right : a.left;
      const ey = a.top + rnd(-0.1, 1.1) * H;
      ends.push([ex + rnd(-20, 20) * a.u, ey]);
    }
    ends.push([vx - W * 0.3, a.bottom], [vx + W * 0.3, a.bottom]);
    for (const [ex, ey] of ends) {
      const stop = rnd(0.35, 0.6);
      const jit = rnd(-0.012, 0.012);
      const ang = Math.atan2(vy - ey, vx - ex) + jit;
      const len = Math.hypot(vx - ex, vy - ey) * stop;
      this.segs.push([ex, ey, ex + Math.cos(ang) * len, ey + Math.sin(ang) * len]);
    }
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 1 || !this.a) return;
    this.pickXY = [x, y];
    const e = (Math.hypot(x - this.vp[0], y - this.vp[1]) / (this.a.right - this.a.left)) * 100;
    this.errs.push(e);
    this.env.sound(e < 2 ? SND_CATCH : SND_TAP_WEAK);
    this.round++;
    this.state = 2;
    this.next = ts + 1500;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const a = arena(v, touch);
    if (this.state !== 1 && now >= this.next) {
      if (this.round >= scaled(VANISH_ROUNDS)) return true;
      this.a = a;
      this.make(a);
      this.pickXY = null;
      this.state = 1;
    }
    v.clear();
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'off by', this.errs.length ? `${mean(this.errs.slice(-3)).toFixed(1)}%` : '–', 'scene', `${Math.min(this.round + 1, scaled(VANISH_ROUNDS))} / ${scaled(VANISH_ROUNDS)}`);
    ctx.save();
    ctx.beginPath();
    ctx.rect(a.left, a.top, a.right - a.left, a.bottom - a.top);
    ctx.clip();
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 2 * dpr;
    for (const [x1, y1, x2, y2] of this.segs) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    if (this.state === 2) {
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = dpr;
      for (const [x1, y1] of this.segs) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(this.vp[0], this.vp[1]);
        ctx.stroke();
      }
      ctx.fillStyle = COL_LINE;
      ctx.beginPath();
      ctx.arc(this.vp[0], this.vp[1], 5 * dpr, 0, TAU);
      ctx.fill();
    }
    if (this.pickXY) {
      ctx.strokeStyle = COL_ACCENT;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.arc(this.pickXY[0], this.pickXY[1], 7 * dpr, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = COL_MID;
    v.text(this.state === 2 ? `${this.errs[this.errs.length - 1]!.toFixed(1)}% of the width off` : 'click where all these lines would meet', a.cx, a.bottom - 6 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.round(Math.max(0, 15 - m) * 70) : 0,
      primary: { label: 'average miss', value: m, unit: '%', lower: true, decimals: 1 },
      lines: [
        { label: 'average miss (share of the width)', value: this.errs.length ? `${m.toFixed(1)}%` : '–' },
        { label: 'closest', value: this.errs.length ? `${Math.min(...this.errs).toFixed(1)}%` : '–' },
      ],
      saved: this.errs.length >= 3,
    };
  }
}

// --- Pace ------------------------------------------------------------------------------

const PACE_ROUNDS = 10;

class Pace implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private bpm = 100;
  private guess = 100;
  private state = 0; // 0 listening, 1 setting, 2 feedback
  private at = 0;
  private next = 0;
  private beats = 0;
  private held = 0;
  private holdAt = 0;
  private lastStep = 0;
  private errs: number[] = [];
  private signed: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 600);
  }

  private arm(at: number): void {
    this.bpm = rint(60, 180);
    this.guess = 120;
    this.state = 0;
    this.at = at;
    this.beats = 0;
  }

  press(slot: number, ts: number): void {
    const was = this.held;
    this.held |= 1 << slot;
    if (this.state !== 1) return;
    const L = (this.held & 0b111) !== 0;
    const R = (this.held & 0b111000) !== 0;
    if (L && R) {
      // Both hands: lock it in.
      const e = ((this.guess - this.bpm) / this.bpm) * 100;
      this.errs.push(Math.abs(e));
      this.signed.push(e);
      this.env.sound(Math.abs(e) < 4 ? SND_CATCH : SND_TAP_WEAK);
      this.round++;
      this.state = 2;
      this.next = ts + 1600;
      return;
    }
    if (!was) {
      this.step(sideOf(slot), 1);
      this.holdAt = ts;
      this.lastStep = ts;
    }
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  private step(side: number, by: number): void {
    this.guess = Math.max(30, Math.min(240, this.guess + side * by));
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) {
      const period = 60000 / this.bpm;
      const k = Math.floor((now - this.at) / period);
      if (k >= this.beats && this.beats < 8) {
        this.beats = k + 1;
        this.env.sound(SND_BEAT);
      }
      if (now - this.at > period * 8 + 300) {
        this.state = 1;
        this.at = now;
      }
    }
    if (this.state === 1 && this.held) {
      // Held: steps get bigger the longer you hold.
      const side = (this.held & 0b111) !== 0 ? -1 : 1;
      const rate = now - this.holdAt > 1200 ? 40 : now - this.holdAt > 450 ? 120 : 1e9;
      if (now - this.lastStep > rate) {
        this.step(side, now - this.holdAt > 1800 ? 5 : 1);
        this.lastStep = now;
      }
    }
    if (this.state === 2 && now >= this.next) {
      if (this.round >= scaled(PACE_ROUNDS)) return true;
      this.arm(now + 400);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'off by', this.errs.length ? `${mean(this.errs.slice(-3)).toFixed(1)}%` : '–', 'beat', `${Math.min(this.round + 1, scaled(PACE_ROUNDS))} / ${scaled(PACE_ROUNDS)}`);
    ctx.font = `600 ${Math.round(64 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.state === 0) {
      const period = 60000 / this.bpm;
      const ph = ((now - this.at) % period) / period;
      ctx.fillStyle = now >= this.at && ph < 0.15 ? COL_LINE : COL_DIM;
      ctx.beginPath();
      ctx.arc(a.cx, a.cy, 20 * a.u, 0, TAU);
      ctx.fill();
      ctx.fillStyle = COL_MID;
      v.text('listen to the beat', a.cx, a.cy + 60 * a.u, v.fontTiny, 'center');
    } else {
      ctx.fillStyle = this.state === 2 ? COL_MID : COL_LINE;
      ctx.fillText(`${this.guess}`, a.cx, a.cy);
      ctx.fillStyle = COL_MID;
      v.text('beats a minute', a.cx, a.cy + 50 * a.u, v.fontTiny, 'center');
      if (this.state === 1) v.text('left key slower, right key faster (hold to run). both together to lock it in', a.cx, a.bottom - 8 * a.u, v.fontTiny, 'center');
      else {
        const e = this.signed[this.signed.length - 1]!;
        v.text(`it was ${this.bpm}  ·  ${Math.abs(e).toFixed(1)}% ${e > 0 ? 'fast' : 'slow'}`, a.cx, a.cy - 70 * a.u, v.fontHud, 'center');
      }
    }
    if (this.env.muted) message2(v, a);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    const bias = mean(this.signed);
    return {
      score: this.errs.length ? Math.round(Math.max(0, 25 - m) * 40) : 0,
      primary: { label: 'average miss', value: m, unit: '%', lower: true, decimals: 1 },
      lines: [
        { label: 'average miss', value: this.errs.length ? `${m.toFixed(1)}%` : '–' },
        { label: 'tendency', value: this.signed.length >= 3 ? `${Math.abs(bias).toFixed(1)}% ${bias > 0 ? 'too fast' : 'too slow'}` : '–' },
        { label: 'within 3%', value: this.errs.length ? pct(this.errs.filter((e) => e <= 3).length / this.errs.length) : '–' },
      ],
      saved: this.errs.length >= 3,
    };
  }
}

function message2(v: View, a: Arena): void {
  v.ctx.fillStyle = COL_ACCENT;
  v.text('needs sound on', a.cx, a.top + 10 * a.u, v.fontTiny, 'center');
}

export const BATCH35: MiniDef[] = [
  { id: 'herd', name: 'Herd', skill: 'attention', blurb: 'Sheep wander in and out of a pen. How many are inside now?', how: 'Sheep stand in and around a pen. Every so often one walks in or out through the gate. Keep a running count of how many are inside; when it stops, type the number and press Enter. Each round is longer and busier. Six rounds.', input: 'type', make: () => new Herd() },
  { id: 'camo', name: 'Camo', skill: 'attention', blurb: 'A ring hides in a field of random strokes. Click inside it.', how: 'A field of short strokes at random angles. Some of them line up into a ring. Find it and click inside it, within five seconds. Each find makes the ring’s strokes wobble more off true, so it blends in better. Scored on the most wobble you can still see through.', input: 'pointer', make: () => new Camo() },
  { id: 'mix', name: 'Mix', skill: 'judgement', blurb: 'Mix cyan, magenta and yellow ink to match a colour.', how: 'A colour on the left. Drag the three ink sliders (cyan, magenta, yellow) to mix it on the right, then press done. Scored in ΔE, the standard measure of how different two colours look: under about 2 is hard to see at all. Eight colours. Needs full colour vision.', input: 'pointer', make: () => new Mix() },
  { id: 'vanish', name: 'Vanish', skill: 'judgement', blurb: 'A street in perspective. Click where its lines meet.', how: 'Lines from a street drawn in perspective (roofs, kerbs, rows of windows) all head for one vanishing point, but stop well short of it. Click where they would meet. Scored as a share of the screen width. Ten scenes.', input: 'pointer', make: () => new Vanish() },
  { id: 'pace', name: 'Pace', skill: 'timing', blurb: 'Hear a beat, then set its tempo.', how: 'Eight beats play. Then set the tempo you heard, in beats a minute: left key slower, right key faster (hold to run), both together to lock it in. Tempos from 60 to 180. Scored on how far off you are, as a percentage.', input: 'keys', minKeys: 2, make: () => new Pace() },
];

