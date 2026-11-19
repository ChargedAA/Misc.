// Twenty-sixth batch: judgement, memory and listening, each a different question.
//   Angle    (judgement) - how wide is this angle? Mark it on a 0-180 scale.
//   Duration (judgement) - how long was the disc on screen? Mark it on a time scale.
//   Centroid (judgement) - tap the balance point of a cloud of dots.
//   Align    (judgement) - turn your line until it is parallel to the other, then let go.
//   Closer   (judgement) - which dot is nearer the cross?
//   Topple   (judgement) - will this stack of blocks stand or fall?
//   Recall   (memory)    - words go by one at a time. Type every one you remember.
//   Queue    (memory)    - shapes join a queue. Which one was third?
//   Beeps    (attention) - count the beeps; the flashes are there to mislead you.
//   Sounds   (memory)    - turn tiles to hear their tones; find the matching pairs by ear.
//   Tune     (judgement) - nudge a tone up or down until it matches the first.
//   Pattern  (reasoning) - a shape changes step by step. Which comes next?

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_BEAT, SND_CATCH, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK } from '../audio.ts';
import { SHAPE_CIRCLE, SHAPE_CROSS, SHAPE_DIAMOND, SHAPE_SQUARE, SHAPE_TRIANGLE, type View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { keypad } from './batch20.ts';
import { WORDS } from './batch24.ts';
import { Stair, arena, footer, handLabel, header, mean, median, pct, scaled, shuffle, sideOf, type Arena, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;

function rnd(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

function rint(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

type Rect = [number, number, number, number];

function inside(r: Rect, x: number, y: number): boolean {
  return x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
}

function note(v: View, a: Arena, text: string, color = COL_MID): void {
  v.ctx.fillStyle = color;
  v.text(text, a.cx, a.bottom - 14 * a.u, v.fontTiny, 'center');
}

// --- A scale you tap to answer (Angle, Duration) ------------------------------------

abstract class ScaleTrials implements Mini {
  protected env!: MiniEnv;
  protected i = 0;
  protected abstract readonly total: number;
  protected state = 0; // 0 gap, 1 stimulus, 2 answer, 3 feedback
  protected at = 0;
  protected truth = 0;
  protected answer = 0;
  protected errs: number[] = [];
  protected signed: number[] = [];
  protected geo = { x0: 0, w: 1, y: 0 };
  protected abstract readonly min: number;
  protected abstract readonly max: number;
  protected abstract readonly unit: string;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.at = now + 700;
  }

  press(): void {}

  protected abstract make(now: number): void;
  protected abstract drawStimulus(v: View, a: Arena, now: number): void;
  /** Ready for an answer yet? */
  protected abstract answerable(now: number): boolean;

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 2) return;
    const g = this.geo;
    if (Math.abs(y - g.y) > 160 || x < g.x0 - 30 || x > g.x0 + g.w + 30) return;
    const p = Math.max(0, Math.min(1, (x - g.x0) / g.w));
    this.answer = this.min + p * (this.max - this.min);
    const e = (this.answer - this.truth) / (this.max - this.min);
    this.errs.push(Math.abs(e));
    this.signed.push(this.answer - this.truth);
    this.env.sound(Math.abs(e) < 0.04 ? SND_CATCH : SND_TAP_WEAK);
    this.i++;
    this.state = 3;
    this.at = ts + 1200;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) {
      this.make(now);
      this.state = 1;
    } else if (this.state === 1 && this.answerable(now)) this.state = 2;
    else if (this.state === 3 && now >= this.at) {
      if (this.i >= this.total) return true;
      this.state = 0;
      this.at = now + 400;
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const recent = this.errs.slice(-4);
    header(v, touch, 'off by', recent.length ? pct(mean(recent)) : '–', 'trial', `${Math.min(this.i + 1, this.total)} / ${this.total}`);
    if (this.state >= 1) this.drawStimulus(v, a, now);
    // The answer scale.
    const w = Math.min(a.right - a.left - 40 * a.u, 600 * a.u);
    const y = a.bottom - 60 * a.u;
    this.geo = { x0: a.cx - w / 2, w, y };
    ctx.fillStyle = this.state === 2 ? COL_LINE : COL_DIM;
    ctx.fillRect(a.cx - w / 2, y, w, v.dpr);
    for (let k = 0; k <= 4; k++) {
      const x = a.cx - w / 2 + (k / 4) * w;
      ctx.fillRect(x - v.dpr / 2, y - 8 * a.u, v.dpr, 16 * a.u);
      ctx.fillStyle = COL_MID;
      v.text(this.label(this.min + (k / 4) * (this.max - this.min)), x, y + 26 * a.u, v.fontTiny, 'center');
      ctx.fillStyle = this.state === 2 ? COL_LINE : COL_DIM;
    }
    if (this.state === 3) {
      const X = (val: number) => a.cx - w / 2 + ((val - this.min) / (this.max - this.min)) * w;
      ctx.fillStyle = COL_LINE;
      ctx.fillRect(X(this.truth) - v.dpr, y - 18 * a.u, 2 * v.dpr, 36 * a.u);
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.arc(X(this.answer), y, 6 * a.u, 0, TAU);
      ctx.fill();
      ctx.fillStyle = COL_MID;
      v.text(`it was ${this.label(this.truth)}, you said ${this.label(this.answer)}`, a.cx, y - 30 * a.u, v.fontTiny, 'center');
    } else if (this.state === 2) {
      ctx.fillStyle = COL_MID;
      v.text('tap the scale', a.cx, y - 30 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  protected label(val: number): string {
    return `${Math.round(val)}${this.unit}`;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    const bias = mean(this.signed);
    return {
      score: this.errs.length ? Math.max(0, Math.round((0.25 - m) * 3000)) : 0,
      primary: { label: 'average miss, share of the scale', value: Math.round(m * 1000) / 10, unit: '%', lower: true, decimals: 1 },
      lines: [
        { label: 'within 5%', value: pct(this.errs.filter((e) => e < 0.05).length / (this.errs.length || 1)) },
        { label: 'tendency', value: this.signed.length ? `${bias >= 0 ? 'over' : 'under'} by ${this.label(Math.abs(bias))}` : '–' },
      ],
      saved: this.errs.length >= 4,
    };
  }
}

class Angle extends ScaleTrials {
  protected readonly total = scaled(14);
  protected readonly min = 0;
  protected readonly max = 180;
  protected readonly unit = '°';
  private rot = 0;

  protected make(_now: number): void {
    this.truth = rint(8, 172);
    this.rot = rnd(0, TAU);
  }

  protected answerable(): boolean {
    return true;
  }

  protected drawStimulus(v: View, a: Arena): void {
    const ctx = v.ctx;
    const cy = a.cy - 40 * a.u;
    const r = Math.min(120 * a.u, (a.bottom - a.top) / 3);
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 2 * v.dpr;
    ctx.beginPath();
    ctx.moveTo(a.cx + Math.cos(this.rot) * r, cy + Math.sin(this.rot) * r);
    ctx.lineTo(a.cx, cy);
    const b = this.rot + (this.truth * Math.PI) / 180;
    ctx.lineTo(a.cx + Math.cos(b) * r, cy + Math.sin(b) * r);
    ctx.stroke();
  }
}

class Duration extends ScaleTrials {
  protected readonly total = scaled(14);
  protected readonly min = 0;
  protected readonly max = 2500;
  protected readonly unit = ' ms';
  private shownAt = 0;

  protected make(now: number): void {
    this.truth = rint(250, 2300);
    this.shownAt = now + 400;
  }

  protected answerable(now: number): boolean {
    return now > this.shownAt + this.truth + 200;
  }

  protected drawStimulus(v: View, a: Arena, now: number): void {
    if (this.state === 1 && now >= this.shownAt && now < this.shownAt + this.truth) {
      v.ctx.fillStyle = COL_LINE;
      v.ctx.beginPath();
      v.ctx.arc(a.cx, a.cy - 40 * a.u, 40 * a.u, 0, TAU);
      v.ctx.fill();
    } else if (this.state === 1) {
      v.ctx.fillStyle = COL_MID;
      v.text('how long is it on screen?', a.cx, a.cy - 40 * a.u, v.fontTiny, 'center');
    }
  }

  protected override label(val: number): string {
    return `${(val / 1000).toFixed(val < 1000 ? 2 : 1)} s`;
  }
}

// --- Centroid -----------------------------------------------------------------------

class Centroid implements Mini {
  private env!: MiniEnv;
  private readonly total = scaled(14);
  private i = 0;
  private dots: [number, number][] = [];
  private truth: [number, number] = [0.5, 0.5];
  private tap: [number, number] = [0, 0];
  private state = 0;
  private at = 0;
  private errs: number[] = [];
  private geo = { x0: 0, y0: 0, s: 1 };

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 500);
  }

  private make(at: number): void {
    const n = rint(5, 12);
    // Clustered unevenly, so the middle of the board is rarely the answer.
    const cx = rnd(0.3, 0.7);
    const cy = rnd(0.3, 0.7);
    this.dots = [];
    for (let k = 0; k < n; k++) this.dots.push([Math.min(0.95, Math.max(0.05, cx + rnd(-0.35, 0.35) * (k % 3 ? 1 : 0.4))), Math.min(0.95, Math.max(0.05, cy + rnd(-0.35, 0.35)))]);
    this.truth = [mean(this.dots.map((d) => d[0])), mean(this.dots.map((d) => d[1]))];
    this.state = 0;
    this.at = at;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 1) return;
    const g = this.geo;
    const px = (x - g.x0) / g.s;
    const py = (y - g.y0) / g.s;
    if (px < -0.1 || px > 1.1 || py < -0.1 || py > 1.1) return;
    this.tap = [px, py];
    const e = Math.hypot(px - this.truth[0], py - this.truth[1]);
    this.errs.push(e);
    this.env.sound(e < 0.03 ? SND_CATCH : SND_TAP_WEAK);
    this.i++;
    this.state = 2;
    this.at = ts + 1200;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.state = 1;
    else if (this.state === 2 && now >= this.at) {
      if (this.i >= this.total) return true;
      this.make(now + 300);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'off by', this.errs.length ? pct(mean(this.errs.slice(-4))) : '–', 'cloud', `${Math.min(this.i + 1, this.total)} / ${this.total}`);
    const s = Math.min(a.right - a.left, a.bottom - a.top - 40 * a.u);
    this.geo = { x0: a.cx - s / 2, y0: a.top + 10 * a.u, s };
    const g = this.geo;
    ctx.strokeStyle = COL_FAINT;
    ctx.lineWidth = v.dpr;
    ctx.strokeRect(g.x0, g.y0, s, s);
    if (this.state >= 1) {
      ctx.fillStyle = COL_LINE;
      for (const d of this.dots) {
        ctx.beginPath();
        ctx.arc(g.x0 + d[0] * s, g.y0 + d[1] * s, 5 * a.u, 0, TAU);
        ctx.fill();
      }
    }
    if (this.state === 2) {
      ctx.strokeStyle = COL_LINE;
      ctx.beginPath();
      ctx.arc(g.x0 + this.truth[0] * s, g.y0 + this.truth[1] * s, 10 * a.u, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.arc(g.x0 + this.tap[0] * s, g.y0 + this.tap[1] * s, 5 * a.u, 0, TAU);
      ctx.fill();
    } else if (this.i === 0) note(v, a, 'tap the balance point of the dots: the average of where they all are');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.max(0, Math.round((0.15 - m) * 6000)) : 0,
      primary: { label: 'average miss, share of the board', value: Math.round(m * 1000) / 10, unit: '%', lower: true, decimals: 1 },
      lines: [{ label: 'within 3%', value: pct(this.errs.filter((e) => e < 0.03).length / (this.errs.length || 1)) }],
      saved: this.errs.length >= 4,
    };
  }
}

// --- Align --------------------------------------------------------------------------

class Align implements Mini {
  private env!: MiniEnv;
  private readonly total = scaled(10);
  private i = 0;
  private ref = 0;
  private mine = 0;
  private moved = false;
  private idleSince = 0;
  private state = 0;
  private at = 0;
  private errs: number[] = [];
  private last = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.last = now;
    this.make(now + 400);
  }

  private make(at: number): void {
    this.ref = rnd(0, Math.PI);
    this.mine = this.ref + rnd(0.5, 1.4) * (Math.random() < 0.5 ? -1 : 1);
    this.moved = false;
    this.state = 0;
    this.at = at;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (sideOf(slot) !== 0 && this.state === 1) {
      this.moved = true;
      this.idleSince = 0;
      void ts;
    }
  }

  release(slot: number, ts: number): void {
    this.held &= ~(1 << slot);
    if (this.held === 0 && this.moved) this.idleSince = ts;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.state === 0 && now >= this.at) this.state = 1;
    else if (this.state === 1) {
      const l = (this.held & 0b111) !== 0;
      const r = (this.held & 0b111000) !== 0;
      // Turns slowly when you start, faster if you keep holding.
      if (l !== r) this.mine += (r ? 1 : -1) * 0.5 * dt;
      // Let go for most of a second and it locks in.
      if (this.moved && this.idleSince && now - this.idleSince > 800) {
        let d = ((this.mine - this.ref) % Math.PI + Math.PI) % Math.PI;
        if (d > Math.PI / 2) d = Math.PI - d;
        const deg = (d * 180) / Math.PI;
        this.errs.push(deg);
        this.env.sound(deg < 1.5 ? SND_CATCH : SND_TAP_WEAK);
        this.i++;
        this.state = 2;
        this.at = now + 1200;
      }
    } else if (this.state === 2 && now >= this.at) {
      if (this.i >= this.total) return true;
      this.make(now + 300);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'off by', this.errs.length ? `${this.errs[this.errs.length - 1]!.toFixed(1)}°` : '–', 'line', `${Math.min(this.i + 1, this.total)} / ${this.total}`);
    const r = Math.min(150 * a.u, (a.right - a.left) / 4);
    const drawLine = (x: number, ang: number, col: string) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.5 * v.dpr;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(ang) * r, a.cy - Math.sin(ang) * r);
      ctx.lineTo(x + Math.cos(ang) * r, a.cy + Math.sin(ang) * r);
      ctx.stroke();
    };
    if (this.state >= 1) {
      drawLine(a.cx - r * 1.3, this.ref, COL_MID);
      drawLine(a.cx + r * 1.3, this.mine, this.state === 2 ? COL_LINE : COL_ACCENT);
    }
    if (this.state === 2) note(v, a, `${this.errs[this.errs.length - 1]!.toFixed(1)}° off parallel`);
    else note(v, a, `hold ${handLabel(this.env, -1)} or ${handLabel(this.env, 1)} to turn the orange line parallel to the grey one, then let go`);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.max(0, Math.round((10 - m) * 60)) : 0,
      primary: { label: 'average angle off parallel', value: Math.round(m * 10) / 10, unit: '°', lower: true, decimals: 1, zeroOk: true },
      lines: [{ label: 'within 1.5°', value: pct(this.errs.filter((e) => e < 1.5).length / (this.errs.length || 1)) }],
      saved: this.errs.length >= 3,
    };
  }
}

// --- Closer -------------------------------------------------------------------------

class Closer implements Mini {
  private env!: MiniEnv;
  private readonly total = scaled(30);
  private readonly ratio = new Stair(30, 3, 3, 45, 2);
  private levels: number[] = [];
  private i = 0;
  private state = 0;
  private at = 0;
  private cross: [number, number] = [0.5, 0.5];
  private dots: [[number, number], [number, number]] = [[0.2, 0.5], [0.8, 0.5]];
  private nearer = -1;
  private lastOk = true;
  private right = 0;
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 600);
  }

  private make(at: number): void {
    // The far dot is a set percentage further away than the near one.
    this.cross = [rnd(0.4, 0.6), rnd(0.35, 0.65)];
    const near = rnd(0.18, 0.3);
    const far = near * (1 + this.ratio.level / 100);
    const side = Math.random() < 0.5 ? -1 : 1;
    const pt = (d: number, s: number): [number, number] => {
      const ang = (s < 0 ? Math.PI : 0) + rnd(-0.9, 0.9);
      return [this.cross[0] + Math.cos(ang) * d, this.cross[1] + Math.sin(ang) * d];
    };
    const n = pt(near, side);
    const f = pt(far, -side);
    this.dots = side < 0 ? [n, f] : [f, n];
    this.nearer = side;
    this.state = 0;
    this.at = at;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 1) return;
    const ok = s === this.nearer;
    this.levels.push(this.ratio.level);
    this.ratio.update(ok, -1);
    this.lastOk = ok;
    if (ok) this.right++;
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.i++;
    this.state = 2;
    this.at = ts + 700;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) this.state = 1;
    else if (this.state === 2 && now >= this.at) {
      if (this.i >= this.total) return true;
      this.make(now + 250);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'difference', `${this.ratio.level}%`, 'trial', `${Math.min(this.i + 1, this.total)} / ${this.total}`);
    const s = Math.min(a.right - a.left, a.bottom - a.top - 40 * a.u);
    const X = (p: number) => a.cx - s / 2 + p * s;
    const Y = (p: number) => a.top + 10 * a.u + p * s;
    if (this.state >= 1) {
      ctx.strokeStyle = COL_MID;
      ctx.lineWidth = 1.5 * v.dpr;
      const c = 9 * a.u;
      ctx.beginPath();
      ctx.moveTo(X(this.cross[0]) - c, Y(this.cross[1]));
      ctx.lineTo(X(this.cross[0]) + c, Y(this.cross[1]));
      ctx.moveTo(X(this.cross[0]), Y(this.cross[1]) - c);
      ctx.lineTo(X(this.cross[0]), Y(this.cross[1]) + c);
      ctx.stroke();
      this.dots.forEach((d, k) => {
        ctx.fillStyle = this.state === 2 && (k === 0 ? -1 : 1) === this.nearer ? (this.lastOk ? COL_LINE : COL_ACCENT) : COL_LINE;
        ctx.beginPath();
        ctx.arc(X(d[0]), Y(d[1]), 7 * a.u, 0, TAU);
        ctx.fill();
      });
    }
    note(v, a, `which dot is nearer the cross?  ${handLabel(this.env, -1)} the left one  ·  ${handLabel(this.env, 1)} the right one`);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const th = mean(this.levels.slice(-12));
    return {
      score: this.i >= 8 ? Math.max(0, Math.round((50 - th) * 15 + this.right * 3)) : 0,
      primary: { label: 'smallest difference you see', value: Math.round(th), unit: '%', lower: true },
      lines: [{ label: 'right', value: `${this.right} of ${this.i}` }],
      saved: this.i >= 10,
    };
  }
}

// --- Topple -------------------------------------------------------------------------

class Topple implements Mini {
  private env!: MiniEnv;
  private readonly total = scaled(24);
  private i = 0;
  /** Blocks bottom to top: centre x and width, in block heights. */
  private blocks: { x: number; w: number }[] = [];
  private falls = false;
  private state = 0;
  private at = 0;
  private shownAt = 0;
  private lastOk = true;
  private right = 0;
  private rts: number[] = [];
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 600);
  }

  private make(at: number): void {
    const n = rint(3, 4 + Math.min(2, Math.floor(this.i / 8)));
    this.blocks = [];
    let x = 0;
    for (let k = 0; k < n; k++) {
      const w = rnd(1.4, 3);
      if (k) x += rnd(-1.1, 1.1);
      this.blocks.push({ x, w });
    }
    // It falls if, at any level, the weight above sits beyond the edge of the block below.
    this.falls = false;
    for (let k = 1; k < n; k++) {
      const above = this.blocks.slice(k);
      const mass = above.reduce((s, b) => s + b.w, 0);
      const cx = above.reduce((s, b) => s + b.x * b.w, 0) / mass;
      const below = this.blocks[k - 1]!;
      if (Math.abs(cx - below.x) > below.w / 2) this.falls = true;
    }
    this.state = 0;
    this.at = at;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 1) return;
    const ok = (s > 0) === this.falls;
    this.lastOk = ok;
    if (ok) {
      this.right++;
      this.rts.push(ts - this.shownAt);
    }
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.i++;
    this.state = 2;
    this.at = ts + 900;
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) {
      this.state = 1;
      this.shownAt = now;
    } else if (this.state === 2 && now >= this.at) {
      if (this.i >= this.total) return true;
      this.make(now + 250);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'right', `${this.right} of ${this.i}`, 'stack', `${Math.min(this.i + 1, this.total)} / ${this.total}`);
    const bh = Math.min(34 * a.u, (a.bottom - a.top - 80 * a.u) / 7);
    const ground = a.bottom - 50 * a.u;
    ctx.fillStyle = COL_DIM;
    ctx.fillRect(a.cx - 200 * a.u, ground, 400 * a.u, v.dpr);
    if (this.state >= 1) {
      this.blocks.forEach((b, k) => {
        const y = ground - (k + 1) * bh;
        ctx.strokeStyle = this.state === 2 ? (this.falls ? COL_ACCENT : COL_LINE) : COL_LINE;
        ctx.lineWidth = 1.5 * v.dpr;
        ctx.strokeRect(a.cx + (b.x - b.w / 2) * bh, y, b.w * bh, bh - 2);
      });
    }
    if (this.state === 2) note(v, a, this.falls ? 'it falls' : 'it stands', this.lastOk ? COL_MID : COL_ACCENT);
    else note(v, a, `${handLabel(this.env, -1)} it stands  ·  ${handLabel(this.env, 1)} it falls   (blocks are solid and evenly heavy)`);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 25 + Math.max(0, Math.round(2000 - median(this.rts)) / 20),
      primary: { label: 'right', value: this.i ? Math.round((this.right / this.i) * 100) : 0, unit: '%' },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'median time to decide', value: this.rts.length ? `${Math.round(median(this.rts))} ms` : '–' },
      ],
      saved: this.i >= 6,
    };
  }
}

// --- Recall -------------------------------------------------------------------------

class Recall implements Mini {
  private env!: MiniEnv;
  private readonly lists = scaled(4);
  private l = 0;
  private words: string[] = [];
  private k = 0;
  private state = 0; // 0 showing, 1 typing, 2 feedback
  private at = 0;
  private typed = '';
  private got = new Set<string>();
  private wrong = 0;
  private scores: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 800);
  }

  private make(at: number): void {
    const n = 8 + Math.min(4, this.l * 2);
    this.words = shuffle(WORDS.filter((w) => w.length >= 4 && w.length <= 7)).slice(0, n).map((w) => w.toUpperCase());
    this.k = -1;
    this.state = 0;
    this.at = at;
    this.got.clear();
    this.typed = '';
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    if (code === 'Escape') return false;
    if (this.state !== 1) return true;
    if (code.startsWith('Key') && this.typed.length < 12) this.typed += code.slice(3);
    else if (code === 'Backspace') this.typed = this.typed.slice(0, -1);
    else if (code === 'Enter' || code === 'Space') {
      if (!this.typed) {
        if (code === 'Enter') this.finish(ts);
        return true;
      }
      if (this.words.includes(this.typed) && !this.got.has(this.typed)) {
        this.got.add(this.typed);
        this.env.sound(SND_CATCH);
      } else {
        this.wrong++;
        this.env.sound(SND_FALSE);
      }
      this.typed = '';
    }
    return true;
  }

  private finish(ts: number): void {
    this.scores.push(this.got.size);
    this.l++;
    this.state = 2;
    this.at = ts + 2200;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) {
      this.k++;
      if (this.k >= this.words.length) {
        this.state = 1;
        this.at = now + 60000;
      } else this.at = now + 1100;
    } else if (this.state === 1 && now >= this.at) this.finish(now);
    else if (this.state === 2 && now >= this.at) {
      if (this.l >= this.lists) return true;
      this.make(now + 500);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'remembered', String(this.got.size), 'list', `${Math.min(this.l + 1, this.lists)} / ${this.lists}`);
    if (this.state === 0) {
      ctx.fillStyle = COL_LINE;
      if (this.k >= 0 && (now - (this.at - 1100)) < 900) v.text(this.words[this.k] ?? '', a.cx, a.cy, v.fontBig, 'center');
      note(v, a, `remember every word  ·  ${Math.max(0, this.k + 1)} of ${this.words.length}`);
    } else if (this.state === 1) {
      ctx.fillStyle = COL_ACCENT;
      v.text(this.typed || '_', a.cx, a.top + 40 * a.u, v.fontBig, 'center');
      ctx.fillStyle = COL_LINE;
      [...this.got].forEach((w, i) => v.text(w, a.cx - 150 * a.u + (i % 3) * 150 * a.u, a.top + 110 * a.u + Math.floor(i / 3) * 30 * a.u, v.fontHud, 'center'));
      note(v, a, 'type each word you remember, then Space or Enter. Enter on its own when you are done');
    } else {
      ctx.fillStyle = COL_MID;
      this.words.forEach((w, i) => {
        ctx.fillStyle = this.got.has(w) ? COL_LINE : COL_DIM;
        v.text(w, a.cx - 150 * a.u + (i % 3) * 150 * a.u, a.top + 60 * a.u + Math.floor(i / 3) * 30 * a.u, v.fontHud, 'center');
      });
      note(v, a, `${this.got.size} of ${this.words.length}`);
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.scores);
    return {
      score: Math.max(0, Math.round(this.scores.reduce((s, x) => s + x, 0) * 25 - this.wrong * 5)),
      primary: { label: 'words remembered per list', value: Math.round(m * 10) / 10, unit: 'words', decimals: 1 },
      lines: [
        { label: 'lists', value: String(this.scores.length) },
        { label: 'words typed that were not there', value: String(this.wrong) },
      ],
      saved: this.scores.length >= 1,
    };
  }
}

// --- Queue --------------------------------------------------------------------------

const QSHAPES = [SHAPE_SQUARE, SHAPE_CIRCLE, SHAPE_TRIANGLE, SHAPE_DIAMOND, SHAPE_CROSS];

class Queue implements Mini {
  private env!: MiniEnv;
  private readonly total = scaled(14);
  private i = 0;
  private seq: { s: number; solid: boolean }[] = [];
  private k = 0;
  private ask = 0;
  private options: { s: number; solid: boolean }[] = [];
  private state = 0; // 0 showing, 1 answering, 2 feedback
  private at = 0;
  private lastOk = true;
  private right = 0;
  private byPos: [number, number][] = [];
  private rects: Rect[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 700);
  }

  private make(at: number): void {
    const n = 4 + Math.min(4, Math.floor(this.i / 3));
    this.seq = [];
    for (let j = 0; j < n; j++) {
      let it = { s: QSHAPES[rint(0, 4)]!, solid: Math.random() < 0.5 };
      while (this.seq.some((x) => x.s === it.s && x.solid === it.solid)) it = { s: QSHAPES[rint(0, 4)]!, solid: Math.random() < 0.5 };
      this.seq.push(it);
    }
    this.ask = rint(0, n - 1);
    const others = shuffle(this.seq.filter((_, j) => j !== this.ask)).slice(0, 3);
    this.options = shuffle([this.seq[this.ask]!, ...others]);
    this.k = -1;
    this.state = 0;
    this.at = at;
  }

  press(): void {}

  private choose(j: number, ts: number): void {
    if (this.state !== 1 || !this.options[j]) return;
    const o = this.options[j]!;
    const want = this.seq[this.ask]!;
    const ok = o.s === want.s && o.solid === want.solid;
    this.lastOk = ok;
    if (ok) this.right++;
    this.byPos.push([this.ask, ok ? 1 : 0]);
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.i++;
    this.state = 2;
    this.at = ts + 1200;
  }

  pointer(x: number, y: number, ts: number): void {
    const j = this.rects.findIndex((r) => inside(r, x, y));
    if (j >= 0) this.choose(j, ts);
  }

  typeKey(code: string, ts: number): boolean {
    const j = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(code);
    if (j < 0) return false;
    this.choose(j, ts);
    return true;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) {
      this.k++;
      if (this.k >= this.seq.length) this.state = 1;
      else this.at = now + 800;
    } else if (this.state === 2 && now >= this.at) {
      if (this.i >= this.total) return true;
      this.make(now + 300);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'right', `${this.right} of ${this.i}`, 'queue', `${Math.min(this.i + 1, this.total)} / ${this.total}`);
    const r = 22 * a.u;
    if (this.state === 0) {
      // Slots fill one at a time; each shape shows only while it is the newest.
      const n = this.seq.length;
      for (let j = 0; j < n; j++) {
        const x = a.cx + (j - (n - 1) / 2) * 60 * a.u;
        ctx.strokeStyle = COL_FAINT;
        ctx.lineWidth = v.dpr;
        ctx.strokeRect(x - 26 * a.u, a.cy - 26 * a.u, 52 * a.u, 52 * a.u);
        if (j === this.k && now < this.at - 200) {
          ctx.fillStyle = COL_LINE;
          ctx.strokeStyle = COL_LINE;
          v.shape(this.seq[j]!.s, x, a.cy, r, this.seq[j]!.solid);
        }
      }
      note(v, a, 'remember the order they arrive in');
    } else {
      ctx.fillStyle = COL_LINE;
      v.text(`which was number ${this.ask + 1}?`, a.cx, a.top + 40 * a.u, v.fontHud, 'center');
      this.rects = [];
      this.options.forEach((o, j) => {
        const x = a.cx + (j - 1.5) * 90 * a.u;
        this.rects.push([x - 36 * a.u, a.cy - 36 * a.u, 72 * a.u, 72 * a.u]);
        const want = this.seq[this.ask]!;
        const isAns = o.s === want.s && o.solid === want.solid;
        ctx.strokeStyle = this.state === 2 && isAns ? COL_LINE : COL_DIM;
        ctx.lineWidth = v.dpr;
        ctx.strokeRect(x - 36 * a.u, a.cy - 36 * a.u, 72 * a.u, 72 * a.u);
        ctx.fillStyle = COL_LINE;
        ctx.strokeStyle = COL_LINE;
        v.shape(o.s, x, a.cy, r, o.solid);
        ctx.fillStyle = COL_MID;
        v.text(String(j + 1), x, a.cy + 56 * a.u, v.fontTiny, 'center');
      });
      if (this.state === 2) note(v, a, this.lastOk ? 'right' : 'not that one', this.lastOk ? COL_MID : COL_ACCENT);
      else note(v, a, 'tap it, or press its number');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const early = this.byPos.filter(([p]) => p === 0);
    const mid = this.byPos.filter(([p]) => p > 0 && p < 3);
    return {
      score: this.right * 40,
      primary: { label: 'right', value: this.i ? Math.round((this.right / this.i) * 100) : 0, unit: '%' },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'first in the queue / middle', value: `${early.length ? pct(mean(early.map((x) => x[1]))) : '–'} / ${mid.length ? pct(mean(mid.map((x) => x[1]))) : '–'}` },
      ],
      saved: this.i >= 4,
    };
  }
}

// --- Beeps --------------------------------------------------------------------------

class Beeps implements Mini {
  private env!: MiniEnv;
  private readonly total = scaled(12);
  private i = 0;
  private beeps: number[] = [];
  private flashes: number[] = [];
  private t0 = 0;
  private state = 0; // 0 playing, 1 answering, 2 feedback
  private at = 0;
  private typed = '';
  private keys: [number, number, number, number, string][] = [];
  private right = 0;
  private lastOk = true;
  private fired = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 800, now);
  }

  private make(at: number, now: number): void {
    const nb = rint(2, 4 + Math.min(4, Math.floor(this.i / 3)));
    let nf = nb + rint(-2, 2);
    if (nf < 1) nf = 1;
    const gap = 160 + rint(0, 120);
    this.beeps = [...Array(nb).keys()].map((k) => k * gap);
    this.flashes = [...Array(nf).keys()].map((k) => k * gap * (nb / Math.max(1, nf)) + 20);
    this.t0 = at;
    this.fired = 0;
    this.state = 0;
    this.typed = '';
    if (this.env.soundAt && !this.env.muted) for (const b of this.beeps) this.env.soundAt(SND_BEAT, at - now + b);
  }

  press(): void {}

  private key(d: string, ts: number): void {
    if (this.state !== 1) return;
    if (d === '<') this.typed = this.typed.slice(0, -1);
    else if (d === 'ok') {
      if (!this.typed) return;
      const ok = Number(this.typed) === this.beeps.length;
      this.lastOk = ok;
      if (ok) this.right++;
      this.env.sound(ok ? SND_CATCH : SND_FALSE);
      this.i++;
      this.state = 2;
      this.at = ts + 1200;
    } else if (this.typed.length < 1) this.typed = d;
  }

  pointer(x: number, y: number, ts: number): void {
    const k = this.keys.find((r) => inside([r[0], r[1], r[2], r[3]], x, y));
    if (k) this.key(k[4], ts);
  }

  typeKey(code: string, ts: number): boolean {
    if (code.startsWith('Digit')) this.key(code.slice(5), ts);
    else if (code === 'Backspace') this.key('<', ts);
    else if (code === 'Enter') this.key('ok', ts);
    else return false;
    return true;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const t = now - this.t0;
    if (this.state === 0) {
      if (!this.env.soundAt || this.env.muted) while (this.fired < this.beeps.length && this.beeps[this.fired]! <= t) {
        this.env.sound(SND_BEAT);
        this.fired++;
      }
      if (t > Math.max(...this.beeps, ...this.flashes) + 500) this.state = 1;
    } else if (this.state === 2 && now >= this.at) {
      if (this.i >= this.total) return true;
      this.make(now + 600, now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'right', `${this.right} of ${this.i}`, 'round', `${Math.min(this.i + 1, this.total)} / ${this.total}`);
    if (this.state === 0) {
      const lit = this.flashes.some((f) => t >= f && t < f + 60);
      ctx.fillStyle = lit ? COL_LINE : COL_FAINT;
      ctx.beginPath();
      ctx.arc(a.cx, a.top + 90 * a.u, 30 * a.u, 0, TAU);
      ctx.fill();
      note(v, a, this.env.muted ? 'sound is off: turn it on for this one' : 'count the beeps, not the flashes');
    } else {
      ctx.fillStyle = this.state === 2 && !this.lastOk ? COL_ACCENT : COL_LINE;
      v.text(this.state === 1 ? this.typed || '?' : String(this.beeps.length), a.cx, a.top + 40 * a.u, v.fontBig, 'center');
      ctx.fillStyle = COL_MID;
      v.text(this.state === 1 ? 'how many beeps? then ok' : this.lastOk ? 'right' : `there were ${this.beeps.length} beeps and ${this.flashes.length} flashes`, a.cx, a.top + 80 * a.u, v.fontTiny, 'center');
      this.keys = keypad(v, a.cx, a.bottom - 6 * a.u, a.u, this.state === 1);
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 50,
      primary: { label: 'beeps counted right', value: this.i ? Math.round((this.right / this.i) * 100) : 0, unit: '%' },
      lines: [{ label: 'right', value: `${this.right} of ${this.i}` }],
      saved: this.i >= 4,
    };
  }
}

// --- Sounds -------------------------------------------------------------------------

class Sounds implements Mini {
  private env!: MiniEnv;
  private readonly boards = scaled(2);
  private b = 0;
  private tones: number[] = [];
  private found: boolean[] = [];
  private open: number[] = [];
  private flips = 0;
  private flipCounts: number[] = [];
  private rects: Rect[] = [];
  private state = 0;
  private at = 0;
  private lit = -1;
  private litAt = 0;
  private boardAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now);
  }

  private make(now: number): void {
    this.boardAt = now;
    const pairs = 6 + this.b * 2;
    const scale = [262, 294, 330, 392, 440, 523, 587, 659, 784, 880];
    this.tones = shuffle([...Array(pairs).keys(), ...Array(pairs).keys()]).map((k) => scale[k]!);
    this.found = this.tones.map(() => false);
    this.open = [];
    this.flips = 0;
    this.state = 0;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 0) return;
    const k = this.rects.findIndex((r) => inside(r, x, y));
    if (k < 0 || this.found[k] || this.open.includes(k)) return;
    if (this.open.length === 2) this.open = [];
    this.open.push(k);
    this.flips++;
    this.lit = k;
    this.litAt = ts;
    if (this.env.tone && !this.env.muted) this.env.tone(this.tones[k]!, 380);
    else this.env.sound(SND_TAP_WEAK);
    if (this.open.length === 2) {
      const [p, q] = this.open as [number, number];
      if (this.tones[p] === this.tones[q]) {
        this.found[p] = true;
        this.found[q] = true;
        this.open = [];
        setTimeout(() => this.env.sound(SND_CATCH), 420);
        if (this.found.every((f) => f)) {
          this.flipCounts.push(this.flips / (this.tones.length / 2));
          this.b++;
          this.state = 1;
          this.at = ts + 1200;
        }
      }
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    // A board left too long moves on unfinished.
    if (this.state === 0 && now - this.boardAt > 150000) {
      this.b++;
      this.state = 1;
      this.at = now + 600;
    }
    if (this.state === 1 && now >= this.at) {
      if (this.b >= this.boards) return true;
      this.make(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'flips', String(this.flips), 'board', `${Math.min(this.b + 1, this.boards)} / ${this.boards}`);
    const n = this.tones.length;
    const cols = 4;
    const rows = Math.ceil(n / cols);
    const cell = Math.min(80 * a.u, (a.bottom - a.top - 40 * a.u) / rows, (a.right - a.left) / cols);
    this.rects = [];
    for (let k = 0; k < n; k++) {
      const x = a.cx - (cols * cell) / 2 + (k % cols) * cell;
      const y = a.top + 10 * a.u + Math.floor(k / cols) * cell;
      this.rects.push([x, y, cell, cell]);
      const isOpen = this.open.includes(k);
      ctx.strokeStyle = this.found[k] ? COL_FAINT : isOpen ? COL_ACCENT : COL_DIM;
      ctx.lineWidth = v.dpr;
      ctx.strokeRect(x + 4, y + 4, cell - 8, cell - 8);
      if (isOpen || (k === this.lit && now - this.litAt < 300)) {
        // A little bar shows the pitch while it plays, so it is not by ear alone at first.
        const h = ((this.tones[k]! - 240) / 680) * (cell - 20);
        ctx.fillStyle = this.b === 0 ? COL_MID : COL_FAINT;
        ctx.fillRect(x + cell / 2 - 4, y + cell - 10 - h, 8, h);
      }
    }
    if (this.env.muted) note(v, a, 'sound is off: turn it on for this one');
    else note(v, a, this.b === 0 ? 'tap a tile to hear it; find the pairs with the same tone' : 'by ear alone now');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.flipCounts);
    return {
      score: this.flipCounts.length ? Math.max(0, Math.round((5 - m) * 150 * this.flipCounts.length)) : 0,
      primary: { label: 'flips per pair', value: Math.round(m * 100) / 100, unit: '', lower: true, decimals: 2 },
      lines: [{ label: 'boards cleared', value: String(this.flipCounts.length) }],
      saved: this.flipCounts.length >= 1,
    };
  }
}

// --- Tune ---------------------------------------------------------------------------

class Tune implements Mini {
  private env!: MiniEnv;
  private readonly total = scaled(10);
  private i = 0;
  private target = 440;
  /** Your tone, in cents from the target. */
  private cents = 0;
  private state = 0; // 0 play target, 1 adjusting, 2 feedback
  private at = 0;
  private errs: number[] = [];
  private lastPlay = 0;
  private held = 0;
  private bothAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 600);
  }

  private make(at: number): void {
    this.target = 330 * 2 ** (rnd(0, 12) / 12);
    this.cents = (Math.random() < 0.5 ? -1 : 1) * rnd(150, 400);
    this.state = 0;
    this.at = at;
  }

  private hz(): number {
    return this.target * 2 ** (this.cents / 1200);
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 1) return;
    const l = (this.held & 0b111) !== 0;
    const r = (this.held & 0b111000) !== 0;
    if (l && r) {
      // Both hands: lock it in.
      this.bothAt = ts;
      this.errs.push(Math.abs(this.cents));
      this.env.sound(Math.abs(this.cents) < 15 ? SND_CATCH : SND_TAP_WEAK);
      this.i++;
      this.state = 2;
      this.at = ts + 1400;
      return;
    }
    this.cents += s * (Math.abs(this.cents) > 60 ? 25 : 6);
    this.env.tone?.(this.hz(), 260);
    this.env.sound(s < 0 ? SND_TAP_L : SND_TAP_R);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) {
      this.env.tone?.(this.target, 600);
      this.state = 1;
      this.lastPlay = now;
      setTimeout(() => this.env.tone?.(this.hz(), 600), 800);
    } else if (this.state === 1 && now - this.lastPlay > 4000) {
      // Replay the pair every few seconds.
      this.lastPlay = now;
      this.env.tone?.(this.target, 500);
      setTimeout(() => this.state === 1 && this.env.tone?.(this.hz(), 500), 700);
    } else if (this.state === 2 && now >= this.at) {
      if (this.i >= this.total) return true;
      this.make(now + 300);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'off by', this.errs.length ? `${Math.round(this.errs[this.errs.length - 1]!)} cents` : '–', 'tone', `${Math.min(this.i + 1, this.total)} / ${this.total}`);
    ctx.fillStyle = COL_FAINT;
    ctx.beginPath();
    ctx.arc(a.cx, a.cy - 20 * a.u, 40 * a.u, 0, TAU);
    ctx.fill();
    if (this.state === 2) {
      ctx.fillStyle = COL_LINE;
      v.text(`${Math.round(Math.abs(this.cents))} cents ${this.cents > 0 ? 'sharp' : 'flat'}`, a.cx, a.cy + 60 * a.u, v.fontHud, 'center');
    }
    note(v, a, this.env.muted ? 'sound is off: turn it on for this one' : `match the second tone to the first:  ${handLabel(this.env, -1)} lower  ·  ${handLabel(this.env, 1)} higher  ·  both together to lock it in`);
    footer(v, touch, this.held);
    void this.bothAt;
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.max(0, Math.round((100 - m) * 8)) : 0,
      primary: { label: 'average miss', value: Math.round(m), unit: 'cents', lower: true, zeroOk: true },
      lines: [
        { label: 'within 15 cents', value: pct(this.errs.filter((e) => e < 15).length / (this.errs.length || 1)) },
        { label: 'a semitone is', value: '100 cents' },
      ],
      saved: this.errs.length >= 3,
    };
  }
}

// --- Pattern ------------------------------------------------------------------------

class Pattern implements Mini {
  private env!: MiniEnv;
  private readonly total = scaled(12);
  private i = 0;
  /** Each item: rotation (deg), size (0..1), shade (solid?), count. */
  private seq: { rot: number; size: number; solid: boolean; count: number }[] = [];
  private options: { rot: number; size: number; solid: boolean; count: number }[] = [];
  private answer = 0;
  private state = 0;
  private at = 0;
  private shownAt = 0;
  private lastOk = true;
  private right = 0;
  private rts: number[] = [];
  private rects: Rect[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.make(now + 600);
  }

  private make(at: number): void {
    // One to three things change at a steady step across four items.
    const rules = shuffle(['rot', 'size', 'shade', 'count']).slice(0, 1 + Math.min(2, Math.floor(this.i / 4)));
    const dRot = rules.includes('rot') ? pickOf([45, 90, -45, 30]) : 0;
    const dSize = rules.includes('size') ? pickOf([0.15, -0.15]) : 0;
    const alt = rules.includes('shade');
    const dCount = rules.includes('count') ? 1 : 0;
    const base = { rot: rint(0, 3) * 30, size: dSize < 0 ? 0.95 : 0.4, solid: Math.random() < 0.5, count: 1 };
    const at5 = (k: number) => ({ rot: base.rot + dRot * k, size: base.size + dSize * k, solid: alt ? (k % 2 === 0) === base.solid : base.solid, count: base.count + dCount * k });
    this.seq = [0, 1, 2, 3].map(at5);
    const right = at5(4);
    const wrongs = [
      { ...right, rot: right.rot + (dRot || 45) },
      { ...right, solid: !right.solid },
      { ...right, size: Math.max(0.3, Math.min(1, right.size + (dSize ? -dSize : 0.25))) },
      { ...right, count: Math.max(1, right.count + (dCount ? -1 : 1)) },
    ];
    this.options = shuffle([right, ...shuffle(wrongs).slice(0, 3)]);
    this.answer = this.options.indexOf(right);
    this.state = 0;
    this.at = at;
  }

  press(): void {}

  private choose(j: number, ts: number): void {
    if (this.state !== 1 || !this.options[j]) return;
    const ok = j === this.answer;
    this.lastOk = ok;
    if (ok) {
      this.right++;
      this.rts.push(ts - this.shownAt);
    }
    this.env.sound(ok ? SND_CATCH : SND_FALSE);
    this.i++;
    this.state = 2;
    this.at = ts + 1100;
  }

  pointer(x: number, y: number, ts: number): void {
    const j = this.rects.findIndex((r) => inside(r, x, y));
    if (j >= 0) this.choose(j, ts);
  }

  typeKey(code: string, ts: number): boolean {
    const j = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(code);
    if (j < 0) return false;
    this.choose(j, ts);
    return true;
  }

  private drawItem(v: View, x: number, y: number, s: number, it: { rot: number; size: number; solid: boolean; count: number }): void {
    const ctx = v.ctx;
    const r = s * 0.32 * it.size;
    for (let c = 0; c < it.count; c++) {
      const ox = (c - (it.count - 1) / 2) * r * 1.3;
      ctx.save();
      ctx.translate(x + ox, y);
      ctx.rotate((it.rot * Math.PI) / 180);
      ctx.fillStyle = COL_LINE;
      ctx.strokeStyle = COL_LINE;
      ctx.lineWidth = 1.5 * v.dpr;
      v.shape(SHAPE_TRIANGLE, 0, 0, r / Math.max(1, it.count * 0.6), it.solid);
      ctx.restore();
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at) {
      this.state = 1;
      this.shownAt = now;
    } else if (this.state === 2 && now >= this.at) {
      if (this.i >= this.total) return true;
      this.make(now + 250);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'right', `${this.right} of ${this.i}`, 'puzzle', `${Math.min(this.i + 1, this.total)} / ${this.total}`);
    const s = Math.min(110 * a.u, (a.right - a.left) / 5.5);
    const y1 = a.top + s * 0.8;
    if (this.state >= 1) {
      for (let k = 0; k < 5; k++) {
        const x = a.cx + (k - 2) * s * 1.05;
        ctx.strokeStyle = k === 4 ? COL_ACCENT : COL_FAINT;
        ctx.lineWidth = v.dpr;
        ctx.strokeRect(x - s / 2, y1 - s / 2, s, s);
        if (k < 4) this.drawItem(v, x, y1, s, this.seq[k]!);
        else {
          ctx.fillStyle = COL_ACCENT;
          v.text('?', x, y1 + 8 * v.dpr, v.fontHud, 'center');
        }
      }
      this.rects = [];
      const y2 = a.cy + s * 0.9;
      this.options.forEach((o, j) => {
        const x = a.cx + (j - 1.5) * s * 1.15;
        this.rects.push([x - s / 2, y2 - s / 2, s, s]);
        ctx.strokeStyle = this.state === 2 && j === this.answer ? COL_LINE : COL_DIM;
        ctx.lineWidth = v.dpr;
        ctx.strokeRect(x - s / 2, y2 - s / 2, s, s);
        this.drawItem(v, x, y2, s, o);
        ctx.fillStyle = COL_MID;
        v.text(String(j + 1), x, y2 + s / 2 + 18 * a.u, v.fontTiny, 'center');
      });
    }
    note(v, a, this.state === 2 ? (this.lastOk ? 'right' : 'not that one') : 'which comes next? tap it or press 1 to 4', this.state === 2 && !this.lastOk ? COL_ACCENT : COL_MID);
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.right * 40 + Math.max(0, Math.round((8000 - median(this.rts)) / 100)),
      primary: { label: 'right', value: this.i ? Math.round((this.right / this.i) * 100) : 0, unit: '%' },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'median time to answer', value: this.rts.length ? `${(median(this.rts) / 1000).toFixed(1)} s` : '–' },
      ],
      saved: this.i >= 4,
    };
  }
}

function pickOf<T>(a: readonly T[]): T {
  return a[Math.floor(Math.random() * a.length)]!;
}

export const BATCH26: MiniDef[] = [
  { id: 'angle', name: 'Angle', skill: 'judgement', blurb: 'How wide is this angle? Mark it on a 0 to 180 scale.', how: 'Two lines meet at an angle, turned any way. Tap the scale below where you think its size is, from 0° to 180°. The results show whether you tend to guess wide or narrow.', input: 'pointer', make: () => new Angle() },
  { id: 'duration', name: 'Duration', skill: 'judgement', blurb: 'How long was the disc on screen? Mark it on a time scale.', how: 'A disc appears for a while, from a quarter of a second to over two. Then tap the scale where you think its time was. Your sense of time, not counting.', input: 'pointer', make: () => new Duration() },
  { id: 'centroid', name: 'Centroid', skill: 'judgement', blurb: 'Tap the balance point of a cloud of dots.', how: 'A handful of dots appears. Tap the point where they would balance: the average of their positions. The clouds are lopsided on purpose.', input: 'pointer', make: () => new Centroid() },
  { id: 'align', name: 'Align', skill: 'judgement', blurb: 'Turn your line until it is parallel to the other, then let go.', how: 'Two lines: grey on the left, orange on the right. Hold the left hand or right hand to turn the orange line. When you think it is parallel to the grey one, let go: after most of a second it locks in. Scored in degrees off.', input: 'keys', minKeys: 2, make: () => new Align() },
  { id: 'closer', name: 'Closer', skill: 'judgement', blurb: 'Which dot is nearer the cross?', how: 'A cross and two dots, one on each side. Press the hand on the side of the dot that is nearer the cross. Get it right and the distances get closer; the score is the smallest difference you can see.', input: 'keys', minKeys: 2, make: () => new Closer() },
  { id: 'topple', name: 'Topple', skill: 'judgement', blurb: 'Will this stack of blocks stand or fall?', how: 'A stack of blocks, each offset from the one below. Left hand if it stands, right hand if it falls. A stack falls when the weight above any block sits beyond that block’s edge. Blocks are solid and equally dense.', input: 'keys', minKeys: 2, make: () => new Topple() },
  { id: 'recall', name: 'Recall', skill: 'memory', blurb: 'Words go by one at a time. Type every one you remember.', how: 'Eight words or more appear one at a time. Then type every one you remember, in any order: each word then Space or Enter. Enter on its own when you are done. Lists get longer. Needs a keyboard.', input: 'type', make: () => new Recall() },
  { id: 'queue', name: 'Queue', skill: 'memory', blurb: 'Shapes join a queue one at a time. Which was third?', how: 'Shapes arrive one at a time into a row of slots, each shown only while it is the newest. Then you are asked which one was in a given place: tap it from four choices or press its number. Queues get longer.', input: 'pointer', make: () => new Queue() },
  { id: 'beeps', name: 'Beeps', skill: 'attention', blurb: 'Count the beeps. The flashes are there to mislead you.', how: 'A few quick beeps play while a disc flashes, often a different number of times. Count the beeps only, then type how many (keypad or number keys, then ok or Enter). Needs sound on.', input: 'pointer', make: () => new Beeps() },
  { id: 'sounds', name: 'Sounds', skill: 'memory', blurb: 'Tiles hide tones. Find the matching pairs by ear.', how: 'Each tile plays a tone when you tap it; every tone is on two tiles. Turn tiles two at a time and find the pairs. The first board shows a pitch bar as a hint; after that it is by ear alone. Fewer flips is better. Needs sound on.', input: 'pointer', make: () => new Sounds() },
  { id: 'tune', name: 'Tune', skill: 'ear', blurb: 'Nudge a tone up or down until it matches the first.', how: 'Two tones play: a target, then yours, which is off. Press the left hand to lower yours and the right to raise it; each press plays it. When they sound the same, press both hands together to lock it in. Scored in cents (a semitone is 100). Needs sound on.', input: 'keys', minKeys: 2, make: () => new Tune() },
  { id: 'pattern', name: 'Pattern', skill: 'reasoning', blurb: 'A shape changes step by step. Which comes next?', how: 'Four boxes show a shape changing by steady steps: turning, growing or shrinking, switching shade, or multiplying. Pick the fifth from four choices (tap or press 1 to 4). More things change at once as you go.', input: 'pointer', make: () => new Pattern() },
];
