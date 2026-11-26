// Thirty-eighth batch.
//   Reflect  - trace a star while the pen moves as in a mirror.
//   Sevens   - count back from a number in sevens, as fast as you can.
//   Hands    - an analog clock flashes. What time was it?
//   Meter    - read a needle on a scale, between the marks.
//   Symmetry - half a pattern: complete its mirror image.

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { arena, footer, header, mean, median, ms, pct, scaled, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rint = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));
type Rect = [number, number, number, number];
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];

/** Digits typed into a short answer box, shared by the typing drills here. */
function digitOf(code: string): string {
  return code.startsWith('Digit') ? code.slice(5) : code.startsWith('Numpad') ? code.slice(6) : '';
}

// --- Reflect (mirror tracing) ----------------------------------------------------------

const REFLECT_STARS = 2;

class Reflect implements Mini {
  private env!: MiniEnv;
  private star: [number, number][] = [];
  private cum: number[] = [];
  private band = 0;
  private cx = 0;
  private cy = 0;
  private pen: [number, number] | null = null;
  private trail: [number, number][] = [];
  private started = false;
  private t0 = 0;
  private progress = 0;
  private outside = false;
  private faults = 0;
  private starFaults = 0;
  private stars = 0;
  private times: number[] = [];
  private flip: 'x' | 'y' = 'x';
  private built = false;
  private nextAt = 0;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  private build(cx: number, cy: number, R: number, u: number): void {
    // A six-pointed star, traced from its top point clockwise.
    this.cx = cx;
    this.cy = cy;
    this.star = [];
    for (let k = 0; k <= 12; k++) {
      const r = k % 2 === 0 ? R : R * 0.5;
      const t = -Math.PI / 2 + (k * Math.PI) / 6;
      this.star.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
    }
    this.cum = [0];
    for (let i = 1; i < this.star.length; i++) this.cum.push(this.cum[i - 1]! + Math.hypot(this.star[i]![0] - this.star[i - 1]![0], this.star[i]![1] - this.star[i - 1]![1]));
    this.band = 11 * u;
    this.progress = 0;
    this.trail = [];
    this.started = false;
    this.starFaults = 0;
    this.flip = this.stars % 2 === 0 ? 'x' : 'y';
    this.built = true;
  }

  /** The pen is the pointer reflected across the star's centre line. */
  private mirror(x: number, y: number): [number, number] {
    return this.flip === 'x' ? [2 * this.cx - x, y] : [x, 2 * this.cy - y];
  }

  private nearest(x: number, y: number): { d: number; along: number } {
    let best = { d: Infinity, along: 0 };
    for (let i = 1; i < this.star.length; i++) {
      const [ax, ay] = this.star[i - 1]!;
      const [bx, by] = this.star[i]!;
      const vx = bx - ax;
      const vy = by - ay;
      const l2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l2));
      const d = Math.hypot(x - (ax + vx * t), y - (ay + vy * t));
      if (d < best.d) best = { d, along: this.cum[i - 1]! + t * Math.sqrt(l2) };
    }
    return best;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (ts < this.nextAt) return;
    const p = this.mirror(x, y);
    this.pen = p;
    const [sx, sy] = this.star[0]!;
    if (!this.started && Math.hypot(p[0] - sx, p[1] - sy) < this.band * 1.6) {
      this.started = true;
      this.t0 = ts;
      this.env.sound(SND_TAP_WEAK);
    }
  }

  pointerMove(x: number, y: number, ts: number): void {
    const p = this.mirror(x, y);
    this.pen = p;
    if (!this.started || ts < this.nextAt) return;
    this.trail.push(p);
    if (this.trail.length > 2000) this.trail.shift();
    const n = this.nearest(p[0], p[1]);
    const out = n.d > this.band;
    if (out && !this.outside) {
      this.faults++;
      this.starFaults++;
      this.env.sound(SND_FALSE);
    }
    this.outside = out;
    if (!out && n.along > this.progress && n.along - this.progress < 50) this.progress = n.along;
    if (this.progress >= this.cum[this.cum.length - 1]! - 6) {
      this.times.push((ts - this.t0) / 1000 + this.starFaults);
      this.stars++;
      this.env.sound(SND_CATCH);
      this.built = false;
      this.nextAt = ts + 900;
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    if (this.stars >= scaled(REFLECT_STARS) && now >= this.nextAt) return true;
    if (now - this.firstFrame > 300000) return true;
    const a = arena(v, touch);
    if (!this.built && now >= this.nextAt) this.build(a.cx, a.cy, Math.min(a.bottom - a.top, a.right - a.left) * 0.42, a.u);
    v.clear();
    const ctx = v.ctx;
    const dpr = v.dpr;
    const total = this.times.reduce((s, t) => s + t, 0);
    header(v, touch, 'time', this.started ? `${((now - this.t0) / 1000 + this.starFaults).toFixed(1)} s` : `${total.toFixed(1)} s`, 'star', `${Math.min(this.stars + 1, scaled(REFLECT_STARS))} / ${scaled(REFLECT_STARS)}  ·  ${this.faults} out`);
    // The band to stay inside: two outlines of the star.
    ctx.strokeStyle = COL_FAINT;
    ctx.lineWidth = this.band * 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    this.star.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.strokeStyle = COL_DIM;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    this.star.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    // Your trace.
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    this.trail.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    const [sx, sy] = this.star[0] ?? [0, 0];
    ctx.fillStyle = this.started ? COL_DIM : COL_LINE;
    ctx.beginPath();
    ctx.arc(sx, sy, 6 * dpr, 0, TAU);
    ctx.fill();
    if (this.pen) {
      ctx.fillStyle = this.outside ? COL_MID : COL_ACCENT;
      ctx.beginPath();
      ctx.arc(this.pen[0], this.pen[1], 5 * dpr, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = COL_MID;
    v.text(this.started ? `the pen moves as in a mirror (${this.flip === 'x' ? 'left and right swapped' : 'up and down swapped'}): go once round the star` : 'move the pen (orange) to the white dot at the top and click to start', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const total = this.times.reduce((s, t) => s + t, 0);
    return {
      score: this.times.length ? Math.round(Math.max(0, 240 - total) * 5) : 0,
      primary: { label: 'time, plus 1 s for each slip out', value: this.times.length ? total + (scaled(REFLECT_STARS) - this.times.length) * 60 : 0, unit: 's', lower: true, decimals: 1 },
      lines: [
        { label: 'stars traced', value: `${this.times.length} of ${scaled(REFLECT_STARS)}` },
        { label: 'slips out of the band', value: String(this.faults) },
        { label: 'each star', value: this.times.map((t) => `${t.toFixed(1)} s`).join('  ·  ') || '–' },
      ],
      saved: this.times.length >= 1,
    };
  }
}

// --- Sevens ----------------------------------------------------------------------------

const SEVENS_MS = 60000;

class Sevens implements Mini {
  private env!: MiniEnv;
  private start0 = 0;
  private cur = 0;
  private step = 7;
  private typed = '';
  private right = 0;
  private wrong = 0;
  private t0 = 0;
  private started = false;
  private lastAt = 0;
  private gaps: number[] = [];
  private flash = 0;
  private flashOk = true;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
    this.start0 = rint(300, 999);
    this.cur = this.start0;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const d = digitOf(code);
    if (!this.started && d) {
      this.started = true;
      this.t0 = ts;
      this.lastAt = ts;
    }
    if (d) {
      if (this.typed.length < 4) this.typed += d;
      // Answers check themselves once they are as long as the right one.
      const want = String(this.cur - this.step);
      if (this.typed.length >= want.length) this.check(ts);
      return true;
    }
    if (code === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      return true;
    }
    return false;
  }

  private check(ts: number): void {
    const want = this.cur - this.step;
    const ok = Number(this.typed) === want;
    this.flash = ts + 250;
    this.flashOk = ok;
    if (ok) {
      this.right++;
      this.gaps.push(ts - this.lastAt);
      this.lastAt = ts;
      this.cur = want;
      this.env.sound(SND_TAP_WEAK);
      // Near zero, start again from a fresh number.
      if (this.cur < this.step) {
        this.cur = rint(300, 999);
      }
    } else {
      this.wrong++;
      this.env.sound(SND_FALSE);
    }
    this.typed = '';
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    const len = scaled(SEVENS_MS);
    if (this.started && now - this.t0 >= len) return true;
    if (!this.started && now - this.firstFrame > 120000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const left = this.started ? Math.max(0, Math.ceil((len - (now - this.t0)) / 1000)) : Math.round(len / 1000);
    header(v, touch, 'right', String(this.right), 'time', `${left} s`);
    ctx.font = `600 ${Math.round(72 * a.u)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COL_LINE;
    ctx.fillText(String(this.cur), a.cx, a.cy - 50 * a.u);
    ctx.fillStyle = COL_MID;
    v.text(`minus ${this.step}`, a.cx, a.cy + 6 * a.u, v.fontTiny, 'center');
    ctx.font = `600 ${Math.round(44 * a.u)}px ui-monospace, 'JetBrains Mono', Menlo, monospace`;
    ctx.fillStyle = now < this.flash ? (this.flashOk ? COL_LINE : COL_ACCENT) : COL_LINE;
    ctx.fillText(this.typed || '_', a.cx, a.cy + 60 * a.u);
    if (!this.started) {
      ctx.fillStyle = COL_MID;
      v.text('count back in sevens: type each answer (it checks itself). the clock starts with your first digit', a.cx, a.bottom - 6 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: Math.max(0, this.right * 20 - this.wrong * 10),
      primary: { label: 'right in a minute', value: this.right, unit: '' },
      lines: [
        { label: 'right', value: String(this.right) },
        { label: 'wrong', value: String(this.wrong) },
        { label: 'typical time a step', value: this.gaps.length ? ms(median(this.gaps)) : '–' },
      ],
      saved: this.right + this.wrong >= 3,
    };
  }
}

// --- Hands (read an analog clock) -------------------------------------------------------

const HANDS_ROUNDS = 12;

class Hands implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private h = 0;
  private m = 0;
  private state = 0; // 0 showing, 1 typing, 2 feedback
  private at = 0;
  private flashMs = 2500;
  private typed = '';
  private errs: number[] = [];
  private rts: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 500);
  }

  private arm(at: number): void {
    this.h = rint(1, 12);
    this.m = this.round < 3 ? rint(0, 11) * 5 : rint(0, 59);
    this.flashMs = Math.max(700, 2500 - this.round * 160);
    this.typed = '';
    this.state = 0;
    this.at = at;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const d = digitOf(code);
    if (this.state !== 1 && this.state !== 0) return !!d;
    if (d) {
      if (this.state === 0 && ts >= this.at) this.state = 1;
      if (this.typed.length < 4) this.typed += d;
      if (this.typed.length === 4 || (this.typed.length === 3 && Number(this.typed[0]) >= 2)) this.check(ts);
      return true;
    }
    if (code === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      return true;
    }
    if ((code === 'Enter' || code === 'NumpadEnter') && this.typed.length >= 3) {
      this.check(ts);
      return true;
    }
    return false;
  }

  private check(ts: number): void {
    const t = this.typed;
    const hh = Number(t.length === 3 ? t.slice(0, 1) : t.slice(0, 2));
    const mm = Number(t.slice(-2));
    const said = ((hh % 12) * 60 + mm) % 720;
    const truth = ((this.h % 12) * 60 + this.m) % 720;
    let e = Math.abs(said - truth);
    e = Math.min(e, 720 - e);
    this.errs.push(e);
    this.rts.push(ts - this.at);
    this.env.sound(e === 0 ? SND_CATCH : e <= 2 ? SND_TAP_WEAK : SND_FALSE);
    this.round++;
    this.state = 2;
    this.at = ts + 1400;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 0 && now >= this.at + this.flashMs) this.state = 1;
    if (this.state === 2 && now >= this.at) {
      if (this.round >= scaled(HANDS_ROUNDS)) return true;
      this.arm(now + 400);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'off by', this.errs.length ? `${mean(this.errs.slice(-3)).toFixed(1)} min` : '–', 'clock', `${Math.min(this.round + 1, scaled(HANDS_ROUNDS))} / ${scaled(HANDS_ROUNDS)}`);
    const R = Math.min((a.bottom - a.top) / 2 - 40 * a.u, 130 * a.u);
    const cx = a.cx;
    const cy = a.cy - 20 * a.u;
    ctx.strokeStyle = COL_MID;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();
    // Hour marks only: no numbers, no minute ticks, as on many real clocks.
    for (let k = 0; k < 12; k++) {
      const t = (k / 12) * TAU;
      ctx.lineWidth = (k % 3 === 0 ? 4 : 2) * dpr;
      ctx.beginPath();
      ctx.moveTo(cx + Math.sin(t) * R * 0.86, cy - Math.cos(t) * R * 0.86);
      ctx.lineTo(cx + Math.sin(t) * R * 0.98, cy - Math.cos(t) * R * 0.98);
      ctx.stroke();
    }
    if (this.state === 0 && now >= this.at || this.state === 2) {
      const ha = ((this.h % 12) + this.m / 60) / 12 * TAU;
      const ma = (this.m / 60) * TAU;
      ctx.strokeStyle = COL_LINE;
      ctx.lineCap = 'round';
      ctx.lineWidth = 6 * dpr;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.sin(ha) * R * 0.5, cy - Math.cos(ha) * R * 0.5);
      ctx.stroke();
      ctx.lineWidth = 3 * dpr;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.sin(ma) * R * 0.82, cy - Math.cos(ma) * R * 0.82);
      ctx.stroke();
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.arc(cx, cy, 5 * dpr, 0, TAU);
      ctx.fill();
    }
    const t = this.typed.padEnd(4, '_');
    ctx.fillStyle = COL_LINE;
    v.text(this.state === 2 ? `it was ${this.h}:${String(this.m).padStart(2, '0')}` : `${t.slice(0, t.length - 2)}:${t.slice(-2)}`, a.cx, cy + R + 40 * a.u, v.fontHud, 'center');
    ctx.fillStyle = COL_MID;
    if (this.round === 0 && this.state <= 1) v.text('type the time it showed, like 4 then 37 for 4:37', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.round(Math.max(0, 15 - m) * 60 + this.errs.filter((e) => e === 0).length * 20) : 0,
      primary: { label: 'average miss', value: m, unit: 'min', lower: true, zeroOk: true, decimals: 1 },
      lines: [
        { label: 'exactly right', value: `${this.errs.filter((e) => e === 0).length} of ${this.errs.length}` },
        { label: 'within 2 minutes', value: this.errs.length ? pct(this.errs.filter((e) => e <= 2).length / this.errs.length) : '–' },
        { label: 'typical time to answer', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.errs.length >= 3,
    };
  }
}

// --- Meter (read a scale) --------------------------------------------------------------

const METER_ROUNDS = 12;

class Meter implements Mini {
  private env!: MiniEnv;
  private round = 0;
  private lo = 0;
  private hi = 100;
  private major = 10;
  private minor = 5;
  private value = 0;
  private state = 0;
  private at = 0;
  private typed = '';
  private errs: number[] = [];
  private rts: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 400);
  }

  private arm(at: number): void {
    // Scales of different ranges and steps; the needle sits between the marks later on.
    const kinds: [number, number, number, number][] = [
      [0, 100, 10, 5],
      [0, 50, 10, 5],
      [0, 200, 50, 5],
      [0, 10, 1, 5],
      [20, 120, 20, 4],
      [0, 400, 100, 4],
    ];
    const k = kinds[Math.min(kinds.length - 1, Math.floor(this.round / 2))]!;
    [this.lo, this.hi, this.major, this.minor] = k;
    const step = this.major / this.minor;
    const fine = this.round >= 4;
    this.value = fine ? this.lo + Math.random() * (this.hi - this.lo) : this.lo + rint(0, Math.round((this.hi - this.lo) / step)) * step;
    this.value = Math.round(this.value * 10) / 10;
    this.typed = '';
    this.state = 0;
    this.at = at;
  }

  press(): void {}

  typeKey(code: string, ts: number): boolean {
    const d = digitOf(code);
    if (this.state !== 0) return !!d;
    if (d || code === 'Period' || code === 'NumpadDecimal') {
      if (this.typed.length < 6) this.typed += d || '.';
      return true;
    }
    if (code === 'Backspace') {
      this.typed = this.typed.slice(0, -1);
      return true;
    }
    if ((code === 'Enter' || code === 'NumpadEnter' || code === 'Space') && this.typed) {
      const said = Number(this.typed);
      const e = Number.isFinite(said) ? (Math.abs(said - this.value) / (this.hi - this.lo)) * 100 : 50;
      this.errs.push(e);
      this.rts.push(ts - this.at);
      this.env.sound(e < 1 ? SND_CATCH : e < 3 ? SND_TAP_WEAK : SND_FALSE);
      this.round++;
      this.state = 1;
      this.at = ts + 1500;
      return true;
    }
    return false;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.round >= scaled(METER_ROUNDS)) return true;
      this.arm(now + 300);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'off by', this.errs.length ? `${mean(this.errs.slice(-3)).toFixed(1)}% of the scale` : '–', 'reading', `${Math.min(this.round + 1, scaled(METER_ROUNDS))} / ${scaled(METER_ROUNDS)}`);
    // A half-circle dial with major and minor marks.
    const R = Math.min((a.right - a.left) / 2 - 40 * a.u, (a.bottom - a.top) * 0.6);
    const cx = a.cx;
    const cy = a.top + R + 30 * a.u;
    const ang = (val: number) => Math.PI + ((val - this.lo) / (this.hi - this.lo)) * Math.PI;
    ctx.strokeStyle = COL_MID;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI, TAU);
    ctx.stroke();
    const step = this.major / this.minor;
    for (let val = this.lo; val <= this.hi + 1e-9; val += step) {
      const t = ang(val);
      const majorMark = Math.abs((val - this.lo) / this.major - Math.round((val - this.lo) / this.major)) < 1e-6;
      ctx.lineWidth = (majorMark ? 3 : 1.5) * dpr;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(t) * R, cy + Math.sin(t) * R);
      ctx.lineTo(cx + Math.cos(t) * R * (majorMark ? 0.86 : 0.92), cy + Math.sin(t) * R * (majorMark ? 0.86 : 0.92));
      ctx.stroke();
      if (majorMark) {
        ctx.fillStyle = COL_LINE;
        v.text(String(Math.round(val * 10) / 10), cx + Math.cos(t) * R * 0.74, cy + Math.sin(t) * R * 0.74 + 5 * dpr, v.fontTiny, 'center');
      }
    }
    const t = ang(this.value);
    ctx.strokeStyle = COL_ACCENT;
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(t) * R * 0.95, cy + Math.sin(t) * R * 0.95);
    ctx.stroke();
    ctx.fillStyle = COL_LINE;
    ctx.beginPath();
    ctx.arc(cx, cy, 6 * dpr, 0, TAU);
    ctx.fill();
    ctx.fillStyle = COL_LINE;
    v.text(this.state === 1 ? `it read ${this.value}` : `${this.typed || '_'}`, a.cx, cy + 40 * a.u, v.fontHud, 'center');
    if (this.round === 0 && this.state === 0) {
      ctx.fillStyle = COL_MID;
      v.text('read the needle; type the value (a decimal point is fine) and press Enter', a.cx, a.bottom - 4 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.round(Math.max(0, 10 - m) * 100) : 0,
      primary: { label: 'average miss', value: m, unit: '%', lower: true, zeroOk: true, decimals: 1 },
      lines: [
        { label: 'average miss (share of the scale)', value: this.errs.length ? `${m.toFixed(1)}%` : '–' },
        { label: 'typical time a reading', value: this.rts.length ? ms(median(this.rts)) : '–' },
      ],
      saved: this.errs.length >= 3,
    };
  }
}

// --- Symmetry --------------------------------------------------------------------------

class Symmetry implements Mini {
  private env!: MiniEnv;
  private n = 6;
  private filled = new Set<number>();
  private picks = new Set<number>();
  private axis: 'v' | 'h' | 'd' = 'v';
  private level = 1;
  private best = 0;
  private lives = 3;
  private state = 0;
  private at = 0;
  private cells: Rect[] = [];
  private done: Rect = [0, 0, 0, 0];
  private ok = false;
  private rounds = 0;
  private t0 = 0;
  private times: number[] = [];

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now);
  }

  /** The mirror of a cell across the axis. */
  private mirror(c: number): number {
    const n = this.n;
    const r = Math.floor(c / n);
    const k = c % n;
    if (this.axis === 'v') return r * n + (n - 1 - k);
    if (this.axis === 'h') return (n - 1 - r) * n + k;
    return k * n + r;
  }

  /** Cells on the given side of the axis (the half that is shown). */
  private given(c: number): boolean {
    const n = this.n;
    const r = Math.floor(c / n);
    const k = c % n;
    if (this.axis === 'v') return k < n / 2;
    if (this.axis === 'h') return r < n / 2;
    return k > r;
  }

  private arm(at: number): void {
    this.n = this.level >= 5 ? 8 : 6;
    this.axis = this.level >= 3 ? (['v', 'h', 'd'] as const)[rint(0, 2)] : 'v';
    const count = Math.min(Math.floor((this.n * this.n) / 4), 3 + this.level * 2);
    const pool = Array.from({ length: this.n * this.n }, (_, c) => c).filter((c) => this.given(c));
    this.filled = new Set();
    while (this.filled.size < Math.min(count, pool.length)) this.filled.add(pool[Math.floor(Math.random() * pool.length)]!);
    this.picks = new Set();
    this.state = 0;
    this.at = at;
    this.t0 = at;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.state !== 0) return;
    if (inside(this.done, x, y)) {
      this.submit(ts);
      return;
    }
    const c = this.cells.findIndex((r) => inside(r, x, y));
    if (c < 0 || this.given(c) || (this.axis === 'd' && Math.floor(c / this.n) === c % this.n)) return;
    if (this.picks.has(c)) this.picks.delete(c);
    else this.picks.add(c);
    this.env.sound(SND_TAP_WEAK);
  }

  typeKey(code: string, ts: number): boolean {
    if ((code === 'Enter' || code === 'Space') && this.state === 0) {
      this.submit(ts);
      return true;
    }
    return false;
  }

  private submit(ts: number): void {
    const want = new Set([...this.filled].map((c) => this.mirror(c)));
    this.ok = want.size === this.picks.size && [...want].every((c) => this.picks.has(c));
    this.rounds++;
    if (this.ok) {
      this.times.push(ts - this.t0);
      this.best = Math.max(this.best, this.level);
      this.level++;
      this.env.sound(SND_CATCH);
    } else {
      this.lives--;
      this.env.sound(SND_FALSE);
    }
    this.state = 1;
    this.at = ts + (this.ok ? 800 : 2000);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state === 1 && now >= this.at) {
      if (this.lives <= 0) return true;
      this.arm(now);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'level', String(this.level), 'best', String(this.best), this.lives);
    const size = Math.min(a.bottom - a.top - 60 * a.u, a.right - a.left);
    const cs = size / this.n;
    const x0 = a.cx - size / 2;
    const y0 = a.top + 4 * a.u;
    const want = new Set([...this.filled].map((c) => this.mirror(c)));
    this.cells = [];
    for (let c = 0; c < this.n * this.n; c++) {
      const r: Rect = [x0 + (c % this.n) * cs + 2 * dpr, y0 + Math.floor(c / this.n) * cs + 2 * dpr, cs - 4 * dpr, cs - 4 * dpr];
      this.cells.push(r);
      const g = this.given(c);
      ctx.fillStyle = this.filled.has(c) ? COL_LINE : this.picks.has(c) ? (this.state === 1 && !want.has(c) ? COL_ACCENT : COL_LINE) : g ? '#1a1a1e' : '#121215';
      ctx.fillRect(r[0], r[1], r[2], r[3]);
      if (this.state === 1 && want.has(c) && !this.picks.has(c)) {
        ctx.strokeStyle = COL_ACCENT;
        ctx.lineWidth = 2 * dpr;
        ctx.strokeRect(r[0] + 3 * dpr, r[1] + 3 * dpr, r[2] - 6 * dpr, r[3] - 6 * dpr);
      }
    }
    // The mirror line.
    ctx.strokeStyle = COL_ACCENT;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    if (this.axis === 'v') {
      ctx.moveTo(x0 + size / 2, y0 - 6 * dpr);
      ctx.lineTo(x0 + size / 2, y0 + size + 6 * dpr);
    } else if (this.axis === 'h') {
      ctx.moveTo(x0 - 6 * dpr, y0 + size / 2);
      ctx.lineTo(x0 + size + 6 * dpr, y0 + size / 2);
    } else {
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + size, y0 + size);
    }
    ctx.stroke();
    this.done = [a.cx - 60 * a.u, y0 + size + 12 * a.u, 120 * a.u, 34 * a.u];
    ctx.strokeStyle = COL_LINE;
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeRect(...this.done);
    ctx.fillStyle = COL_LINE;
    v.text(this.state === 1 ? (this.ok ? 'right' : 'not quite') : 'done (Enter)', a.cx, this.done[1] + 22 * a.u, v.fontTiny, 'center');
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    return {
      score: this.best * 100,
      primary: { label: 'level', value: this.best, unit: '' },
      lines: [
        { label: 'highest level', value: String(this.best) },
        { label: 'typical time a pattern', value: this.times.length ? ms(median(this.times)) : '–' },
      ],
      saved: this.rounds >= 1,
    };
  }
}

export const BATCH38: MiniDef[] = [
  { id: 'reflect', name: 'Reflect', skill: 'aim', blurb: 'Trace a star while the pen moves as in a mirror.', how: 'A star outline with a band to stay inside. Your pen moves as if seen in a mirror: left and right swapped (the second star swaps up and down). Click at the top point to start, then go once round inside the band. Slipping out adds a second. The classic mirror-drawing task: hard at first, and it improves fast with practice. Two stars.', input: 'pointer', make: () => new Reflect() },
  { id: 'sevens', name: 'Sevens', skill: 'reasoning', blurb: 'Count back from a number in sevens, as fast as you can.', how: 'A number appears: type it minus seven, then that minus seven, and so on. Answers check themselves once they are long enough. One minute from your first digit; scored on how many you get right.', input: 'type', make: () => new Sevens() },
  { id: 'hands', name: 'Hands', skill: 'judgement', blurb: 'An analog clock flashes. What time was it?', how: 'A clock with no numbers shows a time for a moment. Type the time it showed: the hour, then two digits for the minutes (4 then 37 for 4:37). Exact minutes from the fourth clock on, and the clock shows for less time as you go. Twelve clocks.', input: 'type', make: () => new Hands() },
  { id: 'meter', name: 'Meter', skill: 'judgement', blurb: 'Read a needle on a scale, between the marks.', how: 'A dial with major and minor marks and a needle. Type its reading and press Enter. The scales change, and from the fifth reading the needle can sit between the marks, so estimate. Scored on how far off you are, as a share of the scale.', input: 'type', make: () => new Meter() },
  { id: 'symmetry', name: 'Symmetry', skill: 'reasoning', blurb: 'Half a pattern. Complete its mirror image.', how: 'Squares are filled on one side of an orange mirror line. Tap the squares on the other side that make the pattern symmetrical, then done. More squares as you go; later the mirror line can be across or on the diagonal, and the grid grows. Three lives.', input: 'pointer', make: () => new Symmetry() },
];
