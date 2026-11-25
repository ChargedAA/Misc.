// Thirty-third batch, from the outside review.
//   Round   - draw a circle in one stroke: how round is it?
//   Wire    - steer a ring along a bent wire without touching it.
//   Bounce  - a ball bounces lower and quicker; press on the bounces once it goes dark.
//   Lead    - discs fly in arcs; your shot takes time to land, so aim where they will be.
//   Swap    - press the arrow's side; sometimes it flips and you must change your press.
//   Louder  - two tones: was the second louder or softer?
//   Faint   - a faint striped patch, tilted left or right: which way?
//   Vernier - two lines, one a hair to the side: which side?

import { COL_ACCENT, COL_DIM, COL_FAINT, COL_LINE, COL_MID } from '../config.ts';
import { SND_CATCH, SND_FALSE, SND_TAP_L, SND_TAP_R, SND_TAP_WEAK } from '../audio.ts';
import type { View } from '../render.ts';
import type { TouchLayout } from '../touch.ts';
import { Stair, arena, footer, header, mean, median, message, ms, pct, scaled, shown, sideOf, type Arena, type Mini, type MiniDef, type MiniEnv, type MiniResult } from './kit.ts';

const TAU = Math.PI * 2;
const rnd = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

// --- Round -----------------------------------------------------------------------------

const ROUND_TRIES = 5;

class Round implements Mini {
  private env!: MiniEnv;
  private pts: [number, number][] = [];
  private drawing = false;
  private scores: number[] = [];
  private last: { cx: number; cy: number; r: number; score: number; why: string } | null = null;
  private lastPts: [number, number][] = [];
  private nextAt = 0;
  private done = false;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  press(): void {}

  pointer(x: number, y: number, ts: number): void {
    if (this.done || ts < this.nextAt) return;
    this.drawing = true;
    this.pts = [[x, y]];
    this.last = null;
  }

  pointerMove(x: number, y: number): void {
    if (!this.drawing) return;
    const p = this.pts[this.pts.length - 1]!;
    if (Math.hypot(x - p[0], y - p[1]) >= 2) this.pts.push([x, y]);
  }

  pointerUp(_x: number, _y: number, ts: number): void {
    if (!this.drawing) return;
    this.drawing = false;
    this.judge(ts);
  }

  /** Fit the centre and radius, then score how far the stroke strays from that circle. */
  private judge(ts: number): void {
    const p = this.pts;
    if (p.length < 12) return;
    const cx = mean(p.map((q) => q[0]));
    const cy = mean(p.map((q) => q[1]));
    const rs = p.map((q) => Math.hypot(q[0] - cx, q[1] - cy));
    const r = mean(rs);
    // How much of the way round it went: the swept angle, unwrapped.
    let swept = 0;
    for (let i = 1; i < p.length; i++) {
      let d = Math.atan2(p[i]![1] - cy, p[i]![0] - cx) - Math.atan2(p[i - 1]![1] - cy, p[i - 1]![0] - cx);
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      swept += d;
    }
    const dev = mean(rs.map((x) => Math.abs(x - r))) / Math.max(1, r);
    const gap = Math.hypot(p[0]![0] - p[p.length - 1]![0], p[0]![1] - p[p.length - 1]![1]) / Math.max(1, r);
    let score = Math.max(0, 100 * (1 - dev * 4) - gap * 8);
    let why = '';
    if (Math.abs(swept) < TAU * 0.85) {
      why = 'go all the way round';
      score = 0;
    } else if (r < 30) {
      why = 'draw it bigger';
      score = 0;
    }
    score = Math.round(score * 10) / 10;
    this.last = { cx, cy, r, score, why };
    this.lastPts = p;
    this.pts = [];
    this.scores.push(score);
    this.env.sound(score >= 90 ? SND_CATCH : score > 0 ? SND_TAP_WEAK : SND_FALSE);
    this.nextAt = ts + 600;
    if (this.scores.length >= scaled(ROUND_TRIES)) this.done = true;
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (!this.firstFrame) this.firstFrame = now;
    if (this.done && now >= this.nextAt + 900) return true;
    if (now - this.firstFrame > 180000) return true;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const best = this.scores.length ? Math.max(...this.scores) : 0;
    header(v, touch, 'best', this.scores.length ? `${best.toFixed(1)}%` : '–', 'circle', `${Math.min(this.scores.length + 1, scaled(ROUND_TRIES))} / ${scaled(ROUND_TRIES)}`);
    const stroke = (pts: [number, number][], col: string) => {
      if (pts.length < 2) return;
      ctx.strokeStyle = col;
      ctx.lineWidth = 3 * dpr;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
      ctx.stroke();
    };
    if (this.drawing) stroke(this.pts, COL_LINE);
    else if (this.last) {
      // The perfect circle under yours, and the score in the middle.
      ctx.strokeStyle = COL_DIM;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.arc(this.last.cx, this.last.cy, this.last.r, 0, TAU);
      ctx.stroke();
      stroke(this.lastPts, this.last.score >= 90 ? COL_LINE : COL_ACCENT);
      message(v, { ...a, cx: this.last.cx, cy: this.last.cy }, this.last.why ? '–' : `${this.last.score.toFixed(1)}%`, this.last.why || (this.last.score >= 95 ? 'superb' : this.last.score >= 90 ? 'very round' : ''));
    } else {
      ctx.fillStyle = COL_MID;
      v.text('hold the mouse button (or a finger) and draw a circle in one stroke', a.cx, a.cy, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const good = this.scores.filter((s) => s > 0);
    return {
      score: Math.round((good.length ? Math.max(...good) : 0) * 10),
      primary: { label: 'roundest circle', value: good.length ? Math.max(...good) : 0, unit: '%', decimals: 1 },
      series: { label: 'each circle', names: this.scores.map((_, i) => String(i + 1)), values: this.scores, unit: '%', decimals: 1 },
      lines: [
        { label: 'roundest', value: good.length ? `${Math.max(...good).toFixed(1)}%` : '–' },
        { label: 'average', value: good.length ? `${mean(good).toFixed(1)}%` : '–' },
        { label: 'circles that did not count', value: String(this.scores.length - good.length) },
      ],
      saved: good.length >= 1,
    };
  }
}

// --- Wire ------------------------------------------------------------------------------

const WIRES = 3;

class Wire implements Mini {
  private env!: MiniEnv;
  private a: Arena | null = null;
  private path: [number, number][] = [];
  /** Cumulative length at each point of the path. */
  private cum: number[] = [];
  private hole = 0;
  private wire = 0;
  private state = 0; // 0 waiting at the start, 1 running, 2 wire done
  private progress = 0;
  private x = -1;
  private y = -1;
  private t0 = 0;
  private faults = 0;
  private wireFaults = 0;
  private frozenUntil = 0;
  private times: number[] = [];
  private nextAt = 0;
  private touching = false;
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  press(): void {}

  private build(a: Arena): void {
    // A wire across the board, bent more and with a smaller ring each time.
    const n = 9 + this.wire * 3;
    const amp = (0.22 + this.wire * 0.06) * (a.bottom - a.top);
    this.path = [];
    for (let i = 0; i <= n * 6; i++) {
      const t = i / (n * 6);
      const x = a.left + 30 * a.u + t * (a.right - a.left - 60 * a.u);
      const y = a.cy + Math.sin(t * Math.PI * (1.5 + this.wire)) * amp * 0.6 + Math.sin(t * Math.PI * (4.3 + this.wire * 1.7) + this.wire) * amp * 0.35;
      this.path.push([x, y]);
    }
    this.cum = [0];
    for (let i = 1; i < this.path.length; i++) this.cum.push(this.cum[i - 1]! + Math.hypot(this.path[i]![0] - this.path[i - 1]![0], this.path[i]![1] - this.path[i - 1]![1]));
    this.hole = (22 - this.wire * 5) * a.u;
    this.progress = 0;
    this.state = 0;
    this.wireFaults = 0;
  }

  /** The nearest point of the wire: distance to it, and how far along the wire it is. */
  private nearest(x: number, y: number): { d: number; along: number } {
    let best = { d: Infinity, along: 0 };
    for (let i = 1; i < this.path.length; i++) {
      const [ax, ay] = this.path[i - 1]!;
      const [bx, by] = this.path[i]!;
      const vx = bx - ax;
      const vy = by - ay;
      const l2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l2));
      const d = Math.hypot(x - (ax + vx * t), y - (ay + vy * t));
      if (d < best.d) best = { d, along: this.cum[i - 1]! + t * Math.sqrt(l2) };
    }
    return best;
  }

  pointer(x: number, y: number, ts: number): void {
    this.x = x;
    this.y = y;
    const [sx, sy] = this.path[0] ?? [0, 0];
    if (this.state === 0 && ts >= this.nextAt && Math.hypot(x - sx, y - sy) <= this.hole * 1.6) {
      this.state = 1;
      this.t0 = ts;
      this.env.sound(SND_TAP_L);
    }
  }

  pointerMove(x: number, y: number, ts: number): void {
    this.x = x;
    this.y = y;
    if (this.state !== 1 || ts < this.frozenUntil) return;
    const n = this.nearest(x, y);
    const touch = n.d > this.hole;
    if (touch && !this.touching) {
      this.faults++;
      this.wireFaults++;
      this.frozenUntil = ts + 500;
      this.env.sound(SND_FALSE);
    }
    this.touching = touch;
    // Progress only counts when the ring is on the wire, and only a little at a time, so it
    // cannot be skipped by jumping ahead.
    if (!touch && n.along > this.progress && n.along - this.progress < 60 * (this.a?.u ?? 1)) this.progress = n.along;
    if (this.progress >= this.cum[this.cum.length - 1]! - 4) {
      this.times.push((ts - this.t0) / 1000 + this.wireFaults * 2);
      this.env.sound(SND_CATCH);
      this.state = 2;
      this.wire++;
      this.nextAt = ts + 900;
    }
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const a = arena(v, touch);
    if (!this.firstFrame) this.firstFrame = now;
    if (now - this.firstFrame > 300000) return true;
    if (!this.a || (this.state === 2 && now >= this.nextAt)) {
      if (this.wire >= scaled(WIRES)) return true;
      this.a = a;
      this.build(a);
    }
    v.clear();
    const ctx = v.ctx;
    const dpr = v.dpr;
    const total = this.times.reduce((s, t) => s + t, 0);
    header(v, touch, 'time', this.state === 1 ? `${((now - this.t0) / 1000 + this.wireFaults * 2).toFixed(1)} s` : `${total.toFixed(1)} s`, 'wire', `${Math.min(this.wire + 1, scaled(WIRES))} / ${scaled(WIRES)}  ·  ${this.faults} ${this.faults === 1 ? 'buzz' : 'buzzes'}`);
    // The wire: done part dim, the rest bright.
    const done = this.progress;
    ctx.lineWidth = 3 * dpr;
    ctx.lineCap = 'round';
    for (const part of [0, 1]) {
      ctx.strokeStyle = part ? COL_LINE : COL_DIM;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < this.path.length; i++) {
        const on = part ? this.cum[i]! >= done - 2 : this.cum[i]! <= done + 2;
        if (!on) continue;
        if (!started) {
          ctx.moveTo(this.path[i]![0], this.path[i]![1]);
          started = true;
        } else ctx.lineTo(this.path[i]![0], this.path[i]![1]);
      }
      ctx.stroke();
    }
    const [sx, sy] = this.path[0]!;
    const [ex, ey] = this.path[this.path.length - 1]!;
    ctx.fillStyle = COL_FAINT;
    ctx.fillRect(sx - 8 * a.u, sy - 30 * a.u, 4 * a.u, 60 * a.u);
    ctx.fillRect(ex + 4 * a.u, ey - 30 * a.u, 4 * a.u, 60 * a.u);
    // The ring at the pointer: orange when it is on the wire, grey while frozen.
    const frozen = now < this.frozenUntil;
    const rx = this.state === 0 ? sx : this.x;
    const ry = this.state === 0 ? sy : this.y;
    if (rx >= 0) {
      ctx.strokeStyle = frozen ? COL_MID : this.state === 0 ? COL_MID : COL_ACCENT;
      ctx.lineWidth = 3 * dpr;
      ctx.beginPath();
      ctx.arc(rx, ry, this.hole + 1.5 * dpr, 0, TAU);
      ctx.stroke();
    }
    if (frozen) message(v, { ...a, cy: a.top + 30 * a.u }, 'bzzt', '+2 s', COL_LINE);
    if (this.state === 0) {
      ctx.fillStyle = COL_MID;
      v.text('click the ring at the left to pick it up, then guide it along the wire without touching', a.cx, a.bottom - 10 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const total = this.times.reduce((s, t) => s + t, 0);
    return {
      score: this.times.length ? Math.round(Math.max(0, 200 - total) * 5 * (this.times.length / scaled(WIRES))) : 0,
      // Wires not finished cost 30 s each, so a partial run never beats a whole one.
      primary: { label: 'time, with 2 s for each buzz', value: this.times.length ? total + (scaled(WIRES) - this.times.length) * 30 : 0, unit: 's', lower: true, decimals: 1 },
      series: { label: 'each wire', names: this.times.map((_, i) => String(i + 1)), values: this.times, unit: 's', decimals: 1, lower: true },
      lines: [
        { label: 'wires done', value: `${this.times.length} of ${scaled(WIRES)}` },
        { label: 'buzzes', value: String(this.faults) },
        { label: 'time with penalties', value: `${total.toFixed(1)} s` },
      ],
      saved: this.times.length >= 1,
    };
  }
}

// --- Bounce ----------------------------------------------------------------------------

const BOUNCE_TRIALS = 8;
const BOUNCE_HIDDEN = 3;

class Bounce implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private t0 = 0;
  private e = 0.75;
  private fall = 700;
  /** Times of every bounce (ms after t0), and how many are shown and heard. */
  private bounces: number[] = [];
  private visible = 3;
  private readonly show = new Stair(3, 1, 1, 3, 2);
  private presses: number[] = [];
  private played = 0;
  private state = 0; // 0 dropping, 1 feedback
  private until = 0;
  private errs: number[] = [];
  private lastErrs: number[] = [];
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.arm(now + 800);
  }

  private arm(at: number): void {
    this.e = rnd(0.68, 0.84);
    this.fall = rnd(560, 760);
    this.visible = Math.round(this.show.level);
    this.bounces = [];
    let t = this.fall;
    let interval = 2 * this.fall * this.e;
    for (let k = 0; k < this.visible + BOUNCE_HIDDEN; k++) {
      this.bounces.push(t);
      t += interval;
      interval *= this.e;
    }
    this.t0 = at;
    this.presses = [];
    this.played = 0;
    this.state = 0;
  }

  /** Height above the floor (0..1) at a time: falls, bounces, each bounce lower. */
  private height(t: number): number {
    if (t < 0) return 1;
    if (t < this.fall) return 1 - (t / this.fall) ** 2;
    for (let k = 0; k < this.bounces.length - 1; k++) {
      const a = this.bounces[k]!;
      const b = this.bounces[k + 1]!;
      if (t < b) {
        const half = (b - a) / 2;
        const peak = this.e ** (2 * (k + 1));
        const u = (t - a - half) / half;
        return peak * (1 - u * u);
      }
    }
    return 0;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    if (this.state !== 0) return;
    const t = ts - this.t0;
    if (t < this.bounces[this.visible - 1]! + 60) return; // only the dark bounces are judged
    this.presses.push(t);
    this.env.sound(SND_TAP_L);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  pointer(_x: number, _y: number, ts: number): void {
    this.press(0, ts);
    this.release(0);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const t = now - this.t0;
    if (this.state === 0) {
      // The visible bounces click; the dark ones are silent.
      while (this.played < this.visible && t >= this.bounces[this.played]!) {
        this.env.sound(SND_TAP_WEAK);
        this.played++;
      }
      const lastB = this.bounces[this.bounces.length - 1]!;
      if (t > lastB + 450) {
        const hidden = this.bounces.slice(this.visible);
        const used = new Set<number>();
        this.lastErrs = hidden.map((b) => {
          let bi = -1;
          for (let j = 0; j < this.presses.length; j++) if (!used.has(j) && Math.abs(this.presses[j]! - b) < 250 && (bi < 0 || Math.abs(this.presses[j]! - b) < Math.abs(this.presses[bi]! - b))) bi = j;
          if (bi < 0) return 250;
          used.add(bi);
          return this.presses[bi]! - b;
        });
        const m = mean(this.lastErrs.map(Math.abs));
        this.errs.push(m);
        this.show.update(m < 45, -1);
        this.env.sound(m < 40 ? SND_CATCH : SND_TAP_WEAK);
        this.i++;
        this.state = 1;
        this.until = now + 1400;
      }
    } else if (now >= this.until) {
      if (this.i >= scaled(BOUNCE_TRIALS)) return true;
      this.arm(now + 600);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'off by', this.errs.length ? ms(mean(this.errs.slice(-4))) : '–', 'drop', `${Math.min(this.i + 1, scaled(BOUNCE_TRIALS))} / ${scaled(BOUNCE_TRIALS)}`);
    const floor = a.bottom - 40 * a.u;
    const top = a.top + 30 * a.u;
    ctx.fillStyle = COL_LINE;
    ctx.fillRect(a.cx - 120 * a.u, floor, 240 * a.u, 2 * dpr);
    const tv = shown(now) - this.t0;
    const dark = this.state === 0 && tv > this.bounces[this.visible - 1]! + 40;
    if (!dark) {
      const h = this.height(Math.max(0, tv));
      const r = 14 * a.u;
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.arc(a.cx, floor - r - h * (floor - top - 2 * r), r, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = COL_MID;
      v.text(`press on each bounce you cannot see  ·  ${this.presses.length} of ${BOUNCE_HIDDEN}`, a.cx, a.cy, v.fontTiny, 'center');
    }
    if (this.state === 1) {
      // Each dark bounce: early (left) or late (right) of the mark.
      this.lastErrs.forEach((e, k) => {
        const x = a.cx + (k - 1) * 70 * a.u;
        ctx.fillStyle = COL_DIM;
        ctx.fillRect(x - dpr / 2, floor + 14 * a.u, dpr, 16 * a.u);
        ctx.fillStyle = Math.abs(e) >= 250 ? COL_ACCENT : Math.abs(e) < 40 ? COL_LINE : COL_MID;
        ctx.fillRect(x + Math.max(-1, Math.min(1, e / 200)) * 28 * a.u - 1.5 * dpr, floor + 12 * a.u, 3 * dpr, 20 * a.u);
      });
      message(v, { ...a, cy: a.cy - 40 * a.u }, ms(this.errs[this.errs.length - 1]!), this.lastErrs.some((e) => Math.abs(e) >= 250) ? 'missed one' : 'average off on the dark bounces');
    }
    if (this.i === 0 && this.state === 0 && t < this.fall) {
      ctx.fillStyle = COL_MID;
      v.text(`watch and listen to ${this.visible} bounces, then it goes dark: press on the next ${BOUNCE_HIDDEN}`, a.cx, top, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const m = mean(this.errs);
    return {
      score: this.errs.length ? Math.round(Math.max(0, 250 - m) * 4) : 0,
      primary: { label: 'average error on the dark bounces', value: m, unit: 'ms', lower: true },
      lines: [
        { label: 'average error', value: ms(m) },
        { label: 'best drop', value: this.errs.length ? ms(Math.min(...this.errs)) : '–' },
        { label: 'bounces shown at the end', value: String(Math.round(this.show.level)) },
      ],
      saved: this.i >= 2,
    };
  }
}

// --- Lead ------------------------------------------------------------------------------

const LEAD_DISCS = 30;

interface Disc {
  t0: number;
  dur: number;
  x0: number;
  x1: number;
  peak: number;
  done: boolean;
}

class Lead implements Mini {
  private env!: MiniEnv;
  private discs: Disc[] = [];
  private launched = 0;
  private nextAt = 0;
  private shots: { x: number; y: number; at: number; landed: boolean; hit: boolean }[] = [];
  private hits = 0;
  private fired = 0;
  private started = false;
  private bursts: { x: number; y: number; at: number }[] = [];
  private firstFrame = 0;

  start(env: MiniEnv): void {
    this.env = env;
  }

  press(): void {}

  /** How long a shot takes to land: longer as you go. */
  private delay(): number {
    return 260 + Math.min(1, this.launched / scaled(LEAD_DISCS)) * 260;
  }

  private posOf(d: Disc, t: number, a: Arena): [number, number] {
    const p = (t - d.t0) / d.dur;
    const x = d.x0 + (d.x1 - d.x0) * p;
    const y = a.bottom - (4 * p * (1 - p)) * d.peak * (a.bottom - a.top);
    return [x, y];
  }

  pointer(x: number, y: number, ts: number): void {
    if (!this.started) {
      this.started = true;
      this.nextAt = ts + 500;
      return;
    }
    this.fired++;
    this.shots.push({ x, y, at: ts + this.delay(), landed: false, hit: false });
    this.env.sound(SND_TAP_WEAK);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    const a = arena(v, touch);
    if (!this.firstFrame) this.firstFrame = now;
    if (!this.started && now - this.firstFrame > 120000) return true;
    const total = scaled(LEAD_DISCS);
    if (this.started && now >= this.nextAt && this.launched < total) {
      // From one side to the other in an arc; two at a time later on.
      const n = this.launched > total * 0.6 && Math.random() < 0.4 ? 2 : 1;
      for (let k = 0; k < n && this.launched < total; k++) {
        const ltr = Math.random() < 0.5;
        const speed = 1 + (this.launched / total) * 0.8;
        this.discs.push({ t0: now, dur: rnd(1500, 2100) / speed, x0: ltr ? a.left : a.right, x1: ltr ? a.right : a.left, peak: rnd(0.55, 0.9), done: false });
        this.launched++;
      }
      this.nextAt = now + rnd(1200, 1700) / (1 + this.launched / total);
    }
    for (const s of this.shots) {
      if (s.landed || now < s.at) continue;
      s.landed = true;
      this.bursts.push({ x: s.x, y: s.y, at: now });
      for (const d of this.discs) {
        if (d.done || now > d.t0 + d.dur) continue;
        const [dx, dy] = this.posOf(d, now, a);
        if (Math.hypot(dx - s.x, dy - s.y) <= 30 * a.u) {
          d.done = true;
          s.hit = true;
          this.hits++;
          this.env.sound(SND_CATCH);
        }
      }
    }
    const allGone = this.launched >= total && this.discs.every((d) => d.done || now > d.t0 + d.dur) && this.shots.every((s) => s.landed);
    if (allGone && this.started) return true;
    v.clear();
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'hits', `${this.hits} / ${total}`, 'shot lands in', `${Math.round(this.delay())} ms`);
    ctx.fillStyle = COL_FAINT;
    ctx.fillRect(a.left, a.bottom, a.right - a.left, dpr);
    for (const d of this.discs) {
      if (d.done || now > d.t0 + d.dur || now < d.t0) continue;
      const [x, y] = this.posOf(d, shown(now), a);
      // A clay disc, seen a little from the side.
      ctx.fillStyle = COL_ACCENT;
      ctx.beginPath();
      ctx.ellipse(x, y, 16 * a.u, 7 * a.u, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x - 16 * a.u, y, 32 * a.u, 3 * a.u);
    }
    for (const s of this.shots) {
      if (s.landed) continue;
      // The shot closing in on where you clicked.
      const k = Math.max(0, (s.at - now) / this.delay());
      ctx.strokeStyle = COL_LINE;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath();
      ctx.arc(s.x, s.y, (6 + k * 40) * a.u, 0, TAU);
      ctx.stroke();
    }
    this.bursts = this.bursts.filter((b) => now - b.at < 250);
    for (const b of this.bursts) {
      const k = (now - b.at) / 250;
      ctx.strokeStyle = COL_MID;
      ctx.lineWidth = 2 * dpr;
      for (let j = 0; j < 6; j++) {
        const ang = (j / 6) * TAU;
        ctx.beginPath();
        ctx.moveTo(b.x + Math.cos(ang) * 10 * a.u * k, b.y + Math.sin(ang) * 10 * a.u * k);
        ctx.lineTo(b.x + Math.cos(ang) * 26 * a.u * k, b.y + Math.sin(ang) * 26 * a.u * k);
        ctx.stroke();
      }
    }
    if (!this.started) message(v, a, 'click to start', 'discs fly across in arcs. your shot takes a moment to land: click where the disc will be', COL_MID);
    footer(v, touch, 0);
    return false;
  }

  result(): MiniResult {
    const total = scaled(LEAD_DISCS);
    return {
      score: this.hits * 30 + Math.round((this.hits / Math.max(1, this.fired)) * 100),
      primary: { label: 'hits', value: this.hits, unit: `of ${total}` },
      lines: [
        { label: 'hits', value: `${this.hits} of ${total}` },
        { label: 'accuracy', value: `${pct(this.hits / Math.max(1, this.fired))}  (${this.fired} shots)` },
      ],
      saved: this.launched >= 5,
    };
  }
}

// --- Swap ------------------------------------------------------------------------------

const SWAP_TRIALS = 60;

class Swap implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private dir = 1;
  private change = false;
  private flipped = false;
  private at = 0;
  private flipAt = 0;
  private state = 0; // 0 gap, 1 arrow, 2 feedback
  private next = 0;
  /** The flip delay (ms), staircased toward the point where you change in time half the time. */
  private readonly delay = new Stair(180, 50, 50, 900, 1);
  private goRts: number[] = [];
  private changeRts: number[] = [];
  private delays: number[] = [];
  private changeOk = 0;
  private changeAll = 0;
  private goErr = 0;
  private feedback = '';
  private held = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 800;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 1) return;
    const want = this.change && this.flipped ? -this.dir : this.dir;
    this.env.sound(s < 0 ? SND_TAP_L : SND_TAP_R);
    if (this.change) {
      this.changeAll++;
      const ok = this.flipped && s === want;
      if (ok) {
        this.changeOk++;
        this.changeRts.push(ts - this.flipAt);
        this.feedback = 'changed in time';
      } else this.feedback = this.flipped ? 'wrong side' : 'too quick: it flipped';
      this.delays.push(this.delay.level);
      this.delay.update(ok, 1);
      if (!ok) this.env.sound(SND_FALSE);
    } else if (s === want) {
      this.goRts.push(ts - this.at);
      this.feedback = '';
    } else {
      this.goErr++;
      this.feedback = 'wrong side';
      this.env.sound(SND_FALSE);
    }
    this.i++;
    this.state = 2;
    this.next = ts + (this.feedback ? 700 : 350);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if (this.state !== 1 && now >= this.next) {
      if (this.state === 0 || this.state === 2) {
        if (this.state === 2 || this.i > 0 || now >= this.next) {
          if (this.i >= scaled(SWAP_TRIALS)) return true;
          this.dir = Math.random() < 0.5 ? -1 : 1;
          this.change = this.i >= 4 && Math.random() < 0.25;
          this.flipped = false;
          this.at = now;
          this.flipAt = now + this.delay.level;
          this.state = 1;
        }
      }
    }
    if (this.state === 1 && this.change && !this.flipped && now >= this.flipAt) {
      this.flipped = true;
      this.flipAt = now;
    }
    if (this.state === 1 && now - this.at > 1500) {
      this.i++;
      if (this.change) {
        this.changeAll++;
        this.delays.push(this.delay.level);
        this.delay.update(false, 1);
      }
      this.feedback = 'too slow';
      this.state = 2;
      this.next = now + 700;
      this.env.sound(SND_FALSE);
    }
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    header(v, touch, 'typical', this.goRts.length ? ms(median(this.goRts.slice(-10))) : '–', 'arrow', `${Math.min(this.i + 1, scaled(SWAP_TRIALS))} / ${scaled(SWAP_TRIALS)}`);
    if (this.state === 1) {
      const d = this.change && this.flipped ? -this.dir : this.dir;
      ctx.fillStyle = this.change && this.flipped ? COL_ACCENT : COL_LINE;
      ctx.save();
      ctx.translate(a.cx, a.cy);
      ctx.scale(d, 1);
      const s = 40 * a.u;
      ctx.beginPath();
      ctx.moveTo(s, 0);
      ctx.lineTo(-s * 0.2, -s * 0.8);
      ctx.lineTo(-s * 0.2, -s * 0.3);
      ctx.lineTo(-s, -s * 0.3);
      ctx.lineTo(-s, s * 0.3);
      ctx.lineTo(-s * 0.2, s * 0.3);
      ctx.lineTo(-s * 0.2, s * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (this.state === 2 && this.feedback) {
      ctx.fillStyle = COL_MID;
      v.text(this.feedback, a.cx, a.cy, v.fontHud, 'center');
    } else {
      ctx.fillStyle = COL_DIM;
      ctx.fillRect(a.cx - 6 * dpr, a.cy - dpr / 2, 12 * dpr, dpr);
      ctx.fillRect(a.cx - dpr / 2, a.cy - 6 * dpr, dpr, 12 * dpr);
    }
    if (this.i < 3) {
      ctx.fillStyle = COL_MID;
      v.text('press the side the arrow points. if it flips, change to the new side', a.cx, a.bottom - 14 * a.u, v.fontTiny, 'center');
    }
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const go = median(this.goRts);
    // Like a stop-signal estimate: your usual time less the flip delay you can just manage.
    const d = this.delays.length ? mean(this.delays.slice(-12)) : NaN;
    const crt = Number.isFinite(d) && this.goRts.length >= 5 ? Math.max(0, go - d) + (this.changeRts.length ? 0 : 0) : NaN;
    return {
      score: Number.isFinite(crt) ? Math.round(Math.max(0, 600 - crt) * 3) : 0,
      primary: { label: 'change time', value: crt, unit: 'ms', lower: true },
      lines: [
        { label: 'typical press (no flip)', value: this.goRts.length ? ms(go) : '–' },
        { label: 'flips caught in time', value: `${this.changeOk} of ${this.changeAll}` },
        { label: 'time to the new side after a flip', value: this.changeRts.length ? ms(median(this.changeRts)) : '–' },
        { label: 'wrong side with no flip', value: String(this.goErr) },
      ],
      rts: this.goRts,
      saved: this.goRts.length >= 8 && this.changeAll >= 3,
    };
  }
}

// --- Louder ----------------------------------------------------------------------------

/** Loudness differences to try, in decibels, easy to hard. */
const DB = [6, 4.5, 3.5, 2.8, 2.2, 1.8, 1.5, 1.2, 1, 0.8, 0.6, 0.45, 0.3];
const LOUDER_TRIALS = 30;

class Louder implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private readonly stair = new Stair(0, 1, 0, DB.length - 1, 2);
  private up = true;
  private state = 0; // 0 gap, 1 playing, 2 answer, 3 feedback
  private next = 0;
  private hz = 440;
  private hz2 = 440;
  private right = 0;
  private levels: number[] = [];
  private last = '';
  private held = 0;
  private g2 = 0;
  private secondAt = 0;

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 800;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || this.state !== 2) return;
    const ok = (s > 0) === this.up;
    if (ok) this.right++;
    this.levels.push(DB[Math.round(this.stair.level)]!);
    this.stair.update(ok, 1);
    this.last = ok ? '' : `it was ${this.up ? 'louder' : 'softer'}`;
    this.env.sound(ok ? SND_TAP_WEAK : SND_FALSE);
    this.i++;
    this.state = 3;
    this.next = ts + (ok ? 500 : 900);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if ((this.state === 0 || this.state === 3) && now >= this.next) {
      if (this.i >= scaled(LOUDER_TRIALS)) return true;
      const db = DB[Math.round(this.stair.level)]!;
      this.up = Math.random() < 0.5;
      this.hz = 300 * 2 ** (Math.random() * 1.5);
      // Later on the pitch changes too, and higher notes sound louder: ignore it.
      this.hz2 = this.i > 12 ? this.hz * 2 ** ((Math.random() < 0.5 ? -1 : 1) * rnd(0.15, 0.4)) : this.hz;
      // Rove the overall level a little, so only the difference can be heard.
      const base = 0.07 * 10 ** (rnd(-2, 2) / 20);
      const g2 = base * 10 ** (((this.up ? 1 : -1) * db) / 20);
      this.env.tone?.(this.hz, 450, 0, base);
      this.g2 = g2;
      this.secondAt = now + 750;
      this.state = 1;
      this.next = now + 1300;
    }
    if (this.state === 1 && this.secondAt && now >= this.secondAt) {
      this.secondAt = 0;
      this.env.tone?.(this.hz2, 450, 0, this.g2);
    }
    if (this.state === 1 && now >= this.next) this.state = 2;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    header(v, touch, 'difference', `${DB[Math.round(this.stair.level)]} dB`, 'pair', `${Math.min(this.i + 1, scaled(LOUDER_TRIALS))} / ${scaled(LOUDER_TRIALS)}`);
    ctx.fillStyle = this.state === 2 ? COL_LINE : COL_MID;
    v.text(this.state === 1 ? 'listen…' : this.state === 2 ? 'second one: softer (left) or louder (right)?' : this.last, a.cx, a.cy, v.fontHud, 'center');
    if (this.env.muted) message(v, { ...a, cy: a.cy + 50 * a.u }, '', 'needs sound on', COL_ACCENT);
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const thr = this.levels.length >= 6 ? median(this.levels.slice(-10)) : NaN;
    return {
      score: Number.isFinite(thr) ? Math.round(Math.max(0, 7 - thr) * 150) : 0,
      primary: { label: 'smallest difference heard', value: thr, unit: 'dB', lower: true, decimals: 1 },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'smallest step reached', value: this.levels.length ? `${Math.min(...this.levels)} dB` : '–' },
      ],
      saved: this.i >= 8,
    };
  }
}

// --- Faint (contrast) ------------------------------------------------------------------

/** Contrast levels (%), easy to hard: roughly 0.1 log units apart. */
const CONTRAST = [40, 30, 22, 16, 12, 9, 7, 5, 4, 3, 2.3, 1.8, 1.4, 1.1, 0.9, 0.7];
const FAINT_TRIALS = 36;

class Faint implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private readonly stair = new Stair(0, 1, 0, CONTRAST.length - 1, 2);
  private tilt = 1;
  private state = 0; // 0 gap, 1 showing, 2 answer, 3 feedback
  private at = 0;
  private next = 0;
  private levels: number[] = [];
  private right = 0;
  private held = 0;
  private last = '';

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 800;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || (this.state !== 1 && this.state !== 2)) return;
    const ok = (s > 0) === (this.tilt > 0);
    if (ok) this.right++;
    this.levels.push(CONTRAST[Math.round(this.stair.level)]!);
    this.stair.update(ok, 1);
    this.last = ok ? '' : `it leaned ${this.tilt > 0 ? 'right' : 'left'}`;
    this.env.sound(ok ? SND_TAP_WEAK : SND_FALSE);
    this.i++;
    this.state = 3;
    this.next = ts + (ok ? 450 : 800);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if ((this.state === 0 || this.state === 3) && now >= this.next) {
      if (this.i >= scaled(FAINT_TRIALS)) return true;
      this.tilt = Math.random() < 0.5 ? -1 : 1;
      this.state = 1;
      this.at = now;
    }
    if (this.state === 1 && now - this.at > 350) this.state = 2;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const c = CONTRAST[Math.round(this.stair.level)]! / 100;
    header(v, touch, 'contrast', `${CONTRAST[Math.round(this.stair.level)]}%`, 'patch', `${Math.min(this.i + 1, scaled(FAINT_TRIALS))} / ${scaled(FAINT_TRIALS)}`);
    const R = 70 * a.u;
    if (this.state === 1) {
      // A striped patch fading out from the middle: stripes as thin bands, light and dark
      // around the background grey, their strength falling off with distance.
      ctx.save();
      ctx.beginPath();
      ctx.arc(a.cx, a.cy, R, 0, TAU);
      ctx.clip();
      ctx.fillStyle = '#5a5a5a';
      ctx.fillRect(a.cx - R, a.cy - R, 2 * R, 2 * R);
      ctx.translate(a.cx, a.cy);
      ctx.rotate((this.tilt * Math.PI) / 4);
      const period = 22 * a.u;
      const bands = 64;
      for (let k = 0; k < bands; k++) {
        const x = -R + (k / bands) * 2 * R;
        const env = Math.exp(-(x * x) / (2 * (R * 0.45) ** 2));
        const s = Math.sin((x / period) * TAU) * c * env;
        ctx.fillStyle = s >= 0 ? `rgba(255,255,255,${(s * 1.6).toFixed(4)})` : `rgba(0,0,0,${(-s * 1.6).toFixed(4)})`;
        ctx.fillRect(x, -R, (2 * R) / bands + 0.5, 2 * R);
      }
      ctx.restore();
      // A soft edge so the circle itself gives nothing away.
      const g = ctx.createRadialGradient?.(a.cx, a.cy, R * 0.55, a.cx, a.cy, R);
      if (g) {
        g.addColorStop(0, 'rgba(90,90,90,0)');
        g.addColorStop(1, 'rgba(90,90,90,1)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(a.cx, a.cy, R, 0, TAU);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#5a5a5a';
      ctx.beginPath();
      ctx.arc(a.cx, a.cy, R, 0, TAU);
      ctx.fill();
      ctx.fillStyle = COL_DIM;
      ctx.fillRect(a.cx - 5 * dpr, a.cy - dpr / 2, 10 * dpr, dpr);
    }
    ctx.fillStyle = COL_MID;
    v.text(this.state === 3 && this.last ? this.last : 'stripes lean left (left key) or right (right key)?', a.cx, a.cy + R + 30 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const thr = this.levels.length >= 8 ? median(this.levels.slice(-12)) : NaN;
    return {
      score: Number.isFinite(thr) ? Math.round(Math.max(0, 2 - Math.log10(thr)) * 400) : 0,
      primary: { label: 'faintest contrast seen', value: thr, unit: '%', lower: true, decimals: 1 },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'faintest reached', value: this.levels.length ? `${Math.min(...this.levels)}%` : '–' },
        { label: 'note', value: 'screen brightness and room light change this; compare like with like' },
      ],
      saved: this.i >= 10,
    };
  }
}

// --- Vernier ---------------------------------------------------------------------------

/** Offsets in CSS pixels, easy to hard: below a pixel the lines are drawn anti-aliased. */
const OFFSETS = [6, 4.5, 3.5, 2.5, 2, 1.5, 1.2, 1, 0.8, 0.6, 0.45, 0.35, 0.25, 0.18];
const VERNIER_TRIALS = 36;

class Vernier implements Mini {
  private env!: MiniEnv;
  private i = 0;
  private readonly stair = new Stair(0, 1, 0, OFFSETS.length - 1, 2);
  private side = 1;
  private jx = 0;
  private state = 0;
  private at = 0;
  private next = 0;
  private levels: number[] = [];
  private right = 0;
  private held = 0;
  private last = '';

  start(env: MiniEnv, now: number): void {
    this.env = env;
    this.next = now + 800;
  }

  press(slot: number, ts: number): void {
    this.held |= 1 << slot;
    const s = sideOf(slot);
    if (s === 0 || (this.state !== 1 && this.state !== 2)) return;
    const ok = (s > 0) === (this.side > 0);
    if (ok) this.right++;
    this.levels.push(OFFSETS[Math.round(this.stair.level)]!);
    this.stair.update(ok, 1);
    this.last = ok ? '' : `it was to the ${this.side > 0 ? 'right' : 'left'}`;
    this.env.sound(ok ? SND_TAP_WEAK : SND_FALSE);
    this.i++;
    this.state = 3;
    this.next = ts + (ok ? 450 : 800);
  }

  release(slot: number): void {
    this.held &= ~(1 << slot);
  }

  frame(now: number, v: View, touch: TouchLayout): boolean {
    if ((this.state === 0 || this.state === 3) && now >= this.next) {
      if (this.i >= scaled(VERNIER_TRIALS)) return true;
      this.side = Math.random() < 0.5 ? -1 : 1;
      // The pair moves a little each time, so the screen edge is no help.
      this.jx = rnd(-40, 40);
      this.state = 1;
      this.at = now;
    }
    if (this.state === 1 && now - this.at > 500) this.state = 2;
    v.clear();
    const a = arena(v, touch);
    const ctx = v.ctx;
    const dpr = v.dpr;
    const off = OFFSETS[Math.round(this.stair.level)]!;
    header(v, touch, 'offset', `${off} px`, 'pair', `${Math.min(this.i + 1, scaled(VERNIER_TRIALS))} / ${scaled(VERNIER_TRIALS)}`);
    if (this.state === 1) {
      const x = Math.round(a.cx + this.jx * dpr) + 0.25 * dpr;
      const len = 60 * a.u;
      const gap = 6 * a.u;
      ctx.fillStyle = COL_LINE;
      ctx.fillRect(x - dpr, a.cy - gap / 2 - len, 2 * dpr, len);
      ctx.fillRect(x - dpr + this.side * off * dpr, a.cy + gap / 2, 2 * dpr, len);
    } else {
      ctx.fillStyle = COL_DIM;
      ctx.fillRect(a.cx - 5 * dpr, a.cy - dpr / 2, 10 * dpr, dpr);
    }
    ctx.fillStyle = COL_MID;
    v.text(this.state === 3 && this.last ? this.last : 'is the lower line to the left or the right of the upper one?', a.cx, a.cy + 110 * a.u, v.fontTiny, 'center');
    footer(v, touch, this.held);
    return false;
  }

  result(): MiniResult {
    const thr = this.levels.length >= 8 ? median(this.levels.slice(-12)) : NaN;
    return {
      score: Number.isFinite(thr) ? Math.round(Math.max(0, 7 - thr) * 150) : 0,
      primary: { label: 'smallest offset seen', value: thr, unit: 'px', lower: true, decimals: 2 },
      lines: [
        { label: 'right', value: `${this.right} of ${this.i}` },
        { label: 'smallest reached', value: this.levels.length ? `${Math.min(...this.levels)} px` : '–' },
        { label: 'note', value: 'a sharper screen and sitting further back both help; compare like with like' },
      ],
      saved: this.i >= 10,
    };
  }
}

export const BATCH33: MiniDef[] = [
  { id: 'round', name: 'Round', skill: 'aim', blurb: 'Draw a circle in one stroke. How round is it?', how: 'Hold the mouse button (or a finger) and draw a circle in one stroke, then let go. It is scored on how closely it matches a perfect circle, which is then drawn under yours. Go all the way round and draw it a good size. Five circles; your roundest counts.', input: 'pointer', make: () => new Round() },
  { id: 'wire', name: 'Wire', skill: 'aim', blurb: 'Steer a ring along a bent wire without touching it.', how: 'Click the ring at the left end to pick it up, then move it along the wire to the right end, keeping the wire inside the ring. Touch it and it buzzes: two seconds are added and the ring freezes for half a second. Three wires, each more bent with a smaller ring. Scored on total time with penalties.', input: 'pointer', make: () => new Wire() },
  { id: 'bounce', name: 'Bounce', skill: 'timing', blurb: 'A ball bounces lower and quicker. Press on the bounces once it goes dark.', how: 'A ball drops and bounces, each bounce lower and quicker. You see and hear the first few; then it goes dark and silent. Press on each of the next three bounces, from your sense of how it was slowing. Get them right and you see fewer bounces first.', input: 'both', make: () => new Bounce() },
  { id: 'lead', name: 'Lead', skill: 'aim', blurb: 'Discs fly in arcs. Your shot takes a moment to land: aim ahead.', how: 'Clay discs fly across in arcs. Click to fire: the shot lands where you clicked, but only after a short delay, so click where the disc will be. The delay grows and the discs speed up; later two fly at once. Thirty discs.', input: 'pointer', make: () => new Lead() },
  { id: 'swap', name: 'Swap', skill: 'reaction', blurb: 'Press the side the arrow points. Sometimes it flips: change your press.', how: 'An arrow points left or right: press that side. Now and then it flips the other way a moment after it appears: abort and press the new side instead. The flip comes later as you manage it, until you catch it about half the time. Scored on your change time: your usual press less the latest flip you can still follow.', input: 'keys', minKeys: 2, make: () => new Swap() },
  { id: 'louder', name: 'Louder', skill: 'ear', blurb: 'Two tones. Was the second louder or softer?', how: 'Two tones play. Press right if the second was louder, left if softer. The difference shrinks from 6 dB as you get them right. Later the two pitches differ too; higher notes tend to sound louder, so listen to loudness alone. Needs sound on; headphones help.', input: 'keys', minKeys: 2, make: () => new Louder() },
  { id: 'faint', name: 'Faint', skill: 'judgement', blurb: 'A faint striped patch flashes. Do the stripes lean left or right?', how: 'A patch of soft stripes flashes for a third of a second, leaning left or right. Press that side. Each right answer makes the next fainter, each wrong one stronger, until it settles at the faintest you can see. Contrast sensitivity, the kind of vision that sports vision training works on.', input: 'keys', minKeys: 2, make: () => new Faint() },
  { id: 'vernier', name: 'Vernier', skill: 'judgement', blurb: 'Two lines, one a hair to the side. Which side?', how: 'Two short vertical lines flash, one above the other. The lower one is shifted a little left or right: press that side. The shift shrinks until it is below a pixel; eyes can see offsets far finer than they can read letters. Sit as you normally do and compare like with like.', input: 'keys', minKeys: 2, make: () => new Vernier() },
];

